/**
 * UAT-8 verification — Recurring-income detector cadence buckets.
 *
 * detectFrequency is not exported, so we exercise it through the cash-flow
 * detector which uses the same strict buckets. We also assert the exported
 * mapping behaviour end-to-end to prevent the old bug reintroducing.
 *
 * Run:
 *   node_modules/.bin/esbuild uat-reports/verify-uat8-cadence.ts \
 *     --bundle --platform=node --format=esm --outfile=/tmp/v-uat8-cad.mjs && \
 *     node /tmp/v-uat8-cad.mjs
 */

import { detectRecurringIncomeFromTransactions } from "../server/cash-flow";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

function mkTx(id: string, date: string, amount: string, name: string) {
  return {
    id,
    plaidAccountId: "acct-1",
    date,
    amount,
    name,
    counterpartyName: name,
    merchantName: name,
    category: "INCOME",
    personalFinanceCategoryDetailed: "INCOME_WAGES",
    isTransfer: false,
    matchType: null,
    pending: "false",
  } as any;
}

function avgGap(eventsDates: string[]): number {
  if (eventsDates.length < 2) return NaN;
  const ms = eventsDates.map((d) => new Date(d).getTime()).sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < ms.length; i++) total += (ms[i] - ms[i - 1]) / 86400000;
  return total / (ms.length - 1);
}

console.log("\n=== UAT-8 Detector cadence buckets ===\n");

const start = new Date("2026-05-01T00:00:00Z");
const end = new Date("2026-07-01T00:00:00Z");

// ---------------------------------------------------------------------------
// 1. Biweekly (14-day cadence) still produces ~14-day projections.
// ---------------------------------------------------------------------------
const biweeklyHistory = [
  mkTx("bw-1", "2026-03-06", "-1000", "BW-PAYROLL"),
  mkTx("bw-2", "2026-03-20", "-1000", "BW-PAYROLL"),
  mkTx("bw-3", "2026-04-03", "-1000", "BW-PAYROLL"),
  mkTx("bw-4", "2026-04-17", "-1000", "BW-PAYROLL"),
];
const bwOut = detectRecurringIncomeFromTransactions(biweeklyHistory, start, end);
assert(bwOut.length >= 4, `biweekly projects 4+ events in 60 days (got ${bwOut.length})`);
const bwGap = avgGap(bwOut.map((e) => e.date));
assert(Math.abs(bwGap - 14) < 0.5, `biweekly avg gap ~14d (got ${bwGap.toFixed(1)}d)`);

// ---------------------------------------------------------------------------
// 2. Semi-monthly (15/30) produces ~15-day projections.
// ---------------------------------------------------------------------------
const smHistory = [
  mkTx("sm-1", "2026-02-28", "-2000", "SM-PAYROLL"),
  mkTx("sm-2", "2026-03-15", "-2000", "SM-PAYROLL"),
  mkTx("sm-3", "2026-03-30", "-2000", "SM-PAYROLL"),
  mkTx("sm-4", "2026-04-15", "-2000", "SM-PAYROLL"),
];
const smOut = detectRecurringIncomeFromTransactions(smHistory, start, end);
assert(smOut.length >= 3, `semi-monthly projects 3+ events in 60 days (got ${smOut.length})`);
const smGap = avgGap(smOut.map((e) => e.date));
assert(Math.abs(smGap - 15) < 0.5, `semi-monthly avg gap ~15d (got ${smGap.toFixed(1)}d)`);

// ---------------------------------------------------------------------------
// 3. Monthly (30-day cadence) still produces ~30-day projections.
// ---------------------------------------------------------------------------
const mHistory = [
  mkTx("m-1", "2026-01-31", "-4000", "M-PAYROLL"),
  mkTx("m-2", "2026-02-28", "-4000", "M-PAYROLL"),
  mkTx("m-3", "2026-03-31", "-4000", "M-PAYROLL"),
];
const mOut = detectRecurringIncomeFromTransactions(mHistory, start, end);
const mGap = avgGap(mOut.map((e) => e.date));
assert(mOut.length >= 1, `monthly projects 1+ events in 60 days (got ${mOut.length})`);
if (mOut.length >= 2) {
  assert(Math.abs(mGap - 30) < 2, `monthly avg gap ~30d (got ${mGap.toFixed(1)}d)`);
}

// ---------------------------------------------------------------------------
// 4. Irregular cadence (gap ~20-25 days) is rejected, not force-fit.
// ---------------------------------------------------------------------------
const irregular = [
  mkTx("ir-1", "2026-02-01", "-1000", "IR-PAYER"),
  mkTx("ir-2", "2026-02-22", "-1000", "IR-PAYER"),
  mkTx("ir-3", "2026-03-15", "-1000", "IR-PAYER"),
];
const irOut = detectRecurringIncomeFromTransactions(irregular, start, end);
assert(irOut.length === 0, `irregular cadence yields no projections (got ${irOut.length})`);

// ---------------------------------------------------------------------------
// 5. 14-day vs 15-day discrimination — a dataset with median=14 goes biweekly,
//    median=15 goes semi-monthly. No overlap.
// ---------------------------------------------------------------------------
const bw14 = [
  mkTx("a-1", "2026-03-01", "-500", "A"),
  mkTx("a-2", "2026-03-15", "-500", "A"),
  mkTx("a-3", "2026-03-29", "-500", "A"),
  mkTx("a-4", "2026-04-12", "-500", "A"),
];
const sm15 = [
  mkTx("b-1", "2026-03-01", "-500", "B"),
  mkTx("b-2", "2026-03-16", "-500", "B"),
  mkTx("b-3", "2026-03-31", "-500", "B"),
  mkTx("b-4", "2026-04-15", "-500", "B"),
];
const bw14Out = detectRecurringIncomeFromTransactions(bw14, start, end);
const sm15Out = detectRecurringIncomeFromTransactions(sm15, start, end);
const bw14Gap = avgGap(bw14Out.map((e) => e.date));
const sm15Gap = avgGap(sm15Out.map((e) => e.date));
assert(Math.abs(bw14Gap - 14) < 0.5, `14d history → 14d projection (got ${bw14Gap.toFixed(1)}d)`);
assert(Math.abs(sm15Gap - 15) < 0.5, `15d history → 15d projection (got ${sm15Gap.toFixed(1)}d)`);

console.log("\n=== Summary ===");
if (process.exitCode === 1) {
  console.log("UAT-8 cadence: FAILED — see failures above.");
} else {
  console.log("UAT-8 cadence: ALL PASSED.");
}
