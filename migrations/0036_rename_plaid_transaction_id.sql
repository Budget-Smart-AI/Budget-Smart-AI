-- UAT-10 #178 — Rename income.plaid_transaction_id → income.external_transaction_id
-- for provider-agnostic design. Plaid transaction IDs are valid external IDs;
-- no data transformation needed. MX guids will populate this same column going forward.
ALTER TABLE income RENAME COLUMN plaid_transaction_id TO external_transaction_id;
