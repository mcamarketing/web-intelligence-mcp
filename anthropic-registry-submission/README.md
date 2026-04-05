# Forage MCP Server

Turn any company into an interactive org chart with verified executive contacts. Forage maps decision-maker relationships and delivers emails, phones, and LinkedIn profiles directly in Claude.

## Overview

Forage is a Model Context Protocol (MCP) server that gives AI agents real-time web intelligence and a self-accumulating knowledge graph. One connection provides 24 tools and 12 multi-step skills: web search, company data, verified B2B emails, local leads, and a graph that remembers everything your agent has ever discovered.

## Tools

### Web Intelligence
- `search_web` — Multi-source web search (Brave, Bing, DuckDuckGo) with deduplication
- `scrape_page` — Extract clean markdown from any URL with JavaScript rendering
- `get_company_info` — Full company profile from domain

### Email & Lead Discovery
- `find_emails` — Verified B2B emails with 4-step verification pipeline
- `find_leads` — B2B leads by title, industry, and location
- `find_local_leads` — Local businesses by niche and location

### Knowledge Graph
- `query_knowledge` — Search entities in the persistent graph
- `enrich_entity` — Full profile with all relationships
- `find_connections` — Path discovery between entities
- `add_claim` / `get_claims` — Provenance tracking
- `add_signal` / `get_signals` — Time-series data tracking

### Skills (Multi-Step Workflows)
- `skill_company_dossier` — Full company profile + 10 contacts
- `skill_prospect_company` — 15 decision makers with emails
- `skill_outbound_list` — 100 verified leads for CRM import
- `skill_local_market_map` — Local business intelligence
- `skill_competitor_intel` — Competitor analysis
- `skill_funding_intel` — Funding rounds and investors
- `skill_tech_stack` — Technology detection
- `skill_job_signals` — Hiring trend analysis

## Installation

### Claude Desktop

Add to `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "forage": {
      "command": "npx",
      "args": [
        "-y", "@anthropic/mcp-proxy",
        "https://mcamarketing--forage.apify.actor/mcp/sse"
      ],
      "env": {
        "APIFY_API_TOKEN": "YOUR_APIFY_TOKEN"
      }
    }
  }
}
```

### Cursor / Windsurf

Add to MCP settings:

```json
{
  "mcpServers": {
    "forage": {
      "command": "npx",
      "args": [
        "-y", "@anthropic/mcp-proxy",
        "https://mcamarketing--forage.apify.actor/mcp/sse"
      ],
      "env": {
        "APIFY_API_TOKEN": "YOUR_APIFY_TOKEN"
      }
    }
  }
}
```

### Custom SSE Connection

Connect to `https://mcamarketing--forage.apify.actor/mcp/sse` with your Apify token in the Authorization header.

## Configuration

Get your free Apify API token:
1. Go to [Apify Console → Settings → Integrations](https://console.apify.com/account/integrations)
2. Copy your Personal API Token
3. Add to environment variables as `APIFY_API_TOKEN`

## Usage Examples

### Find Decision Makers

```
Find the VP of Sales at Stripe with verified contact information
```

### Research a Company

```
Create a complete dossier on Notion including leadership, funding, and competitors
```

### Build Lead Lists

```
Find 50 marketing directors at SaaS companies in San Francisco
```

### Local Business Intelligence

```
Map all dental practices in London with contact details and ratings
```

## Pricing

Pay per tool call with no subscription:

| Tool | Cost |
|------|------|
| `search_web` | $0.03 |
| `scrape_page` | $0.07 |
| `get_company_info` | $0.08 |
| `find_emails` | $0.10 |
| `find_leads` | $0.25/100 leads |
| `skill_company_dossier` | $0.50 |
| `skill_prospect_company` | $0.75 |

New Apify accounts receive $5 platform credit to try Forage risk-free.

## Links

- **GitHub:** https://github.com/ErnestaLabs/web-intelligence-mcp
- **Apify Actor:** https://apify.com/mcamarketing/forage
- **Smithery:** https://smithery.ai/servers/Ernesta_Labs/forage_mcp
- **Author:** Riccardo Minniti / Ernesta Labs (riccardo@ernestalabs.com)

## License

MIT
