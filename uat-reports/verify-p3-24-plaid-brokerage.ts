/**
 * UAT-7 P3-24 verification — Plaid "brokerage" top-level account type
 *
 * Asserts that `PlaidAdapter.normalizeAccounts` correctly maps accounts with
 * `type: "brokerage"` (in addition to `type: "investment"`) to the
 * `"investment"` AccountCategory, so they contribute to Net Worth → Assets.
 *
 * Also regression-tests:
 * - The expanded INVESTMENT_SUBTYPES set (RRSP, TFSA, HSA, 529, GIC, etc.)
 * - That non-investment account types still map correctly (checking, savings, credit).
 *
 * Run: npx tsx uat-reports/verify-p3-24-plaid-brokerage.ts
 */

import { plaidAdapter } from "../server/lib/financial-engine/adapters/plaid-adapter";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

console.log("\n=== P3-24 Plaid Brokerage Top-Level Type ===\n");

// --- Test 1: type: "brokerage" maps to "investment"
const brokerageAccount = {
  id: "acc-brokerage-1",
  name: "Fidelity Brokerage",
  type: "brokerage",
  subtype: null,
  balanceCurrent: 125000,
  isActive: "true",
};
const [normBrokerage] = plaidAdapter.normalizeAccounts([brokerageAccount]);
assert(
  normBrokerage.accountType === "investment",
  `type:"brokerage" → accountType === "investment" (got "${normBrokerage.accountType}")`,
);
assert(normBrokerage.balance === 125000, `balance preserved (${normBrokerage.balance})`);
assert(normBrokerage.provider === "Plaid", `provider === "Plaid"`);

// --- Test 2: type: "investment" still maps (primary trigger)
const investmentAccount = {
  id: "acc-inv-1",
  name: "Vanguard IRA",
  type: "investment",
  subtype: "ira",
  balanceCurrent: 85000,
  isActive: "true",
};
const [normInvestment] = plaidAdapter.normalizeAccounts([investmentAccount]);
assert(
  normInvestment.accountType === "investment",
  `type:"investment" → accountType === "investment" (got "${normInvestment.accountType}")`,
);

// --- Test 3: subtype fallback — type absent, subtype "rrsp" (Canada) → investment
const rrspAccount = {
  id: "acc-rrsp-1",
  name: "TD RRSP",
  type: null,
  subtype: "rrsp",
  balanceCurrent: 50000,
  isActive: "true",
};
const [normRrsp] = plaidAdapter.normalizeAccounts([rrspAccount]);
assert(
  normRrsp.accountType === "investment",
  `subtype:"rrsp" (no type) → accountType === "investment" (got "${normRrsp.accountType}")`,
);

// --- Test 4: TFSA subtype with no type → investment (fallback path from P3-23)
// Note: per UAT-7 spec, subtypes are the FALLBACK — a TFSA delivered with
// explicit `type: "depository"` stays "depository" (it's a cash TFSA savings
// account, not a brokerage). See Test 4b below for that case.
const tfsaAccount = {
  id: "acc-tfsa-1",
  name: "BMO TFSA (Brokerage)",
  type: null,
  subtype: "tfsa",
  balanceCurrent: 15000,
  isActive: "true",
};
const [normTfsa] = plaidAdapter.normalizeAccounts([tfsaAccount]);
assert(
  normTfsa.accountType === "investment",
  `subtype:"tfsa" (no type) → accountType === "investment" (got "${normTfsa.accountType}")`,
);

// --- Test 4b: TFSA on type:"depository" stays "depository" (per spec)
// This represents a cash/HISA TFSA at a bank, which the user has opted to
// track as a savings-style vehicle. Behavior is intentional per UAT-7 docs.
const tfsaCashAccount = {
  id: "acc-tfsa-cash",
  name: "TFSA HISA",
  type: "depository",
  subtype: "tfsa",
  balanceCurrent: 15000,
  isActive: "true",
};
const [normTfsaCash] = plaidAdapter.normalizeAccounts([tfsaCashAccount]);
assert(
  normTfsaCash.accountType === "depository",
  `subtype:"tfsa" with type:"depository" stays "depository" per spec (got "${normTfsaCash.accountType}")`,
);

// --- Test 5: HSA subtype → investment
const hsaAccount = {
  id: "acc-hsa-1",
  name: "Health Savings",
  type: null,
  subtype: "hsa",
  balanceCurrent: 8500,
  isActive: "true",
};
const [normHsa] = plaidAdapter.normalizeAccounts([hsaAccount]);
assert(normHsa.accountType === "investment", `subtype:"hsa" → accountType === "investment"`);

// --- Test 6: 529 subtype → investment
const fiveTwentyNineAccount = {
  id: "acc-529-1",
  name: "College Savings",
  type: null,
  subtype: "529",
  balanceCurrent: 22000,
  isActive: "true",
};
const [norm529] = plaidAdapter.normalizeAccounts([fiveTwentyNineAccount]);
assert(norm529.accountType === "investment", `subtype:"529" → accountType === "investment"`);

// --- Test 7: GIC subtype → investment
const gicAccount = {
  id: "acc-gic-1",
  name: "GIC - 2 Year",
  type: null,
  subtype: "gic",
  balanceCurrent: 10000,
  isActive: "true",
};
const [normGic] = plaidAdapter.normalizeAccounts([gicAccount]);
assert(normGic.accountType === "investment", `subtype:"gic" → accountType === "investment"`);

// --- Test 8: Regression — checking/savings/credit still map correctly
const checkingAccount = {
  id: "acc-chk",
  name: "Checking",
  type: "depository",
  subtype: "checking",
  balanceCurrent: 2500,
  isActive: "true",
};
const [normChecking] = plaidAdapter.normalizeAccounts([checkingAccount]);
assert(normChecking.accountType === "checking", `subtype:"checking" → "checking" (regression)`);

const savingsAccount = { ...checkingAccount, id: "acc-sav", subtype: "savings" };
const [normSavings] = plaidAdapter.normalizeAccounts([savingsAccount]);
assert(normSavings.accountType === "savings", `subtype:"savings" → "savings" (regression)`);

const creditAccount = { id: "acc-cc", name: "Visa", type: "credit", subtype: "credit card", balanceCurrent: -850, isActive: "true" };
const [normCredit] = plaidAdapter.normalizeAccounts([creditAccount]);
assert(normCredit.accountType === "credit", `type:"credit" → "credit" (regression)`);

// --- Test 9: Unknown subtype on depository (not in investment set) → "other"
const unknownAccount = {
  id: "acc-unknown",
  name: "Weird Account",
  type: "depository",
  subtype: "paypal",
  balanceCurrent: 100,
  isActive: "true",
};
const [normUnknown] = plaidAdapter.normalizeAccounts([unknownAccount]);
// "depository" with unknown subtype should map to "depository", NOT "investment".
assert(
  normUnknown.accountType === "depository",
  `type:"depository", unknown subtype → "depository" (got "${normUnknown.accountType}")`,
);

// --- Test 10: Batch normalization preserves order and count
const batch = plaidAdapter.normalizeAccounts([
  brokerageAccount,      // investment
  investmentAccount,     // investment
  rrspAccount,           // investment (subtype fallback)
  tfsaAccount,           // investment (subtype fallback, no type)
  hsaAccount,            // investment
  checkingAccount,       // checking
]);
assert(batch.length === 6, `batch normalization returns 6 accounts (got ${batch.length})`);
const investmentCount = batch.filter((a) => a.accountType === "investment").length;
assert(investmentCount === 5, `5 of 6 accounts normalize to "investment" (got ${investmentCount})`);

console.log("\n=== Summary ===");
if (process.exitCode === 1) {
  console.log("P3-24: FAILED — see failures above.");
} else {
  console.log("P3-24: ALL PASSED — Plaid brokerage/investment mapping is correct.");
}
