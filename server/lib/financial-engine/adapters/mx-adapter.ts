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
      balance: acc.balance ?? 0,
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
      } as NormalizedTransaction;
    });
  }
}

export const mxAdapter = new MxAdapter();
