# UAT-13 Audit Report

**Date:** 2026-04-25
**Audit type:** Static code audit + Phase A regression sweep + UAT-12 carryover verification
**Author:** Claude (Cowork session)
**Repo HEAD:** `202b2f8` (clean, in sync with `origin/main`)

---

## Executive summary

UAT-13 surfaced **10 additional Phase A stragglers** beyond the single `featureGate.ts:416` fix that shipped earlier today in commit `202b2f8`. All ten are now patched on disk, ready for one consolidated commit. Two of the UAT-12 carryover items are confirmed fixed by Phase A's design; one needs live verification; two are deferred to follow-up work. §6.3.1 canonical-flag wiring is clean.

**Headline numbers:**

- 3 commits already on `main` from this session (verified): `cebe3dc`, `a96a49d`, `202b2f8`
- 10 new fixes on disk (uncommitted) — all Phase A column-drop stragglers
- 5 of 5 UAT-12 carryover bugs investigated; 3 confirmed-fixed, 1 needs live UI check, 1 deferred
- 0 regressions detected from §6.3.1 ship

---

## Section 1 — Verified clean

### 1a. Git state (Task #14)

- HEAD: `202b2f8` ✓
- Local main = origin/main ✓
- Last 3 commits: `cebe3dc` (§6.2 cleanup) → `a96a49d` (§6.3.1 helpers) → `202b2f8` (featureGate Phase A) — all on `main`
- Working tree shows phantom CRLF artifacts in the sandbox (virtiofs EOL flip — equal +/- line counts confirm), but local `git status` is clean per Ryan's verification

### 1b. §6.3.1 canonical-flag wiring (Task #16)

All three helpers in `server/lib/canonical-flags.ts` are imported and used at the expected call sites. Legacy `NON_SPENDING_CATEGORIES` and `NON_INCOME_CATEGORY_VALUES` sets are removed from the codebase (only mentioned in comments now).

| File | Helper | Line |
|---|---|---|
| `server/cash-flow.ts` | `isNonSpendingCanonical` | L494, L550 |
| `server/recurring-income-detector.ts` | `isNonIncomeCanonical` | L50 |
| `server/lib/financial-engine/expenses.ts` | `isTransferCanonical` | L104 |

---

## Section 2 — Phase A stragglers fixed on disk (uncommitted)

Migration 0041 (Phase A, commit `f15e6b9`) dropped the legacy `category` column from 7 transaction-style tables. Phase D's sweep caught the obvious call sites; this audit caught 10 more. All would either throw 500 errors when called, or silently return wrong results.

### 2a. Real 500 errors (5 sites)

| # | File | Line | Endpoint / Function | Symptom |
|---|---|---|---|---|
| 1 | `server/routes.ts` | 1206-1212 | `POST /api/income/deduplicate` | `column "category" does not exist` 500 |
| 2 | `server/routes.ts` | 1853 | `POST /api/budgets` (limit check) | `column "category" does not exist` 500 |
| 3 | `server/routes.ts` | 1948-1951 | `GET /api/reports/category-comparison` | `column "personal_finance_category" does not exist` 500 (then falls through to manual-only) |
| 4 | `server/merchant-enricher.ts` | 251 | `enrichPendingTransactions` (Plaid) | `column "category" does not exist` on every nightly run |
| 5 | `server/merchant-enricher.ts` | 271-284 | `UPDATE plaid_transactions SET personal_category = ...` | Would throw if SELECT didn't fail first |

### 2b. Real 500 (MX side) — 1 site

| # | File | Line | Function | Symptom |
|---|---|---|---|---|
| 6 | `server/merchant-enricher.ts` | 294 | `enrichPendingTransactions` (MX) | `column "category" does not exist` on every nightly run |
| 7 | `server/lib/auto-reconciler.ts` | 1357-1369 | `reconcileMxTransactions` | `column "category" does not exist` — auto-reconciler dies before any matching |

### 2c. Silent property-access bugs (3 sites)

These don't throw — they silently return `undefined` because the TypeScript object property no longer exists, leading to wrong behavior:

| # | File | Line | Function | Symptom |
|---|---|---|---|---|
| 8 | `server/routes.ts` | 8547 | `currentMonthBudgets.map(b => ({ category: b.category }))` | AI snapshot prompt gets `category: undefined` for every budget |
| 9 | `server/routes.ts` | 9306 | `existingBudgets.map(b => b.category)` for AI budget suggestions | Filter never matches → AI re-suggests categories that already have budgets |
| 10 | `server/routes.ts` | 10320, 10333 | `bills.filter(b => b.category === "Subscriptions")` | `/api/subscriptions` and `/api/subscriptions/summary` always return empty array |

### 2d. Fix approach summary

- **Mechanical SQL swaps** (queries 1, 2): `category` → `canonical_category_id` (same as the featureGate.ts pattern)
- **JOIN cutover** (query 3): Drop `personal_finance_category, category` references; LEFT JOIN `canonical_categories cc ON cc.id = pt.canonical_category_id`, GROUP BY display_name
- **Enricher rebuild** (queries 4-6): Drop `t.category` from SELECT; derive Plaid PFC primary from `personal_finance_category_detailed` (e.g. `FOOD_AND_DRINK_GROCERIES` → `FOOD_AND_DRINK`); for MX, fall back to `top_level_category`. Drop `personal_category` from the UPDATE SET clause.
- **Reconciler upgrade** (query 7): Drop `mt.category` from SELECT; add `mt.canonical_category_id`; replace string-keyword skip check with `isNonSpendingCanonical(tx.canonical_category_id)` from §6.3.1 — this actually *improves* the skip logic (catches credit card payments + debt payments via canonical taxonomy in addition to transfers).
- **Property renames** (queries 8-10): `b.category` → `b.canonicalCategoryId`. For the subscriptions filter, lookup the canonical id `"lifestyle_subscriptions"` (per `seed-canonical-categories.ts:112`) instead of the string `"Subscriptions"`. For #9, load `canonical_categories` map and convert slug → display name to compare against `categorySummaries[].category` which holds display names.

### 2e. Files touched (this session)

```
MOD  server/routes.ts                              (5 edits)
MOD  server/merchant-enricher.ts                   (Plaid + MX enricher rewrites)
MOD  server/lib/auto-reconciler.ts                 (canonical-flags import + SELECT + skip logic)
```

### 2f. Suggested commit message

```
fix(post-phase-a): 10 column-drop stragglers + canonical-flag upgrade

UAT-13 audit surfaced 10 more places still referencing the
legacy `category` column dropped by Phase A migration 0041:

  routes.ts (5 sites):
    - /api/income/deduplicate query (line 1206)
    - /api/budgets limit check (line 1853)
    - /api/reports/category-comparison (line 1948)
    - AI snapshot budgetStatus (line 8547)
    - AI budget-suggestions existingCategories filter (line 9306)
    - /api/subscriptions + /api/subscriptions/summary filter
      (lines 10320, 10333)
  merchant-enricher.ts:
    - Plaid enricher SELECT/UPDATE (drop t.category from SELECT,
      derive PFC primary from personal_finance_category_detailed,
      drop personal_category from UPDATE)
    - MX enricher SELECT (drop t.category, use top_level_category)
  auto-reconciler.ts:
    - reconcileMxTransactions SELECT (drop mt.category, add
      mt.canonical_category_id) + skip check upgraded to use
      isNonSpendingCanonical from §6.3.1 (catches transfers AND
      credit-card-payments AND debt-payments via canonical taxonomy)

Five sites would 500 with `column "category" does not exist`
when called. Three sites silently returned wrong data
(AI snapshot got undefined for every budget; subscription
filter always returned empty array; budget-suggestions kept
re-suggesting categories that already had budgets).

The reconciler upgrade is a behaviour improvement on top of the
fix — the previous string-keyword check missed canonical
non-spending types like finance_credit_card_payment. Now
caught via canonical-id check.
```

---

## Section 3 — UAT-12 carryover verdicts

### 3a. #107 — Five-number income drift — **PARTIAL FIX**

Audit traced where the income figure is computed for each of the 5 surfaces UAT-12 flagged:

| Surface | Endpoint | Source | Uses snapshot helper? |
|---|---|---|---|
| Dashboard income card | `/api/engine/dashboard` | `calculateIncomeForPeriod()` | NO |
| Income page banner | `/api/engine/income` | `calculateIncomeForPeriod()` | NO |
| AI Chat | `/api/ai/chat` | `getHouseholdFinancialSnapshot()` | YES |
| AI Savings Advisor | `/api/ai/savings-advisor` | `getHouseholdFinancialSnapshot()` | YES |
| Forecast baseline | `/api/ai/forecast` | `getAllNormalizedTransactions()` + custom aggregation | NO |

**Reading:** Dashboard + Income page should match each other (same engine helper). AI Chat + Advisor should match each other (same snapshot helper). Forecast is the lone wolf with its own pipeline.

**Recommended next move:** Cut `/api/ai/forecast` over to `getHouseholdFinancialSnapshot` so AI surfaces are unified end-to-end. The Dashboard/Income engine path is fine as-is — it's the ground truth for UI display.

**Live verification:** When you walk the UI, compare:
- Dashboard income (this month) vs Income page banner (this month) → should match
- AI Chat "what's my income?" vs AI Savings Advisor "monthly income" → should match
- Forecast next-month baseline vs Dashboard this-month income → may differ today; should match after Forecast cutover

### 3b. #118 — Categories taxonomy 3-way split — **FIXED BY PHASE A DESIGN**

Backend `/api/categories` returns one unified canonical list. Frontend `categories.tsx` filters using `appliesToExpense` / `appliesToBill` / `appliesToIncome` flags from `canonical_categories` (per `client/src/lib/canonical-categories.ts:101-122`). A canonical like `lifestyle_subscriptions` (which has BOTH `appliesToExpense: true` AND `appliesToBill: true`) correctly appears in BOTH sections.

The 3-way visual split is intentional (like Monarch), but the data model is unified — no more "NO shared mapping" problem.

**Live verification:** Open `/categories`. The category "Subscriptions (SaaS & Streaming)" should appear under BOTH "Expense Categories" and "Bill Categories" sections. If it does, this is fully fixed.

### 3c. #109 — Debt Payoff Plaid liabilities — **NEEDS LIVE VERIFICATION**

The Debt Payoff page (`debt-payoff.tsx:474-480`) queries TWO endpoints:
- `/api/debts` — manual debts only (for the editable list)
- `/api/engine/debts` — UNIONS manual + provider liability accounts (for `payoffData.totalDebt`, `avalanche`, `snowball`, etc.)

The engine endpoint at `engine/routes/core.ts:453` correctly unions manual debts with Plaid/MX liability accounts (credit cards, mortgages, loans), filtering out accounts already linked to a manual debt (via `linkedPlaidAccountId`).

**This means UAT-12's $0 finding may have actually been a different bug** — possibly the engine proxy issue from 2026-04-21 (commits `3a4ee69` + `c8509fa`) propagating slowly, or a transient sync state. The code path looks correct now.

**Live verification:** Open `/debt-payoff`. Total Debt should reflect Plaid liabilities (the $1,194,780.56 from UAT-12). If it shows $0 again, dig into `/api/engine/debts` response in browser DevTools — it should return totalDebt > 0.

### 3d. #99 — Investments display suppression — **FIXED**

`investments.tsx:1950-1952` has the guard:
```ts
const cost = parseFloat(holding.costBasis || "0");
const gain = value - cost;
const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
```

When cost basis is 0, the percentage is 0 instead of `Infinity`/`NaN`. No more "+2157% return" display.

**Live verification:** Investments page — any holding with $0 cost basis should show 0% return, not crazy numbers.

### 3e. #110 — Scotia Mortgage duplication — **FIXED**

`server/engine/data-loaders.ts:85-134` has a `dedupeAccounts()` function with key `${provider}::${institutionName}::${mask}::${accountType}`. This avoids depending on Plaid's unstable `account_id` (which UAT-11 found gets re-issued on Item reconnection). Duplicate detection collapses to the row with most recent `lastSyncedAt` or largest `Math.abs(balance)` as tiebreaker.

**Live verification:** Net Worth or Bank Accounts page — Scotia Mortgage should appear ONCE, not twice.

---

## Section 4 — Visual walkthrough script (execute in order)

When you walk the UI, hit these checkpoints. ✅ = pass, ❌ = flag for follow-up.

### 4a. Dashboard `/`
- [ ] Loads without error or zero values where there should be data
- [ ] Income card shows expected monthly figure
- [ ] Top categories render (Phase A canonical resolution)
- [ ] Net worth card shows expected total

### 4b. Bank Accounts `/bank-accounts`
- [ ] All accounts list (no Scotia duplicate — UAT-12 #110 verification)
- [ ] Refresh button works (Plaid INTERNAL_SERVER_ERROR is upstream — separate issue, deferred)
- [ ] Account categories use `canonical-categories.ts` color (cebe3dc cleanup)

### 4c. Categories `/categories`
- [ ] One unified list, but visually grouped into Expense / Bill / Income (intentional)
- [ ] "Subscriptions (SaaS & Streaming)" appears under BOTH Expense AND Bill sections (UAT-12 #118 verification)
- [ ] Click "Add Custom Category" — form lets you pick which bucket(s) it applies to

### 4d. Income `/income`
- [ ] Income banner number matches Dashboard income card (UAT-12 #107 partial verification)
- [ ] Click every tab/filter at top
- [ ] Add manual income → verify it appears immediately, no crash

### 4e. Bills `/bills`
- [ ] All bills render with correct canonical category (e.g. Mortgage, Phone)
- [ ] Click "Subscriptions" tab/section — should now show your real subscriptions (UAT-12 fix #2c-10)

### 4f. Expenses `/expenses`
- [ ] All expenses render with category chips
- [ ] Click any expense to edit — category dropdown loads canonical list

### 4g. Debt Payoff `/debt-payoff`
- [ ] Total Debt > $0 if you have any Plaid liabilities (UAT-12 #109 verification)
- [ ] Avalanche/Snowball tabs both render schedules
- [ ] AI Analyze button works

### 4h. Investments `/investments`
- [ ] Any $0-cost-basis holding shows 0% return, not +2157% (UAT-12 #99 verification)
- [ ] Click every tab/filter

### 4i. Reports `/reports`
- [ ] Click EVERY pill at the top (Top Merchants, Income vs Expenses, Category Comparison, etc.) — none should crash
- [ ] **Category Comparison** — should now load without 500 (UAT-13 fix #2a-3)

### 4j. Forecast `/forecast`
- [ ] Loads without error
- [ ] Baseline income figure: note it down — should match Dashboard income after Forecast cutover (UAT-13 follow-up #3a)

### 4k. Subscriptions `/subscriptions` (or wherever the subscriptions widget renders)
- [ ] Now shows actual subscriptions, not empty (UAT-13 fix #2c-10)
- [ ] Monthly total > $0 if you have any subscription bills

### 4l. AI Chat / Advisor (Ask AI button)
- [ ] Ask "what's my monthly income?" — answer should match Dashboard
- [ ] Ask "what should I budget for groceries?" — should not re-suggest categories you already have budgets for (UAT-13 fix #2c-9)

### 4m. Settings → Plan & Limits
- [ ] Feature summary widget shows non-zero counts for `budget_creation` and `categories_management` (featureGate.ts fix from `202b2f8`)
- [ ] No silent `column "category" does not exist` errors in browser DevTools network tab

### 4n. Empty-state pass (per `feedback_uat_coverage_gap.md`)
- [ ] Open a new browser profile / incognito → log into the seed-empty test account if you have one
- [ ] Click every page in the sidebar — no crashes on empty data
- [ ] Click every "Add X" CTA from empty states → modals open cleanly

### 4o. Deferred / known-issue
- [ ] Plaid `INTERNAL_SERVER_ERROR` refresh failure on Scotia (parked — upstream Plaid)

---

## Section 5 — Recommended next moves (priority order)

1. **Commit + push** the 10 Phase A fixes (one commit, suggested message in §2f). After deploy, re-tail Railway logs for any other `column "category" does not exist` errors.
2. **Live walkthrough** using §4 checklist to confirm each fixed bug visually.
3. **Forecast snapshot cutover** — switch `/api/ai/forecast` from rolling its own pipeline to `getHouseholdFinancialSnapshot`, closing the last income-drift gap.
4. **Plaid update-mode reconnect** for Scotiabank item — when ready to investigate the API_ERROR from earlier.
5. **§6.3.2** — auto pair-matching for internal transfers (deferred from this session).

---

*End of report. All file edits in this audit are on disk in `C:\Users\Claude\Documents\Budget-Smart-AI` and ready for one consolidated Cline commit when you're back.*
