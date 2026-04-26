/**
 * Plaid-shape shim for legacy engine modules.
 *
 * Some pre-adapter engine modules (cash-flow.ts, forecast.ts) still consume the
 * Plaid-specific PlaidTransaction shape because they were written before the
 * adapter layer existed. To keep call-sites provider-agnostic while those
 * engines are ported over, any route that fetches transactions via
 * getAllNormalizedTransactions(userIds, start, end) can run them through this
 * shim to get a PlaidTransaction-compatible array.
 *
 * SIGN CONVENTION:
 *   - NormalizedTransaction.amount is always positive and uses `direction`.
 *   - PlaidTransaction.amount follows Plaid: positive = debit (money out),
 *     negative = credit (money in). This shim applies that sign flip so the
 *     downstream engine's `amount > 0 ? spending : income` branches keep
 *     working unchanged.
 *
 * CATEGORY:
 *   - NormalizedTransaction.category is already the canonical Monarch-aligned
 *     name produced by the adapter. We mirror it into `category`,
 *     `personalCategory`, and the PFC v2 slot so each downstream consumer
 *     (legacy-category, PFC primary, PFC detailed path) reads something
 *     sensible. When a provider has no PFC v2 detailed code (MX, Manual)
 *     `personalFinanceCategoryDetailed` stays null — the engine already
 *     tolerates that.
 *
 * TRANSFER / PENDING:
 *   - The adapter has already run its transfer detection; we surface that by
 *     setting `matchType = "transfer"` for transfers so the exclusion filters
 *     in calculateAverageDailySpending / detectRecurringIncomeFromTransactions
 *     catch them without re-running keyword heuristics.
 *
 * This file is NOT to be used for NEW code — new endpoints should pass
 * NormalizedTransaction[] to adapter-aware engines (see financial-snapshot.ts).
 */
import type { NormalizedTransaction } from "../lib/financial-engine/normalized-types";

/**
 * Loose PlaidTransaction-shaped object. cash-flow.ts accesses a small set of
 * fields so we model only those, plus a few aliases the forecast engine reads
 * via `(t as any).counterpartyName | merchantName`.
 */
export interface PlaidTransactionShape {
  id: string;
  accountId: string | null;
  amount: number; // Plaid convention: + = debit, - = credit
  date: string;
  name: string;
  merchantName: string | null;
  counterpartyName: string | null;
  category: string | null;
  personalCategory: string | null;
  /**
   * Canonical category id (post-§6.2.x SSOT). Required by cash-flow.ts
   * `isNonSpendingCanonical(t.canonicalCategoryId)` filter at the heart of
   * `calculateAverageDailySpending` / `detectRecurringIncomeFromTransactions`.
   * Was absent from the shape before §6.4 cleanup, which caused those
   * filters to silently no-op on shimmed callers.
   */
  canonicalCategoryId: string | null;
  personalFinanceCategoryDetailed: string | null;
  matchType: string | null;
  pending: boolean;
  isTransfer: boolean;
}

export function normalizedToPlaidShape(
  txs: NormalizedTransaction[],
): PlaidTransactionShape[] {
  return txs.map((t) => {
    // Plaid convention: positive is debit (money out), negative is credit.
    const signedAmount = t.direction === "debit" ? t.amount : -t.amount;

    // If the adapter already marked it a transfer, propagate that via matchType
    // so the legacy filters catch it. Otherwise keep whatever matchType the
    // engine produced (it might have reconciled to "bill" or "expense").
    const matchType = t.isTransfer ? "transfer" : t.matchType ?? null;

    return {
      id: t.id,
      accountId: null, // Engine code doesn't need account routing here.
      amount: signedAmount,
      date: t.date,
      name: t.merchant || "",
      merchantName: t.merchant || null,
      counterpartyName: t.merchant || null,
      category: t.category || null,
      personalCategory: t.category || null,
      canonicalCategoryId: t.canonicalCategoryId ?? null,
      personalFinanceCategoryDetailed:
        (t.providerSignals?.pfcDetailed as string | undefined) ?? null,
      matchType,
      pending: t.isPending,
      isTransfer: t.isTransfer,
    };
  });
}
