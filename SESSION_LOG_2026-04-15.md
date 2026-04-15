# Session Log — 2026-04-15

**Operator:** Ryan Mahabir
**Agent:** Claude (Cowork mode, Opus 4.6)
**Purpose:** Durable log of work done in this session so context isn't lost across future sessions or downtime. Kept under version control so the history survives even if the operator's working tree or Claude's memory is wiped.

## Session goal

1. Finish the calculation engine isolation: engine runs as its own Railway service at `api.budgetsmart.io`; remove all engine code from the website process.
2. 2. Compare BSAI calculations to Monarch Money. Fix divergences in bills, expenses, subscriptions. Align category taxonomy with Monarch's.
   3. 3. Keep a running log (this file) so that if sessions lose context again, the operator can recover where the work left off.
     
      4. ---
     
      5. ## Entry 1 — 20:43 UTC — Discovery of failed website deploy
     
      6. The BudgetSmart AI service (app.budgetsmart.io) in Railway had a failed deploy in history for commit `8a00da5` ("infra(engine): isolate engine service on api.budgetsmart.io"). Failure mode: Network › Healthcheck failed; 14 retries of `GET /health` over 5 min, all returned `404` from Caddy. Website was rolled back to parent commit `9d2f605` (feat(engine): standalone entry point + build target for api.budgetsmart.io).
     
      7. ## Entry 2 — 20:45 UTC — Root cause of the 404
     
      8. Verified `/health` exists on both entry points (`server/index.ts:60` for website, `server/engine/standalone.ts:72` for engine). Verified `script/build.ts` builds both `dist/index.cjs` and `dist/engine.cjs`. Verified `package.json` has both `start` and `start:engine`.
     
      9. The real cause: commit `8a00da5` dropped `"startCommand": "npm start"` from `railway.json`, with the intent that each Railway service would use its own service-level Custom Start Command. The Engine service was correctly configured with `npm run start:engine` at the service level; the Website service, however, was inheriting `npm start` from railway.json and never got a service-level override. When 8a00da5 removed the inherited value, Nixpacks defaulted to serving `dist/public` via Caddy, which has no `/health` route → 404.
     
      10. Confirmed via JS inspection of the Railway Settings UI: the website service's Custom Start Command field had `readOnly: true` because the value was inherited from railway.json. Railway's UI does not permit creating a service-level override while the config file provides one.
     
      11. ## Entry 3 — 20:53 UTC — Fix: put startCommand back in railway.json
     
      12. Restored `"startCommand": "npm start"` in the `deploy` block of `railway.json`. The engine service's service-level override (`npm run start:engine`) still wins over railway.json, so engine behavior is unchanged. The website service now cleanly inherits `npm start` from railway.json.
     
      13. Committed directly to `main` via the GitHub web UI (Ryan's explicit direction). Commit title: `fix(infra): restore startCommand in railway.json so website service doesn't 404 on healthcheck`.
     
      14. ## Entry 4 — 20:56 UTC — Deploy verification
     
      15. Railway auto-deployed both services. Website deploy succeeded; ACTIVE on the new commit; `app.budgetsmart.io/health` returns `200 {status:"healthy", db:ok, encryption:ok, uptime:123s}`. Engine deploy in healthcheck phase at log time. Old engine container (8a00da5) still serves; direct GET `https://api.budgetsmart.io/health` returns `{"status":"healthy","service":"engine","uptime:61353s"}`.
     
      16. ## Entry 5 — 21:00 UTC — Open issue: cross-origin fetch from app → api fails
     
      17. From `https://app.budgetsmart.io/dashboard`, a browser `fetch('https://api.budgetsmart.io/health')` returns `TypeError: Failed to fetch` both with `credentials:'include'` and `mode:'no-cors'`. Direct browser navigation to `https://api.budgetsmart.io/health` works fine. This needs diagnosis — the app's production fetches rely on this working. Probably a CORS / ENGINE_ALLOWED_ORIGINS config issue. Investigating next.
     
      18. ## Open items
     
      19. 1. Diagnose CORS/reachability failure from app.budgetsmart.io → api.budgetsmart.io (blocker).
          2. 2. Remove the old `server/routes/engine.ts` file on the website side.
             3. 3. Ensure `dist/index.cjs` no longer bundles `server/lib/financial-engine/`.
                4. 4. Commit final engine-separation cleanup + deploy.
                   5. 5. Begin Monarch vs BSAI calculation audit.
                     
                      6. ## Notes on working environment
                     
                      7. The sandbox's view of the operator's local git working tree is broken (virtiofs mount can't unlink files, and the Linux git in the sandbox can't read the Windows-rebuilt `.git/index`). As a result, all commits this session are being made via the GitHub web UI from the browser tab, not from `git` in the sandbox. The operator (Ryan) does not need to run any commands locally for this to work — GitHub's web UI commits directly to `main`.
                      8. 
