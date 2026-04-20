import { describe, expect, it } from "vitest";
import {
  canonicalizeRecurrence,
  clampedDueDate,
  isFixedInterval,
  isRecurrenceValue,
  nextOccurrence,
  nextSemiMonthly,
} from "./recurrence";

describe("canonicalizeRecurrence", () => {
  it("accepts canonical values", () => {
    expect(canonicalizeRecurrence("weekly")).toBe("weekly");
    expect(canonicalizeRecurrence("biweekly")).toBe("biweekly");
    expect(canonicalizeRecurrence("semimonthly")).toBe("semimonthly");
    expect(canonicalizeRecurrence("monthly")).toBe("monthly");
    expect(canonicalizeRecurrence("quarterly")).toBe("quarterly");
    expect(canonicalizeRecurrence("yearly")).toBe("yearly");
    expect(canonicalizeRecurrence("custom")).toBe("custom");
    expect(canonicalizeRecurrence("irregular")).toBe("irregular");
    expect(canonicalizeRecurrence("one_time")).toBe("one_time");
  });

  it("normalizes aliases", () => {
    expect(canonicalizeRecurrence("Bi-Weekly")).toBe("biweekly");
    expect(canonicalizeRecurrence("SEMI-MONTHLY")).toBe("semimonthly");
    expect(canonicalizeRecurrence("annual")).toBe("yearly");
    expect(canonicalizeRecurrence("Annually")).toBe("yearly");
    expect(canonicalizeRecurrence("One-Time")).toBe("one_time");
    expect(canonicalizeRecurrence("onetime")).toBe("one_time");
    expect(canonicalizeRecurrence(" Monthly ")).toBe("monthly");
  });

  it("returns null for unknown or empty input", () => {
    expect(canonicalizeRecurrence(null)).toBeNull();
    expect(canonicalizeRecurrence(undefined)).toBeNull();
    expect(canonicalizeRecurrence("")).toBeNull();
    expect(canonicalizeRecurrence("fortnightly")).toBeNull();
    expect(canonicalizeRecurrence("every second tuesday")).toBeNull();
  });
});

describe("nextOccurrence", () => {
  const d = (iso: string) => new Date(iso + "T12:00:00Z");

  it("advances weekly by 7 days", () => {
    expect(nextOccurrence("weekly", d("2026-04-01")).toISOString().slice(0, 10))
      .toBe("2026-04-08");
  });

  it("advances biweekly by 14 days", () => {
    expect(nextOccurrence("biweekly", d("2026-04-01")).toISOString().slice(0, 10))
      .toBe("2026-04-15");
  });

  it("advances monthly by 1 month", () => {
    expect(nextOccurrence("monthly", d("2026-04-15")).toISOString().slice(0, 10))
      .toBe("2026-05-15");
  });

  it("advances quarterly by 3 months", () => {
    expect(nextOccurrence("quarterly", d("2026-01-15")).toISOString().slice(0, 10))
      .toBe("2026-04-15");
  });

  it("advances yearly by 12 months", () => {
    expect(nextOccurrence("yearly", d("2026-04-15")).toISOString().slice(0, 10))
      .toBe("2027-04-15");
  });

  it("semimonthly jumps from day<15 to the 15th", () => {
    expect(nextSemiMonthly(d("2026-04-01")).toISOString().slice(0, 10))
      .toBe("2026-04-15");
  });

  it("semimonthly jumps from 15 to end-of-month", () => {
    // 15th means we are no longer <15, so expect end-of-month (Apr has 30 days)
    expect(nextSemiMonthly(d("2026-04-15")).toISOString().slice(0, 10))
      .toBe("2026-04-30");
  });

  it("semimonthly jumps from end-of-month to 15th of next", () => {
    expect(nextSemiMonthly(d("2026-04-30")).toISOString().slice(0, 10))
      .toBe("2026-05-15");
  });

  it("throws for non-fixed recurrences", () => {
    expect(() => nextOccurrence("custom", d("2026-04-15"))).toThrow();
    expect(() => nextOccurrence("irregular", d("2026-04-15"))).toThrow();
    expect(() => nextOccurrence("one_time", d("2026-04-15"))).toThrow();
  });
});

describe("isFixedInterval + isRecurrenceValue", () => {
  it("isFixedInterval", () => {
    expect(isFixedInterval("weekly")).toBe(true);
    expect(isFixedInterval("biweekly")).toBe(true);
    expect(isFixedInterval("semimonthly")).toBe(true);
    expect(isFixedInterval("monthly")).toBe(true);
    expect(isFixedInterval("quarterly")).toBe(true);
    expect(isFixedInterval("yearly")).toBe(true);
    expect(isFixedInterval("custom")).toBe(false);
    expect(isFixedInterval("irregular")).toBe(false);
    expect(isFixedInterval("one_time")).toBe(false);
  });

  it("isRecurrenceValue type guard", () => {
    expect(isRecurrenceValue("weekly")).toBe(true);
    expect(isRecurrenceValue("fortnightly")).toBe(false);
    expect(isRecurrenceValue(null)).toBe(false);
    expect(isRecurrenceValue(42)).toBe(false);
  });
});

describe("clampedDueDate", () => {
  const d = (iso: string) => new Date(iso + "T12:00:00Z");

  it("passes through dueDay<=28 on any month", () => {
    // Arbitrary day in Feb (non-leap year 2026 has 28 days)
    expect(clampedDueDate(d("2026-02-15"), 15).toISOString().slice(0, 10))
      .toBe("2026-02-15");
    expect(clampedDueDate(d("2026-02-15"), 28).toISOString().slice(0, 10))
      .toBe("2026-02-28");
  });

  it("clamps dueDay=31 to the last day of short months", () => {
    expect(clampedDueDate(d("2026-04-10"), 31).toISOString().slice(0, 10))
      .toBe("2026-04-30");
    expect(clampedDueDate(d("2026-06-10"), 31).toISOString().slice(0, 10))
      .toBe("2026-06-30");
    expect(clampedDueDate(d("2026-09-10"), 31).toISOString().slice(0, 10))
      .toBe("2026-09-30");
    expect(clampedDueDate(d("2026-11-10"), 31).toISOString().slice(0, 10))
      .toBe("2026-11-30");
  });

  it("clamps dueDay=31 to Feb 28 in non-leap years", () => {
    expect(clampedDueDate(d("2026-02-10"), 31).toISOString().slice(0, 10))
      .toBe("2026-02-28");
  });

  it("clamps dueDay=31 to Feb 29 in leap years", () => {
    expect(clampedDueDate(d("2028-02-10"), 31).toISOString().slice(0, 10))
      .toBe("2028-02-29");
  });

  it("keeps dueDay=31 on long months", () => {
    expect(clampedDueDate(d("2026-01-10"), 31).toISOString().slice(0, 10))
      .toBe("2026-01-31");
    expect(clampedDueDate(d("2026-05-10"), 31).toISOString().slice(0, 10))
      .toBe("2026-05-31");
    expect(clampedDueDate(d("2026-12-10"), 31).toISOString().slice(0, 10))
      .toBe("2026-12-31");
  });

  it("clamps dueDay=30 to Feb 28/29", () => {
    expect(clampedDueDate(d("2026-02-10"), 30).toISOString().slice(0, 10))
      .toBe("2026-02-28");
    expect(clampedDueDate(d("2028-02-10"), 30).toISOString().slice(0, 10))
      .toBe("2028-02-29");
  });

  it("coerces out-of-range dueDay into [1, 31]", () => {
    expect(clampedDueDate(d("2026-04-10"), 0).toISOString().slice(0, 10))
      .toBe("2026-04-01");
    expect(clampedDueDate(d("2026-04-10"), 99).toISOString().slice(0, 10))
      .toBe("2026-04-30");
    expect(clampedDueDate(d("2026-04-10"), -5).toISOString().slice(0, 10))
      .toBe("2026-04-01");
  });
});
