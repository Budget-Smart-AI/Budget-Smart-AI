#!/usr/bin/env bash
# commit_affiliate_pr.sh
#
# Commits the remaining 8 files from the Phase 3.9 Affiliate (Partnero) PR.
# Migration 0033_simplify_affiliate_tiers.sql was already committed separately
# via the GitHub web editor (commit: "feat(affiliate): add migration 0033 —
# simplify to 2-tier 40/50% lifetime") so we skip it here.
#
# Usage from the repo root (Git Bash on Windows, or any bash shell):
#   cd /c/Users/Claude/Documents/Budget-Smart-AI   # or wherever your clone lives
#   bash commit_affiliate_pr.sh
#
# Safety: this script does NOT force-push and does NOT touch any file other
# than the 8 listed below. Review `git status` / `git diff --cached` before
# confirming the push if you want a final look.

set -euo pipefail

echo "==> Pulling latest main (to pick up the migration 0033 commit)"
git checkout main
git pull --ff-only origin main

echo "==> Staging 8 files"
git add \
  server/partnero.ts \
  server/stripe.ts \
  server/routes.ts \
  client/src/App.tsx \
  client/src/pages/affiliate.tsx \
  client/src/pages/affiliate-terms.tsx \
  client/src/pages/admin-landing.tsx \
  PHASE-3.9-AFFILIATE.md

echo "==> Staged files:"
git diff --cached --name-status

echo ""
echo "==> About to commit. Ctrl-C within 5s to abort."
sleep 5

git commit -m "$(cat <<'EOF'
feat(affiliate): 2-tier 40/50% lifetime UI + server-side Partnero attribution

Companion commit to migration 0033 (already on main). Locks in the operator
decisions from 2026-04-17 and plugs the gap that was silently dropping
renewal commissions.

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

Manual ops actions documented in PHASE-3.9-AFFILIATE.md:
1. Update Stripe webhook URL to https://app.budgetsmart.io/api/stripe/webhook
   (apex was failing — redirect strips POST body) + add charge.refunded event.
2. Set PARTNERO_ENABLED=true + PARTNERO_API_KEY on Railway services.
3. Verify Partnero portal commission/cookie/payout settings match this PR.
4. Run npm run db:push (migration 0033 is already on main).
EOF
)"

echo "==> Commit created. Now pushing to origin/main"
git push origin main

echo ""
echo "==> DONE. Railway should now auto-deploy."
echo "==> Don't forget the 3 out-of-repo actions (see PHASE-3.9-AFFILIATE.md):"
echo "    1. Stripe Dashboard: update webhook URL to app.budgetsmart.io + add charge.refunded"
echo "    2. Railway: set PARTNERO_ENABLED + PARTNERO_API_KEY on web service"
echo "    3. Partnero Portal: verify 40%/50%@250/180d/\$100 PayPal settings match"
echo "    4. After deploy completes: npm run db:push"
