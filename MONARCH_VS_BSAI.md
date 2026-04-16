# Monarch Money ↔ Budget Smart AI: Divergence Analysis & Alignment Plan

**Date:** 2026-04-15
**Purpose:** Identify where BSAI's calculation methodology diverges from Monarch Money's, and propose concrete fixes so the two apps show matching numbers for the same underlying transaction data.

> **Scope note.** This is a methodology-first analysis. Pull-one-account-side-by-side verification needs the operator's own real account data linked in both Monarch and BSAI; that verification pass is recommended as a follow-up after the methodology fixes below land.

---

## 1. Data model differences (high-level)

| Concept | Monarch | BSAI today |
|---|---|---|
| Transaction categorization | 2-tier (Group → Category), ~100+ default categories + user-custom | Uses Plaid PFC (enriched fields) + bill category + free-text |
| "Bills" | Auto-detected **Recurring** from transaction history, user can confirm/dismiss | User-created `Bill` entities with explicit recurrence rules |
| "Subscriptions" | Same `Recurring` object as Bills — not a distinct concept | Separate concept: a `Bill` whose `category` is in a hardcoded SUBSCRIPTION_CATEGORIES list |
| Transfers | Plaid PFC primary = `TRANSFER_IN` / `TRANSFER_OUT` + internal account-pair matching | String-match on category keywords (`transfer`, `transfer_in`, `loan_payments`, `credit card payment`) |
| Refunds | Negative-amount spending txns are netted into the category; "income" is tracked separately (`INCOME_OTHER`) | Expense engine treats them by sign; income engine detects from bank data |
| Income detection | Plaid PFC `INCOME` primary + auto-detected payroll recurrence | `income-auto-detection` + `household-income` auto-create flows |

**Takeaway:** BSAI's closest match to Monarch's model is the Plaid PFC fields already being written into every transaction (per the `fix(enrichment)` commits earlier this month). The fastest convergence path is to lean harder on PFC everywhere (categorization, transfer exclusion, income detection) and retire the string-keyword fallbacks.

---

## 2. Bills — what Monarch does vs BSAI

### Monarch's approach

- **Detection:** scans the last ~12 months of transactions for repeating merchant+amount patterns within a cadence window (weekly / biweekly / monthly / yearly). The match tolerates ±$1–$2 amount drift and ±3–5 day date drift.
- **Predicted next occurrence:** the last occurrence's date + the detected cadence. Adjusts if a transaction confirms/disconfirms earlier than expected.
- **Normalization for totals:** every recurring series is normalized to a **monthly equivalent** for the Budget section: weekly × 4.33, biweekly × 2.17, yearly ÷ 12. Never uses "weekly × 4" or "biweekly × 2" because those drift.
- **Paused / cancelled:** if the series has no activity past the expected next-date + grace window, it's auto-marked "dismissed" and stops contributing to forecasts.
- **"Paid vs predicted":** the Recurring widget shows both what's been paid this period and what's still predicted to be paid, using the actual latest-match date to resolve ambiguity.

### BSAI's current approach (from `server/lib/financial-engine/bills.ts`)

- Bills are **user-created entities** with explicit `recurrence`, `dueDay`, `startDate`, `endDate`, `customDates`, `isPaused` fields. There is no auto-detection-to-Bill pipeline; users enter bills manually (or via the onboarding wizard).
- `getNextBillOccurrence(bill, fromDate)` handles `one_time` / `custom` / monthly / weekly / biweekly / yearly.
- Normalization: implied monthly from recurrence rule (not verified here — needs review). Older code in `reports.tsx` used `× 52 / 12` and `× 26 / 12` which matches Monarch's constants.
- Upcoming window: 30 days (per engine docstring).

### Concrete fixes for BSAI to match Monarch's bills semantics

1. **Auto-detect bills from transactions.** Add `server/lib/financial-engine/bill-detection.ts` that runs the same pattern-matching (merchant+amount+cadence over last 12 months, ±$2 amount tolerance, ±4 day date tolerance). Surface detected-but-unconfirmed recurrences to the user as "Suggested bills" instead of requiring manual entry. Once confirmed, they become regular `Bill` rows with `isAutoDetected: true`.
2. **Standardize monthly equivalents.** Audit every place that multiplies or divides by 4, 12, 26, 52 and replace with the Monarch-consistent constants: weekly × 4.333, biweekly × 2.167, yearly / 12. Never 4 or 2.
3. **Paid-vs-predicted split.** Add a `getBillsForPeriodWithStatus()` variant that, for each occurrence in a period, looks up whether a transaction within ±3 days of the due date matches the bill's merchant/amount. Return `{ paid: [...], predicted: [...], missed: [...] }` so the UI can show Monarch-style "$2,603 remaining due."
4. **Auto-dismiss stale recurrences.** If a bill has no matching transaction for `2 × expected cadence`, flag it as `isAutoDismissed` and stop including it in upcoming totals.

---

## 3. Expenses — what Monarch does vs BSAI

### Monarch's approach

- **Scope:** all outflow transactions except those whose Plaid PFC primary is `TRANSFER_OUT` or `LOAN_PAYMENTS` (credit card payments, loan principal, internal transfers).
- **Refunds:** a negative-amount transaction in a spending category is netted into that category's total (reduces the category's spent number). Refunds do NOT appear in "income."
- **Monthly comparison basis:** calendar month (local tz). Pending transactions included with a pending flag.
- **Category breakdown:** groups by the transaction's category (Monarch's internal ID, mapped from PFC), then by group. User re-categorizations are sticky.

### BSAI's current approach (from `server/lib/financial-engine/expenses.ts`)

- Amounts converted to cents (ints) to avoid FP drift — good, keep this.
- Transfers excluded via `TRANSFER_CATEGORY_KEYWORDS` set: `transfer`, `transfers`, `transfer_in`, `transfer_out`, `loan_payments`, `credit card payment`. Keyword-based.
- Also has a deduplication step to avoid double-counting manual + bank copies of the same transaction.
- Category breakdown + top merchants + daily averages + projected monthly.

### Concrete fixes for BSAI to match Monarch's expenses semantics

1. **Prefer Plaid PFC over string matching.** Refactor the transfer filter to:
   ```ts
   const TRANSFER_PFC_PRIMARIES = new Set(['TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS']);
   function isTransfer(tx: NormalizedTransaction): boolean {
     if (tx.plaidPfcPrimary && TRANSFER_PFC_PRIMARIES.has(tx.plaidPfcPrimary)) return true;
     // fall back to keyword match for non-Plaid transactions (manual entries)
     return hasTransferKeyword(tx.category);
   }
   ```
   This uses the authoritative signal when available and preserves the keyword fallback for manual/MX transactions that don't carry PFC.
2. **Net refunds into the spending category.** Verify this is happening. Monarch's test: a $-50 negative transaction in "Shopping" should reduce the month's Shopping total by $50 and should NOT appear anywhere in income. Any place in the engine that does `if (amount > 0)` to filter expenses needs to also admit negative amounts when the category is a spending category.
3. **Pending-transaction handling.** Monarch includes pending transactions in the current-month spending but flags them. BSAI should do the same — a settled-vs-pending split in the response.
4. **Category ID stability.** Adopt Monarch's ~100 categories as the canonical list and map Plaid PFC detailed categories → BSAI categories via a single lookup table. See Section 5 below.

---

## 4. Subscriptions — what Monarch does vs BSAI

### Monarch's approach

- **Not a distinct concept.** Subscriptions in Monarch are just "Recurring" entries whose category is typically in the Software/Entertainment/Streaming/Personal-subscription families. The UI filters "Recurring" for these categories to show a "Subscriptions" view, but the data model is unified.
- **Monthly total:** sum of normalized-to-monthly amounts of active (non-dismissed) recurring entries in subscription-like categories.

### BSAI's current approach (from `server/lib/financial-engine/subscriptions.ts`)

- Subscriptions are `Bill` rows where `category` is in a hardcoded list:
  ```
  'Subscriptions', 'Communications', 'Entertainment', 'Fitness',
  'Education', 'Business Travel & Meals', 'Travel', 'Coffee Shops', 'Other'
  ```
- `getMonthlySubscriptionCost(bill)` normalizes based on recurrence.

### Issues with BSAI's approach

1. **"Other" is a catch-all for everything** — not just subscriptions. Classifying every "Other" bill as a subscription is wrong. A one-off HVAC repair billed as "Other" becomes a phantom subscription.
2. **"Business Travel & Meals", "Travel", "Coffee Shops" are categories of transactions, not subscriptions.** A daily Starbucks run is not a "Coffee Shop subscription."
3. **"Communications" covers both subscriptions (streaming internet) and one-off service calls.** Needs finer-grained distinction.

### Concrete fixes for BSAI to match Monarch's subscriptions semantics

1. **Collapse subscription detection into Bill detection.** Drop the separate `isSubscriptionCategory()` branch. Instead, a Bill is "subscription-like" if:
   - Its recurrence is periodic (weekly / monthly / yearly, not `one_time`), AND
   - Its merchant/amount is consistent (pattern-confirmed), AND
   - Its category is in the Monarch subscription families (Software, Streaming, Cloud Services, Gym, Digital Media, etc.).
2. **Replace the hardcoded category list** with the Monarch-aligned subset: `Software & Tech`, `Streaming Services`, `Gym & Fitness`, `Digital Media`, `Dues & Subscriptions`, `Internet & Phone`, `Business Software`. Drop `Other`, `Coffee Shops`, `Travel`, `Business Travel & Meals` from the subscription list.
3. **Surface in the UI as a Recurring view filter, not a separate page.** (UI-level change; engine only needs to expose a `subscriptionLike: boolean` on each recurring row.)

---

## 5. Category taxonomy alignment

### Current state

- **Monarch:** ~100 default categories grouped into ~10 groups (Income, Housing, Transportation, Food, Entertainment, Personal, Shopping, Financial, Business, Travel, Other).
- **Plaid PFC:** 104 detailed categories in 16 primary groups. Well-documented, versioned (PFC v1.0 is stable).
- **BSAI:** mix of user-chosen categories (per the seed script), Plaid PFC enrichment, and the hardcoded subscription category list above. No single canonical list.

### Recommended approach

1. **Adopt Plaid PFC as the source of truth** for categorization at the transaction level. BSAI already writes PFC fields during enrichment (confirmed via the `fix(enrichment)` commits).
2. **Map PFC → a BSAI category taxonomy** (the operator's choice of ~30–50 categories — close to Monarch's but simpler if desired). Publish this mapping as `server/lib/financial-engine/category-map.ts` and use it everywhere.
3. **User overrides are sticky.** When a user re-categorizes a merchant, store it in a `merchant_category_override` table and apply it to all future transactions from that merchant before falling back to PFC → category map.
4. **One category-lookup function.** Every engine module that reads `tx.category` should go through `resolveCategory(tx, userOverrides, pfcMap)` so the logic is centralized.

---

## 6. Proposed rollout order (smallest risk first)

1. **Category resolver + PFC map** (new module, no behavior change until called). Commit as `feat(engine): add PFC→category map + resolver`.
2. **Expenses: switch transfer filter to PFC-first** (behavior change scoped to expense totals; easy to A/B against old totals). Commit as `fix(expenses): use Plaid PFC for transfer exclusion`.
3. **Bills normalization audit** (search for `* 4`, `* 2`, `/ 4`, `/ 2` over currency; replace with 4.333 / 2.167 / 12). Commit as `fix(bills): standardize monthly-equivalent constants`.
4. **Subscriptions: drop bad category list, use new category map + recurrence check.** Commit as `refactor(subscriptions): align detection with Monarch semantics`.
5. **Bill auto-detection** (new pipeline; surface as "Suggested bills" not as auto-created rows). Commit as `feat(bills): auto-detect recurring payments from transaction history`.
6. **Paid-vs-predicted split + auto-dismiss** (largest change; do after the others are stable). Commits as `feat(bills): paid-vs-predicted per period` and `feat(bills): auto-dismiss stale recurrences`.
7. **Refund netting audit.** Commit as `fix(expenses): net refunds into category totals per Monarch semantics`.

Each step is an independent commit the operator can roll back. Pair each with a UAT pass comparing BSAI's dashboard numbers to Monarch's for the same account range.

---

## 7. Open questions for the operator

1. Do you want to keep "Subscriptions" as a separate top-level page, or fold it into a filter on the Bills/Recurring page (Monarch model)?
2. Do you want BSAI's canonical category list to match Monarch's ~100 names verbatim, or a simplified ~30-category superset mapped via PFC?
3. Auto-detected recurrences — auto-confirm high-confidence ones (e.g., >3 occurrences, <$1 amount variance, same merchant) or always require explicit user confirmation?
4. Refunds in a spending category — net into that category (Monarch) or surface separately as "Refunds & Returns" (some users prefer this)?

These answers shape the exact implementation of steps 3–7 above.
