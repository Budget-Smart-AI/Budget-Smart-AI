import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  median,
  cadenceWindowDays,
  computeAmountConfidence,
  validateAmountAgainstHistory,
  AMOUNT_MISMATCH_FACTOR,
} from "./income-validation";

// ── Mock storage ──────────────────────────────────────────────────────────────
vi.mock("../storage", () => ({
  storage: {
    getPlaidItems: vi.fn().mockResolvedValue([]),
    getPlaidAccounts: vi.fn().mockResolvedValue([]),
    getPlaidTransactions: vi.fn().mockResolvedValue([]),
    getManualTransactionsByUser: vi.fn().mockResolvedValue([]),
  },
}));

import { storage } from "../storage";
const mockStorage = storage as unknown as {
  getPlaidItems: ReturnType<typeof vi.fn>;
  getPlaidAccounts: ReturnType<typeof vi.fn>;
  getPlaidTransactions: ReturnType<typeof vi.fn>;
  getManualTransactionsByUser: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockStorage.getPlaidItems.mockResolvedValue([]);
  mockStorage.getPlaidAccounts.mockResolvedValue([]);
  mockStorage.getPlaidTransactions.mockResolvedValue([]);
  mockStorage.getManualTransactionsByUser.mockResolvedValue([]);
});

// ── median ────────────────────────────────────────────────────────────────────
describe("median", () => {
  it("returns 0 for empty array", () => {
    expect(median([])).toBe(0);
  });

  it("returns the single element", () => {
    expect(median([5])).toBe(5);
  });

  it("returns the middle element for odd-length array", () => {
    expect(median([1, 2, 3])).toBe(2);
  });

  it("returns the average of the two middle elements for even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

// ── cadenceWindowDays ─────────────────────────────────────────────────────────
describe("cadenceWindowDays", () => {
  it("weekly → 7", () => expect(cadenceWindowDays("weekly")).toBe(7));
  it("biweekly → 14", () => expect(cadenceWindowDays("biweekly")).toBe(14));
  it("semimonthly → 15", () => expect(cadenceWindowDays("semimonthly")).toBe(15));
  it("monthly → 31", () => expect(cadenceWindowDays("monthly")).toBe(31));
  it("quarterly → 92", () => expect(cadenceWindowDays("quarterly")).toBe(92));
  it("yearly → 366", () => expect(cadenceWindowDays("yearly")).toBe(366));
  it("custom → null", () => expect(cadenceWindowDays("custom")).toBeNull());
  it("irregular → null", () => expect(cadenceWindowDays("irregular")).toBeNull());
  it("one_time → null", () => expect(cadenceWindowDays("one_time")).toBeNull());
});

// ── computeAmountConfidence ───────────────────────────────────────────────────
describe("computeAmountConfidence", () => {
  it("identical amounts (4 samples) → high", () => {
    expect(computeAmountConfidence([1000, 1000, 1000, 1000])).toBe("high");
  });

  it("all within 10% of median (4 samples) → high", () => {
    // median of [1880, 1900, 1927, 1950] = (1900+1927)/2 = 1913.5
    // max drift = |1880-1913.5|/1913.5 ≈ 0.0175 < 0.10
    expect(computeAmountConfidence([1900, 1950, 1927, 1880])).toBe("high");
  });

  it("within 30% but not 10% of median → medium", () => {
    // sorted: [1000, 1200, 1250, 1300], median = (1200+1250)/2 = 1225
    // max drift = |1000-1225|/1225 ≈ 0.1837 — within 30%
    expect(computeAmountConfidence([1000, 1200, 1250, 1300])).toBe("medium");
  });

  it("large variance → low", () => {
    expect(computeAmountConfidence([1000, 2000, 500])).toBe("low");
  });

  it("sample < 2 → low", () => {
    expect(computeAmountConfidence([1000])).toBe("low");
  });

  it("median 0 → low", () => {
    expect(computeAmountConfidence([0, 0])).toBe("low");
  });
});

// ── validateAmountAgainstHistory ──────────────────────────────────────────────
describe("validateAmountAgainstHistory", () => {
  const baseArgs = {
    userId: "user-1",
    source: "Coreslab",
    recurrence: "weekly" as const,
    amount: 1927,
    isRecurring: true,
  };

  it("non-recurring save → ok:true, skipped:non_recurring", async () => {
    const result = await validateAmountAgainstHistory({
      ...baseArgs,
      isRecurring: false,
    });
    expect(result).toEqual({ ok: true, skipped: "non_recurring" });
  });

  it("custom recurrence → ok:true, skipped:non_fixed_interval", async () => {
    const result = await validateAmountAgainstHistory({
      ...baseArgs,
      recurrence: "custom",
    });
    expect(result).toEqual({ ok: true, skipped: "non_fixed_interval" });
  });

  it("no matching transactions → ok:true, skipped:no_history", async () => {
    const result = await validateAmountAgainstHistory(baseArgs);
    expect(result).toEqual({ ok: true, skipped: "no_history" });
  });

  it("amount $5781 vs 4 matches [1927, 1900, 1950, 1880] → ok:false with suggestedAmount 1913.5", async () => {
    // Setup mock: Plaid items + accounts + transactions with Coreslab deposits
    mockStorage.getPlaidItems.mockResolvedValue([{ id: "item-1" }]);
    mockStorage.getPlaidAccounts.mockResolvedValue([
      { id: "acc-1", isActive: "true" },
    ]);
    mockStorage.getPlaidTransactions.mockResolvedValue([
      { date: "2026-04-18", amount: "-1927", merchantName: "Coreslab", name: "Coreslab Direct Dep" },
      { date: "2026-04-11", amount: "-1900", merchantName: "Coreslab", name: "Coreslab Direct Dep" },
      { date: "2026-04-04", amount: "-1950", merchantName: "Coreslab", name: "Coreslab Direct Dep" },
      { date: "2026-03-28", amount: "-1880", merchantName: "Coreslab", name: "Coreslab Direct Dep" },
    ]);

    const result = await validateAmountAgainstHistory({
      ...baseArgs,
      amount: 5781,
    });

    expect(result).toEqual({
      ok: false,
      code: "AMOUNT_CADENCE_MISMATCH",
      observedMedian: 1913.5,
      suggestedAmount: 1913.5,
      sampleSize: 4,
    });
  });

  it("amount $2000 vs 4 matches [1927, 1900, 1950, 1880] → ok:true (≤ 1.5× median)", async () => {
    mockStorage.getPlaidItems.mockResolvedValue([{ id: "item-1" }]);
    mockStorage.getPlaidAccounts.mockResolvedValue([
      { id: "acc-1", isActive: "true" },
    ]);
    mockStorage.getPlaidTransactions.mockResolvedValue([
      { date: "2026-04-18", amount: "-1927", merchantName: "Coreslab", name: "Coreslab Direct Dep" },
      { date: "2026-04-11", amount: "-1900", merchantName: "Coreslab", name: "Coreslab Direct Dep" },
      { date: "2026-04-04", amount: "-1950", merchantName: "Coreslab", name: "Coreslab Direct Dep" },
      { date: "2026-03-28", amount: "-1880", merchantName: "Coreslab", name: "Coreslab Direct Dep" },
    ]);

    const result = await validateAmountAgainstHistory({
      ...baseArgs,
      amount: 2000,
    });

    // 2000 ≤ 1913.5 × 1.5 = 2870.25 → ok
    expect(result).toEqual({ ok: true });
  });

  it("biweekly $3000 vs [1900, 1920, 1900, 1910] → ok:false (treats weekly and biweekly identically at the gate)", async () => {
    mockStorage.getPlaidItems.mockResolvedValue([{ id: "item-1" }]);
    mockStorage.getPlaidAccounts.mockResolvedValue([
      { id: "acc-1", isActive: "true" },
    ]);
    mockStorage.getPlaidTransactions.mockResolvedValue([
      { date: "2026-04-18", amount: "-1900", merchantName: "Coreslab", name: "Coreslab Direct Dep" },
      { date: "2026-04-04", amount: "-1920", merchantName: "Coreslab", name: "Coreslab Direct Dep" },
      { date: "2026-03-21", amount: "-1900", merchantName: "Coreslab", name: "Coreslab Direct Dep" },
      { date: "2026-03-07", amount: "-1910", merchantName: "Coreslab", name: "Coreslab Direct Dep" },
    ]);

    // median of [1900, 1900, 1910, 1920] = (1900 + 1910) / 2 = 1905
    // Correction: sorted = [1900, 1900, 1910, 1920], median = (1900+1910)/2 = 1905
    // 3000 > 1905 × 1.5 = 2857.5 → fails
    const result = await validateAmountAgainstHistory({
      ...baseArgs,
      recurrence: "biweekly",
      amount: 3000,
    });

    // The median of [1900, 1920, 1900, 1910] sorted = [1900, 1900, 1910, 1920]
    // median = (1900 + 1910) / 2 = 1905
    expect(result).toEqual({
      ok: false,
      code: "AMOUNT_CADENCE_MISMATCH",
      observedMedian: 1905,
      suggestedAmount: 1905,
      sampleSize: 4,
    });
  });
});
