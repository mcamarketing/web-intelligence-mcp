# Forage MCP Server: Complete Setup Guide

Connect Forage to Claude Desktop, Claude Code, or Cursor in under 5 minutes. Forage gives your AI agent real-time web search, page scraping, lead generation, and persistent memory—all through a single MCP connection.

## TL;DR

- Get your Apify API token from [console.apify.com](https://console.apify.com/account/integrations)
- Add the Forage config to your MCP client's settings file
- Restart your client—Forage tools appear automatically
- Pay per tool call, no subscription required

---

## Prerequisites

**You need:**
1. An Apify account (free tier available)
2. Your Apify API token
3. Node.js installed (for the `npx` command)

**Get your API token:**
1. Go to [Apify Console → Settings → Integrations](https://console.apify.com/account/integrations)
2. Copy your Personal API Token
3. Keep it secure—this token has full account access

---

## Claude Desktop Setup

### Step 1: Find your config file

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**macOS:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Linux:**
```
~/.config/Claude/claude_desktop_config.json
```

If the file doesn't exist, create it.

### Step 2: Add Forage configuration

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

Replace `YOUR_APIFY_API_TOKEN` with your actual token.

### Step 3: Restart Claude Desktop

Quit Claude Desktop completely (check your system tray/menu bar). Reopen it.

### Step 4: Verify connection

Click the tool picker (hammer icon) in Claude Desktop. You should see 25 Forage tools:
- `search_web`
- `scrape_page`
- `get_company_info`
- `find_emails`
- `find_local_leads`
- And 20 more...

**Test it:** Ask Claude "Search the web for the latest AI news" and it should use `search_web`.

---

## Claude Code (CLI) Setup

### Step 1: Open settings

Run:
```bash
claude config
```

Or edit your settings file directly:
- Project: `.claude/settings.json`
- Global: `~/.claude/settings.json`

### Step 2: Add Forage configuration

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

### Step 3: Restart Claude Code

Exit and reopen your terminal session, then run `claude` again.

### Step 4: Verify connection

Ask Claude Code to use a Forage tool:
```
Search the web for "MCP server best practices"
```

It should invoke `search_web` and return results.

---

## Cursor Setup

### Step 1: Open MCP settings

Go to: **Settings → Features → MCP Servers**

Or edit your Cursor config file directly.

### Step 2: Add Forage configuration

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

### Step 3: Restart Cursor

Restart the application for MCP changes to take effect.

---

## Available Tools

Once connected, you have access to 25 tools and 12 skills:

### Core Tools

| Tool | Description | Cost |
|------|-------------|------|
| `search_web` | Real-time Google search | $0.03 |
| `scrape_page` | Extract clean text from any URL | $0.07 |
| `get_company_info` | Website analysis + email discovery | $0.08 |
| `find_emails` | Verified emails for any domain | $0.10 |
| `find_local_leads` | Local businesses from Google Maps | $0.15 |
| `find_leads` | B2B leads with verified emails | $0.25/100 |

### Knowledge Graph Tools

| Tool | Description | Cost |
|------|-------------|------|
| `query_knowledge` | Search your accumulated intelligence | $0.02 |
| `enrich_entity` | Get everything known about a company | $0.03 |
| `find_connections` | Find relationships between entities | $0.05 |
| `get_graph_stats` | Knowledge graph statistics | Free |

### Skills (Multi-Step Workflows)

| Skill | What it delivers | Cost |
|-------|-----------------|------|
| `skill_company_dossier` | Full company profile with contacts | $0.50 |
| `skill_prospect_company` | Decision makers with verified emails | $0.75 |
| `skill_outbound_list` | 100 targeted leads, export-ready | $3.50 |
| `skill_local_market_map` | All businesses of a type in a location | $0.80 |
| `skill_competitor_intel` | Pricing, features, and reviews | $0.80 |
| `skill_decision_maker_finder` | 20 verified decision-maker contacts | $1.00 |

For the full reference, see [Forage Tools Reference](/guides/forage-tools).

---

## Example Usage

### Web Search

**Prompt:**
> Search the web for recent funding rounds in the AI agent space

**Claude uses:** `search_web` with query "AI agent funding rounds 2025"

**Returns:** 10 search results with titles, URLs, and snippets

### Company Research

**Prompt:**
> Research stripe.com and find key contacts

**Claude uses:** `skill_company_dossier` with domain "stripe.com"

**Returns:**
```json
{
  "domain": "stripe.com",
  "website_summary": {
    "title": "Stripe | Financial Infrastructure",
    "summary": "..."
  },
  "key_contacts": [
    {
      "name": "John Collison",
      "email": "john@stripe.com",
      "title": "President",
      "seniority": "c_suite"
    }
  ],
  "cost_usd": 0.50
}
```

### Lead Generation

**Prompt:**
> Build me a list of 100 marketing directors in SaaS companies

**Claude uses:** `skill_outbound_list` with job_title "Marketing Director", industry "SaaS"

**Returns:** 100 leads with names, emails, companies, and LinkedIn profiles

---

## Pricing

Forage is pay-per-use. No subscription, no minimum.

| Tool Type | Price Range |
|-----------|-------------|
| Core tools | $0.03 – $0.25 per call |
| Skills | $0.45 – $3.50 per call |
| Actor gateway | Actor cost + 25% |

Charges appear on your Apify bill. Set spending limits in [Apify Console → Billing](https://console.apify.com/billing).

**Free trial:** New Apify accounts include $5 of free compute—enough for ~150 web searches or 10 company dossiers.

---

## Troubleshooting

### "Unknown tool" error

Your MCP connection isn't established. Check:
1. Config file syntax (valid JSON?)
2. API token is correct
3. Client was fully restarted

### "APIFY_TOKEN not configured" error

Your API token isn't being passed correctly. Verify:
1. Token is in the `--header` argument
2. No extra spaces or line breaks
3. Token hasn't been rotated

### Tools don't appear in tool picker

1. Restart your client completely
2. Check that `npx` is available (run `npx --version`)
3. Check console/logs for connection errors

### Rate limiting

Forage has no hard rate limits, but underlying APIs do. If you hit limits:
1. Reduce concurrent requests
2. Add delays between bulk operations
3. Contact support for higher limits

---

## Security Best Practices

1. **Never commit your API token to git.** Use environment variables:
   ```json
   "Authorization: Bearer ${APIFY_API_TOKEN}"
   ```

2. **Set spending limits** in Apify Console to prevent runaway costs.

3. **Audit your usage** in Apify Console → Runs to see all tool invocations.

4. **Rotate tokens** periodically and after any suspected compromise.

---

## Next Steps

- **[Forage Tools Reference](/guides/forage-tools)** — Full documentation for all 25 tools
- **[How to Find B2B Leads with Claude](/guides/ai-b2b-lead-generation)** — Lead gen workflows
- **[AI-Powered Lead Generation Guide](/guides/ai-lead-generation)** — Complete prospecting playbook

---

## Support

- **GitHub:** [github.com/ernestalabs/forage](https://github.com/ernestalabs/forage)
- **Apify:** Contact through [Apify Console](https://console.apify.com)
- **Email:** support@ernesta.com

---

*Last updated: March 2025*
