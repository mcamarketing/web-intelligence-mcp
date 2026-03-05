# Quick Start - Web Intelligence MCP Server

## 3-Minute Deploy

```bash
# 1. Install Apify CLI
npm install -g apify-cli

# 2. Login
apify login

# 3. Install deps & build
npm install && npm run build

# 4. Set your API keys
apify secrets:set SERPAPI_KEY "your_key"
apify secrets:set JINA_AI_KEY "your_key"
apify secrets:set GOOGLE_PLACES_API_KEY "your_key"
apify secrets:set CLEARBIT_API_KEY "your_key"

# 5. Push to Apify
apify push

# 6. Enable Standby mode in Console → Settings
# 7. Set pricing in Console → Publication → Monetization
# Done! Your URL: https://[you]--web-intelligence-mcp.apify.actor/sse
```

## API Keys (Free Tiers)

| Service | URL | Free Quota |
|---------|-----|------------|
| SerpAPI | serpapi.com | 100 searches/mo |
| Jina AI | jina.ai/reader | 1M tokens/day |
| Google Places | cloud.google.com | $200 credit/mo |
| Clearbit | clearbit.com | 250 requests/mo |

## Pricing You Set

| Tool | Suggested Price | Your Margin |
|------|-----------------|-------------|
| search_web | $0.02 | ~70% |
| scrape_page | $0.05 | ~70% |
| find_leads | $0.10 | ~60% |
| get_company_info | $0.15 | ~50% |

**You keep 80%** (Apify takes 20%)

## MCP Client Config

### Claude Desktop
```json
{
  "mcpServers": {
    "web-intelligence": {
      "url": "https://[username]--web-intelligence-mcp.apify.actor/sse"
    }
  }
}
```

### Cursor
Add to Cursor Settings → MCP → Add Server:
- Name: `web-intelligence`
- URL: `https://[username]--web-intelligence-mcp.apify.actor/sse`

### Generic
```javascript
const client = new MCPClient({
  servers: {
    webIntelligence: "https://[username]--web-intelligence-mcp.apify.actor/sse"
  }
});
```

## Test Commands

```bash
# Health check
curl https://[you]--web-intelligence-mcp.apify.actor/health

# MCP Inspector
npx @modelcontextprotocol/inspector \
  https://[you]--web-intelligence-mcp.apify.actor/sse
```

## File Structure

```
mcp-server/
├── .actor/
│   ├── actor.json          # Actor config (standby mode)
│   ├── pay_per_event.json  # Pricing config
│   └── README.md           # Store listing
├── src/
│   └── main.ts             # MCP server + 4 tools
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config
├── Dockerfile              # Container build
├── README.md               # Full docs
├── DEPLOY.md               # Deploy guide
└── QUICKSTART.md           # This file
```

## Revenue Math

| Daily Calls | Monthly Revenue | Your Cut (80%) | API Costs | Net Profit |
|-------------|-----------------|----------------|-----------|------------|
| 100         | $500            | $400           | ~$100     | $300       |
| 1,000       | $5,000          | $4,000         | ~$1,000   | $3,000     |
| 10,000      | $50,000         | $40,000        | ~$10,000  | $30,000    |

## Next Steps

1. [ ] Deploy to Apify
2. [ ] Test with Claude/Cursor
3. [ ] Post on Twitter/LinkedIn
4. [ ] Submit to awesome-mcp-servers
5. [ ] Write blog post
6. [ ] Collect user feedback
7. [ ] Adjust pricing
8. [ ] Scale to $10K/mo

## Support

- Issues: GitHub Issues
- Docs: [Apify MCP Docs](https://docs.apify.com/platform/integrations/mcp)
- Community: [Apify Discord](https://discord.gg/apify)

---

**Build once. Deploy. Let agents pay you forever.**
