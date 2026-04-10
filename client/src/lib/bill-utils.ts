/**
 * Centralized bill utility functions
 *
 * Single source of truth for client-side bill date calculations.
 * All components that need to compute upcoming / in-range bills
 * should use getBillsForPeriod() from this module so that the
 * algorithm is consistent everywhere.
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
} from "date-fns";
import type { Bill } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Low-level helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the next occurrence of a bill on or after `fromDate`.
 * Returns null when the bill has no future occurrence (e.g. a one_time bill
 * whose start date is already in the past).
 */
export function getNextBillOccurrence(bill: Bill, fromDate: Date): Date | null {
  const today = startOfDay(fromDate);

  // One-time payment
  if (bill.recurrence === "one_time") {
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

  // Custom dates list
  if (bill.recurrence === "custom" && bill.customDates) {
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

  // Weekly – dueDay is day-of-week (0 = Sun)
  if (bill.recurrence === "weekly") {
    let nextDue = setDay(today, bill.dueDay, { weekStartsOn: 0 });
    if (isBefore(nextDue, today)) {
      nextDue = addWeeks(nextDue, 1);
    }
    return nextDue;
  }

  // Monthly / biweekly / yearly – dueDay is day-of-month
  let nextDue = setDate(today, bill.dueDay);
  if (isBefore(nextDue, today)) {
    if (bill.recurrence === "monthly") {
      nextDue = addMonths(nextDue, 1);
    } else if (bill.recurrence === "biweekly") {
      while (isBefore(nextDue, today)) {
        nextDue = addDays(nextDue, 14);
      }
    } else if (bill.recurrence === "yearly") {
      nextDue = addMonths(nextDue, 12);
    }
  }

  return nextDue;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export interface BillOccurrence {
  bill: Bill;
  /** The specific due date for this occurrence */
  dueDate: Date;
  /** Due date as "yyyy-MM-dd" string */
  dueDateStr: string;
}

/**
 * Returns every bill occurrence (across all recurrence types) that falls
 * within [startDate, endDate] **inclusive**.
 *
 * Rules applied:
 * - Paused bills are excluded.
 * - Bills whose endDate is before startDate are excluded.
 * - paymentsRemaining is respected (stops generating after N occurrences).
 * - One-time bills appear at most once.
 *
 * This is the **single source of truth** for "which bills are due between
 * two dates" on the client side.  Use this in every component instead of
 * reimplementing the logic locally.
 *
 * @param bills   Array of Bill records (usually from /api/bills)
 * @param startDate  Window start (inclusive) – time component is ignored
 * @param endDate    Window end (inclusive)   – time component is ignored
 */
export function getBillsForPeriod(
  bills: Bill[],
  startDate: Date,
  endDate: Date
): BillOccurrence[] {
  const windowStart = startOfDay(startDate);
  const windowEnd = startOfDay(endDate);
  const results: BillOccurrence[] = [];

  for (const bill of bills) {
    if (bill.isPaused === "true") continue;

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
        dueDateStr: format(nextDue, "yyyy-MM-dd"),
      });

      paymentsGenerated++;

      // Advance cursor past this occurrence so the loop finds the NEXT one
      if (bill.recurrence === "one_time" || bill.recurrence === "custom") {
        break; // Only one occurrence in range for these types
      } else if (bill.recurrence === "weekly") {
        cursor = addWeeks(nextDue, 1);
      } else if (bill.recurrence === "biweekly") {
        cursor = addDays(nextDue, 14);
      } else if (bill.recurrence === "monthly") {
        cursor = addMonths(nextDue, 1);
      } else if (bill.recurrence === "yearly") {
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
 * Convenience: sum of all bill amounts in a getBillsForPeriod() result.
 */
export function sumBillOccurrences(occurrences: BillOccurrence[]): number {
  return occurrences.reduce((sum, o) => sum + parseFloat(o.bill.amount), 0);
}
