-- Migration 0044 — income_sources stream linkage + tombstone columns
--
-- Provider-First SSOT Phase 2 (2026-04-26 — see PROVIDER_FIRST_SSOT_STRATEGY.md).
--
-- Adds three columns to income_sources:
--
--   stream_id (text, nullable) — Provider-stable id of the recurring stream
--     this row was promoted from. Plaid `stream_id`, MX recurring guid, or
--     null for manual entries / pre-Phase-2 rows. The auto-promote pipeline
--     sets this when materialising a registry row from a NormalizedRecurringStream.
--     Used by the RECURRING_TRANSACTIONS_UPDATE webhook (Phase 6) to find
--     the registry row that needs updating when Plaid re-evaluates a stream.
--
--   user_dismissed_at (timestamp, nullable) — Soft-delete tombstone (Ryan
--     decision §8.2, 2026-04-26). When the user marks a detected stream as
--     "not income" we set this rather than DELETE the row. The period
--     calculator skips dismissed rows; the wizard's "restore dismissed"
--     view surfaces them; Plaid's webhook does NOT auto-resurrect them.
--     Per Ryan's reasoning: financial data is unstable (Plaid sends removal
--     signals for tx that just had merchant-name changes), so soft-delete
--     with explicit user resurrection is safer than hard delete.
--
--   dismissal_reason (text, nullable) — Free-form note explaining why the
--     user dismissed a stream. Helps the AI assistant later when reasoning
--     about user intent ("Grandma gift, not income"). Not used in
--     calculations — purely observational metadata.
--
-- All three are nullable. No backfill needed — existing rows have stream_id
-- NULL (predate Phase 2) and user_dismissed_at NULL (not dismissed).

ALTER TABLE income_sources
  ADD COLUMN IF NOT EXISTS stream_id           text,
  ADD COLUMN IF NOT EXISTS user_dismissed_at   timestamp,
  ADD COLUMN IF NOT EXISTS dismissal_reason    text;

-- Partial index on stream_id so the webhook reconciler (Phase 6) can locate
-- the registry row from a Plaid stream_id in O(log n). Most rows have
-- stream_id NULL (manual entries, pre-Phase-2 detector-created rows) so a
-- partial index keeps storage small.
CREATE INDEX IF NOT EXISTS idx_income_sources_stream_id
  ON income_sources (stream_id)
  WHERE stream_id IS NOT NULL;
