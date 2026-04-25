-- 0041_drop_legacy_category.sql
-- ARCHITECTURE.md §6.2.8 — Drop legacy `category` text column.
--
-- After Phases A→C, every read path goes through canonical_category_id and
-- every write path populates it via the dual-write resolver. The legacy
-- `category` text column on the 6 tx tables is now redundant.
--
-- This migration:
--   1. Adds canonical_category_id to `budgets` (was missed in 0039) and
--      backfills via deterministic-map equivalents on canonical_categories.display_name.
--   2. Sets canonical_category_id NOT NULL on the 5 always-categorized tx tables.
--      manual_transactions stays nullable for transfer rows (§6.3 scope).
--   3. Drops the legacy `category` text column from all 6 tx tables AND budgets.
--
-- Single transaction; rollback on any error.
--
-- Pre-launch with 2 beta accounts. Expected counts:
--   - bills: ~10–50 rows total
--   - expenses: a few hundred
--   - income: ~30
--   - budgets: ~10
--   - manual_transactions: a few dozen (most are transfers)
--   - plaid_transactions / mx_transactions: thousands but already 100% backfilled

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Bring `budgets` into the canonical taxonomy.
--    Migration 0039 added canonical_category_id to the 6 tx tables but
--    omitted budgets. Adding it now so the budgets engine can group by
--    canonical id without translating display-names back and forth.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS canonical_category_id TEXT REFERENCES canonical_categories(id);

CREATE INDEX IF NOT EXISTS idx_budgets_canonical_cat
  ON budgets (canonical_category_id);

-- Backfill: match budgets.category (legacy display string) to a canonical
-- row by display_name. System rows only — user-owned customs are user-scoped
-- and rare for budget categories pre-launch. Anything that doesn't match
-- (typos, deprecated category names) falls back to 'uncategorized'.
UPDATE budgets b
   SET canonical_category_id = cc.id
  FROM canonical_categories cc
 WHERE cc.user_id IS NULL
   AND cc.display_name = b.category
   AND b.canonical_category_id IS NULL;

UPDATE budgets
   SET canonical_category_id = 'uncategorized'
 WHERE canonical_category_id IS NULL;

ALTER TABLE budgets ALTER COLUMN canonical_category_id SET NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Set canonical_category_id NOT NULL on the always-categorized tx tables.
--    manual_transactions stays nullable for transfer rows (§6.3 will fill).
-- ─────────────────────────────────────────────────────────────────────────

-- Sanity check: no NULLs allowed on these tables before the SET NOT NULL.
DO $$
DECLARE
  null_counts JSONB;
  total_nulls INT := 0;
  tbl_count INT;
BEGIN
  FOR tbl_count IN (
    SELECT COUNT(*) FROM expenses WHERE canonical_category_id IS NULL
    UNION ALL SELECT COUNT(*) FROM bills WHERE canonical_category_id IS NULL
    UNION ALL SELECT COUNT(*) FROM income WHERE canonical_category_id IS NULL
    UNION ALL SELECT COUNT(*) FROM plaid_transactions WHERE canonical_category_id IS NULL
    UNION ALL SELECT COUNT(*) FROM mx_transactions WHERE canonical_category_id IS NULL
  )
  LOOP
    total_nulls := total_nulls + tbl_count;
  END LOOP;

  IF total_nulls > 0 THEN
    RAISE NOTICE 'Found % rows with NULL canonical_category_id across tx tables; backfilling to uncategorized before SET NOT NULL.', total_nulls;
  END IF;
END $$;

-- Backfill any remaining NULLs to 'uncategorized' so SET NOT NULL succeeds.
-- Phase A's §6.2.5 backfill achieved 100% but defensive in case any rows
-- slipped through (e.g., manually inserted rows, edge cases).
UPDATE expenses SET canonical_category_id = 'uncategorized' WHERE canonical_category_id IS NULL;
UPDATE bills SET canonical_category_id = 'uncategorized' WHERE canonical_category_id IS NULL;
UPDATE income SET canonical_category_id = 'income_other' WHERE canonical_category_id IS NULL;
UPDATE plaid_transactions SET canonical_category_id = 'uncategorized' WHERE canonical_category_id IS NULL;
UPDATE mx_transactions SET canonical_category_id = 'uncategorized' WHERE canonical_category_id IS NULL;

ALTER TABLE expenses ALTER COLUMN canonical_category_id SET NOT NULL;
ALTER TABLE bills ALTER COLUMN canonical_category_id SET NOT NULL;
ALTER TABLE income ALTER COLUMN canonical_category_id SET NOT NULL;
ALTER TABLE plaid_transactions ALTER COLUMN canonical_category_id SET NOT NULL;
ALTER TABLE mx_transactions ALTER COLUMN canonical_category_id SET NOT NULL;
-- manual_transactions stays nullable (transfers).

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Drop the legacy `category` text column from all 6 tx tables + budgets.
--    Code that referenced it has been swept in the same commit chain.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE expenses              DROP COLUMN category;
ALTER TABLE bills                 DROP COLUMN category;
ALTER TABLE income                DROP COLUMN category;
ALTER TABLE manual_transactions   DROP COLUMN category;
ALTER TABLE plaid_transactions    DROP COLUMN category;
ALTER TABLE mx_transactions       DROP COLUMN category;
ALTER TABLE budgets               DROP COLUMN category;

COMMIT;

-- After this migration:
--   - canonical_category_id is the single source of truth on all 7 tables
--     (expenses / bills / income / manual_transactions / plaid_transactions /
--      mx_transactions / budgets)
--   - manual_transactions stays nullable for transfers; everywhere else is NOT NULL
--   - The legacy `category` TEXT column is gone.
--   - EXPENSE_CATEGORIES / INCOME_CATEGORIES / BILL_CATEGORIES enums in
--     shared/schema.ts can be deleted (no callers post-sweep).
