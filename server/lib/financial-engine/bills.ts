/**
 * Bill Calculations
 *
 * Server-side bill occurrence logic moved from client/src/lib/bill-utils.ts.
 * Handles all bill date/occurrence calculations and period-based bill aggregations.
 *
 * Key responsibilities:
 * - Generate bill occurrence dates based on recurrence rules
 * - Filter bills for date ranges respecting paused/ended status
 * - Calculate monthly estimates from annualized patterns
 * - Track upcoming bills within 30-day windows
 */

import {
  parseISO,
  isBefore,
  isAfter,
  setDate,
  addMonths,
  addDays,
  addWeeks,
  setDay,
  format,
  startOfDay,
  differenceInDays,
  getDaysInMonth,
  isWithinInterval,
} from 'date-fns';
import type { Bill } from '@shared/schema';
import { BillsResult, BillOccurrence } from './types';

// ─── Low-Level Helpers ────────────────────────────────────────────────────────

/**
 * Returns the next occurrence of a bill on or after `fromDate`.
 * Returns null when the bill has no future occurrence (e.g., a one_time bill
 * whose start date is already in the past).
 *
 * @param bill - The bill to compute next occurrence for
 * @param fromDate - Compute next occurrence on or after this date
 * @returns Next due date or null if no future occurrence
 */
export function getNextBillOccurrence(bill: Bill, fromDate: Date): Date | null {
  const today = startOfDay(fromDate);

  // One-time payment
  if (bill.recurrence === 'one_time') {
    if (bill.startDate) {
      const dueDate = parseISO(bill.startDate);
      return !isBefore(dueDate, today) ? dueDate : null;
    }
    let nextDue = setDate(today, bill.dueDay);
    if (isBefore(nextDue, today)) {
      nextDue = addMonths(nextDue, 1);
    }
    return nextDue;
  }

  // Custom dates list – dueDay is ignored for custom recurrence
  if (bill.recurrence === 'custom' && bill.customDates) {
    try {
      const dates: string[] = JSON.parse(bill.customDates);
      const futureDates = dates
        .map((d) => parseISO(d))
        .filter((d) => !isBefore(d, today))
        .sort((a, b) => a.getTime() - b.getTime());
      return futureDates[0] ?? null;
    } catch {
      return null;
    }
  }

  // Weekly – dueDay is day-of-week (0 = Sun, 6 = Sat)
  if (bill.recurrence === 'weekly') {
    let nextDue = setDay(today, bill.dueDay, { weekStartsOn: 0 });
    if (isBefore(nextDue, today)) {
      nextDue = addWeeks(nextDue, 1);
    }
    return nextDue;
  }

  // Monthly / biweekly / yearly – dueDay is day-of-month (1-31)
  let nextDue = setDate(today, bill.dueDay);
  if (isBefore(nextDue, today)) {
    if (bill.recurrence === 'monthly') {
      nextDue = addMonths(nextDue, 1);
    } else if (bill.recurrence === 'biweekly') {
      while (isBefore(nextDue, today)) {
        nextDue = addDays(nextDue, 14);
      }
    } else if (bill.recurrence === 'yearly') {
      nextDue = addMonths(nextDue, 12);
    }
  }

  return nextDue;
}

/**
 * Converts amount string to cents (integer).
 * Bill amounts are stored as numeric strings in the database.
 *
 * @param amount - Amount as string or number
 * @returns Amount in cents as integer
 */
function toCents(amount: string | number): number {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return Math.round(num * 100);
}

/**
 * Converts amount from cents to dollars.
 *
 * @param cents - Amount in cents
 * @returns Amount in dollars
 */
function toDollars(cents: number): number {
  return cents / 100;
}

/**
 * Calculates monthly estimate for a single bill based on recurrence.
 * Uses annualized approach: convert recurrence pattern to monthly rate.
 *
 * @param bill - The bill to estimate
 * @returns Monthly estimate in dollars
 */
function getMonthlyEstimate(bill: Bill): number {
  const dollars = parseFloat(bill.amount);

  switch (bill.recurrence) {
    case 'weekly':
      // Weekly × 52 weeks ÷ 12 months
      return (dollars * 52) / 12;
    case 'biweekly':
      // Biweekly × 26 cycles ÷ 12 months
      return (dollars * 26) / 12;
    case 'monthly':
      return dollars;
    case 'yearly':
      // Yearly ÷ 12 months
      return dollars / 12;
    case 'one_time':
    case 'custom':
      // These don't have a reliable monthly estimate
      return 0;
    default:
      return 0;
  }
}

// ─── Period-Based Bill Filtering ──────────────────────────────────────────────

/**
 * Internal structure for tracking bill occurrences before conversion to output type.
 */
interface InternalBillOccurrence {
  bill: Bill;
  dueDate: Date;
}

/**
 * Returns every bill occurrence that falls within [startDate, endDate] **inclusive**.
 *
 * Rules applied:
 * - Paused bills (isPaused === "true") are excluded
 * - Bills whose endDate is before startDate are excluded
 * - paymentsRemaining is respected (stops generating after N occurrences)
 * - One-time bills appear at most once
 * - Safety limit: max 200 iterations per bill to prevent infinite loops
 *
 * This is the **single source of truth** for "which bills are due between two dates".
 *
 * @param bills - Array of Bill records from the database
 * @param startDate - Window start (inclusive) – time component ignored
 * @param endDate - Window end (inclusive) – time component ignored
 * @returns Array of bill occurrences sorted chronologically
 */
export function getBillsForPeriod(
  bills: Bill[],
  startDate: Date,
  endDate: Date
): InternalBillOccurrence[] {
  const windowStart = startOfDay(startDate);
  const windowEnd = startOfDay(endDate);
  const results: InternalBillOccurrence[] = [];

  for (const bill of bills) {
    // Skip paused bills
    if (bill.isPaused === 'true') continue;

    // Skip bills that ended before our window
    if (bill.endDate) {
      const billEnd = startOfDay(parseISO(bill.endDate));
      if (isBefore(billEnd, windowStart)) continue;
    }

    let cursor = new Date(windowStart);
    let iterations = 0;
    const MAX_ITERATIONS = 200;
    let paymentsGenerated = 0;
    const maxPayments = bill.paymentsRemaining ?? null;

    while (iterations < MAX_ITERATIONS) {
      const nextDue = getNextBillOccurrence(bill, cursor);

      // No more occurrences, or occurrence is past our window
      if (!nextDue || isAfter(nextDue, windowEnd)) break;

      // Respect the bill's own endDate
      if (bill.endDate) {
        const billEnd = startOfDay(parseISO(bill.endDate));
        if (isAfter(nextDue, billEnd)) break;
      }

      // Respect paymentsRemaining
      if (maxPayments !== null && paymentsGenerated >= maxPayments) break;

      results.push({
        bill,
        dueDate: nextDue,
      });

      paymentsGenerated++;

      // Advance cursor past this occurrence so the loop finds the NEXT one
      if (bill.recurrence === 'one_time' || bill.recurrence === 'custom') {
        break; // Only one occurrence in range for these types
      } else if (bill.recurrence === 'weekly') {
        cursor = addWeeks(nextDue, 1);
      } else if (bill.recurrence === 'biweekly') {
        cursor = addDays(nextDue, 14);
      } else if (bill.recurrence === 'monthly') {
        cursor = addMonths(nextDue, 1);
      } else if (bill.recurrence === 'yearly') {
        cursor = addMonths(nextDue, 12);
      } else {
        cursor = addDays(nextDue, 1);
      }

      iterations++;
    }
  }

  // Sort chronologically
  results.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  return results;
}

// ─── Paid vs Predicted (Monarch-aligned) ──────────────────────────────────
//
// For each bill occurrence in a period, check whether a real transaction
// matches it within a tolerance window (±3 days, ±$2 of amount). Classify
// each occurrence as one of:
//
//   paid       — matching transaction found
//   missed     — due date is in the past (or today) and no match found
//   predicted  — due date is in the future and no match found yet
//
// Powers Monarch's "$X remaining due this month" recurring widget. Used by
// the dashboard and the Recurring page.

/** A bill occurrence with its paid/missed/predicted status and matched tx. */
export interface BillOccurrenceWithStatus {
  billId: string;
  billName: string;
  amount: number;
  category: string;
  dueDate: string; // yyyy-MM-dd
  recurrence: string;
  status: "paid" | "missed" | "predicted";
  /** ID of the matching transaction (when status === "paid"). */
  matchedTransactionId?: string;
  /** Date of the matching transaction (when status === "paid"). */
  matchedTransactionDate?: string;
  /** Actual amount paid (when status === "paid", may differ slightly from bill.amount). */
  paidAmount?: number;
}

/** Tolerance window for matching a transaction to a bill occurrence. */
const PAID_MATCH_DAY_TOLERANCE = 3;
const PAID_MATCH_AMOUNT_TOLERANCE = 2.0; // dollars

/**
 * Match a single bill occurrence to a transaction within tolerance.
 * Returns the matching transaction or null.
 *
 * Matching rules (in order):
 *   1. Transaction date within ±3 days of due date
 *   2. Transaction amount within ±$2 of bill amount
 *   3. Transaction merchant matches the bill's merchant (case-insensitive,
 *      whitespace-trimmed); if the bill has no merchant, name-match is used
 *   4. Transaction is a debit (we never match income to a bill)
 *
 * If multiple transactions match, the closest by date wins (ties broken
 * by smallest amount delta).
 */
function findMatchingTransaction(
  occurrence: InternalBillOccurrence,
  transactions: import("./normalized-types").NormalizedTransaction[]
): import("./normalized-types").NormalizedTransaction | null {
  const { bill, dueDate } = occurrence;
  const billAmount = parseFloat(bill.amount);
  const billMerchant = (bill.merchant ?? bill.name ?? "").trim().toLowerCase();

  let best: import("./normalized-types").NormalizedTransaction | null = null;
  let bestScore = Infinity; // lower = better (sum of date and amount delta)

  for (const tx of transactions) {
    if (tx.direction !== "debit") continue;
    if (tx.isPending) continue;
    if (tx.isTransfer) continue;

    let txDate: Date;
    try {
      txDate = parseISO(tx.date);
    } catch {
      continue;
    }
    const dayDelta = Math.abs(differenceInDays(txDate, dueDate));
    if (dayDelta > PAID_MATCH_DAY_TOLERANCE) continue;

    const amountDelta = Math.abs(tx.amount - billAmount);
    if (amountDelta > PAID_MATCH_AMOUNT_TOLERANCE) continue;

    const txMerchant = (tx.merchant ?? "").trim().toLowerCase();
    if (billMerchant && txMerchant) {
      // Loose merchant check: one is a substring of the other (handles
      // "Netflix" matching "NETFLIX.COM" etc.).
      if (
        !txMerchant.includes(billMerchant) &&
        !billMerchant.includes(txMerchant)
      ) {
        continue;
      }
    }

    const score = dayDelta + amountDelta;
    if (score < bestScore) {
      bestScore = score;
      best = tx;
    }
  }

  return best;
}

/**
 * For every bill occurrence in [startDate, endDate], classify as paid,
 * missed, or predicted. Returns a structured result with totals so the
 * UI can render Monarch-style "$2,603 remaining due."
 *
 * @param bills - User's Bills
 * @param transactions - Recent transactions to match against (caller should
 *   pass a window covering startDate - 3 days to endDate + 3 days at minimum)
 * @param startDate - Window start (inclusive)
 * @param endDate - Window end (inclusive)
 * @param today - Reference date for paid/missed/predicted classification
 *   (occurrences before today with no match → missed; after today → predicted)
 */
export function getBillsForPeriodWithStatus(
  bills: Bill[],
  transactions: import("./normalized-types").NormalizedTransaction[],
  startDate: Date,
  endDate: Date,
  today: Date
): {
  occurrences: BillOccurrenceWithStatus[];
  paidTotal: number;
  predictedTotal: number;
  missedTotal: number;
  remainingDue: number; // predicted + missed
} {
  const internal = getBillsForPeriod(bills, startDate, endDate);
  const todayMidnight = startOfDay(today);

  const result: BillOccurrenceWithStatus[] = [];
  let paidTotal = 0;
  let predictedTotal = 0;
  let missedTotal = 0;

  for (const occ of internal) {
    const match = findMatchingTransaction(occ, transactions);
    const billAmount = parseFloat(occ.bill.amount);

    let status: "paid" | "missed" | "predicted";
    let matchedTransactionId: string | undefined;
    let matchedTransactionDate: string | undefined;
    let paidAmount: number | undefined;

    if (match) {
      status = "paid";
      matchedTransactionId = match.id;
      matchedTransactionDate = match.date;
      paidAmount = match.amount;
      paidTotal += match.amount;
    } else if (isAfter(occ.dueDate, todayMidnight)) {
      status = "predicted";
      predictedTotal += billAmount;
    } else {
      status = "missed";
      missedTotal += billAmount;
    }

    result.push({
      billId: occ.bill.id,
      billName: occ.bill.name,
      amount: billAmount,
      category: occ.bill.canonicalCategoryId,
      dueDate: format(occ.dueDate, "yyyy-MM-dd"),
      recurrence: occ.bill.recurrence,
      status,
      matchedTransactionId,
      matchedTransactionDate,
      paidAmount,
    });
  }

  return {
    occurrences: result,
    paidTotal: Math.round(paidTotal * 100) / 100,
    predictedTotal: Math.round(predictedTotal * 100) / 100,
    missedTotal: Math.round(missedTotal * 100) / 100,
    remainingDue: Math.round((predictedTotal + missedTotal) * 100) / 100,
  };
}

// ─── Auto-dismiss stale recurrences ───────────────────────────────────────

/**
 * Check whether a bill should be auto-dismissed because no matching
 * transaction has been seen for `2 × cadence` past the last expected date.
 *
 * Wiring (next session): call from sync-scheduler after each sync. For each
 * non-dismissed bill where this returns true, set `is_auto_dismissed = true`
 * so the bill stops contributing to upcoming totals. Reactivation is
 * automatic: when a matching transaction shows up, a follow-up scan should
 * flip the flag back. (Or: the bill-detection auto-confirm pipeline can
 * recreate the bill if the user dismissed it intentionally.)
 *
 * @param bill - The bill to evaluate
 * @param transactions - Recent transactions covering the window since the
 *   bill's expected last occurrence
 * @param today - Reference date
 * @returns true if the bill should be auto-dismissed
 */
export function shouldAutoDismissBill(
  bill: Bill,
  transactions: import("./normalized-types").NormalizedTransaction[],
  today: Date
): boolean {
  // Never auto-dismiss paused / one-time / custom bills.
  if (bill.isPaused === "true") return false;
  if (bill.recurrence === "one_time" || bill.recurrence === "custom") return false;

  // Cadence in days for grace calculation.
  const cadenceDays =
    bill.recurrence === "weekly"
      ? 7
      : bill.recurrence === "biweekly"
        ? 14
        : bill.recurrence === "yearly"
          ? 365
          : 30; // monthly default
  const graceDays = cadenceDays * 2;

  // Look back twice the cadence; if no matching tx in that window, dismiss.
  const lookbackStart = addDays(today, -graceDays);
  const billAmount = parseFloat(bill.amount);
  const billMerchant = (bill.merchant ?? bill.name ?? "").trim().toLowerCase();

  for (const tx of transactions) {
    if (tx.direction !== "debit") continue;
    if (tx.isPending) continue;
    if (tx.isTransfer) continue;

    let txDate: Date;
    try {
      txDate = parseISO(tx.date);
    } catch {
      continue;
    }
    if (isBefore(txDate, lookbackStart)) continue;
    if (isAfter(txDate, today)) continue;

    const amountDelta = Math.abs(tx.amount - billAmount);
    if (amountDelta > PAID_MATCH_AMOUNT_TOLERANCE) continue;

    const txMerchant = (tx.merchant ?? "").trim().toLowerCase();
    if (billMerchant && txMerchant) {
      if (!txMerchant.includes(billMerchant) && !billMerchant.includes(txMerchant)) {
        continue;
      }
    }

    // Found a match within the grace window — keep the bill active.
    return false;
  }

  return true;
}

/**
 * Sums the total amount across a set of bill occurrences.
 *
 * @param occurrences - Array of bill occurrences
 * @returns Total amount in dollars
 */
function sumBillOccurrences(occurrences: InternalBillOccurrence[]): number {
  const totalCents = occurrences.reduce(
    (sum, o) => sum + toCents(o.bill.amount),
    0
  );
  return toDollars(totalCents);
}

/**
 * Converts internal occurrence format to output BillOccurrence format.
 */
function toBillOccurrence(occurrence: InternalBillOccurrence): BillOccurrence {
  return {
    billId: occurrence.bill.id,
    billName: occurrence.bill.name,
    amount: toDollars(toCents(occurrence.bill.amount)),
    category: occurrence.bill.canonicalCategoryId,
    dueDate: format(occurrence.dueDate, 'yyyy-MM-dd'),
    recurrence: occurrence.bill.recurrence,
    isPaused: occurrence.bill.isPaused === 'true',
  };
}

// ─── Main Bill Calculation ────────────────────────────────────────────────────

/**
 * Calculate bills for a given date range.
 *
 * Computes:
 * - Bills due in the specified month with exact occurrences
 * - Total for those bills
 * - Upcoming bills within 30 days from `today` parameter
 * - Estimated monthly bills (annualized from various recurrence patterns)
 * - Estimated annual bills
 *
 * @param params.bills - Array of bills from database
 * @param params.monthStart - Start of month window (yyyy-MM-01)
 * @param params.monthEnd - End of month window (yyyy-MM-31)
 * @param params.today - Reference date for 30-day upcoming calculation (defaults to now)
 * @returns BillsResult with all calculations
 */
export function calculateBillsForPeriod(params: {
  bills: Bill[];
  monthStart: Date;
  monthEnd: Date;
  today?: Date;
}): BillsResult {
  const { bills, monthStart, monthEnd } = params;
  const today = params.today || new Date();

  // Get bills due in the current month
  const thisMonthOccurrences = getBillsForPeriod(bills, monthStart, monthEnd);
  const thisMonthBills = thisMonthOccurrences.map(toBillOccurrence);
  const thisMonthTotal = sumBillOccurrences(thisMonthOccurrences);

  // Get upcoming bills within 30 days from today
  const thirtyDaysLater = addDays(today, 30);
  const upcomingOccurrences = getBillsForPeriod(bills, today, thirtyDaysLater);

  const upcomingBills = upcomingOccurrences
    .map((occ) => {
      const days = differenceInDays(occ.dueDate, today);
      return {
        ...toBillOccurrence(occ),
        daysUntil: days,
      };
    })
    // Filter to only active bills (not paused)
    .filter((bill) => !bill.isPaused);

  // Calculate monthly and annual estimates based on recurrence patterns
  const activeNonPausedBills = bills.filter((b) => b.isPaused !== 'true');
  const monthlyEstimate = activeNonPausedBills.reduce(
    (sum, bill) => sum + getMonthlyEstimate(bill),
    0
  );
  const annualEstimate = monthlyEstimate * 12;

  // Per-recurrence breakdown (monthly equivalents) for the reports page
  const byRecurrence: Record<string, number> = {};
  for (const bill of activeNonPausedBills) {
    const rec = bill.recurrence || 'monthly';
    byRecurrence[rec] = (byRecurrence[rec] || 0) + getMonthlyEstimate(bill);
  }

  return {
    thisMonthBills,
    thisMonthTotal,
    upcomingBills,
    monthlyEstimate,
    annualEstimate,
    byRecurrence,
  };
}