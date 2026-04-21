-- UAT-10 #178 — enforce compound uniqueness on (user_id, external_transaction_id).
-- Partial index allows multiple NULL external_transaction_id rows (manual income entries).
-- Must run AFTER scripts/dedup-income-external-txn.ts or this migration will fail.
CREATE UNIQUE INDEX IF NOT EXISTS income_user_external_txn_unique
  ON income (user_id, external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;
