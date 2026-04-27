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
        // Phase 3.2: MX's transaction_guid — used by income.ts stream-
        // membership matching against NormalizedRecurringStream.rawTransactionIds.
        // For MX recurring streams, transactionGuids are the canonical id.
        providerTransactionId: tx.transactionGuid ?? tx.guid ?? null,
        date: tx.date || tx.transactedAt,
        amount,
        direction: isCredit ? "credit" : "debit",
        merchant: cleanedMerchant,
        category: canonical,
        // §6.2.7-prep: pull canonical_category_id directly off the source row.
        // Phase A's INSERT-time dual-write populates this on every mx_transactions
        // INSERT; older rows are backfilled.
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

  // ─── Recurring streams (Phase 1, Provider-First SSOT) ───────────────────
  //
  // MX exposes recurring transaction analysis at:
  //   GET /users/{user_guid}/recurring_transactions
  //
  // Returns objects covering both inflows (income) and outflows (bills/subs)
  // in one array. Ryan confirmed 2026-04-26: included at our pricing tier
  // with no additional fees.
  //
  // Failure mode: if the endpoint isn't accessible at our tier (returns 403
  // / 404), we log and return an empty array. Plaid streams continue to
  // work; the user just won't see MX-detected streams. No UI breakage.
  async getRecurringStreams(userId: string): Promise<NormalizedRecurringStream[]> {
    const { storage } = await import("../../../storage");

    const user = await storage.getUser(userId);
    if (!user || !user.mxUserGuid) return [];

    const members = await storage.getMxMembers(userId);
    if (members.length === 0) return [];

    // Lazy import the legacy axios client (added export 2026-04-26 for this).
    const { mxClient } = await import("../../../mx");
    if (!mxClient) {
      console.warn("[MxAdapter] mxClient not exported from server/mx.ts — recurring streams unavailable");
      return [];
    }
    const userGuid = user.mxUserGuid;

    const streams: NormalizedRecurringStream[] = [];

    let response;
    try {
      // Endpoint shape: GET /users/{user_guid}/recurring_transactions returns
      // a paginated list. We don't paginate here — typical user has < 50
      // recurring streams across all members; one page suffices.
      response = await mxClient.get(`/users/${userGuid}/recurring_transactions`);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404 || status === 403) {
        console.warn(`[MxAdapter] recurring_transactions endpoint returned ${status} — feature may not be enabled at our MX tier`);
        return [];
      }
      console.warn(`[MxAdapter] recurring_transactions fetch failed:`, err?.message);
      return [];
    }

    const records = response?.data?.recurring_transactions || [];
    if (!Array.isArray(records)) {
      console.warn("[MxAdapter] recurring_transactions response.data.recurring_transactions is not an array");
      return [];
    }

    // Build a map of memberGuid → memberId so streams reference our local
    // member id, not MX's GUID. The downstream period calculator + tombstone
    // logic deals in our own ids.
    const memberIdByGuid = new Map<string, string>();
    for (const m of members) {
      if (m.memberGuid) memberIdByGuid.set(m.memberGuid, m.id);
    }

    for (const r of records) {
      streams.push(this.mxRecordToNormalized(r, memberIdByGuid));
    }

    return streams;
  }

  /** Map an MX recurring_transaction record into the provider-agnostic shape. */
  private mxRecordToNormalized(
    r: any,
    memberIdByGuid: Map<string, string>,
  ): NormalizedRecurringStream {
    // MX uses transaction_type "CREDIT" (money in) / "DEBIT" (money out) on
    // recurring records the same way as on regular transactions.
    const txType = String(r.transaction_type || "").toUpperCase();
    const direction: "inflow" | "outflow" = txType === "CREDIT" ? "inflow" : "outflow";

    const lastAmount = Math.abs(parseFloat(String(r.last_amount ?? r.amount ?? 0))) || 0;
    const averageAmount = Math.abs(parseFloat(String(r.average_amount ?? lastAmount))) || lastAmount;

    const merchant = this.normalizeMerchant(
      r.merchant_name || r.description || r.original_description || "Unknown",
    );

    const { category } = this.remapCategory(r.category || r.top_level_category || null, {
      mxCategory: r.category ? String(r.category) : null,
      mxTopLevel: r.top_level_category ? String(r.top_level_category) : null,
      merchant,
    });

    return {
      streamId: String(r.guid || r.id || `mx-${Math.random().toString(36).slice(2)}`),
      providerSource: "mx",
      itemId: memberIdByGuid.get(String(r.member_guid)) || String(r.member_guid || ""),
      accountId: String(r.account_guid || r.account_id || ""),
      direction,
      merchant: merchant || "Unknown",
      merchantId: r.merchant_guid ? String(r.merchant_guid) : null,
      category,
      rawProviderCategory: String(r.category || r.top_level_category || ""),
      frequency: mapMxFrequency(r.frequency || r.recurrence),
      // MX doesn't expose an explicit lifecycle enum the way Plaid does; we
      // treat MX records as "active" by default (since the endpoint returns
      // active recurring patterns) and "tombstoned" when MX flags them as
      // ended. Confidence comes from the is_recurring flag (when MX is
      // confident enough to include the record, we trust it as "high").
      status: r.is_active === false || r.ended === true ? "tombstoned" : "active",
      confidence: r.confidence
        ? mapMxConfidence(r.confidence)
        : (r.is_recurring ? "high" : "medium"),
      lastAmount,
      averageAmount,
      lastDate: r.last_transacted_at?.slice(0, 10) || r.last_date || "",
      nextExpectedDate: r.next_expected_at?.slice(0, 10) || r.next_expected_date || null,
      occurrenceCount: parseInt(String(r.transaction_count || r.occurrence_count || 0), 10) || 0,
      isActive: r.is_active !== false && r.ended !== true,
      // MX recurring records don't enumerate member transaction_ids the way
      // Plaid streams do. Leave empty; the period calculator falls back to
      // matching individual mx_transactions rows by merchantId/name.
      rawTransactionIds: [],
    };
  }
}

// ─── MX → Normalized helpers ─────────────────────────────────────────────

function mapMxFrequency(f: string | null | undefined): RecurringStreamFrequency {
  switch (String(f || "").toLowerCase()) {
    case "weekly": return "weekly";
    case "biweekly":
    case "bi-weekly":
    case "bi_weekly":
      return "biweekly";
    case "semimonthly":
    case "semi-monthly":
    case "semi_monthly":
      return "semi-monthly";
    case "monthly": return "monthly";
    case "quarterly": return "quarterly";
    case "yearly":
    case "annual":
    case "annually":
      return "yearly";
    default: return null;
  }
}

function mapMxConfidence(c: string | number | null | undefined): RecurringStreamConfidence {
  if (typeof c === "number") {
    if (c >= 0.9) return "very_high";
    if (c >= 0.75) return "high";
    if (c >= 0.5) return "medium";
    return "low";
  }
  switch (String(c || "").toLowerCase()) {
    case "very_high":
    case "very-high":
      return "very_high";
    case "high": return "high";
    case "medium": return "medium";
    case "low": return "low";
    default: return "medium";
  }
}

export const mxAdapter = new MxAdapter();
