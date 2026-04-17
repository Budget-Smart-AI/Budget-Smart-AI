# UAT-9 Report — Budget Smart AI

**Date:** 2026-04-17
**Baseline:** UAT-8 (2026-04-17) — 6/6 closed. Money Timeline, cadence buckets, transfer filters, and Add-Income button all passing.
**Trigger for UAT-9:** Live-dashboard walkthrough after UAT-8 ship surfaced three widget-level numeric defects — Silent Money Leaks (49 false positives, ~$5,246/mo), The Gap (Income Gap -$5,781 mid-month), and Spendability Meter (Daily Allowance $100, Days-to-Payday hard-coded to 30).

> **Directive from product owner:** "These are dashboard items so I'd like to not add additional complexity."

---

## Executive summary

Three widget-level defects fixed with minimum-surface-area changes: no new endpoints, no new routes, no new schema. All three reuse existing filter patterns from UAT-8 to keep widgets aligned with the main cash-flow engine.

| Widget | Before | After | Root cause |
|---|---|---|---|
| Silent Money Leaks | 49 leaks / $5,246/mo (mostly transfers + mortgage variance) | Only true recurring-small leaks (<$50 w/ consistent cadence) | No filter for transfers/loans/bills + `price_increase` branch flagging normal variance |
| The Gap: Income | -$5,781.08 mid-month (compared actual MTD vs full-month plan) | Prorated to days elapsed — ~0 when on-track | Raw `actual - monthly-plan` with no proration |
| Spendability Meter | Daily Allowance $100, Days-to-Payday always 30 | Real `safeToSpend / daysUntilNextPayday` with walk-forward cycle detection | Read non-existent `payFrequency` field, fell through to `"30"` default |

**Issue count:** 3 identified → **3 closed** (100%).

---

## Root-cause findings

### RC-1 · Silent Money Leaks reported $5,246/month with 49 false positives

**Where:** `server/routes.ts:11628-11859` (`GET /api/leaks/detect`)

**What was wrong (two bugs in one endpoint):**

1. **No transfer/loan/bill exclusion.** The detector looped over *every* Plaid transaction with `amount > 0` and grouped by merchant name. Internal transfers (Scotiabank "Customer Transfer Dr. MB-*"), mortgage payments, auto-loan payments, and interac e-transfers all looked like "recurring charges". They varied month-to-month (mortgage principal drifts, transfer amounts differ), so the `price_increase` branch flagged them as leaks with rising prices.

2. **`price_increase` detection had no reliable signal.** Any merchant whose first-vs-last amount rose ≥10% was flagged. Mortgages, utilities, and transfers all have natural variance well above 10% — this branch was responsible for virtually every visible false positive.

**Fix:** Five transaction-level guards + drop `price_increase` entirely.

```ts
const EXCLUDE_CATEGORIES = new Set([
  "Transfer", "Loan Payment", "Bank Fees", "Interest",
  "Payment", "Credit Card Payment",
]);
const EXCLUDE_PFC_PREFIXES = [
  "TRANSFER_IN_", "TRANSFER_OUT_",
  "LOAN_PAYMENTS_", "LOAN_DISBURSEMENT_",
  "BANK_FEES_",
];
const TRANSFER_NAME_PATTERN =
  /\b(transfer|tfr|xfer|...|mortgage\s+payment|mortgage\s+trans|principal|auto\s+loan|student\s+loan|loan\s+pmt)\b/i;
```

Guards applied inside the transaction loop:

1. `tx.isTransfer === true` → skip (UAT-8 boolean flag)
2. `category ∈ EXCLUDE_CATEGORIES` → skip
3. `personalFinanceCategoryDetailed` starts with any `EXCLUDE_PFC_PREFIXES` → skip
4. `merchantName/name` matches `TRANSFER_NAME_PATTERN` → skip (Scotiabank-style fallback)
5. Merchant name matches any of the user's declared Bills → skip (not a "hidden" leak)

Additionally, the entire `price_increase` detection block is removed. Only `recurring_small` (avg < $50, consistent 7/14/30/365-day cadence) survives — which is the actual "forgot about this subscription" use case the widget exists for.

**Client-side:** Wired the `View all X leaks` button to `navigate('/subscriptions')` (existing page handles detail view — no new modal).

**Files touched:**
- `server/routes.ts` — endpoint refactor + parallel `getBills` fetch
- `client/src/components/money-leaks-widget.tsx` — `useLocation` import + `onClick` handler

---

### RC-2 · The Gap: Plan vs Reality showed -$5,781 Income Gap mid-month

**Where:** `server/engine/routes/core.ts:193-215` (dashboard `gaps` object)

**What was wrong:** The engine was computing

```ts
const incomeGap = income.actualIncome - income.budgetedIncome;
```

at line ~200. On April 17 (day 17 of 30), the user's month-to-date income had only accumulated 17/30 of the full-month plan — but the calc compared it against the *full* monthly plan. Result: a healthy on-track user looked like they were short ~40% of plan.

Same bug applied to `spendingGap` and `savingsGap`.

**Fix:** Prorate the planned side by the fraction of the month elapsed.

```ts
const daysInMonth = getDaysInMonth(today);
const daysElapsed = Math.min(today.getDate(), daysInMonth);
const elapsedRatio = daysInMonth > 0 ? daysElapsed / daysInMonth : 1;

const expectedIncomeToDate   = income.budgetedIncome * elapsedRatio;
const expectedSpendingToDate = budgetTotal          * elapsedRatio;
const expectedBillsToDate    = bills.monthlyEstimate * elapsedRatio;

const incomeGap   = income.actualIncome - expectedIncomeToDate;
const spendingGap = expenses.total      - expectedSpendingToDate;
const actualSavings         = income.actualIncome - expenses.total - bills.monthlyEstimate;
const expectedSavingsToDate = expectedIncomeToDate - expectedSpendingToDate - expectedBillsToDate;
const savingsGap = actualSavings - expectedSavingsToDate;
```

Gap is now ~0 when on-track mid-month, and only flags real variance against the time-proportional expectation.

**Files touched:**
- `server/engine/routes/core.ts` — added `getDaysInMonth` import + proration block

---

### RC-3 · Spendability Meter showed Daily Allowance $100 / Days-to-Payday 30

**Where:** `server/routes.ts:12051-12122` (`GET /api/autopilot/spendability`)

**What was wrong (three bugs):**

1. **Wrong field name.** Code read `i.payFrequency` — that field does not exist in the `incomes` schema. The schema uses `recurrence`. The old ternary fell through to the literal string `"30"`.

2. **Returned cycle length, not days-until-payday.** Even when a frequency *was* matched, the response was the cycle LENGTH (7 / 14 / 30 / 365), not the number of days until the next paycheck.

3. **Only `incomes[0]` considered.** A user with multiple active income sources (e.g. primary salary biweekly, side gig monthly) was judged by whichever was first in the array, not whichever pays soonest.

**Fix:**

```ts
function cycleDays(recurrence: string | null | undefined): number | null {
  switch (recurrence) {
    case "weekly":   return 7;
    case "biweekly": return 14;
    case "monthly":  return 30;
    case "yearly":   return 365;
    default: return null;
  }
}

const paydays = incomes
  .filter(i => i.isActive !== "false")
  .map(i => {
    const cycle = cycleDays((i as any).recurrence);
    if (!cycle) return null;
    const startRaw = (i as any).date;
    if (!startRaw) return null;
    const start = new Date(startRaw + "T00:00:00");
    if (isNaN(start.getTime())) return null;

    // Walk forward in cycle-day increments until strictly after today.
    let next = new Date(start);
    while (next.getTime() <= todayLocal.getTime()) {
      next = new Date(next.getTime() + cycle * MS_PER_DAY);
    }
    const daysUntil = Math.ceil((next.getTime() - todayLocal.getTime()) / MS_PER_DAY);
    return Math.max(1, daysUntil);
  })
  .filter((d): d is number => d !== null && isFinite(d));

const daysUntilNextPayday = paydays.length > 0 ? Math.min(...paydays) : 14;
const dailyAllowance      = safeToSpend / Math.max(1, daysUntilNextPayday);
```

- Uses real `recurrence` field
- Walks each active income's date forward until the next payday is strictly after today
- Takes `Math.min(...)` across all active incomes — the soonest paycheck wins
- Fallback to 14 days (biweekly default) only when no valid income records exist

**Response field** renamed from `nextIncomeDate` → `daysUntilNextPayday` for clarity. Client widget already expects this name (see `spendability-widget.tsx:15`).

**Files touched:**
- `server/routes.ts` — spendability endpoint rewrite

---

## Test matrix

| Scenario | Leaks | Gap (income) | Spendability |
|---|---|---|---|
| Mortgage payment varies $2,100 → $2,105 → $2,118 | Not flagged (bill-match + TRANSFER_NAME_PATTERN) | N/A | N/A |
| Scotia "Customer Transfer Dr. MB-*" $500 repeating | Not flagged (TRANSFER_NAME_PATTERN) | N/A | N/A |
| $7.99 streaming subscription 3 months running | Flagged (recurring_small, monthly) | N/A | N/A |
| MTD income $5,223 on Apr 17, plan $9,400 | N/A | incomeGap ≈ 0 (prorated to 17/30 × 9400 = 5326.67) | N/A |
| Biweekly paycheck last paid 2026-04-10, today 2026-04-17 | N/A | N/A | daysUntilNextPayday = 7 |
| No active incomes | N/A | N/A | daysUntilNextPayday = 14 (fallback) |
| Two incomes: biweekly (7d out) + monthly (21d out) | N/A | N/A | daysUntilNextPayday = 7 (min) |

---

## Non-regression notes

- Leak detector still respects the rate-limit + feature-gate (`silent_leaks_detector`) and still persists alerts via `storage.getLeakAlerts`.
- Gap proration preserves `negativeCashFlow`, `budgetOverage`, `planVsRealityMismatch` alert semantics — those now fire only on real variance.
- Spendability `status` banding (safe / caution / danger) unchanged; only the denominator of `dailyAllowance` changed.
- No schema changes. No new endpoints. Engine isolation (api.budgetsmart.io) unaffected — same routes, same response shapes except for `daysUntilNextPayday` field rename on one endpoint.

---

## Files changed

```
client/src/components/money-leaks-widget.tsx
server/engine/routes/core.ts
server/routes.ts
uat-reports/UAT-9-REPORT.md            (new)
```

---

## Follow-ups (non-blocking)

1. **Spendability: prefer `nextExpectedDate` when stored.** The `incomes` table has a `nextExpectedDate` column on some rows; if populated, use it directly instead of walking the cycle forward. Not done here because the column is nullable and the walk-forward is correct in all cases.
2. **Leak detector: persist a hash per leak** so dismissed leaks don't keep re-appearing. Currently `existingAlerts.length` is surfaced but not used to filter the returned `leaks` array.
3. **Gap widget: consider also returning the prorated expected values** so the client can explain the variance (e.g. "You're $200 ahead of your prorated income plan of $5,326"). Current response is just the delta.
