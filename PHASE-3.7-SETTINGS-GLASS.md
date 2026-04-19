# Phase 3.7 — Settings panels: opt remaining cards into glass

**Run locally** (sandbox git can't push due to virtiofs unlink limitation).

---

## What this does

Settings was the last big page still rendering everything on solid white
panels. This sweeps every top-level Card primitive across the Settings
surface — Profile, Security, Household, Preferences, Accounts, Categories,
Merchants, Data, Privacy, Billing, Notifications, Spending Alerts — and
adds `variant="glass"` so they pick up the mint-glass treatment from
Phase 3.3c.

Per the color palette policy, warning-state cards are intentionally left on
the solid surface:

- `client/src/pages/settings.tsx:784` — Delete My Account
  (`<Card className="border-destructive/40">`) stays solid so the destructive
  border keeps its weight against a non-glassy backdrop.

Everything else on the Settings tabs flips to glass.

---

## Files changed (5)

```
client/src/pages/settings.tsx                    — 25 cards → glass (1 destructive kept solid)
client/src/pages/email-settings.tsx              —  5 cards → glass
client/src/pages/merchants.tsx                   —  1 card  → glass
client/src/pages/categories.tsx                  —  3 cards → glass
client/src/components/household-settings.tsx     —  4 cards → glass
                                                 ─────────────
                                                  38 cards total
```

All five files already imported `Card` from `@/components/ui/card`. No new
imports — pure variant additions.

---

## Cline prompt

```
Please commit and push the staged changes in the budget-smart-ai repo.

Scope is exactly these 5 files — do not add or stage anything else:
  - client/src/pages/settings.tsx
  - client/src/pages/email-settings.tsx
  - client/src/pages/merchants.tsx
  - client/src/pages/categories.tsx
  - client/src/components/household-settings.tsx

Commit message (HEREDOC to preserve newlines):

style(settings): opt remaining Settings panels into Card variant="glass"

Sweeps every top-level Card on the Settings surface — Profile, Security,
Household, Preferences, Accounts, Categories, Merchants, Data, Privacy,
Billing, Notifications, Spending Alerts — and the standalone Categories
+ Merchants pages reached from Settings. 38 Cards total flipped to
variant="glass" so they pick up the Phase 3.3c mint-glass treatment.

The Delete My Account card (settings.tsx line 784, border-destructive/40)
intentionally stays on the solid surface so its destructive border keeps
its weight against a non-glassy backdrop, per the color palette policy
(amber warnings + destructive states stay solid).

Push to origin/main. Railway will auto-deploy; app.budgetsmart.io should
pick this up in ~90s.
```

---

## Post-push smoke test

Open `app.budgetsmart.io/settings` and tab through:

1. **Profile** — Profile Information, Account Information, Subscription &
   Billing should all show the mint-glass surface.
2. **Security** — main Security card + Session card on glass. The Danger
   Zone block inside the Security card stays bordered/destructive
   (intentional — that's nested, not the panel itself).
3. **Household** — Household, Household Members, Financial Professional
   Access all on glass.
4. **Preferences** — Theme picker card + Preferences card on glass.
5. **Accounts** — Plaid + MX institution group cards on glass; loading
   and empty-state cards on glass.
6. **Categories** → Open Categories Manager → Expense / Income / Bill
   category cards all on glass.
7. **Merchants** — merchant list card on glass.
8. **Data** — Export Your Data + Privacy cards on glass.
9. **Privacy** — Download My Data + Data Retention Policy on glass; Delete
   My Account stays solid with destructive border (intentional).
10. **Billing** — Plan Usage, Current Plan, Next Payment, Payment Method,
    Manage Subscription, Invoice History, no-subscription empty state all
    on glass.
11. **Notifications** — Email Settings, Bill Reminders, Budget Alerts,
    Digest Reports, In-App Notifications all on glass.
12. **Spending Alerts** — alert list cards + loading + empty state all on
    glass.

Spot-check both light and dark mode — glass surface tokens are theme-aware
(mint-glass in light, neutral-glass in dark).
