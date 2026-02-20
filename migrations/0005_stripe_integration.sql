-- Stripe Integration Migration
-- Add Stripe-related columns to landing_pricing table
ALTER TABLE "landing_pricing" ADD COLUMN IF NOT EXISTS "stripe_price_id" text;
ALTER TABLE "landing_pricing" ADD COLUMN IF NOT EXISTS "stripe_product_id" text;
ALTER TABLE "landing_pricing" ADD COLUMN IF NOT EXISTS "max_bank_accounts" integer DEFAULT 1;
ALTER TABLE "landing_pricing" ADD COLUMN IF NOT EXISTS "max_family_members" integer DEFAULT 1;
ALTER TABLE "landing_pricing" ADD COLUMN IF NOT EXISTS "trial_days" integer DEFAULT 14;
ALTER TABLE "landing_pricing" ADD COLUMN IF NOT EXISTS "requires_card" text DEFAULT 'true';

-- Add Stripe subscription columns to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscription_status" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscription_plan_id" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_ends_at" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscription_ends_at" text;

-- Create index on stripe_customer_id for faster lookups
CREATE INDEX IF NOT EXISTS "users_stripe_customer_id_idx" ON "users" ("stripe_customer_id");
CREATE INDEX IF NOT EXISTS "users_stripe_subscription_id_idx" ON "users" ("stripe_subscription_id");
CREATE INDEX IF NOT EXISTS "landing_pricing_stripe_price_id_idx" ON "landing_pricing" ("stripe_price_id");
