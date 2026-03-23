/**
 * Cash Flow Forecasting Module
 * Predicts future account balances based on:
 * - Current balance
 * - Upcoming bills
 * - Expected income
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
 * Get the effective income amount for a given date
 * Considers scheduled amount changes (futureAmount and amountChangeDate)
 */
function getEffectiveIncomeAmount(inc: Income, date: Date): number {
  const baseAmountCents = Math.abs(toCents(inc.amount));

  // Check if there's a scheduled amount change
  if (inc.futureAmount && inc.amountChangeDate) {
    const changeDate = parseISO(inc.amountChangeDate);
    if (!isBefore(date, changeDate)) {
      // Date is on or after the change date, use future amount
      const futureAmountCents = Math.abs(toCents(inc.futureAmount));
      return toDollars(futureAmountCents);
    }
  }

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
 * Calculate average daily spending from historical transactions
 */
export function calculateAverageDailySpending(transactions: PlaidTransaction[], days: number = 30): number {
  // Filter out bill payments to avoid double-counting (bills are tracked separately)
  const outflows = transactions.filter(t => {
    const amountCents = toCents(t.amount);
    return amountCents > 0 && t.matchType !== 'bill';
  });
  const totalCents = outflows.reduce((sum, t) => sum + toCents(t.amount), 0);
  const averageCents = totalCents / Math.max(days, 1);
  return toDollars(averageCents);
}

/**
 * Calculate spending by day of week to improve predictions
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

  for (const t of transactions) {
    const amountCents = toCents(t.amount);
    if (amountCents <= 0 || t.matchType === 'bill') continue; // Skip income and bill payments

    const dayOfWeek = getDay(parseISO(t.date));
    byDay[dayOfWeek].totalCents += amountCents;
    byDay[dayOfWeek].count++;
  }

  const result: Record<number, number> = {};
  for (const day of [0, 1, 2, 3, 4, 5, 6]) {
    result[day] = byDay[day].count > 0 ? toDollars(byDay[day].totalCents / byDay[day].count) : 0;
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
  const incomeEvents = getIncomeInRange(incomes, today, endDate);

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

  // Find low balance warning
  let lowBalanceWarning: LowBalanceWarning | null = null;
  const nextIncome = findNextIncomeDate(incomes);

  for (const proj of projections) {
    if (proj.balance < 500) {
      const projDate = parseISO(proj.date);
      const daysUntilIncome = nextIncome
        ? Math.max(0, differenceInDays(nextIncome.date, projDate))
        : 999;

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
