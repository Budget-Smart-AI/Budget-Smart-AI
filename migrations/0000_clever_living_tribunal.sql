CREATE TABLE "ai_insights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"insight_type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"severity" text NOT NULL,
	"category" text,
	"metadata" text,
	"action_url" text,
	"is_read" text DEFAULT 'false',
	"is_dismissed" text DEFAULT 'false',
	"created_at" text,
	"expires_at" text
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"category" text NOT NULL,
	"due_day" integer NOT NULL,
	"recurrence" text NOT NULL,
	"custom_dates" text,
	"notes" text,
	"last_notified_cycle" text,
	"starting_balance" numeric(12, 2),
	"payments_remaining" integer,
	"start_date" text,
	"is_paused" text DEFAULT 'false',
	"merchant" text
);
--> statement-breakpoint
CREATE TABLE "budget_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"budget_id" varchar NOT NULL,
	"category" text NOT NULL,
	"month" text NOT NULL,
	"threshold_percent" integer NOT NULL,
	"current_percent" integer NOT NULL,
	"amount_spent" numeric(10, 2) NOT NULL,
	"budget_amount" numeric(10, 2) NOT NULL,
	"alert_sent_at" text,
	"email_sent" text DEFAULT 'false'
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"month" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"color" text DEFAULT '#6366f1',
	"icon" text,
	"is_active" text DEFAULT 'true'
);
--> statement-breakpoint
CREATE TABLE "debt_details" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"debt_type" text NOT NULL,
	"current_balance" numeric(12, 2) NOT NULL,
	"original_principal" numeric(12, 2),
	"apr" numeric(5, 2) NOT NULL,
	"minimum_payment" numeric(10, 2) NOT NULL,
	"payment_frequency" text DEFAULT 'Monthly',
	"term_months" integer,
	"credit_limit" numeric(12, 2),
	"due_day" integer,
	"lender" text,
	"account_number" text,
	"linked_plaid_account_id" varchar,
	"start_date" text,
	"notes" text,
	"is_active" text DEFAULT 'true',
	"created_at" text,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"merchant" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"date" text NOT NULL,
	"category" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "household_invitations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" varchar NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending',
	"invited_by" varchar NOT NULL,
	"expires_at" text,
	"created_at" text,
	CONSTRAINT "household_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" text NOT NULL,
	"joined_at" text
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "income" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"source" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"date" text NOT NULL,
	"category" text NOT NULL,
	"is_recurring" text DEFAULT 'false',
	"recurrence" text,
	"due_day" integer,
	"custom_dates" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "manual_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"balance" numeric(12, 2) DEFAULT '0',
	"currency" text DEFAULT 'USD',
	"is_active" text DEFAULT 'true',
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "manual_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"date" text NOT NULL,
	"merchant" text NOT NULL,
	"category" text,
	"notes" text,
	"is_transfer" text DEFAULT 'false',
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"email_enabled" text DEFAULT 'true',
	"email_address" text,
	"bill_reminder_days" integer DEFAULT 1,
	"bill_reminder_time" text DEFAULT '09:00',
	"budget_alert_enabled" text DEFAULT 'true',
	"budget_alert_threshold" integer DEFAULT 80,
	"weekly_digest_enabled" text DEFAULT 'false',
	"weekly_digest_day" integer DEFAULT 0,
	"monthly_report_enabled" text DEFAULT 'true',
	"in_app_notifications_enabled" text DEFAULT 'true'
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"is_read" text DEFAULT 'false',
	"created_at" text,
	"expires_at" text
);
--> statement-breakpoint
CREATE TABLE "onboarding_analysis" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"analysis_data" text NOT NULL,
	"step" integer DEFAULT 1,
	"created_at" text,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "plaid_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plaid_item_id" varchar NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"official_name" text,
	"type" text NOT NULL,
	"subtype" text,
	"mask" text,
	"balance_current" numeric(12, 2),
	"balance_available" numeric(12, 2),
	"balance_limit" numeric(12, 2),
	"iso_currency_code" text DEFAULT 'CAD',
	"last_synced" text,
	"is_active" text DEFAULT 'true',
	CONSTRAINT "plaid_accounts_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "plaid_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"access_token" text NOT NULL,
	"item_id" text NOT NULL,
	"institution_id" text,
	"institution_name" text,
	"cursor" text,
	"status" text DEFAULT 'active',
	"created_at" text,
	CONSTRAINT "plaid_items_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "plaid_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plaid_account_id" varchar NOT NULL,
	"transaction_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"date" text NOT NULL,
	"name" text NOT NULL,
	"merchant_name" text,
	"category" text,
	"personal_category" text,
	"pending" text DEFAULT 'false',
	"match_type" text,
	"matched_bill_id" varchar,
	"matched_expense_id" varchar,
	"matched_income_id" varchar,
	"reconciled" text DEFAULT 'false',
	"iso_currency_code" text DEFAULT 'CAD',
	"created_at" text,
	CONSTRAINT "plaid_transactions_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "reconciliation_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"merchant_pattern" text NOT NULL,
	"match_type" text NOT NULL,
	"matched_category" text,
	"matched_item_id" varchar,
	"confidence" numeric(3, 2) DEFAULT '1.00',
	"times_applied" integer DEFAULT 0,
	"is_auto_generated" text DEFAULT 'true',
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "recurring_expenses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"category" text NOT NULL,
	"recurrence" text NOT NULL,
	"start_date" text NOT NULL,
	"next_due_date" text NOT NULL,
	"end_date" text,
	"merchant" text,
	"notes" text,
	"is_active" text DEFAULT 'true',
	"last_processed_date" text
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"code" text NOT NULL,
	"total_referrals" integer DEFAULT 0,
	"successful_referrals" integer DEFAULT 0,
	"created_at" text,
	CONSTRAINT "referral_codes_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "referral_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_id" varchar NOT NULL,
	"referred_email" text NOT NULL,
	"referred_user_id" varchar,
	"referral_code" text NOT NULL,
	"status" text DEFAULT 'pending',
	"invited_at" text,
	"registered_at" text,
	"activated_at" text,
	"rewarded_at" text
);
--> statement-breakpoint
CREATE TABLE "savings_goals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"target_amount" numeric(10, 2) NOT NULL,
	"current_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"target_date" text,
	"color" text DEFAULT '#3b82f6',
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "savings_recommendations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"recommendation_type" text NOT NULL,
	"suggested_amount" numeric(12, 2) NOT NULL,
	"target_goal_id" varchar,
	"calculation_details" text,
	"valid_until" text,
	"status" text DEFAULT 'pending',
	"accepted_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "sync_schedules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"plaid_item_id" varchar,
	"sync_type" text NOT NULL,
	"frequency" text NOT NULL,
	"times" text,
	"is_enabled" text DEFAULT 'true',
	"last_sync_at" text,
	"next_sync_at" text
);
--> statement-breakpoint
CREATE TABLE "transaction_anomalies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"transaction_id" varchar NOT NULL,
	"anomaly_type" text NOT NULL,
	"severity" text NOT NULL,
	"description" text NOT NULL,
	"merchant_name" text,
	"amount" numeric(12, 2) NOT NULL,
	"expected_amount" numeric(12, 2),
	"is_reviewed" text DEFAULT 'false',
	"is_false_positive" text DEFAULT 'false',
	"reviewed_at" text,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text,
	"email" text,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"mfa_secret" text,
	"mfa_enabled" text DEFAULT 'false',
	"is_admin" text DEFAULT 'false',
	"is_approved" text DEFAULT 'false',
	"onboarding_complete" text DEFAULT 'false',
	"google_id" text,
	"created_at" text,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
