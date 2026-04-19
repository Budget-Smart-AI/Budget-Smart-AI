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

// Cash accounts: liquid funds that can be positive or negative (overdrawn).
// Following Monarch's logic, only positive balances contribute to Assets;
// negative balances (overdrawn) are treated as liabilities.
const CASH_TYPES = new Set(['checking', 'savings', 'depository']);
const INVESTMENT_BANK_TYPES = new Set(['investment', 'brokerage']);
const LIABILITY_TYPES = new Set(['credit', 'loan', 'mortgage', 'credit_card', 'line_of_credit']);

/**
 * Calculate total assets from all sources
 *
 * Following Monarch's pattern: Assets are POSITIVE positions you own.
 * - Cash accounts: only positive balances are counted (overdrawn cash flows to liabilities)
 * - Investment accounts: counted at full value
 * - Manual assets: counted at current value
 */
function calculateTotalAssets(
  bankAccounts: NormalizedAccount[],
  assets: Asset[],
  investmentAccounts: InvestmentAccount[],
  holdings: Holding[]
): { total: Cents; breakdown: Record<string, Cents> } {
  const breakdown: Record<string, Cents> = {};
  let total: Cents = 0;

  // Cash & Bank Accounts (checking, savings, depository) — only positive contributes
  // Per-account treatment: each account adds to Assets only if its balance is positive.
  // Overdrawn balances are surfaced under Liabilities (see calculateTotalLiabilities).
  const cashAccounts = bankAccounts.filter(
    (acc) => acc.isActive && CASH_TYPES.has(acc.accountType)
  );

  const cashAssetTotal = cashAccounts.reduce(
    (sum, acc) => sum + Math.max(0, parseFloat(String(acc.balance)) || 0),
    0
  );

  if (cashAssetTotal > 0) {
    breakdown['Cash'] = cashAssetTotal;
    total += cashAssetTotal;
  }

  // Investment-type bank accounts (e.g., brokerage cash from Plaid/MX) —
  // these are the *provider-synced* investment accounts, deduplicated by id
  // against the manual `investmentAccounts` table so a brokerage that's both
  // linked AND manually entered isn't counted twice (UAT-8 #147 root cause).
  const investmentBankAccounts = bankAccounts.filter(
    (acc) => acc.isActive && INVESTMENT_BANK_TYPES.has(acc.accountType)
  );

  const bankInvestmentIds = new Set(investmentBankAccounts.map((a) => a.id));

  const investmentBankTotal = investmentBankAccounts.reduce(
    (sum, acc) => sum + Math.max(0, parseFloat(String(acc.balance)) || 0),
    0
  );

  // Pre-index holdings by their account id so both linked-brokerage (id ==
  // bank account id) and manual-investment (id == investment_accounts id)
  // rows roll up correctly. Key point: we only add to `investmentTotal` via
  // the investmentAccounts loop below to prevent double-counting.
  const holdingsByAccount: Record<string, Cents> = {};
  holdings.forEach((holding) => {
    if (!holdingsByAccount[holding.id]) {
      holdingsByAccount[holding.id] = 0;
    }
    holdingsByAccount[holding.id] += holding.currentValue || 0;
  });

  let investmentTotal: Cents = investmentBankTotal;

  investmentAccounts.forEach((account) => {
    // Skip manual rows that duplicate a provider-synced brokerage we've
    // already counted above. Linking is by stable account id.
    if (bankInvestmentIds.has(account.id)) return;

    const value = holdingsByAccount[account.id] || account.balance || 0;
    investmentTotal += value;
  });

  if (investmentTotal > 0) {
    breakdown['Investments'] = investmentTotal;
    total += investmentTotal;
  }

  // Manual assets (cars, real estate, etc.)
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
    // Only add the total to the running sum — do NOT add a redundant "Bank Debts" key.
    total += bankLiabilitiesTotal;
  }

  // Overdrawn cash accounts: a negative checking/savings balance is debt owed to the bank.
  // This keeps Net Worth = Total Assets − Total Liabilities while preventing the
  // confusing "negative Total Assets" display that occurred when overdrawn cash was
  // lumped into Assets. (Mirrors Monarch's pattern of separating cash from the assets rollup.)
  const cashAccountsForOverdraft = bankAccounts.filter(
    (acc) => acc.isActive && CASH_TYPES.has(acc.accountType)
  );

  const overdrawnTotal = cashAccountsForOverdraft.reduce(
    (sum, acc) => sum + Math.max(0, -(parseFloat(String(acc.balance)) || 0)),
    0
  );

  if (overdrawnTotal > 0) {
    breakdown['Overdrawn Cash'] = overdrawnTotal;
    total += overdrawnTotal;
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
