/**
 * Plaid Banking Adapter
 *
 * Converts Plaid-specific data into the normalized types used by the engine.
 *
 * Key Plaid conventions this adapter handles:
 * - amount < 0 = income/deposit (credit), amount > 0 = spending (debit)
 * - Account type/subtype hierarchy (e.g., "depository" / "checking")
 * - balanceCurrent vs balanceAvailable
 * - isActive stored as string "true" / "false"
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
 * Map Plaid subtype → normalized AccountCategory
 */
function mapPlaidAccountType(type?: string, subtype?: string): AccountCategory {
  const sub = (subtype || "").toLowerCase();
  const t = (type || "").toLowerCase();

  if (sub === "checking") return "checking";
  if (sub === "savings") return "savings";
  if (t === "depository") return "depository";
  if (t === "credit" || sub === "credit card") return "credit";
  if (sub === "line of credit" || sub === "line_of_credit") return "line_of_credit";
  if (sub === "mortgage") return "mortgage";
  if (t === "loan" || sub.includes("loan") || sub === "auto") return "loan";
  if (t === "investment" || sub === "brokerage" || sub === "401k" || sub === "ira" || sub === "rrsp" || sub === "rssp") return "investment";
  return "other";
}

export class PlaidAdapter implements BankingAdapter {
  readonly providerName = "Plaid";

  normalizeAccounts(rawAccounts: any[]): NormalizedAccount[] {
    return rawAccounts.map((acc) => ({
      id: acc.id,
      name: acc.name || acc.officialName || "Plaid Account",
      accountType: mapPlaidAccountType(acc.type, acc.subtype),
      balance: parseFloat(String(acc.balanceCurrent ?? acc.balance ?? 0)) || 0,
      isActive: acc.isActive === true || acc.isActive === "true",
      provider: "Plaid",
    }));
  }

  normalizeTransactions(rawTransactions: any[]): NormalizedTransaction[] {
    return rawTransactions.map((tx) => {
      const rawAmount = parseFloat(String(tx.amount || 0));
      // Plaid: negative = credit (income), positive = debit (spending)
      const isCredit = rawAmount < 0;
      const amount = Math.abs(rawAmount);

      const category = tx.personalCategory || tx.category || "Other";
      const categoryLower = String(category).toLowerCase();

      const isTransfer =
        tx.isTransfer === true ||
        tx.isTransfer === "true" ||
        TRANSFER_CATEGORIES.has(categoryLower);

      const isPending = tx.pending === true || tx.pending === "true";

      // PFC v2 income detection: counterpartyType "INCOME_SOURCE" identifies employers/gov payers.
      // Also check PFC primary category — if Plaid says it's income, trust that.
      // Note: we do NOT treat all credits as income — refunds, corrections, and
      // merchant credits are credits but not income. We rely on Plaid's PFC
      // classification and counterparty type for accurate income detection.
      const pfcPrimary = (tx.category || "").toUpperCase();
      const counterpartyType = tx.counterpartyType || null;
      const isIncomeByPFC = pfcPrimary === "INCOME";
      const isIncomeByCounterparty = counterpartyType === "INCOME_SOURCE";
      // Also check the mapped category for income-related keywords
      const isIncomeByCategory = /salary|payroll|income|wages|employment/i.test(category);
      // A credit is only income if Plaid explicitly classifies it as such,
      // OR the mapped category is income-related. Plain credits (refunds,
      // corrections, merchant credits) are NOT income.
      const isIncome = isIncomeByPFC || isIncomeByCounterparty || (isCredit && !isTransfer && isIncomeByCategory);

      return {
        id: tx.id,
        date: tx.date,
        amount,
        direction: isCredit ? "credit" : "debit",
        merchant: tx.counterpartyName || tx.merchantName || tx.name || "Unknown",
        category: String(category),
        isTransfer,
        isPending,
        isIncome,
        matchedExpenseId: tx.matchedExpenseId || undefined,
        matchType: tx.matchType || undefined,
        cadEquivalent: tx.cadEquivalent != null
          ? parseFloat(String(tx.cadEquivalent))
          : undefined,
        provider: "Plaid",
      } as NormalizedTransaction;
    });
  }
}

export const plaidAdapter = new PlaidAdapter();
