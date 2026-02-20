CREATE TABLE "asset_value_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" varchar NOT NULL,
	"date" text NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"notes" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"purchase_date" text,
	"purchase_price" numeric(14, 2),
	"current_value" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'USD',
	"location" text,
	"serial_number" text,
	"notes" text,
	"is_active" text DEFAULT 'true',
	"created_at" text,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investment_account_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"holding_type" text NOT NULL,
	"quantity" numeric(18, 8) NOT NULL,
	"cost_basis" numeric(14, 2),
	"current_price" numeric(14, 6),
	"current_value" numeric(14, 2),
	"currency" text DEFAULT 'USD',
	"last_price_update" text,
	"created_at" text,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "holdings_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"holding_id" varchar NOT NULL,
	"date" text NOT NULL,
	"price" numeric(14, 6) NOT NULL,
	"quantity" numeric(18, 8) NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "investment_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"account_type" text NOT NULL,
	"institution" text,
	"account_number" text,
	"balance" numeric(14, 2) DEFAULT '0',
	"currency" text DEFAULT 'USD',
	"notes" text,
	"is_active" text DEFAULT 'true',
	"created_at" text,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "net_worth_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"date" text NOT NULL,
	"total_assets" numeric(14, 2) NOT NULL,
	"total_liabilities" numeric(14, 2) NOT NULL,
	"net_worth" numeric(14, 2) NOT NULL,
	"cash_and_bank" numeric(14, 2) DEFAULT '0',
	"investments" numeric(14, 2) DEFAULT '0',
	"real_estate" numeric(14, 2) DEFAULT '0',
	"vehicles" numeric(14, 2) DEFAULT '0',
	"other_assets" numeric(14, 2) DEFAULT '0',
	"credit_cards" numeric(14, 2) DEFAULT '0',
	"loans" numeric(14, 2) DEFAULT '0',
	"mortgages" numeric(14, 2) DEFAULT '0',
	"other_liabilities" numeric(14, 2) DEFAULT '0',
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "settlement_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" varchar NOT NULL,
	"from_user_id" varchar NOT NULL,
	"to_user_id" varchar NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"split_expense_id" varchar,
	"notes" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "split_expenses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"description" text NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"category" text,
	"date" text NOT NULL,
	"receipt" text,
	"status" text DEFAULT 'pending',
	"notes" text,
	"created_at" text,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "split_participants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"split_expense_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"share_amount" numeric(12, 2) NOT NULL,
	"share_percent" numeric(5, 2),
	"is_paid" text DEFAULT 'false',
	"paid_at" text,
	"created_at" text
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "tax_deductible" text DEFAULT 'false';--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "tax_category" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "is_business_expense" text DEFAULT 'false';--> statement-breakpoint
ALTER TABLE "manual_transactions" ADD COLUMN "tax_deductible" text DEFAULT 'false';--> statement-breakpoint
ALTER TABLE "manual_transactions" ADD COLUMN "tax_category" text;--> statement-breakpoint
ALTER TABLE "manual_transactions" ADD COLUMN "is_business_expense" text DEFAULT 'false';--> statement-breakpoint
ALTER TABLE "plaid_transactions" ADD COLUMN "tax_deductible" text DEFAULT 'false';--> statement-breakpoint
ALTER TABLE "plaid_transactions" ADD COLUMN "tax_category" text;--> statement-breakpoint
ALTER TABLE "plaid_transactions" ADD COLUMN "is_business_expense" text DEFAULT 'false';