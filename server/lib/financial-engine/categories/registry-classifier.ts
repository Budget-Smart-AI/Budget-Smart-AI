/**
 * Registry Classifier
 *
 * Takes a window of historical bank deposits and produces classified income
 * sources ready to be upserted into `income_sources` + seed
 * `income_source_amounts`. This is the brain behind /api/income/registry/refresh.
 *
 * Why this exists separately from `recurring-income-detector.ts`:
 *   - The legacy detector targets the `income` table (one row per detected
 *     paycheck). It's the source of UAT-6's duplicate-recurring-income bug.
 *   - This classifier targets the registry — one row per *stream*, not per
 *     paycheck — and assigns the registry's mode (fixed/variable/irregular)
 *     plus cadence-specific extras (semimonthly day-pair, custom days).
 *
 * Classification rules (locked-in operator decisions, see the Monarch
 * Alignment memory record):
 *
 *   Mode:
 *     - fixed     → coefficient of variation in amounts ≤ 5% AND ≥ 3 hits
 *     - variable  → CV between 5% and 30% AND ≥ 3 hits (contractor / OT)
 *     - irregular → CV > 30% OR < 3 hits over 90+ days (entrepreneur / freelance)
 *
 *   Cadence:
 *     1. Prefer Plaid's `frequency` enum when it disagrees with our interval
 *        analysis (Plaid sees more transactions than our window does).
 *     2. Otherwise infer from interval mean/std-dev:
 *          weekly       6-8 days
 *          biweekly     13-16 days   (no semimonthly hint in calendar pattern)
 *          semimonthly  13-16 days   AND deposits cluster on two specific
 *                                     calendar days each month (e.g. 15 + last)
 *          monthly      28-35 days
 *          yearly       360-370 days
 *          irregular    fallback when no band fits
 *
 *   Category bucket — matches INCOME_CATEGORIES in shared/schema.ts so the
 *   downstream Income page filters work.
 */

import {
  parseISO,
  differenceInDays,
  getDaysInMonth,
} from "date-fns";

export type ClassifiedMode = "fixed" | "variable" | "irregular";
export type ClassifiedCadence =
  | "weekly"
  | "biweekly"
  | "semimonthly"
  | "monthly"
  | "yearly"
  | "irregular"
  | "one_time";

export interface DepositSample {
  /** yyyy-MM-dd */
  date: string;
  /** Always positive (absolute value of the credit). */
  amount: number;
  /** Display name as the user saw it. Will be reduced via `normalizeSourceName`. */
  merchant: string;
  /** Optional: Plaid PFC primary so we can route Salary vs Investments etc. */
  pfcPrimary?: string | null;
  /** Optional: Plaid PFC detailed for income subtype detection. */
  pfcDetailed?: string | null;
}

export interface RegistryClassification {
  /** Lowercase, noise-stripped — matches the unique index. */
  normalizedSource: string;
  displayName: string;
  recurrence: ClassifiedCadence;
  mode: ClassifiedMode;
  /** Most recent observed pay date — used as the cadence anchor. */
  cadenceAnchor: string; // yyyy-MM-dd
  /**
   * Recurrence-specific extra config. JSON-serialized when written to the
   * `cadence_extra` column.
   *   semimonthly: { semimonthlyDays: [number|"last", number|"last"] }
   *   custom:      { customDays: number[] }
   */
  cadenceExtra: Record<string, unknown> | null;
  category: "Salary" | "Interest" | "Freelance" | "Business" | "Investments" | "Rental" | "Gifts" | "Refunds" | "Other";
  /**
   * Unit amount to seed into `income_source_amounts.effective_from = today`.
   * For fixed mode this is the latest observed deposit. For variable mode
   * it's the rolling average — the engine treats it as an estimate.
   */
  unitAmount: number;
  /** Number of deposits the classification was based on (for confidence display). */
  occurrences: number;
  /** Coefficient of variation in the deposit amounts (0-1). */
  amountCv: number;
}

/**
 * Stay in lockstep with the engine's normalizeSourceName so registry rows
 * collide on the unique index when the same source appears via two paths.
 */
export function normalizeSourceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(direct dep|dir dep|payroll|deposit|payment|pay|inc|ltd|llc|corp|co)\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Decide cadence from interval stats. Returns null if no recognized pattern,
 * caller should fall back to "irregular".
 */
function inferCadence(intervals: number[]): ClassifiedCadence | null {
  if (intervals.length === 0) return null;
  const m = mean(intervals);
  const sd = stddev(intervals);
  // Reject as cadence-eligible if intervals are too noisy.
  if (m > 0 && sd / m > 0.4) return null;

  if (m >= 6 && m <= 8) return "weekly";
  if (m >= 13 && m <= 16) return "biweekly"; // semimonthly resolves below
  if (m >= 28 && m <= 35) return "monthly";
  if (m >= 360 && m <= 370) return "yearly";
  return null;
}

/**
 * Detect whether a deposit series matches a semimonthly pattern.
 * Pattern signature: in any month with 2+ deposits, those deposits land on
 * the SAME two calendar days (allowing ±2 days drift for weekend rollovers).
 * Returns the canonical day-pair (e.g. [15, "last"]) or null.
 */
function detectSemimonthlyAnchor(
  dates: string[],
): [number | "last", number | "last"] | null {
  // Bucket by yyyy-MM
  const byMonth: Record<string, number[]> = {};
  for (const d of dates) {
    const ym = d.slice(0, 7);
    if (!byMonth[ym]) byMonth[ym] = [];
    const day = parseInt(d.slice(8, 10), 10);
    byMonth[ym].push(day);
  }

  // Find months with exactly 2 deposits
  const pairs: Array<[number, number]> = [];
  for (const [ym, days] of Object.entries(byMonth)) {
    if (days.length !== 2) continue;
    const sorted = [...days].sort((a, b) => a - b);
    pairs.push([sorted[0], sorted[1]]);
  }
  if (pairs.length < 2) return null;

  // Average each anchor across months
  const a1 = Math.round(mean(pairs.map((p) => p[0])));
  const a2 = Math.round(mean(pairs.map((p) => p[1])));
  // All pairs must be within ±2 days of the average — otherwise call it
  // biweekly (which could happen to land 2x in a long month).
  for (const [p1, p2] of pairs) {
    if (Math.abs(p1 - a1) > 2 || Math.abs(p2 - a2) > 2) return null;
  }

  // Prefer the canonical "last" symbol when an anchor lands within 3 days of
  // month end (handles 28/29/30/31 variations across the year).
  const monthEndCutoff = 28;
  const mapAnchor = (a: number, sampleDates: string[]): number | "last" => {
    // If average is near the end of the typical month, see whether the
    // actual deposits hit the *last day* in months like Feb (28) and Apr (30).
    if (a < monthEndCutoff) return a;
    let lastCount = 0;
    let total = 0;
    for (const d of sampleDates) {
      const day = parseInt(d.slice(8, 10), 10);
      const dim = getDaysInMonth(parseISO(d + "T00:00:00"));
      if (Math.abs(day - dim) <= 1) lastCount += 1;
      total += 1;
    }
    return lastCount / total >= 0.5 ? "last" : a;
  };

  const lateDays = dates.filter((d) => parseInt(d.slice(8, 10), 10) >= monthEndCutoff);
  return [mapAnchor(a1, dates), mapAnchor(a2, lateDays.length > 0 ? lateDays : dates)];
}

function classifyMode(amounts: number[]): { mode: ClassifiedMode; cv: number } {
  if (amounts.length < 3) return { mode: "irregular", cv: 1 };
  const m = mean(amounts);
  const sd = stddev(amounts);
  const cv = m > 0 ? sd / m : 1;
  if (cv <= 0.05) return { mode: "fixed", cv };
  if (cv <= 0.30) return { mode: "variable", cv };
  return { mode: "irregular", cv };
}

function pickCategory(
  pfcPrimary?: string | null,
  pfcDetailed?: string | null,
  amount?: number,
): RegistryClassification["category"] {
  const det = (pfcDetailed || "").toUpperCase();
  if (det.startsWith("INCOME_INTEREST")) return "Interest";
  if (det.startsWith("INCOME_DIVIDENDS")) return "Investments";
  if (det.startsWith("INCOME_RETIREMENT")) return "Investments";
  if (det.startsWith("INCOME_RENTAL")) return "Rental";
  if (det.startsWith("INCOME_TAX_REFUND") || det.startsWith("INCOME_REFUND")) return "Refunds";
  if (det.startsWith("INCOME_WAGES")) return "Salary";

  const prim = (pfcPrimary || "").toUpperCase();
  if (prim === "INCOME") return "Salary"; // safest default for INCOME without subtype

  // Sub-$2 fallback aligns with the income-classifier in adapters/plaid-adapter.ts
  if (typeof amount === "number" && amount < 2) return "Interest";

  return "Other";
}

/**
 * Run the classifier over a window of inflow transactions.
 *
 * `today` is the reference date used as the seed amount's `effective_from`.
 * Defaults to `new Date()`; tests can pin it.
 */
export function classifyDepositsForRegistry(
  deposits: DepositSample[],
  opts: { today?: Date; minOccurrences?: number; minAmount?: number } = {},
): RegistryClassification[] {
  const today = opts.today ?? new Date();
  const minOcc = opts.minOccurrences ?? 2;
  const minAmount = opts.minAmount ?? 100;

  // Group by normalized name; carry through PFC for category resolution.
  const groups: Record<
    string,
    {
      key: string;
      entries: DepositSample[];
    }
  > = {};
  for (const d of deposits) {
    if (!d.merchant) continue;
    const key = normalizeSourceName(d.merchant);
    if (!key || key.length < 2) continue;
    if (!groups[key]) groups[key] = { key, entries: [] };
    groups[key].entries.push(d);
  }

  const results: RegistryClassification[] = [];

  for (const { key, entries } of Object.values(groups)) {
    if (entries.length < minOcc) continue;

    // Sort ascending by date
    entries.sort((a, b) => a.date.localeCompare(b.date));

    const amounts = entries.map((e) => e.amount);
    const meanAmount = mean(amounts);
    if (meanAmount < minAmount) continue;

    // Compute intervals
    const intervals: number[] = [];
    for (let i = 1; i < entries.length; i++) {
      const days = differenceInDays(parseISO(entries[i].date), parseISO(entries[i - 1].date));
      if (days > 0) intervals.push(days);
    }

    // Cadence inference
    let cadence: ClassifiedCadence = inferCadence(intervals) ?? "irregular";
    let cadenceExtra: Record<string, unknown> | null = null;

    // Promote biweekly → semimonthly when calendar pattern matches
    if (cadence === "biweekly") {
      const semi = detectSemimonthlyAnchor(entries.map((e) => e.date));
      if (semi) {
        cadence = "semimonthly";
        cadenceExtra = { semimonthlyDays: semi };
      }
    }

    // Mode classification
    const { mode, cv } = classifyMode(amounts);
    // If no recognizable cadence and < 3 hits, treat as one_time
    let finalCadence = cadence;
    let finalMode = mode;
    if (cadence === "irregular" && entries.length < 3) {
      finalCadence = "one_time";
      finalMode = "irregular";
    } else if (cadence === "irregular") {
      // Keep as irregular but ensure mode reflects that — entrepreneur income.
      finalMode = "irregular";
    }

    const last = entries[entries.length - 1];
    const cat = pickCategory(last.pfcPrimary, last.pfcDetailed, meanAmount);

    // Unit amount: latest observed for fixed; rolling average for variable;
    // mean for irregular (UI displays as estimate).
    const unitAmount =
      finalMode === "fixed"
        ? Math.round(last.amount * 100) / 100
        : Math.round(meanAmount * 100) / 100;

    results.push({
      normalizedSource: key,
      displayName: last.merchant, // most recent raw form
      recurrence: finalCadence,
      mode: finalMode,
      cadenceAnchor: last.date,
      cadenceExtra,
      category: cat,
      unitAmount,
      occurrences: entries.length,
      amountCv: Math.round(cv * 1000) / 1000,
    });
  }

  // Stable order: highest occurrence count first, then biggest unit amount.
  results.sort((a, b) => b.occurrences - a.occurrences || b.unitAmount - a.unitAmount);

  void today; // currently unused but reserved for future "active as of" gating
  return results;
}
