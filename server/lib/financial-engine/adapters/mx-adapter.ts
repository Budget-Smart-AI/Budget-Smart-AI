/**
 * MX Banking Adapter
 *
 * Converts MX-specific data into the normalized types used by the engine.
 *
 * Key MX conventions this adapter handles:
 * - transactionType "CREDIT" or isIncome "true" = income
 * - balance field (not balanceCurrent)
 * - type field directly (not subtype hierarchy)
 * - transactionGuid as unique ID
 * - status "PENDING" for pending transactions
 */

import {
  BankingAdapter,
  NormalizedAccount,
  NormalizedTransaction,
  AccountCategory,
} from "../normalized-types";

const TRANSFER_CATEGORIES = new Set([
  "transfer",
  "credit card",
  "payment",
  "loan",
  "loan payments",
  "internal account transfer",
]);

/**
 * Map MX type → normalized AccountCategory
 */
function mapMxAccountType(type?: string): AccountCategory {
  const t = (type || "").toLowerCase();

  if (t === "checking") return "checking";
  if (t === "savings") return "savings";
  if (t === "depository") return "depository";
  if (t === "credit" || t === "credit_card") return "credit";
  if (t === "loan") return "loan";
  if (t === "mortgage") return "mortgage";
  if (t === "line_of_credit") return "line_of_credit";
  if (t === "investment") return "investment";
  return "other";
}

export class MxAdapter implements BankingAdapter {
  readonly providerName = "MX";

  normalizeAccounts(rawAccounts: any[]): NormalizedAccount[] {
    return rawAccounts.map((acc) => ({
      id: acc.id || acc.guid,
      name: acc.name || acc.userGuid || "MX Account",
      accountType: mapMxAccountType(acc.type),
      balance: parseFloat(String(acc.balance ?? 0)) || 0,
      isActive: acc.isActive === true || acc.isActive === "true",
      provider: "MX",
    }));
  }

  normalizeTransactions(rawTransactions: any[]): NormalizedTransaction[] {
    return rawTransactions.map((tx) => {
      const rawAmount = parseFloat(String(tx.amount || 0));
      const amount = Math.abs(rawAmount);

      // MX uses transactionType and isIncome fields
      const isCredit =
        tx.transactionType === "CREDIT" ||
        tx.isIncome === true ||
        tx.isIncome === "true";

      const category = tx.category || tx.personalCategory || "Other";
      const categoryLower = String(category).toLowerCase();

      const isTransfer =
        tx.isTransfer === true ||
        tx.isTransfer === "true" ||
        TRANSFER_CATEGORIES.has(categoryLower);

      const isPending =
        tx.pending === true ||
        tx.pending === "true" ||
        tx.status === "PENDING";

      // Expose MX category fields for the Monarch category resolver. MX uses
      // `category` for the leaf (e.g. "Groceries") and `topLevelCategory` for
      // the group (e.g. "Food & Dining"). Both nullable; resolver tolerates
      // absent fields. Added 2026-04-15 for Monarch alignment — see
      // `server/lib/financial-engine/categories/`.
      const mxCategory = tx.category ? String(tx.category) : null;
      const mxTopLevel = tx.topLevelCategory
        ? String(tx.topLevelCategory)
        : tx.topCategory
          ? String(tx.topCategory)
          : null;

      return {
        id: tx.id || tx.transactionGuid || tx.guid,
        date: tx.date || tx.transactedAt,
        amount,
        direction: isCredit ? "credit" : "debit",
        merchant: tx.merchantName || tx.name || tx.description || "Unknown",
        category: String(category),
        isTransfer,
        isPending,
        isIncome: isCredit && !isTransfer,
        matchedExpenseId: tx.matchedExpenseId || undefined,
        matchType: tx.matchType || undefined,
        cadEquivalent: tx.cadEquivalent != null
          ? parseFloat(String(tx.cadEquivalent))
          : undefined,
        provider: "MX",
        // Provider category signals consumed by `categories/resolver.ts`.
        mxCategory,
        mxTopLevel,
      } as NormalizedTransaction;
    });
  }
}

export const mxAdapter = new MxAdapter();