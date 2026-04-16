/**
 * Bill Auto-Detection
 *
 * Scans transaction history to identify recurring payment patterns and emits
 * either auto-confirmed `Bill` candidates (high confidence) or "Suggested
 * bills" for user review (lower confidence).
 *
 * Implements the Monarch-aligned approach described in
 * `MONARCH_VS_BSAI.md` §2 with the operator's chosen confidence thresholds:
 *
 *   AUTO-CONFIRM if all are true:
 *     - ≥ 3 occurrences observed
 *     - merchant matches consistently (after normalisation)
 *     - amount variance ≤ $1.00 across occurrences
 *     - cadence stddev / mean < 30%
 *
 *   SUGGEST otherwise (≥ 2 occurrences with at least cadence detected),
 *   with a confidence score the UI can use for sorting.
 *
 *   IGNORE if < 2 occurrences or cadence cannot be detected.
 *
 * Wiring (next session):
 *   Call `detectRecurringFromTransactions(txns, existingBills)` from the bill
 *   sync pipeline (server/sync-scheduler.ts after a Plaid/MX sync). For each
 *   `auto-confirm` candidate not already represented in `existingBills`,
 *   insert a new `bills` row with `isAutoDetected = true` and
 *   `autoDetectedFrom = candidate.transactionIds.join(',')`. For `suggest`
 *   candidates, write to a new `suggested_bills` table that the UI surfaces
 *   in an inbox.
 *
 * Schema additions needed (next session):
 *   ALTER TABLE bills ADD COLUMN is_auto_detected BOOLEAN DEFAULT false;
 *   ALTER TABLE bills ADD COLUMN auto_detected_from TEXT;          -- comma-sep tx IDs
 *   ALTER TABLE bills ADD COLUMN is_auto_dismissed BOOLEAN DEFAULT false;
 *   CREATE TABLE suggested_bills (
 *     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *     user_id VARCHAR NOT NULL,
 *     merchant TEXT NOT NULL,
 *     amount NUMERIC(10,2) NOT NULL,
 *     recurrence TEXT NOT NULL,           -- weekly|biweekly|monthly|yearly
 *     cadence_days NUMERIC(5,2) NOT NULL, -- median days between occurrences
 *     amount_variance NUMERIC(10,2) NOT NULL,
 *     occurrences INTEGER NOT NULL,
 *     confidence NUMERIC(3,2) NOT NULL,   -- 0.0 - 1.0
 *     last_seen DATE NOT NULL,
 *     transaction_ids TEXT NOT NULL,      -- JSON array
 *     dismissed BOOLEAN DEFAULT false,
 *     created_at TIMESTAMP DEFAULT NOW(),
 *     UNIQUE (user_id, merchant, amount)
 *   );
 */

import type { NormalizedTransaction } from "./normalized-types";
import type { Bill } from "@shared/schema";
import { normaliseMerchantKey } from "./categories/resolver";

// ─── Tunables (operator-approved) ──────────────────────────────────────────

/** Minimum occurrences required to even consider a series. */
export const MIN_OCCURRENCES_TO_CONSIDER = 2;
/** Minimum occurrences required to auto-confirm. */
export const MIN_OCCURRENCES_TO_AUTO_CONFIRM = 3;
/** Maximum amount variance ($) for auto-confirm. */
export const MAX_AMOUNT_VARIANCE_FOR_AUTO_CONFIRM = 1.0;
/** Maximum cadence drift (stddev / mean) for auto-confirm. */
export const MAX_CADENCE_DRIFT_FOR_AUTO_CONFIRM = 0.3;
/** Days tolerance when matching candidate cadence to a named recurrence. */
export const CADENCE_BUCKET_TOLERANCE_DAYS = 4;

// ─── Types ────────────────────────────────────────────────────────────────

/** A detected recurring series candidate before user / engine action. */
export interface RecurringCandidate {
  /** Normalised merchant key (e.g. "netflix"). */
  merchantKey: string;
  /** Display merchant name (the most common variant observed). */
  displayMerchant: string;
  /** Median amount across occurrences, in dollars. */
  amount: number;
  /** Range of amounts seen ($). 0 means perfectly stable. */
  amountVariance: number;
  /** Median days between consecutive occurrences. */
  medianCadenceDays: number;
  /** Cadence drift = stddev/mean of consecutive deltas. 0 = perfect. */
  cadenceDrift: number;
  /** Mapped to a named recurrence if cadence is close enough; else `null`. */
  recurrence: "weekly" | "biweekly" | "monthly" | "yearly" | null;
  /** Number of occurrences observed in the input window. */
  occurrences: number;
  /** Date of the most recent occurrence (yyyy-MM-dd). */
  lastSeen: string;
  /** Source transaction IDs ordered by date ascending. */
  transactionIds: string[];
  /** Confidence score in [0, 1]. */
  confidence: number;
  /** Suggested action for this candidate. */
  action: "auto-confirm" | "suggest" | "ignore";
  /** Reason for the action choice (debug + UI tooltip). */
  reason: string;
}

// ─── Statistics helpers ───────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function range(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

// ─── Cadence → named recurrence ───────────────────────────────────────────

interface RecurrenceBucket {
  name: "weekly" | "biweekly" | "monthly" | "yearly";
  days: number;
}

const RECURRENCE_BUCKETS: RecurrenceBucket[] = [
  { name: "weekly", days: 7 },
  { name: "biweekly", days: 14 },
  { name: "monthly", days: 30.44 }, // average month length
  { name: "yearly", days: 365.25 },
];

function bucketCadence(cadenceDays: number): RecurrenceBucket["name"] | null {
  for (const b of RECURRENCE_BUCKETS) {
    // Tolerance scales with cadence: ±4 days for weekly/biweekly/monthly,
    // ±30 days for yearly (one month either side).
    const tolerance = b.name === "yearly" ? 30 : CADENCE_BUCKET_TOLERANCE_DAYS;
    if (Math.abs(cadenceDays - b.days) <= tolerance) return b.name;
  }
  return null;
}

// ─── Date helpers ─────────────────────────────────────────────────────────

function parseDateOnly(yyyyMmDd: string): Date {
  // Avoid UTC offset surprises by appending T00:00:00 in local tz.
  return new Date(`${yyyyMmDd}T00:00:00`);
}

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(b.getTime() - a.getTime());
  return ms / (1000 * 60 * 60 * 24);
}

// ─── Existing-bill matching ───────────────────────────────────────────────

/**
 * True if a candidate is already represented by an existing user `Bill`.
 * Used to avoid suggesting bills the user has already created (or
 * auto-detected previously).
 */
function isAlreadyKnown(
  candidate: RecurringCandidate,
  existingBills: Bill[]
): boolean {
  for (const b of existingBills) {
    const billMerchant = normaliseMerchantKey(b.merchant ?? b.name);
    if (billMerchant !== candidate.merchantKey) continue;
    const amountDiff = Math.abs(parseFloat(b.amount) - candidate.amount);
    if (amountDiff <= MAX_AMOUNT_VARIANCE_FOR_AUTO_CONFIRM) return true;
  }
  return false;
}

// ─── Confidence scoring ───────────────────────────────────────────────────

/**
 * Confidence in [0, 1]. Heuristic that rewards more occurrences, low amount
 * variance, low cadence drift, and a recognised recurrence bucket. Used for
 * UI sorting and as the threshold for the "Suggested" inbox.
 */
function scoreConfidence(args: {
  occurrences: number;
  amountVariance: number;
  cadenceDrift: number;
  recurrence: RecurringCandidate["recurrence"];
}): number {
  const { occurrences, amountVariance, cadenceDrift, recurrence } = args;

  // Occurrence factor: 0 at 1 occ, 1 at >= 6 occ.
  const occScore = Math.min(1, Math.max(0, (occurrences - 1) / 5));

  // Amount factor: 1 at variance = 0, 0 at variance >= $5.
  const amountScore = Math.max(0, 1 - amountVariance / 5);

  // Cadence factor: 1 at drift = 0, 0 at drift >= 0.6.
  const cadenceScore = Math.max(0, 1 - cadenceDrift / 0.6);

  // Recurrence factor: 1 if mapped, 0.5 if unmapped (still useful info).
  const recurrenceScore = recurrence ? 1 : 0.5;

  // Weighted average. Occurrence + cadence are most important.
  return (
    occScore * 0.35 +
    amountScore * 0.25 +
    cadenceScore * 0.3 +
    recurrenceScore * 0.1
  );
}

// ─── Main detector ────────────────────────────────────────────────────────

/**
 * Group transactions by merchant+amount, compute cadence stats, and emit
 * recurring candidates with action recommendations.
 *
 * @param transactions Outflow transactions to scan. Caller should pre-filter
 *   to a sensible window (last ~12 months) and exclude transfers, refunds,
 *   pending. Income transactions can be passed but they're also valid for
 *   recurring detection (paychecks, etc.) — caller decides.
 * @param existingBills Existing user Bills, used to avoid re-suggesting.
 * @returns Array of `RecurringCandidate`. Filter by `.action` to act on them.
 */
export function detectRecurringFromTransactions(
  transactions: NormalizedTransaction[],
  existingBills: Bill[] = []
): RecurringCandidate[] {
  // ── Group by (merchantKey, roundedAmount). Rounding amounts to the
  //    nearest dollar collapses minor variation (Netflix $14.99 vs $15.04
  //    after a price bump) into a single series. We then compute the true
  //    median amount within the group.
  const groups = new Map<string, NormalizedTransaction[]>();
  for (const tx of transactions) {
    const merchantKey = normaliseMerchantKey(tx.merchant);
    if (!merchantKey) continue;
    if (tx.isPending) continue;
    const roundedAmount = Math.round(tx.amount);
    const key = `${merchantKey}|${roundedAmount}`;
    const list = groups.get(key) ?? [];
    list.push(tx);
    groups.set(key, list);
  }

  const candidates: RecurringCandidate[] = [];

  for (const [key, txs] of groups) {
    if (txs.length < MIN_OCCURRENCES_TO_CONSIDER) continue;

    // Sort by date ascending.
    txs.sort((a, b) => a.date.localeCompare(b.date));

    const merchantKey = key.split("|")[0];
    // Display merchant: most common variant observed.
    const displayMerchant = pickMostCommon(txs.map((t) => t.merchant));

    const amounts = txs.map((t) => t.amount);
    const medianAmount = median(amounts);
    const amountVariance = range(amounts);

    // Compute cadence (days between consecutive occurrences).
    const dates = txs.map((t) => parseDateOnly(t.date));
    const deltas: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      deltas.push(daysBetween(dates[i - 1], dates[i]));
    }

    const medianCadence = median(deltas);
    const meanCadence = mean(deltas);
    const cadenceDrift = meanCadence > 0 ? stddev(deltas) / meanCadence : 1;

    const recurrence = bucketCadence(medianCadence);

    const confidence = scoreConfidence({
      occurrences: txs.length,
      amountVariance,
      cadenceDrift,
      recurrence,
    });

    const candidate: RecurringCandidate = {
      merchantKey,
      displayMerchant,
      amount: Math.round(medianAmount * 100) / 100,
      amountVariance: Math.round(amountVariance * 100) / 100,
      medianCadenceDays: Math.round(medianCadence * 10) / 10,
      cadenceDrift: Math.round(cadenceDrift * 100) / 100,
      recurrence,
      occurrences: txs.length,
      lastSeen: txs[txs.length - 1].date,
      transactionIds: txs.map((t) => t.id),
      confidence: Math.round(confidence * 100) / 100,
      action: "ignore",
      reason: "",
    };

    // ── Decide action.
    if (isAlreadyKnown(candidate, existingBills)) {
      candidate.action = "ignore";
      candidate.reason = "matches existing bill";
    } else if (
      candidate.occurrences >= MIN_OCCURRENCES_TO_AUTO_CONFIRM &&
      candidate.amountVariance <= MAX_AMOUNT_VARIANCE_FOR_AUTO_CONFIRM &&
      candidate.cadenceDrift <= MAX_CADENCE_DRIFT_FOR_AUTO_CONFIRM &&
      candidate.recurrence !== null
    ) {
      candidate.action = "auto-confirm";
      candidate.reason = `${candidate.occurrences} occurrences, $${candidate.amountVariance.toFixed(2)} variance, drift ${candidate.cadenceDrift}, ${candidate.recurrence}`;
    } else if (candidate.recurrence !== null) {
      candidate.action = "suggest";
      candidate.reason = `${candidate.occurrences} occurrences but ${
        candidate.amountVariance > MAX_AMOUNT_VARIANCE_FOR_AUTO_CONFIRM
          ? `variance $${candidate.amountVariance.toFixed(2)} exceeds $1.00`
          : candidate.cadenceDrift > MAX_CADENCE_DRIFT_FOR_AUTO_CONFIRM
            ? `cadence drift ${candidate.cadenceDrift} exceeds 0.30`
            : `only ${candidate.occurrences} occurrences (need ≥3 to auto-confirm)`
      }`;
    } else {
      candidate.action = "ignore";
      candidate.reason = `cadence ${candidate.medianCadenceDays}d does not match any standard recurrence bucket`;
    }

    candidates.push(candidate);
  }

  // Sort by confidence descending so the UI shows highest-quality first.
  candidates.sort((a, b) => b.confidence - a.confidence);

  return candidates;
}

/** Most common string in an array (ties broken by first occurrence). */
function pickMostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0] ?? "";
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

// ─── Convenience filters for the wiring layer ─────────────────────────────

/** Just the auto-confirm candidates, ready to insert as new Bill rows. */
export function pickAutoConfirm(candidates: RecurringCandidate[]): RecurringCandidate[] {
  return candidates.filter((c) => c.action === "auto-confirm");
}

/** Just the suggest candidates, ready to insert into the suggested_bills inbox. */
export function pickSuggestions(candidates: RecurringCandidate[]): RecurringCandidate[] {
  return candidates.filter((c) => c.action === "suggest");
}
