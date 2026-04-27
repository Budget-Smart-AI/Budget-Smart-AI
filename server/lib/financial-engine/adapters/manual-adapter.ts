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
  NormalizedRecurringStream,
  RecurringStreamFrequency,
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
        // Phase 3.2: Manual transactions have no upstream provider id —
        // they live only in our DB. Set null so income.ts knows to fall
        // back to the by-id map for these (manual-synthesized streams use
        // tx.id directly as the rawTransactionId — see manual-adapter
        // getRecurringStreams).
        providerTransactionId: null,
        date: tx.date,
        amount,
        direction: isCredit ? "credit" : "debit",
        merchant: cleanedMerchant,
        category: canonical,
        // §6.2.7-prep: pull canonical_category_id directly off the source row.
        // Phase A's INSERT-time dual-write populates this on every manual
        // tx INSERT (transfer rows stay NULL until §6.3).
        canonicalCategoryId: tx.canonicalCategoryId ?? null,
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

  // ─── Recurring streams (Phase 1, Provider-First SSOT) ───────────────────
  //
  // Manual entries don't have provider-side recurring detection — by
  // definition they're user-driven. We synthesize streams from existing
  // income (isRecurring=true) and bills rows that the user has already
  // formalized. These are inherently "high confidence + active" because
  // the user explicitly created them.
  //
  // No detection or clustering happens here — just a shape adapter so the
  // fan-out function can return manual streams alongside Plaid/MX streams
  // for users who run partly-manual setups.
  async getRecurringStreams(userId: string): Promise<NormalizedRecurringStream[]> {
    const { storage } = await import("../../../storage");

    const [incomeRows, billRows] = await Promise.all([
      storage.getIncomes(userId),
      storage.getBills(userId),
    ]);

    const streams: NormalizedRecurringStream[] = [];

    // Income side — user-confirmed recurring income only.
    for (const inc of incomeRows) {
      if (inc.isRecurring !== "true") continue;
      if (inc.isActive === "false") continue;
      const amount = Math.abs(parseFloat(String(inc.amount || 0))) || 0;
      streams.push({
        streamId: `manual-income-${inc.id}`,
        providerSource: "manual",
        itemId: "manual",
        accountId: inc.linkedPlaidAccountId || "manual",
        direction: "inflow",
        merchant: inc.source || "Income",
        merchantId: null,
        category: inc.canonicalCategoryId || "income_other",
        rawProviderCategory: "",
        frequency: mapManualRecurrence(inc.recurrence),
        status: "active",
        confidence: "high", // user said so
        lastAmount: amount,
        averageAmount: amount,
        lastDate: inc.date || "",
        nextExpectedDate: null,
        occurrenceCount: 0,
        isActive: inc.isActive !== "false",
        rawTransactionIds: [],
      });
    }

    // Bills side — paused bills are skipped (user temporarily suppressed them).
    for (const bill of billRows) {
      if (bill.isPaused === "true") continue;
      const amount = Math.abs(parseFloat(String(bill.amount || 0))) || 0;
      streams.push({
        streamId: `manual-bill-${bill.id}`,
        providerSource: "manual",
        itemId: "manual",
        accountId: bill.linkedPlaidAccountId || "manual",
        direction: "outflow",
        merchant: bill.merchant || bill.name || "Bill",
        merchantId: null,
        category: bill.canonicalCategoryId || "uncategorized",
        rawProviderCategory: "",
        frequency: mapManualRecurrence(bill.recurrence),
        status: "active",
        confidence: "high",
        lastAmount: amount,
        averageAmount: amount,
        // Manual bills don't track lastDate per-occurrence; lastNotifiedCycle
        // is the closest proxy. Leave blank if unknown — period calculator
        // computes occurrences from frequency + dueDay anchor.
        lastDate: bill.startDate || bill.lastNotifiedCycle || "",
        nextExpectedDate: null,
        occurrenceCount: 0,
        isActive: bill.isPaused !== "true",
        rawTransactionIds: [],
      });
    }

    return streams;
  }
}

function mapManualRecurrence(r: string | null | undefined): RecurringStreamFrequency {
  switch (String(r || "").toLowerCase()) {
    case "weekly": return "weekly";
    case "biweekly":
    case "bi-weekly":
      return "biweekly";
    case "semimonthly":
    case "semi-monthly":
      return "semi-monthly";
    case "monthly": return "monthly";
    case "quarterly": return "quarterly";
    case "yearly":
    case "annual":
    case "annually":
      return "yearly";
    case "custom":
    case "one_time":
    case "irregular":
      return "irregular";
    default: return null;
  }
}

export const manualAdapter = new ManualAdapter();
