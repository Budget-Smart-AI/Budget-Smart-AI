-- ─────────────────────────────────────────────────────────────────────────────
-- cleanup-duplicate-income.sql
--
-- One-shot cleanup for the duplicate-recurring-income bug that was causing the
-- /income page to project Coreslab/Roche at 2× the real amount in some months.
--
-- Root cause: /api/income/detect (and prior versions of the recurring-income
-- detector) could insert multiple rows for the same source — each with
-- is_recurring='true'. calculateIncomeForPeriod's "Path 1" then projected
-- ALL of them into the displayed total.
--
-- This script:
--   1) Reports duplicate groups so you can sanity-check before committing.
--   2) Picks the SURVIVOR per group: prefer the most-recently-detected row
--      (latest detected_at), then earliest created (lowest id) as tiebreaker.
--   3) Optionally back-links any auto-imported income rows whose
--      plaid_transaction_id was pointing at a row we're about to delete.
--   4) Deletes the losers — but ONLY for is_recurring='true' rows (auto-imported
--      paycheck snapshots are isRecurring='false' and stay untouched).
--
-- HOW TO USE:
--   psql $DATABASE_URL -f scripts/cleanup-duplicate-income.sql
--   (Defaults to ROLLBACK at the end. Edit the last line to COMMIT once you've
--    reviewed the diagnostic output.)
--
-- Safety:
--   - Single transaction. If anything errors, nothing changes.
--   - Won't touch rows where is_recurring is null/false (the journal entries).
--   - Won't touch rows that aren't part of a duplicate group.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Diagnostic: show all duplicate groups ────────────────────────────────
\echo '── DUPLICATE RECURRING INCOME GROUPS (before cleanup) ──'

WITH normalized AS (
  SELECT
    id,
    user_id,
    source,
    -- Same normalisation as engine: lowercase, strip noise words, collapse spaces
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(coalesce(source, '')),
          '\b(direct dep|dir dep|payroll|deposit|payment|pay|inc|ltd|llc|corp|co)\b',
          '', 'g'
        ),
        '[^a-z0-9\s]', '', 'g'
      ),
      '\s+', ' ', 'g'
    ) AS norm_source,
    amount,
    recurrence,
    is_recurring,
    auto_detected,
    detected_at,
    date
  FROM income
  WHERE is_recurring = 'true'
)
SELECT
  user_id,
  trim(norm_source) AS norm_source,
  COUNT(*) AS dup_count,
  string_agg(id::text || ' ($' || amount::text || ', ' || coalesce(recurrence, 'none') || ', ' || date || ')', ' | ' ORDER BY detected_at DESC NULLS LAST, id) AS rows
FROM normalized
WHERE trim(norm_source) <> ''
GROUP BY user_id, trim(norm_source)
HAVING COUNT(*) > 1
ORDER BY user_id, dup_count DESC;

-- ─── 2. Build the survivor / loser sets ──────────────────────────────────────
-- Survivor priority:
--   a) Most recent detected_at (most fresh classification)
--   b) Falls back to lowest id (earliest created) for tiebreak
--
-- Stored as a temp table so we can use it for both the back-link step and the
-- delete step without re-computing.

CREATE TEMP TABLE income_dup_resolution ON COMMIT DROP AS
WITH normalized AS (
  SELECT
    id,
    user_id,
    trim(regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(coalesce(source, '')),
          '\b(direct dep|dir dep|payroll|deposit|payment|pay|inc|ltd|llc|corp|co)\b',
          '', 'g'
        ),
        '[^a-z0-9\s]', '', 'g'
      ),
      '\s+', ' ', 'g'
    )) AS norm_source,
    detected_at
  FROM income
  WHERE is_recurring = 'true'
),
ranked AS (
  SELECT
    id,
    user_id,
    norm_source,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, norm_source
      ORDER BY detected_at DESC NULLS LAST, id ASC
    ) AS rn,
    COUNT(*) OVER (PARTITION BY user_id, norm_source) AS group_size
  FROM normalized
  WHERE norm_source <> ''
)
SELECT id, user_id, norm_source, rn, group_size
FROM ranked
WHERE group_size > 1;

\echo '── RESOLUTION PLAN (rn=1 survives, rn>1 will be deleted) ──'
SELECT
  user_id,
  norm_source,
  group_size,
  COUNT(*) FILTER (WHERE rn = 1) AS keeping,
  COUNT(*) FILTER (WHERE rn > 1) AS deleting
FROM income_dup_resolution
GROUP BY user_id, norm_source, group_size
ORDER BY user_id, group_size DESC;

-- ─── 3. Re-link any income rows that point at a doomed parent ────────────────
-- Plaid-auto-imported income rows store plaid_transaction_id, not a parent FK,
-- so there's nothing to re-link. But if you later add an income_source_id FK,
-- this is where you'd update children to point at the survivor. Left as a
-- no-op placeholder so the structure is obvious for future maintenance.
--
-- (Intentionally empty — included for the audit trail.)

-- ─── 4. Delete the loser rows ────────────────────────────────────────────────
\echo '── DELETING DUPLICATE ROWS ──'

DELETE FROM income
WHERE id IN (
  SELECT id FROM income_dup_resolution WHERE rn > 1
);

-- ─── 5. Verify: re-run the duplicate scan, should return 0 rows ──────────────
\echo '── DUPLICATE GROUPS AFTER CLEANUP (should be empty) ──'

WITH normalized AS (
  SELECT
    user_id,
    trim(regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(coalesce(source, '')),
          '\b(direct dep|dir dep|payroll|deposit|payment|pay|inc|ltd|llc|corp|co)\b',
          '', 'g'
        ),
        '[^a-z0-9\s]', '', 'g'
      ),
      '\s+', ' ', 'g'
    )) AS norm_source
  FROM income
  WHERE is_recurring = 'true'
)
SELECT user_id, norm_source, COUNT(*) AS dup_count
FROM normalized
WHERE norm_source <> ''
GROUP BY user_id, norm_source
HAVING COUNT(*) > 1;

-- ─── 6. Default to ROLLBACK so dry-run is safe. ──────────────────────────────
-- Once you've reviewed the diagnostic output above and the survivor list looks
-- right, change the next line to COMMIT and re-run.

ROLLBACK;
-- COMMIT;
