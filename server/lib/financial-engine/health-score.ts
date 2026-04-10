/**
 * Financial Health Score Calculation
 *
 * Combines four components (each 0-25 points) into a comprehensive health score (0-100).
 * Scores are weighted equally to give a balanced view of financial health.
 */

import { HealthScoreResult } from './types';

/**
 * Calculate savings rate score (0-25)
 * Savings rate = (Income - Expenses) / Income * 100
 * - ≥20% = 25 points
 * - 10-20% = scaled 15-25 points
 * - 0-10% = scaled 0-15 points
 * - <0% (negative) = 0 points
 */
function calculateSavingsRateScore(totalIncome: number, totalExpenses: number): number {
  if (totalIncome <= 0) {
    return 0;
  }

  const savingsRate = ((totalIncome - totalExpenses) / totalIncome) * 100;

  if (savingsRate >= 20) {
    return 25;
  } else if (savingsRate >= 10) {
    // Scale from 15-25 for 10-20% range
    return 15 + ((savingsRate - 10) / 10) * 10;
  } else if (savingsRate > 0) {
    // Scale from 0-15 for 0-10% range
    return (savingsRate / 10) * 15;
  } else {
    // Negative savings rate
    return 0;
  }
}

/**
 * Calculate budget tracking score (0-25)
 * Based on number of budgets set:
 * - 0 budgets = 0 points
 * - 1-2 = 10-16 points (linear)
 * - 3-4 = 20 points
 * - 5+ = 25 points
 */
function calculateBudgetScore(budgetCount: number): number {
  if (budgetCount === 0) {
    return 0;
  } else if (budgetCount <= 2) {
    // Scale from 10-16 for 1-2 budgets
    return 10 + ((budgetCount - 1) / 1) * 6;
  } else if (budgetCount <= 4) {
    // 3-4 budgets = 20 points
    return 20;
  } else {
    // 5+ budgets = 25 points
    return 25;
  }
}

/**
 * Calculate savings goals progress score (0-25)
 * Based on average progress across all goals
 * - Average progress % = (sum of goal percentages) / number of goals
 * - Score = (avgProgress / 100) * 25
 */
function calculateSavingsGoalScore(
  goals: Array<{ current: number; target: number }>
): number {
  if (goals.length === 0) {
    return 0;
  }

  let totalProgress = 0;
  goals.forEach((goal) => {
    if (goal.target > 0) {
      const progress = Math.min((goal.current / goal.target) * 100, 100);
      totalProgress += progress;
    }
  });

  const avgProgress = totalProgress / goals.length;
  return (avgProgress / 100) * 25;
}

/**
 * Calculate bill tracking score (0-25)
 * Based on number of bills set:
 * - 0 bills = 0 points
 * - 1-2 = 10-16 points (linear)
 * - 3-4 = 20 points
 * - 5+ = 25 points
 */
function calculateBillScore(billCount: number): number {
  if (billCount === 0) {
    return 0;
  } else if (billCount <= 2) {
    // Scale from 10-16 for 1-2 bills
    return 10 + ((billCount - 1) / 1) * 6;
  } else if (billCount <= 4) {
    // 3-4 bills = 20 points
    return 20;
  } else {
    // 5+ bills = 25 points
    return 25;
  }
}

export function calculateHealthScore(params: {
  totalIncome: number;
  totalExpenses: number;
  budgetCount: number;
  billCount: number;
  savingsGoals: Array<{ current: number; target: number }>;
}): HealthScoreResult {
  const {
    totalIncome,
    totalExpenses,
    budgetCount,
    billCount,
    savingsGoals,
  } = params;

  // Calculate component scores
  const savingsRateScore = calculateSavingsRateScore(totalIncome, totalExpenses);
  const budgetScore = calculateBudgetScore(budgetCount);
  const savingsGoalScore = calculateSavingsGoalScore(savingsGoals);
  const billScore = calculateBillScore(billCount);

  // Total is sum of all components (each 0-25, so total 0-100)
  const totalScore = savingsRateScore + budgetScore + savingsGoalScore + billScore;

  // Calculate underlying metrics for breakdown
  const savingsRate =
    totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

  let avgGoalProgress = 0;
  if (savingsGoals.length > 0) {
    let totalProgress = 0;
    savingsGoals.forEach((goal) => {
      if (goal.target > 0) {
        totalProgress += Math.min((goal.current / goal.target) * 100, 100);
      }
    });
    avgGoalProgress = totalProgress / savingsGoals.length;
  }

  return {
    totalScore: Math.round(totalScore),
    savingsRateScore: Math.round(savingsRateScore),
    budgetScore: Math.round(budgetScore),
    savingsGoalScore: Math.round(savingsGoalScore),
    billScore: Math.round(billScore),
    savingsRate: Math.round(savingsRate * 100) / 100,
    budgetCount,
    billCount,
    avgGoalProgress: Math.round(avgGoalProgress * 100) / 100,
  };
}
