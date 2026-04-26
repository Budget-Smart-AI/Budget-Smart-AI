/**
 * Cross-provider transfer-pair matcher — §6.3.2.
 *
 * Replaces the Plaid-only `detectTransferPairs` function that previously lived
 * in server/plaid.ts. That version only matched Plaid↔Plaid pairs and silently
 * left every Plaid↔MX, Plaid↔Manual, MX↔Manual, and MX↔MX transfer unpaired.
 *
 * Algorithm:
 *   1. Pull candidate rows from all 3 tx tables (plaid, mx, manual) where:
 *      - row is active (not soft-deleted)
 *      - row is not already flagged as a transfer
 *      - row has no transfer_pair_id yet
 *      - row's canonical_category_id is NOT a non-spending slug
 *        (skip rows the resolver already classified as transfer/payment)
 *   2. Group by absolute amount (rounded to 2 decimals).
 *   3. For each amount group, find debit/credit pairs where:
 *      - amounts match (already grouped)
 *      - signs are opposite (one debit, one credit)
 *      - accounts differ (same-account pairs are likely refunds — see §6.3.3)
 *      - dates within 2 days
 *   4. Greedy match: each row pairs at most once, in date order.
 *   5. Set is_transfer + transfer_pair_id (+ match_type, reconciled where the
 *      table has those columns) on both rows.
 *
 * Sign convention: amount > 0 means money OUT of the account (debit), amount < 0
 * means money IN (credit). This matches how every adapter normalizes provider
 * data — Plaid, MX, and manual all follow the same rule by construction.
 *
 * Out of scope:
 *   - Foreign-currency transfers where the credited amount differs from the
 *     debited amount due to FX. The strict |amount| match misses these.
 *     Could be added later by checking ±2-3% tolerance + iso_currency_code.
 *   - Multi-leg transfers where one leg is at an external bank we don't have
 *     visibility into. By design — we can only pair what we can see.
 *
 * Invocation: fire-and-forget after Plaid sync, MX sync, and manual-tx creation.
 * Idempotent — re-running on the same data finds zero new pairs because the
 * matcher's query filters out rows that already have a transfer_pair_id.
 */

import { pool } from "../db";
import { randomUUID } from "crypto";
import { isNonSpendingCanonical } from "./canonical-flags";

type TableName = "plaid_transactions" | "mx_transactions" | "manual_transactions";

interface CandidateRow {
  source_table: TableName;
  id: string;
  account_id: string; // generic account key (plaid_account_id | mx_account_id | account_id)
  date: string; // yyyy-MM-dd
  amount: string; // numeric stored as string
  display_name: string; // tx.name | description | merchant
  canonical_category_id: string | null;
}

/**
 * Find and link transfer pairs for the given user across all 3 tx tables.
 * Returns the number of pairs created.
 */
export async function matchTransferPairs(userId: string): Promise<number> {
  let pairsFound = 0;

  try {
    const result = await pool.query<CandidateRow>(
      `
      SELECT 'plaid_transactions'::text   AS source_table,
             t.id,
             t.plaid_account_id           AS account_id,
             t.date,
             t.amount,
             t.name                       AS display_name,
             t.canonical_category_id
        FROM plaid_transactions t
        JOIN plaid_accounts pa ON pa.id = t.plaid_account_id
        JOIN plaid_items pi   ON pi.id = pa.plaid_item_id
       WHERE pi.user_id = $1
         AND t.is_active = 'true'
         AND (t.is_transfer IS NULL OR t.is_transfer = false)
         AND t.transfer_pair_id IS NULL

      UNION ALL

      SELECT 'mx_transactions'::text      AS source_table,
             t.id,
             t.mx_account_id              AS account_id,
             t.date,
             t.amount,
             t.description                AS display_name,
             t.canonical_category_id
        FROM mx_transactions t
        JOIN mx_accounts ma ON ma.id = t.mx_account_id
        JOIN mx_members mm  ON mm.id = ma.mx_member_id
       WHERE mm.user_id = $1
         AND (t.is_transfer IS NULL OR t.is_transfer = 'false')
         AND t.transfer_pair_id IS NULL

      UNION ALL

      SELECT 'manual_transactions'::text  AS source_table,
             t.id,
             t.account_id,
             t.date,
             t.amount,
             t.merchant                   AS display_name,
             t.canonical_category_id
        FROM manual_transactions t
       WHERE t.user_id = $1
         AND (t.is_transfer IS NULL OR t.is_transfer = 'false')
         AND t.transfer_pair_id IS NULL

       ORDER BY date, ABS(amount::numeric)
      `,
      [userId],
    );

    // Group by absolute amount, skipping rows already classified as
    // non-spending (transfers / credit-card payments / debt payments) per
    // the canonical taxonomy. Those are already handled — pairing them
    // would just create cosmetic noise.
    const byAmount = new Map<string, CandidateRow[]>();
    for (const row of result.rows) {
      if (isNonSpendingCanonical(row.canonical_category_id)) continue;
      const absAmt = Math.abs(parseFloat(row.amount)).toFixed(2);
      if (absAmt === "0.00") continue; // skip zero-dollar rows
      let bucket = byAmount.get(absAmt);
      if (!bucket) {
        bucket = [];
        byAmount.set(absAmt, bucket);
      }
      bucket.push(row);
    }

    const usedIds = new Set<string>();

    for (const [, group] of byAmount) {
      if (group.length < 2) continue;

      // Sign convention: amount > 0 = debit (money out), < 0 = credit (money in).
      const debits = group.filter((r) => parseFloat(r.amount) > 0);
      const credits = group.filter((r) => parseFloat(r.amount) < 0);

      for (const debit of debits) {
        if (usedIds.has(debit.id)) continue;

        for (const credit of credits) {
          if (usedIds.has(credit.id)) continue;
          // Same account → likely a refund, not a transfer. Skip — §6.3.3
          // refund-matcher handles intra-account credit/debit pairs.
          if (debit.account_id === credit.account_id) continue;

          const debitDate = new Date(debit.date).getTime();
          const creditDate = new Date(credit.date).getTime();
          const daysDiff = Math.abs((debitDate - creditDate) / (1000 * 60 * 60 * 24));
          if (daysDiff > 2) continue;

          // Found a pair — link them.
          const pairId = randomUUID();
          await writeTransferPair(debit, pairId);
          await writeTransferPair(credit, pairId);

          usedIds.add(debit.id);
          usedIds.add(credit.id);
          pairsFound++;

          console.log(
            `[TransferPairMatcher] ${debit.source_table}:${debit.display_name} ` +
              `(${debit.amount}) ↔ ${credit.source_table}:${credit.display_name} ` +
              `(${credit.amount}) on ${debit.date}/${credit.date} — pair=${pairId}`,
          );
          break; // each debit pairs at most once
        }
      }
    }

    if (pairsFound > 0) {
      console.log(
        `[TransferPairMatcher] Found ${pairsFound} transfer pair(s) for user ${userId}`,
      );
    }
  } catch (err) {
    console.error(`[TransferPairMatcher] Error for user ${userId}:`, err);
  }

  return pairsFound;
}

/**
 * Write the transfer pair UUID and is_transfer flag onto a row. Each tx table
 * has slightly different column types and reconciliation columns, so we
 * branch by source table.
 */
async function writeTransferPair(row: CandidateRow, pairId: string): Promise<void> {
  if (row.source_table === "plaid_transactions") {
    await pool.query(
      `UPDATE plaid_transactions
          SET is_transfer = true,
              transfer_pair_id = $1::uuid,
              match_type = 'transfer',
              reconciled = 'true'
        WHERE id = $2`,
      [pairId, row.id],
    );
  } else if (row.source_table === "mx_transactions") {
    await pool.query(
      `UPDATE mx_transactions
          SET is_transfer = 'true',
              transfer_pair_id = $1::uuid,
              match_type = 'transfer',
              reconciled = 'true'
        WHERE id = $2`,
      [pairId, row.id],
    );
  } else {
    // manual_transactions has is_transfer (text) but no match_type/reconciled
    await pool.query(
      `UPDATE manual_transactions
          SET is_transfer = 'true',
              transfer_pair_id = $1::uuid
        WHERE id = $2`,
      [pairId, row.id],
    );
  }
}
