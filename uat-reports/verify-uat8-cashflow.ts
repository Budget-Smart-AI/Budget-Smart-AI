/**
 * UAT-8 verification — Money Timeline math fixes
 *
 * Covers:
 *  - Cadence overlap fix (biweekly vs semi-monthly)
 *  - DOW spending division (by day-of-week occurrences, not tx count)
 *  - Transfer name-pattern backstop for credits labelled "Other"
 *
 * Run:
 *   node_modules/.bin/esbuild uat-reports/verify-uat8-cashflow.ts \
 *     --bundle --platform=node --format=esm --outfile=/tmp/v-uat8-cf.mjs && \
 *     node /tmp/v-uat8-cf.mjs
 */

import {
  detectRecurringIncomeFromTransactions,
  getSpendingByDayOfWeek,
  calculateAverageDailySpending,
} from "../server/cash-flow";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Minimal PlaidTransaction shape — only the fields cash-flow.ts consumes.
// ---------------------------------------------------------------------------
type TxFixture = {
  id: string;
  date: string;
  amount: string;
  name: string;
  merchantName?: string | null;
  counterpartyName?: string | null;
  category?: string | null;
  personalCategory?: string | null;
  personalFinanceCategoryDetailed?: string | null;
  matchType?: string | null;
  isTransfer?: boolean | string | null;
  pending?: string | boolean | null;
  plaidAccountId?: string;
};

function tx(fields: Partial<TxFixture> & Pick<TxFixture, "id" | "date" | "amount" | "name">): any {
  return {
    plaidAccountId: "acct-1",
    pending: "false",
    isTransfer: false,
    matchType: null,
    category: null,
    personalCategory: null,
    personalFinanceCategoryDetailed: null,
    merchantName: null,
    counterpartyName: null,
    ...fields,
  };
}

console.log("\n=== UAT-8 Money Timeline math ===\n");

// ---------------------------------------------------------------------------
// Block 1 — Cadence classification for semi-monthly income (15th/30th).
//   Gaps are [13, 15, 15, 15]. Median = 15. Under the old rule this landed in
//   the 13-16 "biweekly" bucket, which projected every 14 days and nearly
//   doubled the expected income. Now it must be a 15-day semi-monthly cadence.
// ---------------------------------------------------------------------------
const semiMonthly = [
  tx({ id: "sm-1", date: "2026-01-30", amount: "-2500", name: "ACME PAYROLL",      counterpartyName: "ACME CORP", personalFinanceCategoryDetailed: "INCOME_WAGES", category: "INCOME" }),
  tx({ id: "sm-2", date: "2026-02-13", amount: "-2500", name: "ACME PAYROLL",      counterpartyName: "ACME CORP", personalFinanceCategoryDetailed: "INCOME_WAGES", category: "INCOME" }),
  tx({ id: "sm-3", date: "2026-02-28", amount: "-2500", name: "ACME PAYROLL",      counterpartyName: "ACME CORP", personalFinanceCategoryDetailed: "INCOME_WAGES", category: "INCOME" }),
  tx({ id: "sm-4", date: "2026-03-15", amount: "-2500", name: "ACME PAYROLL",      counterpartyName: "ACME CORP", personalFinanceCategoryDetailed: "INCOME_WAGES", category: "INCOME" }),
  tx({ id: "sm-5", date: "2026-03-30", amount: "-2500", name: "ACME PAYROLL",      counterpartyName: "ACME CORP", personalFinanceCategoryDetailed: "INCOME_WAGES", category: "INCOME" }),
];
const smStart = new Date("2026-04-01T00:00:00Z");
const smEnd = new Date("2026-05-31T00:00:00Z");
const smEvents = detectRecurringIncomeFromTransactions(semiMonthly, smStart, smEnd);

// 2 months × 2 pays/month = 4 events (15-day cadence starting from last pay + 15d).
assert(smEvents.length >= 3 && smEvents.length <= 5,
  `semi-monthly projects ~4 events in 60-day window (got ${smEvents.length})`);

// Spacing between consecutive projected events is 15 days, not 14.
if (smEvents.length >= 2) {
  const d0 = new Date(smEvents[0].date).getTime();
  const d1 = new Date(smEvents[1].date).getTime();
  const gapDays = Math.round((d1 - d0) / 86400000);
  assert(gapDays === 15, `projected gap is 15 days (got ${gapDays})`);
}

// ---------------------------------------------------------------------------
// Block 2 — Weekly income still classifies as weekly.
// ---------------------------------------------------------------------------
const weekly = [
  tx({ id: "w-1", date: "2026-03-06", amount: "-1445.61", name: "CORESLAB PAYROLL", counterpartyName: "CORESLAB", personalFinanceCategoryDetailed: "INCOME_WAGES", category: "INCOME" }),
  tx({ id: "w-2", date: "2026-03-13", amount: "-1445.61", name: "CORESLAB PAYROLL", counterpartyName: "CORESLAB", personalFinanceCategoryDetailed: "INCOME_WAGES", category: "INCOME" }),
  tx({ id: "w-3", date: "2026-03-20", amount: "-1445.61", name: "CORESLAB PAYROLL", counterpartyName: "CORESLAB", personalFinanceCategoryDetailed: "INCOME_WAGES", category: "INCOME" }),
  tx({ id: "w-4", date: "2026-03-27", amount: "-1445.61", name: "CORESLAB PAYROLL", counterpartyName: "CORESLAB", personalFinanceCategoryDetailed: "INCOME_WAGES", category: "INCOME" }),
];
const wEvents = detectRecurringIncomeFromTransactions(weekly, smStart, smEnd);
assert(wEvents.length >= 7,
  `weekly income projects 7+ events in 60-day window (got ${wEvents.length})`);

// ---------------------------------------------------------------------------
// Block 3 — Transfer name-pattern backstop.
//   Credits with generic "Other" category and neutral PFC detailed MUST be
//   rejected when the name matches a transfer/cash-advance pattern.
// ---------------------------------------------------------------------------
const transferLabelled = [
  tx({ id: "tf-1", date: "2026-03-05", amount: "-500", name: "Customer Transfer Cr. MB-CASH ADVANCE", category: "Other" }),
  tx({ id: "tf-2", date: "2026-03-19", amount: "-500", name: "Customer Transfer Cr. MB-CASH ADVANCE", category: "Other" }),
  tx({ id: "tf-3", date: "2026-04-02", amount: "-500", name: "Customer Transfer Cr. MB-CASH ADVANCE", category: "Other" }),
  tx({ id: "tf-4", date: "2026-04-09", amount: "-800", name: "e-Transfer From John",                 category: "Other" }),
  tx({ id: "tf-5", date: "2026-04-16", amount: "-800", name: "e-Transfer From John",                 category: "Other" }),
];
const transferEvents = detectRecurringIncomeFromTransactions(transferLabelled, smStart, smEnd);
assert(transferEvents.length === 0,
  `transfer-labelled credits do NOT become recurring income (got ${transferEvents.length})`);

// ---------------------------------------------------------------------------
// Block 4 — Day-of-week spending averaging.
//   1 Sunday with a $1,200 outlier in 30 days of history should NOT make the
//   Sunday average $1,200 — we require >=2 Sundays in the window.
// ---------------------------------------------------------------------------
const singleSunday = [
  tx({ id: "sun-1", date: "2026-04-12", amount: "1200.00", name: "Big Sunday Outlier", category: "Shopping" }),
  tx({ id: "mon-1", date: "2026-04-13", amount: "20.00",   name: "Monday Coffee",      category: "Food" }),
  tx({ id: "mon-2", date: "2026-04-06", amount: "20.00",   name: "Monday Coffee",      category: "Food" }),
  tx({ id: "tue-1", date: "2026-04-14", amount: "15.00",   name: "Tuesday Lunch",      category: "Food" }),
  tx({ id: "tue-2", date: "2026-04-07", amount: "15.00",   name: "Tuesday Lunch",      category: "Food" }),
];
const dow = getSpendingByDayOfWeek(singleSunday);
assert(dow[0] === 0,
  `Sunday avg is 0 with only 1 Sunday of data (got $${dow[0]}) — no single-outlier projection`);
assert(dow[1] > 0 && dow[1] < 30,
  `Monday avg is populated when there are 2 Mondays (got $${dow[1]})`);
assert(dow[2] > 0 && dow[2] < 30,
  `Tuesday avg is populated when there are 2 Tuesdays (got $${dow[2]})`);

// ---------------------------------------------------------------------------
// Block 5 — Average daily spending excludes bank-transfer-named credits.
// ---------------------------------------------------------------------------
const mixedSpending = [
  tx({ id: "sp-1", date: "2026-04-12", amount: "50.00",  name: "Groceries",                category: "Food" }),
  tx({ id: "sp-2", date: "2026-04-13", amount: "30.00",  name: "Gas",                      category: "Transportation" }),
  tx({ id: "tf-1", date: "2026-04-14", amount: "500.00", name: "Transfer To Savings",      category: "Other" }),
  tx({ id: "tf-2", date: "2026-04-15", amount: "200.00", name: "MB-CASH ADVANCE",           category: "Other" }),
];
const avg = calculateAverageDailySpending(mixedSpending, 30);
// Real spending is $80 / 30 = $2.67, transfers excluded entirely.
assert(Math.abs(avg - (80 / 30)) < 0.05,
  `avg daily spending excludes transfer-named credits (got $${avg.toFixed(2)}, expected ~$2.67)`);

console.log("\n=== Summary ===");
if (process.exitCode === 1) {
  console.log("UAT-8 cash-flow: FAILED — see failures above.");
} else {
  console.log("UAT-8 cash-flow: ALL PASSED.");
}
