# UAT #3 — Financial Engine Post-Deployment Report

> **Date:** April 10, 2026
> **Environment:** Production — app.budgetsmart.io
> **Test Account:** ryan.mahabir@outlook.com
> **Branch:** main (post financial-engine-centralization merge)

---

## CRITICAL (Pages Completely Broken)

### C1. Subscriptions Page — Blank White Screen
**URL:** /subscriptions
**Error:** `ReferenceError: nextDue is not defined` (26+ errors in console)
**Root Cause:** In `client/src/pages/subscriptions.tsx` line 649, `nextDue` is referenced in a JSX template (`format(nextDue, "MMM d, yyyy")`) but it's only defined inside the `getNextDueDate()` function scope (lines 52-69). The variable is not in scope at line 649 where the Cancellation Reminder dialog uses it.
**Impact:** Entire subscriptions page is non-functional. Users cannot view, manage, or cancel subscriptions.

### C2. Debt Payoff Page — Blank White Screen
**URL:** /debt-payoff
**Error:** `TypeError: Cannot read properties of undefined (reading 'totalInterest')`
**Root Cause:** In `client/src/pages/debt-payoff.tsx`, the page accesses `payoffData?.avalanche` and `payoffData?.snowball`. Either the `/api/engine/debts` endpoint is returning a 500 error or the response shape doesn't match the expected `DebtPayoffResult` interface. Line 507 uses `avalancheResult?.totalInterest.toFixed(0)` which will crash if `avalancheResult` is undefined — the optional chain doesn't protect the `.toFixed(0)` call.
**Impact:** Entire debt payoff strategy page is non-functional.

---

## HIGH (Incorrect Data Displayed)

### H1. Expenses Page — "Total Last Month" Shows $80,918.99
**URL:** /expenses
**Issue:** The "Total Last Month" (previous period comparison) displays $80,918.99 which is wildly incorrect. This also cascades into the Reports page showing "-83.0% vs last month" for MoM change.
**Root Cause:** The `/api/engine/expenses` endpoint's `previousTotal` calculation in `expenses.ts` is likely summing all transactions across the entire previous month without properly filtering out transfers, income, and duplicate entries. Or the date range for "previous month" is spanning too wide a window.

### H2. Net Worth — Bank Account Balances Not Counted as Assets
**URL:** /net-worth
**Issue:** Total Assets shows $3.44 (only an investment account). Bank accounts with real balances ($14,000 savings, checking accounts) are not being included as assets. Total Liabilities shows -$1,364,450.70 which may be inflated.
**Root Cause:** In `server/routes/engine.ts`, the net-worth endpoint may not be including `NormalizedAccount[]` bank account balances in the asset calculation. The `calculateNetWorth()` function receives `bankAccounts` but may not be summing checking/savings accounts as assets.

### H3. Liabilities Page — "Total Liabilities" Shows $0
**URL:** /liabilities
**Issue:** The header card shows "Total Liabilities $0" despite the page listing $1.15M in mortgages, $90K in lines of credit, $23K in credit cards, and $21K in loans.
**Root Cause:** The total calculation at the top of the liabilities page is broken — likely returning 0 or not summing the linked account balances.

### H4. Dashboard — Multiple Incorrect Values
**URL:** /dashboard
**Issues:**
- Total Assets: $0.00 (should include bank + investment accounts)
- Predicted Spending (30 days): $98,639 — absurdly high, derived from bad expense data
- Budgeted Spending equals Total Outgoing ($13,765.41) — should show budget amounts, not actuals
- Daily Allowance shows blank ("per day until payday" with no dollar amount)
- Financial Health Score: 75/100 with "90.3% savings rate" contradicts negative cash flow of -$6,681.73

### H5. Income Page — No Date Filtering & Duplicate Entries
**URL:** /income
**Issues:**
- Shows all income entries going back to March 2024 with no filtering to current month
- Duplicate entries visible (same Plaid transaction IDs appearing twice)
- All entries categorized as "Salary" regardless of actual type (ATM Deposit, Interest Payment, Cashback Reward, E-Transfer)
- Raw Plaid transaction IDs exposed in UI notes field

### H6. Bank Accounts Page — Summary Cards All $0.00
**URL:** /accounts
**Issues:**
- Net Worth card: $0.00
- Spending card: $0.00
- Actual Income card: $0.00
- Unmatched count: 0 — but transaction list shows many "Unmatched" items
- The `/api/engine/bank-accounts` endpoint is returning zeros for all summary metrics even though transaction data is present below

### H7. Investments Page — Total Value Shows $0.00
**URL:** /investments
**Issue:** Total Value, Cost Basis, Gain/Loss all show $0.00. But account list below shows iTrade-Cash $3.44, Registered Savings $41,244.07, etc. Account balances are displayed but not summed to the totals.

---

## MEDIUM (UI/UX & Data Quality Issues)

### M1. Bills Page — All Bills Show Same Due Date (Today)
**URL:** /bills
**Issue:** Every single bill (40+ bills) shows "Next Due: Apr 10, 2026" and "Due in 0d". Bills with weekly, biweekly, and monthly recurrences all show the same date. Start Date column is empty for all bills. Balance and Payments Left columns are all dashes.
**Root Cause:** The bill detection/due date calculation logic is not computing actual next due dates based on recurrence patterns and start dates.

### M2. Bills Page — Excessive "Other" Categorization
**URL:** /bills
**Issue:** ~20 out of 40 bills are categorized as "Other" including recognizable items:
- "Loans Td On-line Loans System" → Other (should be Loans)
- "Miscellaneous Payment Td On-line Loans System" → Other (should be Loans)
- "Bell Canada" → Other (should be Communications/Phone)
- "Prime Video Bc" → Other (should be Entertainment)
- "Insurance Ind All Life In" → Other (should be Insurance)

### M3. Bills Page — Potential Duplicate Entries
**URL:** /bills
**Issues:**
- "Apos" ($22.66) and "Apos A" ($15.91) — likely same vendor
- "Ad Free Prime Video" ($3.38) and "Prime Video Bc" ($3.38) — same amount, likely duplicate
- "Pos Purchase Opos Peloton* Membership" ($64.03) and "Peloton Membership" ($62.15) — likely same subscription
- "Miscellaneous Payment Td On-line Loans System" ($303.02) and "Loans Td On-line Loans System" ($303.41) — nearly identical amounts

### M4. Expenses Page — Source Label Mismatch
**URL:** /expenses
**Issue:** All expenses show "Source: Manual" even when they're labeled "Auto-imported from bank transaction". The source field isn't reflecting the actual data origin.

### M5. Expenses Page — Incorrect Category Assignments
**URL:** /expenses
**Issue:** Bell Canada and Bell Mobility (telecommunications companies) are categorized as "Healthcare" instead of "Communications" or "Phone".

### M6. Bank Accounts — Data Quality Issues
**URL:** /accounts
**Issues:**
- "Bank NSF Fee" amounts (+$321.16, +$51.33) counted as income — NSF fees are bank charges, not income
- "Scotiabank Transit +$300.00" categorized as "Public Transit" and "income" — likely an internal transfer
- Refunds from Old Navy (+$30.28) and H&M (+$31.49) appearing as income
- Duplicate Scotiabank connections (one "error" status, one "active") showing same accounts with slightly different balances
- Two Mortgage Payment entries on same day: $4,389.48 and $213.24 (very different amounts)

### M7. Budgets Page — Empty for April 2026
**URL:** /budgets
**Issue:** Shows "No budgets set for this month" for April 2026. If budgets were set for previous months, there should be a way to carry them forward or at least show the user their historical budgets.

### M8. Reports Page — Loans as Top Spending Category
**URL:** /reports
**Issue:** "Loans" shows as #1 spending category at $7,685.62 (55.8%). Loan repayments are debt service, not discretionary spending. They should either be in a separate section or excluded from the spending breakdown with a toggle.

### M9. Net Worth Page — Negative Liability Display
**URL:** /net-worth
**Issue:** Liabilities shown with negative signs (-$1,364,450.70, -$1,288,905.46, -$75,545.24). Convention is to display liability amounts as positive numbers (the negative is implied by being a liability).

---

## LOW (Minor Issues)

### L1. Savings Goals — URL Mismatch in Navigation
The sidebar/navigation likely links to `/savings-goals` but the actual route is `/savings` (defined in App.tsx line 95). Users who bookmark or share links with `/savings-goals` will get a 404.

### L2. Currency Format
Multiple pages use USD formatting ($) — should be CAD for a Canadian user with Canadian bank accounts (Scotiabank, TD Canada Trust).

### L3. Debts Route Redirect
Navigating to `/debts` redirects to `/liabilities` which is correct behavior per the route config, but the sidebar navigation label and any internal links should be consistent.

---

## Cline Prompts (Execute in Order)

### Prompt 1 — Fix Subscriptions Page Crash (C1)

```
In client/src/pages/subscriptions.tsx, the page crashes with "ReferenceError: nextDue is not defined" at line 649. The variable `nextDue` is used inside the Cancellation Reminder dialog JSX (line 649: `format(nextDue, "MMM d, yyyy")`) but it's only defined inside the `getNextDueDate()` function scope (lines 52-69).

Fix: The Cancellation Reminder dialog component needs to compute `nextDue` from the bill's data before using it. Look at how `nextDue` is calculated in the `getNextDueDate` function and either:
1. Call `getNextDueDate(bill)` and store the result in a local variable before the JSX that references it, OR
2. Pass the computed nextDue date as a prop if this is a sub-component.

The dialog is around line 642-680. The `bill` object should be available in scope — use it to calculate the next due date. The `getNextDueDate` function is defined at lines 40-69 and takes recurrence and dueDay as parameters.

After fixing, verify the subscriptions page loads without console errors by running `npx tsc --noEmit` and checking for any TypeScript issues.
```

### Prompt 2 — Fix Debt Payoff Page Crash (C2)

```
In client/src/pages/debt-payoff.tsx, the page crashes with "TypeError: Cannot read properties of undefined (reading 'totalInterest')".

Two issues to fix:

1. Line 507: `avalancheResult?.totalInterest.toFixed(0)` — the optional chain stops at `totalInterest` but `.toFixed(0)` is called on undefined. Change to `(avalancheResult?.totalInterest ?? 0).toFixed(0)`. Same fix needed on line 508 for `snowballResult?.totalInterest.toFixed(0)`.

2. More importantly: the `/api/engine/debts` endpoint at server/routes/engine.ts line 540 may be returning a 500 error. Check:
   - Does `storage.getDebtDetails(userId)` exist and work? The method might be named differently (e.g., `getDebtDetailsByUserId`).
   - Test the endpoint: start the dev server and curl `GET /api/engine/debts?extraPayment=0` with a valid session.
   - If the endpoint returns correctly shaped data, the client-side crash is purely the optional chaining issue above.

Also add null-safe guards throughout the component: anywhere `avalancheResult` or `snowballResult` is accessed, ensure it handles the case where the API returns no data gracefully (show a loading state or "No debts found" message).
```

### Prompt 3 — Fix Expenses "Total Last Month" $80,918.99 (H1)

```
The expenses page shows "Total Last Month: $80,918.99" which is incorrect. This value comes from the `previousTotal` field in the `/api/engine/expenses` endpoint response.

In server/lib/financial-engine/expenses.ts, the `calculateExpensesForPeriod` function computes the previous period total. Debug this:

1. Check that `prevMonthStart` and `prevMonthEnd` date parameters are correctly scoped to just the previous calendar month (not spanning multiple months or the entire transaction history).

2. In server/routes/engine.ts, find the `/expenses` endpoint and verify the date calculations for `prevMonthStart` and `prevMonthEnd`. They should be exactly one month before the requested period.

3. The deduplication logic in `deduplicateExpenses()` must be running for the previous period too — ensure transfers (tx.isTransfer), income transactions (tx.isIncome), and pending transactions (tx.isPending) are all excluded from the previous month total.

4. Verify that credit/positive transactions (refunds) are not being summed as expenses.

Add a console.log in the expenses endpoint to output: the date range, raw transaction count, filtered count, and computed previousTotal. Then test with a curl request.
```

### Prompt 4 — Fix Net Worth Asset Calculation (H2)

```
The net worth page shows Total Assets: $3.44 when it should include bank account balances (~$14,000 in savings, checking accounts, etc.).

In server/routes/engine.ts, the /net-worth endpoint calls `calculateNetWorth()` and passes `bankAccounts: NormalizedAccount[]`. In server/lib/financial-engine/net-worth.ts, verify that:

1. The `calculateNetWorth` function includes bank account balances in the asset total. Checking accounts, savings accounts, and brokerage accounts should be counted as assets. Credit cards, lines of credit, mortgages, and loans should be counted as liabilities.

2. The `NormalizedAccount` objects have their `accountType` field correctly mapped. Check that the `accountType` field from PlaidAdapter correctly categorizes: "depository" / "checking" / "savings" as assets, and "credit" / "loan" / "mortgage" as liabilities.

3. Also ensure the assets, debts, investmentAccounts, holdings, and history arrays are being fetched from storage (they were previously passed as empty arrays). Check if storage methods exist:
   - storage.getAssetsByUserId() or similar
   - storage.getInvestmentAccountsByUserId() or similar
   - storage.getHoldingsByAccountId() or similar
   - storage.getNetWorthHistory() or similar
   
   Look in server/storage.ts for the correct method names and wire them up.
```

### Prompt 5 — Fix Liabilities Page Total ($0) (H3)

```
The liabilities page at /liabilities shows "Total Liabilities $0" in the header card, despite listing $1.15M+ in mortgages, lines of credit, credit cards, and loans below.

In client/src/pages/liabilities.tsx, find where the "Total Liabilities" header value is computed. It's likely:
- Using a separate API call that returns 0, OR
- Computing a sum from the data but the calculation is broken (possibly summing string values instead of numbers, or the data structure changed after the engine refactor)

Check if the liabilities page uses the `/api/engine/debts` endpoint or its own data fetching. If it fetches from `/api/debts` or `/api/liabilities`, the total may need to be calculated from the linked Plaid accounts' balances plus manual debts.

Fix the total to correctly sum all liability balances from both linked bank accounts and manually tracked debts.
```

### Prompt 6 — Fix Bank Accounts Summary Cards (H6)

```
The bank accounts page (/accounts) shows $0.00 for Net Worth, Spending, Actual Income, and 0 for Unmatched count in the summary cards at the top, even though transaction data is displayed below.

In client/src/pages/bank-accounts.tsx, the summary cards likely query `/api/engine/bank-accounts?month=2026-04`. In server/routes/engine.ts, the bank-accounts endpoint computes totalBalance, monthlySpending, monthlyIncome, and unmatchedCount.

Debug the endpoint:
1. Check if `getAllNormalizedAccounts(userIds)` returns accounts with valid balance numbers
2. Check if `getAllNormalizedTransactions(userIds, startDate, endDate)` returns transactions for the requested month
3. Verify the sum calculations handle the Plaid sign convention correctly (negative amounts = spending in Plaid, but after normalization via the adapter, amounts should already be positive with direction indicated by the `direction` field)
4. Verify `unmatchedCount` logic — count transactions where `matchedExpenseId` is null or `matchType` is 'unmatched'

Add logging to the endpoint and test with curl to see what values are being computed.
```

### Prompt 7 — Fix Income Page Date Filtering & Duplicates (H5)

```
The income page at /income has three issues:

1. NO DATE FILTERING: All income entries from March 2024 onward are shown, ignoring the current month filter. In client/src/pages/income.tsx, check if the page passes date range parameters to its API query. The useQuery call should include startDate and endDate for the selected month.

2. DUPLICATE ENTRIES: Same Plaid transaction IDs appear twice. This could be caused by:
   - The `getAllNormalizedTransactions()` function in server/routes/engine.ts fetching from multiple Plaid items that share the same underlying bank, OR
   - Not deduplicating by transaction ID before returning results
   Add a dedup step: group by normalized transaction ID and keep only unique entries.

3. WRONG CATEGORIES: All income entries show "Salary" regardless of type. In the income engine (server/lib/financial-engine/income.ts), check how `bySource` categories are assigned. ATM Deposits, Interest Payments, Cashback Rewards, and E-Transfers should not all be "Salary". Use the transaction's category or merchant name to determine the income source type.

4. EXPOSED PLAID IDs: Raw Plaid transaction IDs are showing in the UI notes field. In the client page, don't display the `plaid_transaction_id` or internal IDs to the user.
```

### Prompt 8 — Fix Bills Due Date Calculation (M1)

```
On the bills page (/bills), every single bill shows "Next Due: Apr 10, 2026" (today) and "Due in 0d" regardless of recurrence frequency (weekly, biweekly, monthly). Start dates are all empty.

In server/routes/engine.ts, the /bills endpoint calls the bills engine. In server/lib/financial-engine/bills.ts, check:

1. How `dueDate` is being set on each BillOccurrence — it appears to be defaulting to today's date instead of calculating the actual next due date based on the bill's startDate and recurrence pattern.

2. The `getNextDueDate()` function should use the bill's original start date and recurrence to compute when the bill is actually next due. For monthly bills, it's start_day of next month if already past this month. For weekly, it's the next occurrence of that weekday. For biweekly, add 14 days from the last occurrence.

3. Verify that bill records in the database have start dates populated. If bills are auto-detected from transactions, the start date should be the date of the first detected transaction for that bill.

Also fix the categories: bills like "Loans Td On-line Loans System" should be "Loans" not "Other", "Bell Canada" should be "Communications", "Insurance Ind All Life In" should be "Insurance", "Prime Video Bc" should be "Entertainment".
```

### Prompt 9 — Fix Dashboard Derived Values (H4)

```
The dashboard at /dashboard has several incorrect values. Most are downstream effects of other bugs, but some need independent fixes:

1. DAILY ALLOWANCE BLANK: The safe-to-spend section shows "per day until payday" with no dollar amount. In server/lib/financial-engine/safe-to-spend.ts, check if `dailyAllowance` is returning NaN or undefined. Ensure the calculation handles the case where income or bills data might be zero.

2. BUDGETED SPENDING = ACTUAL SPENDING: Both show $13,765.41. In the dashboard endpoint, verify that "Budgeted Spending" pulls from the user's budget totals (from the budgets table), not from actual transaction amounts.

3. HEALTH SCORE CONTRADICTION: Score shows 75/100 with "90.3% savings rate" but cash flow is -$6,681.73 (deficit). In server/lib/financial-engine/health-score.ts, the savings rate calculation may be using budgeted values instead of actuals. A negative cash flow should result in a 0% or negative savings rate, which should lower the health score significantly.

These should be re-tested after Prompts 3-6 are applied, as fixing expenses, net worth, and bank accounts data will improve many dashboard values.
```

### Prompt 10 — Fix Investments Total Value (H7)

```
The investments page at /investments shows Total Value: $0.00 even though investment accounts are listed below with balances (iTrade-Cash $3.44, Registered Savings $41,244.07, etc.).

In client/src/pages/investments.tsx, check how the total value is computed:
1. If it comes from an API endpoint, check if that endpoint is summing account balances
2. If it's computed client-side, check if the account data structure has changed (e.g., balance field renamed)
3. The account list renders correctly so the data IS there — the sum just isn't being calculated

Fix the total to sum all investment account balances. Also ensure Cost Basis and Gain/Loss reflect actual data or show "N/A" if holdings data isn't available yet.
```

### Prompt 11 — General Data Quality Fixes (M4, M5, M8, M9, L2)

```
Several data quality and display issues across the app:

1. EXPENSE SOURCE LABEL (M4): In client/src/pages/expenses.tsx, expenses show "Source: Manual" even when auto-imported. Check if the source field from the engine response maps correctly — should show "Plaid", "MX", or "Manual" based on the transaction's provider field.

2. BELL CANADA CATEGORY (M5): Bell Canada and Bell Mobility are categorized as "Healthcare". This is a category mapping issue — check the AI category detection or Plaid's category mapping. These should be "Communications" or "Phone".

3. LOANS IN SPENDING (M8): On the reports page, loan repayments show as the top spending category. Consider adding a toggle or filter to separate debt service from discretionary spending in the category breakdown.

4. NEGATIVE LIABILITY DISPLAY (M9): On the net-worth page, liabilities show with negative signs (-$1,364,450.70). Display liability amounts as positive numbers — the context (being under "Liabilities") implies the negative.

5. CURRENCY (L2): The app uses USD formatting ($) but the user has Canadian bank accounts (Scotiabank, TD). Either auto-detect currency from bank connections or allow the user to set their preferred currency in settings. At minimum, amounts should display as CAD.
```

### Prompt 12 — TypeScript & Build Verification

```
After applying all the above fixes:

1. Run `npx tsc --noEmit` and fix any TypeScript compilation errors
2. Run `npm run build` to verify the production build succeeds
3. Start the dev server and smoke test these previously-crashing pages:
   - /subscriptions — should load without "nextDue is not defined" error
   - /debt-payoff — should load without "totalInterest" error
4. Verify the /api/engine/expenses endpoint returns a reasonable previousTotal (not $80,918.99)
5. Verify /api/engine/bank-accounts returns non-zero values
6. Verify /api/engine/net-worth includes bank balances in assets
7. Commit all changes and push to main for Railway deployment
```

---

## Summary

| Severity | Count | Key Issues |
|----------|-------|------------|
| CRITICAL | 2 | Subscriptions page crash, Debt Payoff page crash |
| HIGH | 7 | Wrong expense totals, net worth missing assets, liabilities total $0, dashboard errors, income no filtering, bank accounts $0, investments total $0 |
| MEDIUM | 9 | Bills all same due date, excessive "Other" categories, duplicate bills, source labels, wrong categories, bank data quality, empty budgets, loans as spending, negative display |
| LOW | 3 | URL mismatch, currency format, route consistency |
| **TOTAL** | **21** | |
