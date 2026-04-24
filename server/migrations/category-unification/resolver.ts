/**
 * ARCHITECTURE.md §6.2.6 — Shared canonical-category resolver.
 *
 * Single resolver used by BOTH:
 *   (a) the one-time §6.2.5 backfill script (run-backfill.ts)
 *   (b) the dual-write hooks that populate `canonical_category_id`
 *       whenever a new row is inserted into one of the six source tables
 *       (expenses / bills / income / manual_transactions / plaid_transactions /
 *       mx_transactions)
 *
 * Two entry points, two different cost/latency profiles:
 *
 *   - `resolveCanonicalCategorySync()`
 *       PFC map (plaid only) → deterministic legacy-string map → null.
 *       No network I/O, no AI. Safe to call on every hot write path,
 *       including user-facing POST handlers where a Bedrock round-trip
 *       would double request latency.
 *
 *   - `resolveCanonicalCategory()` (async)
 *       Same as sync, plus Bedrock Haiku fallback when both maps miss.
 *       Used by the backfill, nightly reconcile jobs, and anywhere
 *       latency is not user-visible.
 *
 * Either way, the caller owns the database write (UPDATE or INSERT).
 * The resolver only decides WHICH slug to write.
 *
 * Why split sync / async?
 *   Inline Bedrock calls from POST /api/expenses would add ~300ms to
 *   every write in the common case, just to classify rows that the
 *   deterministic map already handles. The sync path covers the 90%+
 *   of real-world rows where the user picked a known category or Plaid
 *   supplied a mapped PFC; the async path is reserved for the long
 *   tail that needs the LLM.
 *
 * Rows that sync-resolve to null at insert time keep
 * `canonical_category_id = NULL` in the DB. A nightly reconcile job
 * (added in a later PR) re-runs them through the async resolver and
 * fills the gap. That's strictly better than calling Bedrock inline:
 * the user's write succeeds instantly, and we still converge to a
 * fully-populated shadow column within 24 hours.
 */

import { lookupLegacyCategory, lookupPlaidCategory } from "./deterministic-map";
import { classifyWithAi, type AiMapperInput } from "./ai-mapper";

// ─── Row-kind enum ──────────────────────────────────────────────────────────
// Kept in sync with the six source tables. Passed through to the AI fallback
// so its system prompt can apply row-kind-specific rules
// (e.g. "income" rows must map to income_* or transfer_refund).

export type RowKind =
  | "expense"
  | "bill"
  | "income"
  | "manual"
  | "plaid"
  | "mx";

// ─── Resolver input / output ────────────────────────────────────────────────

export interface ResolverInput {
  /** Legacy BSA category string (e.g. "Groceries", "Restaurant & Bars"). */
  legacyCategory: string | null | undefined;
  /** Plaid's `personal_finance_category.detailed` slug. Plaid rows only. */
  plaidDetailed?: string | null;
  /** Merchant hint — helps the AI fallback disambiguate "Insurance" etc. */
  merchantName?: string | null;
  /** Amount — occasionally useful context for the AI fallback. */
  amount?: number | null;
  /** Which of the six source tables this row belongs to. */
  rowKind: RowKind;
}

export type MappingSource =
  | "deterministic"
  | "plaid_pfc"
  | "ai"
  | "failed"
  | "unmapped";

export interface ResolverResult {
  /** Canonical slug, or `null` when sync path misses both maps. */
  canonicalId: string | null;
  /** 1.00 for map hits, 0.00–1.00 for AI, 0.00 for failed/unmapped. */
  confidence: number;
  mappingSource: MappingSource;
  /** AI-only: short human explanation of the choice (≤120 chars). */
  reasoning: string | null;
}

// ─── Sync resolver (insert-time, no network) ────────────────────────────────

/**
 * Returns a canonical slug from the deterministic maps only — no AI.
 *
 * Resolution order:
 *   1. PLAID_CATEGORY_MAP[plaidDetailed]  (when provided)
 *   2. DETERMINISTIC_MAP[legacyCategory]
 *   3. null → caller stores NULL in `canonical_category_id`; nightly
 *      reconcile job will later re-resolve via `resolveCanonicalCategory()`.
 *
 * Safe to call from any hot write path. Zero cost beyond two hash lookups.
 */
export function resolveCanonicalCategorySync(input: ResolverInput): ResolverResult {
  // 1. Plaid PFC — richer signal than the adapter-derived personal_category,
  //    so we check it first on plaid rows.
  if (input.plaidDetailed) {
    const pfcSlug = lookupPlaidCategory(input.plaidDetailed);
    if (pfcSlug) {
      return {
        canonicalId: pfcSlug,
        confidence: 1.0,
        mappingSource: "plaid_pfc",
        reasoning: null,
      };
    }
  }

  // 2. Deterministic legacy-string map.
  const detSlug = lookupLegacyCategory(input.legacyCategory ?? null);
  if (detSlug) {
    return {
      canonicalId: detSlug,
      confidence: 1.0,
      mappingSource: "deterministic",
      reasoning: null,
    };
  }

  // 3. No hit. Caller writes NULL.
  return {
    canonicalId: null,
    confidence: 0.0,
    mappingSource: "unmapped",
    reasoning: null,
  };
}

// ─── Async resolver (backfill / nightly reconcile) ──────────────────────────

/**
 * Full three-tier resolver: PFC → deterministic → Bedrock Haiku → failed.
 *
 * Always returns a non-null `canonicalId`. When the AI itself fails after
 * retries, returns `{ canonicalId: "uncategorized", mappingSource: "failed" }`
 * — the caller is expected to flag those for review but NOT to treat them
 * as an exception (one flaky Bedrock call must not halt a 10k-row backfill).
 */
export async function resolveCanonicalCategory(input: ResolverInput): Promise<ResolverResult> {
  // Reuse the cheap path first.
  const cheap = resolveCanonicalCategorySync(input);
  if (cheap.canonicalId) return cheap;

  // 3. AI fallback.
  const aiInput: AiMapperInput = {
    legacyCategory: input.legacyCategory ?? null,
    merchantName: input.merchantName ?? null,
    amount: input.amount ?? null,
    rowKind: input.rowKind,
  };

  try {
    const ai = await classifyWithAi(aiInput);
    return {
      canonicalId: ai.canonicalId,
      confidence: ai.confidence,
      mappingSource: "ai",
      reasoning: ai.reasoning,
    };
  } catch (err) {
    // 4. AI failed → uncategorized with confidence 0. Caller should flag for
    //    review. Do NOT re-throw — one bad row must not kill a batch run.
    return {
      canonicalId: "uncategorized",
      confidence: 0.0,
      mappingSource: "failed",
      reasoning: `ai-failed: ${(err as Error).message.slice(0, 100)}`,
    };
  }
}
