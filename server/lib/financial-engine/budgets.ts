/**
 * Budget Calculations
 *
 * Calculates budget performance across all categories for the current month.
 * Determines pace status (on-track, over, under) and projects end-of-month spending.
 */

import { BudgetsResult, PaceStatus } from './types';
import { getDaysInMonth } from 'date-fns';

/**
 * Calculate month progress as a decimal 0-1
 * Example: Apr 10 out of 30 days = 0.333
 */
function monthProgress(now: Date): number {
  const daysInCurrentMonth = getDaysInMonth(now);
  const currentDay = now.getDate();
  return currentDay / daysInCurrentMonth;
}

/**
 * Calculate expected spend for a given budget at current progress
 * If we're 1/3 through the month, expected spend should be 1/3 of budget
 */
function expectedSpend(budget: number, progress: number): number {
  return budget * progress;
}

/**
 * Calculate projected end-of-month spending based on current pace
 * If we've spent $100 and we're 1/3 through the month, we'll spend ~$300
 */
function projectedSpend(spent: number, progress: number): number {
  if (progress <= 0) return 0;
  return spent / progress;
}

/**
 * Determine pace status based on spending vs expected
 * - over-budget: total spent exceeds budgeted amount
 * - over-pace: spending >115% of expected for this point in month
 * - on-pace: spending 85-115% of expected
 * - under: spending <85% of expected
 */
function getPaceStatus(spent: number, budget: number, progress: number): PaceStatus {
  // If we've already spent more than budgeted, we're over budget
  if (spent > budget) {
    return 'over-budget';
  }

  // Compare actual spending to expected spending for this point in the month
  const expected = expectedSpend(budget, progress);
  if (expected === 0) {
    return 'on-pace';
  }

  const ratio = spent / expected;

  if (ratio <= 0.85) {
    return 'under';
  } else if (ratio <= 1.15) {
    return 'on-pace';
  } else {
    return 'over-pace';
  }
}

/**
 * Generate human-readable pace label
 */
function getPaceLabel(
  status: PaceStatus,
  spent: number,
  budget: number,
  projected: number
): string {
  switch (status) {
    case 'over-budget':
      const overAmount = spent - budget;
      return `$${overAmount.toFixed(2)} over budget`;
    case 'over-pace':
      const projectedOverage = projected - budget;
      return `Projected to spend $${projectedOverage.toFixed(2)} by month end`;
    case 'on-pace':
      return 'On track';
    case 'under':
      const underAmount = budget - spent;
      return `$${underAmount.toFixed(2)} under expected pace`;
  }
}

export interface BudgetItem {
  category: string;
  amount: number;
  month: string; // yyyy-MM format
}

export interface Expense {
  category: string;
  amount: number;
  date: string; // ISO date format
}

export function calculateBudgets(params: {
  budgets: BudgetItem[];
  expenses: Expense[];
  month: string; // yyyy-MM format
  now?: Date;
}): BudgetsResult {
  const { budgets, expenses, month } = params;
  const now = params.now || new Date();

  // Calculate month progress (0-1)
  const progress = monthProgress(now);

  // Group expenses by category for the current month
  const expensesByCategory: Record<string, number> = {};

  expenses.forEach((expense) => {
    // Extract month from expense date (YYYY-MM-DD format)
    const expenseMonth = expense.date.substring(0, 7);

    if (expenseMonth === month) {
      if (!expensesByCategory[expense.category]) {
        expensesByCategory[expense.category] = 0;
      }
      expensesByCategory[expense.category] += expense.amount;
    }
  });

  // Calculate per-category results
  const items = budgets
    .filter((b) => b.month === month)
    .map((budget) => {
      const spent = expensesByCategory[budget.category] || 0;
      const expected = expectedSpend(budget.amount, progress);
      const projected = projectedSpend(spent, progress);
      const paceStatus = getPaceStatus(spent, budget.amount, progress);
      const paceLabel = getPaceLabel(paceStatus, spent, budget.amount, projected);

      return {
        category: budget.category,
        budgetAmount: budget.amount,
        spent,
        percentage: budget.amount > 0 ? (spent / budget.amount) * 100 : 0,
        paceStatus,
        paceLabel,
        projectedSpend: projected,
      };
    });

  // Calculate totals
  const totalBudget = items.reduce((sum, item) => sum + item.budgetAmount, 0);
  const totalSpent = items.reduce((sum, item) => sum + item.spent, 0);
  const overallPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  // Count health statuses
  const healthCounts = {
    overBudget: items.filter((i) => i.paceStatus === 'over-budget').length,
    overPace: items.filter((i) => i.paceStatus === 'over-pace').length,
    onPace: items.filter((i) => i.paceStatus === 'on-pace').length,
    under: items.filter((i) => i.paceStatus === 'under').length,
  };

  return {
    items,
    totalBudget,
    totalSpent,
    overallPercentage,
    healthCounts,
    monthProgress: progress,
  };
}