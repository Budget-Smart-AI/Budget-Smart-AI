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
 * - topLevelCategory / category (string names, not enums)
 *
 * Implements the full `BankingAdapter` contract — same surface area as the
 * Plaid adapter — so the engine and route layer can treat MX transactions
 * identically to Plaid transactions. Do NOT branch on `provider === "MX"`
 * in callers; add behaviour to this adapter instead.
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

const TRANSFER_CATEGORIES = new Set([
  "transfer",
  "credit card",
  "payment",
  "loan",
  "loan payments",
  "internal account transfer",
]);

/** Map MX top-level category strings that denote transfers. */
const MX_TRANSFER_TOP_LEVEL = new Set([
  "Transfers",
  "Transfer",
  "Payments",
  "Credit Card Payment",
]);

/**
 * Map MX type → normalized AccountCategory
 */
function mapMxAccountType(type?: string): AccountCategory {
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

export class MxAdapter implements BankingAdapter {
  readonly providerName = "MX";

  normalizeAccounts(rawAccounts: any[]): NormalizedAccount[] {
    return rawAccounts.map((acc) => ({
      id: acc.id || acc.guid,
      name: acc.name || acc.nickname || acc.userGuid || "MX Account",
      accountType: mapMxAccountType(acc.type),
      balance: parseFloat(String(acc.balance ?? 0)) || 0,
      // UAT-11 #109 parity: match plaid-adapter's soft-default semantics.
      // Only explicit false/"false" deactivates; null/undefined is active.
      isActive:
        acc.isActive !== false &&
        acc.isActive !== "false" &&
        acc.isActive !== 0 &&
        acc.isActive !== "0",
      provider: "MX",
      itemStatus: this.normalizeItemStatus(acc.connectionStatus ?? acc.status),
      institutionName: acc.institutionName ?? acc.institution ?? null,
      mask:
        acc.accountNumber
          ? String(acc.accountNumber).slice(-4)
          : (acc.mask ?? null),
      creditLimit:
        acc.creditLimit != null
          ? parseFloat(String(acc.creditLimit)) || null
          : null,
      lastSyncedAt: acc.lastSyncedAt ?? acc.updatedAt ?? null,
    }));
  }

  normalizeTransactions(rawTransactions: any[]): NormalizedTransaction[] {
    return rawTransactions.map((tx) => {
      const rawAmount = parseFloat(String(tx.amount || 0));
      const amount = Math.abs(rawAmount);

      const isCredit =
        tx.transactionType === "CREDIT" ||
        tx.isIncome === true ||
        tx.isIncome === "true";

      const rawCategory = tx.category || tx.personalCategory || "Other";
      const categoryLower = String(rawCategory).toLowerCase();
      const mxTop = tx.topLevelCategory || tx.topCategory || null;

      const isTransfer =
        tx.isTransfer === true ||
        tx.isTransfer === "true" ||
        TRANSFER_CATEGORIES.has(categoryLower) ||
        (mxTop ? MX_TRANSFER_TOP_LEVEL.has(String(mxTop)) : false);

      const isPending =
        tx.pending === true ||
        tx.pending === "true" ||
        tx.status === "PENDING";

      const cleanedMerchant = this.normalizeMerchant(
        tx.merchantName || tx.name || tx.description
      );

      // UAT-11 #88 / #96: forward cleaned merchant so merchant-keyword
      // overrides can win over MX's raw categorizations.
      const { category: canonical, confidence } = this.remapCategory(rawCategory, {
        mxCategory: rawCategory ? String(rawCategory) : null,
        mxTopLevel: mxTop ? String(mxTop) : null,
        merchant: cleanedMerchant,
      });

      const classification = this.classifyIncome({
        amount,
        isCredit,
        isTransfer,
        legacyCategory: String(rawCategory),
        merchant: cleanedMerchant,
        providerSignals: {
          mxCategory: rawCategory ? String(rawCategory) : null,
          mxTopLevel: mxTop ? String(mxTop) : null,
        },
      });

      return {
        id: tx.id || tx.transactionGuid || tx.guid,
        date: tx.date || tx.transactedAt,
        amount,
        direction: isCredit ? "credit" : "debit",
        merchant: cleanedMerchant,
        category: canonical,
        categoryConfidence: confidence,
        rawProviderCategory: String(rawCategory),
        isTransfer,
        isPending,
        isIncome: classification.isIncome,
        matchedExpenseId: tx.matchedExpenseId || undefined,
        matchType: tx.matchType || undefined,
        cadEquivalent:
          tx.cadEquivalent != null ? parseFloat(String(tx.cadEquivalent)) : undefined,
        provider: "MX",
        incomeCategory: classification.isIncome ? classification.category : null,
        providerSignals: {
          mxCategory: rawCategory ? String(rawCategory) : null,
          mxTopLevel: mxTop ? String(mxTop) : null,
        },
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
    // Shared classifier reads PFC fields when present, otherwise falls
    // through to amount / merchant / legacy-keyword rules. MX's top-level
    // "Income" maps to INCOME primary so the classifier's Rule 2 catches
    // it without any MX-specific branching.
    const mxTop = input.providerSignals?.mxTopLevel ?? null;
    const mxCat = input.providerSignals?.mxCategory ?? null;

    // Synthesize a pfcPrimary signal from MX top-level when it matches.
    // E.g. MX topLevelCategory === "Income" → rule-2 hits "Income" primary.
    const synthesizedPfcPrimary =
      mxTop && /income/i.test(mxTop) ? "INCOME" : null;

    const r = classifyIncomeTransaction({
      pfcDetailed: null,
      pfcPrimary: synthesizedPfcPrimary,
      counterpartyType: null,
      amount: input.amount,
      isCredit: input.isCredit,
      isTransfer: input.isTransfer,
      legacyCategory: mxCat || input.legacyCategory || null,
      merchant: input.merchant ?? null,
    });
    return { category: r.category, isIncome: r.isIncome };
  }
}

export const mxAdapter = new MxAdapter();
