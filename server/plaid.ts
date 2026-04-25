import {
  Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode,
  DepositoryAccountSubtype, CreditAccountSubtype, LoanAccountSubtype, InvestmentAccountSubtype,
} from "plaid";
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
      "Plaid-Version": "2020-09-14", // Pin API version for stability
    },
  },
});

export const plaidClient = new PlaidApi(configuration);

export const PLAID_COUNTRY_CODES: CountryCode[] = [CountryCode.Ca];
export const PLAID_PRODUCTS: Products[] = [Products.Transactions, Products.Auth, Products.Liabilities];
export const PLAID_LANGUAGE = "en";

// Re-export Products enum and account subtypes for link token creation
export { Products, DepositoryAccountSubtype, CreditAccountSubtype, LoanAccountSubtype, InvestmentAccountSubtype };

/**
 * Account filters for Plaid Link — ensures ALL account types show up
 * including mortgage, LOC, investment, and loan accounts.
 * Without these filters, Plaid may only surface depository + credit.
 */
export const PLAID_ACCOUNT_FILTERS = {
  depository: {
    account_subtypes: [DepositoryAccountSubtype.All],
  },
  credit: {
    account_subtypes: [CreditAccountSubtype.All],
  },
  loan: {
    account_subtypes: [LoanAccountSubtype.All],
  },
  investment: {
    account_subtypes: [InvestmentAccountSubtype.All],
  },
};

/**
 * Map Plaid personal_finance_category to Budget Smart AI internal categories.
 *
 * Plaid provides two levels:
 *   - primary: e.g. "FOOD_AND_DRINK", "TRANSPORTATION"
 *   - detailed: e.g. "FOOD_AND_DRINK_GROCERIES", "TRANSPORTATION_GAS"
 *
 * We try the detailed category first for precision, then fall back to primary.
 * This eliminates the need for AI re-categorization — Plaid's ML is more accurate
 * for known merchants than our own classification.
 */
export function mapPlaidCategoryDetailed(detailed: string | null | undefined): string | null {
  if (!detailed) return null;
  const map: Record<string, string> = {
    // ── Food & Drink ─────────────────────────────────────────────────────
    FOOD_AND_DRINK_GROCERIES: "Groceries",
    FOOD_AND_DRINK_RESTAURANT: "Restaurant & Bars",
    FOOD_AND_DRINK_FAST_FOOD: "Restaurant & Bars",
    FOOD_AND_DRINK_COFFEE: "Restaurant & Bars",
    FOOD_AND_DRINK_BAR: "Restaurant & Bars",
    FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: "Restaurant & Bars",
    FOOD_AND_DRINK_FOOD_DELIVERY: "Restaurant & Bars",
    FOOD_AND_DRINK_OTHER: "Restaurant & Bars",
    FOOD_AND_DRINK_VENDING_MACHINES: "Restaurant & Bars",

    // ── Transportation ───────────────────────────────────────────────────
    TRANSPORTATION_GAS: "Transportation",
    TRANSPORTATION_PARKING: "Transportation",
    TRANSPORTATION_PUBLIC_TRANSIT: "Transportation",
    TRANSPORTATION_TAXIS_AND_RIDE_SHARES: "Transportation",
    TRANSPORTATION_TOLLS: "Transportation",
    TRANSPORTATION_CAR_INSURANCE: "Insurance",
    TRANSPORTATION_CAR_DEALER_AND_LEASING: "Transportation",
    TRANSPORTATION_OTHER: "Transportation",

    // ── Travel ───────────────────────────────────────────────────────────
    TRAVEL_FLIGHTS: "Travel",
    TRAVEL_LODGING: "Travel",
    TRAVEL_RENTAL_CARS: "Travel",
    TRAVEL_OTHER: "Travel",

    // ── Shopping / Merchandise ────────────────────────────────────────────
    GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: "Clothing",
    GENERAL_MERCHANDISE_DEPARTMENT_STORES: "Shopping",
    GENERAL_MERCHANDISE_DISCOUNT_STORES: "Shopping",
    GENERAL_MERCHANDISE_ELECTRONICS: "Shopping",
    GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: "Shopping",
    GENERAL_MERCHANDISE_OFFICE_SUPPLIES: "Shopping",
    GENERAL_MERCHANDISE_ONLINE_MARKETPLACES: "Shopping",
    GENERAL_MERCHANDISE_PET_SUPPLIES: "Shopping",
    GENERAL_MERCHANDISE_SPORTING_GOODS: "Shopping",
    GENERAL_MERCHANDISE_SUPERSTORES: "Shopping",
    GENERAL_MERCHANDISE_TOBACCO_AND_VAPE: "Shopping",
    GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS: "Shopping",
    GENERAL_MERCHANDISE_OTHER: "Shopping",

    // ── Rent & Utilities ─────────────────────────────────────────────────
    RENT_AND_UTILITIES_RENT: "Housing",
    RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: "Utilities",
    RENT_AND_UTILITIES_INTERNET_AND_CABLE: "Utilities",
    RENT_AND_UTILITIES_PHONE: "Utilities",
    RENT_AND_UTILITIES_WATER: "Utilities",
    RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: "Utilities",
    RENT_AND_UTILITIES_STORAGE: "Housing",
    RENT_AND_UTILITIES_OTHER: "Utilities",
    RENT_AND_UTILITIES_TELEPHONE: "Utilities",

    // ── Medical ──────────────────────────────────────────────────────────
    MEDICAL_DENTIST: "Healthcare",
    MEDICAL_EYE_CARE: "Healthcare",
    MEDICAL_HOSPITAL_AND_CLINICS: "Healthcare",
    MEDICAL_PHARMACIES_AND_SUPPLEMENTS: "Healthcare",
    MEDICAL_VETERINARY_SERVICES: "Healthcare",
    MEDICAL_OTHER: "Healthcare",

    // ── Personal Care ────────────────────────────────────────────────────
    PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: "Healthcare",
    PERSONAL_CARE_HAIR_AND_BEAUTY: "Personal",
    PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING: "Personal",
    PERSONAL_CARE_OTHER: "Personal",

    // ── Entertainment ────────────────────────────────────────────────────
    ENTERTAINMENT_CASINOS_AND_GAMBLING: "Entertainment",
    ENTERTAINMENT_MUSIC_AND_AUDIO: "Entertainment",
    ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS: "Entertainment",
    ENTERTAINMENT_TV_AND_MOVIES: "Entertainment",
    ENTERTAINMENT_VIDEO_GAMES: "Entertainment",
    ENTERTAINMENT_OTHER: "Entertainment",
    ENTERTAINMENT_AND_RECREATION: "Entertainment",

    // ── Home Improvement ─────────────────────────────────────────────────
    HOME_IMPROVEMENT_FURNITURE: "Maintenance",
    HOME_IMPROVEMENT_HARDWARE: "Maintenance",
    HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE: "Maintenance",
    HOME_IMPROVEMENT_SECURITY: "Maintenance",
    HOME_IMPROVEMENT_OTHER: "Maintenance",

    // ── Education ────────────────────────────────────────────────────────
    EDUCATION_TUITION_AND_FEES: "Education",
    EDUCATION_BOOKS_AND_SUPPLIES: "Education",
    EDUCATION_OTHER: "Education",

    // ── Loan Payments ────────────────────────────────────────────────────
    LOAN_PAYMENTS_CAR_PAYMENT: "Loans",
    LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: "Transfers",
    LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT: "Loans",
    LOAN_PAYMENTS_MORTGAGE_PAYMENT: "Housing",
    LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT: "Loans",
    LOAN_PAYMENTS_OTHER: "Loans",

    // ── Bank Fees ────────────────────────────────────────────────────────
    BANK_FEES_ATM_FEES: "Financial",
    BANK_FEES_FOREIGN_TRANSACTION_FEES: "Financial",
    BANK_FEES_INSUFFICIENT_FUNDS: "Financial",
    BANK_FEES_INTEREST_CHARGE: "Financial",
    BANK_FEES_OVERDRAFT_FEES: "Financial",
    BANK_FEES_OTHER: "Financial",

    // ── Income (PFC v2 expanded) ──────────────────────────────────────────
    INCOME_DIVIDENDS: "Income",
    INCOME_INTEREST_EARNED: "Income",
    INCOME_RETIREMENT_PENSION: "Income",
    INCOME_TAX_REFUND: "Income",
    INCOME_UNEMPLOYMENT: "Income",
    INCOME_WAGES: "Salary",
    INCOME_OTHER: "Income",
    // PFC v2 new income subcategories
    INCOME_BENEFITS: "Income",             // Government benefits (SSI, disability, etc.)
    INCOME_GIG_ECONOMY: "Income",          // Uber, DoorDash, freelance platforms
    INCOME_RENTAL_INCOME: "Income",        // Rental property income
    INCOME_CHILD_SUPPORT: "Income",        // Child support payments received
    INCOME_ALIMONY: "Income",              // Alimony payments received
    INCOME_MILITARY: "Salary",             // Military pay / VA benefits

    // ── Loan Disbursement (PFC v2 new) ──────────────────────────────────
    LOAN_DISBURSEMENT_PERSONAL_LOAN: "Transfers",
    LOAN_DISBURSEMENT_STUDENT_LOAN: "Transfers",
    LOAN_DISBURSEMENT_MORTGAGE: "Transfers",
    LOAN_DISBURSEMENT_AUTO_LOAN: "Transfers",
    LOAN_DISBURSEMENT_HOME_EQUITY: "Transfers",
    LOAN_DISBURSEMENT_OTHER: "Transfers",

    // ── Loan Repayment (PFC v2 expanded) ────────────────────────────────
    LOAN_REPAYMENT_HOME_EQUITY_LOAN: "Housing",
    LOAN_REPAYMENT_BUY_NOW_PAY_LATER: "Loans",
    LOAN_REPAYMENT_COLLECTIONS: "Loans",

    // ── Bank Fees (PFC v2 expanded) ─────────────────────────────────────
    BANK_FEES_WIRE_TRANSFER_FEE: "Financial",
    BANK_FEES_ACCOUNT_MAINTENANCE: "Financial",

    // ── Transfers ────────────────────────────────────────────────────────
    TRANSFER_IN_ACCOUNT_TRANSFER: "Transfers",
    TRANSFER_IN_CASH_ADVANCES_AND_LOANS: "Transfers",
    TRANSFER_IN_DEPOSIT: "Transfers",
    TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS: "Transfers",
    TRANSFER_IN_SAVINGS: "Transfers",
    TRANSFER_IN_OTHER: "Transfers",
    TRANSFER_OUT_ACCOUNT_TRANSFER: "Transfers",
    TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS: "Transfers",
    TRANSFER_OUT_SAVINGS: "Transfers",
    TRANSFER_OUT_WITHDRAWAL: "Transfers",
    TRANSFER_OUT_OTHER: "Transfers",

    // ── Government ───────────────────────────────────────────────────────
    GOVERNMENT_AND_NON_PROFIT_DONATIONS: "Other",
    GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES: "Other",
    GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: "Financial",
    GOVERNMENT_AND_NON_PROFIT_OTHER: "Other",

    // ── General Services ─────────────────────────────────────────────────
    GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING: "Financial",
    GENERAL_SERVICES_AUTOMOTIVE: "Transportation",
    GENERAL_SERVICES_CHILDCARE: "Education",
    GENERAL_SERVICES_CONSULTING_AND_LEGAL: "Other",
    GENERAL_SERVICES_INSURANCE: "Insurance",
    GENERAL_SERVICES_POSTAGE_AND_SHIPPING: "Other",
    GENERAL_SERVICES_STORAGE: "Housing",
    GENERAL_SERVICES_OTHER: "Other",
  };
  return map[detailed] ?? null;
}

export function mapPlaidCategory(plaidPrimary: string | null | undefined): string | null {
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
    RENT_AND_UTILITIES: "Utilities",
    LOAN_PAYMENTS: "Loans",
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

  // PFC icon for UI display (v2+)
  const pfcIconUrl = tx.personal_finance_category?.icon_url || null;

  // Counterparty enrichment (Plaid returns an array, primary is index 0)
  const counterparty = tx.counterparties?.[0] || null;

  // Logo: prefer counterparties[0].logo_url (Plaid enriched), fall back to tx.logo_url
  const logoUrl = counterparty?.logo_url || tx.logo_url || null;

  // Merchant entity ID for stable cross-transaction merchant linking
  const merchantEntityId = counterparty?.entity_id || null;

  // Counterparty name, type, website — PFC v2 adds INCOME_SOURCE type for employers
  const counterpartyName = counterparty?.name || null;
  const counterpartyType = counterparty?.type || null; // MERCHANT | FINANCIAL_INSTITUTION | PAYMENT_PROCESSOR | MARKETPLACE | INCOME_SOURCE
  const counterpartyWebsite = counterparty?.website || null;

  // Payment channel: online | in store | other
  const paymentChannel = tx.payment_channel || null;

  // Map Plaid category to our internal category system
  // Try detailed category first (more accurate), then fall back to primary
  const mappedCategory = mapPlaidCategoryDetailed(pfcDetailed) || mapPlaidCategory(pfcPrimary);

  // Auto-reconcile threshold based on Plaid confidence:
  // VERY_HIGH / HIGH → auto-reconcile (reconciled = "true")
  // LOW / null → leave for user review
  const autoReconciled = (pfcConfidence === "VERY_HIGH" || pfcConfidence === "HIGH") ? "true" : "false";

  const existing = await storage.getPlaidTransactionByTransactionId(tx.transaction_id);

  if (existing) {
    // Update existing transaction — preserve enrichment fields.
    // §6.2.7-prep Phase C: pass existing canonicalCategoryId through so the
    // dual-write branch in updatePlaidTransaction does NOT re-resolve from
    // pfcPrimary on every sync. COALESCE semantics — sync-driven updates
    // never overwrite a user-corrected or AI-Teller-corrected canonical.
    await storage.updatePlaidTransaction(existing.id, {
      amount: tx.amount.toString(),
      date: tx.date,
      name: tx.name,
      merchantName: tx.merchant_name || null,
      logoUrl: logoUrl,
      canonicalCategoryId: existing.canonicalCategoryId ?? null,
      pending: tx.pending ? "true" : "false",
      isActive: "true",
      // Enrichment fields
      personalFinanceCategoryDetailed: pfcDetailed,
      personalFinanceCategoryConfidence: pfcConfidence,
      paymentChannel: paymentChannel,
      merchantEntityId: merchantEntityId,
      // PFC v2 + counterparty fields
      personalFinanceCategoryIconUrl: pfcIconUrl,
      counterpartyName: counterpartyName,
      counterpartyType: counterpartyType,
      counterpartyWebsite: counterpartyWebsite,
    } as any);
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
      // PFC v2 + counterparty fields
      personalFinanceCategoryIconUrl: pfcIconUrl,
      counterpartyName: counterpartyName,
      counterpartyType: counterpartyType,
      counterpartyWebsite: counterpartyWebsite,
      canonicalCategoryId: "uncategorized",
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
 * One-time backfill: calls Plaid /transactions/enrich on all existing
 * plaid_transactions rows that are missing merchant_name, in batches of 100.
 *
 * Plaid /transactions/enrich accepts up to 100 transactions per call and
 * returns enriched merchant_name, logo_url, website, personal_finance_category,
 * payment_channel, and counterparties for each transaction.
 *
 * Returns the total number of transactions updated.
 */
export async function backfillPlaidEnrichment(
  accessToken: string,
  userId: string
): Promise<{ processed: number; updated: number; errors: number }> {
  let processed = 0;
  let updated = 0;
  let errors = 0;

  try {
    // Fetch all plaid_transactions for this user that are missing merchant_name
    const { rows } = await pool.query(`
      SELECT
        t.id,
        t.transaction_id,
        t.name,
        t.amount,
        t.date
      FROM plaid_transactions t
      JOIN plaid_accounts pa ON pa.id = t.plaid_account_id
      JOIN plaid_items pi ON pi.id = pa.plaid_item_id
      WHERE pi.user_id = $1
        AND t.is_active = 'true'
        AND (t.merchant_name IS NULL OR t.merchant_name = '')
      ORDER BY t.date DESC
    `, [userId]);

    console.log(`[Plaid Enrich Backfill] Found ${rows.length} transactions missing merchant_name for user ${userId}`);

    // Process in batches of 100 (Plaid API limit)
    const BATCH_SIZE = 100;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      try {
        const enrichPayload = batch.map((tx: any) => ({
          id: tx.transaction_id,
          description: tx.name,
          amount: Math.abs(parseFloat(tx.amount)),
          direction: parseFloat(tx.amount) > 0 ? "OUTFLOW" : "INFLOW",
          iso_currency_code: "CAD",
        }));

        const enrichResponse = await plaidClient.transactionsEnrich({
          account_type: "depository",
          transactions: enrichPayload,
        } as any);

        const enriched: any[] = enrichResponse.data.enriched_transactions || [];
        processed += batch.length;

        for (const enrichedTx of enriched) {
          // Find the matching DB row by transaction_id
          const dbRow = batch.find((r: any) => r.transaction_id === enrichedTx.id);
          if (!dbRow) continue;

          const merchantName = enrichedTx.merchant_name || null;
          const logoUrl = enrichedTx.counterparties?.[0]?.logo_url || enrichedTx.logo_url || null;
          const merchantEntityId = enrichedTx.counterparties?.[0]?.entity_id || null;
          const paymentChannel = enrichedTx.payment_channel || null;
          const pfcPrimary = enrichedTx.personal_finance_category?.primary || null;
          const pfcDetailed = enrichedTx.personal_finance_category?.detailed || null;
          const pfcConfidence = enrichedTx.personal_finance_category?.confidence_level || null;
          const website = enrichedTx.website || null;

          if (!merchantName && !logoUrl && !pfcPrimary) continue; // Nothing to update

          await pool.query(`
            UPDATE plaid_transactions SET
              merchant_name = COALESCE($1, merchant_name),
              logo_url = COALESCE($2, logo_url),
              merchant_entity_id = COALESCE($3, merchant_entity_id),
              payment_channel = COALESCE($4, payment_channel),
              personal_finance_category_detailed = COALESCE($5, personal_finance_category_detailed),
              personal_finance_category_confidence = COALESCE($6, personal_finance_category_confidence)
            WHERE id = $7
          `, [merchantName, logoUrl, merchantEntityId, paymentChannel, pfcDetailed, pfcConfidence, dbRow.id]);

          updated++;
        }

        console.log(`[Plaid Enrich Backfill] Batch ${Math.floor(i / BATCH_SIZE) + 1}: processed ${batch.length}, updated ${enriched.length}`);

        // Rate limit: 100ms between batches
        if (i + BATCH_SIZE < rows.length) {
          await new Promise(r => setTimeout(r, 100));
        }
      } catch (batchErr: any) {
        errors += batch.length;
        console.error(`[Plaid Enrich Backfill] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, batchErr?.response?.data || batchErr?.message);
      }
    }

    console.log(`[Plaid Enrich Backfill] Complete for user ${userId}: processed=${processed}, updated=${updated}, errors=${errors}`);
  } catch (err) {
    console.error(`[Plaid Enrich Backfill] Fatal error for user ${userId}:`, err);
    throw err;
  }

  return { processed, updated, errors };
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
            personal_finance_category_version: "v2" as any, // PFC v2: adds income, loan, fee subcategories
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
