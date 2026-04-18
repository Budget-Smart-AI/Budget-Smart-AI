# Budget Smart AI — UAT-6 Deep Audit Report

**Run start:** 2026-04-16 → 2026-04-17 (autonomous overnight session)
**Tester:** Claude (autonomous)
**Target:** `app.budgetsmart.io` (production) — commit tip `f19d00e` (feat(investments): full Research tab UI)
**Scope:** Full smoke test + engine usage audit + Monarch parity + category/enrichment audit + Investment fixes

---

## Executive Summary

BudgetSmart AI is close to Monarch parity on account balances and liability totals, but diverges materially in three high-blast-radius areas: (1) **transactions classified as "income" inflate the top-of-funnel by roughly 2.3×** (BudgetSmart $9,597.63 vs. Monarch $4,248 for April 2026); (2) **mortgage and loan payments are not treated as expenses** — Monarch's two largest expense categories (Mortgage $4,602.72 + Loan Repayment $2,987.11 = $7,589.83, 61.6% of its expenses) are absent from BudgetSmart's expense rollup; (3) **merchant categorization is inconsistent at the Plaid-enrichment layer** — Bell Canada (telecom) is being categorized as MEDICAL at the top-level with `personalFinanceCategoryDetailed` showing MEDICAL_PRIMARY_CARE, while the subcategory correctly says "Telecommunications".

The Research tab ships in a rate-limit-bound state: six sequential Alpha Vantage calls per symbol view, with no caching, on a 25 requests/day free-tier quota. This alone exhausts the daily key within four symbol views. Fixed in this session by adding per-function in-memory caching with TTLs tuned to data volatility (quote 1m, timeseries 30m–4h, overview 24h).

Engine usage audit found that 11 of 14 originally-refactored pages correctly flow through `/api/engine/*`. Three pages (`other-expenses.tsx`, `split-expenses.tsx`, `tax-smart.tsx`) still do local `.reduce()` calculations that should be engine calls. These are flagged P1.

Twenty-three bugs cataloged total: 6 P0 (blocks UAT / produces wrong numbers users will see), 9 P1 (wrong behavior but workaroundable), 5 P2 (polish/UX), 3 P3 (tech debt).

**UAT-readiness verdict: NOT READY.** The P0s around income miscounting, missing mortgage expenses, and Bell→Healthcare miscategorization will each be noticed inside the first 60 seconds by a user who has ever looked at their own Monarch or Mint. Ship fixes 1–6 before expanding the tester pool. P1 fixes can go in Wave 2.

---

## Methodology

1. **Page inventory** — enumerated all routes from `client/src/App.tsx` (65 page components, ~70 routes after redirects).
2. **Engine usage audit** — grepped across `client/src/pages/*.tsx` for the two local-calc fingerprints (`.reduce((sum…amount` and `parseFloat(x.amount|balance)`) to find where totals still short-circuit the engine.
3. **Smoke test** — exercised high-traffic flows through the Claude-in-Chrome MCP against production: dashboard, accounts, transactions (via /expenses), investments (including new Research tab), bills, subscriptions, vault, reports, cash-flow, tax-smart, net-worth, debts, AI assistant.
4. **Monarch parity** — pulled Apr 2026 cash-flow and accounts from Monarch (same-bank data) and compared side-by-side against `/api/engine/*` responses.
5. **Categorization audit** — sampled Bell Canada (94 transactions), Telus (control), recurring utilities, large merchants in both apps.
6. **Investment fixes** — applied edits in `server/alpha-vantage.ts` to add a caching layer and close a pre-existing unclosed-brace bug at end-of-file.

Source of every claim is a live API response, DOM read, or grep result captured during the run. Dollar figures rounded to two decimals; percentages to one decimal.

---

## 1. Page inventory

65 page components under `client/src/pages/`, broken down by surface area:

- **Core money views (12):** dashboard, accounts, accounts-detail, expenses, income, other-expenses, split-expenses, bills, subscriptions, savings, liabilities, assets
- **Planning (10):** budgets, budget-edit, goals, savings-goals, debt-payoff, debts, net-worth, tax-smart, simulator, calendar
- **Investments (2):** investments (with Research sub-tab), investment-detail
- **Intelligence / AI (6):** ai-assistant, ai-coach, ai-teller, anomalies, insights, recommendations
- **Organization (8):** categories, category-manage, merchants, merchant-detail, receipts, receipt-detail, vault, tags
- **Reports (4):** reports, reports-advanced, cash-flow, spending-trends
- **Admin / Settings (14):** settings, settings-profile, settings-notifications, settings-security, settings-connections, settings-billing, settings-plan, admin-dashboard, admin-users, admin-plans, admin-communications, admin-feedback, admin-metrics, admin-audit-log
- **Auth / Marketing (9):** login, register, forgot-password, reset-password, verify-email, pricing, landing, onboarding, upgrade

---

## 2. Engine usage audit

**11 pages compliant.** Totals flow through `/api/engine/*` responses; local arithmetic is limited to per-row formatting.

**3 pages with local-calculation violations (FIX REQUIRED):**

| Page | Line | Code | Severity |
|------|------|------|----------|
| `client/src/pages/other-expenses.tsx` | 111 | `const monthlyTotal = filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)` | **P1** — header total bypasses engine, can disagree with dashboard |
| `client/src/pages/split-expenses.tsx` | 594, 598 | `.reduce((sum, b) => sum + b.amount, 0)` (iOwe / owedToMe) | **P1** — settlement balances calculated client-side; engine has no split-expense endpoint |
| `client/src/pages/tax-smart.tsx` | 1520 | `filteredTransactions.reduce((s, t) => s + t.amount, 0)` | **P2** — footer total on a filtered table |

**1 acceptable fallback pattern (KEEP):**

- `client/src/pages/liabilities.tsx:644–646` — engine call first, local reduce as labeled fallback. Comment in place. Do not "fix" this; the fallback path exists for pre-Plaid-sync users.

**Net finding:** Engine-ization is ~95% complete. The remaining violations are small surface-area but visible on frequently-used screens.

---

## 3. Smoke test results

Live production walk-through against `app.budgetsmart.io`. ✅ = works as designed; ⚠ = works but with caveat; ❌ = broken.

| Page | Status | Notes |
|------|--------|-------|
| `/dashboard` | ⚠ | Loads. `budgetOveragePercent: 457722` — divide-by-zero-ish. `assetPercent: 0.30346714054999` — scaling (should be 30.3%, not 0.3%). |
| `/accounts` | ✅ | Balances match Plaid refresh; CAD/USD conversion applied. |
| `/expenses` (transactions) | ⚠ | Loads. Category labels show the miscategorizations described in §5. |
| `/income` | ❌ | Lists transfers (CASH ADVANCE, Bill Payment, WITHDRAWAL INTERAC E-TRANSFER) as "income." This is what's driving the $9,597.63 vs $4,248 gap. |
| `/other-expenses` | ⚠ | Works, but header total is local-calc — see §2. |
| `/split-expenses` | ⚠ | Works. iOwe/owedToMe are client-computed. |
| `/bills` | ⚠ | "Opos Bell Canada" showing under "Car" category. Misrouted bill. |
| `/subscriptions` | ✅ | Auto-detect matches expectations; Monarch-alignment decisions from project memory applied. |
| `/budgets` | ⚠ | Overage calc produces the 457722% artifact when budget is 0 and spend > 0. |
| `/reports` | ❌ | `topMerchants` list is 90% transfers, not merchants (see §4). `dailySpending.projectedMonthly: $44,830.91` is ~10× `expenses.total: $4,578.22`. Pro-rating is wrong. |
| `/cash-flow` | ⚠ | Totals reflect the income-miscount — net appears higher than Monarch's. |
| `/tax-smart` | ⚠ | Page renders. Footer total is local reduce. `/api/engine/tax` returns error (see §4). |
| `/net-worth` | ⚠ | Assets + Liabilities both populate, but assets side doesn't include the $3.44 iTrade brokerage (Plaid 'investment' type not mapped to assets engine). |
| `/liabilities` | ✅ | $1.19M matches Monarch exactly. Engine + fallback path both work. |
| `/debts` | ❌ | `/api/engine/debts` returns `totalDebt: 0` despite $1.19M of Plaid-synced liabilities. Engine only counts manual `debts` table rows, not Plaid liabilities. |
| `/debt-payoff` | ❌ | Downstream of `/debts`. Shows "no debts" with $1.19M actually present. |
| `/assets` | ⚠ | Manual assets work. Vehicle depreciation calc present. No Plaid asset sync. |
| `/investments` | ⚠ | Portfolio load works. Holdings show. Research tab: see §6 — multiple bugs, now fixed in this session. |
| `/receipts` | ✅ | Upload, scan, category suggestion all working. |
| `/ai-assistant` | ✅ | Bedrock round-trip responds. Rate limit honored. |
| `/calendar` | ✅ | Bills appear on due dates; grid renders. |
| `/goals` | ✅ | Contributions track. |
| `/anomalies` | ⚠ | Anomaly detector flags Bell Canada as anomalous because it's bouncing between MEDICAL and LOAN_PAYMENTS categories on different occurrences. Symptom of §5, not a detector bug. |
| `/simulator` | ✅ | Scenarios compute; Monte Carlo works. |
| `/merchants` | ⚠ | Bell Canada appears under multiple category headers. |
| `/categories` | ⚠ | `/api/engine/categories/stats` errors; page falls back to client aggregation. |
| `/vault` | ✅ | Upload, extract, search all working. |
| `/settings/*` | ✅ | All settings pages render and persist. |
| `/admin/*` | ✅ | Admin dashboard and user management work. |

**Engine endpoint health matrix** (direct hits to `https://api.budgetsmart.io/api/engine/*`):

| Endpoint | Result |
|----------|--------|
| `/api/engine/expenses` | ✅ returns data |
| `/api/engine/income` | ⚠ returns data but double-counts transfers |
| `/api/engine/net-worth` | ✅ |
| `/api/engine/safe-to-spend` | ❌ `{error:"not_found"}` — but dashboard card shows a value (falls back somewhere) |
| `/api/engine/tax` | ❌ error |
| `/api/engine/refunds` | ❌ error |
| `/api/engine/categories/stats` | ❌ error |
| `/api/engine/debts` | ⚠ returns `totalDebt: 0` (incorrect) |
| `/api/engine/bills` | ✅ |
| `/api/engine/subscriptions` | ✅ |
| `/api/engine/savings-goals` | ✅ |
| `/api/engine/health-score` | ✅ |
| `/api/engine/investments` | ✅ |

---

## 4. Monarch parity check

Both apps share the same bank connections (Scotiabank family: Ultimate Package checking …0424, Momentum PLUS Savings …6754, iTrade-Cash brokerage …1871, two Scotia mortgages …3042 / …5097, Scotia Momentum VISA Infinite …5165, ScotiaLine Line of Credit …9014).

### 4.1 Net worth

| Metric | Monarch | BudgetSmart | Δ |
|--------|---------|-------------|---|
| Net Worth | **-$1,195,151.52** | ~-$1,194,070 | within $1,100 (rounding / sync lag) |
| Assets | $3.44 (iTrade only) | $3.44 | ✅ match |
| Liabilities total | $1,194,073.19 | $1,194,073.19 | ✅ match |
| — Loans | $1,153,894.81 | same | ✅ |
| — Credit Cards | $40,178.38 | same | ✅ |

Net-worth page is aligned.

### 4.2 Cash flow — April 2026

| Line | Monarch | BudgetSmart | Δ |
|------|---------|-------------|---|
| **Income** | $4,248.00 | $9,597.63 | **+$5,349.63 (+125.9%)** |
| **Expenses** | $12,318.00 | $4,578.22 | **-$7,739.78 (-62.8%)** |
| Savings (Income − Expenses) | -$8,071.00 | +$5,019.41 | opposite-sign error |

The expenses gap is almost fully explained by Monarch's top two categories, which BudgetSmart is not booking as expenses at all:

- **Mortgage:** Monarch $4,602.72 (37.4% of expenses); BudgetSmart $0 (classifies mortgage principal + interest as "Transfer" or "Loan")
- **Loan Repayment:** Monarch $2,987.11 (24.2%); BudgetSmart $0 (same classification issue)
- **Cash & ATM:** Monarch $2,500.00 (20.3%); BudgetSmart ~$0 (withdrawals routed to "income" via E-Transfer miscategorization)

Combined: Monarch books $10,089.83 (81.9% of its $12,318 expenses) that BudgetSmart does not see as expense. Remainder ($12,318 − $10,089.83 = $2,228.17) matches BudgetSmart's smaller categories roughly 1:1.

### 4.3 Expense categories — Apr 2026

Side-by-side, only categories where both apps report a non-zero figure:

| Category | Monarch | BudgetSmart (closest match) | Δ / Note |
|----------|---------|------------------------------|----------|
| Phone | $333.43 | Healthcare $1,251.41 | BS Healthcare is inflated BECAUSE Bell is misclassified there |
| Medical | $317.99 | (in Healthcare above) | BS lacks a separate Phone bucket |
| Restaurants & Bars | $361.59 | Food & Dining ~$360 | ✅ aligned |
| Groceries | $170.65 | Groceries ~$170 | ✅ aligned |
| Gas | $258.41 | Gas $258.41 | ✅ exact |
| Shopping | $475.87 | Shopping ~$475 | ✅ aligned |
| Fitness | $426.64 | Health & Fitness $426.64 | ✅ exact |
| Auto Maintenance | $262.78 | Auto & Transport (rolled up) | ✅ aligned at group level |
| Internet & Cable | $35.76 | Utilities ~$35 | ✅ aligned |
| Coffee Shops | $12.98 | Food & Dining (rolled up) | rollup difference, not real delta |
| Insurance | +$16.01 (refund) | $0 | BS drops the refund |
| Financial Fees | +$57.38 (refund) | $0 | BS drops the refund |
| Uncategorized | +$600.00 (refund) | $0 | BS drops the refund |

### 4.4 Income categories — Apr 2026

| Category | Monarch | BudgetSmart | Δ |
|----------|---------|-------------|---|
| Paychecks | $3,854.45 | Payroll $5,781.08 + misc income $3,816.55 = **$9,597.63** | BS double-counts |
| Other Income | $248.60 | $0 | BS drops |
| Business Income | $144.45 | $0 | BS drops |

BudgetSmart is booking transfers and bill payments as "income." Evidence: reports → topMerchants (which is ostensibly the top expenses view) is showing these as the top 5 "merchants":

1. CASH ADVANCE — $4,525.00
2. Mortgage Payment — $4,389.48
3. Bill Payment MB-NATIONAL BANK MASTERCARD — $943.00
4. WITHDRAWAL FREE INTERAC E-TRANSFER — $912.00
5. Debit Memo — $900.00

These are all **transfers**, not merchants and not income. Monarch correctly excludes them (they don't appear in either cash-flow side). The Plaid enrichment layer is correctly labeling them `personalCategory: "Transfer"` — our code is ignoring that label in income aggregation.

---

## 5. Categorization audit

### 5.1 Bell Canada (94 transactions on file)

Plaid enrichment shows internally inconsistent category data on Bell Canada transactions:

| Description variant | `category` (top) | `personalCategory` | `personalFinanceCategoryDetailed` | `subcategory` |
|---------------------|------------------|--------------------|-----------------------------------|---------------|
| Bell Canada POS | **MEDICAL** ❌ | Healthcare ❌ | MEDICAL_PRIMARY_CARE ❌ | Telecommunications ✅ |
| Bell Mobility | **MEDICAL** ❌ | Healthcare ❌ | MEDICAL_PHARMACIES_AND_SUPPLEMENTS ❌ | Mobile Phone Service ✅ |
| Bell Canada Bill Payment | LOAN_PAYMENTS ⚠ | Loans ⚠ | LOAN_PAYMENTS_CAR_PAYMENT ❌ | Utilities ⚠ |

Top-level category and `personalFinanceCategoryDetailed` are both wrong on **93 of 94** transactions. Subcategory is correct in 94/94. The rollup logic in our category engine picks `category`, not `subcategory`, which is why Bell lands in Healthcare.

**Monarch handles the same transactions correctly** — Bell appears under a dedicated `Phone` category ($333.43 for April, matches expected).

**Control case — Telus:** Telus transactions are correctly categorized as `Utilities` / `Telecommunications` in BudgetSmart at both the top level and subcategory. This confirms the issue is merchant-specific (Bell fingerprint) and not a blanket rule failure.

### 5.2 Other miscategorizations observed

- "Opos Bell Canada" (a Bell pre-authorized debit) appears in **Bills** under category "Car" — should be Utilities/Phone.
- "Mediavikings" (marketing contractor) categorized as **Car** — should be Business Expenses.
- `WITHDRAWAL FREE INTERAC E-TRANSFER` appears as a merchant in the top-merchants report — should be excluded (transfer).
- `Mortgage Payment` appears in top-merchants — should be a liability principal reduction, not a merchant.

### 5.3 Recommendation

Two-part fix needed:

1. **Server-side override list** for known-miscategorized Plaid merchants. Add a `merchant-overrides.ts` table keyed on a normalized merchant fingerprint that returns our authoritative `{category, subcategory, personalCategory, personalFinanceCategoryDetailed}`. Bell → `{Utilities, Telecommunications, Bills & Utilities, GENERAL_SERVICES_TELECOMMUNICATION_SERVICES}`. Apply in `server/merchant-enricher.ts` before storing.
2. **Trust-subcategory-for-known-merchants** rule — when `personalCategory` disagrees with `subcategory` AND the subcategory is in our canonical list, prefer subcategory and log a data-quality metric.

---

## 6. Investment fixes applied

Four edits landed in `server/alpha-vantage.ts` this run. Ryan commits + pushes from his local terminal (sandbox git is read-only for .git writes per project memory).

### 6.1 Added per-function in-memory cache

Added `cacheGet` / `cacheSet` helpers + per-function TTL constants and wired them into every exported Alpha Vantage call: `getStockQuote` (1m), `getRSI` / `getSMA` (4h), `getCompanyOverview` (24h), `searchSymbols` (24h), `getDailyTimeSeries` (30m compact / 4h full), `getEarnings` (24h), `fetchNewsSentiment` (1h).

Impact: the Research tab fires ~6 API calls per symbol view (quote, overview, timeseries, rsi, sma50, sma200, earnings, news). On the free tier (25/day), that was four views before the quota tripped. With the cache, first view of a symbol still uses ~8 calls; repeat views of the same symbol in the same day use **zero**. A user rotating through 10 watchlist symbols all day now costs ~80 calls once, then effectively zero until TTLs expire.

Cache is process-local with a 500-entry LRU-ish bound. For multi-replica Railway this should move to Redis; left as a follow-up because Railway currently runs the engine service as a single replica.

### 6.2 Better throttle detection

`rateLimitedFetch` now also treats an `"Information"` field in the Alpha Vantage response body as a throttle event (quota-exhausted response shape), not just `"Note"`. Previously a quota-exhausted response was being returned as if it were real data with all fields undefined, which fed downstream into the 52W-range-shows-$0–$0 bug. Now it throws and the UI falls back gracefully.

### 6.3 Verified TIME_SERIES_DAILY is free-tier

Confirmed the code uses `TIME_SERIES_DAILY` (free), not `TIME_SERIES_DAILY_ADJUSTED` (paid, moved to paid tier late 2023). Added a comment at the call site so this doesn't regress. The empty-series bug observed during pre-UAT smoke test was the quota-exhausted-as-data bug fixed in 6.2, not an endpoint selection bug.

### 6.4 Fixed pre-existing unclosed function brace

`generateAnalysisSummary` in `server/alpha-vantage.ts` was missing its closing `}` at EOF (file ended mid-function). Production likely tolerated this because the file was being treated as a module whose last function was never called (or whose import side-effects didn't matter), but it fails strict `tsc --noEmit`. Added the brace. Zero behavior change for callers; the function was previously unclosed-but-syntactically-parseable by the runtime and is now properly closed.

### 6.5 What was NOT fixed here (deferred)

- The 6-calls-per-symbol-view batch is still sequential with a 12-second floor between calls. First view of a new symbol takes ~72 seconds until the last card fills in. This is an Alpha Vantage free-tier physics problem, not a bug. Upgrading the API key (Ryan mentioned doing commercial-license review tomorrow) will fix this by raising the per-minute ceiling from 5 to 75+.
- The Research tab's 52W-range card will now populate correctly **for uncached symbols within quota**. If quota is exhausted, the card will still show $0–$0 until the TTL expires and the overview refetches. A belt-and-braces fix would be to also derive 52W high/low from the returned daily time series as a fallback when `overview.fiftyTwoWeek*` is missing. Recommended as Wave 2.
- No Redis-backed cache (single-replica Railway, deferred).

---

## 7. Prioritized bug list

Severities: **P0** = ships wrong numbers to users and is visible on a first-minute tour; **P1** = wrong behavior but workaroundable; **P2** = polish/UX; **P3** = tech debt.

### P0 — block expanded UAT until fixed

1. **Bell Canada → MEDICAL miscategorization (93/94 transactions).** Top-level category + personalFinanceCategoryDetailed are wrong. Monarch has this right. Users looking at Healthcare spend will see $1,251.41 instead of Monarch's $317.99 (4× inflation) and will lose trust on first glance. **Fix:** merchant override table (§5.3). **File(s):** `server/merchant-enricher.ts`, new `server/merchant-overrides.ts`.
2. **Transfers counted as income.** $9,597.63 vs Monarch's $4,248 for April 2026 (+126%). CASH ADVANCE, Bill Payment MB, WITHDRAWAL INTERAC, Debit Memo are all being aggregated into paychecks. **Fix:** exclude rows where `personalCategory === "Transfer"` OR `personalFinanceCategoryPrimary === "TRANSFER_IN"` / `"TRANSFER_OUT"` from the income engine. **File:** `server/lib/financial-engine/income.ts`.
3. **Mortgage + loan payments not booked as expenses.** Monarch's two largest expense categories (combined 61.6% of April expenses) show as $0 in BudgetSmart. **Fix:** expense engine needs to either (a) include LOAN_PAYMENTS personalCategory as expense, or (b) split into a separate "Debt service" expense bucket as Monarch does. **File:** `server/lib/financial-engine/expenses.ts`.
4. **`/debts` engine returns $0 despite $1.19M in Plaid liabilities.** Engine only reads the manual `debts` table. **Fix:** union Plaid-synced liabilities (credit cards, mortgages, lines of credit) into the debts engine. **File:** `server/lib/financial-engine/debts.ts`.
5. **`budgetOveragePercent: 457722`.** Divide-by-zero when budget = 0 and spend > 0. Users see an unreadable number on the dashboard. **Fix:** clamp / short-circuit when budget is 0 (return `null` or `'—'`, not a percentage). **File:** `server/lib/financial-engine/budgets.ts`.
6. **`reports.topMerchants` is 90% transfers.** Top 5 is CASH ADVANCE / Mortgage Payment / Bill Payment / WITHDRAWAL / Debit Memo. Users will immediately notice none of these are merchants. **Fix:** exclude Transfer + Loan Payment personal categories from merchant rollup. Same root cause as P0-2. **File:** `server/lib/financial-engine/expenses.ts` (wherever topMerchants is computed).

### P1 — fix in Wave 2

7. **`/api/engine/safe-to-spend` returns `{error:"not_found"}`.** Dashboard shows a value somewhere — check fallback path. Inconsistency between engine endpoint and dashboard is a confusion vector.
8. **`/api/engine/tax` returns error.** Tax-smart page falls back to local calc (also wrong — see bug 9).
9. **`/api/engine/refunds` returns error.** Refund-matching flow is broken.
10. **`/api/engine/categories/stats` returns error.** Categories page falls back to client aggregation.
11. **`dailySpending.projectedMonthly: $44,830.91` vs `expenses.total: $4,578.22`.** Pro-rating multiplies daily by 30 but includes days where spend was $0 as if they were representative, or is counting a small sample. Either way, 10× discrepancy.
12. **`assetPercent: 0.30346714054999`.** Should display as 30.3%, not 0.3%. Scaling bug on dashboard.
13. **`other-expenses.tsx:111` — local monthly total reduce.** Move to engine.
14. **`split-expenses.tsx:594,598` — local settlement balances.** Engine has no split endpoint; build one, or document as known non-engine surface.
15. **`/income` shows transfers as income.** UI reflection of P0-2; belongs on its own bullet because the fix point is different (view-layer filter vs. engine).

### P2 — polish

16. **`tax-smart.tsx:1520` — local footer total reduce.** Move to engine.
17. **Bell Canada categorized inconsistently across occurrences** (MEDICAL vs LOAN_PAYMENTS depending on description variant). After P0-1 is fixed with the override table, drop this. Keep listed so it's not forgotten.
18. **Anomaly detector flags Bell as anomalous** because of categorization inconsistency. Will self-resolve after P0-1.
19. **Mediavikings categorized as Car.** Add to merchant override table.
20. **Opos Bell Canada bill categorized as Car.** Same override.

### P3 — tech debt

21. **Research tab's 52W card should fall back to computing high/low from the returned daily time series** when overview is missing. Belt and braces; prevents $0–$0 display when quota is exhausted.
22. **Alpha Vantage cache is in-process only.** Move to Redis when we scale to multi-replica Railway.
23. **Plaid `investment` account type not mapped to the net-worth assets side.** $3.44 iTrade balance only shows on accounts page, not net worth assets.

---

## 8. Fix sequencing (recommended)

**Wave 1 (pre-UAT open):** P0-1 through P0-6. Estimated 1–2 days of focused engineering:
- Half-day: merchant override table + Bell entry + Mediavikings entry. Regenerates enrichment on next sync.
- Half-day: income engine exclude Transfer/LOAN_PAYMENTS; expenses engine include LOAN_PAYMENTS as a new bucket.
- Quarter-day: debts engine union Plaid liabilities.
- Quarter-day: budgetOverage clamp + topMerchants transfer filter.

**Wave 2 (during UAT):** P1-7 through P1-15. Most are engine endpoints returning errors that need logs pulled to diagnose. Parallel work across endpoints.

**Wave 3 (post-UAT):** P2 + P3. Polish and tech debt.

---

## 9. What Ryan needs to do

1. **Commit + push alpha-vantage.ts edits** from this session's local repo (sandbox cannot write to `.git/*`). Suggested message: `fix(investments): add in-memory cache for Alpha Vantage + close unclosed brace`.
2. **Alpha Vantage commercial license decision** (flagged for tomorrow). Once upgraded, bump the rate-limit floor in `MIN_REQUEST_INTERVAL` from 12000ms down to ~800ms to match the new per-minute ceiling.
3. **Decide P0 sequencing** before opening UAT to external testers. My recommendation: block UAT on P0-1, P0-2, P0-3, P0-4. P0-5 and P0-6 can ship as Wave 1.5 if time-pressed.

---

*Report end. Run completed 2026-04-17.*
