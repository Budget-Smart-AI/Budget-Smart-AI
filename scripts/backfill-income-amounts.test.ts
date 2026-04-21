import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the income-validation module before importing evaluate
vi.mock("../server/lib/income-validation", () => ({
  getRecentMatchingInflows: vi.fn(),
  median: (nums: number[]): number => {
    if (nums.length === 0) return 0;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  },
  HISTORY_WINDOW_DAYS: 120,
  SAMPLE_SIZE: 4,
}));

import { evaluate, type Decision } from "./backfill-income-amounts";
import { getRecentMatchingInflows } from "../server/lib/income-validation";

const mockedGetInflows = vi.mocked(getRecentMatchingInflows);

function makeRow(amount: number, source = "Coreslab") {
  return {
    id: "inc_001",
    userId: "user_001",
    source,
    amount: amount.toFixed(2),
    recurrence: "weekly",
    isRecurring: "true",
  };
}

describe("backfill-income-amounts evaluate()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns corrected for Ryan's Coreslab case (row=$5781, history≈$1900)", async () => {
    mockedGetInflows.mockResolvedValue([
      { date: "2026-04-18", amount: 1927 },
      { date: "2026-04-11", amount: 1900 },
      { date: "2026-04-04", amount: 1950 },
      { date: "2026-03-28", amount: 1880 },
    ]);

    const d: Decision = await evaluate(makeRow(5781));

    expect(d.action).toBe("corrected");
    expect(d.newAmount).toBeCloseTo(1913.5, 1); // median of [1880,1900,1927,1950]
    expect(d.driftRatio).toBeGreaterThan(0.2);
    expect(d.driftRatio).toBeLessThanOrEqual(10);
  });

  it("returns flagged when drift exceeds 10× (row=$50000, history≈$1900)", async () => {
    mockedGetInflows.mockResolvedValue([
      { date: "2026-04-18", amount: 1927 },
      { date: "2026-04-11", amount: 1900 },
    ]);

    const d: Decision = await evaluate(makeRow(50000));

    expect(d.action).toBe("flagged");
    expect(d.newAmount).toBe(50000); // amount NOT changed
    expect(d.driftRatio).toBeGreaterThan(10);
  });

  it("returns skipped when drift is within 20% tolerance (row=$1910, history≈$1910)", async () => {
    mockedGetInflows.mockResolvedValue([
      { date: "2026-04-18", amount: 1900 },
      { date: "2026-04-11", amount: 1920 },
    ]);

    const d: Decision = await evaluate(makeRow(1910));

    expect(d.action).toBe("skipped");
    expect(d.newAmount).toBe(1910); // unchanged
    expect(d.driftRatio).toBeLessThanOrEqual(0.2);
  });

  it("returns no_history when getRecentMatchingInflows returns empty", async () => {
    mockedGetInflows.mockResolvedValue([]);

    const d: Decision = await evaluate(makeRow(5781));

    expect(d.action).toBe("no_history");
    expect(d.newAmount).toBe(5781); // unchanged
    expect(d.sampleSize).toBe(0);
  });

  it("returns no_history when only 1 matching inflow exists", async () => {
    mockedGetInflows.mockResolvedValue([
      { date: "2026-04-18", amount: 1927 },
    ]);

    const d: Decision = await evaluate(makeRow(5781));

    expect(d.action).toBe("no_history");
    expect(d.sampleSize).toBe(1);
  });
});
