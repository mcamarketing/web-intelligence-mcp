# Web Intelligence MCP Server

Real-time web intelligence for AI agents. Search, scrape, find leads, and enrich company data.

## Tools

- **search_web** - Live Google/Bing search ($0.02/call)
- **scrape_page** - Clean markdown from any URL ($0.05/call)
- **find_leads** - Google Maps business data ($0.10/call)
- **get_company_info** - Tech stack, employees, contacts ($0.15/call)

## Quick Start

Add to your MCP client:

```json
{
  "mcpServers": {
    "web-intelligence": {
      "url": "https://[username]--web-intelligence-mcp.apify.actor/sse"
    }
  }
}
```

## Example Usage

### Search
```json
{ "query": "AI startups 2024", "num_results": 10 }
```

### Scrape
```json
{ "url": "https://example.com/article" }
```

### Find Leads
```json
{ "keyword": "software companies", "location": "San Francisco" }
```

### Company Info
```json
{ "domain": "stripe.com" }
```

## Pricing

Pay only for what you use:

| Tool | Price |
|------|-------|
| Web Search | $0.02 |
| Page Scrape | $0.05 |
| Lead Generation | $0.10 |
| Company Intelligence | $0.15 |

## Support

Contact: [Your email/support link]
