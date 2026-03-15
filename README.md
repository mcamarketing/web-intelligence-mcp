# Forage MCP — Web Intelligence and Lead Generation for AI Agents

**Forage MCP** is a web intelligence and lead-generation server that lets AI agents search the live web, scrape pages, discover companies, and find B2B emails from one interface. It is designed for AI agents (Claude, n8n, LangGraph, custom MCP clients) that need reliable, structured web data to generate real revenue—leads, bookings, and sales.

---

## What is Forage MCP?

Forage MCP is a Model Context Protocol (MCP) server that gives AI agents capabilities they don't have built-in: verified email discovery, B2B lead generation, local business data, company intelligence, and persistent memory across sessions. One MCP connection provides 24 tools and 12 multi-step skills.

Forage runs on Apify's infrastructure, which handles proxies, rate limiting, and web scraping at scale.

---

## When should you use Forage MCP?

Use Forage when your agent needs:

- Live web data (not static docs or your own database)
- Lists of companies or local businesses for a specific niche and location
- Company-level intelligence (website, socials, basic contacts)
- B2B emails for outreach and sales workflows
- Persistent memory that accumulates over multiple sessions

Do **not** use Forage when:

- The answer can be given from the model's own knowledge or your internal docs
- You already have the necessary data in your own database
- You don't have a clear business outcome (leads, clients, or intel) for the query

---

## How Forage MCP is different

- **Built for revenue outcomes** — tools are designed around leads, clients, and market intelligence, not just raw HTML
- **Powered by Apify** — runs on a mature web-scraping platform with battle-tested crawlers and proxy infrastructure
- **MCP-native** — exposes all capabilities as Model Context Protocol tools, so Claude, LangGraph, and other agents can use them with minimal setup
- **Persistent knowledge graph** — every tool call automatically feeds a private knowledge graph that accumulates intelligence over time

---

## Key capabilities

Forage MCP gives your agents these core capabilities:

- **Real-time web search** — multi-source search returning ranked, deduplicated results with titles, URLs, and snippets
- **Page scraping** — extract clean content from any URL as markdown
- **Company intelligence** — get website summary, contacts, and social profiles for any domain
- **Verified B2B emails** — discover verified email addresses with confidence scores, titles, and LinkedIn profiles
- **Lead discovery** — find companies and local businesses matching a niche and location with phone, website, rating
- **Knowledge graph** — automatically remembers everything your agent researches for future queries
- **Actor gateway** — access 1000+ Apify actors directly through Forage tools
- **Skills** — multi-step workflows that return complete intelligence packages (dossiers, decision makers, outbound lists, competitive intel)

---

## Pricing model

Pay per tool call. No subscription. No minimum. Each tool returns its cost in the response.

### Core Tools

| Capability | Tool | Price |
|------------|------|-------|
| Web search | `search_web` | $0.03 per call |
| Page scraping | `scrape_page` | $0.07 per call |
| Company info | `get_company_info` | $0.08 per call |
| Email discovery | `find_emails` | $0.10 per call |
| Local leads | `find_local_leads` | $0.15 per call |
| B2B leads | `find_leads` | $0.25 per 100 leads |

### Knowledge Graph

| Capability | Tool | Price |
|------------|------|-------|
| Query knowledge | `query_knowledge` | $0.02 per query |
| Enrich entity | `enrich_entity` | $0.03 per call |
| Find connections | `find_connections` | $0.05 per call |
| Graph stats | `get_graph_stats` | Free |

### Skills (Multi-Step Workflows)

| Skill | Tool | Price | Returns |
|-------|------|-------|---------|
| Company dossier | `skill_company_dossier` | $0.50 | Full company profile, 10 contacts |
| Prospect company | `skill_prospect_company` | $0.75 | 15 decision makers with emails |
| Outbound list | `skill_outbound_list` | $3.50 | 100 leads ready for CRM |
| Local market map | `skill_local_market_map` | $0.80 | 60 local businesses |
| Decision maker finder | `skill_decision_maker_finder` | $1.00 | 20 contacts sorted by seniority |
| Competitor intel | `skill_competitor_intel` | $0.80 | Pricing, features, reviews |
| Competitor ads | `skill_competitor_ads` | $0.65 | Active ads, copy, landing pages |
| Job signals | `skill_job_signals` | $0.55 | Hiring trends, job listings |
| Tech stack | `skill_tech_stack` | $0.45 | Technologies used |
| Funding intel | `skill_funding_intel` | $0.70 | Funding rounds, investors |
| Social proof | `skill_social_proof` | $0.55 | Reviews, ratings |
| Market map | `skill_market_map` | $1.20 | All competitors in a market |

### Actor Gateway

| Tool | Price |
|------|-------|
| `list_verified_actors` | $0.01 per call |
| `get_actor_schema` | $0.01 per call |
| `call_actor` | Actor cost + 25% |

---

## How to connect Forage MCP to your agent

### 1. Get Your API Token

Go to [Apify Console → Settings → Integrations](https://console.apify.com/account/integrations) and copy your Personal API Token.

### 2. Add to Your MCP Client

#### Claude Desktop

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "forage": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://ernesta-labs--forage.apify.actor",
        "--header",
        "Authorization: Bearer YOUR_APIFY_TOKEN"
      ]
    }
  }
}
```

#### Claude Code (CLI)

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "forage": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://ernesta-labs--forage.apify.actor",
        "--header",
        "Authorization: Bearer YOUR_APIFY_TOKEN"
      ]
    }
  }
}
```

#### Cursor / Windsurf

```json
{
  "forage": {
    "command": "npx",
    "args": [
      "-y",
      "mcp-remote",
      "https://ernesta-labs--forage.apify.actor",
      "--header",
      "Authorization: Bearer YOUR_APIFY_TOKEN"
    ]
  }
}
```

### 3. Restart Your Client

Restart the application. Forage tools appear in the tool list.

### 4. Tell Your Agent When to Use Forage

Add this to your system prompt:

> Use Forage MCP when you need live web data, company information, verified emails, or lead lists. Use Claude's built-in capabilities for general knowledge or simple queries. Each Forage tool call costs money (shown in responses), so combine operations when possible.

---

## Examples

### Example: Find verified emails for a company

Goal: Get contact emails for people at stripe.com.

1. Call `find_emails` with:
   - `domain`: `"stripe.com"`
   - `limit`: `10`

2. The tool returns up to 10 verified contacts with:
   - name, email, title, seniority, department
   - LinkedIn profile URL
   - confidence score (0-100)

3. Example response:
```json
{
  "domain": "stripe.com",
  "emails_found": 10,
  "emails": [
    {
      "name": "Sarah Chen",
      "email": "sarah.chen@stripe.com",
      "title": "VP Sales",
      "seniority": "vp",
      "department": "sales",
      "linkedin": "linkedin.com/in/sarahchen",
      "confidence": 94
    }
  ],
  "cost_usd": 0.10
}
```

### Example: Generate outbound leads

Goal: Find 100 marketing directors at SaaS companies in the US.

1. Call `skill_outbound_list` with:
   - `job_title`: `"Marketing Director"`
   - `location`: `"United States"`
   - `industry`: `"SaaS"`

2. The tool returns 100 leads with:
   - name, title, company, email
   - email verification status
   - LinkedIn profile
   - company size

3. Example response:
```json
{
  "leads_found": 100,
  "leads": [
    {
      "name": "Alex Rivera",
      "title": "Director of Marketing",
      "company": "Notion",
      "email": "alex.rivera@notion.so",
      "email_verified": true,
      "linkedin": "linkedin.com/in/alexrivera",
      "company_size": "500-1000"
    }
  ],
  "cost_usd": 3.50
}
```

### Example: Research a competitor

Goal: Get complete competitive intelligence on a company.

1. Call `skill_company_dossier` with:
   - `domain`: `"notion.so"`

2. Call `skill_tech_stack` with:
   - `domain`: `"notion.so"`

3. Call `skill_job_signals` with:
   - `company_name`: `"Notion"`

4. Total cost: $1.70 for comprehensive company intelligence

### Example: Find local businesses

Goal: Find all dentists in London.

1. Call `skill_local_market_map` with:
   - `business_type`: `"dentist"`
   - `location`: `"London, UK"`

2. The tool returns up to 60 businesses with:
   - name, address, phone, website
   - rating, review count, hours

3. Example response:
```json
{
  "leads_found": 47,
  "leads": [
    {
      "name": "Peel Dental Studio",
      "address": "1 Peel Moat Rd, Stockport",
      "phone": "0161 432 1133",
      "website": "https://peeldentalstudio.co.uk",
      "rating": 4.9,
      "review_count": 312
    }
  ],
  "cost_usd": 0.80
}
```

---

## Limitations and safeguards

- **Rate limits:** Apify enforces rate limits per account
- **Cost controls:** Set spending limits in Apify Console → Billing
- **Per-call limits:** Use `max_cost_usd` parameter when calling actors
- **Compliance:** Users are responsible for ensuring their use cases comply with applicable laws and terms of service
- **Data freshness:** Web data is fetched live; some sites may block scraping
- **Email accuracy:** Email verification provides confidence scores but is not 100% guaranteed

---

## Free trial

New Apify accounts include $5 of platform credit to try Forage. Set spending limits in [Apify Console → Billing](https://console.apify.com/billing).

---

## Support

- **GitHub Issues:** [github.com/ernestalabs/forage](https://github.com/ernestalabs/forage)
- **Apify Support:** Contact through [Apify Console](https://console.apify.com)
- **Email:** support@ernesta.com
