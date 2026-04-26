# §6.3.2 + §6.3.3 — Cross-provider transfer-pair + refund-link rollout

**Status:** Code-complete on disk in `C:\Users\Claude\Documents\Budget-Smart-AI`. Awaiting migration apply + Cline commit + push. Closes the §6.3 arc.

**One bundled commit recommended.** Two migrations (0042, 0043), two new matcher modules, Plaid sync cutover (deletes the old Plaid-only detector), MX + manual-tx wire-ins, schema additions, and one cleanup (drops `TRANSFER_CATEGORY_KEYWORDS`).

---

## What this ships

### §6.3.2 — auto pair-matching for cross-account transfers

Replaces the Plaid-only `detectTransferPairs` function (which only paired Plaid↔Plaid) with a unified cross-provider matcher that handles every combination of Plaid / MX / manual transactions.

**Why it matters:** any user with an MX-connected institution OR who logs manual transactions previously got zero auto pair-matching. A common workflow ("I record a manual transfer-out, Plaid syncs the matching transfer-in two days later") was producing two unlinked rows that the engine treated as real spending.

### §6.3.3 — refund-to-charge linking

Net new capability. Detects refunds (intra-account credits matching a prior debit on the same account, same merchant, amount ≤ original charge, within 90 days) and links them via `refund_of_transaction_id`. Lets downstream surfaces (spending totals, category-comparison reports, AI snapshot) net refunds against their charges instead of double-counting.

### §6.3 cleanup

Drops the legacy `TRANSFER_CATEGORY_KEYWORDS` keyword set + `isTransferCategoryByKeyword` function from `server/lib/financial-engine/expenses.ts`. The canonical resolver is now trusted across all sync paths, so the keyword fallback is dead defense-in-depth.

---

## Files touched

```
NEW  migrations/0042_transfer_pair_id_cross_provider.sql       (~50 lines)
NEW  migrations/0043_refund_of_transaction_id.sql              (~50 lines)
NEW  server/lib/transfer-pair-matcher.ts                       (~200 lines)
NEW  server/lib/refund-matcher.ts                              (~180 lines)

MOD  shared/schema.ts                                          (+10 lines across 3 tx tables)
MOD  server/plaid.ts                                           (-95 lines old detectTransferPairs, +5 import/wire-in)
MOD  server/mx.ts                                              (+15 lines: imports + wire-in)
MOD  server/routes.ts                                          (+30 lines: 2 wire-ins after manual tx create + bulk import)
MOD  server/lib/financial-engine/expenses.ts                   (-30 lines: drop TRANSFER_CATEGORY_KEYWORDS + isTransferCategoryByKeyword)
```

Net: ~+400 lines new, ~-125 lines deleted. One coherent §6.3 ship.

---

## Migration application order

**Critical: apply migrations to Neon BEFORE pushing the code commit.** Per `reference_railway_deploy_checklist.md` — code references columns that don't exist yet will 500.

Both migrations are idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) and ship in their own transactions. Apply order: 0042 then 0043 (no interdependencies, but maintain numeric order).

Recommended: open the Neon SQL editor for prod and run:

```sql
-- 0042 — transfer_pair_id on mx + manual
\i migrations/0042_transfer_pair_id_cross_provider.sql

-- 0043 — refund_of_transaction_id on all 3
\i migrations/0043_refund_of_transaction_id.sql
```

Or via Drizzle if `drizzle-kit migrate` is wired up. Verify post-apply:

```sql
-- Should return both new columns on each table
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_name IN ('plaid_transactions','mx_transactions','manual_transactions')
  AND column_name IN ('transfer_pair_id','refund_of_transaction_id')
ORDER BY table_name, column_name;
```

Expected output: 6 rows (3 tables × 2 columns each — note `plaid_transactions.transfer_pair_id` already existed pre-0042 but the column is unchanged so it stays in the result set).

---

## Implementation details

### `server/lib/transfer-pair-matcher.ts`

Single exported function: `matchTransferPairs(userId): Promise<number>`.

**Algorithm:**
1. Query all 3 tx tables (`plaid_transactions`, `mx_transactions`, `manual_transactions`) `UNION ALL`'d, scoped to the given user, filtered to rows that are: active, not already flagged as transfers, not already paired.
2. Skip rows whose `canonical_category_id` is already classified as non-spending (`isNonSpendingCanonical` from §6.3.1) — those are pre-handled.
3. Group remaining rows by absolute amount (rounded to 2 decimals).
4. For each amount group, find debit/credit pairs across **different accounts** (same-account pairs are likely refunds — that's §6.3.3's job) within ±2 days.
5. Greedy match in date order: each row pairs at most once.
6. Write `transfer_pair_id` (uuid) + `is_transfer` flag to the source table. Plaid additionally gets `match_type='transfer'` + `reconciled='true'`; MX gets the same; manual just gets the boolean + pair id.

**Sign convention:** `amount > 0` = debit (money out), `amount < 0` = credit (money in). Adapters guarantee this across all 3 sources.

**Out of scope (flagged for future):**
- FX transfers (different amounts due to currency conversion)
- Multi-leg transfers where one leg is at an external bank we can't see
- Cross-table refund linking (e.g. manual charge + Plaid refund — refunds always come from the same provider as the charge)

### `server/lib/refund-matcher.ts`

Single exported function: `matchRefunds(userId): Promise<number>`.

**Algorithm (per provider table, per user):**
1. Find unlinked refund candidates: `amount < 0`, `refund_of_transaction_id IS NULL`, not flagged as transfer, not classified as non-spending.
2. For each candidate, look up the most recent prior debit on the **same account** where:
   - merchant matches (case-insensitive equality on `COALESCE(merchant_clean_name, merchant|description|name)`)
   - debit amount ≥ |refund amount| (partial refunds allowed)
   - debit date ≤ refund date AND refund date − debit date ≤ 90 days
   - debit isn't already linked as a refund target by another row
3. Pick the largest matching debit (so a partial refund hits the original full charge first).
4. Set `refund_of_transaction_id` on the refund row.

**Why intra-table only:** refunds always come from the same provider as the original charge. Cross-table cases (rare, e.g. user manually entered a charge then got a Plaid-synced refund) need manual linking — out of scope.

### Wire-in points

| Sync trigger | File | Where | Behavior |
|---|---|---|---|
| Plaid `/transactions/sync` | `server/plaid.ts` | After `[Plaid Sync] Complete` log, before `autoReconcile` | Both matchers fire if `addedCount > 0 \|\| modifiedCount > 0`, fire-and-forget |
| MX `/transactions` page sync | `server/mx.ts` | After `[MX Sync] Complete` log | Both matchers fire if `addedCount > 0 \|\| updatedCount > 0`, fire-and-forget |
| Manual tx POST | `server/routes.ts` `/api/transactions/manual` | After `createManualTransaction` returns | Both matchers fire, fire-and-forget |
| Manual tx CSV import | `server/routes.ts` `/api/transactions/manual/import/:accountId` | After the loop, if `results.imported > 0` | Both matchers fire once per batch, not per row |

All four wire-ins use `import()` (manual-tx routes) or top-level imports (sync paths) and `.catch()` to log errors without rejecting the parent promise.

### `expenses.ts` cleanup

`isTransferTransaction` simplified from 3-step chain to 2-step:

```ts
function isTransferTransaction(tx: NormalizedTransaction): boolean {
  if (tx.isTransfer) return true;
  if (isTransferCanonical(tx.canonicalCategoryId)) return true;
  return false;
}
```

The dropped `isTransferCategoryByKeyword(tx.category)` step was a defense-in-depth fallback that was redundant after Phase A — every row now has a `canonicalCategoryId` set by the adapter via the resolver, and the legacy keyword check could only fire on rows the canonical-id check already caught.

---

## Cline prompt

**Goal:** Apply 2 migrations to Neon prod, then commit and push the §6.3.2 + §6.3.3 + cleanup as one bundled commit.

**Steps:**

1. **Apply migrations to Neon prod first:**
   ```bash
   # Via Neon SQL editor or psql:
   psql $DATABASE_URL -f migrations/0042_transfer_pair_id_cross_provider.sql
   psql $DATABASE_URL -f migrations/0043_refund_of_transaction_id.sql
   ```
   Then verify:
   ```bash
   psql $DATABASE_URL -c "
     SELECT table_name, column_name FROM information_schema.columns
     WHERE table_name IN ('plaid_transactions','mx_transactions','manual_transactions')
       AND column_name IN ('transfer_pair_id','refund_of_transaction_id')
     ORDER BY table_name, column_name;"
   ```
   Should return 6 rows.

2. **Verify code edits on disk:**
   ```bash
   git status
   git diff --stat
   ```
   Expected files modified: `shared/schema.ts`, `server/plaid.ts`, `server/mx.ts`, `server/routes.ts`, `server/lib/financial-engine/expenses.ts`. Expected new files: `migrations/0042_*.sql`, `migrations/0043_*.sql`, `server/lib/transfer-pair-matcher.ts`, `server/lib/refund-matcher.ts`, `PHASE_6_3_HANDOFF.md`.

3. **Sanity scans:**
   ```bash
   # No more references to the deleted detectTransferPairs function:
   git grep -n 'detectTransferPairs' -- server/
   # Should return zero hits.

   # No more references to the dropped TRANSFER_CATEGORY_KEYWORDS:
   git grep -n 'TRANSFER_CATEGORY_KEYWORDS\|isTransferCategoryByKeyword' -- server/
   # Should return zero hits in code (only allowed in MONARCH_VS_BSAI.md historical doc).

   # New matcher imports wired correctly:
   git grep -n 'matchTransferPairs\|matchRefunds' -- server/
   # Should return: matcher modules + plaid.ts + mx.ts + routes.ts (4 wire-in sites).
   ```

4. **Pre-push gate:**
   ```bash
   npm run check
   npm run build
   ```
   Both must pass clean. The matchers use raw `pool.query` so don't depend on Drizzle types beyond what's already there. If `check` complains about anything in the touched files, paste the error.

5. **Commit:**
   ```
   feat(§6.3): cross-provider transfer-pair + refund-to-charge linking

   §6.3.2 — auto pair-matching for cross-account transfers:
     Replaces Plaid-only detectTransferPairs (server/plaid.ts) with a
     unified server/lib/transfer-pair-matcher.ts that queries all 3 tx
     tables (plaid, mx, manual) UNION ALL'd. Pairs debit/credit across
     different accounts, ±2 day window, same |amount|, skipping rows
     already classified as non-spending via §6.3.1 canonical-flags.
     Wired into Plaid sync, MX sync, manual-tx POST, manual-tx CSV import.

   §6.3.3 — refund-to-charge linking:
     New server/lib/refund-matcher.ts. For each unlinked credit, finds
     the most recent prior debit on the same account with matching
     merchant + amount >= |refund amount| within 90 days, links them
     via refund_of_transaction_id. Intra-table only (refunds always come
     from the same provider as the original charge). Wired into the same
     four sync points as §6.3.2.

   Schema:
     - migration 0042: transfer_pair_id uuid on mx + manual + partial idx
     - migration 0043: refund_of_transaction_id varchar on all 3 + partial idx
     - shared/schema.ts: same column adds in Drizzle definitions

   Cleanup:
     - Removes TRANSFER_CATEGORY_KEYWORDS set and isTransferCategoryByKeyword
       function from financial-engine/expenses.ts. Defense-in-depth that's
       now redundant — every row has either tx.isTransfer or a canonical
       category id, both of which are caught earlier in isTransferTransaction.
     - Removes randomUUID import from plaid.ts (only used by the deleted
       detectTransferPairs function).

   Migrations applied to Neon prod before push. Plaid + MX + manual-tx
   sync paths now fire both matchers fire-and-forget after every
   transaction insert/update. Pre-launch with regenerable data; no
   backfill needed because matchers re-run on subsequent syncs and pair
   any historical rows naturally.

   Closes the §6.3 arc — see PHASE_6_3_HANDOFF.md for the full design,
   wire-in map, and visual walkthrough script.
   ```

6. **Push:**
   ```bash
   git push origin main
   ```

7. **Post-deploy verification:**
   - Tail Railway logs for ~60s after deploy. Should see:
     - `[Plaid Sync] Complete...` (your normal sync)
     - `[TransferPairMatcher] Found N transfer pair(s) for user ...` (if you have unpaired transfers)
     - `[RefundMatcher] Linked N refund(s) for user ...` (if you have unmatched refunds)
   - ZERO occurrences of `column "transfer_pair_id" does not exist` or `column "refund_of_transaction_id" does not exist`.
   - Existing IncomeDetector + AI Teller logs should still appear normally.

---

## UAT-14 visual walkthrough (post-deploy)

When deploy is green, verify in the UI:

### Transfer pairs

- **Bank Accounts page** — each account shows its real balance (transfers should be excluded from spending, so this isn't directly a UI change but you should see consistent numbers across pages)
- **Reports → Top Merchants / Category Comparison** — internal transfer counterparts (e.g. "Transfer to Savings" + "Transfer from Chequing") should NOT appear in spending totals
- **AI Teller → Match Transfer surface** (if exposed in UI) — should show fewer pending pair candidates (auto-matcher caught most)
- **Database spot-check** (Neon SQL editor):
  ```sql
  SELECT
    'plaid' AS source, COUNT(*) FILTER (WHERE transfer_pair_id IS NOT NULL) AS paired
    FROM plaid_transactions
   WHERE plaid_account_id IN (SELECT id FROM plaid_accounts WHERE plaid_item_id IN
         (SELECT id FROM plaid_items WHERE user_id = (SELECT id FROM users WHERE email = 'ryan.mahabir@outlook.com')))
  UNION ALL
  SELECT 'mx',     COUNT(*) FILTER (WHERE transfer_pair_id IS NOT NULL) FROM mx_transactions WHERE mx_account_id IN
         (SELECT id FROM mx_accounts WHERE mx_member_id IN (SELECT id FROM mx_members WHERE user_id = (SELECT id FROM users WHERE email = 'ryan.mahabir@outlook.com')))
  UNION ALL
  SELECT 'manual', COUNT(*) FILTER (WHERE transfer_pair_id IS NOT NULL) FROM manual_transactions
   WHERE user_id = (SELECT id FROM users WHERE email = 'ryan.mahabir@outlook.com');
  ```
  After the next Plaid sync this should return non-zero pair counts if you've ever moved money between your accounts.

### Refunds

- **Expenses page** — refunded charges should appear with the original debit amount but visually flagged as "(refunded)" or similar (UI work for this is downstream — for now the data is just linked at DB level)
- **Spending totals** — should drop by the sum of linked refund amounts
- **Database spot-check:**
  ```sql
  SELECT id, date, amount, merchant_clean_name, refund_of_transaction_id
    FROM plaid_transactions
   WHERE refund_of_transaction_id IS NOT NULL
   ORDER BY date DESC
   LIMIT 10;
  ```
  If you have any retailer refunds in the last 90 days they should show up here after the next sync.

### Empty-state pass

- Open a fresh test account with no transactions — every page should still load without crashing. Matchers no-op when there are no candidate rows.

### Click-every-button pass

- Bank Accounts, Expenses, Bills, Income, Forecast, Reports (every pill), AI Chat, AI Advisor — confirm no regressions from the schema additions.

---

## Open follow-ups (deferred — out of §6.3 scope)

- **UI surfacing of refunds** — the data link exists in DB but no UI yet. Could show "(refund of $X charge on YYYY-MM-DD)" inline on the refund row.
- **FX-aware transfer matching** — international transfers with currency conversion need ±2-3% tolerance on amount + iso_currency_code matching.
- **Manual unpair flow** — a user might want to undo a false-positive pair. Currently they'd need to manually NULL the transfer_pair_id in the DB.
- **Plaid `INTERNAL_SERVER_ERROR` on Scotia refresh** — still parked, separate from §6.3 work.
- **Forecast snapshot cutover** — `/api/ai/forecast` still rolls own income pipeline (last surface not on `getHouseholdFinancialSnapshot`).

---

*End of handoff. Migrations + 4 modules + 4 wire-ins + 1 cleanup, all on disk and ready for one Cline commit when you're back.*
