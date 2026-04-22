// ─── Unified category resolver (2026-04-21) ─────────────────────────────────
//
// Background: prior to 2026-04-21 Budget Smart AI stored a transaction's
// category in three different places that could silently drift apart:
//
//   1. plaid_transactions.category          — Plaid raw category or user override
//   2. plaid_transactions.subcategory       — fine-grained taxonomy leaf (UI prefers this)
//   3. plaid_transactions.personal_category — mapped Budget Smart AI bucket
//   4. expenses.category                    — set at reconcile-time; then stayed stuck
//   5. bills.category                       — set at bill-creation; then stayed stuck
//
// The Expenses page read from (4), the Accounts page read from (2)/(3), and
// the Bills & Subscriptions page read from (5). A user editing PC Express to
// "Groceries" on Accounts updated (1)/(2) only, so Expenses continued to
// display the stale "Other". This file defines a SINGLE resolver used
// everywhere on the client so every page agrees on one answer.
//
// Write path: PATCH /api/transactions/:id/category now writes ALL of
// (1)+(2)+(3), and fans out to linked (4)/(5) rows via matched_expense_id /
// matched_bill_id — see server/routes.ts.

/** Shape of any transaction-like object the UI might render. */
export interface TransactionLike {
  category?: string | null;
  subcategory?: string | null;
  personalCategory?: string | null;
  personal_category?: string | null;
  personalFinanceCategoryDetailed?: string | null;
  personal_finance_category_detailed?: string | null;
}

/**
 * The user-visible category for a transaction. Prefers the most-specific
 * known field; falls back in a defined order. Never returns empty — always
 * at least "Other" so the UI can render a badge.
 */
export function getEffectiveCategory(tx: TransactionLike | null | undefined): string {
  if (!tx) return "Other";
  return (
    tx.subcategory ||
    tx.personalCategory ||
    tx.personal_category ||
    tx.category ||
    tx.personalFinanceCategoryDetailed ||
    tx.personal_finance_category_detailed ||
    "Other"
  );
}

/**
 * The top-level category bucket (used for the color badge on rows). This is
 * the "parent" bucket — `getEffectiveCategory` returns the leaf.
 */
export function getEffectiveCategoryBucket(tx: TransactionLike | null | undefined): string {
  if (!tx) return "Other";
  return (
    tx.personalCategory ||
    tx.personal_category ||
    tx.category ||
    "Other"
  );
}
