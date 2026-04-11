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
