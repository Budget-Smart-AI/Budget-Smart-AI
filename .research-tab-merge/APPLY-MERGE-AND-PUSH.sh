#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# APPLY-MERGE-AND-PUSH.sh
#
# One-shot script to finish the Research tab merge and push to origin/main.
#
# Context:
# - The sandbox filesystem (virtiofs over Windows) blocks unlink() on files
#   inside .git/, so git pull/commit/push must be run from your local
#   terminal (PowerShell/Git Bash/WSL), NOT from the Cowork session.
# - Another Claude session already merged a Research tab today (commits
#   d3c2063, 3728a38, 64e3bfa). This script cleanly merges BOTH of our
#   work: their StockPriceChart + clickable-holdings + /api/stocks/:symbol/history,
#   plus my richer ResearchTab component + /api/investments/research/*
#   routes + watchlist persistence.
#
# What it does:
#   1. Verify clean working tree (modulo CRLF noise) & fetch origin
#   2. Save your in-tree new files (ResearchTab.tsx, migration) to /tmp
#   3. git reset --hard origin/main   (discards the dirty uncommitted state)
#   4. Restore ResearchTab.tsx + migration into the fresh tree
#   5. Copy 4 pre-merged files from .research-tab-merge/ over their post-pull
#      counterparts (these include origin/main + my additions, already merged)
#   6. Restore Part 6 of ENGINE_MIGRATION_PLAN.md
#   7. Run type-check (npm run check) — abort if fails
#   8. Commit in 3 logical chunks
#   9. git push origin main
#
# Safe to re-run: if anything goes sideways, your work is in:
#   .research-tab-merge/   — all 7 merged files
#   /tmp/bsai-pre-merge/   — saved in-tree snapshot from step 2
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$REPO/.research-tab-merge"
SAVE="/tmp/bsai-pre-merge-$(date +%Y%m%d-%H%M%S)"

echo "Repo:     $REPO"
echo "Stage:    $STAGE"
echo "Save-to:  $SAVE"
echo

cd "$REPO"

# ─── Step 0: sanity checks ───────────────────────────────────────────────
if [[ ! -d .git ]]; then
  echo "ERROR: Not a git repo. cd into Budget-Smart-AI first."
  exit 1
fi
if [[ ! -d "$STAGE" ]]; then
  echo "ERROR: .research-tab-merge/ not found. Is this the right repo?"
  exit 1
fi
branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$branch" != "main" ]]; then
  echo "ERROR: Expected to be on main, got: $branch"
  exit 1
fi

# ─── Step 1: fetch origin ────────────────────────────────────────────────
echo "━━━ Step 1: fetch origin/main ━━━"
git fetch origin main

# ─── Step 2: save in-tree new files ──────────────────────────────────────
echo "━━━ Step 2: save in-tree new files to $SAVE ━━━"
mkdir -p "$SAVE"
[[ -f client/src/components/investments/ResearchTab.tsx ]] \
  && cp client/src/components/investments/ResearchTab.tsx "$SAVE/" \
  && echo "  saved ResearchTab.tsx"
[[ -f migrations/0031_user_watchlists.sql ]] \
  && cp migrations/0031_user_watchlists.sql "$SAVE/" \
  && echo "  saved 0031_user_watchlists.sql"

# ─── Step 3: reset hard to origin/main ───────────────────────────────────
echo "━━━ Step 3: git reset --hard origin/main ━━━"
echo "  (your uncommitted work to 5 files is about to be discarded —"
echo "   but their post-merge versions are in .research-tab-merge/)"
git reset --hard origin/main
git clean -fd -- client/src/components/investments migrations/0031_user_watchlists.sql 2>/dev/null || true

# ─── Step 4: place new files ─────────────────────────────────────────────
echo "━━━ Step 4: place ResearchTab.tsx and migration ━━━"
mkdir -p client/src/components/investments
cp "$STAGE/ResearchTab.tsx" client/src/components/investments/ResearchTab.tsx
cp "$STAGE/0031_user_watchlists.sql" migrations/0031_user_watchlists.sql

# ─── Step 5: copy merged versions of 4 modified files ────────────────────
echo "━━━ Step 5: copy merged files over their post-pull originals ━━━"
cp "$STAGE/schema.ts"         shared/schema.ts
cp "$STAGE/alpha-vantage.ts"  server/alpha-vantage.ts
cp "$STAGE/routes.ts"         server/routes.ts
cp "$STAGE/investments.tsx"   client/src/pages/investments.tsx

# ─── Step 6: restore ENGINE_MIGRATION_PLAN.md Part 6 addendum ────────────
echo "━━━ Step 6: restore ENGINE_MIGRATION_PLAN.md ━━━"
cp "$STAGE/ENGINE_MIGRATION_PLAN.md" ENGINE_MIGRATION_PLAN.md

# ─── Step 7: type-check ──────────────────────────────────────────────────
echo "━━━ Step 7: type-check (npm run check) ━━━"
if ! npm run check 2>&1 | tail -30; then
  echo
  echo "ERROR: type-check failed. Stopping before any commits."
  echo "Your merged files are in place; fix TS errors then re-run commits manually."
  exit 1
fi

# ─── Step 8: commit in 3 logical chunks ──────────────────────────────────
echo "━━━ Step 8: commit in 3 chunks ━━━"

# Chunk 1: migration + schema (DB layer)
git add migrations/0031_user_watchlists.sql shared/schema.ts
git commit -m "feat(db): add user_watchlists table for investor research tab

Adds a per-user stock watchlist persisted in Postgres. Backs the
watchlist chips in the new Research tab (see follow-up commits).

- migrations/0031_user_watchlists.sql: table + unique (user_id, symbol) idx
- shared/schema.ts: pgTable def + insertSchema + types"

# Chunk 2: alpha-vantage additions + research API routes
git add server/alpha-vantage.ts server/routes.ts
git commit -m "feat(api): /api/investments/research/* routes (search, quote, overview, timeseries, news, earnings, AI)

Adds 10 endpoints backing the Research tab. All behind requireAuth;
AI endpoint also uses sensitiveApiRateLimiter and routes through
ai-router.ts (taskSlot=planning_advisor). Every AI answer gets a
'not financial advice' disclaimer appended server-side.

- server/alpha-vantage.ts: searchSymbols, getDailyTimeSeries, getEarnings
  (coexists with getHistoricalPrices added earlier today)
- server/routes.ts: /api/investments/research/{search,quote/:sym,
  overview/:sym,timeseries/:sym,news/:sym,earnings/:sym,
  portfolio-position/:sym,ai-query,watchlist[GET/POST/DELETE]}"

# Chunk 3: ResearchTab component + wire into investments page + audit doc
git add client/src/components/investments/ResearchTab.tsx \
        client/src/pages/investments.tsx \
        ENGINE_MIGRATION_PLAN.md
git commit -m "feat(investments): full Research tab UI + wire into investments page

Replaces the earlier lite StockResearchPanel with a comprehensive
ResearchTab component that covers Monarch-parity research: symbol
search dropdown (Cmd+K), quote+chart card (7 timeframes), Key
Fundamentals, Ask BudgetSmart AI with disclaimer, News & Sentiment,
Earnings BarChart, portfolio position, watchlist chips with DB
persistence. Keeps the StockPriceChart + clickable-holdings feature
from d3c2063.

All styling via hsl(var(--primary)) etc. so it themes correctly
across all 5 theme variants.

Also updates ENGINE_MIGRATION_PLAN.md with Part 6 (UAT-6 audit):
confirms all 6 original violations fixed, catalogs 3 new minor
violations (other-expenses, split-expenses, tax-smart) as Phase 2,
documents borderline cases and 15+ false positives. UAT-6
recommendation: GO."

# ─── Step 9: push ────────────────────────────────────────────────────────
echo "━━━ Step 9: push to origin/main ━━━"
git push origin main

echo
echo "✅ Done. Railway should auto-deploy main momentarily."
echo "   Watch the deployment at:"
echo "   https://railway.app/project/<your-project>/service/<your-service>/deployments"
echo
echo "   You can also tail locally:  railway logs --service=<service-name>"
