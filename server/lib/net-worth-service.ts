/**
 * Net Worth Service — single source of truth for loading and computing net worth.
 *
 * ARCHITECTURAL NOTE
 * ------------------
 * The financial-engine module (server/lib/financial-engine/net-worth.ts) is a
 * pure calculation library with zero storage dependencies. This service is the
 * thin loader layer that:
 *
 *   1. Fetches all the data needed (bank accounts via adapters, assets, debts,
 *      investments, holdings, history snapshots).
 *   2. Normalises schema-typed values (numeric strings) into engine-typed
 *      numbers.
 *   3. Delegates to `calculateNetWorth()` from the engine.
 *
 * EVERY code path that needs a net-worth number MUST go through this service.
 * Do NOT reimplement net-worth math inline in routes — that's what produced
 * the "Net Worth page vs Accounts page show different numbers" bug. If a new
 * route needs net worth, call `loadAndCalculateNetWorth()` here. If a new
 * calculation rule is needed (e.g., treating overdrawn cash as a liability),
 * add it to the engine module so every caller picks it up.
 */

import { storage } from "../storage";
import { calculateNetWorth } from "./financial-engine/net-worth";
import type { NetWorthResult } from "./financial-engine/types";
import type { NormalizedAccount } from "./financial-engine/normalized-types";
import { plaidAdapter } from "./financial-engine/adapters/plaid-adapter";
import { mxAdapter } from "./financial-engine/adapters/mx-adapter";
import { manualAdapter } from "./financial-engine/adapters/manual-adapter";

/**
 * Fetch and normalize all active bank/investment/manual accounts for the given
 * users across every provider. Provider-agnostic — downstream callers work
 * entirely with NormalizedAccount.
 */
export async function getAllNormalizedAccounts(
  userIds: string[]
): Promise<NormalizedAccount[]> {
  const allAccounts: NormalizedAccount[] = [];

  // Plaid
  for (const userId of userIds) {
    const plaidItems = await storage.getPlaidItems(userId);
    for (const item of plaidItems) {
      const rawAccounts = await storage.getPlaidAccounts(item.id);
      allAccounts.push(...plaidAdapter.normalizeAccounts(rawAccounts));
    }
  }

  // MX
  for (const userId of userIds) {
    const rawMxAccounts = await storage.getMxAccountsByUserId(userId);
    allAccounts.push(...mxAdapter.normalizeAccounts(rawMxAccounts));
  }

  // Manual
  for (const userId of userIds) {
    const rawManualAccounts = await storage.getManualAccounts(userId);
    allAccounts.push(...manualAdapter.normalizeAccounts(rawManualAccounts));
  }

  return allAccounts;
}

/**
 * The one and only function that returns a net worth result for a user/household.
 *
 * @param userIds       Set of user IDs to aggregate over (e.g., household members)
 * @param primaryUserId The user whose manual assets/debts/investments/holdings
 *                      are loaded (these are per-user, not household-shared yet)
 * @param opts.history  When true (default), loads the last 2 snapshots for
 *                      `latestChange`. Set false for callers that don't need it.
 */
export async function loadAndCalculateNetWorth(
  userIds: string[],
  primaryUserId: string,
  opts: { history?: boolean } = {}
): Promise<NetWorthResult> {
  const loadHistory = opts.history !== false;

  const [
    bankAccounts,
    rawAssets,
    rawDebts,
    rawInvestmentAccounts,
    rawHoldings,
    rawSnapshots,
  ] = await Promise.all([
    getAllNormalizedAccounts(userIds),
    storage.getAssets(primaryUserId),
    storage.getDebtDetails(primaryUserId),
    storage.getInvestmentAccounts(primaryUserId),
    storage.getHoldingsByUser(primaryUserId),
    loadHistory
      ? storage.getNetWorthSnapshots(primaryUserId, { limit: 2 })
      : Promise.resolve([]),
  ]);

  // Map schema types (numeric strings) → engine types (numbers).
  const assets = rawAssets.map((a) => ({
    id: a.id,
    category: a.category ?? "Other",
    currentValue: parseFloat(String(a.currentValue ?? 0)),
    purchasePrice: a.purchasePrice ? parseFloat(String(a.purchasePrice)) : undefined,
  }));

  // Dedupe debts that are already tracked via a linked Plaid account — those
  // balances come from the bank feed, so counting them again from debt_details
  // would double the liabilities.
  const debts = rawDebts
    .filter((d) => d.isActive === "true" && !d.linkedPlaidAccountId)
    .map((d) => ({
      id: d.id,
      currentBalance: parseFloat(String(d.currentBalance ?? 0)),
      debtType: d.debtType ?? "Other",
    }));

  const investmentAccounts = rawInvestmentAccounts.map((a) => ({
    id: a.id,
    balance: parseFloat(String(a.balance ?? 0)),
  }));

  const holdings = rawHoldings.map((h) => ({
    id: h.id,
    currentValue: parseFloat(String(h.currentValue ?? 0)),
    costBasis: parseFloat(String(h.costBasis ?? 0)),
  }));

  const history = rawSnapshots.map((s) => ({
    netWorth: parseFloat(String(s.netWorth ?? 0)),
    totalAssets: parseFloat(String(s.totalAssets ?? 0)),
    totalLiabilities: parseFloat(String(s.totalLiabilities ?? 0)),
    date: s.date,
  }));

  return calculateNetWorth({
    bankAccounts,
    assets,
    debts,
    investmentAccounts,
    holdings,
    history,
  });
}
