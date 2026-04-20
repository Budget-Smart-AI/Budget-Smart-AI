/**
 * Income validation + amount-from-history helpers (UAT-10 #171, #172).
 *
 * Replaces direct consumption of Plaid's `stream.average_amount.amount`
 * with a median of the user's last N matching inflow transactions. Same
 * helper backs the save-time validator on POST /api/income.
 *
 * Provider-agnostic: operates on rows fetched through `storage` so Plaid,
 * MX, and manual transactions are all eligible sources. v1 reads Plaid +
 * manual; MX follows in a later PR.
 */

import type { RecurrenceValue } from "@shared/recurrence";
import { isFixedInterval } from "@shared/recurrence";
import { storage } from "../storage";

/** Maximum drift the median can tolerate before a save is blocked. */
export const AMOUNT_MISMATCH_FACTOR = 1.5;

/** Sample window the validator/detector pull from. */
export const HISTORY_WINDOW_DAYS = 120;

/** Number of matching transactions used to compute the median. */
export const SAMPLE_SIZE = 4;

/**
 * Map a recurrence to the window (in days) within which we expect to see
 * one occurrence. Used only to size the lookup; the median is computed
 * from the last SAMPLE_SIZE matches regardless of window.
 *
 * Returns `null` for irregular/custom/one_time — the validator skips them.
 */
export function cadenceWindowDays(r: RecurrenceValue): number | null {
  switch (r) {
    case "weekly":
      return 7;
    case "biweekly":
      return 14;
    case "semimonthly":
      return 15;
    case "monthly":
      return 31;
    case "quarterly":
      return 92;
    case "yearly":
      return 366;
    default:
      return null; // custom, irregular, one_time
  }
}

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * `high` = all sampled amounts within ±10% of the median AND sample size ≥ 3
 * `medium` = within ±30% of the median AND sample size ≥ 2
 * `low` = otherwise (including any case with fewer than 2 observations)
 *
 * Early-detection Plaid streams are always "low" regardless of variance
 * — the caller enforces that before this function is invoked.
 */
export function computeAmountConfidence(
  samples: number[],
): "high" | "medium" | "low" {
  if (samples.length < 2) return "low";
  const m = median(samples);
  if (m === 0) return "low";
  const maxDrift = Math.max(...samples.map((s) => Math.abs(s - m) / m));
  if (samples.length >= 3 && maxDrift <= 0.1) return "high";
  if (maxDrift <= 0.3) return "medium";
  return "low";
}

/**
 * Pull inflow transactions across Plaid + manual for the user in the
 * given window, filter by a case-insensitive substring match on the
 * source name (against both merchantName and name), return absolute
 * amounts sorted by date descending.
 */
export async function getRecentMatchingInflows(
  userId: string,
  source: string,
  withinDays: number = HISTORY_WINDOW_DAYS,
): Promise<{ date: string; amount: number }[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - withinDays);
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];
  const needle = source.toLowerCase().trim();
  if (!needle) return [];

  // Plaid inflows (negative amounts = deposits)
  const plaidItems = await storage.getPlaidItems(userId);
  const plaidAccountIds: string[] = [];
  for (const item of plaidItems) {
    const accs = await storage.getPlaidAccounts(item.id);
    plaidAccountIds.push(
      ...accs.filter((a) => a.isActive === "true").map((a) => a.id),
    );
  }
  const plaidTx =
    plaidAccountIds.length === 0
      ? []
      : await storage.getPlaidTransactions(plaidAccountIds, {
          startDate: startStr,
          endDate: endStr,
        });

  const plaidMatches = plaidTx
    .filter((t) => {
      const amt = parseFloat(t.amount);
      if (!(amt < 0)) return false; // inflows only
      const nameBlob =
        `${t.merchantName || ""} ${t.name || ""}`.toLowerCase();
      return nameBlob.includes(needle);
    })
    .map((t) => ({ date: t.date, amount: Math.abs(parseFloat(t.amount)) }));

  // Manual inflows
  const manualTx = await storage.getManualTransactionsByUser(userId, {
    startDate: startStr,
    endDate: endStr,
  });
  const manualMatches = manualTx
    .filter((t: any) => {
      const amt = parseFloat(t.amount);
      if (!(amt > 0) || t.type !== "income") return false;
      const nameBlob =
        `${t.merchantName || ""} ${t.description || ""} ${t.name || ""}`.toLowerCase();
      return nameBlob.includes(needle);
    })
    .map((t: any) => ({
      date: t.date,
      amount: Math.abs(parseFloat(t.amount)),
    }));

  return [...plaidMatches, ...manualMatches].sort((a, b) =>
    a.date < b.date ? 1 : -1,
  );
}

export type AmountValidation =
  | { ok: true }
  | {
      ok: false;
      code: "AMOUNT_CADENCE_MISMATCH";
      observedMedian: number;
      suggestedAmount: number;
      sampleSize: number;
    }
  | {
      ok: true;
      skipped: "no_history" | "non_fixed_interval" | "non_recurring";
    };

/**
 * Returns ok:true when the submitted amount is plausible, ok:false with
 * a suggested amount when it isn't. Skips the check (returns ok:true)
 * when the record is one-time, has a custom/irregular recurrence, or
 * when we have no matching history to compare against.
 */
export async function validateAmountAgainstHistory(args: {
  userId: string;
  source: string;
  recurrence: RecurrenceValue | null | undefined;
  amount: number;
  isRecurring: boolean;
}): Promise<AmountValidation> {
  if (!args.isRecurring) return { ok: true, skipped: "non_recurring" };
  if (!args.recurrence || !isFixedInterval(args.recurrence)) {
    return { ok: true, skipped: "non_fixed_interval" };
  }
  const all = await getRecentMatchingInflows(args.userId, args.source);
  const sample = all.slice(0, SAMPLE_SIZE).map((t) => t.amount);
  if (sample.length === 0) return { ok: true, skipped: "no_history" };

  const obs = median(sample);
  if (obs === 0) return { ok: true, skipped: "no_history" };

  if (args.amount > obs * AMOUNT_MISMATCH_FACTOR) {
    return {
      ok: false,
      code: "AMOUNT_CADENCE_MISMATCH",
      observedMedian: Math.round(obs * 100) / 100,
      suggestedAmount: Math.round(obs * 100) / 100,
      sampleSize: sample.length,
    };
  }
  return { ok: true };
}
