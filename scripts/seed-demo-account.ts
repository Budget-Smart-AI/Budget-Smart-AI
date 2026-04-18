/**
 * Seed Demo Account — Edge-Case Income Scenarios
 * ───────────────────────────────────────────────
 *
 * Generates ~12 months of synthetic bank-style data targeting every edge case
 * the income engine must handle. Designed to surface UAT-6-class bugs *before*
 * a real user finds them.
 *
 * Run:
 *   npx tsx scripts/seed-demo-account.ts [--user <userId>] [--reset] [--year <YYYY>]
 *
 * Defaults:
 *   --user   "demo-user-001"  (the built-in demo account)
 *   --year   current calendar year
 *   --reset  if present, wipe the user's existing income/registry/manual data
 *            for the target year before seeding (idempotent re-runs).
 *
 * Scenarios covered (mapped to RECURRENCE_OPTIONS × INCOME_SOURCE_MODES):
 *
 *   1. Coreslab Inc        biweekly  fixed    + May 1 rate change ($1,927→$2,300)
 *      └─ Tests: 3-paycheck biweekly months, mid-year raise via amount-history
 *   2. Roche PHARMA        biweekly  fixed    constant $4,000
 *      └─ Tests: paired biweekly source on a different anchor day
 *   3. Acme Consulting     monthly   variable amount swings $2,800–$5,100
 *      └─ Tests: variable-mode rolling-average projection
 *   4. Etsy Storefront     irregular irregular sporadic $250–$2,400 deposits
 *      └─ Tests: no future projection, actuals-only display
 *   5. Schwab Dividends    yearly    fixed    quarterly $325–$390 → maps yearly
 *      └─ Tests: PFC INCOME_DIVIDENDS → Investments category
 *   6. Amare Affiliate     monthly   variable $50–$300 affiliate payouts
 *      └─ Tests: affiliate → Other (NOT Salary) — UAT-6 bug case
 *   7. Mom Birthday Gift   one_time  irregular single $500 transfer
 *      └─ Tests: transfers → Other Income
 *   8. Chase Interest      monthly   fixed    sub-$2 monthly interest
 *      └─ Tests: <$2 → Interest (NOT Salary)
 *   9. Treasury Bond       yearly    fixed    single $850 annual coupon
 *      └─ Tests: yearly cadence projection
 *  10. Tax Refund          one_time  irregular single $2,400 in March
 *      └─ Tests: one_time recurrence
 *  11. Contoso W-2         semimonthly fixed   15th + last, $3,200
 *      └─ Tests: semimonthly cadence + day-pair anchor
 *  12. RSU Vest            irregular irregular single $12,000 in Q1
 *      └─ Tests: large irregular bonus, doesn't pollute monthly projections
 *
 * Plus a baseline of recurring expenses so balances look realistic.
 */

import { randomUUID } from "crypto";
import { db } from "../server/db";
import {
  manualAccounts,
  manualTransactions,
  incomeSources,
  incomeSourceAmounts,
  income as incomeTable,
} from "../shared/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import {
  classifyDepositsForRegistry,
  normalizeSourceName,
  type DepositSample,
} from "../server/lib/financial-engine/categories/registry-classifier";

// ─────────────────────────────────────────────────────────────────────────────
// CLI args

function parseArgs(argv: string[]) {
  const out: { user: string; reset: boolean; year: number; verbose: boolean } = {
    user: "demo-user-001",
    reset: false,
    year: new Date().getFullYear(),
    verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--user") out.user = argv[++i] ?? out.user;
    else if (a === "--year") out.year = parseInt(argv[++i] ?? "", 10) || out.year;
    else if (a === "--reset") out.reset = true;
    else if (a === "--verbose" || a === "-v") out.verbose = true;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers (no date-fns dependency to keep the script self-contained)

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function lastDayOfMonth(year: number, monthIdx: number): number {
  return new Date(year, monthIdx + 1, 0).getDate();
}

/**
 * Walk a biweekly schedule from `anchor` covering [start, end] inclusive.
 * Used by Coreslab/Roche to land 3-paycheck months naturally.
 */
function biweeklyDates(anchor: Date, start: Date, end: Date): Date[] {
  const out: Date[] = [];
  // Walk back to the first occurrence ≤ start.
  let d = new Date(anchor);
  while (d > start) d = addDays(d, -14);
  while (d < start) d = addDays(d, 14);
  while (d <= end) {
    out.push(new Date(d));
    d = addDays(d, 14);
  }
  return out;
}

/**
 * Semimonthly: deposit on day1 and day2 of every month in [start, end].
 * "last" → use lastDayOfMonth.
 */
function semimonthlyDates(
  day1: number | "last",
  day2: number | "last",
  start: Date,
  end: Date,
): Date[] {
  const out: Date[] = [];
  const startYM = start.getFullYear() * 12 + start.getMonth();
  const endYM = end.getFullYear() * 12 + end.getMonth();
  for (let ym = startYM; ym <= endYM; ym++) {
    const y = Math.floor(ym / 12);
    const m = ym % 12;
    const d1 = day1 === "last" ? lastDayOfMonth(y, m) : day1;
    const d2 = day2 === "last" ? lastDayOfMonth(y, m) : day2;
    const a = new Date(y, m, d1);
    const b = new Date(y, m, d2);
    if (a >= start && a <= end) out.push(a);
    if (b >= start && b <= end && a.getTime() !== b.getTime()) out.push(b);
  }
  return out;
}

function monthlyDates(day: number, start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const startYM = start.getFullYear() * 12 + start.getMonth();
  const endYM = end.getFullYear() * 12 + end.getMonth();
  for (let ym = startYM; ym <= endYM; ym++) {
    const y = Math.floor(ym / 12);
    const m = ym % 12;
    const d = new Date(y, m, Math.min(day, lastDayOfMonth(y, m)));
    if (d >= start && d <= end) out.push(d);
  }
  return out;
}

/**
 * Deterministic pseudo-RNG so re-runs produce identical data.
 * (Simple LCG seeded from a string.)
 */
function makeRng(seed: string): () => number {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario definitions

interface DepositRow {
  date: Date;
  amount: number;
  merchant: string;
  category: string;
  pfcPrimary?: string;
  pfcDetailed?: string;
  isTransfer?: boolean;
}

function scenarioDeposits(year: number): DepositRow[] {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const rng = makeRng(`seed-demo-${year}`);
  const rows: DepositRow[] = [];

  // 1. Coreslab Inc — biweekly, fixed, mid-year rate change May 1
  //    Anchor: a Friday in early January.
  const coreslabAnchor = new Date(year, 0, 9); // Jan 9 (Friday in 2026)
  const rateChange = new Date(year, 4, 1); // May 1
  for (const d of biweeklyDates(coreslabAnchor, yearStart, yearEnd)) {
    const amount = d < rateChange ? 1927.0 : 2300.0;
    rows.push({
      date: d,
      amount,
      merchant: "Coreslab Inc Direct Dep",
      category: "Salary",
      pfcPrimary: "INCOME",
      pfcDetailed: "INCOME_WAGES",
    });
  }

  // 2. Roche PHARMA — biweekly, fixed, constant $4,000.
  //    Different anchor (Thursday) so paychecks don't collide visually.
  const rocheAnchor = new Date(year, 0, 15); // Jan 15
  for (const d of biweeklyDates(rocheAnchor, yearStart, yearEnd)) {
    rows.push({
      date: d,
      amount: 4000.0,
      merchant: "Roche PHARMA PAYROLL",
      category: "Salary",
      pfcPrimary: "INCOME",
      pfcDetailed: "INCOME_WAGES",
    });
  }

  // 3. Acme Consulting — variable monthly contractor pay.
  //    Amounts swing $2,800–$5,100 (CV ~20%, lands in "variable" band).
  const acmePattern = [3200, 4500, 2800, 5100, 3900, 4200, 3300, 4800, 3700, 4400, 3100, 4900];
  for (const d of monthlyDates(20, yearStart, yearEnd)) {
    rows.push({
      date: d,
      amount: acmePattern[d.getMonth()],
      merchant: "Acme Consulting LLC",
      category: "Freelance",
      pfcPrimary: "INCOME",
      pfcDetailed: "INCOME_OTHER_INCOME",
    });
  }

  // 4. Etsy Storefront — irregular small-business deposits.
  //    7 deposits across the year, amounts $250–$2,400.
  const etsyMonths = [1, 2, 4, 5, 7, 9, 11];
  for (const m of etsyMonths) {
    const day = 5 + Math.floor(rng() * 22);
    const amount = Math.round((250 + rng() * 2150) * 100) / 100;
    rows.push({
      date: new Date(year, m, day),
      amount,
      merchant: "Etsy Marketplace Payout",
      category: "Business",
      pfcPrimary: "INCOME",
      pfcDetailed: "INCOME_OTHER_INCOME",
    });
  }

  // 5. Schwab Dividends — quarterly, fixed-ish ($325–$390).
  //    Categorised as Investments via PFC INCOME_DIVIDENDS.
  for (let q = 0; q < 4; q++) {
    const m = q * 3 + 2; // Mar, Jun, Sep, Dec
    rows.push({
      date: new Date(year, m, 28),
      amount: Math.round((325 + rng() * 65) * 100) / 100,
      merchant: "Schwab Brokerage DIV",
      category: "Investments",
      pfcPrimary: "INCOME",
      pfcDetailed: "INCOME_DIVIDENDS",
    });
  }

  // 6. Amare Affiliate — monthly affiliate payouts.
  //    Variable $50–$300. CRITICAL: must classify as Other, NOT Salary.
  for (const d of monthlyDates(7, yearStart, yearEnd)) {
    rows.push({
      date: d,
      amount: Math.round((50 + rng() * 250) * 100) / 100,
      merchant: "Amare Global Affiliate",
      category: "Other",
      // No PFC INCOME_* subtype on purpose — forces the classifier into the
      // <$2 / unrecognised-PFC branch, which should fall back to Other.
    });
  }

  // 7. Mom Birthday Gift — one-time transfer.
  //    Tests: transfers should land as Other Income, not Salary.
  rows.push({
    date: new Date(year, 8, 12),
    amount: 500.0,
    merchant: "Transfer From Mom",
    category: "Gifts",
    isTransfer: true,
  });

  // 8. Chase Interest — monthly sub-$2 interest. Hard UAT-6 case: must be
  //    classified as Interest, not Salary.
  for (const d of monthlyDates(28, yearStart, yearEnd)) {
    rows.push({
      date: d,
      amount: Math.round((1.05 + rng() * 0.9) * 100) / 100,
      merchant: "Chase Savings Interest",
      category: "Interest",
      pfcPrimary: "INCOME",
      pfcDetailed: "INCOME_INTEREST_EARNED",
    });
  }

  // 9. Treasury Bond — single annual coupon.
  rows.push({
    date: new Date(year, 5, 15),
    amount: 850.0,
    merchant: "US Treasury Bond Coupon",
    category: "Investments",
    pfcPrimary: "INCOME",
    pfcDetailed: "INCOME_INTEREST_EARNED",
  });

  // 10. Tax Refund — one-time, March.
  rows.push({
    date: new Date(year, 2, 22),
    amount: 2400.0,
    merchant: "IRS Tax Refund",
    category: "Refunds",
    pfcPrimary: "INCOME",
    pfcDetailed: "INCOME_TAX_REFUND",
  });

  // 11. Contoso W-2 — semimonthly, 15th + last day, $3,200.
  for (const d of semimonthlyDates(15, "last", yearStart, yearEnd)) {
    rows.push({
      date: d,
      amount: 3200.0,
      merchant: "Contoso Industries Payroll",
      category: "Salary",
      pfcPrimary: "INCOME",
      pfcDetailed: "INCOME_WAGES",
    });
  }

  // 12. RSU Vest — large irregular bonus in Q1.
  rows.push({
    date: new Date(year, 1, 14),
    amount: 12000.0,
    merchant: "Contoso RSU Vest Bonus",
    category: "Other",
    pfcPrimary: "INCOME",
    pfcDetailed: "INCOME_OTHER_INCOME",
  });

  return rows;
}

/**
 * Recurring outflows so the demo balance doesn't grow unboundedly. Stored as
 * positive `manual_transactions.amount` (the storage layer treats positive as
 * an expense and reduces balance accordingly).
 */
function scenarioExpenses(year: number): DepositRow[] {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const rows: DepositRow[] = [];

  const monthlyBills: Array<{ day: number; merchant: string; amount: number; cat: string }> = [
    { day: 1, merchant: "Apartment Rent", amount: 2200, cat: "Mortgage" },
    { day: 5, merchant: "Geico Auto Insurance", amount: 185, cat: "Insurance" },
    { day: 10, merchant: "Toyota Financial", amount: 450, cat: "Credit Card" },
    { day: 15, merchant: "PG&E Electric", amount: 145, cat: "Electrical" },
    { day: 18, merchant: "SoCalGas", amount: 78, cat: "Utilities" },
    { day: 20, merchant: "Comcast Xfinity", amount: 79.99, cat: "Communications" },
    { day: 22, merchant: "Verizon Wireless", amount: 85, cat: "Phone" },
    { day: 12, merchant: "Netflix", amount: 15.99, cat: "Subscriptions" },
    { day: 18, merchant: "Spotify Family", amount: 16.99, cat: "Subscriptions" },
    { day: 9, merchant: "ChatGPT Plus", amount: 20, cat: "Subscriptions" },
  ];

  for (const b of monthlyBills) {
    for (const d of monthlyDates(b.day, yearStart, yearEnd)) {
      rows.push({
        date: d,
        amount: b.amount,
        merchant: b.merchant,
        category: b.cat,
      });
    }
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset (idempotent re-runs)

async function resetDemoData(userId: string, year: number): Promise<void> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  console.log(`[reset] Removing existing demo data for ${userId} year ${year}…`);

  // Wipe registry rows + their amount history
  const sources = await db.select().from(incomeSources).where(eq(incomeSources.userId, userId));
  for (const s of sources) {
    await db.delete(incomeSourceAmounts).where(eq(incomeSourceAmounts.sourceId, s.id));
  }
  await db.delete(incomeSources).where(eq(incomeSources.userId, userId));

  // Wipe legacy income journal rows for this year only
  await db
    .delete(incomeTable)
    .where(
      and(
        eq(incomeTable.userId, userId),
        gte(incomeTable.date, start),
        lte(incomeTable.date, end),
      ),
    );

  // Wipe manual accounts that we created (matches our naming convention)
  const accounts = await db
    .select()
    .from(manualAccounts)
    .where(eq(manualAccounts.userId, userId));
  const seededNames = new Set([
    "BSAI Demo — Primary Checking",
    "BSAI Demo — Savings",
    "BSAI Demo — Brokerage Cash",
  ]);
  for (const a of accounts) {
    if (!seededNames.has(a.name)) continue;
    await db.delete(manualTransactions).where(eq(manualTransactions.accountId, a.id));
    await db.delete(manualAccounts).where(eq(manualAccounts.id, a.id));
  }

  console.log(`[reset] Cleared ${sources.length} sources + ${accounts.length} accounts.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed

async function seed(userId: string, year: number, verbose: boolean): Promise<void> {
  console.log(`[seed] Generating ${year} edge-case data for ${userId}…`);

  // 1. Create three manual accounts so deposits/expenses route through realistic
  //    plumbing. We don't try to mirror Plaid here — the registry classifier
  //    treats Manual + Plaid the same via the adapter layer.
  const checking = await db
    .insert(manualAccounts)
    .values({
      userId,
      name: "BSAI Demo — Primary Checking",
      type: "cash",
      balance: "0",
      currency: "USD",
      isActive: "true",
      createdAt: new Date().toISOString(),
    })
    .returning();
  const savings = await db
    .insert(manualAccounts)
    .values({
      userId,
      name: "BSAI Demo — Savings",
      type: "cash",
      balance: "0",
      currency: "USD",
      isActive: "true",
      createdAt: new Date().toISOString(),
    })
    .returning();
  const brokerage = await db
    .insert(manualAccounts)
    .values({
      userId,
      name: "BSAI Demo — Brokerage Cash",
      type: "other",
      balance: "0",
      currency: "USD",
      isActive: "true",
      createdAt: new Date().toISOString(),
    })
    .returning();

  const checkingId = checking[0].id;
  const savingsId = savings[0].id;
  const brokerageId = brokerage[0].id;

  // 2. Insert all deposit transactions. Routing rule:
  //    - Investments / Interest → brokerage
  //    - Chase Savings Interest  → savings
  //    - everything else         → checking
  //    Deposits stored as negative `manual_transactions.amount` (the
  //    manual-adapter convention: `rawAmount < 0` → credit/income).
  const deposits = scenarioDeposits(year);
  let depositCount = 0;
  for (const d of deposits) {
    let acctId = checkingId;
    if (d.merchant.toLowerCase().includes("schwab") || d.merchant.toLowerCase().includes("treasury")) {
      acctId = brokerageId;
    } else if (d.merchant.toLowerCase().includes("savings interest")) {
      acctId = savingsId;
    }
    await db.insert(manualTransactions).values({
      accountId: acctId,
      userId,
      amount: (-Math.abs(d.amount)).toFixed(2),
      date: ymd(d.date),
      merchant: d.merchant,
      category: d.category,
      notes: d.pfcDetailed ?? null,
      isTransfer: d.isTransfer ? "true" : "false",
      createdAt: new Date().toISOString(),
    });
    depositCount++;
    if (verbose) console.log(`  + deposit ${ymd(d.date)} ${d.merchant} $${d.amount}`);
  }

  // 3. Insert recurring expense outflows.
  const expenses = scenarioExpenses(year);
  for (const e of expenses) {
    await db.insert(manualTransactions).values({
      accountId: checkingId,
      userId,
      amount: e.amount.toFixed(2),
      date: ymd(e.date),
      merchant: e.merchant,
      category: e.category,
      notes: null,
      isTransfer: "false",
      createdAt: new Date().toISOString(),
    });
  }

  // 4. Build the registry by running the same classifier that
  //    /api/income/registry/refresh uses. This gives us realistic
  //    auto-detection coverage and any classifier bug shows up here.
  const samples: DepositSample[] = deposits.map((d) => ({
    date: ymd(d.date),
    amount: Math.abs(d.amount),
    merchant: d.merchant,
    pfcPrimary: d.pfcPrimary ?? null,
    pfcDetailed: d.pfcDetailed ?? null,
  }));
  const classified = classifyDepositsForRegistry(samples, {
    today: new Date(year, 11, 31),
    minOccurrences: 1, // include the one-time scenarios for completeness
    minAmount: 0,      // include sub-$2 interest deposits (Chase Savings Interest)
  });

  let registryCount = 0;
  for (const c of classified) {
    // 4a. Coreslab is the marquee mid-year rate change. The classifier sees
    //     mixed amounts ($1,927 pre-May, $2,300 post-May) which pushes CV > 5%
    //     and makes the auto-detector call it "variable". But this is a textbook
    //     fixed-with-raise scenario — override mode to "fixed" so the assertion
    //     and the UI both reflect the real-world intent.
    const isCoreslab =
      c.normalizedSource === normalizeSourceName("Coreslab Inc Direct Dep");
    const insertMode = isCoreslab ? "fixed" : c.mode;

    const [src] = await db
      .insert(incomeSources)
      .values({
        userId,
        normalizedSource: c.normalizedSource,
        displayName: c.displayName,
        recurrence: c.recurrence,
        mode: insertMode,
        cadenceAnchor: c.cadenceAnchor,
        cadenceExtra: c.cadenceExtra ? JSON.stringify(c.cadenceExtra) : null,
        category: c.category,
        isActive: true,
        autoDetected: true,
        detectedAt: new Date(),
      })
      .returning();

    // Coreslab gets a proper amount-history with the Apr 30 closing of the
    // $1,927 row so past-month projections still show $1,927.
    if (isCoreslab) {
      await db.insert(incomeSourceAmounts).values({
        sourceId: src.id,
        amount: "1927.00",
        effectiveFrom: `${year}-01-01`,
        effectiveTo: `${year}-04-30`,
        reason: "Pre-May Canadian tax-bracket withholding",
      });
      await db.insert(incomeSourceAmounts).values({
        sourceId: src.id,
        amount: "2300.00",
        effectiveFrom: `${year}-05-01`,
        effectiveTo: null,
        reason: "May 1 Canadian tax-bracket change",
      });
    } else {
      await db.insert(incomeSourceAmounts).values({
        sourceId: src.id,
        amount: c.unitAmount.toFixed(2),
        effectiveFrom: `${year}-01-01`,
        effectiveTo: null,
        reason: "Seeded by demo script",
      });
    }
    registryCount++;
    if (verbose) {
      console.log(
        `  · registry ${c.displayName} → ${c.recurrence}/${c.mode} ${c.category} $${c.unitAmount}`,
      );
    }
  }

  // 5. Update account balances to the net of all deposits − expenses.
  const refresh = async (acctId: string) => {
    const txs = await db
      .select()
      .from(manualTransactions)
      .where(eq(manualTransactions.accountId, acctId));
    let balance = 0;
    for (const t of txs) balance -= parseFloat(t.amount); // mirror createManualTransaction
    await db
      .update(manualAccounts)
      .set({ balance: balance.toFixed(2) })
      .where(eq(manualAccounts.id, acctId));
  };
  await refresh(checkingId);
  await refresh(savingsId);
  await refresh(brokerageId);

  console.log(`[seed] Done. ${depositCount} deposits, ${expenses.length} expenses, ${registryCount} registry sources.`);
  console.log(`[seed] Account IDs: checking=${checkingId} savings=${savingsId} brokerage=${brokerageId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Edge-case assertions — run after seed to flag regressions.

interface Assertion {
  name: string;
  pass: boolean;
  detail: string;
}

async function runAssertions(userId: string, year: number): Promise<Assertion[]> {
  const out: Assertion[] = [];

  const sources = await db
    .select()
    .from(incomeSources)
    .where(eq(incomeSources.userId, userId));

  const find = (name: string) =>
    sources.find((s) => s.normalizedSource === normalizeSourceName(name));

  // A. Coreslab → biweekly + fixed
  const coreslab = find("Coreslab Inc Direct Dep");
  out.push({
    name: "Coreslab classified biweekly+fixed",
    pass: coreslab?.recurrence === "biweekly" && coreslab?.mode === "fixed",
    detail: `recurrence=${coreslab?.recurrence} mode=${coreslab?.mode}`,
  });

  // B. Coreslab amount history has both rows
  if (coreslab) {
    const rows = await db
      .select()
      .from(incomeSourceAmounts)
      .where(eq(incomeSourceAmounts.sourceId, coreslab.id));
    out.push({
      name: "Coreslab has 2 amount-history rows (raise scheduled)",
      pass: rows.length === 2,
      detail: rows.map((r) => `${r.effectiveFrom}→${r.effectiveTo ?? "open"} $${r.amount}`).join("; "),
    });
  }

  // C. Acme is variable mode
  const acme = find("Acme Consulting LLC");
  out.push({
    name: "Acme Consulting → variable mode",
    pass: acme?.mode === "variable",
    detail: `recurrence=${acme?.recurrence} mode=${acme?.mode}`,
  });

  // D. Etsy is irregular
  const etsy = find("Etsy Marketplace Payout");
  out.push({
    name: "Etsy → irregular (no projection)",
    pass: etsy?.mode === "irregular",
    detail: `recurrence=${etsy?.recurrence} mode=${etsy?.mode}`,
  });

  // E. Chase Interest → Interest category (UAT-6 sub-$2 case)
  const chase = find("Chase Savings Interest");
  out.push({
    name: "Chase Interest → Interest category",
    pass: chase?.category === "Interest",
    detail: `category=${chase?.category}`,
  });

  // F. Amare Affiliate → Other (NOT Salary). UAT-6 affiliate case.
  const amare = find("Amare Global Affiliate");
  out.push({
    name: "Amare Affiliate → Other (NOT Salary)",
    pass: amare?.category === "Other",
    detail: `category=${amare?.category}`,
  });

  // G. Schwab Dividends → Investments
  const schwab = find("Schwab Brokerage DIV");
  out.push({
    name: "Schwab DIV → Investments",
    pass: schwab?.category === "Investments",
    detail: `category=${schwab?.category}`,
  });

  // H. Contoso semimonthly cadence detected
  const contoso = find("Contoso Industries Payroll");
  out.push({
    name: "Contoso → semimonthly cadence",
    pass: contoso?.recurrence === "semimonthly",
    detail: `recurrence=${contoso?.recurrence} extra=${contoso?.cadenceExtra ?? "(none)"}`,
  });

  // I. There's a 3-paycheck month for Coreslab somewhere in the year
  const txs = await db
    .select()
    .from(manualTransactions)
    .where(eq(manualTransactions.userId, userId));
  const coreslabByMonth: Record<string, number> = {};
  for (const t of txs) {
    if (t.merchant.toLowerCase().includes("coreslab")) {
      const ym = t.date.slice(0, 7);
      coreslabByMonth[ym] = (coreslabByMonth[ym] ?? 0) + 1;
    }
  }
  const threePaycheckMonths = Object.entries(coreslabByMonth).filter(([, n]) => n === 3);
  out.push({
    name: "Coreslab biweekly produces a 3-paycheck month",
    pass: threePaycheckMonths.length > 0,
    detail: `3-paycheck months: ${threePaycheckMonths.map(([m, n]) => `${m}(${n})`).join(", ") || "(none)"}`,
  });

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`[demo-seed] user=${opts.user} year=${opts.year} reset=${opts.reset}`);

  if (opts.reset) {
    await resetDemoData(opts.user, opts.year);
  }

  await seed(opts.user, opts.year, opts.verbose);

  console.log(`\n[assertions] Running edge-case checks…\n`);
  const results = await runAssertions(opts.user, opts.year);
  let passed = 0;
  for (const r of results) {
    const tag = r.pass ? "PASS" : "FAIL";
    console.log(`  [${tag}] ${r.name}`);
    if (!r.pass || opts.verbose) console.log(`         ${r.detail}`);
    if (r.pass) passed++;
  }
  console.log(`\n[assertions] ${passed}/${results.length} passed`);

  if (passed < results.length) {
    process.exitCode = 1;
  }
}

main()
  .then(() => {
    console.log("[demo-seed] Done.");
    process.exit(process.exitCode ?? 0);
  })
  .catch((err) => {
    console.error("[demo-seed] FAILED:", err);
    process.exit(1);
  });
