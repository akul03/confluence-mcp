import axios from 'axios';
import 'dotenv/config';

const EMAIL = process.env.CONFLUENCE_EMAIL;
const API_TOKEN = process.env.CONFLUENCE_API_TOKEN;
const BASE_URL = process.env.CONFLUENCE_BASE_URL;
const PAGE_ID = process.env.CONFLUENCE_PAGE_ID;
const SPACE_KEY = 'LPD';

function getAuthHeader() {
  const credentials = Buffer.from(`${EMAIL}:${API_TOKEN}`).toString('base64');
  return `Basic ${credentials}`;
}

const headers = () => ({
  Authorization: getAuthHeader(),
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

async function tryGet(url, params = {}) {
  try {
    const resp = await axios.get(url, { headers: headers(), params });
    return { ok: true, data: resp.data, status: resp.status };
  } catch (err) {
    return {
      ok: false,
      status: err.response?.status,
      error: err.response?.data || err.message,
    };
  }
}

/**
 * Fetch page content. Tries all 5 approaches and returns the first with actual content.
 * Returns { title, body, source } where body is storage-format HTML.
 */
export async function fetchPageContent(pageId = PAGE_ID) {
  // Approach 1a — v2 with storage body-format
  const a1 = await tryGet(`${BASE_URL}/wiki/api/v2/pages/${pageId}`, { 'body-format': 'storage' });
  if (a1.ok && a1.data.body?.storage?.value) {
    return {
      title: a1.data.title || '',
      body: a1.data.body.storage.value,
      version: a1.data.version?.number,
      spaceKey: a1.data.spaceId,
      source: 'v2/storage',
    };
  }

  // Approach 1b — v1 with multiple body expands
  const a1b = await tryGet(`${BASE_URL}/wiki/rest/api/content/${pageId}`, {
    expand: 'body.storage,body.atlas_doc_format,body.view,body.export_view,version,space',
  });
  if (a1b.ok) {
    const d = a1b.data;
    const body =
      d.body?.storage?.value ||
      d.body?.view?.value ||
      d.body?.export_view?.value ||
      d.body?.atlas_doc_format?.value ||
      '';
    if (body) {
      return {
        title: d.title || '',
        body,
        version: d.version?.number,
        spaceKey: d.space?.key,
        source: 'v1/storage',
      };
    }
    // Return even if body is empty (page exists but may be a DB page)
    if (d.title) {
      return {
        title: d.title,
        body: '',
        version: d.version?.number,
        spaceKey: d.space?.key,
        source: 'v1/no-body',
      };
    }
  }

  if (a1b.status === 401 || a1.status === 401) {
    throw new Error('Authentication failed. Check CONFLUENCE_API_TOKEN in .env');
  }

  throw new Error(`Could not fetch page ${pageId}. v2: ${a1.status}, v1: ${a1b.status}`);
}

/**
 * Fetch children via all applicable approaches.
 * Returns array of { id, title, url }.
 */
export async function fetchChildren(pageId = PAGE_ID) {
  // Approach 5 — v2 children endpoint
  const a5 = await tryGet(`${BASE_URL}/wiki/api/v2/pages/${pageId}/children`, { limit: 50 });
  if (a5.ok && (a5.data.results || []).length > 0) {
    return a5.data.results.map(p => ({
      id: p.id,
      title: p.title,
      url: `${BASE_URL}/wiki${p._links?.webui || `/spaces/${SPACE_KEY}/pages/${p.id}`}`,
      source: 'v2/children',
    }));
  }

  // Approach 2 — v2 pages with parent-id
  const a2 = await tryGet(`${BASE_URL}/wiki/api/v2/pages`, { 'parent-id': pageId, limit: 50 });
  if (a2.ok && (a2.data.results || []).length > 0) {
    return a2.data.results.map(p => ({
      id: p.id,
      title: p.title,
      url: `${BASE_URL}/wiki${p._links?.webui || `/spaces/${SPACE_KEY}/pages/${p.id}`}`,
      source: 'v2/parent-id',
    }));
  }

  // Approach 3 — CQL parent
  const a3 = await tryGet(`${BASE_URL}/wiki/rest/api/content/search`, {
    cql: `parent=${pageId}`,
    expand: 'body.storage',
    limit: 50,
  });
  if (a3.ok && (a3.data.results || []).length > 0) {
    return a3.data.results.map(p => ({
      id: p.id,
      title: p.title,
      url: `${BASE_URL}/wiki${p._links?.webui || `/spaces/${SPACE_KEY}/pages/${p.id}`}`,
      source: 'cql/parent',
    }));
  }

  // Approach 4 — CQL space + ancestor
  const a4 = await tryGet(`${BASE_URL}/wiki/rest/api/content/search`, {
    cql: `space=${SPACE_KEY} AND ancestor=${pageId}`,
    expand: 'body.storage,metadata.properties',
    limit: 50,
  });
  if (a4.ok && (a4.data.results || []).length > 0) {
    return a4.data.results.map(p => ({
      id: p.id,
      title: p.title,
      url: `${BASE_URL}/wiki${p._links?.webui || `/spaces/${SPACE_KEY}/pages/${p.id}`}`,
      source: 'cql/ancestor',
    }));
  }

  // Fallback — v1 child/page
  const fb = await tryGet(`${BASE_URL}/wiki/rest/api/content/${pageId}/child/page`, { limit: 50 });
  if (fb.ok) {
    return (fb.data.results || []).map(p => ({
      id: p.id,
      title: p.title,
      url: `${BASE_URL}/wiki${p._links?.webui || `/spaces/${SPACE_KEY}/pages/${p.id}`}`,
      source: 'v1/child-page',
    }));
  }

  return [];
}

/**
 * Search via CQL within the space.
 * Returns array of { id, title, excerpt, url }.
 */
export async function searchContent(query) {
  const cql = `space=${SPACE_KEY} AND text~"${query.replace(/"/g, '\\"')}"`;
  const result = await tryGet(`${BASE_URL}/wiki/rest/api/content/search`, {
    cql,
    limit: 10,
    expand: 'excerpt',
  });

  if (!result.ok) {
    throw new Error(`Search failed: ${result.status} - ${JSON.stringify(result.error)}`);
  }

  return (result.data.results || []).map(r => ({
    id: r.id,
    title: r.title,
    excerpt: r.excerpt || '',
    url: `${BASE_URL}/wiki${r._links?.webui || `/spaces/${SPACE_KEY}/pages/${r.id}`}`,
  }));
}

/**
 * Fetch a child page's content (title + body).
 */
export async function fetchChildPageContent(pageId) {
  return fetchPageContent(pageId);
}

/**
 * Debug: try all 5 approaches against a page and return raw results.
 */
export async function debugPage(pageId = PAGE_ID) {
  const [a1, a1b, a2, a3, a4, a5] = await Promise.all([
    tryGet(`${BASE_URL}/wiki/api/v2/pages/${pageId}`, { 'body-format': 'storage' }),
    tryGet(`${BASE_URL}/wiki/rest/api/content/${pageId}`, {
      expand: 'body.storage,body.atlas_doc_format,body.view,body.export_view,version,space',
    }),
    tryGet(`${BASE_URL}/wiki/api/v2/pages`, { 'parent-id': pageId, limit: 50 }),
    tryGet(`${BASE_URL}/wiki/rest/api/content/search`, {
      cql: `parent=${pageId}`,
      expand: 'body.storage',
      limit: 50,
    }),
    tryGet(`${BASE_URL}/wiki/rest/api/content/search`, {
      cql: `space=${SPACE_KEY} AND ancestor=${pageId}`,
      expand: 'body.storage,metadata.properties',
      limit: 50,
    }),
    tryGet(`${BASE_URL}/wiki/api/v2/pages/${pageId}/children`, { limit: 50 }),
  ]);

  return {
    pageId,
    approach1_v2_storage: summarise(a1, d => d.body?.storage?.value),
    approach1b_v1_multi_expand: summarise(a1b, d => d.body?.storage?.value || d.body?.view?.value),
    approach2_v2_parent_id: summarise(a2, d => d.results?.length),
    approach3_cql_parent: summarise(a3, d => d.results?.length),
    approach4_cql_ancestor: summarise(a4, d => d.results?.length),
    approach5_v2_children: summarise(a5, d => d.results?.length),
  };
}

function summarise(result, dataExtractor) {
  if (!result.ok) {
    return { status: result.status, hasData: false, error: result.error };
  }
  const extracted = dataExtractor(result.data);
  const hasData = extracted !== undefined && extracted !== null && extracted !== '' && extracted !== 0;
  return {
    status: result.status,
    hasData,
    dataPreview: typeof extracted === 'string'
      ? extracted.slice(0, 200)
      : extracted,
    rawKeys: Object.keys(result.data || {}),
  };
}
