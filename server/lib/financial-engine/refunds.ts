/**
 * Refunds & Returns Calculation
 *
 * Operator decision (2026-04-15): refunds and returns are surfaced as their
 * own dashboard widget and report page, NOT netted into spending categories.
 * (Monarch's default behaviour is to net them into spending; we depart from
 * that based on operator preference — Ryan would rather see them itemised.)
 *
 * Definition of a "refund/return" transaction in BSAI:
 *
 *   1. The transaction's resolved Monarch category is "Refunds & Returns"
 *      (i.e. Plaid PFC `INCOME_TAX_REFUND` or MX `Refunds`/`Returns`/etc.)
 *   2. OR the transaction is a credit (direction === "credit") with
 *      `isIncome === false` AND `isTransfer === false`. This catches
 *      merchant-issued refunds that providers don't always flag explicitly
 *      but that are, by definition, neither salary nor account transfers.
 *
 * Refunds are NOT included in:
 *   - Expense totals (they're not spending)
 *   - Income totals (they're not new earnings — just returned spending)
 *   - Cash-flow "deposits" (would inflate the Bank Deposits widget)
 *
 * They ARE shown:
 *   - On the Refunds & Returns dashboard widget (this period total)
 *   - On the Refunds & Returns report page (history, by-merchant, by-category)
 */

import {
  startOfMonth,
  endOfMonth,
  parseISO,
  isBefore,
  isAfter,
  format,
} from "date-fns";
import type { NormalizedTransaction } from "./normalized-types";
import type { MerchantOverrideMap } from "./categories";
import { REFUND_CATEGORY } from "./categories/monarch-categories";

/**
 * Post-adapter canonical category lookup. Since the adapter now populates
 * `tx.category` as a canonical Monarch string, we mostly just read it.
 * Merchant overrides (user re-categorisations) still take precedence.
 */
function canonicalCategory(
  tx: NormalizedTransaction,
  overrides: MerchantOverrideMap
): string {
  const override = overrides?.get?.(tx.merchant?.toLowerCase?.() || "");
  if (override) return override;
  return tx.category || "Other";
}

// ─── Public types ─────────────────────────────────────────────────────────

export interface RefundResult {
  /** Total refund amount in the requested period (dollars). */
  total: number;
  /** Number of refund transactions. */
  count: number;
  /** Refunds grouped by merchant (descending by amount). */
  byMerchant: Array<{ merchant: string; amount: number; count: number }>;
  /** Refunds grouped by source category (the category of the original spend
   *  that's being refunded — e.g. a Shopping refund is grouped under
   *  Shopping). Useful for "which category produced the most returns". */
  bySourceCategory: Array<{ category: string; amount: number; count: number }>;
  /** Per-transaction details for the report page. */
  transactions: Array<{
    id: string;
    date: string; // yyyy-MM-dd
    merchant: string;
    amount: number;
    sourceCategory: string;
  }>;
}

export interface RefundsMonthlyTrend {
  /** yyyy-MM (e.g. "2026-04") */
  month: string;
  total: number;
  count: number;
}

// ─── Detection ────────────────────────────────────────────────────────────

/**
 * True if a transaction is a refund/return per the operator's definition.
 * Caller is expected to have already populated `pfcPrimary`/`mxCategory`/
 * etc. on the transaction (the adapters do this).
 */
export function isRefundTransaction(
  tx: NormalizedTransaction,
  overrides: MerchantOverrideMap
): boolean {
  // The adapter has already remapped tx.category to a canonical Monarch
  // label, so we just read it directly (with override support).
  const monarchCat = canonicalCategory(tx, overrides);
  if (monarchCat === REFUND_CATEGORY) return true;

  // Heuristic catch: a credit that is explicitly NOT income and NOT a
  // transfer is, by elimination, a refund/return/merchant credit.
  if (
    tx.direction === "credit" &&
    tx.isIncome === false &&
    tx.isTransfer === false &&
    !tx.isPending
  ) {
    return true;
  }

  return false;
}

// ─── Period calculation ───────────────────────────────────────────────────

/**
 * Compute the refund summary for a given date range.
 *
 * @param transactions - All transactions in (or overlapping) the window.
 *   Caller should pass a window that covers at least the period in question.
 * @param overrides - Merchant-category overrides (so user re-categorisations
 *   like "this Amazon credit is a refund, not income" stick).
 * @param periodStart - Inclusive start (yyyy-MM-dd or Date).
 * @param periodEnd - Inclusive end (yyyy-MM-dd or Date).
 */
export function calculateRefundsForPeriod(
  transactions: NormalizedTransaction[],
  overrides: MerchantOverrideMap,
  periodStart: Date,
  periodEnd: Date
): RefundResult {
  const refundTxs: Array<{
    tx: NormalizedTransaction;
    sourceCategory: string;
  }> = [];

  for (const tx of transactions) {
    if (!isRefundTransaction(tx, overrides)) continue;

    let txDate: Date;
    try {
      txDate = parseISO(tx.date);
    } catch {
      continue;
    }
    if (isBefore(txDate, periodStart) || isAfter(txDate, periodEnd)) continue;

    // The "source category" is what the user was originally spending on.
    // The adapter already produced a canonical Monarch category on
    // tx.category — so we read it directly. Overrides still take precedence
    // for user re-categorisations.
    const sourceCategory = canonicalCategory(tx, overrides);

    refundTxs.push({
      tx,
      sourceCategory: sourceCategory === REFUND_CATEGORY ? "Other" : sourceCategory,
    });
  }

  // Aggregate.
  let total = 0;
  const byMerchant = new Map<string, { amount: number; count: number }>();
  const bySourceCategory = new Map<string, { amount: number; count: number }>();

  for (const { tx, sourceCategory } of refundTxs) {
    total += tx.amount;

    const merchantKey = tx.merchant || "Unknown";
    const m = byMerchant.get(merchantKey) ?? { amount: 0, count: 0 };
    m.amount += tx.amount;
    m.count += 1;
    byMerchant.set(merchantKey, m);

    const c = bySourceCategory.get(sourceCategory) ?? { amount: 0, count: 0 };
    c.amount += tx.amount;
    c.count += 1;
    bySourceCategory.set(sourceCategory, c);
  }

  return {
    total: Math.round(total * 100) / 100,
    count: refundTxs.length,
    byMerchant: Array.from(byMerchant.entries())
      .map(([merchant, v]) => ({
        merchant,
        amount: Math.round(v.amount * 100) / 100,
        count: v.count,
      }))
      .sort((a, b) => b.amount - a.amount),
    bySourceCategory: Array.from(bySourceCategory.entries())
      .map(([category, v]) => ({
        category,
        amount: Math.round(v.amount * 100) / 100,
        count: v.count,
      }))
      .sort((a, b) => b.amount - a.amount),
    transactions: refundTxs.map(({ tx, sourceCategory }) => ({
      id: tx.id,
      date: tx.date,
      merchant: tx.merchant,
      amount: Math.round(tx.amount * 100) / 100,
      sourceCategory,
    })),
  };
}

// ─── Monthly trend (for the Refunds report page) ──────────────────────────

/**
 * Group refunds into monthly buckets for a trend chart.
 *
 * @param transactions - All transactions to consider
 * @param overrides - Merchant-category overrides
 * @param windowStart - Inclusive start (e.g. 12 months ago)
 * @param windowEnd - Inclusive end (e.g. today)
 */
export function calculateRefundsMonthlyTrend(
  transactions: NormalizedTransaction[],
  overrides: MerchantOverrideMap,
  windowStart: Date,
  windowEnd: Date
): RefundsMonthlyTrend[] {
  const buckets = new Map<string, { total: number; count: number }>();

  for (const tx of transactions) {
    if (!isRefundTransaction(tx, overrides)) continue;

    let txDate: Date;
    try {
      txDate = parseISO(tx.date);
    } catch {
      continue;
    }
    if (isBefore(txDate, windowStart) || isAfter(txDate, windowEnd)) continue;

    const monthKey = format(txDate, "yyyy-MM");
    const b = buckets.get(monthKey) ?? { total: 0, count: 0 };
    b.total += tx.amount;
    b.count += 1;
    buckets.set(monthKey, b);
  }

  return Array.from(buckets.entries())
    .map(([month, v]) => ({
      month,
      total: Math.round(v.total * 100) / 100,
      count: v.count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ─── Convenience: this-month summary for the dashboard widget ─────────────

/**
 * Refund summary for the current calendar month, suited to the dashboard
 * widget. Uses local timezone for month boundaries.
 */
export function calculateThisMonthRefunds(
  transactions: NormalizedTransaction[],
  overrides: MerchantOverrideMap,
  today: Date = new Date()
): RefundResult {
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  return calculateRefundsForPeriod(transactions, overrides, monthStart, monthEnd);
}
