/**
 * Manual Account / Transaction Adapter
 *
 * Normalizes manually entered accounts and transactions.
 * These follow a simpler schema since the user enters them directly.
 *
 * Implements the same `BankingAdapter` contract as Plaid/MX so code paths
 * that iterate adapters generically don't need special-casing.
 */

import {
  BankingAdapter,
  NormalizedAccount,
  NormalizedTransaction,
  AccountCategory,
  ProviderItemStatus,
  ClassifyIncomeInput,
  ClassifyIncomeResult,
} from "../normalized-types";
import { classifyIncomeTransaction } from "../categories/income-classifier";
import {
  cleanMerchant,
  remapToCanonicalCategory,
  mapItemStatus,
} from "./shared-normalizers";

function mapManualAccountType(type?: string): AccountCategory {
  const t = (type || "").toLowerCase();
  if (t === "checking") return "checking";
  if (t === "savings") return "savings";
  if (t === "depository") return "depository";
  if (t === "credit" || t === "credit_card" || t === "credit card") return "credit_card";
  if (t === "loan") return "loan";
  if (t === "mortgage") return "mortgage";
  if (t === "line_of_credit" || t === "line of credit") return "line_of_credit";
  if (t === "investment" || t === "brokerage") return "investment";
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
      itemStatus: "healthy" as const, // Manual accounts are always healthy by definition.
      institutionName: acc.institutionName ?? null,
      mask: null,
      creditLimit:
        acc.creditLimit != null ? parseFloat(String(acc.creditLimit)) || null : null,
      lastSyncedAt: acc.updatedAt ?? null,
    }));
  }

  normalizeTransactions(rawTransactions: any[]): NormalizedTransaction[] {
    return rawTransactions.map((tx) => {
      const rawAmount = parseFloat(String(tx.amount || 0));
      const isCredit = tx.type === "credit" || tx.type === "income" || rawAmount < 0;
      const amount = Math.abs(rawAmount);

      const rawCategory = tx.category || "Other";
      const isTransfer = tx.isTransfer === true || tx.isTransfer === "true";

      const { category: canonical, confidence } = this.remapCategory(rawCategory);
      const cleanedMerchant = this.normalizeMerchant(tx.merchant || tx.description);

      const classification = this.classifyIncome({
        amount,
        isCredit,
        isTransfer,
        legacyCategory: String(rawCategory),
        merchant: cleanedMerchant,
      });

      return {
        id: tx.id,
        date: tx.date,
        amount,
        direction: isCredit ? "credit" : "debit",
        merchant: cleanedMerchant,
        category: canonical,
        categoryConfidence: confidence,
        rawProviderCategory: String(rawCategory),
        isTransfer,
        isPending: false,
        isIncome: classification.isIncome,
        matchedExpenseId: undefined,
        matchType: undefined,
        cadEquivalent: undefined,
        provider: "Manual",
        incomeCategory: classification.isIncome ? classification.category : null,
      } as NormalizedTransaction;
    });
  }

  // ─── Interface methods (provider-agnostic contract) ──────────────────────

  remapCategory(
    raw: string | null | undefined,
    signals: Record<string, string | null | undefined> = {}
  ) {
    return remapToCanonicalCategory(raw, signals);
  }

  normalizeMerchant(raw: string | null | undefined): string {
    return cleanMerchant(raw);
  }

  normalizeItemStatus(raw: string | null | undefined): ProviderItemStatus {
    return mapItemStatus(raw);
  }

  classifyIncome(input: ClassifyIncomeInput): ClassifyIncomeResult {
    const r = classifyIncomeTransaction({
      pfcDetailed: null,
      pfcPrimary: null,
      counterpartyType: null,
      amount: input.amount,
      isCredit: input.isCredit,
      isTransfer: input.isTransfer,
      legacyCategory: input.legacyCategory ?? null,
      merchant: input.merchant ?? null,
    });
    return { category: r.category, isIncome: r.isIncome };
  }
}

export const manualAdapter = new ManualAdapter();
