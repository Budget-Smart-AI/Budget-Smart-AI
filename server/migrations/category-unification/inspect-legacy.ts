#!/usr/bin/env tsx
/**
 * ARCHITECTURE §6.2.5 — pre-flight inspection script.
 *
 * Read-only. No writes, no Bedrock calls. Shows:
 *   1. How many rows each of the six source tables holds
 *   2. Distinct legacy-category strings per table, with coverage by map
 *   3. Estimated AI-fallback call count + ballpark cost
 *
 * Purpose: before Ryan runs `backfill:categories` for real, he gets a
 * preview of how much the AI fallback will cost and which legacy strings
 * aren't covered by the deterministic map yet. Anything appearing here in
 * the "→ AI" bucket is a candidate for being hardcoded into
 * `deterministic-map.ts` (one extra map entry = one fewer AI call
 * forever).
 *
 * Usage:
 *   DATABASE_URL=... tsx server/migrations/category-unification/inspect-legacy.ts
 */

import "dotenv/config";
import { pool } from "../../db";
import { DETERMINISTIC_MAP, PLAID_CATEGORY_MAP } from "./deterministic-map";

interface Source {
  table: string;
  categoryCol: string;
  plaidDetailedCol?: string;
}

// For plaid/mx, `category` is the provider's raw taxonomy and won't match the
// DETERMINISTIC_MAP (which keys on BSA legacy strings like "Groceries"). The
// adapter-derived `personal_category` IS that BSA string — select it.
const SOURCES: Source[] = [
  { table: "expenses", categoryCol: "category" },
  { table: "bills", categoryCol: "category" },
  { table: "income", categoryCol: "category" },
  { table: "manual_transactions", categoryCol: "category" },
  { table: "plaid_transactions", categoryCol: "personal_category", plaidDetailedCol: "personal_finance_category_detailed" },
  { table: "mx_transactions", categoryCol: "personal_category" },
];

// Rough token counts for the cost estimate. System prompt is ~700 tokens;
// each row-specific user prompt is ~40 tokens; response is ~25 tokens.
// Haiku 3.5: $0.0008/1k input, $0.004/1k output.
const HAIKU_TOKENS_IN_PER_CALL = 740;
const HAIKU_TOKENS_OUT_PER_CALL = 25;
const HAIKU_COST_PER_CALL =
  (HAIKU_TOKENS_IN_PER_CALL / 1000) * 0.0008 +
  (HAIKU_TOKENS_OUT_PER_CALL / 1000) * 0.004;

async function inspectTable(src: Source): Promise<{ table: string; total: number; unmapped: number; distinctUnmapped: string[] }> {
  const { table, categoryCol, plaidDetailedCol } = src;

  // Total rows NOT yet backfilled. (We still respect the idempotency gate
  // so the estimate matches what the real backfill will actually do.)
  const totalRes = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM ${table} WHERE canonical_category_id IS NULL`,
  );
  const total = parseInt(totalRes.rows[0].cnt, 10);

  if (total === 0) {
    console.log(`\n  ${table}: 0 unfilled rows`);
    return { table, total: 0, unmapped: 0, distinctUnmapped: [] };
  }

  // Distinct (legacy_category, plaid_detailed) tuples + their row counts.
  const distinctSql = plaidDetailedCol
    ? `
      SELECT ${categoryCol} AS legacy, ${plaidDetailedCol} AS plaid_detailed, COUNT(*)::text AS cnt
      FROM ${table}
      WHERE canonical_category_id IS NULL
      GROUP BY ${categoryCol}, ${plaidDetailedCol}
      ORDER BY COUNT(*) DESC
    `
    : `
      SELECT ${categoryCol} AS legacy, NULL::text AS plaid_detailed, COUNT(*)::text AS cnt
      FROM ${table}
      WHERE canonical_category_id IS NULL
      GROUP BY ${categoryCol}
      ORDER BY COUNT(*) DESC
    `;

  const distinct = await pool.query<{ legacy: string | null; plaid_detailed: string | null; cnt: string }>(distinctSql);

  let detCount = 0;
  let pfcCount = 0;
  let aiCount = 0;
  const unmappedStrings: { legacy: string | null; plaid: string | null; rows: number }[] = [];

  for (const r of distinct.rows) {
    const rows = parseInt(r.cnt, 10);
    const detHit = r.legacy !== null && DETERMINISTIC_MAP[r.legacy] !== undefined;
    const pfcHit = !detHit && r.plaid_detailed !== null && PLAID_CATEGORY_MAP[r.plaid_detailed] !== undefined;

    if (detHit) detCount += rows;
    else if (pfcHit) pfcCount += rows;
    else {
      aiCount += rows;
      unmappedStrings.push({ legacy: r.legacy, plaid: r.plaid_detailed, rows });
    }
  }

  console.log(`\n  ${table}: ${total} unfilled rows`);
  console.log(`    deterministic hit:  ${detCount.toString().padStart(6)} (${pct(detCount, total)}%)`);
  console.log(`    plaid PFC hit:      ${pfcCount.toString().padStart(6)} (${pct(pfcCount, total)}%)`);
  console.log(`    → AI fallback:      ${aiCount.toString().padStart(6)} (${pct(aiCount, total)}%)`);

  if (unmappedStrings.length > 0) {
    console.log(`    top unmapped legacy strings (first 15):`);
    for (const u of unmappedStrings.slice(0, 15)) {
      const parts = [`"${u.legacy ?? "(null)"}"`];
      if (u.plaid) parts.push(`plaid="${u.plaid}"`);
      console.log(`      ${u.rows.toString().padStart(6)}  ${parts.join("  ")}`);
    }
    if (unmappedStrings.length > 15) {
      console.log(`      ... +${unmappedStrings.length - 15} more distinct tuples`);
    }
  }

  return {
    table,
    total,
    unmapped: aiCount,
    distinctUnmapped: unmappedStrings.map((u) => `${u.legacy ?? "(null)"}${u.plaid ? ` / ${u.plaid}` : ""}`),
  };
}

function pct(part: number, total: number): string {
  if (total === 0) return "0.0";
  return ((part / total) * 100).toFixed(1);
}

async function main() {
  console.log("━".repeat(72));
  console.log("§6.2.5 pre-flight inspection (read-only)");
  console.log(`target: ${process.env.DATABASE_URL?.split("@")[1] ?? "(unknown)"}`);
  console.log(`deterministic map size: ${Object.keys(DETERMINISTIC_MAP).length} entries`);
  console.log(`plaid PFC map size:     ${Object.keys(PLAID_CATEGORY_MAP).length} entries`);
  console.log("━".repeat(72));

  const summaries = [];
  for (const src of SOURCES) {
    try {
      summaries.push(await inspectTable(src));
    } catch (err) {
      console.error(`  ❌ ${src.table} inspection failed:`, (err as Error).message);
    }
  }

  const grandTotal = summaries.reduce((s, x) => s + x.total, 0);
  const grandUnmapped = summaries.reduce((s, x) => s + x.unmapped, 0);

  // Deduplicate unmapped tuples across tables — AI cost is charged per unique
  // (legacy, plaid_detailed) *instance*, but identical merchant-name pairs
  // still incur separate AI calls. Row count = call count.
  console.log("\n" + "━".repeat(72));
  console.log("Summary");
  console.log("━".repeat(72));
  console.log(`  rows needing backfill:  ${grandTotal}`);
  console.log(`  rows routed to AI:       ${grandUnmapped} (${pct(grandUnmapped, grandTotal)}%)`);
  console.log(`  est. Bedrock cost:       $${(grandUnmapped * HAIKU_COST_PER_CALL).toFixed(2)}`);
  console.log(`  est. elapsed @ 10 RPS:   ${Math.ceil(grandUnmapped / 10 / 60)} minute(s)`);
  console.log("━".repeat(72));
  console.log(
    "\nTip: legacy strings appearing in the 'top unmapped' lists above are\n" +
    "prime candidates for hardcoding into server/migrations/category-unification/deterministic-map.ts.\n" +
    "Every new entry there removes N AI calls and adds N perfect mappings.",
  );

  await pool.end();
}

main().catch((err) => {
  console.error("\nInspection crashed:", err);
  process.exit(1);
});
