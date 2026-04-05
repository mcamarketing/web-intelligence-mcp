# Anthropic Registry PR Instructions

## Step-by-Step PR Guide

### 1. Fork the Repository

1. Go to https://github.com/modelcontextprotocol/servers
2. Click **Fork** in the top right
3. Clone your fork locally

### 2. Create the Server Directory

```bash
# In your forked repo
cd src
git checkout -b add-forage-server
mkdir forage
cd forage
```

### 3. Copy Files

Copy these files from `anthropic-registry-submission/` to `src/forage/`:
- `README.md`
- `package.json`

### 4. Update Main README

Edit the main `README.md` at the root of the repo and add Forage to the servers table:

Find the table (search for "| Name | Description |")

Add this row (alphabetically by name):

```markdown
| **Forage** | Web intelligence, verified B2B contacts, and persistent knowledge graph | [README](./src/forage) |
```

### 5. Commit and Push

```bash
git add src/forage/
git add README.md
git commit -m "Add Forage MCP server

- Web search, scraping, and company intelligence
- 4-step email verification pipeline
- Persistent knowledge graph with relationship tracking
- 24 tools and 12 multi-step skills

Author: Riccardo Minniti / Ernesta Labs"
git push origin add-forage-server
```

### 6. Create Pull Request

1. Go to your fork on GitHub
2. Click **Compare & pull request**
3. Use this template:

**Title:**
```
Add Forage MCP Server — Web Intelligence & Knowledge Graph
```

**Body:**
```markdown
## Summary
Adds Forage MCP server for web intelligence, verified B2B contacts, and persistent knowledge graph storage.

## Features
- 🔍 Multi-source web search (Brave, Bing, DuckDuckGo) with deduplication
- 📧 4-step email verification (SMTP + LinkedIn + pattern matching)
- 🕸️ Persistent knowledge graph with entity relationships
- 📊 12 multi-step skills for lead generation and market research
- 💼 B2B lead discovery by title, industry, location
- 🏪 Local business intelligence

## Server Details
- **Author:** Riccardo Minniti / Ernesta Labs (riccardo@ernestalabs.com)
- **Repository:** https://github.com/ErnestaLabs/web-intelligence-mcp
- **Homepage:** https://apify.com/ernesta_labs/forage
- **License:** MIT
- **Runtime:** Apify Actor (SSE endpoint)

## Checklist
- [x] Server follows MCP specification
- [x] README includes installation and usage instructions
- [x] Package.json includes proper metadata
- [x] Entry added to main README servers table
- [x] Tested with Claude Desktop
- [x] Tested with Cursor

## Demo Video
[Link to 60-second demo video showing company research and email discovery]
```

### 7. Submit PR

Click **Create pull request**

---

## Post-Submission

1. **Monitor the PR** for review comments
2. **Respond promptly** to any requested changes
3. **Update documentation** if the maintainers suggest improvements
4. **Celebrate** when merged! 🎉

---

## Registry Entry Preview

When merged, Forage will appear at:
https://modelcontextprotocol.io/servers

With this description:
> "Turn any company into an interactive org chart with verified executive contacts. Forage maps decision-maker relationships and delivers emails, phones, and LinkedIn profiles directly in Claude."
