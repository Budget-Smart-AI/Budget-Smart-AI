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
 * - PFC v2 primary + detailed taxonomy
 *
 * Provider-specific knowledge is CONFINED to this file. The engine and route
 * layer never import Plaid-specific constants — they call methods on the
 * `BankingAdapter` interface. Adding a new aggregator means adding another
 * adapter; nothing else in the codebase needs to change.
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

// Categories that represent movement between accounts, not real income or expense.
// Includes both legacy Plaid basic-category strings ("transfer", "payment") AND
// PFC v2 primary enums ("TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS") because
// `tx.category` now stores the PFC primary since the 2026-04 sync refactor.
const TRANSFER_CATEGORIES = new Set([
  "transfer",
  "credit card",
  "payment",
  "loan",
  "loan payments",
  "internal account transfer",
  "transfer_in",
  "transfer_out",
  "loan_payments",
  "bank_fees",
]);

const TRANSFER_DETAILED_PREFIXES = [
  "TRANSFER_IN_",
  "TRANSFER_OUT_",
  "LOAN_PAYMENTS_",
  "BANK_FEES_",
];

/**
 * Map Plaid subtype → normalized AccountCategory. Widened in UAT-6 P3-23 to
 * cover the full Plaid retirement taxonomy.
 */
const INVESTMENT_SUBTYPES = new Set([
  "brokerage", "cash management", "non-taxable brokerage account",
  "mutual fund", "stock plan", "trust", "ugma", "utma",
  "401a", "401k", "403b", "457b", "ira", "roth", "roth 401k",
  "sep ira", "simple ira", "sarsep", "keogh", "pension", "retirement",
  "profit sharing plan", "non-custodial wallet",
  "rrsp", "rssp", "rrif", "lif", "lira", "lrif", "lrsp", "prif", "rlif", "resp", "rdsp", "tfsa",
  "isa", "cash isa", "sipp",
  "529", "education savings account", "hsa", "health reimbursement arrangement",
  "fixed annuity", "variable annuity", "other annuity",
  "life insurance", "other insurance",
  "gic",
]);

function mapPlaidAccountType(type?: string, subtype?: string): AccountCategory {
  const sub = (subtype || "").toLowerCase();
  const t = (type || "").toLowerCase();

  if (sub === "checking") return "checking";
  if (sub === "savings") return "savings";
  if (t === "depository") return "depository";
  if (t === "credit" || sub === "credit card") return "credit_card";
  if (sub === "line of credit" || sub === "line_of_credit") return "line_of_credit";
  if (sub === "mortgage") return "mortgage";
  if (t === "loan" || sub.includes("loan") || sub === "auto") return "loan";
  if (t === "investment" || t === "brokerage" || INVESTMENT_SUBTYPES.has(sub)) return "investment";
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
      itemStatus: this.normalizeItemStatus(acc.itemStatus ?? acc.status ?? acc.plaidItemStatus),
      institutionName: acc.institutionName ?? acc.plaidItemInstitutionName ?? null,
      mask: acc.mask ?? null,
      creditLimit:
        acc.balanceLimit != null
          ? parseFloat(String(acc.balanceLimit)) || null
          : acc.creditLimit != null
            ? parseFloat(String(acc.creditLimit)) || null
            : null,
      lastSyncedAt: acc.lastSyncedAt ?? acc.updatedAt ?? null,
    }));
  }

  normalizeTransactions(rawTransactions: any[]): NormalizedTransaction[] {
    return rawTransactions.map((tx) => {
      const rawAmount = parseFloat(String(tx.amount || 0));
      // Plaid: negative = credit (income), positive = debit (spending)
      const isCredit = rawAmount < 0;
      const amount = Math.abs(rawAmount);

      const rawCategory = tx.personalCategory || tx.category || "Other";
      const categoryLower = String(rawCategory).toLowerCase();

      const pfcDetailedRaw = tx.personalFinanceCategoryDetailed
        ? String(tx.personalFinanceCategoryDetailed).toUpperCase()
        : "";
      const pfcPrimaryRaw = (tx.category || "").toUpperCase();

      const isTransferByDetailed =
        pfcDetailedRaw !== "" &&
        TRANSFER_DETAILED_PREFIXES.some((p) => pfcDetailedRaw.startsWith(p));

      const isTransfer =
        tx.isTransfer === true ||
        tx.isTransfer === "true" ||
        TRANSFER_CATEGORIES.has(categoryLower) ||
        isTransferByDetailed;

      const isPending = tx.pending === true || tx.pending === "true";

      // Canonical category (engine/UI always read this; never the raw PFC).
      const { category: canonical, confidence } = this.remapCategory(rawCategory, {
        pfcPrimary: pfcPrimaryRaw || null,
        pfcDetailed: pfcDetailedRaw || null,
      });

      const counterpartyType = tx.counterpartyType || null;
      const cleanedMerchant = this.normalizeMerchant(
        tx.counterpartyName || tx.merchantName || tx.name
      );

      const classification = this.classifyIncome({
        amount,
        isCredit,
        isTransfer,
        legacyCategory: String(rawCategory),
        merchant: cleanedMerchant,
        providerSignals: {
          pfcPrimary: pfcPrimaryRaw || null,
          pfcDetailed: pfcDetailedRaw || null,
          counterpartyType,
        },
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
        isPending,
        isIncome: classification.isIncome,
        matchedExpenseId: tx.matchedExpenseId || undefined,
        matchType: tx.matchType || undefined,
        cadEquivalent:
          tx.cadEquivalent != null ? parseFloat(String(tx.cadEquivalent)) : undefined,
        provider: "Plaid",
        incomeCategory: classification.isIncome ? classification.category : null,
        providerSignals: {
          pfcPrimary: pfcPrimaryRaw || null,
          pfcDetailed: pfcDetailedRaw || null,
          counterpartyType,
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
    const r = classifyIncomeTransaction({
      pfcDetailed: input.providerSignals?.pfcDetailed ?? null,
      pfcPrimary: input.providerSignals?.pfcPrimary ?? null,
      counterpartyType: input.providerSignals?.counterpartyType ?? null,
      amount: input.amount,
      isCredit: input.isCredit,
      isTransfer: input.isTransfer,
      legacyCategory: input.legacyCategory ?? null,
      merchant: input.merchant ?? null,
    });
    return { category: r.category, isIncome: r.isIncome };
  }
}

export const plaidAdapter = new PlaidAdapter();
