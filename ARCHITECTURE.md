# Budget Smart AI — Architecture Guide

## §6.2.x — Canonical Categories: COMPLETE (2026-04-25)

The canonical-category unification arc replaced the legacy per-table `category`
text columns with a single `canonical_category_id` FK referencing the
`canonical_categories` table. Every read path, write path, and UI surface now
uses this single source of truth.

### Commit chain

| Phase | Description | Commit(s) |
|-------|-------------|-----------|
| §6.2.4 | Schema foundation — `canonical_categories` table + `canonical_category_id` FK columns | Earlier session |
| §6.2.5 | Backfill orchestrator — 23,083 rows, 100% coverage | Earlier session |
| §6.2.6 | Dual-write hooks — new writes populate both legacy + canonical | Earlier session |
| §6.2.7 | Read-path cutover (Phases A → C) | `f15e6b9` (A) → `7d80a1c` (B) → `82cfcbb` (B.5) → `4247ee1` (C) |
| §6.2.8 | Column drop (Phase D) — migration 0041 drops legacy columns | Cline batch (Phase D) → `17580f9` (morning fixes) |
| Post-§6.2.x | Stale-code sweep — delete `categoryResolver`, verify storage methods | This commit |

### Outstanding manual steps

- ~5 budgets per beta account (`ryan.mahabir@outlook.com`, `rmahabir@coreslab.com`)
  show "Uncategorized" because migration 0041 collapsed their legacy category
  string into the uncategorized bucket. These need manual UI correction:
  Budgets page → edit → pick correct canonical category → save.

### Key files (post-cleanup)

- **`client/src/lib/canonical-categories.ts`** — Client-side hooks:
  `useCategoryMap()`, `getCategoryDisplayName()`, `getCategoryColor()`,
  `useExpenseCategories()`, `useBillCategories()`, `useIncomeCategories()`
- **`shared/schema.ts`** — `canonical_categories` Drizzle table definition +
  `EXPENSE_CATEGORIES` / `INCOME_CATEGORIES` / `BILL_CATEGORIES` enums
  (retained as validation allowlists for CSV import and legacy dropdown paths)
- **`server/storage.ts`** — `createPlaidTransaction` upsert uses
  `COALESCE(plaid_transactions.canonical_category_id, $new)` to preserve
  user/AI corrections on Plaid re-sync
- **`server/plaid.ts:316`** — Existing-tx update passes
  `canonicalCategoryId: existing.canonicalCategoryId ?? null` (COALESCE
  semantics — sync-driven updates never overwrite user corrections)
- **`server/mx.ts`** — MX upsert uses same COALESCE pattern

### Deleted in this sweep

- `shared/categoryResolver.ts` — `getEffectiveCategory()` and
  `getEffectiveCategoryBucket()` had no remaining callers after
  `bank-accounts.tsx` was migrated to `getCategoryColor()` from
  `canonical-categories.ts`.

### What §6.3 depends on

The §6.3 transfer/refund work assumes:
1. `canonical_category_id` is the **only** category source in the DB
2. No legacy `category` text column exists on any transaction table
3. The `COALESCE` pattern in upserts is stable (user corrections survive syncs)
