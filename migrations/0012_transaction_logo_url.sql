-- Add logo_url column to plaid_transactions table for merchant logos
ALTER TABLE "plaid_transactions" ADD COLUMN IF NOT EXISTS "logo_url" text;
