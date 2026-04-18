-- ─────────────────────────────────────────────────────────────────────────────
-- 0032_income_source_registry.sql
--
-- Adds the income-source registry: one row per recurring income stream with
-- effective-dated unit amounts. Replaces the practice of projecting from
-- rows in `income` (which caused the duplicate-recurring-income bug where
-- April Coreslab projected at 2× the real amount).
--
-- Companion files:
--   - shared/schema.ts                                        (Drizzle types)
--   - server/lib/financial-engine/income.ts                   (engine reads from here)
--   - server/lib/financial-engine/categories/income-classifier.ts
--   - scripts/cleanup-duplicate-income.sql                    (one-shot cleanup of legacy duplicates)
--
-- Run order: this migration is safe to apply BEFORE running the cleanup
-- script. The cleanup operates on the legacy `income` table and doesn't
-- touch these new tables.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "income_sources" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL,
  "normalized_source" text NOT NULL,
  "display_name" text NOT NULL,
  "recurrence" text NOT NULL,
  "mode" text NOT NULL DEFAULT 'fixed',
  "cadence_anchor" text NOT NULL,
  "cadence_extra" text,                       -- JSON
  "category" text NOT NULL DEFAULT 'Salary',
  "is_active" boolean NOT NULL DEFAULT true,
  "auto_detected" boolean NOT NULL DEFAULT false,
  "detected_at" timestamp,
  "linked_plaid_account_id" varchar,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Prevents the duplicate-source bug at the DB level. Future detection passes
-- MUST upsert against this index, not insert blindly.
CREATE UNIQUE INDEX IF NOT EXISTS "income_sources_user_source_uniq"
  ON "income_sources" ("user_id", "normalized_source");

CREATE INDEX IF NOT EXISTS "income_sources_user_id_idx"
  ON "income_sources" ("user_id") WHERE "is_active" = true;

CREATE TABLE IF NOT EXISTS "income_source_amounts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_id" varchar NOT NULL,
  "amount" numeric(10,2) NOT NULL,
  "effective_from" text NOT NULL,             -- yyyy-MM-dd
  "effective_to" text,                        -- yyyy-MM-dd, NULL = currently active
  "reason" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- FK so deleting a source cascades its amount history.
ALTER TABLE "income_source_amounts"
  ADD CONSTRAINT "income_source_amounts_source_id_fk"
  FOREIGN KEY ("source_id") REFERENCES "income_sources"("id") ON DELETE CASCADE;

-- Lookup index: most queries filter by source + ask "what's the row whose
-- effective_from <= :date AND (effective_to IS NULL OR effective_to >= :date)".
CREATE INDEX IF NOT EXISTS "income_source_amounts_source_id_idx"
  ON "income_source_amounts" ("source_id");
