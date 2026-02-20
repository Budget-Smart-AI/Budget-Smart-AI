-- Update Affiliate Program Commission Structure Migration
-- New structure: Base 40%, Growth (100) 50%, Elite (250) 55%, Diamond (500) 60%
-- New bonus amounts: $250, $1000, $2500

-- Update commission percent to 40%
UPDATE "affiliate_settings" SET value = '40' WHERE key = 'commissionPercent';

-- Add tier1CommissionPercent for 100 customers tier
INSERT INTO "affiliate_settings" (key, value, type) VALUES
  ('tier1CommissionPercent', '50', 'number')
ON CONFLICT (key) DO UPDATE SET value = '50';

-- Update bonus amounts
UPDATE "affiliate_settings" SET value = '250' WHERE key = 'bonusTier1Amount';
UPDATE "affiliate_settings" SET value = '1000' WHERE key = 'bonusTier2Amount';
UPDATE "affiliate_settings" SET value = '2500' WHERE key = 'bonusTier3Amount';
