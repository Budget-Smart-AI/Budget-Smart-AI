#!/usr/bin/env tsx
/**
 * ARCHITECTURE.md §6.2.5 — Canonical-category backfill orchestrator.
 *
 * One-time pass over every user-owned transaction-like row in the database.
 * For each row, resolve a canonical-category slug and write it to the
 * `canonical_category_id` shadow column added by migration 0039.
 *
 * Six source tables (Monarch's single "transactions" concept is split across
 * these in Budget Smart AI):
 *   - expenses              (`category` text)
 *   - bills                 (`category` text)
 *   - income                (`category` text)
 *   - manual_transactions   (`category` text)
 *   - plaid_transactions    (`category` text + `personal_finance_category_detailed` text)
 *   - mx_transactions       (`category` text)
 *
 * Resolution order per row:
 *   1. PLAID_CATEGORY_MAP[plaidDetailed]  (plaid_transactions only, when present) → source="plaid_pfc"
 *   2. DETERMINISTIC_MAP[legacyCategory]  → confidence 1.00, source="deterministic"
 *   3. classifyWithAi()                    → confidence from model, source="ai"
 *   4. On AI failure                       → "uncategorized", confidence 0.00, source="failed"
 *
 *   For plaid_transactions and mx_transactions, `legacyCategory` is taken from
 *   the adapter-derived `personal_category` column (which already holds a BSA
 *   taxonomy string), NOT the raw provider `category` column. For the other
 *   four tables, `legacyCategory` is the `category` column directly.
 *
 * Every resolution produces:
 *   - UPDATE <table> SET canonical_category_id = <slug> WHERE id = <row.id>
 *   - INSERT INTO category_migration_log ( ... needs_review = (confidence < 0.80) ... )
 *
 * Idempotency: rows with `canonical_category_id IS NOT NULL` are SKIPPED by
 * default. Pass `--force` to re-process. Safe to re-run after a partial
 * failure; resumes exactly where it stopped.
 *
 * Post-backfill correction: `applyPhoneCarrierCorrection()` runs AFTER all
 * six tables finish. It re-routes rows whose merchant_name looks like a
 * phone carrier but whose `canonical_category_id` landed on
 * `utilities_electricity` (a well-known legacy misroute from §6.2.2
 * correction #3 in ARCHITECTURE.md).
 *
 * Usage:
 *   DATABASE_URL=... npm run backfill:categories:dry               # preview
 *   DATABASE_URL=... npm run backfill:categories                    # write
 *   DATABASE_URL=... npm run backfill:categories -- --force         # re-process
 *   DATABASE_URL=... npm run backfill:categories -- --table=expenses  # one table
 *   DATABASE_URL=... npm run backfill:categories -- --limit=100      # smoke
 *
 * Prerequisites:
 *   1. migrations/0039_canonical_categories.sql applied
 *   2. scripts/seed-canonical-categories.ts run (73 rows present)
 *   3. AWS Bedrock credentials in env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 */

import "dotenv/config";
import { pool } from "../../db";
import { resolveCanonicalCategory, type RowKind } from "./resolver";

// ─── CLI flags ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const LIMIT = parseIntArg("--limit", args);
const ONLY_TABLE = parseStringArg("--table", args);

const BATCH_SIZE = 500;
const REVIEW_THRESHOLD = 0.80; // confidence < this → needs_review = TRUE

// ─── Table registry ──────────────────────────────────────────────────────────
// Each entry describes one of the six source tables the backfill walks.
// Columns differ (plaid has an extra `personal_finance_category_detailed`,
// every table names `category` differently in a few places, id types differ),
// so we configure per-table SQL here instead of trying to abstract it.

interface TableConfig {
  name: string;
  rowKind: "expense" | "bill" | "income" | "plaid" | "mx" | "manual";
  /** SELECT list — must include `id`, `legacy_category`, `merchant_name`, `amount`, and (for plaid) `plaid_detailed`. */
  selectSql: string;
  /** UPDATE writing the shadow column, parameterized as ($1 = slug, $2 = id). */
  updateSql: string;
  /** Optional Plaid-detailed column accessor. null for non-plaid tables. */
  hasPlaidDetailed: boolean;
}

// NOTE on column choices:
//   - For expenses/bills/income/manual_transactions, `category` holds the
//     Budget Smart AI app category string (EXPENSE_CATEGORIES / BILL_CATEGORIES /
//     INCOME_CATEGORIES) that DETERMINISTIC_MAP expects.
//   - For plaid_transactions/mx_transactions, the raw `category` column holds
//     the PROVIDER's taxonomy (Plaid v1 JSON-ish / MX raw). The column the
//     deterministic map actually matches is `personal_category`, which the
//     adapter populates with the Budget Smart AI category string when a
//     transaction is synced. We select `personal_category` as `legacy_category`
//     for those two tables. Plaid additionally carries
//     `personal_finance_category_detailed` which goes through PLAID_CATEGORY_MAP
//     first.
//   - All six tables use varchar UUID ids (id varchar(...) default gen_random_uuid()).
//     Hence the UPDATE binds a plain text parameter — no integer cast.
const TABLES: TableConfig[] = [
  {
    name: "expenses",
    rowKind: "expense",
    selectSql: `
      SELECT
        id                        AS id,
        category                  AS legacy_category,
        COALESCE(merchant, '')    AS merchant_name,
        amount::text              AS amount,
        NULL::text                AS plaid_detailed
      FROM expenses
    `,
    updateSql: `UPDATE expenses SET canonical_category_id = $1 WHERE id = $2`,
    hasPlaidDetailed: false,
  },
  {
    name: "bills",
    rowKind: "bill",
    selectSql: `
      SELECT
        id                                       AS id,
        category                                 AS legacy_category,
        COALESCE(merchant, name, '')             AS merchant_name,
        amount::text                             AS amount,
        NULL::text                               AS plaid_detailed
      FROM bills
    `,
    updateSql: `UPDATE bills SET canonical_category_id = $1 WHERE id = $2`,
    hasPlaidDetailed: false,
  },
  {
    name: "income",
    rowKind: "income",
    selectSql: `
      SELECT
        id                        AS id,
        category                  AS legacy_category,
        COALESCE(source, '')      AS merchant_name,
        amount::text              AS amount,
        NULL::text                AS plaid_detailed
      FROM income
    `,
    updateSql: `UPDATE income SET canonical_category_id = $1 WHERE id = $2`,
    hasPlaidDetailed: false,
  },
  {
    name: "manual_transactions",
    rowKind: "manual",
    selectSql: `
      SELECT
        id                                               AS id,
        category                                         AS legacy_category,
        COALESCE(merchant_clean_name, merchant, '')      AS merchant_name,
        amount::text                                     AS amount,
        NULL::text                                       AS plaid_detailed
      FROM manual_transactions
    `,
    updateSql: `UPDATE manual_transactions SET canonical_category_id = $1 WHERE id = $2`,
    hasPlaidDetailed: false,
  },
  {
    name: "plaid_transactions",
    rowKind: "plaid",
    selectSql: `
      SELECT
        id                                                           AS id,
        personal_category                                            AS legacy_category,
        COALESCE(merchant_clean_name, merchant_name, counterparty_name, name, '')  AS merchant_name,
        amount::text                                                 AS amount,
        personal_finance_category_detailed                           AS plaid_detailed
      FROM plaid_transactions
    `,
    updateSql: `UPDATE plaid_transactions SET canonical_category_id = $1 WHERE id = $2`,
    hasPlaidDetailed: true,
  },
  {
    name: "mx_transactions",
    rowKind: "mx",
    selectSql: `
      SELECT
        id                                                  AS id,
        personal_category                                   AS legacy_category,
        COALESCE(merchant_clean_name, description, '')      AS merchant_name,
        amount::text                                        AS amount,
        NULL::text                                          AS plaid_detailed
      FROM mx_transactions
    `,
    updateSql: `UPDATE mx_transactions SET canonical_category_id = $1 WHERE id = $2`,
    hasPlaidDetailed: false,
  },
];

// ─── Shared types ────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  legacyCategory: string | null;
  merchantName: string;
  amount: number | null;
  plaidDetailed: string | null;
}

interface MappingResult {
  canonicalId: string;
  confidence: number;
  mappingSource: "deterministic" | "plaid_pfc" | "ai" | "failed";
  reasoning: string | null;
}

interface TableTotals {
  scanned: number;
  deterministic: number;
  plaidPfc: number;
  ai: number;
  failed: number;
  needsReview: number;
  skipped: number;
  writeErrors: number;
}

function emptyTotals(): TableTotals {
  return {
    scanned: 0, deterministic: 0, plaidPfc: 0, ai: 0, failed: 0,
    needsReview: 0, skipped: 0, writeErrors: 0,
  };
}

// ─── Resolver ────────────────────────────────────────────────────────────────
// Three-tier resolution is factored into ./resolver.ts so the dual-write
// hooks (server/plaid.ts, server/mx.ts, storage.ts creates) can share the
// same logic. This script uses the async variant because it's OK to spend
// a Bedrock round-trip during a one-time batch; the sync hot-path version
// used by POST handlers lives alongside it in ./resolver.ts.

async function resolve(row: Candidate, rowKind: RowKind): Promise<MappingResult> {
  const r = await resolveCanonicalCategory({
    legacyCategory: row.legacyCategory,
    plaidDetailed: row.plaidDetailed,
    merchantName: row.merchantName || null,
    amount: row.amount,
    rowKind,
  });

  // Shared resolver can return `canonicalId: null` (when sync path misses),
  // but the async entry point always resolves to a non-null slug (it falls
  // through to the AI). Guard anyway to keep the types honest.
  const canonicalId = r.canonicalId ?? "uncategorized";
  const mappingSource =
    r.mappingSource === "unmapped" ? "failed" : r.mappingSource;

  return {
    canonicalId,
    confidence: r.confidence,
    mappingSource,
    reasoning: r.reasoning,
  };
}

// ─── Per-table processor ─────────────────────────────────────────────────────

async function processTable(cfg: TableConfig): Promise<TableTotals> {
  const totals = emptyTotals();

  // Idempotency gate: by default skip rows that already have a canonical
  // slug. `--force` re-processes them (useful after fixing a mapping bug).
  const whereClauseForBatch = FORCE ? "" : "WHERE canonical_category_id IS NULL";

  // Count candidates directly against the base table (cheaper and clearer
  // than wrapping cfg.selectSql in a subquery).
  const countSql = FORCE
    ? `SELECT COUNT(*)::text AS cnt FROM ${cfg.name}`
    : `SELECT COUNT(*)::text AS cnt FROM ${cfg.name} WHERE canonical_category_id IS NULL`;
  const countRes = await pool.query<{ cnt: string }>(countSql);

  const baseCount = parseInt(countRes.rows[0]?.cnt ?? "0", 10);
  const totalCandidates = LIMIT ? Math.min(LIMIT, baseCount) : baseCount;
  console.log(`\n  ${cfg.name}: ${totalCandidates} candidate row(s)`);
  if (totalCandidates === 0) return totals;

  // Pagination strategy depends on mode:
  //   - Default (filtered):  each UPDATE removes the row from the candidate
  //     set because the filter is `canonical_category_id IS NULL`. We must
  //     keep OFFSET pinned at 0 and re-query, otherwise the N rows we just
  //     wrote would skip N genuine candidates on the next page.
  //     DRY RUN breaks this invariant (we DON'T write), so we fall back to
  //     an advancing OFFSET for dry runs too.
  //   - `--force`: no filter, so the candidate set is stable — advance OFFSET.
  const pageSelect = `${cfg.selectSql} ${whereClauseForBatch} ORDER BY id LIMIT $1 OFFSET $2`;
  const advancingOffset = FORCE || DRY_RUN; // pinned at 0 only when writes shrink the filter set

  let processed = 0;
  const hardCap = LIMIT ?? totalCandidates;

  while (processed < hardCap) {
    const batchSize = Math.min(BATCH_SIZE, hardCap - processed);
    const offset = advancingOffset ? processed : 0;
    const page = await pool.query<{
      id: string;
      legacy_category: string | null;
      merchant_name: string;
      amount: string | null;  // numeric comes back as string from pg
      plaid_detailed: string | null;
    }>(pageSelect, [batchSize, offset]);

    if (page.rows.length === 0) break;

    for (const r of page.rows) {
      totals.scanned++;

      const candidate: Candidate = {
        id: r.id,
        legacyCategory: r.legacy_category,
        merchantName: r.merchant_name ?? "",
        amount: r.amount !== null ? Number(r.amount) : null,
        plaidDetailed: r.plaid_detailed,
      };

      const result = await resolve(candidate, cfg.rowKind);
      const needsReview = result.confidence < REVIEW_THRESHOLD;

      totals[result.mappingSource === "plaid_pfc" ? "plaidPfc" : result.mappingSource]++;
      if (needsReview) totals.needsReview++;

      if (DRY_RUN) {
        if (totals.scanned <= 10 || totals.scanned % 500 === 0) {
          // Sample verbose output; don't flood the terminal.
          console.log(
            `    [dry] ${cfg.name}#${r.id} "${candidate.legacyCategory ?? "(null)"}" → ${result.canonicalId} (${result.mappingSource} ${result.confidence.toFixed(2)}${needsReview ? ", REVIEW" : ""})`,
          );
        }
        continue;
      }

      try {
        await pool.query(cfg.updateSql, [result.canonicalId, r.id]);
        await pool.query(
          `INSERT INTO category_migration_log
             (source_table, source_row_id, old_category, new_canonical_id, mapping_source, confidence, needs_review, reviewed_at, reviewed_by, migrated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, NOW())`,
          [
            cfg.name,
            r.id,
            candidate.legacyCategory,
            result.canonicalId,
            result.mappingSource,
            result.confidence.toFixed(2),
            needsReview,
          ],
        );
      } catch (err) {
        totals.writeErrors++;
        console.error(`    ❌ ${cfg.name}#${r.id} write failed:`, (err as Error).message);
      }
    }

    processed += page.rows.length;

    // Progress ping every batch so Ryan can see we're alive.
    const pct = Math.round((processed / hardCap) * 100);
    console.log(
      `    ${cfg.name}: ${processed}/${hardCap} (${pct}%) — det=${totals.deterministic} pfc=${totals.plaidPfc} ai=${totals.ai} fail=${totals.failed} review=${totals.needsReview}`,
    );

    // Bail early if a batch returned fewer rows than we asked for.
    if (page.rows.length < batchSize) break;
  }

  return totals;
}

// ─── Phone-carrier correction (§6.2.5 post-pass) ─────────────────────────────
// Legacy seed data routes phone-carrier bills through "Electrical" on some
// Canadian bank feeds. The deterministic map sends "Electrical" →
// utilities_electricity. This UPDATE re-routes those rows to
// utilities_phone_mobile when the merchant name clearly matches a carrier.

const PHONE_CARRIER_REGEX =
  "(telus|rogers|bell|fido|koodo|chatr|virgin mobile|freedom mobile|public mobile|lucky mobile|verizon|at&t|t-?mobile|sprint|vodafone|o2)";

async function applyPhoneCarrierCorrection(): Promise<{ tablesTouched: string[]; totalRowsCorrected: number }> {
  console.log("\n  Phone-carrier correction pass:");

  const touched: string[] = [];
  let grandTotal = 0;

  for (const cfg of TABLES) {
    // Real schema columns per table (verified against shared/schema.ts):
    //   expenses             → merchant
    //   bills                → merchant / name
    //   income               → source      (income rows almost never hit this correction)
    //   manual_transactions  → merchant / merchant_clean_name
    //   plaid_transactions   → merchant_name / merchant_clean_name / counterparty_name / name
    //   mx_transactions      → merchant_clean_name / description
    const merchantCol =
        cfg.name === "expenses"            ? "merchant"
      : cfg.name === "bills"               ? "COALESCE(merchant, name)"
      : cfg.name === "income"              ? "source"
      : cfg.name === "manual_transactions" ? "COALESCE(merchant_clean_name, merchant)"
      : cfg.name === "plaid_transactions"  ? "COALESCE(merchant_clean_name, merchant_name, counterparty_name, name)"
      : cfg.name === "mx_transactions"     ? "COALESCE(merchant_clean_name, description)"
      : "merchant_name";

    const correctionSql = `
      UPDATE ${cfg.name}
      SET canonical_category_id = 'utilities_phone_mobile'
      WHERE canonical_category_id = 'utilities_electricity'
        AND ${merchantCol} ~* $1
      RETURNING id::text AS id
    `;

    if (DRY_RUN) {
      const previewSql = `
        SELECT id::text AS id, ${merchantCol} AS m
        FROM ${cfg.name}
        WHERE canonical_category_id = 'utilities_electricity'
          AND ${merchantCol} ~* $1
        LIMIT 50
      `;
      const preview = await pool.query<{ id: string; m: string }>(previewSql, [PHONE_CARRIER_REGEX]);
      console.log(`    [dry] ${cfg.name}: ${preview.rows.length} rows would be re-routed to utilities_phone_mobile`);
      preview.rows.slice(0, 5).forEach((r) => console.log(`        ${cfg.name}#${r.id}  "${r.m}"`));
      if (preview.rows.length > 0) touched.push(cfg.name);
      grandTotal += preview.rows.length;
      continue;
    }

    const res = await pool.query<{ id: string }>(correctionSql, [PHONE_CARRIER_REGEX]);
    const n = res.rows.length;
    if (n > 0) {
      touched.push(cfg.name);
      grandTotal += n;

      // Log each correction into the audit log.
      for (const { id } of res.rows) {
        await pool.query(
          `INSERT INTO category_migration_log
             (source_table, source_row_id, old_category, new_canonical_id, mapping_source, confidence, needs_review, migrated_at)
           VALUES ($1, $2, 'utilities_electricity', 'utilities_phone_mobile', 'phone_carrier_correction', 1.00, FALSE, NOW())`,
          [cfg.name, id],
        );
      }
    }
    console.log(`    ${cfg.name}: ${n} row(s) corrected to utilities_phone_mobile`);
  }

  return { tablesTouched: touched, totalRowsCorrected: grandTotal };
}

// ─── Seed-invariant pre-check ────────────────────────────────────────────────
// Don't even start if the canonical_categories table isn't seeded. The
// shadow column has an FK to canonical_categories(id); writing a slug that
// doesn't exist will fail at the DB layer anyway, but a clear error up front
// is much nicer than 10k FK violations deep into the run.

async function checkSeedInvariant(): Promise<void> {
  const res = await pool.query<{ parents: string; total: string }>(`
    SELECT
      COUNT(*) FILTER (WHERE is_group = TRUE)::text  AS parents,
      COUNT(*)::text                                  AS total
    FROM canonical_categories
  `);
  const row = res.rows[0];
  if (!row) throw new Error("canonical_categories is empty — run `npm run seed:canonical-categories` first.");
  const parents = parseInt(row.parents, 10);
  const total = parseInt(row.total, 10);
  if (total !== 73 || parents !== 16) {
    throw new Error(
      `canonical_categories has ${total} rows (${parents} parents). Expected 73 (16 + 57). Re-seed before backfill.`,
    );
  }
  console.log(`✓ canonical_categories seed OK: ${parents} parents + ${total - parents} canonicals = ${total} rows`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const startMs = Date.now();
  console.log("━".repeat(72));
  console.log("ARCHITECTURE §6.2.5 — Canonical category backfill");
  console.log(`mode:    ${DRY_RUN ? "DRY RUN (no writes)" : "APPLY (writes committed)"}${FORCE ? " + FORCE" : ""}`);
  console.log(`target:  ${process.env.DATABASE_URL?.split("@")[1] ?? "(unknown)"}`);
  console.log(`tables:  ${ONLY_TABLE ?? "all six"}${LIMIT ? ` (limit=${LIMIT})` : ""}`);
  console.log("━".repeat(72));

  await checkSeedInvariant();

  const selected = ONLY_TABLE
    ? TABLES.filter((t) => t.name === ONLY_TABLE)
    : TABLES;

  if (ONLY_TABLE && selected.length === 0) {
    console.error(`Unknown --table="${ONLY_TABLE}". Valid: ${TABLES.map((t) => t.name).join(", ")}`);
    process.exitCode = 1;
    await pool.end();
    return;
  }

  const perTable: Record<string, TableTotals> = {};
  for (const cfg of selected) {
    perTable[cfg.name] = await processTable(cfg);
  }

  // Only run the phone-carrier correction when we're doing the full sweep.
  // Running it on a single-table or limited run would give misleading totals.
  let carrierCorrection: { tablesTouched: string[]; totalRowsCorrected: number } | null = null;
  if (!ONLY_TABLE && !LIMIT) {
    carrierCorrection = await applyPhoneCarrierCorrection();
  } else {
    console.log("\n  (Skipping phone-carrier correction — not a full sweep)");
  }

  // ─── Summary ────────────────────────────────────────────────────────────
  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log("\n" + "━".repeat(72));
  console.log("Summary");
  console.log("━".repeat(72));

  let grandScanned = 0;
  let grandReview = 0;
  let grandWriteErrors = 0;

  for (const [table, t] of Object.entries(perTable)) {
    console.log(
      `  ${table.padEnd(22)} scanned=${t.scanned.toString().padStart(6)} ` +
      `det=${t.deterministic.toString().padStart(5)} pfc=${t.plaidPfc.toString().padStart(5)} ` +
      `ai=${t.ai.toString().padStart(5)} fail=${t.failed.toString().padStart(3)} ` +
      `REVIEW=${t.needsReview.toString().padStart(4)}` +
      (t.writeErrors ? ` ❌=${t.writeErrors}` : ""),
    );
    grandScanned += t.scanned;
    grandReview += t.needsReview;
    grandWriteErrors += t.writeErrors;
  }

  if (carrierCorrection) {
    console.log(
      `  phone-carrier fix      re-routed=${carrierCorrection.totalRowsCorrected} ` +
      `across ${carrierCorrection.tablesTouched.length} table(s)`,
    );
  }

  console.log("━".repeat(72));
  console.log(`  total scanned:        ${grandScanned}`);
  console.log(`  flagged for review:   ${grandReview}  (confidence < ${REVIEW_THRESHOLD})`);
  console.log(`  write errors:         ${grandWriteErrors}`);
  console.log(`  elapsed:              ${elapsedSec}s`);
  console.log(`  mode:                 ${DRY_RUN ? "DRY RUN — no changes committed" : "APPLIED"}`);
  console.log("━".repeat(72));

  if (grandWriteErrors > 0) {
    process.exitCode = 1;
  }

  await pool.end();
}

// ─── CLI helpers ─────────────────────────────────────────────────────────────

function parseIntArg(flag: string, argv: string[]): number | null {
  const hit = argv.find((a) => a.startsWith(`${flag}=`));
  if (!hit) return null;
  const n = parseInt(hit.split("=")[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseStringArg(flag: string, argv: string[]): string | null {
  const hit = argv.find((a) => a.startsWith(`${flag}=`));
  if (!hit) return null;
  return hit.split("=")[1] || null;
}

main().catch((err) => {
  console.error("\nBackfill crashed:", err);
  process.exit(1);
});
