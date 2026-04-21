-- After apply, all three queries should return zero/empty.

-- 1. Any remaining collisions?
SELECT user_id, external_transaction_id, COUNT(*) AS cnt
FROM income
WHERE external_transaction_id IS NOT NULL
GROUP BY user_id, external_transaction_id
HAVING COUNT(*) > 1;

-- 2. Per-user dupe summary (sanity check who was most affected)
SELECT user_id, COUNT(DISTINCT external_transaction_id) AS collision_keys
FROM income
WHERE external_transaction_id IS NOT NULL
GROUP BY user_id
HAVING COUNT(DISTINCT external_transaction_id) > 0
ORDER BY collision_keys DESC
LIMIT 10;

-- 3. Total income rows with provider ID (should equal pre-dedup count minus deleted)
SELECT
  COUNT(*) FILTER (WHERE external_transaction_id IS NOT NULL) AS with_ext_id,
  COUNT(*) FILTER (WHERE external_transaction_id IS NULL) AS without_ext_id,
  COUNT(*) AS total
FROM income;
