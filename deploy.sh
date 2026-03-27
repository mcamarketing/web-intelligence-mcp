#!/usr/bin/env bash
# deploy.sh — Forage Perception Graph stack
# Usage: bash deploy.sh [--down] [--logs SERVICE]
set -euo pipefail

# ─── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}✓${RESET} $1"; }
fail() { echo -e "${RED}✗${RESET} $1"; FAILED=1; }
info() { echo -e "${CYAN}→${RESET} $1"; }
warn() { echo -e "${YELLOW}!${RESET} $1"; }
FAILED=0

# ─── flags ────────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--down" ]]; then
  info "Tearing down stack…"
  docker compose down --remove-orphans
  ok "Stack stopped."
  exit 0
fi

if [[ "${1:-}" == "--logs" ]]; then
  docker compose logs -f "${2:-}"
  exit 0
fi

echo -e "\n${BOLD}Forage Perception Graph — Deploy${RESET}"
echo "────────────────────────────────────────"

# ─── PREFLIGHT CHECKS ─────────────────────────────────────────────────────────
info "Running preflight checks…"

# 1. Docker running
if docker info &>/dev/null; then
  ok "Docker daemon is running"
else
  fail "Docker is not running. Start Docker Desktop or 'sudo systemctl start docker'"
fi

# 2. APIFY_TOKEN set
if [[ -n "${APIFY_TOKEN:-}" ]]; then
  ok "APIFY_TOKEN is set"
else
  fail "APIFY_TOKEN is not set. Export it or add to .env before running."
fi

# 3. Node version >= 18
NODE_VER=$(node --version 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")
if [[ "$NODE_VER" -ge 18 ]]; then
  ok "Node.js v${NODE_VER} (>= 18 required)"
else
  fail "Node.js >= 18 required. Found: $(node --version 2>/dev/null || echo 'not found')"
fi

# 4. docker compose v2 available
if docker compose version &>/dev/null; then
  ok "docker compose v2 available"
else
  fail "'docker compose' not found. Install Docker Desktop >= 3.6 or compose plugin."
fi

# Bail early if any preflight failed
if [[ "$FAILED" -eq 1 ]]; then
  echo ""
  echo -e "${RED}Preflight failed. Fix the errors above before deploying.${RESET}"
  exit 1
fi

# ─── .env HANDLING ────────────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  warn ".env not found — writing .env.template"
  cat > .env.template << 'TMPL'
# ──────────────────────────────────────────────
# Forage Perception Graph — Environment Template
# Copy this file to .env and fill in all values.
# NEVER commit .env to version control.
# ──────────────────────────────────────────────

# Required — Apify platform token (from apify.com/account)
APIFY_TOKEN=

# Forage actor endpoint (do not change unless self-hosting)
FORAGE_ENDPOINT=https://ernesta-labs--forage.apify.actor

# MiroFish simulation service (default: docker service name)
MIROFISH_HOST=http://mirofish:7000

# Reddit ingest — comma-separated subreddits (multilingual OK)
# Example: worldnews,russia,europe,fashion,streetwear
REDDIT_SUBREDDITS=worldnews

# Agent session budget in USD (warn at $1, hard stop at $5)
SESSION_BUDGET_USD=1.00

# Scrapling headless mode (true recommended for production)
SCRAPLING_HEADLESS=true

# Optional: override scrapling bridge URL (default: http://scrapling:8001)
# SCRAPLING_BASE=http://scrapling:8001
TMPL
  echo ""
  echo -e "${YELLOW}Action required:${RESET}"
  echo "  1. cp .env.template .env"
  echo "  2. Edit .env and set APIFY_TOKEN (minimum required)"
  echo "  3. Run deploy.sh again"
  exit 1
fi

ok ".env found"

# Load .env (skip comment lines and blank lines)
set -a
# shellcheck disable=SC1090
source <(grep -v '^\s*#' .env | grep -v '^\s*$')
set +a

# Re-validate APIFY_TOKEN from .env in case it wasn't in shell env
if [[ -z "${APIFY_TOKEN:-}" ]]; then
  fail "APIFY_TOKEN is empty in .env. Fill it in and retry."
  exit 1
fi

# ─── BUILD ────────────────────────────────────────────────────────────────────
echo ""
info "Building TypeScript…"
if npm run build 2>&1; then
  ok "TypeScript build succeeded"
else
  fail "TypeScript build failed. Run 'npm run build' for full error output."
  exit 1
fi

echo ""
info "Building Docker images…"
if docker compose build --quiet 2>&1; then
  ok "Docker images built"
else
  fail "Docker build failed. Run 'docker compose build' for details."
  exit 1
fi

# ─── LAUNCH ───────────────────────────────────────────────────────────────────
echo ""
info "Starting services…"
docker compose up -d --remove-orphans

# Give services a moment to initialise before health checks
sleep 5

# ─── HEALTH CHECKS ────────────────────────────────────────────────────────────
echo ""
info "Running health checks (30s timeout per service)…"
echo "────────────────────────────────────────"

HEALTH_FAILED=0

check_http() {
  local label="$1"
  local url="$2"
  local expected_field="${3:-}"  # optional jq field to verify in response

  local response
  if response=$(curl -sf --max-time 30 "$url" 2>/dev/null); then
    if [[ -n "$expected_field" ]]; then
      if echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if '$expected_field' in str(d) else 1)" 2>/dev/null; then
        ok "$label"
      else
        warn "$label — responded but field '$expected_field' not found in: ${response:0:120}"
        HEALTH_FAILED=1
      fi
    else
      ok "$label"
    fi
  else
    fail "$label — no response at $url"
    HEALTH_FAILED=1
  fi
}

# 1. Scrapling bridge
check_http "Scrapling bridge (:8001/health)" \
  "http://localhost:8001/health" "forage_reachable"

# 2. Meta-orchestrator
check_http "Meta-orchestrator (:8000/status)" \
  "http://localhost:8000/status" "graph"

# 3. Forage graph — token valid + graph reachable
info "Checking Forage graph connectivity…"
FORAGE_RESP=$(curl -sf --max-time 30 \
  -X POST "${FORAGE_ENDPOINT:-https://ernesta-labs--forage.apify.actor}/mcp" \
  -H "Authorization: Bearer ${APIFY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"health","method":"tools/call","params":{"name":"get_graph_stats","arguments":{}}}' 2>/dev/null || echo "")

if [[ -n "$FORAGE_RESP" ]] && echo "$FORAGE_RESP" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); sys.exit(0)" 2>/dev/null; then
  ok "Forage graph reachable — token valid"
else
  fail "Forage graph not reachable. Check APIFY_TOKEN and actor status."
  HEALTH_FAILED=1
fi

# ─── RESULT ───────────────────────────────────────────────────────────────────
echo "────────────────────────────────────────"
echo ""

if [[ "$HEALTH_FAILED" -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}Stack ready.${RESET}"
  echo ""
  echo "Test commands:"
  echo ""
  echo "  # Spawn agent swarm for a mission"
  echo "  curl -X POST http://localhost:8000/orchestrate \\"
  echo "    -H 'Content-Type: application/json' \\"
  echo "    -d '{\"mission\":\"map russian fashion consumer perception\"}'"
  echo ""
  echo "  # Ingest GDELT data for Russia"
  echo "  curl -X POST http://localhost:8001/ingest/gdelt \\"
  echo "    -H 'Content-Type: application/json' \\"
  echo "    -d '{\"timespan\":\"15min\",\"country\":\"Russia\"}'"
  echo ""
  echo "  # Record a prediction"
  echo "  python3 validators/prediction_validator.py --record BTC"
  echo ""
  echo "  # Check stack status"
  echo "  curl http://localhost:8000/status | python3 -m json.tool"
  echo ""
  echo "  # Follow logs"
  echo "  bash deploy.sh --logs scrapling"
  echo "  bash deploy.sh --logs orchestrator"
  echo ""
  echo "  # Tear down"
  echo "  bash deploy.sh --down"
else
  echo -e "${RED}${BOLD}Some health checks failed.${RESET}"
  echo ""
  echo "Diagnostics:"
  echo "  docker compose ps"
  echo "  docker compose logs scrapling"
  echo "  docker compose logs orchestrator"
  echo ""
  echo "Retry after fixing issues:"
  echo "  bash deploy.sh"
  exit 1
fi