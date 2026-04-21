#!/usr/bin/env tsx
/**
 * UAT-10 M-1 — Backfill the income_sources registry for every user that has
 * income rows but no registry entries yet.
 *
 * Mirrors the exact logic of POST /api/income/registry/refresh in routes.ts
 * (lines ~1583-1670). Extracted so we can run it against all users at once,
 * idempotently. Safe to re-run — the upsert keys on (user_id, normalized_source)
 * and preserves existing amount history.
 *
 * Usage:
 *   DATABASE_URL=... npm run seed:registry:dry
 *   DATABASE_URL=... npm run seed:registry
 */
import { storage } from "../server/storage";
import { pool } from "../server/db";
import { plaidAdapter, mxAdapter, manualAdapter } from "../server/lib/financial-engine";
import { classifyDepositsForRegistry } from "../server/lib/financial-engine/categories/registry-classifier";

interface TargetUser {
  user_id: string;
  email: string;
  active_income: number;
}

interface SeedResult {
  userId: string;
  email: string;
  depositsScanned: number;
  sourcesClassified: number;
  sourcesUpserted: number;
  errors: string[];
}

async function findTargets(): Promise<TargetUser[]> {
  const { rows } = await pool.query<TargetUser>(`
    SELECT
      u.id AS user_id,
      u.email,
      COUNT(DISTINCT i.id) FILTER (WHERE i.is_active = 'true')::int AS active_income
    FROM users u
    LEFT JOIN income_sources s ON s.user_id = u.id AND s.is_active = true
    LEFT JOIN income i ON i.user_id = u.id
    GROUP BY u.id, u.email
    HAVING COUNT(DISTINCT i.id) FILTER (WHERE i.is_active = 'true') > 0
       AND COUNT(DISTINCT s.id) = 0
    ORDER BY active_income DESC
  `);
  return rows;
}

async function seedUser(userId: string, email: string, dryRun: boolean): Promise<SeedResult> {
  const result: SeedResult = {
    userId,
    email,
    depositsScanned: 0,
    sourcesClassified: 0,
    sourcesUpserted: 0,
    errors: [],
  };

  const today = new Date();
  const startDate = new Date(today);
  startDate.setMonth(startDate.getMonth() - 6);
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = today.toISOString().split("T")[0];
  const todayStr = endStr;

  // Aggregate normalized txs across providers — same as /api/income/registry/refresh
  const normalized: any[] = [];

  try {
    const plaidItems = await storage.getPlaidItems(userId);
    for (const item of plaidItems) {
      const accounts = await storage.getPlaidAccounts(item.id);
      const activeIds = accounts.filter((a: any) => a.isActive === "true").map((a: any) => a.id);
      if (activeIds.length === 0) continue;
      const raw = await storage.getPlaidTransactions(activeIds, { startDate: startStr, endDate: endStr });
      normalized.push(...plaidAdapter.normalizeTransactions(raw));
    }
  } catch (e: any) {
    result.errors.push(`plaid: ${e.message}`);
  }

  try {
    const mxAccounts = await storage.getMxAccountsByUserId(userId);
    const mxActiveIds = mxAccounts
      .filter((a: any) => a.isActive === "true" || a.isActive === true)
      .map((a: any) => a.id || a.guid);
    if (mxActiveIds.length > 0) {
      const rawMx = await storage.getMxTransactions(mxActiveIds, { startDate: startStr, endDate: endStr });
      normalized.push(...mxAdapter.normalizeTransactions(rawMx));
    }
  } catch (e: any) {
    result.errors.push(`mx: ${e.message}`);
  }

  try {
    const rawManual = await storage.getManualTransactionsByUser(userId, { startDate: startStr, endDate: endStr });
    normalized.push(...manualAdapter.normalizeTransactions(rawManual));
  } catch (e: any) {
    result.errors.push(`manual: ${e.message}`);
  }

  const deposits = normalized
    .filter((tx) => tx.direction === "credit" && !tx.isTransfer && tx.amount > 0)
    .map((tx) => ({
      date: tx.date,
      amount: tx.amount,
      merchant: tx.merchant || "",
      incomeCategory: tx.incomeCategory ?? null,
      providerSignals: tx.providerSignals ?? undefined,
    }));

  result.depositsScanned = deposits.length;

  const classifications = classifyDepositsForRegistry(deposits, { today });
  result.sourcesClassified = classifications.length;

  console.log(
    `  ${email} (${userId.slice(0, 8)}): ${deposits.length} deposits → ${classifications.length} sources`,
  );

  if (classifications.length === 0) {
    // User has income rows but no recurring transaction pattern the classifier
    // can detect. Leave their registry empty; the legacy `Income[]` fallback
    // in calculateIncomeForPeriod will continue to carry projections.
    console.log(`    no recurring patterns detected — leaving registry empty`);
    return result;
  }

  for (const c of classifications) {
    const recurrenceLabel = `${c.recurrence}${c.mode !== "fixed" ? ` (${c.mode})` : ""}`;
    console.log(`    • ${c.displayName.padEnd(32)} | ${recurrenceLabel.padEnd(18)} | ${c.category.padEnd(12)} | $${c.unitAmount.toFixed(2)}`);

    if (dryRun) continue;

    try {
      await storage.upsertIncomeSource(
        userId,
        {
          normalizedSource: c.normalizedSource,
          displayName: c.displayName,
          recurrence: c.recurrence as any,
          mode: c.mode as any,
          cadenceAnchor: c.cadenceAnchor,
          cadenceExtra: c.cadenceExtra ?? null,
          category: c.category,
          isActive: true,
          autoDetected: true,
          detectedAt: today,
        } as any,
        { amount: c.unitAmount.toFixed(2), effectiveFrom: todayStr },
      );
      result.sourcesUpserted++;
    } catch (e: any) {
      result.errors.push(`upsert ${c.displayName}: ${e.message}`);
      console.log(`      ! upsert failed: ${e.message}`);
    }
  }

  return result;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const mode = dryRun ? "[DRY-RUN]" : "[APPLY]";

  console.log(`${mode} Scanning for users with income but no registry entries...`);

  const targets = await findTargets();
  if (targets.length === 0) {
    console.log(`${mode} Zero users need seeding. Done.`);
    process.exit(0);
  }

  console.log(`${mode} Found ${targets.length} users to seed:`);
  for (const t of targets) {
    console.log(`  ${t.email.padEnd(36)} — ${t.active_income} active income rows`);
  }
  console.log("");

  const results: SeedResult[] = [];
  for (const t of targets) {
    const r = await seedUser(t.user_id, t.email, dryRun);
    results.push(r);
  }

  console.log("");
  console.log(`${mode} Summary:`);
  console.log(
    `  users_processed=${results.length}  total_deposits=${results.reduce((a, r) => a + r.depositsScanned, 0)}  total_classified=${results.reduce((a, r) => a + r.sourcesClassified, 0)}  total_upserted=${results.reduce((a, r) => a + r.sourcesUpserted, 0)}`,
  );
  const withErrors = results.filter((r) => r.errors.length > 0);
  if (withErrors.length > 0) {
    console.log(`  users_with_errors=${withErrors.length}:`);
    for (const r of withErrors) {
      console.log(`    ${r.email}: ${r.errors.join("; ")}`);
    }
  }

  if (dryRun) {
    console.log(`${mode} Re-run without --dry-run to apply.`);
  } else {
    console.log(`${mode} Re-run with --dry-run to verify idempotency (should find 0 users).`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-registry] Fatal:", err);
  process.exit(1);
});
