-- Update Stripe Price IDs to new production values
-- This migration updates all price IDs and pricing to match the new structure

-- First, update the existing Pro and Family plans with new prices and Stripe IDs
-- Pro Monthly: $7.99/mo -> price_1SulBIKvkQlROMzfOJbD5Emo
UPDATE "landing_pricing"
SET 
  "price" = 7.99,
  "stripe_price_id" = 'price_1SulBIKvkQlROMzfOJbD5Emo',
  "updated_at" = NOW()::text
WHERE "name" = 'Pro' AND "billing_period" = 'monthly';

-- Pro Yearly: $67/yr -> price_1T9ny6KvkQlROMzfCezxortJ
-- Insert if not exists, update if exists
INSERT INTO "landing_pricing" ("name", "price", "billing_period", "description", "features", "is_popular", "cta_text", "sort_order", "stripe_price_id", "created_at")
VALUES (
  'Pro',
  67.00,
  'yearly',
  'Perfect for individuals taking control of their finances',
  '["AI-Powered Spending Insights", "Automatic Transaction Categorization", "Bill Reminders & Tracking", "Savings Goals & Progress Tracking", "Monthly Budget Reports", "Spending Trend Analysis", "Up to 2 Bank Accounts", "Secure Bank Connections", "Email Support"]',
  'false',
  'Get Started',
  2,
  'price_1T9ny6KvkQlROMzfCezxortJ',
  NOW()::text
)
ON CONFLICT DO NOTHING;

-- If Pro yearly already exists, update it
UPDATE "landing_pricing"
SET 
  "price" = 67.00,
  "stripe_price_id" = 'price_1T9ny6KvkQlROMzfCezxortJ',
  "updated_at" = NOW()::text
WHERE "name" = 'Pro' AND "billing_period" = 'yearly';

-- Family Monthly: $14.99/mo -> price_1SulGFKvkQlROMzfvlqXhU1F
UPDATE "landing_pricing"
SET 
  "price" = 14.99,
  "stripe_price_id" = 'price_1SulGFKvkQlROMzfvlqXhU1F',
  "updated_at" = NOW()::text
WHERE "name" = 'Family' AND "billing_period" = 'monthly';

-- Family Yearly: $129/yr -> price_1T9nwkKvkQlROMzfkE0iNVVj
-- Insert if not exists, update if exists
INSERT INTO "landing_pricing" ("name", "price", "billing_period", "description", "features", "is_popular", "cta_text", "sort_order", "stripe_price_id", "created_at")
VALUES (
  'Family',
  129.00,
  'yearly',
  'Best value for households managing finances together',
  '["Everything in Pro", "Unlimited Bank Accounts", "Up to 6 Family Members", "Shared Household Budgets", "Family Spending Reports", "Advanced AI Recommendations", "Priority Support", "Data Export & API Access"]',
  'true',
  'Get Started',
  4,
  'price_1T9nwkKvkQlROMzfkE0iNVVj',
  NOW()::text
)
ON CONFLICT DO NOTHING;

-- If Family yearly already exists, update it
UPDATE "landing_pricing"
SET 
  "price" = 129.00,
  "stripe_price_id" = 'price_1T9nwkKvkQlROMzfkE0iNVVj',
  "is_popular" = 'true',
  "updated_at" = NOW()::text
WHERE "name" = 'Family' AND "billing_period" = 'yearly';

-- Remove trial_days from all plans (set to NULL or 0)
UPDATE "landing_pricing"
SET 
  "trial_days" = NULL,
  "updated_at" = NOW()::text
WHERE "trial_days" IS NOT NULL OR "trial_days" > 0;

-- Update CTA text to remove trial references
UPDATE "landing_pricing"
SET 
  "cta_text" = 'Get Started',
  "updated_at" = NOW()::text
WHERE "cta_text" LIKE '%Trial%' OR "cta_text" LIKE '%trial%';

-- Update FAQ to remove trial references and reflect freemium model
UPDATE "landing_faq"
SET 
  "answer" = 'We offer a Free Plan that you can use forever with no credit card required. When you''re ready for unlimited features, you can upgrade to a paid plan at any time. No trial period needed - start using BudgetSmart for free today!',
  "updated_at" = NOW()::text
WHERE "question" = 'Is there a free trial?' OR "question" LIKE '%trial%';

-- Update landing settings to remove trial references
UPDATE "landing_settings"
SET 
  "value" = 'Get Started Free',
  "updated_at" = NOW()::text
WHERE "key" = 'hero_cta_primary' AND "value" LIKE '%Trial%';

-- Update max_bank_accounts and max_family_members if columns exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'landing_pricing' AND column_name = 'max_bank_accounts') THEN
    -- Pro plans: 2 bank accounts
    UPDATE "landing_pricing"
    SET "max_bank_accounts" = 2
    WHERE "name" = 'Pro';
    
    -- Family plans: unlimited (9999)
    UPDATE "landing_pricing"
    SET "max_bank_accounts" = 9999
    WHERE "name" = 'Family';
    
    -- Pro plans: 1 family member
    UPDATE "landing_pricing"
    SET "max_family_members" = 1
    WHERE "name" = 'Pro';
    
    -- Family plans: 6 family members
    UPDATE "landing_pricing"
    SET "max_family_members" = 6
    WHERE "name" = 'Family';
  END IF;
END $$;
