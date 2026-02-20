-- Add isActive column to income table for disabling income entries
ALTER TABLE "income" ADD COLUMN IF NOT EXISTS "is_active" text DEFAULT 'true';

-- Add linkedPlaidAccountId to income for automatic filtering when accounts are disabled
ALTER TABLE "income" ADD COLUMN IF NOT EXISTS "linked_plaid_account_id" varchar;

-- Add linkedPlaidAccountId to bills for automatic filtering when accounts are disabled
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "linked_plaid_account_id" varchar;
