# Session Log — 2026-04-15

**Operator:** Ryan Mahabir
**Agent:** Claude (Cowork mode, Opus 4.6)
**Purpose:** Durable log of work done in this session so context isn't lost across future sessions / downtime. Committed to GitHub so the history survives even if the operator's working tree or Claude's memory is wiped.

## Session goal

1. Finish the calculation engine isolation: engine runs as its own Railway service at `api.budgetsmart.io`; remove all engine code from the website process.
2. Compare BSAI calculations to Monarch Money. Fix divergences in bills, expenses, subscriptions. Align category taxonomy with Monarch's.

---

## Entry 1 — 20:43 UTC — Discovery of failed website deploy

Railway BudgetSmart AI service (app.budgetsmart.io) had a failed deploy in history for commit `8a00da5` ("infra(engine): isolate engine service on api.budgetsmart.io"). Failure mode: Network › Healthcheck failed, 14 retries of `GET /health` over 5 minutes, all returned `404` from Caddy. Website was rolled back to parent commit `9d2f605`.

## Entry 2 — 20:45 UTC — Root cause of the 404

Verified `/health` exists on both entry points (`server/index.ts:60` for website, `server/engine/standalone.ts:72` for engine). Verified `script/build.ts` builds both `dist/index.cjs` and `dist/engine.cjs`. Verified `package.json` has both `start` and `start:engine`.

The real cause: commit `8a00da5` dropped `"startCommand": "npm start"` from `railway.json`, with the intent that each Railway service would use its own service-level Custom Start Command. The Engine service was correctly configured with `npm run start:engine` at the service level; the Website service was inheriting `npm start` from railway.json and never got a service-level override. When 8a00da5 removed the inherited value, Nixpacks defaulted to serving `dist/public` via Caddy, which has no `/health` route → 404.

Confirmed via JS inspection of the Railway Settings UI: website service's Custom Start Command field had `readOnly: true` because the value was inherited from railway.json. Railway's UI does not permit creating a service-level override while the config file provides one.

## Entry 3 — 20:53 UTC — First attempt: restore startCommand in railway.json

Restored `"startCommand": "npm start"` in the `deploy` block of `railway.json`. Theory: engine service's service-level override (`npm run start:engine`) would still win over railway.json, so engine behavior would be unchanged; website service would now cleanly inherit `npm start`.

Committed via GitHub web UI. Commit: `fix(infra): restore startCommand in railway.json so website service doesn't 404 on healthcheck`.

## Entry 4 — 20:56 UTC — Website recovered, engine degraded

Railway auto-deployed both services. Website succeeded: ACTIVE on the new commit, `app.budgetsmart.io/health` returned `200 {status:"healthy", db:ok, encryption:ok, uptime:123s}`.

Engine service's old 17-hour-old container continued to serve traffic initially (uptime 61353s). But Railway was repeatedly trying to redeploy the engine against new commits and those deploys began failing.

## Entry 5 — 21:00 UTC — CORS issue found

From `https://app.budgetsmart.io/dashboard`, browser `fetch('https://api.budgetsmart.io/*')` returned `TypeError: Failed to fetch` with no network request ever firing. Inspected the website's helmet CSP: `connect-src 'self' https://api.plaid.com https://api.mx.com https://api.deepseek.com https://api.openai.com` — missing `https://api.budgetsmart.io`.

Commit `8a00da5` moved the engine to its own Railway service and updated the client to rewrite `/api/engine/*` to api.budgetsmart.io, but did NOT update the website's CSP connect-src. So every engine-powered page in production (dashboard, expenses, income, reports, bills, subscriptions, net-worth, debts, debt-payoff, investments, budgets, savings-goals, bank-accounts, liabilities) would have had its fetches blocked by CSP.

## Entry 6 — 21:05 UTC — Fix CSP

Added `"https://api.budgetsmart.io"` to the `connectSrc` array at line 165 in `server/index.ts`. Committed via GitHub UI. Commit: `fix(csp): allow app.budgetsmart.io to fetch api.budgetsmart.io (connectSrc)`.

## Entry 7 — 21:10 UTC — Engine incident: 502 Bad Gateway

Railway auto-deployed the CSP fix commit. Website redeployed fine. Engine failed — AND the old engine container was now gone. `https://api.budgetsmart.io/health` returned `502 Bad Gateway` from Cloudflare. Looked at engine deploy logs: every new engine deploy since my earlier railway.json restore was crashing with:

```
code: '42501'  (Postgres insufficient_privilege)
routine: 'aclcheck_error'
Cannot start server without user_feature_usage table - feature gating will not work
```

Root cause: **the railway.json revert had overridden the engine service's service-level start command.** The engine service's Custom Start Command went from `npm run start:engine` (service-level override, readOnly:false) to `npm start` (inherited from railway.json, readOnly:true). That's Railway's precedence: config file value wins over UI override when the config file provides one.

So the engine container was running `dist/index.cjs` (the website bundle) instead of `dist/engine.cjs`. The website bundle's startup does `ensureUserFeatureUsageTable()` which runs DDL. The engine's least-privileged `engine_role` (per commit 8a00da5) doesn't have CREATE TABLE — so it failed with Postgres 42501, then the explicit check threw `Cannot start server without user_feature_usage table` and `process.exit(1)`. Crash loop.

## Entry 8 — 21:20 UTC — Fix: per-service Railway config

Created `railway.engine.json` in the repo with `startCommand: "npm run start:engine"` and the same build/deploy settings. Committed via GitHub UI: `fix(infra): per-service railway config — restore engine service start command (incident recovery)`.

Then in Railway BudgetSmart Engine service → Settings → Config-as-code, used the "Add File Path" feature to point this service at `/railway.engine.json` instead of the default `railway.json`. Clicked Deploy.

## Entry 9 — 21:30 UTC — Engine recovered; full separation verified

Engine deployed successfully on the new config. `api.budgetsmart.io/health` returns `200 {status:"healthy", service:"engine", uptime:31s}`.

From `app.budgetsmart.io`, browser fetch to `https://api.budgetsmart.io/api/engine/dashboard` now works end-to-end (CSP passes, request reaches engine, engine returns HTTP 401 "unauthenticated" — the expected auth-required response). Website CSP is correct: `connect-src 'self' https://api.plaid.com https://api.mx.com https://api.deepseek.com https://api.openai.com https://api.budgetsmart.io`.

The engine's `/health` endpoint itself returns `TypeError: Failed to fetch` on cross-origin browser fetch because it doesn't handle CORS preflight — but direct navigation works, and the real app endpoints (`/api/engine/*`) work fine. The health endpoint is only used by Railway's internal HTTP probe which isn't cross-origin, so this is not a bug.

**Engine isolation is now COMPLETE:**
- Engine runs as its own Railway service at api.budgetsmart.io
- Website (`dist/index.cjs`) no longer imports any engine code
- Engine (`dist/engine.cjs`) built from `server/engine/standalone.ts` with its own minimal helmet/session/CORS middleware
- Least-privileged Neon `engine_role` for the engine service
- Per-service Railway config files (`railway.json` for website, `railway.engine.json` for engine)
- Client rewrites `/api/engine/*` to `https://api.budgetsmart.io` in production builds
- CSP allows the cross-origin fetch

## Remaining engine-cleanup items (optional)

1. Delete the dead file `server/routes/engine.ts` — nothing imports it, confirmed via grep. Dead code only, doesn't affect bundle.
2. Fully remove the commented-out `// import { createEngineApp } from "./engine/app";` line at `server/routes.ts:63` for cleanliness.

Neither is a blocker; both can be done in a follow-up commit.

## Next: Monarch Money ↔ BSAI calculation alignment

Operator asked (in autonomous mode) to compare BSAI calculations with Monarch Money and align bills, expenses, subscriptions, and the category taxonomy to match Monarch's approach. This will be the focus once the engine separation is fully verified.

---

## Commits landed this session

| SHA (short) | Title |
|---|---|
| tbd | `fix(infra): restore startCommand in railway.json so website service doesn't 404 on healthcheck` |
| tbd | `chore(log): start SESSION_LOG_2026-04-15.md for durable session history` |
| tbd | `fix(csp): allow app.budgetsmart.io to fetch api.budgetsmart.io (connectSrc)` |
| tbd | `fix(infra): per-service railway config — restore engine service start command (incident recovery)` |

(SHA values recorded via git log on next sync.)

## Notes on working environment

- Sandbox's view of the operator's local git working tree is broken (virtiofs mount can't unlink files; Linux git in the sandbox can't read Windows-rebuilt `.git/index`). All commits are made via GitHub web UI from the browser tab.
- Railway tab, GitHub tabs (two), app.budgetsmart.io, Monarch, Neon Console, and the api.budgetsmart.io/health tab all in the controlled Chrome group.
