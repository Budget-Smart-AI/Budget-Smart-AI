/**
 * Expense Calculation Engine
 *
 * Centralizes all expense-related calculations including:
 * - Expense deduplication (manual + bank transactions)
 * - Transfer exclusion (credit card payments, loan payments, etc.)
 * - Month-over-month comparison
 * - Category breakdown and top merchants
 * - Daily averages and projected monthly totals
 *
 * All monetary amounts are handled in cents (integers) to avoid floating-point errors.
 */

import {
  startOfMonth,
  endOfMonth,
  parseISO,
  isBefore,
  isAfter,
  getDaysInMonth,
  eachDayOfInterval,
  format,
} from 'date-fns';
import { ExpenseResult } from './types';
import type { NormalizedTransaction } from './normalized-types';
import type { Expense } from '@shared/schema';
// NOTE: provider-specific transfer detection has been moved into the adapter
// layer. Adapters set `tx.isTransfer` based on Plaid PFC / MX top-level /
// manual flags. The engine only reads that pre-computed boolean here.

// ─── Precision Helpers ──────────────────────────────────────────────────────

/**
 * Convert dollars to cents (integers) to avoid floating-point errors
 * @param amount Currency amount in dollars or string
 * @returns Amount in cents as an integer
 */
function toCents(amount: string | number): number {
  return Math.round(parseFloat(String(amount)) * 100);
}

/**
 * Convert cents (integers) back to dollars
 * @param cents Amount in cents as an integer
 * @returns Amount in dollars (rounded to 2 decimal places)
 */
function toDollars(cents: number): number {
  return Math.round(cents) / 100;
}

// ─── Transaction Filtering ──────────────────────────────────────────────────

/**
 * Legacy keyword-based transfer category check.
 *
 * Kept as a fallback for non-Plaid / non-MX transactions (manual entries,
 * other providers, or older imports without PFC enrichment). The primary
 * detection path is now `isTransferByResolver()` which uses Plaid PFC
 * primary + MX top-level when available — see imports above.
 *
 * Why both: relying on string-matching alone misses transactions where the
 * adapter normalised the category to a non-keyword name, and being too
 * aggressive on keywords ("payment" appearing in arbitrary merchant names
 * for example) caused false positives. The PFC-first resolver fixes both.
 */
const TRANSFER_CATEGORY_KEYWORDS = new Set([
  'transfer',
  'transfers',
  'transfer_in',
  'transfer_out',
  'loan_payments',
  'credit card payment',
  'payment',
]);

function isTransferCategoryByKeyword(category: string | null | undefined): boolean {
  if (!category) return false;
  const categoryLower = String(category).toLowerCase();
  for (const keyword of TRANSFER_CATEGORY_KEYWORDS) {
    if (categoryLower.includes(keyword)) {
      return true;
    }
  }
  return false;
}

/**
 * True if a normalized transaction is a transfer (and therefore should be
 * excluded from spending totals).
 *
 * The adapter layer now owns this decision: every adapter sets
 * `tx.isTransfer` using provider-specific signals (Plaid PFC primary, MX
 * top-level, manual toggle). The engine simply reads that boolean.
 *
 * A category-name keyword fallback remains for defense-in-depth — if an
 * adapter ever forgets to flag a transfer, we still catch it by name.
 */
function isTransferTransaction(tx: NormalizedTransaction): boolean {
  if (tx.isTransfer) return true;
  return isTransferCategoryByKeyword(tx.category);
}

// ─── Normalized Transaction Helpers ────────────────────────────────────────
//
// All provider-specific logic (field names, sign conventions) is handled by
// the adapter layer. The engine only works with NormalizedTransaction objects.

/**
 * Get the effective amount of a normalized transaction, using CAD equivalent
 * if available for multi-currency support.
 */
function getTransactionAmount(tx: NormalizedTransaction): number {
  return tx.cadEquivalent ?? tx.amount;
}

// ─── Deduplication ─────────────────────────────────────────────────────────

/**
 * Internal type for deduplicated expense records.
 * §6.2.7-prep: carries `canonicalCategoryId` from the source row alongside
 * the legacy `category` string. byCategory / topCategories aggregations
 * key on the canonical id; the legacy field is kept for fallbacks during
 * the transition (Phase D drops it).
 */
interface DedupedExpense {
  id: string;
  merchant: string;
  amount: number; // in dollars
  date: string; // yyyy-MM-dd
  category: string;
  canonicalCategoryId: string | null;
}

/**
 * Merge manual expenses with normalized bank transactions, avoiding double-counting
 *
 * Business Rules:
 * - Include matched expense IDs from bank transactions (matchedExpenseId field)
 * - Include manual expenses NOT already matched
 * - Include bank transactions where:
 *   - date is in range
 *   - direction is "debit" (spending, not deposits)
 *   - not pending
 *   - not a transfer
 *
 * @param expenses Array of manual expenses
 * @param transactions Normalized bank transactions (provider-agnostic)
 * @param monthStart First day of period
 * @param monthEnd Last day of period
 * @returns Deduplicated array of expenses
 */
function deduplicateExpenses(
  expenses: Expense[],
  transactions: NormalizedTransaction[],
  monthStart: Date,
  monthEnd: Date
): DedupedExpense[] {
  const deduped: DedupedExpense[] = [];
  const matchedExpenseIds = new Set<string>();

  // First pass: collect all expense IDs that are matched by transactions
  for (const tx of transactions) {
    if (tx.matchedExpenseId) {
      matchedExpenseIds.add(tx.matchedExpenseId);
    }
  }

  // Second pass: add manual expenses that aren't matched
  for (const exp of expenses) {
    try {
      const expDate = parseISO(exp.date);
      if (
        expDate >= monthStart &&
        expDate <= monthEnd &&
        !matchedExpenseIds.has(exp.id)
      ) {
        deduped.push({
          id: exp.id,
          merchant: exp.merchant || 'Unknown',
          amount: parseFloat(String(exp.amount)),
          date: exp.date,
          category: exp.category || 'Other',
          canonicalCategoryId: exp.canonicalCategoryId ?? null,
        });
      }
    } catch (e) {
      // Skip malformed dates
      continue;
    }
  }

  // Third pass: add bank transactions (spending only, no transfers)
  for (const tx of transactions) {
    try {
      const txDate = parseISO(tx.date);

      // Filter by date range
      if (isBefore(txDate, monthStart) || isAfter(txDate, monthEnd)) {
        continue;
      }

      // Only include debits (spending), not credits (income/deposits)
      if (tx.direction !== 'debit') {
        continue;
      }

      const amount = getTransactionAmount(tx);
      if (amount <= 0) {
        continue;
      }

      // Skip pending and transfers (adapter already normalized these flags)
      if (tx.isPending || tx.isTransfer) {
        continue;
      }

      // Skip transfer categories (belt-and-suspenders check)
      if (isTransferTransaction(tx)) {
        continue;
      }

      deduped.push({
        id: tx.id,
        merchant: tx.merchant,
        amount,
        date: tx.date,
        category: tx.category,
        canonicalCategoryId: tx.canonicalCategoryId ?? null,
      });
    } catch (e) {
      // Skip malformed transactions
      continue;
    }
  }

  return deduped;
}

// ─── Aggregation Helpers ────────────────────────────────────────────────────

/**
 * Sentinel key used in byCategory aggregations when a tx row has no
 * canonical_category_id assigned (resolver miss at insert time, or a
 * pre-Phase-A row that wasn't backfilled). Consumers translate this to
 * "Uncategorized" for display.
 */
const UNCATEGORIZED_KEY = "__uncategorized__";

/**
 * Group expenses by canonical category id and sum amounts.
 * §6.2.7-prep: keys are canonical_categories.id slugs (e.g. "food_groceries"
 * or "c_<uuid>" for user-owned), or UNCATEGORIZED_KEY for rows where
 * canonicalCategoryId is NULL. Consumers must look up display fields
 * via canonical_categories rather than treating the key as a display name.
 *
 * @param expenses Array of deduplicated expenses
 * @returns Object mapping canonical category id (or UNCATEGORIZED_KEY) to total amount
 */
function groupByCategory(expenses: DedupedExpense[]): Record<string, number> {
  const byCategory: Record<string, number> = {};
  for (const exp of expenses) {
    const key = exp.canonicalCategoryId ?? UNCATEGORIZED_KEY;
    if (!byCategory[key]) {
      byCategory[key] = 0;
    }
    byCategory[key] += exp.amount;
  }
  return byCategory;
}

/**
 * Get top 5 categories by spending.
 * §6.2.7-prep: emits canonicalCategoryId (slug or UNCATEGORIZED_KEY)
 * instead of a display string. Consumers look up display name / color /
 * icon via canonical_categories.
 *
 * @param byCategory Category totals keyed on canonical id or UNCATEGORIZED_KEY
 * @param totalSpent Total spending across all categories
 * @returns Top 5 categories with percentages
 */
function getTopCategories(
  byCategory: Record<string, number>,
  totalSpent: number
): Array<{ canonicalCategoryId: string | null; amount: number; percentage: number }> {
  const categories = Object.entries(byCategory)
    .map(([key, amount]) => ({
      canonicalCategoryId: key === UNCATEGORIZED_KEY ? null : key,
      amount,
      percentage: totalSpent > 0 ? (amount / totalSpent) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return categories;
}

/**
 * Get top merchants by spending
 *
 * @param expenses Array of deduplicated expenses
 * @returns Top merchants with amount and transaction count
 */
function getTopMerchants(
  expenses: DedupedExpense[]
): Array<{ merchant: string; amount: number; count: number }> {
  const merchantMap = new Map<string, { amount: number; count: number }>();

  for (const exp of expenses) {
    const merchant = exp.merchant;
    if (!merchantMap.has(merchant)) {
      merchantMap.set(merchant, { amount: 0, count: 0 });
    }
    const data = merchantMap.get(merchant)!;
    data.amount += exp.amount;
    data.count += 1;
  }

  const merchants = Array.from(merchantMap.entries())
    .map(([merchant, data]) => ({
      merchant,
      ...data,
    }))
    .sort((a, b) => b.amount - a.amount);

  return merchants;
}

/**
 * Build daily totals for the period
 *
 * @param expenses Array of deduplicated expenses
 * @returns Object mapping date string (yyyy-MM-dd) to daily total
 */
function getDailyTotals(expenses: DedupedExpense[]): Record<string, number> {
  const dailyTotals: Record<string, number> = {};

  for (const exp of expenses) {
    const dateStr = exp.date;
    if (!dailyTotals[dateStr]) {
      dailyTotals[dateStr] = 0;
    }
    dailyTotals[dateStr] += exp.amount;
  }

  return dailyTotals;
}

// ─── Main Export ───────────────────────────────────────────────────────────

/**
 * Calculate all expense metrics for a period
 *
 * Results include:
 * - total: deduplicated total spending
 * - count: number of expense transactions
 * - previousTotal: total from previous period for MoM comparison
 * - momChangePercent: percentage change month-over-month
 * - byCategory: sum of spending by category
 * - topCategories: top 5 categories with percentages
 * - topMerchants: merchants with highest spending
 * - dailyAverage: total / days elapsed
 * - projectedMonthly: dailyAvg × days in current month
 * - dailyTotals: spending for each day
 *
 * @param params Configuration object
 * @param params.expenses Array of manual Expense records
 * @param params.transactions Normalized bank transactions (provider-agnostic)
 * @param params.monthStart First day of current period
 * @param params.monthEnd Last day of current period
 * @param params.prevMonthStart First day of previous period
 * @param params.prevMonthEnd Last day of previous period
 * @returns ExpenseResult with comprehensive spending breakdown
 */
export function calculateExpensesForPeriod(params: {
  expenses: Expense[];
  transactions: NormalizedTransaction[];
  monthStart: Date;
  monthEnd: Date;
  prevMonthStart: Date;
  prevMonthEnd: Date;
}): ExpenseResult {
  const {
    expenses = [],
    transactions = [],
    monthStart,
    monthEnd,
    prevMonthStart,
    prevMonthEnd,
  } = params;

  // Deduplicate current period expenses
  const currentExpenses = deduplicateExpenses(expenses, transactions, monthStart, monthEnd);
  const currentTotalCents = currentExpenses.reduce(
    (sum, exp) => sum + toCents(exp.amount),
    0
  );
  const currentTotal = toDollars(currentTotalCents);

  // Deduplicate previous period expenses for MoM comparison
  const previousExpenses = deduplicateExpenses(expenses, transactions, prevMonthStart, prevMonthEnd);
  const previousTotalCents = previousExpenses.reduce(
    (sum, exp) => sum + toCents(exp.amount),
    0
  );
  const previousTotal = toDollars(previousTotalCents);

  // Calculate month-over-month change
  let momChangePercent = 0;
  if (previousTotal > 0) {
    momChangePercent = ((currentTotal - previousTotal) / previousTotal) * 100;
  } else if (currentTotal > 0) {
    momChangePercent = 100; // Went from 0 to something
  }

  // Group by category
  const byCategory = groupByCategory(currentExpenses);

  // Get top categories
  const topCategories = getTopCategories(byCategory, currentTotal);

  // Get top merchants
  const topMerchants = getTopMerchants(currentExpenses);

  // Calculate daily average
  const daysInPeriod = eachDayOfInterval({ start: monthStart, end: monthEnd }).length;
  const dailyAverage = daysInPeriod > 0 ? currentTotal / daysInPeriod : 0;

  // Project to full month (using current month's day count)
  const daysInCurrentMonth = getDaysInMonth(monthEnd);
  const projectedMonthly = daysInPeriod > 0 ? (currentTotal / daysInPeriod) * daysInCurrentMonth : 0;

  // Build daily totals map
  const dailyTotals = getDailyTotals(currentExpenses);

  return {
    total: currentTotal,
    count: currentExpenses.length,
    previousTotal,
    momChangePercent,
    byCategory,
    topCategories,
    topMerchants,
    dailyAverage,
    projectedMonthly,
    dailyTotals,
  };
}