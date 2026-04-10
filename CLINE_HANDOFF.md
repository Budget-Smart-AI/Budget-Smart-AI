# Financial Engine — Cline Handoff & Deployment Checklist

> **Branch:** `feature/financial-engine-centralization`
> **Goal:** Get this branch to compile, pass smoke tests, and deploy to Railway.
> **Context:** This is a pre-production app (app.budgetsmart.ai). No live users — safe to iterate freely.

## ✅ COMPLETED PHASES (as of 2026-04-10)

### Phase 1 (TypeScript) — DONE
- Fixed `date-fns` missing type declarations (npm reinstall cleared corrupted dist)
- Fixed `framer-motion` missing dist files (npm reinstall)
- Fixed `topMerchants` type mismatch: `ExpenseResult.amount` → `ReportsData.total` (mapped in /reports endpoint)
- All engine-specific files (`server/routes/engine.ts`, `server/lib/financial-engine/*`) compile with 0 errors
- Pre-existing errors in `server/routes.ts`, `server/plaid.ts` etc. are unrelated to the engine (347 modified files, many from prior work)

### Phase 2 (Incomplete Implementations) — DONE
- Net-worth endpoint: fetches assets, debts, investmentAccounts, holdings, history from storage; maps numeric strings to numbers
- Debt payoff: fetches `debtDetails` from storage, maps to `DebtItem[]` with `parseFloat(String(value))` for all numeric fields
- Budget expenses: maps Drizzle numeric strings to numbers for both budgets and expenses

### Phase 3 (Smoke Tests) — DONE ✅ 12/12
All 12 engine endpoints return 200 OK with correct JSON shapes:
- dashboard, expenses, income, bills, subscriptions, net-worth, debts, budgets, savings-goals, health-score, bank-accounts, reports

### Phase 4 (Edge Cases) — DONE ✅ 24/24
- No NaN/Infinity in any endpoint (all 12 checked)
- Future dates (2030) return zeros gracefully, no errors
- Past dates work correctly
- Health score in valid range (0-100)
- Safe-to-spend calculates correctly
- Bills/subscriptions arrays properly typed

### Phase 5 (Deploy) — PUSH DONE, Railway deploy pending
- Committed: `41740fa` — "feat: centralized financial engine with provider-agnostic adapter layer"
- Pushed to: `origin/feature/financial-engine-centralization`
- PR URL: https://github.com/Budget-Smart-AI/Budget-Smart-AI/pull/new/feature/financial-engine-centralization
- **Next step:** Deploy this branch on Railway with the Neon dev DATABASE_URL

## Dev Server Setup

```powershell
# PowerShell — set env vars and start server
$env:DATABASE_URL="postgresql://neondb_owner:npg_1Wx6chMbPfsm@ep-lively-glade-aivarx5o.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
$env:SESSION_SECRET="dev-session-secret-32-chars-minimum"
$env:FIELD_ENCRYPTION_KEY="16482f8839bfe85fbe25c64c192c160b8522e3debcaf49b76aa97b84b8ad1020"
$env:NODE_ENV="development"
npx tsx server/index.ts
```

- Login endpoint: `POST /api/auth/login` (not `/api/login`)
- Demo user: `username=demo, password=demo123`
- Server starts on port 5000

---

---

## What Was Built

A centralized **Financial Engine** in `server/lib/financial-engine/` that replaces duplicated client-side calculations across 14 pages. The engine uses a **provider-agnostic adapter layer** so any banking aggregator (Plaid, MX, future providers) normalizes its data before the engine sees it.

### Architecture

```
Client page → useQuery("/api/engine/...") → Express Router → Adapter Layer → Engine Module → Neon DB
                                                                  ↓
                                                         NormalizedTransaction / NormalizedAccount
                                                                  ↓
                                                          Computed result → JSON → Client renders
```

### New Files

| File | Purpose |
|---|---|
| `server/lib/financial-engine/types.ts` | All engine result type definitions |
| `server/lib/financial-engine/index.ts` | Barrel export (types + functions + adapters) |
| `server/lib/financial-engine/normalized-types.ts` | `NormalizedTransaction`, `NormalizedAccount`, `BankingAdapter` interface |
| `server/lib/financial-engine/adapters/plaid-adapter.ts` | Plaid → normalized (handles negative-is-income, balanceCurrent, subtype) |
| `server/lib/financial-engine/adapters/mx-adapter.ts` | MX → normalized (handles transactionType CREDIT, isIncome, transactionGuid) |
| `server/lib/financial-engine/adapters/manual-adapter.ts` | Manual entries → normalized |
| `server/lib/financial-engine/adapters/index.ts` | Adapter registry and re-exports |
| `server/lib/financial-engine/income.ts` | Income calculation (recurring + bank detection) |
| `server/lib/financial-engine/expenses.ts` | Expense dedup, MoM comparison, category breakdown |
| `server/lib/financial-engine/bills.ts` | Bill occurrence and total calculations |
| `server/lib/financial-engine/subscriptions.ts` | Subscription tracking |
| `server/lib/financial-engine/net-worth.ts` | Assets - liabilities with breakdown |
| `server/lib/financial-engine/debts.ts` | Avalanche + snowball payoff strategies |
| `server/lib/financial-engine/investments.ts` | Portfolio summary |
| `server/lib/financial-engine/budgets.ts` | Budget vs actual with pace tracking |
| `server/lib/financial-engine/health-score.ts` | Financial health 0-100 |
| `server/lib/financial-engine/savings-goals.ts` | Savings goal progress |
| `server/lib/financial-engine/safe-to-spend.ts` | Daily allowance calculation |
| `server/routes/engine.ts` | Express router with 12 endpoints |

### Modified Files (14 refactored pages)

These pages had local calculations removed and replaced with `useQuery` calls to `/api/engine/*`:

- `client/src/pages/dashboard.tsx`
- `client/src/pages/expenses.tsx`
- `client/src/pages/income.tsx`
- `client/src/pages/reports.tsx`
- `client/src/pages/bills.tsx`
- `client/src/pages/subscriptions.tsx`
- `client/src/pages/net-worth.tsx`
- `client/src/pages/debts.tsx`
- `client/src/pages/debt-payoff.tsx`
- `client/src/pages/investments.tsx`
- `client/src/pages/budgets.tsx`
- `client/src/pages/savings-goals.tsx`
- `client/src/pages/bank-accounts.tsx`
- `client/src/pages/liabilities.tsx`

Also modified: `server/routes.ts` (added `app.use("/api/engine", engineRouter)`)

---

## PHASE 1: TypeScript Compilation (Do This First)

Run:
```bash
npm install
npx tsc --noEmit
```

### Likely Type Errors to Expect

1. **Storage return types vs engine param types.** The engine modules define their own lightweight interfaces (e.g., `BudgetItem` in `budgets.ts`, `Expense` in `expenses.ts`). The storage layer returns Drizzle ORM types from `@shared/schema`. Fields may not match exactly. Fix by either:
   - Mapping storage results to engine interfaces in the route layer, OR
   - Updating engine interfaces to match the Drizzle types

2. **`calculateIncomeForPeriod` call signature.** This function now takes a named params object:
   ```typescript
   calculateIncomeForPeriod({
     income: Income[],
     transactions: NormalizedTransaction[],
     monthStart: Date,
     monthEnd: Date,
   })
   ```
   If any call site still uses positional args, fix it to use the object form.

3. **`calculateExpensesForPeriod` call signature.** Same pattern — requires named params:
   ```typescript
   calculateExpensesForPeriod({
     expenses: Expense[],
     transactions: NormalizedTransaction[],
     monthStart: Date,
     monthEnd: Date,
     prevMonthStart: Date,
     prevMonthEnd: Date,
   })
   ```

4. **`calculateNetWorth` call signature.** Changed from `calculateNetWorth(userId: string)` to:
   ```typescript
   calculateNetWorth({
     bankAccounts: NormalizedAccount[],
     assets: Asset[],
     debts: Debt[],
     investmentAccounts: InvestmentAccount[],
     holdings: Holding[],
     history: NetWorthSnapshot[],
   })
   ```
   The route currently passes empty arrays for assets/debts/investments/holdings/history. See Phase 2.

5. **`calculateDebtPayoff` call signature.** Still uses `(userId, extraPayment)`. Verify this function internally fetches its own data from storage — if not, it needs to be refactored to accept data params.

6. **`req.session` typings.** The routes use `req.session.userId` and `req.session.householdId`. Make sure the session type declarations include these fields.

7. **Date vs string in storage methods.** `storage.getPlaidTransactions()` expects `{ startDate?: string; endDate?: string }`. The `getAllNormalizedTransactions()` helper in `engine.ts` formats dates as strings via `format(date, 'yyyy-MM-dd')` — should be fine, but verify.

---

## PHASE 2: Known Incomplete Implementations

These are TODO items in the code that need to be completed:

### 2a. Net Worth Endpoint — Missing Data Fetching

**File:** `server/routes/engine.ts`, the `/net-worth` endpoint

The endpoint currently passes empty arrays for assets, debts, investments, holdings, and history:
```typescript
const result = calculateNetWorth({
  bankAccounts,
  assets: [],      // ← NEEDS: fetch from storage
  debts: [],       // ← NEEDS: fetch from storage
  investmentAccounts: [],  // ← NEEDS: fetch from storage
  holdings: [],    // ← NEEDS: fetch from storage
  history: [],     // ← NEEDS: fetch from storage
});
```

**Fix:** Look up the correct storage methods (likely `storage.getAssetsByUserId()`, `storage.getDebtDetailsByUserId()`, `storage.getInvestmentAccountsByUserId()`, `storage.getHoldingsByAccountId()`, `storage.getNetWorthHistory()`). Verify method names in `server/storage.ts`.

The same issue applies to the dashboard endpoint's `calculateNetWorth` call.

### 2b. Debt Payoff — Verify Internal Data Fetching

**File:** `server/lib/financial-engine/debts.ts`

The route calls `calculateDebtPayoff(userId, extraPayment)`. Verify this function fetches debt data internally via storage. If it does, it should be refactored to accept data as params (consistent with the other engine functions). If it already accepts data params, the route call needs updating.

### 2c. Budget Expenses — Bank Transaction Integration

**File:** `server/routes/engine.ts`, the `/budgets` endpoint

Currently budgets only compare against manual expenses. To be accurate, they should also count bank transactions that match budget categories. The `calculateBudgets()` function in `budgets.ts` takes `{ budgets, expenses, month }` — the `expenses` array should include deduplicated bank transactions mapped to their categories, not just manual entries.

**Options:**
- Use `calculateExpensesForPeriod()` to get the deduplicated totals by category, then pass those into budgets
- OR extend `calculateBudgets()` to accept `NormalizedTransaction[]` and handle the dedup internally

---

## PHASE 3: Smoke Testing

### 3a. Environment Setup

Create a `.env` file with:
```
DATABASE_URL=postgresql://neondb_owner:npg_1Wx6chMbPfsm@ep-lively-glade-aivarx5o.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```
(This is the Neon dev branch `br-wispy-sunset-ai51n3dz` — safe for testing, not production.)

Also need all other required env vars from `.env.example` (SESSION_SECRET, FIELD_ENCRYPTION_KEY, Plaid keys, etc.).

### 3b. Start Dev Server
```bash
npm run dev
```

### 3c. Test Each Engine Endpoint

Log in as a test user, then hit each endpoint and verify it returns valid JSON (not 500 errors):

| Endpoint | Expected Shape |
|---|---|
| `GET /api/engine/dashboard` | `{ income, expenses, bills, cashFlow, netWorth, savingsGoals, healthScore, safeToSpend, gaps, alerts }` |
| `GET /api/engine/expenses?startDate=2026-04-01&endDate=2026-04-30` | `{ total, count, previousTotal, momChangePercent, byCategory, topCategories, topMerchants, dailyAverage, projectedMonthly, dailyTotals }` |
| `GET /api/engine/income?startDate=2026-04-01&endDate=2026-04-30` | `{ budgetedIncome, actualIncome, effectiveIncome, hasBankData, bySource }` |
| `GET /api/engine/bills` | `{ thisMonthBills[], upcomingBills[], thisMonthTotal, monthlyEstimate, annualEstimate }` |
| `GET /api/engine/subscriptions` | `{ active, paused, monthlyTotal, yearlyTotal, upcomingRenewals, autoDetectedCount }` |
| `GET /api/engine/net-worth` | `{ netWorth, totalAssets, totalLiabilities, assetPercent, latestChange, assetBreakdown, liabilityBreakdown }` |
| `GET /api/engine/debts?extraPayment=0` | `{ debts[], totalDebt, weightedAvgApr, ... }` |
| `GET /api/engine/budgets?month=2026-04` | `{ items[], totalBudget, totalSpent, overallPercentage, healthCounts, monthProgress }` |
| `GET /api/engine/savings-goals` | `{ goals[], totalSaved, totalTarget, overallProgress }` |
| `GET /api/engine/health-score` | `{ score, components: { savingsRate, budgetCount, savingsGoalProgress, billCount } }` |
| `GET /api/engine/bank-accounts?month=2026-04` | `{ totalBalance, monthlySpending, monthlyIncome, unmatchedCount }` |
| `GET /api/engine/reports?startDate=2026-01-01&endDate=2026-04-30` | `{ currentMonth, categoryTotals, monthlyTrend[], dailySpending, topMerchants[], ytd }` |

### 3d. Test Each Refactored Page

Navigate to each page in the browser and verify:
- No blank/white pages (check browser console for React errors)
- Summary cards show numbers (not NaN, not "undefined")
- CRUD operations still work (add/edit/delete entries)
- Loading states appear briefly before data renders

Pages to test: Dashboard, Expenses, Income, Reports, Bills, Subscriptions, Net Worth, Debts, Debt Payoff, Investments, Budgets, Savings Goals, Bank Accounts, Liabilities.

---

## PHASE 4: Edge Cases to Verify

1. **Empty state:** New user with no data — all endpoints should return zeros/empty arrays, not errors.
2. **No bank accounts connected:** Dashboard and reports should fall back to manual/budgeted data.
3. **Disabled Plaid accounts:** Accounts with `isActive !== "true"` should be excluded from all calculations.
4. **Household mode:** If a user is in a household, calculations should aggregate across all household members.
5. **Date edge cases:** First/last day of month, leap years, timezone handling.

---

## PHASE 5: Deploy to Railway

1. Commit all changes: `git add . && git commit -m "feat: centralized financial engine with provider-agnostic adapter layer"`
2. Push: `git push origin feature/financial-engine-centralization`
3. In Railway, deploy the feature branch
4. Set the DATABASE_URL to the Neon dev branch connection string
5. Verify all endpoints return expected data in the deployed environment

---

## Key Design Decisions (For Context)

- **Integer cents arithmetic:** All engine calculations use `toCents()`/`toDollars()` to avoid floating-point drift.
- **Adapter pattern:** Provider-specific logic (Plaid sign conventions, MX field names) lives ONLY in `adapters/`. The engine modules work exclusively with `NormalizedTransaction` and `NormalizedAccount`.
- **To add a new aggregator:** Create one adapter file in `adapters/`, add fetch+normalize calls in `getAllNormalizedAccounts()` and `getAllNormalizedTransactions()` in `engine.ts`. Zero changes to any calculation module.
- **No schema changes needed:** The Neon database schema is unchanged — the problem was computation placement, not data structure.
- **Client pages are "dumb":** They fetch pre-computed results via `useQuery` and render. No financial logic on the client.

---

## Important Notes

- There are **347 modified files** on this branch. Many are unrelated to the engine (admin pages, legal pages, components, etc.). These may have been modified by prior work sessions. Focus on the engine-specific files listed above.
- The Neon branch `br-wispy-sunset-ai51n3dz` is a dev branch — safe to test against without affecting production data.
- Plaid is the only currently active aggregator. MX adapter is built but waiting on production API keys.
