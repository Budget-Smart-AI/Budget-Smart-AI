import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const pool = new Pool({
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
      ('support_assistant', 'Support AI Assistant', 'Helps admin respond to support tickets', 'support', 'deepseek', 'deepseek-chat')
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
  for (const table of ["plaid_transactions", "mx_transactions", "manual_transactions"]) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false`);
  }
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
