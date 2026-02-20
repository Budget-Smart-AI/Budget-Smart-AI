-- Landing page settings table
CREATE TABLE IF NOT EXISTS "landing_settings" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "value" text NOT NULL,
  "type" text NOT NULL DEFAULT 'text',
  "updated_at" text
);

-- Landing page features table
CREATE TABLE IF NOT EXISTS "landing_features" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "description" text NOT NULL,
  "icon" text NOT NULL,
  "category" text DEFAULT 'core',
  "sort_order" integer DEFAULT 0,
  "is_active" text DEFAULT 'true',
  "created_at" text,
  "updated_at" text
);

-- Landing page testimonials table
CREATE TABLE IF NOT EXISTS "landing_testimonials" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "role" text,
  "company" text,
  "quote" text NOT NULL,
  "avatar" text,
  "rating" integer DEFAULT 5,
  "location" text,
  "sort_order" integer DEFAULT 0,
  "is_active" text DEFAULT 'true',
  "is_featured" text DEFAULT 'false',
  "created_at" text,
  "updated_at" text
);

-- Landing page pricing table
CREATE TABLE IF NOT EXISTS "landing_pricing" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "price" numeric(10, 2) NOT NULL,
  "billing_period" text DEFAULT 'monthly',
  "description" text,
  "features" text NOT NULL,
  "is_popular" text DEFAULT 'false',
  "cta_text" text DEFAULT 'Get Started',
  "cta_url" text DEFAULT '/login',
  "sort_order" integer DEFAULT 0,
  "is_active" text DEFAULT 'true',
  "created_at" text,
  "updated_at" text
);

-- Landing page comparison table
CREATE TABLE IF NOT EXISTS "landing_comparison" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "feature" text NOT NULL,
  "budget_smart" text NOT NULL,
  "mint" text,
  "ynab" text,
  "copilot" text,
  "sort_order" integer DEFAULT 0,
  "is_active" text DEFAULT 'true',
  "created_at" text
);

-- Landing page FAQ table
CREATE TABLE IF NOT EXISTS "landing_faq" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "question" text NOT NULL,
  "answer" text NOT NULL,
  "category" text DEFAULT 'general',
  "sort_order" integer DEFAULT 0,
  "is_active" text DEFAULT 'true',
  "created_at" text,
  "updated_at" text
);

-- Insert default landing page settings
INSERT INTO "landing_settings" ("key", "value", "type", "updated_at") VALUES
  ('hero_title', 'Your AI-Powered Financial Command Center', 'text', NOW()::text),
  ('hero_subtitle', 'Budget Smart AI combines intelligent automation with powerful analytics to help you save more, spend smarter, and achieve your financial goals faster.', 'text', NOW()::text),
  ('hero_cta_primary', 'Start Free Trial', 'text', NOW()::text),
  ('hero_cta_secondary', 'Watch Demo', 'text', NOW()::text),
  ('hero_video_url', '', 'text', NOW()::text),
  ('hero_stats', '{"users": "50,000+", "transactions": "10M+", "saved": "$5M+"}', 'json', NOW()::text),
  ('company_name', 'Budget Smart AI', 'text', NOW()::text),
  ('company_tagline', 'Smarter Money, Brighter Future', 'text', NOW()::text),
  ('footer_description', 'AI-first personal finance platform helping you make smarter financial decisions with intelligent automation and real-time insights.', 'text', NOW()::text),
  ('security_badge_text', 'Bank-level 256-bit encryption', 'text', NOW()::text),
  ('trust_badges', '["SOC 2 Type II", "GDPR Compliant", "PCI DSS", "Read-Only Access"]', 'json', NOW()::text),
  ('social_twitter', 'https://twitter.com/budgetsmartai', 'text', NOW()::text),
  ('social_linkedin', 'https://linkedin.com/company/budgetsmartai', 'text', NOW()::text),
  ('social_facebook', 'https://facebook.com/budgetsmartai', 'text', NOW()::text),
  ('target_markets', '["USA", "Canada"]', 'json', NOW()::text)
ON CONFLICT ("key") DO NOTHING;

-- Insert default features
INSERT INTO "landing_features" ("title", "description", "icon", "category", "sort_order", "created_at") VALUES
  ('AI Financial Coach', 'Get personalized insights and recommendations powered by advanced AI that learns your spending patterns and helps you make smarter decisions.', 'Brain', 'ai', 1, NOW()::text),
  ('Smart Bill Detection', 'Automatically identify recurring bills and subscriptions from your transactions with AI-powered pattern recognition.', 'Receipt', 'ai', 2, NOW()::text),
  ('Anomaly Detection', 'AI monitors your transactions 24/7 to flag suspicious charges, duplicate payments, and unusual spending patterns.', 'Shield', 'ai', 3, NOW()::text),
  ('Investment Advisor', 'Get AI-powered portfolio analysis with real-time stock prices and personalized investment recommendations.', 'TrendingUp', 'ai', 4, NOW()::text),
  ('Cash Flow Forecasting', 'Predict your future cash flow with AI analysis of your income patterns, bills, and spending habits.', 'LineChart', 'ai', 5, NOW()::text),
  ('Smart Savings', 'AI calculates exactly how much you can safely save each month based on your upcoming bills and spending patterns.', 'PiggyBank', 'ai', 6, NOW()::text),
  ('Bank Sync', 'Connect 12,000+ financial institutions securely. Your transactions sync automatically in real-time.', 'Building2', 'core', 7, NOW()::text),
  ('Budget Tracking', 'Create and manage budgets by category with real-time tracking and alerts when you approach your limits.', 'PieChart', 'core', 8, NOW()::text),
  ('Net Worth Dashboard', 'Track all your assets, investments, and debts in one place with beautiful visualizations.', 'Wallet', 'core', 9, NOW()::text),
  ('Debt Payoff Planner', 'Optimize your debt payoff strategy with snowball or avalanche methods and see your debt-free date.', 'Target', 'core', 10, NOW()::text),
  ('Financial Calendar', 'See all your upcoming bills, income, and financial events in one unified calendar view.', 'Calendar', 'core', 11, NOW()::text),
  ('Household Sharing', 'Share expenses and manage finances with family members. Split bills and track shared goals.', 'Users', 'core', 12, NOW()::text)
ON CONFLICT DO NOTHING;

-- Insert default pricing plans
INSERT INTO "landing_pricing" ("name", "price", "billing_period", "description", "features", "is_popular", "cta_text", "sort_order", "created_at") VALUES
  ('Free', '0', 'monthly', 'Perfect for getting started', '["Up to 2 bank accounts", "Basic budgeting", "Manual transaction entry", "Mobile app access", "Email support"]', 'false', 'Get Started', 1, NOW()::text),
  ('Pro', '9.99', 'monthly', 'For serious budgeters', '["Unlimited bank accounts", "AI Financial Coach", "Bill detection", "Investment tracking", "Net worth dashboard", "Priority support", "Advanced reports"]', 'true', 'Start Free Trial', 2, NOW()::text),
  ('Family', '14.99', 'monthly', 'For households', '["Everything in Pro", "Up to 5 family members", "Household budgets", "Split expenses", "Shared goals", "Family insights"]', 'false', 'Start Free Trial', 3, NOW()::text)
ON CONFLICT DO NOTHING;

-- Insert default testimonials
INSERT INTO "landing_testimonials" ("name", "role", "quote", "rating", "location", "is_featured", "sort_order", "created_at") VALUES
  ('Sarah M.', 'Freelance Designer', 'The AI insights are incredible. Budget Smart AI found $200/month in subscriptions I forgot about!', 5, 'San Francisco, CA', 'true', 1, NOW()::text),
  ('Michael T.', 'Software Engineer', 'Finally, a budgeting app that actually understands my spending patterns. The anomaly detection saved me from a fraudulent charge.', 5, 'New York, NY', 'true', 2, NOW()::text),
  ('Emily R.', 'Small Business Owner', 'Managing business and personal finances has never been easier. The cash flow forecasting is a game-changer.', 5, 'Toronto, ON', 'true', 3, NOW()::text),
  ('David L.', 'Marketing Manager', 'I paid off $15,000 in credit card debt using the debt payoff planner. Best financial decision I ever made.', 5, 'Chicago, IL', 'false', 4, NOW()::text),
  ('Jennifer K.', 'Teacher', 'The household sharing feature made budgeting with my spouse actually enjoyable. We are finally on the same page financially.', 5, 'Austin, TX', 'false', 5, NOW()::text)
ON CONFLICT DO NOTHING;

-- Insert default comparison data
INSERT INTO "landing_comparison" ("feature", "budget_smart", "mint", "ynab", "copilot", "sort_order", "created_at") VALUES
  ('AI Financial Coach', 'yes', 'no', 'no', 'yes', 1, NOW()::text),
  ('Anomaly Detection', 'yes', 'no', 'no', 'no', 2, NOW()::text),
  ('Smart Bill Detection', 'yes', 'partial', 'no', 'yes', 3, NOW()::text),
  ('Investment Tracking', 'yes', 'yes', 'no', 'yes', 4, NOW()::text),
  ('Cash Flow Forecasting', 'yes', 'no', 'no', 'yes', 5, NOW()::text),
  ('Debt Payoff Planning', 'yes', 'no', 'yes', 'no', 6, NOW()::text),
  ('Household Sharing', 'yes', 'no', 'yes', 'no', 7, NOW()::text),
  ('Bank Connections', '12,000+', '16,000+', '12,000+', '10,000+', 8, NOW()::text),
  ('Price (Monthly)', '$9.99', 'Free', '$14.99', '$10.99', 9, NOW()::text),
  ('Mobile App', 'yes', 'yes', 'yes', 'yes', 10, NOW()::text)
ON CONFLICT DO NOTHING;

-- Insert default FAQ
INSERT INTO "landing_faq" ("question", "answer", "category", "sort_order", "created_at") VALUES
  ('Is my financial data secure?', 'Absolutely. We use bank-level 256-bit encryption and never store your bank credentials. We connect through Plaid, the same secure technology used by major financial institutions. Your data is read-only - we can never move your money.', 'security', 1, NOW()::text),
  ('How does the AI coach work?', 'Our AI analyzes your spending patterns, income, and financial goals to provide personalized recommendations. It learns from your behavior over time to give increasingly accurate insights and suggestions.', 'features', 2, NOW()::text),
  ('Can I cancel anytime?', 'Yes! There are no long-term contracts. You can cancel your subscription at any time with no penalties. Your data remains accessible for 30 days after cancellation.', 'pricing', 3, NOW()::text),
  ('Which banks do you support?', 'We support over 12,000 financial institutions across the US and Canada, including all major banks, credit unions, investment accounts, and credit cards.', 'features', 4, NOW()::text),
  ('Is there a free trial?', 'Yes! All paid plans come with a 14-day free trial. No credit card required to start. You can explore all features before deciding to subscribe.', 'pricing', 5, NOW()::text),
  ('Can I share with my family?', 'Our Family plan supports up to 5 household members. Each member gets their own login while sharing household budgets, split expenses, and financial goals.', 'features', 6, NOW()::text)
ON CONFLICT DO NOTHING;
