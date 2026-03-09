# Confluence MCP Server

An MCP (Model Context Protocol) server that connects Claude to a Confluence database page, enabling natural language queries over your Confluence content.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure credentials

The `.env` file is pre-filled. The API token is already included. If you need to update it:

```
CONFLUENCE_API_TOKEN=your_token_here
```

### 3. Test locally

```bash
node index.js
```

You should see: `Confluence MCP server running on stdio`

## Add to Claude Desktop

Copy the contents of `claude_mcp_config.json` into your Claude Desktop config:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

If the file already has an `mcpServers` key, add the `confluence` entry to it.

Then restart Claude Desktop.

## Deploy to Railway

```bash
railway login
railway init
railway up
```

Set environment variables in the Railway dashboard (same as `.env`).

Once deployed, add the Railway URL to:
**Claude.ai → Settings → Integrations → Add custom integration**

Use the SSE endpoint: `https://your-app.railway.app/sse`

## Available Tools

| Tool | Description |
|------|-------------|
| `get_page_content` | Full text of the Confluence database page |
| `get_database_rows` | All child pages/rows with their content |
| `search_content` | Search across the LPD space by keyword |
| `get_tasks` | All tasks with completion status |
| `get_incomplete_tasks` | Only pending/incomplete tasks |
| `get_completed_tasks` | Only finished/checked tasks |
| `get_page_summary` | Structured summary with sections and task stats |
| `get_children_pages` | List of all child pages with URLs |

## Example Questions to Ask Claude

- "Show me all incomplete tasks"
- "What tasks were recently completed?"
- "Search for Hinduja project"
- "Give me a summary of the page"
- "How many tasks are pending?"
- "List all child pages in the database"
- "What sections does this page have?"
- "Find anything related to onboarding"

<!-- redeployed Tue Mar 10 00:19:54 IST 2026 -->
