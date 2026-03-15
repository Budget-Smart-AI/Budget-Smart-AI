-- Migration: Add sync_cursor to plaid_items and is_active to plaid_transactions
-- for the /transactions/sync endpoint migration

ALTER TABLE "plaid_items" ADD COLUMN IF NOT EXISTS "sync_cursor" text;
ALTER TABLE "plaid_transactions" ADD COLUMN IF NOT EXISTS "is_active" text DEFAULT 'true';
