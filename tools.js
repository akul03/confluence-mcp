import { z } from 'zod';
import {
  fetchPageContent,
  fetchChildren,
  searchContent,
  fetchChildPageContent,
} from './confluence.js';
import { stripHtml, extractTasks, extractSections } from './utils.js';

/**
 * Register all MCP tools on the server instance.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 */
export function registerTools(server) {
  // ─── 1. get_page_content ──────────────────────────────────────────────────
  server.tool(
    'get_page_content',
    'Get the full content of the Confluence database page',
    {},
    async () => {
      try {
        const { title, body } = await fetchPageContent();
        const text = stripHtml(body);
        return {
          content: [
            {
              type: 'text',
              text: `# ${title}\n\n${text}`,
            },
          ],
        };
      } catch (err) {
        console.error('[tool:get_page_content]', err.message);
        return errorResult(err.message);
      }
    }
  );

  // ─── 2. get_database_rows ─────────────────────────────────────────────────
  server.tool(
    'get_database_rows',
    'Get all rows/entries from the Confluence database',
    {},
    async () => {
      try {
        const children = await fetchChildren();
        if (children.length === 0) {
          return textResult('No child pages / database rows found.');
        }

        // Fetch content of each child (limit to first 20 to avoid overload)
        const rows = await Promise.all(
          children.slice(0, 20).map(async child => {
            try {
              const { body } = await fetchChildPageContent(child.id);
              const text = stripHtml(body);
              return `## ${child.title}\n${text}\nURL: ${child.url}`;
            } catch {
              return `## ${child.title}\n(Could not load content)\nURL: ${child.url}`;
            }
          })
        );

        return textResult(rows.join('\n\n---\n\n'));
      } catch (err) {
        console.error('[tool:get_database_rows]', err.message);
        return errorResult(err.message);
      }
    }
  );

  // ─── 3. search_content ────────────────────────────────────────────────────
  server.tool(
    'search_content',
    'Search for specific content within the Confluence space',
    { query: z.string().describe('Search query text') },
    async ({ query }) => {
      try {
        const results = await searchContent(query);
        if (results.length === 0) {
          return textResult(`No results found for: "${query}"`);
        }

        const lines = results.map(
          (r, i) =>
            `${i + 1}. **${r.title}**\n   ${r.excerpt ? r.excerpt.replace(/\n/g, ' ') : '(no excerpt)'}\n   URL: ${r.url}`
        );
        return textResult(`Search results for "${query}":\n\n${lines.join('\n\n')}`);
      } catch (err) {
        console.error('[tool:search_content]', err.message);
        return errorResult(err.message);
      }
    }
  );

  // ─── 4. get_tasks ─────────────────────────────────────────────────────────
  server.tool(
    'get_tasks',
    'Get all tasks and their completion status from the page',
    {},
    async () => {
      try {
        const { body } = await fetchPageContent();
        const tasks = extractTasks(body);
        if (tasks.length === 0) {
          return textResult('No tasks found on this page.');
        }

        const lines = tasks.map(
          t => `[${t.status === 'complete' ? 'x' : ' '}] (ID: ${t.id}) ${t.body}`
        );
        return textResult(`Tasks (${tasks.length} total):\n\n${lines.join('\n')}`);
      } catch (err) {
        console.error('[tool:get_tasks]', err.message);
        return errorResult(err.message);
      }
    }
  );

  // ─── 5. get_incomplete_tasks ──────────────────────────────────────────────
  server.tool(
    'get_incomplete_tasks',
    'Get only the incomplete/pending tasks',
    {},
    async () => {
      try {
        const { body } = await fetchPageContent();
        const tasks = extractTasks(body).filter(t => t.status !== 'complete');
        if (tasks.length === 0) {
          return textResult('No incomplete tasks found. All tasks are done!');
        }

        const lines = tasks.map(t => `[ ] (ID: ${t.id}) ${t.body}`);
        return textResult(`Incomplete tasks (${tasks.length}):\n\n${lines.join('\n')}`);
      } catch (err) {
        console.error('[tool:get_incomplete_tasks]', err.message);
        return errorResult(err.message);
      }
    }
  );

  // ─── 6. get_completed_tasks ───────────────────────────────────────────────
  server.tool(
    'get_completed_tasks',
    'Get only the completed/ticked tasks',
    {},
    async () => {
      try {
        const { body } = await fetchPageContent();
        const tasks = extractTasks(body).filter(t => t.status === 'complete');
        if (tasks.length === 0) {
          return textResult('No completed tasks found.');
        }

        const lines = tasks.map(t => `[x] (ID: ${t.id}) ${t.body}`);
        return textResult(`Completed tasks (${tasks.length}):\n\n${lines.join('\n')}`);
      } catch (err) {
        console.error('[tool:get_completed_tasks]', err.message);
        return errorResult(err.message);
      }
    }
  );

  // ─── 7. get_page_summary ──────────────────────────────────────────────────
  server.tool(
    'get_page_summary',
    'Get a structured summary of the page including sections and key info',
    {},
    async () => {
      try {
        const { title, body } = await fetchPageContent();
        const sections = extractSections(body);
        const tasks = extractTasks(body);
        const complete = tasks.filter(t => t.status === 'complete').length;
        const incomplete = tasks.filter(t => t.status !== 'complete').length;

        const sectionLines = sections.map(
          s =>
            `### ${s.heading}\n${s.content.slice(0, 300)}${s.content.length > 300 ? '...' : ''}`
        );

        const summary = [
          `# ${title}`,
          '',
          `**Task Stats:** ${tasks.length} total | ${complete} complete | ${incomplete} incomplete`,
          '',
          '## Sections',
          '',
          sectionLines.join('\n\n'),
        ].join('\n');

        return textResult(summary);
      } catch (err) {
        console.error('[tool:get_page_summary]', err.message);
        return errorResult(err.message);
      }
    }
  );

  // ─── 8. get_children_pages ────────────────────────────────────────────────
  server.tool(
    'get_children_pages',
    'Get all child pages or database entries',
    {},
    async () => {
      try {
        const children = await fetchChildren();
        if (children.length === 0) {
          return textResult('No child pages found.');
        }

        const lines = children.map((c, i) => `${i + 1}. **${c.title}** (ID: ${c.id})\n   URL: ${c.url}`);
        return textResult(`Child pages (${children.length}):\n\n${lines.join('\n\n')}`);
      } catch (err) {
        console.error('[tool:get_children_pages]', err.message);
        return errorResult(err.message);
      }
    }
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function textResult(text) {
  return { content: [{ type: 'text', text }] };
}

function errorResult(message) {
  const text = message.includes('Authentication')
    ? message
    : `Error: ${message}`;
  return { content: [{ type: 'text', text }], isError: true };
}
