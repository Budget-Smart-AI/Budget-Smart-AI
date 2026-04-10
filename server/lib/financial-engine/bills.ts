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
    category: occurrence.bill.category,
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
  const activeNonPausedBills = bills.filter((bill) => bill.isPaused !== 'true');
  const monthlyEstimate = activeNonPausedBills.reduce(
    (sum, bill) => sum + getMonthlyEstimate(bill),
    0
  );
  const annualEstimate = monthlyEstimate * 12;

  return {
    thisMonthBills,
    thisMonthTotal,
    upcomingBills,
    monthlyEstimate,
    annualEstimate,
  };
}
