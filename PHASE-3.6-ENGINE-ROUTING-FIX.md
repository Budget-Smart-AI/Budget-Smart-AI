# Phase 3.6 — Engine routing fix (Budgets / Reports / Savings Goals)

**Run locally** (sandbox git can't push due to virtiofs unlink limitation).

---

## The bug

Three pages — Budgets, Reports, Savings Goals — were calling `/api/engine/*`
endpoints with bare `fetch()` from inside their `useQuery` `queryFn`. That
bypassed `resolveApiUrl()` in `client/src/lib/queryClient.ts`, so production
requests hit `app.budgetsmart.io/api/engine/*` and got 404 — the engine has
been on `api.budgetsmart.io` since the 2026-04-14 isolation.

**User-visible symptom (Budgets):**
- Page shows "No budgets set for this month" even though budgets exist in DB
- Clicking "Set Budget" opens the dialog but the form is broken: `/api/budgets`
  (raw list, hits app host correctly) reports all categories already have
  budgets → `availableCategories` is empty → submit disabled → looks like a
  no-op
- AI Suggest fires the request, but the server (also reading the raw budgets
  list) returns "All your spending categories already have budgets set for
  this month" → no new budgets created → looks like a no-op

Same root cause was lurking on Reports (2 calls) and Savings Goals (1 call).
The fix is the same in every spot: route through `apiRequest` so engine paths
land on the right host.

---

## Files changed (3)

```
client/src/pages/budgets.tsx          +7 / -2
client/src/pages/reports.tsx          +5 / -3
client/src/pages/savings-goals.tsx    +3 / -2
```

All three already imported `apiRequest` — pure swap of the network helper.

---

## Cline prompt

```
Please commit and push the staged changes in the budget-smart-ai repo.

Scope is exactly these 3 files — do not add or stage anything else:
  - client/src/pages/budgets.tsx
  - client/src/pages/reports.tsx
  - client/src/pages/savings-goals.tsx

Commit message (HEREDOC to preserve newlines):

fix(client): route engine queries through apiRequest so they hit api.budgetsmart.io

Three pages — Budgets, Reports, Savings Goals — were calling /api/engine/*
with bare `fetch()` from inside their useQuery queryFn. That bypassed
resolveApiUrl() in lib/queryClient.ts, so production hit
app.budgetsmart.io/api/engine/* and 404'd. The engine has been on
api.budgetsmart.io since the 2026-04-14 isolation.

Net effect on Budgets page: engineData stayed empty even when budgets
existed in DB, which made "Set Budget" appear to no-op (form was disabled
because availableCategories filtered out everything) and made AI Suggest
return "All your spending categories already have budgets" — both behaviors
exactly tracked the bug rather than the user's actual data.

Same issue would have hit Reports (current + previous-month queries) and
Savings Goals as soon as those pages were used in production.

Push to origin/main. Railway will auto-deploy; app.budgetsmart.io should
pick this up in ~90s.
```

---

## Post-push smoke test (PowerShell)

```powershell
Start-Sleep -Seconds 90

# Hit the engine endpoint directly to confirm it serves budgets data now
$cookie = "<paste your session cookie value here>"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$session.Cookies.Add((New-Object System.Net.Cookie("connect.sid", $cookie, "/", "api.budgetsmart.io")))

$res = Invoke-WebRequest "https://api.budgetsmart.io/api/engine/budgets?month=2026-04" `
  -WebSession $session -UseBasicParsing
"engine status: $($res.StatusCode)"
$res.Content | ConvertFrom-Json | Select-Object totalBudget, totalSpent, healthCounts
```

Then in the browser:
1. Open `app.budgetsmart.io/budgets` — should show your existing budgets, not the empty state
2. Click **Set Budget** — dialog opens with available categories
3. Click **AI Suggest** — should propose new budgets (or correctly report all are covered)
