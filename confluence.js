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

/**
 * Fetch page content. Tries API v2 first, falls back to v1.
 * Returns { title, body } where body is storage-format HTML.
 */
export async function fetchPageContent(pageId = PAGE_ID) {
  // Try v2 first
  try {
    const url = `${BASE_URL}/wiki/api/v2/pages/${pageId}?body-format=storage`;
    const resp = await axios.get(url, { headers: headers() });
    const data = resp.data;
    return {
      title: data.title || '',
      body: data.body?.storage?.value || '',
      version: data.version?.number,
      spaceKey: data.spaceId,
    };
  } catch (err) {
    if (err.response?.status === 404 || err.response?.status === 403) {
      console.error(`[confluence] v2 failed (${err.response.status}), trying v1...`);
    } else if (err.response?.status === 401) {
      throw new Error('Authentication failed. Check CONFLUENCE_API_TOKEN in .env');
    } else {
      console.error(`[confluence] v2 error: ${err.message}, trying v1...`);
    }
  }

  // Fallback to v1
  const url = `${BASE_URL}/wiki/rest/api/content/${pageId}?expand=body.storage,version,space`;
  const resp = await axios.get(url, { headers: headers() });
  const data = resp.data;
  return {
    title: data.title || '',
    body: data.body?.storage?.value || '',
    version: data.version?.number,
    spaceKey: data.space?.key,
  };
}

/**
 * Fetch children of a page. Tries v2 then v1.
 * Returns array of { id, title, url }.
 */
export async function fetchChildren(pageId = PAGE_ID) {
  // Try v2
  try {
    const url = `${BASE_URL}/wiki/api/v2/pages/${pageId}/children?limit=50`;
    const resp = await axios.get(url, { headers: headers() });
    const results = resp.data.results || [];
    return results.map(p => ({
      id: p.id,
      title: p.title,
      url: `${BASE_URL}/wiki${p._links?.webui || `/spaces/${SPACE_KEY}/pages/${p.id}`}`,
    }));
  } catch (err) {
    if (err.response?.status === 401) {
      throw new Error('Authentication failed. Check CONFLUENCE_API_TOKEN in .env');
    }
    console.error(`[confluence] v2 children failed: ${err.message}, trying v1...`);
  }

  // Fallback v1
  const url = `${BASE_URL}/wiki/rest/api/content/${pageId}/child/page?limit=50`;
  const resp = await axios.get(url, { headers: headers() });
  const results = resp.data.results || [];
  return results.map(p => ({
    id: p.id,
    title: p.title,
    url: `${BASE_URL}/wiki${p._links?.webui || `/spaces/${SPACE_KEY}/pages/${p.id}`}`,
  }));
}

/**
 * Search via CQL within the space.
 * Returns array of { id, title, excerpt, url }.
 */
export async function searchContent(query) {
  const cql = `space=${SPACE_KEY} AND text~"${query.replace(/"/g, '\\"')}"`;
  const url = `${BASE_URL}/wiki/rest/api/content/search`;
  const resp = await axios.get(url, {
    headers: headers(),
    params: {
      cql,
      limit: 10,
      expand: 'excerpt',
    },
  });

  const results = resp.data.results || [];
  return results.map(r => ({
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
