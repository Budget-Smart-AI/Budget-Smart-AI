# Phase 3.4 + Real Cash Flow fix — Cline commit prompt

**Run this locally** (sandbox git can't push due to virtiofs unlink limitation).

The edits are already in place on disk. This prompt just needs to commit + push.

---

## Files changed (5)

```
client/src/components/accounts/accounts-summary-sidebar.tsx   +5 / -1
client/src/pages/budgets.tsx                                  +6 / -2
client/src/pages/dashboard.tsx                               +26 / -16
client/src/pages/expenses.tsx                                +10 / -10
client/src/pages/income.tsx                                   +4 / -1
```

## What shipped in this bundle

**Real Cash Flow fix (dashboard.tsx)**
- `SectionHeader` "real" variant: `from-red-500 to-orange-500` → `from-teal-500 to-emerald-500` (kills the amber cast from the section header icon)
- Real Cash Flow section wrapper (line ~625): dropped the emerald gradient div, swapped to `glass-surface rounded-[var(--radius-card-lg)]`
- Plan section wrapper (line ~948): same glass treatment; dropped `border-2 border-emerald-200`

**Phase 3.4 — opt app pages into glass surface**
- Income page: main sources Card → `variant="glass"`
- Expenses page: all 4 KPI summary cards + main table Card → `variant="glass"`
- Budgets page: neutral on-pace cards now use `glass-surface` directly; over-budget + over-pace keep their warning colors (per color palette policy); skeleton Card opt-in
- Accounts sidebar summary: `AccountsSummarySidebar` → `variant="glass"`

Every page now sits on the same mint-glass substrate as the Dashboard hero row. Gold Upgrade CTA + amber warning cards + category colors are untouched.

## Cline prompt

```
Please commit and push the staged changes in the budget-smart-ai repo.

Scope is exactly these 5 files — do not add or stage anything else:
  - client/src/components/accounts/accounts-summary-sidebar.tsx
  - client/src/pages/budgets.tsx
  - client/src/pages/dashboard.tsx
  - client/src/pages/expenses.tsx
  - client/src/pages/income.tsx

Commit message (use HEREDOC to preserve newlines):

fix(dashboard): teal real-cash-flow + glass opt-in across income/expenses/budgets/accounts (phase 3.4)

- dashboard: SectionHeader "real" variant now teal→emerald (was red/orange) so the
  Real Cash Flow section header no longer casts amber across the dash
- dashboard: Real Cash Flow + Plan section wrappers swapped from gradient divs to
  `glass-surface rounded-[var(--radius-card-lg)]` — match hero KPI substrate
- income: main Income Sources panel → <Card variant="glass">
- expenses: 4 summary cards + main table → <Card variant="glass">
- budgets: neutral on-pace cards → glass-surface (over-budget + over-pace keep
  warning colors — see feedback_color_palette_policy.md)
- accounts: AccountsSummarySidebar → variant="glass"

Push to origin/main. Railway will auto-deploy; app.budgetsmart.io should pick
this up in ~90s.
```

## Post-push smoke test (PowerShell)

```powershell
# Wait ~90s after push for Railway
Start-Sleep -Seconds 90

# Grab the latest HTML + JS bundle and verify 3.4 markers are present
$html = (Invoke-WebRequest "https://app.budgetsmart.io/dashboard" -UseBasicParsing).Content
$jsUrl = [regex]::Match($html, 'src="(/assets/index-[^"]+\.js)"').Groups[1].Value
$js    = (Invoke-WebRequest "https://app.budgetsmart.io$jsUrl" -UseBasicParsing).Content

# These should all be True after Phase 3.4 deploys
"teal→emerald gradient:   " + ($js -match "from-teal-500 to-emerald-500")
"glass-surface radius:    " + ($js -match "glass-surface rounded-\[var\(--radius-card-lg\)\]")
"Income glass card:       " + ($js -match 'variant="glass"|variant:"glass"')
"Budgets on-pace glass:   " + ($js -match 'border-0 glass-surface')
```

All four should print `True`. If any print `False`, Railway hasn't finished
deploying — wait another 60s and re-run.
