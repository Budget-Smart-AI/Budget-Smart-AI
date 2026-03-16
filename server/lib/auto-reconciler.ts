/**
 * Auto-Reconciler
 *
 * Automatically matches Plaid transactions to bills and expenses,
 * and auto-creates expense records for unmatched spending transactions.
 *
 * Steps:
 *  0. Auto-detect income: create Income records for INCOME/Salary transactions (negative amounts)
 *  1. Match transactions → Bills (name similarity + amount within 10% + date within 5 days of dueDay)
 *     → On match: create bill_payments record + update bill lastPaidDate/nextDueDate
 *  2. Match transactions → Expenses (merchant fuzzy match + exact amount + date within 3 days)
 *  3. Auto-create Expense records for unmatched spending transactions
 *  4. (reserved)
 *  5. Auto-detect subscriptions from transactions flagged isSubscription=true
 *
 * Currency handling:
 *  - Transactions with isoCurrencyCode !== 'CAD' are flagged as foreign currency
 *  - Exchange rates are fetched from frankfurter.app (free, no API key required)
 *  - Rates are cached in the exchange_rates table for 24 hours
 *  - cadEquivalent is stored on auto-created expenses for correct CAD totals
 */

import { storage } from "../storage";
import { db } from "../db";
import { billPayments, bills as billsTable, spendingAlerts, notifications, users, exchangeRates, expenses, plaidTransactions } from "../../shared/schema";
import { eq, and, ilike, desc, sql } from "drizzle-orm";
import type { PlaidTransaction, Bill, Expense } from "../../shared/schema";
import { sendSpendingAlertEmail } from "../email";

// ─── Currency flag emoji map ──────────────────────────────────────────────────

const CURRENCY_FLAG: Record<string, string> = {
  USD: "🇺🇸",
  GBP: "🇬🇧",
  EUR: "🇪🇺",
  AUD: "🇦🇺",
  MXN: "🇲🇽",
  JPY: "🇯🇵",
  CHF: "🇨🇭",
  HKD: "🇭🇰",
  SGD: "🇸🇬",
  NZD: "🇳🇿",
  SEK: "🇸🇪",
  NOK: "🇳🇴",
  DKK: "🇩🇰",
  INR: "🇮🇳",
  BRL: "🇧🇷",
  ZAR: "🇿🇦",
};

// ─── In-memory exchange rate cache (TTL: 24 hours) ───────────────────────────

interface CachedRate {
  rate: number;
  fetchedAt: number; // epoch ms
}

const rateCache = new Map<string, CachedRate>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch the CAD exchange rate for a given currency from frankfurter.app.
 * Results are cached in-memory AND persisted to the exchange_rates table.
 * Falls back to 1.0 if the API is unreachable (safe no-op for CAD).
 */
async function getExchangeRate(fromCurrency: string): Promise<number> {
  if (fromCurrency === "CAD") return 1.0;

  const cacheKey = `${fromCurrency}->CAD`;
  const cached = rateCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rate;
  }

  // Check DB cache first (avoids hitting API on every server restart)
  try {
    const dbRow = await db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.fromCurrency, fromCurrency),
          eq(exchangeRates.toCurrency, "CAD")
        )
      )
      .orderBy(desc(exchangeRates.fetchedAt))
      .limit(1);

    if (dbRow.length > 0) {
      const row = dbRow[0];
      const ageMs = Date.now() - new Date(row.fetchedAt).getTime();
      if (ageMs < CACHE_TTL_MS) {
        const rate = parseFloat(row.rate as string);
        rateCache.set(cacheKey, { rate, fetchedAt: Date.now() });
        return rate;
      }
    }
  } catch (dbErr) {
    console.warn(`[AutoReconciler] DB rate cache lookup failed for ${fromCurrency}:`, dbErr);
  }

  // Fetch fresh rate from frankfurter.app
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=${fromCurrency}&to=CAD`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rate: number = data.rates?.CAD;
    if (!rate || typeof rate !== "number") throw new Error("No CAD rate in response");

    // Persist to DB
    try {
      await db.insert(exchangeRates).values({
        fromCurrency,
        toCurrency: "CAD",
        rate: String(rate),
      });
    } catch (insertErr) {
      console.warn(`[AutoReconciler] Could not persist exchange rate for ${fromCurrency}:`, insertErr);
    }

    // Update in-memory cache
    rateCache.set(cacheKey, { rate, fetchedAt: Date.now() });
    console.log(`[AutoReconciler] Fetched exchange rate: 1 ${fromCurrency} = ${rate} CAD`);
    return rate;
  } catch (err) {
    console.error(`[AutoReconciler] Failed to fetch exchange rate for ${fromCurrency}:`, err);
    // Return last known DB rate as fallback, or 1.0
    try {
      const fallback = await db
        .select()
        .from(exchangeRates)
        .where(
          and(
            eq(exchangeRates.fromCurrency, fromCurrency),
            eq(exchangeRates.toCurrency, "CAD")
          )
        )
        .orderBy(desc(exchangeRates.fetchedAt))
        .limit(1);
      if (fallback.length > 0) {
        return parseFloat(fallback[0].rate as string);
      }
    } catch (_) { /* ignore */ }
    return 1.0; // safe fallback — amounts will be stored as-is
  }
}

/**
 * Refresh exchange rates for a list of currencies and persist to DB.
 * Called by the daily cron scheduler.
 */
export async function refreshExchangeRates(
  currencies: string[] = ["USD", "GBP", "EUR", "AUD", "MXN"]
): Promise<void> {
  console.log(`[AutoReconciler] Refreshing exchange rates for: ${currencies.join(", ")}`);
  for (const currency of currencies) {
    // Clear in-memory cache to force a fresh fetch
    rateCache.delete(`${currency}->CAD`);
    try {
      const rate = await getExchangeRate(currency);
      console.log(`[AutoReconciler] Rate refreshed: 1 ${currency} = ${rate} CAD`);
    } catch (err) {
      console.error(`[AutoReconciler] Failed to refresh rate for ${currency}:`, err);
    }
  }
}

// ─── Known Subscriptions Lookup ──────────────────────────────────────────────

/**
 * Common Canadian/North American subscription services with their billing cycles.
 * Used to improve billing-cycle detection accuracy when transaction history is limited.
 */
const KNOWN_SUBSCRIPTIONS: Array<{ merchant: string; cycle: string }> = [
  { merchant: "Netflix", cycle: "monthly" },
  { merchant: "Spotify", cycle: "monthly" },
  { merchant: "Disney Plus", cycle: "monthly" },
  { merchant: "Disney+", cycle: "monthly" },
  { merchant: "Apple", cycle: "monthly" },
  { merchant: "Amazon", cycle: "monthly" },
  { merchant: "Google One", cycle: "monthly" },
  { merchant: "OpenAI", cycle: "monthly" },
  { merchant: "Claude", cycle: "monthly" },
  { merchant: "LinkedIn", cycle: "monthly" },
  { merchant: "Crunch Fitness", cycle: "monthly" },
  { merchant: "Peloton", cycle: "monthly" },
  { merchant: "YouTube", cycle: "monthly" },
  { merchant: "GitHub", cycle: "monthly" },
  { merchant: "Bell", cycle: "monthly" },
  { merchant: "Rogers", cycle: "monthly" },
  { merchant: "Telus", cycle: "monthly" },
  { merchant: "Fido", cycle: "monthly" },
  { merchant: "Koodo", cycle: "monthly" },
  { merchant: "Freedom Mobile", cycle: "monthly" },
  { merchant: "Enbridge", cycle: "monthly" },
  { merchant: "Alectra", cycle: "monthly" },
  { merchant: "AWS", cycle: "monthly" },
  { merchant: "Manychat", cycle: "monthly" },
  { merchant: "Elest.io", cycle: "monthly" },
];

/**
 * Returns the billing cycle for a known subscription merchant, or null if not found.
 */
function lookupKnownCycle(merchantName: string): string | null {
  const lower = merchantName.toLowerCase().trim();
  for (const known of KNOWN_SUBSCRIPTIONS) {
    if (lower.includes(known.merchant.toLowerCase())) {
      return known.cycle;
    }
  }
  return null;
}

// Categories that should NOT auto-create expenses or subscriptions
const SKIP_CATEGORIES = [
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'TRANSFER',
  'LOAN_PAYMENTS',
  'LOAN_DISBURSEMENTS',
  'INCOME',
  'PAYROLL',
  'DIRECT_DEPOSIT',
  'BANK_FEES',
];

const SKIP_MERCHANT_KEYWORDS = [
  'customer transfer',
  'bank transfer',
  'mb transfer',
  'interac e-transfer',
  'interac etransfer',
  'e-transfer deposit',
  'credit card payment',
  'visa payment',
  'mastercard payment',
  'loc payment',
  'line of credit',
  'mortgage payment',
  'mortgage trans',
  'loan payment',
  'loan payment transfer',
  'scotiabank transit',
  'atm withdrawal',
  'abm withdrawal',
  'cash advance',
  'bank fee',
  'overdraft',
  'nsf fee',
  'service charge',
  'monthly fees',
  'interest charges',
  'overlimit fee',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns true if two strings share a meaningful substring match (case-insensitive).
 */
function nameMatches(a: string, b: string): boolean {
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();
  return aLower.includes(bLower) || bLower.includes(aLower);
}

/**
 * Returns true if |actual - expected| / expected <= tolerance (default 10%).
 */
function amountWithinTolerance(
  actual: number,
  expected: number,
  tolerance = 0.1
): boolean {
  if (expected === 0) return actual === 0;
  return Math.abs(actual - expected) / Math.abs(expected) <= tolerance;
}

/**
 * Returns the absolute difference in days between two yyyy-MM-dd strings.
 */
function daysDiff(dateA: string, dateB: string): number {
  const msPerDay = 86_400_000;
  return Math.abs(
    new Date(dateA).getTime() - new Date(dateB).getTime()
  ) / msPerDay;
}

/**
 * Builds a yyyy-MM-dd string for the given dueDay in the same month as txDate.
 * Clamps to the last day of the month if dueDay > days-in-month.
 */
function dueDateForMonth(txDate: string, dueDay: number): string {
  const d = new Date(txDate);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-based
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const clampedDay = Math.min(dueDay, lastDay);
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(clampedDay).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Returns the YYYY-MM month string for a given yyyy-MM-dd date.
 */
function monthOf(date: string): string {
  return date.substring(0, 7); // "2026-03"
}

/**
 * Calculates the next due date after a payment, based on recurrence.
 * Returns a yyyy-MM-dd string.
 */
function calcNextDueDate(paidDate: string, recurrence: string, dueDay: number): string {
  const d = new Date(paidDate);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-based

  if (recurrence === "monthly") {
    // Next month, same dueDay
    const nextMonth = month + 1;
    const nextYear = nextMonth > 11 ? year + 1 : year;
    const normalizedMonth = nextMonth > 11 ? 0 : nextMonth;
    const lastDay = new Date(Date.UTC(nextYear, normalizedMonth + 1, 0)).getUTCDate();
    const clampedDay = Math.min(dueDay, lastDay);
    const mm = String(normalizedMonth + 1).padStart(2, "0");
    const dd = String(clampedDay).padStart(2, "0");
    return `${nextYear}-${mm}-${dd}`;
  }

  if (recurrence === "weekly") {
    // Add 7 days
    const next = new Date(d);
    next.setUTCDate(next.getUTCDate() + 7);
    return next.toISOString().substring(0, 10);
  }

  if (recurrence === "biweekly") {
    // Add 14 days
    const next = new Date(d);
    next.setUTCDate(next.getUTCDate() + 14);
    return next.toISOString().substring(0, 10);
  }

  if (recurrence === "yearly") {
    // Same day next year
    const lastDay = new Date(Date.UTC(year + 1, month + 1, 0)).getUTCDate();
    const clampedDay = Math.min(dueDay, lastDay);
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(clampedDay).padStart(2, "0");
    return `${year + 1}-${mm}-${dd}`;
  }

  // Default: monthly
  const nextMonth = month + 1;
  const nextYear = nextMonth > 11 ? year + 1 : year;
  const normalizedMonth = nextMonth > 11 ? 0 : nextMonth;
  const lastDay = new Date(Date.UTC(nextYear, normalizedMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(dueDay, lastDay);
  const mm = String(normalizedMonth + 1).padStart(2, "0");
  const dd = String(clampedDay).padStart(2, "0");
  return `${nextYear}-${mm}-${dd}`;
}

// ─── Spending Alert Helpers ──────────────────────────────────────────────────

function getAlertPeriodStart(period: string | null): Date {
  const now = new Date();
  if (period === "weekly") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  // monthly (default)
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Returns the effective CAD amount for an expense.
 * Uses cadEquivalent if present, otherwise falls back to amount.
 */
function effectiveAmount(e: Expense): number {
  const cadEquiv = (e as any).cadEquivalent;
  if (cadEquiv !== null && cadEquiv !== undefined) {
    const parsed = parseFloat(cadEquiv);
    if (!isNaN(parsed)) return parsed;
  }
  return parseFloat(e.amount as string);
}

async function getCategorySpend(userId: string, category: string | null, periodStart: Date): Promise<number> {
  if (!category) return 0;
  const periodStartStr = periodStart.toISOString().substring(0, 10);
  const exps = await storage.getExpenses(userId);
  return exps
    .filter((e: Expense) => e.date >= periodStartStr && (e.category || "").toLowerCase() === category.toLowerCase())
    .reduce((sum: number, e: Expense) => sum + effectiveAmount(e), 0);
}

async function getTotalSpend(userId: string, periodStart: Date): Promise<number> {
  const periodStartStr = periodStart.toISOString().substring(0, 10);
  const exps = await storage.getExpenses(userId);
  return exps
    .filter((e: Expense) => e.date >= periodStartStr)
    .reduce((sum: number, e: Expense) => sum + effectiveAmount(e), 0);
}

async function getMerchantSpend(userId: string, merchantName: string | null, periodStart: Date): Promise<number> {
  if (!merchantName) return 0;
  const periodStartStr = periodStart.toISOString().substring(0, 10);
  const exps = await storage.getExpenses(userId);
  return exps
    .filter((e: Expense) => e.date >= periodStartStr && (e.merchant || "").toLowerCase().includes(merchantName.toLowerCase()))
    .reduce((sum: number, e: Expense) => sum + effectiveAmount(e), 0);
}

async function fireSpendingAlert(userId: string, alert: any, currentSpend: number): Promise<void> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const label = alert.category || alert.merchantName || "total spending";
  const message = `You've spent $${currentSpend.toFixed(2)} on ${label} this ${alert.period || "month"}. Your alert threshold was $${parseFloat(alert.threshold).toFixed(2)}.`;

  if (alert.notifyInApp) {
    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      userId,
      type: "spending_alert",
      title: "⚠️ Spending Alert",
      message,
      isRead: "false",
      createdAt: new Date().toISOString(),
    });
  }

  if (alert.notifyEmail && user?.email) {
    await sendSpendingAlertEmail(user, alert, currentSpend);
  }
}

async function checkSpendingAlerts(userId: string): Promise<void> {
  try {
    const alerts = await db.query.spendingAlerts.findMany({
      where: and(eq(spendingAlerts.userId, userId), eq(spendingAlerts.isActive, true)),
    });

    for (const alert of alerts) {
      let currentSpend = 0;
      const periodStart = getAlertPeriodStart(alert.period);

      if (alert.alertType === "category_monthly") {
        currentSpend = await getCategorySpend(userId, alert.category, periodStart);
      } else if (alert.alertType === "total_monthly") {
        currentSpend = await getTotalSpend(userId, periodStart);
      } else if (alert.alertType === "merchant") {
        currentSpend = await getMerchantSpend(userId, alert.merchantName, periodStart);
      } else if (alert.alertType === "single_transaction") {
        continue; // handled per-transaction elsewhere
      }

      const threshold = parseFloat(alert.threshold as string);
      if (currentSpend >= threshold) {
        const alreadyFired = alert.lastTriggeredAt && alert.lastTriggeredAt >= periodStart;
        if (!alreadyFired) {
          await fireSpendingAlert(userId, alert, currentSpend);
          await db.update(spendingAlerts).set({ lastTriggeredAt: new Date() }).where(eq(spendingAlerts.id, alert.id));
        }
      }
    }
  } catch (err) {
    console.error("[AutoReconciler] checkSpendingAlerts error:", err);
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Run the full auto-reconciliation pipeline for a given user.
 * Safe to call multiple times — already-reconciled transactions are skipped.
 */
export async function autoReconcile(userId: string): Promise<{
  billMatches: number;
  expenseMatches: number;
  autoCreated: number;
  incomeCreated: number;
  subscriptionsCreated: number;
  subscriptionsUpdated: number;
}> {
  console.log(`[AutoReconciler] Starting reconciliation for user ${userId}`);

  // ── Fetch data ──────────────────────────────────────────────────────────
  const [plaidAccounts, bills, existingExpenses] = await Promise.all([
    storage.getAllPlaidAccounts(userId),
    storage.getBills(userId),
    storage.getExpenses(userId),
  ]);

  if (plaidAccounts.length === 0) {
    console.log(`[AutoReconciler] No Plaid accounts for user ${userId}, skipping.`);
    return { billMatches: 0, expenseMatches: 0, autoCreated: 0, incomeCreated: 0, subscriptionsCreated: 0, subscriptionsUpdated: 0 };
  }

  const accountIds = plaidAccounts.map((a) => a.id);

  // Fetch ALL transactions for this user (not just unmatched) so we can
  // re-evaluate any that may have been missed on a previous run.
  // We use getUnmatchedTransactions which already filters reconciled=false
  // AND matchedExpenseId IS NULL AND matchType = 'unmatched' to prevent
  // re-creating expenses for transactions already processed in a previous
  // bank connection session (reconnection protection).
  const unmatched = await storage.getUnmatchedTransactions(accountIds);

  if (unmatched.length === 0) {
    console.log(`[AutoReconciler] No unmatched transactions for user ${userId}.`);
    return { billMatches: 0, expenseMatches: 0, autoCreated: 0, incomeCreated: 0, subscriptionsCreated: 0, subscriptionsUpdated: 0 };
  }

  console.log(
    `[AutoReconciler] Processing ${unmatched.length} unmatched transactions for user ${userId}`
  );

  let billMatches = 0;
  let expenseMatches = 0;
  let autoCreated = 0;
  let incomeCreated = 0;
  let subscriptionsCreated = 0;
  let subscriptionsUpdated = 0;

  // Work through a mutable copy so we can mark items as handled
  const pending: PlaidTransaction[] = [...unmatched];

  // ── STEP 0: Auto-detect Income ───────────────────────────────────────────
  for (const tx of pending) {
    if (tx.reconciled === "true") continue;

    const txAmount = parseFloat(tx.amount as string);
    const cat = (tx.category || "").toUpperCase();
    const personalCat = (tx.personalCategory || "").toLowerCase();

    // Income transactions: category === 'INCOME' OR personalCategory === 'Salary'
    // AND amount is NEGATIVE (Plaid uses negative for money coming IN on checking accounts)
        // Expanded income detection: catch all common income/payroll categories
        const isIncomeCategory =
          cat === "INCOME" ||
          cat === "PAYROLL" ||
          cat === "DIRECT_DEPOSIT" ||
          personalCat === "salary" ||
          personalCat === "payroll" ||
          personalCat === "income" ||
          personalCat === "direct_deposit" ||
          personalCat === "wages";
        if (!isIncomeCategory) continue;
    if (txAmount >= 0) continue; // must be negative (money in)

    const source = tx.merchantCleanName || tx.name || "Unknown";
    const absAmount = Math.abs(txAmount);
    const incomeCategory = personalCat === "salary" ? "Employment" : "Other";

    try {
      const newIncome = await storage.createIncome({
        userId,
        source,
        amount: String(absAmount),
        date: tx.date,
        category: incomeCategory,
        isRecurring: "false",
        notes: "Auto-imported from bank transaction",
      });

      await storage.updatePlaidTransaction(tx.id, {
        matchType: "income",
        matchedIncomeId: newIncome.id,
        reconciled: "true",
      });

      tx.reconciled = "true";
      incomeCreated++;
      console.log(
        `[AutoReconciler] Auto-created income: "${source}" $${absAmount} on ${tx.date} (${incomeCategory})`
      );
    } catch (err) {
      console.error(
        `[AutoReconciler] Failed to auto-create income for tx ${tx.id}:`,
        err
      );
    }
  }

  // ── STEP 1: Match to Bills ───────────────────────────────────────────────
  for (const tx of pending) {
    if (tx.reconciled === "true") continue;

    const txAmount = Math.abs(parseFloat(tx.amount as string));
    const txMerchant = (tx.merchantCleanName || tx.name || "").toLowerCase().trim();

    for (const bill of bills) {
      const billAmount = parseFloat(bill.amount as string);
      const billName = (bill.name || "").toLowerCase().trim();

      // Name match
      if (!nameMatches(txMerchant, billName)) continue;

      // Amount within 10%
      if (!amountWithinTolerance(txAmount, billAmount, 0.1)) continue;

      // Date within 5 days of dueDay for the transaction's month
      const expectedDueDate = dueDateForMonth(tx.date, bill.dueDay);
      if (daysDiff(tx.date, expectedDueDate) > 5) continue;

      // ✅ Match found — update transaction
      await storage.updatePlaidTransaction(tx.id, {
        matchType: "bill",
        matchedBillId: bill.id,
        reconciled: "true",
      });

      tx.reconciled = "true"; // mark in-memory so step 2/3 skip it
      billMatches++;
      console.log(
        `[AutoReconciler] Bill match: tx "${tx.name}" (${tx.amount}) → bill "${bill.name}" (${bill.amount})`
      );

      // ── Create bill_payments record ──────────────────────────────────────
      const paymentMonth = monthOf(tx.date);
      try {
        await db.insert(billPayments).values({
          userId,
          billId: bill.id,
          transactionId: tx.id,
          amount: String(txAmount),
          paidDate: tx.date,
          month: paymentMonth,
          status: "paid",
        });
        console.log(
          `[AutoReconciler] Created bill_payment for bill "${bill.name}" month ${paymentMonth}`
        );
      } catch (err) {
        // Non-fatal: log but continue (e.g. duplicate payment for same month)
        console.warn(
          `[AutoReconciler] Could not insert bill_payment for bill ${bill.id}:`,
          err
        );
      }

      // ── Update bill record with payment info ─────────────────────────────
      try {
        const nextDueDate = calcNextDueDate(tx.date, bill.recurrence, bill.dueDay);
        await storage.updateBill(bill.id, {
          // These fields don't exist on the bills table yet — we store them
          // via the existing notes/merchant fields as a fallback, but the
          // primary record is in bill_payments. If the bills table is later
          // extended with lastPaidDate/nextDueDate columns, update here.
        } as any);
        // For now, log the computed next due date
        console.log(
          `[AutoReconciler] Bill "${bill.name}" next due: ${nextDueDate} (paid ${tx.date})`
        );
      } catch (err) {
        console.warn(
          `[AutoReconciler] Could not update bill ${bill.id} after payment:`,
          err
        );
      }

      break; // first match wins
    }
  }

  // ── STEP 2: Match to Expenses ────────────────────────────────────────────
  for (const tx of pending) {
    if (tx.reconciled === "true") continue;

    const txAmount = Math.abs(parseFloat(tx.amount as string));
    const txMerchant = (tx.merchantCleanName || tx.name || "").toLowerCase().trim();

    for (const exp of existingExpenses) {
      const expAmount = parseFloat(exp.amount as string);
      const expMerchant = (exp.merchant || "").toLowerCase().trim();

      // Merchant fuzzy match
      if (!nameMatches(txMerchant, expMerchant)) continue;

      // Exact amount match
      if (Math.abs(txAmount - expAmount) > 0.01) continue;

      // Date within 3 days
      if (daysDiff(tx.date, exp.date) > 3) continue;

      // ✅ Match found
      await storage.updatePlaidTransaction(tx.id, {
        matchType: "expense",
        matchedExpenseId: exp.id,
        reconciled: "true",
      });

      tx.reconciled = "true";
      expenseMatches++;
      console.log(
        `[AutoReconciler] Expense match: tx "${tx.name}" (${tx.amount}) → expense "${exp.merchant}" (${exp.amount})`
      );
      break;
    }
  }

  // ── STEP 3: Auto-create Expenses for remaining unmatched transactions ────
  for (const tx of pending) {
    if (tx.reconciled === "true") continue;

    // Skip if already matched to an expense (reconnection protection)
    if (tx.matchedExpenseId) {
      console.log(`[AutoReconciler] Skipping already-matched tx: ${tx.name} (matchedExpenseId: ${tx.matchedExpenseId})`);
      continue;
    }

    // ── Fix 1: Comprehensive skip checks ────────────────────────────────
    const category = tx.category || '';
    const personalCat = tx.personalCategory || '';
    const merchantName = (
      tx.merchantCleanName ||
      tx.name || ''
    ).toLowerCase();

    const skipByCategory =
      SKIP_CATEGORIES.includes(category) ||
      SKIP_CATEGORIES.includes(personalCat) ||
      SKIP_CATEGORIES.includes(category.toUpperCase()) ||
      SKIP_CATEGORIES.includes(personalCat.toUpperCase()) ||
      category.toUpperCase().includes('TRANSFER') ||
      personalCat.toUpperCase().includes('TRANSFER') ||
      category.toUpperCase().includes('INCOME') ||
      personalCat.toUpperCase().includes('INCOME') ||
      category.toUpperCase().includes('BANK_FEE') ||
      personalCat.toUpperCase().includes('BANK_FEE');

    const skipByMerchant =
      SKIP_MERCHANT_KEYWORDS.some(keyword =>
        merchantName.includes(keyword)
      );

    // Negative amounts = income/credits, skip
    const txAmount = parseFloat(tx.amount as string);
    const skipByAmount = txAmount < 0;

    if (skipByCategory || skipByMerchant || skipByAmount) {
      console.log(`[AutoReconciler] Skipping non-expense: ${tx.name} $${tx.amount} reason: ${skipByCategory ? 'category' : skipByMerchant ? 'merchant' : 'amount'}`);
      continue;
    }

    // Only process spending (positive amount in Plaid = money leaving account)
    if (txAmount <= 0) continue;

    const merchant = tx.merchantCleanName || tx.name || "Unknown";

    // ── Fix 2: Prevent duplicate expenses ───────────────────────────────
    try {
      const existing = await db.query.expenses.findFirst({
        where: and(
          eq(expenses.userId, userId),
          eq(expenses.amount, tx.amount.toString()),
          eq(expenses.date, tx.date),
          sql`LOWER(${expenses.merchant}) = LOWER(${tx.merchantCleanName || tx.name || ''})`
        )
      });

      if (existing) {
        console.log(`[AutoReconciler] Duplicate expense skipped: ${tx.name} ${tx.date}`);
        // Still link the transaction to the existing expense
        await storage.updatePlaidTransaction(tx.id, {
          matchedExpenseId: existing.id,
          matchType: 'expense',
          reconciled: 'true',
        });
        tx.reconciled = 'true';
        continue;
      }
    } catch (dupErr) {
      console.warn(`[AutoReconciler] Duplicate check failed for tx ${tx.id}:`, dupErr);
    }

    // Map Plaid/personal category to a valid expense category, defaulting to "Other"
    const expenseCategory = mapToExpenseCategory(tx.personalCategory || tx.category);

    // ── Currency detection & CAD conversion ─────────────────────────────
    const isoCurrency = (tx.isoCurrencyCode || "CAD").toUpperCase();
    const isForeignCurrency = isoCurrency !== "CAD";
    let cadEquivalent: number | null = null;
    let exchangeRate: number | null = null;
    let currencyNotes = "";

    if (isForeignCurrency) {
      try {
        exchangeRate = await getExchangeRate(isoCurrency);
        cadEquivalent = parseFloat((txAmount * exchangeRate).toFixed(2));
        const flag = CURRENCY_FLAG[isoCurrency] || "🌐";
        currencyNotes = `${flag} Original: $${txAmount.toFixed(2)} ${isoCurrency} | CAD equivalent: $${cadEquivalent.toFixed(2)} | Rate: 1 ${isoCurrency} = ${exchangeRate.toFixed(6)} CAD`;
        console.log(
          `[AutoReconciler] Foreign currency tx: ${txAmount} ${isoCurrency} → ${cadEquivalent} CAD (rate: ${exchangeRate})`
        );
      } catch (fxErr) {
        console.error(`[AutoReconciler] Currency conversion failed for tx ${tx.id}:`, fxErr);
      }
    }

    // Build notes: prepend currency info if foreign, then append auto-import note
    const baseNote = "Auto-imported from bank transaction";
    const notes = isForeignCurrency && currencyNotes
      ? `${currencyNotes} | ${baseNote}`
      : baseNote;

    try {
      const newExpense = await storage.createExpense({
        userId,
        merchant,
        // Store original amount; cadEquivalent is in notes and cadEquivalent field
        amount: String(txAmount),
        date: tx.date,
        category: expenseCategory,
        notes,
        taxDeductible: "false",
        taxCategory: null,
        isBusinessExpense: "false",
        // Pass through foreign currency metadata if the storage layer supports it
        ...(isForeignCurrency && cadEquivalent !== null ? {
          isoCurrencyCode: isoCurrency,
          cadEquivalent: String(cadEquivalent),
          exchangeRate: exchangeRate !== null ? String(exchangeRate) : null,
        } : {}),
      } as any);

      await storage.updatePlaidTransaction(tx.id, {
        matchType: "expense",
        matchedExpenseId: newExpense.id,
        reconciled: "true",
      });

      tx.reconciled = "true";
      autoCreated++;
      console.log(
        `[AutoReconciler] Auto-created expense: "${merchant}" $${txAmount}${isForeignCurrency ? ` ${isoCurrency} (~$${cadEquivalent} CAD)` : ""} on ${tx.date}`
      );
    } catch (err) {
      console.error(
        `[AutoReconciler] Failed to auto-create expense for tx ${tx.id}:`,
        err
      );
    }
  }

  // ── STEP 5: Auto-detect subscriptions ───────────────────────────────────
  // For each transaction flagged isSubscription=true, check if a subscription
  // bill already exists for this merchant. If not, create one. If yes, update
  // lastChargedDate info via notes.
  for (const tx of pending) {
    // Only process transactions flagged as subscriptions
    if ((tx.isSubscription || "false") !== "true") continue;

    // Only outgoing money (positive amount in Plaid = money leaving account)
    const txAmount = parseFloat(tx.amount as string);
    if (txAmount <= 0) continue;

    // Skip transfers and income categories
    const cat = (tx.personalCategory || tx.category || "").toUpperCase();
    if (
      SKIP_CATEGORIES.includes(cat) ||
      cat.includes("TRANSFER") ||
      cat.includes("INCOME")
    ) {
      continue;
    }

    const merchantName = tx.merchantCleanName || tx.merchantName || tx.name || "Unknown";

    try {
      // Check if a subscription bill already exists for this merchant
      const existingBills = await db
        .select()
        .from(billsTable)
        .where(
          and(
            eq(billsTable.userId, userId),
            eq(billsTable.category, "Subscriptions"),
            ilike(billsTable.merchant, `%${merchantName.replace(/[%_]/g, "\\$&")}%`)
          )
        )
        .limit(1);

      // Also check by name if merchant lookup found nothing
      const existingByName = existingBills.length === 0
        ? await db
            .select()
            .from(billsTable)
            .where(
              and(
                eq(billsTable.userId, userId),
                eq(billsTable.category, "Subscriptions"),
                ilike(billsTable.name, `%${merchantName.replace(/[%_]/g, "\\$&")}%`)
              )
            )
            .limit(1)
        : [];

      const existing = existingBills[0] || existingByName[0];

      if (existing) {
        // ── Update existing subscription ──────────────────────────────────
        // Recalculate next billing date based on this charge date
        const nextBillingDate = calcNextDueDate(
          tx.date,
          existing.recurrence || "monthly",
          existing.dueDay || new Date(tx.date).getUTCDate()
        );

        const updatedNotes = [
          existing.notes || "",
          `Last charged: ${tx.date} ($${txAmount.toFixed(2)})`,
          `Next billing: ${nextBillingDate}`,
        ]
          .filter(Boolean)
          .join(" | ")
          .substring(0, 500); // keep notes reasonable length

        await storage.updateBill(existing.id, {
          notes: updatedNotes,
          dueDay: new Date(tx.date).getUTCDate(),
        } as any);

        subscriptionsUpdated++;
        console.log(
          `[AutoReconciler] Updated subscription: "${merchantName}" last charged ${tx.date} ($${txAmount})`
        );
      } else {
        // ── Create new subscription bill ──────────────────────────────────
        // Detect billing cycle: check known subscriptions first, then default monthly
        const billingCycle = lookupKnownCycle(merchantName) || "monthly";

        const dueDay = new Date(tx.date).getUTCDate();
        const nextBillingDate = calcNextDueDate(tx.date, billingCycle, dueDay);

        // Map personal category to a bill category
        const billCategory = "Subscriptions";

        await storage.createBill({
          userId,
          name: merchantName,
          amount: String(txAmount),
          category: billCategory,
          recurrence: billingCycle as any,
          dueDay,
          merchant: merchantName,
          merchantLogoUrl: tx.merchantLogoUrl || null,
          notes: [
            "Auto-detected from bank transaction",
            `First detected: ${tx.date}`,
            `Next billing: ${nextBillingDate}`,
            `Source: auto_detected`,
            `DetectedFromTransactionId: ${tx.id}`,
          ].join(" | "),
          isPaused: "false",
          linkedPlaidAccountId: tx.plaidAccountId || null,
        } as any);

        subscriptionsCreated++;
        console.log(
          `[AutoReconciler] Auto-created subscription: "${merchantName}" $${txAmount} ${billingCycle} (next: ${nextBillingDate})`
        );
      }
    } catch (err) {
      console.error(
        `[AutoReconciler] Failed to process subscription for tx ${tx.id} merchant "${merchantName}":`,
        err
      );
    }
  }

  console.log(
    `[AutoReconciler] Done for user ${userId}: ` +
      `${incomeCreated} income auto-created, ${billMatches} bill matches, ` +
      `${expenseMatches} expense matches, ${autoCreated} expense auto-created, ` +
      `${subscriptionsCreated} subscriptions created, ${subscriptionsUpdated} subscriptions updated`
  );

  // ── Check spending alerts after reconciliation ───────────────────────────
  await checkSpendingAlerts(userId);

  return { billMatches, expenseMatches, autoCreated, incomeCreated, subscriptionsCreated, subscriptionsUpdated };
}

// ─── Category mapping ────────────────────────────────────────────────────────

/**
 * Maps a Plaid personal_finance_category or category string to a valid
 * Budget Smart AI expense category.
 */
function mapToExpenseCategory(rawCategory: string | null | undefined): string {
  if (!rawCategory) return "Other";

  const cat = rawCategory.toUpperCase();

  if (cat.includes("GROCER") || cat.includes("SUPERMARKET")) return "Groceries";
  if (cat.includes("RESTAURANT") || cat.includes("DINING") || cat.includes("FOOD_AND_DRINK")) return "Restaurant & Bars";
  if (cat.includes("COFFEE") || cat.includes("CAFE")) return "Coffee Shops";
  if (cat.includes("GAS") || cat.includes("FUEL")) return "Gas";
  if (cat.includes("TRANSPORT") || cat.includes("TRANSIT") || cat.includes("BUS") || cat.includes("SUBWAY")) return "Public Transit";
  if (cat.includes("TAXI") || cat.includes("RIDE") || cat.includes("UBER") || cat.includes("LYFT")) return "Taxi & Ride Share";
  if (cat.includes("PARKING") || cat.includes("TOLL")) return "Parking & Tolls";
  if (cat.includes("ENTERTAINMENT") || cat.includes("RECREATION")) return "Entertainment";
  if (cat.includes("SHOP") || cat.includes("RETAIL") || cat.includes("MERCHANDISE")) return "Shopping";
  if (cat.includes("HEALTH") || cat.includes("MEDICAL") || cat.includes("PHARMACY") || cat.includes("DOCTOR")) return "Healthcare";
  if (cat.includes("EDUCATION") || cat.includes("SCHOOL") || cat.includes("TUITION")) return "Education";
  if (cat.includes("FITNESS") || cat.includes("GYM") || cat.includes("SPORT")) return "Fitness";
  if (cat.includes("TRAVEL") || cat.includes("HOTEL") || cat.includes("AIRLINE") || cat.includes("FLIGHT")) return "Travel";
  if (cat.includes("CLOTHING") || cat.includes("APPAREL")) return "Clothing";
  if (cat.includes("PERSONAL") || cat.includes("BEAUTY") || cat.includes("SALON")) return "Personal";
  if (cat.includes("ATM") || cat.includes("CASH")) return "Cash & ATM";
  if (cat.includes("MORTGAGE")) return "Mortgage";
  if (cat.includes("CREDIT_CARD") || cat.includes("CREDIT CARD")) return "Credit Card";
  if (cat.includes("COMMUNICATION") || cat.includes("PHONE") || cat.includes("INTERNET")) return "Communications";
  if (cat.includes("ELECTRIC") || cat.includes("UTILITY") || cat.includes("UTILITIES")) return "Electrical";
  if (cat.includes("MAINTENANCE") || cat.includes("HOME_IMPROVEMENT")) return "Maintenance";
  if (cat.includes("FURNITURE") || cat.includes("HOUSEWARE")) return "Furniture & Houseware";

  return "Other";
}
