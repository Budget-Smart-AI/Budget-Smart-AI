-- 0042_transfer_pair_id_cross_provider.sql
-- ARCHITECTURE.md §6.3.2 — Cross-provider transfer-pair matching foundation.
--
-- Background:
-- plaid_transactions already has is_transfer (boolean) + transfer_pair_id (uuid)
-- and the existing detectTransferPairs() function in server/plaid.ts wires those
-- up after every Plaid sync. But mx_transactions and manual_transactions both
-- have is_transfer (text) WITHOUT a transfer_pair_id column — so any transfer
-- that touches an MX account or a manual tx (e.g. user records a transfer-out
-- manually, Plaid syncs the matching transfer-in) gets zero pair-matching today.
--
-- This migration:
--   1. Adds transfer_pair_id uuid to mx_transactions and manual_transactions.
--   2. Adds partial indexes on transfer_pair_id IS NOT NULL for fast lookups
--      from the AI Teller's "show me my transfer pairs" surfaces.
--
-- The new server/lib/transfer-pair-matcher.ts module replaces detectTransferPairs
-- and queries all 3 tables UNION ALL'd, so a Plaid debit can pair with an MX
-- credit (or any cross-provider combination).
--
-- Pre-launch with 2 beta accounts. Both columns nullable (most rows will never
-- be paired). No backfill needed — matcher fires after every sync going forward
-- and will eventually process the existing rows. Idempotent if re-run because
-- the matcher checks transfer_pair_id IS NULL before pairing.

BEGIN;

ALTER TABLE mx_transactions
  ADD COLUMN IF NOT EXISTS transfer_pair_id uuid;

ALTER TABLE manual_transactions
  ADD COLUMN IF NOT EXISTS transfer_pair_id uuid;

-- Partial indexes — only index rows where transfer_pair_id is set, since
-- the vast majority of rows will be NULL. This keeps the index small.
CREATE INDEX IF NOT EXISTS idx_mx_transactions_transfer_pair_id
  ON mx_transactions(transfer_pair_id)
  WHERE transfer_pair_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_manual_transactions_transfer_pair_id
  ON manual_transactions(transfer_pair_id)
  WHERE transfer_pair_id IS NOT NULL;

-- Plaid already has the column (from the original §6.3 schema work that
-- accompanied detectTransferPairs). Add the partial index here too if
-- it wasn't created back then; idempotent.
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_transfer_pair_id
  ON plaid_transactions(transfer_pair_id)
  WHERE transfer_pair_id IS NOT NULL;

COMMIT;
