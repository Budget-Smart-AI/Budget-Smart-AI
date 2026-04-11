/**
 * Investments Calculator
 *
 * Aggregates investment portfolio data across accounts and holdings.
 * All monetary values are in cents (integers) to avoid floating-point drift.
 */

import { InvestmentsResult, Cents } from './types';

export interface InvestmentAccount {
  id: string;
  balance: Cents;
}

export interface Holding {
  id: string;
  currentValue: Cents;
  costBasis: Cents;
}

export interface InvestmentsParams {
  accounts: InvestmentAccount[];
  holdings: Holding[];
}

/**
 * Calculate total investment portfolio value and gains
 *
 * @param params - Object containing investment accounts and holdings
 * @returns InvestmentsResult with portfolio value, cost basis, and gains
 */
export function calculateInvestments(params: InvestmentsParams): InvestmentsResult {
  const { accounts = [], holdings = [] } = params;

  // Aggregate holdings by account to get total per account
  const holdingsByAccount: Record<string, Cents> = {};
  let totalHoldingsValue: Cents = 0;
  let totalCostBasis: Cents = 0;

  holdings.forEach((holding) => {
    if (!holdingsByAccount[holding.id]) {
      holdingsByAccount[holding.id] = 0;
    }
    holdingsByAccount[holding.id] += holding.currentValue || 0;
    totalHoldingsValue += holding.currentValue || 0;
    totalCostBasis += holding.costBasis || 0;
  });

  // If we have holdings, use their aggregated values
  let totalValue: Cents = 0;
  let totalCost: Cents = 0;

  if (Object.keys(holdingsByAccount).length > 0) {
    // Use aggregated holdings as the source of truth for value
    totalValue = totalHoldingsValue;
    totalCost = totalCostBasis;
  } else {
    // If no holdings, sum account balances directly
    totalValue = accounts.reduce((sum, account) => sum + (account.balance || 0), 0);
    totalCost = totalValue; // Assume cost basis equals current value if we have no holdings
  }

  // Calculate gains
  const totalGain = totalValue - totalCost;
  const gainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  return {
    totalValue,
    totalCost,
    totalGain,
    gainPercent,
  };
}