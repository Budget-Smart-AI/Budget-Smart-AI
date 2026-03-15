import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { plaidItems, plaidTransactions } from "@shared/schema";
import { storage } from "./storage";
import { reconcileTransaction } from "./reconciliation";

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
 * Upsert a single Plaid transaction into the database.
 * Creates the transaction if it doesn't exist, updates it if it does.
 * Runs reconciliation to match against bills, expenses, and income.
 */
async function upsertTransaction(
  userId: string,
  itemId: string,
  tx: any
): Promise<void> {
  const account = await storage.getPlaidAccountByAccountId(tx.account_id);
  if (!account) {
    console.warn(`[syncTransactions] No account found for account_id=${tx.account_id}, skipping`);
    return;
  }

  const plaidCategory = tx.personal_finance_category?.primary || null;
  const logoUrl = tx.counterparties?.[0]?.logo_url || tx.logo_url || null;

  const existing = await storage.getPlaidTransactionByTransactionId(tx.transaction_id);

  if (existing) {
    // Update existing transaction
    await storage.updatePlaidTransaction(existing.id, {
      amount: tx.amount.toString(),
      date: tx.date,
      name: tx.name,
      merchantName: tx.merchant_name || null,
      logoUrl: logoUrl,
      category: plaidCategory,
      pending: tx.pending ? "true" : "false",
      isActive: "true",
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
      category: plaidCategory,
    };

    const matchResult = reconcileTransaction(txData, bills, expensesList, incomes);

    await storage.createPlaidTransaction({
      plaidAccountId: account.id,
      transactionId: tx.transaction_id,
      amount: tx.amount.toString(),
      date: tx.date,
      name: tx.name,
      merchantName: tx.merchant_name || null,
      logoUrl: logoUrl,
      category: plaidCategory,
      personalCategory: matchResult.personalCategory,
      pending: tx.pending ? "true" : "false",
      matchType: matchResult.matchType,
      matchedBillId: matchResult.matchType === "bill" ? matchResult.matchedId || null : null,
      matchedExpenseId: matchResult.matchType === "expense" ? matchResult.matchedId || null : null,
      matchedIncomeId: matchResult.matchType === "income" ? matchResult.matchedId || null : null,
      reconciled: matchResult.confidence === "high" ? "true" : "false",
      needsReview: flagNeedsReview && (!plaidCategory || plaidCategory === "Uncategorized") ? true : false,
    });
  }
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
 * The cursor is stored in plaid_items.sync_cursor and updated after each page.
 * REMOVED transactions are soft-deleted by setting isActive = false.
 */
export async function syncTransactions(
  accessToken: string,
  itemId: string,
  userId: string
): Promise<{ added: number; modified: number; removed: number }> {
  const item = await db.query.plaidItems.findFirst({
    where: eq(plaidItems.id, itemId),
  });

  let cursor = item?.syncCursor || undefined;
  let hasMore = true;
  let addedCount = 0;
  let modifiedCount = 0;
  let removedCount = 0;

  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor: cursor,
      options: {
        include_personal_finance_category: true,
        include_logo_and_counterparty_beta: true,
        days_requested: 730,
      },
    });

    const data = response.data;

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

    // Persist cursor after each page so progress is not lost on error
    await db
      .update(plaidItems)
      .set({ syncCursor: cursor })
      .where(eq(plaidItems.id, itemId));
  }

  return { added: addedCount, modified: modifiedCount, removed: removedCount };
}
