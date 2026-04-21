-- Post-apply verification. Run against the same DB you seeded.

-- 1. Users with registry entries — must be 4 (or whatever --apply count reported)
SELECT
  u.email,
  COUNT(DISTINCT s.id) FILTER (WHERE s.is_active = true) AS active_sources,
  COUNT(DISTINCT a.id) AS amount_rows,
  MIN(s.created_at) AS earliest_source_created,
  MAX(s.created_at) AS latest_source_created
FROM users u
LEFT JOIN income_sources s ON s.user_id = u.id
LEFT JOIN income_source_amounts a ON a.source_id = s.id
GROUP BY u.id, u.email
HAVING COUNT(DISTINCT s.id) > 0
ORDER BY active_sources DESC;

-- 2. Breakdown of sources by recurrence + category (sanity check the classifier)
SELECT
  s.recurrence,
  s.category,
  COUNT(*) AS source_count,
  SUM(a.amount::numeric) AS sum_unit_amount
FROM income_sources s
LEFT JOIN income_source_amounts a ON a.source_id = s.id AND a.effective_to IS NULL
WHERE s.is_active = true
GROUP BY s.recurrence, s.category
ORDER BY source_count DESC;

-- 3. Re-running the find-targets query — should return 0 rows post-apply
SELECT
  u.id AS user_id,
  u.email,
  COUNT(DISTINCT i.id) FILTER (WHERE i.is_active = 'true') AS active_income
FROM users u
LEFT JOIN income_sources s ON s.user_id = u.id AND s.is_active = true
LEFT JOIN income i ON i.user_id = u.id
GROUP BY u.id, u.email
HAVING COUNT(DISTINCT i.id) FILTER (WHERE i.is_active = 'true') > 0
   AND COUNT(DISTINCT s.id) = 0;
