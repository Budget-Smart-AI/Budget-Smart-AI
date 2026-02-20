-- Affiliate Program Settings Migration
CREATE TABLE IF NOT EXISTS "affiliate_settings" (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  type text DEFAULT 'string',
  updated_at text
);

-- Insert default affiliate settings
INSERT INTO "affiliate_settings" (key, value, type) VALUES
  ('commissionPercent', '50', 'number'),
  ('partneroUrl', 'https://affiliate.budgetsmart.io', 'string'),
  ('bonusTier1Customers', '100', 'number'),
  ('bonusTier1Amount', '500', 'number'),
  ('bonusTier2Customers', '250', 'number'),
  ('bonusTier2Amount', '1500', 'number'),
  ('bonusTier3Customers', '500', 'number'),
  ('bonusTier3Amount', '5000', 'number'),
  ('tier2CommissionPercent', '55', 'number'),
  ('tier3CommissionPercent', '60', 'number')
ON CONFLICT (key) DO NOTHING;
