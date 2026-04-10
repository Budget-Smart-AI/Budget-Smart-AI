/**
 * Manual Account / Transaction Adapter
 *
 * Normalizes manually entered accounts and transactions.
 * These follow a simpler schema since the user enters them directly.
 */

import {
  BankingAdapter,
  NormalizedAccount,
  NormalizedTransaction,
  AccountCategory,
} from "../normalized-types";

/**
 * Map manual account type → normalized AccountCategory
 */
function mapManualAccountType(type?: string): AccountCategory {
  const t = (type || "").toLowerCase();
  if (t === "checking") return "checking";
  if (t === "savings") return "savings";
  if (t === "depository") return "depository";
  if (t === "credit" || t === "credit_card") return "credit";
  if (t === "loan") return "loan";
  if (t === "mortgage") return "mortgage";
  if (t === "investment") return "investment";
  return "other";
}

export class ManualAdapter implements BankingAdapter {
  readonly providerName = "Manual";

  normalizeAccounts(rawAccounts: any[]): NormalizedAccount[] {
    return rawAccounts.map((acc) => ({
      id: acc.id,
      name: acc.name || acc.nickname || "Manual Account",
      accountType: mapManualAccountType(acc.type),
      balance: parseFloat(String(acc.balance ?? 0)),
      isActive: acc.isActive !== false && acc.isActive !== "false",
      provider: "Manual",
    }));
  }

  normalizeTransactions(rawTransactions: any[]): NormalizedTransaction[] {
    return rawTransactions.map((tx) => {
      const rawAmount = parseFloat(String(tx.amount || 0));
      const isCredit = tx.type === "credit" || tx.type === "income" || rawAmount < 0;
      const amount = Math.abs(rawAmount);

      return {
        id: tx.id,
        date: tx.date,
        amount,
        direction: isCredit ? "credit" : "debit",
        merchant: tx.merchant || tx.description || "Unknown",
        category: tx.category || "Other",
        isTransfer: false,
        isPending: false,
        isIncome: isCredit,
        matchedExpenseId: undefined,
        matchType: undefined,
        cadEquivalent: undefined,
        provider: "Manual",
      } as NormalizedTransaction;
    });
  }
}

export const manualAdapter = new ManualAdapter();
