# UAT-7 — Manual QA Checklist for Remaining P3s

**Date:** 2026-04-17
**Scope:** P3-22 (calendar cross-year) + P3-24 (Plaid `brokerage` top-level type)
**Estimated time:** 15–20 minutes total (~7 min per item)

Both fixes are already in `main` (commit `5d2162a`). This is visual/runtime confirmation only.

---

## P3-22 — Calendar cross-year edge case

**What changed:** Calendar renders bills/income events across the Dec → Jan boundary without date drift.

**Setup (2 min):**
1. Open the app at `app.budgetsmart.io` and sign in.
2. Go to **Bills** → **Add Bill**.
3. Create a test bill:
   - Name: `ZZ-QA Year-End Bill`
   - Amount: `42.00`
   - Frequency: `Monthly`
   - Next due: `2026-12-28`
4. Save.

**Test steps (5 min):**
1. Navigate to **Calendar**.
2. Use the month-forward button (`>`) to step through: Apr 2026 → ... → Dec 2026.
3. **Verify:** the bill appears on **Dec 28, 2026** (correct day of week).
4. Click forward one more month → should land on **Jan 2027**.
5. **Verify:** the bill appears on **Jan 28, 2027** (not Jan 27 or Jan 29 — this was the drift bug).
6. Step back one month (`<`) → should return to **Dec 2026** with the bill still on Dec 28.
7. Jump forward 3 months to **Apr 2027** → bill should show on Apr 28.

**Pass criteria:**
- Bill occurrences are on the 28th of every month for 12+ months forward, including across the year boundary.
- No ghost entries on Dec 31 or Jan 1.
- Month header correctly reads "December 2026" and "January 2027" (not "December 2025" or similar year drift).

**Cleanup:** Delete the `ZZ-QA Year-End Bill` from the Bills page.

**If it fails:** Open DevTools → Network tab on `/api/engine/bills?...`. Check whether the occurrence dates in the JSON response are correct. If the API is right but the UI is wrong, it's a render bug in `calendar.tsx`. If the API is wrong, it's in `server/lib/financial-engine/bills.ts`.

---

## P3-24 — Plaid `brokerage` top-level account type

**What changed:** `plaid-adapter.ts` now maps Plaid accounts with `type: "brokerage"` (in addition to `type: "investment"`) to the `"investment"` AccountCategory, so they're counted in Net Worth → Assets.

**Setup (3 min):**
1. Open the Plaid dashboard → **Sandbox** → find an institution that returns a `type: "brokerage"` account. Known candidates:
   - `ins_115622` (Fidelity Sandbox)
   - `ins_12` (First Platypus Bank, sandbox-only test institution)
   - Any custom sandbox webhook setup you've used in prior UATs.
   - Fallback: use the Plaid `/sandbox/public_token/create` endpoint with a custom override that sets `type: "brokerage"` on one account.
2. Link the sandbox institution via **Accounts** → **Connect Bank** in the Budget Smart UI.
3. Wait for initial sync to complete (should be under a minute).

**Test steps (3 min):**
1. Go to **Net Worth**.
2. In the **Assets** column, confirm the brokerage account appears by name with its current balance.
3. Hit `https://api.budgetsmart.io/engine/net-worth` (or the app's proxied equivalent) in a new tab and inspect the JSON:
   - In the `assets` array, the brokerage account should be present with `accountType: "investment"`.
   - It should **not** appear under `assets[?].accountType === "other"` or be missing entirely.
4. (Optional) Check `assetBreakdown.investment` — the brokerage balance should be included in that bucket's total.

**Pass criteria:**
- Brokerage account shows up under Net Worth → Assets with its full balance.
- `accountType` is `"investment"` (not `"other"`) in the engine response.
- `totalAssets` reflects the brokerage balance.

**Cleanup:** Optionally unlink the sandbox institution from **Accounts**.

**If it fails:** Check the raw Plaid `/accounts/get` response in the Plaid dashboard for the account — capture the exact `type` and `subtype` strings. If `type` is something other than `"brokerage"` or `"investment"` (e.g., `"depository"` for a cash management account), update the `INVESTMENT_SUBTYPES` set or the type check in `mapPlaidAccountType()` at `server/lib/financial-engine/adapters/plaid-adapter.ts:87`.

---

## Sign-off

| Item | Status | Tested by | Date | Notes |
|---|---|---|---|---|
| P3-22 | ☐ Pass ☐ Fail | | | |
| P3-24 | ☐ Pass ☐ Fail | | | |

Once both are checked off, UAT-7 is fully closed — 23/23 items verified.
