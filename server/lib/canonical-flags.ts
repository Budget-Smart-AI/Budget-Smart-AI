/**
 * Canonical category-flag helpers — single source of truth for "is this row
 * a transfer / non-spending / non-income row?" classification.
 *
 * §6.3.1: Before this module, transfer detection lived in 4+ places (financial
 * engine, cash-flow, recurring-income-detector, adapter sets) — each with its
 * own list of strings. After Phase D dropped the legacy `category` column,
 * several of those sets were silently dead because they still compared against
 * legacy keywords ("transfer", "credit card payment") instead of canonical
 * slugs ("transfer_internal", "finance_credit_card_payment").
 *
 * Adapters keep their own raw-provider-string sets — that's adapter-level
 * responsibility (translating vendor → canonical). This module is for
 * downstream consumers that already have a `canonical_category_id` and need
 * to decide whether to include the row in spending or income totals.
 */

// ─── Canonical slug sets ────────────────────────────────────────────────────
// These slugs match canonical_categories.id values seeded by
// scripts/seed-canonical-categories.ts. Keep in sync with the seed.

/** Pure transfer slugs — internal account moves and reversals. */
const TRANSFER_CANONICAL_IDS: ReadonlySet<string> = new Set([
  "transfer_internal",
  "transfer_atm",
  "transfer_refund",
]);

/**
 * Slugs to EXCLUDE from spending totals. Transfers + debt-servicing rows
 * (credit card payments, loan payments) — these aren't "spending" in the
 * Monarch sense; they're moving money you've already counted.
 *
 * Note: bank fees stay IN spending (they're a real cost).
 */
const NON_SPENDING_CANONICAL_IDS: ReadonlySet<string> = new Set([
  ...TRANSFER_CANONICAL_IDS,
  "finance_credit_card_payment",
  "finance_debt_payment",
]);

/**
 * Slugs to EXCLUDE from income detection. Transfers + credit-card-payment
 * inflows (when a payment posts as a credit on the card account) + bank
 * interest sometimes posts ambiguously. Conservative — better to miss real
 * income than to falsely flag a transfer as a paycheck.
 */
const NON_INCOME_CANONICAL_IDS: ReadonlySet<string> = new Set([
  ...TRANSFER_CANONICAL_IDS,
  "finance_credit_card_payment",
  "finance_debt_payment",
  "finance_bank_fees",
]);

// ─── Public helpers ─────────────────────────────────────────────────────────

/**
 * True if the given canonical_category_id represents a transfer row that
 * should NOT count as either spending or income (it's just money moving).
 *
 * Returns false for null/undefined — callers should combine with other
 * signals (e.g. `tx.isTransfer` boolean, PFC detailed prefix) for
 * defense-in-depth on rows where canonical_category_id wasn't resolved.
 */
export function isTransferCanonical(
  canonicalCategoryId: string | null | undefined,
): boolean {
  return canonicalCategoryId != null && TRANSFER_CANONICAL_IDS.has(canonicalCategoryId);
}

/**
 * True if the given canonical_category_id represents a row that should be
 * excluded from spending totals — transfers + debt-service payments.
 */
export function isNonSpendingCanonical(
  canonicalCategoryId: string | null | undefined,
): boolean {
  return (
    canonicalCategoryId != null &&
    NON_SPENDING_CANONICAL_IDS.has(canonicalCategoryId)
  );
}

/**
 * True if the given canonical_category_id represents a row that should be
 * excluded from income detection — transfers + debt-service inflows + bank fees.
 */
export function isNonIncomeCanonical(
  canonicalCategoryId: string | null | undefined,
): boolean {
  return (
    canonicalCategoryId != null && NON_INCOME_CANONICAL_IDS.has(canonicalCategoryId)
  );
}

// ─── Read-only exports for tests / debugging ────────────────────────────────
// Don't mutate these from caller code. Use the helpers above.

export const _TRANSFER_CANONICAL_IDS = TRANSFER_CANONICAL_IDS;
export const _NON_SPENDING_CANONICAL_IDS = NON_SPENDING_CANONICAL_IDS;
export const _NON_INCOME_CANONICAL_IDS = NON_INCOME_CANONICAL_IDS;
