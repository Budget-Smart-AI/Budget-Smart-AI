/**
 * Refund-to-charge matcher — §6.3.3.
 *
 * Links refund credits back to their original charge debits so that net
 * spending totals reflect "what you actually kept" rather than counting the
 * full charge AND ignoring the refund (or worse, counting the refund as
 * income).
 *
 * Algorithm (per provider table, per user):
 *   1. Find unlinked credits — amount < 0, refund_of_transaction_id IS NULL,
 *      not flagged as a transfer (transfers go through the transfer-pair
 *      matcher in §6.3.2), not classified as a non-spending slug.
 *   2. For each candidate refund, find the most recent prior debit on the
 *      SAME account where:
 *        - merchant matches (case-insensitive equality on the row's display
 *          name; uses the enriched merchant_clean_name when available)
 *        - debit amount >= |refund amount| (partial refunds allowed)
 *        - debit date <= refund date AND refund date - debit date <= 90 days
 *        - debit is not already refund-linked elsewhere (avoid double-linking
 *          the same charge to multiple refunds; pick the largest matching
 *          debit so a partial refund hits the original full charge first)
 *   3. Set refund_of_transaction_id on the refund row pointing to the
 *      matched debit's id.
 *
 * Why intra-table only:
 *   Refunds always come from the same provider as the original charge — Plaid
 *   doesn't report a refund for a charge that exists only as a manual entry,
 *   and vice-versa. The matcher therefore queries each table independently.
 *   Cross-table refunds (rare) can be linked manually by the user.
 *
 * Sign convention: amount > 0 = debit (money out, the original charge),
 * amount < 0 = credit (money in, the refund).
 *
 * Invocation: fire-and-forget after Plaid sync, MX sync, and manual-tx
 * creation. Idempotent — re-running won't relink rows that already have
 * refund_of_transaction_id set.
 */

import { pool } from "../db";
import { isNonSpendingCanonical } from "./canonical-flags";

type Provider = "plaid" | "mx" | "manual";

interface ProviderConfig {
  table: string;
  accountIdCol: string;
  merchantExpr: string; // SQL expression resolving to the display merchant name
  // SQL fragment that joins this table to the user's row scope
  userScopeJoin: string;
  userScopeWhere: string;
  isTransferIsFalseExpr: string; // each table types is_transfer differently
}

const CONFIGS: Record<Provider, ProviderConfig> = {
  plaid: {
    table: "plaid_transactions",
    accountIdCol: "plaid_account_id",
    merchantExpr: "COALESCE(t.merchant_clean_name, t.merchant_name, t.name)",
    userScopeJoin:
      "JOIN plaid_accounts pa ON pa.id = t.plaid_account_id JOIN plaid_items pi ON pi.id = pa.plaid_item_id",
    userScopeWhere: "pi.user_id = $1",
    // plaid_transactions.is_transfer is a real boolean
    isTransferIsFalseExpr: "(t.is_transfer IS NULL OR t.is_transfer = false)",
  },
  mx: {
    table: "mx_transactions",
    accountIdCol: "mx_account_id",
    merchantExpr: "COALESCE(t.merchant_clean_name, t.description)",
    userScopeJoin:
      "JOIN mx_accounts ma ON ma.id = t.mx_account_id JOIN mx_members mm ON mm.id = ma.mx_member_id",
    userScopeWhere: "mm.user_id = $1",
    // mx_transactions.is_transfer is text "true"/"false"
    isTransferIsFalseExpr: "(t.is_transfer IS NULL OR t.is_transfer = 'false')",
  },
  manual: {
    table: "manual_transactions",
    accountIdCol: "account_id",
    merchantExpr: "COALESCE(t.merchant_clean_name, t.merchant)",
    userScopeJoin: "",
    userScopeWhere: "t.user_id = $1",
    isTransferIsFalseExpr: "(t.is_transfer IS NULL OR t.is_transfer = 'false')",
  },
};

interface RefundCandidate {
  id: string;
  account_id: string;
  date: string;
  amount: string;
  merchant_name: string;
  canonical_category_id: string | null;
}

interface ChargeRow {
  id: string;
  account_id: string;
  date: string;
  amount: string;
  merchant_name: string;
}

const REFUND_WINDOW_DAYS = 90;

/**
 * Run refund-to-charge linking across all 3 tables for the given user.
 * Returns total number of refunds linked.
 */
export async function matchRefunds(userId: string): Promise<number> {
  let total = 0;
  for (const provider of ["plaid", "mx", "manual"] as const) {
    try {
      total += await matchRefundsForProvider(userId, provider);
    } catch (err) {
      console.error(`[RefundMatcher] Error for provider=${provider} user=${userId}:`, err);
    }
  }
  if (total > 0) {
    console.log(`[RefundMatcher] Linked ${total} refund(s) for user ${userId}`);
  }
  return total;
}

async function matchRefundsForProvider(userId: string, provider: Provider): Promise<number> {
  const cfg = CONFIGS[provider];
  let linked = 0;

  // Pull candidate refunds: credits without an existing refund link.
  const refundsResult = await pool.query<RefundCandidate>(
    `
    SELECT t.id,
           t.${cfg.accountIdCol} AS account_id,
           t.date,
           t.amount,
           ${cfg.merchantExpr} AS merchant_name,
           t.canonical_category_id
      FROM ${cfg.table} t
      ${cfg.userScopeJoin}
     WHERE ${cfg.userScopeWhere}
       AND t.amount::numeric < 0
       AND t.refund_of_transaction_id IS NULL
       AND ${cfg.isTransferIsFalseExpr}
     ORDER BY t.date ASC
    `,
    [userId],
  );

  for (const refund of refundsResult.rows) {
    if (!refund.merchant_name) continue;
    if (isNonSpendingCanonical(refund.canonical_category_id)) continue;

    const refundAbs = Math.abs(parseFloat(refund.amount));
    if (refundAbs === 0) continue;

    // Find the best matching prior charge on the same account, within 90 days,
    // matching merchant, amount >= refund |amount|, not already linked as
    // refund target by another row.
    const chargeResult = await pool.query<ChargeRow>(
      `
      SELECT t.id,
             t.${cfg.accountIdCol} AS account_id,
             t.date,
             t.amount,
             ${cfg.merchantExpr} AS merchant_name
        FROM ${cfg.table} t
        ${cfg.userScopeJoin}
       WHERE ${cfg.userScopeWhere}
         AND t.${cfg.accountIdCol} = $2
         AND t.amount::numeric > 0
         AND t.date <= $3::date
         AND ($3::date - t.date::date) <= ${REFUND_WINDOW_DAYS}
         AND LOWER(${cfg.merchantExpr}) = LOWER($4)
         AND t.amount::numeric >= $5::numeric
         AND NOT EXISTS (
           SELECT 1 FROM ${cfg.table} other
            WHERE other.refund_of_transaction_id = t.id
         )
       ORDER BY t.amount::numeric DESC, t.date DESC
       LIMIT 1
      `,
      [userId, refund.account_id, refund.date, refund.merchant_name, refundAbs.toFixed(2)],
    );

    const charge = chargeResult.rows[0];
    if (!charge) continue;

    await pool.query(
      `UPDATE ${cfg.table} SET refund_of_transaction_id = $1 WHERE id = $2`,
      [charge.id, refund.id],
    );

    linked++;
    console.log(
      `[RefundMatcher] ${cfg.table}: refund ${refund.id} (${refund.merchant_name} ${refund.amount}) → charge ${charge.id} (${charge.amount} on ${charge.date})`,
    );
  }

  return linked;
}
