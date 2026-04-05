# Forage MCP Server

Real-time web intelligence and lead generation for AI agents. Search, scrape, discover companies, find B2B emails, and build lead lists.

## What is Forage MCP?

Forage MCP is a Model Context Protocol server that gives AI agents capabilities they don't have built-in: verified email discovery, B2B lead generation, local business data, company intelligence, and persistent memory. Runs on Apify infrastructure.

## Capabilities

- **Real-time web search** — multi-source search returning ranked results
- **Page scraping** — extract clean content from any URL as markdown
- **Company intelligence** — website summary, contacts, social profiles
- **Verified B2B emails** — with confidence scores and LinkedIn profiles
- **Lead discovery** — companies and local businesses with phone, website, rating
- **Knowledge graph** — automatically remembers everything your agent researches
- **12 Skills** — multi-step workflows for dossiers, decision makers, outbound lists, competitive intel

## Quick Start

### Streamable HTTP (Recommended)

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
        "APIFY_API_TOKEN": "YOUR_APIFY_TOKEN"
      }
    }
  }
}
```

## Pricing

Pay per tool call. No subscription.

| Tool | Price |
|------|-------|
| `search_web` | $0.03 |
| `scrape_page` | $0.07 |
| `get_company_info` | $0.08 |
| `find_emails` | $0.10 |
| `find_local_leads` | $0.15 |
| `find_leads` | $0.25/100 |
| Skills | $0.45 - $3.50 |
| Knowledge graph | $0.02 - $0.05 |

## Tools Reference

### Core Tools
- `search_web` — Real-time web search
- `scrape_page` — Extract clean content from URLs
- `get_company_info` — Company website and contacts
- `find_emails` — Verified B2B emails
- `find_local_leads` — Local business data
- `find_leads` — B2B lead lists

### Knowledge Graph
- `query_knowledge` — Search accumulated intelligence
- `enrich_entity` — Get all data about a company
- `find_connections` — Discover entity relationships
- `get_graph_stats` — View graph statistics

### Actor Gateway
- `list_verified_actors` — Browse available actors
- `get_actor_schema` — Get actor input schema
- `call_actor` — Run any Apify actor

### Skills
- `skill_company_dossier` — Full company profile ($0.50)
- `skill_prospect_company` — Decision makers ($0.75)
- `skill_outbound_list` — 100 leads for CRM ($3.50)
- `skill_local_market_map` — Local businesses ($0.80)
- `skill_decision_maker_finder` — 20 contacts ($1.00)
- `skill_competitor_intel` — Pricing, features ($0.80)
- `skill_competitor_ads` — Active ads ($0.65)
- `skill_job_signals` — Hiring patterns ($0.55)
- `skill_tech_stack` — Technologies used ($0.45)
- `skill_funding_intel` — Funding history ($0.70)
- `skill_social_proof` — Reviews ($0.55)
- `skill_market_map` — Competitors in market ($1.20)

## Example Usage

### Find company emails
```json
{ "domain": "stripe.com", "limit": 10 }
```

### Generate outbound leads
```json
{ "job_title": "Marketing Director", "industry": "SaaS", "location": "United States" }
```

### Company dossier
```json
{ "domain": "notion.so" }
```

## Support

- GitHub: github.com/ernestalabs/forage
- Email: support@ernesta.com
