// FEATURE: FINANCIAL_REPORTS | tier: free | limit: unlimited
// FEATURE: BUDGET_VS_ACTUAL | tier: free | limit: unlimited
// FEATURE: SPENDING_ANALYSIS | tier: free | limit: unlimited
// FEATURE: DATA_EXPORT_CSV | tier: free | limit: 5 exports/month
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Download,
  PieChart as PieChartIcon,
  DollarSign,
  ShoppingCart,
  Calendar,
  Wallet,
  CreditCard,
  ArrowUpDown,
  Receipt,
  Target,
  Clock,
  Building2,
  Sparkles,
  Loader2,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  addMonths,
  eachMonthOfInterval,
  parseISO,
  getDaysInMonth,
  eachDayOfInterval,
  getDay,
  addWeeks,
  isBefore,
  isAfter,
  isEqual,
  differenceInDays,
  startOfYear,
  endOfYear,
} from "date-fns";
import {
  type Expense,
  type Income,
  type Bill,
  type PlaidTransaction,
  EXPENSE_CATEGORIES,
} from "@shared/schema";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

const CATEGORY_COLORS: Record<string, string> = {
  Groceries: "#22c55e",
  "Restaurant & Bars": "#f97316",
  Transportation: "#3b82f6",
  Entertainment: "#a855f7",
  Shopping: "#ec4899",
  Healthcare: "#ef4444",
  Education: "#06b6d4",
  Gas: "#eab308",
  Utilities: "#14b8a6",
  Subscriptions: "#8b5cf6",
  Insurance: "#f43f5e",
  Other: "#6b7280",
};

// Calculate total monthly income accounting for recurrence
function calculateMonthlyIncomeTotal(inc: Income, monthStart: Date, monthEnd: Date): number {
  const amount = parseFloat(inc.amount);

  // Non-recurring income: check if the date is in this month
  if (inc.isRecurring !== "true") {
    const incomeDate = parseISO(inc.date);
    if (incomeDate >= monthStart && incomeDate <= monthEnd) {
      return amount;
    }
    return 0;
  }

  // For recurring income, calculate number of payments in the month
  const recurrence = inc.recurrence;

  if (recurrence === "custom" && inc.customDates) {
    try {
      const customDays: number[] = JSON.parse(inc.customDates);
      const daysInMonth = getDaysInMonth(monthStart);
      const validDays = customDays.filter(day => day <= daysInMonth);
      return amount * validDays.length;
    } catch {
      return amount;
    }
  }

  if (recurrence === "monthly") {
    return amount;
  }

  if (recurrence === "yearly") {
    const incomeDate = parseISO(inc.date);
    if (incomeDate.getMonth() === monthStart.getMonth()) {
      return amount;
    }
    return 0;
  }

  if (recurrence === "weekly") {
    const startDate = parseISO(inc.date);
    const dayOfWeek = getDay(startDate);
    let count = 0;
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    for (const day of allDays) {
      if (getDay(day) === dayOfWeek) {
        if (!isBefore(day, startDate) || isEqual(day, startDate)) {
          count++;
        }
      }
    }
    return amount * count;
  }

  if (recurrence === "biweekly") {
    const startDate = parseISO(inc.date);
    let count = 0;
    let payDate = startDate;
    while (isBefore(payDate, monthStart)) {
      payDate = addWeeks(payDate, 2);
    }
    while (!isAfter(payDate, monthEnd)) {
      if (!isBefore(payDate, monthStart)) {
        count++;
      }
      payDate = addWeeks(payDate, 2);
    }
    return amount * count;
  }

  return amount;
}

interface MergedExpense {
  id: string;
  merchant: string;
  amount: string;
  date: string;
  category: string;
  source: "manual" | "plaid";
}

function mergeExpensesWithTransactions(
  expenses: Expense[],
  plaidTransactions: PlaidTransaction[],
  monthStart: Date,
  monthEnd: Date
): MergedExpense[] {
  const merged: MergedExpense[] = [];
  const matchedExpenseIds = new Set<string>();

  // Collect expense IDs that are matched by Plaid transactions
  plaidTransactions.forEach((tx) => {
    if (tx.matchedExpenseId) {
      matchedExpenseIds.add(tx.matchedExpenseId);
    }
  });

  // Add manual expenses that aren't matched by Plaid transactions
  expenses.forEach((exp) => {
    const d = parseISO(exp.date);
    if (d >= monthStart && d <= monthEnd && !matchedExpenseIds.has(exp.id)) {
      merged.push({
        id: exp.id,
        merchant: exp.merchant,
        amount: exp.amount,
        date: exp.date,
        category: exp.category,
        source: "manual",
      });
    }
  });

  // Add Plaid transactions that are debits (positive amounts) within the month
  plaidTransactions.forEach((tx) => {
    const d = parseISO(tx.date);
    const amt = parseFloat(tx.amount);
    if (d >= monthStart && d <= monthEnd && amt > 0 && tx.pending !== "true") {
      merged.push({
        id: tx.id,
        merchant: tx.merchantName || tx.name,
        amount: tx.amount,
        date: tx.date,
        category: tx.personalCategory || tx.category || "Other",
        source: "plaid",
      });
    }
  });

  return merged;
}

function getPlaidIncomeForMonth(
  plaidTransactions: PlaidTransaction[],
  monthStart: Date,
  monthEnd: Date
): number {
  return plaidTransactions
    .filter((tx) => {
      const d = parseISO(tx.date);
      const amt = parseFloat(tx.amount);
      return d >= monthStart && d <= monthEnd && amt < 0 && tx.pending !== "true";
    })
    .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount)), 0);
}

type ReportView = "overview" | "top-merchants" | "income-vs-expenses" | "daily-spending" |
  "bill-summary" | "savings-rate" | "largest-transactions" | "category-trends" |
  "recurring-costs" | "yearly-summary" | "spending-by-day" | "predictive-forecast";

const CANNED_REPORTS: { id: ReportView; title: string; description: string; icon: any }[] = [
  { id: "overview", title: "Monthly Overview", description: "Income, expenses, and cash flow summary", icon: BarChart },
  { id: "top-merchants", title: "Top Merchants", description: "Where you spend the most money", icon: ShoppingCart },
  { id: "income-vs-expenses", title: "Income vs Expenses", description: "6-month income and spending comparison", icon: ArrowUpDown },
  { id: "daily-spending", title: "Daily Spending", description: "Average daily spending this month", icon: Calendar },
  { id: "bill-summary", title: "Bill Summary", description: "All recurring bills and their costs", icon: Receipt },
  { id: "savings-rate", title: "Savings Rate", description: "How much you save each month", icon: Target },
  { id: "largest-transactions", title: "Largest Transactions", description: "Your biggest expenses this month", icon: DollarSign },
  { id: "category-trends", title: "Category Trends", description: "Spending by category over 6 months", icon: PieChartIcon },
  { id: "recurring-costs", title: "Recurring Costs", description: "Monthly subscription and recurring totals", icon: Clock },
  { id: "yearly-summary", title: "Year-to-Date", description: "Full year income and expense totals", icon: Building2 },
  { id: "predictive-forecast", title: "Predictive Forecast", description: "AI-powered 12-month spending forecast", icon: Sparkles },
];

export default function ReportsPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [activeReport, setActiveReport] = useState<ReportView>("overview");

  const { data: expenses = [], isLoading: expensesLoading } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
  });

  const { data: income = [], isLoading: incomeLoading } = useQuery<Income[]>({
    queryKey: ["/api/income"],
  });

  const { data: bills = [], isLoading: billsLoading } = useQuery<Bill[]>({
    queryKey: ["/api/bills"],
  });

  const { data: plaidTransactions = [], isLoading: plaidLoading } = useQuery<PlaidTransaction[]>({
    queryKey: ["/api/plaid/transactions"],
  });

  const { data: forecastData, isLoading: forecastLoading, refetch: fetchForecast, isError: forecastError } = useQuery<{
    historical: { month: string; totalSpending: number; categories: Record<string, number> }[];
    forecast: { month: string; totalSpending: number; categories: Record<string, number> }[];
    insights: { category: string; trend: string; percentChange: number; insight: string }[];
    overallTrend: string;
    summary: string;
  }>({
    queryKey: ["/api/ai/forecast"],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/ai/forecast");
      return res.json();
    },
    enabled: activeReport === "predictive-forecast",
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const isLoading = expensesLoading || incomeLoading || billsLoading || plaidLoading;

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const prevMonthStart = startOfMonth(subMonths(currentMonth, 1));
  const prevMonthEnd = endOfMonth(subMonths(currentMonth, 1));

  // Merge manual expenses with Plaid transactions (avoiding double-counting)
  const monthExpenses = mergeExpensesWithTransactions(expenses, plaidTransactions, monthStart, monthEnd);
  const prevMonthExpenses = mergeExpensesWithTransactions(expenses, plaidTransactions, prevMonthStart, prevMonthEnd);

  // Calculate monthly bills total
  const monthlyBillsTotal = bills.reduce((sum, bill) => {
    const amount = parseFloat(bill.amount);
    if (bill.recurrence === "monthly") return sum + amount;
    if (bill.recurrence === "weekly") return sum + amount * 4;
    if (bill.recurrence === "biweekly") return sum + amount * 2;
    if (bill.recurrence === "yearly") return sum + amount / 12;
    return sum;
  }, 0);

  // Totals
  const totalExpenses = monthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  const prevTotalExpenses = prevMonthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

  // Calculate income: recurring income entries + Plaid credits
  const recurringIncome = income.reduce((sum, inc) => sum + calculateMonthlyIncomeTotal(inc, monthStart, monthEnd), 0);
  const plaidIncome = getPlaidIncomeForMonth(plaidTransactions, monthStart, monthEnd);
  const totalIncome = Math.max(recurringIncome, plaidIncome); // Use the higher of the two to avoid double-counting

  const netCashFlow = totalIncome - totalExpenses - monthlyBillsTotal;

  // Expense change percentage
  const expenseChange = prevTotalExpenses > 0
    ? ((totalExpenses - prevTotalExpenses) / prevTotalExpenses) * 100
    : 0;

  // Category breakdown
  const categoryTotals: Record<string, number> = {};
  monthExpenses.forEach((exp) => {
    categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + parseFloat(exp.amount);
  });

  const sortedCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a);

  // Last 6 months trend
  const last6Months = eachMonthOfInterval({
    start: subMonths(currentMonth, 5),
    end: currentMonth,
  });

  const monthlyTrend = last6Months.map((month) => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const mExpenses = mergeExpensesWithTransactions(expenses, plaidTransactions, start, end);
    const monthExp = mExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const monthRecurringInc = income.reduce((sum, inc) => sum + calculateMonthlyIncomeTotal(inc, start, end), 0);
    const monthPlaidInc = getPlaidIncomeForMonth(plaidTransactions, start, end);
    const monthInc = Math.max(monthRecurringInc, monthPlaidInc);

    return {
      month: format(month, "MMM"),
      expenses: monthExp,
      income: monthInc,
    };
  });

  const maxTrendValue = Math.max(
    ...monthlyTrend.flatMap((m) => [m.expenses, m.income]),
    1
  );

  // Export to CSV
  const exportToCSV = () => {
    const headers = ["Date", "Type", "Description", "Category", "Amount"];
    const rows: string[][] = [];

    monthExpenses.forEach((exp) => {
      rows.push([exp.date, "Expense", exp.merchant, exp.category, exp.amount]);
    });

    income.forEach((inc) => {
      rows.push([inc.date, "Income", inc.source, inc.category, inc.amount]);
    });

    rows.sort((a, b) => a[0].localeCompare(b[0]));

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `budget-report-${format(currentMonth, "yyyy-MM")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // === CANNED REPORT RENDERERS ===

  function renderTopMerchants() {
    const merchantTotals: Record<string, { total: number; count: number }> = {};
    monthExpenses.forEach((exp) => {
      const name = exp.merchant;
      if (!merchantTotals[name]) merchantTotals[name] = { total: 0, count: 0 };
      merchantTotals[name].total += parseFloat(exp.amount);
      merchantTotals[name].count++;
    });
    const sorted = Object.entries(merchantTotals).sort(([, a], [, b]) => b.total - a.total).slice(0, 10);

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Top 10 Merchants - {format(currentMonth, "MMMM yyyy")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No transactions this month</p>
          ) : (
            <div className="space-y-3">
              {sorted.map(([name, data], idx) => (
                <div key={name} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground w-6">#{idx + 1}</span>
                    <div>
                      <p className="font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground">{data.count} transaction(s)</p>
                    </div>
                  </div>
                  <p className="font-semibold">{formatCurrency(data.total)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderDailySpending() {
    const daysInMonth = getDaysInMonth(monthStart);
    const today = new Date();
    const daysElapsed = currentMonth.getMonth() === today.getMonth() && currentMonth.getFullYear() === today.getFullYear()
      ? today.getDate()
      : daysInMonth;
    const dailyAvg = daysElapsed > 0 ? totalExpenses / daysElapsed : 0;
    const projectedMonthly = dailyAvg * daysInMonth;

    // Daily breakdown
    const dailyTotals: Record<string, number> = {};
    monthExpenses.forEach((exp) => {
      const day = exp.date;
      dailyTotals[day] = (dailyTotals[day] || 0) + parseFloat(exp.amount);
    });
    const highestDay = Object.entries(dailyTotals).sort(([, a], [, b]) => b - a)[0];

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Daily Spending - {format(currentMonth, "MMMM yyyy")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Daily Average</p>
              <p className="text-2xl font-bold">{formatCurrency(dailyAvg)}</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Projected Monthly</p>
              <p className="text-2xl font-bold">{formatCurrency(projectedMonthly)}</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Highest Day</p>
              <p className="text-2xl font-bold">
                {highestDay ? formatCurrency(highestDay[1]) : "$0.00"}
              </p>
              {highestDay && <p className="text-xs text-muted-foreground">{format(parseISO(highestDay[0]), "MMM d")}</p>}
            </div>
          </div>
          <div className="space-y-1">
            {Object.entries(dailyTotals)
              .sort(([a], [b]) => a.localeCompare(b))
              .slice(-14)
              .map(([date, total]) => {
                const maxDaily = Math.max(...Object.values(dailyTotals), 1);
                return (
                  <div key={date} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-12">{format(parseISO(date), "MMM d")}</span>
                    <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500 rounded-full"
                        style={{ width: `${(total / maxDaily) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium w-16 text-right">{formatCurrency(total)}</span>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderBillSummary() {
    const billsByRecurrence: Record<string, Bill[]> = {};
    bills.forEach((bill) => {
      const key = bill.recurrence || "monthly";
      if (!billsByRecurrence[key]) billsByRecurrence[key] = [];
      billsByRecurrence[key].push(bill);
    });

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Bill Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bills.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No bills configured</p>
          ) : (
            <div className="space-y-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Total Monthly Bill Cost</p>
                <p className="text-3xl font-bold">{formatCurrency(monthlyBillsTotal)}</p>
                <p className="text-sm text-muted-foreground">{bills.length} active bills</p>
              </div>
              <div className="space-y-2">
                {bills
                  .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))
                  .map((bill) => (
                    <div key={bill.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="font-medium">{bill.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {bill.category} &middot; {bill.recurrence} &middot; due day {bill.dueDay}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(parseFloat(bill.amount))}</p>
                        <Badge variant="secondary" className="text-xs">{bill.recurrence}</Badge>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderSavingsRate() {
    const monthlyData = last6Months.map((month) => {
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const mExpenses = mergeExpensesWithTransactions(expenses, plaidTransactions, start, end);
      const monthExp = mExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const monthRecurringInc = income.reduce((sum, inc) => sum + calculateMonthlyIncomeTotal(inc, start, end), 0);
      const monthPlaidInc = getPlaidIncomeForMonth(plaidTransactions, start, end);
      const monthInc = Math.max(monthRecurringInc, monthPlaidInc);
      const totalSpend = monthExp + monthlyBillsTotal;
      const saved = monthInc - totalSpend;
      const rate = monthInc > 0 ? (saved / monthInc) * 100 : 0;

      return {
        month: format(month, "MMM"),
        income: monthInc,
        spent: totalSpend,
        saved,
        rate,
      };
    });

    const currentRate = monthlyData[monthlyData.length - 1]?.rate || 0;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Savings Rate - Last 6 Months
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center p-4 bg-muted rounded-lg mb-6">
            <p className="text-sm text-muted-foreground">Current Month Savings Rate</p>
            <p className={`text-3xl font-bold ${currentRate >= 0 ? "text-green-600" : "text-red-600"}`}>
              {currentRate.toFixed(1)}%
            </p>
          </div>
          <div className="space-y-3">
            {monthlyData.map((m) => (
              <div key={m.month} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{m.month}</span>
                  <span className={m.rate >= 0 ? "text-green-600" : "text-red-600"}>
                    {m.rate.toFixed(1)}% ({formatCurrency(m.saved)})
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${m.rate >= 0 ? "bg-green-500" : "bg-red-500"}`}
                    style={{ width: `${Math.min(Math.abs(m.rate), 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderLargestTransactions() {
    const sorted = [...monthExpenses]
      .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))
      .slice(0, 15);

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Largest Transactions - {format(currentMonth, "MMMM yyyy")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No transactions this month</p>
          ) : (
            <div className="space-y-2">
              {sorted.map((exp, idx) => (
                <div key={exp.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground w-6">#{idx + 1}</span>
                    <div>
                      <p className="font-medium">{exp.merchant}</p>
                      <p className="text-xs text-muted-foreground">
                        {exp.category} &middot; {format(parseISO(exp.date), "MMM d")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-red-600">{formatCurrency(parseFloat(exp.amount))}</p>
                    {exp.source === "plaid" && <Badge variant="outline" className="text-xs">Bank</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderCategoryTrends() {
    const topCategories = sortedCategories.slice(0, 6).map(([cat]) => cat);

    const trendData = last6Months.map((month) => {
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const mExpenses = mergeExpensesWithTransactions(expenses, plaidTransactions, start, end);
      const catData: Record<string, number> = {};
      mExpenses.forEach((exp) => {
        if (topCategories.includes(exp.category)) {
          catData[exp.category] = (catData[exp.category] || 0) + parseFloat(exp.amount);
        }
      });
      return { month: format(month, "MMM"), ...catData };
    });

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChartIcon className="h-5 w-5" />
            Category Trends - Last 6 Months
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topCategories.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No expense data available</p>
          ) : (
            <div className="space-y-4">
              {topCategories.map((cat) => (
                <div key={cat} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] || "#6b7280" }} />
                    <span className="text-sm font-medium">{cat}</span>
                  </div>
                  <div className="flex items-end gap-1 h-12">
                    {trendData.map((m, i) => {
                      const val = (m as any)[cat] || 0;
                      const maxCat = Math.max(...trendData.map((d) => (d as any)[cat] || 0), 1);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center">
                          <div
                            className="w-full rounded-t"
                            style={{
                              height: `${(val / maxCat) * 100}%`,
                              minHeight: val > 0 ? "4px" : "0px",
                              backgroundColor: CATEGORY_COLORS[cat] || "#6b7280",
                            }}
                            title={`${m.month}: ${formatCurrency(val)}`}
                          />
                          <span className="text-[10px] text-muted-foreground mt-0.5">{m.month}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderRecurringCosts() {
    const monthlyBills = bills.filter((b) => b.recurrence === "monthly");
    const weeklyBills = bills.filter((b) => b.recurrence === "weekly");
    const biweeklyBills = bills.filter((b) => b.recurrence === "biweekly");
    const yearlyBills = bills.filter((b) => b.recurrence === "yearly");

    const monthlyTotal = monthlyBills.reduce((s, b) => s + parseFloat(b.amount), 0);
    const weeklyMonthly = weeklyBills.reduce((s, b) => s + parseFloat(b.amount) * 4, 0);
    const biweeklyMonthly = biweeklyBills.reduce((s, b) => s + parseFloat(b.amount) * 2, 0);
    const yearlyMonthly = yearlyBills.reduce((s, b) => s + parseFloat(b.amount) / 12, 0);
    const annualTotal = monthlyBillsTotal * 12;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recurring Costs Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">Monthly Cost</p>
              <p className="text-xl font-bold">{formatCurrency(monthlyBillsTotal)}</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">Annual Cost</p>
              <p className="text-xl font-bold">{formatCurrency(annualTotal)}</p>
            </div>
          </div>
          <div className="space-y-3">
            {monthlyBills.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Monthly ({formatCurrency(monthlyTotal)}/mo)</p>
                <div className="pl-3 space-y-1">
                  {monthlyBills.map((b) => (
                    <div key={b.id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{b.name}</span>
                      <span>{formatCurrency(parseFloat(b.amount))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {weeklyBills.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Weekly ({formatCurrency(weeklyMonthly)}/mo)</p>
                <div className="pl-3 space-y-1">
                  {weeklyBills.map((b) => (
                    <div key={b.id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{b.name}</span>
                      <span>{formatCurrency(parseFloat(b.amount))}/wk</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {biweeklyBills.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Bi-weekly ({formatCurrency(biweeklyMonthly)}/mo)</p>
                <div className="pl-3 space-y-1">
                  {biweeklyBills.map((b) => (
                    <div key={b.id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{b.name}</span>
                      <span>{formatCurrency(parseFloat(b.amount))}/2wk</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {yearlyBills.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Yearly ({formatCurrency(yearlyMonthly)}/mo)</p>
                <div className="pl-3 space-y-1">
                  {yearlyBills.map((b) => (
                    <div key={b.id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{b.name}</span>
                      <span>{formatCurrency(parseFloat(b.amount))}/yr</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderYearlySummary() {
    const yearStart = startOfYear(currentMonth);
    const yearEnd = endOfYear(currentMonth);
    const months = eachMonthOfInterval({ start: yearStart, end: currentMonth });

    let ytdIncome = 0;
    let ytdExpenses = 0;
    const monthlyData = months.map((month) => {
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const mExpenses = mergeExpensesWithTransactions(expenses, plaidTransactions, start, end);
      const monthExp = mExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const monthRecurringInc = income.reduce((sum, inc) => sum + calculateMonthlyIncomeTotal(inc, start, end), 0);
      const monthPlaidInc = getPlaidIncomeForMonth(plaidTransactions, start, end);
      const monthInc = Math.max(monthRecurringInc, monthPlaidInc);
      ytdIncome += monthInc;
      ytdExpenses += monthExp;
      return { month: format(month, "MMM"), income: monthInc, expenses: monthExp };
    });

    const ytdBills = monthlyBillsTotal * months.length;
    const ytdNet = ytdIncome - ytdExpenses - ytdBills;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Year-to-Date Summary - {format(currentMonth, "yyyy")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">YTD Income</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(ytdIncome)}</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">YTD Expenses</p>
              <p className="text-lg font-bold text-red-600">{formatCurrency(ytdExpenses)}</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">YTD Bills</p>
              <p className="text-lg font-bold">{formatCurrency(ytdBills)}</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">YTD Net</p>
              <p className={`text-lg font-bold ${ytdNet >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(ytdNet)}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {monthlyData.map((m) => (
              <div key={m.month} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-8">{m.month}</span>
                <div className="flex-1 flex gap-1 h-5">
                  <div
                    className="bg-green-500 rounded-sm"
                    style={{ width: `${(m.income / Math.max(ytdIncome / months.length * 2, 1)) * 50}%` }}
                    title={`Income: ${formatCurrency(m.income)}`}
                  />
                  <div
                    className="bg-red-500 rounded-sm"
                    style={{ width: `${(m.expenses / Math.max(ytdExpenses / months.length * 2, 1)) * 50}%` }}
                    title={`Expenses: ${formatCurrency(m.expenses)}`}
                  />
                </div>
                <span className="text-xs w-20 text-right">
                  <span className="text-green-600">{formatCurrency(m.income)}</span>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderIncomeVsExpenses() {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpDown className="h-5 w-5" />
            Income vs Expenses - 6 Month Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 h-48">
            {monthlyTrend.map((month, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="flex-1 w-full flex items-end gap-1">
                  <div
                    className="flex-1 bg-green-500 rounded-t transition-all"
                    style={{
                      height: maxTrendValue > 0 ? `${(month.income / maxTrendValue) * 100}%` : "0%",
                      minHeight: month.income > 0 ? "4px" : "0px",
                    }}
                    title={`Income: ${formatCurrency(month.income)}`}
                  />
                  <div
                    className="flex-1 bg-red-500 rounded-t transition-all"
                    style={{
                      height: maxTrendValue > 0 ? `${(month.expenses / maxTrendValue) * 100}%` : "0%",
                      minHeight: month.expenses > 0 ? "4px" : "0px",
                    }}
                    title={`Expenses: ${formatCurrency(month.expenses)}`}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{month.month}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span>Income</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-500" />
              <span>Expenses</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4 text-center">
            {monthlyTrend.slice(-3).map((m) => (
              <div key={m.month} className="p-2 bg-muted rounded">
                <p className="text-xs text-muted-foreground">{m.month}</p>
                <p className="text-sm font-medium text-green-600">{formatCurrency(m.income)}</p>
                <p className="text-sm font-medium text-red-600">{formatCurrency(m.expenses)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderPredictiveForecast() {
    if (forecastLoading) {
      return (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-medium">Analyzing your spending patterns...</p>
                <p className="text-sm text-muted-foreground">AI is forecasting the next 12 months</p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (forecastError || !forecastData) {
      return (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Sparkles className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">Unable to generate forecast</p>
                <p className="text-sm text-muted-foreground">
                  At least 3 months of spending data is required. Connect a bank account and sync transactions.
                </p>
              </div>
              <Button variant="outline" onClick={() => fetchForecast()}>
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    const { historical, forecast, insights, summary } = forecastData;
    const allMonths = [...historical, ...forecast];
    const maxSpending = Math.max(...allMonths.map(m => m.totalSpending), 1);

    return (
      <div className="space-y-6">
        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Spending Forecast
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{summary}</p>
          </CardContent>
        </Card>

        {/* Chart: Historical vs Forecast */}
        <Card>
          <CardHeader>
            <CardTitle>12-Month Historical vs 12-Month Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-64 relative">
              {/* Divider line between historical and forecast */}
              {historical.length > 0 && (
                <div
                  className="absolute top-0 bottom-0 border-l-2 border-dashed border-muted-foreground/40 z-10"
                  style={{ left: `${(historical.length / allMonths.length) * 100}%` }}
                >
                  <span className="absolute -top-0 left-1 text-xs text-muted-foreground bg-background px-1">Today</span>
                </div>
              )}
              {allMonths.map((m, i) => {
                const isForecasted = i >= historical.length;
                const barHeight = maxSpending > 0 ? (m.totalSpending / maxSpending) * 100 : 0;
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div className="flex-1 w-full flex items-end justify-center">
                      <div
                        className={`w-full max-w-[24px] rounded-t transition-all ${
                          isForecasted
                            ? "bg-primary/40 border border-dashed border-primary"
                            : "bg-primary"
                        }`}
                        style={{
                          height: `${barHeight}%`,
                          minHeight: m.totalSpending > 0 ? "4px" : "0px",
                        }}
                        title={`${m.month}: ${formatCurrency(m.totalSpending)}${isForecasted ? " (forecast)" : ""}`}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground truncate w-full text-center">
                      {m.month.substring(5)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center gap-6 mt-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-primary" />
                <span>Historical</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-primary/40 border border-dashed border-primary" />
                <span>Forecast</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Category Insights */}
        {insights.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Category Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {insights.map((insight) => (
                  <div
                    key={insight.category}
                    className="flex items-start gap-3 p-3 rounded-lg border"
                  >
                    <div className="mt-0.5">
                      {insight.trend === "increasing" ? (
                        <TrendingUp className="h-4 w-4 text-red-500" />
                      ) : insight.trend === "decreasing" ? (
                        <TrendingDown className="h-4 w-4 text-green-500" />
                      ) : (
                        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{insight.category}</span>
                        <Badge
                          variant={insight.trend === "increasing" ? "destructive" : insight.trend === "decreasing" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {insight.percentChange > 0 ? "+" : ""}{insight.percentChange.toFixed(0)}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{insight.insight}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Forecast Details Table */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Forecast Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="grid gap-2">
                {forecast.map((m) => {
                  const topCategories = Object.entries(m.categories)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3);
                  return (
                    <div key={m.month} className="flex items-center justify-between p-2 rounded border">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium min-w-[60px]">{m.month}</span>
                        <span className="text-sm font-semibold">{formatCurrency(m.totalSpending)}</span>
                      </div>
                      <div className="flex gap-2">
                        {topCategories.map(([cat, amt]) => (
                          <Badge key={cat} variant="outline" className="text-xs">
                            {cat}: {formatCurrency(amt)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderActiveReport() {
    switch (activeReport) {
      case "top-merchants": return renderTopMerchants();
      case "income-vs-expenses": return renderIncomeVsExpenses();
      case "daily-spending": return renderDailySpending();
      case "bill-summary": return renderBillSummary();
      case "savings-rate": return renderSavingsRate();
      case "largest-transactions": return renderLargestTransactions();
      case "category-trends": return renderCategoryTrends();
      case "recurring-costs": return renderRecurringCosts();
      case "yearly-summary": return renderYearlySummary();
      case "predictive-forecast": return renderPredictiveForecast();
      default: return null;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
            <HelpTooltip
              title="About Reports"
              content="Detailed analytics about your income, expenses, and financial trends over time. View monthly and yearly breakdowns, compare spending across categories, and export your data for external use."
            />
          </div>
          <p className="text-muted-foreground">Analyze your spending patterns</p>
        </div>
        <Button variant="outline" onClick={exportToCSV}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-lg font-semibold min-w-[150px] text-center">
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Income
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalIncome)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Expenses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(totalExpenses)}</p>
                <div className="flex items-center gap-1 text-sm mt-1">
                  {expenseChange > 0 ? (
                    <>
                      <TrendingUp className="h-4 w-4 text-red-500" />
                      <span className="text-red-500">+{expenseChange.toFixed(1)}%</span>
                    </>
                  ) : expenseChange < 0 ? (
                    <>
                      <TrendingDown className="h-4 w-4 text-green-500" />
                      <span className="text-green-500">{expenseChange.toFixed(1)}%</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">No change</span>
                  )}
                  <span className="text-muted-foreground">vs last month</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Monthly Bills
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(monthlyBillsTotal)}</p>
                <p className="text-sm text-muted-foreground">recurring</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Net Cash Flow
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${netCashFlow >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(netCashFlow)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {netCashFlow >= 0 ? "surplus" : "deficit"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Report Selector */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Reports</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {CANNED_REPORTS.map((report) => (
                <Button
                  key={report.id}
                  variant={activeReport === report.id ? "default" : "outline"}
                  className="h-auto py-3 flex flex-col items-center gap-1 text-center"
                  onClick={() => setActiveReport(report.id)}
                >
                  <report.icon className="h-4 w-4" />
                  <span className="text-xs leading-tight">{report.title}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Active Report Content */}
          {activeReport === "overview" ? (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Category Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChartIcon className="h-5 w-5" />
                    Spending by Category
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {sortedCategories.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">
                      No expenses this month
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {sortedCategories.map(([category, amount]) => {
                        const percentage = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
                        return (
                          <div key={category} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: CATEGORY_COLORS[category] || "#6b7280" }}
                                />
                                {category}
                              </span>
                              <span className="font-medium">{formatCurrency(amount)}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${percentage}%`,
                                  backgroundColor: CATEGORY_COLORS[category] || "#6b7280",
                                }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground text-right">
                              {percentage.toFixed(1)}%
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Monthly Trend */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart className="h-5 w-5" />
                    6-Month Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-2 h-48">
                    {monthlyTrend.map((month, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className="flex-1 w-full flex items-end gap-1">
                          <div
                            className="flex-1 bg-green-500 rounded-t transition-all"
                            style={{
                              height: maxTrendValue > 0 ? `${(month.income / maxTrendValue) * 100}%` : "0%",
                              minHeight: month.income > 0 ? "4px" : "0px",
                            }}
                            title={`Income: ${formatCurrency(month.income)}`}
                          />
                          <div
                            className="flex-1 bg-red-500 rounded-t transition-all"
                            style={{
                              height: maxTrendValue > 0 ? `${(month.expenses / maxTrendValue) * 100}%` : "0%",
                              minHeight: month.expenses > 0 ? "4px" : "0px",
                            }}
                            title={`Expenses: ${formatCurrency(month.expenses)}`}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{month.month}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center gap-6 mt-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-green-500" />
                      <span>Income</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-red-500" />
                      <span>Expenses</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            renderActiveReport()
          )}

          {/* Top Expenses (always shown in overview) */}
          {activeReport === "overview" && (
            <Card>
              <CardHeader>
                <CardTitle>Top Expenses This Month</CardTitle>
              </CardHeader>
              <CardContent>
                {monthExpenses.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    No expenses this month
                  </p>
                ) : (
                  <div className="space-y-2">
                    {[...monthExpenses]
                      .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))
                      .slice(0, 5)
                      .map((exp) => (
                        <div
                          key={exp.id}
                          className="flex items-center justify-between py-2 border-b last:border-0"
                        >
                          <div>
                            <p className="font-medium">{exp.merchant}</p>
                            <p className="text-sm text-muted-foreground">
                              {exp.category} - {format(parseISO(exp.date), "MMM d")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-red-600">
                              {formatCurrency(parseFloat(exp.amount))}
                            </p>
                            {exp.source === "plaid" && <Badge variant="outline" className="text-xs">Bank</Badge>}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
