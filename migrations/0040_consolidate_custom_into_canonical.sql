-- 0040_consolidate_custom_into_canonical.sql
-- ARCHITECTURE.md §6.2.7-prep — Consolidate custom_categories into canonical_categories.
--
-- Background: prior to this migration the codebase carried two parallel
-- category taxonomies that never met:
--   - canonical_categories: 67 system rows (16 parents + 51 leaves), TEXT slug PKs,
--     FK target for `canonical_category_id` shadow column on the 6 tx tables.
--   - custom_categories:    user-defined rows, UUID PKs, no FK relationship to
--     canonical_categories or to any tx table.
--
-- The user-facing custom-category feature (Categories settings page) created
-- rows in `custom_categories`, but transactions categorized to a custom slug
-- could only point at it via the legacy `category` TEXT column — there was no
-- way to land them in the `canonical_category_id` shadow.
--
-- This migration unifies them: custom rows move into `canonical_categories`
-- with a `user_id` set (NULL = system, set = user-defined), and any
-- transaction that was categorized to a custom name gets its
-- `canonical_category_id` populated to point at the new row. After this
-- runs, `custom_categories` is dropped.
--
-- Pre-launch with 2 beta accounts (~30 custom rows total expected). Single
-- atomic transaction; rollback on any error.
--
-- Sequence:
--   1. ALTER canonical_categories ADD user_id + indexes
--   2. INSERT custom_categories rows into canonical_categories with new ids
--   3. UPDATE all 6 tx tables to point canonical_category_id at the new rows
--      where the legacy `category` matched a custom-category display_name
--   4. INSERT into category_migration_log for audit
--   5. DROP TABLE custom_categories

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 0. Pre-check: refuse to migrate if any user has duplicate custom-category
--    names. The new partial unique index on (user_id, display_name) would
--    fail anyway, but failing here gives a clearer error.
--    Pre-launch with 2 beta accounts this should be a no-op.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  dup_count INT;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT user_id, name
      FROM custom_categories
     WHERE is_active = 'true' OR is_active IS NULL
     GROUP BY user_id, name
    HAVING COUNT(*) > 1
  ) dups;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Cannot migrate: % duplicate (user_id, name) pairs in custom_categories. Resolve manually before re-running.', dup_count;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Schema change: add user_id to canonical_categories
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE canonical_categories
  ADD COLUMN IF NOT EXISTS user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE;

-- Index for filtering "all of this user's custom categories"
CREATE INDEX IF NOT EXISTS idx_canonical_user_id
  ON canonical_categories (user_id)
  WHERE user_id IS NOT NULL;

-- Within a single user, display_name must be unique (UX nicety —
-- prevents two "Misc" custom rows for the same person). System rows
-- (user_id IS NULL) are not bound by this; their global slug uniqueness
-- is enforced by the existing PK constraint on `id`.
CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_user_displayname_unique
  ON canonical_categories (user_id, display_name)
  WHERE user_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Migrate custom_categories rows into canonical_categories.
--    Build a temp mapping table so we can reference the new ids in step 3.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE custom_to_canonical_map (
  old_custom_id   VARCHAR PRIMARY KEY,
  new_canonical_id TEXT NOT NULL,
  user_id         VARCHAR NOT NULL,
  display_name    TEXT NOT NULL,
  legacy_type     TEXT NOT NULL
) ON COMMIT DROP;

-- Generate one new canonical row per active custom row.
-- New id pattern: 'c_' + 8-char uuid prefix → readable, distinguishable
-- from system slugs (which are deterministic like "food_groceries").
INSERT INTO canonical_categories (
  id, display_name, parent_id, user_id,
  applies_to_expense, applies_to_bill, applies_to_income,
  is_transfer, is_group,
  icon, color, sort_order,
  created_at, updated_at
)
SELECT
  'c_' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 12)
    AS id,
  cc.name AS display_name,
  NULL AS parent_id,
  cc.user_id,
  (cc.type = 'expense') AS applies_to_expense,
  (cc.type = 'bill')    AS applies_to_bill,
  (cc.type = 'income')  AS applies_to_income,
  FALSE AS is_transfer,
  FALSE AS is_group,
  cc.icon,
  cc.color,
  0 AS sort_order,
  NOW(), NOW()
FROM custom_categories cc
WHERE cc.is_active = 'true' OR cc.is_active IS NULL;

-- Reconstruct the mapping by joining back. PostgreSQL's INSERT … RETURNING
-- doesn't expose the source-row context alongside the inserted row, so we
-- do a deterministic re-join here on (user_id, display_name) — the §0
-- pre-check above guarantees uniqueness.
INSERT INTO custom_to_canonical_map (
  old_custom_id, new_canonical_id, user_id, display_name, legacy_type
)
SELECT
  cc.id AS old_custom_id,
  nc.id AS new_canonical_id,
  cc.user_id,
  cc.name AS display_name,
  cc.type AS legacy_type
FROM custom_categories cc
JOIN canonical_categories nc
  ON nc.user_id = cc.user_id
 AND nc.display_name = cc.name
WHERE cc.is_active = 'true' OR cc.is_active IS NULL;

-- Sanity: every active custom row should be in the map.
DO $$
DECLARE
  active_custom_count INT;
  mapped_count        INT;
BEGIN
  SELECT COUNT(*) INTO active_custom_count
    FROM custom_categories
   WHERE is_active = 'true' OR is_active IS NULL;
  SELECT COUNT(*) INTO mapped_count FROM custom_to_canonical_map;
  IF active_custom_count != mapped_count THEN
    RAISE EXCEPTION 'Custom-to-canonical mapping mismatch: % active custom rows but % mapped',
      active_custom_count, mapped_count;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Re-target transaction rows.
--    For each of the 6 tx tables, if a row's legacy `category` string
--    matches one of the user's custom-category display_names AND the row
--    doesn't already have a canonical_category_id set, point it at the new
--    canonical row.
--
--    expenses / bills / income / manual_transactions: direct user_id column.
--    plaid_transactions / mx_transactions: indirect via account → item → user.
-- ─────────────────────────────────────────────────────────────────────────

-- expenses
UPDATE expenses e
   SET canonical_category_id = m.new_canonical_id
  FROM custom_to_canonical_map m
 WHERE m.user_id = e.user_id
   AND m.display_name = e.category
   AND e.canonical_category_id IS NULL;

-- bills
UPDATE bills b
   SET canonical_category_id = m.new_canonical_id
  FROM custom_to_canonical_map m
 WHERE m.user_id = b.user_id
   AND m.display_name = b.category
   AND b.canonical_category_id IS NULL;

-- income
UPDATE income i
   SET canonical_category_id = m.new_canonical_id
  FROM custom_to_canonical_map m
 WHERE m.user_id = i.user_id
   AND m.display_name = i.category
   AND i.canonical_category_id IS NULL;

-- manual_transactions
UPDATE manual_transactions mt
   SET canonical_category_id = m.new_canonical_id
  FROM custom_to_canonical_map m
 WHERE m.user_id = mt.user_id
   AND m.display_name = mt.category
   AND mt.canonical_category_id IS NULL
   -- transfers stay NULL until §6.3
   AND (mt.is_transfer IS NULL OR mt.is_transfer != 'true');

-- plaid_transactions: 3-level join through plaid_accounts → plaid_items
-- (plaid_accounts has plaid_item_id; plaid_items has user_id)
-- NOTE: PostgreSQL UPDATE ... FROM cannot reference the target table in
-- JOIN ON clauses, so we use implicit cross-join with WHERE predicates.
UPDATE plaid_transactions pt
   SET canonical_category_id = m.new_canonical_id
  FROM custom_to_canonical_map m,
       plaid_accounts pa,
       plaid_items pi
 WHERE pa.id = pt.plaid_account_id
   AND pi.id = pa.plaid_item_id
   AND pi.user_id = m.user_id
   AND m.display_name = pt.category
   AND pt.canonical_category_id IS NULL;

-- mx_transactions: 3-level join through mx_accounts → mx_members
-- (mx_accounts has mx_member_id; mx_members has user_id)
-- NOTE: same implicit-join pattern as plaid_transactions above.
UPDATE mx_transactions mxt
   SET canonical_category_id = m.new_canonical_id
  FROM custom_to_canonical_map m,
       mx_accounts ma,
       mx_members mm
 WHERE ma.id = mxt.mx_account_id
   AND mm.id = ma.mx_member_id
   AND mm.user_id = m.user_id
   AND m.display_name = mxt.category
   AND mxt.canonical_category_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Audit log — one row per migrated custom category.
--    Per-tx audit is intentionally skipped — it would explode the log
--    with little value beyond the per-canonical record.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO category_migration_log (
  source_table, source_row_id, old_category, new_canonical_id,
  mapping_source, confidence, needs_review, migrated_at
)
SELECT
  'custom_categories' AS source_table,
  m.old_custom_id     AS source_row_id,
  m.display_name      AS old_category,
  m.new_canonical_id,
  'custom_consolidation' AS mapping_source,
  1.00 AS confidence,
  FALSE AS needs_review,
  NOW()
FROM custom_to_canonical_map m;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Drop the old table. Foreign references? None — custom_categories
--    was never a FK target. Tx tables referenced custom names via the
--    legacy TEXT category column, which is unaffected here.
-- ─────────────────────────────────────────────────────────────────────────
DROP TABLE custom_categories;

COMMIT;

-- After this migration:
--   - canonical_categories has system rows (user_id IS NULL) and per-user
--     custom rows (user_id IS NOT NULL).
--   - All 6 tx tables have canonical_category_id populated for any row
--     whose legacy `category` matched a custom name. System-canonical
--     assignments from §6.2.5 backfill are untouched.
--   - custom_categories is gone.
--   - category_migration_log has one row per migrated custom category
--     with mapping_source = 'custom_consolidation'.
