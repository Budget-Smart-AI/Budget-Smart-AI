/**
 * Financial Engine — Type Definitions
 *
 * Central type definitions for all financial calculations.
 * These types define the API contract between the engine and the client.
 */

// ─── Precision Helpers ─────────────────────────────────────────────────────

/** All monetary amounts in the engine are in cents (integers) to avoid floating-point drift */
export type Cents = number;

// ─── Date Range ────────────────────────────────────────────────────────────

export interface DateRange {
  start: string; // yyyy-MM-dd
  end: string;   // yyyy-MM-dd
}

// ─── Income ────────────────────────────────────────────────────────────────

/**
 * Confidence the engine has in a projected (future-month) source amount.
 *  - "high"   — Fixed-mode source backed by an active income_source_amounts row
 *               and historical actuals match the unit amount within 5%.
 *  - "medium" — Variable-mode source projected from rolling avg, OR fixed-mode
 *               source whose history shows >5% drift but is internally
 *               consistent (raise / tax change recently).
 *  - "low"    — Detected pattern only (no registry row), or registry mode
 *               irregular/variable with thin history.
 *  - "none"   — Past/current actuals; no projection involved.
 */
export type IncomeProjectionConfidence = "high" | "medium" | "low" | "none";

export type IncomeSourceMode = "fixed" | "variable" | "irregular";

export interface IncomeBySourceEntry {
  source: string;
  /**
   * Display amount for the row. For past/current months this is the sum of
   * actual deposits in the window. For future months it's the projected
   * total computed from the registry (unit_amount × occurrences).
   */
  amount: number;
  category: string;
  isRecurring: boolean;
  frequency?: string;
  /** Registry classification mode, when the source has a registry entry. */
  mode?: IncomeSourceMode;
  /** Confidence in the displayed amount (only meaningful for projections). */
  confidence?: IncomeProjectionConfidence;
  /**
   * What the engine *expected* to see this month based on the registry
   * (unit_amount × occurrences). Surfaced separately from `amount` so the
   * Income page can show a side-by-side actual-vs-expected comparison
   * without losing the actual.
   */
  expectedAmount?: number;
  /** Per-paycheck amount taken from the active income_source_amounts row. */
  unitAmount?: number;
  /** Number of paycheck dates the cadence engine projected for this month. */
  expectedOccurrences?: number;
  /** Number of qualifying deposits actually observed for this month. */
  actualOccurrences?: number;
}

export interface IncomeResult {
  /** Total monthly income from user-entered recurring/one-time income records */
  budgetedIncome: number;
  /** Total deposits detected from bank transactions (any connected provider) */
  actualIncome: number;
  /** Which to use for display — actual if bank data exists, else budgeted */
  effectiveIncome: number;
  /** Whether we have real bank data to compare against */
  hasBankData: boolean;
  /** Breakdown by income source */
  bySource: IncomeBySourceEntry[];
}

// ─── Expenses ──────────────────────────────────────────────────────────────

export interface ExpenseResult {
  /** Total expenses for the period (deduplicated, transfer-excluded) */
  total: number;
  /** Count of expense transactions */
  count: number;
  /** Previous period total for MoM comparison */
  previousTotal: number;
  /** Month-over-month change percentage */
  momChangePercent: number;
  /** Spending by category */
  byCategory: Record<string, number>;
  /** Top 5 spending categories sorted by amount */
  topCategories: Array<{ category: string; amount: number; percentage: number }>;
  /** Top merchants by spending */
  topMerchants: Array<{ merchant: string; amount: number; count: number }>;
  /** Average daily spending */
  dailyAverage: number;
  /** Projected full-month spending based on daily average */
  projectedMonthly: number;
  /** Daily spending totals */
  dailyTotals: Record<string, number>;
}

// ─── Bills ─────────────────────────────────────────────────────────────────

export interface BillOccurrence {
  billId: string;
  billName: string;
  amount: number;
  category: string;
  dueDate: string;     // yyyy-MM-dd
  recurrence: string;
  isPaused: boolean;
}

export interface BillsResult {
  /** Bills due in the current month with exact occurrences */
  thisMonthBills: BillOccurrence[];
  /** Total amount of bills due this month */
  thisMonthTotal: number;
  /** Bills due in the next 30 days */
  upcomingBills: Array<BillOccurrence & { daysUntil: number }>;
  /** Estimated monthly bills total (annualized) */
  monthlyEstimate: number;
  /** Estimated annual bills total */
  annualEstimate: number;
  /** Monthly-equivalent totals broken down by recurrence type (weekly, biweekly, monthly, yearly) */
  byRecurrence: Record<string, number>;
}

// ─── Subscriptions ─────────────────────────────────────────────────────────

export interface SubscriptionsResult {
  /** Active subscriptions (non-paused bills) */
  active: BillOccurrence[];
  /** Paused subscriptions */
  paused: BillOccurrence[];
  /** Total monthly cost (normalized from various recurrences) */
  monthlyTotal: number;
  /** Total yearly cost */
  yearlyTotal: number;
  /** Subscriptions renewing within 7 days */
  upcomingRenewals: Array<BillOccurrence & { daysUntil: number }>;
  /** Count of auto-detected subscriptions */
  autoDetectedCount: number;
}

// ─── Cash Flow ─────────────────────────────────────────────────────────────

export interface CashFlowResult {
  /** Actual cash flow from bank: deposits - withdrawals */
  realCashFlow: number;
  /** Actual bank deposits (income) */
  realIncome: number;
  /** Actual bank withdrawals (spending) */
  realSpending: number;
  /** Planned cash flow: budgeted income - budgeted spending - estimated bills */
  plannedCashFlow: number;
  /** Planned savings: budgeted income - budgeted spending - monthly bills */
  plannedSavings: number;
}

// ─── Net Worth ─────────────────────────────────────────────────────────────

export interface NetWorthResult {
  /** Total net worth = assets - liabilities */
  netWorth: number;
  /** Total assets (bank accounts + investments + real estate + vehicles + other) */
  totalAssets: number;
  /** Total liabilities (credit cards + loans + mortgages + other debts) */
  totalLiabilities: number;
  /** Asset percentage of combined total */
  assetPercent: number;
  /** Net worth change from most recent snapshot */
  latestChange: number;
  /** Breakdown by asset/liability type */
  assetBreakdown: Record<string, number>;
  liabilityBreakdown: Record<string, number>;
}

// ─── Debts ─────────────────────────────────────────────────────────────────

export interface DebtItem {
  id: string;
  name: string;
  balance: number;
  interestRate: number; // APR as percentage
  minimumPayment: number; // Monthly
  category: string;
  /** The originating provider — use string for extensibility (new aggregators don't require type changes) */
  source: string;
}

export interface DebtPayoffScheduleEntry {
  month: number;
  date: string;
  payment: number;
  principal: number;
  interest: number;
  remainingBalance: number;
}

export interface DebtPayoffResult {
  totalDebt: number;
  totalMinPayments: number;
  weightedAvgApr: number;
  /** Avalanche strategy result (highest interest first) */
  avalanche: {
    months: number;
    totalInterest: number;
    totalPaid: number;
    payoffOrder: string[];
    schedule: DebtPayoffScheduleEntry[];
  };
  /** Snowball strategy result (smallest balance first) */
  snowball: {
    months: number;
    totalInterest: number;
    totalPaid: number;
    payoffOrder: string[];
    schedule: DebtPayoffScheduleEntry[];
  };
  /** Interest saved by using avalanche vs snowball */
  interestSaved: number;
  /** Projected payoff date (based on selected strategy) */
  payoffDate: string;
}

// ─── Investments ───────────────────────────────────────────────────────────

export interface InvestmentsResult {
  /** Total portfolio value across all accounts */
  totalValue: number;
  /** Total cost basis */
  totalCost: number;
  /** Total gain/loss in dollars */
  totalGain: number;
  /** Percentage gain/loss */
  gainPercent: number;
}

// ─── Savings Goals ─────────────────────────────────────────────────────────

export interface SavingsGoalsResult {
  /** Total saved across all goals */
  totalSaved: number;
  /** Total target across all goals */
  totalTarget: number;
  /** Overall progress percentage */
  overallProgress: number;
  /** Per-goal breakdown */
  goals: Array<{
    id: string;
    name: string;
    current: number;
    target: number;
    percentage: number;
    remaining: number;
    isComplete: boolean;
    daysLeft: number | null;
  }>;
}

// ─── Budgets ───────────────────────────────────────────────────────────────

export type PaceStatus = 'under' | 'on-pace' | 'over-pace' | 'over-budget';

export interface BudgetItemResult {
  category: string;
  budgetAmount: number;
  spent: number;
  percentage: number;
  paceStatus: PaceStatus;
  paceLabel: string;
  projectedSpend: number;
}

export interface BudgetsResult {
  /** Per-category budget vs actual */
  items: BudgetItemResult[];
  /** Total budgeted amount */
  totalBudget: number;
  /** Total spent */
  totalSpent: number;
  /** Overall percentage */
  overallPercentage: number;
  /** Health counts */
  healthCounts: { overBudget: number; overPace: number; onPace: number; under: number };
  /** Month progress (0-1) */
  monthProgress: number;
}

// ─── Financial Health Score ────────────────────────────────────────────────

export interface HealthScoreResult {
  /** Overall score 0-100 */
  totalScore: number;
  /** Component scores (each 0-25) */
  savingsRateScore: number;
  budgetScore: number;
  savingsGoalScore: number;
  billScore: number;
  /** Underlying metrics */
  savingsRate: number;
  budgetCount: number;
  billCount: number;
  avgGoalProgress: number;
}

// ─── Safe to Spend ─────────────────────────────────────────────────────────

export interface SafeToSpendResult {
  /** Amount remaining after bills and committed expenses */
  safeToSpend: number;
  /** Daily allowance for remaining days in month */
  dailyAllowance: number;
  /** Days remaining in month */
  daysRemaining: number;
}

// ─── Dashboard Aggregate ───────────────────────────────────────────────────

export interface DashboardData {
  income: IncomeResult;
  expenses: ExpenseResult;
  bills: BillsResult;
  cashFlow: CashFlowResult;
  netWorth: NetWorthResult;
  savingsGoals: SavingsGoalsResult;
  healthScore: HealthScoreResult;
  safeToSpend: SafeToSpendResult;
  /** Plan vs Reality gap analysis */
  gaps: {
    incomeGap: number;   // actual - budgeted (positive = over plan)
    spendingGap: number; // actual - budgeted (positive = over budget)
    savingsGap: number;  // actual savings - planned (positive = ahead)
  };
  /** Alert conditions */
  alerts: {
    negativeCashFlow: boolean;
    budgetOverage: boolean;
    budgetOveragePercent: number;
    planVsRealityMismatch: boolean;
  };
}

// ─── Reports ───────────────────────────────────────────────────────────────

export interface MonthlyTrendPoint {
  month: string; // "Jan", "Feb", etc.
  monthKey: string; // "yyyy-MM"
  expenses: number;
  income: number;
  savings: number;
  savingsRate: number;
}

export interface ReportsData {
  /** Current month summary */
  currentMonth: {
    totalExpenses: number;
    totalIncome: number;
    netCashFlow: number;
    monthlyBillsTotal: number;
    expenseChange: number; // MoM percentage
  };
  /** Category breakdown */
  categoryTotals: Record<string, number>;
  /** Last 6 months trend */
  monthlyTrend: MonthlyTrendPoint[];
  /** Daily spending for current month */
  dailySpending: {
    dailyAvg: number;
    projectedMonthly: number;
    dailyTotals: Record<string, number>;
  };
  /** Top merchants */
  topMerchants: Array<{ merchant: string; total: number; count: number }>;
  /** YTD summary */
  ytd: {
    income: number;
    expenses: number;
    bills: number;
    net: number;
  };
}

// ─── Bank Accounts Summary ────────────────────────────────────────────────

export interface BankAccountsEngineResult {
  /** Net worth: total assets minus total liabilities */
  totalBalance: number;
  /** Total asset account balances (checking, savings, investments) */
  totalAssets: number;
  /** Total liability account balances (mortgages, credit cards, LOC, loans) */
  totalLiabilities: number;
  /** Total spending from transactions this month */
  monthlySpending: number;
  /** Total income from transactions this month */
  monthlyIncome: number;
  /** Count of transactions not yet matched to income/expense records */
  unmatchedCount: number;
}

// ─── Tax Report ────────────────────────────────────────────────────────────

/**
 * @deprecated Use TaxSummaryResult from ./tax.ts instead.
 * Kept for backwards compatibility with any existing consumers.
 */
export interface TaxReportResult {
  /** Total tax-deductible expenses */
  totalDeductible: number;
  /** Business expenses only */
  totalBusiness: number;
  /** Estimated tax savings at the user's marginal rate */
  estimatedSavings: number;
  /** Breakdown by tax category */
  byCategory: Array<{ category: string; total: number; count: number }>;
}

// ─── Calendar Events ─────────────────────────────────────────────────────�