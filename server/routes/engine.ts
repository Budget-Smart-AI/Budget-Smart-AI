/**
 * Financial Engine Router
 *
 * This Express router exposes all financial engine calculations as API endpoints.
 * The frontend pages call these endpoints instead of computing locally.
 *
 * Architecture:
 *   Client page → API endpoint → Adapter Layer → Financial Engine → Neon DB
 *                                     ↓
 *                              Computed result → JSON response → Client renders
 *
 * The adapter layer normalizes provider-specific data (Plaid, MX, etc.) into
 * NormalizedTransaction and NormalizedAccount types before passing to the engine.
 * To add a new banking aggregator, create a new adapter — no route changes needed.
 *
 * Authentication: All endpoints require `requireAuth` middleware.
 * Household support: Respects householdId if set in session.
 */

import { Router, Request, Response } from "express";
import { startOfMonth, endOfMonth, parseISO, format, subMonths, startOfYear } from "date-fns";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { loadAndCalculateNetWorth } from "../lib/net-worth-service";
import {
  calculateIncomeForPeriod,
  calculateExpensesForPeriod,
  calculateBillsForPeriod,
  calculateSubscriptions,
  calculateNetWorth,
  calculateDebtPayoff,
  calculateBudgets,
  calculateHealthScore,
  calculateSavingsGoals,
  calculateSafeToSpend,
  plaidAdapter,
  mxAdapter,
  manualAdapter,
  type NormalizedTransaction,
  type NormalizedAccount,
  type DashboardData,
  type IncomeResult,
  type ExpenseResult,
  type BillsResult,
  type SubscriptionsResult,
  type NetWorthResult,
  type DebtPayoffResult,
  type BudgetsResult,
  type SavingsGoalsResult,
  type HealthScoreResult,
  type SafeToSpendResult,
  type ReportsData,
  type MonthlyTrendPoint,
  type BankAccountsEngineResult,
  type NetWorthParams,
} from "../lib/financial-engine";

const router = Router();

// ─── Helper Functions ──────────────────────────────────────────────────────

/**
 * Get user IDs to query: either just the current user, or the entire household
 */
async function getUserIdsForQuery(userId: string, householdId?: string): Promise<string[]> {
  if (householdId) {
    return storage.getHouseholdMemberUserIds(householdId);
  }
  return [userId];
}

/**
 * Fetch and normalize all bank accounts across all providers.
 * Returns a single array of NormalizedAccount, regardless of which providers are active.
 *
 * To add a new provider:
 *   1. Fetch its raw accounts from storage
 *   2. Normalize via the provider's adapter
 *   3. Spread into the result array
 */
async function getAllNormalizedAccounts(userIds: string[]): Promise<NormalizedAccount[]> {
  const allAccounts: NormalizedAccount[] = [];

  // ─── Plaid ──────────────────────────────────────────────
  for (const userId of userIds) {
    const plaidItems = await storage.getPlaidItems(userId);
    for (const item of plaidItems) {
      const rawAccounts = await storage.getPlaidAccounts(item.id);
      allAccounts.push(...plaidAdapter.normalizeAccounts(rawAccounts));
    }
  }

  // ─── MX ─────────────────────────────────────────────────
  for (const userId of userIds) {
    const rawMxAccounts = await storage.getMxAccountsByUserId(userId);
    allAccounts.push(...mxAdapter.normalizeAccounts(rawMxAccounts));
  }

  // ─── Manual ─────────────────────────────────────────────
  for (const userId of userIds) {
    const rawManualAccounts = await storage.getManualAccounts(userId);
    allAccounts.push(...manualAdapter.normalizeAccounts(rawManualAccounts));
  }

  // ─── Future providers go here ───────────────────────────
  // e.g., for (const userId of userIds) {
  //   const rawBasiqAccounts = await storage.getBasiqAccountsByUserId(userId);
  //   allAccounts.push(...basiqAdapter.normalizeAccounts(rawBasiqAccounts));
  // }

  return allAccounts;
}

/**
 * Fetch and normalize all bank transactions for a date range across all providers.
 * Only includes transactions from active (enabled) accounts.
 *
 * @param userIds User IDs to query
 * @param startDate Start of date range
 * @param endDate End of date range
 * @returns Unified, normalized transaction array
 */
async function getAllNormalizedTransactions(
  userIds: string[],
  startDate: Date | string,
  endDate: Date | string
): Promise<NormalizedTransaction[]> {
  const allTransactions: NormalizedTransaction[] = [];
  const startStr = typeof startDate === 'string' ? startDate : format(startDate, 'yyyy-MM-dd');
  const endStr = typeof endDate === 'string' ? endDate : format(endDate, 'yyyy-MM-dd');

  // ─── Plaid ──────────────────────────────────────────────
  for (const userId of userIds) {
    const plaidItems = await storage.getPlaidItems(userId);
    for (const item of plaidItems) {
      const rawAccounts = await storage.getPlaidAccounts(item.id);
      // Only query transactions from active accounts
      const enabledAccountIds = rawAccounts
        .filter((a) => a.isActive === "true")
        .map((a) => a.id);

      if (enabledAccountIds.length > 0) {
        const rawTx = await storage.getPlaidTransactions(enabledAccountIds, {
          startDate: startStr,
          endDate: endStr,
        });
        allTransactions.push(...plaidAdapter.normalizeTransactions(rawTx));
      }
    }
  }

  // ─── MX ─────────────────────────────────────────────────
  for (const userId of userIds) {
    const rawMxAccounts = await storage.getMxAccountsByUserId(userId);
    const enabledMxAccountIds = rawMxAccounts
      .filter((a: any) => a.isActive === "true" || a.isActive === true)
      .map((a: any) => a.id || a.guid);

    if (enabledMxAccountIds.length > 0) {
      const rawTx = await storage.getMxTransactions(enabledMxAccountIds, {
        startDate: startStr,
        endDate: endStr,
      });
      allTransactions.push(...mxAdapter.normalizeTransactions(rawTx));
    }
  }

  // ─── Manual Transactions ────────────────────────────────
  for (const userId of userIds) {
    const rawManualTx = await storage.getManualTransactionsByUser(userId, {
      startDate: startStr,
      endDate: endStr,
    });
    allTransactions.push(...manualAdapter.normalizeTransactions(rawManualTx));
  }

  // ─── Future providers go here ───────────────────────────

  // Deduplicate by transaction ID (can happen with overlapping Plaid items or household members)
  const seen = new Set<string>();
  const dedupedTransactions: NormalizedTransaction[] = [];
  for (const tx of allTransactions) {
    if (!seen.has(tx.id)) {
      seen.add(tx.id);
      dedupedTransactions.push(tx);
    }
  }

  return dedupedTransactions;
}

/**
 * Parse date query parameters (yyyy-MM-dd format)
 */
function parseDateRange(
  startDateStr?: string,
  endDateStr?: string,
): { startDate: Date; endDate: Date } {
  let startDate: Date;
  let endDate: Date;

  if (startDateStr && endDateStr) {
    startDate = parseISO(startDateStr);
    endDate = parseISO(endDateStr);
  } else {
    // Default to current month
    const today = new Date();
    startDate = startOfMonth(today);
    endDate = endOfMonth(today);
  }

  return { startDate, endDate };
}

// ─── Middleware ────────────────────────────────────────────────────────────

router.use(requireAuth);

// ─── Endpoints ─────────────────────────────────────────────────────────────

/**
 * GET /api/engine/dashboard
 * Main dashboard endpoint. Returns everything needed for the dashboard in one call.
 */
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const householdId = req.session.householdId;

    const userIds = await getUserIdsForQuery(userId, householdId);

    // Get current month dates
    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);

    // Fetch all data in parallel
    const [
      billsData,
      incomeData,
      expensesData,
      budgetsData,
      savingsGoalsData,
      transactions,
      bankAccounts,
      rawAssets,
      rawDebts,
      rawInvestmentAccounts,
      rawHoldings,
    ] = await Promise.all([
      storage.getBillsByUserIds(userIds),
      storage.getIncomesByUserIds(userIds),
      storage.getExpensesByUserIds(userIds),
      storage.getBudgetsByUserIds(userIds),
      storage.getSavingsGoalsByUserIds(userIds),
      getAllNormalizedTransactions(userIds, monthStart, monthEnd),
      getAllNormalizedAccounts(userIds),
      storage.getAssets(userId),
      storage.getDebtDetails(userId),
      storage.getInvestmentAccounts(userId),
      storage.getHoldingsByUser(userId),
    ]);

    // Map schema types → engine types
    const assets = rawAssets.map((a) => ({
      id: a.id,
      category: a.category ?? "Other",
      currentValue: parseFloat(String(a.currentValue ?? 0)),
      purchasePrice: a.purchasePrice ? parseFloat(String(a.purchasePrice)) : undefined,
    }));
    const debts = rawDebts.map((d) => ({
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

    // Calculate all components
    const income = calculateIncomeForPeriod({
      income: incomeData,
      transactions,
      monthStart,
      monthEnd,
    });
    const expenses = calculateExpensesForPeriod({
      expenses: expensesData,
      transactions,
      monthStart,
      monthEnd,
      prevMonthStart: startOfMonth(subMonths(today, 1)),
      prevMonthEnd: endOfMonth(subMonths(today, 1)),
    });
    const bills = calculateBillsForPeriod({ bills: billsData, monthStart, monthEnd });
    const netWorth = calculateNetWorth({
      bankAccounts,
      assets,
      debts,
      investmentAccounts,
      holdings,
      history: [],
    });
    const savingsGoals = calculateSavingsGoals({
      goals: savingsGoalsData.map((g) => ({
        id: g.id,
        current: parseFloat(String(g.currentAmount ?? 0)),
        target: parseFloat(String(g.targetAmount ?? 0)),
        targetDate: g.targetDate ?? undefined,
      })),
    });
    const healthScore = calculateHealthScore({
      totalIncome: income.effectiveIncome,
      totalExpenses: expenses.total,
      budgetCount: budgetsData.length,
      billCount: billsData.length,
      savingsGoals: savingsGoalsData.map((g) => ({
        current: parseFloat(String(g.currentAmount ?? 0)),
        target: parseFloat(String(g.targetAmount ?? 0)),
      })),
    });
    const safeToSpend = calculateSafeToSpend({
      effectiveIncome: income.effectiveIncome,
      totalSpent: expenses.total,
      billsTotal: bills.monthlyEstimate,
      today,
    });

    // Calculate gaps
    const incomeGap = income.actualIncome - income.budgetedIncome;
    const budgetTotal = budgetsData.reduce((sum, b) => sum + parseFloat(String(b.amount ?? 0)), 0);
    const spendingGap = expenses.total - budgetTotal;
    const plannedSavings = income.budgetedIncome - budgetTotal - bills.monthlyEstimate;
    const actualSavings = income.actualIncome - expenses.total - bills.monthlyEstimate;
    const savingsGap = actualSavings - plannedSavings;

    // Calculate alerts
    const negativeCashFlow = income.actualIncome < expenses.total + bills.monthlyEstimate;
    const budgetOverage = expenses.total > budgetTotal;
    const budgetOveragePercent = (budgetTotal || 1) > 0
      ? ((expenses.total / (budgetTotal || 1)) - 1) * 100
      : 0;
    const planVsRealityMismatch = Math.abs(incomeGap) > income.budgetedIncome * 0.1;

    const response: DashboardData = {
      income,
      expenses,
      bills,
      cashFlow: {
        realCashFlow: income.actualIncome - expenses.total,
        realIncome: income.actualIncome,
        realSpending: expenses.total,
        plannedCashFlow: income.budgetedIncome - budgetTotal - bills.monthlyEstimate,
        plannedSavings,
      },
      netWorth,
      savingsGoals,
      healthScore,
      safeToSpend,
      gaps: {
        incomeGap,
        spendingGap,
        savingsGap,
      },
      alerts: {
        negativeCashFlow,
        budgetOverage,
        budgetOveragePercent,
        planVsRealityMismatch,
      },
    };

    res.json(response);
  } catch (error) {
    console.error("[engine.dashboard]", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

/**
 * GET /api/engine/expenses?startDate=yyyy-MM-dd&endDate=yyyy-MM-dd
 * Expense calculations for a period with MoM comparison
 */
router.get("/expenses", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const householdId = req.session.householdId;

    const { startDate, endDate } = parseDateRange(
      req.query.startDate as string | undefined,
      req.query.endDate as string | undefined
    );

    const userIds = await getUserIdsForQuery(userId, householdId);

    const prevMonthStart = startOfMonth(subMonths(startDate, 1));
    const prevMonthEnd = endOfMonth(subMonths(startDate, 1));

    // Fetch transactions for BOTH current and previous month (needed for MoM comparison)
    const [expensesData, transactions] = await Promise.all([
      storage.getExpensesByUserIds(userIds),
      getAllNormalizedTransactions(userIds, prevMonthStart, endDate),
    ]);

    const result = calculateExpensesForPeriod({
      expenses: expensesData,
      transactions,
      monthStart: startDate,
      monthEnd: endDate,
      prevMonthStart,
      prevMonthEnd,
    });

    res.json(result as ExpenseResult);
  } catch (error) {
    console.error("[engine.expenses]", error);
    res.status(500).json({ error: "Failed to fetch expense data" });
  }
});

/**
 * GET /api/engine/income?startDate=yyyy-MM-dd&endDate=yyyy-MM-dd
 * Income calculations for a period
 */
router.get("/income", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const householdId = req.session.householdId;

    const { startDate, endDate } = parseDateRange(
      req.query.startDate as string | undefined,
      req.query.endDate as string | undefined
    );

    const userIds = await getUserIdsForQuery(userId, householdId);

    // Fetch a 3-month lookback window for recurring income source detection.
    // This allows biweekly, monthly, and quarterly income patterns to be
    // identified even when no deposit has landed in the current month yet.
    const lookbackStart = startOfMonth(subMonths(startDate, 3));

    const [incomeData, transactions, historicalTransactions] = await Promise.all([
      storage.getIncomesByUserIds(userIds),
      getAllNormalizedTransactions(userIds, startDate, endDate),
      getAllNormalizedTransactions(userIds, lookbackStart, endDate),
    ]);

    const result = calculateIncomeForPeriod({
      income: incomeData,
      transactions,
      historicalTransactions,
      monthStart: startDate,
      monthEnd: endDate,
    });

    res.json(result as IncomeResult);
  } catch (error) {
    console.error("[engine.income]", error);
    res.status(500).json({ error: "Failed to fetch income data" });
  }
});

/**
 * GET /api/engine/bills
 * Bill calculations for current month
 */
router.get("/bills", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const householdId = req.session.householdId;

    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);

    const userIds = await getUserIdsForQuery(userId, householdId);
    const billsData = await storage.getBillsByUserIds(userIds);

    const result = calculateBillsForPeriod({ bills: billsData, monthStart, monthEnd });

    res.json(result as BillsResult);
  } catch (error) {
    console.error("[engine.bills]", error);
    res.status(500).json({ error: "Failed to fetch bills data" });
  }
});

/**
 * GET /api/engine/subscriptions
 * Subscription calculations (active bills)
 */
router.get("/subscriptions", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const householdId = req.session.householdId;

    const userIds = await getUserIdsForQuery(userId, householdId);
    const billsData = await storage.getBillsByUserIds(userIds);

    const result = calculateSubscriptions({ bills: billsData });

    res.json(result as SubscriptionsResult);
  } catch (error) {
    console.error("[engine.subscriptions]", error);
    res.status(500).json({ error: "Failed to fetch subscriptions data" });
  }
});

/**
 * GET /api/engine/net-worth
 * Net worth calculation (assets - liabilities)
 */
router.get("/net-worth", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const householdId = req.session.householdId;
    const userIds = await getUserIdsForQuery(userId, householdId);

    // All net worth math flows through the single service. No inline logic here.
    const result = await loadAndCalculateNetWorth(userIds, userId);
    res.json(result as NetWorthResult);
  } catch (error) {
    console.error("[engine.net-worth]", error);
    res.status(500).json({ error: "Failed to fetch net worth data" });
  }
});

/**
 * GET /api/engine/debts?extraPayment=0
 * Debt payoff calculations with optional extra payment
 */
router.get("/debts", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const extraPayment = parseFloat(req.query.extraPayment as string) || 0;

    // Fetch raw debt details from storage and map to engine DebtItem format
    const rawDebts = await storage.getDebtDetails(userId);

    const debts = rawDebts.map((d) => ({
      id: d.id,
      name: d.name ?? d.debtType ?? "Unknown Debt",
      balance: parseFloat(String(d.currentBalance ?? 0)),
      interestRate: parseFloat(String(d.apr ?? 0)),
      minimumPayment: parseFloat(String(d.minimumPayment ?? 0)),
      category: d.debtType ?? "Other",
      source: "manual",
    }));

    const result = calculateDebtPayoff({ debts, extraPayment });

    res.json(result as DebtPayoffResult);
  } catch (error) {
    console.error("[engine.debts]", error);
    res.status(500).json({ error: "Failed to fetch debt data" });
  }
});

/**
 * GET /api/engine/budgets?month=yyyy-MM
 * Budget vs actual calculations for a specific month
 */
router.get("/budgets", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const householdId = req.session.householdId;

    // Parse month from query, default to current month
    let monthStr = req.query.month as string | undefined;
    if (!monthStr) {
      const today = new Date();
      monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    }

    const [year, month] = monthStr.split("-").map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = endOfMonth(startDate);

    const userIds = await getUserIdsForQuery(userId, householdId);

    const [budgetsData, expensesData] = await Promise.all([
      storage.getBudgetsByUserIdsAndMonth(userIds, monthStr),
      storage.getExpensesByUserIds(userIds),
    ]);

    // Map Drizzle numeric strings → engine number types
    const result = calculateBudgets({
      budgets: budgetsData.map((b) => ({
        category: b.category,
        amount: parseFloat(String(b.amount ?? 0)),
        month: b.month,
      })),
      expenses: expensesData.map((e) => ({
        category: e.category,
        amount: parseFloat(String(e.amount ?? 0)),
        date: e.date,
      })),
      month: monthStr,
      now: new Date(),
    });

    res.json(result as BudgetsResult);
  } catch (error) {
    console.error("[engine.budgets]", error);
    res.status(500).json({ error: "Failed to fetch budget data" });
  }
});

/**
 * GET /api/engine/savings-goals
 * Savings goal progress calculations
 */
router.get("/savings-goals", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const householdId = req.session.householdId;

    const userIds = await getUserIdsForQuery(userId, householdId);
    const savingsGoalsData = await storage.getSavingsGoalsByUserIds(userIds);

    const result = calculateSavingsGoals({
      goals: savingsGoalsData.map((g) => ({
        id: g.id,
        current: parseFloat(String(g.currentAmount ?? 0)),
        target: parseFloat(String(g.targetAmount ?? 0)),
        targetDate: g.targetDate ?? undefined,
      })),
    });

    res.json(result as SavingsGoalsResult);
  } catch (error) {
    console.error("[engine.savings-goals]", error);
    res.status(500).json({ error: "Failed to fetch savings goals data" });
  }
});

/**
 * GET /api/engine/health-score
 * Financial health score (0-100)
 */
router.get("/health-score", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const householdId = req.session.householdId;

    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);

    const userIds = await getUserIdsForQuery(userId, householdId);

    const [incomeData, budgetsData, billsData, savingsGoalsData, expensesData, transactions] =
      await Promise.all([
        storage.getIncomesByUserIds(userIds),
        storage.getBudgetsByUserIds(userIds),
        storage.getBillsByUserIds(userIds),
        storage.getSavingsGoalsByUserIds(userIds),
        storage.getExpensesByUserIds(userIds),
        getAllNormalizedTransactions(userIds, monthStart, monthEnd),
      ]);

    const income = calculateIncomeForPeriod({
      income: incomeData,
      transactions,
      monthStart,
      monthEnd,
    });
    const expenses = calculateExpensesForPeriod({
      expenses: expensesData,
      transactions,
      monthStart,
      monthEnd,
      prevMonthStart: startOfMonth(subMonths(today, 1)),
      prevMonthEnd: endOfMonth(subMonths(today, 1)),
    });

    const result = calculateHealthScore({
      totalIncome: income.effectiveIncome,
      totalExpenses: expenses.total,
      budgetCount: budgetsData.length,
      billCount: billsData.length,
      savingsGoals: savingsGoalsData.map((g) => ({
        current: parseFloat(String(g.currentAmount ?? 0)),
        target: parseFloat(String(g.targetAmount ?? 0)),
      })),
    });

    res.json(result as HealthScoreResult);
  } catch (error) {
    console.error("[engine.health-score]", error);
    res.status(500).json({ error: "Failed to fetch health score data" });
  }
});

/**
 * GET /api/engine/bank-accounts?month=yyyy-MM
 * Bank account summary: total balance, monthly spending/income, unmatched count
 */
router.get("/bank-accounts", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const householdId = req.session.householdId;

    // Parse month, default to current
    let monthStr = req.query.month as string | undefined;
    if (!monthStr) {
      const today = new Date();
      monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    }

    const [year, month] = monthStr.split("-").map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = endOfMonth(monthStart);

    const userIds = await getUserIdsForQuery(userId, householdId);

    // Net worth comes from the single service — no inline math. This route adds
    // monthly spending/income/unmatched-count on top of the net worth numbers,
    // all fed from the same normalized data model.
    const [netWorthResult, transactions] = await Promise.all([
      loadAndCalculateNetWorth(userIds, userId, { history: false }),
      getAllNormalizedTransactions(userIds, monthStart, monthEnd),
    ]);

    const totalAssets = netWorthResult.totalAssets;
    const totalLiabilities = netWorthResult.totalLiabilities;
    const totalBalance = netWorthResult.netWorth;

    // Monthly spending: sum of debit transactions that aren't transfers or pending
    const monthlySpending = transactions
      .filter((tx) => tx.direction === "debit" && !tx.isTransfer && !tx.isPending)
      .reduce((sum, tx) => sum + tx.amount, 0);

    // Monthly income: sum of income transactions
    const monthlyIncome = transactions
      .filter((tx) => tx.isIncome && !tx.isPending)
      .reduce((sum, tx) => sum + tx.amount, 0);

    // Unmatched count: transactions without a matched expense
    const unmatchedCount = transactions
      .filter((tx) => tx.direction === "debit" && !tx.isPending && !tx.isTransfer && !tx.matchedExpenseId)
      .length;

    const result: BankAccountsEngineResult = {
      totalBalance,
      totalAssets,
      totalLiabilities,
      monthlySpending,
      monthlyIncome,
      unmatchedCount,
    };

    res.json(result);
  } catch (error) {
    console.error("[engine.bank-accounts]", error);
    res.status(500).json({ error: "Failed to fetch bank accounts data" });
  }
});

/**
 * GET /api/engine/assets
 * Asset summary: total value, purchase price, appreciation, grouped by category
 */
router.get("/assets", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const rawAssets = await storage.getAssets(userId);

    let totalValue = 0;
    let totalPurchasePrice = 0;
    const byCategory: Record<string, { totalValue: number; totalPurchasePrice: number; count: number }> = {};

    for (const a of rawAssets) {
      const value = parseFloat(String(a.currentValue ?? 0));
      const purchase = parseFloat(String(a.purchasePrice ?? 0));
      totalValue += value;
      totalPurchasePrice += purchase;

      const cat = a.category ?? "Other";
      if (!byCategory[cat]) {
        byCategory[cat] = { totalValue: 0, totalPurchasePrice: 0, count: 0 };
      }
      byCategory[cat].totalValue += value;
      byCategory[cat].totalPurchasePrice += purchase;
      byCategory[cat].count += 1;
    }

    const appreciation = totalValue - totalPurchasePrice;
    const appreciationPercent = totalPurchasePrice > 0
      ? ((appreciation / totalPurchasePrice) * 100)
      : 0;

    res.json({
      totalValue,
      totalPurchasePrice,
      appreciation,
      appreciationPercent,
      byCategory,
    });
  } catch (error) {
    console.error("[engine.assets]", error);
    res.status(500).json({ error: "Failed to fetch assets data" });
  }
});

/**
 * GET /api/engine/investments
 * Investment portfolio summary: total value, cost basis, gain/loss
 */
router.get("/investments", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    const rawInvestmentAccounts = await storage.getInvestmentAccounts(userId);
    const rawHoldings = await storage.getHoldingsByUser(userId);

    let totalValue = 0;
    let totalCostBasis = 0;

    // Sum holdings first
    for (const h of rawHoldings) {
      totalValue += parseFloat(String(h.currentValue ?? 0));
      totalCostBasis += parseFloat(String(h.costBasis ?? 0));
    }

    // If no holdings, fall back to account balances
    if (totalValue === 0 && rawInvestmentAccounts.length > 0) {
      totalValue = rawInvestmentAccounts.reduce(
        (sum, a) => sum + (parseFloat(String(a.balance ?? 0)) || 0),
        0
      );
    }

    const totalGainLoss = totalValue - totalCostBasis;
    const totalGainLossPct = totalCostBasis > 0
      ? ((totalGainLoss / totalCostBasis) * 100)
      : 0;

    // Per-account value breakdown (so the client doesn't need to reduce holdings)
    const byAccount: Array<{
      accountId: string;
      totalValue: number;
      totalCost: number;
      gainLoss: number;
      gainLossPct: number;
    }> = [];
    for (const account of rawInvestmentAccounts) {
      const accHoldings = rawHoldings.filter((h: any) => h.investmentAccountId === account.id);
      let accValue = 0;
      let accCost = 0;
      for (const h of accHoldings) {
        accValue += parseFloat(String(h.currentValue ?? 0));
        accCost += parseFloat(String(h.costBasis ?? 0));
      }
      // Fall back to account balance if no holdings
      if (accValue === 0) {
        accValue = parseFloat(String(account.balance ?? 0)) || 0;
      }
      byAccount.push({
        accountId: account.id,
        totalValue: accValue,
        totalCost: accCost,
        gainLoss: accValue - accCost,
        gainLossPct: accCost > 0 ? ((accValue - accCost) / accCost) * 100 : 0,
      });
    }

    // Best/worst performers across all holdings
    let bestPerformer: { symbol: string; gainLossPct: number } | null = null;
    let worstPerformer: { symbol: string; gainLossPct: number } | null = null;
    for (const h of rawHoldings) {
      const cost = parseFloat(String(h.costBasis ?? 0));
      const value = parseFloat(String(h.currentValue ?? 0));
      const symbol = (h as any).symbol || (h as any).name || "Unknown";
      const pct = cost > 0 ? ((value - cost) / cost) * 100 : 0;
      if (!bestPerformer || pct > bestPerformer.gainLossPct) {
        bestPerformer = { symbol, gainLossPct: pct };
      }
      if (!worstPerformer || pct < worstPerformer.gainLossPct) {
        worstPerformer = { symbol, gainLossPct: pct };
      }
    }

    res.json({
      totalValue,
      totalCostBasis,
      totalGainLoss,
      totalGainLossPct,
      byAccount,
      bestPerformer,
      worstPerformer,
    });
  } catch (error) {
    console.error("[engine.investments]", error);
    res.status(500).json({ error: "Failed to fetch investments data" });
  }
});

/**
 * GET /api/engine/reports?startDate=yyyy-MM-dd&endDate=yyyy-MM-dd
 * Full reports data for a period (includes trends, top merchants, YTD)
 */
router.get("/reports", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const householdId = req.session.householdId;

    const { startDate, endDate } = parseDateRange(
      req.query.startDate as string | undefined,
      req.query.endDate as string | undefined
    );

    const userIds = await getUserIdsForQuery(userId, householdId);

    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);

    // Get all base data
    const [expensesData, incomeData, billsData] = await Promise.all([
      storage.getExpensesByUserIds(userIds),
      storage.getIncomesByUserIds(userIds),
      storage.getBillsByUserIds(userIds),
    ]);

    // Get normalized transactions for both date range and current month
    const [transactionsForRange, transactionsForMonth] = await Promise.all([
      getAllNormalizedTransactions(userIds, startDate, endDate),
      getAllNormalizedTransactions(userIds, monthStart, monthEnd),
    ]);

    // Calculate current month metrics
    const currentMonthExpenses = calculateExpensesForPeriod({
      expenses: expensesData,
      transactions: transactionsForMonth,
      monthStart,
      monthEnd,
      prevMonthStart: startOfMonth(subMonths(today, 1)),
      prevMonthEnd: endOfMonth(subMonths(today, 1)),
    });
    const currentMonthIncome = calculateIncomeForPeriod({
      income: incomeData,
      transactions: transactionsForMonth,
      monthStart,
      monthEnd,
    });
    const currentMonthBills = calculateBillsForPeriod({
      bills: billsData,
      monthStart,
      monthEnd,
    });

    // Use engine-computed category totals (includes both manual expenses AND bank transactions)
    const categoryTotals = currentMonthExpenses.byCategory;

    // Build daily spending totals
    const dailyTotals: Record<string, number> = {};
    let totalMonthlySpending = 0;
    for (const tx of transactionsForRange) {
      if (tx.direction === "debit") {
        totalMonthlySpending += tx.amount;
        dailyTotals[tx.date] = (dailyTotals[tx.date] ?? 0) + tx.amount;
      }
    }
    const dayCount = Math.max(1, Object.keys(dailyTotals).length);
    const dailyAvg = totalMonthlySpending / dayCount;

    // Top merchants from transactions
    const merchantTotals: Record<string, { total: number; count: number }> = {};
    for (const tx of transactionsForRange) {
      if (tx.direction === "debit") {
        if (!merchantTotals[tx.merchant]) {
          merchantTotals[tx.merchant] = { total: 0, count: 0 };
        }
        merchantTotals[tx.merchant].total += tx.amount;
        merchantTotals[tx.merchant].count += 1;
      }
    }
    const topMerchants = Object.entries(merchantTotals)
      .map(([merchant, data]) => ({ merchant, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // YTD calculations from actual transaction data
    const ytdStart = startOfYear(today);
    const ytdTransactions = await getAllNormalizedTransactions(userIds, ytdStart, endDate);
    const ytdIncome = ytdTransactions
      .filter(tx => tx.direction === "credit" && !tx.isTransfer)
      .reduce((sum, tx) => sum + tx.amount, 0);
    const ytdExpenses = ytdTransactions
      .filter(tx => tx.direction === "debit" && !tx.isTransfer)
      .reduce((sum, tx) => sum + tx.amount, 0);
    const ytdBills = currentMonthBills.monthlyEstimate; // Bills are projected, not transactional

    // Build 6-month trend
    const monthlyTrend: MonthlyTrendPoint[] = [];
    for (let i = 5; i >= 0; i--) {
      const trendDate = subMonths(today, i);
      const trendStart = startOfMonth(trendDate);
      const trendEnd = endOfMonth(trendDate);
      const trendTx = await getAllNormalizedTransactions(userIds, trendStart, trendEnd);

      const trendIncome = trendTx
        .filter(tx => tx.direction === "credit" && !tx.isTransfer)
        .reduce((sum, tx) => sum + tx.amount, 0);
      const trendExpenses = trendTx
        .filter(tx => tx.direction === "debit" && !tx.isTransfer)
        .reduce((sum, tx) => sum + tx.amount, 0);

      const savings = trendIncome - trendExpenses;
      const savingsRate = trendIncome > 0 ? (savings / trendIncome) * 100 : 0;

      monthlyTrend.push({
        month: format(trendDate, "MMM"),
        monthKey: format(trendDate, "yyyy-MM"),
        expenses: trendExpenses,
        income: trendIncome,
        savings,
        savingsRate,
      });
    }

    const response: ReportsData = {
      currentMonth: {
        totalExpenses: currentMonthExpenses.total,
        totalIncome: currentMonthIncome.actualIncome,
        netCashFlow: currentMonthIncome.actualIncome - currentMonthExpenses.total,
        monthlyBillsTotal: currentMonthBills.monthlyEstimate,
        expenseChange: currentMonthExpenses.momChangePercent ?? 0,
      },
      categoryTotals,
      monthlyTrend,
      dailySpending: {
        dailyAvg,
        projectedMonthly: dailyAvg * 30,
        dailyTotals,
      },
      topMerchants,
      ytd: {
        income: ytdIncome,
        expenses: ytdExpenses,
        bills: ytdBills,
        net: ytdIncome - ytdExpenses - ytdBills,
      },
    };

    res.json(response as ReportsData);
  } catch (error) {
    console.error("[engine.reports]", error);
    res.status(500).json({ error: "Failed to fetch reports data" });
  }
});

// ─── Re-categorization endpoint ─────────────────────────────────────────
// Applies the expanded Plaid/MX category mappings to ALL existing transactions.
// This is a one-time migration endpoint to fix old transactions that were mapped
// with the old, less-detailed mapping tables.

import { mapPlaidCategoryDetailed, mapPlaidCategory } from "../plaid";
import { mapMXCategory } from "../mx";

router.post("/recategorize", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    let plaidUpdated = 0;
    let mxUpdated = 0;
    let plaidSkipped = 0;
    let mxSkipped = 0;

    // ── Plaid Transactions ──
    const plaidAccounts = await storage.getAllPlaidAccounts(userId);
    const plaidAccountIds = plaidAccounts.map((a) => a.id);

    if (plaidAccountIds.length > 0) {
      const plaidTxs = await storage.getPlaidTransactions(plaidAccountIds);

      for (const tx of plaidTxs) {
        // Re-apply mapping: try detailed first, then primary
        const detailed = (tx as any).personalFinanceCategoryDetailed || null;
        const primary = tx.category || null;
        const newCategory = mapPlaidCategoryDetailed(detailed) || mapPlaidCategory(primary);

        if (newCategory && newCategory !== (tx as any).personalCategory) {
          await storage.updatePlaidTransaction(tx.id, {
            personalCategory: newCategory,
          } as any);
          plaidUpdated++;
        } else {
          plaidSkipped++;
        }
      }
    }

    // ── MX Transactions ──
    const mxAccounts = await storage.getMxAccountsByUserId(userId);
    const mxAccountIds = mxAccounts.map((a) => a.id);

    if (mxAccountIds.length > 0) {
      const mxTxs = await storage.getMxTransactions(mxAccountIds);

      for (const tx of mxTxs) {
        const topLevel = (tx as any).topLevelCategory || "";
        const category = (tx as any).category || "";
        const isIncome = (tx as any).transactionType === "CREDIT";
        const newCategory = mapMXCategory(topLevel, category, isIncome);

        if (newCategory && newCategory !== (tx as any).personalCategory) {
          await storage.updateMxTransaction(tx.id, {
            personalCategory: newCategory,
          } as any);
          mxUpdated++;
        } else {
          mxSkipped++;
        }
      }
    }

    res.json({
      success: true,
      plaid: { updated: plaidUpdated, unchanged: plaidSkipped },
      mx: { updated: mxUpdated, unchanged: mxSkipped },
      totalUpdated: plaidUpdated + mxUpdated,
    });
  } catch (error) {
    console.error("[engine.recategorize]", error);
    res.status(500).json({ error: "Failed to re-categorize transactions" });
  }
});

export default router;