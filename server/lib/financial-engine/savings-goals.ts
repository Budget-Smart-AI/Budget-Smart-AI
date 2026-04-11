/**
 * Savings Goals Calculation
 *
 * Tracks progress toward savings goals including completion status,
 * remaining amount, and time to target (if date provided).
 */

import { SavingsGoalsResult } from './types';
import { differenceInDays, parseISO } from 'date-fns';

export interface SavingsGoal {
  id?: string;
  current: number;
  target: number;
  targetDate?: string; // ISO date format (YYYY-MM-DD)
}

export function calculateSavingsGoals(params: { goals: SavingsGoal[] }): SavingsGoalsResult {
  const { goals } = params;
  const now = new Date();

  // Calculate totals
  const totalSaved = goals.reduce((sum, goal) => sum + goal.current, 0);
  const totalTarget = goals.reduce((sum, goal) => sum + goal.target, 0);

  // Calculate overall progress percentage
  const overallProgress = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  // Calculate per-goal breakdown
  const goalsBreakdown = goals.map((goal) => {
    // Calculate percentage complete (capped at 100%)
    const percentage = goal.target > 0 ? Math.min((goal.current / goal.target) * 100, 100) : 0;

    // Calculate remaining amount
    const remaining = Math.max(goal.target - goal.current, 0);

    // Determine if goal is complete
    const isComplete = goal.current >= goal.target;

    // Calculate days remaining
    let daysLeft: number | null = null;
    if (goal.targetDate) {
      try {
        const targetDate = parseISO(goal.targetDate);
        daysLeft = differenceInDays(targetDate, now);
      } catch (e) {
        // Invalid date format, leave as null
        daysLeft = null;
      }
    }

    return {
      id: goal.id || '',
      name: goal.id || 'Goal',
      current: goal.current,
      target: goal.target,
      percentage: Math.round(percentage * 100) / 100,
      remaining: remaining,
      isComplete,
      daysLeft,
    };
  });

  return {
    goals: goalsBreakdown,
    totalSaved,
    totalTarget,
    overallProgress: Math.round(overallProgress * 100) / 100,
  };
}