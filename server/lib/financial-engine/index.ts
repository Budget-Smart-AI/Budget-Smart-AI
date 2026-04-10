/**
 * Financial Engine — Central Export
 *
 * This is the single entry point for all financial calculations in Budget Smart AI.
 * All pages should call these server-side functions via API endpoints rather than
 * computing anything locally.
 *
 * Architecture:
 *   Client page → API endpoint → Adapter Layer → Financial Engine → Neon DB
 *                                     ↓
 *                              Computed result → JSON response → Client renders
 *
 * The adapter layer (adapters/) normalizes provider-specific data (Plaid, MX, etc.)
 * into NormalizedTransaction and NormalizedAccount types. The engine itself is
 * completely provider-agnostic.
 *
 * To add a new banking aggregator:
 *   1. Create an adapter in adapters/ (implement BankingAdapter interface)
 *   2. Register it in adapters/index.ts
 *   3. Use it in the route layer to normalize data before passing to the engine
 *   — zero changes to any engine module.
 */

// ─── Normalized Types (Provider-Agnostic) ─────────────────────────────────

export type {
  NormalizedTransaction,
  NormalizedAccount,
  AccountCategory,
  BankingAdapter,
} from "./normalized-types";

// ─── Engine Result Types ──────────────────────────────────────────────────

export type {
  DateRange,
  IncomeResult,
  ExpenseResult,
  BillOccurrence,
  BillsResult,
  SubscriptionsResult,
  CashFlowResult,
  NetWorthResult,
  DebtItem,
  DebtPayoffResult,
  DebtPayoffScheduleEntry,
  InvestmentsResult,
  SavingsGoalsResult,
  BudgetItemResult,
  BudgetsResult,
  PaceStatus,
  HealthScoreResult,
  SafeToSpendResult,
  DashboardData,
  MonthlyTrendPoint,
  ReportsData,
  TaxReportResult,
  CalendarEvent,
  CalendarResult,
  BankAccountsEngineResult,
} from "./types";

// ─── Net Worth Supporting Types ───────────────────────────────────────────

export type {
  NetWorthParams,
  Asset,
  Debt,
  InvestmentAccount,
  Holding,
  NetWorthSnapshot,
} from "./net-worth";

// ─── Adapter Exports ──────────────────────────────────────────────────────

export { plaidAdapter, mxAdapter, manualAdapter } from "./adapters";

// ─── Function Exports ──────────────────────────────────────────────────────

export {
  calculateMonthlyIncomeTotal,
  calculateIncomeForPeriod,
} from "./income";

export {
  calculateExpensesForPeriod,
} from "./expenses";

export {
  getNextBillOccurrence,
  getBillsForPeriod,
  calculateBillsForPeriod,
} from "./bills";

export {
  calculateSubscriptions,
} from "./subscriptions";

export {
  calculateNetWorth,
} from "./net-worth";

export {
  calculateDebtPayoff,
} from "./debts";

export {
  calculateInvestments,
} from "./investments";

export {
  calculateBudgets,
} from "./budgets";

export {
  calculateHealthScore,
} from "./health-score";

export {
  calculateSavingsGoals,
} from "./savings-goals";

export {
  calculateSafeToSpend,
} from "./safe-to-spend";
