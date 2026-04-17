/**
 * Cash Flow Forecasting Module
 * Predicts future account balances based on:
 * - Current balance
 * - Upcoming bills
 * - Expected income (from Income records + auto-detected recurring deposits)
 * - Historical spending patterns
 */

import { format, addDays, parseISO, setDate, addMonths, addWeeks, getDay, setDay, isBefore, isAfter, differenceInDays, startOfDay, getDaysInMonth } from "date-fns";

// Convert dollar amount string to integer cents to avoid floating point errors
function toCents(amount: string | number): number {
  return Math.round(parseFloat(String(amount)) * 100);
}

// Convert cents back to dollars (as number with two decimal places)
function toDollars(cents: number): number {
  return Math.round(cents) / 100;
}
import type { Bill, Income, PlaidTransaction, PlaidAccount } from "@shared/schema";

export interface CashFlowEvent {
  date: string;
  type: "bill" | "income" | "spending";
  name: string;
  amount: number; // Positive for income, negative for bills/spending
  category?: string;
}

export interface DailyProjection {
  date: string;
  balance: number;
  events: CashFlowEvent[];
  isLowBalance: boolean;
}

export interface LowBalanceWarning {
  date: string;
  projectedBalance: number;
  daysUntilNextIncome: number;
  severity: "warning" | "critical"; // warning < $500, critical < $100
}

export interface CashFlowForecast {
  currentBalance: number;
  projectedBalances: DailyProjection[];
  lowBalanceWarning: LowBalanceWarning | null;
  summary: {
    totalExpectedIncome: number;
    totalExpectedBills: number;
    totalPredictedSpending: number;
    averageDailySpending: number;
    lowestProjectedBalance: number;
    lowestBalanceDate: string;
    daysUntilLowBalance: number | null;
  };
}

/**
 * Get the next occurrence of a bill within a date range
 */
function getNextBillDate(bill: Bill, fromDate: Date): Date | null {
  const today = startOfDay(fromDate);

  // Handle one-time payments
  if (bill.recurrence === "one_time") {
    if (bill.startDate) {
      const dueDate = parseISO(bill.startDate);
      return !isBefore(dueDate, today) ? dueDate : null;
    }
    // If no start date, use dueDay of current/next month
    let nextDue = setDate(today, bill.dueDay);
    if (isBefore(nextDue, today)) {
      nextDue = addMonths(nextDue, 1);
    }
    return nextDue;
  }

  if (bill.recurrence === "custom" && bill.customDates) {
    try {
      const dates: string[] = JSON.parse(bill.customDates);
      const futureDates = dates
        .map(d => parseISO(d))
        .filter(d => !isBefore(d, today))
        .sort((a, b) => a.getTime() - b.getTime());
      return futureDates[0] || null;
    } catch {
      return null;
    }
  }

  if (bill.recurrence === "weekly") {
    let nextDue = setDay(today, bill.dueDay, { weekStartsOn: 0 });
    if (isBefore(nextDue, today)) {
      nextDue = addWeeks(nextDue, 1);
    }
    return nextDue;
  }

  // Monthly, biweekly, yearly - dueDay is day of month
  let nextDue = setDate(today, bill.dueDay);
  if (isBefore(nextDue, today)) {
    if (bill.recurrence === "monthly") {
      nextDue = addMonths(nextDue, 1);
    } else if (bill.recurrence === "biweekly") {
      // Keep adding 14 days until we get a future date
      while (isBefore(nextDue, today)) {
        nextDue = addDays(nextDue, 14);
      }
    } else if (bill.recurrence === "yearly") {
      nextDue = addMonths(nextDue, 12);
    }
  }

  return nextDue;
}

/**
 * Get all bill occurrences within a date range
 * Respects endDate and paymentsRemaining to exclude bills that have ended
 */
export function getBillsInRange(bills: Bill[], startDate: Date, endDate: Date): CashFlowEvent[] {
  const events: CashFlowEvent[] = [];

  for (const bill of bills) {
    if (bill.isPaused === "true") continue;

    // Check if bill has ended based on endDate
    if (bill.endDate) {
      const billEndDate = parseISO(bill.endDate);
      if (isBefore(billEndDate, startDate)) {
        continue; // Bill has already ended, skip entirely
      }
    }

    let currentDate = new Date(startDate);
    let iterations = 0;
    const maxIterations = 100; // Safety limit

    // Track payments remaining for this forecast
    let paymentsCount = 0;
    const maxPayments = bill.paymentsRemaining;

    while (iterations < maxIterations) {
      const nextDue = getNextBillDate(bill, currentDate);
      if (!nextDue || isAfter(nextDue, endDate)) break;

      // Check if this occurrence is past the bill's end date
      if (bill.endDate) {
        const billEndDate = parseISO(bill.endDate);
        if (isAfter(nextDue, billEndDate)) {
          break; // Bill has ended, stop generating occurrences
        }
      }

      // Check payments remaining limit
      if (maxPayments !== null && maxPayments !== undefined && paymentsCount >= maxPayments) {
        break; // No more payments remaining
      }

      events.push({
        date: format(nextDue, "yyyy-MM-dd"),
        type: "bill",
        name: bill.name,
        amount: -toDollars(Math.abs(toCents(bill.amount))), // Bills are negative
        category: bill.category,
      });

      paymentsCount++;

      // Move to next occurrence
      if (bill.recurrence === "one_time") {
        break; // One-time bills only appear once
      } else if (bill.recurrence === "weekly") {
        currentDate = addWeeks(nextDue, 1);
      } else if (bill.recurrence === "biweekly") {
        currentDate = addDays(nextDue, 14);
      } else if (bill.recurrence === "monthly") {
        currentDate = addMonths(nextDue, 1);
      } else if (bill.recurrence === "yearly") {
        currentDate = addMonths(nextDue, 12);
      } else {
        currentDate = addDays(nextDue, 1);
      }

      iterations++;
    }
  }

  return events;
}

/**
 * Get next income date for an income entry
 */
function getNextIncomeDate(inc: Income, fromDate: Date): Date | null {
  if (inc.isRecurring !== "true") {
    const incDate = parseISO(inc.date);
    return !isBefore(incDate, fromDate) ? incDate : null;
  }

  const today = startOfDay(fromDate);

  if (inc.recurrence === "custom" && inc.customDates) {
    try {
      const days: number[] = JSON.parse(inc.customDates);
      const daysInMonth = getDaysInMonth(today);
      const sortedDays = days.filter(d => d <= daysInMonth).sort((a, b) => a - b);

      for (const day of sortedDays) {
        const candidate = setDate(today, day);
        if (!isBefore(candidate, today)) {
          return candidate;
        }
      }
      // Next month's first day
      const nextMonth = addMonths(today, 1);
      return setDate(nextMonth, sortedDays[0] || 1);
    } catch {
      return null;
    }
  }

  if (inc.recurrence === "weekly") {
    const startDate = parseISO(inc.date);
    const dayOfWeek = getDay(startDate);
    let nextDue = setDay(today, dayOfWeek, { weekStartsOn: 0 });
    if (isBefore(nextDue, today)) {
      nextDue = addWeeks(nextDue, 1);
    }
    return nextDue;
  }

  if (inc.recurrence === "biweekly") {
    const startDate = parseISO(inc.date);
    let payDate = startDate;
    while (isBefore(payDate, today)) {
      payDate = addWeeks(payDate, 2);
    }
    return payDate;
  }

  // Monthly or yearly
  const dueDay = inc.dueDay || 1;
  let nextDue = setDate(today, dueDay);
  if (isBefore(nextDue, today)) {
    if (inc.recurrence === "yearly") {
      nextDue = addMonths(nextDue, 12);
    } else {
      nextDue = addMonths(nextDue, 1);
    }
  }

  return nextDue;
}

/**
 * Get the effective income amount for a given date.
 * Income is now purely based on actual recorded amounts — no scheduled future changes.
 */
function getEffectiveIncomeAmount(inc: Income, _date: Date): number {
  const baseAmountCents = Math.abs(toCents(inc.amount));
  return toDollars(baseAmountCents);
}

/**
 * Get all income occurrences within a date range
 * Respects scheduled amount changes
 */
export function getIncomeInRange(incomes: Income[], startDate: Date, endDate: Date): CashFlowEvent[] {
  const events: CashFlowEvent[] = [];

  for (const inc of incomes) {
    // Skip inactive income
    if (inc.isActive === "false") continue;

    let currentDate = new Date(startDate);
    let iterations = 0;
    const maxIterations = 100;

    while (iterations < maxIterations) {
      const nextDue = getNextIncomeDate(inc, currentDate);
      if (!nextDue || isAfter(nextDue, endDate)) break;

      // Get the effective amount for this date (considering scheduled changes)
      const effectiveAmount = getEffectiveIncomeAmount(inc, nextDue);

      events.push({
        date: format(nextDue, "yyyy-MM-dd"),
        type: "income",
        name: inc.source,
        amount: effectiveAmount, // Income is positive
        category: inc.category,
      });

      // Move to next occurrence
      if (inc.isRecurring !== "true") {
        break; // One-time income
      } else if (inc.recurrence === "weekly") {
        currentDate = addWeeks(nextDue, 1);
      } else if (inc.recurrence === "biweekly") {
        currentDate = addWeeks(nextDue, 2);
      } else if (inc.recurrence === "monthly") {
        currentDate = addMonths(nextDue, 1);
      } else if (inc.recurrence === "yearly") {
        currentDate = addMonths(nextDue, 12);
      } else {
        currentDate = addDays(nextDue, 1);
      }

      iterations++;
    }
  }

  return events;
}

/**
 * Auto-detect recurring income from transaction history.
 *
 * Looks for repeating credit patterns (same payer, similar amount, ~regular cadence)
 * in the last `days` of transactions and projects them forward to `endDate`.
 *
 * This is the critical fallback that fixes the "Money Timeline all red" bug when
 * users haven't set up manual recurring income records — Monarch parity behaviour.
 *
 * Excludes:
 * - Transfers (TRANSFER_IN_*, TRANSFER_OUT_*, matchType='transfer')
 * - Loan disbursements (mis-labelled by some issuers as income)
 * - Refunds / one-off credits (not enough occurrences)
 */
export function detectRecurringIncomeFromTransactions(
  transactions: PlaidTransaction[],
  startDate: Date,
  endDate: Date,
): CashFlowEvent[] {
  const today = startOfDay(startDate);

  // 1. Filter to credits only (negative amounts in Plaid = deposits into account)
  //    AND exclude transfers/loan disbursements.
  //
  // UAT-8 FIX: Added a name-pattern backstop. A bank sometimes routes its own
  // transfers through categories like "Other" with the legacy PFC primary unset,
  // e.g. "Customer Transfer Cr. MB-CASH ADVANCE". Those were slipping through
  // as income and doubling Money Timeline projections.
  const INCOME_EXCLUDE_CATEGORIES = new Set([
    "transfers", "transfer", "credit card payment", "payment",
    "internal account transfer", "loan disbursement",
  ]);
  const INCOME_EXCLUDE_DETAILED_PREFIXES = [
    "TRANSFER_IN_", "TRANSFER_OUT_", "LOAN_DISBURSEMENT_",
  ];
  // Matches common transfer/advance/fee descriptors in names even when the
  // aggregator hasn't flagged them. Case-insensitive, word-boundary safe.
  const TRANSFER_NAME_PATTERN =
    /\b(transfer|tfr|xfer|cash\s*advance|e[-\s]?transfer|interac|mb[-\s]?[a-z]+|internal\s+transfer|account\s+transfer|to\s+savings|from\s+savings|autopay|bill\s*pay(?:ment)?|zelle|venmo\s+cashout)\b/i;

  const credits = transactions.filter(t => {
    const amountCents = toCents(t.amount);
    if (amountCents >= 0) return false; // Plaid: negative = deposit
    if ((t as any).isTransfer === true || (t as any).isTransfer === "true") return false;
    if (t.matchType === 'transfer') return false;

    const cat = ((t as any).personalCategory || t.category || "").toLowerCase();
    if (INCOME_EXCLUDE_CATEGORIES.has(cat)) return false;

    const detailed = ((t as any).personalFinanceCategoryDetailed || "").toUpperCase();
    if (INCOME_EXCLUDE_DETAILED_PREFIXES.some(p => detailed.startsWith(p))) return false;

    // Name-pattern backstop for bank-labelled transfers that arrive with
    // neutral categories (e.g. "Other", "Uncategorized").
    const name = ((t as any).counterpartyName || (t as any).merchantName || t.name || "").toString();
    if (TRANSFER_NAME_PATTERN.test(name)) return false;

    return true;
  });

  if (credits.length < 2) return [];

  // 2. Group by merchant/counterparty fingerprint
  const groups = new Map<string, PlaidTransaction[]>();
  for (const t of credits) {
    const key = ((t as any).counterpartyName
      || (t as any).merchantName
      || t.name
      || "").trim().toUpperCase().replace(/\s+/g, " ");
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  // 3. For each group with >=2 occurrences, infer cadence and project forward
  const events: CashFlowEvent[] = [];
  for (const [name, txs] of groups) {
    if (txs.length < 2) continue;

    // Sort by date ascending
    const sorted = txs.slice().sort((a, b) =>
      parseISO(a.date).getTime() - parseISO(b.date).getTime()
    );

    // Compute gaps between occurrences
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const gap = differenceInDays(parseISO(sorted[i].date), parseISO(sorted[i - 1].date));
      if (gap > 0 && gap < 100) gaps.push(gap);
    }
    if (gaps.length === 0) continue;

    // Use median gap as cadence
    gaps.sort((a, b) => a - b);
    const medianGap = gaps[Math.floor(gaps.length / 2)];

    // Detect cadence bucket.
    // UAT-8 FIX: Previous ranges overlapped 14-16 (biweekly) and 14-17 (semi-monthly),
    // so semi-monthly was unreachable. ROCHE pays on the 15th and 30th (gaps 15/13-18)
    // and was getting mis-classified as biweekly, doubling its projected income. Made
    // biweekly strict (13-14) and semi-monthly claim 15-17. Also widen the acceptance
    // window on either end so real payroll jitter (holiday/weekend shifts) still lands.
    let cadenceDays: number;
    if (medianGap >= 6 && medianGap <= 8) cadenceDays = 7;            // weekly
    else if (medianGap >= 13 && medianGap <= 14) cadenceDays = 14;    // biweekly (strict)
    else if (medianGap >= 15 && medianGap <= 17) cadenceDays = 15;    // semi-monthly (~15d)
    else if (medianGap >= 28 && medianGap <= 32) cadenceDays = 30;    // monthly
    else continue; // Irregular — skip

    // Average amount (absolute)
    const amounts = sorted.map(t => Math.abs(toCents(t.amount)));
    const avgCents = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const avgDollars = toDollars(avgCents);
    if (avgDollars < 50) continue; // Skip tiny credits

    // Project forward: start from last occurrence + cadenceDays
    const lastDate = parseISO(sorted[sorted.length - 1].date);
    let nextDate = addDays(lastDate, cadenceDays);

    // Roll forward until we're at/after today
    while (isBefore(nextDate, today)) {
      nextDate = addDays(nextDate, cadenceDays);
    }

    // Emit events within the forecast window
    let iterations = 0;
    while (!isAfter(nextDate, endDate) && iterations < 100) {
      events.push({
        date: format(nextDate, "yyyy-MM-dd"),
        type: "income",
        name: name,
        amount: avgDollars,
        category: "Income",
      });
      nextDate = addDays(nextDate, cadenceDays);
      iterations++;
    }
  }

  return events;
}

/**
 * Calculate average daily spending from historical transactions
 */
export function calculateAverageDailySpending(transactions: PlaidTransaction[], days: number = 30): number {
  // Exclude bill payments (tracked separately), transfers, and large loan/mortgage payments
  // that inflate the "daily discretionary spending" average.
  const NON_SPENDING_CATEGORIES = new Set([
    "transfer", "transfers", "credit card", "credit card payment", "payment", "internal account transfer",
    "mortgage", "housing", "loan", "loans", "loan payment",
  ]);
  const NON_SPENDING_DETAILED_PREFIXES = [
    "TRANSFER_IN_", "TRANSFER_OUT_", "LOAN_PAYMENTS_", "LOAN_DISBURSEMENT_",
  ];
  // UAT-8: same backstop as detectRecurringIncomeFromTransactions — keeps
  // bank-labelled transfers (e.g. "MB-CASH ADVANCE", "Transfer To Savings")
  // out of the "daily discretionary spending" number even when the aggregator
  // categorises them loosely.
  const TRANSFER_NAME_PATTERN =
    /\b(transfer|tfr|xfer|cash\s*advance|e[-\s]?transfer|interac|mb[-\s]?[a-z]+|internal\s+transfer|account\s+transfer|to\s+savings|from\s+savings|zelle)\b/i;

  const outflows = transactions.filter(t => {
    const amountCents = toCents(t.amount);
    if (amountCents <= 0) return false; // Skip income (negative in Plaid)
    if (t.matchType === 'bill') return false; // Already tracked as bills
    if (t.matchType === 'transfer') return false;
    if ((t as any).isTransfer === true || (t as any).isTransfer === "true") return false;
    const cat = ((t as any).personalCategory || t.category || "").toLowerCase();
    if (NON_SPENDING_CATEGORIES.has(cat)) return false;
    const detailed = ((t as any).personalFinanceCategoryDetailed || "").toUpperCase();
    if (NON_SPENDING_DETAILED_PREFIXES.some(p => detailed.startsWith(p))) return false;
    const name = ((t as any).counterpartyName || (t as any).merchantName || t.name || "").toString();
    if (TRANSFER_NAME_PATTERN.test(name)) return false;
    return true;
  });
  const totalCents = outflows.reduce((sum, t) => sum + toCents(t.amount), 0);
  const averageCents = totalCents / Math.max(days, 1);
  return toDollars(averageCents);
}

/**
 * Calculate spending by day of week to improve predictions.
 *
 * UAT-8 FIX: Previously this divided per-DOW total by TRANSACTION COUNT, which
 * made a single large outlier become the "average" for that day of week forever
 * (e.g. 1 Sunday charge of $1,200 → Sunday avg = $1,200 projected every Sunday).
 *
 * Now we divide by the number of distinct day-of-week occurrences in the history
 * window — i.e. how many Sundays actually existed in the data, not how many
 * transactions happened on Sundays. Requires >=2 occurrences to produce a
 * DOW-specific number; otherwise falls back to 0 (caller uses overall avg).
 */
export function getSpendingByDayOfWeek(transactions: PlaidTransaction[]): Record<number, number> {
  const byDay: Record<number, { totalCents: number; count: number }> = {
    0: { totalCents: 0, count: 0 },
    1: { totalCents: 0, count: 0 },
    2: { totalCents: 0, count: 0 },
    3: { totalCents: 0, count: 0 },
    4: { totalCents: 0, count: 0 },
    5: { totalCents: 0, count: 0 },
    6: { totalCents: 0, count: 0 },
  };

  // Track distinct calendar dates seen per day-of-week (true denominator for "avg per Sunday").
  const dayOfWeekDates: Record<number, Set<string>> = {
    0: new Set(), 1: new Set(), 2: new Set(), 3: new Set(),
    4: new Set(), 5: new Set(), 6: new Set(),
  };

  // Same exclusions as calculateAverageDailySpending so the daily pattern isn't skewed
  // by mortgage/loan payments, transfers, or bill-matched outflows.
  const NON_SPENDING_CATEGORIES = new Set([
    "transfer", "transfers", "credit card", "credit card payment", "payment", "internal account transfer",
    "mortgage", "housing", "loan", "loans", "loan payment",
  ]);
  const NON_SPENDING_DETAILED_PREFIXES = [
    "TRANSFER_IN_", "TRANSFER_OUT_", "LOAN_PAYMENTS_", "LOAN_DISBURSEMENT_",
  ];
  const TRANSFER_NAME_PATTERN =
    /\b(transfer|tfr|xfer|cash\s*advance|e[-\s]?transfer|interac|mb[-\s]?[a-z]+|internal\s+transfer|account\s+transfer|to\s+savings|from\s+savings|zelle)\b/i;

  for (const t of transactions) {
    const amountCents = toCents(t.amount);
    if (amountCents <= 0 || t.matchType === 'bill') continue; // Skip income and bill payments
    if (t.matchType === 'transfer') continue;
    if ((t as any).isTransfer === true || (t as any).isTransfer === "true") continue;
    const cat = ((t as any).personalCategory || t.category || "").toLowerCase();
    if (NON_SPENDING_CATEGORIES.has(cat)) continue;
    const detailed = ((t as any).personalFinanceCategoryDetailed || "").toUpperCase();
    if (NON_SPENDING_DETAILED_PREFIXES.some(p => detailed.startsWith(p))) continue;
    const name = ((t as any).counterpartyName || (t as any).merchantName || t.name || "").toString();
    if (TRANSFER_NAME_PATTERN.test(name)) continue;

    const d = parseISO(t.date);
    const dayOfWeek = getDay(d);
    byDay[dayOfWeek].totalCents += amountCents;
    byDay[dayOfWeek].count++;
    dayOfWeekDates[dayOfWeek].add(t.date);
  }

  const result: Record<number, number> = {};
  for (const day of [0, 1, 2, 3, 4, 5, 6]) {
    const uniqueDays = dayOfWeekDates[day].size;
    // Require at least 2 distinct occurrences of that weekday in history to
    // produce a DOW-specific average; otherwise return 0 so the caller falls
    // back to the overall daily average.
    result[day] = uniqueDays >= 2
      ? toDollars(byDay[day].totalCents / uniqueDays)
      : 0;
  }

  return result;
}

/**
 * Find the next income date from a list of incomes
 */
export function findNextIncomeDate(incomes: Income[]): { date: Date; amount: number; source: string } | null {
  const today = new Date();
  let nearest: { date: Date; amount: number; source: string } | null = null;

  for (const inc of incomes) {
    const nextDate = getNextIncomeDate(inc, today);
    if (nextDate && (!nearest || isBefore(nextDate, nearest.date))) {
      nearest = {
        date: nextDate,
        amount: toDollars(toCents(inc.amount)),
        source: inc.source,
      };
    }
  }

  return nearest;
}

/**
 * Generate full cash flow forecast
 * @param historicalDays - The actual number of days of transactions provided.
 *   Used to correctly calculate the average daily spending baseline.
 *   Defaults to 30. Pass 60 if you fetched 60 days of transactions, etc.
 */
export function generateCashFlowForecast(
  currentBalance: number,
  bills: Bill[],
  incomes: Income[],
  transactions: PlaidTransaction[],
  days: number = 30,
  historicalDays: number = 30
): CashFlowForecast {
  const today = startOfDay(new Date());
  const endDate = addDays(today, days);

  // Get all scheduled events (amounts in dollars)
  const billEvents = getBillsInRange(bills, today, endDate);
  let incomeEvents = getIncomeInRange(incomes, today, endDate);

  // CRITICAL FIX (UAT-7 Money Timeline):
  // If the user hasn't set up recurring income records yet, auto-detect recurring
  // income from their transaction history (paychecks, recurring deposits) so the
  // forward projection isn't all red. This is Monarch parity behaviour.
  if (incomeEvents.length === 0 && transactions.length > 0) {
    incomeEvents = detectRecurringIncomeFromTransactions(transactions, today, endDate);
  }

  // Calculate daily spending prediction (in dollars)
  // Use historicalDays so we divide by the actual window of data provided,
  // not a hardcoded 30 (which would inflate the average if more days were fetched).
  const avgDailySpending = calculateAverageDailySpending(transactions, historicalDays);
  const spendingByDay = getSpendingByDayOfWeek(transactions);

  // Convert everything to cents for precise arithmetic
  let runningBalanceCents = toCents(currentBalance);
  const avgDailySpendingCents = toCents(avgDailySpending);
  const spendingByDayCents: Record<number, number> = {};
  for (const day of [0,1,2,3,4,5,6]) {
    spendingByDayCents[day] = toCents(spendingByDay[day]);
  }

  // Project day by day
  const projections: DailyProjection[] = [];
  let lowestBalanceCents = runningBalanceCents;
  let lowestBalanceDate = format(today, "yyyy-MM-dd");

  for (let i = 0; i <= days; i++) {
    const currentDate = addDays(today, i);
    const dateStr = format(currentDate, "yyyy-MM-dd");
    const dayOfWeek = getDay(currentDate);

    // Get events for this day
    const dayBills = billEvents.filter(e => e.date === dateStr);
    const dayIncome = incomeEvents.filter(e => e.date === dateStr);

    // Predicted daily spending in cents
    const predictedSpendingCents = spendingByDayCents[dayOfWeek] > 0
      ? spendingByDayCents[dayOfWeek]
      : avgDailySpendingCents;

    // Calculate day's impact in cents
    const incomeTotalCents = dayIncome.reduce((sum, e) => sum + toCents(e.amount), 0);
    const billsTotalCents = dayBills.reduce((sum, e) => sum + toCents(e.amount), 0); // Already negative

    // Don't add predicted spending for day 0 (today)
    const spendingTodayCents = i === 0 ? 0 : -predictedSpendingCents;

    runningBalanceCents += incomeTotalCents + billsTotalCents + spendingTodayCents;

    // Collect all events including predicted spending (convert amounts to dollars for event)
    const events: CashFlowEvent[] = [
      ...dayIncome,
      ...dayBills,
    ];

    if (i > 0 && predictedSpendingCents > 0) {
      events.push({
        date: dateStr,
        type: "spending",
        name: "Predicted daily spending",
        amount: -toDollars(predictedSpendingCents),
      });
    }

    // Track lowest balance
    if (runningBalanceCents < lowestBalanceCents) {
      lowestBalanceCents = runningBalanceCents;
      lowestBalanceDate = dateStr;
    }

    projections.push({
      date: dateStr,
      balance: toDollars(runningBalanceCents),
      events,
      isLowBalance: toDollars(runningBalanceCents) < 500,
    });
  }

  // Find low balance warning.
  // nextIncome uses Income records OR falls back to the first auto-detected income event
  // so the "days until next income" number stays meaningful when records are absent.
  let lowBalanceWarning: LowBalanceWarning | null = null;
  let nextIncome: { date: Date; amount: number; source: string } | null = findNextIncomeDate(incomes);
  if (!nextIncome && incomeEvents.length > 0) {
    const firstEvent = incomeEvents
      .slice()
      .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())[0];
    nextIncome = {
      date: parseISO(firstEvent.date),
      amount: firstEvent.amount,
      source: firstEvent.name,
    };
  }

  for (const proj of projections) {
    if (proj.balance < 500) {
      const projDate = parseISO(proj.date);
      const daysUntilIncome = nextIncome
        ? Math.max(0, differenceInDays(nextIncome.date, projDate))
        : 30; // Default to 30 instead of 999 when no income records exist

      lowBalanceWarning = {
        date: proj.date,
        projectedBalance: proj.balance,
        daysUntilNextIncome: daysUntilIncome,
        severity: proj.balance < 100 ? "critical" : "warning",
      };
      break;
    }
  }

  // Calculate totals (convert event amounts to cents for accuracy)
  const totalExpectedIncomeCents = incomeEvents.reduce((sum, e) => sum + toCents(e.amount), 0);
  const totalExpectedBillsCents = Math.abs(billEvents.reduce((sum, e) => sum + toCents(e.amount), 0));
  const totalPredictedSpendingCents = avgDailySpendingCents * days;

  return {
    currentBalance,
    projectedBalances: projections,
    lowBalanceWarning,
    summary: {
      totalExpectedIncome: toDollars(totalExpectedIncomeCents),
      totalExpectedBills: toDollars(totalExpectedBillsCents),
      totalPredictedSpending: toDollars(totalPredictedSpendingCents),
      averageDailySpending: toDollars(avgDailySpendingCents),
      lowestProjectedBalance: toDollars(lowestBalanceCents),
      lowestBalanceDate,
      daysUntilLowBalance: lowBalanceWarning
        ? differenceInDays(parseISO(lowBalanceWarning.date), today)
        : null,
    },
  };
}
