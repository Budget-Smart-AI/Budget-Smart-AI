# Partnero Customer Referral — Portal Config Handoff

**Status:** code shipped 2026-04-18 · portal config partially complete
**Program type:** Refer-a-friend & Loyalty (separate from existing Affiliate program CJUSEXBQ)
**Program ID:** `12078`

This doc captures the remaining manual steps you (Ryan) need to complete
in the Partnero portal to turn the shipped code into a live, earning
referral program.

The code is live:
- `server/partnero-referral.ts` — Partnero client (enroll/get/list)
- `server/routes/referrals.ts` — `/api/referrals/{me,list,enroll}` proxy
- Auto-enrolls every new `POST /api/auth/register` signup
- Gold-heart button in the sidebar opens `ReferralModal`
- Full-page dashboard at `/referrals`
- Env flag: `PARTNERO_REFERRAL_ENABLED=true` to turn on

## Reward model (locked-in)

| Party    | Reward                          | Mechanism                              |
|----------|---------------------------------|----------------------------------------|
| Referee  | 30% off annual plan, year 1     | Dynamic Stripe coupon (duration=once)  |
| Referrer | $30 cash                        | PayPal payout after 30-day hold        |
| Scope    | Annual plans only               | Monthly/lifetime do NOT qualify        |
| Cap      | None                            | Unlimited referrals per customer       |

## Steps remaining in Partnero portal

### 1. Configure the coupon (referee side)

Portal: Programs → Budget Smart AI Refer-a-friend → Rewards → Coupons

- Provider: **Stripe** (must be switched from the default "In-app coupon")
- Discount: **30% off**
- Duration: **Once** (year-1 only — Vault lock-in captures year-2 revenue)
- Applies to: **Annual plan products only** — exclude monthly and lifetime SKUs
- Maximum redemptions per customer: **1**

### 2. Change referrer reward from Dynamic Coupon → Commission

The "Give & Get — Stripe coupons" preset we used creates dual-coupon
rewards by default. Switch the referrer side to a cash commission:

Portal: Programs → … → Rewards → Referrer reward

- Type: **Commission** (not Dynamic coupon)
- Amount: **$30** (flat) per qualifying referral
- Payout method: **Manual** (Partnero does NOT integrate with PayPal
  directly — see section 7 below for the CSV-export + manual-send flow)
- Minimum payout: **$30** (single referral triggers payout eligibility)

### 3. Set 30-day review (hold) period

Portal: Programs → … → Settings → Hold period

- Review period: **30 days** after referee's annual payment clears
- Reconciles with Stripe chargeback window (typically 30d)

### 4. Enable auto-enroll for customers

Portal: Programs → … → Settings → Enrollment

- Toggle **Auto-enroll customers** → ON
- This is a belt-and-suspenders measure — our backend already enrolls on
  signup via `enrollCustomerInReferralProgram`, but the portal toggle
  catches edge cases (e.g. legacy imports, manual customer creation).

### 5. Email templates (referee signup + referrer payout)

Portal: Programs → … → Emails

- **Referral email** — what the referee receives when their friend shares
  the link. Keep branded (BudgetSmart AI, mint-green accent).
- **Reward notification** — what the referrer receives when $30 is queued
  for payout. Should mention the 30-day hold.
- **Payout notification** — when PayPal payout completes.

Copy guidance: tight, confident, no marketing fluff. Lean on the same
voice as the in-app `ReferralModal` ("Give 30% off. Get $30.")

### 6. Connect Stripe integration (if not already)

Portal: Settings → Integrations

- **Stripe**: must be connected for dynamic-coupon creation.
- **PayPal**: NOT connected — Partnero does not integrate with PayPal for
  outbound payouts. Partnero only records payout status; the cash transfer
  is done manually by an operator from our PayPal account. See section 7.

### 7. Monthly PayPal payout run (manual operator workflow)

Partnero does not push money to partners/referrers. Every payout cycle
(recommend monthly, ~mid-month so chargeback window has closed on the
prior month's conversions), an operator runs this loop:

1. Portal: Programs → Refer-a-friend → **Payouts** → Export eligible
   partners (CSV). The export includes referrer email + amount + any
   commission reference ids.
2. Log into the BudgetSmart AI PayPal Business account → **Send Money**
   (or Mass Payout if the batch is large). Send each referrer the listed
   amount using their email.
3. Copy each PayPal transaction ID back into Partnero → Payouts → mark the
   row **Paid** and paste the transaction ID in the reference field. This
   closes the loop so the customer's dashboard flips from "Pending" → "Paid"
   and the `paid_referrals` stat increments on our `/api/referrals/me`.

Operator notes:
- Always reconcile exported CSV against Stripe chargeback log first — any
  referee whose Stripe payment reversed in the hold window should be
  removed from the payout batch (Partnero may still list them if the
  chargeback happened after approval — double-check).
- For amounts > $600/referrer/year, 1099-NEC filing obligations may apply.
  Track cumulative per-email totals separately; Partnero's CSV gives you
  the raw transactions.

## Verification checklist

Once the above is done, verify end-to-end before turning
`PARTNERO_REFERRAL_ENABLED=true` on in Railway prod:

- [ ] Create a test user via `POST /api/auth/register` → confirm row
      appears in Partnero → **Customers** with a referral code. (Note:
      Customer Referral uses `/api/v1/customers`, not `/partners`.)
- [ ] Hit `GET /api/referrals/me` with that user's session → confirm
      `{enabled: true, enrolled: true, code, url}` is returned.
- [ ] Open `/referrals` in the app → confirm gold hero + copy button
      populated with the real link.
- [ ] Sign up a second test user via the referral link → confirm Stripe
      coupon attaches at checkout and Partnero logs the referral.
- [ ] Complete annual plan purchase on the referee → confirm Partnero
      records the referral as pending, amount $30.
- [ ] Wait 30 days (or manually mark as approved in portal) → referrer
      moves to "eligible for payout" status in Partnero. (No PayPal
      auto-payout fires — the operator CSV-export + manual-send flow in
      section 7 takes it from here.)
- [ ] Run one dry-run payout cycle end-to-end (CSV export → PayPal send →
      mark Paid in Partnero) to confirm the stat roll-up in
      `/api/referrals/me` flips `pendingCents → totalEarnedCents` as
      expected.

## Env vars (Railway prod)

Currently set on the web service (from the PR-2 config pass):

```
PARTNERO_API_KEY          = <bearer token — shared across programs>
PARTNERO_REFERRAL_ENABLED = false  # ← flip to `true` after portal config complete
PARTNERO_REFERRAL_PROGRAM_ID = 12078  # defaults if unset
```

Flip `PARTNERO_REFERRAL_ENABLED=true` only after Partnero portal is
fully configured per the steps above. The code is designed to fail
closed if disabled — `/api/referrals/me` returns `{enabled: false}`
and the frontend shows a "Coming soon" stub.

## Architecture notes

- Customer key = email. This matches the universal.js `po('customer','signup',{email})`
  call used by the tracking pixel, keeping Partnero's join logic simple.
- `409 Conflict` on enroll is treated as success (user already exists) —
  we re-fetch their partner record. This makes the enroll call idempotent
  so re-registration, resends, and retries don't double-book.
- All Partnero calls are wrapped in try/catch and never throw. Partnero
  outages must NEVER fail a user signup. See the `.catch(err => console.error…)`
  in `server/routes.ts` register handler.
- The referral list endpoint obfuscates referee emails as `r***@domain.com`
  for privacy. The referee's full identity is never exposed to the referrer.

## Files touched (code)

```
server/partnero-referral.ts             (new)
server/routes/referrals.ts              (new)
server/routes.ts                        (imports + mount + auto-enroll)
client/src/components/ReferralModal.tsx (new)
client/src/pages/referrals.tsx          (new)
client/src/App.tsx                      (route)
client/src/components/app-sidebar.tsx   (gold-heart button + modal mount)
```

## Open follow-ups (not blocking launch)

1. In-app `/affiliate` page with Partnero-API-backed signup form so
   logged-in users can apply to the commission-only affiliate program
   without being bounced to www.budgetsmart.io.
2. Admin dashboard showing top referrers, total cash paid out, fraud
   signals (chargeback-reversal rate, self-referrals caught).
3. Legal: update Privacy Policy + add Referral Terms page. Partnero's
   data-processing addendum covers referee email storage.
