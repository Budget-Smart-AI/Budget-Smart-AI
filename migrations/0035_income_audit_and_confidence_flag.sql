-- ─────────────────────────────────────────────────────────────────────────────
-- 0035_income_audit_and_confidence_flag.sql
--
-- Supports the UAT-10 #173 amount-recompute backfill.
--
-- (1) Adds `confidence_flag` to income — a separate column from
--     `detection_confidence` so we can distinguish "detector scored this as
--     low confidence" from "backfill corrected this" from "backfill flagged
--     this for manual review". Both columns evolve independently.
--
-- (2) Creates `income_audit` — a complete before/after row for every
--     amount change the backfill makes, plus flagged rows where the script
--     decided the drift was too extreme to auto-correct. Enables rollback
--     and lets support explain changes to users.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE income ADD COLUMN IF NOT EXISTS confidence_flag text;

-- Allowed values (enforced at application layer, not DB, to match the rest of
-- the schema):
--   'backfill_corrected'     — amount was changed by #173
--   'needs_manual_review'    — drift > 10x, amount NOT changed, flagged for user
--   'backfill_no_history'    — <2 matching inflows, backfill couldn't evaluate

CREATE INDEX IF NOT EXISTS "income_confidence_flag_idx"
  ON income (confidence_flag) WHERE confidence_flag IS NOT NULL;

CREATE TABLE IF NOT EXISTS "income_audit" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "income_id" varchar NOT NULL,
  "user_id" varchar NOT NULL,
  "old_amount" numeric(10, 2) NOT NULL,
  "new_amount" numeric(10, 2) NOT NULL, -- equals old_amount for flagged-but-not-changed rows
  "observed_median" numeric(10, 2) NOT NULL,
  "sample_size" integer NOT NULL,
  "drift_ratio" numeric(10, 4) NOT NULL, -- abs(old - median) / median
  "action" text NOT NULL, -- 'corrected' | 'flagged' | 'no_history'
  "reason" text NOT NULL, -- human-readable one-liner for support
  "source_script" text NOT NULL DEFAULT 'backfill-income-amounts.ts',
  "backfilled_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "income_audit_income_id_idx" ON income_audit (income_id);
CREATE INDEX IF NOT EXISTS "income_audit_user_id_idx" ON income_audit (user_id);
CREATE INDEX IF NOT EXISTS "income_audit_action_idx" ON income_audit (action);
