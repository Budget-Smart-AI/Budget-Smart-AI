#!/usr/bin/env tsx
/**
 * UAT-10 #177 — Provenance backfill for existing auto-detected income + bills.
 *
 * Runs once. Populates the #176 columns on historical rows so the #173 amount
 * backfill (next script) can key on detection_source + detection_confidence
 * instead of text-matching the `notes` field.
 *
 * Idempotent: skips rows where detection_source IS NOT NULL. Running twice
 * updates zero rows on the second pass.
 *
 * Usage:
 *   npm run backfill:provenance:dry      # print what would change, commit nothing
 *   npm run backfill:provenance          # actually write the updates
 *
 * Environment:
 *   DATABASE_URL must point at the target Neon branch. In prod, export the
 *   prod URL explicitly for this run; don't rely on whatever .env defaults to.
 */

import "dotenv/config";
import { db } from "../server/db";
import { income, bills } from "../shared/schema";
import { and, or, eq, ilike, isNull } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");

function log(label: string, ...rest: any[]) {
  const prefix = DRY_RUN ? "[dry-run]" : "[apply]";
  console.log(prefix, label, ...rest);
}

async function backfillIncome(): Promise<{ scanned: number; updated: number; skipped: number }> {
  // Match pattern: any row that looks auto-detected AND hasn't been tagged yet.
  const candidates = await db
    .select({
      id: income.id,
      userId: income.userId,
      source: income.source,
      autoDetected: income.autoDetected,
      detectedAt: income.detectedAt,
      detectionSource: income.detectionSource,
      notes: income.notes,
    })
    .from(income)
    .where(
      and(
        isNull(income.detectionSource), // idempotency gate
        or(
          eq(income.autoDetected, true),
          ilike(income.notes, "%Added from bank detection%"),
          ilike(income.notes, "%Auto-imported%"),
          ilike(income.notes, "%Auto-detected%"),
        ),
      ),
    );

  log(`income: ${candidates.length} candidate rows`);

  let updated = 0;
  let skipped = 0;
  const now = new Date();

  for (const row of candidates) {
    const patch = {
      detectionSource: "plaid" as const,
      detectionConfidence: "medium" as const,
      autoDetected: true,
      detectedAt: row.detectedAt ?? now,
      // detectionRef + detectionRefType stay NULL — we don't have stream_ids
      // on historical rows and guessing would be worse than honest NULL.
    };

    if (DRY_RUN) {
      log(
        `  would update income[${row.id}] user=${row.userId.slice(0, 8)}… source="${row.source}"`,
        `detectedAt=${patch.detectedAt.toISOString()}`,
      );
      updated++;
      continue;
    }

    try {
      await db.update(income).set(patch).where(eq(income.id, row.id));
      updated++;
    } catch (err) {
      console.error(`  ❌ income[${row.id}] update failed:`, err);
      skipped++;
    }
  }

  return { scanned: candidates.length, updated, skipped };
}

async function backfillBills(): Promise<{ scanned: number; updated: number; skipped: number }> {
  const candidates = await db
    .select({
      id: bills.id,
      userId: bills.userId,
      name: bills.name,
      autoDetected: bills.autoDetected,
      detectedAt: bills.detectedAt,
      detectionSource: bills.detectionSource,
      notes: bills.notes,
    })
    .from(bills)
    .where(
      and(
        isNull(bills.detectionSource),
        or(
          eq(bills.autoDetected, true),
          ilike(bills.notes, "%Added from bank detection%"),
          ilike(bills.notes, "%Auto-imported%"),
          ilike(bills.notes, "%Auto-detected%"),
        ),
      ),
    );

  log(`bills: ${candidates.length} candidate rows`);

  let updated = 0;
  let skipped = 0;
  const now = new Date();

  for (const row of candidates) {
    const patch = {
      detectionSource: "plaid" as const,
      detectionConfidence: "medium" as const,
      autoDetected: true,
      detectedAt: row.detectedAt ?? now,
    };

    if (DRY_RUN) {
      log(
        `  would update bills[${row.id}] user=${row.userId.slice(0, 8)}… name="${row.name}"`,
        `detectedAt=${patch.detectedAt.toISOString()}`,
      );
      updated++;
      continue;
    }

    try {
      await db.update(bills).set(patch).where(eq(bills.id, row.id));
      updated++;
    } catch (err) {
      console.error(`  ❌ bills[${row.id}] update failed:`, err);
      skipped++;
    }
  }

  return { scanned: candidates.length, updated, skipped };
}

async function main() {
  console.log("━".repeat(72));
  console.log(`UAT-10 #177 — Provenance backfill`);
  console.log(`mode: ${DRY_RUN ? "DRY RUN (no writes)" : "APPLY (writes committed)"}`);
  console.log(`target: ${process.env.DATABASE_URL?.split("@")[1] ?? "(unknown)"}`);
  console.log("━".repeat(72));

  const started = Date.now();

  const incomeStats = await backfillIncome();
  const billsStats = await backfillBills();

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log("━".repeat(72));
  console.log("Summary:");
  console.log(`  income:  scanned=${incomeStats.scanned} updated=${incomeStats.updated} skipped=${incomeStats.skipped}`);
  console.log(`  bills:   scanned=${billsStats.scanned} updated=${billsStats.updated} skipped=${billsStats.skipped}`);
  console.log(`  elapsed: ${elapsed}s`);
  console.log(`  mode:    ${DRY_RUN ? "DRY RUN — nothing was written" : "APPLY — writes committed"}`);
  console.log("━".repeat(72));

  if (!DRY_RUN && (incomeStats.skipped > 0 || billsStats.skipped > 0)) {
    console.error(`\n⚠️  ${incomeStats.skipped + billsStats.skipped} rows failed to update. Re-run the script — the idempotency gate will skip everything that succeeded.`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("backfill-provenance.ts fatal:", err);
  process.exit(1);
});
