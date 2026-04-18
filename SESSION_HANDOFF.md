# Budget Smart AI — Session Handoff (April 16, 2026)

## What Was Completed This Session

### Task 1: Vault AI Q&A Conversation Display Bug (DONE)
- **Commit:** `fix: vault AI Q&A conversations now display after asking + quick actions auto-submit`
- **Problem:** AI conversations in the Vault page weren't rendering after the user submitted a question.
- **Fix:** Fixed the display logic so Q&A conversations appear immediately after submission, and quick action buttons auto-submit.

### Task 2: Tax Analyst (TaxSmart AI) Page — 100% Complete (DONE)

Two commits shipped:

**Server-side commit** (deployed ~48 min before session end):
- `feat(tai): add merchant/amount to TaxSuggestion, personalize reason strings`
- **File:** `server/lib/financial-engine/tax.ts`
- Added `merchant: string` and `amount: number` fields to the `TaxSuggestion` interface
- The `suggestTaxDeductible()` function now populates these fields from transaction data
- Personalized reason strings now reference the actual merchant name

**Client-side commit** (deployed at session end):
- `feat(tax): add functional Accept button with merchant/amount display in AI suggestions`
- **File:** `client/src/pages/tax-smart.tsx`
- **3 changes applied:**
  1. Added `merchant: string` and `amount: number` to the `TaxSummaryResponse.suggestions` type (around line 308)
  2. Added `acceptingSuggestion` and `acceptedSuggestions` state variables (around line 398)
  3. Replaced the old rendering block (old lines 1318-1356) with a functional Accept button (new lines 1318-1386) that:
     - Shows merchant name + formatted amount instead of generic "Transaction" text
     - Calls `PATCH /api/expenses/:id` with `taxDeductible: "true"` and `taxCategory` when Accept is clicked
     - Shows loading state ("...") while the PATCH is in flight
     - Shows "✓ Tagged" badge with green styling once accepted
     - Invalidates the tax summary query cache after tagging
     - Has proper error handling with destructive toast on failure

---

## Next Steps — Two Remaining Tasks

### Task A: Investments Page Revamp with Alpha Vantage API

**Goal:** Revamp the entire Investments section to be a real-time, data-rich portfolio tracker powered by the Alpha Vantage API.

**Current state of investment files:**

| File | Lines | Purpose |
|------|-------|---------|
| `client/src/pages/investments.tsx` | 1607 | Client page — manual holdings CRUD, portfolio view, AI advisor chat |
| `server/alpha-vantage.ts` | 352 | Alpha Vantage API wrapper — quotes, RSI, SMA, company overview, news sentiment, batch prices, symbol validation |
| `server/investment-advisor.ts` | 497 | AI portfolio advisor — enriches holdings with live prices, generates AI analysis via Bedrock, advisor chat |
| `server/lib/financial-engine/investments.ts` | 72 | Engine module — basic portfolio totals (totalValue, totalCost, totalGain) |

**Alpha Vantage API details already wired up:**
- Base URL: `https://www.alphavantage.co/query`
- API key env var: `ALPHA_ADVANTAGE_API` (note: typo in env var name — "ADVANTAGE" not "VANTAGE")
- Rate limits: Free tier = 25 requests/day, 5 requests/minute (12s minimum interval enforced in code)
- Functions already implemented in `server/alpha-vantage.ts`:
  - `getStockQuote(symbol)` — GLOBAL_QUOTE endpoint
  - `getRSI(symbol, interval, timePeriod)` — RSI technical indicator
  - `getSMA(symbol, interval, timePeriod)` — SMA technical indicator
  - `getCompanyOverview(symbol)` — fundamental data (52wk high/low, market cap, PE ratio, dividend yield, sector, etc.)
  - `getStockAnalysis(symbol)` — combines quote + RSI + SMA into one object
  - `batchUpdatePrices(symbols)` — sequential price refresh for all symbols
  - `validateSymbol(symbol)` — checks if a ticker is valid
  - `fetchNewsSentiment(symbol, limit)` — NEWS_SENTIMENT endpoint (title, summary, url, source, sentiment score/label, published date)
  - `generateAnalysisSummary(analysis)` — formats analysis into readable text

**Investment API endpoints in `server/routes.ts`:**
- `GET /api/investment-accounts` — list all accounts
- `GET /api/investment-accounts/linkable-plaid-accounts` — Plaid investment accounts available to link
- `GET/POST/PATCH/DELETE /api/investment-accounts/:id` — CRUD
- `GET /api/holdings` — all holdings across accounts
- `GET /api/investment-accounts/:accountId/holdings` — holdings for one account
- `POST/PATCH/DELETE /api/holdings` — CRUD
- `POST /api/holdings/refresh-prices` — batch refresh via Alpha Vantage
- `GET /api/investments/advisor-data` — enriched portfolio + AI analysis
- `POST /api/investments/advisor-chat` — AI advisor conversation
- `POST /api/investments/save-snapshot` — save portfolio snapshot for history
- `GET /api/investments/analysis` — per-holding analysis with quote/RSI/SMA
- `GET /api/holdings/:id/ai-analysis` — AI analysis of a single holding
- `POST /api/investments/ask-advisor` — ask AI about portfolio
- `POST /api/investment-accounts/import-from-plaid` — import Plaid investment accounts
- `GET /api/constants/investment-account-types` — enum values
- `GET /api/constants/holding-types` — enum values

**Investment advisor features** (`server/investment-advisor.ts`):
- `getAdvisorData(userId)` — returns enriched holdings (with live prices, cost basis, gain/loss, 52wk comparisons), portfolio history snapshots, news sentiment, and AI-generated analysis narrative via Bedrock
- `advisorChat(userId, messages)` — conversational AI advisor with full portfolio context
- `savePortfolioSnapshot(userId)` — persists daily portfolio values to `portfolio_snapshots` table
- 30-minute cache on advisor data, 4-hour cache on news per symbol

**Schema types** (from `shared/schema.ts`):
- `INVESTMENT_ACCOUNT_TYPES` — enum of account types (brokerage, 401k, IRA, etc.)
- `HOLDING_TYPES` — enum of holding types (stock, ETF, mutual fund, bond, crypto, etc.)
- `InvestmentAccount` — id, userId, name, accountType, balance, plaidAccountId, etc.
- `Holding` — id, accountId, symbol, shares, avgCostPerShare, currentPrice, holdingType, etc.

**What Ryan likely wants for the revamp:** The page should show real-time portfolio data from Alpha Vantage, with rich visualizations (portfolio allocation, performance charts, individual holding cards with live prices/gains). The AI advisor should give personalized insights. Ask Ryan for specific design direction at the start of the new session.

---

### Task B: Full Page Scan — Verify All Calculations Go Through the Engine

**Goal:** Audit all 65 client pages to ensure NO page performs financial calculations locally. Every number displayed must come from the centralized financial engine at `server/lib/financial-engine/` via `/api/engine/*` endpoints.

**Existing audit:** `ENGINE_MIGRATION_PLAN.md` in the repo root documents 6 known violations found on April 11, 2026:

| # | Page | What it calculates locally | Fix type |
|---|------|---------------------------|----------|
| 1 | `dashboard.tsx` (lines 282-299) | Filters transactions, `.reduce()` for spending by category, sorts top 5 | 🟢 SIMPLE SWAP — engine already returns `expenses.byCategory` and `expenses.topCategories` |
| 2 | `calendar.tsx` (lines 74-75) | Filters events by type, `.reduce()` for monthly bill/income totals | 🟡 ADD FIELDS — compute totals server-side in calendar endpoint |
| 3 | `assets.tsx` (lines 255-264, 345) | Groups assets by category, sums values, computes appreciation | 🟡 NEW ENDPOINT — create `/api/engine/assets` |
| 4 | `reports.tsx` (lines 565-574) | Local calculations in reports | 🟡 Check what's needed |
| 5 | `investments.tsx` (lines 1085, 1386) | Local investment calculations | 🟡 Expand engine `/api/engine/investments` |
| 6 | `liabilities.tsx` (line 638) | Local liability calculation | 🟡 Check what's needed |

**How to do the scan:**
1. For each `.tsx` page in `client/src/pages/`, grep for: `parseFloat`, `.reduce(`, `Math.`, `toFixed`, `* 100`, `/ 100`, `+=`, `-=`, manual percentage calculations
2. Check if the page calls `/api/engine/*` or does its own math on raw data
3. Any page doing local math on financial data = violation
4. Fix: either use an existing engine endpoint or create a new one

**Engine architecture reference:**
- Engine modules: `server/lib/financial-engine/` (18 files including adapters)
- Engine API: `server/routes/engine.ts` — 13 endpoints at `/api/engine/*`
- Engine standalone service: `server/engine/standalone.ts` at `api.budgetsmart.io`
- Client routing: `client/src/lib/queryClient.ts` has `resolveApiUrl()` that rewrites `/api/engine/*` to `https://api.budgetsmart.io` in production

---

## Architecture Overview (for context)

**3 Railway services:**
- `BudgetSmart New Web` → www.budgetsmart.io (marketing site)
- `BudgetSmart Engine` → api.budgetsmart.io (isolated calculation engine)
- `BudgetSmart AI` → app.budgetsmart.io (product UI + all other backend routes)

**Tech stack:** Express + React + Neon (Postgres) + Drizzle ORM + AWS Bedrock (AI) + Plaid/MX (banking) + Alpha Vantage (market data)

**Key files:**
- `server/routes.ts` — main routes file (14000+ lines)
- `server/lib/financial-engine/` — centralized calculation modules
- `server/routes/engine.ts` — engine API endpoints
- `server/ai-router.ts` — AI routing via AWS Bedrock
- `shared/schema.ts` — Drizzle ORM schema
- `client/src/pages/` — 65 client pages
- `client/src/lib/queryClient.ts` — API client with `resolveApiUrl()` for engine routing

**Important docs in repo:**
- `ENGINE_MIGRATION_PLAN.md` — page-by-page violation catalog (6 violations documented)
- `BudgetSmart_FinancialEngine_Blueprint.docx` — original engine design doc
- `MONARCH_VS_BSAI.md` — Monarch alignment plan with 7-step rollout

**Operator decisions (locked in):**
- Emulate Monarch's mature financial logic; differentiate on features they don't have
- Category taxonomy: match Monarch's ~100 categories with multi-provider mapping
- Auto-confirm high-confidence recurring bills (>3 occurrences, <$1 variance)
- Refunds: surface separately as "Refunds & Returns" (do NOT net into spending)
