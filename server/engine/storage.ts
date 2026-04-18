/**
 * EngineStorage — security facade over the main storage module.
 *
 * The engine sub-app imports ONLY from this facade. It never imports the full
 * `storage` module. This is the primary security boundary that implements
 * principle of least privilege at the code level: even if an engine route is
 * compromised or buggy, it cannot reach into user administration, Stripe,
 * admin audit logs, or password/MFA material.
 *
 * Two rules govern this file:
 *
 *   1. READS: expose only methods that return financial data (accounts,
 *      transactions, bills, income, expenses, budgets, goals, assets, debts,
 *      investments, holdings, snapshots).
 *
 *   2. WRITES: expose only the narrow set of writes the engine actually needs
 *      — today that's net-worth-snapshot creation. Every added write must be
 *      explicitly justified.
 *
 * Callers pass plain userIds (derived from EngineContext) so the facade
 * stays simple. The ctx itself lives at the route-handler level.
 */

import { storage } from "../storage";
import type {
  Bill,
  Expense,
  Income,
  IncomeSource,
  IncomeSourceAmount,
  Budget,
  SavingsGoal,
  DebtDetails,
  Asset,
  InvestmentAccount,
  Holding,
  NetWorthSnapshot,
  InsertNetWorthSnapshot,
  OnboardingAnalysis,
} from "@shared/schema";

export const EngineStorage = {
  // ─── Financial reads (household-scoped, fan out over userIds) ─────────────

  getBillsByUserIds(userIds: string[]): Promise<Bill[]> {
    return storage.getBillsByUserIds(userIds);
  },

  getIncomesByUserIds(userIds: string[]): Promise<Income[]> {
    return storage.getIncomesByUserIds(userIds);
  },

  // Registry reads — drive the new projection path in calculateIncomeForPeriod.
  // Both methods return [] for empty user lists; the engine checks for non-zero
  // length before preferring the registry over the legacy `Income` rows.
  getIncomeSourcesByUserIds(userIds: string[]): Promise<IncomeSource[]> {
    return storage.getIncomeSourcesByUserIds(userIds);
  },

  getIncomeSourceAmountsBySourceIds(sourceIds: string[]): Promise<IncomeSourceAmount[]> {
    return storage.getIncomeSourceAmountsBySourceIds(sourceIds);
  },

  getExpensesByUserIds(userIds: string[]): Promise<Expense[]> {
    return storage.getExpensesByUserIds(userIds);
  },

  getBudgetsByUserIds(userIds: string[]): Promise<Budget[]> {
    return storage.getBudgetsByUserIds(userIds);
  },

  getBudgetsByUserIdsAndMonth(userIds: string[], monthStr: string): Promise<Budget[]> {
    return storage.getBudgetsByUserIdsAndMonth(userIds, monthStr);
  },

  getSavingsGoalsByUserIds(userIds: string[]): Promise<SavingsGoal[]> {
    return storage.getSavingsGoalsByUserIds(userIds);
  },

  // ─── Primary-user reads (per-user data not yet household-shared) ──────────

  getDebtDetails(userId: string): Promise<DebtDetails[]> {
    return storage.getDebtDetails(userId);
  },

  getAssets(userId: string): Promise<Asset[]> {
    return storage.getAssets(userId);
  },

  getInvestmentAccounts(userId: string): Promise<InvestmentAccount[]> {
    return storage.getInvestmentAccounts(userId);
  },

  getHoldingsByUser(userId: string): Promise<Holding[]> {
    return storage.getHoldingsByUser(userId);
  },

  getNetWorthSnapshots(
    userId: string,
    opts?: { limit?: number }
  ): Promise<NetWorthSnapshot[]> {
    return storage.getNetWorthSnapshots(userId, opts);
  },

  getOnboardingAnalysis(userId: string): Promise<OnboardingAnalysis | undefined> {
    return storage.getOnboardingAnalysis(userId);
  },

  getHouseholdMemberUserIds(householdId: string): Promise<string[]> {
    return storage.getHouseholdMemberUserIds(householdId);
  },

  // ─── Provider-specific reads (used by data-loaders) ───────────────────────
  // The engine never reads access tokens or credentials — those columns will
  // be explicitly DENIED to the engine's DB role when we create engine_role
  // in Neon (Step 1 infra task). These methods return only transaction /
  // account shape data.

  getPlaidItems(userId: string) {
    return storage.getPlaidItems(userId);
  },

  getPlaidAccounts(itemId: string) {
    return storage.getPlaidAccounts(itemId);
  },

  getPlaidTransactions(
    accountIds: string[],
    opts: { startDate: string; endDate: string }
  ) {
    return storage.getPlaidTransactions(accountIds, opts);
  },

  getMxAccountsByUserId(userId: string) {
    return storage.getMxAccountsByUserId(userId);
  },

  getMxTransactions(accountIds: string[], opts: { startDate: string; endDate: string }) {
    return storage.getMxTransactions(accountIds, opts);
  },

  getManualAccounts(userId: string) {
    return storage.getManualAccounts(userId);
  },

  getManualTransactionsByUser(
    userId: string,
    opts: { startDate: string; endDate: string }
  ) {
    return storage.getManualTransactionsByUser(userId, opts);
  },

  // ─── Narrow writes ────────────────────────────────────────────────────────
  // Every write here must be justified. Today: only net-worth snapshots.

  /**
   * Persist a computed net-worth snapshot. Safe for the engine role because
   * the engine IS the authority on the current net-worth value; snapshots are
   * an append-only history of what the engine calculated.
   */
  createNetWorthSnapshot(
    userId: string,
    data: Omit<InsertNetWorthSnapshot, "userId">
  ): Promise<NetWorthSnapshot> {
    return storage.createNetWorthSnapshot({ ...data, userId });
  },
} as const;

export type EngineStorageType = typeof EngineStorage;
