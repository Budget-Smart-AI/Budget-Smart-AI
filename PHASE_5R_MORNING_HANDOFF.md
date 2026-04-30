# Phase 5R + 6 — Morning Handoff (Wizard Retirement + Income SSOT Cleanup)

**Date:** 2026-04-29 (overnight work)
**Status:** All on disk, uncommitted. Single PR. Stacks on `bf83d4b` (Phase 5 hot-fix v2).

---

## Why this PR exists

You went to bed asking me to fix the Income/SSOT issues and to retire the
modal-based onboarding wizard in favour of redirecting the "Setup Wizard"
left-nav link to `/accounts` (which already has the better, location-aware
ConnectBankWizard). You also flagged the bigger Income page mess — phantom
sources (Scotiabank Transit, Correction OPOS), wrong cadence on Roche
(Biweekly when Plaid says semi-monthly), and Coreslab/Roche showing
category "Other" instead of "Salary".

Diagnosis: every one of these traced back to **the legacy
`/api/income/registry/refresh` classifier** (`classifyDepositsForRegistry`)
which scanned 6 months of inflows and upserted *anything* that looked
recurring — including transfers, refunds, and corrections — and used its
own cadence-detection logic that mis-classified semi-monthly pay as
biweekly. When the user (you) clicked "Refresh from bank history" in the
Manage Sources modal, that classifier ran and either created phantom
rows OR overwrote good cadence values from Plaid auto-promote.

This PR makes Plaid + MX recurring-stream APIs the SOLE source for the
income registry, retires the legacy classifier path, and heals existing
drift on the next refresh.

---

## Files modified (10) + new files (2)

### Frontend

1. **`client/src/App.tsx`** — Removed OnboardingWizard import, mount,
   `showOnboarding` / `onboardingDismissed` state, status query, and
   complete/dismiss handlers. The `/setup-wizard` and `/onboarding` URL
   aliases now redirect to `/accounts?connect=1`.

2. **`client/src/components/app-sidebar.tsx`** — "Setup Wizard" left-nav
   link URL changed from `/setup-wizard` to `/accounts?connect=1`. Title
   stays the same.

3. **`client/src/pages/bank-accounts.tsx`** — Added a `useEffect` that
   reads `?connect=1` query param on mount and auto-opens
   `ConnectBankWizard`. Cleans the param from the URL after handling so
   refresh doesn't re-trigger.

4. **`client/src/components/demo-banner.tsx`** — `navigate("/onboarding")`
   replaced with `navigate("/accounts?connect=1")` (both call sites).

5. **`client/src/pages/settings.tsx`** — Same nav update for the
   "Connect My Bank" button on the Fresh Start interstitial.

6. **`client/src/components/onboarding-wizard.tsx`** — Replaced the
   ~530-line wizard component with a 25-line stub that throws on import.
   The stub exists so any leftover lazy-loaded reference fails loudly.
   **Cline must `git rm` this file as part of the commit cleanup pass.**

### Server

7. **`server/routes.ts`** — Four wizard-only HTTP endpoints renamed to
   `__retired_*` paths so they no longer serve traffic. They're still
   physically in the file. **Cline must delete them entirely** — see the
   "Cleanup pass" section below.

   Plus: `/api/income/registry/refresh` rewritten to delegate to
   `runIncomeDetection` (the provider-first SSOT helper). Same code path
   as the Plaid webhook now drives both the manual refresh button and
   automatic detection. Legacy `classifyDepositsForRegistry` no longer
   called from this route.

8. **`server/lib/onboarding/detect-income.ts`** — Three changes:

   - Widened `mapCanonicalToIncomeCategory` to handle the actual canonical
     strings produced by `remapToCanonicalCategory` (Monarch-style names
     like "Paychecks", "Income", "Investment Income") plus PFC-detailed
     names (INCOME_WAGES, INCOME_DIVIDENDS, etc.). Previous version only
     knew the legacy `income_*` slug naming, so every paycheck fell
     through to "Other".

   - Added a **drift-heal branch**: when an existing income_sources row
     already has `streamId` matching this stream, refresh `recurrence`
     and `category` if they've drifted from Plaid's current view. Catches
     legacy classifier writes (semi-monthly clobbered to biweekly) and
     Plaid-side reclassifications.

   - Added an **amount-drift refresh**: when the active
     income_source_amounts row's amount differs from Plaid's `lastAmount`
     by ≥ $1, insert a new effective-dated row with reason
     `"plaid_drift_refresh"`. Preserves rate-change history while keeping
     projections accurate.

### New files

9. **`migrations/0046_dismiss_phantom_income_sources.sql`** — Soft-deletes
   existing `income_sources` rows where `auto_detected = true AND
   stream_id IS NULL` (the legacy classifier's signature). Sets
   `user_dismissed_at = NOW()`, `dismissal_reason =
   'legacy_classifier_cleanup_phase5r'`, `is_active = false`. Idempotent.
   Manual rows and Plaid-stream-linked rows are NOT touched.

10. **`PHASE_5R_MORNING_HANDOFF.md`** — this file.

---

## Cleanup pass Cline must do BEFORE committing

Two items:

### (a) Delete the four retired wizard endpoints in `server/routes.ts`

Find these blocks and delete them in full:

```
app.get("/api/onboarding/__retired_status__",        ...);
app.post("/api/onboarding/__retired_complete__",     ...);
app.get("/api/onboarding/__retired_sync_status__",   ...);
app.post("/api/onboarding/__retired_notify_when_ready__", ...);
```

Each is a self-contained `app.get(...)` / `app.post(...)` block. Delete
inclusively from `app.get/post(` through its closing `});`. Verify with:

```bash
grep -nE "__retired_(status|complete|sync_status|notify_when_ready)__" server/routes.ts
# should return zero matches
```

### (b) `git rm client/src/components/onboarding-wizard.tsx`

The file is currently a stub that throws if imported. Verify nothing
imports it:

```bash
grep -rn "onboarding-wizard" client/src
# should return zero matches
```

Then `git rm` the file. Don't keep the stub in tree.

---

## Migration must run BEFORE the deploy lands

Apply `migrations/0046_dismiss_phantom_income_sources.sql` to Neon prod
**before** pushing the code change. The new code references
`user_dismissed_at` and `dismissal_reason` (already added in 0044) — the
migration is just running the cleanup UPDATE. Order doesn't strictly
matter for column existence but applying the migration first ensures
the user immediately sees the cleaned-up Income page rather than a
brief window of phantom rows.

```sql
-- Apply via Neon SQL Editor:
UPDATE income_sources
   SET user_dismissed_at = NOW(),
       dismissal_reason  = 'legacy_classifier_cleanup_phase5r',
       is_active         = false
 WHERE auto_detected      = true
   AND stream_id IS NULL
   AND user_dismissed_at IS NULL;
```

For Ryan's specific account, this dismisses:
- "SCOTIABANK TRANSIT 88146 HANNON ON" (inter-account transfer)
- "Correction OPOS Pc Express 0046" (refund correction)
- "Amare" (irregular inflow — re-evaluate)
- "Coreslab" / "Roche" if they happened to have stream_id null (unlikely
  since Phase 2 auto-promote linked them)

After the migration runs, the next visit to /income should show only
Plaid-classified recurring streams (Coreslab + Roche). If Amare is real
recurring income (you mentioned MLM/affiliate?), restore via the dismissed
view in the wizard, OR add it as a manual income source.

---

## Cline commit prompt

```
Commit and push Phase 5R + 6: wizard retirement + Income SSOT cleanup.

CLEANUP PASS BEFORE COMMITTING:
  1. Delete the four __retired_* endpoints in server/routes.ts:
     - app.get("/api/onboarding/__retired_status__", ...)
     - app.post("/api/onboarding/__retired_complete__", ...)
     - app.get("/api/onboarding/__retired_sync_status__", ...)
     - app.post("/api/onboarding/__retired_notify_when_ready__", ...)
     Delete each inclusively from app.get/post( through closing });
     Verify: grep -nE "__retired_(status|complete|sync_status|notify_when_ready)__" server/routes.ts
     should return zero matches.
  2. git rm client/src/components/onboarding-wizard.tsx (stub file)
     Verify: grep -rn "onboarding-wizard" client/src
     should return zero matches.

APPLY MIGRATION TO NEON BEFORE PUSHING:
  psql "$NEON_DATABASE_URL" -f migrations/0046_dismiss_phantom_income_sources.sql

Steps:
  1. cd to repo root
  2. # Run cleanup pass above first
  3. git status   # confirm expected paths
  4. git diff --stat
  5. git add migrations/0046_dismiss_phantom_income_sources.sql \
            client/src/App.tsx \
            client/src/components/app-sidebar.tsx \
            client/src/pages/bank-accounts.tsx \
            client/src/components/demo-banner.tsx \
            client/src/pages/settings.tsx \
            server/routes.ts \
            server/lib/onboarding/detect-income.ts \
            PHASE_5R_MORNING_HANDOFF.md
  6. git rm client/src/components/onboarding-wizard.tsx
  7. git commit -m "feat(phase 5R + 6): retire onboarding wizard, clean up income SSOT

Phase 5R: the modal-based OnboardingWizard component is gone. The
'Setup Wizard' left-nav link, /setup-wizard URL, and /onboarding URL
all now redirect to /accounts?connect=1, which auto-opens the existing
ConnectBankWizard mini-modal. ConnectBankWizard is the better flow —
it's location-aware (Plaid for US, MX for Canada based on country
selection) and has been battle-tested in production for months. The
modal wizard had been through three rebuilds and still had race
conditions; retirement is the right call.

Removed: OnboardingWizard import + state + effect + mount in App.tsx;
four wizard-only HTTP endpoints (status, complete, sync-status,
notify-when-ready); the onboarding-wizard.tsx file itself.

Phase 6P + 6F + 6C + 6A: Income SSOT cleanup. The legacy
/api/income/registry/refresh classifier (classifyDepositsForRegistry)
was creating phantom income_sources rows for non-income flows
(SCOTIABANK TRANSIT inter-account transfer, Correction OPOS Pc Express
refund) and using its own cadence-detection that mis-classified Plaid's
semi-monthly Roche payroll as biweekly. Replaced with delegation to
runIncomeDetection — the same provider-first SSOT helper the Plaid
webhook calls.

mapCanonicalToIncomeCategory in detect-income.ts widened to handle
the canonical strings actually produced by remapToCanonicalCategory
(Monarch-style names like 'Paychecks', 'Income', 'Investment Income')
plus PFC-detailed names. Previously only knew the legacy income_*
slug naming, so every Plaid-detected paycheck fell through to 'Other'.

Added drift-heal logic to runIncomeDetection: when an existing income_
sources row already has streamId matching the current Plaid stream,
refresh recurrence/category if they've drifted (heals legacy classifier
overwrites) and insert a new effective-dated income_source_amounts row
when Plaid's lastAmount drifts ≥ \$1.

Migration 0046 soft-deletes pre-existing phantom rows
(auto_detected=true AND stream_id IS NULL) via user_dismissed_at +
dismissal_reason='legacy_classifier_cleanup_phase5r'. User-created
rows and Plaid-linked rows untouched. Restorable via the dismissed
view if any were actually real.

Stacks on bf83d4b. Phase 6 reconciler proper (RECURRING_TRANSACTIONS_
UPDATE-driven cleanup of stream-disappearance) still pending."
  8. git push origin main
  9. Watch Railway deploy.
```

---

## Verification (after deploy lands)

### (1) Wizard removal
- Navigate to `/setup-wizard` or `/onboarding` — should redirect to
  `/accounts?connect=1` and ConnectBankWizard auto-opens.
- Click "Setup Wizard" in left-nav — same behaviour.
- Land on /dashboard fresh after login — no auto-popup wizard. The
  modal-based wizard is gone for good.

### (2) Phantom rows dismissed
- Open `/income` — Income Sources Detected from Bank should show only
  Plaid-classified streams (Coreslab, Roche). Scotiabank Transit and
  Correction OPOS Pc Express should be gone.
- If Amare disappears too and you want it back: open Manage Sources →
  scroll to dismissed section → restore.

### (3) Drift-heal works
- Click Manage Sources → "Refresh from bank history".
- Roche cadence should flip from "Biweekly" to "Semimonthly".
- Roche amount should refresh from $3,796.82 to $3,816.55 (Plaid's
  current lastAmount).
- Coreslab + Roche category should now show "Salary" instead of
  "Other".

### (4) Income page period actuals
- Wait for tomorrow morning's Coreslab payroll (April 29) to land.
- Refresh /income — Coreslab `actualOccurrences` should tick to 1,
  amount $1,926.63 received.
- Day after (April 30) — same for Roche.
- Phase 3.2 stream-membership match validated end-to-end.

---

## What's NOT in this PR (deferred)

- **Phase 6 reconciler proper** — handling tombstone-delete when a Plaid
  stream disappears from `/transactions/recurring/get` (e.g. user
  changed jobs, paycheck stops). The drift-heal we shipped covers stream
  *value* changes; stream *disappearance* is harder and needs more care.

- **User-edit protection** — drift-heal currently overwrites recurrence/
  category/amount whenever Plaid's view differs. If a user manually
  edited "Other" → "Freelance" via Manage Sources, the next refresh will
  clobber it back to Plaid's value. Phase 7 should add a
  `user_edited_at` sentinel column so we know when to respect manual
  overrides.

- **Default spending alerts on first bank-connect** — the legacy
  `/api/onboarding/complete` endpoint created two default spending
  alerts (total_monthly $10k, single_transaction $1k) for new users.
  With Phase 5R that endpoint is gone. New users won't get default
  alerts until they configure them manually. If you want to preserve
  this behaviour, the logic should move into the bank-connect-success
  handler in `bank-accounts.tsx` (or server-side onto the Plaid
  exchange-token endpoint).

---

## Memory entries to add after verification

Once the verification pass goes green, add these to memory:

- `project_phase_5r_wizard_retirement.md` — wizard removed; bank-connect
  is now /accounts-only via ConnectBankWizard. Setup Wizard nav redirects.

- `feedback_legacy_classifier_was_phantom_source.md` — the legacy
  `classifyDepositsForRegistry` was creating phantom income_sources rows
  by upserting on (user_id, normalized_source) and overwriting cadence
  with its own detection. Don't write a "refresh" endpoint that bypasses
  the SSOT helper — always delegate to runIncomeDetection.

- `feedback_canonical_category_naming_drift.md` — `remapToCanonicalCategory`
  produces Monarch-style names ("Income", "Paychecks") not legacy slug
  names ("income_salary"). Any consumer that maps canonical → display
  must handle both, plus PFC-detailed names. Cost two days of "why is
  Coreslab showing 'Other'" debugging.

---

Sleep well. UAT testing should be unblocked once this lands and
verifies green.
