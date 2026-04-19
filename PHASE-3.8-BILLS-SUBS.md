# Phase 3.8 — Bills & Subscriptions: glass + fix Subscription Analyze

**Run locally** (sandbox git can't push due to virtiofs unlink limitation).

---

## What this does

Two separate fixes bundled into one push:

### 1. Glass opt-in for Bills & Subscriptions panels

Sweeps the remaining solid Card panels on `/bills` and `/subscriptions` and
flips them to `variant="glass"` so they pick up the mint-glass treatment from
Phase 3.3c.

Per the color palette policy, the **Subscriptions Summary Banner**
(`subscriptions.tsx:788`, `border-primary/20 bg-primary/5`) is intentionally
left on the solid surface so its primary-tinted accent keeps its weight as
the headline summary card.

### 2. Fix Subscription Analyze finding only 1 entry

Two bugs caused the "Analyze My Transactions" button to surface almost
nothing:

**Bug A — `"Entertainment & Recreation"` was in `NON_BILL_CATEGORIES`**

Plaid categorizes streaming services (Netflix, Spotify, Disney+, Hulu,
Apple TV+, HBO Max) under **Entertainment & Recreation**. The category gate
threw out their transactions before they could even reach the
amount-consistency + frequency-band checks. Result: the most common type of
subscription was silently dropped.

The downstream amount-consistency (5%) + frequency-band (weekly / biweekly /
monthly / quarterly / yearly) checks already reliably separate true
subscriptions from one-off entertainment purchases (concert tickets, movies),
so the category gate was redundant *and* over-aggressive. Removed.

**Bug B — Bidirectional substring filter on existing-bill names**

The dedupe filter ran:

```ts
existingBillNames.some(existing =>
  existing.includes(nameLower) || nameLower.includes(existing)
)
```

If the user already had a bill with a generic short name like `"Insurance"`,
`"Loan"`, or `"Subscription"`, **every detection containing that substring
got cascade-filtered**. e.g., user has `"Insurance"` saved → "State Farm
Insurance" detected → dropped because `"state farm insurance".includes("insurance")`.

Replaced with a `namesMatch` helper that requires the shorter side to be ≥6
chars before allowing substring containment. Exact-match still works for any
length. So `"Netflix"` (7 chars) still dedupes against `"Netflix.com"`, but
`"Loan"` (4 chars) no longer mass-filters every loan-related detection.

Both fixes apply identically to `/api/bills/detect` (line 422) and
`/api/subscriptions/detect` (line 9673) — the two endpoints share the same
detection algorithm.

---

## Files changed (3)

```
client/src/pages/bills.tsx           —  5 cards → glass
client/src/pages/subscriptions.tsx   —  5 cards → glass (1 primary banner kept solid)
server/routes.ts                     —  /api/bills/detect + /api/subscriptions/detect
                                       · removed "Entertainment & Recreation" from NON_BILL_CATEGORIES
                                       · replaced bidirectional substring filter with namesMatch (≥6 char floor)
                                     ─────────────
                                      10 cards + 4 server-side fixes
```

No new imports. No type changes. Pure variant additions on the client; pure
filter loosening on the server.

---

## Cline prompt

```
Please commit and push the staged changes in the budget-smart-ai repo.

Scope is exactly these 3 files — do not add or stage anything else:
  - client/src/pages/bills.tsx
  - client/src/pages/subscriptions.tsx
  - server/routes.ts

Commit message (HEREDOC to preserve newlines):

fix(subscriptions): unblock Analyze + opt Bills/Subs panels into glass

Two bundled changes for the Bills & Subscriptions surface:

1. Glass opt-in (10 cards across bills.tsx + subscriptions.tsx)
   - bills.tsx: 4 KPI summary cards (This Month / Monthly Estimate /
     Annual Estimate / Upcoming) + All Bills list card → variant="glass"
   - subscriptions.tsx: 3 stat cards (Active / Monthly / Yearly) + Active
     Subscriptions list + Paused Subscriptions list → variant="glass"
   - The primary-tinted Summary Banner (border-primary/20 bg-primary/5)
     intentionally stays solid per the color palette policy — primary
     accent reads better against a non-glassy backdrop.

2. Fix "Analyze My Transactions" finding only 1 entry. Two root causes:

   a. "Entertainment & Recreation" was in NON_BILL_CATEGORIES, which
      filtered out Netflix / Spotify / Disney+ / Hulu / Apple TV+ /
      HBO Max BEFORE they could be analyzed (Plaid categorizes streaming
      services under that bucket). Removed — the downstream 5% amount-
      consistency + frequency-band checks already reliably separate true
      subscriptions from one-off entertainment purchases.

   b. The dedupe filter against existing-bill names used bidirectional
      substring containment. If the user had a generic short bill name
      like "Insurance", "Loan", or "Subscription", every detection
      containing that word got cascade-filtered (e.g., "State Farm
      Insurance" → dropped because "state farm insurance".includes
      ("insurance")). Replaced with a namesMatch helper that requires
      the shorter side to be ≥6 chars before allowing substring matching.
      Exact-match still works at any length.

Both server-side fixes apply identically to /api/bills/detect and
/api/subscriptions/detect — the two endpoints share the detection
algorithm.

Push to origin/main. Railway will auto-deploy; app.budgetsmart.io should
pick this up in ~90s.
```

---

## Post-push smoke test

### Glass surface
1. Open `app.budgetsmart.io/bills` — the 4 summary KPI cards (This Month,
   Monthly Estimate, Annual Estimate, Upcoming) should all show the
   mint-glass surface, as should the All Bills list card.
2. Open `app.budgetsmart.io/subscriptions`:
   - The 3 small stat cards (Active / Monthly / Yearly) on glass.
   - Active Subscriptions list on glass.
   - Paused Subscriptions list on glass (only visible if any are paused).
   - The Summary Banner at the top (with the green TrendingDown icon and
     the monthly total) intentionally stays solid with its primary border
     accent — that's correct, not a regression.
3. Spot-check both light and dark mode — glass surface tokens are
   theme-aware (mint-glass in light, neutral-glass in dark).

### Subscription Analyze
1. Open `/subscriptions`, click **Detect Subscriptions** → **Analyze My
   Transactions**.
2. **Expected**: substantially more results than 1 — should now surface
   any streaming services (Netflix, Spotify, Disney+, Hulu, etc.) that
   were previously filtered out by the entertainment category gate.
3. Also try the same analyze on `/bills` (Detect Bills button) — same
   detection algorithm, same fix applies.
4. If a detection still doesn't show up: confirm the merchant has ≥2
   transactions in the last 12 months with amounts within 5% of each
   other AND the average interval falls in one of the bands (weekly,
   biweekly, monthly, quarterly, yearly). Variable-amount charges
   (utilities with a wide swing) won't pass the 5% gate by design.
