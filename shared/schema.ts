import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, numeric, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Countries where MX is available for bank aggregation (use Plaid for all others)
// MX has full coverage in US and Canada only
export const MX_SUPPORTED_COUNTRIES = ["US", "CA"] as const;

// Common countries for user selection dropdown
export const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "CH", name: "Switzerland" },
  { code: "AT", name: "Austria" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PT", name: "Portugal" },
  { code: "PL", name: "Poland" },
  { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" },
  { code: "JP", name: "Japan" },
  { code: "IN", name: "India" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "ZA", name: "South Africa" },
] as const;

// Bill categories
export const BILL_CATEGORIES = [
  "Rent",
  "Internet",
  "Phone",
  "Subscriptions",
  "Utilities",
  "Insurance",
  "Loans",
  "Transportation",
  "Shopping",
  "Fitness",
  "Communications",
  "Business Expense",
  "Electrical",
  "Credit Card",
  "Line of Credit",
  "Mortgage",
  "Entertainment",
  "Travel",
  "Maintenance",
  "Car",
  "Day Care",
  "Other"
] as const;

// Expense categories
export const EXPENSE_CATEGORIES = [
  "Groceries",
  "Restaurant & Bars",
  "Transportation",
  "Entertainment",
  "Shopping",
  "Healthcare",
  "Education",
  "Fitness",
  "Electrical",
  "Credit Card",
  "Travel",
  "Maintenance",
  "Mortgage",
  "Communications",
  "Gas",
  "Clothing",
  "Parking & Tolls",
  "Personal",
  "Cash & ATM",
  "Coffee Shops",
  "Public Transit",
  "Taxi & Ride Share",
  "Fun Money",
  "Furniture & Houseware",
  "Check",
  "Business Travel & Meals",
  "Business Auto Expenses",
  "Other"
] as const;

// Recurrence options
export const RECURRENCE_OPTIONS = [
  "weekly",
  "biweekly",
  "monthly",
  "yearly",
  "custom",
  "one_time"
] as const;

// Manual account types for cash/non-bank spending
export const MANUAL_ACCOUNT_TYPES = ["cash", "paypal", "venmo", "other"] as const;

// Bills table - for recurring bills and subscriptions
export const bills = pgTable("bills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Owner of this bill
  name: text("name").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  category: text("category").notNull(),
  dueDay: integer("due_day").notNull(), // Day of month (1-31) or day of week (0-6) for weekly
  recurrence: text("recurrence").notNull(), // weekly, biweekly, monthly, yearly, custom
  customDates: text("custom_dates"), // JSON array of custom payment dates (yyyy-MM-dd format)
  notes: text("notes"),
  lastNotifiedCycle: text("last_notified_cycle"), // Stored as "yyyy-MM" string for cycle tracking
  startingBalance: numeric("starting_balance", { precision: 12, scale: 2 }), // For credit cards, loans, mortgages
  paymentsRemaining: integer("payments_remaining"), // Number of payments left (null = indefinite)
  startDate: text("start_date"), // When the recurring bill starts (yyyy-MM-dd format)
  endDate: text("end_date"), // When the recurring bill ends (yyyy-MM-dd format)
  isPaused: text("is_paused").default("false"), // For subscriptions - pause without deleting
  merchant: text("merchant"), // Merchant/company name (useful for subscriptions)
  linkedPlaidAccountId: varchar("linked_plaid_account_id"), // Link to Plaid account for auto-detected bills
});

// Expenses table - for one-time purchases
export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Owner of this expense
  merchant: text("merchant").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  date: text("date").notNull(), // Stored as "yyyy-MM-dd" string
  category: text("category").notNull(),
  notes: text("notes"),
  // Tax fields
  taxDeductible: text("tax_deductible").default("false"),
  taxCategory: text("tax_category"),
  isBusinessExpense: text("is_business_expense").default("false"),
});

// Insert schemas
export const insertBillSchema = createInsertSchema(bills).omit({ id: true, lastNotifiedCycle: true, userId: true }).extend({
  userId: z.string().optional(), // Will be set by route from session
  amount: z.string().or(z.number()).transform((val) => String(val)),
  dueDay: z.number().min(0).max(31), // 0-6 for weekly (day of week), 1-31 for monthly
  category: z.enum(BILL_CATEGORIES),
  recurrence: z.enum(RECURRENCE_OPTIONS),
  customDates: z.string().nullable().optional(), // JSON array of dates
  startingBalance: z.string().or(z.number()).transform((val) => val ? String(val) : null).nullable().optional(),
  paymentsRemaining: z.number().nullable().optional(),
  startDate: z.string().nullable().optional(), // When the recurring bill starts (yyyy-MM-dd format)
  endDate: z.string().nullable().optional(), // When the recurring bill ends (yyyy-MM-dd format)
  isPaused: z.string().optional().default("false"), // For subscriptions - pause without deleting
  merchant: z.string().nullable().optional(), // Merchant/company name
  linkedPlaidAccountId: z.string().nullable().optional(), // Link to Plaid account for auto-detected bills
});

// Partial schema for updates
export const updateBillSchema = insertBillSchema.partial();

export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true, userId: true }).extend({
  userId: z.string().optional(), // Will be set by route from session
  amount: z.string().or(z.number()).transform((val) => String(val)),
  category: z.enum(EXPENSE_CATEGORIES),
  date: z.string(),
  taxDeductible: z.string().optional(),
  taxCategory: z.string().nullable().optional(),
  isBusinessExpense: z.string().optional(),
});

// Partial schema for updates
export const updateExpenseSchema = insertExpenseSchema.partial();

// Types
export type InsertBill = z.infer<typeof insertBillSchema>;
export type Bill = typeof bills.$inferSelect;

export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

// Income categories
export const INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Business",
  "Investments",
  "Rental",
  "Gifts",
  "Refunds",
  "Other"
] as const;

// Income table - for tracking income
export const income = pgTable("income", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Owner of this income
  source: text("source").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  date: text("date").notNull(), // Stored as "yyyy-MM-dd" string
  category: text("category").notNull(),
  isRecurring: text("is_recurring").default("false"),
  recurrence: text("recurrence"), // Added for income recurrence
  dueDay: integer("due_day"), // Added for income recurring days (1st/15th etc)
  customDates: text("custom_dates"), // JSON array of dates for custom recurrence
  notes: text("notes"),
  isActive: text("is_active").default("true"), // Allows disabling income to exclude from forecasts
  linkedPlaidAccountId: varchar("linked_plaid_account_id"), // Link to Plaid account for auto-detected income
  // Scheduled amount change fields (e.g., for tax bracket changes, raises)
  futureAmount: numeric("future_amount", { precision: 10, scale: 2 }), // New amount after change date
  amountChangeDate: text("amount_change_date"), // When the amount changes (yyyy-MM-dd)
});

export const insertIncomeSchema = createInsertSchema(income).omit({ id: true, userId: true }).extend({
  userId: z.string().optional(), // Will be set by route from session
  amount: z.string().or(z.number()).transform((val) => String(val)),
  category: z.enum(INCOME_CATEGORIES),
  date: z.string(),
  isRecurring: z.union([z.boolean().transform(val => val ? 'true' : 'false'), z.string()]).optional(),
  recurrence: z.enum(RECURRENCE_OPTIONS).nullable().optional(),
  dueDay: z.number().min(0).max(31).nullable().optional(),
  customDates: z.string().nullable().optional(),
  isActive: z.string().optional().default("true"),
  linkedPlaidAccountId: z.string().nullable().optional(), // Link to Plaid account for auto-detected income
  futureAmount: z.string().or(z.number()).transform((val) => val ? String(val) : null).nullable().optional(),
  amountChangeDate: z.string().nullable().optional(), // When the amount changes
});

export const updateIncomeSchema = insertIncomeSchema.partial();

export type InsertIncome = z.infer<typeof insertIncomeSchema>;
export type Income = typeof income.$inferSelect;

// Budgets table - monthly budget limits per category
export const budgets = pgTable("budgets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Owner of this budget
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  month: text("month").notNull(), // Stored as "yyyy-MM" string
});

export const insertBudgetSchema = createInsertSchema(budgets).omit({ id: true, userId: true }).extend({
  userId: z.string().optional(), // Will be set by route from session
  amount: z.string().or(z.number()).transform((val) => String(val)),
  category: z.enum(EXPENSE_CATEGORIES),
  month: z.string(),
});

export const updateBudgetSchema = insertBudgetSchema.partial();

export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type Budget = typeof budgets.$inferSelect;

// Savings Goals table
export const savingsGoals = pgTable("savings_goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Owner of this goal
  name: text("name").notNull(),
  targetAmount: numeric("target_amount", { precision: 10, scale: 2 }).notNull(),
  currentAmount: numeric("current_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  targetDate: text("target_date"), // Optional target date "yyyy-MM-dd"
  color: text("color").default("#3b82f6"), // For visual display
  notes: text("notes"),
});

export const insertSavingsGoalSchema = createInsertSchema(savingsGoals).omit({ id: true, userId: true }).extend({
  userId: z.string().optional(), // Will be set by route from session
  targetAmount: z.string().or(z.number()).transform((val) => String(val)),
  currentAmount: z.string().or(z.number()).transform((val) => String(val)).optional(),
});

export const updateSavingsGoalSchema = insertSavingsGoalSchema.partial();

export type InsertSavingsGoal = z.infer<typeof insertSavingsGoalSchema>;
export type SavingsGoal = typeof savingsGoals.$inferSelect;

// ============ MX INTEGRATION TABLES ============

// MX Members table - stores connections to financial institutions (replaces Plaid Items)
export const mxMembers = pgTable("mx_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  memberGuid: text("member_guid").notNull().unique(), // MX member GUID
  institutionCode: text("institution_code"),
  institutionName: text("institution_name"),
  connectionStatus: text("connection_status").default("pending"), // CONNECTED, CHALLENGED, DISCONNECTED, etc.
  isOauth: text("is_oauth").default("false"),
  aggregatedAt: text("aggregated_at"),
  successfullyAggregatedAt: text("successfully_aggregated_at"),
  createdAt: text("created_at"),
});

// MX Accounts table - individual bank accounts from MX
export const mxAccounts = pgTable("mx_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mxMemberId: varchar("mx_member_id").notNull(),
  accountGuid: text("account_guid").notNull().unique(), // MX account GUID
  name: text("name").notNull(),
  type: text("type").notNull(), // CHECKING, SAVINGS, CREDIT_CARD, LOAN, MORTGAGE, INVESTMENT
  subtype: text("subtype"),
  balance: numeric("balance", { precision: 12, scale: 2 }),
  availableBalance: numeric("available_balance", { precision: 12, scale: 2 }),
  creditLimit: numeric("credit_limit", { precision: 12, scale: 2 }),
  apr: numeric("apr", { precision: 6, scale: 4 }),
  apy: numeric("apy", { precision: 6, scale: 4 }),
  minimumPayment: numeric("minimum_payment", { precision: 12, scale: 2 }),
  paymentDueAt: text("payment_due_at"),
  originalBalance: numeric("original_balance", { precision: 12, scale: 2 }), // For loans/mortgages
  interestRate: numeric("interest_rate", { precision: 6, scale: 4 }),
  currencyCode: text("currency_code").default("USD"),
  accountNumber: text("account_number"), // Last 4 digits
  isClosed: text("is_closed").default("false"),
  isHidden: text("is_hidden").default("false"),
  isActive: text("is_active").default("true"), // User toggle for double-counting
  lastSynced: text("last_synced"),
});

// MX Transactions table - bank transactions with MX enrichment
export const mxTransactions = pgTable("mx_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mxAccountId: varchar("mx_account_id").notNull(),
  transactionGuid: text("transaction_guid").notNull().unique(), // MX transaction GUID
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  date: text("date").notNull(), // yyyy-MM-dd
  description: text("description").notNull(), // Enriched description from MX
  originalDescription: text("original_description"), // Raw bank description
  merchantGuid: text("merchant_guid"), // For logo lookup
  category: text("category"), // MX category
  topLevelCategory: text("top_level_category"), // MX top level category
  personalCategory: text("personal_category"), // Mapped Budget Smart AI category
  transactionType: text("transaction_type"), // DEBIT, CREDIT
  isBillPay: text("is_bill_pay").default("false"),
  isDirectDeposit: text("is_direct_deposit").default("false"),
  isExpense: text("is_expense").default("false"),
  isFee: text("is_fee").default("false"),
  isIncome: text("is_income").default("false"),
  isRecurring: text("is_recurring").default("false"),
  isSubscription: text("is_subscription").default("false"),
  status: text("status").default("POSTED"), // PENDING, POSTED
  transactedAt: text("transacted_at"),
  postedAt: text("posted_at"),
  currencyCode: text("currency_code").default("USD"),
  // Reconciliation fields
  matchType: text("match_type"), // bill, expense, income, unmatched
  matchedBillId: varchar("matched_bill_id"),
  matchedExpenseId: varchar("matched_expense_id"),
  matchedIncomeId: varchar("matched_income_id"),
  reconciled: text("reconciled").default("false"),
  // Tax fields
  taxDeductible: text("tax_deductible").default("false"),
  taxCategory: text("tax_category"),
  isBusinessExpense: text("is_business_expense").default("false"),
  createdAt: text("created_at"),
  // Enrichment fields
  merchantCleanName: varchar("merchant_clean_name", { length: 200 }),
  merchantLogoUrl: varchar("merchant_logo_url", { length: 500 }),
  subcategory: varchar("subcategory", { length: 100 }),
  merchantType: varchar("merchant_type", { length: 50 }),
  enrichmentSource: varchar("enrichment_source", { length: 50 }),
  enrichmentConfidence: numeric("enrichment_confidence", { precision: 3, scale: 2 }),
});

export const insertMxMemberSchema = createInsertSchema(mxMembers).omit({ id: true });
export type MxMember = typeof mxMembers.$inferSelect;
export type InsertMxMember = z.infer<typeof insertMxMemberSchema>;

export const insertMxAccountSchema = createInsertSchema(mxAccounts).omit({ id: true });
export type MxAccount = typeof mxAccounts.$inferSelect;
export type InsertMxAccount = z.infer<typeof insertMxAccountSchema>;

export const insertMxTransactionSchema = createInsertSchema(mxTransactions).omit({ id: true });
export type MxTransaction = typeof mxTransactions.$inferSelect;
export type InsertMxTransaction = z.infer<typeof insertMxTransactionSchema>;

// ============ PLAID TABLES (LEGACY - TO BE REMOVED) ============

// Plaid Items table - stores connections to financial institutions
export const plaidItems = pgTable("plaid_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  accessToken: text("access_token").notNull(),
  itemId: text("item_id").notNull().unique(),
  institutionId: text("institution_id"),
  institutionName: text("institution_name"),
  cursor: text("cursor"), // Transaction sync cursor for incremental sync
  status: text("status").default("active"), // active, error, expired
  createdAt: text("created_at"),
});

// Plaid Accounts table - individual bank accounts
export const plaidAccounts = pgTable("plaid_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  plaidItemId: varchar("plaid_item_id").notNull(),
  accountId: text("account_id").notNull().unique(),
  name: text("name").notNull(),
  officialName: text("official_name"),
  type: text("type").notNull(), // depository, credit, loan, investment
  subtype: text("subtype"), // chequing, savings, credit card
  mask: text("mask"), // Last 4 digits
  balanceCurrent: numeric("balance_current", { precision: 12, scale: 2 }),
  balanceAvailable: numeric("balance_available", { precision: 12, scale: 2 }),
  balanceLimit: numeric("balance_limit", { precision: 12, scale: 2 }),
  isoCurrencyCode: text("iso_currency_code").default("CAD"),
  lastSynced: text("last_synced"),
  isActive: text("is_active").default("true"), // Allows disabling accounts to prevent double-counting
});

// Plaid Transactions table - bank transactions with reconciliation
export const plaidTransactions = pgTable("plaid_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  plaidAccountId: varchar("plaid_account_id").notNull(),
  transactionId: text("transaction_id").notNull().unique(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  date: text("date").notNull(), // yyyy-MM-dd
  name: text("name").notNull(),
  merchantName: text("merchant_name"),
  logoUrl: text("logo_url"), // Merchant logo URL from Plaid (100x100 PNG)
  category: text("category"), // Plaid's category
  personalCategory: text("personal_category"), // Mapped Budget Smart AI category
  pending: text("pending").default("false"),
  // Reconciliation fields
  matchType: text("match_type"), // bill, expense, income, unmatched
  matchedBillId: varchar("matched_bill_id"),
  matchedExpenseId: varchar("matched_expense_id"),
  matchedIncomeId: varchar("matched_income_id"),
  reconciled: text("reconciled").default("false"),
  isoCurrencyCode: text("iso_currency_code").default("CAD"),
  // Tax fields
  taxDeductible: text("tax_deductible").default("false"),
  taxCategory: text("tax_category"),
  isBusinessExpense: text("is_business_expense").default("false"),
  createdAt: text("created_at"),
  // Enrichment fields
  merchantCleanName: varchar("merchant_clean_name", { length: 200 }),
  merchantLogoUrl: varchar("merchant_logo_url", { length: 500 }),
  subcategory: varchar("subcategory", { length: 100 }),
  merchantType: varchar("merchant_type", { length: 50 }),
  isSubscription: text("is_subscription").default("false"),
  enrichmentSource: varchar("enrichment_source", { length: 50 }),
  enrichmentConfidence: numeric("enrichment_confidence", { precision: 3, scale: 2 }),
});

// ============ MANUAL ACCOUNTS (Transaction-Centric Architecture) ============

// Manual Accounts table - for tracking non-bank spending (cash, PayPal, Venmo, etc.)
export const manualAccounts = pgTable("manual_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // cash, paypal, venmo, other
  balance: numeric("balance", { precision: 12, scale: 2 }).default("0"),
  currency: text("currency").default("USD"),
  isActive: text("is_active").default("true"),
  createdAt: text("created_at"),
});

// Manual Transactions table - transactions within manual accounts
export const manualTransactions = pgTable("manual_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull(),
  userId: varchar("user_id").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  date: text("date").notNull(), // yyyy-MM-dd
  merchant: text("merchant").notNull(),
  category: text("category"),
  notes: text("notes"),
  isTransfer: text("is_transfer").default("false"),
  // Tax fields
  taxDeductible: text("tax_deductible").default("false"),
  taxCategory: text("tax_category"),
  isBusinessExpense: text("is_business_expense").default("false"),
  createdAt: text("created_at"),
  // Enrichment fields
  merchantCleanName: varchar("merchant_clean_name", { length: 200 }),
  merchantLogoUrl: varchar("merchant_logo_url", { length: 500 }),
  subcategory: varchar("subcategory", { length: 100 }),
  merchantType: varchar("merchant_type", { length: 50 }),
  isSubscription: text("is_subscription").default("false"),
  enrichmentSource: varchar("enrichment_source", { length: 50 }),
  enrichmentConfidence: numeric("enrichment_confidence", { precision: 3, scale: 2 }),
});

export const insertManualAccountSchema = createInsertSchema(manualAccounts).omit({ id: true, userId: true }).extend({
  userId: z.string().optional(), // Will be set by route from session
  type: z.enum(MANUAL_ACCOUNT_TYPES),
  balance: z.string().or(z.number()).transform((val) => val ? String(val) : "0").optional(),
});
export const updateManualAccountSchema = insertManualAccountSchema.partial();
export type ManualAccount = typeof manualAccounts.$inferSelect;
export type InsertManualAccount = z.infer<typeof insertManualAccountSchema>;

export const insertManualTransactionSchema = createInsertSchema(manualTransactions).omit({ id: true, userId: true }).extend({
  userId: z.string().optional(), // Will be set by route from session
  amount: z.string().or(z.number()).transform((val) => String(val)),
  category: z.enum(EXPENSE_CATEGORIES).optional().nullable(),
  date: z.string(),
  taxDeductible: z.string().optional(),
  taxCategory: z.string().nullable().optional(),
  isBusinessExpense: z.string().optional(),
});
export const updateManualTransactionSchema = insertManualTransactionSchema.partial();
export type ManualTransaction = typeof manualTransactions.$inferSelect;
export type InsertManualTransaction = z.infer<typeof insertManualTransactionSchema>;

export const insertPlaidItemSchema = createInsertSchema(plaidItems).omit({ id: true });
export type PlaidItem = typeof plaidItems.$inferSelect;
export type InsertPlaidItem = z.infer<typeof insertPlaidItemSchema>;

export const insertPlaidAccountSchema = createInsertSchema(plaidAccounts).omit({ id: true });
export type PlaidAccount = typeof plaidAccounts.$inferSelect;
export type InsertPlaidAccount = z.infer<typeof insertPlaidAccountSchema>;

export const insertPlaidTransactionSchema = createInsertSchema(plaidTransactions).omit({ id: true });
export type PlaidTransaction = typeof plaidTransactions.$inferSelect;
export type InsertPlaidTransaction = z.infer<typeof insertPlaidTransactionSchema>;

// Subscription status options
export const SUBSCRIPTION_STATUS = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused"
] as const;

// User schema with MFA support and profile
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password"),
  email: text("email"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  mfaSecret: text("mfa_secret"),
  mfaEnabled: text("mfa_enabled").default("false"),
  isAdmin: text("is_admin").default("false"),
  isApproved: text("is_approved").default("false"),
  onboardingComplete: text("onboarding_complete").default("false"),
  googleId: text("google_id").unique(),
  // Stripe subscription fields
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"), // active, trialing, past_due, canceled, etc.
  subscriptionPlanId: text("subscription_plan_id"), // Reference to landing_pricing id
  trialEndsAt: text("trial_ends_at"), // ISO date string
  subscriptionEndsAt: text("subscription_ends_at"), // When current period ends
  trialEmailReminder: text("trial_email_reminder").default("true"), // User preference for trial end reminder
  selectedPlanId: text("selected_plan_id"), // Plan selected during signup (before checkout)
  createdAt: text("created_at"),
  // Email verification fields
  emailVerified: text("email_verified").default("false"),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpiry: text("email_verification_expiry"),
  // MFA requirement flag (true for email signups, false for OAuth)
  mfaRequired: text("mfa_required").default("false"),
  // Demo account flag - read-only access
  isDemo: text("is_demo").default("false"),
  // MX integration - user GUID for bank aggregation
  mxUserGuid: text("mx_user_guid"),
  // User's country for geo-based bank provider selection (ISO 3166-1 alpha-2 code)
  country: text("country").default("US"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const createUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  email: z.string().email("Valid email required").optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  isAdmin: z.boolean().optional().default(false),
  isApproved: z.boolean().optional().default(true),
  trialEmailReminder: z.boolean().optional().default(true),
  selectedPlanId: z.string().optional(),
});

export const updateUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  email: z.string().email("Valid email required").optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  isAdmin: z.boolean().optional(),
  isApproved: z.boolean().optional(),
  subscriptionPlanId: z.string().optional().nullable(),
  subscriptionStatus: z.string().optional().nullable(),
});

export const updateProfileSchema = z.object({
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  email: z.string().email("Valid email required").optional().nullable(),
  phone: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
});

export const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  email: z.string().email("Valid email required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  trialEmailReminder: z.boolean().optional().default(true),
  selectedPlanId: z.string().optional().nullable(),
  country: z.string().optional().default("US"),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  mfaCode: z.string().optional(),
});

export const contactFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  subject: z.string().min(1, "Subject is required"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

export const supportFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  type: z.enum(["ticket", "feature", "bug"]),
  subject: z.string().min(1, "Subject is required"),
  priority: z.enum(["low", "medium", "high"]).optional(),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
export type ContactFormInput = z.infer<typeof contactFormSchema>;
export type SupportFormInput = z.infer<typeof supportFormSchema>;

// ============ NEW TABLES FOR PRODUCTION FEATURES ============

// User notification settings - email preferences per user
export const notificationSettings = pgTable("notification_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  emailEnabled: text("email_enabled").default("true"),
  emailAddress: text("email_address"), // Override default user email
  billReminderDays: integer("bill_reminder_days").default(1), // Days before due date
  billReminderTime: text("bill_reminder_time").default("09:00"), // HH:mm format
  budgetAlertEnabled: text("budget_alert_enabled").default("true"),
  budgetAlertThreshold: integer("budget_alert_threshold").default(80), // Percentage of budget
  weeklyDigestEnabled: text("weekly_digest_enabled").default("false"),
  weeklyDigestDay: integer("weekly_digest_day").default(0), // 0=Sunday, 6=Saturday
  monthlyReportEnabled: text("monthly_report_enabled").default("true"),
  inAppNotificationsEnabled: text("in_app_notifications_enabled").default("true"),
});

export const insertNotificationSettingsSchema = createInsertSchema(notificationSettings).omit({ id: true });
export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = z.infer<typeof insertNotificationSettingsSchema>;

// Custom categories - user-defined expense/income categories
export const customCategories = pgTable("custom_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'expense', 'income', 'bill'
  color: text("color").default("#6366f1"),
  icon: text("icon"), // Lucide icon name
  isActive: text("is_active").default("true"),
});

export const insertCustomCategorySchema = createInsertSchema(customCategories).omit({ id: true }).extend({
  type: z.enum(["expense", "income", "bill"]),
});
export type CustomCategory = typeof customCategories.$inferSelect;
export type InsertCustomCategory = z.infer<typeof insertCustomCategorySchema>;

// Recurring expenses (subscriptions)
export const recurringExpenses = pgTable("recurring_expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  category: text("category").notNull(),
  recurrence: text("recurrence").notNull(), // weekly, biweekly, monthly, yearly
  startDate: text("start_date").notNull(), // yyyy-MM-dd
  nextDueDate: text("next_due_date").notNull(), // yyyy-MM-dd
  endDate: text("end_date"), // Optional end date
  merchant: text("merchant"),
  notes: text("notes"),
  isActive: text("is_active").default("true"),
  lastProcessedDate: text("last_processed_date"),
});

export const insertRecurringExpenseSchema = createInsertSchema(recurringExpenses).omit({ id: true }).extend({
  amount: z.string().or(z.number()).transform((val) => String(val)),
  recurrence: z.enum(RECURRENCE_OPTIONS),
});
export type RecurringExpense = typeof recurringExpenses.$inferSelect;
export type InsertRecurringExpense = z.infer<typeof insertRecurringExpenseSchema>;

// AI Reconciliation rules - learned patterns for auto-categorization
export const reconciliationRules = pgTable("reconciliation_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  merchantPattern: text("merchant_pattern").notNull(), // Regex or exact match
  matchType: text("match_type").notNull(), // bill, expense, income
  matchedCategory: text("matched_category"),
  matchedItemId: varchar("matched_item_id"), // Reference to bill/income if applicable
  confidence: numeric("confidence", { precision: 3, scale: 2 }).default("1.00"),
  timesApplied: integer("times_applied").default(0),
  isAutoGenerated: text("is_auto_generated").default("true"), // AI vs manual rule
  createdAt: text("created_at"),
});

export const insertReconciliationRuleSchema = createInsertSchema(reconciliationRules).omit({ id: true });
export type ReconciliationRule = typeof reconciliationRules.$inferSelect;
export type InsertReconciliationRule = z.infer<typeof insertReconciliationRuleSchema>;

// Sync schedules - configurable auto-sync times
export const syncSchedules = pgTable("sync_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  plaidItemId: varchar("plaid_item_id"),
  syncType: text("sync_type").notNull(), // 'accounts', 'transactions', 'all'
  frequency: text("frequency").notNull(), // 'hourly', 'daily', 'custom'
  times: text("times"), // JSON array of HH:mm times for custom
  isEnabled: text("is_enabled").default("true"),
  lastSyncAt: text("last_sync_at"),
  nextSyncAt: text("next_sync_at"),
});

export const insertSyncScheduleSchema = createInsertSchema(syncSchedules).omit({ id: true });
export type SyncSchedule = typeof syncSchedules.$inferSelect;
export type InsertSyncSchedule = z.infer<typeof insertSyncScheduleSchema>;

// In-app notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(), // 'bill_reminder', 'budget_alert', 'sync_complete', 'system'
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"), // Optional link to related page
  isRead: text("is_read").default("false"),
  createdAt: text("created_at"),
  expiresAt: text("expires_at"),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true });
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// Budget alerts - track when budgets are exceeded
export const budgetAlerts = pgTable("budget_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  budgetId: varchar("budget_id").notNull(),
  category: text("category").notNull(),
  month: text("month").notNull(), // yyyy-MM
  thresholdPercent: integer("threshold_percent").notNull(),
  currentPercent: integer("current_percent").notNull(),
  amountSpent: numeric("amount_spent", { precision: 10, scale: 2 }).notNull(),
  budgetAmount: numeric("budget_amount", { precision: 10, scale: 2 }).notNull(),
  alertSentAt: text("alert_sent_at"),
  emailSent: text("email_sent").default("false"),
});

export const insertBudgetAlertSchema = createInsertSchema(budgetAlerts).omit({ id: true });
export type BudgetAlert = typeof budgetAlerts.$inferSelect;
export type InsertBudgetAlert = z.infer<typeof insertBudgetAlertSchema>;

// Onboarding analysis (stores AI results + wizard progress)
export const onboardingAnalysis = pgTable("onboarding_analysis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  analysisData: text("analysis_data").notNull(),
  step: integer("step").default(1),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

export const insertOnboardingAnalysisSchema = createInsertSchema(onboardingAnalysis).omit({ id: true });
export type OnboardingAnalysis = typeof onboardingAnalysis.$inferSelect;
export type InsertOnboardingAnalysis = z.infer<typeof insertOnboardingAnalysisSchema>;

// ============ HOUSEHOLD COLLABORATION TABLES ============

// Household roles
export const HOUSEHOLD_ROLES = ["owner", "member", "advisor"] as const;

// Households table - groups of users sharing finances
export const households = pgTable("households", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdAt: text("created_at"),
});

export const insertHouseholdSchema = createInsertSchema(households).omit({ id: true });
export type Household = typeof households.$inferSelect;
export type InsertHousehold = z.infer<typeof insertHouseholdSchema>;

// Household members - users belonging to a household with roles
export const householdMembers = pgTable("household_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").notNull(),
  userId: varchar("user_id").notNull(),
  role: text("role").notNull(), // owner, member, advisor
  joinedAt: text("joined_at"),
});

export const insertHouseholdMemberSchema = createInsertSchema(householdMembers).omit({ id: true }).extend({
  role: z.enum(HOUSEHOLD_ROLES),
});
export type HouseholdMember = typeof householdMembers.$inferSelect;
export type InsertHouseholdMember = z.infer<typeof insertHouseholdMemberSchema>;

// Invitation status
export const INVITATION_STATUS = ["pending", "accepted", "declined", "expired"] as const;

// Household invitations - pending invites to join a household
export const householdInvitations = pgTable("household_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(), // member or advisor
  token: text("token").notNull().unique(),
  status: text("status").default("pending"), // pending, accepted, declined, expired
  invitedBy: varchar("invited_by").notNull(), // userId of inviter
  expiresAt: text("expires_at"),
  createdAt: text("created_at"),
});

export const insertHouseholdInvitationSchema = createInsertSchema(householdInvitations).omit({ id: true }).extend({
  role: z.enum(["member", "advisor"]),
  status: z.enum(INVITATION_STATUS).optional(),
});
export type HouseholdInvitation = typeof householdInvitations.$inferSelect;
export type InsertHouseholdInvitation = z.infer<typeof insertHouseholdInvitationSchema>;

// Schema for creating an invitation (what the API receives)
export const createInvitationSchema = z.object({
  email: z.string().email("Valid email is required"),
  role: z.enum(["member", "advisor"]),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

// Schema for creating a household
export const createHouseholdSchema = z.object({
  name: z.string().min(1, "Household name is required").max(100, "Household name too long"),
});
export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;

// ============ REFERRAL PROGRAM ============

// Referral codes - each user gets a unique referral code
export const referralCodes = pgTable("referral_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  code: text("code").notNull().unique(), // e.g., "JOHN2024" or random
  totalReferrals: integer("total_referrals").default(0),
  successfulReferrals: integer("successful_referrals").default(0),
  createdAt: text("created_at"),
});

export const insertReferralCodeSchema = createInsertSchema(referralCodes).omit({ id: true });
export type ReferralCode = typeof referralCodes.$inferSelect;
export type InsertReferralCode = z.infer<typeof insertReferralCodeSchema>;

// Referral status enum
export const REFERRAL_STATUS = ["pending", "registered", "active", "rewarded"] as const;

// Referrals - track individual referrals
export const referrals = pgTable("referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: varchar("referrer_id").notNull(), // User who referred
  referredEmail: text("referred_email").notNull(), // Email of the person invited
  referredUserId: varchar("referred_user_id"), // Filled when they sign up
  referralCode: text("referral_code").notNull(), // The code used
  status: text("status").default("pending"), // pending, registered, active, rewarded
  invitedAt: text("invited_at"),
  registeredAt: text("registered_at"),
  activatedAt: text("activated_at"), // When they completed onboarding or added data
  rewardedAt: text("rewarded_at"),
});

export const insertReferralSchema = createInsertSchema(referrals).omit({ id: true }).extend({
  status: z.enum(REFERRAL_STATUS).optional(),
});
export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = z.infer<typeof insertReferralSchema>;

// ============ DEBT MANAGEMENT ============

// Debt type categories
export const DEBT_TYPES = [
  "Credit Card",
  "Line of Credit", 
  "Personal Loan",
  "Auto Loan",
  "Student Loan",
  "Mortgage",
  "HELOC",
  "Medical Debt",
  "Other"
] as const;

// Payment frequency options
export const PAYMENT_FREQUENCIES = [
  "Weekly",
  "Biweekly",
  "Semi-monthly",
  "Monthly",
  "Quarterly",
  "Annually"
] as const;

// Debt details table - stores loan/credit details for payoff planning
export const debtDetails = pgTable("debt_details", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  debtType: text("debt_type").notNull(), // Credit Card, Line of Credit, Personal Loan, etc.
  currentBalance: numeric("current_balance", { precision: 12, scale: 2 }).notNull(),
  originalPrincipal: numeric("original_principal", { precision: 12, scale: 2 }), // Initial amount borrowed
  apr: numeric("apr", { precision: 5, scale: 2 }).notNull(), // Annual Percentage Rate
  minimumPayment: numeric("minimum_payment", { precision: 10, scale: 2 }).notNull(),
  paymentFrequency: text("payment_frequency").default("Monthly"), // Weekly, Biweekly, Semi-monthly, Monthly, etc.
  termMonths: integer("term_months"), // Loan term in months (null for revolving credit)
  creditLimit: numeric("credit_limit", { precision: 12, scale: 2 }), // For credit cards/LOC
  dueDay: integer("due_day"), // Day of month payment is due
  lender: text("lender"), // Bank/lender name
  accountNumber: text("account_number"), // Last 4 digits or masked
  linkedPlaidAccountId: varchar("linked_plaid_account_id"), // Optional link to Plaid account
  startDate: text("start_date"), // When the loan started (yyyy-MM-dd)
  notes: text("notes"),
  isActive: text("is_active").default("true"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

export const insertDebtDetailsSchema = createInsertSchema(debtDetails).omit({ id: true, userId: true }).extend({
  userId: z.string().optional(), // Will be set by route from session
  debtType: z.enum(DEBT_TYPES),
  currentBalance: z.string().or(z.number()).transform((val) => String(val)),
  originalPrincipal: z.string().or(z.number()).transform((val) => val ? String(val) : null).nullable().optional(),
  apr: z.string().or(z.number()).transform((val) => String(val)),
  minimumPayment: z.string().or(z.number()).transform((val) => String(val)),
  paymentFrequency: z.enum(PAYMENT_FREQUENCIES).optional().default("Monthly"),
  termMonths: z.number().nullable().optional(),
  creditLimit: z.string().or(z.number()).transform((val) => val ? String(val) : null).nullable().optional(),
  dueDay: z.number().min(1).max(31).nullable().optional(),
  linkedPlaidAccountId: z.string().nullable().optional(),
});

export const updateDebtDetailsSchema = insertDebtDetailsSchema.partial();

export type DebtDetails = typeof debtDetails.$inferSelect;
export type InsertDebtDetails = z.infer<typeof insertDebtDetailsSchema>;

// ============ AI FEATURES TABLES ============

// AI Insight types
export const AI_INSIGHT_TYPES = [
  "spending_pace",
  "budget_trajectory",
  "subscription_unused",
  "savings_opportunity",
  "low_balance_warning",
  "unusual_spending"
] as const;

// AI Insight severity levels
export const AI_INSIGHT_SEVERITY = ["info", "warning", "alert"] as const;

// AI Insights table - stores proactive coach insights
export const aiInsights = pgTable("ai_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  insightType: text("insight_type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  severity: text("severity").notNull(),
  category: text("category"), // Related spending category if applicable
  metadata: text("metadata"), // JSON with additional context
  actionUrl: text("action_url"), // Link to relevant page
  isRead: text("is_read").default("false"),
  isDismissed: text("is_dismissed").default("false"),
  createdAt: text("created_at"),
  expiresAt: text("expires_at"),
});

export const insertAiInsightSchema = createInsertSchema(aiInsights).omit({ id: true }).extend({
  insightType: z.enum(AI_INSIGHT_TYPES),
  severity: z.enum(AI_INSIGHT_SEVERITY),
});

export type AiInsight = typeof aiInsights.$inferSelect;
export type InsertAiInsight = z.infer<typeof insertAiInsightSchema>;

// Anomaly types
export const ANOMALY_TYPES = [
  "large_purchase",
  "duplicate_charge",
  "price_increase",
  "new_merchant",
  "unusual_location",
  "unusual_time"
] as const;

// Anomaly severity levels
export const ANOMALY_SEVERITY = ["low", "medium", "high"] as const;

// Transaction Anomalies table - flagged suspicious transactions
export const transactionAnomalies = pgTable("transaction_anomalies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  transactionId: varchar("transaction_id").notNull(),
  anomalyType: text("anomaly_type").notNull(),
  severity: text("severity").notNull(),
  description: text("description").notNull(),
  merchantName: text("merchant_name"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  expectedAmount: numeric("expected_amount", { precision: 12, scale: 2 }), // Historical average
  isReviewed: text("is_reviewed").default("false"),
  isFalsePositive: text("is_false_positive").default("false"),
  reviewedAt: text("reviewed_at"),
  createdAt: text("created_at"),
});

export const insertTransactionAnomalySchema = createInsertSchema(transactionAnomalies).omit({ id: true }).extend({
  anomalyType: z.enum(ANOMALY_TYPES),
  severity: z.enum(ANOMALY_SEVERITY),
  amount: z.string().or(z.number()).transform((val) => String(val)),
  expectedAmount: z.string().or(z.number()).transform((val) => val ? String(val) : null).nullable().optional(),
});

export const updateTransactionAnomalySchema = insertTransactionAnomalySchema.partial();

export type TransactionAnomaly = typeof transactionAnomalies.$inferSelect;
export type InsertTransactionAnomaly = z.infer<typeof insertTransactionAnomalySchema>;

// Savings recommendation types
export const SAVINGS_RECOMMENDATION_TYPES = [
  "safe_to_save",
  "round_up",
  "fixed_transfer",
  "surplus_detected"
] as const;

// Savings Recommendations table - AI-calculated safe savings amounts
export const savingsRecommendations = pgTable("savings_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  recommendationType: text("recommendation_type").notNull(),
  suggestedAmount: numeric("suggested_amount", { precision: 12, scale: 2 }).notNull(),
  targetGoalId: varchar("target_goal_id"), // Optional link to savings goal
  calculationDetails: text("calculation_details"), // JSON with breakdown
  validUntil: text("valid_until"), // Recommendation expires after conditions change
  status: text("status").default("pending"), // pending, accepted, declined, expired
  acceptedAt: text("accepted_at"),
  createdAt: text("created_at"),
});

export const insertSavingsRecommendationSchema = createInsertSchema(savingsRecommendations).omit({ id: true }).extend({
  recommendationType: z.enum(SAVINGS_RECOMMENDATION_TYPES),
  suggestedAmount: z.string().or(z.number()).transform((val) => String(val)),
});

export const updateSavingsRecommendationSchema = insertSavingsRecommendationSchema.partial();

export type SavingsRecommendation = typeof savingsRecommendations.$inferSelect;
export type InsertSavingsRecommendation = z.infer<typeof insertSavingsRecommendationSchema>;

// ============ INVESTMENT PORTFOLIO TABLES ============

// Investment account types
export const INVESTMENT_ACCOUNT_TYPES = [
  "brokerage",
  "retirement_401k",
  "retirement_ira",
  "retirement_roth",
  "crypto_wallet",
  "crypto_exchange",
  "other"
] as const;

// Asset/holding types
export const HOLDING_TYPES = [
  "stock",
  "etf",
  "mutual_fund",
  "bond",
  "crypto",
  "option",
  "other"
] as const;

// Investment accounts table - Brokerage, 401k, IRA, crypto accounts
export const investmentAccounts = pgTable("investment_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  accountType: text("account_type").notNull(), // brokerage, retirement_401k, retirement_ira, retirement_roth, crypto_wallet, crypto_exchange, other
  institution: text("institution"), // Fidelity, Vanguard, Coinbase, etc.
  accountNumber: text("account_number"), // Last 4 digits
  balance: numeric("balance", { precision: 14, scale: 2 }).default("0"),
  currency: text("currency").default("USD"),
  notes: text("notes"),
  isActive: text("is_active").default("true"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

export const insertInvestmentAccountSchema = createInsertSchema(investmentAccounts).omit({ id: true, userId: true }).extend({
  userId: z.string().optional(),
  accountType: z.enum(INVESTMENT_ACCOUNT_TYPES),
  balance: z.string().or(z.number()).transform((val) => val ? String(val) : "0").optional(),
});
export const updateInvestmentAccountSchema = insertInvestmentAccountSchema.partial();
export type InvestmentAccount = typeof investmentAccounts.$inferSelect;
export type InsertInvestmentAccount = z.infer<typeof insertInvestmentAccountSchema>;

// Holdings table - Individual positions (stocks, crypto, etc.)
export const holdings = pgTable("holdings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  investmentAccountId: varchar("investment_account_id").notNull(),
  userId: varchar("user_id").notNull(),
  symbol: text("symbol").notNull(), // AAPL, BTC, etc.
  name: text("name").notNull(), // Apple Inc., Bitcoin, etc.
  holdingType: text("holding_type").notNull(), // stock, etf, crypto, etc.
  quantity: numeric("quantity", { precision: 18, scale: 8 }).notNull(), // Allow fractional shares/crypto
  costBasis: numeric("cost_basis", { precision: 14, scale: 2 }), // Total cost basis
  currentPrice: numeric("current_price", { precision: 14, scale: 6 }), // Last known price
  currentValue: numeric("current_value", { precision: 14, scale: 2 }), // quantity * currentPrice
  currency: text("currency").default("USD"),
  lastPriceUpdate: text("last_price_update"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

export const insertHoldingSchema = createInsertSchema(holdings).omit({ id: true, userId: true }).extend({
  userId: z.string().optional(),
  holdingType: z.enum(HOLDING_TYPES),
  quantity: z.string().or(z.number()).transform((val) => String(val)),
  costBasis: z.string().or(z.number()).transform((val) => val ? String(val) : null).nullable().optional(),
  currentPrice: z.string().or(z.number()).transform((val) => val ? String(val) : null).nullable().optional(),
  currentValue: z.string().or(z.number()).transform((val) => val ? String(val) : null).nullable().optional(),
});
export const updateHoldingSchema = insertHoldingSchema.partial();
export type Holding = typeof holdings.$inferSelect;
export type InsertHolding = z.infer<typeof insertHoldingSchema>;

// Holdings history table - Price/value history for performance tracking
export const holdingsHistory = pgTable("holdings_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  holdingId: varchar("holding_id").notNull(),
  date: text("date").notNull(), // yyyy-MM-dd
  price: numeric("price", { precision: 14, scale: 6 }).notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 8 }).notNull(),
  value: numeric("value", { precision: 14, scale: 2 }).notNull(),
  createdAt: text("created_at"),
});

export const insertHoldingsHistorySchema = createInsertSchema(holdingsHistory).omit({ id: true });
export type HoldingsHistory = typeof holdingsHistory.$inferSelect;
export type InsertHoldingsHistory = z.infer<typeof insertHoldingsHistorySchema>;

// ============ ASSET TRACKING TABLES ============

// Asset categories
export const ASSET_CATEGORIES = [
  "real_estate",
  "vehicle",
  "collectible",
  "jewelry",
  "art",
  "equipment",
  "other"
] as const;

// Assets table - Property, vehicles, collectibles
export const assets = pgTable("assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(), // real_estate, vehicle, collectible, etc.
  description: text("description"),
  purchaseDate: text("purchase_date"), // yyyy-MM-dd
  purchasePrice: numeric("purchase_price", { precision: 14, scale: 2 }),
  currentValue: numeric("current_value", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),
  location: text("location"), // For physical assets
  serialNumber: text("serial_number"), // VIN, serial number, etc.
  notes: text("notes"),
  isActive: text("is_active").default("true"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

export const insertAssetSchema = createInsertSchema(assets).omit({ id: true, userId: true }).extend({
  userId: z.string().optional(),
  category: z.enum(ASSET_CATEGORIES),
  purchasePrice: z.string().or(z.number()).transform((val) => val ? String(val) : null).nullable().optional(),
  currentValue: z.string().or(z.number()).transform((val) => String(val)),
});
export const updateAssetSchema = insertAssetSchema.partial();
export type Asset = typeof assets.$inferSelect;
export type InsertAsset = z.infer<typeof insertAssetSchema>;

// Asset value history table - Value changes over time
export const assetValueHistory = pgTable("asset_value_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").notNull(),
  date: text("date").notNull(), // yyyy-MM-dd
  value: numeric("value", { precision: 14, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: text("created_at"),
});

export const insertAssetValueHistorySchema = createInsertSchema(assetValueHistory).omit({ id: true });
export type AssetValueHistory = typeof assetValueHistory.$inferSelect;
export type InsertAssetValueHistory = z.infer<typeof insertAssetValueHistorySchema>;

// ============ NET WORTH TABLES ============

// Net worth snapshots table - Monthly net worth records
export const netWorthSnapshots = pgTable("net_worth_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  date: text("date").notNull(), // yyyy-MM-dd
  totalAssets: numeric("total_assets", { precision: 14, scale: 2 }).notNull(),
  totalLiabilities: numeric("total_liabilities", { precision: 14, scale: 2 }).notNull(),
  netWorth: numeric("net_worth", { precision: 14, scale: 2 }).notNull(),
  // Breakdown by category
  cashAndBank: numeric("cash_and_bank", { precision: 14, scale: 2 }).default("0"),
  investments: numeric("investments", { precision: 14, scale: 2 }).default("0"),
  realEstate: numeric("real_estate", { precision: 14, scale: 2 }).default("0"),
  vehicles: numeric("vehicles", { precision: 14, scale: 2 }).default("0"),
  otherAssets: numeric("other_assets", { precision: 14, scale: 2 }).default("0"),
  creditCards: numeric("credit_cards", { precision: 14, scale: 2 }).default("0"),
  loans: numeric("loans", { precision: 14, scale: 2 }).default("0"),
  mortgages: numeric("mortgages", { precision: 14, scale: 2 }).default("0"),
  otherLiabilities: numeric("other_liabilities", { precision: 14, scale: 2 }).default("0"),
  createdAt: text("created_at"),
});

export const insertNetWorthSnapshotSchema = createInsertSchema(netWorthSnapshots).omit({ id: true, userId: true }).extend({
  userId: z.string().optional(),
  totalAssets: z.string().or(z.number()).transform((val) => String(val)),
  totalLiabilities: z.string().or(z.number()).transform((val) => String(val)),
  netWorth: z.string().or(z.number()).transform((val) => String(val)),
});
export type NetWorthSnapshot = typeof netWorthSnapshots.$inferSelect;
export type InsertNetWorthSnapshot = z.infer<typeof insertNetWorthSnapshotSchema>;

// ============ SPLIT EXPENSES TABLES ============

// Split status
export const SPLIT_STATUS = ["pending", "partial", "settled"] as const;

// Split expenses table - Shared expenses in household
export const splitExpenses = pgTable("split_expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").notNull(),
  createdBy: varchar("created_by").notNull(), // userId who created the split
  description: text("description").notNull(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  category: text("category"),
  date: text("date").notNull(), // yyyy-MM-dd
  receipt: text("receipt"), // Optional receipt URL/path
  status: text("status").default("pending"), // pending, partial, settled
  notes: text("notes"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

export const insertSplitExpenseSchema = createInsertSchema(splitExpenses).omit({ id: true }).extend({
  status: z.enum(SPLIT_STATUS).optional(),
  totalAmount: z.string().or(z.number()).transform((val) => String(val)),
});
export const updateSplitExpenseSchema = insertSplitExpenseSchema.partial();
export type SplitExpense = typeof splitExpenses.$inferSelect;
export type InsertSplitExpense = z.infer<typeof insertSplitExpenseSchema>;

// Split participants table - Who owes what on each split
export const splitParticipants = pgTable("split_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  splitExpenseId: varchar("split_expense_id").notNull(),
  userId: varchar("user_id").notNull(),
  shareAmount: numeric("share_amount", { precision: 12, scale: 2 }).notNull(),
  sharePercent: numeric("share_percent", { precision: 5, scale: 2 }), // Optional percentage
  isPaid: text("is_paid").default("false"),
  paidAt: text("paid_at"),
  createdAt: text("created_at"),
});

export const insertSplitParticipantSchema = createInsertSchema(splitParticipants).omit({ id: true }).extend({
  shareAmount: z.string().or(z.number()).transform((val) => String(val)),
  sharePercent: z.string().or(z.number()).transform((val) => val ? String(val) : null).nullable().optional(),
});
export type SplitParticipant = typeof splitParticipants.$inferSelect;
export type InsertSplitParticipant = z.infer<typeof insertSplitParticipantSchema>;

// Settlement payments table - Payments between household members
export const settlementPayments = pgTable("settlement_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").notNull(),
  fromUserId: varchar("from_user_id").notNull(),
  toUserId: varchar("to_user_id").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  splitExpenseId: varchar("split_expense_id"), // Optional link to specific split
  notes: text("notes"),
  createdAt: text("created_at"),
});

export const insertSettlementPaymentSchema = createInsertSchema(settlementPayments).omit({ id: true }).extend({
  amount: z.string().or(z.number()).transform((val) => String(val)),
});
export type SettlementPayment = typeof settlementPayments.$inferSelect;
export type InsertSettlementPayment = z.infer<typeof insertSettlementPaymentSchema>;

// ============ TAX CATEGORY TAGGING ============

// Tax categories for deductible tagging
export const TAX_CATEGORIES = [
  "business_expense",
  "home_office",
  "medical",
  "charitable",
  "education",
  "business_travel",
  "business_meals",
  "vehicle_expense",
  "professional_services",
  "office_supplies",
  "other_deductible"
] as const;

// Tax tagging schema for transactions (used to extend plaidTransactions, expenses, manualTransactions)
export const taxTaggingSchema = z.object({
  taxDeductible: z.boolean().optional(),
  taxCategory: z.enum(TAX_CATEGORIES).nullable().optional(),
  isBusinessExpense: z.boolean().optional(),
});

export type TaxTagging = z.infer<typeof taxTaggingSchema>;

// ============ LANDING PAGE TABLES ============

// Landing page settings - hero, branding, global settings
export const landingSettings = pgTable("landing_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  type: text("type").notNull().default("text"), // text, json, boolean, number
  updatedAt: text("updated_at"),
});

export const insertLandingSettingSchema = createInsertSchema(landingSettings).omit({ id: true });
export type LandingSetting = typeof landingSettings.$inferSelect;
export type InsertLandingSetting = z.infer<typeof insertLandingSettingSchema>;

// Landing page features - feature cards for features section
export const landingFeatures = pgTable("landing_features", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(), // Lucide icon name
  category: text("category").default("core"), // core, ai, automation, security
  sortOrder: integer("sort_order").default(0),
  isActive: text("is_active").default("true"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

export const insertLandingFeatureSchema = createInsertSchema(landingFeatures).omit({ id: true });
export type LandingFeature = typeof landingFeatures.$inferSelect;
export type InsertLandingFeature = z.infer<typeof insertLandingFeatureSchema>;

// Landing page testimonials - customer reviews
export const landingTestimonials = pgTable("landing_testimonials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  role: text("role"), // e.g., "Small Business Owner", "Freelancer"
  company: text("company"),
  quote: text("quote").notNull(),
  avatar: text("avatar"), // URL or path to avatar image
  rating: integer("rating").default(5), // 1-5 stars
  location: text("location"), // "San Francisco, CA"
  sortOrder: integer("sort_order").default(0),
  isActive: text("is_active").default("true"),
  isFeatured: text("is_featured").default("false"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

export const insertLandingTestimonialSchema = createInsertSchema(landingTestimonials).omit({ id: true });
export type LandingTestimonial = typeof landingTestimonials.$inferSelect;
export type InsertLandingTestimonial = z.infer<typeof insertLandingTestimonialSchema>;

// Landing page pricing plans
export const landingPricing = pgTable("landing_pricing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  billingPeriod: text("billing_period").default("monthly"), // monthly, yearly
  description: text("description"),
  features: text("features").notNull(), // JSON array of feature strings
  isPopular: text("is_popular").default("false"),
  ctaText: text("cta_text").default("Get Started"),
  ctaUrl: text("cta_url").default("/login"),
  sortOrder: integer("sort_order").default(0),
  isActive: text("is_active").default("true"),
  // Stripe integration fields
  stripePriceId: text("stripe_price_id"), // Stripe Price ID for subscriptions
  stripeProductId: text("stripe_product_id"), // Stripe Product ID
  // Plan limits
  maxBankAccounts: integer("max_bank_accounts").default(1), // Number of bank accounts allowed
  maxFamilyMembers: integer("max_family_members").default(1), // Number of family members allowed
  trialDays: integer("trial_days").default(14), // Free trial days
  requiresCard: text("requires_card").default("true"), // Whether credit card is required for trial
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

export const insertLandingPricingSchema = createInsertSchema(landingPricing).omit({ id: true }).extend({
  price: z.string().or(z.number()).transform((val) => String(val)),
  stripePriceId: z.string().nullable().optional(),
  stripeProductId: z.string().nullable().optional(),
  maxBankAccounts: z.number().nullable().optional(),
  maxFamilyMembers: z.number().nullable().optional(),
  trialDays: z.number().nullable().optional(),
  requiresCard: z.string().optional(),
});
export type LandingPricing = typeof landingPricing.$inferSelect;
export type InsertLandingPricing = z.infer<typeof insertLandingPricingSchema>;

// Landing page comparison table
export const landingComparison = pgTable("landing_comparison", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  feature: text("feature").notNull(),
  budgetSmart: text("budget_smart").notNull(), // "yes", "no", or specific text
  mint: text("mint"),
  ynab: text("ynab"),
  copilot: text("copilot"),
  sortOrder: integer("sort_order").default(0),
  isActive: text("is_active").default("true"),
  createdAt: text("created_at"),
});

export const insertLandingComparisonSchema = createInsertSchema(landingComparison).omit({ id: true });
export type LandingComparison = typeof landingComparison.$inferSelect;
export type InsertLandingComparison = z.infer<typeof insertLandingComparisonSchema>;

// Landing page FAQ
export const landingFaq = pgTable("landing_faq", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category").default("general"), // general, pricing, security, features
  sortOrder: integer("sort_order").default(0),
  isActive: text("is_active").default("true"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

export const insertLandingFaqSchema = createInsertSchema(landingFaq).omit({ id: true });
export type LandingFaq = typeof landingFaq.$inferSelect;
export type InsertLandingFaq = z.infer<typeof insertLandingFaqSchema>;

// Affiliate program settings
export const affiliateSettings = pgTable("affiliate_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  type: text("type").default("string"), // string, number, boolean
  updatedAt: text("updated_at"),
});

export const insertAffiliateSettingSchema = createInsertSchema(affiliateSettings).omit({ id: true });
export type AffiliateSetting = typeof affiliateSettings.$inferSelect;
export type InsertAffiliateSetting = z.infer<typeof insertAffiliateSettingSchema>;

// Landing page video annotations
export const landingVideoAnnotations = pgTable("landing_video_annotations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  text: text("text").notNull(),
  startTime: real("start_time").notNull().default(0), // seconds into video
  duration: real("duration").notNull().default(3), // how long to show (seconds)
  position: text("position").notNull().default("bottom-right"), // top-left, top-right, bottom-left, bottom-right, center
  style: text("style").notNull().default("default"), // default, highlight, security, success, info, family
  icon: text("icon"), // lucide icon name
  sortOrder: integer("sort_order").default(0),
  isActive: text("is_active").default("true"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

export const insertLandingVideoAnnotationSchema = createInsertSchema(landingVideoAnnotations).omit({ id: true });
export type LandingVideoAnnotation = typeof landingVideoAnnotations.$inferSelect;
export type InsertLandingVideoAnnotation = z.infer<typeof insertLandingVideoAnnotationSchema>;

// ============ SALES CHATBOT TABLES ============

// Sales chat session status
export const SALES_CHAT_STATUS = ["active", "completed", "escalated"] as const;

// Sales lead status
export const SALES_LEAD_STATUS = ["new", "contacted", "converted", "closed"] as const;

// Sales chat sessions - track each visitor conversation
export const salesChatSessions = pgTable("sales_chat_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  visitorId: text("visitor_id").notNull(), // Anonymous visitor tracking
  status: text("status").default("active"), // active, completed, escalated
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  messageCount: integer("message_count").default(0),
  hasLeadForm: text("has_lead_form").default("false"),
  metadata: text("metadata"), // JSON: user agent, referrer, page
});

export const insertSalesChatSessionSchema = createInsertSchema(salesChatSessions).omit({ id: true }).extend({
  status: z.enum(SALES_CHAT_STATUS).optional(),
});
export const updateSalesChatSessionSchema = insertSalesChatSessionSchema.partial();
export type SalesChatSession = typeof salesChatSessions.$inferSelect;
export type InsertSalesChatSession = z.infer<typeof insertSalesChatSessionSchema>;

// Sales chat messages - individual messages in a session
export const salesChatMessages = pgTable("sales_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertSalesChatMessageSchema = createInsertSchema(salesChatMessages).omit({ id: true });
export type SalesChatMessage = typeof salesChatMessages.$inferSelect;
export type InsertSalesChatMessage = z.infer<typeof insertSalesChatMessageSchema>;

// Sales leads - lead form submissions
export const salesLeads = pgTable("sales_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  question: text("question").notNull(),
  status: text("status").default("new"), // new, contacted, converted, closed
  notes: text("notes"), // Admin notes
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const insertSalesLeadSchema = createInsertSchema(salesLeads).omit({ id: true }).extend({
  status: z.enum(SALES_LEAD_STATUS).optional(),
});
export const updateSalesLeadSchema = insertSalesLeadSchema.partial();
export type SalesLead = typeof salesLeads.$inferSelect;
export type InsertSalesLead = z.infer<typeof insertSalesLeadSchema>;

// Lead form validation schema (for API)
export const salesLeadFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  question: z.string().min(5, "Please provide more detail"),
});

// ============ FUTURE INTELLIGENCE TABLES ============

// Autopilot rule types
export const AUTOPILOT_RULE_TYPES = [
  "min_balance", // Alert when balance drops below threshold
  "spending_limit", // Daily/weekly/monthly spending limit
  "category_limit", // Limit spending in a category
  "subscription_pause", // Flag subscriptions to cancel when tight
  "savings_sweep" // Notify when balance exceeds threshold (move to savings)
] as const;

// Autopilot rules - user-defined spending guardrails
export const autopilotRules = pgTable("autopilot_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  ruleType: text("rule_type").notNull(), // min_balance, spending_limit, category_limit, etc.
  threshold: numeric("threshold", { precision: 12, scale: 2 }).notNull(), // Dollar amount threshold
  category: text("category"), // For category-specific rules
  period: text("period"), // daily, weekly, monthly (for spending limits)
  isActive: text("is_active").default("true"),
  lastTriggeredAt: text("last_triggered_at"),
  createdAt: text("created_at").notNull(),
});

export const insertAutopilotRuleSchema = createInsertSchema(autopilotRules).omit({ id: true, userId: true, lastTriggeredAt: true }).extend({
  userId: z.string().optional(),
  ruleType: z.enum(AUTOPILOT_RULE_TYPES),
  threshold: z.string().or(z.number()).transform((val) => String(val)),
  category: z.string().nullable().optional(),
  period: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
  createdAt: z.string().optional(),
});
export const updateAutopilotRuleSchema = insertAutopilotRuleSchema.partial();
export type AutopilotRule = typeof autopilotRules.$inferSelect;
export type InsertAutopilotRule = z.infer<typeof insertAutopilotRuleSchema>;

// Leak alert types
export const LEAK_ALERT_TYPES = [
  "forgotten_subscription", // Recurring charge not actively used
  "price_increase", // Subscription price went up
  "category_spike", // Unusual spike in a category
  "duplicate_charge", // Possible duplicate transaction
  "new_recurring" // New recurring charge detected
] as const;

// Leak alerts - detected money leaks and unusual patterns
export const leakAlerts = pgTable("leak_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  alertType: text("alert_type").notNull(), // forgotten_subscription, price_increase, category_spike, etc.
  title: text("title").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }), // Monthly amount impact
  merchant: text("merchant"), // Related merchant if applicable
  category: text("category"), // Related category if applicable
  previousAmount: numeric("previous_amount", { precision: 12, scale: 2 }), // For comparison
  percentageChange: real("percentage_change"), // For spikes
  isDismissed: text("is_dismissed").default("false"),
  isActioned: text("is_actioned").default("false"), // User took action
  detectedAt: text("detected_at").notNull(),
  dismissedAt: text("dismissed_at"),
});

export const insertLeakAlertSchema = createInsertSchema(leakAlerts).omit({ id: true, userId: true, isDismissed: true, isActioned: true, dismissedAt: true }).extend({
  userId: z.string().optional(),
  alertType: z.enum(LEAK_ALERT_TYPES),
  amount: z.string().or(z.number()).transform((val) => val ? String(val) : null).nullable().optional(),
  previousAmount: z.string().or(z.number()).transform((val) => val ? String(val) : null).nullable().optional(),
  percentageChange: z.number().nullable().optional(),
});
export const updateLeakAlertSchema = insertLeakAlertSchema.partial();
export type LeakAlert = typeof leakAlerts.$inferSelect;
export type InsertLeakAlert = z.infer<typeof insertLeakAlertSchema>;

// Trial event types for conversion flow
export const TRIAL_EVENT_TYPES = [
  "day_3_awareness", // Found money leaks
  "day_7_fear", // Projected negative balance
  "day_10_control", // What-If simulation shown
  "day_12_loss_aversion", // Cancellation modal shown
  "converted", // User subscribed
  "churned" // User cancelled
] as const;

// Trial events - trial conversion tracking
export const trialEvents = pgTable("trial_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  eventType: text("event_type").notNull(),
  eventData: text("event_data"), // JSON with event-specific data
  createdAt: text("created_at").notNull(),
});

export const insertTrialEventSchema = createInsertSchema(trialEvents).omit({ id: true, userId: true }).extend({
  userId: z.string().optional(),
  eventType: z.enum(TRIAL_EVENT_TYPES),
  eventData: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});
export type TrialEvent = typeof trialEvents.$inferSelect;
export type InsertTrialEvent = z.infer<typeof insertTrialEventSchema>;

// What-If scenarios - saved financial simulations
export const whatIfScenarios = pgTable("what_if_scenarios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  scenarioType: text("scenario_type").notNull(), // cancel_subscription, extra_payment, new_income, reduce_expense
  changes: text("changes").notNull(), // JSON array of changes
  impactSummary: text("impact_summary"), // JSON with calculated impacts
  isSaved: text("is_saved").default("false"),
  createdAt: text("created_at").notNull(),
});

export const insertWhatIfScenarioSchema = createInsertSchema(whatIfScenarios).omit({ id: true, userId: true }).extend({
  userId: z.string().optional(),
  scenarioType: z.enum(["cancel_subscription", "extra_payment", "new_income", "reduce_expense", "custom"]),
  changes: z.string(), // JSON
  impactSummary: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});
export const updateWhatIfScenarioSchema = insertWhatIfScenarioSchema.partial();
export type WhatIfScenario = typeof whatIfScenarios.$inferSelect;
export type InsertWhatIfScenario = z.infer<typeof insertWhatIfScenarioSchema>;

// Spendability tracking - daily safe-to-spend calculations
export const spendabilitySnapshots = pgTable("spendability_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  date: text("date").notNull(), // yyyy-MM-dd
  safeToSpend: numeric("safe_to_spend", { precision: 12, scale: 2 }).notNull(),
  projectedBalance: numeric("projected_balance", { precision: 12, scale: 2 }).notNull(),
  daysUntilDanger: integer("days_until_danger"), // Days until balance goes negative
  dangerDate: text("danger_date"), // The date balance goes negative (if any)
  calculatedAt: text("calculated_at").notNull(),
});

export const insertSpendabilitySnapshotSchema = createInsertSchema(spendabilitySnapshots).omit({ id: true, userId: true }).extend({
  userId: z.string().optional(),
  safeToSpend: z.string().or(z.number()).transform((val) => String(val)),
  projectedBalance: z.string().or(z.number()).transform((val) => String(val)),
  daysUntilDanger: z.number().nullable().optional(),
  dangerDate: z.string().nullable().optional(),
});
export type SpendabilitySnapshot = typeof spendabilitySnapshots.$inferSelect;
export type InsertSpendabilitySnapshot = z.infer<typeof insertSpendabilitySnapshotSchema>;

// Payday optimization recommendations
export const paydayRecommendations = pgTable("payday_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  billId: varchar("bill_id"), // Reference to the bill
  billName: text("bill_name").notNull(),
  currentPayDay: integer("current_pay_day").notNull(),
  recommendedPayDay: integer("recommended_pay_day").notNull(),
  estimatedSavings: numeric("estimated_savings", { precision: 12, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  isApplied: text("is_applied").default("false"),
  createdAt: text("created_at").notNull(),
});

export const insertPaydayRecommendationSchema = createInsertSchema(paydayRecommendations).omit({ id: true, userId: true, isApplied: true }).extend({
  userId: z.string().optional(),
  billId: z.string().nullable().optional(),
  estimatedSavings: z.string().or(z.number()).transform((val) => String(val)),
});
export type PaydayRecommendation = typeof paydayRecommendations.$inferSelect;
export type InsertPaydayRecommendation = z.infer<typeof insertPaydayRecommendationSchema>;

// Receipts table - stores scanned/uploaded receipts with OCR data
export const receipts = pgTable("receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  merchant: text("merchant").notNull().default("Unknown"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  date: text("date").notNull(),
  category: text("category").notNull().default("Uncategorized"),
  items: text("items"), // JSON array of line items
  confidence: real("confidence").notNull().default(0),
  imageUrl: text("image_url"), // R2 signed URL or null
  rawText: text("raw_text"), // Raw OCR text from Claude
  matchedTransactionId: text("matched_transaction_id"), // Matched expense/transaction ID
  matchStatus: text("match_status").notNull().default("unmatched"), // unmatched | auto-matched | manual-match
  notes: text("notes"),
  createdAt: text("created_at"),
});

export const insertReceiptSchema = createInsertSchema(receipts).omit({ id: true, userId: true }).extend({
  userId: z.string().optional(),
  amount: z.string().or(z.number()).transform((val) => String(val)),
  confidence: z.number().optional(),
  items: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  rawText: z.string().nullable().optional(),
  matchedTransactionId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export const updateReceiptSchema = insertReceiptSchema.partial();
export type Receipt = typeof receipts.$inferSelect;
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;

// Support tickets table - stores submitted support requests for admin review
// Note: name is nullable at the DB level to support programmatic/API ticket creation;
// the user-facing form still validates name as required before submitting.
export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketNumber: varchar("ticket_number", { length: 20 }),
  userId: varchar("user_id", { length: 255 }),
  name: text("name"),
  email: text("email").notNull(),
  type: text("type"), // ticket | feature | bug
  subject: text("subject").notNull(),
  priority: text("priority").default("normal"), // low | normal | high | urgent
  message: text("message").notNull(),
  status: text("status").notNull().default("open"), // open | waiting_for_user | waiting_for_admin | closed
  adminResponse: text("admin_response"),
  adminResponseAt: text("admin_response_at"),
  respondedBy: varchar("responded_by", { length: 255 }),
  emailSent: text("email_sent").notNull().default("false"),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
});

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({ id: true }).extend({
  name: z.string().nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).nullable().optional(),
  status: z.string().optional(),
  emailSent: z.string().optional(),
  ticketNumber: z.string().optional(),
  userId: z.string().optional(),
  adminResponse: z.string().optional(),
  adminResponseAt: z.string().optional(),
  respondedBy: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;

// Support ticket messages - threaded conversation between user and admin
export const supportTicketMessages = pgTable("support_ticket_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id", { length: 255 }),
  senderType: varchar("sender_type", { length: 20 }).notNull(), // user | admin
  senderId: varchar("sender_id", { length: 255 }),
  message: text("message").notNull(),
  createdAt: text("created_at"),
});

export const insertSupportTicketMessageSchema = createInsertSchema(supportTicketMessages).omit({ id: true }).extend({
  ticketId: z.string().optional(),
  senderId: z.string().optional(),
  createdAt: z.string().optional(),
});
export type SupportTicketMessage = typeof supportTicketMessages.$inferSelect;
export type InsertSupportTicketMessage = z.infer<typeof insertSupportTicketMessageSchema>;
