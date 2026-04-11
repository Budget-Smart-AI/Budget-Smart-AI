-- Add Plaid PFC v2 + counterparty enrichment columns to plaid_transactions
-- These support: PFC icon display, counterparty-based income detection (INCOME_SOURCE),
-- and enriched merchant data from Plaid's enhanced transaction API.

ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS personal_finance_category_icon_url TEXT;
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS counterparty_name TEXT;
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS counterparty_type TEXT;
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS counterparty_website TEXT;

-- Index on counterparty_type for fast income-source queries
CREATE INDEX IF NOT EXISTS idx_plaid_tx_counterparty_type ON plaid_transactions(counterparty_type);
