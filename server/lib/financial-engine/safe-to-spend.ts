/**
 * Safe to Spend Calculation
 *
 * Determines how much the user can safely spend for the remainder of the month
 * after accounting for bills and current spending, spread across remaining days.
 */

import { SafeToSpendResult } from './types';
import { endOfMonth, differenceInDays } from 'date-fns';

export function calculateSafeToSpend(params: {
  effectiveIncome: number;
  billsTotal: number;
  totalSpent: number;
  today?: Date;
}): SafeToSpendResult {
  const { effectiveIncome, billsTotal, totalSpent } = params;
  const today = params.today || new Date();

  // Calculate safe to spend: income - bills - already spent
  const safeToSpend = Math.max(0, effectiveIncome - billsTotal - totalSpent);

  // Calculate days remaining in month (inclusive of today)
  const monthEnd = endOfMonth(today);
  const daysRemaining = differenceInDays(monthEnd, today) + 1;

  // Calculate daily allowance (floored at 0)
  const dailyAllowance = daysRemaining > 0 ? Math.max(0, safeToSpend / daysRemaining) : 0;

  return {
    safeToSpend: Math.round(safeToSpend * 100) / 100,
    dailyAllowance: Math.round(dailyAllowance * 100) / 100,
    daysRemaining: Math.max(0, daysRemaining),
  };
}
