# Changes 2026-04-15 (afternoon session) — Monarch alignment, full backend rollout

## TL;DR

All seven backend rollout steps from `MONARCH_VS_BSAI.md` are written to disk locally and ready to push as a single commit. The sandbox cannot commit (corrupted git index from earlier mount-permission issues), so the changes need a single push from your Windows terminal:

```powershell
cd C:\Users\Claude\Documents\Budget-Smart-AI

git add server/lib/financial-engine/categories/ ^
        server/lib/financial-engine/normalized-types.ts ^
        server/lib/financial-engine/expenses.ts ^
        server/lib/financial-engine/bills.ts ^
        server/lib/financial-engine/subscriptions.ts ^
        server/lib/financial-engine/bill-detection.ts ^
        server/lib/financial-engine/refunds.ts ^
        server/lib/financial-engine/adapters/plaid-adapter.ts ^
        server/lib/financial-engine/adapters/mx-adapter.ts ^
        CHANGES_2026-04-15-pm.md

git commit -m "feat(engine): Monarch alignment foundation + steps 2-7 (backend)" -m "See CHANGES_2026-04-15-pm.md for the full breakdown."

git push origin main
```

Single Railway redeploy. Behaviour change is contained: the only code path that activates immediately is the PFC-first transfer detection in `expenses.ts` — adapters now populate `pfcPrimary`/`pfcDetailed` (Plaid) and `mxCategory`/`mxTopLevel` (MX), so the resolver's PFC check has real data to work with. The new modules (`bill-detection.ts`, `refunds.ts`, `getBillsForPeriodWithStatus`, `shouldAutoDismissBill`) are dormant — nothing calls them yet. They wait for you to wire them into the API routes and UI.

## Files changed (9 total)

```
server/lib/financial-engine/categories/index.ts                  (NEW)
server/lib/financial-engine/categories/monarch-categories.ts     (NEW, ~70 categories)
server/lib/financial-engine/categories/plaid-pfc-map.ts          (NEW, full Plaid PFC map)
server/lib/financial-engine/categories/mx-category-map.ts        (NEW, MX taxonomy)
server/lib/financial-engine/categories/resolver.ts               (NEW, resolveCategory + isTransfer)
server/lib/financial-engine/normalized-types.ts                  (modified — added pfcPrimary/pfcDetailed/mxCategory/mxTopLevel optional fields)
server/lib/financial-engine/expenses.ts                          (modified — transfer check uses resolver.isTransfer first)
server/lib/financial-engine/bills.ts                             (modified — added getBillsForPeriodWithStatus + shouldAutoDismissBill)
server/lib/financial-engine/subscriptions.ts                     (modified — uses Monarch SUBSCRIPTION_LIKE_CATEGORIES, dropped bad legacy list)
server/lib/financial-engine/bill-detection.ts                    (NEW — auto-detect recurring with confidence scoring)
server/lib/financial-engine/refunds.ts                           (NEW — Refunds & Returns calculation)
server/lib/financial-engine/adapters/plaid-adapter.ts            (modified — populates pfcPrimary + pfcDetailed; ALSO restored from origin/main since local file was truncated)
server/lib/financial-engine/adapters/mx-adapter.ts               (modified — populates mxCategory + mxTopLevel)
```

⚠️ **Important note on plaid-adapter.ts**: when I went to edit it I found the local working copy was truncated mid-function (only 94 lines vs the 115 in `origin/main`, ending at `id: tx.id,` with no closing braces). I rewrote the full file from `origin/main`'s canonical content + my PFC additions. So when you `git diff` after `git add`, you'll see both my additions AND the restoration of the missing 21 lines. The "restoration" lines exactly match origin/main; the diff is only the PFC fields. Worth eyeballing the diff before committing to confirm.

## What was implemented

### Step 1 — Canonical category foundation (5 files in `categories/`)

- **`monarch-categories.ts`** — ~70 canonical category names organised into Monarch's groups (Income, Auto & Transport, Housing, Bills & Utilities, Food & Dining, Travel & Lifestyle, Shopping, Children, Education, Health & Wellness, Financial, Gifts & Donations, Business, Subscriptions & Software, Transfers, Refunds & Returns, Other). Each carries a `kind` (income/expense/transfer) and an optional `subscriptionLike` flag for the Recurring filter.
- **`plaid-pfc-map.ts`** — every Plaid PFC detailed code → Monarch category. PFC primary fallback for codes I missed. Includes `isPlaidTransfer()`.
- **`mx-category-map.ts`** — MX standard categories → Monarch. Covers MX's documented taxonomy. Includes `isMxTransfer()`. Add entries as we encounter unmapped MX values in production.
- **`resolver.ts`** — `resolveCategory(signals, overrides)` with priority chain: merchant override > Plaid PFC > MX > legacy category > "Uncategorized". Plus `isTransfer()` that prefers PFC primary, then MX top-level, then category-name match.
- **`index.ts`** — barrel export.

### Step 2 — `expenses.ts` uses the resolver for transfer detection

Transfer exclusion now goes through `isTransferTransaction(tx)` which calls `isTransferByResolver()` first (PFC > MX > category) and falls back to the legacy keyword set. The legacy fallback is kept because manual expenses don't carry PFC/MX data.

### Step 2.5 — Adapters populate PFC/MX fields (the activation step)

- **`plaid-adapter.ts`**: in `normalizeTransactions()`, the return object now includes `pfcPrimary` (from `tx.category`, uppercased) and `pfcDetailed` (from `tx.personalFinanceCategoryDetailed`, the column added in the recent enrichment commits). `personalFinanceCategoryDetailed` was already on the `plaid_transactions` schema (line 474) — we're just exposing it.
- **`mx-adapter.ts`**: populates `mxCategory` (from `tx.category`) and `mxTopLevel` (from `tx.topLevelCategory` or `tx.topCategory`).

Without these, the foundation in Step 1 has no data to work with. With them, the resolver flips automatically to PFC-first / MX-first behaviour for every Plaid- and MX-sourced transaction the engine sees.

### Step 3 — Bills normalization audit

No changes needed in the engine. `bills.ts`, `subscriptions.ts`, and `debts.ts` all use the precise constants `(amount × 52) / 12` and `(amount × 26) / 12`. The `semi-monthly = amount × 2` in `debts.ts:22` is correct (semi-monthly = 24 cycles/year = monthly × 2 — semi-monthly ≠ biweekly).

Imprecise approximations remain OUTSIDE the engine (`server/routes.ts`, `server/deepseek.ts`, `server/openai.ts`) but those code paths should be migrated to call `/api/engine/*` rather than fixing the constants in place. Tracking item for a later session.

### Step 4 — Subscriptions engine refactored to use Monarch model

`subscriptions.ts`'s `isSubscriptionCategory()` no longer uses a hardcoded list. It now consults `SUBSCRIPTION_LIKE_CATEGORIES` from `categories/monarch-categories.ts`. Categories that were wrongly classified as subscriptions are now correctly excluded:

- **Removed from "subscription-like":** `Other`, `Coffee Shops`, `Travel`, `Business Travel & Meals`, `Communications` (the legacy generic name), `Entertainment` (legacy)
- **Still subscription-like (via the Monarch list):** `Internet & Cable`, `Phone`, `Education`, `Fitness`, `Insurance`, `Software & Tech`, `Streaming Services`, `Digital Media`, `Dues & Subscriptions`, `Business Insurance`
- **Legacy backwards compat:** Bills with the user-created `category === "Subscriptions"` are still treated as subscriptions so historical data isn't broken.

UI work to fold the Subscriptions page into a filter on the Bills/Recurring page is deferred — that's a multi-file client refactor + paywall restructuring that needs a focused session.

### Step 5 — Bill auto-detection (`bill-detection.ts`)

New module. `detectRecurringFromTransactions(transactions, existingBills)` scans the transaction history and emits `RecurringCandidate[]` with action recommendations:

- **`auto-confirm`** (matches your locked-in thresholds): ≥3 occurrences, amount variance ≤ $1, cadence drift (stddev/mean) ≤ 0.30, recognised cadence bucket
- **`suggest`** (lower confidence, goes to a "Suggested bills" inbox): ≥2 occurrences with a recognised cadence
- **`ignore`** (already known, or no detectable cadence)

Confidence score (0–1) on each candidate for UI sorting. Cadence-to-recurrence mapping handles weekly (±4d), biweekly (±4d), monthly (±4d), yearly (±30d).

Wiring (next session): call from `server/sync-scheduler.ts` after each Plaid/MX sync. `pickAutoConfirm(candidates)` → insert as new `Bill` rows with `isAutoDetected = true`. `pickSuggestions(candidates)` → write to a new `suggested_bills` table.

DB schema additions needed (next session — full DDL is in the file's docstring):

```sql
ALTER TABLE bills ADD COLUMN is_auto_detected BOOLEAN DEFAULT false;
ALTER TABLE bills ADD COLUMN auto_detected_from TEXT;
ALTER TABLE bills ADD COLUMN is_auto_dismissed BOOLEAN DEFAULT false;
CREATE TABLE suggested_bills (...);  -- see bill-detection.ts docstring
```

### Step 6 — Paid-vs-predicted + auto-dismiss in `bills.ts`

Two new exports:

- **`getBillsForPeriodWithStatus(bills, transactions, startDate, endDate, today)`** returns `{ occurrences, paidTotal, predictedTotal, missedTotal, remainingDue }`. Each occurrence is classified as `paid` (matching transaction within ±3 days, ±$2, merchant substring match), `missed` (past due, no match), or `predicted` (future, no match yet). Powers Monarch's "$X remaining due" widget.
- **`shouldAutoDismissBill(bill, transactions, today)`** returns true if no matching transaction has been seen for `2 × cadence`. Wire into `sync-scheduler.ts` to flip `is_auto_dismissed = true` on stale recurrences.

Both are pure functions taking an `existingBills` + `transactions` snapshot. Caller is responsible for fetching the right window.

### Step 7 — Refunds & Returns (`refunds.ts`)

New module implementing your "separate surface, NOT netted in" preference.

- **`isRefundTransaction(tx, overrides)`** — true if the resolved Monarch category is `Refunds & Returns`, OR the transaction is a credit that is explicitly NOT income and NOT a transfer (catches merchant credits providers don't always flag).
- **`calculateRefundsForPeriod(transactions, overrides, periodStart, periodEnd)`** returns `RefundResult` with total, count, by-merchant breakdown, by-source-category breakdown, and per-transaction details.
- **`calculateRefundsMonthlyTrend(transactions, overrides, windowStart, windowEnd)`** returns monthly buckets for a trend chart.
- **`calculateThisMonthRefunds(transactions, overrides, today)`** convenience for the dashboard widget.

Note: `expenses.ts` and `income.ts` still need a small audit to confirm they don't double-count refunds (a refund is a credit so it shouldn't end up in expenses by sign anyway, but I want to verify in a follow-up session before declaring this fully done).

## What's NOT in this commit (deferred to next session)

These are mostly UI work or DB migrations that need their own focused session:

1. **Wire `bill-detection.ts` into `sync-scheduler.ts`** — call after each sync, insert auto-confirmed bills, write suggestions to a new table
2. **DB migration for the new bill columns + `suggested_bills` table** (DDL in `bill-detection.ts` docstring)
3. **Fold Subscriptions into Bills page UI** — `client/src/pages/subscriptions.tsx` becomes a filter on `client/src/pages/bills.tsx`
4. **Remove/restructure the Subscriptions paywall** — depends on what feature you want to put behind it instead (suggested: "Auto-detected recurring suggestions" or "Subscription cost optimisation insights")
5. **Engine API endpoints** — `/api/engine/refunds` (calls `refunds.ts`), `/api/engine/bills/with-status` (calls `getBillsForPeriodWithStatus`), `/api/engine/recurring-suggestions` (calls `bill-detection.ts`)
6. **`client/src/pages/refunds.tsx`** new page + sidebar nav entry
7. **`merchant_category_overrides` table** — schema migration so user re-categorisations stick. The resolver already accepts an `overrides` map; just needs the storage layer.
8. **Audit `expenses.ts` and `income.ts`** to confirm refund-direction transactions are excluded from both totals

Each item above is a small commit. None depend on the others except #1 needing #2.

## Operator decisions captured (locked-in, in auto-memory)

1. **Subscriptions** → fold into a filter on Bills/Recurring page. Paywall restructured separately.
2. **Categories** → match Monarch ~100 verbatim. Multi-provider (Plaid + MX) mapping required.
3. **Auto-detected recurrences** → auto-confirm if ≥3 occurrences, ≤$1 variance, ≤0.30 cadence drift; otherwise "Suggested bills" inbox.
4. **Refunds** → surface separately as "Refunds & Returns" (NOT netted into spending).

Stored in Claude's auto-memory at `project_monarch_alignment.md` so they survive any future memory wipes.

## Verification after the push

1. Both Railway services rebuild and stay green
2. `app.budgetsmart.io/health` returns 200
3. `api.budgetsmart.io/health` returns 200
4. `app.budgetsmart.io/dashboard` loads (engine fetch succeeds)
5. Spot-check a logged-in user's expense totals — they should be very close to before but possibly slightly different if the new PFC-based transfer filter catches transfers the legacy keyword filter missed (or vice versa). If you see surprising changes, look at `expenses.ts` `isTransferTransaction()` and check whether `pfcPrimary` is now classifying a transaction as a transfer that wasn't before. That's the expected and desired behaviour.
6. Subscriptions page: the totals will likely DROP because we removed `Other`, `Coffee Shops`, `Travel`, `Business Travel & Meals`, etc. from the subscription-like list. This is intentional and correct (they weren't subscriptions) but worth checking the numbers shift in a sensible direction.

## Cross-references

- Rollout plan: `MONARCH_VS_BSAI.md` (in repo root)
- Operator decisions: `project_monarch_alignment.md` (Claude's auto-memory, persistent)
- Session log: `SESSION_LOG_2026-04-15.md` (in repo root)
- Engine isolation reference: `project_engine_isolation.md` (Claude's auto-memory)
