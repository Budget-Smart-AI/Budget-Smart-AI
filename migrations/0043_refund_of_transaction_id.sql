-- 0043_refund_of_transaction_id.sql
-- ARCHITECTURE.md §6.3.3 — Refund-to-charge linking foundation.
--
-- Background:
-- When a merchant refunds a charge, it appears as a credit (negative amount in
-- our convention) on the SAME account a few days/weeks later. Today these
-- refunds count as income or get filtered out as "transfer-like" but never
-- net properly against the original charge in spending totals.
--
-- This migration adds refund_of_transaction_id to each transaction table.
-- A refund row's refund_of_transaction_id points to the original charge row's
-- id (within the same table — refunds are intra-account, intra-provider).
--
-- The refund matcher (server/lib/refund-matcher.ts) runs after each sync and:
--   1. Finds unlinked credits (refund_of_transaction_id IS NULL, amount < 0)
--   2. For each, looks up the most recent prior debit on the same account
--      with matching merchant + amount >= |refund amount| within 90 days
--   3. Links them via refund_of_transaction_id
--
-- Why VARCHAR (not uuid): the existing tx tables use varchar primary keys
-- (gen_random_uuid() default but stored as text), so the FK target column
-- type is varchar. Cleaner to match.
--
-- No backfill — pre-launch, low data volume. The matcher will catch up
-- naturally as it runs after subsequent syncs.

BEGIN;

ALTER TABLE plaid_transactions
  ADD COLUMN IF NOT EXISTS refund_of_transaction_id varchar;

ALTER TABLE mx_transactions
  ADD COLUMN IF NOT EXISTS refund_of_transaction_id varchar;

ALTER TABLE manual_transactions
  ADD COLUMN IF NOT EXISTS refund_of_transaction_id varchar;

-- Partial indexes — same pattern as transfer_pair_id. Most rows are NULL.
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_refund_of
  ON plaid_transactions(refund_of_transaction_id)
  WHERE refund_of_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mx_transactions_refund_of
  ON mx_transactions(refund_of_transaction_id)
  WHERE refund_of_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_manual_transactions_refund_of
  ON manual_transactions(refund_of_transaction_id)
  WHERE refund_of_transaction_id IS NOT NULL;

COMMIT;
