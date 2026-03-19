-- Migration: 0028_plaid_enrichment_transfer_detection.sql
-- Adds Plaid Transaction Enrichment API fields and transfer detection columns
-- to the plaid_transactions table.
--
-- These columns store enrichment data returned inline by Plaid's
-- /transactions/sync endpoint when:
--   include_personal_finance_category=true
--   include_logo_and_counterparty_beta=true
--
-- Also removes dependency on Brandfetch — logos now come directly from Plaid
-- (merchant.logo_url / counterparties[0].logo_url) or MX (logo_url field).
-- The BRANDFETCH_API_KEY environment variable can be safely deleted from Railway.

-- Plaid personal_finance_category detailed subcategory
-- e.g. "FOOD_AND_DRINK_RESTAURANTS", "TRANSPORTATION_GAS_STATION"
ALTER TABLE "plaid_transactions" ADD COLUMN IF NOT EXISTS "personal_finance_category_detailed" text;

-- Plaid confidence level for the personal_finance_category assignment
-- Values: VERY_HIGH | HIGH | LOW
-- Used to auto-reconcile (VERY_HIGH/HIGH) vs flag for user review (LOW)
ALTER TABLE "plaid_transactions" ADD COLUMN IF NOT EXISTS "personal_finance_category_confidence" text;

-- Payment channel: online | in store | other
ALTER TABLE "plaid_transactions" ADD COLUMN IF NOT EXISTS "payment_channel" text;

-- Plaid stable merchant entity ID (from counterparties[0].entity_id)
-- Enables cross-transaction merchant linking without relying on name matching
ALTER TABLE "plaid_transactions" ADD COLUMN IF NOT EXISTS "merchant_entity_id" text;

-- Transfer detection: boolean flag set to true when this transaction is part
-- of a detected transfer pair (e.g. PC Financial -$500 / +$500 same-day)
ALTER TABLE "plaid_transactions" ADD COLUMN IF NOT EXISTS "is_transfer" boolean DEFAULT false;

-- Transfer detection: shared UUID linking the two sides of a transfer pair
-- Both the debit and credit transaction share the same transfer_pair_id
ALTER TABLE "plaid_transactions" ADD COLUMN IF NOT EXISTS "transfer_pair_id" uuid;

-- Indexes for efficient transfer pair lookups
CREATE INDEX IF NOT EXISTS idx_plaid_tx_transfer_pair
  ON plaid_transactions(transfer_pair_id)
  WHERE transfer_pair_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plaid_tx_is_transfer
  ON plaid_transactions(is_transfer)
  WHERE is_transfer = true;
