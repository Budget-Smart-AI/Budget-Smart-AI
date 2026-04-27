-- Migration 0045 — onboarding sync-status timestamps
--
-- Provider-First SSOT Phase 5 (Wizard Rebuild, 2026-04-27).
--
-- Adds three timestamp columns the new onboarding wizard's sync-status
-- endpoint reads to decide whether to advance the user to the dashboard.
-- Each column means "this stage of the post-Plaid-Link pipeline has
-- completed at least once" — NOT "we found anything." A user with no
-- recurring income still gets last_income_detection_at set when the
-- helper finishes its run with zero results, so they're never trapped
-- on the wait screen waiting for income that doesn't exist.
--
-- Columns:
--
--   plaid_items.initial_sync_at (timestamptz, nullable) — Set in the
--     /api/plaid/webhook handler when Plaid sends INITIAL_UPDATE for the
--     item AND syncTransactions completes successfully. Means: the first
--     ~30 days of transactions are now in plaid_transactions.
--
--   plaid_items.recurring_synced_at (timestamptz, nullable) — Set in the
--     /api/plaid/webhook handler when Plaid sends RECURRING_TRANSACTIONS_
--     UPDATE for the item AND the detect-income helper completes for the
--     owning user. Plaid fires this once it has computed recurring stream
--     analysis (~1-2 minutes after Link). The helper runs even if streams
--     return empty — the timestamp records that we asked.
--
--   users.last_income_detection_at (timestamptz, nullable) — Set whenever
--     runIncomeDetection(userId) finishes a run, regardless of outcome.
--     The wizard reads this as the "incomeDetected" boolean. Refreshed on
--     every detect-now run (manual or webhook-triggered) so the AI
--     assistant can also use it to know how stale the registry is.
--
-- All three are nullable. No backfill needed — existing users (who
-- predate this migration) will see all three flip to non-null on the
-- next webhook firing for their items, OR the next time they hit the
-- new wizard's sync-status endpoint (which doesn't auto-set anything,
-- it only reads).
--
-- Pre-launch with regenerable data, so we don't need a careful rollout —
-- nullable columns are safe to add ahead of the code that writes them.

ALTER TABLE plaid_items
  ADD COLUMN IF NOT EXISTS initial_sync_at      timestamptz,
  ADD COLUMN IF NOT EXISTS recurring_synced_at  timestamptz;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_income_detection_at  timestamptz;
