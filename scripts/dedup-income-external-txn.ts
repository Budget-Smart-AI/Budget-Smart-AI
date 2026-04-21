#!/usr/bin/env tsx
/**
 * UAT-10 #179 — one-shot dedup for income rows sharing (user_id, external_transaction_id).
 *
 * Must run BEFORE migration 0037 adds the compound unique index, or the ALTER will fail.
 * For each collision, keeps MAX(id) (deterministic) and deletes the rest.
 *
 * Usage:
 *   DATABASE_URL=... npm run dedup:income:dry     # report only
 *   DATABASE_URL=... npm run dedup:income         # apply
 */
import { pool } from "../server/db";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const mode = dryRun ? "[DRY-RUN]" : "[APPLY]";

  console.log(`${mode} Scanning income for duplicate (user_id, external_transaction_id)...`);

  const { rows: collisions } = await pool.query<{
    user_id: string;
    external_transaction_id: string;
    cnt: number;
    ids: string[];
  }>(`
    SELECT user_id,
           external_transaction_id,
           COUNT(*)::int AS cnt,
           array_agg(id ORDER BY id) AS ids
    FROM income
    WHERE external_transaction_id IS NOT NULL
    GROUP BY user_id, external_transaction_id
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC, user_id
  `);

  if (collisions.length === 0) {
    console.log(`${mode} No duplicates found. Safe to proceed with migration 0037.`);
    process.exit(0);
  }

  const totalDupeRows = collisions.reduce((s, c) => s + (c.cnt - 1), 0);
  console.log(`${mode} Found ${collisions.length} collision groups covering ${totalDupeRows} duplicate rows to delete.`);
  console.log(`${mode} Keeping MAX(id) in each group.`);

  for (const c of collisions.slice(0, 20)) {
    const keep = c.ids[c.ids.length - 1]; // MAX(id) — array sorted ascending, last is max
    const drop = c.ids.slice(0, -1);
    console.log(`  user=${c.user_id.slice(0, 8)}... ext=${c.external_transaction_id.slice(0, 12)}... count=${c.cnt} keep=${keep.slice(0, 8)} drop=[${drop.map(d => d.slice(0, 8)).join(",")}]`);
  }
  if (collisions.length > 20) console.log(`  ... and ${collisions.length - 20} more collision groups.`);

  if (dryRun) {
    console.log(`${mode} Dry-run complete. Re-run without --dry-run to apply.`);
    process.exit(0);
  }

  let deleted = 0;
  for (const c of collisions) {
    const drop = c.ids.slice(0, -1); // everything except MAX(id)
    const { rowCount } = await pool.query(
      `DELETE FROM income WHERE id = ANY($1::text[])`,
      [drop]
    );
    deleted += rowCount ?? 0;
  }

  console.log(`${mode} Deleted ${deleted} duplicate rows across ${collisions.length} collision groups.`);
  console.log(`${mode} Re-run with --dry-run to verify 0 candidates remain.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[dedup] Failed:", err);
  process.exit(1);
});
