# Provider-First SSOT — Phase 5 (Wizard Rebuild) Handoff

**Date:** 2026-04-27
**Status:** On disk, uncommitted. Single PR. Builds on Phase 3.2 (`12abb39`).

---

## What Phase 5 does

Replaces the 1,900-line legacy onboarding wizard with a 3-step flow that
reflects the post-Provider-First reality: connect a bank, then wait for
the server-side pipeline to do its thing. The wizard no longer asks for
income, budget goals, manual amounts, or any other data we now detect
automatically.

The wait screen is honest — it polls a real `/api/onboarding/sync-status`
endpoint that reads three timestamp columns set by the Plaid webhook
handler. No fake timers. No timeout to a half-loaded dashboard. The user
arrives at a dashboard that's actually ready, OR (if they got bored)
they get an email when it lands.

---

## Files added (5)

1. `migrations/0045_onboarding_sync_status.sql` — three nullable
   timestamp columns (`plaid_items.initial_sync_at`,
   `plaid_items.recurring_synced_at`, `users.last_income_detection_at`).
2. `server/lib/onboarding/detect-income.ts` — `runIncomeDetection(userId)`
   helper extracted from the old `/api/onboarding/detect-now` body.
   Always stamps `users.last_income_detection_at` on completion (even on
   throws or empty results) so the sync-status endpoint advances.
3. `PROVIDER_FIRST_PHASE_5_WIZARD_REBUILD_HANDOFF.md` (this file).

(The new wizard component overwrote the old `client/src/components/
onboarding-wizard.tsx` in place — it's a fresh 480-line file, not a
new path.)

---

## Files modified (4)

1. `shared/schema.ts` — added `lastIncomeDetectionAt` to `users`,
   `initialSyncAt` + `recurringSyncedAt` to `plaidItems`.
2. `server/routes.ts`:
   - **Plaid webhook handler** (around line 6620–6700): on
     `INITIAL_UPDATE`, stamps `initial_sync_at` and fires-and-forgets
     `runIncomeDetection`. On `RECURRING_TRANSACTIONS_UPDATE`, stamps
     `recurring_synced_at`, awaits `runIncomeDetection`, then checks
     `onboardingProgress.notifyWhenReady` and sends the dashboard-ready
     email if all three sync flags are now green.
   - **`/api/onboarding/detect-now`** (around line 10061): body
     replaced with `runIncomeDetection(userId)` thin wrapper.
   - **NEW endpoint** `GET /api/onboarding/sync-status` — returns
     `{ transactionsLoaded, recurringComputed, incomeDetected,
     allComplete, hasPlaidItems }`. When `allComplete` flips true, also
     marks `users.onboarding_complete = true` so come-back path lands on
     the dashboard.
   - **NEW endpoint** `POST /api/onboarding/notify-when-ready` — sets
     `onboardingProgress.notifyWhenReady = true`. The webhook handler
     reads this flag and sends the email when sync hits allComplete.
3. `server/email.ts` — added `sendDashboardReadyEmail(toEmail, firstName)`
   following the `sendFreshStartEmail` pattern. Postmark + plain-text +
   HTML, deep-link to `/dashboard`.
4. `client/src/components/onboarding-wizard.tsx` — full rewrite.
   3 stages: Welcome / ConnectBank / SyncStatus. Plus AllSetSplash for
   come-back arrival. Single file, ~480 lines, no dead step components,
   no manual income input, no budget goal, no save-step persistence,
   no detect-now client-side calls.

---

## Required Cline-side cleanup before commit

The Edit tool can't span large arbitrary line ranges easily. The
following dead code is sitting in `server/routes.ts` and **must be
deleted as part of this commit** so the routes file isn't bloated with
non-routed garbage. Use a single `git diff` review or your IDE's
delete-line-range to remove them:

### Delete block 1 — legacy detect-now body (~200 lines)

`server/routes.ts` — find the marker and delete inclusively from the
`app.post("/api/onboarding/__phase5_dead_legacy_DELETE_ME__", ...` line
down to its closing `});` (the next live endpoint after it is
`app.post("/api/onboarding/save-step", ...)` which itself also goes —
see block 2).

The header comment block above it (`─── Legacy detect-now body removed
in Phase 5 (Wizard Rebuild) ───`) is fine to keep as a reminder, or
remove cleanly. Either is acceptable.

### Delete block 2 — three legacy endpoints

`server/routes.ts` — delete:

- `app.post("/api/onboarding/save-step", ...)` (entire block + closing `});`)
- `app.post("/api/onboarding/save-selections", ...)` (entire block + closing `});`)
- `app.post("/api/onboarding/save-income-goal", ...)` (entire block + closing `});`)

The `app.post("/api/analyze-transactions", ...)` endpoint sits between
save-step and save-selections — **leave that alone**, it's unrelated.

### Quick `grep` to verify after delete

```bash
git diff --stat                                # confirm only intended files changed
grep -nE "save-step|save-selections|save-income-goal|__phase5_dead_legacy" server/routes.ts
# should return zero matches
```

---

## Cline commit prompt

```
Commit and push Phase 5 — Onboarding Wizard rebuild.

Files modified locally:
  migrations/0045_onboarding_sync_status.sql                              (NEW)
  server/lib/onboarding/detect-income.ts                                  (NEW)
  PROVIDER_FIRST_PHASE_5_WIZARD_REBUILD_HANDOFF.md                        (NEW)
  shared/schema.ts                                                        (modified)
  server/routes.ts                                                        (modified — see cleanup below)
  server/email.ts                                                         (modified)
  client/src/components/onboarding-wizard.tsx                             (full rewrite)

BEFORE COMMITTING — manual cleanup in server/routes.ts:
  1. Delete the entire app.post("/api/onboarding/__phase5_dead_legacy_DELETE_ME__", ...)
     block — about 190 lines of legacy detect-now body.
  2. Delete the entire app.post("/api/onboarding/save-step", ...) block.
  3. Delete the entire app.post("/api/onboarding/save-selections", ...) block.
  4. Delete the entire app.post("/api/onboarding/save-income-goal", ...) block.
     (Leave app.post("/api/analyze-transactions", ...) alone — unrelated endpoint.)
  5. Verify: grep -nE "save-step|save-selections|save-income-goal|__phase5_dead_legacy" server/routes.ts
     returns zero matches.

Steps:
  1. cd to repo root
  2. # Apply migration to Neon prod BEFORE pushing code (per Railway deploy
  3. # checklist memory entry — code references new columns).
  4. psql "$NEON_DATABASE_URL" -f migrations/0045_onboarding_sync_status.sql
  5. git status   # confirm the 7 expected paths
  6. git diff --stat
  7. git add migrations/0045_onboarding_sync_status.sql \
            server/lib/onboarding/detect-income.ts \
            shared/schema.ts \
            server/routes.ts \
            server/email.ts \
            server/email.ts \
            client/src/components/onboarding-wizard.tsx \
            PROVIDER_FIRST_PHASE_5_WIZARD_REBUILD_HANDOFF.md
  8. git commit -m "feat(provider-first-ssot Phase 5): onboarding wizard rebuild

Replaces the 1,900-line legacy 5-step wizard with a 3-step flow that
reflects the post-Provider-First reality: connect a bank, then wait
for the server-side pipeline to finish. The wizard no longer asks for
income, budget goals, or manual amounts — all auto-detected now.

Wizard structure: Welcome → ConnectBank → SyncStatus.
SyncStatus polls /api/onboarding/sync-status every 3s, ticks three
checkmarks (transactionsLoaded → recurringComputed → incomeDetected),
auto-advances to dashboard on allComplete=true. No timeout to a
half-loaded dashboard.

If a user closes their browser mid-sync, on next login they land on
AllSetSplash (if sync finished while they were gone) or back on the
SyncStatus wait screen (if it's still running).

Wait-screen safeguards:
  - 90s of no progress on the same stage → soft 'bank is being slow' message
  - 3 min from mount → 'Email me when ready' link (stores flag, logs out)
  - Webhook handler sends 'Your dashboard is ready' email when sync
    flips allComplete AND the user requested notification

detect-now extraction: the 200-line endpoint body lives in
server/lib/onboarding/detect-income.ts as runIncomeDetection(userId).
The HTTP endpoint becomes a thin wrapper. The Plaid webhook handler
calls the helper directly — no HTTP indirection. INITIAL_UPDATE fires
runIncomeDetection (usually finds 0 streams this early); RECURRING_
TRANSACTIONS_UPDATE fires it again (the proper detection moment).

Migration 0045 adds three nullable timestamps:
  plaid_items.initial_sync_at      ← INITIAL_UPDATE webhook
  plaid_items.recurring_synced_at  ← RECURRING_TRANSACTIONS_UPDATE webhook
  users.last_income_detection_at   ← runIncomeDetection (always stamps,
                                     even on throws or 0-result runs)

Each sync-status boolean means 'this stage of the pipeline has
completed at least once' — NOT 'we found anything.' A user with no
recurring income still hits incomeDetected=true and is never trapped.

Endpoints removed: save-step, save-selections, save-income-goal —
only the legacy 5-step wizard called them. Confirmed zero callers
outside the deleted wizard.

Existing endpoints kept: /api/onboarding/status (legacy step routing
field can be ignored by the new wizard; only onboardingComplete
matters), /api/onboarding/complete, /api/onboarding/detect-now (now
a thin wrapper around runIncomeDetection).

Phase 6 (webhook reconciler) is partially folded in here — the
RECURRING_TRANSACTIONS_UPDATE handler now does the real work instead
of the Phase 0 stub log line. The full reconciler (handling tombstone
deletions and stream-status changes) can ship later as a refinement."
  9. git push origin main
 10. Watch Railway deploy on BOTH services (app + engine).
 11. Manual verification:
     - Logged in as ryan.mahabir@outlook.com (already onboarded):
       wizard does NOT appear (onboarding_complete=true)
     - Use Fresh Start to reset, then log back in:
       (a) Welcome step appears
       (b) Click Get Started → ConnectBank step
       (c) Click Connect with Plaid → Plaid Link opens
       (d) Connect a sandbox bank → SyncStatus screen appears
       (e) Watch checkmarks tick — transactions first (~30-60s), then
           recurring (~1-2 min), then income detected (instant after
           recurring runs)
       (f) On all-green → 800ms hold → dashboard
     - Browser-close test: at step (d), close the tab. Wait 2 min.
       Re-open and log in. Should see AllSetSplash (if sync finished)
       or SyncStatus wait screen (if still in progress).
     - Email-me-when-ready test: Fresh Start, connect bank, wait until
       3min mark on SyncStatus. Click 'Email me when ready' — should
       log out. Wait for sync to finish — should receive
       'Your dashboard is ready' email."
```

---

## Verification queries (post-deploy)

```sql
-- (1) Confirm migration 0045 columns are present:
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'plaid_items'
   AND column_name IN ('initial_sync_at', 'recurring_synced_at');
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'users'
   AND column_name = 'last_income_detection_at';

-- (2) For a freshly-onboarded user (Ryan after Fresh Start):
SELECT id, last_income_detection_at, onboarding_complete
  FROM users WHERE id = '0e0315ee-58d1-4b48-8d62-123551ef5757';
SELECT id, initial_sync_at, recurring_synced_at
  FROM plaid_items WHERE user_id = '0e0315ee-58d1-4b48-8d62-123551ef5757';

-- All three timestamps should be non-null after the wizard completes.
```

---

## What's next

Phase 4 (bills + subscriptions outflow cutover) and Phase 8
(`cash-flow.ts` retirement) remain pending. Phase 6 (webhook reconciler)
is partially folded into Phase 5 — the live `RECURRING_TRANSACTIONS_
UPDATE` handler now invokes `runIncomeDetection`, which is the bulk of
the reconciler's job. The remaining bit (handling tombstone deletes
when a stream disappears from Plaid's analysis) is small and can ship
later.
