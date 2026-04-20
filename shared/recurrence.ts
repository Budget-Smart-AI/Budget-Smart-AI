/**
 * Canonical recurrence vocabulary + interval helpers.
 *
 * Single source of truth for how Budget Smart AI talks about repeating
 * events — both income deposits and recurring bills. Every writer should
 * run raw input through canonicalizeRecurrence(); every reader that walks
 * a cadence should use nextOccurrence().
 *
 * UAT-10 #168. See also: #174 (biweekly anchor), #175 (dueDay clamp),
 * #172 (save-time amount validation).
 */

import { addDays, addMonths, addWeeks, getDaysInMonth, isAfter, isBefore, setDate } from "date-fns";

export const RECURRENCE_VALUES = [
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
  "quarterly",
  "yearly",
  "custom",
  "irregular",
  "one_time",
] as const;

export type RecurrenceValue = (typeof RECURRENCE_VALUES)[number];

/**
 * Normalize raw input (from Plaid streams, UI forms, legacy save-maps)
 * to a canonical RecurrenceValue. Returns null for unrecognized input —
 * callers should surface a validation error rather than silently defaulting.
 *
 * Accepts: any casing, hyphens/underscores, English aliases.
 */
const ALIASES: Record<string, RecurrenceValue> = {
  weekly: "weekly",
  "bi-weekly": "biweekly",
  biweekly: "biweekly",
  "bi_weekly": "biweekly",
  "semi-monthly": "semimonthly",
  semimonthly: "semimonthly",
  "semi_monthly": "semimonthly",
  monthly: "monthly",
  quarterly: "quarterly",
  "semi-annual": "yearly",   // we don't store semi-annual; collapse to yearly
  "semi_annual": "yearly",
  annual: "yearly",
  annually: "yearly",
  yearly: "yearly",
  custom: "custom",
  irregular: "irregular",
  one_time: "one_time",
  onetime: "one_time",
  "one-time": "one_time",
  once: "one_time",
};

export function canonicalizeRecurrence(
  raw: string | null | undefined
): RecurrenceValue | null {
  if (!raw) return null;
  const key = String(raw).toLowerCase().trim();
  return ALIASES[key] ?? null;
}

/**
 * Advance `from` by one interval of `recurrence`. For fixed-interval
 * recurrences only. Throws for custom/irregular/one_time — those don't
 * walk a fixed cadence and callers must branch explicitly before calling.
 *
 * Semimonthly uses the 15th and the last day of the month as the two
 * paydays — the most common semimonthly pattern in North American payroll.
 * If `from` is on or before the 15th, returns the 15th of the same month
 * (unless already past); otherwise returns the last day of the same month;
 * otherwise rolls to the 15th of the next month.
 */
export function nextOccurrence(
  recurrence: RecurrenceValue,
  from: Date
): Date {
  switch (recurrence) {
    case "weekly":
      return addWeeks(from, 1);
    case "biweekly":
      return addDays(from, 14);
    case "monthly":
      return addMonths(from, 1);
    case "quarterly":
      return addMonths(from, 3);
    case "yearly":
      return addMonths(from, 12);
    case "semimonthly":
      return nextSemiMonthly(from);
    case "custom":
    case "irregular":
    case "one_time":
      throw new Error(
        `nextOccurrence: '${recurrence}' does not have a fixed interval; ` +
          `the caller must branch before advancing.`
      );
  }
}

/**
 * Next semi-monthly payday after `from`, using the 15th + end-of-month
 * as the two monthly anchors. Exported so callers (forecast renderer,
 * income projection) can reuse it.
 */
export function nextSemiMonthly(from: Date): Date {
  const day = from.getDate();
  const lastOfMonth = getDaysInMonth(from);
  if (day < 15) {
    return setDate(from, 15);
  }
  if (day < lastOfMonth) {
    return setDate(from, lastOfMonth);
  }
  // from is on the last day of the month — advance to the 15th of next month
  return setDate(addMonths(from, 1), 15);
}

/**
 * Returns the target month's due-date for the given dueDay, clamped to the
 * month's last day if dueDay exceeds it. Callers should use this wherever
 * they would otherwise call setDate(month, dueDay), because setDate overflows
 * silently:
 *
 *   setDate(new Date("2026-04-01"), 31) => 2026-05-01  ← wrong (April has 30)
 *   clampedDueDate(new Date("2026-04-01"), 31) => 2026-04-30  ← correct
 *
 * For dueDay <= 28 the result is identical to setDate(month, dueDay) on any
 * month (all months have at least 28 days). For dueDay > 28 the clamp kicks
 * in on short months. Defensive: dueDay is coerced into [1, 31] before the
 * min() so callers can't accidentally pass 0 or 32.
 *
 * UAT-10 #175.
 */
export function clampedDueDate(targetMonth: Date, dueDay: number): Date {
  const safeDueDay = Math.min(Math.max(1, Math.floor(dueDay)), 31);
  const daysInTarget = getDaysInMonth(targetMonth);
  const clamped = Math.min(safeDueDay, daysInTarget);
  return setDate(targetMonth, clamped);
}

/**
 * True if the recurrence value has a fixed advance interval (i.e.
 * nextOccurrence() is safe to call). Callers use this to decide
 * whether to branch into custom-dates or irregular-source logic.
 */
export function isFixedInterval(
  recurrence: RecurrenceValue
): recurrence is Exclude<RecurrenceValue, "custom" | "irregular" | "one_time"> {
  return (
    recurrence !== "custom" &&
    recurrence !== "irregular" &&
    recurrence !== "one_time"
  );
}

/**
 * Type guard for runtime checks.
 */
export function isRecurrenceValue(v: unknown): v is RecurrenceValue {
  return typeof v === "string" && (RECURRENCE_VALUES as readonly string[]).includes(v);
}
