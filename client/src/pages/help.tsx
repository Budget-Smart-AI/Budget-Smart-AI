import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Search, LayoutDashboard, Bot, BarChart3, DollarSign, CreditCard, Receipt, RefreshCw, Building2, Wallet, Target, Tag, Settings, Bell, Shield, Download, Smartphone, Lock, TrendingUp } from "lucide-react";
import { HelpModuleCard, type ModuleConfig } from "@/components/help-module-card";
import { HelpNavSidebar, type NavGroup } from "@/components/help-nav-sidebar";

// ── Module data ─────────────────────────────────────────────────────────────

const MODULES: ModuleConfig[] = [
  {
    id: "dashboard",
    icon: LayoutDashboard,
    name: "Dashboard",
    category: "Finance",
    description:
      "The Dashboard is your financial command center. It surfaces a real-time snapshot of your net worth, spending trends, upcoming bills, and budget health so you can make smart money decisions without digging through menus.",
    capabilities: [
      "View your total net worth and account balances at a glance",
      "Monitor monthly income vs. expenses with visual charts",
      "See upcoming bills and reminders in the next 30 days",
      "Check budget progress across all active categories",
      "Review recent transactions and flag anything unusual",
      "Access AI-generated financial health insights and tips",
    ],
    faqs: [
      {
        question: "Why don't my balances match my bank statement?",
        answer:
          "BudgetSmart syncs with your bank accounts via Plaid or MX, which typically updates balances within a few hours of a transaction posting. If you see a discrepancy, try manually refreshing the account or waiting until the next scheduled sync cycle.",
      },
      {
        question: "Can I customize which widgets appear on the Dashboard?",
        answer:
          "Currently the Dashboard layout is optimized for the most useful financial signals, but you can collapse or expand individual sections. Widget customization is on our roadmap for a future release.",
      },
      {
        question: "What does the Financial Health Score mean?",
        answer:
          "The Financial Health Score is an AI-calculated index (0–100) based on your savings rate, debt-to-income ratio, emergency fund coverage, and spending trends. A higher score reflects stronger financial habits — you can tap the score to see a detailed breakdown.",
      },
    ],
  },
  {
    id: "ai-advisor",
    icon: Bot,
    name: "AI Advisor",
    category: "AI & Insights",
    description:
      "The AI Advisor is a conversational financial assistant trained on your real spending data and Canadian financial context. Ask it anything about your money — from TFSA contribution room to whether you can afford a vacation — and it'll give you a contextual, data-backed answer.",
    capabilities: [
      "Ask natural-language questions about your finances",
      "Get personalized budget recommendations based on your spending",
      "Receive TFSA, RRSP, and FHSA optimization suggestions",
      "Analyze spending patterns and identify savings opportunities",
      "Get explanations for financial concepts in plain English",
      "Request a monthly financial summary or forecast",
    ],
    faqs: [
      {
        question: "Is the AI advice professionally certified?",
        answer:
          "No — AI Advisor responses are informational only and do not constitute professional financial, tax, or investment advice. Always consult a licensed financial advisor before making significant financial decisions.",
      },
      {
        question: "Does the AI know about Canadian accounts like TFSA and RRSP?",
        answer:
          "Yes — the AI Advisor is trained with Canadian tax and investment context, including TFSA, RRSP, FHSA, and RESP accounts. It understands contribution limits, tax implications, and optimal withdrawal strategies.",
      },
      {
        question: "Which AI model powers the advisor?",
        answer:
          "BudgetSmart uses GPT-4o or DeepSeek depending on your region and server configuration. Both models are capable of detailed financial reasoning and are kept up to date with the latest model releases.",
      },
    ],
  },
  {
    id: "transactions",
    icon: CreditCard,
    name: "Transactions",
    category: "Finance",
    description:
      "The Transactions page gives you a complete, searchable ledger of every financial movement across all your connected accounts. Filter by date, category, merchant, or amount — then edit, split, or export as needed.",
    capabilities: [
      "View all transactions from connected and manual accounts in one place",
      "Filter by date range, account, category, merchant, or amount",
      "Search transactions by merchant name or description",
      "Manually add transactions not captured by bank sync",
      "Edit transaction categories or split a transaction across multiple budgets",
      "Export your full transaction history to CSV",
    ],
    faqs: [
      {
        question: "How far back do my transaction records go?",
        answer:
          "BudgetSmart retains your full transaction history indefinitely — transactions are never deleted from your account. Depending on your bank's Plaid/MX connection, initial import may pull 30–90 days of history.",
      },
      {
        question: "Can I split a transaction between two categories?",
        answer:
          "Yes. Open any transaction and use the Split option to divide it across multiple categories with custom amounts. This is useful for grocery trips where you want to separate food from household items.",
      },
      {
        question: "Why is a transaction showing the wrong category?",
        answer:
          "Categories are auto-assigned based on the merchant name and transaction type. You can manually correct the category by clicking on it. If you consistently override a merchant's category, BudgetSmart will remember your preference going forward.",
      },
    ],
  },
  {
    id: "budget-management",
    icon: Target,
    name: "Budget Management",
    category: "Finance",
    description:
      "Budget Management lets you set monthly spending limits for any category and tracks your progress in real time. Compare budgeted vs. actual amounts, enable rollover, and receive alerts before you overspend.",
    capabilities: [
      "Create monthly budgets for any spending category",
      "Set a spending limit per category with an optional rollover",
      "View a real-time progress bar showing budget vs. actual spend",
      "Enable budget alerts to be notified at 80% and 100% of limit",
      "Review budget performance history month over month",
      "Get AI-powered recommendations for realistic budget amounts",
    ],
    faqs: [
      {
        question: "What is budget rollover and how does it work?",
        answer:
          "Rollover carries unused budget from one month into the next. For example, if you budget $200 for dining but only spend $150, the remaining $50 rolls over to give you a $250 dining budget next month. Toggle rollover on or off per category in budget settings.",
      },
      {
        question: "Can I set different budgets for different months?",
        answer:
          "Currently budgets repeat monthly at the same amount. You can update a budget at any time and the change applies from the current month forward. Seasonal or one-time overrides are on our product roadmap.",
      },
      {
        question: "How do budget alerts work?",
        answer:
          "When you enable alerts for a budget category, BudgetSmart sends an in-app notification (and optionally an email) when you reach 80% of your limit and again when you hit 100%. You can configure alert thresholds in your notification preferences.",
      },
    ],
  },
  {
    id: "income-tracking",
    icon: DollarSign,
    name: "Income Tracking",
    category: "Finance",
    description:
      "Income Tracking lets you log, categorize, and forecast every income source — from salary and freelance to rental income and dividends. Understand exactly how much you earn and how it changes over time.",
    capabilities: [
      "Add recurring income sources with frequency and start date",
      "Log one-time income payments with custom categories",
      "View total projected monthly income from all sources",
      "Track net income after taxes and deductions",
      "See income trends on a month-over-month chart",
      "Export income history for tax preparation",
    ],
    faqs: [
      {
        question: "Can I track multiple income sources?",
        answer:
          "Yes — there is no limit on the number of income sources you can add. Common examples include salary, freelance contracts, rental income, side businesses, government benefits, and investment distributions.",
      },
      {
        question: "How do I handle irregular income like commissions?",
        answer:
          "Use the 'one-time' income type for variable payments and enter them as they arrive. For estimated variable income you can create a recurring entry with your average monthly amount and adjust it as needed.",
      },
      {
        question: "Does BudgetSmart automatically detect income from my bank?",
        answer:
          "Yes — when a transaction is categorized as income (e.g., payroll deposits, e-transfers), BudgetSmart can auto-detect and suggest adding it to your income records. You review and confirm before it is saved.",
      },
    ],
  },
  {
    id: "expenses",
    icon: Receipt,
    name: "Expenses",
    category: "Finance",
    description:
      "The Expenses module provides a dedicated view of your one-time and discretionary spending, separate from recurring bills. Categorize, tag, and analyse where your money goes beyond fixed obligations.",
    capabilities: [
      "View all non-recurring expenses in a dedicated list",
      "Add manual expense entries with merchant, amount, date, and category",
      "Filter expenses by category, date range, or merchant",
      "See spending totals broken down by category for any period",
      "Identify top spending categories with summary charts",
      "Export expense data to CSV for budgeting or tax purposes",
    ],
    faqs: [
      {
        question: "What is the difference between Expenses and Transactions?",
        answer:
          "Transactions shows every movement across all your accounts including transfers, income, and bill payments. Expenses is a filtered view focused specifically on spending entries — making it easier to analyse where money is going without clutter.",
      },
      {
        question: "How do I add a cash expense that won't appear in my bank feed?",
        answer:
          "Go to Expenses → Add Expense and fill in the merchant, amount, date, and category. Manual entries are treated identically to bank-synced transactions for budgeting and reporting purposes.",
      },
      {
        question: "Can I attach a receipt to an expense?",
        answer:
          "Yes — you can link a scanned receipt to any expense entry. Upload the receipt via the Receipt Scanning module, and it will be matched to the corresponding expense automatically or you can link it manually.",
      },
    ],
  },
  {
    id: "bills-reminders",
    icon: Bell,
    name: "Bills & Reminders",
    category: "Finance",
    description:
      "Bills & Reminders tracks all your recurring obligations — rent, utilities, insurance, loan payments — and sends you timely reminders so you never miss a due date or incur a late fee.",
    capabilities: [
      "Add recurring bills with amount, due day, and recurrence pattern",
      "Receive email or in-app reminders before each bill is due",
      "Mark bills as paid and track payment history",
      "View a calendar of upcoming due dates for the next 30 days",
      "See overdue bills highlighted for immediate attention",
      "Set custom reminder lead times (1, 3, 7 days before due)",
    ],
    faqs: [
      {
        question: "How do I set up a reminder for a bill?",
        answer:
          "When adding or editing a bill, toggle on 'Reminders' and choose how many days in advance you want to be notified (1, 3, or 7 days). You can receive alerts via in-app notification, email, or both depending on your notification preferences.",
      },
      {
        question: "Can I track variable bills like utilities that change each month?",
        answer:
          "Yes — create the bill with your average amount. After you receive each actual statement, update the amount before marking it paid. This keeps your spending history accurate while still triggering reminders on time.",
      },
      {
        question: "What happens when I mark a bill as paid?",
        answer:
          "Marking a bill paid records the payment in your transaction history with today's date and the bill amount. The bill then resets to the next scheduled due date automatically based on its recurrence pattern.",
      },
    ],
  },
  {
    id: "subscriptions",
    icon: RefreshCw,
    name: "Subscriptions",
    category: "Finance",
    description:
      "Subscriptions automatically detects and tracks your recurring SaaS, streaming, and membership charges. See your total monthly subscription spend, identify unused services, and cancel what you no longer need.",
    capabilities: [
      "View all detected recurring subscriptions in one place",
      "See total monthly and annual subscription cost",
      "Identify subscriptions you may have forgotten about",
      "Set per-subscription reminders for upcoming renewal dates",
      "Add manual subscriptions not auto-detected",
      "Track price changes over time for each subscription",
    ],
    faqs: [
      {
        question: "How does BudgetSmart detect my subscriptions?",
        answer:
          "BudgetSmart analyses your transaction history for recurring charges from the same merchant at consistent intervals. These are automatically tagged as subscriptions and grouped in the Subscriptions view for easy review.",
      },
      {
        question: "A subscription shows the wrong amount — how do I fix it?",
        answer:
          "Click on the subscription and edit the amount to reflect the current billing. This is common after a price increase. Future detected charges will update the amount automatically.",
      },
      {
        question: "Can I cancel a subscription from within BudgetSmart?",
        answer:
          "BudgetSmart doesn't have direct integration to cancel subscriptions — you'll need to cancel through the service provider directly. However, we provide the merchant name and billing date so you can act quickly.",
      },
    ],
  },
  {
    id: "bank-accounts",
    icon: Building2,
    name: "Bank Accounts",
    category: "Accounts",
    description:
      "Connect your Canadian and US bank accounts, credit cards, and investment accounts via Plaid or MX for automatic transaction sync. BudgetSmart never stores your banking credentials — authentication is handled entirely by Plaid and MX.",
    capabilities: [
      "Connect accounts from major Canadian and US financial institutions",
      "Automatic transaction sync multiple times per day",
      "View current and available balances for all accounts",
      "Reconnect accounts when authentication expires",
      "Remove accounts you no longer want to track",
      "See a unified balance sheet across all connected institutions",
    ],
    faqs: [
      {
        question: "Are my banking credentials stored by BudgetSmart?",
        answer:
          "No — BudgetSmart never sees or stores your banking username or password. Authentication is handled entirely by Plaid and MX, which use bank-grade OAuth flows. BudgetSmart only receives read-only transaction and balance data.",
      },
      {
        question: "Which banks are supported?",
        answer:
          "BudgetSmart supports most major Canadian financial institutions (including RBC, TD, Scotiabank, BMO, CIBC, and credit unions) as well as US banks via Plaid and MX. If your institution isn't supported, you can manually enter transactions.",
      },
      {
        question: "Why is my account showing a connection error?",
        answer:
          "Connection errors usually mean your bank's OAuth token has expired, which happens periodically for security reasons. Click 'Reconnect' next to the affected account and log in again through the secure Plaid or MX flow to restore the connection.",
      },
    ],
  },
  {
    id: "reports-analytics",
    icon: BarChart3,
    name: "Reports & Analytics",
    category: "AI & Insights",
    description:
      "Reports & Analytics gives you powerful visual insights into your financial data. Choose from pre-built report types or customise date ranges and categories to understand exactly how your money flows over time.",
    capabilities: [
      "Generate income vs. expense reports for any date range",
      "View category breakdowns as pie charts and bar charts",
      "Analyse month-over-month spending trends",
      "Compare actual spend against budget targets",
      "Generate net worth progression reports over time",
      "Export any report to PDF or CSV for sharing or filing",
    ],
    faqs: [
      {
        question: "How far back can I run a report?",
        answer:
          "Reports can cover any date range from your earliest transaction through today. For best performance on large date ranges, reports are paginated by month. You can also export the full dataset to CSV for analysis in Excel or Google Sheets.",
      },
      {
        question: "Can I schedule reports to be sent automatically?",
        answer:
          "Automated monthly summary reports can be enabled in Email Settings. BudgetSmart will email you a PDF summary of the previous month's finances on the 1st of each month. Custom report scheduling is planned for a future release.",
      },
      {
        question: "How do I export a report?",
        answer:
          "On any report page, click the Export button in the top-right corner and choose between CSV (for spreadsheets) or PDF (for sharing or printing). The export includes all data visible in the current report view.",
      },
    ],
  },
  {
    id: "financial-vault",
    icon: Lock,
    name: "Financial Vault",
    category: "Storage",
    description:
      "The Financial Vault is a secure encrypted document storage area within BudgetSmart where you can store tax returns, insurance policies, loan agreements, and other important financial documents. All files are encrypted at rest using AES-256-GCM.",
    capabilities: [
      "Upload and securely store financial documents",
      "Organise documents into named categories",
      "Search documents by file name, category, or upload date",
      "Preview documents directly in the browser",
      "Download or delete documents at any time",
      "Use AI to ask questions about the contents of a document",
    ],
    faqs: [
      {
        question: "What file types can I upload?",
        answer:
          "The Financial Vault supports PDF, JPG, PNG, and DOCX files. For best compatibility and readability, PDF is recommended for multi-page documents. Maximum file size per upload is 10 MB.",
      },
      {
        question: "How secure are my documents?",
        answer:
          "Every document is encrypted with AES-256-GCM at rest before it is written to storage. Your documents are not accessible to BudgetSmart staff. Only you can view or download files from your Vault using your authenticated session.",
      },
      {
        question: "Is there a storage limit?",
        answer:
          "Storage limits vary by subscription plan. Please contact support for current limits on your plan, or check your account settings for usage details.",
      },
    ],
  },
  {
    id: "receipt-scanning",
    icon: Receipt,
    name: "Receipt Scanning",
    category: "AI & Insights",
    description:
      "Receipt Scanning uses AI to extract key data from uploaded receipt images — merchant name, amount, date, and category — and automatically links the result to a matching transaction in your ledger.",
    capabilities: [
      "Upload receipt photos taken with your phone camera",
      "AI extracts merchant, total amount, date, and category automatically",
      "Review and confirm extracted data before saving",
      "Receipts are linked to the corresponding transaction",
      "Store receipt images permanently for expense tracking and tax prep",
      "Search receipts by merchant, amount, or date",
    ],
    faqs: [
      {
        question: "What image formats are supported for receipt upload?",
        answer:
          "You can upload receipt images in JPG, PNG, or PDF format. For best OCR accuracy, ensure the image is well-lit, in focus, and the receipt text is not obscured. Maximum file size is 10 MB.",
      },
      {
        question: "What data is extracted from a receipt automatically?",
        answer:
          "The receipt scanner extracts merchant name, total amount, date of purchase, individual line items when available, and suggests a spending category. You can review and edit all extracted data before confirming.",
      },
      {
        question: "How does a scanned receipt link to a transaction?",
        answer:
          "After extraction, BudgetSmart attempts to match the receipt to an existing transaction based on merchant name, amount, and date. If a match is found, the receipt is attached to that transaction. You can also manually select the matching transaction.",
      },
    ],
  },
  {
    id: "investment-portfolio",
    icon: TrendingUp,
    name: "Investment Portfolio",
    category: "Accounts",
    description:
      "Investment Portfolio Tracking lets you manually log your holdings across TFSAs, RRSPs, FHSAs, non-registered accounts, and crypto wallets. Get a unified view of your total invested assets and AI-powered performance insights.",
    capabilities: [
      "Add investment holdings with ticker, quantity, and account type",
      "Track portfolio value across multiple account types",
      "See unrealised gain/loss per holding and overall",
      "Receive AI-powered insights on portfolio diversification",
      "View asset allocation breakdown by type and sector",
      "Monitor historical portfolio value over time",
    ],
    faqs: [
      {
        question: "How is my portfolio value calculated?",
        answer:
          "Portfolio value is calculated by multiplying the number of shares or units you hold by the current market price, which is pulled from financial market data feeds. Prices are updated daily on trading days.",
      },
      {
        question: "What asset types are supported?",
        answer:
          "BudgetSmart supports equities (stocks and ETFs), mutual funds, fixed income (GICs, bonds), real estate investment trusts, and cryptocurrencies. You can also add custom asset entries for assets not available in the database.",
      },
      {
        question: "How is this different from my connected bank investment accounts?",
        answer:
          "Connected bank accounts (via Plaid/MX) show cash and transaction data but not detailed holdings. The Investment Portfolio module is where you manually track individual holdings, asset allocation, and performance — giving you a much richer investment picture.",
      },
    ],
  },
  {
    id: "categories-merchants",
    icon: Tag,
    name: "Categories & Merchants",
    category: "Finance",
    description:
      "The Categories & Merchants module lets you define your own spending categories, manage merchant display preferences, and control how transactions are automatically categorised across BudgetSmart.",
    capabilities: [
      "Create, edit, and delete custom spending categories",
      "Assign default categories to specific merchants",
      "Bulk-recategorise transactions by merchant",
      "Toggle between enriched merchant names and raw descriptions",
      "Set merchant icons and colours for visual clarity",
      "Review uncategorised transactions and assign categories in bulk",
    ],
    faqs: [
      {
        question: "How does automatic categorisation work?",
        answer:
          "When a transaction is imported, BudgetSmart matches the merchant name against a library of known merchants and assigns the most likely category. You can always override this and BudgetSmart will remember your preference for that merchant going forward.",
      },
      {
        question: "Can I rename or merge categories?",
        answer:
          "Yes — you can rename any category in the Categories settings. Merging two categories requires reassigning all transactions from one category to another, which can be done using the bulk-recategorise function on the Transactions page.",
      },
      {
        question: "What is 'enriched merchant display' vs raw?",
        answer:
          "Raw mode shows the exact description from your bank statement (e.g., 'SQ *COFFEE SHOP 12345'). Enriched mode shows a clean, human-readable merchant name (e.g., 'Blue Bottle Coffee'). You can toggle between modes in Merchant Settings.",
      },
    ],
  },
  {
    id: "notifications-alerts",
    icon: Bell,
    name: "Notifications & Alerts",
    category: "Settings",
    description:
      "Notifications & Alerts keep you informed about the financial events that matter most — from approaching budget limits and upcoming bills to unusual spending patterns and account sync failures.",
    capabilities: [
      "Configure which events trigger in-app or email notifications",
      "Set budget alert thresholds (e.g., 80% and 100% of budget used)",
      "Receive bill due date reminders with custom lead times",
      "Get anomaly alerts for unusual or potentially fraudulent transactions",
      "Enable or disable the weekly financial summary email",
      "View your notification history in the Notifications panel",
    ],
    faqs: [
      {
        question: "How do I stop receiving email notifications?",
        answer:
          "Go to Settings → Notifications and toggle off 'Email Notifications'. You can also unsubscribe from individual notification types while keeping others active. All email footers include an unsubscribe link.",
      },
      {
        question: "What triggers an anomaly alert?",
        answer:
          "Anomaly alerts are triggered by our AI when it detects transactions that are statistically unusual compared to your spending history — such as a charge significantly above your normal spending for a merchant, or a transaction from an unfamiliar location.",
      },
      {
        question: "Can I change the time of day notifications are sent?",
        answer:
          "Notification timing for bill reminders is set to 8 AM in your configured timezone by default. Custom delivery time preferences are on our product roadmap. Real-time in-app alerts fire immediately when the event occurs.",
      },
    ],
  },
  {
    id: "account-settings",
    icon: Settings,
    name: "Account Settings",
    category: "Settings",
    description:
      "Account Settings is where you manage your personal profile, display preferences, timezone, and household configuration. Keep your contact information up to date to ensure you receive important notifications.",
    capabilities: [
      "Update your display name, email address, and profile photo",
      "Set your timezone for accurate due date and reminder timing",
      "Configure household members and shared access permissions",
      "Manage your connected professional advisors",
      "Update billing information and subscription plan",
      "Download or delete your account and all associated data",
    ],
    faqs: [
      {
        question: "How do I change my email address?",
        answer:
          "Go to Settings → Profile and update your email address. A verification email will be sent to the new address — you must confirm it before the change takes effect. Your old email remains active until the new one is verified.",
      },
      {
        question: "Can I add other people to my BudgetSmart account?",
        answer:
          "Yes — the Household Settings section lets you invite a partner or family member. They receive a separate login but can view shared financial data based on the permissions you configure.",
      },
      {
        question: "How do I delete my account?",
        answer:
          "To permanently delete your account, go to Settings → Account → Delete Account. This action is irreversible and will remove all your data, transactions, documents, and settings within 30 days. You will receive a confirmation email before deletion is finalised.",
      },
    ],
  },
  {
    id: "security-privacy",
    icon: Shield,
    name: "Security & Privacy",
    category: "Settings",
    description:
      "BudgetSmart uses industry-leading security practices to protect your financial data, including AES-256-GCM field-level encryption, secure session management, two-factor authentication, and an ongoing SOC 2 certification program.",
    capabilities: [
      "Enable two-factor authentication (TOTP) for your account",
      "View active login sessions and revoke unfamiliar ones",
      "Set up backup codes for account recovery",
      "Review your account's security audit log",
      "Configure session timeout preferences",
      "Understand how your data is encrypted and protected",
    ],
    faqs: [
      {
        question: "What happens after too many failed login attempts?",
        answer:
          "Your account is automatically locked for 30 minutes after 5 consecutive failed login attempts. This protects against brute-force attacks. You can also request an unlock via the password reset flow if you need immediate access.",
      },
      {
        question: "Is BudgetSmart SOC 2 certified?",
        answer:
          "SOC 2 Type II certification is currently in progress, targeting completion in August 2026. We already implement the core security controls required — including encryption at rest, access logging, and vulnerability management — and are working with an independent auditor to formalise certification.",
      },
      {
        question: "How is my financial data encrypted?",
        answer:
          "All sensitive financial fields are encrypted using AES-256-GCM at the field level before being written to the database. This means even if the database were compromised, individual data fields would remain unreadable without the encryption key.",
      },
    ],
  },
  {
    id: "billing-subscription",
    icon: Wallet,
    name: "Billing & Subscription",
    category: "Settings",
    description:
      "Billing & Subscription Management lets you view your current plan, upgrade or downgrade, update payment methods, and review your invoice history. All payments are processed securely via Stripe.",
    capabilities: [
      "View your current subscription plan and renewal date",
      "Upgrade to a higher tier or downgrade to a lower plan",
      "Update your credit card or payment method on file",
      "Download past invoices for accounting or tax records",
      "Cancel your subscription at any time (effective at period end)",
      "Redeem promotional codes or affiliate discounts",
    ],
    faqs: [
      {
        question: "What happens to my data if I cancel my subscription?",
        answer:
          "Your data is retained for 90 days after cancellation in case you resubscribe. After 90 days, your account and all associated data is permanently deleted. You can export your data at any time before cancellation.",
      },
      {
        question: "How do I update my payment method?",
        answer:
          "Go to Settings → Billing → Payment Method and click 'Update Card'. You'll be directed to a secure Stripe-hosted form where you can enter new card details. BudgetSmart never sees or stores your full card number.",
      },
      {
        question: "Is there a free trial?",
        answer:
          "Yes — BudgetSmart offers a 14-day free trial on all paid plans. No credit card is required to start the trial. You'll be reminded 3 days before the trial ends and can choose a plan or let it expire.",
      },
    ],
  },
  {
    id: "data-export",
    icon: Download,
    name: "Data Export",
    category: "Settings",
    description:
      "Data Export lets you download a complete copy of your BudgetSmart data at any time — transactions, budgets, income records, and more — in CSV or JSON format for use in other tools or for your own records.",
    capabilities: [
      "Export all transactions to CSV with full metadata",
      "Export budget history, income records, and bill data",
      "Download a full account data archive in JSON format",
      "Filter exports by date range or data type",
      "Schedule automated monthly data exports by email",
      "Export investment portfolio holdings and performance history",
    ],
    faqs: [
      {
        question: "What data is included in a full export?",
        answer:
          "A full export includes all transactions (with merchant, amount, date, category, and account), budget configurations, income records, bills and reminders, and account metadata. Financial Vault documents are not included in data exports and must be downloaded individually.",
      },
      {
        question: "Can I import exported data into another app?",
        answer:
          "The CSV export format is compatible with most personal finance apps including Quicken, YNAB, and Google Sheets. Check the target app's import documentation for column mapping requirements.",
      },
      {
        question: "How long does an export take?",
        answer:
          "Most exports complete in under 30 seconds. For very large accounts with several years of transaction history, exports may take up to 2 minutes. You'll receive an in-app notification and email when your export is ready to download.",
      },
    ],
  },
  {
    id: "mobile-pwa",
    icon: Smartphone,
    name: "Mobile / PWA",
    category: "Settings",
    description:
      "BudgetSmart is a Progressive Web App (PWA) that works on any device through your browser. Install it on your home screen for an app-like experience with offline support and push notifications.",
    capabilities: [
      "Access BudgetSmart from any mobile browser without an app store",
      "Install to your iOS or Android home screen as a PWA",
      "Use core features offline — data syncs when you reconnect",
      "Receive push notifications for bills and budget alerts on mobile",
      "Scan receipts directly using your phone camera",
      "Optimised touch interface for all screen sizes",
    ],
    faqs: [
      {
        question: "How do I install BudgetSmart on my phone?",
        answer:
          "On iOS Safari, tap the Share button and select 'Add to Home Screen'. On Android Chrome, tap the three-dot menu and select 'Add to Home Screen' or 'Install App'. The installed PWA behaves like a native app without requiring the App Store or Play Store.",
      },
      {
        question: "Does BudgetSmart work offline?",
        answer:
          "Core read functions (viewing transactions, budgets, and reports from your last sync) work offline. Writing new data or syncing with your bank requires an internet connection. Changes made offline are queued and submitted when you reconnect.",
      },
      {
        question: "Are push notifications supported on mobile?",
        answer:
          "Yes — after installing the PWA, you can enable push notifications in your device's notification settings. BudgetSmart can then send bill reminders and budget alerts directly to your lock screen even when the app is not open.",
      },
    ],
  },
];

// ── Navigation groups ────────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Finance",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "transactions", label: "Transactions", icon: CreditCard },
      { id: "income-tracking", label: "Income Tracking", icon: DollarSign },
      { id: "expenses", label: "Expenses", icon: Receipt },
      { id: "bills-reminders", label: "Bills & Reminders", icon: Bell },
      { id: "subscriptions", label: "Subscriptions", icon: RefreshCw },
      { id: "budget-management", label: "Budget Management", icon: Target },
    ],
  },
  {
    label: "Accounts",
    items: [
      { id: "bank-accounts", label: "Bank Accounts", icon: Building2 },
      { id: "investment-portfolio", label: "Investment Portfolio", icon: TrendingUp },
    ],
  },
  {
    label: "AI & Insights",
    items: [
      { id: "ai-advisor", label: "AI Advisor", icon: Bot },
      { id: "reports-analytics", label: "Reports & Analytics", icon: BarChart3 },
      { id: "receipt-scanning", label: "Receipt Scanning", icon: Receipt },
    ],
  },
  {
    label: "Storage",
    items: [{ id: "financial-vault", label: "Financial Vault", icon: Lock }],
  },
  {
    label: "Settings",
    items: [
      { id: "account-settings", label: "Account Settings", icon: Settings },
      { id: "security-privacy", label: "Security & Privacy", icon: Shield },
      { id: "billing-subscription", label: "Billing & Subscription", icon: Wallet },
      { id: "notifications-alerts", label: "Notifications & Alerts", icon: Bell },
      { id: "categories-merchants", label: "Categories & Merchants", icon: Tag },
      { id: "data-export", label: "Data Export", icon: Download },
      { id: "mobile-pwa", label: "Mobile / PWA", icon: Smartphone },
    ],
  },
];

// ── Page component ───────────────────────────────────────────────────────────

export default function Help() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Filter modules based on search query
  const filteredModules = searchQuery.trim()
    ? MODULES.filter((m) => {
        const q = searchQuery.toLowerCase();
        return (
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.capabilities.some((c) => c.toLowerCase().includes(q)) ||
          m.faqs.some(
            (f) =>
              f.question.toLowerCase().includes(q) ||
              f.answer.toLowerCase().includes(q)
          )
        );
      })
    : MODULES;

  // Intersection observer to highlight active nav item while scrolling
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = visible[0].target.id.replace("module-", "");
          setActiveId(id);
        }
      },
      { threshold: 0.15 }
    );

    filteredModules.forEach((m) => {
      const el = document.getElementById(`module-${m.id}`);
      if (el) observerRef.current!.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, [filteredModules]);

  const scrollToModule = useCallback((id: string) => {
    const el = document.getElementById(`module-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <div className="flex gap-0 w-full min-h-full">
      {/* ── Left Nav (desktop/tablet) ── */}
      <aside className="hidden md:block w-64 shrink-0 sticky top-0 self-start h-screen overflow-y-auto border-r border-border bg-card py-6 px-3">
        <HelpNavSidebar
          groups={NAV_GROUPS}
          activeId={activeId}
          onSelect={scrollToModule}
        />
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 min-w-0 overflow-x-hidden">
        <div ref={contentRef} className="px-6 py-6 max-w-4xl">
          {/* Hero / Search */}
          <div className="bg-muted rounded-2xl p-8 mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              How can we help you?
            </h1>
            <p className="text-muted-foreground mb-5">
              Search for answers or browse by feature below
            </p>
            <div className="relative max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                placeholder="Search the Help Center…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 rounded-full"
              />
            </div>
          </div>

          {/* Mobile pill nav */}
          <div className="md:hidden mb-6 overflow-x-auto flex gap-2 pb-2">
            {MODULES.map((m) => (
              <button
                key={m.id}
                onClick={() => scrollToModule(m.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  activeId === m.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-foreground"
                }`}
              >
                <m.icon className="h-3.5 w-3.5" />
                {m.name}
              </button>
            ))}
          </div>

          {/* Module cards */}
          {filteredModules.length === 0 ? (
            <div className="text-center py-16">
              <Search className="h-10 w-10 mx-auto text-muted-foreground/40 mb-4" />
              <p className="text-foreground font-medium">
                No help topics match your search.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Try a different keyword or browse all modules by clearing the search.
              </p>
            </div>
          ) : (
            filteredModules.map((mod) => (
              <HelpModuleCard key={mod.id} module={mod} />
            ))
          )}

          {/* Footer */}
          <div className="mt-4 border-t border-border pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Can't find what you're looking for?{" "}
              <a href="/support" className="text-primary hover:underline font-medium">
                Contact our support team
              </a>
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              We typically respond within 2–4 hours
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
