/**
 * Debt Payoff Calculator
 *
 * Calculates debt payoff strategies (avalanche vs snowball) and projections.
 * All monetary values are in cents (integers) to avoid floating-point drift.
 */

import { DebtItem, DebtPayoffResult, DebtPayoffScheduleEntry, Cents } from './types';

/**
 * Convert payment amount from various frequencies to monthly
 */
export function toMonthlyPayment(amount: Cents, frequency: string): Cents {
  const freq = frequency?.toLowerCase().trim() || 'monthly';

  switch (freq) {
    case 'weekly':
      return Math.round((amount * 52) / 12);
    case 'biweekly':
      return Math.round((amount * 26) / 12);
    case 'semi-monthly':
      return amount * 2;
    case 'quarterly':
      return Math.round(amount / 3);
    case 'annually':
    case 'yearly':
      return Math.round(amount / 12);
    case 'monthly':
    default:
      return amount;
  }
}

/**
 * Calculate payoff schedule for a single debt
 */
function calculateSingleDebtPayoff(
  debtId: string,
  name: string,
  balance: Cents,
  interestRate: number, // APR as percentage
  monthlyPayment: Cents,
  maxMonths: number = 360
): DebtPayoffScheduleEntry[] {
  const schedule: DebtPayoffScheduleEntry[] = [];
  const monthlyRate = interestRate / 100 / 12;
  let remaining = balance;
  let month = 0;

  while (remaining > 0 && month < maxMonths) {
    month += 1;

    const interest = Math.round(remaining * monthlyRate);
    const totalDue = remaining + interest;
    const payment = Math.min(monthlyPayment, totalDue);
    const principal = payment - interest;

    remaining = Math.max(0, remaining - principal);

    const date = new Date();
    date.setMonth(date.getMonth() + month);
    const dateStr = date.toISOString().split('T')[0];

    schedule.push({
      month,
      date: dateStr,
      payment,
      principal,
      interest,
      remainingBalance: remaining,
    });
  }

  return schedule;
}

/**
 * Avalanche strategy: pay minimum on all, extra to highest interest rate
 */
function calculateAvalanche(
  debts: DebtItem[],
  extraPayment: Cents
): {
  months: number;
  totalInterest: Cents;
  totalPaid: Cents;
  payoffOrder: string[];
  schedule: DebtPayoffScheduleEntry[];
} {
  if (debts.length === 0) {
    return {
      months: 0,
      totalInterest: 0,
      totalPaid: 0,
      payoffOrder: [],
      schedule: [],
    };
  }

  // Sort by interest rate descending
  const sortedDebts = [...debts].sort((a, b) => b.interestRate - a.interestRate);

  // Track remaining balance for each debt
  const remaining: Record<string, Cents> = {};
  debts.forEach((debt) => {
    remaining[debt.id] = debt.balance;
  });

  const allSchedules: Record<string, DebtPayoffScheduleEntry[]> = {};
  let payoffOrder: string[] = [];
  let month = 0;
  let totalInterest: Cents = 0;
  let totalPaid: Cents = 0;
  const maxMonths = 360;

  while (Object.values(remaining).some((bal) => bal > 0) && month < maxMonths) {
    month += 1;

    // Calculate interest for all debts
    for (const debt of debts) {
      if (remaining[debt.id] <= 0) continue;

      const monthlyRate = debt.interestRate / 100 / 12;
      const interest = Math.round(remaining[debt.id] * monthlyRate);

      if (!allSchedules[debt.id]) {
        allSchedules[debt.id] = [];
      }

      // Minimum payment on this debt
      let payment = debt.minimumPayment;

      // Find highest-interest debt that still has balance
      const highestInterestDebt = sortedDebts.find((d) => remaining[d.id] > 0);

      // If this is the highest-interest debt, add extra payment
      if (highestInterestDebt && debt.id === highestInterestDebt.id) {
        payment += extraPayment;
      }

      const totalDue = remaining[debt.id] + interest;
      const actualPayment = Math.min(payment, totalDue);
      const principal = actualPayment - interest;

      remaining[debt.id] = Math.max(0, remaining[debt.id] - principal);

      totalInterest += interest;
      totalPaid += actualPayment;

      const date = new Date();
      date.setMonth(date.getMonth() + month);
      const dateStr = date.toISOString().split('T')[0];

      allSchedules[debt.id].push({
        month,
        date: dateStr,
        payment: actualPayment,
        principal,
        interest,
        remainingBalance: remaining[debt.id],
      });

      // Track payoff order
      if (remaining[debt.id] <= 0 && !payoffOrder.includes(debt.id)) {
        payoffOrder.push(debt.id);
      }
    }
  }

  // Combine all schedules
  const schedule: DebtPayoffScheduleEntry[] = [];
  for (let m = 1; m <= month; m++) {
    for (const debt of debts) {
      if (allSchedules[debt.id] && allSchedules[debt.id][m - 1]) {
        schedule.push(allSchedules[debt.id][m - 1]);
      }
    }
  }

  return {
    months: month,
    totalInterest,
    totalPaid,
    payoffOrder,
    schedule,
  };
}

/**
 * Snowball strategy: pay minimum on all, extra to smallest balance
 */
function calculateSnowball(
  debts: DebtItem[],
  extraPayment: Cents
): {
  months: number;
  totalInterest: Cents;
  totalPaid: Cents;
  payoffOrder: string[];
  schedule: DebtPayoffScheduleEntry[];
} {
  if (debts.length === 0) {
    return {
      months: 0,
      totalInterest: 0,
      totalPaid: 0,
      payoffOrder: [],
      schedule: [],
    };
  }

  // Sort by balance ascending
  const sortedDebts = [...debts].sort((a, b) => a.balance - b.balance);

  // Track remaining balance for each debt
  const remaining: Record<string, Cents> = {};
  debts.forEach((debt) => {
    remaining[debt.id] = debt.balance;
  });

  const allSchedules: Record<string, DebtPayoffScheduleEntry[]> = {};
  let payoffOrder: string[] = [];
  let month = 0;
  let totalInterest: Cents = 0;
  let totalPaid: Cents = 0;
  const maxMonths = 360;

  while (Object.values(remaining).some((bal) => bal > 0) && month < maxMonths) {
    month += 1;

    // Calculate interest for all debts
    for (const debt of debts) {
      if (remaining[debt.id] <= 0) continue;

      const monthlyRate = debt.interestRate / 100 / 12;
      const interest = Math.round(remaining[debt.id] * monthlyRate);

      if (!allSchedules[debt.id]) {
        allSchedules[debt.id] = [];
      }

      // Minimum payment on this debt
      let payment = debt.minimumPayment;

      // Find smallest remaining balance
      const smallestDebt = sortedDebts.find((d) => remaining[d.id] > 0);

      // If this is the smallest-balance debt, add extra payment
      if (smallestDebt && debt.id === smallestDebt.id) {
        payment += extraPayment;
      }

      const totalDue = remaining[debt.id] + interest;
      const actualPayment = Math.min(payment, totalDue);
      const principal = actualPayment - interest;

      remaining[debt.id] = Math.max(0, remaining[debt.id] - principal);

      totalInterest += interest;
      totalPaid += actualPayment;

      const date = new Date();
      date.setMonth(date.getMonth() + month);
      const dateStr = date.toISOString().split('T')[0];

      allSchedules[debt.id].push({
        month,
        date: dateStr,
        payment: actualPayment,
        principal,
        interest,
        remainingBalance: remaining[debt.id],
      });

      // Track payoff order
      if (remaining[debt.id] <= 0 && !payoffOrder.includes(debt.id)) {
        payoffOrder.push(debt.id);
      }
    }

    // Re-sort by remaining balance after each month
    sortedDebts.sort((a, b) => remaining[a.id] - remaining[b.id]);
  }

  // Combine all schedules
  const schedule: DebtPayoffScheduleEntry[] = [];
  for (let m = 1; m <= month; m++) {
    for (const debt of debts) {
      if (allSchedules[debt.id] && allSchedules[debt.id][m - 1]) {
        schedule.push(allSchedules[debt.id][m - 1]);
      }
    }
  }

  return {
    months: month,
    totalInterest,
    totalPaid,
    payoffOrder,
    schedule,
  };
}

/**
 * Calculate debt payoff projections with both avalanche and snowball strategies
 */
export function calculateDebtPayoff(params: {
  debts: DebtItem[];
  extraPayment: Cents;
}): DebtPayoffResult {
  const { debts = [], extraPayment = 0 } = params;

  if (debts.length === 0) {
    return {
      totalDebt: 0,
      totalMinPayments: 0,
      weightedAvgApr: 0,
      avalanche: {
        months: 0,
        totalInterest: 0,
        totalPaid: 0,
        payoffOrder: [],
        schedule: [],
      },
      snowball: {
        months: 0,
        totalInterest: 0,
        totalPaid: 0,
        payoffOrder: [],
        schedule: [],
      },
      interestSaved: 0,
      payoffDate: new Date().toISOString().split('T')[0],
    };
  }

  // Calculate totals
  const totalDebt = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const totalMinPayments = debts.reduce((sum, debt) => sum + debt.minimumPayment, 0);

  // Calculate weighted average APR
  let weightedAvgApr = 0;
  if (totalDebt > 0) {
    weightedAvgApr = debts.reduce((sum, debt) => sum + debt.interestRate * debt.balance, 0) / totalDebt;
  }

  // Calculate strategies
  const avalanche = calculateAvalanche(debts, extraPayment);
  const snowball = calculateSnowball(debts, extraPayment);

  // Interest saved
  const interestSaved = snowball.totalInterest - avalanche.totalInterest;

  // Payoff date based on avalanche (fastest)
  let payoffDate = new Date();
  payoffDate.setMonth(payoffDate.getMonth() + avalanche.months);
  const payoffDateStr = payoffDate.toISOString().split('T')[0];

  return {
    totalDebt,
    totalMinPayments,
    weightedAvgApr,
    avalanche,
    snowball,
    interestSaved,
    payoffDate: payoffDateStr,
  };
}