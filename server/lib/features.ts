/*
 * ============================================================================
 * BUDGETSMART FEATURE REGISTRY - PHASE 1 AUDIT REPORT
 * ============================================================================
 * 
 * This file contains the complete registry of all user-facing features in
 * BudgetSmart AI. This is the foundation for the freemium gating system.
 * 
 * AUDIT COMPLETED: 2026-03-11
 * 
 * ============================================================================
 * FEATURE INVENTORY BY CATEGORY
 * ============================================================================
 * 
 * AI FEATURES (8 features)
 * ├─ AI_ASSISTANT                → /api/ai/chat, client/src/pages/ai-assistant.tsx
 * ├─ RECEIPT_SCANNING            → /api/receipts/*, server/routes/receipts.ts
 * ├─ PORTFOLIO_ADVISOR           → /api/investments/advisor-chat, client/src/pages/investments.tsx
 * ├─ AI_BUDGET_SUGGESTIONS       → /api/ai/suggest-budgets, server/routes.ts:6251
 * ├─ AI_TRANSACTION_CATEGORIZATION → /api/plaid/transactions/auto-reconcile, server/routes.ts:9641
 * ├─ AI_SAVINGS_ADVISOR          → /api/ai/savings-advisor, server/routes.ts:6428
 * ├─ AI_INSIGHTS                 → /api/ai/insights, server/routes.ts:9491
 * └─ AI_DAILY_COACH              → /api/coach/daily-briefing, server/routes.ts:9092
 * 
 * BANKING & ACCOUNTS (8 features)
 * ├─ MX_BANK_CONNECTIONS         → /api/mx/*, server/mx.ts
 * ├─ PLAID_BANK_CONNECTIONS      → /api/plaid/*, server/plaid.ts
 * ├─ MANUAL_ACCOUNTS             → /api/accounts/manual, client/src/pages/bank-accounts.tsx
 * ├─ ACCOUNT_SYNC                → /api/plaid/transactions/sync, /api/mx/transactions/sync
 * ├─ ACCOUNT_REFRESH             → /api/plaid/accounts/refresh-balances, /api/mx/members/:id/refresh
 * ├─ TRANSACTION_HISTORY         → /api/plaid/transactions, /api/mx/transactions
 * ├─ TRANSACTION_SEARCH          → /api/transactions/all, client/src/pages/bank-accounts.tsx
 * └─ MANUAL_TRANSACTIONS         → /api/transactions/manual, server/routes.ts:12628
 * 
 * FINANCIAL TRACKING (8 features)
 * ├─ NET_WORTH_TRACKING          → /api/net-worth, client/src/pages/net-worth.tsx
 * ├─ INVESTMENT_TRACKING         → /api/investment-accounts, client/src/pages/investments.tsx
 * ├─ ASSET_TRACKING              → /api/assets, client/src/pages/assets.tsx
 * ├─ INCOME_TRACKING             → /api/income, client/src/pages/income.tsx
 * ├─ EXPENSE_TRACKING            → /api/expenses, client/src/pages/expenses.tsx
 * ├─ SPENDING_ANALYSIS           → /api/reports/spending-by-category, server/routes.ts:7626
 * ├─ UNMATCHED_TRANSACTIONS      → /api/plaid/transactions/unmatched, server/routes.ts:5500
 * └─ SUBSCRIPTION_TRACKING       → /api/subscriptions/detect, client/src/pages/subscriptions.tsx
 * 
 * PLANNING (10 features)
 * ├─ BUDGET_CREATION             → /api/budgets, client/src/pages/budgets.tsx
 * ├─ SAVINGS_GOALS               → /api/savings-goals, client/src/pages/savings-goals.tsx
 * ├─ DEBT_TRACKING               → /api/debts, client/src/pages/debts.tsx
 * ├─ DEBT_PAYOFF_PLANNER         → client/src/pages/debt-payoff.tsx
 * ├─ BILL_TRACKING               → /api/bills, client/src/pages/bills.tsx
 * ├─ BILL_REMINDERS              → server/email.ts (email scheduler)
 * ├─ CALENDAR_VIEW               → /api/calendar/events, client/src/pages/calendar.tsx
 * ├─ WHAT_IF_SIMULATOR           → /api/simulator/what-if, client/src/pages/simulator.tsx
 * ├─ AUTOPILOT_RULES             → /api/autopilot/rules, server/routes.ts:8926
 * └─ FINANCIAL_AUTOPILOT         → /api/autopilot/spendability, server/routes.ts:9257
 * 
 * REPORTING (7 features)
 * ├─ FINANCIAL_REPORTS           → /api/reports/*, client/src/pages/reports.tsx
 * ├─ BUDGET_VS_ACTUAL            → /api/reports/budget-vs-actual, server/routes.ts:7697
 * ├─ CASH_FLOW_FORECAST          → /api/reports/cash-flow-forecast, server/routes.ts:7579
 * ├─ MONEY_TIMELINE              → /api/reports/money-timeline, server/routes.ts:7761
 * ├─ FINANCIAL_HEALTH            → /api/reports/financial-health, server/routes.ts:8135
 * ├─ DATA_EXPORT_CSV             → /api/export/csv/:type, server/routes.ts:8525
 * └─ DATA_EXPORT_JSON            → /api/user/export-data, server/routes.ts:8721
 * 
 * HOUSEHOLD (3 features)
 * ├─ HOUSEHOLD_MANAGEMENT        → /api/households/*, client/src/components/household-settings.tsx
 * ├─ SPLIT_EXPENSES              → /api/split-expenses, client/src/pages/split-expenses.tsx
 * └─ HOUSEHOLD_INVITATIONS       → /api/households/invite, server/routes.ts:11461
 * 
 * UTILITIES (9 features)
 * ├─ RECEIPT_SCANNER             → /api/receipts/upload, server/routes/receipts.ts
 * ├─ FINANCIAL_VAULT             → /api/vault/*, server/routes/vault.ts
 * ├─ CATEGORIES_MANAGEMENT       → /api/custom-categories, client/src/pages/categories.tsx
 * ├─ MERCHANT_MANAGEMENT         → /api/merchants, client/src/pages/merchants.tsx
 * ├─ NOTIFICATIONS               → /api/notifications, client/src/components/notifications-dropdown.tsx
 * ├─ SECURITY_ALERTS             → /api/anomalies, client/src/pages/anomalies.tsx
 * ├─ TAX_REPORTING               → /api/tax/*, server/routes.ts:8832
 * ├─ SILENT_LEAKS_DETECTOR       → /api/leaks/detect, server/routes.ts:9148
 * └─ PAYDAY_OPTIMIZER            → /api/payday/optimize, server/routes.ts:9216
 * 
 * ADMIN ONLY (Not user-facing)
 * ├─ Admin user management
 * ├─ Admin analytics
 * ├─ Admin support tickets
 * ├─ Admin AI config
 * ├─ Admin landing page CMS
 * ├─ Admin sales chat management
 * ├─ Admin bank provider config
 * └─ Admin audit logs
 * 
 * ============================================================================
 * AMBIGUOUS FEATURES REQUIRING RYAN'S DECISION
 * ============================================================================
 * 
 * 1. TRANSACTION_CATEGORIZATION vs AI_TRANSACTION_CATEGORIZATION
 *    - Manual categorization (/api/transactions/:id/category) exists
 *    - AI auto-reconcile (/api/plaid/transactions/auto-reconcile) exists
 *    - Decision needed: Are these separate features or one feature with two modes?
 *    - Current approach: Treating AI categorization as separate PRO feature
 * 
 * 2. AUTOBLOG Feature
 *    - Mentioned in requirements but no code found in codebase
 *    - Decision needed: Is this planned for future or should be excluded?
 *    - Current approach: Excluded from registry (not implemented)
 * 
 * 3. HOUSEHOLD_MEMBERS limit
 *    - Free tier: Should it be 0 (no household) or 1 (just the owner)?
 *    - Pro tier: Should it have a limit or unlimited?
 *    - Current approach: Free=0, Pro=2, Family=5
 * 
 * 4. INVESTMENT_TRACKING limits
 *    - Should investment accounts have limits per tier?
 *    - Should holdings have limits per tier?
 *    - Current approach: No limits on investment accounts/holdings
 * 
 * 5. FINANCIAL_VAULT storage limits
 *    - No storage limit logic found in code
 *    - Decision needed: What are the actual storage limits?
 *    - Current approach: Documents count limit (Free=5, Pro=50, Family=100)
 * 
 * 6. TRANSACTION_HISTORY days
 *    - Plaid/MX sync all available history from providers
 *    - Decision needed: Should we enforce viewing limits?
 *    - Current approach: Free=90 days, Pro/Family=unlimited (viewing only)
 * 
 * 7. OTHER_EXPENSES feature
 *    - Separate page exists (other-expenses.tsx) for non-transaction expenses
 *    - Decision needed: Is this different from EXPENSE_TRACKING?
 *    - Current approach: Merged into EXPENSE_TRACKING (same underlying API)
 * 
 * ============================================================================
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Feature tier levels defining access levels
 */
export type FeatureTier = 'free' | 'pro' | 'family';

/**
 * Feature categories for organizational grouping
 */
export type FeatureCategory =
  | 'ai'
  | 'banking'
  | 'tracking'
  | 'planning'
  | 'reporting'
  | 'household'
  | 'utilities'
  | 'admin';

/**
 * Feature definition interface
 */
export interface Feature {
  /** Unique snake_case identifier */
  key: string;
  /** Human-readable feature name */
  displayName: string;
  /** One-line description of the feature */
  description: string;
  /** Minimum tier required to access this feature */
  tier: FeatureTier;
  /** Category this feature belongs to */
  category: FeatureCategory;
  /** Monthly limit (null = unlimited) */
  monthlyLimit: number | null;
  /** Unit for the limit (e.g., 'messages', 'scans', 'days') */
  limitUnit: string | null;
}

// ============================================================================
// FEATURE REGISTRY
// ============================================================================

/**
 * Complete registry of all user-facing features in BudgetSmart AI
 */
export const FEATURES: Record<string, Feature> = {
  // ========== AI FEATURES ==========
  AI_ASSISTANT: {
    key: 'ai_assistant',
    displayName: 'AI Assistant',
    description: 'Chat with AI financial advisor for personalized insights and advice',
    tier: 'pro',
    category: 'ai',
    monthlyLimit: 10,
    limitUnit: 'messages',
  },
  RECEIPT_SCANNING: {
    key: 'receipt_scanning',
    displayName: 'Receipt Scanning',
    description: 'AI-powered OCR to extract merchant, amount, date, and category from receipt images',
    tier: 'pro',
    category: 'ai',
    monthlyLimit: 3,
    limitUnit: 'scans',
  },
  PORTFOLIO_ADVISOR: {
    key: 'portfolio_advisor',
    displayName: 'Portfolio Advisor',
    description: 'AI analysis of investment holdings with Canadian tax context (TFSA, RRSP)',
    tier: 'pro',
    category: 'ai',
    monthlyLimit: 1,
    limitUnit: 'insights',
  },
  AI_BUDGET_SUGGESTIONS: {
    key: 'ai_budget_suggestions',
    displayName: 'AI Budget Suggestions',
    description: 'AI-generated budget recommendations based on spending patterns',
    tier: 'pro',
    category: 'ai',
    monthlyLimit: 5,
    limitUnit: 'requests',
  },
  AI_TRANSACTION_CATEGORIZATION: {
    key: 'ai_transaction_categorization',
    displayName: 'AI Transaction Categorization',
    description: 'Automatic AI-powered transaction categorization and reconciliation',
    tier: 'pro',
    category: 'ai',
    monthlyLimit: null,
    limitUnit: null,
  },
  AI_SAVINGS_ADVISOR: {
    key: 'ai_savings_advisor',
    displayName: 'AI Savings Advisor',
    description: 'AI recommendations for safe savings amounts based on cash flow',
    tier: 'pro',
    category: 'ai',
    monthlyLimit: 10,
    limitUnit: 'requests',
  },
  AI_INSIGHTS: {
    key: 'ai_insights',
    displayName: 'AI Insights',
    description: 'Proactive AI-generated financial insights and recommendations',
    tier: 'pro',
    category: 'ai',
    monthlyLimit: null,
    limitUnit: null,
  },
  AI_DAILY_COACH: {
    key: 'ai_daily_coach',
    displayName: 'AI Daily Coach',
    description: 'Daily financial briefings with warnings and personalized insights',
    tier: 'pro',
    category: 'ai',
    monthlyLimit: null,
    limitUnit: null,
  },

  // ========== BANKING & ACCOUNTS ==========
  MX_BANK_CONNECTIONS: {
    key: 'mx_bank_connections',
    displayName: 'MX Bank Connections',
    description: 'Connect bank accounts via MX Technologies (Canada/US optimized)',
    tier: 'free',
    category: 'banking',
    monthlyLimit: 1,
    limitUnit: 'connections',
  },
  PLAID_BANK_CONNECTIONS: {
    key: 'plaid_bank_connections',
    displayName: 'Plaid Bank Connections',
    description: 'Connect bank accounts via Plaid (International support)',
    tier: 'free',
    category: 'banking',
    monthlyLimit: 1,
    limitUnit: 'connections',
  },
  MANUAL_ACCOUNTS: {
    key: 'manual_accounts',
    displayName: 'Manual Accounts',
    description: 'Create and manage manual bank/credit card accounts',
    tier: 'free',
    category: 'banking',
    monthlyLimit: 3,
    limitUnit: 'accounts',
  },
  ACCOUNT_SYNC: {
    key: 'account_sync',
    displayName: 'Account Sync',
    description: 'Automatic synchronization of transactions from connected banks',
    tier: 'free',
    category: 'banking',
    monthlyLimit: null,
    limitUnit: null,
  },
  ACCOUNT_REFRESH: {
    key: 'account_refresh',
    displayName: 'Account Refresh',
    description: 'Manual refresh of account balances and recent transactions',
    tier: 'free',
    category: 'banking',
    monthlyLimit: null,
    limitUnit: null,
  },
  TRANSACTION_HISTORY: {
    key: 'transaction_history',
    displayName: 'Transaction History',
    description: 'View and search historical transactions',
    tier: 'free',
    category: 'banking',
    monthlyLimit: 90,
    limitUnit: 'days',
  },
  TRANSACTION_SEARCH: {
    key: 'transaction_search',
    displayName: 'Transaction Search',
    description: 'Search and filter transactions by merchant, amount, category',
    tier: 'free',
    category: 'banking',
    monthlyLimit: null,
    limitUnit: null,
  },
  MANUAL_TRANSACTIONS: {
    key: 'manual_transactions',
    displayName: 'Manual Transactions',
    description: 'Create, edit, and import manual transactions',
    tier: 'free',
    category: 'banking',
    monthlyLimit: 50,
    limitUnit: 'transactions',
  },

  // ========== FINANCIAL TRACKING ==========
  NET_WORTH_TRACKING: {
    key: 'net_worth_tracking',
    displayName: 'Net Worth Tracking',
    description: 'Track total assets and liabilities over time with snapshots',
    tier: 'free',
    category: 'tracking',
    monthlyLimit: null,
    limitUnit: null,
  },
  INVESTMENT_TRACKING: {
    key: 'investment_tracking',
    displayName: 'Investment Tracking',
    description: 'Track investment accounts, holdings, and portfolio performance',
    tier: 'free',
    category: 'tracking',
    monthlyLimit: null,
    limitUnit: null,
  },
  ASSET_TRACKING: {
    key: 'asset_tracking',
    displayName: 'Asset Tracking',
    description: 'Track personal assets like real estate, vehicles, and valuables',
    tier: 'free',
    category: 'tracking',
    monthlyLimit: 10,
    limitUnit: 'assets',
  },
  INCOME_TRACKING: {
    key: 'income_tracking',
    displayName: 'Income Tracking',
    description: 'Record and track income sources and amounts',
    tier: 'free',
    category: 'tracking',
    monthlyLimit: null,
    limitUnit: null,
  },
  EXPENSE_TRACKING: {
    key: 'expense_tracking',
    displayName: 'Expense Tracking',
    description: 'Track manual expenses and one-time spending',
    tier: 'free',
    category: 'tracking',
    monthlyLimit: 100,
    limitUnit: 'expenses',
  },
  SPENDING_ANALYSIS: {
    key: 'spending_analysis',
    displayName: 'Spending Analysis',
    description: 'Analyze spending patterns by category, merchant, and time period',
    tier: 'free',
    category: 'tracking',
    monthlyLimit: null,
    limitUnit: null,
  },
  UNMATCHED_TRANSACTIONS: {
    key: 'unmatched_transactions',
    displayName: 'Unmatched Transactions',
    description: 'View and reconcile unmatched bank transactions',
    tier: 'free',
    category: 'tracking',
    monthlyLimit: null,
    limitUnit: null,
  },
  SUBSCRIPTION_TRACKING: {
    key: 'subscription_tracking',
    displayName: 'Subscription Tracking',
    description: 'Detect and track recurring subscriptions and memberships',
    tier: 'free',
    category: 'tracking',
    monthlyLimit: null,
    limitUnit: null,
  },

  // ========== PLANNING ==========
  BUDGET_CREATION: {
    key: 'budget_creation',
    displayName: 'Budget Creation',
    description: 'Create and manage monthly budgets by category',
    tier: 'free',
    category: 'planning',
    monthlyLimit: 2,
    limitUnit: 'budgets',
  },
  SAVINGS_GOALS: {
    key: 'savings_goals',
    displayName: 'Savings Goals',
    description: 'Set and track savings goals with progress visualization',
    tier: 'free',
    category: 'planning',
    monthlyLimit: 1,
    limitUnit: 'goals',
  },
  DEBT_TRACKING: {
    key: 'debt_tracking',
    displayName: 'Debt Tracking',
    description: 'Track credit cards, loans, and other debts',
    tier: 'free',
    category: 'planning',
    monthlyLimit: 3,
    limitUnit: 'debts',
  },
  DEBT_PAYOFF_PLANNER: {
    key: 'debt_payoff_planner',
    displayName: 'Debt Payoff Planner',
    description: 'Calculate debt payoff strategies (snowball, avalanche)',
    tier: 'pro',
    category: 'planning',
    monthlyLimit: null,
    limitUnit: null,
  },
  BILL_TRACKING: {
    key: 'bill_tracking',
    displayName: 'Bill Tracking',
    description: 'Track recurring bills and due dates',
    tier: 'free',
    category: 'planning',
    monthlyLimit: 5,
    limitUnit: 'bills',
  },
  BILL_REMINDERS: {
    key: 'bill_reminders',
    displayName: 'Bill Reminders',
    description: 'Email reminders for upcoming bill payments',
    tier: 'free',
    category: 'planning',
    monthlyLimit: null,
    limitUnit: null,
  },
  CALENDAR_VIEW: {
    key: 'calendar_view',
    displayName: 'Calendar View',
    description: 'Calendar view of bills, income, and financial events',
    tier: 'free',
    category: 'planning',
    monthlyLimit: null,
    limitUnit: null,
  },
  WHAT_IF_SIMULATOR: {
    key: 'what_if_simulator',
    displayName: 'What-If Simulator',
    description: 'Financial scenario simulator for testing decisions',
    tier: 'pro',
    category: 'planning',
    monthlyLimit: 20,
    limitUnit: 'simulations',
  },
  AUTOPILOT_RULES: {
    key: 'autopilot_rules',
    displayName: 'Autopilot Rules',
    description: 'Create custom automation rules for transactions',
    tier: 'pro',
    category: 'planning',
    monthlyLimit: 5,
    limitUnit: 'rules',
  },
  FINANCIAL_AUTOPILOT: {
    key: 'financial_autopilot',
    displayName: 'Financial Autopilot',
    description: 'Spendability meter showing safe daily spending allowance',
    tier: 'pro',
    category: 'planning',
    monthlyLimit: null,
    limitUnit: null,
  },

  // ========== REPORTING ==========
  FINANCIAL_REPORTS: {
    key: 'financial_reports',
    displayName: 'Financial Reports',
    description: 'Generate detailed financial reports and analytics',
    tier: 'free',
    category: 'reporting',
    monthlyLimit: null,
    limitUnit: null,
  },
  BUDGET_VS_ACTUAL: {
    key: 'budget_vs_actual',
    displayName: 'Budget vs Actual',
    description: 'Compare budgeted amounts against actual spending',
    tier: 'free',
    category: 'reporting',
    monthlyLimit: null,
    limitUnit: null,
  },
  CASH_FLOW_FORECAST: {
    key: 'cash_flow_forecast',
    displayName: 'Cash Flow Forecast',
    description: '90-day cash flow projection with danger day detection',
    tier: 'pro',
    category: 'reporting',
    monthlyLimit: null,
    limitUnit: null,
  },
  MONEY_TIMELINE: {
    key: 'money_timeline',
    displayName: 'Money Timeline',
    description: 'Visual timeline of upcoming financial events',
    tier: 'free',
    category: 'reporting',
    monthlyLimit: null,
    limitUnit: null,
  },
  FINANCIAL_HEALTH: {
    key: 'financial_health',
    displayName: 'Financial Health',
    description: 'Overall financial health score and recommendations',
    tier: 'pro',
    category: 'reporting',
    monthlyLimit: null,
    limitUnit: null,
  },
  DATA_EXPORT_CSV: {
    key: 'data_export_csv',
    displayName: 'CSV Export',
    description: 'Export transactions, budgets, and financial data to CSV',
    tier: 'free',
    category: 'reporting',
    monthlyLimit: 5,
    limitUnit: 'exports',
  },
  DATA_EXPORT_JSON: {
    key: 'data_export_json',
    displayName: 'JSON Export',
    description: 'Export complete account data as JSON for portability',
    tier: 'pro',
    category: 'reporting',
    monthlyLimit: 2,
    limitUnit: 'exports',
  },

  // ========== HOUSEHOLD ==========
  HOUSEHOLD_MANAGEMENT: {
    key: 'household_management',
    displayName: 'Household Management',
    description: 'Create and manage multi-user household accounts',
    tier: 'family',
    category: 'household',
    monthlyLimit: null,
    limitUnit: null,
  },
  HOUSEHOLD_MEMBERS: {
    key: 'household_members',
    displayName: 'Household Members',
    description: 'Add family members or partners to shared household',
    tier: 'family',
    category: 'household',
    monthlyLimit: 5,
    limitUnit: 'members',
  },
  SPLIT_EXPENSES: {
    key: 'split_expenses',
    displayName: 'Split Expenses',
    description: 'Track and split shared expenses with household members',
    tier: 'family',
    category: 'household',
    monthlyLimit: null,
    limitUnit: null,
  },
  HOUSEHOLD_INVITATIONS: {
    key: 'household_invitations',
    displayName: 'Household Invitations',
    description: 'Invite members to join household via email',
    tier: 'family',
    category: 'household',
    monthlyLimit: 10,
    limitUnit: 'invitations',
  },

  // ========== UTILITIES ==========
  RECEIPT_SCANNER: {
    key: 'receipt_scanner',
    displayName: 'Receipt Scanner',
    description: 'Upload and store receipt images with transaction matching',
    tier: 'free',
    category: 'utilities',
    monthlyLimit: 10,
    limitUnit: 'uploads',
  },
  FINANCIAL_VAULT: {
    key: 'financial_vault',
    displayName: 'Financial Vault',
    description: 'Secure encrypted storage for financial documents',
    tier: 'pro',
    category: 'utilities',
    monthlyLimit: 5,
    limitUnit: 'documents',
  },
  VAULT_AI_SEARCH: {
    key: 'vault_ai_search',
    displayName: 'Vault AI Search',
    description: 'AI-powered search and question answering over vault documents',
    tier: 'pro',
    category: 'utilities',
    monthlyLimit: 10,
    limitUnit: 'queries',
  },
  CATEGORIES_MANAGEMENT: {
    key: 'categories_management',
    displayName: 'Categories Management',
    description: 'Create and manage custom spending categories',
    tier: 'free',
    category: 'utilities',
    monthlyLimit: 20,
    limitUnit: 'categories',
  },
  MERCHANT_MANAGEMENT: {
    key: 'merchant_management',
    displayName: 'Merchant Management',
    description: 'Customize merchant names and default categories',
    tier: 'free',
    category: 'utilities',
    monthlyLimit: null,
    limitUnit: null,
  },
  NOTIFICATIONS: {
    key: 'notifications',
    displayName: 'Notifications',
    description: 'In-app notification center for alerts and updates',
    tier: 'free',
    category: 'utilities',
    monthlyLimit: null,
    limitUnit: null,
  },
  SECURITY_ALERTS: {
    key: 'security_alerts',
    displayName: 'Security Alerts',
    description: 'Anomaly detection alerts for unusual transactions',
    tier: 'pro',
    category: 'utilities',
    monthlyLimit: null,
    limitUnit: null,
  },
  TAX_REPORTING: {
    key: 'tax_reporting',
    displayName: 'Tax Reporting',
    description: 'Tax category assignments and annual tax summaries',
    tier: 'pro',
    category: 'utilities',
    monthlyLimit: 1,
    limitUnit: 'summaries',
  },
  SILENT_LEAKS_DETECTOR: {
    key: 'silent_leaks_detector',
    displayName: 'Silent Money Leaks Detector',
    description: 'AI detection of recurring small charges and price increases',
    tier: 'pro',
    category: 'utilities',
    monthlyLimit: null,
    limitUnit: null,
  },
  PAYDAY_OPTIMIZER: {
    key: 'payday_optimizer',
    displayName: 'Payday Optimizer',
    description: 'Optimal bill payment timing recommendations',
    tier: 'pro',
    category: 'utilities',
    monthlyLimit: null,
    limitUnit: null,
  },
};

// ============================================================================
// FEATURE LIMITS BY TIER
// ============================================================================

/**
 * Concrete limits for each feature per subscription tier
 * null = unlimited
 */
export const FEATURE_LIMITS = {
  free: {
    // AI Features (Limited on free tier)
    ai_assistant: 10,                   // messages per month
    receipt_scanning: 3,                // scans per month
    portfolio_advisor: 1,               // insights per month
    ai_budget_suggestions: 5,           // requests per month
    ai_transaction_categorization: 0,   // disabled on free
    ai_savings_advisor: 3,              // requests per month
    ai_insights: 0,                     // disabled on free
    ai_daily_coach: 0,                  // disabled on free

    // Banking & Accounts
    bank_connections: 1,                // total connected banks (Plaid + MX combined)
    mx_bank_connections: 1,             // MX connections (counts toward bank_connections)
    plaid_bank_connections: 1,          // Plaid connections (counts toward bank_connections)
    manual_accounts: 3,                 // total manual accounts
    transaction_history: 90,            // days of history viewable
    manual_transactions: 50,            // manual transactions per month

    // Financial Tracking
    asset_tracking: 10,                 // total assets tracked
    expense_tracking: 100,              // manual expenses per month

    // Planning
    budgets: 2,                         // total budgets
    savings_goals: 1,                   // total goals
    debt_tracking: 3,                   // total debts
    debt_payoff_planner: 0,             // disabled on free
    bill_tracking: 5,                   // total bills
    what_if_simulator: 0,               // disabled on free
    autopilot_rules: 0,                 // disabled on free
    financial_autopilot: 0,             // disabled on free

    // Reporting
    cash_flow_forecast: 0,              // disabled on free
    financial_health: 0,                // disabled on free
    data_export_csv: 5,                 // exports per month
    data_export_json: 0,                // disabled on free
    tax_reporting: 0,                   // disabled on free

    // Household (Disabled on free tier)
    household_management: 0,            // disabled on free
    household_members: 0,               // disabled on free
    split_expenses: 0,                  // disabled on free
    household_invitations: 0,           // disabled on free

    // Utilities
    receipt_scanner: 10,                // receipt uploads per month
    financial_vault: 0,                 // disabled on free
    vault_ai_search: 0,                 // disabled on free
    categories_management: 20,          // total custom categories
    security_alerts: 0,                 // disabled on free
    silent_leaks_detector: 0,           // disabled on free
    payday_optimizer: 0,                // disabled on free
  },

  pro: {
    // AI Features (Unlimited on pro)
    ai_assistant: null,                 // unlimited
    receipt_scanning: null,             // unlimited
    portfolio_advisor: null,            // unlimited
    ai_budget_suggestions: null,        // unlimited
    ai_transaction_categorization: null, // unlimited
    ai_savings_advisor: null,           // unlimited
    ai_insights: null,                  // unlimited
    ai_daily_coach: null,               // unlimited

    // Banking & Accounts
    bank_connections: null,             // unlimited
    mx_bank_connections: null,          // unlimited
    plaid_bank_connections: null,       // unlimited
    manual_accounts: null,              // unlimited
    transaction_history: null,          // unlimited (all history)
    manual_transactions: null,          // unlimited

    // Financial Tracking
    asset_tracking: null,               // unlimited
    expense_tracking: null,             // unlimited

    // Planning
    budgets: null,                      // unlimited
    savings_goals: null,                // unlimited
    debt_tracking: null,                // unlimited
    debt_payoff_planner: null,          // unlimited
    bill_tracking: null,                // unlimited
    what_if_simulator: null,            // unlimited
    autopilot_rules: 10,                // 10 rules max
    financial_autopilot: null,          // unlimited

    // Reporting
    cash_flow_forecast: null,           // unlimited
    financial_health: null,             // unlimited
    data_export_csv: null,              // unlimited
    data_export_json: 12,               // once per month
    tax_reporting: 12,                  // once per month

    // Household (Limited - Family plan required for full access)
    household_management: 0,            // disabled (Family plan required)
    household_members: 2,               // owner + 1 member
    split_expenses: 0,                  // disabled (Family plan required)
    household_invitations: 5,           // limited invites

    // Utilities
    receipt_scanner: null,              // unlimited
    financial_vault: 50,                // 50 documents
    vault_ai_search: null,              // unlimited
    categories_management: null,        // unlimited
    security_alerts: null,              // unlimited
    silent_leaks_detector: null,        // unlimited
    payday_optimizer: null,             // unlimited
  },

  family: {
    // Inherits ALL pro limits plus household features

    // AI Features (same as pro)
    ai_assistant: null,
    receipt_scanning: null,
    portfolio_advisor: null,
    ai_budget_suggestions: null,
    ai_transaction_categorization: null,
    ai_savings_advisor: null,
    ai_insights: null,
    ai_daily_coach: null,

    // Banking & Accounts (same as pro)
    bank_connections: null,
    mx_bank_connections: null,
    plaid_bank_connections: null,
    manual_accounts: null,
    transaction_history: null,
    manual_transactions: null,

    // Financial Tracking (same as pro)
    asset_tracking: null,
    expense_tracking: null,

    // Planning (same as pro)
    budgets: null,
    savings_goals: null,
    debt_tracking: null,
    debt_payoff_planner: null,
    bill_tracking: null,
    what_if_simulator: null,
    autopilot_rules: 10,
    financial_autopilot: null,

    // Reporting (same as pro)
    cash_flow_forecast: null,
    financial_health: null,
    data_export_csv: null,
    data_export_json: 12,
    tax_reporting: 12,

    // Household (Full access on family tier)
    household_management: null,         // unlimited households
    household_members: 5,               // 5 members per household
    split_expenses: null,               // unlimited split expenses
    household_invitations: null,        // unlimited invitations

    // Utilities (enhanced on family tier)
    receipt_scanner: null,
    financial_vault: 100,               // 100 documents
    vault_ai_search: null,
    categories_management: null,
    security_alerts: null,
    silent_leaks_detector: null,
    payday_optimizer: null,
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get feature definition by key
 */
export function getFeature(key: string): Feature | undefined {
  return FEATURES[key.toUpperCase().replace(/-/g, '_')];
}

/**
 * Get limit for a feature at a specific tier
 */
export function getFeatureLimit(featureKey: string, tier: FeatureTier): number | null {
  const key = featureKey.toLowerCase();
  return FEATURE_LIMITS[tier][key as keyof typeof FEATURE_LIMITS.free] ?? null;
}

/**
 * Check if a feature is available at a specific tier
 */
export function isFeatureAvailable(featureKey: string, tier: FeatureTier): boolean {
  const limit = getFeatureLimit(featureKey, tier);
  return limit === null || limit > 0;
}

/**
 * Get all features for a specific category
 */
export function getFeaturesByCategory(category: FeatureCategory): Feature[] {
  return Object.values(FEATURES).filter(f => f.category === category);
}

/**
 * Get all features for a specific tier (including inherited from lower tiers)
 */
export function getFeaturesByTier(tier: FeatureTier): Feature[] {
  const tierHierarchy: Record<FeatureTier, FeatureTier[]> = {
    free: ['free'],
    pro: ['free', 'pro'],
    family: ['free', 'pro', 'family'],
  };
  
  const allowedTiers = tierHierarchy[tier];
  return Object.values(FEATURES).filter(f => allowedTiers.includes(f.tier));
}
