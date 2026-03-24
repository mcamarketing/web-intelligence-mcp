# Forage MCP — Web Intelligence & Persistent Knowledge Graph for AI Agents

Forage is a Model Context Protocol (MCP) server that gives AI agents **real-time web intelligence** and a **self-accumulating knowledge graph**. One connection provides 24 tools and 12 multi-step skills: web search, company data, verified B2B emails, local leads, and a graph that remembers everything your agent has ever discovered.

Built on Apify's scraping infrastructure. Powered by FalkorDB for persistent graph storage.

---

## The Knowledge Graph — Your Agent's Memory

Every tool call automatically feeds a private knowledge graph that grows smarter over time. No other MCP server does this.

```
┌─────────────────────────────────────────────────────────────┐
│                    FORAGE KNOWLEDGE GRAPH                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   [Company A] ──── has_domain ────▶ [domain.com]           │
│       │                                │                    │
│       │ works_at                       │ has_email_pattern  │
│       ▼                                ▼                    │
│   [Person B] ◀─── has_title ──── [Email Pattern]           │
│       │                                │                    │
│       │ located_in                     │ verified_emails    │
│       ▼                                ▼                    │
│   [San Francisco]              [john@domain.com]           │
│       │                                │                    │
│       │ operates_in                    │ linkedin           │
│       ▼                                ▼                    │
│   [SaaS Industry]              [LinkedIn Profile]          │
│                                                             │
│   Claims: "Raised Series A in 2024" (confidence: 89%)      │
│   Signals: Hiring spike in Q4 2025 (+45%)                  │
│   Regime: growth                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### What makes it different

| Feature | Forage Graph | Generic RAG/Vector DB |
|---------|--------------|----------------------|
| Entity deduplication | ✓ SHA-256 identity | ✗ Creates duplicates |
| Relationship tracking | ✓ Typed edges (works_at, located_in) | ✗ Similarity only |
| Confidence scoring | ✓ Increases with corroboration | ✗ Static embeddings |
| Provenance (claims) | ✓ Who said what, when | ✗ No source tracking |
| Time-series signals | ✓ Track metrics over time | ✗ Snapshot only |
| Causal inference | ✓ Find what drives what | ✗ No causality |
| Regime detection | ✓ Normal / stressed / pre-tipping | ✗ No state tracking |

### Graph tools

| Tool | What it does | Price |
|------|--------------|-------|
| `query_knowledge` | Search entities by name/type | $0.05 |
| `enrich_entity` | Full profile + all relationships | $0.08 |
| `find_connections` | Path between two entities | $0.12 |
| `add_claim` | Store provenance assertion | $0.05 |
| `get_claims` | Retrieve claims for entity | $0.05 |
| `add_signal` | Record time-series data point | $0.05 |
| `get_signals` | Query metrics over time | $0.05 |
| `set_regime` | Label entity state | $0.03 |
| `get_regime` | Check entity state | $0.03 |
| `causal_parents` | What drives this entity | $0.08 |
| `causal_children` | What this entity drives | $0.08 |
| `causal_path` | Highest-weight causal path | $0.15 |
| `simulate` | Propagate shock/boost through graph | $0.25 |
| `get_graph_stats` | Entity/relationship counts | Free |

The graph is **persistent** — stored in FalkorDB on our infrastructure. Your agent's research accumulates across sessions. The more you use Forage, the smarter it gets.

---

## Email Verification — How It Actually Works

We don't just guess email patterns. Each `find_emails` call runs a **4-step verification pipeline**:

### Step 1: Pattern Discovery
Scrape the target domain for email patterns (e.g., `firstname.lastname@domain.com`). Extract from:
- Contact pages, footers, team pages
- Press releases, blog author pages
- WHOIS records, SSL certificates

### Step 2: Candidate Generation
Generate candidate emails using discovered patterns + LinkedIn data. Cross-reference with:
- Company employee listings (if public)
- Job postings with contact info
- Conference speaker lists

### Step 3: SMTP Verification
For each candidate, we perform an SMTP handshake check:
- Connect to the domain's mail server
- Verify the recipient exists (`RCPT TO`)
- Detect catch-all domains (score penalty)
- Detect mailboxes that accept then bounce (honeypots)

### Step 4: Confidence Scoring
Each email gets a confidence score (0-100) based on:

| Signal | Weight | Example |
|--------|--------|---------|
| SMTP accept | 40% | Mail server accepted RCPT TO |
| Pattern match | 25% | Matches known company format |
| LinkedIn match | 20% | Name matches LinkedIn profile |
| Source corroboration | 15% | Found on multiple public sources |

**Return format:**
```json
{
  "email": "sarah.chen@stripe.com",
  "name": "Sarah Chen",
  "title": "VP of Sales",
  "seniority": "vp",
  "department": "sales",
  "linkedin": "linkedin.com/in/sarahchen",
  "confidence": 94,
  "verified": true,
  "verification_steps": ["smtp_accepted", "linkedin_match", "pattern_match"]
}
```

### What "verified" means
- **Confidence 90-100**: SMTP accepted + LinkedIn match + multiple sources. High deliverability.
- **Confidence 70-89**: SMTP accepted or strong pattern match. Good for outreach.
- **Confidence 50-69**: Pattern-based with partial verification. Use with caution.
- **Below 50**: Not returned (filtered out).

This is not a simple mailserver check. It's a multi-source corroboration pipeline that other MCP servers don't offer.

---

## Web Intelligence Tools

### Core Tools

| Tool | What it does | Price | Why this price |
|------|--------------|-------|----------------|
| `search_web` | Multi-source search, deduplicated, ranked | $0.03 | Aggregates Brave, Bing, DuckDuckGo + dedup + rank. Cheaper than calling each API separately ($0.03 total vs $0.06+ if you called 2 search APIs) |
| `scrape_page` | Extract clean markdown from any URL | $0.07 | Includes proxy rotation, JavaScript rendering, anti-bot bypass |
| `get_company_info` | Domain → full company profile | $0.08 | Aggregates 5+ data sources: website, LinkedIn, Crunchbase patterns, social profiles |
| `find_emails` | Verified B2B emails with LinkedIn | $0.10 | 4-step pipeline above |
| `find_local_leads` | Local businesses by niche + location | $0.15 | Google Maps + enrichment + phone/website extraction |
| `find_leads` | B2B leads by title/industry/location | $0.25/100 leads | That's $0.0025 per lead. Try finding 100 leads manually. |

### Skills (Multi-Step Workflows)

Skills chain multiple tools into one call, returning ready-to-use intelligence packages:

| Skill | Price | Returns |
|-------|-------|---------|
| `skill_company_dossier` | $0.50 | Full company profile + 10 contacts with emails |
| `skill_prospect_company` | $0.75 | 15 decision makers sorted by seniority + emails |
| `skill_outbound_list` | $3.50 | 100 verified leads ready for CRM import |
| `skill_local_market_map` | $0.80 | Up to 60 local businesses with contact info |
| `skill_decision_maker_finder` | $1.00 | 20 decision makers by seniority tier |
| `skill_competitor_intel` | $0.80 | Pricing, features, reviews, positioning |
| `skill_competitor_ads` | $0.65 | Active ad copy, landing pages, platforms |
| `skill_job_signals` | $0.55 | Hiring trends, open roles, expansion signals |
| `skill_tech_stack` | $0.45 | Technologies used with confidence scores |
| `skill_funding_intel` | $0.70 | Funding rounds, investors, valuation estimates |
| `skill_social_proof` | $0.55 | Reviews, ratings, testimonials aggregated |
| `skill_market_map` | $1.20 | Complete competitor landscape for a market |

---

## Why Forage over other MCP search tools?

| Capability | Forage | Brave Search MCP | Apify MCP | AgentQL |
|------------|--------|------------------|-----------|---------|
| Web search | ✓ | ✓ | ✗ | ✗ |
| Page scraping | ✓ | ✗ | ✓ | ✓ |
| Email discovery | ✓ (4-step verified) | ✗ | ✗ | ✗ |
| B2B leads | ✓ | ✗ | Partial | ✗ |
| Company intelligence | ✓ | ✗ | Partial | ✗ |
| Local businesses | ✓ | ✗ | ✓ | ✗ |
| **Persistent knowledge graph** | ✓ | ✗ | ✗ | ✗ |
| **Provenance & claims** | ✓ | ✗ | ✗ | ✗ |
| **Causal analysis** | ✓ | ✗ | ✗ | ✗ |
| **Time-series signals** | ✓ | ✗ | ✗ | ✗ |
| Multi-step skills | ✓ (12 skills) | ✗ | ✗ | ✗ |
| Actor gateway (1000+) | ✓ | ✗ | ✓ | ✗ |

**The knowledge graph is the differentiator.** Other tools give you data. Forage gives you *accumulated intelligence*. Every search, every email lookup, every company profile feeds your private graph. After a week of use, your agent knows more about your market than any single search ever could.

---

## Quick Start

### 1. Get Your API Token

Go to [Apify Console → Settings → Integrations](https://console.apify.com/account/integrations) and copy your Personal API Token.

### 2. Connect to Claude / Cursor / n8n

**Claude Desktop** (`%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "forage": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://mcamarketing--forage.apify.actor",
        "--header", "Authorization: Bearer YOUR_APIFY_TOKEN"
      ]
    }
  }
}
```

**Cursor / Windsurf:**

```json
{
  "forage": {
    "command": "npx",
    "args": [
      "-y", "mcp-remote",
      "https://mcamarketing--forage.apify.actor",
      "--header", "Authorization: Bearer YOUR_APIFY_TOKEN"
    ]
  }
}
```

**n8n / LangGraph / Custom:** Connect to the SSE endpoint at `https://mcamarketing--forage.apify.actor` with your Apify token in the Authorization header.

### 3. System Prompt (Optional)

Add to your agent's system prompt:

> When you need live web data, company info, verified emails, or lead lists, use Forage tools. Each call costs money (shown in responses), so batch operations when possible. Your knowledge graph persists across sessions — check it first before making new web calls.

---

## Examples

### Find 20 HVAC leads in Dallas

```
Call: find_leads
Params: { "industry": "HVAC", "location": "Dallas, TX", "limit": 20 }
Returns: 20 companies with name, phone, website, email, address
Cost: $0.05
```

### Get decision makers at a prospect

```
Call: skill_prospect_company
Params: { "domain": "stripe.com" }
Returns: 15 decision makers with title, email, LinkedIn, seniority
Cost: $0.75
```

### Build a local market map

```
Call: skill_local_market_map
Params: { "business_type": "dentist", "location": "London, UK" }
Returns: 60 dentists with address, phone, website, rating, reviews
Cost: $0.80
```

### Track a company's hiring over time

```
Call: add_signal
Params: { "entity": "Acme Corp", "metric": "job_postings", "value": 45 }
... repeat weekly ...
Call: get_signals
Params: { "entity": "Acme Corp", "metric": "job_postings" }
Returns: Time-series of job postings — hiring trend visible
```

### Find who influenced a deal

```
Call: find_connections
Params: { "from": "Your Company", "to": "Acme Corp" }
Returns: Path through shared connections, events, technologies
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    YOUR AI AGENT (Claude, Cursor, n8n)      │
└─────────────────────────┬───────────────────────────────────┘
                          │ MCP Protocol
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    FORAGE MCP SERVER (Apify)                 │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐  │
│  │ Web Search │  │   Scraper  │  │  Email Discovery     │  │
│  │ (3 engines)│  │ (rendered) │  │  (4-step pipeline)   │  │
│  └─────┬──────┘  └─────┬──────┘  └──────────┬───────────┘  │
│        └───────────────┼────────────────────┘              │
│                        ▼                                    │
│              ┌─────────────────┐                            │
│              │  Graph Client   │                            │
│              └────────┬────────┘                            │
└───────────────────────┼────────────────────────────────────┘
                        │ HTTPS
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                FORAGE GRAPH API (Railway)                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              FalkorDB (Redis-compatible)              │  │
│  │  Entities ──── RELATES ────▶ Entities                │  │
│  │  Claims (provenance)                                  │  │
│  │  Signals (time-series)                                │  │
│  │  Regimes (state tracking)                             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Pricing

Pay per tool call. No subscription. No minimum. Every response includes the cost.

| Your Apify spend | Your Forage cost | Ratio |
|-----------------|------------------|-------|
| $1 | ~$0.75 | 25% markup |
| $10 | ~$7.50 | 25% markup |
| $100 | ~$75 | 25% markup |

The 25% markup covers: proxy infrastructure, knowledge graph storage, email verification pipeline, multi-engine search aggregation, and ongoing maintenance.

**Free trial:** New Apify accounts get $5 platform credit. Try Forage risk-free.

---

## Limitations

- **Some sites block scraping** — we use proxies + JS rendering, but some sites (LinkedIn, closed social networks) are protected
- **Email accuracy ≠ 100%** — confidence scores reflect real verification, but email addresses can change
- **Knowledge graph is persistent but not portable** — data lives on our FalkorDB instance (not exported yet)
- **Rate limits** — Apify enforces per-account limits; Forage doesn't add extra limits on top

---

## Support & Links

- **GitHub Issues:** [github.com/mcamarketing/web-intelligence-mcp/issues](https://github.com/mcamarketing/web-intelligence-mcp/issues)
- **Apify Actor:** [mcamarketing/forage](https://apify.com/mcamarketing/forage)
- **Documentation:** See [QUICKSTART.md](./QUICKSTART.md) and [EXAMPLES.md](./EXAMPLES.md)
