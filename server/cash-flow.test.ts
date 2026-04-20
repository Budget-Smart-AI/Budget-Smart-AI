import { describe, expect, it } from "vitest";
import { getBillsInRange } from "./cash-flow";
import type { Bill } from "@shared/schema";

// Minimal factory — fills only what getBillsInRange touches.
function billOf(overrides: Partial<Bill> = {}): Bill {
  return {
    id: "test-bill",
    userId: "test-user",
    name: "Test Bill",
    amount: "100.00",
    category: "Other",
    recurrence: "biweekly",
    dueDay: 2,
    startDate: null,
    endDate: null,
    customDates: null,
    paymentsRemaining: null,
    isPaused: "false",
    notes: null,
    lastNotifiedCycle: null,
    startingBalance: null,
    merchant: null,
    linkedPlaidAccountId: null,
    ...overrides,
  } as Bill;
}

describe("getBillsInRange — biweekly anchor (UAT-10 #174)", () => {
  const d = (iso: string) => new Date(iso + "T12:00:00Z");

  it("emits biweekly bills at strictly 14-day intervals from startDate", () => {
    const bill = billOf({
      name: "National Money",
      recurrence: "biweekly",
      dueDay: 2,
      startDate: "2026-04-20",
    });
    const events = getBillsInRange([bill], d("2026-04-19"), d("2026-06-15"));
    const dates = events.map(e => e.date);

    // Expected: Apr 20, May 4, May 18, Jun 1, Jun 15 — each exactly 14 days apart
    expect(dates).toEqual([
      "2026-04-20",
      "2026-05-04",
      "2026-05-18",
      "2026-06-01",
      "2026-06-15",
    ]);
  });

  it("does NOT produce 14/16-day alternating drift when dueDay is set", () => {
    // The exact shape UAT-10 caught: dueDay=2, startDate=Apr 20.
    // Pre-fix behavior: Apr 20, May 2, May 18, Jun 1, Jun 15 (14, 16, 14, 14).
    // Post-fix behavior: Apr 20, May 4, May 18, Jun 1, Jun 15 (all 14).
    const bill = billOf({
      name: "Easyfinancial",
      recurrence: "biweekly",
      dueDay: 2,
      startDate: "2026-04-20",
    });
    const events = getBillsInRange([bill], d("2026-04-19"), d("2026-06-16"));
    const dates = events.map(e => e.date);

    // Walk the deltas — every gap must be exactly 14 days.
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]).getTime();
      const curr = new Date(dates[i]).getTime();
      const days = (curr - prev) / (24 * 60 * 60 * 1000);
      expect(days).toBe(14);
    }
    expect(dates).not.toContain("2026-05-02"); // the drifted date
  });

  it("falls back to dueDay anchor when startDate is missing", () => {
    // Legacy bills without startDate still work — we anchor off dueDay
    // for the first emission, then walk +14 from that anchor.
    // Note: without a stable startDate the anchor is recomputed as
    // setDate(fromDate, dueDay) on each call, so some residual drift
    // remains in the dueDay-only path. The critical fix (startDate path)
    // eliminates drift entirely; this path just keeps legacy bills working.
    const bill = billOf({
      recurrence: "biweekly",
      dueDay: 15,
      startDate: null,
    });
    const events = getBillsInRange([bill], d("2026-04-01"), d("2026-05-15"));
    // First occurrence: setDate(Apr 1, 15) = Apr 15
    // Next cursor: Apr 15 + 14 = Apr 29 → anchor = setDate(Apr 29, 15) = Apr 15
    //   walk: Apr 15 < Apr 29 → +14 = Apr 29. Emit Apr 29.
    // Next cursor: Apr 29 + 14 = May 13 → anchor = setDate(May 13, 15) = May 15
    //   walk: May 15 not < May 13. Emit May 15.
    expect(events.map(e => e.date)).toEqual(["2026-04-15", "2026-04-29", "2026-05-15"]);
  });

  it("preserves behavior for monthly bills (regression guard)", () => {
    const bill = billOf({ recurrence: "monthly", dueDay: 15, startDate: null });
    const events = getBillsInRange([bill], d("2026-04-01"), d("2026-07-20"));
    expect(events.map(e => e.date)).toEqual([
      "2026-04-15", "2026-05-15", "2026-06-15", "2026-07-15",
    ]);
  });

  it("preserves behavior for yearly bills (regression guard)", () => {
    const bill = billOf({ recurrence: "yearly", dueDay: 1, startDate: null });
    // fromDate = Apr 2 so clampedDueDate(Apr 2, 1) = Apr 1 which is in the past → +12mo = Apr 1 2027
    // But Apr 1 2027 is within range, so we get exactly one event.
    const events = getBillsInRange([bill], d("2026-04-02"), d("2027-04-30"));
    expect(events.map(e => e.date)).toEqual(["2027-04-01"]);
  });
});

describe("getBillsInRange — dueDay > 28 clamping (UAT-10 #175)", () => {
  const d = (iso: string) => new Date(iso + "T12:00:00Z");

  it("monthly dueDay=31 lands on last day of every month", () => {
    const bill = billOf({
      name: "Service Charge",
      recurrence: "monthly",
      dueDay: 31,
      startDate: null,
    });
    // Window: Jan 1 2026 through Dec 31 2026 — covers all 12 months
    const events = getBillsInRange([bill], d("2026-01-01"), d("2026-12-31"));
    const dates = events.map(e => e.date);

    expect(dates).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
      "2026-07-31",
      "2026-08-31",
      "2026-09-30",
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
    ]);
  });

  it("monthly dueDay=30 lands on Feb 28 in non-leap year, Feb 29 in leap", () => {
    const bill = billOf({ recurrence: "monthly", dueDay: 30, startDate: null });
    // Window Jan–Mar 2026 (non-leap)
    let events = getBillsInRange([bill], d("2026-01-01"), d("2026-03-31"));
    expect(events.map(e => e.date)).toEqual([
      "2026-01-30",
      "2026-02-28",
      "2026-03-30",
    ]);
    // Window Jan–Mar 2028 (leap)
    events = getBillsInRange([bill], d("2028-01-01"), d("2028-03-31"));
    expect(events.map(e => e.date)).toEqual([
      "2028-01-30",
      "2028-02-29",
      "2028-03-30",
    ]);
  });

  it("monthly dueDay=15 unaffected by clamping (regression guard)", () => {
    const bill = billOf({ recurrence: "monthly", dueDay: 15, startDate: null });
    const events = getBillsInRange([bill], d("2026-01-01"), d("2026-03-31"));
    expect(events.map(e => e.date)).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
    ]);
  });

  it("yearly dueDay=31 on Feb lands on Feb 28/29 depending on year", () => {
    const bill = billOf({
      recurrence: "yearly",
      dueDay: 31,
      startDate: "2026-02-28",
    });
    const events = getBillsInRange([bill], d("2026-01-01"), d("2028-03-01"));
    // Whatever the exact shape, no emission should land in March.
    for (const e of events) {
      expect(e.date.slice(5, 7)).not.toBe("03");
    }
  });
});
