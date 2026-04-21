-- ─────────────────────────────────────────────────────────────────────────────
-- 0034_detection_provenance.sql
--
-- Adds provider-agnostic detection provenance columns to `income` and `bills`.
-- Replaces the earlier plan of a Plaid-specific `plaid_stream_id` column — the
-- MX adapter lands soon and schema churn to rename would be expensive.
--
-- Columns are nullable and default NULL. Adapter-write paths populate them
-- going forward; the #177 provenance backfill (separate migration) will
-- populate existing rows keyed on the `notes LIKE '%Added from bank detection%'`
-- pattern.
--
-- Companion files:
--   - shared/schema.ts                       (Drizzle types, insert/update schemas)
--   - server/routes.ts                       (POST /api/income, POST /api/bills wiring)
--   - server/lib/financial-engine/...        (future: adapter write paths)
-- ─────────────────────────────────────────────────────────────────────────────

-- Income
ALTER TABLE income ADD COLUMN IF NOT EXISTS detection_source text;
ALTER TABLE income ADD COLUMN IF NOT EXISTS detection_ref text;
ALTER TABLE income ADD COLUMN IF NOT EXISTS detection_ref_type text;
ALTER TABLE income ADD COLUMN IF NOT EXISTS detection_confidence text;
ALTER TABLE income ADD COLUMN IF NOT EXISTS last_verified_at timestamp;
ALTER TABLE income ADD COLUMN IF NOT EXISTS last_verified_by text;

-- Bills (also gets auto_detected + detected_at to match income's existing shape)
ALTER TABLE bills ADD COLUMN IF NOT EXISTS auto_detected boolean NOT NULL DEFAULT false;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS detected_at timestamp;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS detection_source text;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS detection_ref text;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS detection_ref_type text;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS detection_confidence text;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS last_verified_at timestamp;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS last_verified_by text;

-- Indexes to support #177 backfill + future provenance queries.
-- Partial index keeps size bounded — ~5-10% of rows will carry auto-detected flags.
CREATE INDEX IF NOT EXISTS "income_detection_source_idx"
  ON income (detection_source) WHERE detection_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS "bills_detection_source_idx"
  ON bills (detection_source) WHERE detection_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS "income_detection_ref_idx"
  ON income (detection_ref) WHERE detection_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS "bills_detection_ref_idx"
  ON bills (detection_ref) WHERE detection_ref IS NOT NULL;
