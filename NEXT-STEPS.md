# Next Steps — Budget Smart AI

Carries over from the Phase 3.7 / 3.8 push. Pick up here when you're ready.

---

## ✅ Already deployed

- **Phase 3.7** — Settings panels opted into glass (5 files, 38 cards).
  Delete-My-Account intentionally left solid per the destructive-state policy.
- **Phase 3.8** — Bills & Subscriptions panels opted into glass (10 cards),
  plus two server-side fixes that unblocked Subscription Analyze:
  - Removed `"Entertainment & Recreation"` from `NON_BILL_CATEGORIES` so
    streaming services (Netflix, Spotify, Disney+, Hulu, Apple TV+,
    HBO Max) reach the pattern detector.
  - Replaced bidirectional substring filter on existing-bill names with a
    `namesMatch` helper that requires the shorter side to be ≥6 chars
    before substring matching kicks in. Stops generic short bill names
    ("Insurance", "Loan") from cascade-filtering every detection.

---

## 🔜 Open items

### #63 — Dark-theme spot-check (next up)

Original ask, item #4: "Do a spot check of dark pages."

**Goal:** find any white panels, broken contrast, illegible text, or
missed glass tokens in dark mode after the Phase 3.x sweep.

**Plan:**
1. Drive Chrome MCP to `app.budgetsmart.io` in dark mode.
2. Screenshot each surface and visually triage:
   - Dashboard
   - Net Worth (re-verify after Phase 1 fixes)
   - Income (re-verify after Phase 3.4 + income-engine refactor)
   - Expenses
   - Budgets (re-verify after Phase 3.6 engine routing fix)
   - Bills (just touched in 3.8)
   - Subscriptions (just touched in 3.8)
   - Calendar
   - Security Alerts
   - Receipt Scanner
   - Accounts
   - Categories Manager
   - Merchants
   - All 12 Settings tabs (Profile, Security, Household, Preferences,
     Accounts, Categories, Merchants, Data, Privacy, Billing,
     Notifications, Spending Alerts)
3. Capture any issues into a Phase-3.9 punch list, prioritised:
   - **P0** — illegibility (white-on-white, low-contrast text)
   - **P1** — missed glass surfaces (solid white panels that should be glass)
   - **P2** — colour drift (icon/badge tones that don't sit right on dark)

### #64 — Verify Subscription Analyze in production

After Railway picks up 3.8 (~90s after the push you ran):

1. Sign in to `app.budgetsmart.io/subscriptions`.
2. Click **Detect Subscriptions → Analyze My Transactions**.
3. **Expected:** substantially more than 1 result. Streaming services that
   were silently dropped before should now appear.
4. Also try **Detect Bills** on `/bills` — same algorithm, same fix
   applies.

If still finding too few:
- Check that the merchant has ≥2 transactions in the last 12 months.
- Check that amounts vary by less than 5% (utilities won't qualify).
- Check that the average interval falls in a band: weekly (6–8d),
  biweekly (13–16d), monthly (25–38d), quarterly (85–95d), or yearly
  (355–375d). Anything outside is intentionally rejected.

### Carryover candidates (lower priority)

- **NON_BILL_CATEGORIES audit** — we only removed `"Entertainment &
  Recreation"`. Worth a second look at:
  - `"Personal Care"` — could legitimately be subscription beauty/grooming
    boxes (Dollar Shave Club, etc.)
  - `"Online Retail"` — could be Amazon Prime, recurring delivery boxes
  - `"Office Supplies"` — could be subscription office software
  
  Risk: more false positives in the Detect dialog. Mitigation: the
  amount-consistency + frequency-band checks already filter most noise.

- **Frontend Detect dialog name match** (`subscriptions.tsx:404-407`) — uses
  exact `Set.has` against existing names + merchants. That's safe but
  could miss case/whitespace variants. Worth normalising both sides if
  users report duplicates appearing in the suggestion list.

- **Confidence threshold** — currently anything matching a frequency band
  gets surfaced regardless of confidence (0.5–0.98). Could add a UI
  toggle: "Hide low-confidence suggestions" defaulting to on, showing
  only ≥0.7. Would tighten the suggestion list without losing power-user
  control.

---

## Notes for the next session

- Sandbox git can't push (virtiofs unlink limitation) — every push runs
  from your local terminal via the Cline prompt baked into each
  `PHASE-*.md` doc.
- Production is on `.io` TLD only: `app.budgetsmart.io`,
  `api.budgetsmart.io`, `www.budgetsmart.io`. The `.ai` domain is not
  valid.
- Engine lives at `api.budgetsmart.io` (separate Railway service since
  2026-04-14). UI lives at `app.budgetsmart.io`.
