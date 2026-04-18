# Research Tab Merge — Instructions

## What happened

Two Claude sessions worked on the Research tab in parallel today:

- **The other session** (Opus 4.6) shipped a lite version in commits `d3c2063`, `3728a38`, `64e3bfa` — pushed to `origin/main` while I was working.
- **This session** (me) built a richer version locally: `ResearchTab.tsx` (40KB component), `/api/investments/research/*` routes, `user_watchlists` table + DB persistence, `searchSymbols` / `getDailyTimeSeries` / `getEarnings` Alpha Vantage helpers, and the 371-line Part 6 addendum to `ENGINE_MIGRATION_PLAN.md`.

When I went to push, I discovered the collision. Per your approval of option 3, I've prepared a surgical merge that keeps **both** sets of work.

## What you'll get in the merged state

From the other session (kept as-is):
- `StockPriceChart` inline component — clickable holdings rows show a price chart
- `GET /api/stocks/:symbol/history` — historical price data for the chart
- `getHistoricalPrices()` helper in `server/alpha-vantage.ts`

From my work (newly added):
- `client/src/components/investments/ResearchTab.tsx` — full-featured Research tab (symbol search with Cmd+K, quote+chart card with 7 timeframes, Key Fundamentals, Ask BudgetSmart AI, News & Sentiment, Earnings chart, portfolio position, watchlist chips with DB persistence)
- `migrations/0031_user_watchlists.sql` + matching Drizzle schema
- 10 endpoints under `/api/investments/research/*`
- `searchSymbols` / `getDailyTimeSeries` / `getEarnings` helpers
- Part 6 addendum in `ENGINE_MIGRATION_PLAN.md` (UAT-6 audit, recommend GO)

What got replaced:
- The other session's inline `StockResearchPanel` function (lite version, ~128 lines) — replaced by my richer `ResearchTab` component

## Why you need to run this locally

The Cowork sandbox filesystem (virtiofs over Windows) blocks `unlink()` on `.git/*` files, so git's lock-file mechanism fails. I cannot `git pull`, `git commit`, or `git push` from the sandbox. Everything is staged in `.research-tab-merge/` for you to apply from your local terminal.

## How to apply

From PowerShell, Git Bash, or WSL inside your repo root:

```bash
cd "C:\Users\Claude\Documents\Budget-Smart-AI"
bash .research-tab-merge/APPLY-MERGE-AND-PUSH.sh
```

The script does:
1. `git fetch origin main`
2. Saves your in-tree `ResearchTab.tsx` + migration to `/tmp/bsai-pre-merge-*/`
3. `git reset --hard origin/main` (discards dirty state — safe; you have backups)
4. Restores `ResearchTab.tsx` and the migration
5. Copies 4 pre-merged files into place (`shared/schema.ts`, `server/alpha-vantage.ts`, `server/routes.ts`, `client/src/pages/investments.tsx`)
6. Restores `ENGINE_MIGRATION_PLAN.md` (Part 6 addendum)
7. Runs `npm run check` — aborts if TS errors
8. Creates 3 commits (DB / API / UI)
9. `git push origin main`

If step 7 (type-check) fails, it stops before any commits. Your merged files are in place; you can fix errors and commit manually.

## Safety

Your work is triple-backed-up:
- `.research-tab-merge/` — all 7 merged files (committed/tracked or copied out)
- `/tmp/bsai-pre-merge-*/` — snapshot taken by the script before `git reset --hard`
- `/tmp/bsai-merge-backup/` — my original extracts + both `.mine` and `.origin` versions for each file (inside the Cowork session only — don't rely on this long-term)

## After push: Railway monitoring

Pick one of:

**Option A — Railway CLI (fastest if you have it installed)**
```bash
railway logs --service=<engine-service-name>
# or for the web service:
railway status
```

**Option B — Railway dashboard via Chrome**
Open `https://railway.app` in your browser. I can drive the tabs from here via the Claude-in-Chrome MCP if you'd like — just say "open Railway dashboard" and grant Chrome access.

**Option C — MCP registry**
If there's a Railway MCP we haven't installed, I can search for it and suggest it.

Say which you'd prefer and I'll set it up. Target services to watch:
- `api.budgetsmart.io` (engine) — should pick up nothing from this push (no `server/lib/financial-engine/*` changes)
- `app.budgetsmart.ai` (web) — should auto-deploy these 3 commits

## Files in `.research-tab-merge/`

| File | Purpose |
|------|---------|
| `APPLY-MERGE-AND-PUSH.sh` | The merge script (run this) |
| `MERGE-INSTRUCTIONS.md` | This file |
| `ResearchTab.tsx` | New 40KB component — goes to `client/src/components/investments/` |
| `0031_user_watchlists.sql` | New migration — goes to `migrations/` |
| `schema.ts` | Merged — origin/main + `userWatchlists` table |
| `alpha-vantage.ts` | Merged — origin/main + `searchSymbols`/`getDailyTimeSeries`/`getEarnings` |
| `routes.ts` | Merged — origin/main + `/api/investments/research/*` + `routeAI` import + extended schema import |
| `investments.tsx` | Merged — origin/main minus inline `StockResearchPanel` + `import ResearchTab` + `<ResearchTab />` in the research `TabsContent` |
| `ENGINE_MIGRATION_PLAN.md` | My version with the 371-line Part 6 UAT-6 audit addendum |

## Verification checklist (after push)

- [ ] `git log --oneline -5` shows my 3 new commits on top of `a27256c` (the current origin tip)
- [ ] Railway build succeeds (both engine and web services)
- [ ] `https://app.budgetsmart.ai/investments` → click Research tab → search works, quote loads, chart renders
- [ ] Click a holding row → `StockPriceChart` still pops (the other session's feature)
- [ ] Run `/api/engine/*` smoke-test for UAT-6 sanity
