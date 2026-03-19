import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";
import { eq, and, sql } from "drizzle-orm";
import { db } from "./db";
import { pool } from "./db";
import { plaidItems, plaidTransactions } from "@shared/schema";
import { storage } from "./storage";
import { reconcileTransaction } from "./reconciliation";
import { autoReconcile } from "./lib/auto-reconciler";
import { randomUUID } from "crypto";

const configuration = new Configuration({
  basePath: PlaidEnvironments.production,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);

export const PLAID_COUNTRY_CODES: CountryCode[] = [CountryCode.Ca];
export const PLAID_PRODUCTS: Products[] = [Products.Transactions, Products.Auth, Products.Liabilities];
export const PLAID_LANGUAGE = "en";

// Re-export Products enum for filtering
export { Products };

/**
 * Map Plaid personal_finance_category.primary to Budget Smart AI category.
 * Plaid returns values like "FOOD_AND_DRINK", "TRANSPORTATION", etc.
 */
function mapPlaidCategory(plaidPrimary: string | null | undefined): string | null {
  if (!plaidPrimary) return null;
  const map: Record<string, string> = {
    FOOD_AND_DRINK: "Restaurant & Bars",
    GROCERIES: "Groceries",
    TRANSPORTATION: "Transportation",
    TRAVEL: "Travel",
    ENTERTAINMENT: "Entertainment",
    GENERAL_MERCHANDISE: "Shopping",
    CLOTHING_AND_ACCESSORIES: "Clothing",
    HOME_IMPROVEMENT: "Maintenance",
    MEDICAL: "Healthcare",
    PERSONAL_CARE: "Personal",
    EDUCATION: "Education",
    RENT_AND_UTILITIES: "Housing",
    LOAN_PAYMENTS: "Credit Card",
    BANK_FEES: "Financial",
    GOVERNMENT_AND_NON_PROFIT: "Other",
    INCOME: "Income",
    TRANSFER_IN: "Transfers",
    TRANSFER_OUT: "Transfers",
    GENERAL_SERVICES: "Other",
    ENTERTAINMENT_AND_RECREATION: "Entertainment",
  };
  return map[plaidPrimary] ?? "Other";
}

/**
 * Upsert a single Plaid transaction into the database.
 * Stores all enrichment fields returned by Plaid's /transactions/sync endpoint
 * when include_personal_finance_category=true and include_logo_and_counterparty_beta=true.
 */
async function upsertTransaction(userId: string, itemId: string, tx: any): Promise<void> {
  const account = await storage.getPlaidAccountByAccountId(tx.account_id);
  if (!account) {
    console.warn(`[syncTransactions] No account found for account_id=${tx.account_id}, skipping`);
    return;
  }

  // ── Plaid Enrichment Fields ──────────────────────────────────────────────
  // Plaid returns enrichment inline when include_personal_finance_category=true
  // and include_logo_and_counterparty_beta=true are set on the sync request.
  const pfcPrimary = tx.personal_finance_category?.primary || null;
  const pfcDetailed = tx.personal_finance_category?.detailed || null;
  const pfcConfidence = tx.personal_finance_category?.confidence_level || null; // VERY_HIGH | HIGH | LOW

  // Logo: prefer counterparties[0].logo_url (Plaid enriched), fall back to tx.logo_url
  const logoUrl = tx.counterparties?.[0]?.logo_url || tx.logo_url || null;

  // Merchant entity ID for stable cross-transaction merchant linking
  const merchantEntityId = tx.counterparties?.[0]?.entity_id || null;

  // Payment channel: online | in store | other
  const paymentChannel = tx.payment_channel || null;

  // Map Plaid category to our internal category system
  const mappedCategory = mapPlaidCategory(pfcPrimary);

  // Auto-reconcile threshold based on Plaid confidence:
  // VERY_HIGH / HIGH → auto-reconcile (reconciled = "true")
  // LOW / null → leave for user review
  const autoReconciled = (pfcConfidence === "VERY_HIGH" || pfcConfidence === "HIGH") ? "true" : "false";

  const existing = await storage.getPlaidTransactionByTransactionId(tx.transaction_id);

  if (existing) {
    // Update existing transaction — preserve enrichment fields
    await storage.updatePlaidTransaction(existing.id, {
      amount: tx.amount.toString(),
      date: tx.date,
      name: tx.name,
      merchantName: tx.merchant_name || null,
      logoUrl: logoUrl,
      category: pfcPrimary,
      personalCategory: mappedCategory,
      pending: tx.pending ? "true" : "false",
      isActive: "true",
      // Enrichment fields
      personalFinanceCategoryDetailed: pfcDetailed,
      personalFinanceCategoryConfidence: pfcConfidence,
      paymentChannel: paymentChannel,
      merchantEntityId: merchantEntityId,
    });
  } else {
    // Fetch reconciliation context
    const bills = await storage.getBills(userId);
    const expensesList = await storage.getExpenses(userId);
    const incomes = await storage.getIncomes(userId);
    const currentUser = await storage.getUser(userId);
    const flagNeedsReview = currentUser?.prefNeedsReview !== false;

    const txData = {
      amount: tx.amount.toString(),
      date: tx.date,
      name: tx.name,
      merchantName: tx.merchant_name || null,
      category: pfcPrimary,
    };

    const matchResult = reconcileTransaction(txData, bills, expensesList, incomes);

    // Use Plaid confidence to override reconciliation status
    const finalReconciled = autoReconciled === "true"
      ? "true"
      : matchResult.confidence === "high" ? "true" : "false";

    await storage.createPlaidTransaction({
      plaidAccountId: account.id,
      transactionId: tx.transaction_id,
      amount: tx.amount.toString(),
      date: tx.date,
      name: tx.name,
      merchantName: tx.merchant_name || null,
      logoUrl: logoUrl,
      category: pfcPrimary,
      personalCategory: matchResult.personalCategory || mappedCategory,
      pending: tx.pending ? "true" : "false",
      matchType: matchResult.matchType,
      matchedBillId: matchResult.matchType === "bill" ? matchResult.matchedId || null : null,
      matchedExpenseId: matchResult.matchType === "expense" ? matchResult.matchedId || null : null,
      matchedIncomeId: matchResult.matchType === "income" ? matchResult.matchedId || null : null,
      reconciled: finalReconciled,
      needsReview: flagNeedsReview && (!pfcPrimary || pfcPrimary === "Uncategorized") ? true : false,
      // Plaid enrichment fields
      personalFinanceCategoryDetailed: pfcDetailed,
      personalFinanceCategoryConfidence: pfcConfidence,
      paymentChannel: paymentChannel,
      merchantEntityId: merchantEntityId,
    });
  }
}

/**
 * Detect transfer pairs after a sync batch.
 *
 * Finds pairs of transactions where:
 * - Same absolute amount
 * - Within 2 days of each other
 * - One positive (debit), one negative (credit)
 * - Across different accounts (same user)
 *
 * Marks both as is_transfer=true, matchType="transfer", and links them
 * via a shared transfer_pair_id UUID.
 */
async function detectTransferPairs(userId: string): Promise<number> {
  let pairsFound = 0;

  try {
    // Find candidate transactions: unmatched, not already flagged as transfers,
    // belonging to this user's Plaid accounts
    const result = await pool.query(`
      SELECT
        t.id,
        t.transaction_id,
        t.amount,
        t.date,
        t.plaid_account_id,
        t.name
      FROM plaid_transactions t
      JOIN plaid_accounts pa ON pa.id = t.plaid_account_id
      JOIN plaid_items pi ON pi.id = pa.plaid_item_id
      WHERE pi.user_id = $1
        AND t.is_active = 'true'
        AND (t.is_transfer IS NULL OR t.is_transfer = false)
        AND (t.match_type IS NULL OR t.match_type = 'unmatched')
      ORDER BY t.date, ABS(t.amount::numeric)
    `, [userId]);

    const txs = result.rows;

    // Build a map: amount → list of transactions with that absolute amount
    const byAmount = new Map<string, typeof txs>();
    for (const tx of txs) {
      const absAmt = Math.abs(parseFloat(tx.amount)).toFixed(2);
      if (!byAmount.has(absAmt)) byAmount.set(absAmt, []);
      byAmount.get(absAmt)!.push(tx);
    }

    // For each amount group, find debit/credit pairs within 2 days across different accounts
    for (const [, group] of byAmount) {
      if (group.length < 2) continue;

      const debits = group.filter(t => parseFloat(t.amount) > 0);  // money out
      const credits = group.filter(t => parseFloat(t.amount) < 0); // money in

      for (const debit of debits) {
        for (const credit of credits) {
          // Must be different accounts
          if (debit.plaid_account_id === credit.plaid_account_id) continue;

          // Must be within 2 days of each other
          const debitDate = new Date(debit.date);
          const creditDate = new Date(credit.date);
          const daysDiff = Math.abs((debitDate.getTime() - creditDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDiff > 2) continue;

          // Found a transfer pair — link them
          const pairId = randomUUID();
          await pool.query(`
            UPDATE plaid_transactions
            SET is_transfer = true,
                transfer_pair_id = $1::uuid,
                match_type = 'transfer',
                reconciled = 'true'
            WHERE id = ANY($2::text[])
          `, [pairId, [debit.id, credit.id]]);

          console.log(`[Transfer Detection] Paired: ${debit.name} (${debit.amount}) ↔ ${credit.name} (${credit.amount}) on ${debit.date}/${credit.date} — pairId: ${pairId}`);
          pairsFound++;

          // Mark these as processed so we don't double-pair them
          debit.is_transfer = true;
          credit.is_transfer = true;
          break; // Only pair each debit once
        }
      }
    }

    if (pairsFound > 0) {
      console.log(`[Transfer Detection] Found ${pairsFound} transfer pair(s) for user ${userId}`);
    }
  } catch (err) {
    console.error(`[Transfer Detection] Error for user ${userId}:`, err);
  }

  return pairsFound;
}

/**
 * Sync transactions for a Plaid item using the /transactions/sync endpoint.
 *
 * Key advantages over the legacy /transactions/get:
 * - Never returns PRODUCT_NOT_READY — returns empty list if not ready yet
 * - Fires TRANSACTIONS_REMOVED webhook when data is ready
 * - Uses a cursor for incremental updates (only fetches new/changed/removed)
 * - Handles ADDED, MODIFIED, and REMOVED transactions
 *
 * The cursor is stored in plaid_items.sync_cursor and updated after each
 * successful page. If a 400 error occurs (stale/invalid cursor), the cursor
 * is cleared and the sync retries from the beginning (null cursor).
 *
 * An isSyncing lock prevents duplicate concurrent syncs triggered by
 * simultaneous webhooks (HISTORICAL_UPDATE + SYNC_UPDATES_AVAILABLE race).
 */
export async function syncTransactions(
  accessToken: string,
  itemId: string,
  userId: string
): Promise<{ added: number; modified: number; removed: number }> {
  // ── RACE CONDITION GUARD ──────────────────────────────────────────────────
  const item = await db.query.plaidItems.findFirst({
    where: eq(plaidItems.id, itemId),
  });

  if (item?.isSyncing) {
    console.log(`[Plaid Sync] Sync already in progress for item ${itemId} — skipping duplicate webhook`);
    return { added: 0, modified: 0, removed: 0 };
  }

  // Acquire the sync lock
  await db
    .update(plaidItems)
    .set({ isSyncing: true })
    .where(eq(plaidItems.id, itemId));

  let cursor: string | undefined = item?.syncCursor || undefined;
  let hasMore = true;
  let addedCount = 0;
  let modifiedCount = 0;
  let removedCount = 0;

  console.log(`[Plaid Sync] ─────────────────────────────────────────────`);
  console.log(`[Plaid Sync] Starting sync for item ${itemId}`);
  console.log(`[Plaid Sync]   cursor: ${cursor ? 'has cursor (incremental)' : 'null (full history from start)'}`);

  let pageNumber = 0;

  try {
    while (hasMore) {
      pageNumber++;
      let data: any;

      console.log(`[Plaid Sync] Fetching page ${pageNumber} — cursor: ${cursor ? 'has cursor' : 'null (start)'}`);

      try {
        const response = await plaidClient.transactionsSync({
          access_token: accessToken,
          cursor: cursor,
          options: {
            include_personal_finance_category: true,
            include_logo_and_counterparty_beta: true,
          },
        });
        data = response.data;
      } catch (err: any) {
        const status = err?.response?.status;
        const errorCode = err?.response?.data?.error_code;

        console.error(`[Plaid Sync] transactionsSync failed: HTTP ${status} — ${errorCode}`);

        if (status === 400 && cursor !== undefined) {
          console.log(`[Plaid Sync] Invalid cursor detected for item ${itemId} — resetting to null and retrying from beginning`);

          await db
            .update(plaidItems)
            .set({ syncCursor: null })
            .where(eq(plaidItems.id, itemId));

          cursor = undefined;
          const retryResponse = await plaidClient.transactionsSync({
            access_token: accessToken,
            cursor: undefined,
            options: {
              include_personal_finance_category: true,
              include_logo_and_counterparty_beta: true,
            },
          });
          data = retryResponse.data;
        } else {
          throw err;
        }
      }

      for (const transaction of data.added) {
        await upsertTransaction(userId, itemId, transaction);
        addedCount++;
      }

      for (const transaction of data.modified) {
        await upsertTransaction(userId, itemId, transaction);
        modifiedCount++;
      }

      for (const removed of data.removed) {
        await db
          .update(plaidTransactions)
          .set({ isActive: "false" })
          .where(eq(plaidTransactions.transactionId, removed.transaction_id));
        removedCount++;
      }

      cursor = data.next_cursor;
      hasMore = data.has_more;

      await db
        .update(plaidItems)
        .set({ syncCursor: cursor })
        .where(eq(plaidItems.id, itemId));
    }

    console.log(`[Plaid Sync] Complete for item ${itemId}: +${addedCount} added, ${modifiedCount} modified, ${removedCount} removed`);

    // Run transfer detection after sync if any transactions were added/modified
    if (addedCount > 0 || modifiedCount > 0) {
      detectTransferPairs(userId).catch((err) =>
        console.error("[syncTransactions] detectTransferPairs failed:", err)
      );
    }

    // Auto-reconcile after every sync — fire-and-forget
    autoReconcile(userId).catch((err) =>
      console.error("[syncTransactions] autoReconcile failed:", err)
    );

    return { added: addedCount, modified: modifiedCount, removed: removedCount };
  } catch (error) {
    console.error(`[Plaid Sync] Error syncing item ${itemId}:`, error);
    throw error;
  } finally {
    await db
      .update(plaidItems)
      .set({ isSyncing: false })
      .where(eq(plaidItems.id, itemId))
      .catch((err) =>
        console.error(`[Plaid Sync] Failed to release sync lock for item ${itemId}:`, err)
      );
  }
}
