# What Claude Can't Do: Lead Gen, Verified Emails, and Persistent Memory

Claude can search the web and read pages. But it can't generate B2B leads, find verified email addresses, scrape local business directories, or remember what it learned yesterday. These are the gaps Forage fills.

## TL;DR

- Claude has web search built in — general queries work fine
- Claude cannot find verified business emails with confidence scores
- Claude cannot generate targeted B2B lead lists with verified contacts
- Claude cannot extract structured local business data (phone, ratings, hours)
- Claude has no memory between sessions
- Forage adds all of these through MCP

---

## What Claude Does Well

Claude's built-in capabilities cover general research:

| Capability | Claude Can Do It? |
|------------|------------------|
| Search for news and articles | Yes |
| Read and summarize web pages | Yes |
| Answer questions about current events | Yes |
| General research queries | Yes |

**If you just need web search, you don't need Forage.** Claude handles that.

---

## What Claude Cannot Do

### 1. Find Verified Email Addresses

Ask Claude to find the email for a company's VP of Sales — it will search the web and maybe find a generic contact@ address or guess a pattern. It cannot:

- Access databases of verified business contacts
- Return emails with confidence scores (e.g., 94% confidence)
- Check whether emails are deliverable
- Distinguish personal emails from role-based addresses
- Return structured contact data (name, title, seniority, department)

**Forage `find_emails` returns:**
```json
{
  "domain": "stripe.com",
  "emails_found": 12,
  "emails": [
    {
      "name": "Sarah Chen",
      "email": "sarah.chen@stripe.com",
      "title": "VP Sales",
      "seniority": "vp",
      "department": "sales",
      "confidence": 94
    }
  ],
  "cost_usd": 0.10
}
```

### 2. Generate B2B Lead Lists

Ask Claude to build a list of 100 marketing directors at SaaS companies — it will try to search and compile results, but cannot:

- Access B2B contact databases
- Filter by job title, seniority, company size, industry, location
- Return export-ready lists with verified emails
- Guarantee verification status for each contact
- Include LinkedIn profiles and company websites

**Forage `skill_outbound_list` returns:**
```json
{
  "job_title": "Marketing Director",
  "industry": "SaaS",
  "total_leads": 100,
  "verified_emails": 94,
  "leads": [
    {
      "name": "Alex Rivera",
      "title": "Director of Marketing",
      "company": "Notion",
      "email": "alex.rivera@notion.so",
      "email_verified": true,
      "linkedin": "linkedin.com/in/alexrivera",
      "company_size": "500-1000",
      "location": "San Francisco, CA"
    }
  ],
  "export_ready": true,
  "cost_usd": 3.50
}
```

### 3. Extract Structured Local Business Data

Ask Claude to find all dentists in Manchester with phone numbers — it will search and return some results, but cannot:

- Query local business directories programmatically
- Return structured data for every field (phone, website, rating, review count)
- Get comprehensive results, not just top search hits
- Include opening hours and exact coordinates
- Return data ready for CRM import

**Forage `find_local_leads` returns:**
```json
{
  "keyword": "dentist",
  "location": "Manchester",
  "leads_found": 47,
  "leads": [
    {
      "name": "Peel Dental Studio",
      "address": "1 Peel Moat Rd, Stockport",
      "phone": "0161 432 1133",
      "website": "https://peeldentalstudio.co.uk",
      "rating": 4.9,
      "review_count": 312,
      "location": { "lat": 53.4084, "lng": -2.1536 }
    }
  ],
  "cost_usd": 0.15
}
```

### 4. Remember Across Sessions

Ask Claude about a company today, then ask again tomorrow — it starts fresh. Claude has no persistent memory. It cannot:

- Store entities and relationships from previous research
- Build a knowledge base over time
- Answer "what do we know about X" from accumulated data
- Connect dots across multiple research sessions
- Track changes in company data over time

**Forage Knowledge Graph:**
- Every tool call automatically feeds a private knowledge graph
- `query_knowledge` retrieves accumulated intelligence
- `find_connections` discovers relationships between entities
- `enrich_entity` returns everything known about a company
- Your agent gets smarter with every call

### 5. Return Structured Company Intelligence

Ask Claude about a company's tech stack or funding history — it will search and summarize, but returns prose, not structured data. It cannot:

- Return JSON with specific fields you can parse
- Extract decision-maker contacts with titles and seniority
- Detect technology stack as a structured list
- Compile competitor pricing in machine-readable format
- Provide data ready for spreadsheets or CRM

**Forage Skills return structured, actionable data:**

| Skill | What You Get |
|-------|-------------|
| `skill_company_dossier` | Website summary, email patterns, key contacts with titles — as JSON |
| `skill_tech_stack` | List of tools and platforms with categories |
| `skill_funding_intel` | Funding rounds, amounts, investors, dates — structured |
| `skill_competitor_intel` | Pricing tiers, features, review scores — in tables |
| `skill_decision_maker_finder` | 20 contacts with emails, titles, seniority, LinkedIn |

---

## Claude + Forage: Best of Both

Use Claude's built-in search for general research. Use Forage when you need structured business data:

| Task | Use |
|------|-----|
| "What's happening in AI today?" | Claude's web search |
| "Find me 50 leads at fintech companies" | Forage `skill_outbound_list` |
| "Summarize this article" | Claude's built-in |
| "Get verified emails at Stripe" | Forage `find_emails` |
| "What's the weather in London?" | Claude's web search |
| "Find all plumbers in Leeds with phone numbers" | Forage `find_local_leads` |
| "What do we know about HubSpot from past research?" | Forage `query_knowledge` |
| "Who are the decision makers at Notion?" | Forage `skill_decision_maker_finder` |

---

## Quick Setup

Add Forage to Claude Desktop or Claude Code:

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

Get your token from [Apify Console](https://console.apify.com/account/integrations).

Full setup: [Forage MCP Server: Complete Setup Guide](/guides/forage-setup)

---

## Pricing

| Capability | Tool | Cost |
|------------|------|------|
| Verified emails for a domain | `find_emails` | $0.10 |
| Local business leads | `find_local_leads` | $0.15 |
| B2B leads (per 100) | `find_leads` | $0.25 |
| Full outbound list (100 leads) | `skill_outbound_list` | $3.50 |
| Company dossier | `skill_company_dossier` | $0.50 |
| Decision makers (20 contacts) | `skill_decision_maker_finder` | $1.00 |
| Knowledge graph query | `query_knowledge` | $0.02 |

No subscription. Pay per call.

---

## Next Steps

- [Forage MCP Server: Complete Setup Guide](/guides/forage-setup) — Get connected in 5 minutes
- [How to Find B2B Leads with Claude](/guides/ai-b2b-lead-generation) — Lead gen workflows
- [Best MCP Servers for Claude (2025)](/guides/best-mcp-servers-claude) — Compare options

---

*Last updated: March 2025*
