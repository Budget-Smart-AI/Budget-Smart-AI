/**
 * Net Worth Calculator
 *
 * Calculates total net worth as the difference between assets and liabilities.
 * Uses NormalizedAccount for all bank accounts (provider-agnostic).
 * All monetary values are in dollars.
 */

import { NetWorthResult, Cents } from './types';
import type { NormalizedAccount } from './normalized-types';

// âââ Supporting Types (not provider-specific) âââââââââââââââââââââââââââââ

export interface Asset {
  id: string;
  category: string;
  currentValue: number;
  purchasePrice?: number;
}

export interface Debt {
  id: string;
  currentBalance: number;
  debtType: string;
}

export interface InvestmentAccount {
  id: string;
  balance: number;
}

export interface Holding {
  id: string;
  currentValue: number;
  costBasis: number;
}

export interface NetWorthSnapshot {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  date: string;
}

export interface NetWorthParams {
  /** All bank accounts from all providers, pre-normalized */
  bankAccounts: NormalizedAccount[];
  assets: Asset[];
  debts: Debt[];
  investmentAccounts: InvestmentAccount[];
  holdings: Holding[];
  history: NetWorthSnapshot[];
}

// âââ Helpers ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const ASSET_ACCOUNT_TYPES = new Set(['checking', 'savings', 'depository', 'investment']);
const LIABILITY_TYPES = new Set(['credit', 'loan', 'mortgage', 'credit_card', 'line_of_credit']);

/**
 * Calculate total assets from all sources
 */
function calculateTotalAssets(
  bankAccounts: NormalizedAccount[],
  assets: Asset[],
  investmentAccounts: InvestmentAccount[],
  holdings: Holding[]
): { total: Cents; breakdown: Record<string, Cents> } {
  const breakdown: Record<string, Cents> = {};
  let total: Cents = 0;

  // Bank accounts (asset types: checking, savings, depository, investment) -- provider-agnostic
  const assetAccounts = bankAccounts.filter(
    (acc) => acc.isActive && ASSET_ACCOUNT_TYPES.has(acc.accountType)
  );

  const bankTotal = assetAccounts.reduce((sum, acc) => sum + (parseFloat(String(acc.balance)) || 0), 0);

  // Always include bank account balances in assets (even if total is negative, e.g. overdrawn checking)
  if (bankTotal !== 0) {
    breakdown['Bank Accounts'] = bankTotal;
    total += bankTotal;
  }

  // Investment accounts and holdings
  let investmentTotal: Cents = 0;

  const holdingsByAccount: Record<string, Cents> = {};
  holdings.forEach((holding) => {
    if (!holdingsByAccount[holding.id]) {
      holdingsByAccount[holding.id] = 0;
    }
    holdingsByAccount[holding.id] += holding.currentValue || 0;
  });

  investmentAccounts.forEach((account) => {
    const value = holdingsByAccount[account.id] || account.balance || 0;
    investmentTotal += value;
  });

  if (investmentTotal > 0) {
    breakdown['Investments'] = investmentTotal;
    total += investmentTotal;
  }

  // Manual assets
  const manualAssetsTotal = assets.reduce(
    (sum, asset) => sum + (asset.currentValue || 0),
    0
  );

  if (manualAssetsTotal > 0) {
    breakdown['Assets'] = manualAssetsTotal;
    total += manualAssetsTotal;
  }

  return { total, breakdown };
}

/**
 * Calculate total liabilities from all sources
 */
function calculateTotalLiabilities(
  bankAccounts: NormalizedAccount[],
  debts: Debt[]
): { total: Cents; breakdown: Record<string, Cents> } {
  const breakdown: Record<string, Cents> = {};
  let total: Cents = 0;

  // Credit cards, loans, mortgages from any bank provider â provider-agnostic
  // Group by account type for per-category breakdown
  const liabilityAccounts = bankAccounts.filter(
    (acc) => acc.isActive && LIABILITY_TYPES.has(acc.accountType)
  );

  const typeLabels: Record<string, string> = {
    mortgage: 'Mortgages',
    credit_card: 'Credit Cards',
    credit: 'Credit Cards',
    line_of_credit: 'Lines of Credit',
    loan: 'Other Loans',
  };

  let bankLiabilitiesTotal = 0;
  for (const acc of liabilityAccounts) {
    const amount = Math.abs(parseFloat(String(acc.balance)) || 0);
    bankLiabilitiesTotal += amount;
    const label = typeLabels[acc.accountType] || 'Other Debts';
    breakdown[label] = (breakdown[label] || 0) + amount;
  }

  if (bankLiabilitiesTotal > 0) {
    // Individual category entries (Mortgages, Credit Cards, etc.) are already in breakdown.
    // Only add the total to the running sum â do NOT add a redundant "Bank Debts" key.
    total += bankLiabilitiesTotal;
  }

  // Manual debts
  const manualDebtsTotal = debts.reduce(
    (sum, debt) => sum + (debt.currentBalance || 0),
    0
  );

  if (manualDebtsTotal > 0) {
    breakdown['Manual Debts'] = manualDebtsTotal;
    total += manualDebtsTotal;
  }

  return { total, breakdown };
}

// âââ Main Export ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/**
 * Calculate net worth from comprehensive account data
 *
 * All bank accounts are pre-normalized by the adapter layer, so this function
 * never needs to know whether data came from Plaid, MX, or any other provider.
 *
 * @param params - Object containing all account and debt data
 * @returns NetWorthResult with net worth, assets, liabilities, and breakdown
 */
export function calculateNetWorth(params: NetWorthParams): NetWorthResult {
  const {
    bankAccounts = [],
    assets = [],
    debts = [],
    investmentAccounts = [],
    holdings = [],
    history = [],
  } = params;

  const assetsCalc = calculateTotalAssets(
    bankAccounts,
    assets,
    investmentAccounts,
    holdings
  );

  const liabilitiesCalc = calculateTotalLiabilities(bankAccounts, debts);

  const totalAssets = assetsCalc.total;
  const totalLiabilities = liabilitiesCalc.total;
  const netWorth = totalAssets - totalLiabilities;

  const totalCombined = totalAssets + totalLiabilities;
  const assetPercent =
    totalCombined > 0 ? (totalAssets / totalCombined) * 100 : 100;

  let latestChange: Cents = 0;
  if (history.length >= 2) {
    latestChange = history[0].netWorth - history[1].netWorth;
  }

  return {
    netWorth,
    totalAssets,
    totalLiabilities,
    assetPercent,
    latestChange,
    assetBreakdown: assetsCalc.breakdown,
    liabilityBreakdown: liabilitiesCalc.breakdown,
  };
    }
