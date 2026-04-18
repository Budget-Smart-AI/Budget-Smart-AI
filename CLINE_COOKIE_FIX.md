# Cline: Fix cross-origin session cookie for engine service

## What's broken
The dashboard shows all $0.00 and net worth says "Unable to calculate" because every request to `api.budgetsmart.io/api/engine/*` returns **401 Unauthorized**. The browser isn't sending the session cookie on cross-origin requests.

## Root cause
`server/index.ts` sets `sameSite: "strict"` on the session cookie, which tells the browser to NEVER send the cookie to a different origin. The engine service lives at `api.budgetsmart.io` (different subdomain from `app.budgetsmart.io`), so it never receives the session.

## Code fix (already applied)
In `server/index.ts`, the session cookie config was changed from `sameSite: "strict"` to `sameSite: process.env.NODE_ENV === "production" ? "none" : "strict"`. This matches the engine service's cookie config in `server/engine/standalone.ts`.

## Steps

### 1. Add MAIN_DOMAIN env var to BOTH Railway services

**In Railway → BudgetSmart New Website → Variables:**
```
MAIN_DOMAIN=budgetsmart.io
```

**In Railway → BudgetSmart Engine → Variables:**
Verify `MAIN_DOMAIN=budgetsmart.io` is already set (it should be from engine setup).

This env var scopes the session cookie to `.budgetsmart.io` so it's shared across `app.` and `api.` subdomains.

### 2. Commit and push

```bash
git add server/index.ts
git commit -m "fix: use sameSite=none for cross-origin engine cookie auth

The website's session cookie was set to sameSite=strict, which prevented
the browser from sending it to api.budgetsmart.io. This caused every
engine API call (dashboard, net-worth, expenses, etc.) to return 401.

Changed to sameSite=none in production (matching the engine service's
config) so cross-subdomain session sharing works correctly."

git push origin main
```

### 3. After push, verify
- Dashboard should load real financial data (not all $0.00)
- Net Worth page should calculate correctly
- All `/api/engine/*` requests should return 200

## Files changed
- `server/index.ts` — line 202: `sameSite: "strict"` → `sameSite: process.env.NODE_ENV === "production" ? "none" : "strict"`
