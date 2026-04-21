-- Verification queries for UAT-10 #173 backfill.
-- Paste into the Neon SQL console after the apply step.

-- 1. Distribution of confidence_flag values. Every candidate should now carry
--    one of backfill_corrected | needs_manual_review | backfill_no_history,
--    or be NULL if they were skipped (drift within 20%).
SELECT
  COALESCE(confidence_flag, '(NULL — within tolerance)') AS flag,
  COUNT(*) AS row_count
FROM income
WHERE detection_source = 'plaid'
  AND detection_confidence IN ('low', 'medium', 'high') -- 'high' = corrected by this run
  AND is_recurring = 'true'
  AND is_active = 'true'
GROUP BY confidence_flag
ORDER BY row_count DESC;

-- 2. Audit totals. Should match the stats printed by the apply run.
SELECT
  action,
  COUNT(*) AS audit_rows,
  SUM(ABS(new_amount - old_amount)) AS total_dollar_delta
FROM income_audit
WHERE source_script = 'backfill-income-amounts.ts'
GROUP BY action
ORDER BY action;

-- 3. Biggest corrections — sanity check that the script didn't do anything wild.
SELECT
  a.user_id,
  i.source,
  i.recurrence,
  a.old_amount,
  a.new_amount,
  a.observed_median,
  a.sample_size,
  ROUND(a.drift_ratio::numeric, 2) AS drift_ratio,
  a.reason
FROM income_audit a
JOIN income i ON a.income_id = i.id
WHERE a.source_script = 'backfill-income-amounts.ts'
  AND a.action = 'corrected'
ORDER BY ABS(a.new_amount - a.old_amount) DESC
LIMIT 20;

-- 4. All flagged rows — these need user attention.
SELECT
  a.user_id,
  i.source,
  i.recurrence,
  a.old_amount,
  a.observed_median,
  a.sample_size,
  ROUND(a.drift_ratio::numeric, 2) AS drift_ratio_x,
  a.reason
FROM income_audit a
JOIN income i ON a.income_id = i.id
WHERE a.source_script = 'backfill-income-amounts.ts'
  AND a.action = 'flagged'
ORDER BY a.drift_ratio DESC;

-- 5. Idempotency check — re-running apply should produce this query returning 0
SELECT COUNT(*) AS remaining_candidates
FROM income
WHERE detection_source = 'plaid'
  AND detection_confidence IN ('low', 'medium')
  AND is_recurring = 'true'
  AND is_active = 'true'
  AND confidence_flag IS NULL;
