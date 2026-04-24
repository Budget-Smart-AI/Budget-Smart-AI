-- 0039_canonical_categories.sql
-- ARCHITECTURE.md §6.2.4 — Canonical Categories schema foundation (Phase A).
--
-- Additive-only migration. Adds two new tables and shadow columns on the six
-- user-facing transaction-like tables. NO behaviour change yet — reads still
-- use the legacy `category` TEXT columns. The backfill (§6.2.5) and read-path
-- cutovers (§6.2.7) happen in follow-up PRs.
--
-- Schema reconciliation vs. ARCHITECTURE.md §6.2.4:
--   The spec text says `ALTER TABLE transactions ADD COLUMN ...` but this
--   repo has no standalone `transactions` table. The app splits what Monarch
--   calls "transactions" across six tables that all store a category string:
--     - expenses              (user-facing transactions; primary view)
--     - bills                 (recurring bill line items)
--     - income                (user-facing income entries)
--     - plaid_transactions    (raw Plaid import; feeds expenses via sync)
--     - mx_transactions       (raw MX import; feeds expenses via sync)
--     - manual_transactions   (user-entered cash / manual account tx)
--   Shadow `canonical_category_id` is added to all six so the backfill can
--   resolve a canonical slug at the source level without surface-specific
--   joins. Budgets, recurring_expenses, and custom_categories stay on the
--   legacy string until after the read-path cutover (§6.2.7).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. canonical_categories — the SSOT taxonomy table
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canonical_categories (
  id                   TEXT PRIMARY KEY,                      -- immutable slug (e.g. 'food_groceries')
  display_name         TEXT NOT NULL,                         -- human-readable label
  parent_id            TEXT REFERENCES canonical_categories(id),
  applies_to_expense   BOOLEAN NOT NULL DEFAULT FALSE,
  applies_to_bill      BOOLEAN NOT NULL DEFAULT FALSE,
  applies_to_income    BOOLEAN NOT NULL DEFAULT FALSE,
  is_transfer          BOOLEAN NOT NULL DEFAULT FALSE,
  is_group             BOOLEAN NOT NULL DEFAULT FALSE,        -- TRUE for the 16 parent rows
  icon                 TEXT,
  color                TEXT,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canonical_cat_parent
  ON canonical_categories (parent_id);

CREATE INDEX IF NOT EXISTS idx_canonical_cat_type
  ON canonical_categories (applies_to_expense, applies_to_bill, applies_to_income);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. category_migration_log — per-row audit of the backfill decision
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS category_migration_log (
  id                 SERIAL PRIMARY KEY,
  source_table       TEXT NOT NULL,           -- 'expenses' | 'bills' | 'income' | 'plaid_transactions' | 'mx_transactions' | 'manual_transactions'
  source_row_id      TEXT NOT NULL,           -- stringified pk (uuid or varchar depending on table)
  old_category       TEXT,                    -- the legacy string before migration
  new_canonical_id   TEXT REFERENCES canonical_categories(id),
  mapping_source     TEXT NOT NULL,           -- 'deterministic' | 'ai' | 'fallback'
  confidence         NUMERIC(3, 2),           -- 0.00 - 1.00
  needs_review       BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_at        TIMESTAMPTZ,
  reviewed_by        TEXT,
  migrated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mig_log_review
  ON category_migration_log (needs_review)
  WHERE needs_review = TRUE;

CREATE INDEX IF NOT EXISTS idx_mig_log_source
  ON category_migration_log (source_table, source_row_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Shadow columns on the six user-facing transaction-like tables
--    All are NULL-able; backfill (§6.2.5) will populate them.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS canonical_category_id TEXT REFERENCES canonical_categories(id);

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS canonical_category_id TEXT REFERENCES canonical_categories(id);

ALTER TABLE income
  ADD COLUMN IF NOT EXISTS canonical_category_id TEXT REFERENCES canonical_categories(id);

ALTER TABLE plaid_transactions
  ADD COLUMN IF NOT EXISTS canonical_category_id TEXT REFERENCES canonical_categories(id);

ALTER TABLE mx_transactions
  ADD COLUMN IF NOT EXISTS canonical_category_id TEXT REFERENCES canonical_categories(id);

ALTER TABLE manual_transactions
  ADD COLUMN IF NOT EXISTS canonical_category_id TEXT REFERENCES canonical_categories(id);

-- Indexes on shadow columns so the eventual read-path cutover is fast.
CREATE INDEX IF NOT EXISTS idx_expenses_canonical_cat
  ON expenses (canonical_category_id);

CREATE INDEX IF NOT EXISTS idx_bills_canonical_cat
  ON bills (canonical_category_id);

CREATE INDEX IF NOT EXISTS idx_income_canonical_cat
  ON income (canonical_category_id);

CREATE INDEX IF NOT EXISTS idx_plaid_tx_canonical_cat
  ON plaid_transactions (canonical_category_id);

CREATE INDEX IF NOT EXISTS idx_mx_tx_canonical_cat
  ON mx_transactions (canonical_category_id);

CREATE INDEX IF NOT EXISTS idx_manual_tx_canonical_cat
  ON manual_transactions (canonical_category_id);
