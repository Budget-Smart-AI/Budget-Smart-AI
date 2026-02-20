-- Update affiliate URL to new custom domain
UPDATE "affiliate_settings"
SET value = 'https://affiliate.budgetsmart.io',
    updated_at = NOW()::text
WHERE key = 'partneroUrl';
