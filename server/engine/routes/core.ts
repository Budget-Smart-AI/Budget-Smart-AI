/**
 * Engine — core calculation routes.
 *
 * Every route here runs inside the engine sub-app (createEngineApp), which
 * means engineAuth has already placed a validated EngineContext on the
 * request. Handlers consume it via `requireContext(req)` — they never touch
 * `req.session` directly.
 *
 * Data access rules:
 *   • financial reads go through EngineStorage (the security facade);
 *   • normalized provider data comes from server/engine/data-loaders.ts;
 *   • the full `storage` module is NOT imported here.
 *
 * Provider-agnostic: Plaid, MX, Manual, and any future aggregator plug in
 * via their adapters in server/lib/financial-engine/adapters/ — no route
 * changes needed when a new provider lands.
 */

import { Router, Request, Response } from "express";
import { startOfMonth, endOfMonth, parseISO, format, subMonths, startOfYear, getDaysInMonth } from "date-fns";
import { EngineStorage } from "../storage";
import {
  getAllNormalizedAccounts,
  getAllNormalizedTransactions,
} from "../data-loaders";
import { requireContext } from "../context";
import { loadAndCalculateNetWorth } from "../../lib/net-worth-service";
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
  calculateTaxSummary,
  calculateRefundsForPeriod,
  calculateRefundsMonthlyTrend,
  buildOverrideMap,
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
  type MerchantOverrideMap,
} from "../../lib/financial-engine";

const router = Router();

/**
 * Parse date query parameters (yyyy-MM-dd format). Defaults to current month.
 */
function parseDateRange(
  startDateStr?: string,
  endDateStr?: string,
): { startDate: Date; endDate: Date } {
  if (startDateStr && endDateStr) {
    return { startDate: parseISO(startDateStr), endDate: parseISO(endDateStr) };
  }
  const today = new Date();
  return { startDate: startOfMonth(today), endDate: endOfMonth(today) };
}

/**
 * Load both halves of the income-source registry for a household.
 *
 * The registry path in `calculateIncomeForPeriod` needs the active sources
 * AND their effective-dated unit amounts. Sources come from the household
 * fan-out; amounts have a sourceId FK so we have to fetch them in a second
 * pass. The two together are still O(2) round-trips — small compared to the
 * normalized transactions load that all callers already pay for.
 *
 * Returns `{ sources: [], amounts: [] }` for households without any
 * registered sources, which is the back-compat signal that
 * `calculateIncomeForPeriod` interprets as "use the legacy path".
 */
async function loadIncomeRegistry(userIds: string[]): Promise<{
  sources: Awaited<ReturnType<typeof EngineStorage.getIncomeSourcesByUserIds>>;
  amounts: Awaited<ReturnType<typeof EngineStorage.getIncomeSourceAmountsBySourceIds>>;
}> {
  const sources = await EngineStorage.getIncomeSourcesByUserIds(userIds);
  if (sources.length === 0) return { sources, amounts: [] };
  const amounts = await EngineStorage.getIncomeSourceAmountsBySourceIds(
    sources.map((s) => s.id),
  );
  return { sources, amounts };
}

// ─── Endpoints ─────────────────────────────────────────────────────────────

/**
 * GET /api/engine/dashboard
 * Main dashboard endpoint. Returns everything needed for the dashboard in one call.
 */
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const { userId, householdUserIds: userIds } = requireContext(req);

    // Get current month dates
    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);

    // Phase 3.1 — fetch recurring streams alongside the rest. Adapter errors
    // return [] gracefully so dashboard never breaks on a Plaid 4xx.
    const { getRecurringStreams } = await import("../../lib/financial-engine/get-recurring-streams");

    // Fetch all data in parallel
    const [
      billsData,
      incomeData,
      incomeRegistry,
      expensesData,
      budgetsData,
      savingsGoalsData,
      transactions,
      bankAccounts,
      rawAssets,
      rawDebts,
      rawInvestmentAccounts,
      rawHoldings,
      incomeStreams,
    ] = await Promise.all([
      EngineStorage.getBillsByUserIds(userIds),
      EngineStorage.getIncomesByUserIds(userIds),
      loadIncomeRegistry(userIds),
      EngineStorage.getExpensesByUserIds(userIds),
      EngineStorage.getBudgetsByUserIds(userIds),
      EngineStorage.getSavingsGoalsByUserIds(userIds),
      getAllNormalizedTransactions(userIds, monthStart, monthEnd),
      getAllNormalizedAccounts(userIds),
      EngineStorage.getAssets(userId),
      EngineStorage.getDebtDetails(userId),
      EngineStorage.getInvestmentAccounts(userId),
      EngineStorage.getHoldingsByUser(userId),
      getRecurringStreams(userIds, { direction: "inflow" }).catch((err) => {
        console.warn("[engine.dashboard] getRecurringStreams failed (non-fatal):", err?.message);
        return [];
      }),
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
      incomeSources: incomeRegistry.sources,
      incomeSourceAmounts: incomeRegistry.amounts,
      transactions,
      monthStart,
      monthEnd,
      today,
      incomeStreams,
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
    // UAT-11 P0-1 (#80, #84): Dashboard "Savings Goals" card displayed the
    // goal's UUID because this call didn't forward `name`, so calculateSavingsGoals
    // fell back to `id` for the label. The /savings-goals endpoint (below) had
    // the right shape; the dashboard projection was missed during the 2026-04-22
    // fix. Pass the name through so the dashboard and the savings-goals page
    // render identically.
    const savingsGoals = calculateSavingsGoals({
      goals: savingsGoalsData.map((g) => ({
        id: g.id,
        name: g.name,
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

    // Calculate gaps.
    //
    // UAT-9 fix: previously these were raw (actual - monthly-full) subtractions,
    // which misrepresented mid-month state as "under plan" simply because the
    // month hadn't finished yet. We now prorate the planned side by the fraction
    // of the month elapsed, so the gap is ~0 when on-track mid-month and only
    // flags real variance against the time-proportional expectation.
    const budgetTotal = budgetsData.reduce((sum, b) => sum + parseFloat(String(b.amount ?? 0)), 0);
    const daysInMonth = getDaysInMonth(today);
    const daysElapsed = Math.min(today.getDate(), daysInMonth);
    const elapsedRatio = daysInMonth > 0 ? daysElapsed / daysInMonth : 1;

    const expectedIncomeToDate = income.budgetedIncome * elapsedRatio;
    const expectedSpendingToDate = budgetTotal * elapsedRatio;
    const expectedBillsToDate = bills.monthlyEstimate * elapsedRatio;

    const incomeGap = income.actualIncome - expectedIncomeToDate;
    const spendingGap = expenses.total - expectedSpendingToDate;
    const plannedSavings = income.budgetedIncome - budgetTotal - bills.monthlyEstimate;
    const actualSavings = income.actualIncome - expenses.total - bills.monthlyEstimate;
    const expectedSavingsToDate =
      expectedIncomeToDate - expectedSpendingToDate - expectedBillsToDate;
    const savingsGap = actualSavings - expectedSavingsToDate;

    // Calculate alerts
    const negativeCashFlow = income.actualIncome < expenses.total + bills.monthlyEstimate;
    const budgetOverage = budgetTotal > 0 && expenses.total > budgetTotal;
    // UAT-6 P1-12b: `(budgetTotal || 1)` fallback produced a nonsense 457,722%
    // when the user had no budget rows at all — it was computing
    // (expenses / 1 - 1) * 100. Real fix: if there is no budget, there can be
    // no "overage percentage", so return 0 and let `budgetOverage=false` keep
    // the banner hidden.
    const budgetOveragePercent = budgetTotal > 0
      ? ((expenses.total / budgetTotal) - 1) * 100
      : 0;
    const planVsRealityMismatch = income.budgetedIncome > 0
      && Math.abs(incomeGap) > income.budgetedIncome * 0.1;

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
        // UAT-11 P0-2: expose the true plan so the UI can stop confusing
        // "Budgeted Spending" with "actual spending to date".
        budgetTotal,
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
    const { userId, householdUserIds } = requireContext(req);

    const { startDate, endDate } = parseDateRange(
      req.query.startDate as string | undefined,
      req.query.endDate as string | undefined
    );

    const userIds = requireContext(req).householdUserIds;

    const prevMonthStart = startOfMonth(subMonths(startDate, 1));
    const prevMonthEnd = endOfMonth(subMonths(startDate, 1));

    // Fetch transactions for BOTH current and previous month (needed for MoM comparison)
    const [expensesData, transactions] = await Promise.all([
      EngineStorage.getExpensesByUserIds(userIds),
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
    const { userId, householdUserIds } = requireContext(req);

    const { startDate, endDate } = parseDateRange(
      req.query.startDate as string | undefined,
      req.query.endDate as string | undefined
    );

    const userIds = requireContext(req).householdUserIds;

    // Fetch a 3-month lookback window for recurring income source detection.
    // This allows biweekly, monthly, and quarterly income patterns to be
    // identified even when no deposit has landed in the current month yet.
    const lookbackStart = startOfMonth(subMonths(startDate, 3));

    // Phase 3.1 Provider-First SSOT (2026-04-26): fan out across providers
    // to fetch recurring streams. calculateIncomeForPeriod uses these to
    // match registry sources by stream-membership instead of fuzzy merchant
    // name (root fix for the Coreslab/Roche $0-received bug — Plaid
    // mis-classifies those payrolls per-tx but the stream API clusters them
    // correctly). Adapter errors return [] gracefully so a Plaid 4xx never
    // breaks this endpoint.
    const { getRecurringStreams } = await import("../../lib/financial-engine/get-recurring-streams");
    const [incomeData, incomeRegistry, transactions, historicalTransactions, incomeStreams] = await Promise.all([
      EngineStorage.getIncomesByUserIds(userIds),
      loadIncomeRegistry(userIds),
      getAllNormalizedTransactions(userIds, startDate, endDate),
      getAllNormalizedTransactions(userIds, lookbackStart, endDate),
      getRecurringStreams(userIds, { direction: "inflow" }).catch((err) => {
        console.warn("[engine.income] getRecurringStreams failed (non-fatal):", err?.message);
        return [];
      }),
    ]);

    const result = calculateIncomeForPeriod({
      income: incomeData,
      incomeSources: incomeRegistry.sources,
      incomeSourceAmounts: incomeRegistry.amounts,
      transactions,
      historicalTransactions,
      monthStart: startDate,
      monthEnd: endDate,
      incomeStreams,
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
    const { userId, householdUserIds } = requireContext(req);

    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);

    const userIds = requireContext(req).householdUserIds;
    const billsData = await EngineStorage.getBillsByUserIds(userIds);

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
    const { userId, householdUserIds: userIds } = requireContext(req);
    const billsData = await EngineStorage.getBillsByUserIds(userIds);

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
    const { userId, householdUserIds } = requireContext(req);
    const userIds = requireContext(req).householdUserIds;

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
    const { userId, householdUserIds } = requireContext(req);
    const extraPayment = parseFloat(req.query.extraPayment as string) || 0;

    // 1. Manual debt details (user-entered with APR, min payment, etc.)
    const rawDebts = await EngineStorage.getDebtDetails(userId);
    const manualDebts = rawDebts.map((d) => ({
      id: d.id,
      name: d.name ?? d.debtType ?? "Unknown Debt",
      balance: parseFloat(String(d.currentBalance ?? 0)),
      interestRate: parseFloat(String(d.apr ?? 0)),
      minimumPayment: parseFloat(String(d.minimumPayment ?? 0)),
      category: d.debtType ?? "Other",
      source: "manual" as const,
      linkedPlaidAccountId: d.linkedPlaidAccountId ?? null,
    }));

    // 2. Provider-synced liability accounts (credit cards, loans, mortgages,
    //    LOC) from ANY banking provider (Plaid, MX, Finicity, future adapters)
    //    — unioned with manual debts so users see a complete debt picture
    //    without double-entering. Accounts already linked to a manual debt
    //    (via linkedPlaidAccountId — legacy column name, holds ANY provider's
    //    account id) are skipped to avoid double-counting. The filter keys off
    //    accountType alone, not provider, so adding a new adapter in the
    //    future needs zero changes here (RC-2 provider-agnostic refactor).
    const linkedProviderIds = new Set(
      manualDebts
        .map((d) => d.linkedPlaidAccountId)
        .filter((id): id is string => !!id)
    );

    const providerAccts = await getAllNormalizedAccounts(householdUserIds ?? [userId]);

    // UAT-11 #109: log enough to diagnose "Total Debt: $0" in prod without
    // needing a re-deploy. Prints the full liability candidate list (account
    // id, type, balance, isActive) once per request. Safe — no PII, no tokens.
    const liabilityCandidates = providerAccts.filter(
      (a) =>
        a.accountType === "credit" ||
        a.accountType === "credit_card" ||
        a.accountType === "loan" ||
        a.accountType === "mortgage" ||
        a.accountType === "line_of_credit"
    );
    if (liabilityCandidates.length > 0) {
      console.log("[engine.debts] liability candidates", {
        userId,
        householdSize: (householdUserIds ?? [userId]).length,
        candidates: liabilityCandidates.map((a) => ({
          id: a.id,
          name: a.name,
          accountType: a.accountType,
          balance: a.balance,
          isActive: a.isActive,
          provider: a.provider,
          linkedToManual: linkedProviderIds.has(a.id),
        })),
      });
    }

    const providerDebts = providerAccts
      .filter(
        (a) =>
          !linkedProviderIds.has(a.id) &&
          a.isActive !== false &&
          (a.accountType === "credit" ||
            a.accountType === "credit_card" ||
            a.accountType === "loan" ||
            a.accountType === "mortgage" ||
            a.accountType === "line_of_credit")
      )
      .map((a) => ({
        id: a.id,
        name: a.name,
        balance: Math.abs(parseFloat(String(a.balance ?? 0))),
        // APR unknown from bank feeds — default to 0 so payoff schedules still
        // run (treated as interest-free); user can override by creating a
        // manual debt_details entry and linking it via linkedPlaidAccountId.
        interestRate: 0,
        // Minimum payment unknown from bank feeds — zero means payoff needs an
        // explicit extraPayment to make progress. Flagged in UI.
        minimumPayment: 0,
        category: a.accountType,
        // `source` carries the originating provider for provenance display
        // ("plaid" | "mx" | "manual" | ...). The engine's payoff math does
        // not branch on this value — it's UI-only.
        source: a.provider.toLowerCase() as any,
        linkedPlaidAccountId: null,
      }));

    // Strip the internal linkedPlaidAccountId before passing to the engine —
    // the engine expects DebtItem shape without that field. Category is
    // coerced to a plain string (AccountCategory enum is a subset of string).
    const debts = [...manualDebts, ...providerDebts].map(
      ({ linkedPlaidAccountId: _omit, category, ...d }) => ({
        ...d,
        category: String(category),
      })
    );

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
    const { userId, householdUserIds } = requireContext(req);

    // Parse month from query, default to current month
    let monthStr = req.query.month as string | undefined;
    if (!monthStr) {
      const today = new Date();
      monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    }

    const [year, month] = monthStr.split("-").map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = endOfMonth(startDate);

    const userIds = requireContext(req).householdUserIds;

    const [budgetsData, expensesData] = await Promise.all([
      EngineStorage.getBudgetsByUserIdsAndMonth(userIds, monthStr),
      EngineStorage.getExpensesByUserIds(userIds),
    ]);

    // Map Drizzle numeric strings → engine number types
    const result = calculateBudgets({
      budgets: budgetsData.map((b) => ({
        category: b.canonicalCategoryId,
        amount: parseFloat(String(b.amount ?? 0)),
        month: b.month,
      })),
      expenses: expensesData.map((e) => ({
        category: e.canonicalCategoryId,
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
    const { userId, householdUserIds: userIds } = requireContext(req);
    const savingsGoalsData = await EngineStorage.getSavingsGoalsByUserIds(userIds);

    const result = calculateSavingsGoals({
      goals: savingsGoalsData.map((g) => ({
        id: g.id,
        name: g.name,
        current: parseFloat(String(g.currentAmount ?? 0)),
        target: parseFloat(String(g.targetAmount ?? 0)),
        targetDate: g.targetDate ?? undefined,
      })),
    });

    // 2026-04-22 bugfix: the engine's SavingsGoalsResult shape only carries
    // {id, name, current, target, percentage, remaining, isComplete, daysLeft}
    // — but the client page (client/src/pages/savings-goals.tsx) was written
    // against the raw DB row shape (currentAmount/targetAmount as strings,
    // plus color/notes). Without this enrichment, newly-created goals render
    // as `$NaN` (parseFloat(undefined)) with their UUID as the name (because
    // calculateSavingsGoals incorrectly falls back to `goal.id || 'Goal'`).
    //
    // Fix: merge each engine-computed goal with its source DB row so the
    // response shape is a superset — engine's percentage/remaining/daysLeft
    // plus the raw display fields the client reads.
    const enrichedGoals = result.goals.map((g) => {
      const src = savingsGoalsData.find((s) => s.id === g.id);
      return {
        ...g,
        // name already correct from engine input, but belt-and-suspenders
        name: src?.name ?? g.name,
        color: src?.color ?? null,
        notes: src?.notes ?? null,
        targetDate: src?.targetDate ?? null,
        // Preserve the DB string forms — the client does parseFloat() on these.
        currentAmount: src?.currentAmount ?? String(g.current),
        targetAmount: src?.targetAmount ?? String(g.target),
      };
    });

    res.json({ ...result, goals: enrichedGoals });
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
    const { userId, householdUserIds } = requireContext(req);

    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);

    const userIds = requireContext(req).householdUserIds;
    const { getRecurringStreams } = await import("../../lib/financial-engine/get-recurring-streams");

    const [incomeData, incomeRegistry, budgetsData, billsData, savingsGoalsData, expensesData, transactions, incomeStreams] =
      await Promise.all([
        EngineStorage.getIncomesByUserIds(userIds),
        loadIncomeRegistry(userIds),
        EngineStorage.getBudgetsByUserIds(userIds),
        EngineStorage.getBillsByUserIds(userIds),
        EngineStorage.getSavingsGoalsByUserIds(userIds),
        EngineStorage.getExpensesByUserIds(userIds),
        getAllNormalizedTransactions(userIds, monthStart, monthEnd),
        getRecurringStreams(userIds, { direction: "inflow" }).catch((err) => {
          console.warn("[engine.financial-health] getRecurringStreams failed (non-fatal):", err?.message);
          return [];
        }),
      ]);

    const income = calculateIncomeForPeriod({
      income: incomeData,
      incomeSources: incomeRegistry.sources,
      incomeSourceAmounts: incomeRegistry.amounts,
      transactions,
      monthStart,
      monthEnd,
      today,
      incomeStreams,
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
    const { userId, householdUserIds } = requireContext(req);

    // Parse month, default to current
    let monthStr = req.query.month as string | undefined;
    if (!monthStr) {
      const today = new Date();
      monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    }

    const [year, month] = monthStr.split("-").map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = endOfMonth(monthStart);

    const userIds = requireContext(req).householdUserIds;

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
 * GET /api/engine/accounts
 *
 * Provider-agnostic listing of ALL linked + manual accounts for the requesting
 * user / household. Replaces the per-provider endpoints the UI used to hit
 * (`/api/plaid/accounts`, `/api/mx/accounts`, `/api/investment-accounts`,
 * `/api/assets`, `/api/debts`) and the client-side aggregation logic that
 * lived in bank-accounts.tsx (UAT-8 #145 root cause).
 *
 * Response shape — one flat array of NormalizedAccount plus aggregate totals:
 *   {
 *     accounts: NormalizedAccount[],
 *     byType: Record<AccountCategory, { count: number; total: number }>,
 *     totals: { assets, liabilities, netWorth, cash, investments, debts },
 *     connectionStatus: {
 *       anyReauthRequired: boolean,
 *       anyError: boolean,
 *       problems: { accountId, institution, status }[]
 *     }
 *   }
 *
 * Calling code (bank-accounts.tsx, investments.tsx, liabilities.tsx) now reads
 * from THIS endpoint alone and never branches on provider. Adding a new
 * aggregator means wiring it into getAllNormalizedAccounts — zero UI changes.
 */
router.get("/accounts", async (req: Request, res: Response) => {
  try {
    const { userId } = requireContext(req);
    const userIds = requireContext(req).householdUserIds;

    // UAT-11 #94: route the Net Worth total through the same service the
    // /bank-accounts and /net-worth endpoints use, so the Accounts page can't
    // show two different Net Worth numbers. Previously this endpoint did a
    // local cash + investments − |debts| calc that ignored manual assets and
    // manual debt rows, producing a smaller number than the Net Worth page.
    const [accounts, netWorthResult] = await Promise.all([
      getAllNormalizedAccounts(userIds),
      loadAndCalculateNetWorth(userIds, userId, { history: false }),
    ]);

    // Aggregate by canonical account type.
    const byType: Record<string, { count: number; total: number }> = {};
    for (const acc of accounts) {
      if (!byType[acc.accountType]) {
        byType[acc.accountType] = { count: 0, total: 0 };
      }
      byType[acc.accountType].count += 1;
      byType[acc.accountType].total += Number(acc.balance) || 0;
    }

    // Per-bucket cash/investment/debt rollups for the type tiles. These are
    // rollups of the deduped normalized account balances ONLY — the full net
    // worth number (including manual assets + manual debts) comes from the
    // net-worth service so every surface stays in sync.
    const CASH = new Set(["checking", "savings", "depository"]);
    const INVEST = new Set(["investment", "brokerage"]);
    const LIAB = new Set([
      "credit",
      "credit_card",
      "loan",
      "mortgage",
      "line_of_credit",
    ]);

    let cash = 0;
    let investments = 0;
    let debts = 0;
    for (const acc of accounts) {
      if (!acc.isActive) continue;
      const bal = Number(acc.balance) || 0;
      if (CASH.has(acc.accountType)) cash += Math.max(0, bal);
      else if (INVEST.has(acc.accountType)) investments += Math.max(0, bal);
      else if (LIAB.has(acc.accountType)) debts += Math.abs(bal);
    }

    // Totals: assets/liabilities/netWorth come from the net-worth service
    // (covers manual assets + manual debts + holdings); bucket rollups stay
    // local to this route so type tiles add up to the per-type subtotals
    // shown in the UI.
    const totals = {
      assets: netWorthResult.totalAssets,
      liabilities: netWorthResult.totalLiabilities,
      netWorth: netWorthResult.netWorth,
      cash,
      investments,
      debts,
    };

    // Connection health — surface any Plaid/MX item that needs re-auth or is
    // erroring so the UI can show a prominent alert banner (UAT-8 #142).
    const problems = accounts
      .filter(
        (a) =>
          a.itemStatus &&
          a.itemStatus !== "healthy" &&
          a.isActive
      )
      .map((a) => ({
        accountId: a.id,
        accountName: a.name,
        institution: a.institutionName ?? a.provider,
        provider: a.provider,
        status: a.itemStatus!,
      }));

    res.json({
      accounts,
      byType,
      totals,
      connectionStatus: {
        anyReauthRequired: problems.some((p) => p.status === "reauth_required"),
        anyError: problems.some((p) => p.status === "error"),
        problems,
      },
    });
  } catch (error) {
    console.error("[engine.accounts]", error);
    res.status(500).json({ error: "Failed to fetch accounts data" });
  }
});

/**
 * GET /api/engine/assets
 * Asset summary: total value, purchase price, appreciation, grouped by category
 */
router.get("/assets", async (req: Request, res: Response) => {
  try {
    const { userId } = requireContext(req);
    const rawAssets = await EngineStorage.getAssets(userId);

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
    const { userId } = requireContext(req);

    const rawInvestmentAccounts = await EngineStorage.getInvestmentAccounts(userId);
    const rawHoldings = await EngineStorage.getHoldingsByUser(userId);

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
 * GET /api/engine/safe-to-spend
 * Safe-to-spend for the current month — amount remaining after bills and
 * committed expenses, plus a daily allowance. Mirrors the composite
 * dashboard's `safeToSpend` field but queryable on its own so the
 * money-timeline widget and other lightweight consumers don't need to
 * pull the entire dashboard payload.
 * UAT-6 P1-7: was "not_found" because no dedicated endpoint existed.
 */
router.get("/safe-to-spend", async (req: Request, res: Response) => {
  try {
    const { householdUserIds: userIds } = requireContext(req);

    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);

    const { getRecurringStreams } = await import("../../lib/financial-engine/get-recurring-streams");
    const [billsData, incomeData, incomeRegistry, expensesData, transactions, incomeStreams] = await Promise.all([
      EngineStorage.getBillsByUserIds(userIds),
      EngineStorage.getIncomesByUserIds(userIds),
      loadIncomeRegistry(userIds),
      EngineStorage.getExpensesByUserIds(userIds),
      getAllNormalizedTransactions(userIds, monthStart, monthEnd),
      getRecurringStreams(userIds, { direction: "inflow" }).catch((err) => {
        console.warn("[engine.safe-to-spend] getRecurringStreams failed (non-fatal):", err?.message);
        return [];
      }),
    ]);

    const income = calculateIncomeForPeriod({
      income: incomeData,
      incomeSources: incomeRegistry.sources,
      incomeSourceAmounts: incomeRegistry.amounts,
      transactions,
      monthStart,
      monthEnd,
      incomeStreams,
      today,
    });
    const expenses = calculateExpensesForPeriod({
      expenses: expensesData,
      transactions,
      monthStart,
      monthEnd,
      prevMonthStart: startOfMonth(subMonths(today, 1)),
      prevMonthEnd: endOfMonth(subMonths(today, 1)),
    });
    const bills = calculateBillsForPeriod({
      bills: billsData,
      monthStart,
      monthEnd,
    });

    const result = calculateSafeToSpend({
      effectiveIncome: income.effectiveIncome,
      totalSpent: expenses.total,
      billsTotal: bills.monthlyEstimate,
      today,
    });

    res.json(result as SafeToSpendResult);
  } catch (error) {
    console.error("[engine.safe-to-spend]", error);
    res.status(500).json({ error: "Failed to fetch safe-to-spend data" });
  }
});

/**
 * GET /api/engine/tax?country=US&year=2026
 * Tax summary: deductible amounts by category, estimated savings at
 * marginal rate. Transactions are pulled for the tax year (defaults to
 * the current calendar year).
 * UAT-6 P1-8: replaces the legacy route that errored.
 */
router.get("/tax", async (req: Request, res: Response) => {
  try {
    const { householdUserIds: userIds } = requireContext(req);

    const countryInput = String(req.query.country ?? "US").toUpperCase();
    const country = (countryInput === "CA" ? "CA" : "US") as "US" | "CA";

    const yearInput = req.query.year ? parseInt(String(req.query.year), 10) : NaN;
    const targetYear = Number.isFinite(yearInput) ? yearInput : new Date().getFullYear();

    const yearStart = new Date(targetYear, 0, 1);
    const yearEnd = new Date(targetYear, 11, 31);

    const [expensesData, transactions] = await Promise.all([
      EngineStorage.getExpensesByUserIds(userIds),
      getAllNormalizedTransactions(userIds, yearStart, yearEnd),
    ]);

    // Shape expenses as TaxTransaction records the engine expects.
    // We merge manual expenses (user-flagged deductible) with transaction
    // data (for auto-suggested deductibles from category mapping).
    const txForTax = transactions
      .filter((t) => t.direction === "debit" && !t.isTransfer && !t.isPending)
      .map((t) => ({
        id: t.id,
        date: t.date,
        merchant: t.merchant,
        category: t.category,
        amount: t.amount,
        taxDeductible: false,
        taxCategory: null as string | null,
        isBusinessExpense: false,
        // Map normalized "Plaid" / "MX" / "Manual" → the TaxTransaction union
        source: (t.provider === "Plaid" ? "plaid" : t.provider === "MX" ? "mx" : "manual") as
          "plaid" | "mx" | "manual",
      }));

    const manualForTax = expensesData
      .map((e) => ({
        id: e.id,
        date: e.date,
        merchant: e.merchant,
        category: e.canonicalCategoryId ?? "Other",
        amount: parseFloat(String(e.amount ?? 0)) || 0,
        // `expenses.taxDeductible` is a Postgres text column storing "true"/"false".
        // Drizzle surfaces it as `string | null`, so we only need the string check.
        taxDeductible: String(e.taxDeductible) === "true",
        taxCategory: e.taxCategory ?? null,
        isBusinessExpense: String((e as any).isBusinessExpense) === "true",
        source: "manual" as const,
      }))
      .filter((e) => {
        try {
          const d = parseISO(e.date);
          return d >= yearStart && d <= yearEnd;
        } catch {
          return false;
        }
      });

    // Caller must pass a marginal rate; default to 0 so the savings estimate is
    // neutral when the user hasn't set one in their profile. The UI layer picks
    // up `marginalRate` from the tax-smart page and re-runs if set.
    const marginalRateNum = Number(req.query.marginalRate ?? 0) || 0;
    const summary = calculateTaxSummary(
      [...manualForTax, ...txForTax],
      country,
      targetYear,
      marginalRateNum,
    );

    res.json(summary);
  } catch (error) {
    console.error("[engine.tax]", error);
    res.status(500).json({ error: "Failed to fetch tax summary" });
  }
});

/**
 * GET /api/engine/refunds?startDate=yyyy-MM-dd&endDate=yyyy-MM-dd
 * Refunds & returns for the requested period. Also returns a 12-month
 * trend (monthly totals) so the refunds dashboard widget can render its
 * spark-line without a second round trip.
 * UAT-6 P1-9: replaces the legacy route that errored.
 */
router.get("/refunds", async (req: Request, res: Response) => {
  try {
    const { householdUserIds: userIds } = requireContext(req);
    const { startDate, endDate } = parseDateRange(
      req.query.startDate as string | undefined,
      req.query.endDate as string | undefined
    );

    // 12-month window for the trend chart (ends at the requested period end).
    const trendStart = subMonths(endDate, 11);

    // One fetch that covers both windows — whichever starts earlier.
    const fetchStart = trendStart < startDate ? trendStart : startDate;
    const transactions = await getAllNormalizedTransactions(
      userIds,
      fetchStart,
      endDate
    );

    // Empty override map: when DB-backed merchant-category overrides land
    // (schema TBD), load them here via EngineStorage. Today the resolver
    // falls back to Plaid PFC / MX mappings, which is the correct Monarch
    // default when the user hasn't customised anything.
    const overrides: MerchantOverrideMap = buildOverrideMap([]);

    const period = calculateRefundsForPeriod(
      transactions,
      overrides,
      startDate,
      endDate
    );
    const trend = calculateRefundsMonthlyTrend(
      transactions,
      overrides,
      trendStart,
      endDate
    );

    res.json({ ...period, monthlyTrend: trend });
  } catch (error) {
    console.error("[engine.refunds]", error);
    res.status(500).json({ error: "Failed to fetch refunds data" });
  }
});

/**
 * GET /api/engine/categories/stats?startDate=yyyy-MM-dd&endDate=yyyy-MM-dd
 * Per-category stats for the requested period — tx count, total spend,
 * MoM delta, average per transaction. Powered by the Monarch-aligned
 * category resolver so categorisation matches Monarch 1:1.
 * UAT-6 P1-10: replaces the legacy route that errored.
 */
router.get("/categories/stats", async (req: Request, res: Response) => {
  try {
    const { householdUserIds: userIds } = requireContext(req);
    const { startDate, endDate } = parseDateRange(
      req.query.startDate as string | undefined,
      req.query.endDate as string | undefined
    );

    // Previous period for MoM deltas. Same length as the current window.
    const rangeDays = Math.max(
      1,
      Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000)
    );
    const prevStart = new Date(startDate.getTime() - rangeDays * 86_400_000);
    const prevEnd = new Date(endDate.getTime() - rangeDays * 86_400_000);

    const [currentTx, previousTx] = await Promise.all([
      getAllNormalizedTransactions(userIds, startDate, endDate),
      getAllNormalizedTransactions(userIds, prevStart, prevEnd),
    ]);

    const overrides: MerchantOverrideMap = buildOverrideMap([]);

    type Stat = {
      category: string;
      count: number;
      total: number;
      avgPerTx: number;
      previousTotal: number;
      momDelta: number;
      momDeltaPercent: number;
    };
    const stats = new Map<string, Stat>();

    // Current period — debits only, skipping transfers/pending. The adapter
    // has already remapped tx.category to the canonical Monarch label.
    // User overrides (merchant re-categorisations) still take precedence.
    for (const tx of currentTx) {
      if (tx.direction !== "debit" || tx.isTransfer || tx.isPending) continue;
      const override = overrides?.get?.(tx.merchant?.toLowerCase?.() || "");
      const category = override ?? tx.category ?? "Other";
      let s = stats.get(category);
      if (!s) {
        s = {
          category,
          count: 0,
          total: 0,
          avgPerTx: 0,
          previousTotal: 0,
          momDelta: 0,
          momDeltaPercent: 0,
        };
        stats.set(category, s);
      }
      s.count += 1;
      s.total += tx.amount;
    }

    // Previous period — only need totals for MoM deltas.
    const prevTotals = new Map<string, number>();
    for (const tx of previousTx) {
      if (tx.direction !== "debit" || tx.isTransfer || tx.isPending) continue;
      const override = overrides?.get?.(tx.merchant?.toLowerCase?.() || "");
      const category = override ?? tx.category ?? "Other";
      prevTotals.set(category, (prevTotals.get(category) ?? 0) + tx.amount);
    }

    // Finalise each stat row.
    for (const s of stats.values()) {
      s.avgPerTx = s.count > 0 ? s.total / s.count : 0;
      s.previousTotal = prevTotals.get(s.category) ?? 0;
      s.momDelta = s.total - s.previousTotal;
      s.momDeltaPercent = s.previousTotal > 0
        ? (s.momDelta / s.previousTotal) * 100
        : 0;
    }

    // Categories that had activity LAST period but not this one — surface
    // them as zero-spend rows so the UI can flag drop-offs ("you didn't
    // spend on Groceries at all this period").
    for (const [category, prevTotal] of prevTotals) {
      if (stats.has(category)) continue;
      stats.set(category, {
        category,
        count: 0,
        total: 0,
        avgPerTx: 0,
        previousTotal: prevTotal,
        momDelta: -prevTotal,
        momDeltaPercent: -100,
      });
    }

    const rows = Array.from(stats.values()).sort((a, b) => b.total - a.total);
    const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

    res.json({
      period: { start: format(startDate, "yyyy-MM-dd"), end: format(endDate, "yyyy-MM-dd") },
      previousPeriod: { start: format(prevStart, "yyyy-MM-dd"), end: format(prevEnd, "yyyy-MM-dd") },
      grandTotal: Math.round(grandTotal * 100) / 100,
      categories: rows.map((r) => ({
        ...r,
        total: Math.round(r.total * 100) / 100,
        avgPerTx: Math.round(r.avgPerTx * 100) / 100,
        previousTotal: Math.round(r.previousTotal * 100) / 100,
        momDelta: Math.round(r.momDelta * 100) / 100,
        momDeltaPercent: Math.round(r.momDeltaPercent * 100) / 100,
        percentOfTotal: grandTotal > 0
          ? Math.round((r.total / grandTotal) * 10000) / 100
          : 0,
      })),
    });
  } catch (error) {
    console.error("[engine.categories.stats]", error);
    res.status(500).json({ error: "Failed to fetch category stats" });
  }
});

/**
 * GET /api/engine/reports?startDate=yyyy-MM-dd&endDate=yyyy-MM-dd
 * Full reports data for a period (includes trends, top merchants, YTD)
 */
router.get("/reports", async (req: Request, res: Response) => {
  try {
    const { userId, householdUserIds } = requireContext(req);

    const { startDate, endDate } = parseDateRange(
      req.query.startDate as string | undefined,
      req.query.endDate as string | undefined
    );

    const userIds = requireContext(req).householdUserIds;

    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);

    const { getRecurringStreams } = await import("../../lib/financial-engine/get-recurring-streams");

    // Get all base data
    const [expensesData, incomeData, incomeRegistry, billsData, incomeStreams] = await Promise.all([
      EngineStorage.getExpensesByUserIds(userIds),
      EngineStorage.getIncomesByUserIds(userIds),
      loadIncomeRegistry(userIds),
      EngineStorage.getBillsByUserIds(userIds),
      getRecurringStreams(userIds, { direction: "inflow" }).catch((err) => {
        console.warn("[engine.reports] getRecurringStreams failed (non-fatal):", err?.message);
        return [];
      }),
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
      incomeSources: incomeRegistry.sources,
      incomeSourceAmounts: incomeRegistry.amounts,
      transactions: transactionsForMonth,
      monthStart,
      monthEnd,
      today,
      incomeStreams,
    });
    const currentMonthBills = calculateBillsForPeriod({
      bills: billsData,
      monthStart,
      monthEnd,
    });

    // Use engine-computed category totals (includes both manual expenses AND bank transactions)
    const categoryTotals = currentMonthExpenses.byCategory;

    // Build daily spending totals (transfers and pending excluded — they
    // aren't real spending and artificially inflate the daily average).
    const dailyTotals: Record<string, number> = {};
    let totalMonthlySpending = 0;
    for (const tx of transactionsForRange) {
      if (tx.direction !== "debit") continue;
      if (tx.isTransfer || tx.isPending) continue;
      totalMonthlySpending += tx.amount;
      dailyTotals[tx.date] = (dailyTotals[tx.date] ?? 0) + tx.amount;
    }

    // UAT-6 P1-11 fix: dailyAvg must divide by ELAPSED calendar days in the
    // window, NOT "number of unique spending days". The old logic
    // `totalSpending / daysWithSpending` produced a per-active-day average
    // that, when multiplied by 30 below for projectedMonthly, scaled ~10x
    // too high for users who spend on only a few days a month.
    // We cap elapsed at the window length so future-dated transactions
    // (rare, but possible for pending credit-card holds) don't collapse
    // the denominator.
    const rangeDays = Math.max(
      1,
      Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1
    );
    const todayMs = new Date().getTime();
    const elapsedDays = Math.max(
      1,
      Math.min(
        rangeDays,
        Math.round((Math.min(todayMs, endDate.getTime()) - startDate.getTime()) / 86_400_000) + 1
      )
    );
    const dailyAvg = totalMonthlySpending / elapsedDays;

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
        // UAT-6 P1-11: use actual days in the current month so the
        // projection matches the calendar (28/29/30/31), not a
        // hardcoded 30.
        projectedMonthly: dailyAvg * getDaysInMonth(today),
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

// REMOVED: /recategorize endpoint
//
// This was a one-time migration that mutated personal_category on every Plaid
// and MX transaction to apply expanded category mappings. It does not belong
// in the engine — the engine is a read-mostly calculation service. Data
// migration / ETL operations are the responsibility of the website backend
// (or a one-shot script). If a similar migration is needed in the future,
// add it as an admin-only website endpoint, not an engine route.

export default router;