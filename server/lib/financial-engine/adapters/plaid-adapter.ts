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
  NormalizedRecurringStream,
  RecurringStreamFrequency,
  RecurringStreamStatus,
  RecurringStreamConfidence,
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
      // UAT-11 #109: Plaid liability accounts (Scotia mortgage, credit cards,
      // loans) were being filtered out of /api/engine/debts because their
      // `is_active` column was null/undefined in older rows — the strict
      // `=== "true"` check treated those as inactive, hiding $1.19M of debt.
      // Matches manual-adapter semantics: only EXPLICIT false/"false"
      // deactivates. Ryan controls enable/disable from the Accounts page, which
      // writes the string literals "true"/"false" to the column.
      isActive:
        acc.isActive !== false &&
        acc.isActive !== "false" &&
        acc.isActive !== 0 &&
        acc.isActive !== "0",
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

      const counterpartyType = tx.counterpartyType || null;
      const cleanedMerchant = this.normalizeMerchant(
        tx.counterpartyName || tx.merchantName || tx.name
      );

      // Canonical category (engine/UI always read this; never the raw PFC).
      // UAT-11 #88 / #96: pass the CLEANED merchant into the remapper so
      // merchant-keyword overrides (Telus, Loblaws, CAA) can beat Plaid's
      // wrong primary assignments. Must happen AFTER cleanMerchant so we
      // match on "Telus" not "APOS PURCHASE TELUS MOBILITY".
      const { category: canonical, confidence } = this.remapCategory(rawCategory, {
        pfcPrimary: pfcPrimaryRaw || null,
        pfcDetailed: pfcDetailedRaw || null,
        merchant: cleanedMerchant,
      });

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
        // §6.2.7-prep: pull canonical_category_id directly off the source row.
        // Phase A's INSERT-time dual-write populates this on every plaid_transactions
        // INSERT/upsert; rows that pre-date the dual-write have it backfilled.
        canonicalCategoryId: tx.canonicalCategoryId ?? null,
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

  // ─── Recurring streams (Phase 1, Provider-First SSOT) ───────────────────
  //
  // Calls Plaid's `/transactions/recurring/get` per Plaid item the user has,
  // merges inflow_streams + outflow_streams, and returns the unified
  // NormalizedRecurringStream[]. Replaces our home-grown
  // detectRecurringIncomeSuggestions / bill-detection algorithms with
  // Plaid's ML-trained clustering (free with our existing Transactions
  // product — Ryan confirmed 2026-04-26, see PROVIDER_FIRST_SSOT_STRATEGY.md).
  //
  // The merchantId enrichment requires a join into local plaid_transactions
  // because TransactionStream doesn't expose merchant_entity_id directly —
  // we look up one of the stream's transaction_ids and pull the entity id
  // off the cached row. Failing that, merchantId is null and downstream
  // tombstone-resurfacing logic (strategy §8.2) falls back to fuzzy name
  // matching.
  async getRecurringStreams(userId: string): Promise<NormalizedRecurringStream[]> {
    // Lazy imports to keep this file engine-pure (no DB / network deps at module load).
    const { storage } = await import("../../../storage");
    const { plaidClient } = await import("../../../plaid");
    const { pool } = await import("../../../db");

    // storage.getPlaidItems already decrypts accessToken via _decryptPlaidItem.
    // No double-decrypt needed (would corrupt the token).
    const items = await storage.getPlaidItems(userId);
    if (items.length === 0) return [];

    const streams: NormalizedRecurringStream[] = [];

    for (const item of items) {
      // Skip items in error / pending_expiration state — recurring API will
      // 400 on those. Update-mode reconnect (§Plaid update-mode) is the
      // user-facing remedy.
      if (item.status === "error" || item.status === "pending_expiration") {
        continue;
      }

      let response;
      try {
        response = await plaidClient.transactionsRecurringGet({
          access_token: item.accessToken,
        });
      } catch (err: any) {
        const code = err?.response?.data?.error_code;
        // PRODUCT_NOT_READY = Plaid hasn't analyzed enough history yet.
        // Newly-linked items return this for ~24 hours. Skip silently and
        // the next sync / webhook will trigger a re-fetch when ready.
        if (code === "PRODUCT_NOT_READY") {
          console.log(`[PlaidAdapter] recurring streams not ready yet for item ${item.id}`);
          continue;
        }
        console.warn(`[PlaidAdapter] transactionsRecurringGet failed for item ${item.id}:`, code || err?.message);
        continue;
      }

      const inflows = response.data.inflow_streams || [];
      const outflows = response.data.outflow_streams || [];

      // Collect every stream's first transaction_id so we can batch-load the
      // local plaid_transactions rows once per item, not once per stream.
      const allTxIds = new Set<string>();
      for (const s of [...inflows, ...outflows]) {
        if (s.transaction_ids?.[0]) allTxIds.add(s.transaction_ids[0]);
      }

      // Build a map of plaid transaction_id → merchant_entity_id for the
      // streams we're about to normalize. One query per item.
      const merchantIdByTxId = new Map<string, string | null>();
      if (allTxIds.size > 0) {
        const { rows } = await pool.query<{ transaction_id: string; merchant_entity_id: string | null }>(
          `SELECT transaction_id, merchant_entity_id
             FROM plaid_transactions
            WHERE transaction_id = ANY($1::text[])`,
          [Array.from(allTxIds)],
        );
        for (const r of rows) {
          merchantIdByTxId.set(r.transaction_id, r.merchant_entity_id);
        }
      }

      for (const s of inflows) {
        streams.push(this.plaidStreamToNormalized(s, "inflow", item.id, merchantIdByTxId));
      }
      for (const s of outflows) {
        streams.push(this.plaidStreamToNormalized(s, "outflow", item.id, merchantIdByTxId));
      }
    }

    return streams;
  }

  /** Map a Plaid TransactionStream into the provider-agnostic shape. */
  private plaidStreamToNormalized(
    s: any, // Plaid TransactionStream — typed as any to avoid coupling to Plaid SDK types here
    direction: "inflow" | "outflow",
    itemId: string,
    merchantIdByTxId: Map<string, string | null>,
  ): NormalizedRecurringStream {
    const firstTxId: string | undefined = s.transaction_ids?.[0];
    const merchantId = firstTxId ? (merchantIdByTxId.get(firstTxId) ?? null) : null;

    const lastAmount = Math.abs(parseFloat(String(s.last_amount?.amount ?? 0))) || 0;
    const averageAmount = Math.abs(parseFloat(String(s.average_amount?.amount ?? 0))) || lastAmount;

    const pfcDetailed = String(s.personal_finance_category?.detailed ?? "").toUpperCase();
    const pfcPrimary = String(s.personal_finance_category?.primary ?? "").toUpperCase();
    const { category } = this.remapCategory(pfcDetailed || pfcPrimary || null, {
      pfcPrimary: pfcPrimary || null,
      pfcDetailed: pfcDetailed || null,
      merchant: this.normalizeMerchant(s.merchant_name || s.description),
    });

    return {
      streamId: s.stream_id,
      providerSource: "plaid",
      itemId,
      accountId: s.account_id,
      direction,
      merchant: this.normalizeMerchant(s.merchant_name || s.description) || "Unknown",
      merchantId,
      category,
      rawProviderCategory: pfcDetailed || pfcPrimary || "",
      frequency: mapPlaidFrequency(s.frequency),
      status: mapPlaidStreamStatus(s.status, s.is_active),
      confidence: mapPfcConfidence(s.personal_finance_category?.confidence_level),
      lastAmount,
      averageAmount,
      lastDate: s.last_date,
      nextExpectedDate: s.predicted_next_date ?? null,
      occurrenceCount: s.transaction_ids?.length ?? 0,
      isActive: s.is_active === true,
      rawTransactionIds: s.transaction_ids ?? [],
    };
  }
}

// ─── Plaid → Normalized helpers ──────────────────────────────────────────

/**
 * Map Plaid's RecurringTransactionFrequency enum to our normalized type.
 * Plaid: UNKNOWN | WEEKLY | BIWEEKLY | SEMI_MONTHLY | MONTHLY | ANNUALLY.
 * "Annually" becomes "yearly" in our taxonomy. UNKNOWN → null (downstream
 * marks the stream as irregular if the period calculator can't project).
 */
function mapPlaidFrequency(f: string | null | undefined): RecurringStreamFrequency {
  switch (String(f || "").toUpperCase()) {
    case "WEEKLY": return "weekly";
    case "BIWEEKLY": return "biweekly";
    case "SEMI_MONTHLY": return "semi-monthly";
    case "MONTHLY": return "monthly";
    case "ANNUALLY": return "yearly";
    default: return null;
  }
}

/**
 * Map Plaid's TransactionStreamStatus + is_active boolean to our normalized
 * lifecycle enum.
 *
 * Plaid status enum is intentionally narrow: UNKNOWN, MATURE, EARLY_DETECTION,
 * TOMBSTONED. We use is_active as the second axis to distinguish "currently
 * receiving money" from "stream existed but stopped" (manifests as MATURE +
 * is_active=false → "late").
 */
function mapPlaidStreamStatus(
  status: string | null | undefined,
  isActive: boolean | null | undefined,
): RecurringStreamStatus {
  const s = String(status || "").toUpperCase();
  if (s === "TOMBSTONED") return "tombstoned";
  if (s === "EARLY_DETECTION") return "early_detection";
  if (s === "MATURE") {
    return isActive === false ? "late" : "mature";
  }
  // UNKNOWN or anything else — treat as active. The period calculator only
  // auto-promotes streams with status === "mature", so UNKNOWN streams
  // surface as suggestions rather than auto-added registry rows.
  return "active";
}

/**
 * Map Plaid's PFC confidence_level string to our normalized enum. Plaid
 * doesn't expose a confidence on the stream itself — only on the embedded
 * personal_finance_category. We surface that as the stream's confidence
 * because the wizard's auto-promote gate (very_high + mature) needs it.
 */
function mapPfcConfidence(level: string | null | undefined): RecurringStreamConfidence {
  switch (String(level || "").toUpperCase()) {
    case "VERY_HIGH": return "very_high";
    case "HIGH": return "high";
    case "MEDIUM": return "medium";
    case "LOW": return "low";
    default: return "medium"; // UNKNOWN / null → medium (don't auto-promote, don't reject)
  }
}

export const plaidAdapter = new PlaidAdapter();
