-- Simplify Affiliate Program — Two-Tier Lifetime Recurring
--
-- Locked-in operator decisions (2026-04-17):
--   • Standard 40% lifetime recurring on every active referral.
--   • Boosted 50% lifetime recurring once an affiliate has 250+ active
--     referrals (applies to ALL their referrals, new and old).
--   • 180-day attribution cookie.
--   • $100 minimum payout via PayPal.
--
-- Replaces the 4-tier model from 0010_update_affiliate_commission.sql
-- (Standard 40 / Growth 50 @100 / Elite 55 @250 / Diamond 60 @500). Kept
-- here as a separate migration so we have a clean audit trail of the
-- pricing change in the affiliate ledger.

-- 1. Set the new canonical keys (idempotent — safe to re-run).
INSERT INTO "affiliate_settings" (key, value, type) VALUES
  ('commissionPercent', '40', 'number'),
  ('boostedCommissionPercent', '50', 'number'),
  ('boostedAfterReferrals', '250', 'number'),
  ('cookieDurationDays', '180', 'number'),
  ('payoutMethod', 'PayPal', 'string'),
  ('payoutMinimum', '100', 'number'),
  ('commissionRecurrence', 'lifetime', 'string'),
  ('partneroUrl', 'https://affiliate.budgetsmart.io', 'string')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  type = EXCLUDED.type;

-- 2. Remove the legacy 4-tier keys so the simplified UI doesn't pick up
--    stale rows. The application defaults already omit these, but admin
--    edits before this migration may have written them — clear them now.
DELETE FROM "affiliate_settings" WHERE key IN (
  'tier1CommissionPercent',
  'tier2CommissionPercent',
  'tier3CommissionPercent',
  'bonusTier1Customers',
  'bonusTier1Amount',
  'bonusTier2Customers',
  'bonusTier2Amount',
  'bonusTier3Customers',
  'bonusTier3Amount'
);
