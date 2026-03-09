import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';

const server = new McpServer({
  name: 'confluence-mcp',
  version: '1.0.0',
  description: 'Query Confluence database pages and tasks',
});

registerTools(server);

const PORT = process.env.PORT;

if (PORT) {
  // Railway / hosted mode — SSE transport
  const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');
  const { default: http } = await import('http');

  const transports = {};

  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  const httpServer = http.createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200, CORS_HEADERS);
      res.end();
      return;
    }

    // Add CORS headers to all responses
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else if (req.method === 'GET' && req.url === '/sse') {
      const transport = new SSEServerTransport('/messages', res);
      transports[transport.sessionId] = transport;
      res.on('close', () => {
        delete transports[transport.sessionId];
      });
      await server.connect(transport);
    } else if (req.method === 'POST' && req.url.startsWith('/messages')) {
      const sessionId = new URL(req.url, `http://localhost`).searchParams.get('sessionId');
      const transport = transports[sessionId];
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.writeHead(404).end('Session not found');
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });

  httpServer.listen(parseInt(PORT, 10), () => {
    console.error(`Confluence MCP server running on port ${PORT} (SSE mode)`);
  });
} else {
  // Local / Claude Desktop mode — stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Confluence MCP server running on stdio');
}
