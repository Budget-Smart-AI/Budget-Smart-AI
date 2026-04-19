# Phase 3.9 — Affiliate Integration (Partnero) Hand-off

**Status:** code complete, ready to commit + ship.
**Owner action required:** commit/push from local terminal (sandbox can't write to .git), plus three out-of-repo configuration changes (Stripe Dashboard, Railway env vars, Partnero portal).

This is the second pass at the affiliate program. The first pass set up the
Partnero account, copied a 4-tier commission structure into the public page,
and pointed the universal.js snippet at `affiliate.budgetsmart.io`. This pass
locks in the simplified 2-tier structure Ryan committed to on 2026-04-17 and
plugs the gap that was preventing renewal commissions from being tracked.

---

## What changed in code

### New files
- `server/partnero.ts` — server-side Partnero REST client (transactions + refunds). Gated behind `PARTNERO_ENABLED`, `PARTNERO_API_KEY`, `PARTNERO_PROGRAM_ID` (defaults `CJUSEXBQ`). Uses Stripe invoice IDs as `transaction_key` for idempotency, treats HTTP 409 (duplicate) as success, swallows all errors so a Partnero outage cannot fail a Stripe webhook.
- `migrations/0033_simplify_affiliate_tiers.sql` — collapses the legacy 4-tier rows (Standard/Growth/Elite/Diamond + bonus amounts) down to the 2-tier model and seeds the new keys (commissionPercent, boostedCommissionPercent, boostedAfterReferrals, cookieDurationDays, payoutMethod, payoutMinimum, commissionRecurrence, partneroUrl).

### Modified files
- `server/stripe.ts` — `handleInvoicePaid` now calls `trackPartneroPayment` for every successful invoice (including renewals). Added `handleChargeRefunded` + `charge.refunded` case in the webhook switch so refunds reverse Partnero commissions. Skips $0 invoices (trial conversions) and missing-email invoices defensively.
- `server/routes.ts` — `/api/affiliate/settings` defaults rewritten for the 2-tier model. Drops the legacy `bonusTier1*`, `tier2CommissionPercent`, `tier3CommissionPercent` keys.
- `client/src/pages/affiliate.tsx` — `AffiliateSettings` interface, hardcoded fallback, hero stats row (180-day cookie, $100 PayPal), "How It Works" copy, and the entire bonus-tiers section all rewritten. Replaced 3-card bonus grid with a clean 2-tier "Standard vs Boosted" callout. FAQ updated for $100/180-day/2-tier copy plus a new "How does the boost work?" entry.
- `client/src/pages/affiliate-terms.tsx` — Section 2 rewritten for the 2-tier table (Standard 40%, Boosted 50% at 250 referrals). Section 3 ("Payout Timing") rewritten to "Payouts" — $100 PayPal threshold, 30-day holding period (was 60), and explicit refund-reversal language. Section 4 (qualified referral) updated for the 180-day cookie and self-referral guard.
- `client/src/pages/admin-landing.tsx` — `AffiliateTab` form rewritten end-to-end. Replaced 3-tier Silver/Gold/Diamond bonus-amount inputs with three field groups: commission rates (standard/boosted/threshold), attribution & payouts (cookie days/method/min), and the Partnero URL field. Default partneroUrl fixed (was the partnero.com URL, now the custom-domain CNAME).
- `client/src/App.tsx` — added `AffiliateRoute` wrapper that 301-replaces `app.budgetsmart.io/affiliate` and `app.budgetsmart.io/affiliate-terms` to `www.budgetsmart.io/...`. Same pattern as the existing `PricingRoute`. Marketing pages now consolidate to www for SEO. Imported `type ReactNode` from react.

### Already correct (no edit needed)
- `client/src/pages/landing.tsx` — footer already has both `Affiliate Program` and `Affiliate Terms` links (lines 1612 + 1621).
- `server/index.ts` CSP — already allows `https://app.partnero.com` in scriptSrc.
- `client/index.html` (or wherever the universal.js snippet lives) — already pointed at the right program ID per the prior session's audit.

---

## Manual actions Ryan needs to do (NOT in code)

### 1. Stripe Dashboard — fix the failing webhook URL
The endpoint registered as `https://budgetsmart.io/api/stripe/webhook` started failing yesterday because the apex domain redirects to `www.` and the redirect strips the POST body / signature. Update it to the canonical app host:

- Open Stripe Dashboard → Developers → Webhooks
- Edit the failing endpoint
- Change URL to: **`https://app.budgetsmart.io/api/stripe/webhook`**
- Verify the event subscription includes:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `charge.refunded` ← **add this if not already there** (new in this PR)
- Click "Send test webhook" with `invoice.payment_succeeded` and confirm 200 OK
- Re-enable the endpoint if Stripe auto-disabled it after the failures

### 2. Railway — set Partnero env vars on all 3 services
Per Ryan's instruction `VITE_PARTNERO_ENABLED=TRUE` should already be set on all 3 services (web, engine, worker). Add these server-side keys to enable the new payment-attribution backstop:

On the **web** service (`app.budgetsmart.io`) and ideally also on the engine + worker for symmetry:
```
PARTNERO_ENABLED=true
PARTNERO_API_KEY=<paste from Partnero Portal → Settings → API Keys>
PARTNERO_PROGRAM_ID=CJUSEXBQ
```
`PARTNERO_API_BASE` defaults to `https://app.partnero.com` and shouldn't need to be set.

The web service is the only one that handles the Stripe webhook, so technically only it needs these set, but setting them everywhere is safer if we ever route the webhook differently.

### 3. Partnero Portal — confirm program settings match
Open https://app.partnero.com → Programs → BudgetSmart and confirm:

| Setting | Value |
|---|---|
| Commission rate (default) | 40% |
| Custom rate trigger | 50% after 250 active referrals |
| Recurrence | Lifetime / Recurring on every renewal |
| Cookie duration | 180 days |
| Payout method | PayPal |
| Minimum payout | $100 |
| Stripe integration | Live (already set per Ryan's audit answer) |
| Stripe events forwarded | `invoice.payment_succeeded`, `charge.refunded` (so the native integration AND our server-side backstop both fire — they idempotently dedupe by `transaction_key` = Stripe invoice ID) |
| Custom domain | `affiliate.budgetsmart.io` (CNAME already set up) |

If any commission/cookie/payout values in Partnero differ from this PR, **Partnero is the source of truth for what affiliates actually see in their portal** — this PR's UI just displays the same numbers on the public page. They need to match.

### 4. Run the migration
After deploy:
```bash
cd Budget-Smart-AI
npm run db:push
# OR if you prefer raw SQL:
psql "$DATABASE_URL" -f migrations/0033_simplify_affiliate_tiers.sql
```
This wipes legacy `bonusTier*` rows and seeds the new 2-tier keys.

---

## Suggested commit (HEREDOC for clean formatting)

Run from the repo root:

```bash
git add \
  server/partnero.ts \
  server/stripe.ts \
  server/routes.ts \
  migrations/0033_simplify_affiliate_tiers.sql \
  client/src/App.tsx \
  client/src/pages/affiliate.tsx \
  client/src/pages/affiliate-terms.tsx \
  client/src/pages/admin-landing.tsx \
  PHASE-3.9-AFFILIATE.md

git commit -m "$(cat <<'EOF'
feat(affiliate): simplify to 2-tier 40/50% lifetime + server-side Partnero attribution

Locks in the operator decisions from 2026-04-17 and plugs the gap that was
silently dropping renewal commissions.

Server-side attribution:
* New server/partnero.ts wraps Partnero REST API for transactions + refunds.
  Gated by PARTNERO_ENABLED env var; idempotent on Stripe invoice ID; never
  throws (so Partnero outages can't fail Stripe webhooks).
* server/stripe.ts handleInvoicePaid now fires trackPartneroPayment for every
  successful invoice including renewals — closes the lifetime-recurring
  attribution gap (frontend universal.js only fires on signup + first payment).
* New charge.refunded handler reverses commission via trackPartneroRefund.

Two-tier commission UI:
* Standard 40% lifetime recurring from day one.
* Boosted 50% at 250 active referrals — re-rates ALL of an affiliate's
  referrals, not just new ones from that point forward.
* 180-day attribution cookie · $100 PayPal minimum payout.
* Replaces 4-tier (Standard/Growth/Elite/Diamond) model from migration 0010.

Files:
* affiliate.tsx — new Standard-vs-Boosted hero, FAQ updated for $100/180d.
* affiliate-terms.tsx — section 2 (commission table) and section 3 (payouts)
  rewritten; 30-day holding period; explicit refund-reversal language.
* admin-landing.tsx — AffiliateTab rewritten with three field groups
  (rates / attribution & payouts / Partnero URL); default partneroUrl now
  the custom-domain CNAME (affiliate.budgetsmart.io).
* routes.ts — /api/affiliate/settings defaults rewritten for 2-tier keys.
* App.tsx — AffiliateRoute wrapper redirects app.budgetsmart.io/affiliate
  to www.budgetsmart.io/affiliate (same pattern as PricingRoute) so
  marketing pages consolidate on www for SEO.
* migrations/0033 — wipes legacy bonusTier* rows; seeds new 2-tier keys.

Manual ops actions documented in PHASE-3.9-AFFILIATE.md:
1. Update Stripe webhook URL to https://app.budgetsmart.io/api/stripe/webhook
   (apex was failing — redirect strips POST body) + add charge.refunded event.
2. Set PARTNERO_ENABLED=true + PARTNERO_API_KEY on Railway services.
3. Verify Partnero portal commission/cookie/payout settings match this PR.
4. Run npm run db:push to apply migration 0033.
EOF
)"

git push origin main
```

---

## Post-push validation checklist

- [ ] `https://www.budgetsmart.io/affiliate` shows 40% Standard / 50% Boosted hero, 180-day cookie, $100 PayPal payout
- [ ] `https://www.budgetsmart.io/affiliate-terms` shows the 2-tier table and 30-day holding period
- [ ] `https://app.budgetsmart.io/affiliate` redirects to www
- [ ] Admin → Landing → Affiliate tab loads without errors and shows 3 field groups (rates / attribution / Partnero URL)
- [ ] Migration applied: `psql $DATABASE_URL -c "SELECT key, value FROM affiliate_settings ORDER BY key"` shows the 8 new keys and zero `bonusTier*`/`tier[23]CommissionPercent` rows
- [ ] Railway env vars set: `railway run --service web env | grep PARTNERO`
- [ ] Stripe Dashboard webhook endpoint shows green / no recent failures
- [ ] Trigger a test renewal (Stripe Dashboard → invoice.payment_succeeded test event → confirm Partnero sees the transaction in the affiliate's ledger)

If any of those fail, check Railway logs for `[Partnero]` and `[Stripe Webhook]` lines — every Partnero call logs whether it succeeded, was deduped (409), or failed.

---

## Pre-existing TS errors (NOT from this PR)

`npm run check` will surface ~25 errors across `server/storage.ts`, `server/routes.ts`, `server/lib/auto-reconciler.ts`, `server/sync-scheduler.ts`, `server/routes/admin-plans.ts`, `server/routes/auth-password-reset.ts`, and `server/receipt-scanner.ts`. All of those existed before this PR — confirmed by git blame. They're tracked separately and not in scope for this commit. The files this PR touched (`server/stripe.ts`, `server/partnero.ts`, `server/routes.ts` lines around 16742, `client/src/App.tsx`, `client/src/pages/affiliate*.tsx`, `client/src/pages/admin-landing.tsx`) compile cleanly.

The frontend page files do show `lucide-react` "no declaration file" warnings — that's a pre-existing env issue with the lucide types not being found by tsc. Doesn't affect runtime.
