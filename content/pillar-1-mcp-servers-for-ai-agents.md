# MCP Servers for AI Agents: The Complete Guide

MCP (Model Context Protocol) servers extend what AI agents can do. While Claude has built-in web search, MCP servers add specialized capabilities: verified email discovery, B2B lead generation, local business data, persistent memory, and structured company intelligence.

This guide covers what MCP is, how to connect MCP servers to Claude Desktop, Claude Code, and Cursor, and how to choose the right MCP server for your use case.

---

## Table of Contents

- [What is MCP?](#what-is-mcp)
- [What MCP Servers Add to Claude](#what-mcp-servers-add-to-claude)
- [How to Connect an MCP Server](#how-to-connect-an-mcp-server)
- [Types of MCP Servers](#types-of-mcp-servers)
- [Building vs Using MCP Servers](#building-vs-using-mcp-servers)
- [Security and Authentication](#security-and-authentication)
- [Production MCP Servers](#production-mcp-servers)
- [FAQ](#faq)

---

## What is MCP?

MCP (Model Context Protocol) is an open protocol that lets AI models call external tools. Anthropic created MCP to extend AI capabilities beyond what's built into the model.

With MCP, you connect a server that exposes tools. The AI sees the tool list, decides when to use each tool, and receives structured responses it can act on.

**Key difference from built-in tools:** Claude's built-in web search returns general information. MCP servers return structured, actionable data — verified emails, lead lists ready for CRM import, company data as JSON.

For a deeper comparison, see [MCP vs Function Calling: What's the Difference?](/guides/mcp-vs-function-calling).

---

## What MCP Servers Add to Claude

Claude has built-in capabilities for general research. MCP servers add specialized capabilities:

| Capability | Claude Built-in | With MCP (Forage) |
|------------|----------------|-------------------|
| Web search | Yes | Yes |
| Read web pages | Yes | Yes |
| **Verified email addresses** | No | Yes — with confidence scores |
| **B2B lead lists** | No | Yes — 100 leads with emails |
| **Local business data** | No | Yes — phone, rating, hours |
| **Persistent memory** | No | Yes — knowledge graph |
| **Structured JSON output** | Sometimes | Always |

**The key difference:** Claude's built-in tools return information. MCP tools return actionable data ready for your workflow.

For specific examples, see [What Claude Can't Do: Lead Gen, Verified Emails, and Persistent Memory](/guides/what-claude-cant-do).

---

## How to Connect an MCP Server

MCP servers connect through configuration files. Here's how to set up the most popular clients:

### Claude Desktop

Add to your `claude_desktop_config.json`:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "forage": {
      "command": "npx",
      "args": [
        "-y",
        "@anthropic/mcp-proxy",
        "https://ernesta-labs--forage.apify.actor/mcp/sse"
      ],
      "env": {
        "APIFY_API_TOKEN": "YOUR_APIFY_API_TOKEN"
      }
    }
  }
}
```

Replace `YOUR_APIFY_API_TOKEN` with your token from [Apify Console → Settings → Integrations](https://console.apify.com/account/integrations).

Restart Claude Desktop. Forage tools appear in the tool picker.

For detailed setup, see [How to Set Up MCP in Claude Desktop](/guides/mcp-claude-desktop-setup).

### Claude Code (CLI)

Add to your Claude Code settings (`.claude/settings.json` or global config):

```json
{
  "mcpServers": {
    "forage": {
      "command": "npx",
      "args": [
        "-y",
        "@anthropic/mcp-proxy",
        "https://ernesta-labs--forage.apify.actor/mcp/sse"
      ],
      "env": {
        "APIFY_API_TOKEN": "YOUR_APIFY_API_TOKEN"
      }
    }
  }
}
```

For detailed setup, see [How to Connect MCP Servers in Claude Code](/guides/mcp-claude-code-setup).

### Cursor

Add to Cursor's MCP configuration in Settings → Features → MCP:

```json
{
  "mcpServers": {
    "forage": {
      "command": "npx",
      "args": [
        "-y",
        "@anthropic/mcp-proxy",
        "https://ernesta-labs--forage.apify.actor/mcp/sse"
      ],
      "env": {
        "APIFY_API_TOKEN": "YOUR_APIFY_API_TOKEN"
      }
    }
  }
}
```

For detailed setup, see [How to Add MCP Servers to Cursor](/guides/mcp-cursor-setup).

---

## Types of MCP Servers

MCP servers fall into categories based on what they provide:

### Business Intelligence

Company data, email discovery, contact information.

- Website analysis and summaries
- Verified email addresses with confidence scores
- Decision-maker identification
- Tech stack detection
- Funding and growth signals

**Forage tools:** `get_company_info`, `find_emails`, `skill_company_dossier`, `skill_tech_stack`, `skill_funding_intel`

### Lead Generation

Find and qualify sales prospects.

- B2B lead lists with verified emails
- Local business data from directories
- Decision-maker contacts by company
- Filtered by title, industry, location, company size

**Forage tools:** `find_leads`, `find_local_leads`, `skill_outbound_list`, `skill_decision_maker_finder`

### Web Scraping

Extract content from web pages.

- Clean text extraction from any URL
- Competitor pricing and feature analysis
- Review mining and sentiment
- Ad intelligence

**Forage tools:** `scrape_page`, `skill_competitor_intel`, `skill_social_proof`, `skill_competitor_ads`

### Memory / Knowledge Graphs

Remember information across sessions.

- Entity storage (companies, people, relationships)
- Query accumulated intelligence
- Find connections between entities
- Build institutional knowledge over time

**Forage tools:** `query_knowledge`, `enrich_entity`, `find_connections`, `get_graph_stats`

For detailed comparisons, see [Best MCP Servers for Claude (2025)](/guides/best-mcp-servers-claude).

---

## Building vs Using MCP Servers

### When to Build Your Own

Build a custom MCP server when:
- You need to expose proprietary internal APIs
- Your use case is highly specialized
- You want full control over implementation
- Data privacy requirements prohibit third-party servers

For a tutorial, see [How to Build an MCP Server from Scratch](/guides/build-mcp-server).

### When to Use a Hosted Server

Use a hosted MCP server like Forage when:
- You need production-ready reliability
- You want pay-per-use pricing (no subscriptions)
- You need multiple capabilities in one connection
- You don't want to manage infrastructure

**Forage consolidates multiple capabilities** — email discovery, lead generation, web scraping, company intelligence, and persistent memory — into a single MCP connection. Pay per tool call; infrastructure is handled for you.

For comparison, see [Remote vs Local MCP Servers](/guides/remote-vs-local-mcp).

---

## Security and Authentication

MCP servers handle business data. Security matters.

### Authentication Methods

| Method | When to Use |
|--------|-------------|
| **Bearer Token** | Standard for remote MCP servers like Forage |
| API Key Header | Custom implementations |
| OAuth | Enterprise integrations |

Forage uses Bearer token authentication via your Apify API token. Tokens are scoped to your account and can be rotated anytime.

### Security Best Practices

1. **Never commit tokens to git.** Use environment variables.
2. **Set cost limits** in your Apify account to prevent runaway charges.
3. **Audit tool calls** in Apify Console logs.
4. **Rotate tokens** periodically.

For detailed guidance, see [MCP Server Security Best Practices](/guides/mcp-security).

---

## Production MCP Servers

### Forage

Forage is a production MCP server providing business intelligence, lead generation, and persistent memory for AI agents.

**25 tools including:**

| Tool | What it does | Cost |
|------|-------------|------|
| `search_web` | Real-time web search | $0.03 |
| `scrape_page` | Extract clean text from any URL | $0.07 |
| `get_company_info` | Website + email intelligence | $0.08 |
| `find_emails` | Verified email addresses | $0.10 |
| `find_local_leads` | Local business data | $0.15 |
| `find_leads` | B2B leads with verified emails | $0.25/100 |
| `query_knowledge` | Query accumulated intelligence | $0.02 |

**12 Skills (multi-step workflows):**

| Skill | What it delivers | Cost |
|-------|-----------------|------|
| `skill_company_dossier` | Full company profile with contacts | $0.50 |
| `skill_prospect_company` | Decision makers with verified emails | $0.75 |
| `skill_outbound_list` | 100 targeted leads, export-ready | $3.50 |
| `skill_competitor_intel` | Pricing, features, reviews | $0.80 |
| `skill_market_map` | All players in a market | $1.20 |

**Knowledge Graph:** Every tool call feeds a private knowledge graph. Your agent accumulates intelligence about companies, people, and relationships over time.

For setup, see [Forage MCP Server: Complete Setup Guide](/guides/forage-setup).

For full tool reference, see [Forage Tools Reference](/guides/forage-tools).

---

## FAQ

### What is the difference between MCP and RAG?

RAG (Retrieval-Augmented Generation) retrieves from a static document store. MCP retrieves from live external tools and databases. RAG is for your documents; MCP is for external data.

### Can I use multiple MCP servers at once?

Yes. Add multiple entries to your `mcpServers` config. Claude sees tools from all connected servers and chooses the right tool for each task.

### Do MCP servers work with GPT-4 or other models?

MCP is model-agnostic, but client support varies. Claude Desktop and Claude Code have native MCP support. For other models, you'd need a custom integration layer.

### How much does Forage cost?

Pay per tool call. No subscription. Web search is $0.03, email discovery is $0.10, full outbound lists are $3.50 for 100 leads. See [Forage Pricing](/guides/forage-pricing).

### Is my data private?

Forage data is scoped to your Apify account. Knowledge graph data is private to you. No data is shared across accounts.

---

## Next Steps

1. **[Set up Forage in Claude Desktop](/guides/forage-setup)** — 5-minute setup
2. **[Explore Forage tools](/guides/forage-tools)** — Full reference with examples
3. **[Build your first lead gen workflow](/guides/ai-lead-generation)** — AI prospecting guide

---

*Last updated: March 2025*
