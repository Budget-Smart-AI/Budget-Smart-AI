-- Update comparison table to use Monarch Money instead of Mint, remove Copilot
-- Delete existing comparison data
DELETE FROM "landing_comparison";

-- Insert new comparison data (Budget Smart AI vs Monarch Money vs YNAB)
INSERT INTO "landing_comparison" ("feature", "budget_smart", "mint", "ynab", "copilot", "sort_order", "is_active", "created_at") VALUES
  ('Price (Monthly)', '$8.97', '$14.99', '$14.99', NULL, 1, 'true', NOW()::text),
  ('Price (Annual)', '$69/year', '$99.99/year', '$109/year', NULL, 2, 'true', NOW()::text),
  ('AI Financial Assistant', 'yes', 'no', 'no', NULL, 3, 'true', NOW()::text),
  ('AI Investment Advisor', 'yes', 'no', 'no', NULL, 4, 'true', NOW()::text),
  ('Proactive Daily Insights', 'yes', 'no', 'no', NULL, 5, 'true', NOW()::text),
  ('Anomaly Detection', 'yes', 'Limited', 'no', NULL, 6, 'true', NOW()::text),
  ('Cash Flow Forecasting (30 days)', 'yes', '7 days', 'Manual', NULL, 7, 'true', NOW()::text),
  ('Auto Bill Detection', 'AI-Powered', 'Basic', 'Manual', NULL, 8, 'true', NOW()::text),
  ('Auto Income Detection', 'AI-Powered', 'Basic', 'Manual', NULL, 9, 'true', NOW()::text),
  ('Subscription Tracking', 'yes', 'yes', 'Manual', NULL, 10, 'true', NOW()::text),
  ('Budget AI Suggestions', 'yes', 'no', 'no', NULL, 11, 'true', NOW()::text),
  ('Savings Goal AI Advisor', 'yes', 'Basic', 'Basic', NULL, 12, 'true', NOW()::text),
  ('12-Month Budget Forecast', 'yes', 'no', 'no', NULL, 13, 'true', NOW()::text),
  ('Bank Connections (Plaid)', 'yes', 'yes', 'yes', NULL, 14, 'true', NOW()::text),
  ('Investment Tracking', 'yes', 'yes', 'no', NULL, 15, 'true', NOW()::text),
  ('Net Worth Tracking', 'yes', 'yes', 'yes', NULL, 16, 'true', NOW()::text),
  ('Multi-Currency Support', 'Coming Soon', 'yes', 'yes', NULL, 17, 'true', NOW()::text),
  ('Built-for-AI Architecture', 'yes', 'no', 'no', NULL, 18, 'true', NOW()::text);
