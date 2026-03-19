/**
 * AI Bank Teller — Phase 1, 2 & 3
 *
 * Provides:
 *  - buildTellerSystemPrompt()  — constructs the AI Teller system prompt with full transaction context
 *  - runTellerAnalysis()        — Phase 2 proactive flagging after sync
 *  - TellerFlag types
 */

import { storage } from "./storage";
import { pool } from "./db";
import { routeAI } from "./ai-router";
import { format, subDays, parseISO, differenceInDays } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransactionContext {
  transaction_id: string;
  source: "plaid" | "mx" | "manual" | "expense" | "income";
  merchant_name: string;
  amount: string;          // formatted with sign, e.g. "-$42.50"
  raw_amount: number;
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

function fmtAmount(amount: number, sign = true): string {
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(abs);
  if (!sign) return formatted;
  return amount < 0 ? `-${formatted}` : `+${formatted}`;
}

// ─── System Prompt Builder ────────────────────────────────────────────────────

export async function buildTellerSystemPrompt(
  userId: string,
  txCtx: TransactionContext
): Promise<{ system: string; suggestedAction: TellerSuggestedAction }> {
  // 1. Fetch last 5 transactions at same merchant
  let merchantHistory: string = "No prior transactions found at this merchant.";
  let suggestedAction: TellerSuggestedAction = { type: "none", details: null };

  try {
    // Get all plaid items for user
    const plaidItems = await storage.getPlaidItems(userId);
    const allAccounts = await Promise.all(
      plaidItems.map((item) => storage.getPlaidAccounts(item.id))
    );
    const accountIds = allAccounts.flat().filter((a) => a.isActive === "true").map((a) => a.id);

    if (accountIds.length > 0) {
      const thirtyDaysAgo = format(subDays(new Date(), 180), "yyyy-MM-dd");
      const allTxs = await storage.getPlaidTransactions(accountIds, { startDate: thirtyDaysAgo });

      const merchantName = txCtx.merchant_name.toLowerCase();
      const sameMerchant = allTxs
        .filter((t) => {
          const name = (t.merchantName || t.name || "").toLowerCase();
          return name.includes(merchantName) || merchantName.includes(name.split(" ")[0]);
        })
        .filter((t) => t.transactionId !== txCtx.transaction_id)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5);

      if (sameMerchant.length > 0) {
        merchantHistory = sameMerchant
          .map((t) => `  - ${t.date}: ${fmtAmount(parseFloat(t.amount))} (${t.personalCategory || t.category || "Uncategorized"})`)
          .join("\n");

        // Check for amount anomaly (>2x average)
        const avgAmount =
          sameMerchant.reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0) /
          sameMerchant.length;
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

      // Check for transfer pair (same absolute amount, opposite sign, within 3 days, different account)
      const txDate = parseISO(txCtx.date);
      const potentialPair = allTxs.find((t) => {
        if (t.transactionId === txCtx.transaction_id) return false;
        const tAmount = parseFloat(t.amount);
        const amountMatch = Math.abs(Math.abs(tAmount) - Math.abs(txCtx.raw_amount)) < 0.02;
        const oppositeSign = (tAmount > 0) !== (txCtx.raw_amount > 0);
        const withinDays = Math.abs(differenceInDays(parseISO(t.date), txDate)) <= 3;
        return amountMatch && oppositeSign && withinDays;
      });

      if (potentialPair) {
        suggestedAction = {
          type: "match_transfer",
          details: {
            transaction_id_1: txCtx.transaction_id,
            transaction_id_2: potentialPair.transactionId,
            merchant_1: txCtx.merchant_name,
            merchant_2: potentialPair.merchantName || potentialPair.name || "Unknown",
            amount: fmtAmount(Math.abs(txCtx.raw_amount), false),
            date_1: txCtx.date,
            date_2: potentialPair.date,
          },
        };
      }
    }
  } catch (err) {
    console.error("[AI Teller] Error fetching merchant history:", err);
  }

  // 2. Fetch budget for this category
  let budgetInfo = "No budget set for this category.";
  try {
    const budgets = await storage.getBudgets(userId);
    const currentMonth = format(new Date(), "yyyy-MM");
    const matchingBudget = budgets.find(
      (b) =>
        b.category.toLowerCase() === txCtx.category.toLowerCase() &&
        (b.month === currentMonth || !b.month)
    );
    if (matchingBudget) {
      budgetInfo = `Budget for ${matchingBudget.category}: ${fmtAmount(parseFloat(matchingBudget.amount), false)}/month`;
    }
  } catch (err) {
    console.error("[AI Teller] Error fetching budget:", err);
  }

  // 3. Check for miscategorization hints
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
  2
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
  detectedTransferPairs: Array<{ tx1: string; tx2: string; amount: number; merchant1: string; merchant2: string; date1: string; date2: string }>;
  stalePlaidItems: Array<{ institutionName: string; lastSynced: string | null; errorStatus: string | null }>;
  duplicates: Array<{ merchant: string; amount: number; date: string; count: number }>;
  reconciledCount: number;
  totalCount: number;
}

export async function buildHealthSummaryContext(userId: string): Promise<HealthSummaryContext> {
  const plaidItems = await storage.getPlaidItems(userId);
  const allAccounts = await Promise.all(plaidItems.map((item) => storage.getPlaidAccounts(item.id)));
  const accountIds = allAccounts.flat().filter((a) => a.isActive === "true").map((a) => a.id);

  const ninetyDaysAgo = format(subDays(new Date(), 90), "yyyy-MM-dd");
  const allTxs = accountIds.length > 0
    ? await storage.getPlaidTransactions(accountIds, { startDate: ninetyDaysAgo })
    : [];

  // Unmatched stats
  const unmatched = allTxs.filter((t) => !t.matchType || t.matchType === "unmatched");
  const unmatchedValue = unmatched.reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);

  // Detect transfer pairs (same abs amount, opposite sign, within 3 days, different account, not already transfer)
  const detectedTransferPairs: HealthSummaryContext["detectedTransferPairs"] = [];
  const pairedIds = new Set<string>();
  for (const tx of allTxs) {
    if (pairedIds.has(tx.transactionId)) continue;
    if (tx.isTransfer === true || tx.matchType === "transfer") continue;
    const amount = parseFloat(tx.amount);
    const txDate = parseISO(tx.date);
    const pair = allTxs.find((t) => {
      if (t.transactionId === tx.transactionId) return false;
      if (pairedIds.has(t.transactionId)) return false;
      if (t.isTransfer === true || t.matchType === "transfer") return false;
      const tAmount = parseFloat(t.amount);
      const amountMatch = Math.abs(Math.abs(tAmount) - Math.abs(amount)) < 0.02;
      const oppositeSign = (tAmount > 0) !== (amount > 0);
      const withinDays = Math.abs(differenceInDays(parseISO(t.date), txDate)) <= 3;
      const differentAccount = t.plaidAccountId !== tx.plaidAccountId;
      return amountMatch && oppositeSign && withinDays && differentAccount;
    });
    if (pair) {
      pairedIds.add(tx.transactionId);
      pairedIds.add(pair.transactionId);
      detectedTransferPairs.push({
        tx1: tx.transactionId,
        tx2: pair.transactionId,
        amount: Math.abs(amount),
        merchant1: tx.merchantName || tx.name || "Unknown",
        merchant2: pair.merchantName || pair.name || "Unknown",
        date1: tx.date,
        date2: pair.date,
      });
    }
  }

  // Stale Plaid items (no sync in 24h or error status)
  const stalePlaidItems = plaidItems
    .filter((item) => {
      const accs = allAccounts.flat().filter((a) => a.plaidItemId === item.id);
      const lastSynced = accs[0]?.lastSynced;
      if (!lastSynced) return true;
      const hoursSince = (Date.now() - new Date(lastSynced).getTime()) / (1000 * 60 * 60);
      return hoursSince > 24 || item.status === "error" || item.status === "LOGIN_REQUIRED";
    })
    .map((item) => {
      const accs = allAccounts.flat().filter((a) => a.plaidItemId === item.id);
      return {
        institutionName: item.institutionName || "Unknown Bank",
        lastSynced: accs[0]?.lastSynced || null,
        errorStatus: item.status === "active" ? null : (item.status || null),
      };
    });

  // Duplicate detection (same merchant, same amount, same date, same account)
  const dupMap = new Map<string, number>();
  for (const tx of allTxs) {
    const key = `${(tx.merchantName || tx.name || "").toLowerCase()}|${tx.amount}|${tx.date}|${tx.plaidAccountId}`;
    dupMap.set(key, (dupMap.get(key) || 0) + 1);
  }
  const duplicates: HealthSummaryContext["duplicates"] = [];
  for (const [key, count] of dupMap.entries()) {
    if (count > 1) {
      const [merchant, amount, date] = key.split("|");
      duplicates.push({ merchant, amount: parseFloat(amount), date, count });
    }
  }

  const reconciledCount = allTxs.filter((t) => t.matchType && t.matchType !== "unmatched").length;

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
  userId: string
): Promise<{ items: BulkTriageItem[]; prompt: string }> {
  const plaidItems = await storage.getPlaidItems(userId);
  const allAccounts = await Promise.all(plaidItems.map((item) => storage.getPlaidAccounts(item.id)));
  const accountIds = allAccounts.flat().filter((a) => a.isActive === "true").map((a) => a.id);

  const ninetyDaysAgo = format(subDays(new Date(), 90), "yyyy-MM-dd");
  const allTxs = accountIds.length > 0
    ? await storage.getPlaidTransactions(accountIds, { startDate: ninetyDaysAgo })
    : [];

  const unmatchedTxs = allTxs.filter((t) => !t.matchType || t.matchType === "unmatched");

  const items: BulkTriageItem[] = [];
  const pairedIds = new Set<string>();

  for (const tx of unmatchedTxs) {
    if (pairedIds.has(tx.transactionId)) continue;
    const amount = parseFloat(tx.amount);
    const txDate = parseISO(tx.date);
    const merchant = tx.merchantName || tx.name || "Unknown";
    const category = tx.personalCategory || tx.category || "Uncategorized";

    // Check transfer pair
    const pair = allTxs.find((t) => {
      if (t.transactionId === tx.transactionId) return false;
      if (pairedIds.has(t.transactionId)) return false;
      const tAmount = parseFloat(t.amount);
      const amountMatch = Math.abs(Math.abs(tAmount) - Math.abs(amount)) < 0.02;
      const oppositeSign = (tAmount > 0) !== (amount > 0);
      const withinDays = Math.abs(differenceInDays(parseISO(t.date), txDate)) <= 3;
      const differentAccount = t.plaidAccountId !== tx.plaidAccountId;
      return amountMatch && oppositeSign && withinDays && differentAccount;
    });

    if (pair) {
      pairedIds.add(tx.transactionId);
      pairedIds.add(pair.transactionId);
      items.push({
        transaction_id: tx.transactionId,
        merchant,
        amount: Math.abs(amount),
        date: tx.date,
        category,
        triage_type: "transfer_pair",
        reason: `Matches ${pair.merchantName || pair.name || "Unknown"} ${fmtAmount(Math.abs(parseFloat(pair.amount)), false)} on ${pair.date} — likely internal transfer`,
        suggested_match_tx_id: pair.transactionId,
        suggested_match_merchant: pair.merchantName || pair.name || "Unknown",
        suggested_match_date: pair.date,
      });
      continue;
    }

    // Check miscategorization
    const merchantLower = merchant.toLowerCase();
    const catLower = category.toLowerCase();
    let miscatSuggestion: string | undefined;
    if ((merchantLower.includes("paypal") || merchantLower.includes("e-transfer")) && catLower.includes("loan")) {
      miscatSuggestion = "Transfers";
    } else if (merchantLower.includes("netflix") || merchantLower.includes("spotify") || merchantLower.includes("apple") || merchantLower.includes("google")) {
      if (!catLower.includes("subscription") && !catLower.includes("entertainment")) {
        miscatSuggestion = "Subscriptions";
      }
    } else if (merchantLower.includes("uber") || merchantLower.includes("lyft") || merchantLower.includes("taxi")) {
      if (!catLower.includes("transport") && !catLower.includes("rideshare")) {
        miscatSuggestion = "Transportation";
      }
    }

    if (miscatSuggestion) {
      items.push({
        transaction_id: tx.transactionId,
        merchant,
        amount: Math.abs(amount),
        date: tx.date,
        category,
        triage_type: "miscategorized",
        reason: `Merchant "${merchant}" suggests category "${miscatSuggestion}" rather than "${category}"`,
        suggested_category: miscatSuggestion,
      });
      continue;
    }

    // Manual review
    items.push({
      transaction_id: tx.transactionId,
      merchant,
      amount: Math.abs(amount),
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

export async function runTellerAnalysis(
  userId: string,
  newTransactionIds: string[]
): Promise<void> {
  if (newTransactionIds.length === 0) return;

  try {
    // Ensure teller_flags table exists
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

    // Get all plaid items for user
    const plaidItems = await storage.getPlaidItems(userId);
    const allAccounts = await Promise.all(
      plaidItems.map((item) => storage.getPlaidAccounts(item.id))
    );
    const accountIds = allAccounts.flat().filter((a) => a.isActive === "true").map((a) => a.id);
    if (accountIds.length === 0) return;

    // Fetch recent transactions (90 days for context)
    const ninetyDaysAgo = format(subDays(new Date(), 90), "yyyy-MM-dd");
    const allTxs = await storage.getPlaidTransactions(accountIds, { startDate: ninetyDaysAgo });

    // Filter to new transactions only
    const newTxs = allTxs.filter((t) => newTransactionIds.includes(t.transactionId));
    if (newTxs.length === 0) return;

    const flags: Array<{
      transaction_id: string;
      flag_type: string;
      message: string;
      suggested_action: TellerSuggestedAction;
      dollar_value: number;
    }> = [];

    for (const tx of newTxs) {
      const amount = parseFloat(tx.amount);
      const absAmount = Math.abs(amount);
      const merchant = tx.merchantName || tx.name || "Unknown";
      const category = tx.personalCategory || tx.category || "Uncategorized";
      const txDate = parseISO(tx.date);

      // A) Check for unmatched transfer pairs
      const potentialPair = allTxs.find((t) => {
        if (t.transactionId === tx.transactionId) return false;
        const tAmount = parseFloat(t.amount);
        const amountMatch = Math.abs(Math.abs(tAmount) - absAmount) < 0.02;
        const oppositeSign = (tAmount > 0) !== (amount > 0);
        const withinDays = Math.abs(differenceInDays(parseISO(t.date), txDate)) <= 2;
        const differentAccount = t.plaidAccountId !== tx.plaidAccountId;
        return amountMatch && oppositeSign && withinDays && differentAccount;
      });

      if (potentialPair && tx.isTransfer !== "true") {
        const pairMerchant = potentialPair.merchantName || potentialPair.name || "Unknown";
        flags.push({
          transaction_id: tx.transactionId,
          flag_type: "transfer_pair",
          message: `${merchant} ${fmtAmount(amount)} on ${tx.date} may be a transfer pair with ${pairMerchant} ${fmtAmount(parseFloat(potentialPair.amount))} on ${potentialPair.date}.`,
          suggested_action: {
            type: "match_transfer",
            details: {
              transaction_id_1: tx.transactionId,
              transaction_id_2: potentialPair.transactionId,
              merchant_1: merchant,
              merchant_2: pairMerchant,
              amount: fmtAmount(absAmount, false),
              date_1: tx.date,
              date_2: potentialPair.date,
            },
          },
          dollar_value: absAmount,
        });
        continue;
      }

      // B) Check for miscategorization
      const merchantLower = merchant.toLowerCase();
      const catLower = category.toLowerCase();

      if (
        (merchantLower.includes("paypal") || merchantLower.includes("e-transfer")) &&
        catLower.includes("loan")
      ) {
        flags.push({
          transaction_id: tx.transactionId,
          flag_type: "miscategory",
          message: `${merchant} ${fmtAmount(amount)} on ${tx.date} is categorized as "${category}" but PayPal/e-transfer transactions are rarely loan payments.`,
          suggested_action: {
            type: "recategorize",
            details: {
              transaction_id: tx.transactionId,
              current_category: category,
              suggested_category: "Transfer",
              reason: "PayPal/e-transfer transactions are rarely loan payments",
            },
          },
          dollar_value: absAmount,
        });
        continue;
      }

      // C) Check for spending anomaly (>2x merchant average)
      if (absAmount > 500) {
        const sameMerchantHistory = allTxs
          .filter((t) => {
            if (t.transactionId === tx.transactionId) return false;
            const name = (t.merchantName || t.name || "").toLowerCase();
            return name.includes(merchantLower.split(" ")[0]) && merchantLower.split(" ")[0].length > 3;
          })
          .slice(0, 10);

        if (sameMerchantHistory.length >= 2) {
          const avg =
            sameMerchantHistory.reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0) /
            sameMerchantHistory.length;
          if (absAmount > avg * 2 && avg > 10) {
            flags.push({
              transaction_id: tx.transactionId,
              flag_type: "anomaly",
              message: `${merchant} ${fmtAmount(amount)} on ${tx.date} is ${Math.round(absAmount / avg)}x your usual amount (avg: ${fmtAmount(avg, false)}).`,
              suggested_action: { type: "none", details: { average: avg, current: absAmount } },
              dollar_value: absAmount,
            });
          }
        }
      }
    }

    // Sort by dollar value, take top 5
    const topFlags = flags.sort((a, b) => b.dollar_value - a.dollar_value).slice(0, 5);

    // Insert flags into DB
    for (const flag of topFlags) {
      // Check if flag already exists for this transaction
      const existing = await pool.query(
        `SELECT id FROM teller_flags WHERE user_id = $1 AND transaction_id = $2 AND flag_type = $3 AND is_dismissed = false`,
        [userId, flag.transaction_id, flag.flag_type]
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
        ]
      );
    }

    if (topFlags.length > 0) {
      console.log(`[AI Teller] Generated ${topFlags.length} flags for user ${userId}`);
    }
  } catch (err) {
    console.error("[AI Teller] runTellerAnalysis error:", err);
  }
}
