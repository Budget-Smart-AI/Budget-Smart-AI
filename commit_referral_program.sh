#!/usr/bin/env bash
# commit_referral_program.sh
#
# Commits the Partnero Customer Referral program — backend + frontend +
# handoff doc — as a single atomic commit on main, then pushes.
#
# Run this from Git Bash / PowerShell / WSL (NOT from the Cowork sandbox —
# virtiofs blocks .git/* unlink ops).
#
#   cd C:\Users\Claude\Documents\Budget-Smart-AI
#   bash commit_referral_program.sh
#
# Requires: git, network access to origin/main.
# Safe to re-run; will abort if nothing to commit.

set -euo pipefail

cd "$(dirname "$0")"

echo "=== Commit: Partnero Customer Referral program ==="
echo "Branch: $(git rev-parse --abbrev-ref HEAD)"
echo

# Sanity: must be on main, or bail with instructions.
if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  echo "ERROR: not on main. Switch to main or cherry-pick manually." >&2
  exit 1
fi

# Stage ONLY the referral-program files — leave unrelated dirty files alone.
echo "Staging referral program files…"
git add \
  server/partnero-referral.ts \
  server/routes/referrals.ts \
  server/routes.ts \
  client/src/components/ReferralModal.tsx \
  client/src/pages/referrals.tsx \
  client/src/App.tsx \
  client/src/components/app-sidebar.tsx \
  docs/partnero-customer-referral-handoff.md

echo
echo "Staged changes:"
git status --short --cached
echo

# Abort if nothing staged.
if git diff --cached --quiet; then
  echo "Nothing to commit — referral files already committed. Exiting." >&2
  exit 0
fi

COMMIT_MSG=$(cat <<'EOF'
feat(referrals): ship Partnero customer referral program

Adds a thin-proxy integration with Partnero's Refer-a-friend program
(id 12078) so users can share a personal link and earn $30 cash per
friend who signs up for annual. Friend gets 30% off year 1.

Backend
- server/partnero-referral.ts — idempotent Partnero client (enroll/get/
  list). 409 treated as success; every call wrapped try/catch so Partnero
  outages never fail signup.
- server/routes/referrals.ts — /api/referrals/{me,list,enroll} proxy
  with session-based auth, lazy enrollment for pre-launch users, and
  email obfuscation on the list endpoint for privacy.
- server/routes.ts — mount the routes, and fire-and-forget enroll in the
  POST /api/auth/register handler so every new signup lands in Partnero
  with a ready-to-share code.

Frontend
- client/src/components/ReferralModal.tsx — gold-gradient share modal
  (code, link, copy button, email/SMS/Twitter share) opened from a new
  gold-heart icon in the sidebar footer.
- client/src/pages/referrals.tsx — full-page dashboard with stats
  (referred/paid/earned/pending), how-it-works, and the list of the
  user's own referrals with status badges.
- client/src/App.tsx — register /referrals (authed) route.
- client/src/components/app-sidebar.tsx — gold-heart button + mount the
  modal alongside the existing affiliate Tag icon.

Gated by PARTNERO_REFERRAL_ENABLED env flag — defaults to false so this
ships dark until the Partnero portal is fully configured. See
docs/partnero-customer-referral-handoff.md for the remaining portal
steps (Stripe coupon 30%/once, $30 PayPal commission, 30d hold period,
auto-enroll toggle, email templates).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)

echo "Committing…"
git commit -m "$COMMIT_MSG"

echo
echo "=== Commit done ==="
git log -1 --stat

echo
read -rp "Push to origin/main now? [y/N] " CONFIRM
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
  git push origin main
  echo "Pushed to origin/main."
else
  echo "Not pushing. Run 'git push origin main' when ready."
fi
