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
  differenceInDays,
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

// ─── Recurring Income Source Detection (Historical) ──────────────────────
//
// Analyzes 3+ months of historical income transactions to detect recurring
// sources (weekly, biweekly, monthly, quarterly). This allows sources like
// biweekly paychecks to appear even when no deposit has landed in the
// current period yet.

function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  const mean = avg(arr);
  const variance = arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

/** Normalize a source/merchant name for grouping */
function normalizeSourceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(direct dep|dir dep|payroll|deposit|payment|pay|inc|ltd|llc|corp|co)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface DetectedRecurringSource {
  source: string;
  avgAmount: number;
  frequency: string;
  occurrences: number;
}

/**
 * Detect recurring income sources from historical transactions.
 * Groups income transactions by normalized source name, analyzes interval
 * consistency, and returns sources with detected frequency patterns.
 */
function detectRecurringIncomeSources(
  historicalIncomeTx: NormalizedTransaction[]
): DetectedRecurringSource[] {
  // Group by normalized source name
  const groups: Record<string, { date: string; amount: number; rawName: string }[]> = {};

  for (const tx of historicalIncomeTx) {
    const rawName = tx.merchant || 'Unknown';
    const key = normalizeSourceName(rawName);
    if (!key || key.length < 2) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push({
      date: tx.date,
      amount: Math.abs(parseFloat(String(tx.amount))),
      rawName,
    });
  }

  const results: DetectedRecurringSource[] = [];

  for (const [, entries] of Object.entries(groups)) {
    if (entries.length < 2) continue;

    // Sort by date ascending
    entries.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate intervals between consecutive occurrences
    const intervals: number[] = [];
    for (let i = 1; i < entries.length; i++) {
      const days = differenceInDays(parseISO(entries[i].date), parseISO(entries[i - 1].date));
      if (days > 0) intervals.push(days);
    }

    if (intervals.length === 0) continue;

    const meanInterval = avg(intervals);
    const sd = stdDev(intervals);

    // Only mark as recurring if interval is reasonably consistent (stddev < 35% of mean)
    if (sd > meanInterval * 0.35) continue;

    // Detect frequency from average interval
    let frequency: string | null = null;
    if (meanInterval >= 6 && meanInterval <= 8) frequency = 'weekly';
    else if (meanInterval >= 13 && meanInterval <= 16) frequency = 'biweekly';
    else if (meanInterval >= 28 && meanInterval <= 35) frequency = 'monthly';
    else if (meanInterval >= 88 && meanInterval <= 95) frequency = 'quarterly';

    if (!frequency) continue;

    // Use the most recent raw name
    const rawName = entries[entries.length - 1].rawName;
    const amounts = entries.map((e) => e.amount);
    const meanAmount = avg(amounts);

    results.push({
      source: rawName,
      avgAmount: Math.round(meanAmount * 100) / 100,
      frequency,
      occurrences: entries.length,
    });
  }

  return results;
}

// ─── Main Export ───────────────────────────────────────────────────────────

/**
 * Calculate all income metrics for a period
 *
 * Income is transaction-first: when any bank transactions exist in the period
 * (income or not), we know the user has connected accounts and we use actual
 * deposits as the ground truth. Manual income records are kept as a "budgeted"
 * reference but never override real bank data.
 *
 * Results include:
 * - budgetedIncome: sum of all recurring/manual income entries (reference only)
 * - actualIncome: detected from bank transactions (ground truth)
 * - effectiveIncome: actual when bank data exists for the period, else budgeted
 * - hasBankData: true when the user has ANY transactions in the period (not just income)
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
  historicalTransactions?: NormalizedTransaction[];
  monthStart: Date;
  monthEnd: Date;
}): IncomeResult {
  const { income: incomeRecords = [], transactions = [], historicalTransactions, monthStart, monthEnd } = params;

  // Calculate budgeted income from user-entered records (reference/fallback only)
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
  let hasAnyTransactions = false;
  const transactionStartDate = startOfMonth(monthStart);
  const transactionEndDate = endOfMonth(monthEnd);

  // Track current-month income by merchant so we can add them to bySource
  const currentMonthIncomeByMerchant: Record<string, { total: number; merchant: string; category: string }> = {};

  for (const tx of transactions) {
    try {
      const txDate = parseISO(tx.date);

      // Filter by date range
      if (isBefore(txDate, transactionStartDate) || isAfter(txDate, transactionEndDate)) {
        continue;
      }

      // Any transaction in the period means the user has bank data connected
      hasAnyTransactions = true;

      // Skip pending, transfers, non-income for the actual income sum
      if (tx.isPending || tx.isTransfer || !tx.isIncome) {
        continue;
      }

      actualIncomeCents += toCents(tx.amount);

      // Group by merchant for bySource breakdown
      const merchantName = tx.merchant || 'Unknown';
      const key = normalizeSourceName(merchantName);
      if (!currentMonthIncomeByMerchant[key]) {
        currentMonthIncomeByMerchant[key] = { total: 0, merchant: merchantName, category: tx.category || 'Income' };
      }
      currentMonthIncomeByMerchant[key].total += parseFloat(String(tx.amount));
    } catch (e) {
      // Skip malformed transactions
      continue;
    }
  }

  // Add current-month bank income deposits to bySource (skip if already covered by a DB income record)
  const existingSourceNamesFromDB = new Set(
    bySource.map((s) => normalizeSourceName(s.source))
  );
  for (const [normalizedKey, info] of Object.entries(currentMonthIncomeByMerchant)) {
    // Check exact and partial matches against DB income records
    let alreadyCovered = existingSourceNamesFromDB.has(normalizedKey);
    if (!alreadyCovered) {
      for (const existing of existingSourceNamesFromDB) {
        if (existing.includes(normalizedKey) || normalizedKey.includes(existing)) {
          alreadyCovered = true;
          break;
        }
      }
    }
    if (!alreadyCovered) {
      bySource.push({
        source: info.merchant,
        amount: Math.round(info.total * 100) / 100,
        category: info.category,
        isRecurring: false,
      });
    }
  }

  // ─── Historical Recurring Source Detection ────────────────────────────
  // If historical transactions are provided, detect recurring income sources
  // that haven't deposited in the current period yet (e.g., biweekly pay
  // where the last check was in the prior month and the next hasn't landed).
  // These are added to bySource so the user can see all expected income.
  if (historicalTransactions && historicalTransactions.length > 0) {
    // Filter historical transactions to income only (non-pending, non-transfer)
    const historicalIncome = historicalTransactions.filter(
      (tx) => !tx.isPending && !tx.isTransfer && tx.isIncome
    );

    if (historicalIncome.length > 0) {
      const detectedSources = detectRecurringIncomeSources(historicalIncome);

      // Build a set of normalized names already present in bySource
      // (from DB income records AND current-month bank deposits) so we don't double-count
      const existingSourceNames = new Set(
        bySource.map((s) => normalizeSourceName(s.source))
      );

      for (const detected of detectedSources) {
        const normalizedDetected = normalizeSourceName(detected.source);

        // Skip if already represented in bySource (DB records + current-month deposits)
        if (existingSourceNames.has(normalizedDetected)) continue;

        // Also check partial matches (e.g., "coreslab structures" vs "coreslab")
        let alreadyExists = false;
        for (const existing of existingSourceNames) {
          if (existing.includes(normalizedDetected) || normalizedDetected.includes(existing)) {
            alreadyExists = true;
            break;
          }
        }
        if (alreadyExists) continue;

        // Add detected recurring source as an expected income entry
        bySource.push({
          source: detected.source,
          amount: detected.avgAmount,
          category: 'Employment',
          isRecurring: true,
        });
      }
    }
  }

  const budgetedIncome = toDollars(budgetedIncomeCents);
  const actualIncome = toDollars(actualIncomeCents);

  // Transaction-first: if the user has ANY bank data for this period, trust it.
  // This means if they have transactions but no income deposits yet (e.g., mid-month
  // before payday), we show $0 actual rather than a stale manual estimate.
  const hasBankData = hasAnyTransactions;
  const effectiveIncome = hasBankData ? actualIncome : budgetedIncome;

  return {
    budgetedIncome,
    actualIncome,
    effectiveIncome,
    hasBankData,
    bySource,
  };
}