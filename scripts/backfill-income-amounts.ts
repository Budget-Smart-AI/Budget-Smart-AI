#!/usr/bin/env tsx
/**
 * UAT-10 #173 — Amount-recompute backfill for auto-detected income.
 *
 * One-shot. Keyed on #177's provenance tags:
 *   detection_source='plaid' AND detection_confidence IN ('low','medium')
 *   AND is_recurring='true' AND is_active='true' AND confidence_flag IS NULL
 *
 * Idempotency: rows where confidence_flag IS NOT NULL are skipped. Re-running
 * the apply step after the first run updates zero rows.
 *
 * Safety gates:
 *   drift ≤ 20%            → skip (amount plausible as-is)
 *   20% < drift ≤ 10×      → UPDATE amount to median, stamp corrected
 *   drift > 10×            → flag for manual review, do NOT change amount
 *   <2 matching inflows    → stamp backfill_no_history, do NOT change amount
 *
 * Every touched row (corrected OR flagged OR no_history) writes an audit row
 * to income_audit. Rollback is possible via:
 *   UPDATE income SET amount = a.old_amount FROM income_audit a
 *   WHERE income.id = a.income_id AND a.source_script = 'backfill-income-amounts.ts'
 *
 * Usage:
 *   npm run backfill:income-amounts:dry
 *   npm run backfill:income-amounts
 */

import "dotenv/config";
import { db } from "../server/db";
import { income, incomeAudit } from "../shared/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  getRecentMatchingInflows,
  median,
  HISTORY_WINDOW_DAYS,
  SAMPLE_SIZE,
} from "../server/lib/income-validation";

const DRY_RUN = process.argv.includes("--dry-run");

const DRIFT_SKIP_THRESHOLD = 0.20;  // ≤20% → amount is fine, skip
const DRIFT_MAX_AUTO_FIX   = 10.0;  // >10× → too extreme, flag instead

function fmt(n: number): string {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function log(...args: any[]) {
  const prefix = DRY_RUN ? "[dry-run]" : "[apply]  ";
  console.log(prefix, ...args);
}

interface Candidate {
  id: string;
  userId: string;
  source: string;
  amount: string;
  recurrence: string | null;
  isRecurring: string | null;
}

export interface Decision {
  action: "corrected" | "flagged" | "no_history" | "skipped";
  oldAmount: number;
  newAmount: number;
  observedMedian: number;
  sampleSize: number;
  driftRatio: number;
  reason: string;
}

export async function evaluate(row: Candidate): Promise<Decision> {
  const oldAmount = parseFloat(row.amount);
  const inflows = await getRecentMatchingInflows(row.userId, row.source, HISTORY_WINDOW_DAYS);
  const sample = inflows.slice(0, SAMPLE_SIZE).map(t => t.amount);

  if (sample.length < 2) {
    return {
      action: "no_history",
      oldAmount,
      newAmount: oldAmount,
      observedMedian: 0,
      sampleSize: sample.length,
      driftRatio: 0,
      reason: `Fewer than 2 matching inflows in last ${HISTORY_WINDOW_DAYS} days — backfill cannot evaluate`,
    };
  }

  const med = median(sample);
  if (med === 0) {
    return {
      action: "no_history",
      oldAmount,
      newAmount: oldAmount,
      observedMedian: 0,
      sampleSize: sample.length,
      driftRatio: 0,
      reason: "Median of matching inflows resolved to $0",
    };
  }

  const drift = Math.abs(oldAmount - med) / med;

  if (drift <= DRIFT_SKIP_THRESHOLD) {
    return {
      action: "skipped",
      oldAmount,
      newAmount: oldAmount,
      observedMedian: med,
      sampleSize: sample.length,
      driftRatio: drift,
      reason: `Drift ${(drift * 100).toFixed(1)}% within ±20% tolerance`,
    };
  }

  if (drift > DRIFT_MAX_AUTO_FIX) {
    return {
      action: "flagged",
      oldAmount,
      newAmount: oldAmount, // NOT changed
      observedMedian: med,
      sampleSize: sample.length,
      driftRatio: drift,
      reason: `Drift ${drift.toFixed(1)}× exceeds 10× auto-correct ceiling — flagged for manual review`,
    };
  }

  return {
    action: "corrected",
    oldAmount,
    newAmount: Math.round(med * 100) / 100,
    observedMedian: med,
    sampleSize: sample.length,
    driftRatio: drift,
    reason: `Drift ${(drift * 100).toFixed(1)}% — corrected to median`,
  };
}

async function applyDecision(row: Candidate, d: Decision): Promise<void> {
  // Skipped rows produce no audit entry because nothing about them is notable.
  // Only actually-touched rows get audit entries.
  if (d.action === "skipped") return;

  if (DRY_RUN) return;

  const confidenceFlag =
    d.action === "corrected" ? "backfill_corrected"
    : d.action === "flagged"  ? "needs_manual_review"
    :                           "backfill_no_history";

  await db.transaction(async (tx) => {
    // Audit first — so a failed UPDATE leaves an audit breadcrumb.
    await tx.insert(incomeAudit).values({
      incomeId: row.id,
      userId: row.userId,
      oldAmount: d.oldAmount.toFixed(2),
      newAmount: d.newAmount.toFixed(2),
      observedMedian: d.observedMedian.toFixed(2),
      sampleSize: d.sampleSize,
      driftRatio: d.driftRatio.toFixed(4),
      action: d.action,
      reason: d.reason,
      sourceScript: "backfill-income-amounts.ts",
    });

    const patch: any = {
      confidenceFlag,
    };

    if (d.action === "corrected") {
      patch.amount = d.newAmount.toFixed(2);
      patch.lastVerifiedAt = new Date();
      patch.lastVerifiedBy = "system";
      patch.detectionConfidence = "high"; // median-matched → high confidence now
    } else if (d.action === "flagged") {
      patch.detectionConfidence = "low"; // drop to low so UI surfaces the flag
    }

    await tx.update(income).set(patch).where(eq(income.id, row.id));
  });
}

async function main() {
  console.log("━".repeat(72));
  console.log("UAT-10 #173 — Amount-recompute backfill");
  console.log(`mode:   ${DRY_RUN ? "DRY RUN (no writes)" : "APPLY (writes committed)"}`);
  console.log(`target: ${process.env.DATABASE_URL?.split("@")[1] ?? "(unknown)"}`);
  console.log(`gates:  drift≤20%→skip, 20%<drift≤10×→correct, drift>10×→flag`);
  console.log("━".repeat(72));

  const candidates: Candidate[] = await db
    .select({
      id: income.id,
      userId: income.userId,
      source: income.source,
      amount: income.amount,
      recurrence: income.recurrence,
      isRecurring: income.isRecurring,
    })
    .from(income)
    .where(
      and(
        eq(income.detectionSource, "plaid"),
        inArray(income.detectionConfidence, ["low", "medium"]),
        eq(income.isRecurring, "true"),
        eq(income.isActive, "true"),
        isNull(income.confidenceFlag),
      ),
    );

  log(`candidates: ${candidates.length}`);

  const stats = { corrected: 0, flagged: 0, no_history: 0, skipped: 0, errored: 0 };
  const started = Date.now();

  // Print a header line once
  log("");
  log("  user…    source                     old →        new       drift   action");
  log("  ──────── ────────────────────────── ──────────── ────────── ─────── ──────────");

  for (const row of candidates) {
    try {
      const d = await evaluate(row);
      stats[d.action]++;

      log(
        `  ${row.userId.slice(0, 8)} ${row.source.padEnd(26).slice(0, 26)}`,
        `${fmt(d.oldAmount).padStart(12)} →`,
        `${fmt(d.newAmount).padStart(10)}`,
        `${(d.driftRatio * 100).toFixed(1).padStart(6)}%`,
        d.action.toUpperCase(),
      );

      await applyDecision(row, d);
    } catch (err) {
      stats.errored++;
      console.error(`  ❌ ${row.id} errored:`, err);
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log("━".repeat(72));
  console.log("Summary:");
  console.log(`  candidates:   ${candidates.length}`);
  console.log(`  corrected:    ${stats.corrected}`);
  console.log(`  flagged:      ${stats.flagged}   (needs_manual_review — amount NOT changed)`);
  console.log(`  no_history:   ${stats.no_history}   (fewer than 2 matching inflows)`);
  console.log(`  skipped:      ${stats.skipped}   (drift within ±20%)`);
  console.log(`  errored:      ${stats.errored}`);
  console.log(`  elapsed:      ${elapsed}s`);
  console.log(`  mode:         ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log("━".repeat(72));

  if (stats.errored > 0) {
    console.error("\n⚠️  Some rows errored. Re-run the script — the idempotency gate will skip anything already marked with confidence_flag.");
    process.exit(1);
  }

  process.exit(0);
}

main().catch(err => {
  console.error("backfill-income-amounts.ts fatal:", err);
  process.exit(1);
});
