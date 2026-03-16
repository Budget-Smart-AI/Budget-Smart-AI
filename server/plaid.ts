import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { plaidItems, plaidTransactions } from "@shared/schema";
import { storage } from "./storage";
import { reconcileTransaction } from "./reconciliation";
import { autoReconcile } from "./lib/auto-reconciler";

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
  // Check if a sync is already in progress for this item. Both
  // HISTORICAL_UPDATE and SYNC_UPDATES_AVAILABLE webhooks fire nearly
  // simultaneously; without this lock they both attempt to sync with the
  // same cursor and corrupt each other's state.
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

  // ── FIX 5: Log sync start with cursor state ───────────────────────────────
  console.log(`[Plaid Sync] ─────────────────────────────────────────────`);
  console.log(`[Plaid Sync] Starting sync for item ${itemId}`);
  console.log(`[Plaid Sync]   cursor: ${cursor ? 'has cursor (incremental)' : 'null (full history from start)'}`);

  let pageNumber = 0;

  try {
    while (hasMore) {
      pageNumber++;
      let data: any;

      // ── FIX 5: Log each page fetch ────────────────────────────────────────
      console.log(`[Plaid Sync] Fetching page ${pageNumber} — cursor: ${cursor ? 'has cursor' : 'null (start)'}`);

      try {
        // ── BUG 1 FIX: days_requested removed ──────────────────────────────
        // days_requested is NOT a valid parameter for /transactions/sync.
        // It only exists on the legacy /transactions/get endpoint.
        // Sending it causes Plaid to return HTTP 400.
        // /transactions/sync automatically returns all available history on
        // the first call (when cursor is undefined/null) — no parameter needed.
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
        // ── BUG 2a FIX: stale cursor reset ─────────────────────────────────
        // If Plaid returns 400, the cursor stored in the DB is stale/invalid
        // (e.g. from a previous failed sync). Clear it and retry once from
        // the beginning (null cursor = full history sync).
        const status = err?.response?.status;
        const errorCode = err?.response?.data?.error_code;

        console.error(`[Plaid Sync] transactionsSync failed: HTTP ${status} — ${errorCode}`);

        if (status === 400 && cursor !== undefined) {
          console.log(`[Plaid Sync] Invalid cursor detected for item ${itemId} — resetting to null and retrying from beginning`);

          // Clear the bad cursor in DB so future syncs also start fresh
          await db
            .update(plaidItems)
            .set({ syncCursor: null })
            .where(eq(plaidItems.id, itemId));

          // Retry once with null cursor (full sync from start)
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
          // Not a cursor issue — re-throw so the outer catch handles it
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

      // ── BUG 2a FIX: cursor saved only after successful page ─────────────
      // Previously the cursor was saved inside the loop before we knew if
      // the next page would succeed. Now we only persist it after a page
      // completes successfully, so a crash mid-sync leaves the cursor at
      // the last known-good position rather than a partial/invalid state.
      cursor = data.next_cursor;
      hasMore = data.has_more;

      await db
        .update(plaidItems)
        .set({ syncCursor: cursor })
        .where(eq(plaidItems.id, itemId));
    }

    console.log(`[Plaid Sync] Complete for item ${itemId}: +${addedCount} added, ${modifiedCount} modified, ${removedCount} removed`);

    // Auto-reconcile after every sync — fire-and-forget (don't block the response)
    autoReconcile(userId).catch((err) =>
      console.error("[syncTransactions] autoReconcile failed:", err)
    );

    return { added: addedCount, modified: modifiedCount, removed: removedCount };
  } catch (error) {
    console.error(`[Plaid Sync] Error syncing item ${itemId}:`, error);
    throw error;
  } finally {
    // ── BUG 2b FIX: always release the sync lock ────────────────────────
    // Whether the sync succeeded or threw, clear isSyncing so the next
    // webhook can trigger a fresh sync. Without this finally block, a
    // crashed sync would permanently lock the item.
    await db
      .update(plaidItems)
      .set({ isSyncing: false })
      .where(eq(plaidItems.id, itemId))
      .catch((err) =>
        console.error(`[Plaid Sync] Failed to release sync lock for item ${itemId}:`, err)
      );
  }
}
