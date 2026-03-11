# Budget Smart AI - Comprehensive Feature Plan Mapping

**Generated:** 2026-03-11  
**Purpose:** Document which features are available on Free/Pro/Family plans and track FeatureGate implementation status

## Executive Summary

**Total Features:** 55  
**Features with complete FEATURE_LIMITS entries:** 38  
**Features missing from FEATURE_LIMITS:** 17  
**Critical Issues Found:** Multiple features not gated on frontend

---

## Feature Mapping by Plan

### Legend
- ✅ **Implemented & Gated** - FeatureGate properly wraps content
- ⚠️ **Partially Gated** - Only add button wrapped, not content
- ❌ **NOT Gated** - No FeatureGate implementation
- 🔧 **Needs Limits** - Feature in registry but missing from FEATURE_LIMITS

---

## AI FEATURES (8 features)

### AI Assistant (`ai_assistant`)
- **Min Tier:** free
- **Free:** 10 messages/month
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/ai-assistant`
- **Status:** ❌ NOT Gated (needs review)

### Receipt Scanning (`receipt_scanning`)
- **Min Tier:** free
- **Free:** 3 scans/month
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/receipts`
- **Status:** ❌ NOT Gated (needs review)

### Portfolio Advisor (`portfolio_advisor`)
- **Min Tier:** free
- **Free:** 1 insight/month
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/investments`
- **Status:** ❌ NOT Gated (needs review)

### AI Budget Suggestions (`ai_budget_suggestions`)
- **Min Tier:** free
- **Free:** 5 requests/month
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/budgets` (button feature)
- **Status:** ⚠️ Partially (need to check button)

### AI Transaction Categorization (`ai_transaction_categorization`)
- **Min Tier:** pro
- **Free:** ❌ DISABLED
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/transactions` (auto-categorize feature)
- **Status:** ❌ NOT Gated (needs review)

### AI Savings Advisor (`ai_savings_advisor`)
- **Min Tier:** free
- **Free:** 3 requests/month
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/savings-goals` (button feature)
- **Status:** ⚠️ Partially (need to check button)

### AI Insights (`ai_insights`)
- **Min Tier:** pro
- **Free:** ❌ DISABLED
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** Various insights pages
- **Status:** ❌ NOT Gated (needs review)

### AI Daily Coach (`ai_daily_coach`)
- **Min Tier:** pro
- **Free:** ❌ DISABLED
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** Dashboard widget
- **Status:** ❌ NOT Gated (needs review)

---

## BANKING FEATURES (8 features)

### MX Bank Connections (`mx_bank_connections`)
- **Min Tier:** free
- **Free:** 1 connection
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/bank-accounts`
- **Status:** ❌ NOT Gated (needs review)

### Plaid Bank Connections (`plaid_bank_connections`)
- **Min Tier:** free
- **Free:** 1 connection
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/bank-accounts`
- **Status:** ❌ NOT Gated (needs review)

### Manual Accounts (`manual_accounts`)
- **Min Tier:** free
- **Free:** 3 accounts (total)
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/bank-accounts`
- **Status:** ❌ NOT Gated (needs review)

### Account Sync (`account_sync`)
- **Min Tier:** free
- **Limits:** 🔧 **NOT IN FEATURE_LIMITS**
- **Page:** `/bank-accounts` (sync button)
- **Status:** 🔧 Missing limits definition

### Account Refresh (`account_refresh`)
- **Min Tier:** free
- **Limits:** 🔧 **NOT IN FEATURE_LIMITS**
- **Page:** `/bank-accounts` (refresh button)
- **Status:** 🔧 Missing limits definition

### Transaction History (`transaction_history`)
- **Min Tier:** free
- **Free:** 90 days
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/transactions`
- **Status:** ❌ NOT Gated (needs review)

### Transaction Search (`transaction_search`)
- **Min Tier:** free
- **Limits:** 🔧 **NOT IN FEATURE_LIMITS**
- **Page:** `/transactions` (search bar)
- **Status:** 🔧 Missing limits definition

### Manual Transactions (`manual_transactions`)
- **Min Tier:** free
- **Free:** 50 transactions/month
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/transactions`
- **Status:** ❌ NOT Gated (needs review)

---

## TRACKING FEATURES (8 features)

### Net Worth Tracking (`net_worth_tracking`)
- **Min Tier:** free
- **Limits:** 🔧 **NOT IN FEATURE_LIMITS**
- **Page:** `/net-worth`
- **Status:** 🔧 Missing limits definition

### Investment Tracking (`investment_tracking`)
- **Min Tier:** free
- **Limits:** 🔧 **NOT IN FEATURE_LIMITS**
- **Page:** `/investments`
- **Status:** 🔧 Missing limits definition

### Asset Tracking (`asset_tracking`)
- **Min Tier:** free
- **Free:** 10 assets (total)
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/assets`
- **Status:** ❌ NOT Gated

### Income Tracking (`income_tracking`)
- **Min Tier:** free
- **Limits:** 🔧 **NOT IN FEATURE_LIMITS**
- **Page:** `/income`
- **Status:** 🔧 Missing limits definition

### Expense Tracking (`expense_tracking`)
- **Min Tier:** free
- **Free:** 100 expenses/month
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/expenses`
- **Status:** ❌ NOT Gated (needs review)

### Spending Analysis (`spending_analysis`)
- **Min Tier:** free
- **Limits:** 🔧 **NOT IN FEATURE_LIMITS**
- **Page:** Dashboard / Reports
- **Status:** 🔧 Missing limits definition

### Unmatched Transactions (`unmatched_transactions`)
- **Min Tier:** free
- **Limits:** 🔧 **NOT IN FEATURE_LIMITS**
- **Page:** `/transactions` (unmatched view)
- **Status:** 🔧 Missing limits definition

### Subscription Tracking (`subscription_tracking`)
- **Min Tier:** free
- **Limits:** 🔧 **NOT IN FEATURE_LIMITS**
- **Page:** `/subscriptions`
- **Status:** 🔧 Missing limits definition

---

## PLANNING FEATURES (10 features)

### Budget Creation (`budget_creation`)
- **Min Tier:** free
- **Free:** 2 budgets (total)
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/budgets`
- **Status:** ✅ **FIXED** - Content wrapped with FeatureGate

### Savings Goals (`savings_goals`)
- **Min Tier:** free
- **Free:** 1 goal (total)
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/savings-goals`
- **Status:** ✅ **FIXED** - Content wrapped with FeatureGate

### Debt Tracking (`debt_tracking`)
- **Min Tier:** free
- **Free:** 3 debts (total)
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/debts`
- **Status:** ✅ **FIXED** - Content wrapped with FeatureGate

### Debt Payoff Planner (`debt_payoff_planner`)
- **Min Tier:** pro
- **Free:** ❌ DISABLED
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/debt-payoff`
- **Status:** ❌ NOT Gated (needs review)

### Bill Tracking (`bill_tracking`)
- **Min Tier:** free
- **Free:** 5 bills (total)
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/bills`
- **Status:** ✅ **FIXED** - Content wrapped with FeatureGate

### Bill Reminders (`bill_reminders`)
- **Min Tier:** free
- **Limits:** 🔧 **NOT IN FEATURE_LIMITS**
- **Page:** Background feature (email reminders)
- **Status:** 🔧 Missing limits definition

### Calendar View (`calendar_view`)
- **Min Tier:** free
- **Limits:** 🔧 **NOT IN FEATURE_LIMITS**
- **Page:** `/calendar`
- **Status:** 🔧 Missing limits definition

### What-If Simulator (`what_if_simulator`)
- **Min Tier:** pro
- **Free:** ❌ DISABLED
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/simulator`
- **Status:** ❌ NOT Gated (needs review)

### Autopilot Rules (`autopilot_rules`)
- **Min Tier:** pro
- **Free:** ❌ DISABLED
- **Pro:** 10 rules (total)
- **Family:** 10 rules (total)
- **Page:** Settings/Rules section
- **Status:** ❌ NOT Gated (needs review)

### Financial Autopilot (`financial_autopilot`)
- **Min Tier:** pro
- **Free:** ❌ DISABLED
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** Background feature (automatic actions)
- **Status:** ❌ NOT Gated (needs review)

---

## REPORTING FEATURES (7 features)

### Financial Reports (`financial_reports`)
- **Min Tier:** free
- **Limits:** 🔧 **NOT IN FEATURE_LIMITS**
- **Page:** `/reports`
- **Status:** 🔧 Missing limits definition

### Budget vs Actual (`budget_vs_actual`)
- **Min Tier:** free
- **Limits:** 🔧 **NOT IN FEATURE_LIMITS**
- **Page:** Dashboard / Reports
- **Status:** 🔧 Missing limits definition

### Cash Flow Forecast (`cash_flow_forecast`)
- **Min Tier:** pro
- **Free:** ❌ DISABLED
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/dashboard` (widget)
- **Status:** ✅ Wrapped on dashboard (verify working)

### Money Timeline (`money_timeline`)
- **Min Tier:** free
- **Limits:** 🔧 **NOT IN FEATURE_LIMITS**
- **Page:** Dashboard timeline view
- **Status:** 🔧 Missing limits definition

### Financial Health (`financial_health`)
- **Min Tier:** pro
- **Free:** ❌ DISABLED
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/dashboard` (widget)
- **Status:** ✅ Wrapped on dashboard (verify working)

### CSV Export (`data_export_csv`)
- **Min Tier:** free
- **Free:** 5 exports/month
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** Various export buttons
- **Status:** ❌ NOT Gated (needs review)

### JSON Export (`data_export_json`)
- **Min Tier:** pro
- **Free:** ❌ DISABLED
- **Pro:** 12 exports/year
- **Family:** 12 exports/year
- **Page:** Settings/Export section
- **Status:** ❌ NOT Gated (needs review)

---

## HOUSEHOLD FEATURES (4 features)

### Household Management (`household_management`)
- **Min Tier:** family
- **Free:** ❌ DISABLED
- **Pro:** ❌ DISABLED
- **Family:** unlimited
- **Page:** Settings/Household section
- **Status:** ❌ NOT Gated (needs review)

### Household Members (`household_members`)
- **Min Tier:** family
- **Free:** ❌ DISABLED
- **Pro:** 2 members (owner + 1)
- **Family:** 5 members
- **Page:** Settings/Household section
- **Status:** ❌ NOT Gated (needs review)

### Split Expenses (`split_expenses`)
- **Min Tier:** family
- **Free:** ❌ DISABLED
- **Pro:** ❌ DISABLED
- **Family:** unlimited
- **Page:** `/split-expenses`
- **Status:** ❌ NOT Gated

### Household Invitations (`household_invitations`)
- **Min Tier:** family
- **Free:** ❌ DISABLED
- **Pro:** 5 invitations/month
- **Family:** unlimited
- **Page:** Settings/Household section
- **Status:** ❌ NOT Gated (needs review)

---

## UTILITIES FEATURES (10 features)

### Receipt Scanner (`receipt_scanner`)
- **Min Tier:** free
- **Free:** 10 uploads/month
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/receipts`
- **Status:** ❌ NOT Gated (needs review)

### Financial Vault (`financial_vault`)
- **Min Tier:** pro
- **Free:** ❌ DISABLED
- **Pro:** 50 documents (total)
- **Family:** 100 documents (total)
- **Page:** `/vault`
- **Status:** ✅ **FIXED** - Content wrapped with FeatureGate

### Vault AI Search (`vault_ai_search`)
- **Min Tier:** pro
- **Free:** ❌ DISABLED
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/vault` (AI search feature)
- **Status:** ⚠️ Needs separate gating within vault

### Categories Management (`categories_management`)
- **Min Tier:** free
- **Free:** 20 categories (total)
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/categories`
- **Status:** ❌ NOT Gated

### Merchant Management (`merchant_management`)
- **Min Tier:** free
- **Limits:** 🔧 **NOT IN FEATURE_LIMITS**
- **Page:** `/merchants`
- **Status:** 🔧 Missing limits definition

### Notifications (`notifications`)
- **Min Tier:** free
- **Limits:** 🔧 **NOT IN FEATURE_LIMITS** (likely should be unlimited for all)
- **Page:** Notifications dropdown (global)
- **Status:** 🔧 Missing limits definition

### Security Alerts (`security_alerts`)
- **Min Tier:** pro
- **Free:** ❌ DISABLED
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** `/anomalies`
- **Status:** ❌ NOT Gated (needs review)

### Tax Reporting (`tax_reporting`)
- **Min Tier:** pro
- **Free:** ❌ DISABLED
- **Pro:** 12 reports/year
- **Family:** 12 reports/year
- **Page:** Reports/Tax section
- **Status:** ❌ NOT Gated (needs review)

### Silent Money Leaks Detector (`silent_leaks_detector`)
- **Min Tier:** pro
- **Free:** ❌ DISABLED
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** Dashboard widget or Reports
- **Status:** ❌ NOT Gated (needs review)

### Payday Optimizer (`payday_optimizer`)
- **Min Tier:** pro
- **Free:** ❌ DISABLED
- **Pro:** unlimited
- **Family:** unlimited
- **Page:** Dashboard widget or Planning section
- **Status:** ❌ NOT Gated (needs review)

---

## CRITICAL ISSUES FOUND

### 1. Missing FEATURE_LIMITS Entries (17 features)
These features exist in FEATURES registry but have NO limits defined in FEATURE_LIMITS:

**Banking:**
- `account_sync` - Should sync be limited?
- `account_refresh` - Should refresh be limited?
- `transaction_search` - Should search be limited?

**Tracking:**
- `net_worth_tracking` - Should be unlimited free?
- `investment_tracking` - Should be unlimited free?
- `income_tracking` - Should be unlimited free?
- `spending_analysis` - Should be unlimited free?
- `unmatched_transactions` - Should be unlimited free?
- `subscription_tracking` - Should be unlimited free?

**Planning:**
- `bill_reminders` - Should be unlimited free?
- `calendar_view` - Should be unlimited free?

**Reporting:**
- `financial_reports` - Should be unlimited free?
- `budget_vs_actual` - Should be unlimited free?
- `money_timeline` - Should be unlimited free?

**Utilities:**
- `merchant_management` - Should be unlimited free?
- `notifications` - Should be unlimited free?

### 2. Frontend Not Gated (Priority Order)

**CRITICAL (PRO features accessible to free users):**
1. ✅ `financial_vault` - FIXED (was completely open)
2. `vault_ai_search` - Needs separate gate within vault
3. `debt_payoff_planner` - PRO feature, page exists
4. `what_if_simulator` - PRO feature, page exists
5. `ai_transaction_categorization` - PRO feature
6. `ai_insights` - PRO feature
7. `ai_daily_coach` - PRO feature
8. `security_alerts` - PRO feature, `/anomalies` page
9. `tax_reporting` - PRO feature
10. `silent_leaks_detector` - PRO feature
11. `payday_optimizer` - PRO feature
12. `financial_autopilot` - PRO feature
13. `autopilot_rules` - PRO feature

**HIGH (Family features accessible to free/pro):**
14. `split_expenses` - Family feature, page exists
15. `household_management` - Family feature
16. `household_invitations` - Partially family

**MEDIUM (Limited free features not gated):**
17. `asset_tracking` - 10 assets on free
18. `categories_management` - 20 categories on free
19. `receipt_scanner` - 10 uploads/month on free
20. `ai_assistant` - 10 messages/month on free
21. `receipt_scanning` - 3 scans/month on free
22. `portfolio_advisor` - 1 insight/month on free
23. `ai_budget_suggestions` - 5 requests/month on free
24. `ai_savings_advisor` - 3 requests/month on free
25. `manual_accounts` - 3 accounts on free
26. `transaction_history` - 90 days on free
27. `manual_transactions` - 50/month on free
28. `expense_tracking` - 100/month on free
29. `data_export_csv` - 5/month on free

### 3. Extra Key in FEATURE_LIMITS
- `bank_connections` - Exists in limits but not in FEATURES registry
  - Likely intended to be a combined limit for MX + Plaid
  - Should be removed or proper feature created

---

## PROPOSED SOLUTION: DYNAMIC PLAN-FEATURE MANAGEMENT

### Phase 1: Complete Current Feature Gating (Immediate)
1. ✅ Fix vault, bills, budgets, debts, savings-goals
2. Add limits for 17 missing features
3. Implement FeatureGate on all remaining pages

### Phase 2: Admin UI for Plan Management (New Requirement)
Create admin interface to dynamically configure feature limits per plan:

#### Database Schema
```sql
CREATE TABLE plan_feature_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan VARCHAR(20) NOT NULL,  -- 'free', 'pro', 'family'
  feature_key VARCHAR(100) NOT NULL,
  limit_value INTEGER,  -- null = unlimited, 0 = disabled, N = limit
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  UNIQUE(plan, feature_key)
);
```

#### Admin UI Features
- View all features in a table
- Edit limits per plan
- Enable/disable features per plan
- Bulk operations (copy limits from one plan to another)
- Audit log of limit changes
- Export/import plan configurations

#### API Endpoints
- `GET /api/admin/plans/features` - List all plan-feature configurations
- `PUT /api/admin/plans/:plan/features/:featureKey` - Update a limit
- `POST /api/admin/plans/:plan/features/bulk` - Bulk update
- `GET /api/admin/plans/export` - Export configuration
- `POST /api/admin/plans/import` - Import configuration

#### Migration Strategy
1. Seed `plan_feature_limits` table with current hardcoded FEATURE_LIMITS
2. Modify `getFeatureLimit()` to query database first, fall back to hardcoded
3. Add admin UI for management
4. Eventually remove hardcoded FEATURE_LIMITS after verification

---

## NEXT STEPS

### Immediate (This PR):
1. ✅ Fix vault.tsx (done)
2. Fix all other missing FeatureGate implementations
3. Add missing FEATURE_LIMITS entries
4. Test comprehensively

### Future PRs:
1. Design and implement plan_feature_limits table
2. Build admin UI for plan-feature management
3. Add API endpoints for dynamic configuration
4. Migrate from hardcoded to database-driven limits
5. Add feature usage analytics dashboard for admins

---

## TESTING CHECKLIST

### Free User Testing:
- [ ] Can see 0-4 bills, blurred at 5/5
- [ ] Can see 0-1 budgets, blurred at 2/2
- [ ] Can see 0-2 debts, blurred at 3/3
- [ ] Can see 0 goals, blurred at 1/1
- [ ] Cannot access vault (blurred immediately)
- [ ] Cannot access debt payoff planner (blurred)
- [ ] Cannot access what-if simulator (blurred)
- [ ] Dashboard: Cash Flow Forecast blurred
- [ ] Dashboard: Financial Health blurred

### Pro User Testing:
- [ ] Unlimited bills, budgets, debts, goals
- [ ] Can access vault (50 docs limit)
- [ ] Can access all PRO features
- [ ] Cannot access household features (blurred)

### Family User Testing:
- [ ] Unlimited everything
- [ ] Can access household features
- [ ] Can access split expenses
