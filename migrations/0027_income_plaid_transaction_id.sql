-- Migration: Add plaid_transaction_id column to income table
-- This column stores the stable Plaid transaction ID for auto-imported income records.
-- It serves as the PRIMARY dedup key, preventing duplicate income records when the
-- same Plaid transaction is processed multiple times (webhook retry, reconnection, etc.)
--
-- Also resets is_recurring to 'false' for all auto-imported income records that were
-- incorrectly marked as recurring by the recurring-income-detector. Auto-imported
-- records are individual paycheck snapshots and should never be projected forward.

-- Add the column (nullable — only set for auto-imported records)
ALTER TABLE income ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT;

-- Add a unique index per user to prevent duplicate imports at the DB level
-- (partial index: only enforces uniqueness when plaid_transaction_id IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS income_user_plaid_tx_unique
  ON income (user_id, plaid_transaction_id)
  WHERE plaid_transaction_id IS NOT NULL;

-- Backfill plaid_transaction_id from notes field for existing auto-imported records
-- Notes format: "Auto-imported from bank transaction | plaid_tx:<id>"
UPDATE income
SET plaid_transaction_id = substring(notes FROM 'plaid_tx:([A-Za-z0-9_-]+)')
WHERE notes LIKE '%plaid_tx:%'
  AND plaid_transaction_id IS NULL;

-- CRITICAL FIX: Reset is_recurring to 'false' for all auto-imported income records.
-- These records were incorrectly marked as recurring by the recurring-income-detector,
-- which caused the frontend to project each historical paycheck forward into every
-- future month, multiplying the total by the number of historical records.
--
-- Auto-imported records are identified by notes containing "Auto-imported from bank transaction".
-- They represent individual transactions (one per paycheck) and must remain as
-- one-time (is_recurring = false) entries. The server-side dedup in GET /api/income
-- already handles showing only the most recent record per source+recurrence group.
UPDATE income
SET
  is_recurring = 'false',
  recurrence = NULL,
  auto_detected = false,
  detected_at = NULL
WHERE notes LIKE '%Auto-imported from bank transaction%'
  AND is_recurring = 'true';
