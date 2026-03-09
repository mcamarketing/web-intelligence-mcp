# Forage — MCP Server for AI Agents

Give your AI agent the tools to find, research, and understand the world — then remember what it learns.

Forage is a **Model Context Protocol (MCP) server** that runs on Apify and gives agents real-time web intelligence: live search, page scraping, company intelligence, email discovery, lead generation, and a persistent knowledge graph that grows smarter with every call.

Connect once. Your agent gets 25 tools and 12 one-trigger Skills. No API keys, no accounts, no setup. Pay only for what it uses.

---

## Why Forage

Most AI agents are blind to the current world. Their knowledge cuts off months ago, they can't reach URLs, and they forget everything between sessions.

Forage fixes all three:

- **Live data** — real-time web search and page scraping on every call
- **Business intelligence** — company profiles, email discovery, lead generation, competitor analysis
- **Memory** — every result feeds a private knowledge graph. The more your agent uses Forage, the more it knows about your market

---

## Tools

### Core Tools

| Tool | What it does | Cost |
|------|-------------|------|
| `search_web` | Real-time Google search | $0.03 |
| `scrape_page` | Extract clean content from any URL | $0.07 |
| `get_company_info` | Website + email intelligence for any domain | $0.08 |
| `find_emails` | Verified email addresses for a domain via Hunter.io | $0.10 |
| `find_local_leads` | Local businesses by type and location via Google Maps | $0.15 |
| `find_leads` | Targeted B2B leads with verified emails | $0.25 / 100 leads |

### Knowledge Graph Tools

| Tool | What it does | Cost |
|------|-------------|------|
| `query_knowledge` | Query your accumulated intelligence | $0.02 |
| `enrich_entity` | Get everything known about a company or domain | $0.03 |
| `find_connections` | Discover relationships between entities | $0.05 |
| `get_graph_stats` | Knowledge graph statistics | Free |

### Actor Gateway Tools

| Tool | What it does | Cost |
|------|-------------|------|
| `list_verified_actors` | Browse curated Apify actors available via Forage | $0.01 |
| `get_actor_schema` | Get input schema and pricing for any actor | $0.01 |
| `call_actor` | Run any Apify actor from within your agent workflow | Actor cost + 25% |

---

## Skills

Skills are multi-step workflows triggered with a single call. Your agent gets a complete, structured intelligence package — not raw data it has to interpret.

| Skill | What it delivers | Cost |
|-------|-----------------|------|
| `skill_company_dossier` | Full company profile: website, email pattern, key contacts | $0.50 |
| `skill_prospect_company` | Decision makers with verified emails, sorted by seniority | $0.75 |
| `skill_outbound_list` | 100 targeted leads with verified emails, export-ready | $3.50 |
| `skill_local_market_map` | Every business of a type in a location with phones and websites | $0.80 |
| `skill_competitor_intel` | Competitor pricing, features and reviews — searched and scraped | $0.80 |
| `skill_decision_maker_finder` | 20 verified decision-maker contacts at any company | $1.00 |
| `skill_competitor_ads` | Active ads on Facebook Ad Library and Google Transparency | $0.65 |
| `skill_job_signals` | Hiring patterns that reveal a company's growth strategy | $0.55 |
| `skill_tech_stack` | Tools and platforms a company runs, from BuiltWith and engineering blogs | $0.45 |
| `skill_funding_intel` | Funding rounds, investors, recent news and growth signals | $0.70 |
| `skill_social_proof` | G2, Capterra and Trustpilot reviews — praise, complaints, buyer personas | $0.55 |
| `skill_market_map` | All players in a market with positioning, pricing tiers and differentiators | $1.20 |

---

## Sample Output

**`skill_company_dossier` on `stripe.com`:**

```json
{
  "domain": "stripe.com",
  "company_name": "Stripe",
  "website_summary": {
    "title": "Stripe | Financial Infrastructure for the Internet",
    "summary": "Stripe is a technology company that builds economic infrastructure for the internet..."
  },
  "email_pattern": "{first}@stripe.com",
  "total_emails_found": 12,
  "key_contacts": [
    {
      "name": "John Collison",
      "email": "john@stripe.com",
      "title": "President",
      "seniority": "c_suite",
      "confidence": 97
    }
  ],
  "cost_usd": 0.50
}
```

**`find_local_leads` for dentists in Manchester:**

```json
{
  "keyword": "dentist",
  "location": "Manchester",
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
  "cost_usd": 0.15
}
```

---

## Connecting to Your AI Agent

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "forage": {
      "command": "npx",
      "args": ["-y", "@apify/actor-mcp-server", "--actors=ernesta_labs/forage"]
    }
  }
}
```

### Cursor / Windsurf / any MCP client

Use the Apify MCP gateway with actor ID `ernesta_labs/forage`.

### Direct SSE Connection

```
GET https://{actor-run-hostname}/sse
POST https://{actor-run-hostname}/messages?sessionId={id}
```

See the API tab for full OpenAPI documentation.

---

## The Knowledge Graph

Every tool call silently feeds a private knowledge graph. Entities, relationships, and confidence scores accumulate across all sessions.

The more you use Forage, the more it knows about your market. After a few weeks of agent activity:

- `query_knowledge("companies using Stripe in fintech")` returns results no live API has
- `enrich_entity("hubspot.com")` returns richer data than Hunter.io — at $0.03 vs $0.10+
- `find_connections("Stripe", "Plaid")` surfaces shared investors, shared hires, shared customers

Data is private per Apify account. PII is stored as one-way hashes only.

---

## Pricing

Forage runs entirely on our infrastructure. No API keys, no third-party accounts, no configuration. Connect your agent and go.

Pay per tool call. No subscription, no minimum. Charges are processed by Apify — you only pay for what your agent actually uses.

The free trial includes $1.00 of credit — enough for ~30 web searches or 2 Company Dossiers.

---

## Support

Open an issue on [GitHub](https://github.com/mcamarketing/Forage) or contact us through Apify.
