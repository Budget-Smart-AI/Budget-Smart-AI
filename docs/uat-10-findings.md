# UAT 10 Findings Report — Budget Smart AI

**Date:** 2026-04-20
**Supersedes:** UAT 9 (scrapped same day for insufficiently distinguishing platform fixes from account band-aids)
**Scope:** Re-audit of every UAT-9 calculation finding + every UAT-8 regression, through a platform-wide lens. Every recommendation here must work for every existing and future account with one deploy or one backfill migration. Account-specific Neon UPDATEs are not permitted as primary fixes.
**Method:** Live prod audit via Chrome MCP against Ryan's account on app.budgetsmart.io / api.budgetsmart.io. Raw API: `/api/reports/cash-flow-forecast`, `/api/income`, `/api/income/registry`, `/api/bills`, `/api/subscriptions`, `/api/budgets`, `/api/debts`, `/api/accounts`, `/api/transactions/all`, `/api/engine/*`. Code read: `server/cash-flow.ts`, `server/lib/financial-engine/income.ts`, `server/routes.ts` (`/api/income/detect` handler), `client/src/pages/income.tsx` (save-time mapping).
**Outcome:** 22 findings (#168–#189). Every finding's fix is expressed as either (a) a single-deploy code change that corrects the behaviour for all accounts, (b) a code change plus a one-shot backfill migration keyed on patterns (not user IDs), (c) removal of an unreliable widget until its underlying engine is trustworthy, or (d) a new provenance/confidence field that future reads can key off. Zero findings recommend a per-account hot-patch.

---

## Principles applied in this audit

1. **Platform-wide fixes only.** Every recommendation must work for every existing and future account. No `UPDATE ... WHERE user_id='...'` as a primary fix. Per-user UPDATEs may appear only as an optional "also corrects Ryan's dashboard immediately" footnote.
2. **Consistency over feature count.** If two code paths compute the same metric differently (legacy `/api/income` vs engine, client-side vs server-side rollup), one must be deleted — not both kept with reconciliation bandaids.
3. **Remove > patch.** If a widget's underlying data is unreliable and can't be fixed cheaply, the widget is removed until the engine can support it correctly. A missing widget is better than a wrong number.
4. **Prevent + backfill.** Data bugs require a paired fix: (a) code that prevents future bad writes and (b) a backfill migration that corrects existing bad reads. Neither is complete alone.
5. **Confidence surfacing.** Where auto-detection is inherently fuzzy (Plaid `average_amount`, AI classification, recurrence inference), the source of truth must carry a confidence score and the UI must surface it. Low-confidence items get a "please verify" chip, not a silent save.
6. **Manual override is an escape hatch, not a fix path.** We ask users to verify low-confidence items; we do not expect them to fix systemic bugs by editing their own records.

---

## TL;DR

Three architectural problems are producing most of the symptom bugs:

1. **Auto-detection trusts Plaid verbatim.** `/api/income/detect` forwards `stream.average_amount.amount` to the UI unvalidated. For Coreslab the stream returns $5,781 (a monthly aggregate) but the cadence is weekly — so the saved record encodes "$5,781 × 52 = $301K/year" when reality is "$1,927 × 52 = $100K/year". Same shape of bug will hit every future user whose bank/Plaid combination produces aggregate `average_amount` values. Fix is at the detect endpoint, not on Ryan's row.

2. **Three parallel recurrence vocabularies disagree.** The client save-mapper (`income.tsx`) collapses `semi-monthly → biweekly` and `quarterly → monthly`. The engine (`getIncomeInRange`) knows `weekly / biweekly / monthly / yearly` but has no `semimonthly` branch at all — unhandled recurrences fall into a bucket that emits the same income every day. The adapter layer (`income.ts`) knows the full set. Three vocabularies, three bugs, one fix: canonicalize the enum in one place and have every code path import it.

3. **Widgets exist without reliable engine support.** `/api/engine/*` returns 404 across the board from app.budgetsmart.io after the 2026-04-14 service split. Every page that shows an engine-derived number is either silently zeroed or has silently fallen back to legacy — meaning most UAT-8 findings that pointed at engine disagreements cannot be re-verified. The honest move for several widgets (Net Worth history, Days-until-next-income, Investment Gain/Loss, /debt-payoff) is to remove them until the engine is restored and reconciled, not to keep rendering numbers that happen to render.

UAT-8 issue count: 27 raised → **0 closed by code ship**, 8 confirmed still broken, 10 unverifiable (engine 404), 9 untouched this pass. UAT-8's "Wave 1" fixes never made it to production; the next launch window cannot open until that changes.

---

## Section A — Calculation engine consistency

### A1. Canonicalize the `recurrence` enum in one place (replaces #153, #154, UAT-9 semi-monthly fixes)

**Finding 168.** The recurrence vocabulary diverges across three files:

| Location                                            | Values                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| `client/src/pages/income.tsx:1146-1153` (save-map)  | `weekly, biweekly, "semi-monthly"→biweekly, monthly, quarterly→monthly, yearly` |
| `server/cash-flow.ts:298-310` (`getIncomeInRange`)  | `weekly, biweekly, monthly, yearly` — falls through to `addDays(+1)`   |
| `server/cash-flow.ts:175-184` (`getBillsInRange`)   | `one_time, weekly, biweekly, monthly, yearly`                          |
| `server/lib/financial-engine/income.ts:246+`        | `weekly, biweekly, semimonthly, monthly, quarterly, yearly, custom, irregular` |

Three consequences:
- Semi-monthly paychecks (Roche-shaped) get saved as biweekly and projected on wrong dates.
- Quarterly income is tripled because the save-map coerces to monthly.
- If a record is ever written with `recurrence="semimonthly"` (via the adapter path), `getIncomeInRange` emits it 365 times/year.

**Platform fix.** Define `shared/recurrence.ts` with a single exported enum + helper `expandRecurrence(record, startDate, endDate)`. Every consumer imports it. Delete the inline `recurrenceMap` in `income.tsx`. Delete the branches in `cash-flow.ts` and call the shared helper instead. No backfill needed because no data currently uses semimonthly/quarterly/custom in live records (confirmed: only "weekly" and "biweekly" in prod Income).

**Widget impact.** None. Same widgets keep rendering, with correct cadence.

---

### A2. Single forecast entry point (new architectural finding)

**Finding 169.** Two forecast paths exist: `generateCashFlowForecast` (in `server/cash-flow.ts`) and whatever the engine's forecast endpoint does (currently 404). The 30-day "Expected Income", "Expected Bills", "Lowest Projected Balance", "Days until low balance" numbers all come from the legacy path. When the engine comes back online, we must pick one and delete the other — or UAT-11 will have the same dual-source reconciliation bugs as UAT-8 #125 / #132 / #133.

**Platform fix.** Decision memo + deletion. Pick engine or legacy; port remaining features to the winner; delete the loser. Any "bridge" that keeps both alive is declined — bridges decay.

**Widget impact.** The Cash Flow page, Money Timeline, and dashboard "Days until next income" tile all consume this. They survive either way; they just read from one code path instead of two.

---

### A3. Engine routing — single source of truth (#152, UAT-8 #145, replaces per-endpoint patches)

**Finding 170.** `/api/engine/income`, `/expenses`, `/budgets`, `/bills`, `/transactions`, `/accounts`, `/dashboard`, `/kpis`, `/summary` — all return 404 from app.budgetsmart.io. `api.budgetsmart.io/engine/*` also 404s. The engine service split shipped 2026-04-14 succeeded in separating deploys but broke the path the web client uses.

**Platform fix.** One Express middleware in the app server: proxy `/api/engine/*` → `https://api.budgetsmart.io/...` with cookie forwarding. This is the fix that works for every account and every future deploy. Alternative (client calls api subdomain directly) requires CORS + credentials coordination and breaks Safari's ITP cookies — not recommended.

**Widget impact.** Without this, **any widget that depends on `/api/engine/*` is unreliable and should not be shipped.** Pairs with Section C below: we decide which widgets come back *after* the proxy ships and the engine is reachable.

---

### A4. Income adapter must not trust `stream.average_amount.amount` (#151 generalized)

**Finding 171.** `server/routes.ts:1330-1346` pushes Plaid's recurring-stream `average_amount.amount` directly into the detection response. For Coreslab this value is a *monthly aggregate* paired with a *weekly* cadence — because Plaid's inflow_stream model is aggregator-defined and inconsistent across institutions. Every user on Scotiabank/Plaid with a weekly paycheck will hit this same shape. The bug is at the adapter layer, not at Ryan's record.

**Platform fix.** In the adapter, replace the `amount: Math.abs(stream.average_amount?.amount || 0)` line with: pull the stream's last 4 transactions via `transactionsGet` and compute amount = median of those. Tag the detection response with `confidence: "high"` if the stream's own last 4 amounts are within 10% of each other, `confidence: "medium"` otherwise. `confidence: "low"` for early_detection streams or streams with <3 mature occurrences. Save-time handler persists confidence on the Income record (see A5/E below).

---

### A5. Save-time validation on Income POST (#150 generalized)

**Finding 172.** `/api/income` POST accepts any combination of `amount` + `recurrence` with no sanity check. The Coreslab shape (`$5,781 weekly`) implies $300K/year income — patently inconsistent with the user's own linked transactions. A simple validator catches the entire class of bug:

```ts
// Pseudocode
const recentMatching = await getRecentMatchingTransactions(userId, source, 90 /* days */);
const impliedWindow = cadenceWindowDays(recurrence);  // weekly=7, biweekly=14, etc
const observedAvg   = median(recentMatching.filter(t => within(t.date, impliedWindow))).amount;
if (amount > observedAvg * 1.5) return 422({ code: "AMOUNT_CADENCE_MISMATCH", observedAvg, suggestion: observedAvg });
```

Returns a 422 with a suggested amount and lets the UI prompt "This looks higher than your typical weekly paycheck ($1,927). Use the suggested amount?" — puts it into Section D (confidence surfacing) rather than silently saving the bad record.

**Platform fix.** Add validator + 422 handling to `/api/income` POST. Paired with A4 this means bad amounts cannot enter the system going forward.

**Backfill — Finding 173.** One-shot migration to correct existing bad records:

```sql
-- pseudocode, keyed on pattern not user
for each income r where r.notes like '%Added from bank detection%' and r.is_recurring='true'
  let tx = recent_matching_transactions(r.user_id, r.source, cadence_window(r.recurrence))
  let median_amount = median(abs(tx.amount))
  if abs(r.amount - median_amount) / median_amount > 0.2
    update income set amount = median_amount, confidence_flag='backfill_corrected' where id = r.id
    insert into income_audit(record_id, old_amount, new_amount, reason) values (...)
end
```

Runs once in prod. Fixes Ryan's row and every other user's auto-detected-gone-wrong rows in the same pass. Logs a per-row audit so support can explain changes to users if they ask.

**Widget impact.** The 30-Day Cash Flow "Expected Income" tile starts rendering correct numbers for everyone. Until both ships, the tile should carry a "Projected from auto-detected income — verify your sources on Income page" footer.

---

### A6. Biweekly bill cadence must be anchor-based, not `dueDay`-based (#155 generalized)

**Finding 174.** `getNextBillDate` for biweekly bills recomputes from `setDate(today, dueDay)` then walks forward by 14 until future. After the first emission, the cursor gets re-anchored to the monthly `dueDay`, producing alternating 14/16-day gaps. National Money + Easyfinancial both fire Apr 20 → May 2 → May 18 → Jun 1 (14, 16, 14, 16 days). Every biweekly bill with a `dueDay` set hits this.

**Platform fix.** Biweekly bills should never consult `dueDay`. Use `startDate` (or the first observed occurrence if auto-detected) as the anchor; each subsequent occurrence is `prior + 14` days, full stop. Remove the `setDate/dueDay` branch for biweekly entirely in `getNextBillDate`. No backfill needed — the data is fine; only the projection walk is wrong.

**Widget impact.** Cash Flow bill events render on correct dates. `totalExpectedBills` may shift by a bill or two in a given 30-day window.

---

### A7. Bills with `dueDay > 28` behave inconsistently across months (#165)

**Finding 175.** "Service Charge Monthly Fees" has `dueDay=31`. In April (30 days) `setDate(today, 31)` rolls forward into May 1. Same bill in February lands on March 3. Subtly wrong for every user who sets dueDay > 28.

**Platform fix.** `getNextBillDate` should clamp `dueDay` to `min(dueDay, lastDayOfMonth(targetMonth))` before calling `setDate`. One-line helper. Applies to all users.

---

## Section B — Auto-detection integrity

### B1. Detection provenance on every auto-saved record (#160 generalized)

**Finding 176.** Auto-saved Income records carry `notes: "Added from bank detection"` and nothing else. No pointer back to the Plaid stream ID, no detection timestamp, no confidence score. This makes every backfill migration *unsafe* — we have no way to know which records were auto-generated vs user-entered, or which stream/transactions each record was derived from.

**Platform fix.** New columns on `income` (and `bills`, for symmetry):
- `source: "plaid" | "ai" | "manual"` (required)
- `plaid_stream_id: text | null`
- `detection_confidence: "high" | "medium" | "low" | null`
- `detected_at: timestamp | null`
- `last_verified_at: timestamp | null`  (user tapped "looks right")
- `last_verified_by: "user" | "system" | null`

One migration adds columns. Adapter path writes them on save. Every subsequent backfill keys on `source='plaid' AND detection_confidence IN ('low','medium')`. Future audit/rollback becomes possible because we know what was auto-generated.

**Backfill — Finding 177.** Column-populator migration. For every existing Income/Bill record with `notes LIKE '%Added from bank detection%' OR '%Auto-imported%' OR '%Auto-detected%'`, set `source='plaid'`, `detection_confidence='medium'`, `detected_at=created_at`. Runs once, no user impact.

---

### B2. Compound idempotency for every Plaid insert (UAT-8 #131 generalized)

**Finding 178.** UAT-8 showed duplicate Plaid rows across income, bills, transactions, investments, liabilities — because the idempotency check keys on `plaidTransactionId` which is sometimes NULL on the second insert. Every user who has ever had a Plaid sync run with a transient failure has potential duplicates.

**Platform fix.** Compound unique constraint `(user_id, plaid_item_id, plaid_transaction_id, amount_cents, date)` on every Plaid-sourced table, enforced at the DB level (not just at application layer). Writer paths use `ON CONFLICT DO NOTHING`.

**Backfill — Finding 179.** One-shot dedup migration: for each Plaid-sourced table, keep the row with the highest `created_at` per compound key, delete the rest. Logs per-table counts. Done before the constraint is added so it doesn't fail on existing dupes.

---

### B3. Merchant name normalization, applied before any write (UAT-8 #137/#140, #156 generalized)

**Finding 180.** "Apos Tim Hortons", "Opos Plaid Inc.", "Fpos A&w", "Opos Ad Free For Primevid", "Primevideo Prime Video" — Plaid POS prefixes split one merchant into many rows across merchants list, bills list, subscriptions list. Every Plaid user gets this.

**Platform fix.** Central `normalizeMerchantName(raw): canonical` helper in a shared lib. Applied at every adapter write point (Plaid sync, manual entry, AI classification). The canonical name is what's stored; raw name kept in a `raw_name` column for traceability.

**Backfill — Finding 181.** One-shot normalization migration: recompute canonical names for every existing row; where two rows now collide in the bills/subscriptions table, merge them (sum amounts if it's clearly the same cadence, flag for manual review if amounts/cadences disagree). Logs merges.

---

## Section C — Widgets to remove (unreliable underlying data, not cheaply fixable)

The rule: if we can't ship a correct version of the widget in the next sprint, the widget is removed from the UI this sprint. Users see a smaller, truer dashboard rather than a larger, lying one.

| #     | Widget                                                                    | Why it's removed                                                                                                                                                                                                                                                                                                                                                                 | Return condition                                                              |
| ----- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **182** | Net Worth history / snapshots                                             | No `/api/engine/networth` or `/api/engine/accounts` endpoint exists (UAT-8 #145). Snapshots computed client-side will drift from anywhere else that calculates net worth. UAT-8 showed /net-worth page doubling Investments vs /accounts ($6.88 vs $3.44).                                                                                                                                                                | Engine exposes `/engine/networth` + `/engine/accounts`; both reconcile.       |
| **183** | /debt-payoff page                                                         | Shows "Total Debt $0" and empty state despite `/api/debts` having 4 rows totaling $1.18M (UAT-8 #146). The page filters out auto-created Plaid rows. Users without any manual debt see $0; avalanche/snowball calculator unusable.                                                                                                                                                                                 | /debt-payoff reads from `/api/debts` without the auto-row filter; debts table has merchant normalization + confidence.         |
| **184** | /liabilities "Manually Tracked" section                                   | Same four debts shown twice (UAT-8 #149). Total math is correct only because the second section doesn't sum into the total — pure UX confusion.                                                                                                                                                                                                                                                                    | Section stays removed — merge into "From Linked Accounts" with a `is_manual` badge. |
| **185** | Investments "Gain/Loss"                                                   | /investments reports $3.44 gain on $0 cost basis (UAT-8 #148) because brokerage cash exists. Every user with an investment account that has cash-only (no holdings) will see this. We don't have cost basis for most holdings.                                                                                                                                                                                                        | Cost basis populated via Plaid `investments_holdings` endpoint.               |
| **186** | Dashboard "Days until next income"                                        | Reads the first future Income event; with auto-detected records carrying wrong amounts + wrong anchors, the widget confidently reports the wrong number. Keeping it misleads users — especially those about to make spending decisions based on it.                                                                                                                                                                 | A4 + A5 ship and Income records all carry `detection_confidence='high'`.     |
| **187** | Duplicate Prime Video entries in Bills                                    | Per UAT-8 #140 and UAT-9 #156 the same vendor appears twice at $3.38. Removal happens during normalization backfill (B3) — the duplicate row is merged, not hidden.                                                                                                                                                                                                                                                  | Normalization migration runs; duplicate collapses automatically.              |
| **188** | Dashboard "Expected Income" tile (on the Cash Flow page, shows $30,757)    | Even after A4/A5 ship, the tile is projecting auto-detected income that the user may not have verified. Replace with: tile shows "Expected Income (from N verified sources)" with a secondary "+ $X projected (unverified)" row. Zero-verified users see the projected number with a "please verify your paychecks" CTA rather than a confident headline number.                                                                                                                          | A4 + A5 + D1 ship.                                                            |

Removal is preferred to the Silent-Money-Leaks style of filtering, because filters are bandaids that the next edge case walks through.

---

## Section D — Low-confidence flagging (replaces several "silent bad save" bugs)

### D1. Bank-detection review screen shows confidence + suggested amount (#151 UX)

**Finding 189.** The `/api/income/detect` review screen currently shows a single amount + frequency per detected source and an "Add" button. When Plaid's `average_amount` conflicts with the user's actual transactions (as with Coreslab), there's no signal to either the system or the user that something's off — the user taps "Add" and $5,781 weekly gets persisted.

**Platform UX.**
- Adapter returns `detected_amount`, `suggested_amount` (median of last 4), `amount_confidence` (high/medium/low).
- Review screen renders both amounts when they diverge >10%, with a prefilled radio on `suggested_amount` and copy: "Plaid reports $5,781 weekly. Your recent Coreslab paychecks average $1,927 weekly. Which one is right?"
- Low-confidence (<3 mature occurrences) sources get a yellow "new source, please verify" badge.
- Mature + consistent (top 3 match within 5%) sources get a green "confirmed" badge and a one-click "Add" path.

### D2. Duplicate-bill detection surfaces to user, not auto-suppresses

As part of merchant normalization (B3), when two bills normalize to the same canonical name, the UI shows a "likely duplicate" banner with a one-click "merge" action. We don't silently hide one row — users learn where Plaid duplicated their data.

### D3. Auto-categorization surfaces the uncertain categorizations

UAT-8 #128/#141 showed Plaid's income category defaulting to "Salary" for everything and bills defaulting to random categories (Bell Canada → Car). When the categorizer's top candidate has low confidence or falls back to "Salary"/"Other", flag the row with a "please confirm category" chip rather than silently writing the default.

---

## Section E — Migrations required (single-shot, platform-wide)

Every fix that corrects existing data is a migration, not an UPDATE. Listed here with the finding that triggered them:

| Migration                             | Triggered by                | What it does                                                                                                                                      | Safe to re-run? |
| ------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **M-1** Phase 2 registry seed         | UAT-8 #126                  | Ships income registry rows to prod Neon (per memory, supposedly shipped 2026-04-17; verifiably absent 2026-04-20 — `{sources:[]}`).                                                                 | Yes (idempotent) |
| **M-2** Provenance columns            | #176                        | `ALTER TABLE income/bills ADD COLUMN source, plaid_stream_id, detection_confidence, detected_at, last_verified_at, last_verified_by`.              | Yes             |
| **M-3** Provenance backfill           | #177                        | Populate provenance columns for existing auto-detected rows by parsing `notes` field.                                                              | Yes             |
| **M-4** Compound idempotency dedup    | #178, #179                  | Dedup Plaid-sourced tables to one row per compound key, keep highest `created_at`.                                                                | No (destructive)|
| **M-5** Compound unique constraint    | #178                        | `ADD CONSTRAINT unique_plaid_{table} UNIQUE (user_id, plaid_item_id, plaid_transaction_id, amount_cents, date)`.                                  | Yes             |
| **M-6** Merchant normalization        | #180, #181                  | Recompute canonical name per row; merge duplicates; log.                                                                                          | No (destructive)|
| **M-7** Income amount reconciliation  | #172, #173                  | For each `source='plaid' AND detection_confidence IN ('low','medium')` row, recompute amount from trailing 4 occurrences; update if delta > 20%. | Yes             |
| **M-8** Non-salary income reclassify  | UAT-8 #128                  | For each income row where category='Salary' AND source NOT LIKE '%payroll%', reclassify via rules + optional AI pass; log.                         | Yes             |
| **M-9** Subscriptions populator       | UAT-8 #139                  | Populate `subscriptions` table from `bills` where merchant in known-SaaS list OR recurrence='monthly' AND amount < $100 AND category in SaaS set.  | Yes             |
| **M-10** `is_recurring` boolean cast  | UAT-8 #129                  | `ALTER TABLE income ALTER COLUMN is_recurring TYPE boolean USING (is_recurring='true')`.                                                           | No (schema)    |

All ten run once in prod. After that, the prevention code changes (Section A) make sure nothing dirty gets written again.

---

## Section F — Fix sequence (platform-wide order of operations)

**Wave 1 (deployable today, no data migration):**
1. Ship engine routing proxy (#170). Restores `/api/engine/*` from the app domain.
2. Ship save-time validation on `/api/income` POST (#172).
3. Ship `/api/income/detect` recompute-from-transactions (#171).
4. Canonicalize recurrence enum into `shared/recurrence.ts` (#168) — code change, no data.
5. Fix biweekly bill anchor logic (#174) — code change, no data.
6. Fix `dueDay > 28` clamp (#175).

**Wave 2 (schema + backfill, in strict order):**
7. M-1 Phase 2 registry seed (already planned; ship it).
8. M-2 Provenance columns (schema add).
9. M-3 Provenance backfill.
10. M-7 Income amount reconciliation (needs M-2/M-3 to key on confidence).
11. M-8 Non-salary reclassification.
12. M-10 `is_recurring` boolean cast.

**Wave 3 (merchant + duplicate cleanup, most disruptive):**
13. M-6 Merchant normalization.
14. M-4 Plaid dedup.
15. M-5 Compound unique constraint.
16. M-9 Subscriptions populator.

**Wave 4 (UI re-introductions — widgets come back as engine supports them):**
17. Net Worth history (#182) — returns when engine exposes `/engine/networth`.
18. /debt-payoff (#183) — returns with debts table normalized + confidence-scored.
19. Investments Gain/Loss (#185) — returns when cost basis exists.
20. Dashboard "Days until next income" (#186) — returns when all Income records carry high confidence.
21. "Expected Income" tile gets its new two-line render (#188).

**Wave 5 (architecture):**
22. Single-forecast-engine decision (#169). Pick engine or legacy; delete the loser.

---

## Section G — UAT-8 regression check through the new lens

Re-classifying UAT-8's 27 findings by what kind of platform fix each requires:

| UAT-8 # | Live state | Platform-wide fix                              | Covered by this report |
| ------- | ---------- | ---------------------------------------------- | ---------------------- |
| 118     | Fixed      | Referral UI shipped                            | Done                   |
| 123     | Blocked    | Registry seed (M-1)                            | Wave 2                 |
| 124     | Unverifiable| Needs engine /api/engine/dashboard back       | Wave 1                 |
| 125     | Unverifiable| Pick single forecast path (#169)             | Wave 5                 |
| 126     | Not shipped| M-1 registry seed                            | Wave 2                 |
| 127     | Unfixed    | M-8 reclassification + D3 confidence chip     | Wave 2                 |
| 128     | Unfixed    | M-8 reclassification                          | Wave 2                 |
| 129     | Unfixed    | M-10 boolean cast                             | Wave 2                 |
| 130     | Unfixed    | M-4 dedup + B3 normalization                  | Wave 3                 |
| 131     | Unfixed    | M-5 compound unique constraint                | Wave 3                 |
| 132     | Unverifiable| Pick single forecast path (#169)             | Wave 5                 |
| 133     | Unverifiable| Pick single forecast path (#169)             | Wave 5                 |
| 134     | Partially fixed| API returns numbers; UI binding patch on /budgets | Wave 1 (separate PR) |
| 135     | Unverifiable| Engine parity (#170)                          | Wave 1                 |
| 136     | Unverifiable| Pick single forecast path (#169)             | Wave 5                 |
| 137     | Unfixed    | B3 normalization                              | Wave 3                 |
| 138     | Fixed      | `/api/bills` now returns 20 matching UI count | —                      |
| 139     | Unfixed    | M-9 subscriptions populator                   | Wave 3                 |
| 140     | Unfixed    | B3 normalization                              | Wave 3                 |
| 141     | Unfixed    | Add SaaS category + D3 confidence chip        | Wave 2                 |
| 142     | Not checked| Surfacing: show Plaid item.status banner     | Wave 4 (small)         |
| 143     | Not checked| UX: over-limit red banner on credit accounts | Wave 4 (small)         |
| 144     | Latent     | Currency-aware aggregation in /accounts rollup| Wave 4                 |
| 145     | Worse      | Engine routing (#170) + Section C removals   | Wave 1 + Wave 4        |
| 146     | Unfixed    | Debts dedup + normalization; then reintro    | Wave 3 + Wave 4        |
| 147     | Unfixed    | Investment dedup at account level            | Wave 3                 |
| 148     | Unfixed    | Remove until cost basis populated (#185)     | Wave 4                 |
| 149     | Unfixed    | Remove duplicate section (#184)              | Section C              |

**Summary:** Every UAT-8 finding has an identifiable platform-wide fix in this plan. Zero require per-account UPDATEs. Zero are dropped.

---

## Section H — Raw API evidence (preserved from UAT-9 investigation)

**/api/reports/cash-flow-forecast?days=30 summary:**
```
totalExpectedIncome:    $30,757.42   ← projected, not accumulated. Corrected projection ≈ $15,344.
totalExpectedBills:     $1,392.90    ← sums 22 events; 20 unique bills; biweekly doubles account for the 2 extra.
totalPredictedSpending: $8,384.10
averageDailySpending:   $279.47
lowestProjectedBalance: $2,461.06 on 2026-04-23
daysUntilLowBalance:    null         ← null only because projected income rescues the balance; corrected forecast may flip this.
```

**/api/income Coreslab record (auto-detected, mid-bug):**
```json
{"source":"Payroll Deposit CORESLAB INTERNATIONAL IN","amount":"5781.08","recurrence":"weekly",
 "date":"2026-04-17","isRecurring":"true","notes":"Added from bank detection"}
```

**Actual Coreslab transactions (6 most recent):**
```
2026-04-15  −$1,926.63          2026-03-25  −$1,927.82
2026-04-08  −$1,926.63          2026-03-18  −$1,927.82
2026-04-01  −$1,927.82          2026-03-11  −$1,927.82
```

**/api/income/registry:** `{"sources": []}` — M-1 still hasn't shipped.

**/api/subscriptions:** `[]` — M-9 still hasn't shipped.

**/api/engine/*:** all 404 — Wave 1 step 1 blocks everything else.

**/api/debts:** 4 rows, total $1,195,026 — M-5 + Section C-183 required before /debt-payoff returns.

**/api/bills:** 20 rows, sum of |amount| = $1,201.74. 30-day forecast emits 22 events (National Money + Easyfinancial fire biweekly twice each in window). Delta $191.16 = $109.77 + $81.39.

---

## Closing note

No finding in this report proposes that someone log into Neon and hand-edit Ryan's records. Every bug has a code change, a migration, or a removal that applies to every account. When Budget Smart AI has 1,000 customers, this plan executes the same way it executes for 1.
