/**
 * Provider-Agnostic Recurring Stream Fan-out (Phase 1, Provider-First SSOT)
 *
 * Single entry point for "what recurring inflows + outflows does this user
 * (or household) have?" Calls every adapter's `getRecurringStreams(userId)`
 * in parallel, merges the results, dedupes streams that surface the same
 * logical pattern across providers (rare — only happens when a user
 * connects the same bank via both Plaid and MX), and returns a single
 * NormalizedRecurringStream[] sorted by confidence + status.
 *
 * Caller pattern — every UI surface that asks "what's recurring?" calls
 * THIS function. No surface knows or cares which provider produced which
 * stream:
 *
 *   const streams = await getRecurringStreams(userIds);
 *   const inflows = streams.filter(s => s.direction === "inflow");
 *   const matureInflows = inflows.filter(s => s.status === "mature");
 *
 * Replaces `detectRecurringIncomeSuggestions` (server/recurring-income-
 * detector.ts) and `bill-detection.ts:detectRecurringFromTransactions` —
 * both of which re-implemented what providers already do.
 *
 * Design rule: NEVER branch on `stream.providerSource` outside this file.
 * If you need provider-specific behaviour, push it into the adapter.
 *
 * See PROVIDER_FIRST_SSOT_STRATEGY.md for the full SSOT chain.
 */

import { plaidAdapter } from "./adapters/plaid-adapter";
import { mxAdapter } from "./adapters/mx-adapter";
import { manualAdapter } from "./adapters/manual-adapter";
import type {
  NormalizedRecurringStream,
  RecurringStreamConfidence,
  RecurringStreamStatus,
} from "./normalized-types";

// ─── Public API ───────────────────────────────────────────────────────────

export interface GetRecurringStreamsOptions {
  /** Filter to inflows only (income) or outflows only (bills/subs). Omit for both. */
  direction?: "inflow" | "outflow";
  /**
   * Skip streams the user has tombstoned in the registry. Default true.
   * Pass false when the wizard is showing a "restore dismissed sources"
   * inbox and needs to see suppressed entries.
   */
  excludeTombstoned?: boolean;
}

/**
 * Fan out across every provider for every household user, return the merged
 * + deduped + sorted recurring stream list.
 *
 * @param userIds Household user IDs. For solo users pass `[userId]`. For
 *                households pass the full member list.
 * @param opts    Optional filter knobs (direction, tombstone visibility).
 */
export async function getRecurringStreams(
  userIds: string[],
  opts: GetRecurringStreamsOptions = {},
): Promise<NormalizedRecurringStream[]> {
  if (userIds.length === 0) return [];

  const direction = opts.direction;
  const excludeTombstoned = opts.excludeTombstoned !== false; // default true

  // Fan out across every (user × adapter) pair in parallel. Each adapter
  // call is independently fault-tolerant (returns [] on provider error)
  // so a single broken Plaid item doesn't lose all MX/manual streams.
  const fetched: NormalizedRecurringStream[][] = await Promise.all(
    userIds.flatMap((uid) => [
      plaidAdapter.getRecurringStreams(uid).catch((err) => {
        console.warn(`[getRecurringStreams] PlaidAdapter failed for user ${uid}:`, err?.message);
        return [];
      }),
      mxAdapter.getRecurringStreams(uid).catch((err) => {
        console.warn(`[getRecurringStreams] MxAdapter failed for user ${uid}:`, err?.message);
        return [];
      }),
      manualAdapter.getRecurringStreams(uid).catch((err) => {
        console.warn(`[getRecurringStreams] ManualAdapter failed for user ${uid}:`, err?.message);
        return [];
      }),
    ]),
  );

  let streams = fetched.flat();

  if (direction) {
    streams = streams.filter((s) => s.direction === direction);
  }
  if (excludeTombstoned) {
    streams = streams.filter((s) => s.status !== "tombstoned");
  }

  // Dedupe across providers. Same logical merchant connected via both Plaid
  // and MX (rare; happens during provider migration) would otherwise
  // double-count. Match key prefers canonical merchantId; falls back to
  // direction + amount + frequency + normalized merchant name.
  streams = dedupeStreams(streams);

  // Sort: very_high confidence first, then mature status, then highest
  // average amount. Wizard / Income page render in this order.
  streams.sort(compareStreams);

  return streams;
}

// ─── Dedup logic ──────────────────────────────────────────────────────────

function dedupeStreams(streams: NormalizedRecurringStream[]): NormalizedRecurringStream[] {
  const byKey = new Map<string, NormalizedRecurringStream>();
  for (const s of streams) {
    const key = streamDedupKey(s);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, s);
      continue;
    }
    // When two providers report the same stream, prefer the one with the
    // higher confidence. Tie → prefer the one with more occurrences. Tie →
    // prefer the most recent lastDate. Tie → prefer Plaid (better metadata).
    if (compareStreams(s, existing) < 0) {
      byKey.set(key, s);
    }
  }
  return Array.from(byKey.values());
}

function streamDedupKey(s: NormalizedRecurringStream): string {
  // Same canonical merchantId with same direction = same logical stream.
  if (s.merchantId) {
    return `mid:${s.direction}:${s.merchantId}`;
  }
  // No canonical id — fall back to (direction, normalized merchant name,
  // rounded average amount). This is intentionally lossy; it's only used
  // when both Plaid and MX surface a stream without an entity id.
  const merchantKey = s.merchant.toLowerCase().replace(/\s+/g, "");
  const amountBucket = Math.round(s.averageAmount); // dollar-precision bucket
  return `name:${s.direction}:${merchantKey}:${amountBucket}`;
}

// ─── Sort comparator ──────────────────────────────────────────────────────

const CONFIDENCE_ORDER: Record<RecurringStreamConfidence, number> = {
  very_high: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const STATUS_ORDER: Record<RecurringStreamStatus, number> = {
  mature: 0,
  active: 1,
  early_detection: 2,
  late: 3,
  tombstoned: 4,
};

const PROVIDER_ORDER: Record<NormalizedRecurringStream["providerSource"], number> = {
  plaid: 0,
  mx: 1,
  manual: 2,
};

/**
 * Sort streams strongest-first.
 * Returns < 0 if `a` should come before `b`.
 */
function compareStreams(a: NormalizedRecurringStream, b: NormalizedRecurringStream): number {
  const cd = CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
  if (cd !== 0) return cd;
  const sd = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (sd !== 0) return sd;
  const od = b.occurrenceCount - a.occurrenceCount;
  if (od !== 0) return od;
  const ad = b.averageAmount - a.averageAmount;
  if (ad !== 0) return ad;
  // Final tiebreaker: provider preference. Plaid first because its metadata
  // (entity_id, predicted_next_date, confidence_level) is the richest.
  return PROVIDER_ORDER[a.providerSource] - PROVIDER_ORDER[b.providerSource];
}

// ─── Auto-promotion gate (per strategy §8.1 decision) ────────────────────

/**
 * Inflow streams ONLY. Returns true when the stream is trustworthy enough
 * to drop straight into the income_sources registry with auto_detected=true.
 *
 * Original §8.1 gate (2026-04-26): mature + very_high.
 *
 * Phase 6P-2 refinement (2026-04-29): the strict very_high gate locked
 * out real paychecks because Plaid grades many Canadian payrolls as
 * `medium` regardless of how long they've been recurring. Ryan's own
 * Coreslab payroll has 83 occurrences over 18+ months and Plaid still
 * grades it `medium` — the stream-level analysis is mature and reliable
 * but the per-tx PFC confidence is conservative. We were leaving real,
 * recurring inflows out of the registry and showing them as one-off
 * "Bank Detected" rows that never project forward.
 *
 * The refined gate accepts EITHER:
 *   - very_high confidence (Plaid is sure) + mature, OR
 *   - medium-or-better confidence + mature + occurrenceCount >= 6
 *     (six occurrences = ~3 months of biweekly or 6 months of monthly
 *      pay, enough history that the stream is clearly recurring even
 *      when Plaid's per-tx confidence is hedging).
 *
 * Streams that fail BOTH branches (e.g. low confidence, or very young)
 * are surfaced as "Suggestions" the user can confirm manually.
 *
 * Outflow streams are NEVER auto-promoted — the user formalizes which
 * recurring outflows they want tracked from a Suggestions inbox. Bills
 * and subscriptions are noisier than paychecks (Plaid may flag a one-off
 * Amazon order or a 3-month Netflix trial as "recurring") so we require
 * explicit confirmation for those.
 */
export function shouldAutoPromote(stream: NormalizedRecurringStream): boolean {
  if (stream.direction !== "inflow") return false;
  if (!stream.isActive) return false;
  if (stream.status !== "mature") return false;

  // Branch A: very_high confidence — original §8.1 gate, no minimum
  // occurrence count required (Plaid's strongest signal).
  if (stream.confidence === "very_high") return true;

  // Branch B: medium/high confidence with proven track record. Six
  // occurrences is the minimum because that's enough to rule out a
  // 3-month Plaid sample on a fresh connection — once we've seen six
  // payments at the same cadence we're confident this is real income,
  // even if Plaid's per-tx classification is hedging.
  if (
    (stream.confidence === "high" || stream.confidence === "medium") &&
    stream.occurrenceCount >= 6
  ) {
    return true;
  }

  return false;
}
