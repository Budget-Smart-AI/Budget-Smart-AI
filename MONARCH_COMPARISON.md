# Monarch Money vs Budget Smart AI — Feature Comparison

*Reviewed April 11, 2026 from live Monarch account (app.monarch.com)*

---

## What Monarch Has That We're Missing or Could Improve

### 1. Sankey Diagram (Cash Flow Visualization)
**Monarch:** Cash Flow page has a Sankey Diagram view showing money flowing from income sources → categories → subcategories. Beautiful visual that makes it instantly clear where money goes.
**Budget Smart:** No Sankey diagram. Cash flow forecast exists but is forward-looking only, not a retrospective flow visualization.
**Priority:** HIGH — This is a signature Monarch feature that users love. Would be a strong differentiator addition.

### 2. Transaction Rules Engine
**Monarch:** Settings → Rules. Condition-based automation: "If merchant name contains X AND debit > $0 → Recategorize to Y + Add tag Z." Multiple conditions per rule, drag-and-drop priority ordering, applies retroactively.
**Budget Smart:** No transaction rules engine. We have auto-categorization via Plaid PFC, but no user-defined rules for renaming, recategorizing, tagging, or splitting transactions.
**Priority:** HIGH — Power users need this. Reduces manual recategorization work significantly.

### 3. Savings Rate Metric
**Monarch:** Cash Flow page prominently displays "Savings Rate" (0%, 5.7%, etc.) alongside Income, Expenses, and Total Savings. Also shows in Reports.
**Budget Smart:** No explicit savings rate calculation displayed anywhere. We show income and expenses but don't compute/display the savings rate percentage.
**Priority:** MEDIUM — Easy to implement, valuable metric that motivates users.

### 4. Customizable Dashboard Widgets
**Monarch:** Dashboard has a "Customize" button allowing users to show/hide widgets (Spending, Transactions, Budget, Recurring, Credit Score, Investments, Net Worth, Goals, Advice). Each widget has its own gear icon for settings.
**Budget Smart:** Dashboard exists but widgets are fixed/hardcoded. No user customization of which widgets appear or their order.
**Priority:** MEDIUM — Improves personalization and reduces clutter.

### 5. Weekly Recap
**Monarch:** Dashboard shows "Your Weekly Recap" — a summary of net worth changes, spending changes, and what's coming up this week.
**Budget Smart:** No weekly recap or summary feature.
**Priority:** MEDIUM — Great engagement feature. Could also be an email digest.

### 6. Credit Score Tracking
**Monarch:** Dashboard widget for credit score tracking with "Enable credit score" option. Tracks score over time right in the app.
**Budget Smart:** No credit score tracking.
**Priority:** LOW-MEDIUM — Nice to have. Requires integration with a credit bureau API (TransUnion, Equifax).

### 7. Recurring Transaction Detection + Bill Sync
**Monarch:** Recurring page auto-detects recurring merchants/accounts ("42 new recurring merchants for you to review"). Has List/Calendar views, separate Income/Expenses/Credit Cards sections, and "Set up bill sync" for credit cards. Monthly and All Recurring views.
**Budget Smart:** We have Bills and Subscriptions pages, but no automatic detection of recurring transactions from transaction history. Users must manually add bills.
**Priority:** HIGH — Auto-detection of recurring charges is table stakes for modern PFM apps. We have the transaction data to do this.

### 8. Investment Benchmarking
**Monarch:** Investments page compares "Your Portfolio" performance against S&P 500, US Stocks, US Bonds. Shows "Backtested Performance" chart. Multiple time ranges (1W to 5Y).
**Budget Smart:** Investments page exists but lacks benchmark comparison. Only shows holdings and basic performance.
**Priority:** MEDIUM — Makes the investments page much more useful for users who want to evaluate their portfolio.

### 9. Investment Allocation View
**Monarch:** Separate "Allocation" tab showing asset class breakdown (Stock/Bond/Cash/etc.) with percentage chart and table by class.
**Budget Smart:** No allocation breakdown view.
**Priority:** MEDIUM — Standard feature for investment tracking.

### 10. Goals with Visual Cards + Status Badges
**Monarch:** Goals (Beta) shows visual cards with images, progress bars, and status badges (On Track / At Risk / Completed). "Save Up" and "Pay Down" tabs.
**Budget Smart:** We have Savings Goals and Debt Payoff but they lack the visual polish — no images, no status badges, no risk indicators.
**Priority:** MEDIUM — UI/UX improvement that makes goal tracking more engaging.

### 11. Personalized Financial Advice
**Monarch:** Dedicated "Advice" page with categorized recommendations (Save Up, Spend, Pay Down, Protect, Invest, Wellness). Questionnaire-driven personalization. Action items with progress tracking.
**Budget Smart:** AI Coach/Assistant exists but it's chat-based. No structured advice page with categorized actionable recommendations.
**Priority:** MEDIUM — Our AI chat is arguably more powerful, but the structured advice format is easier to act on.

### 12. Transaction Tags
**Monarch:** Transactions can be tagged (e.g., "Subscription" tag). Tags are separate from categories and can be applied via Rules.
**Budget Smart:** No tagging system for transactions. Only categories.
**Priority:** MEDIUM — Tags provide a second dimension of organization that power users want (e.g., "Tax Deductible", "Business", "Reimbursable").

### 13. Merchant Management
**Monarch:** Settings → Merchants. Dedicated merchant management page for renaming and customizing how merchants appear.
**Budget Smart:** We have a Merchants page (/merchants) and Settings → Merchants, but should verify the customization depth matches.
**Priority:** LOW — We likely have parity here already.

### 14. Spending Report Donut Chart
**Monarch:** Reports → Spending shows a polished donut chart with category breakdown, totals/percentages, and "Change" toggle to show trends.
**Budget Smart:** Reports page exists. Verify if we have donut/pie chart for spending breakdown.
**Priority:** LOW — Visual polish item.

### 15. Multi-Chart Type Options in Reports
**Monarch:** Reports page offers 4+ chart type toggles (Sankey, stacked bar, grouped bar, line) plus "By category & group" and "By merchant" grouping. Download/export button.
**Budget Smart:** Reports exist but may not have the same variety of visualizations.
**Priority:** MEDIUM — More chart options = more flexibility for users to understand their data.

### 16. Budget with Decade View
**Monarch:** Budget page has Month / Year / Decade time toggles. Decade view lets users see long-term budget trends.
**Budget Smart:** Budgets are monthly. No yearly or decade aggregate view.
**Priority:** LOW — Year view would be useful; decade is nice-to-have.

### 17. Household Members
**Monarch:** Settings → Members under "Household" section. Multi-user household support.
**Budget Smart:** We have Household Settings (/settings/household). Should verify it supports inviting/managing multiple household members with shared data.
**Priority:** MEDIUM — If we don't have full invite flow, this is important for couples/families.

### 18. Data Export / Download CSV
**Monarch:** "Download CSV" link on Accounts page summary. Export buttons on charts/reports.
**Budget Smart:** Verify if we have CSV/data export across pages.
**Priority:** MEDIUM — Data portability is increasingly important and sometimes legally required.

---

## What Budget Smart AI Has That Monarch Doesn't

These are our advantages and differentiators:

1. **AI Chat Assistant** — Our AI-powered financial assistant is more advanced than Monarch's structured advice. Chat-based interface for natural language questions about finances.

2. **What-If Simulator** — Scenario planning tool. Monarch has nothing comparable.

3. **TaxSmart AI** — Tax optimization and reporting. Monarch has no tax features.

4. **Receipt Scanner** — OCR-based receipt capture and matching. Monarch has a "Receipts" tab on Transactions but it appears to be for manual attachment, not OCR scanning.

5. **Financial Vault** — Secure document storage. Monarch has no vault feature.

6. **Split Expenses** — Expense splitting for shared costs. Monarch has no split feature.

7. **Security Alerts / Anomaly Detection** — AI-powered unusual transaction alerts. Monarch has no equivalent.

8. **Debt Payoff Calculator** — Dedicated debt payoff strategies (avalanche/snowball). Monarch's "Pay Down" goals tab is still 404/not launched.

9. **Separate Assets & Liabilities Pages** — Dedicated pages for non-account assets and liabilities. Monarch bundles everything under Accounts.

10. **MX Integration** — Dual aggregator support (Plaid + MX). Monarch appears to be Plaid-only or uses their own integration.

11. **Demo Mode** — Public demo without signup. Monarch requires account creation.

12. **Admin Panel** — Full admin dashboard for user management, system status, communications. (B2B/internal advantage.)

13. **Affiliate Program** — Built-in affiliate/referral system. Monarch has "Gift Monarch" and "Referrals" but our affiliate system appears more robust.

14. **Multi-Currency Support** — Exchange rates and multi-currency handling for Canadian users.

---

## Quick-Win Improvements (Implement This Week)

1. **Savings Rate** — Add to dashboard and cash flow. Simple calculation: (Income - Expenses) / Income × 100.

2. **Recurring auto-detection** — We have transaction history. Run pattern matching to surface recurring merchants and amounts, then prompt users to confirm.

3. **Transaction Tags** — Add a tags field to transactions alongside category. Low effort, high user value.

4. **Budget Year View** — Aggregate monthly budgets into a yearly summary table.

---

## Medium-Term Features (Next Sprint)

1. **Transaction Rules Engine** — If/Then automation for categorization, renaming, tagging.

2. **Sankey Diagram** — Cash flow visualization. Use D3 or a React Sankey library.

3. **Customizable Dashboard** — Let users hide/show/reorder dashboard widgets.

4. **Weekly Recap** — Automated summary of weekly financial changes (dashboard widget + optional email).

5. **Investment Benchmarking** — Compare portfolio against S&P 500 / TSX using free market data APIs.

---

## Notes

- Monarch's UI is clean, minimal, and fast. Their sidebar is icon-only (expandable), which saves horizontal space.
- They use emoji icons for categories consistently, which adds visual personality.
- Account balance sparkline charts next to each account are a nice touch — shows recent trend at a glance.
- Their "42 new recurring merchants to review" banner is excellent UX — surfaces action items proactively.
- The Sankey diagram in Reports is probably their most distinctive visual feature.
- Budget Smart AI has significantly MORE features overall (TaxSmart, Vault, Simulator, AI Chat, Receipt Scanner, Split Expenses, Anomaly Detection), but Monarch's core features are more polished visually.
