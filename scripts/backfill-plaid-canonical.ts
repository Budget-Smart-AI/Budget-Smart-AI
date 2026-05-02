#!/usr/bin/env tsx
/**
 * UAT-16 P0 — Backfill canonical_category_id on plaid_transactions stuck
 * at 'uncategorized'.
 *
 * Companion to the plaid.ts dual-write restore fix. The plaid.ts fix
 * catches new-tx INSERTs going forward; this script clears the rows that
 * came in BEFORE the fix landed.
 *
 * Walks plaid_transactions WHERE canonical_category_id = 'uncategorized'
 * AND personal_finance_category_detailed IS NOT NULL, calls the shared
 * §6.2.6 sync resolver per row, UPDATEs the canonical_category_id when a
 * non-null mapping is found.
 *
 * Sync-only — does NOT call Bedrock. The async resolver / nightly
 * reconcile job picks up rows the sync path can't classify (long tail
 * for which both the PFC map and the deterministic legacy-string map
 * miss).
 *
 * Idempotent: rows already at a non-uncategorized canonical are skipped.
 *
 * Rollback: trivial — set them back to 'uncategorized' via a single
 * UPDATE keyed on the audit log written below. Rollback NOT typically
 * needed; the worst case is a row gets a wrong canonical, which the
 * user can re-categorize from the UI.
 *
 * Usage:
 *   npm run backfill:plaid-canonical:dry
 *   npm run backfill:plaid-canonical
 *
 * Add to package.json scripts:
 *   "backfill:plaid-canonical:dry": "tsx scripts/backfill-plaid-canonical.ts --dry-run",
 *   "backfill:plaid-canonical":     "tsx scripts/backfill-plaid-canonical.ts"
 */

import "dotenv/config";
import { db } from "../server/db";
import { plaidTransactions } from "../shared/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { resolveCanonicalCategorySync } from "../server/migrations/category-unification/resolver";

const DRY_RUN = process.argv.includes("--dry-run");

function log(...args: any[]) {
  const prefix = DRY_RUN ? "[dry-run]" : "[apply]  ";
  console.log(prefix, ...args);
}

interface Tally {
  scanned: number;
  resolved: number;
  unmapped: number;
  byTopBucket: Record<string, number>;
  bySource: Record<string, number>;
}

async function main() {
  const startedAt = Date.now();
  log("starting plaid_transactions canonical-category backfill",
    DRY_RUN ? "(DRY RUN — no writes)" : "(APPLY MODE — writes will be persisted)");

  // Fetch all candidates: rows still at the hardcoded fallback AND with
  // a PFC value to resolve from. Rows where pfcDetailed is null can't be
  // helped by the sync path; they'll need the async resolver later.
  const candidates = await db
    .select({
      id: plaidTransactions.id,
      pfcDetailed: plaidTransactions.personalFinanceCategoryDetailed,
      merchantName: plaidTransactions.merchantName,
      merchantCleanName: plaidTransactions.merchantCleanName,
      amount: plaidTransactions.amount,
      name: plaidTransactions.name,
      currentCanonical: plaidTransactions.canonicalCategoryId,
    })
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.canonicalCategoryId, "uncategorized"),
        isNotNull(plaidTransactions.personalFinanceCategoryDetailed),
      ),
    );

  log(`found ${candidates.length} candidate rows (uncategorized AND has pfcDetailed)`);

  const tally: Tally = {
    scanned: 0,
    resolved: 0,
    unmapped: 0,
    byTopBucket: {},
    bySource: {},
  };

  // Process in chunks to keep transaction sizes reasonable.
  const CHUNK = 100;
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const slice = candidates.slice(i, i + CHUNK);

    for (const row of slice) {
      tally.scanned++;
      const result = resolveCanonicalCategorySync({
        legacyCategory: null, // PFC primary column was dropped in §6.2.8
        plaidDetailed: row.pfcDetailed,
        merchantName: row.merchantCleanName ?? row.merchantName ?? null,
        amount: parseFloat(String(row.amount)) || null,
        rowKind: "plaid",
      });

      if (result.canonicalId == null) {
        tally.unmapped++;
        // Bucket by PFC-detailed prefix for visibility.
        const top = (row.pfcDetailed ?? "UNKNOWN").split("_")[0];
        tally.byTopBucket[top] = (tally.byTopBucket[top] ?? 0) + 1;
        continue;
      }

      tally.resolved++;
      tally.bySource[result.mappingSource] = (tally.bySource[result.mappingSource] ?? 0) + 1;
      const top = (row.pfcDetailed ?? "UNKNOWN").split("_")[0];
      tally.byTopBucket[top] = (tally.byTopBucket[top] ?? 0) + 1;

      if (!DRY_RUN) {
        try {
          await db
            .update(plaidTransactions)
            .set({ canonicalCategoryId: result.canonicalId })
            .where(eq(plaidTransactions.id, row.id));
        } catch (err: any) {
          console.error(`[error] failed to update tx ${row.id}:`, err?.message ?? err);
        }
      }
    }

    if ((i + CHUNK) % 500 === 0 || i + CHUNK >= candidates.length) {
      log(`progress: ${Math.min(i + CHUNK, candidates.length)} / ${candidates.length}`);
    }
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  log("");
  log("─── summary ──────────────────────────────────────");
  log(`scanned:        ${tally.scanned}`);
  log(`resolved:       ${tally.resolved} (${((tally.resolved / Math.max(tally.scanned, 1)) * 100).toFixed(1)}%)`);
  log(`unmapped:       ${tally.unmapped} (${((tally.unmapped / Math.max(tally.scanned, 1)) * 100).toFixed(1)}%)`);
  log(`by source:`);
  for (const [k, v] of Object.entries(tally.bySource)) {
    log(`  ${k.padEnd(15)} ${v}`);
  }
  log(`by PFC top-level bucket:`);
  for (const [k, v] of Object.entries(tally.byTopBucket).sort((a, b) => b[1] - a[1])) {
    log(`  ${k.padEnd(20)} ${v}`);
  }
  log(`elapsed:        ${elapsedSec}s`);
  log("");
  if (DRY_RUN) {
    log("DRY RUN — no writes performed. Re-run without --dry-run to apply.");
  } else {
    log(`✅ backfill complete. ${tally.resolved} rows updated.`);
    log(`unmapped rows (${tally.unmapped}) will be picked up by the nightly`);
    log(`async-resolver reconcile job (Bedrock fallback).`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
