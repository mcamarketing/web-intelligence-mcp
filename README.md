# Web Intelligence MCP Server

> **Real-time web intelligence for AI agents. Monetized on Apify.**

[![Apify Actor](https://img.shields.io/badge/Apify-Actor-blue)](https://apify.com)
[![MCP](https://img.shields.io/badge/MCP-Protocol-green)](https://modelcontextprotocol.io)

## What This Does

A production-ready MCP server that gives AI agents real-time web capabilities:

| Tool | What It Does | Price |
|------|--------------|-------|
| `search_web` | Live Google/Bing search results | $0.02/call |
| `scrape_page` | Clean markdown from any URL | $0.05/call |
| `find_leads` | Google Maps business data | $0.10/call |
| `get_company_info` | Tech stack, employees, contacts | $0.15/call |

**Why Agents Need This:**
- Claude/GPT have knowledge cutoffs
- Agents need current prices, news, company info
- Every serious agent workflow needs real-time data

## Quick Start

### For AI Agents (Claude, Cursor, etc.)

Add to your MCP config:

```json
{
  "mcpServers": {
    "web-intelligence": {
      "url": "https://your-username--web-intelligence-mcp.apify.actor/sse"
    }
  }
}
```

### For Developers (Publish Your Own)

```bash
# 1. Clone and setup
git clone <your-repo>
cd web-intelligence-mcp
npm install

# 2. Configure API keys
cp .env.example .env
# Edit .env with your keys

# 3. Test locally
npm run build
apify run

# 4. Deploy to Apify
apify login
apify push
```

## API Keys Required

| Service | Purpose | Get Key At |
|---------|---------|------------|
| SerpAPI | Web search | [serpapi.com](https://serpapi.com) |
| Jina AI | Web scraping | [jina.ai/reader](https://jina.ai/reader) |
| Google Places | Lead generation | [Google Cloud](https://cloud.google.com) |
| Clearbit | Company data | [clearbit.com](https://clearbit.com) |

**Free tiers available for all!**

## Tool Examples

### search_web
```json
{
  "query": "AI agent startups funding 2024",
  "num_results": 10
}
```

### scrape_page
```json
{
  "url": "https://example.com/article"
}
```

### find_leads
```json
{
  "keyword": "software companies",
  "location": "San Francisco, CA",
  "max_results": 20
}
```

### get_company_info
```json
{
  "domain": "stripe.com"
}
```

## Monetization

This Actor uses **Apify Pay-Per-Event**:

| Event | Price | When Charged |
|-------|-------|--------------|
| `search-web` | $0.02 | Every search_web call |
| `scrape-page` | $0.05 | Every scrape_page call |
| `find-leads` | $0.10 | Every find_leads call |
| `company-info` | $0.15 | Every get_company_info call |

**Your earnings:** 80% of revenue (Apify takes 20% commission)

## Deployment

### Option 1: Apify Console (Easiest)

1. Go to [Apify Console](https://console.apify.com)
2. Create new Actor from GitHub repo
3. Set environment variables
4. Enable "Standby mode" in settings
5. Set pricing in "Monetization" tab

### Option 2: CLI

```bash
# Install Apify CLI
npm install -g apify-cli

# Login
apify login

# Push to Apify
apify push

# Set secrets
apify secrets:set SERPAPI_KEY your_key_here
apify secrets:set JINA_AI_KEY your_key_here
# ... etc
```

## Standby Mode

Standby mode gives you a **persistent URL** that MCP clients can connect to:

```
https://your-username--web-intelligence-mcp.apify.actor/sse
```

This URL stays active even when the Actor isn't running. Apify automatically starts it when a request comes in.

## Configuration

### Environment Variables

Create `.env` file:

```bash
# Required
SERPAPI_KEY=your_serpapi_key
JINA_AI_KEY=your_jina_key
GOOGLE_PLACES_API_KEY=your_google_key
CLEARBIT_API_KEY=your_clearbit_key

# Optional
APIFY_LOG_LEVEL=INFO
```

### Pricing Configuration

Edit `.actor/pay_per_event.json` to adjust prices:

```json
[
  {
    "search-web": {
      "eventTitle": "Web Search",
      "eventDescription": "Live Google/Bing search results",
      "eventPriceUsd": 0.02
    }
  }
]
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Apify Platform                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │         Web Intelligence MCP Server              │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐ │   │
│  │  │ Search  │ │ Scrape  │ │  Leads  │ │Company │ │   │
│  │  │  $0.02  │ │  $0.05  │ │  $0.10  │ │ $0.15  │ │   │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └───┬────┘ │   │
│  │       └─────────────┴───────────┴────────┘      │   │
│  │                      │                          │   │
│  │              Actor.charge()                     │   │
│  │                      │                          │   │
│  │              MCP Server (SSE)                   │   │
│  └──────────────────────┼──────────────────────────┘   │
│                         │                               │
│              https://...apify.actor/sse                 │
└─────────────────────────────────────────────────────────┘
```

## Local Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run with stdio (for testing)
MCP_TRANSPORT=stdio npm start

# Run with SSE (for local HTTP)
npm start
# Server runs on http://localhost:3000/sse
```

## Testing

Test with the MCP inspector:

```bash
npx @modelcontextprotocol/inspector node dist/main.js
```

## Why This Wins

1. **Supply**: Near-zero MCP servers on Apify right now
2. **Demand**: Every AI framework adopting MCP (Claude, GPT, Cursor)
3. **Agentic Payments**: Apify handles billing, agents pay autonomously
4. **Moat**: First quality servers get whitelisted in agent configs
5. **Recurring**: Agents run 24/7, every query = billable event

## Revenue Potential

| Daily Calls | Monthly Revenue | Your Cut (80%) |
|-------------|-----------------|----------------|
| 100         | $500            | $400           |
| 1,000       | $5,000          | $4,000         |
| 10,000      | $50,000         | $40,000        |

**Costs:** API keys have free tiers, then ~$0.01-0.05 per call

## Support

- [Apify Docs](https://docs.apify.com)
- [MCP Docs](https://modelcontextprotocol.io)
- [Discord](https://discord.gg/apify)

## License

MIT - Build your own, publish, profit.

---

**The USB-C moment for AI agents. Deploy today.**
