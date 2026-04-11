/**
 * Income Calculation Engine
 *
 * Centralizes all income-related calculations including:
 * - Recurring income calculation (weekly, biweekly, monthly, yearly, custom)
 * - Bank deposit detection from normalized transactions (provider-agnostic)
 * - Income-to-budget reconciliation
 * - Monthly income forecasting
 *
 * All monetary amounts are handled in cents (integers) to avoid floating-point errors.
 */

import {
  startOfMonth,
  endOfMonth,
  parseISO,
  getDay,
  eachDayOfInterval,
  isBefore,
  isAfter,
  addWeeks,
  getDaysInMonth,
} from 'date-fns';
import { IncomeResult } from './types';
import type { NormalizedTransaction } from './normalized-types';
import type { Income } from '@shared/schema';

// ─── Precision Helpers ──────────────────────────────────────────────────────

/**
 * Convert dollars to cents (integers) to avoid floating-point errors
 * @param amount Currency amount in dollars or string
 * @returns Amount in cents as an integer
 */
function toCents(amount: string | number): number {
  return Math.round(parseFloat(String(amount)) * 100);
}

/**
 * Convert cents (integers) back to dollars
 * @param cents Amount in cents as an integer
 * @returns Amount in dollars
 */
function toDollars(cents: number): number {
  return Math.round(cents) / 100;
}

// ─── Core Calculation ──────────────────────────────────────────────────────

/**
 * Calculate total monthly income from a single income record
 *
 * Business Rules:
 * - Non-recurring: counts only if exact date falls in the month range
 * - Custom: parses JSON array of day numbers, counts valid days <= daysInMonth, multiplies by amount
 * - Monthly: returns amount × 1
 * - Yearly: returns amount only if start month matches selected month
 * - Weekly: counts occurrences where day-of-week matches within the month
 * - Biweekly: walks forward from start date in 2-week intervals, counts hits in month
 *
 * @param income Income record with recurrence settings
 * @param monthStart First day of the month (Date object)
 * @param monthEnd Last day of the month (Date object)
 * @returns Monthly total in dollars (decimal)
 */
export function calculateMonthlyIncomeTotal(
  income: Income,
  monthStart: Date,
  monthEnd: Date
): number {
  const amountCents = toCents(income.amount);
  if (amountCents === 0) return 0;

  const incomeStartDate = parseISO(income.date);

  // Non-recurring: only count if the exact date falls within this month
  if (income.isRecurring !== 'true') {
    if (incomeStartDate >= monthStart && incomeStartDate <= monthEnd) {
      return toDollars(amountCents);
    }
    return 0;
  }

  // Recurring: must have started on or before the end of this month
  if (isAfter(incomeStartDate, monthEnd)) {
    return 0;
  }

  const recurrence = income.recurrence;

  // Custom: parse JSON array of day numbers (1-31)
  if (recurrence === 'custom' && income.customDates) {
    try {
      const customDays: number[] = JSON.parse(income.customDates);
      const daysInMonth = getDaysInMonth(monthStart);
      const validDays = customDays.filter((day) => day > 0 && day <= daysInMonth);
      return toDollars(amountCents * validDays.length);
    } catch {
      // If parsing fails, treat as monthly
      return toDollars(amountCents);
    }
  }

  // Monthly: straightforward
  if (recurrence === 'monthly') {
    return toDollars(amountCents);
  }

  // Yearly: only count if the income's start month matches the selected month
  if (recurrence === 'yearly') {
    if (incomeStartDate.getMonth() === monthStart.getMonth()) {
      return toDollars(amountCents);
    }
    return 0;
  }

  // Weekly: count occurrences where day-of-week matches within the month
  if (recurrence === 'weekly') {
    const dayOfWeek = getDay(incomeStartDate);
    let count = 0;
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    for (const day of allDays) {
      if (getDay(day) === dayOfWeek && !isBefore(day, incomeStartDate)) {
        count++;
      }
    }
    return toDollars(amountCents * count);
  }

  // Biweekly: walk forward from start date in 2-week intervals, count hits in month
  if (recurrence === 'biweekly') {
    let count = 0;
    let payDate = incomeStartDate;
    // Advance to first occurrence on or after monthStart
    while (isBefore(payDate, monthStart)) {
      payDate = addWeeks(payDate, 2);
    }
    // Count all occurrences within the month
    while (!isAfter(payDate, monthEnd)) {
      count++;
      payDate = addWeeks(payDate, 2);
    }
    return toDollars(amountCents * count);
  }

  // Fallback: treat as monthly if recurrence is unrecognized
  return toDollars(amountCents);
}

// ─── Bank Income Detection (Provider-Agnostic) ───────────────────────────
//
// All provider-specific logic (Plaid sign conventions, MX field names, etc.)
// is handled by the adapter layer BEFORE data reaches the engine.
// The engine only works with NormalizedTransaction objects.

// ─── Main Export ───────────────────────────────────────────────────────────

/**
 * Calculate all income metrics for a period
 *
 * Results include:
 * - budgetedIncome: sum of all recurring/manual income entries
 * - actualIncome: detected from bank transactions
 * - effectiveIncome: actual if available, else budgeted
 * - bySource: breakdown by income source with category and recurrence info
 *
 * @param params Configuration object
 * @param params.income Array of Income records from database
 * @param params.transactions Normalized transactions (already provider-agnostic)
 * @param params.monthStart First day of calculation period
 * @param params.monthEnd Last day of calculation period
 * @returns IncomeResult with budgeted, actual, and effective income
 */
export function calculateIncomeForPeriod(params: {
  income: Income[];
  transactions: NormalizedTransaction[];
  monthStart: Date;
  monthEnd: Date;
}): IncomeResult {
  const { income: incomeRecords = [], transactions = [], monthStart, monthEnd } = params;

  // Calculate budgeted income from user-entered records
  let budgetedIncomeCents = 0;
  const bySource: Array<{
    source: string;
    amount: number;
    category: string;
    isRecurring: boolean;
  }> = [];

  for (const incomeRecord of incomeRecords) {
    const monthlyAmount = calculateMonthlyIncomeTotal(incomeRecord, monthStart, monthEnd);
    const amountCents = toCents(monthlyAmount);
    budgetedIncomeCents += amountCents;

    if (amountCents > 0) {
      bySource.push({
        source: incomeRecord.source || 'Unknown',
        amount: monthlyAmount,
        category: incomeRecord.category || 'Other',
        isRecurring: incomeRecord.isRecurring === 'true',
      });
    }
  }

  // Calculate actual income from normalized bank transactions
  // The adapter has already resolved provider-specific sign conventions,
  // so we just check the normalized isIncome / isTransfer / isPending flags.
  let actualIncomeCents = 0;
  const transactionStartDate = startOfMonth(monthStart);
  const transactionEndDate = endOfMonth(monthEnd);

  for (const tx of transactions) {
    try {
      const txDate = parseISO(tx.date);

      // Filter by date range
      if (isBefore(txDate, transactionStartDate) || isAfter(txDate, transactionEndDate)) {
        continue;
      }

      // Skip pending, transfers, non-income
      if (tx.isPending || tx.isTransfer || !tx.isIncome) {
        continue;
      }

      actualIncomeCents += toCents(tx.amount);
    } catch (e) {
      // Skip malformed transactions
      continue;
    }
  }

  const budgetedIncome = toDollars(budgetedIncomeCents);
  const actualIncome = toDollars(actualIncomeCents);
  const hasBankData = actualIncomeCents > 0;
  const effectiveIncome = hasBankData ? actualIncome : budgetedIncome;

  return {
    budgetedIncome,
    actualIncome,
    effectiveIncome,
    hasBankData,
    bySource,
  };
}