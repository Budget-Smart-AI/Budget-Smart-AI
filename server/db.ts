import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";
import { FEATURE_LIMITS } from "./lib/features";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Prevent unhandled 'error' events on the pool from crashing the process.
// pg.Pool emits 'error' when an idle client encounters a network issue (e.g.
// database restart, idle-timeout disconnect). Without this listener Node.js
// would throw an uncaught exception and terminate the server, causing users
// to be logged out and unable to re-authenticate until the container restarts.
pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err);
});

export const db = drizzle(pool, { schema });

/**
 * Ensure the receipts table exists. Uses CREATE TABLE IF NOT EXISTS so it is
 * safe to call on every startup regardless of whether the table already exists.
 * This is needed because the receipts table was added (migration 0016) after
 * the initial DB setup, and some deployments may not have run drizzle-kit push.
 *
 * Schema matches migrations/0016_receipts_table.sql — keep both in sync if
 * the table definition ever changes.
 */
/**
 * Ensure support_tickets and support_ticket_messages tables exist with the
 * full schema required by the Support Ticket System.  Uses CREATE TABLE IF NOT
 * EXISTS so it is safe to call on every startup.
 *
 * For existing deployments that have the old minimal support_tickets table the
 * function also adds any missing columns via ALTER TABLE … ADD COLUMN IF NOT EXISTS.
 */
export async function ensureSupportTables(): Promise<void> {
  // Create the support_tickets table with the full schema
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "support_tickets" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "ticket_number" varchar(20) UNIQUE,
      "user_id" varchar(255),
      "name" varchar(255),
      "email" varchar(255) NOT NULL,
      "type" varchar(100),
      "subject" varchar(500) NOT NULL,
      "message" text NOT NULL,
      "status" varchar(50) NOT NULL DEFAULT 'open',
      "priority" varchar(50) DEFAULT 'normal',
      "admin_response" text,
      "admin_response_at" text,
      "responded_by" varchar(255),
      "email_sent" text NOT NULL DEFAULT 'false',
      "created_at" text,
      "updated_at" text
    )
  `);

  // Add new columns to existing tables (idempotent)
  const newColumns: [string, string][] = [
    ["ticket_number", "varchar(20)"],
    ["user_id", "varchar(255)"],
    ["admin_response", "text"],
    ["admin_response_at", "text"],
    ["responded_by", "varchar(255)"],
    ["updated_at", "text"],
  ];
  for (const [col, colType] of newColumns) {
    await pool.query(
      `ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "${col}" ${colType}`
    );
  }

  // Create the threaded-messages table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "support_ticket_messages" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "ticket_id" varchar(255),
      "sender_type" varchar(20) NOT NULL,
      "sender_id" varchar(255),
      "message" text NOT NULL,
      "created_at" text
    )
  `);
}

export async function ensureReceiptsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "receipts" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" varchar NOT NULL,
      "merchant" text NOT NULL DEFAULT 'Unknown',
      "amount" numeric(12, 2) NOT NULL DEFAULT '0',
      "date" text NOT NULL,
      "category" text NOT NULL DEFAULT 'Uncategorized',
      "items" text,
      "confidence" real NOT NULL DEFAULT 0,
      "image_url" text,
      "raw_text" text,
      "matched_transaction_id" text,
      "match_status" text NOT NULL DEFAULT 'unmatched',
      "notes" text,
      "created_at" text
    )
  `);
}

export async function ensureVaultTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vault_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(255) NOT NULL,
      file_name VARCHAR(500) NOT NULL,
      display_name VARCHAR(500),
      file_key VARCHAR(1000) NOT NULL,
      file_size BIGINT,
      file_type VARCHAR(100),
      mime_type VARCHAR(200),
      category VARCHAR(100) DEFAULT 'other',
      subcategory VARCHAR(100),
      description TEXT,
      extracted_data JSONB,
      ai_summary TEXT,
      ai_processing_status VARCHAR(20) DEFAULT 'pending',
      tags TEXT[],
      expiry_date DATE,
      expiry_notified BOOLEAN DEFAULT false,
      is_favorite BOOLEAN DEFAULT false,
      uploaded_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Add ai_processing_status column to existing tables that may not have it
  await pool.query(`
    ALTER TABLE vault_documents
      ADD COLUMN IF NOT EXISTS ai_processing_status VARCHAR(20) DEFAULT 'pending'
  `);

  // Fix documents that have an ai_summary but still show 'pending' status.
  // This can happen when the column was added retroactively (ADD COLUMN DEFAULT 'pending')
  // to rows that were already processed before the column existed.
  await pool.query(`
    UPDATE vault_documents
    SET ai_processing_status = 'completed'
    WHERE ai_processing_status = 'pending'
      AND ai_summary IS NOT NULL
      AND ai_summary != ''
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vault_ai_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(255) NOT NULL,
      document_id UUID REFERENCES vault_documents(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_vault_docs_user ON vault_documents(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_vault_docs_category ON vault_documents(user_id, category)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_vault_docs_expiry ON vault_documents(expiry_date) WHERE expiry_date IS NOT NULL`);
}

export async function ensureAITables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_model_config (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_slot VARCHAR(100) UNIQUE NOT NULL,
      task_label VARCHAR(200) NOT NULL,
      task_description TEXT,
      category VARCHAR(50) NOT NULL,
      provider VARCHAR(50) NOT NULL DEFAULT 'deepseek',
      model_id VARCHAR(100) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      updated_at TIMESTAMP DEFAULT NOW(),
      updated_by VARCHAR(255)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_usage_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(255),
      task_slot VARCHAR(100) NOT NULL,
      provider VARCHAR(50) NOT NULL,
      model_id VARCHAR(100) NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      estimated_cost_usd DECIMAL(10,8) DEFAULT 0,
      duration_ms INTEGER,
      success BOOLEAN DEFAULT true,
      error_message TEXT,
      feature_context VARCHAR(200),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS anomaly_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(255) NOT NULL,
      transaction_id VARCHAR(255),
      anomaly_type VARCHAR(100) NOT NULL,
      severity VARCHAR(20) DEFAULT 'medium',
      title VARCHAR(300) NOT NULL,
      description TEXT NOT NULL,
      suggested_action TEXT,
      is_dismissed BOOLEAN DEFAULT false,
      is_resolved BOOLEAN DEFAULT false,
      ai_confidence DECIMAL(3,2),
      detected_at TIMESTAMP DEFAULT NOW(),
      dismissed_at TIMESTAMP,
      metadata JSONB
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_log(created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_log(user_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_usage_task ON ai_usage_log(task_slot, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_anomaly_user ON anomaly_alerts(user_id, detected_at DESC)`);

  await pool.query(`
    INSERT INTO ai_model_config (task_slot, task_label, task_description, category, provider, model_id)
    VALUES
      ('chat_assistant', 'AI Chatbot', 'Bottom-right chat widget for quick questions', 'chat', 'deepseek', 'deepseek-chat'),
      ('chat_fullscreen', 'AI Assistant', 'Full-screen sidebar assistant with canned prompts', 'chat', 'deepseek', 'deepseek-chat'),
      ('detection_auto', 'AI Detection', 'Detects income, bills, subscriptions automatically', 'detection', 'deepseek', 'deepseek-chat'),
      ('planning_advisor', 'AI Suggest / AI Advisor', 'Budget recommendations, debt payoff, planning', 'planning', 'deepseek', 'deepseek-reasoner'),
      ('vault_ai', 'Financial Vault AI', 'All vault AI: extraction, summary, tags, chat Q&A', 'vault', 'deepseek', 'deepseek-chat'),
      ('receipt_analysis', 'Receipt Scanning', 'Analyzes OCR text for merchant, amount, category', 'receipts', 'deepseek', 'deepseek-chat'),
      ('anomaly_detection', 'Anomaly Detection', 'Detects duplicate charges, spikes, fraud patterns', 'detection', 'deepseek', 'deepseek-chat'),
      ('ai_coach', 'AI Financial Coach', 'Personalized daily financial insights per user', 'insights', 'deepseek', 'deepseek-chat'),
      ('support_assistant', 'Support AI Assistant', 'Helps admin respond to support tickets', 'support', 'deepseek', 'deepseek-chat'),
      ('support_triage', 'Support Ticket Triage', 'Classifies incoming support tickets into categories and tiers, and generates Level 1 auto-responses', 'support', 'deepseek', 'deepseek-chat'),
      ('support_kb', 'Knowledge Base Assistant', 'Answers user questions in the support portal search bar using knowledge base context', 'support', 'deepseek', 'deepseek-chat')
    ON CONFLICT (task_slot) DO NOTHING
  `);
}

export async function ensureMerchantEnrichmentTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchant_enrichment (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      raw_pattern VARCHAR(500) UNIQUE NOT NULL,
      clean_name VARCHAR(200) NOT NULL,
      category VARCHAR(100),
      subcategory VARCHAR(100),
      merchant_type VARCHAR(50),
      is_subscription BOOLEAN DEFAULT false,
      logo_url VARCHAR(500),
      website VARCHAR(200),
      confidence DECIMAL(3,2) DEFAULT 0.5,
      source VARCHAR(50) DEFAULT 'ai',
      use_count INTEGER DEFAULT 1,
      last_used_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_merchant_pattern ON merchant_enrichment(raw_pattern)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_merchant_clean ON merchant_enrichment(clean_name)`);

  // Add enrichment columns to plaid_transactions
  const plaidCols: [string, string][] = [
    ["merchant_clean_name", "VARCHAR(200)"],
    ["merchant_logo_url", "VARCHAR(500)"],
    ["subcategory", "VARCHAR(100)"],
    ["merchant_type", "VARCHAR(50)"],
    ["is_subscription", "BOOLEAN DEFAULT false"],
    ["enrichment_source", "VARCHAR(50)"],
    ["enrichment_confidence", "DECIMAL(3,2)"],
  ];
  for (const [col, colType] of plaidCols) {
    await pool.query(
      `ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS "${col}" ${colType}`
    );
  }

  // Add enrichment columns to mx_transactions
  for (const [col, colType] of plaidCols) {
    await pool.query(
      `ALTER TABLE mx_transactions ADD COLUMN IF NOT EXISTS "${col}" ${colType}`
    );
  }

  // Add enrichment columns to manual_transactions
  for (const [col, colType] of plaidCols) {
    await pool.query(
      `ALTER TABLE manual_transactions ADD COLUMN IF NOT EXISTS "${col}" ${colType}`
    );
  }
}

/**
 * Ensure the AES-256-GCM encrypted columns added in migration 0017 exist on
 * the live database.  Uses ADD COLUMN IF NOT EXISTS so it is safe to call on
 * every startup regardless of whether the columns were already created by a
 * previous migration run.
 *
 * Without these columns the application throws
 *   error: column "phone_enc" does not exist
 * on every request that calls getUsers() (email scheduler, budget alerts, etc.)
 */
export async function ensureEncryptionColumns(): Promise<void> {
  // users table – encrypted phone number (migration 0017)
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_enc TEXT`
  );

  // plaid_items – encrypted access token and item id (migration 0017)
  await pool.query(
    `ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS access_token_enc TEXT`
  );
  await pool.query(
    `ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS item_id_enc TEXT`
  );

  // mx_members – encrypted member guid (migration 0017)
  await pool.query(
    `ALTER TABLE mx_members ADD COLUMN IF NOT EXISTS member_guid_enc TEXT`
  );
}

/**
 * Ensure the TOTP backup codes column added for the 2FA implementation exists
 * on the live database. Uses ADD COLUMN IF NOT EXISTS so it is safe to call on
 * every startup regardless of whether the column was already created.
 */
export async function ensureTotpColumns(): Promise<void> {
  // users table – TOTP backup codes array (added for complete 2FA support)
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[]`
  );
}

/**
 * Ensure the profile enhancement columns (display_name, birthday, timezone, avatar_url)
 * exist on the users table. Uses ADD COLUMN IF NOT EXISTS so it is safe to call on
 * every startup.
 */
export async function ensureProfileColumns(): Promise<void> {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'America/Toronto'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
}

export async function ensureHouseholdColumns(): Promise<void> {
  // Household / address columns on users table
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS household_name VARCHAR(200)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS province_state VARCHAR(100)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20)`);
  // country column already exists (added by initial schema), just ensure it has a default
  await pool.query(`ALTER TABLE users ALTER COLUMN country SET DEFAULT 'Canada'`);

  // Financial professional access table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS financial_professionals (
      id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
      professional_email TEXT NOT NULL,
      professional_name TEXT,
      access_token TEXT NOT NULL,
      granted_at TEXT DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      expires_at TEXT NOT NULL,
      is_active TEXT DEFAULT 'true',
      created_at TEXT DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  `);
}

/**
 * Ensure user preference columns and needs_review column on transaction tables exist.
 */
export async function ensurePreferenceColumns(): Promise<void> {
  // User preference columns
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pref_needs_review BOOLEAN DEFAULT true`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pref_edit_pending BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pref_merchant_display VARCHAR(20) DEFAULT 'enriched'`);

  // needs_review flag on all transaction tables
  const allowedTables = ["plaid_transactions", "mx_transactions", "manual_transactions"] as const;
  for (const table of allowedTables) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false`);
  }
}

/**
 * Ensure soft-delete columns for GDPR / privacy-law account deletion exist.
 */
export async function ensureDeletionColumns(): Promise<void> {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
}

export async function ensurePlanColumns(): Promise<void> {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) DEFAULT 'free'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_status VARCHAR(20) DEFAULT 'active'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_started_at TEXT`);
}

export async function ensureBankProviderTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bank_provider_config (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id VARCHAR(50) UNIQUE NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      description TEXT,
      is_enabled BOOLEAN DEFAULT false,
      show_in_wizard BOOLEAN DEFAULT true,
      show_in_accounts BOOLEAN DEFAULT true,
      supported_countries TEXT[] DEFAULT '{}',
      primary_regions TEXT[] DEFAULT '{}',
      fallback_order INTEGER DEFAULT 99,
      status VARCHAR(20) DEFAULT 'active',
      status_message TEXT,
      logo_url VARCHAR(500),
      updated_at TIMESTAMP DEFAULT NOW(),
      updated_by VARCHAR(255)
    )
  `);

  await pool.query(`
    INSERT INTO bank_provider_config (
      provider_id, display_name, description,
      is_enabled, show_in_wizard, show_in_accounts,
      supported_countries, primary_regions,
      fallback_order, status
    ) VALUES
      (
        'plaid',
        'Plaid',
        'Connect thousands of financial institutions across US, Canada and internationally.',
        true, true, true,
        ARRAY['US','CA','GB','AU','NZ','IE','FR','ES','NL','DE','SE','DK','NO','PL','BE','AT','IT','PT','LT','LV','EE'],
        ARRAY['GB','AU','NZ','IE','FR','ES','NL','DE','SE','DK','NO','PL','BE','AT','IT','PT','LT','LV','EE'],
        2,
        'active'
      ),
      (
        'mx',
        'MX',
        'Premium bank data aggregation optimized for US and Canada with best-in-class transaction categorization.',
        false, true, true,
        ARRAY['US','CA'],
        ARRAY['US','CA'],
        1,
        'active'
      ),
      (
        'basiq',
        'Basiq',
        'Open banking platform for Australia and New Zealand.',
        false, false, false,
        ARRAY['AU','NZ'],
        ARRAY['AU','NZ'],
        1,
        'active'
      ),
      (
        'truelayer',
        'TrueLayer',
        'Open banking for UK and Europe with PSD2 compliance.',
        false, false, false,
        ARRAY['GB','IE','FR','ES','NL','DE','SE','DK','NO','PL','BE','AT','IT','PT','LT','LV','EE'],
        ARRAY['GB','IE','FR','ES','NL','DE'],
        1,
        'active'
      )
    ON CONFLICT (provider_id) DO NOTHING
  `);
}

/**
 * Ensure the audit_log table and its indexes exist.
 * Safe to call on every startup (uses IF NOT EXISTS throughout).
 * Minimum retention is 2 years — enforced by the weekly cleanup job in email.ts.
 */
export async function ensureAuditLogTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type VARCHAR(100) NOT NULL,
      event_category VARCHAR(50) NOT NULL,
      actor_id VARCHAR(255),
      actor_type VARCHAR(50) DEFAULT 'user',
      actor_ip VARCHAR(50),
      actor_user_agent TEXT,
      target_type VARCHAR(100),
      target_id VARCHAR(255),
      target_user_id VARCHAR(255),
      action VARCHAR(100) NOT NULL,
      outcome VARCHAR(20) DEFAULT 'success',
      metadata JSONB,
      error_message TEXT,
      session_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Ensure all columns exist for deployments where the table was created by an older schema.
  // ADD COLUMN IF NOT EXISTS is a no-op when the column already exists.
  await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_type VARCHAR(50) DEFAULT 'user'`);
  await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_ip VARCHAR(50)`);
  await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_user_agent TEXT`);
  await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS target_type VARCHAR(100)`);
  await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS target_id VARCHAR(255)`);
  await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS target_user_id VARCHAR(255)`);
  await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS outcome VARCHAR(20) DEFAULT 'success'`);
  await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS metadata JSONB`);
  await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS error_message TEXT`);
  await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS session_id VARCHAR(255)`);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_log(actor_id,       created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_event   ON audit_log(event_type,     created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_target  ON audit_log(target_user_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC)`);
}

/**
 * Ensure login security columns for account lockout tracking exist on the
 * users table. Uses ADD COLUMN IF NOT EXISTS so it is safe to call on every
 * startup.
 */
export async function ensureLoginSecurityColumns(): Promise<void> {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(50)`);
}

/**
 * Ensure the support portal tables and new support_tickets columns for the
 * rebuilt portal exist. Safe to call on every startup.
 */
export async function ensureSupportPortalTables(): Promise<void> {
  // kb_feedback — knowledge base article helpfulness votes
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kb_feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      article_id VARCHAR(100) NOT NULL,
      helpful BOOLEAN NOT NULL,
      user_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_kb_feedback_article ON kb_feedback(article_id)`);

  // ticket_assignments — maps ticket to a support team persona
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id VARCHAR(255) NOT NULL,
      team_member_name VARCHAR(100) NOT NULL,
      team_member_role VARCHAR(200) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ticket_assign_ticket ON ticket_assignments(ticket_id)`);

  // New columns on support_tickets for AI triage
  const triageCols: [string, string][] = [
    ["category", "VARCHAR(100)"],
    ["confidence_score", "INTEGER"],
    ["tier", "VARCHAR(20)"],
    ["ai_summary", "TEXT"],
    ["ai_response_sent_at", "TIMESTAMP"],
  ];
  for (const [col, colType] of triageCols) {
    await pool.query(
      `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS "${col}" ${colType}`
    );
  }
}

/**
 * Ensure the user_ai_costs table exists for cumulative per-user AI cost tracking.
 * This stores running totals per (user, feature_tag) pair and is updated by a
 * background job or on-demand rollup from ai_usage_log.
 * Safe to call on every startup (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 */
export async function ensureUserAICostsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_ai_costs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(255) NOT NULL,
      feature_tag VARCHAR(100) NOT NULL,
      total_tokens_in BIGINT DEFAULT 0,
      total_tokens_out BIGINT DEFAULT 0,
      total_cost_usd DECIMAL(12,6) DEFAULT 0,
      last_updated TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, feature_tag)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_ai_costs_user ON user_ai_costs(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_ai_costs_feature ON user_ai_costs(feature_tag)`);
}

/**
 * Ensure the user_feature_usage table exists for per-user feature usage tracking.
 * Stores monthly usage counts per (user, feature_key) pair and is used by the
 * feature gating enforcement layer (server/lib/featureGate.ts).
 * Safe to call on every startup (uses IF NOT EXISTS).
 */
export async function ensureUserFeatureUsageTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_feature_usage (
      id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      feature_key   VARCHAR(50) NOT NULL,
      usage_count   INTEGER DEFAULT 0,
      period_start  TIMESTAMP NOT NULL DEFAULT date_trunc('month', NOW()),
      period_end    TIMESTAMP NOT NULL DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
      created_at    TIMESTAMP DEFAULT NOW(),
      updated_at    TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, feature_key, period_start)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_feature_usage_user_id ON user_feature_usage(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_feature_usage_period ON user_feature_usage(period_start)`);
  // Add milestone notification tracking columns (idempotent)
  await pool.query(`ALTER TABLE user_feature_usage ADD COLUMN IF NOT EXISTS warning_sent_at TIMESTAMP`);
  await pool.query(`ALTER TABLE user_feature_usage ADD COLUMN IF NOT EXISTS limit_sent_at TIMESTAMP`);
}

/**
 * Ensure plan_feature_limits table exists for dynamic plan-feature management.
 * This allows admins to configure feature limits per plan via admin UI.
 * Seeds / upserts all FEATURE_LIMITS values on every startup so Railway
 * redeploys always keep the table in sync with features.ts.
 */
export async function ensurePlanFeatureLimitsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plan_feature_limits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_name text NOT NULL,
      feature_key text NOT NULL,
      limit_value integer,
      is_enabled boolean DEFAULT true,
      updated_at text,
      UNIQUE(plan_name, feature_key)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_plan_feature_limits_plan ON plan_feature_limits(plan_name)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_plan_feature_limits_feature ON plan_feature_limits(feature_key)`);

  // Upsert every value from FEATURE_LIMITS for all three plans on every startup.
  // ON CONFLICT DO UPDATE ensures values stay in sync with features.ts after code changes.
  // Batch all rows into a single query per plan using unnest to avoid N+1 round-trips.
  const plans = ['free', 'pro', 'family'] as const;
  for (const plan of plans) {
    const limits = FEATURE_LIMITS[plan] as Record<string, number | null>;
    const entries = Object.entries(limits);
    if (entries.length === 0) continue;
    const planNames = entries.map(() => plan);
    const featureKeys = entries.map(([k]) => k);
    const limitValues = entries.map(([, v]) => v);
    await pool.query(
      `INSERT INTO plan_feature_limits (plan_name, feature_key, limit_value, is_enabled, updated_at)
       SELECT unnest($1::text[]), unnest($2::text[]), unnest($3::int[]), true, NOW()
       ON CONFLICT (plan_name, feature_key)
       DO UPDATE SET limit_value = EXCLUDED.limit_value, updated_at = NOW()`,
      [planNames, featureKeys, limitValues]
    );
  }
}
