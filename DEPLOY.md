# Deploy to Apify in 5 Minutes

## Prerequisites

```bash
# Install Apify CLI
npm install -g apify-cli

# Login
apify login
```

## Step 1: Get API Keys

| Service | URL | Free Tier |
|---------|-----|-----------|
| SerpAPI | https://serpapi.com | 100 searches/month |
| Jina AI | https://jina.ai/reader | 1M tokens/day |
| Google Places | https://cloud.google.com | $200 credit/month |
| Clearbit | https://clearbit.com | 250 requests/month |

## Step 2: Set Secrets

```bash
# Set your API keys as Apify secrets
apify secrets:set SERPAPI_KEY "your_key_here"
apify secrets:set JINA_AI_KEY "your_key_here"
apify secrets:set GOOGLE_PLACES_API_KEY "your_key_here"
apify secrets:set CLEARBIT_API_KEY "your_key_here"
```

## Step 3: Build & Push

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Push to Apify
apify push
```

## Step 4: Configure Actor

1. Go to [Apify Console](https://console.apify.com)
2. Find your Actor: `web-intelligence-mcp`
3. Go to **Settings** → Enable **Standby mode**
4. Go to **Source** → Set **Build tag** to `latest`

## Step 5: Set Pricing

1. Go to **Publication** tab
2. Click **Monetization**
3. Select **Pay per event**
4. Configure events:

| Event | Price |
|-------|-------|
| search-web | $0.02 |
| scrape-page | $0.05 |
| find-leads | $0.10 |
| company-info | $0.15 |

5. Save changes

## Step 6: Get Your MCP URL

After enabling Standby mode, your MCP endpoint is:

```
https://[username]--web-intelligence-mcp.apify.actor/sse
```

Use this in Claude, Cursor, or any MCP client.

## Testing

### Test with curl:

```bash
curl https://[username]--web-intelligence-mcp.apify.actor/health
```

### Test with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector \
  https://[username]--web-intelligence-mcp.apify.actor/sse
```

## Monitoring

- **Runs**: View all Actor runs in Console
- **Usage**: Check Analytics tab for charges
- **Logs**: Real-time logs in the Log tab
- **Earnings**: Payouts tab shows revenue

## Updating

```bash
# Make changes, then:
npm run build
apify push

# Apify automatically rebuilds with new code
```

## Troubleshooting

### Actor won't start
- Check all API keys are set correctly
- View logs in Apify Console

### Tools return errors
- Verify API keys have available quota
- Check API key permissions

### Not charging users
- Ensure monetization is enabled in Publication tab
- Check `Actor.charge()` calls in code

## Next Steps

1. **Share your Actor URL** on Twitter/LinkedIn
2. **Submit to MCP registries** (awesome-mcp-servers, etc.)
3. **Write a blog post** about your MCP server
4. **Create video tutorial** showing it in action

## Support

- [Apify Docs](https://docs.apify.com)
- [MCP Docs](https://modelcontextprotocol.io)
- [Discord](https://discord.gg/apify)

---

**You're live. Agents can now pay you for web intelligence.**
