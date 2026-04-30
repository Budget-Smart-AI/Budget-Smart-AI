-- Migration 0046 — Phase 5R: dismiss phantom income_sources rows
--
-- Phase 5R (2026-04-29). Provider-First SSOT clean-up.
--
-- Background: /api/income/registry/refresh used to call the legacy
-- classifyDepositsForRegistry classifier, which scanned the last 6
-- months of inflow transactions and created income_sources rows for
-- anything that looked like a recurring inflow — including non-income
-- flows like inter-account transfers ("SCOTIABANK TRANSIT 88146 HANNON
-- ON") and refund corrections ("Correction OPOS Pc Express 0046").
-- Plaid's recurring-stream API was bypassed entirely.
--
-- Phase 5R rewires that endpoint to call runIncomeDetection (the
-- provider-first SSOT helper) instead. Only Plaid + MX-confirmed
-- recurring streams populate income_sources from now on. New auto-
-- promotions also pass through the §8.1 gate (mature + very_high +
-- inflow) before being added.
--
-- This migration handles the cleanup of pre-existing phantom rows
-- created by the legacy classifier. They have:
--
--   - auto_detected = true (legacy classifier inserts with this flag)
--   - stream_id IS NULL (legacy classifier doesn't link to Plaid streams)
--   - user_dismissed_at IS NULL (user hasn't manually dismissed)
--
-- We soft-delete via user_dismissed_at = NOW() rather than DELETE so:
--   - The Phase 2 §8.2 tombstone flow continues to work (Plaid won't
--     auto-resurrect them on next webhook).
--   - The user can still see them in the wizard's "restore dismissed"
--     view if they want to opt back in (e.g. they DO want to track an
--     irregular inflow that Plaid doesn't classify as recurring).
--   - dismissal_reason is set to "legacy_classifier_cleanup_phase5r" so
--     we have an audit trail. Different from user-driven dismissals.
--
-- Idempotent — running twice is safe (the WHERE clause excludes rows
-- that are already dismissed). No data is lost; user can restore.
--
-- IMPORTANT: rows manually created by the user (auto_detected = false)
-- and rows that DO have stream_id populated (auto-promoted by Plaid
-- Recurring) are NOT touched by this migration.

UPDATE income_sources
   SET user_dismissed_at = NOW(),
       dismissal_reason  = 'legacy_classifier_cleanup_phase5r',
       is_active         = false
 WHERE auto_detected      = true
   AND stream_id IS NULL
   AND user_dismissed_at IS NULL;

-- Also clean up any associated income_source_amounts that were seeded
-- by the legacy classifier — those are stale and the recompute will
-- re-seed real values for legitimate streams. Actually no — leave
-- amounts in place. They're effective-dated history; legitimate to keep
-- for any user-restoration of dismissed rows. The period calculator
-- already skips dismissed rows via the §8.2 tombstone-skip.
