# Financial Engine Migration Plan

**Goal:** Every client page becomes a "dumb display" — no `parseFloat`, no `.reduce()`, no local arithmetic on financial data. All calculations happen server-side in the centralized financial engine.

**Date:** April 11, 2026

---

## Part 1: Engine Audit — What Exists Today

### Current Engine Endpoints (`server/routes/engine.ts`)

| Endpoint | Returns | Status |
|----------|---------|--------|
| `/api/engine/dashboard` | Full `DashboardData` (income, expenses, bills, cashFlow, netWorth, savingsGoals, healthScore, safeToSpend, gaps, alerts) | ✅ Complete |
| `/api/engine/expenses` | `ExpenseResult` (total, byCategory, topCategories, topMerchants, dailyAverage, projectedMonthly, dailyTotals) | ✅ Complete |
| `/api/engine/income` | `IncomeResult` (budgetedIncome, actualIncome, effectiveIncome, bySource) | ✅ Complete |
| `/api/engine/bills` | `BillsResult` (thisMonthBills, thisMonthTotal, upcomingBills, monthlyEstimate, annualEstimate) | ⚠️ Missing: bill totals normalized by recurrence type |
| `/api/engine/subscriptions` | `SubscriptionsResult` (active, paused, monthlyTotal, yearlyTotal) | ✅ Complete |
| `/api/engine/net-worth` | `NetWorthResult` (netWorth, totalAssets, totalLiabilities, assetBreakdown, liabilityBreakdown) | ⚠️ Missing: per-asset grouping with items, appreciation |
| `/api/engine/debts` | `DebtPayoffResult` (totalDebt, avalanche/snowball schedules) | ✅ Complete |
| `/api/engine/budgets` | `BudgetsResult` (items with paceStatus, totalBudget, totalSpent) | ✅ Complete |
| `/api/engine/savings-goals` | `SavingsGoalsResult` (goals with progress, totalSaved, totalTarget) | ✅ Complete |
| `/api/engine/health-score` | `HealthScoreResult` (totalScore 0-100, component scores) | ✅ Complete |
| `/api/engine/bank-accounts` | `BankAccountsEngineResult` (totalBalance, totalAssets, totalLiabilities, monthlySpending, monthlyIncome) | ✅ Complete |
| `/api/engine/investments` | `InvestmentsResult` (totalValue, totalCost, totalGain, gainPercent) | ⚠️ Missing: per-account values, worst/best holdings |
| `/api/engine/reports` | `ReportsData` (currentMonth, categoryTotals, monthlyTrend, dailySpending, topMerchants, ytd) | ⚠️ Missing: bill totals by recurrence type |

---

## Part 2: Page-by-Page Violation Catalog

### Violation 1: Dashboard (`dashboard.tsx` lines 282-299)

**What it calculates locally:**
- Filters transactions for outflows (excluding transfers and certain categories)
- `.reduce()` to sum spending by category
- Sorts to find top 5 categories

**What it produces:** `categoryTotals: Record<string, number>` and `topCategories` (top 5 sorted)

**Engine endpoint it already calls:** `/api/engine/dashboard`

**Does the engine already return this?** YES — `DashboardData.expenses.byCategory` and `DashboardData.expenses.topCategories` already exist and contain exactly this data.

**Fix type:** 🟢 **SIMPLE SWAP** — Delete local calculation, use `dashboardData.expenses.byCategory` and `dashboardData.expenses.topCategories` instead. Zero engine changes needed.

---

### Violation 2: Calendar (`calendar.tsx` lines 74-75)

**What it calculates locally:**
- Filters calendar events by `type === "bill"` and `type === "income"`
- `.reduce()` to sum amounts per type

**What it produces:** `monthlyBills: number` and `monthlyIncome: number`

**Engine endpoint it calls:** `/api/calendar/events` (NOT an engine endpoint)

**Does the engine already return this?** PARTIALLY — `/api/engine/bills` returns `thisMonthTotal` and `/api/engine/income` returns `effectiveIncome`, but the calendar page is working with its own event objects.

**Fix type:** 🟡 **ADD FIELDS TO CALENDAR ENDPOINT** — The `/api/calendar/events` endpoint in `server/routes.ts` should return pre-computed `monthlyBillsTotal` and `monthlyIncomeTotal` alongside the events array. Or the calendar page can call `/api/engine/bills` + `/api/engine/income` as supplementary queries. The simpler fix: compute the totals server-side in the calendar endpoint before sending events.

---

### Violation 3: Assets (`assets.tsx` lines 255-264, 345)

**What it calculates locally:**
- Groups assets by category via `.reduce()`
- Sums `currentValue` across all assets → `totalValue`
- Sums `purchasePrice` across all assets → `totalPurchasePrice`
- Computes `appreciation = totalValue - totalPurchasePrice`
- Per-category subtotals at line 345

**What it produces:** `assetsByCategory`, `totalValue`, `totalPurchasePrice`, `appreciation`, category subtotals

**Engine endpoint it calls:** `/api/assets` (raw CRUD endpoint, NOT engine)

**Does the engine already return this?** PARTIALLY — `/api/engine/net-worth` has `assetBreakdown: Record<string, number>` which groups by type, but doesn't include per-item lists or appreciation.

**Fix type:** 🟡 **NEW ENGINE ENDPOINT** — Create `/api/engine/assets` that returns:
```typescript
interface AssetsEngineResult {
  totalValue: number;
  totalPurchasePrice: number;
  appreciation: number;
  appreciationPercent: number;
  byCategory: Record<string, {
    totalValue: number;
    count: number;
    items: Array<{ id: string; name: string; value: number; purchasePrice: number }>;
  }>;
}
```
The page still needs the raw asset list for CRUD operations (add/edit/delete), so it keeps `/api/assets` for that. But summary calculations come from the engine.

---

### Violation 4: Reports (`reports.tsx` lines 565-574)

**What it calculates locally:**
- Filters bills by recurrence type (monthly, weekly, biweekly, yearly)
- Normalizes each to a monthly equivalent:
  - weekly × 52 / 12
  - biweekly × 26 / 12
  - yearly / 12
- Sums to get `monthlyBillsTotal`
- Computes `annualTotal = monthlyBillsTotal * 12`

**What it produces:** Bills broken down by recurrence, normalized monthly total, annual total

**Engine endpoint it calls:** `/api/bills` (raw CRUD) AND `/api/engine/reports`

**Does the engine already return this?** PARTIALLY — `/api/engine/bills` already returns `monthlyEstimate` and `annualEstimate` which are the same thing. But the reports page fetches raw bills separately and recalculates.

**Fix type:** 🟢 **SIMPLE SWAP** — The reports page already calls `/api/engine/reports`, which itself calls `calculateBillsForPeriod`. The `BillsResult.monthlyEstimate` and `BillsResult.annualEstimate` already do this normalization. The page should use these engine values instead of recomputing from raw bills. May need to add `billsByRecurrence` breakdown to the reports response if the page needs the per-type split for display.

---

### Violation 5: Investments (`investments.tsx` lines 1085, 1386)

**What it calculates locally:**
- Line 1085: `.reduce()` to find worst-performing holding by `gainLossPct`
- Line 1386: `.reduce()` to sum `currentValue` of holdings per account → `accountValue`

**What it produces:** `worstPerformer.symbol`, per-account total values

**Engine endpoint it calls:** `/api/engine/investments` AND `/api/holdings` AND `/api/investment-accounts`

**Does the engine already return this?** PARTIALLY — `/api/engine/investments` returns portfolio-level totals but NOT per-account breakdowns or worst/best performers.

**Fix type:** 🟡 **EXTEND ENGINE ENDPOINT** — Add to `InvestmentsResult`:
```typescript
interface InvestmentsResult {
  // ... existing fields ...
  byAccount: Array<{
    accountId: string;
    accountName: string;
    totalValue: number;
    totalCost: number;
    gainLoss: number;
    gainLossPct: number;
  }>;
  bestPerformer: { symbol: string; gainLossPct: number } | null;
  worstPerformer: { symbol: string; gainLossPct: number } | null;
}
```

---

### Violation 6: Liabilities (`liabilities.tsx` line 638)

**What it calculates locally:**
- `.reduce()` with `Math.abs(parseFloat(...))` to sum account balances within each group

**What it produces:** `groupTotal` per liability type group

**Engine endpoint it calls:** `/api/plaid/accounts` (raw) AND `/api/engine/net-worth`

**Does the engine already return this?** YES — `/api/engine/net-worth` returns `liabilityBreakdown: Record<string, number>` which is exactly the grouped totals by type.

**Fix type:** 🟢 **SIMPLE SWAP** — Use `netWorthData.liabilityBreakdown` to display group totals instead of recalculating. The raw accounts list is still needed for the account listing UI, but the summary totals should come from the engine.

---

## Part 3: Strategic Fix Plan

### Phase 1: Simple Swaps (Zero Engine Changes)
*Estimated effort: ~1-2 hours*

These pages already have the data available from engine endpoints but compute it locally anyway.

| # | Page | What to do | Risk |
|---|------|-----------|------|
| 1a | **dashboard.tsx** | Replace local `categoryTotals` with `dashboardData.expenses.byCategory` and `dashboardData.expenses.topCategories` | Low — data shape matches |
| 1b | **liabilities.tsx** | Replace local `groupTotal` reduce with `netWorthData.liabilityBreakdown[groupType]` | Low — already calling the endpoint |
| 1c | **reports.tsx** | Replace local bill normalization with `billsResult.monthlyEstimate` and `billsResult.annualEstimate` from engine | Low — engine already does this math |

### Phase 2: Add Summary Fields to Existing Endpoints
*Estimated effort: ~2-3 hours*

These need small additions to engine endpoints or non-engine endpoints.

| # | Page | Engine change | Page change |
|---|------|--------------|-------------|
| 2a | **calendar.tsx** | Add `monthlyBillsTotal` and `monthlyIncomeTotal` to `/api/calendar/events` response | Use pre-computed totals instead of local reduce |
| 2b | **investments.tsx** | Extend `/api/engine/investments` with `byAccount` array and `bestPerformer`/`worstPerformer` | Use engine fields instead of local reduce |
| 2c | **reports.tsx** (bills breakdown) | Add `billsByRecurrence: { monthly, weekly, biweekly, yearly }` to `/api/engine/bills` if the reports page needs the per-type split for its UI | Use engine fields for the recurrence breakdown display |

### Phase 3: New Engine Endpoint
*Estimated effort: ~2-3 hours*

| # | Page | Engine change | Page change |
|---|------|--------------|-------------|
| 3a | **assets.tsx** | Create new `/api/engine/assets` endpoint with grouping, totals, and appreciation | Replace all local reduce/grouping with engine data |

---

## Part 4: Execution Order & Dependencies

```
Phase 1 (Simple Swaps — no engine changes, just client rewiring)
  ├─ 1a: dashboard.tsx          [independent]
  ├─ 1b: liabilities.tsx        [independent]
  └─ 1c: reports.tsx            [independent]

Phase 2 (Extend existing endpoints, then rewire client)
  ├─ 2a: calendar endpoint → calendar.tsx    [independent]
  ├─ 2b: investments engine → investments.tsx [independent]
  └─ 2c: bills engine → reports.tsx          [independent]

Phase 3 (New endpoint, then rewire client)
  └─ 3a: assets engine → assets.tsx          [independent]
```

All items within each phase are independent of each other and can be done in any order. Phases should be done in order (1 → 2 → 3) because Phase 1 validates the pattern before we modify engine code.

---

## Part 5: Verification Checklist

After each fix:
- [ ] TypeScript compiles (`npx tsc --noEmit`)
- [ ] Page renders correctly (visual check)
- [ ] Numbers match what the engine returns (no drift)
- [ ] No remaining `parseFloat` + `.reduce()` on financial amounts in the modified file

After all fixes:
- [ ] Global grep for remaining violations: `grep -rn "\.reduce(" client/src/pages/ | grep -i "parseFloat\|amount\|balance\|value"`
- [ ] All financial totals on every page trace back to an engine endpoint
- [ ] No page does its own currency arithmetic

---

## Part 6: UAT-6 Pre-Flight Re-Audit (2026-04-16)

Full re-scan of all 65 client pages in `client/src/pages/` before UAT testing 6. Patterns searched: `.reduce(`, `parseFloat` + `+`, `Math.{abs,round,floor,ceil,max,min}` on financial data, `.toFixed()` on math results.

### Status of the Original 6 Violations

All six have been remediated. Evidence:

| # | Page | Status | Evidence |
|---|------|--------|----------|
| 1 | dashboard.tsx | ✅ FIXED | Line 749 iterates `dashboard.expenses.topCategories` directly; no local `categoryTotals` reduce remains. Only `parseFloat` remaining is inside a display formatter at line 120. |
| 2 | calendar.tsx | ✅ FIXED | Lines 79–80 read `calendarData?.monthlyBillsTotal` and `calendarData?.monthlyIncomeTotal` from the `/api/calendar/events` response; no local reduce. |
| 3 | assets.tsx | ✅ FIXED | Totals come from engine (verified at lines 274–276); line 266 `.reduce()` is UI grouping only, not a totals calculation. Line 364–366 `parseFloat` is in a per-item display formatter. |
| 4 | reports.tsx | ✅ FIXED | Lines 580–584 read `billsEngine?.byRecurrence?.{monthly,weekly,biweekly,yearly}` and `billsEngine?.annualEstimate`; remaining `parseFloat`s at lines 368/378/613/626/639/652 are all single-bill display formatters, not aggregations. |
| 5 | investments.tsx | ✅ FIXED (primary) | Line 1397 uses `investmentsSummary?.byAccount?.find(...)` for per-account values with local fallback only. Line 1095 retains a `.reduce()` to pick the worst-performing holding by `gainLossPct` — classified as minor (see Violation 7 below). |
| 6 | liabilities.tsx | ✅ FIXED | Line 643 uses `engineData?.liabilityBreakdown?.[group.label]` with a local reduce as fallback only. This is the correct engine-first pattern. |

### Newly Discovered Violations

#### Violation 7: Investments (`investments.tsx` line 1095) — minor, unplanned

**What it calculates locally:**
- `.reduce()` over `portfolio.holdings` to pick the holding with the lowest `gainLossPct`, used to populate an AI-advisor suggested prompt ("Why am I down so much on AAPL?").

**What it produces:** `worstPerformer.symbol` (a string used in UI copy).

**Engine endpoint it calls:** `/api/engine/investments`

**Does the engine already return this?** NO — Phase 2 of the original plan proposed adding `bestPerformer`/`worstPerformer` to `InvestmentsResult` but this hasn't been shipped.

**Fix type:** 🟡 **EXTEND ENDPOINT (deferred to Phase 2)** — Not a calculation of a *value*, just a `min-by-key` pick on already-engine-computed per-holding `gainLossPct`. Zero drift risk. Safe to ship as-is for UAT-6; replace when Phase 2 lands.

---

#### Violation 8: Other Expenses (`other-expenses.tsx` line 111) — NEW

**What it calculates locally:**
- `const monthlyTotal = filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);`
- Filters user's expenses in-memory, then sums `amount` across all matching rows.

**What it produces:** `monthlyTotal: number` — displayed prominently as the "total" for the other-expenses view.

**Engine endpoint it calls:** None — page fetches `/api/expenses` raw.

**Does the engine already return this?** PARTIALLY — `/api/engine/expenses` returns `total` and `byCategory`, but the filter scheme on this page (its own subset of expenses) doesn't match a current engine breakdown.

**Fix type:** 🟡 **EXTEND OR SIMPLE SWAP** — Either (a) the page should be calling `/api/engine/expenses` and using `total` directly (if the filter matches), or (b) add a scoped endpoint. Probably (a) — this page is showing the same data the dashboard sees, just in a different layout.

---

#### Violation 9: Split Expenses (`split-expenses.tsx` lines 594, 598) — NEW

**What it calculates locally:**
```ts
const iOwe = balances.filter(b => b.from === currentUserId).reduce((sum, b) => sum + b.amount, 0);
const owedToMe = balances.filter(b => b.to === currentUserId).reduce((sum, b) => sum + b.amount, 0);
```

**What it produces:** `iOwe` and `owedToMe` — the two headline numbers on the split-expenses page.

**Engine endpoint it calls:** `/api/split-expenses/balance` (not an engine endpoint; returns raw `balances` array).

**Does the engine already return this?** NO — split-expenses is not yet represented in the engine.

**Fix type:** 🟡 **EXTEND EXISTING ENDPOINT** — Cheapest fix: add `iOwe` and `owedToMe` to the `/api/split-expenses/balance` response payload (compute server-side before returning the balances array). No new engine endpoint needed for UAT-6.

---

#### Violation 10: Tax Smart (`tax-smart.tsx` line 1521) — NEW

**What it calculates locally:**
- `filteredTransactions.reduce((s, t) => s + t.amount, 0)` — sum of user-filtered tax-deductible transactions for display in a total row.

**What it produces:** A "Total: $X" badge below the tax-category transaction table.

**Engine endpoint it calls:** Uses local filter over a transactions array pulled from elsewhere. `/api/tax-smart/*` endpoints exist but the total is recomputed on the client.

**Does the engine already return this?** PARTIALLY — `taxSummary.totalDeductible` (already read at line 569) is the grand total. The per-filter total (what the user sees below the table) is client-computed because the filter is client-side.

**Fix type:** 🟡 **SERVER-SIDE FILTERING** — Move the filter to a query param and return the filtered total from the server. Or, acceptable for UAT-6 if we accept that this is a UI-filtered subtotal and the grand total (which is the auditable number) comes from the engine.

---

### Borderline Cases (Derived-from-Engine Math)

These pages do arithmetic on values that were *themselves* computed by the engine. Drift risk is low because both operands come from the same engine response, but they still violate the strict "no page does its own currency arithmetic" rule. Batch these together as a cleanup pass — **none are blockers for UAT-6**.

| Page | Line | Expression | What to ask the engine to return instead |
|------|------|------------|------------------------------------------|
| debt-payoff.tsx | 486 | `totalDebt / totalMinPayments` | `debtToPaymentRatioMonthly` |
| debt-payoff.tsx | 488 | `debtToPaymentRatioMonthly / 12` | `debtToPaymentRatioAnnual` |
| budgets.tsx | 472 | `Math.max(engineData.totalBudget - engineData.totalSpent, 0)` | `totalRemaining` on `/api/engine/budgets` |
| budgets.tsx | 755 | `Math.max(limit - spent, 0)` (per-budget) | `remaining` on each budget item |
| budgets.tsx | 853 | `Math.round((spent / limit) * 100)` when over-budget | Already have `budget.percentage` — remove this re-computation (use the engine field directly, don't cap it at 100 in the engine) |
| liabilities.tsx | 254 | `Object.entries(breakdown).filter(...).reduce((s, [,v]) => s+v, 0)` for `plaidTotal` | `plaidLiabilitiesTotal` on net-worth response |

### Inspected and Skipped (True False Positives)

These matched the grep but are not engine violations:

| File | Pattern | Why it's fine |
|------|---------|---------------|
| dashboard.tsx:120, investments.tsx:183, assets.tsx:66, liabilities.tsx:114 | `parseFloat` in `formatCurrency` / `toNum` helper | Display-only formatter, no calculation |
| expenses.tsx:841 | `Math.ceil(filteredExpenses.length / PAGE_SIZE)` | Pagination math on row count, not money |
| expenses.tsx:1076 | `expenseStats?.momChangePercent?.toFixed(1)` | Display formatting of engine-returned value |
| vault.tsx:98–99 | `(bytes / 1024).toFixed(1)` | File-size formatter, not money |
| upgrade.tsx:171, 174 | `price?.toFixed(2).split(".")` | Price display splitter for typographic formatting |
| debts.tsx:130, 248–250, 443–469 | `.toFixed(2)`, `Math.abs(parseFloat(...))` | Form setValue (pre-populating edit forms from Plaid data) — correct use of `parseFloat` to parse server-returned strings for an input field, not a calculation |
| liabilities.tsx:279, 491, 500, 511, 664 | `Math.abs(parseFloat(account.balanceCurrent))` | Absolute value of a single balance for display or form pre-fill — not an aggregation |
| debt-payoff.tsx:334 | `apr.toFixed(2)` in PUT body | Input normalization before server write |
| subscriptions.tsx:427, 545, 853 | `sub.amount.toFixed(2)`, `Math.round(sub.confidence * 100)` | Display-only formatting |
| split-expenses.tsx:140–141, 293 | `shareAmount.toFixed(2)`, `(100 / selectedMembers.length).toFixed(2)` | Form-input prefill for an equal-split preset; user can override |
| budgets.tsx:76, 359, 391, 560 | `Math.ceil(days)`, `s.suggestedAmount.toFixed(2)` | Days-until-payday (not money) and suggestion-prefill formatting |
| tax-smart.tsx:337, 569, 571, 741, 1431 | `t.amount.toFixed(2)`, `taxSummary.totalDeductible.toFixed(2)`, `Math.floor(brackets.length/2)` | CSV export formatting, engine-value display, bracket array indexing |
| dashboard.tsx:330 | `Math.round(((realSpending - budgetSpending) / budgetSpending) * 100)` | Derived display metric from two engine values — low drift risk (same comment as borderline cases above) |
| affiliate.tsx | Commission projection calculator | Public pricing × user-chosen referral count — marketing projection tool, not user financial data |
| admin-ai-management.tsx:284, admin-users.tsx:403 | Summing AI costs/call counts | Admin-only analytics, outside the "user financial engine" scope |
| admin-plan-features.tsx:119 | `.reduce()` grouping features by category | String grouping, not money |
| investments.tsx:507, 522, 1488–1489 | `parseFloat(values.currentPrice) * parseFloat(values.quantity)`, per-row `parseFloat(holding.currentValue)` | (507/522) Form default calculation inside `form.setValue`; (1488–1489) per-row display read of a server-provided string, not aggregation |
| investments.tsx:1399 | `parseFloat(account.balance || "0")` | Fallback when engine data unavailable for an account — acceptable |

---

### UAT-6 Go/No-Go Recommendation

**GO for UAT-6.** The original 6 violations that prompted the migration plan have all been remediated with the correct engine-first pattern (engine value with local fallback only when engine data is unavailable). The three newly-discovered violations (Violations 8, 9, 10) all live on secondary pages (other-expenses, split-expenses, tax-smart) and produce numbers that are visible to the user but don't feed into the core financial "source of truth" surfaces (dashboard, net-worth, bills, investments, liabilities). They should be tracked and fixed in the next post-UAT cleanup pass.

Violation 7 (the AI-advisor prompt composer on investments.tsx:1095) and the borderline-derived-math cases carry effectively zero drift risk and should be folded into a future engine-field cleanup batch rather than blocking UAT-6.

### Recommended Post-UAT-6 Cleanup Order

1. Fix Violation 8 (other-expenses.tsx) — likely a single-line swap to call `/api/engine/expenses`.
2. Fix Violation 9 (split-expenses.tsx) — small server-side addition to `/api/split-expenses/balance`.
3. Fix Violation 10 (tax-smart.tsx) — evaluate whether the filter should move server-side.
4. Batch cleanup: add the derived-math fields from the "Borderline Cases" table to the relevant engine endpoints in one PR (debtToPaymentRatio*, totalRemaining, per-budget remaining, plaidLiabilitiesTotal), then delete the local math at the listed call sites.
5. When Phase 2 of the original plan lands (extending `/api/engine/investments` with best/worst performer fields), remove the `.reduce()` at investments.tsx:1095.

