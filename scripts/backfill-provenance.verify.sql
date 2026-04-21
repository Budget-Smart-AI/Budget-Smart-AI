-- Verification queries for UAT-10 #177 backfill.
-- Run these against prod after the apply step to confirm correctness.

-- 1. All historically auto-detected income rows should now have detection_source set.
SELECT
  COUNT(*) FILTER (WHERE detection_source IS NOT NULL) AS with_source,
  COUNT(*) FILTER (WHERE detection_source IS NULL) AS missing_source,
  COUNT(*) AS total_matching_rows
FROM income
WHERE auto_detected = true
   OR notes ILIKE '%Added from bank detection%'
   OR notes ILIKE '%Auto-imported%'
   OR notes ILIKE '%Auto-detected%';

-- 2. Same for bills.
SELECT
  COUNT(*) FILTER (WHERE detection_source IS NOT NULL) AS with_source,
  COUNT(*) FILTER (WHERE detection_source IS NULL) AS missing_source,
  COUNT(*) AS total_matching_rows
FROM bills
WHERE auto_detected = true
   OR notes ILIKE '%Added from bank detection%'
   OR notes ILIKE '%Auto-imported%'
   OR notes ILIKE '%Auto-detected%';

-- 3. Distribution check: detected_at should not be NULL for any row where
--    detection_source = 'plaid'.
SELECT
  'income' AS table_name,
  COUNT(*) FILTER (WHERE detected_at IS NULL) AS null_detected_at,
  COUNT(*) AS total
FROM income WHERE detection_source = 'plaid'
UNION ALL
SELECT
  'bills',
  COUNT(*) FILTER (WHERE detected_at IS NULL),
  COUNT(*)
FROM bills WHERE detection_source = 'plaid';

-- 4. Sanity: confidence distribution (all should be 'medium' for backfilled rows
--    — any 'high'/'low' means something else wrote after the script).
SELECT
  detection_source,
  detection_confidence,
  COUNT(*)
FROM income
WHERE detection_source IS NOT NULL
GROUP BY detection_source, detection_confidence
ORDER BY 1, 2;

SELECT
  detection_source,
  detection_confidence,
  COUNT(*)
FROM bills
WHERE detection_source IS NOT NULL
GROUP BY detection_source, detection_confidence
ORDER BY 1, 2;
