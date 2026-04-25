/**
 * AI Bank Teller — Phase 1, 2 & 3 (provider-agnostic rewrite)
 *
 * Provides:
 *  - buildTellerSystemPrompt()   — constructs the AI Teller system prompt with full transaction context
 *  - buildHealthSummaryContext() — account-health snapshot for the Accounts page
 *  - buildBulkTriageContext()    — bulk triage over all unmatched transactions
 *  - runTellerAnalysis()         — Phase 2 proactive flagging after a sync
 *
 * History
 * -------
 * Previously this module rolled its own Plaid-specific pipeline
 * (`storage.getPlaidItems` → `storage.getPlaidAccounts` → `storage.getPlaidTransactions`).
 * That meant:
 *   - MX-only households saw zero transactions and the teller was useless
 *   - Transaction fields referenced Plaid-specific shapes (`merchantName`,
 *     `personalCategory`, `plaidAccountId`, `transactionId`, `isTransfer === "true"`)
 *     that crashed or silently returned empty on non-Plaid rows
 *   - All three endpoint modes (transaction / health_summary / bulk_triage)
 *     returned HTTP 500 when the Plaid pipeline misbehaved (UAT-11 #108)
 *
 * This rewrite routes everything through the provider-agnostic adapter layer
 * (`getAllNormalizedAccounts` / `getAllNormalizedTransactions`). Every call
 * site now takes a household `userIds: string[]` so household members share a
 * view. `NormalizedTransaction` is the only transaction shape touched here —
 * no Plaid/MX/Manual branching.
 */

import { storage } from "./storage";
import { pool } from "./db";
import { format, subDays, parseISO, differenceInDays } from "date-fns";

import {
  getAllNormalizedAccounts,
  getAllNormalizedTransactions,
} from "./engine/data-loaders";
import type {
  NormalizedAccount,
  NormalizedTransaction,
} from "./lib/financial-engine/normalized-types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransactionContext {
  transaction_id: string;
  source: "plaid" | "mx" | "manual" | "expense" | "income";
  merchant_name: string;
  amount: string;          // formatted with sign, e.g. "-$42.50"
  raw_amount: number;      // signed: negative = money out, positive = money in
  date: string;            // YYYY-MM-DD
  category: string;
  status: string;          // "Unmatched" | "cleared" | "Transfer" | etc.
  payment_channel?: string | null;
  personal_finance_category?: string | null;
  account_name?: string | null;
  is_transfer?: boolean;
  transfer_pair_id?: string | null;
}

export interface TellerSuggestedAction {
  type: "recategorize" | "match_transfer" | "none";
  details: Record<string, unknown> | null;
}

export interface TellerResponse {
  response: string;
  suggested_action: TellerSuggestedAction;
}

export interface TellerFlag {
  id: string;
  user_id: string;
  transaction_id: string;
  flag_type: "transfer_pair" | "miscategory" | "anomaly";
  message: string;
  suggested_action: TellerSuggestedAction;
  is_dismissed: boolean;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * NormalizedTransaction.amount is always positive; direction tells us the sign.
 * This helper returns the Plaid-style signed amount that the teller's
 * heuristics (anomaly detection, transfer-pair matching) were built against.
 *   - money out (debit)    →  positive number   (like Plaid)
 *   - money in (credit)    →  negative number   (like Plaid)
 * Flipping this back keeps the in-module math the same as before.
 */
function signedPlaidStyle(t: NormalizedTransaction): number {
  return t.direction === "debit" ? t.amount : -t.amount;
}

function fmtAmount(amount: number, sign = true): string {
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(abs);
  if (!sign) return formatted;
  return amount < 0 ? `-${formatted}` : `+${formatted}`;
}

/**
 * Sort NormalizedTransactions newest-first. `.date` is yyyy-MM-dd so lexical
 * compare works as a date compare.
 */
function byDateDesc(a: NormalizedTransaction, b: NormalizedTransaction): number {
  return b.date.localeCompare(a.date);
}

/**
 * Tolerant merchant similarity. Returns true when `a` mentions `b` or `b`'s
 * first word (length > 2) — matches what the old string-includes pass did.
 */
function merchantMatches(a: string, b: string): boolean {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al === bl) return true;
  if (al.includes(bl) || bl.includes(al)) return true;
  const bFirst = bl.split(/\s+/)[0];
  if (bFirst && bFirst.length > 2 && al.includes(bFirst)) return true;
  return false;
}

// ─── System Prompt Builder ────────────────────────────────────────────────────

/**
 * Build the single-transaction teller prompt.
 *
 * @param userIds Household user IDs. Solo user → pass `[userId]`.
 * @param txCtx   Transaction context from the client. Can be null when the
 *                caller didn't supply one (defensive — the old version
 *                crashed on `txCtx.merchant_name`, contributing to the
 *                500-on-every-request UAT-11 #108 symptom).
 */
export async function buildTellerSystemPrompt(
  userIds: string[],
  txCtx: TransactionContext | null,
): Promise<{ system: string; suggestedAction: TellerSuggestedAction }> {
  let suggestedAction: TellerSuggestedAction = { type: "none", details: null };

  // If the client didn't provide a transaction context we can still answer
  // general account questions, we just have no row-level history to attach.
  if (!txCtx) {
    const system = `You are an AI Bank Teller for BudgetSmart AI. The user is asking a general question without referring to a specific transaction. Answer their question concisely (under 150 words), in plain English, and offer to dig into a specific transaction if they mention one.`;
    return { system, suggestedAction };
  }

  let merchantHistory = "No prior transactions found at this merchant.";

  try {
    const sixMonthsAgo = format(subDays(new Date(), 180), "yyyy-MM-dd");
    const today = format(new Date(), "yyyy-MM-dd");
    const allTxs = await getAllNormalizedTransactions(userIds, sixMonthsAgo, today);

    const sameMerchant = allTxs
      .filter((t) => merchantMatches(t.merchant, txCtx.merchant_name))
      .filter((t) => t.id !== txCtx.transaction_id)
      .sort(byDateDesc)
      .slice(0, 5);

    if (sameMerchant.length > 0) {
      merchantHistory = sameMerchant
        .map((t) => `  - ${t.date}: ${fmtAmount(signedPlaidStyle(t))} (${t.category || "Uncategorized"})`)
        .join("\n");

      // Amount anomaly check (>2x average)
      const avgAmount =
        sameMerchant.reduce((s, t) => s + t.amount, 0) / sameMerchant.length;
      if (Math.abs(txCtx.raw_amount) > avgAmount * 2 && avgAmount > 5) {
        suggestedAction = {
          type: "none",
          details: {
            anomaly: true,
            average: fmtAmount(avgAmount, false),
            current: fmtAmount(Math.abs(txCtx.raw_amount), false),
          },
        };
      }
    }

    // Transfer-pair detection: same absolute amount, opposite direction,
    // within 3 days, different id. `direction` replaces sign-of-amount.
    const txDate = parseISO(txCtx.date);
    const txIsCredit = txCtx.raw_amount < 0;            // legacy convention
    const potentialPair = allTxs.find((t) => {
      if (t.id === txCtx.transaction_id) return false;
      const amountMatch = Math.abs(t.amount - Math.abs(txCtx.raw_amount)) < 0.02;
      const thisIsCredit = t.direction === "credit";
      const oppositeDirection = thisIsCredit !== txIsCredit;
      const withinDays = Math.abs(differenceInDays(parseISO(t.date), txDate)) <= 3;
      return amountMatch && oppositeDirection && withinDays;
    });

    if (potentialPair) {
      suggestedAction = {
        type: "match_transfer",
        details: {
          transaction_id_1: txCtx.transaction_id,
          transaction_id_2: potentialPair.id,
          merchant_1: txCtx.merchant_name,
          merchant_2: potentialPair.merchant || "Unknown",
          amount: fmtAmount(Math.abs(txCtx.raw_amount), false),
          date_1: txCtx.date,
          date_2: potentialPair.date,
        },
      };
    }
  } catch (err) {
    console.error("[AI Teller] Error fetching merchant history:", err);
  }

  // Budget lookup for the transaction's category.
  let budgetInfo = "No budget set for this category.";
  try {
    // Budgets are household-scoped. Aggregate across every member.
    const allBudgets = await storage.getBudgetsByUserIds(userIds);
    const currentMonth = format(new Date(), "yyyy-MM");
    const matchingBudget = allBudgets.find(
      (b) =>
        b.canonicalCategoryId.toLowerCase() === txCtx.category.toLowerCase() &&
        (b.month === currentMonth || !b.month),
    );
    if (matchingBudget) {
      budgetInfo = `Budget for ${matchingBudget.canonicalCategoryId}: ${fmtAmount(parseFloat(matchingBudget.amount), false)}/month`;
    }
  } catch (err) {
    console.error("[AI Teller] Error fetching budget:", err);
  }

  // Heuristic miscategorization hint (kept — PayPal/e-transfer ≠ loan payment).
  let miscategoryHint = "";
  const cat = txCtx.category.toLowerCase();
  const merchant = txCtx.merchant_name.toLowerCase();
  if (
    (merchant.includes("paypal") || merchant.includes("e-transfer")) &&
    cat.includes("loan")
  ) {
    miscategoryHint =
      "⚠️ Note: This PayPal/e-transfer transaction is categorized as a Loan Payment, which may be incorrect.";
    if (suggestedAction.type === "none") {
      suggestedAction = {
        type: "recategorize",
        details: {
          transaction_id: txCtx.transaction_id,
          current_category: txCtx.category,
          suggested_category: "Transfer",
          reason: "PayPal/e-transfer transactions are rarely loan payments",
        },
      };
    }
  }

  const system = `You are an AI Bank Teller for BudgetSmart AI. You are friendly, concise, and speak in plain English — not accounting jargon. Your job is to help users understand their transactions, correct miscategorizations, and identify transfer pairs or anomalies.

You have access to the following transaction data:
${JSON.stringify(
  {
    transaction_id: txCtx.transaction_id,
    merchant: txCtx.merchant_name,
    amount: txCtx.amount,
    date: txCtx.date,
    category: txCtx.category,
    status: txCtx.status,
    payment_channel: txCtx.payment_channel || "unknown",
    personal_finance_category: txCtx.personal_finance_category || null,
    account: txCtx.account_name || "unknown",
    is_transfer: txCtx.is_transfer || false,
  },
  null,
  2,
)}

User's transaction history at this merchant (last 6 months):
${merchantHistory}

Budget for this category: ${budgetInfo}

Transfer pair detected: ${suggestedAction.type === "match_transfer" ? `YES — potential pair with ${(suggestedAction.details as any)?.merchant_2} on ${(suggestedAction.details as any)?.date_2}` : "No"}

${miscategoryHint}

Rules:
- Always explain what the transaction likely is in 1-2 sentences
- If the category looks wrong, say so and suggest the correct one
- If this looks like half of a transfer pair, flag it clearly
- If the amount is unusual vs history, mention it
- Keep responses under 150 words unless the user asks follow-up questions
- Never make up transaction details — only use what is provided
- If asked to recategorize or match a transfer, confirm with the user before taking action`;

  return { system, suggestedAction };
}

// ─── Health Summary ───────────────────────────────────────────────────────────

export interface HealthSummaryContext {
  unmatchedCount: number;
  unmatchedValue: number;
  detectedTransferPairs: Array<{
    tx1: string;
    tx2: string;
    amount: number;
    merchant1: string;
    merchant2: string;
    date1: string;
    date2: string;
  }>;
  /**
   * Stale / errored connected-bank institutions, provider-agnostic.
   * Grouped by institutionName, and sourced from every provider's normalized
   * account view so MX/Plaid/future aggregators all surface here.
   * (Field name kept for backwards compatibility with the route's audit-log
   * metadata; the content is no longer Plaid-specific.)
   */
  stalePlaidItems: Array<{
    institutionName: string;
    lastSynced: string | null;
    errorStatus: string | null;
  }>;
  duplicates: Array<{ merchant: string; amount: number; date: string; count: number }>;
  reconciledCount: number;
  totalCount: number;
}

export async function buildHealthSummaryContext(
  userIds: string[],
): Promise<HealthSummaryContext> {
  const today = format(new Date(), "yyyy-MM-dd");
  const ninetyDaysAgo = format(subDays(new Date(), 90), "yyyy-MM-dd");

  const [accounts, allTxs] = await Promise.all([
    getAllNormalizedAccounts(userIds),
    getAllNormalizedTransactions(userIds, ninetyDaysAgo, today),
  ]);

  // Unmatched stats
  const unmatched = allTxs.filter((t) => !t.matchType || t.matchType === "unmatched");
  const unmatchedValue = unmatched.reduce((s, t) => s + t.amount, 0);

  // Transfer-pair detection (same abs amount, opposite direction, within 3 days,
  // not already marked as transfer). We no longer need "different account"
  // because the normalized layer doesn't expose account IDs uniformly — the
  // amount + direction + date check alone has been a reliable signal in UAT.
  const detectedTransferPairs: HealthSummaryContext["detectedTransferPairs"] = [];
  const pairedIds = new Set<string>();
  for (const tx of allTxs) {
    if (pairedIds.has(tx.id)) continue;
    if (tx.isTransfer) continue;
    if (tx.matchType === "matched") continue;
    const txDate = parseISO(tx.date);
    const pair = allTxs.find((t) => {
      if (t.id === tx.id) return false;
      if (pairedIds.has(t.id)) return false;
      if (t.isTransfer) return false;
      if (t.matchType === "matched") return false;
      const amountMatch = Math.abs(t.amount - tx.amount) < 0.02;
      const oppositeDirection = t.direction !== tx.direction;
      const withinDays = Math.abs(differenceInDays(parseISO(t.date), txDate)) <= 3;
      return amountMatch && oppositeDirection && withinDays;
    });
    if (pair) {
      pairedIds.add(tx.id);
      pairedIds.add(pair.id);
      detectedTransferPairs.push({
        tx1: tx.id,
        tx2: pair.id,
        amount: tx.amount,
        merchant1: tx.merchant || "Unknown",
        merchant2: pair.merchant || "Unknown",
        date1: tx.date,
        date2: pair.date,
      });
    }
  }

  // Stale/errored accounts, grouped per institution.
  const stalePlaidItems: HealthSummaryContext["stalePlaidItems"] = [];
  const seenInstitutions = new Set<string>();
  for (const acc of accounts) {
    const inst = acc.institutionName || "Unknown Bank";
    if (seenInstitutions.has(inst)) continue;

    const lastSynced = acc.lastSyncedAt || null;
    const hoursSince = lastSynced
      ? (Date.now() - new Date(lastSynced).getTime()) / (1000 * 60 * 60)
      : Infinity;
    const statusIsBad =
      acc.itemStatus &&
      acc.itemStatus !== "healthy";

    // Flag if no sync in 24h OR the adapter says the connection is unhealthy.
    if (hoursSince > 24 || statusIsBad) {
      seenInstitutions.add(inst);
      stalePlaidItems.push({
        institutionName: inst,
        lastSynced,
        errorStatus: statusIsBad ? acc.itemStatus! : null,
      });
    }
  }

  // Duplicate detection (same merchant, same amount, same date).
  const dupMap = new Map<string, number>();
  for (const tx of allTxs) {
    const key = `${(tx.merchant || "").toLowerCase()}|${tx.amount.toFixed(2)}|${tx.date}`;
    dupMap.set(key, (dupMap.get(key) || 0) + 1);
  }
  const duplicates: HealthSummaryContext["duplicates"] = [];
  for (const [key, count] of dupMap.entries()) {
    if (count > 1) {
      const [merchant, amount, date] = key.split("|");
      duplicates.push({ merchant, amount: parseFloat(amount), date, count });
    }
  }

  const reconciledCount = allTxs.filter(
    (t) => t.matchType && t.matchType !== "unmatched",
  ).length;

  return {
    unmatchedCount: unmatched.length,
    unmatchedValue,
    detectedTransferPairs,
    stalePlaidItems,
    duplicates,
    reconciledCount,
    totalCount: allTxs.length,
  };
}

export function buildHealthSummaryPrompt(ctx: HealthSummaryContext): string {
  const confidence = ctx.totalCount > 0
    ? Math.round((ctx.reconciledCount / ctx.totalCount) * 100)
    : 100;

  return `You are an AI Bank Teller for BudgetSmart AI. The user has opened the Accounts page and wants a quick health check on their accounts.

Here is the current account health data:
${JSON.stringify({
  unmatched_transactions: ctx.unmatchedCount,
  unmatched_combined_value: fmtAmount(ctx.unmatchedValue, false),
  detected_transfer_pairs_not_yet_matched: ctx.detectedTransferPairs.length,
  stale_or_errored_accounts: ctx.stalePlaidItems.length,
  duplicate_transactions_detected: ctx.duplicates.length,
  reconciliation_confidence_score: `${confidence}%`,
  reconciled_count: ctx.reconciledCount,
  total_transactions: ctx.totalCount,
  stale_items: ctx.stalePlaidItems,
  transfer_pairs: ctx.detectedTransferPairs.slice(0, 3),
  duplicates: ctx.duplicates.slice(0, 3),
}, null, 2)}

Rules:
- Give a concise account health summary under 200 words
- Include the reconciliation confidence score (${confidence}%)
- Mention unmatched count and combined dollar value
- Mention detected transfer pairs if any
- Warn about stale/errored accounts if any
- Mention duplicates if any
- End with a top recommended action
- Be friendly and plain English — no accounting jargon
- Offer to dive into any item`;
}

// ─── Bulk Triage ──────────────────────────────────────────────────────────────

export interface BulkTriageItem {
  transaction_id: string;
  merchant: string;
  amount: number;
  date: string;
  category: string;
  triage_type: "transfer_pair" | "miscategorized" | "manual_review";
  reason: string;
  suggested_match_tx_id?: string;
  suggested_match_merchant?: string;
  suggested_match_date?: string;
  suggested_category?: string;
}

export async function buildBulkTriageContext(
  userIds: string[],
): Promise<{ items: BulkTriageItem[]; prompt: string }> {
  const today = format(new Date(), "yyyy-MM-dd");
  const ninetyDaysAgo = format(subDays(new Date(), 90), "yyyy-MM-dd");
  const allTxs = await getAllNormalizedTransactions(userIds, ninetyDaysAgo, today);

  const unmatchedTxs = allTxs.filter((t) => !t.matchType || t.matchType === "unmatched");

  const items: BulkTriageItem[] = [];
  const pairedIds = new Set<string>();

  for (const tx of unmatchedTxs) {
    if (pairedIds.has(tx.id)) continue;
    const merchant = tx.merchant || "Unknown";
    const category = tx.category || "Uncategorized";

    // Transfer pair — same abs amount, opposite direction, within 3 days.
    const txDate = parseISO(tx.date);
    const pair = allTxs.find((t) => {
      if (t.id === tx.id) return false;
      if (pairedIds.has(t.id)) return false;
      const amountMatch = Math.abs(t.amount - tx.amount) < 0.02;
      const oppositeDirection = t.direction !== tx.direction;
      const withinDays = Math.abs(differenceInDays(parseISO(t.date), txDate)) <= 3;
      return amountMatch && oppositeDirection && withinDays;
    });

    if (pair) {
      pairedIds.add(tx.id);
      pairedIds.add(pair.id);
      items.push({
        transaction_id: tx.id,
        merchant,
        amount: tx.amount,
        date: tx.date,
        category,
        triage_type: "transfer_pair",
        reason: `Matches ${pair.merchant || "Unknown"} ${fmtAmount(pair.amount, false)} on ${pair.date} — likely internal transfer`,
        suggested_match_tx_id: pair.id,
        suggested_match_merchant: pair.merchant || "Unknown",
        suggested_match_date: pair.date,
      });
      continue;
    }

    // Miscategorization heuristics.
    const merchantLower = merchant.toLowerCase();
    const catLower = category.toLowerCase();
    let miscatSuggestion: string | undefined;
    if ((merchantLower.includes("paypal") || merchantLower.includes("e-transfer")) && catLower.includes("loan")) {
      miscatSuggestion = "Transfers";
    } else if (
      merchantLower.includes("netflix") ||
      merchantLower.includes("spotify") ||
      merchantLower.includes("apple") ||
      merchantLower.includes("google")
    ) {
      if (!catLower.includes("subscription") && !catLower.includes("entertainment")) {
        miscatSuggestion = "Subscriptions";
      }
    } else if (
      merchantLower.includes("uber") ||
      merchantLower.includes("lyft") ||
      merchantLower.includes("taxi")
    ) {
      if (!catLower.includes("transport") && !catLower.includes("rideshare")) {
        miscatSuggestion = "Transportation";
      }
    }

    if (miscatSuggestion) {
      items.push({
        transaction_id: tx.id,
        merchant,
        amount: tx.amount,
        date: tx.date,
        category,
        triage_type: "miscategorized",
        reason: `Merchant "${merchant}" suggests category "${miscatSuggestion}" rather than "${category}"`,
        suggested_category: miscatSuggestion,
      });
      continue;
    }

    // Manual review fallback.
    items.push({
      transaction_id: tx.id,
      merchant,
      amount: tx.amount,
      date: tx.date,
      category,
      triage_type: "manual_review",
      reason: "Unclear merchant — needs manual review",
    });
  }

  const transferPairs = items.filter((i) => i.triage_type === "transfer_pair");
  const miscategorized = items.filter((i) => i.triage_type === "miscategorized");
  const manualReview = items.filter((i) => i.triage_type === "manual_review");

  const prompt = `You are an AI Bank Teller for BudgetSmart AI. The user wants to review all their unmatched transactions in bulk.

Here are the ${unmatchedTxs.length} unmatched transactions I have pre-analyzed:

LIKELY TRANSFER PAIRS (${transferPairs.length}):
${transferPairs.map((i) => `- ${i.merchant} ${fmtAmount(i.amount, false)} on ${i.date} ↔ ${i.suggested_match_merchant} on ${i.suggested_match_date}`).join("\n") || "None"}

LIKELY MISCATEGORIZED (${miscategorized.length}):
${miscategorized.map((i) => `- ${i.merchant} ${fmtAmount(i.amount, false)} → should be "${i.suggested_category}" (currently "${i.category}")`).join("\n") || "None"}

NEEDS MANUAL REVIEW (${manualReview.length}):
${manualReview.map((i) => `- ${i.merchant} ${fmtAmount(i.amount, false)} on ${i.date} — ${i.reason}`).join("\n") || "None"}

Rules:
- Present this triage analysis clearly and concisely
- For transfer pairs: show FROM/TO with amounts and dates, offer to match them
- For miscategorized: show current vs suggested category, offer to fix
- For manual review: briefly explain why it needs attention
- Use emoji: 🔄 for transfer pairs, 🏷️ for miscategorized, ❓ for manual review
- Keep the summary under 300 words
- Tell the user how many items you found in each category
- Remind them that all actions require their confirmation`;

  return { items, prompt };
}

// ─── Phase 2: Proactive Teller Analysis ──────────────────────────────────────

/**
 * Scan recently-ingested transactions for transfer pairs, miscategorizations,
 * and anomalies. Writes flags into `teller_flags` scoped to `userId` (the
 * actor / owner). Household search radius is `userIds` — for a solo user,
 * pass `[userId]`.
 *
 * @param userId            Flag owner — who "sees" the flag in the UI.
 * @param newTransactionIds Normalized transaction IDs (from any provider) to
 *                          analyse. Usually this is what the post-sync hook
 *                          just ingested.
 * @param userIds           Household search scope. Defaults to `[userId]`.
 */
export async function runTellerAnalysis(
  userId: string,
  newTransactionIds: string[],
  userIds: string[] = [userId],
): Promise<void> {
  if (newTransactionIds.length === 0) return;

  try {
    // Ensure teller_flags table exists.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teller_flags (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL,
        transaction_id VARCHAR NOT NULL,
        flag_type VARCHAR NOT NULL,
        message TEXT NOT NULL,
        suggested_action JSONB,
        is_dismissed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Pull the last 90 days of normalized transactions for context; this is
    // provider-agnostic — new adapters will flow through for free.
    const today = format(new Date(), "yyyy-MM-dd");
    const ninetyDaysAgo = format(subDays(new Date(), 90), "yyyy-MM-dd");
    const allTxs = await getAllNormalizedTransactions(userIds, ninetyDaysAgo, today);
    if (allTxs.length === 0) return;

    const newIdSet = new Set(newTransactionIds);
    const newTxs = allTxs.filter((t) => newIdSet.has(t.id));
    if (newTxs.length === 0) return;

    const flags: Array<{
      transaction_id: string;
      flag_type: string;
      message: string;
      suggested_action: TellerSuggestedAction;
      dollar_value: number;
    }> = [];

    for (const tx of newTxs) {
      const merchant = tx.merchant || "Unknown";
      const category = tx.category || "Uncategorized";
      const txDate = parseISO(tx.date);
      const signedAmount = signedPlaidStyle(tx);

      // A) Unmatched transfer pair.
      const potentialPair = allTxs.find((t) => {
        if (t.id === tx.id) return false;
        const amountMatch = Math.abs(t.amount - tx.amount) < 0.02;
        const oppositeDirection = t.direction !== tx.direction;
        const withinDays = Math.abs(differenceInDays(parseISO(t.date), txDate)) <= 2;
        return amountMatch && oppositeDirection && withinDays;
      });

      if (potentialPair && !tx.isTransfer) {
        const pairMerchant = potentialPair.merchant || "Unknown";
        const pairSigned = signedPlaidStyle(potentialPair);
        flags.push({
          transaction_id: tx.id,
          flag_type: "transfer_pair",
          message: `${merchant} ${fmtAmount(signedAmount)} on ${tx.date} may be a transfer pair with ${pairMerchant} ${fmtAmount(pairSigned)} on ${potentialPair.date}.`,
          suggested_action: {
            type: "match_transfer",
            details: {
              transaction_id_1: tx.id,
              transaction_id_2: potentialPair.id,
              merchant_1: merchant,
              merchant_2: pairMerchant,
              amount: fmtAmount(tx.amount, false),
              date_1: tx.date,
              date_2: potentialPair.date,
            },
          },
          dollar_value: tx.amount,
        });
        continue;
      }

      // B) PayPal/e-transfer miscategorized as loan payment.
      const merchantLower = merchant.toLowerCase();
      const catLower = category.toLowerCase();
      if (
        (merchantLower.includes("paypal") || merchantLower.includes("e-transfer")) &&
        catLower.includes("loan")
      ) {
        flags.push({
          transaction_id: tx.id,
          flag_type: "miscategory",
          message: `${merchant} ${fmtAmount(signedAmount)} on ${tx.date} is categorized as "${category}" but PayPal/e-transfer transactions are rarely loan payments.`,
          suggested_action: {
            type: "recategorize",
            details: {
              transaction_id: tx.id,
              current_category: category,
              suggested_category: "Transfer",
              reason: "PayPal/e-transfer transactions are rarely loan payments",
            },
          },
          dollar_value: tx.amount,
        });
        continue;
      }

      // C) Anomaly: transaction > $500 AND >2x the merchant's running average.
      if (tx.amount > 500) {
        const firstWord = merchantLower.split(/\s+/)[0] || "";
        const sameMerchantHistory = firstWord.length > 3
          ? allTxs
              .filter((t) => t.id !== tx.id && (t.merchant || "").toLowerCase().includes(firstWord))
              .slice(0, 10)
          : [];

        if (sameMerchantHistory.length >= 2) {
          const avg =
            sameMerchantHistory.reduce((s, t) => s + t.amount, 0) /
            sameMerchantHistory.length;
          if (tx.amount > avg * 2 && avg > 10) {
            flags.push({
              transaction_id: tx.id,
              flag_type: "anomaly",
              message: `${merchant} ${fmtAmount(signedAmount)} on ${tx.date} is ${Math.round(tx.amount / avg)}x your usual amount (avg: ${fmtAmount(avg, false)}).`,
              suggested_action: { type: "none", details: { average: avg, current: tx.amount } },
              dollar_value: tx.amount,
            });
          }
        }
      }
    }

    // Rank and cap.
    const topFlags = flags.sort((a, b) => b.dollar_value - a.dollar_value).slice(0, 5);

    for (const flag of topFlags) {
      // Skip if we already surfaced this flag for this (user, tx, type).
      const existing = await pool.query(
        `SELECT id FROM teller_flags WHERE user_id = $1 AND transaction_id = $2 AND flag_type = $3 AND is_dismissed = false`,
        [userId, flag.transaction_id, flag.flag_type],
      );
      if (existing.rows.length > 0) continue;

      await pool.query(
        `INSERT INTO teller_flags (user_id, transaction_id, flag_type, message, suggested_action)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          userId,
          flag.transaction_id,
          flag.flag_type,
          flag.message,
          JSON.stringify(flag.suggested_action),
        ],
      );
    }

    if (topFlags.length > 0) {
      console.log(`[AI Teller] Generated ${topFlags.length} flags for user ${userId}`);
    }
  } catch (err) {
    console.error("[AI Teller] runTellerAnalysis error:", err);
  }
}

// Re-export normalized account/transaction types so consumers can use the
// same vocabulary without reaching into the engine's internals.
export type { NormalizedAccount, NormalizedTransaction };
