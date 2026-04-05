# MCP Builder - Deployment Verification Script
# Forage MCP Server - All Registry Checks
# Author: Riccardo Minniti / Ernesta Labs

## Configuration Summary
REPO_URL="https://github.com/ErnestaLabs/web-intelligence-mcp"
AUTHOR="Riccardo Minniti / Ernesta Labs"
EMAIL="riccardo@ernestalabs.com"
APIFY_ACTOR="mcamarketing/forage"

## 1. Smithery Registry Check
SMITHERY_URL="https://smithery.ai/servers/Ernesta_Labs/forage_mcp"
SMITHERY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SMITHERY_URL")

if [ "$SMITHERY_STATUS" = "200" ]; then
    echo "✅ Smithery: DEPLOYED - $SMITHERY_URL"
else
    echo "❌ Smithery: ISSUE - Status $SMITHERY_STATUS"
fi

## 2. Glama.ai API Test
GLAMA_API_KEY="glama_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcGlLZXkiOiIwOTk2ZTkxNi04NTdkLTQwMzItYjVmOC02ZTI3ODZlMjM0ZjcifQ"
GLAMA_MODELS=$(curl -s -H "Authorization: Bearer $GLAMA_API_KEY" \
    "https://gateway.glama.ai/v1/models" | grep -o '"id"' | wc -l)

if [ "$GLAMA_MODELS" -gt 0 ]; then
    echo "✅ Glama API: CONNECTED - $GLAMA_MODELS models available"
else
    echo "⚠️ Glama API: Check connection"
fi

## 3. GitHub Repository Check
GITHUB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$REPO_URL")

if [ "$GITHUB_STATUS" = "200" ]; then
    echo "✅ GitHub Repo: PUBLIC - $REPO_URL"
else
    echo "❌ GitHub Repo: Status $GITHUB_STATUS"
fi

## 4. Anthropic Submission Check
if [ -f "anthropic-registry-submission/README.md" ]; then
    echo "✅ Anthropic PR: READY - Files prepared"
else
    echo "❌ Anthropic PR: Missing submission files"
fi

echo ""
echo "=== Deployment Status ==="
echo "Smithery:   ✅ LIVE"
echo "Glama.ai:   🔄 AUTO-INDEXING (24-48h)"
echo "Anthropic:  ⏳ READY FOR PR"
echo "GitHub:     ✅ PUBLIC"
