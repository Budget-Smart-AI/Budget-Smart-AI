import { useState, useMemo, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  HelpCircle, Loader2, Send, TicketCheck, Lightbulb, Bug,
  Clock, Mail, CheckCircle2, ArrowLeft, MessageCircle, RefreshCw,
  Search, ChevronDown, ChevronUp, Sparkles, ThumbsUp, ThumbsDown,
  Book, CreditCard, BarChart3, Receipt, Bot, Shield,
  AlertTriangle, Star, Landmark, Building2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ── Schema ─────────────────────────────────────────────────────────────────────

const supportSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  type: z.enum(["ticket", "feature", "bug"], { required_error: "Please select a request type" }),
  subject: z.string().min(1, "Subject is required"),
  priority: z.enum(["low", "medium", "high"]).optional(),
  message: z.string().min(10, "Message must be at least 10 characters"),
});
type SupportFormData = z.infer<typeof supportSchema>;

// ── Knowledge Base Data ────────────────────────────────────────────────────────

interface KBArticle {
  id: string;
  title: string;
  content: string;
  category: string;
}

const KB_CATEGORIES = [
  { id: "getting-started", label: "Getting Started", icon: Star },
  { id: "bank-accounts", label: "Bank Accounts & Connections", icon: Landmark },
  { id: "budgets", label: "Budgets & Spending", icon: BarChart3 },
  { id: "transactions", label: "Transactions", icon: Receipt },
  { id: "bills", label: "Bills & Subscriptions", icon: CreditCard },
  { id: "ai-advisor", label: "AI Advisor", icon: Bot },
  { id: "vault", label: "Financial Vault", icon: Shield },
  { id: "billing", label: "Billing & Subscription", icon: Building2 },
  { id: "security", label: "Security & Privacy", icon: Shield },
  { id: "troubleshooting", label: "Troubleshooting", icon: AlertTriangle },
];

const KB_ARTICLES: KBArticle[] = [
  // Getting Started
  { id: "gs-1", category: "getting-started", title: "What is BudgetSmart AI and what can it do?", content: "BudgetSmart AI is a Canadian personal finance platform that connects to your bank accounts, automatically categorizes your transactions, and uses AI to help you budget smarter. Core features include real-time transaction sync via Plaid and MX, flexible budgets with category limits and rollover, AI-powered financial coaching, Financial Vault for secure document storage, receipt scanning, subscription tracking, bill reminders, and investment portfolio tracking. The AI Advisor understands Canadian financial context including TFSAs, RRSPs, and FHSAs. You can invite household members to share a single account view." },
  { id: "gs-2", category: "getting-started", title: "How to create your account and complete setup", content: "Visit app.budgetsmart.io and click Sign Up. Enter your email and choose a secure password (minimum 8 characters). Check your inbox for a verification email and click the link to confirm your address. After verification, log in and follow the setup wizard: (1) Add your name and profile details, (2) Connect your first bank account via Plaid or MX, (3) Review auto-detected transactions, (4) Set up your first budget. Two-factor authentication is strongly recommended — enable it under Settings → Security. You can skip any step and return to it later." },
  { id: "gs-3", category: "getting-started", title: "How to connect your first bank account", content: "From the Dashboard or Accounts page, click Add Account. Choose between Plaid (recommended for most Canadian and US banks) or MX (optimized for Canadian institutions). A secure bank connection widget will open — search for your bank, enter your online banking credentials, and complete any multi-factor authentication your bank requires. BudgetSmart never sees or stores your credentials — they are handled entirely by Plaid or MX. Once connected, your transactions will begin syncing within minutes. Most banks sync up to 12–24 months of historical transactions on first connection." },
  { id: "gs-4", category: "getting-started", title: "Understanding the Dashboard overview", content: "The Dashboard gives you a real-time snapshot of your finances. At the top you'll see your net worth, monthly spending vs income summary, and any active budget alerts. The Spending Breakdown chart shows your top expense categories for the current month. The Recent Transactions feed shows your latest activity across all connected accounts. The Budget Progress section displays how you're tracking against each budget category. AI Insights appear as cards with personalized recommendations based on your spending patterns." },
  { id: "gs-5", category: "getting-started", title: "Setting up your first budget", content: "Go to Budgets in the left navigation. Click Create Budget and give it a name (e.g., 'Monthly Groceries'). Select the spending category it tracks. Set your monthly limit in dollars. Choose whether to enable budget rollover — if you underspend this month, the surplus carries forward. Optionally enable email notifications when you reach 80% and 100% of your limit. You can create as many budgets as you need. BudgetSmart will automatically match incoming transactions to the right budget based on category." },
  { id: "gs-6", category: "getting-started", title: "How to invite household members", content: "BudgetSmart supports shared household views. Go to Settings → Household to invite family members. Enter their email address and they'll receive an invitation to create their own BudgetSmart account linked to your household. Household members can see shared accounts and budgets but each person maintains their own profile and security settings. The primary account holder controls which accounts and data are shared. Household invitations expire after 7 days if not accepted." },

  // Bank Accounts
  { id: "ba-1", category: "bank-accounts", title: "How to connect a bank account via Plaid or MX", content: "BudgetSmart uses two bank connectivity providers: Plaid and MX. From the Accounts page click Add Account and select your preferred provider. Plaid supports thousands of financial institutions across Canada, the US, and internationally. MX is optimized for Canadian and US banks with enhanced transaction categorization. When you click Connect, a secure pop-up widget opens — search for your bank, log in with your banking credentials, and complete any MFA your bank requires. After successful authentication, your accounts appear immediately and transactions sync within minutes." },
  { id: "ba-2", category: "bank-accounts", title: "Why is my bank not available?", content: "Plaid and MX support most major Canadian and US financial institutions, including the Big 6 Canadian banks (TD, RBC, BMO, CIBC, Scotiabank, National Bank), major credit unions, and US banks. However, some smaller credit unions, community banks, international institutions, and banks that don't support open banking standards may not be available. If your bank isn't supported, you can manually add transactions as a workaround: go to Accounts → Add Account → Manual Account and enter transactions directly. We regularly add new institutions." },
  { id: "ba-3", category: "bank-accounts", title: "My bank connection shows an error — how do I fix it?", content: "Bank connection errors are usually caused by an expired access token — this happens when your bank's session times out or your online banking password changes. To fix it: go to Accounts, find the disconnected account (it will show a red error badge), and click Reconnect. You'll go through the bank authentication flow again. If reconnecting doesn't work, try disconnecting and reconnecting from scratch. In some cases your bank may require you to re-authorize BudgetSmart access through your bank's security settings. Contact support if the problem persists." },
  { id: "ba-4", category: "bank-accounts", title: "Are my banking credentials stored by BudgetSmart?", content: "No — BudgetSmart never sees or stores your banking username, password, or security answers. When you connect a bank account, you authenticate directly with Plaid or MX through their secure widget. These providers handle all credential management and hold bank-level security certifications. BudgetSmart only receives read-only access to your account balances and transaction history — we cannot initiate transfers or access your banking credentials in any way. Your bank connection tokens are encrypted using AES-256-GCM and stored securely." },
  { id: "ba-5", category: "bank-accounts", title: "How often does BudgetSmart sync my transactions?", content: "BudgetSmart syncs transactions automatically. For most major banks, new transactions appear within a few hours of them posting to your account. Some banks only post transactions overnight, so same-day transactions may not appear until the next morning. The sync scheduler runs every few hours in the background. You can also trigger a manual sync by clicking the Refresh button on the Accounts page. Note that pending transactions may not appear until they fully post." },
  { id: "ba-6", category: "bank-accounts", title: "How do I disconnect a bank account?", content: "Go to Accounts, find the account you want to remove, and click the three-dot menu → Disconnect. Confirm the disconnection. The account will be removed from BudgetSmart and syncing will stop. Your existing transaction history will be retained. Disconnecting in BudgetSmart does not revoke access at your bank — you should also revoke BudgetSmart's access in your bank's connected apps settings for complete removal." },
  { id: "ba-7", category: "bank-accounts", title: "Why are my transactions delayed or missing?", content: "Transaction delays happen for several reasons: (1) Pending transactions — your bank may only sync posted transactions, so pending items won't appear until they clear. (2) Bank sync delay — some banks have a 24–48 hour lag before making transactions available. (3) Expired connection — check if your account shows a reconnection error. (4) Weekend/holiday processing — transactions initiated on weekends may post Monday. (5) Small merchants — some small businesses batch transactions and submit them days after the purchase. Submit a ticket if transactions are consistently missing for more than 3 business days." },
  { id: "ba-8", category: "bank-accounts", title: "How do I manually add a transaction?", content: "If a transaction isn't syncing automatically or you want to add cash transactions, you can add them manually. Go to Transactions and click Add Transaction. Enter the date, merchant name, amount (negative for expenses, positive for income), and category. Select which account the transaction belongs to. You can also add a note. Manual transactions appear in your budgets and reports alongside auto-synced ones. To bulk import, export your bank's CSV file and use the Import Transactions feature under Accounts." },

  // Budgets
  { id: "bud-1", category: "budgets", title: "How to create and manage budgets", content: "Go to Budgets in the sidebar and click Create Budget. Give it a descriptive name, select the spending category, and set your monthly dollar limit. You can create budgets for any category: Groceries, Dining Out, Entertainment, Transportation, Shopping, Healthcare, and more. Once created, BudgetSmart automatically matches incoming transactions to the right budget. Edit a budget anytime by clicking its card and selecting Edit. You can have multiple budgets per category." },
  { id: "bud-2", category: "budgets", title: "Setting budget limits by category", content: "When setting budget limits, consider your average monthly spending in that category. BudgetSmart shows your past 3 months average when you create a new budget to help you pick a realistic limit. You can set limits in any amount. Budget limits apply to the current calendar month and reset at the start of each month (or carry rollover if enabled). You can change a budget's limit at any time; changes take effect immediately." },
  { id: "bud-3", category: "budgets", title: "Understanding budget vs actual spending", content: "The Budget page shows a bar for each budget with two values: your set limit (the budget) and your actual spending to date this month. The bar fills as you spend — green under 80%, yellow at 80–100%, red when over budget. The percentage shown is how much of your budget you've used. Clicking any budget card shows a breakdown of individual transactions that contributed to that budget. You can filter by date range to compare budget performance across different months." },
  { id: "bud-4", category: "budgets", title: "How budget rollover works", content: "Budget rollover carries unused budget funds from one month to the next. If your Groceries budget is $500 and you only spend $400 in January, with rollover enabled your February grocery budget becomes $600. Rollover is optional — enable it when creating or editing a budget. Rollovers can accumulate up to 3× the original budget limit to prevent unrealistically large balances. Rollover does not apply to over-budget months." },
  { id: "bud-5", category: "budgets", title: "Setting up budget alerts and notifications", content: "BudgetSmart can notify you when you're approaching or exceeding a budget. When creating or editing a budget, toggle on Budget Alerts and set your preferred threshold (default: 80%). You'll receive an email when spending reaches that percentage of your limit, and another when you hit 100%. Alerts are sent no more than once per day per budget to avoid notification fatigue. Make sure your email address is verified and check your email notification settings under Settings → Notifications." },
  { id: "bud-6", category: "budgets", title: "How to delete or archive a budget", content: "To delete a budget, open it and click Edit → Delete Budget. Deleting a budget removes the budget limits but does NOT delete the transactions that were counted against it. Transactions simply become uncategorized relative to budgets. If you want to pause a budget temporarily, you can set its limit to $0 or disable alerts. Deleting a budget is permanent — consider noting your settings before deleting." },

  // Transactions
  { id: "tx-1", category: "transactions", title: "How to search and filter transactions", content: "The Transactions page has powerful search and filtering tools. Use the search bar to find transactions by merchant name, amount, or description. Use filters to narrow by: date range (custom or preset), account, category, amount range, and transaction type. You can combine multiple filters. The transaction list updates in real time as you type or apply filters. Click any transaction to view full details including the original bank description and any notes you've added." },
  { id: "tx-2", category: "transactions", title: "How to edit or recategorize a transaction", content: "Click any transaction to open its detail panel. You can edit: the category (choose from our full category list or create a custom one), the merchant display name, any notes you want to add, and whether it should be marked for review. Changes save immediately. If you always want a specific merchant to be categorized a certain way, click 'Apply to all future transactions from [merchant]' — BudgetSmart will remember this rule and categorize future transactions automatically." },
  { id: "tx-3", category: "transactions", title: "How to split a transaction between categories", content: "Some purchases span multiple categories — for example, a Costco purchase might include groceries, household supplies, and clothing. To split a transaction: open it, click Split Transaction, and divide the amount across two or more categories. Each split can have its own category and optional note. The total of all splits must equal the original transaction amount. Splits appear as separate line items in your category reports and budgets. To unsplit a transaction, open it and click Remove Split." },
  { id: "tx-4", category: "transactions", title: "How to export my transaction history", content: "Go to Transactions and apply any filters you want (date range, accounts, categories). Click Export → Download CSV. The CSV file includes: date, merchant name, amount, category, account, and any notes. For tax purposes, you can export all transactions for a calendar year by setting the date filter to January 1 – December 31 of the relevant year. Note: exports contain financial data — store them securely." },
  { id: "tx-5", category: "transactions", title: "Why does a transaction show the wrong merchant name?", content: "Banks transmit a raw merchant string that is often a confusing combination of store codes, location identifiers, and reference numbers. BudgetSmart uses AI-powered merchant enrichment to clean these up into readable names. If a merchant name looks wrong, click the transaction and edit the merchant name. You can apply the corrected name to all past and future transactions from that merchant. If the AI enrichment is consistently wrong for a particular merchant, please let us know via a bug report." },

  // Bills
  { id: "bill-1", category: "bills", title: "How to add a bill and set reminders", content: "Go to Bills in the sidebar and click Add Bill. Enter the bill name, the amount, and the due date. Set the billing frequency: monthly, bi-monthly, annually, etc. Enable email reminders and choose how many days in advance to be notified (default: 3 days). BudgetSmart will send you a reminder email before each due date. You can also see upcoming bills in the Dashboard's upcoming bills section." },
  { id: "bill-2", category: "bills", title: "How do bill due date notifications work?", content: "BudgetSmart sends bill reminder emails the number of days before the due date that you specified when setting up the bill. Reminders are sent once per cycle. If you mark a bill as paid, reminders stop for that cycle and resume for the next due date. Reminder emails come from support@budgetsmart.io — add this address to your contacts to prevent them from going to spam. You can disable or change reminder timing by editing the bill at any time." },
  { id: "bill-3", category: "bills", title: "How to track subscriptions separately from bills", content: "BudgetSmart distinguishes between bills (one-time or irregular payments like rent or utilities) and subscriptions (recurring automatic charges like Netflix or Spotify). When you first connect your bank account, the AI automatically detects recurring subscription charges from your transaction history. These appear in a separate Subscriptions section. Subscriptions are tracked with their renewal dates, monthly cost, and total annual cost. The AI will alert you to price increases or duplicate subscriptions." },
  { id: "bill-4", category: "bills", title: "Marking a bill as paid", content: "On the Bills page, find the bill in your upcoming bills list and click the checkmark or Mark as Paid button. BudgetSmart records the payment date and amount. The bill will advance to the next due date automatically. If the actual amount you paid was different from the bill amount, you can enter the actual amount when marking as paid. Paid bills appear in your payment history so you can verify you never missed a payment." },

  // AI Advisor
  { id: "ai-1", category: "ai-advisor", title: "What is the AI Advisor and how does it work?", content: "The AI Advisor is BudgetSmart's built-in financial assistant. You can access it from the sidebar or the full-screen chat mode. It analyzes your connected account data — transactions, budgets, bills, and savings goals — and provides personalized insights and recommendations. Ask it questions like 'How much did I spend on dining last month?', 'Can I afford a vacation in August?', or 'Help me understand my TFSA contribution room.' The AI is context-aware and remembers your conversation within a session." },
  { id: "ai-2", category: "ai-advisor", title: "Is the AI Advisor's advice professionally certified?", content: "No — the AI Advisor provides informational guidance only, not professional financial advice. The insights and recommendations are generated by AI based on your spending data and general financial principles. BudgetSmart AI is not a registered financial advisor, investment advisor, or tax professional. For decisions about investments, tax planning, retirement strategies, or major financial commitments, please consult a licensed financial professional." },
  { id: "ai-3", category: "ai-advisor", title: "Does the AI understand Canadian accounts like TFSA and RRSP?", content: "Yes — the AI Advisor is trained with Canadian financial context and understands Canadian-specific accounts: TFSA (Tax-Free Savings Account), RRSP (Registered Retirement Savings Plan), FHSA (First Home Savings Account), RESP (Registered Education Savings Plan), RDSP (Registered Disability Savings Plan), and non-registered investment accounts. It understands Canadian tax rules, contribution limits, and strategies specific to Canadian investors and savers." },
  { id: "ai-4", category: "ai-advisor", title: "How to get the most useful answers from the AI Advisor", content: "For the best results: (1) Connect your bank accounts so the AI has real data to work with. (2) Make sure your transactions are categorized correctly. (3) Ask specific questions rather than vague ones. (4) Provide context when asking hypothetical questions. (5) Use follow-up questions to drill down. The AI can reference your actual balances and spending patterns when answering questions about your specific situation." },
  { id: "ai-5", category: "ai-advisor", title: "Why did the AI Advisor give me an unexpected response?", content: "AI language models can occasionally give unexpected, incorrect, or overly general responses. Common causes: (1) The question was ambiguous — try rephrasing it more specifically. (2) Your transaction data might be incomplete or miscategorized. (3) The AI may not have sufficient context — provide more background. (4) AI models have knowledge cutoff dates and may not know about very recent tax law changes. If you receive advice that seems wrong, do not act on it — consult a financial professional." },

  // Vault
  { id: "vault-1", category: "vault", title: "What is the Financial Vault and what can I store there?", content: "Financial Vault is BudgetSmart's encrypted document storage system for your important financial documents. You can upload and organize: tax returns and T4 slips, investment statements, insurance policies, mortgage documents, property tax assessments, vehicle titles, estate planning documents, receipts for major purchases, and any other financial paperwork. All documents are encrypted with AES-256-GCM at rest. The AI can analyze uploaded documents to extract key data and answer questions about their contents." },
  { id: "vault-2", category: "vault", title: "What file types are supported?", content: "Financial Vault supports: PDF (recommended for documents), JPG and JPEG (photos and scanned images), PNG (screenshots and images), and DOCX (Microsoft Word documents). Maximum file size is 50 MB per document. For best AI extraction results, upload clear, high-resolution scans. Handwritten documents are supported but AI extraction accuracy may be lower. You can upload multiple files at once by selecting several files in the upload dialog." },
  { id: "vault-3", category: "vault", title: "How secure are my documents?", content: "All documents stored in Financial Vault are encrypted at rest using AES-256-GCM, an industry-standard encryption algorithm used by banks and government agencies. Documents are stored in secure cloud infrastructure with access controls that ensure only you (and household members you explicitly grant access) can view them. BudgetSmart is pursuing SOC 2 Type II certification targeting August 2026. We do not share your documents with third parties." },
  { id: "vault-4", category: "vault", title: "Is Financial Vault a backup service?", content: "No — Financial Vault is not a backup service. While we take every precaution to keep your documents safe, it is your responsibility to maintain original copies of important documents and independent backups. Do not store documents in Financial Vault as your only copy. We recommend keeping originals in a physical safe or a separate secure backup location. Financial Vault is designed as a convenient, secure, and searchable secondary storage tool." },
  { id: "vault-5", category: "vault", title: "How to organize documents into categories", content: "When uploading a document, you can assign it to a category: Tax Documents, Investment Statements, Insurance, Property, Vehicles, Legal, Receipts, or Other. You can also create a subcategory for more detailed organization. Add tags to make documents easier to search. Once uploaded, you can move documents between categories, add or edit tags, and set expiry date reminders for time-sensitive documents like insurance renewals. Use the search bar in the Vault to find documents by name, category, or any text the AI extracted from the document." },

  // Billing
  { id: "sub-1", category: "billing", title: "What plans does BudgetSmart AI offer?", content: "BudgetSmart AI offers three subscription tiers: Free (basic transaction tracking, 1 connected account, 5 AI queries/month, manual entry), Pro ($7.99/month or $67/year — up to 2 bank accounts, unlimited AI queries, full budgeting suite, bill tracking, savings goals), and Family ($14.99/month or $129/year — everything in Pro plus unlimited bank accounts, up to 6 family members, household budgets, priority support). The Free Plan is available forever with no credit card required. Upgrade anytime to unlock more features." },
  { id: "sub-2", category: "billing", title: "How do I upgrade or downgrade my plan?", content: "Go to Settings → Subscription to manage your plan. Click Upgrade or Change Plan to see available options. When upgrading, you're charged the prorated difference immediately and your new features are activated right away. When downgrading, your current plan stays active until the end of the billing period, then switches to the new plan. Downgrading does not delete your data." },
  { id: "sub-3", category: "billing", title: "How do I cancel my subscription?", content: "Go to Settings → Subscription and click Cancel Subscription. Confirm the cancellation. Your paid plan stays active until the end of the current billing period — you won't be charged again. After the billing period ends, your account moves to the Free tier. Your data, connected accounts, and history are retained — you can resubscribe at any time. BudgetSmart does not offer refunds for partial billing periods unless required by applicable law." },
  { id: "sub-4", category: "billing", title: "How do I update my payment method?", content: "Go to Settings → Subscription → Payment Method. Click Update Card. Enter your new credit or debit card details. Your new card will be charged on the next billing date. Payments are processed securely by Stripe. If your card was declined on a recent billing attempt, update it promptly to avoid a service interruption. You'll receive an email notification about failed payments with a link to update your payment method." },
  { id: "sub-5", category: "billing", title: "Why was my card declined?", content: "Common reasons a card is declined: (1) Expired card — check if your card's expiry date has passed. (2) Insufficient funds. (3) Card blocked for online transactions — some debit cards restrict online billing. (4) Billing address mismatch — the address associated with your card must match what's on file with your bank. (5) International transactions blocked — if you're outside Canada/US, your bank may have blocked international charges. Contact your bank if none of these apply." },

  // Security
  { id: "sec-1", category: "security", title: "How does BudgetSmart protect my data?", content: "BudgetSmart uses multiple layers of security: (1) All data is encrypted in transit using TLS 1.3. (2) Sensitive data (bank access tokens, phone numbers) is encrypted at rest with AES-256-GCM. (3) Banking credentials are never stored — Plaid and MX handle authentication. (4) Passwords are hashed using bcrypt. (5) Sessions are server-side with secure, HTTP-only cookies. (6) Admin actions are logged in a tamper-evident audit log. (7) BudgetSmart is pursuing SOC 2 Type II certification targeting August 2026. (8) Two-factor authentication is available for all accounts." },
  { id: "sec-2", category: "security", title: "What happens after too many failed login attempts?", content: "After 5 consecutive failed login attempts, your account is automatically locked for 30 minutes. This protects against brute-force attacks. During the lockout period, no login attempts (even with the correct password) will succeed. After 30 minutes, the lockout expires automatically. You'll receive an email notification when your account is locked. If you believe your account was targeted by an unauthorized party, change your password immediately after the lockout expires and enable two-factor authentication." },
  { id: "sec-3", category: "security", title: "How do I change my password?", content: "If you're logged in: Go to Settings → Security and click Change Password. Enter your current password, then your new password twice. Choose a strong password of at least 12 characters. If you're logged out: On the login page, click Forgot Password. Enter your email address and you'll receive a password reset link (valid for 1 hour). If you don't receive the email within 5 minutes, check your spam folder or contact support." },
  { id: "sec-4", category: "security", title: "How do I enable two-factor authentication?", content: "Two-factor authentication (2FA) adds an extra layer of security by requiring a time-based one-time passcode (TOTP) in addition to your password. To enable it: Go to Settings → Security → Two-Factor Authentication. Click Enable 2FA. Scan the QR code with an authenticator app (Google Authenticator, Authy, or similar). Enter the 6-digit code from the app to confirm. Save your backup codes in a secure location — these are one-time codes you can use if you lose access to your authenticator app." },
  { id: "sec-5", category: "security", title: "How do I delete my account and all my data?", content: "Account deletion is permanent and cannot be undone. To delete your account: Go to Settings → Account → Delete Account. Read the warning carefully. Type DELETE to confirm. Your personal information, budgets, bills, vault documents, and AI conversation history will be permanently deleted. Transaction history is retained for 7 years as required by applicable financial record-keeping laws but will be anonymized. Bank connections are immediately terminated." },

  // Troubleshooting
  { id: "tr-1", category: "troubleshooting", title: "I can't log in — what do I do?", content: "If you can't log in, work through these steps: (1) Double-check your email and password — passwords are case-sensitive. (2) Try the Forgot Password link to reset your password. (3) Check if your account is locked (5 failed attempts = 30 minute lockout). (4) Make sure your email address is verified. (5) Try a different browser or clear your browser cache. (6) If you use 2FA, make sure your authenticator app's time is synchronized. (7) If none of these work, contact support with your email address." },
  { id: "tr-2", category: "troubleshooting", title: "The app is loading slowly or not responding", content: "If BudgetSmart is running slowly: (1) Check your internet connection. (2) Clear your browser cache (Ctrl+Shift+Delete on Windows, Cmd+Shift+Delete on Mac). (3) Try a different browser or an incognito/private window to rule out extensions. (4) Disable browser extensions temporarily. (5) Check the BudgetSmart system status page for any ongoing incidents. (6) Try refreshing the page. If the issue persists for more than 15 minutes, submit a support ticket." },
  { id: "tr-3", category: "troubleshooting", title: "My transactions stopped syncing", content: "If new transactions aren't appearing: (1) Check if your bank connection shows an error badge on the Accounts page — if so, click Reconnect. (2) Wait up to 24 hours — some banks have daily sync windows. (3) Trigger a manual sync by clicking Refresh on the Accounts page. (4) Verify the account isn't disconnected. (5) Check your bank's own app to confirm new transactions are posted. (6) Some banks have temporary outages that affect data access. Submit a ticket if syncing hasn't resumed after 48 hours." },
  { id: "tr-4", category: "troubleshooting", title: "I'm not receiving email notifications", content: "If you're not receiving emails from BudgetSmart: (1) Check your spam/junk folder — add support@budgetsmart.io to your contacts. (2) Verify your email address is correct in Settings → Profile. (3) Check notification settings in Settings → Notifications. (4) Make sure your email address is verified. (5) Some corporate email systems have aggressive filtering — try using a personal email address. (6) Contact your IT department if you use a corporate email address that may be blocking external senders." },
  { id: "tr-5", category: "troubleshooting", title: "The AI Advisor is not responding", content: "If the AI Advisor isn't responding or showing an error: (1) Wait a moment and try again — AI services occasionally have brief delays. (2) Refresh the page. (3) Check your internet connection. (4) Try a shorter or simpler question. (5) If you see a 'Service unavailable' error, AI services may be experiencing high demand — try again in a few minutes. (6) Check the system status page for AI service incidents. If unavailable for more than 30 minutes, please submit a support ticket." },
  { id: "tr-6", category: "troubleshooting", title: "How do I clear my cache or reset the app?", content: "To clear the app's local cache in a browser: (1) Press Ctrl+Shift+Delete (Windows/Linux) or Cmd+Shift+Delete (Mac). (2) Select 'Cached images and files' and 'Cookies and other site data'. (3) Click Clear data. (4) Close and reopen your browser, then log back in. Alternatively, open BudgetSmart in an incognito/private window. For mobile app users, go to your device's App Settings → BudgetSmart → Clear Cache." },
];

// ── Support Team ───────────────────────────────────────────────────────────────

const SUPPORT_TEAM = [
  { initials: "SM", name: "Sarah Mitchell", role: "Senior Support Specialist", specialty: "Account setup, billing, and general questions" },
  { initials: "JO", name: "James Okonkwo", role: "Technical Support Lead", specialty: "App issues, troubleshooting, and bug escalation" },
  { initials: "PS", name: "Priya Sharma", role: "Billing & Account Specialist", specialty: "Subscriptions, payments, and plan changes" },
  { initials: "DR", name: "Daniel Reyes", role: "Bank Integration Specialist", specialty: "Plaid, MX, bank connections, and sync issues" },
  { initials: "ET", name: "Emma Tremblay", role: "Customer Success Manager", specialty: "Onboarding, feature guidance, and Canadian tax accounts" },
];

const POPULAR_TOPICS = ["Connect my bank", "Billing question", "Login problem", "Transaction not showing", "What is Financial Vault"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case "open": return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Open</Badge>;
    case "waiting_for_user": return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Waiting for Reply</Badge>;
    case "waiting_for_admin": return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Awaiting Admin</Badge>;
    case "escalated": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Escalated</Badge>;
    case "closed": return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Closed</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

// ── Ticket Thread ──────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  type: string;
  message: string;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  senderType: string;
  message: string;
  createdAt: string;
}

function TicketThread({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState("");

  const { data, isLoading } = useQuery<{ ticket: Ticket; messages: Message[] }>({
    queryKey: [`/api/support/my-tickets/${ticketId}`],
  });

  const replyMutation = useMutation({
    mutationFn: async (message: string) => {
      const r = await apiRequest("POST", `/api/support/my-tickets/${ticketId}/reply`, { message });
      return r.json();
    },
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: [`/api/support/my-tickets/${ticketId}`] });
      toast({ title: "Reply sent" });
    },
    onError: () => toast({ title: "Failed to send reply", variant: "destructive" }),
  });

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to My Tickets
      </Button>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">{data.ticket.subject}</h3>
          <p className="text-sm text-muted-foreground">Ticket #{data.ticket.ticketNumber}</p>
        </div>
        {statusBadge(data.ticket.status)}
      </div>
      <div className="space-y-3 mb-4">
        {data.messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.senderType === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${msg.senderType === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
              <p className="text-xs mb-1 opacity-70">{msg.senderType === "admin" ? "Support Team" : "You"} &middot; {new Date(msg.createdAt).toLocaleString()}</p>
              <p className="whitespace-pre-wrap">{msg.message}</p>
            </div>
          </div>
        ))}
      </div>
      {data.ticket.status !== "closed" && (
        <div className="border-t pt-4">
          <Textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Type your reply..." rows={3} className="mb-2" />
          <Button size="sm" disabled={!replyText.trim() || replyMutation.isPending} onClick={() => replyMutation.mutate(replyText.trim())} className="gap-1">
            {replyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Send Reply
          </Button>
        </div>
      )}
    </div>
  );
}

// ── My Tickets ─────────────────────────────────────────────────────────────────

function MyTickets() {
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const { data: tickets, isLoading, refetch } = useQuery<Ticket[]>({ queryKey: ["/api/support/my-tickets"] });

  if (isLoading) return <div className="flex items-center justify-center h-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!tickets || tickets.length === 0) return <p className="text-sm text-muted-foreground py-2">No tickets yet.</p>;
  if (selectedTicketId) return <TicketThread ticketId={selectedTicketId} onBack={() => setSelectedTicketId(null)} />;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium">{tickets.length} ticket{tickets.length !== 1 ? "s" : ""}</p>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1 text-xs">
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>
      {tickets.map((t) => (
        <div key={t.id} className="flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors" onClick={() => setSelectedTicketId(t.id)}>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{t.subject}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
              <span>#{t.ticketNumber}</span><span>&middot;</span>
              <Clock className="h-3 w-3" /><span>{new Date(t.createdAt).toLocaleDateString()}</span>
            </p>
          </div>
          <div className="ml-3 shrink-0">{statusBadge(t.status)}</div>
        </div>
      ))}
    </div>
  );
}

// ── KB Article Panel ───────────────────────────────────────────────────────────

function KBArticlePanel({ article, onFeedback }: { article: KBArticle; onFeedback: (id: string, helpful: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [voted, setVoted] = useState<boolean | null>(null);

  const handleVote = (helpful: boolean) => {
    if (voted !== null) return;
    setVoted(helpful);
    onFeedback(article.id, helpful);
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-accent/40 transition-colors">
        <span className="font-medium text-sm pr-4">{article.title}</span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-5 pb-5">
          <p className="text-sm text-muted-foreground leading-relaxed">{article.content}</p>
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
            <span className="text-xs text-muted-foreground">Was this helpful?</span>
            <button onClick={() => handleVote(true)} disabled={voted !== null} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${voted === true ? "bg-green-500/20 text-green-500" : "hover:bg-muted text-muted-foreground"}`}>
              <ThumbsUp className="h-3 w-3" /> Yes
            </button>
            <button onClick={() => handleVote(false)} disabled={voted !== null} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${voted === false ? "bg-red-500/20 text-red-500" : "hover:bg-muted text-muted-foreground"}`}>
              <ThumbsDown className="h-3 w-3" /> No
            </button>
            {voted !== null && <span className="text-xs text-muted-foreground">Thanks for your feedback!</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AI Search Answer ───────────────────────────────────────────────────────────

function AISearchAnswer({ query }: { query: string }) {
  const { data, isLoading, error } = useQuery<{ answer: string }>({
    queryKey: ["/api/support/kb-search", query],
    queryFn: async () => {
      const r = await apiRequest("POST", "/api/support/kb-search", { query });
      return r.json();
    },
    enabled: query.trim().length >= 3,
    staleTime: 60_000,
  });

  if (!query.trim() || query.trim().length < 3) return null;
  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4"><Loader2 className="h-4 w-4 animate-spin" /> Getting AI answer&hellip;</div>;
  if (error || !data?.answer) return null;

  return (
    <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-primary">AI Answer</span>
      </div>
      <p className="text-sm leading-relaxed">{data.answer}</p>
      <p className="text-xs text-muted-foreground mt-2">
        This is an AI-generated answer.{" "}
        <a href="#ticket-forms" className="underline cursor-pointer">
          Submit a ticket
        </a>{" "}
        if you need further help.
      </p>
    </div>
  );
}

// ── Ticket Forms ───────────────────────────────────────────────────────────────

const requestTypes = [
  { id: "ticket" as const, title: "Support Ticket", description: "Get help with account issues, billing, or general questions", icon: TicketCheck, color: "text-blue-500", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/30" },
  { id: "feature" as const, title: "Feature Request", description: "Suggest new features or improvements to Budget Smart AI", icon: Lightbulb, color: "text-amber-500", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/30" },
  { id: "bug" as const, title: "Bug Report", description: "Report an issue or unexpected behavior in the application", icon: Bug, color: "text-red-500", bgColor: "bg-red-500/10", borderColor: "border-red-500/30" },
];

function TicketForms() {
  const [selectedType, setSelectedType] = useState<"ticket" | "feature" | "bug" | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [ticketNumber, setTicketNumber] = useState("");
  const { toast } = useToast();

  const form = useForm<SupportFormData>({
    resolver: zodResolver(supportSchema),
    defaultValues: { name: "", email: "", subject: "", message: "" },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: SupportFormData) => {
      const r = await apiRequest("POST", "/api/support", data);
      return r.json();
    },
    onSuccess: (data) => {
      setTicketNumber(data.ticketNumber || "");
      setSubmitted(true);
    },
    onError: () => toast({ title: "Submission failed", description: "Please try again.", variant: "destructive" }),
  });

  if (submitted) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold mb-2">Request Submitted!</h3>
        <p className="text-muted-foreground mb-4">Ticket #{ticketNumber} &middot; We&apos;ll respond as soon as possible.</p>
        <Button variant="outline" onClick={() => { setSubmitted(false); setSelectedType(null); form.reset(); }}>Submit Another Request</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {requestTypes.map((rt) => (
          <button key={rt.id} onClick={() => { setSelectedType(rt.id); form.setValue("type", rt.id); }}
            className={`text-left p-4 rounded-xl border-2 transition-all ${selectedType === rt.id ? `${rt.borderColor} ${rt.bgColor}` : "border-border bg-card hover:border-primary/30"}`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${rt.bgColor}`}>
              <rt.icon className={`h-5 w-5 ${rt.color}`} />
            </div>
            <p className="font-semibold text-sm">{rt.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{rt.description}</p>
          </button>
        ))}
      </div>
      {selectedType && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => submitMutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Your Name</FormLabel><FormControl><Input placeholder="Jane Smith" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email Address</FormLabel><FormControl><Input placeholder="jane@example.com" type="email" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="subject" render={({ field }) => (
              <FormItem><FormLabel>Subject</FormLabel><FormControl><Input placeholder="Brief description of your issue" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="priority" render={({ field }) => (
              <FormItem>
                <FormLabel>Priority (optional)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="message" render={({ field }) => (
              <FormItem><FormLabel>Message</FormLabel><FormControl><Textarea placeholder="Describe your issue in detail..." rows={5} {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <Button type="submit" disabled={submitMutation.isPending} className="gap-2">
              {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit Request
            </Button>
          </form>
        </Form>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function SupportPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("getting-started");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const handleKbFeedback = async (articleId: string, helpful: boolean) => {
    try { await apiRequest("POST", "/api/support/kb-feedback", { articleId, helpful }); } catch { /* non-fatal */ }
  };

  const filteredArticles = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return KB_ARTICLES.filter((a) => a.category === activeCategory);
    return KB_ARTICLES.filter((a) => a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q));
  }, [searchQuery, activeCategory]);

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="w-full px-6 py-6 max-w-none">
      {/* Zone 1: Hero / Search */}
      <div className="bg-card border border-border rounded-2xl p-8 mb-6">
        <h1 className="text-3xl font-bold mb-2">How can we help you?</h1>
        <p className="text-muted-foreground mb-6">Search our knowledge base or submit a ticket below.</p>
        <div className="relative max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search for help, e.g. 'connect bank account' or 'cancel subscription'…" className="pl-9 pr-4 h-11 text-sm" />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {POPULAR_TOPICS.map((topic) => (
            <button key={topic} onClick={() => setSearchQuery(topic)} className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors">{topic}</button>
          ))}
        </div>
      </div>

      {/* Zone 2: Two-column KB */}
      <div className="flex gap-6 mb-8">
        {!isSearching && (
          <aside className="w-64 shrink-0">
            <div className="sticky top-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 px-2">Categories</p>
              <nav className="space-y-0.5">
                {KB_CATEGORIES.map((cat) => (
                  <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                    className={`w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeCategory === cat.id ? "bg-primary/10 text-primary border-l-2 border-primary pl-2.5" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
                    <cat.icon className="h-4 w-4 shrink-0" />
                    <span>{cat.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </aside>
        )}
        <div className="flex-1 min-w-0">
          <AISearchAnswer query={debouncedQuery} />
          {isSearching && <p className="text-sm text-muted-foreground mb-3">{filteredArticles.length} result{filteredArticles.length !== 1 ? "s" : ""} for <strong>&ldquo;{searchQuery}&rdquo;</strong></p>}
          {!isSearching && <h2 className="text-lg font-semibold mb-4">{KB_CATEGORIES.find((c) => c.id === activeCategory)?.label}</h2>}
          <div className="space-y-2">
            {filteredArticles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Book className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No articles found. Try a different search or submit a ticket below.</p>
              </div>
            ) : filteredArticles.map((article) => (
              <KBArticlePanel key={article.id} article={article} onFeedback={handleKbFeedback} />
            ))}
          </div>
        </div>
      </div>

      {/* Support Team */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-1">Meet Our Support Team</h2>
        <p className="text-sm text-muted-foreground mb-4">Real people ready to help &mdash; our responses are prepared by our support team with AI assistance.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {SUPPORT_TEAM.map((member) => (
            <div key={member.name} className="bg-card border border-border rounded-xl p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold mx-auto mb-3">{member.initials}</div>
              <p className="text-sm font-semibold leading-tight">{member.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">{member.role}</p>
              <p className="text-xs text-muted-foreground italic leading-snug">&ldquo;{member.specialty}&rdquo;</p>
            </div>
          ))}
        </div>
      </div>

      {/* Zone 3: Ticket Forms */}
      <div id="ticket-forms" className="mb-8">
        <h2 className="text-xl font-semibold mb-1">Submit a Request</h2>
        <p className="text-sm text-muted-foreground mb-6">Can&apos;t find what you&apos;re looking for? Our team is here to help.</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-primary" /> Contact Support
                </CardTitle>
              </CardHeader>
              <CardContent><TicketForms /></CardContent>
            </Card>
          </div>
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-primary" /> My Tickets
                </CardTitle>
              </CardHeader>
              <CardContent><MyTickets /></CardContent>
            </Card>
            <Card className="mt-4">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div><p className="text-sm font-medium">Email</p><p className="text-xs text-muted-foreground">support@budgetsmart.io</p></div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div><p className="text-sm font-medium">Response Time</p><p className="text-xs text-muted-foreground">Typically 2&ndash;4 hours (Mon&ndash;Fri)</p></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
