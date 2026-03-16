import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  DollarSign, Receipt, CreditCard, Calendar, TrendingUp, TrendingDown, 
  Wallet, AlertTriangle, PiggyBank, Target, Sparkles, Brain, ChevronRight,
  Building2, ArrowRight, Info, CircleDollarSign, AlertCircle, Home, Smartphone,
  UtensilsCrossed, ShoppingCart, Car, Lightbulb, Tv, ShoppingBag, Heart, Shield, X,
  BarChart3, ShieldAlert, type LucideIcon
} from "lucide-react";
import { format, addMonths, setDate, isBefore, isAfter, addDays, parseISO, startOfMonth, endOfMonth, getDaysInMonth, eachDayOfInterval, getDay, addWeeks, isEqual, setDay } from "date-fns";
import type { Bill, Income, Budget, SavingsGoal } from "@shared/schema";
import { FinancialHealthScore } from "@/components/financial-health-score";
import { CashFlowForecast } from "@/components/cash-flow-forecast";
import { SmartSavings } from "@/components/smart-savings";
import { MoneyTimeline } from "@/components/money-timeline";
import { MoneyLeaksWidget } from "@/components/money-leaks-widget";
import { SpendabilityWidget } from "@/components/spendability-widget";
import { UsageSummaryWidget } from "@/components/UsageSummaryWidget";
import { FeatureGate } from "@/components/FeatureGate";
import { Link } from "wouter";

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function getNextDueDate(dueDay: number, recurrence: string, customDates?: string | null, startDate?: string | null): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (recurrence === "one_time") {
    if (startDate) {
      return parseISO(startDate);
    }
    let nextDue = setDate(today, dueDay);
    if (isBefore(nextDue, today)) {
      nextDue = addMonths(nextDue, 1);
    }
    return nextDue;
  }

  if (recurrence === "custom" && customDates) {
    try {
      const dates: string[] = JSON.parse(customDates);
      const futureDates = dates
        .map(d => parseISO(d))
        .filter(d => !isBefore(d, today))
        .sort((a, b) => a.getTime() - b.getTime());
      if (futureDates.length > 0) {
        return futureDates[0];
      }
      const allDates = dates.map(d => parseISO(d)).sort((a, b) => b.getTime() - a.getTime());
      return allDates[0] || today;
    } catch {
      return today;
    }
  }

  if (recurrence === "weekly") {
    let nextDue = setDay(today, dueDay, { weekStartsOn: 0 });
    if (isBefore(nextDue, today) || nextDue.getTime() === today.getTime()) {
      nextDue = addWeeks(nextDue, 1);
    }
    return nextDue;
  }

  let nextDue = setDate(today, dueDay);

  if (isBefore(nextDue, today)) {
    if (recurrence === "monthly") {
      nextDue = addMonths(nextDue, 1);
    } else if (recurrence === "yearly") {
      nextDue = addMonths(nextDue, 12);
    } else if (recurrence === "biweekly") {
      while (isBefore(nextDue, today)) {
        nextDue = addDays(nextDue, 14);
      }
    }
  }

  return nextDue;
}

function calculateMonthlyIncomeTotal(income: Income, monthStart: Date, monthEnd: Date): number {
  const amount = parseFloat(income.amount);

  if (income.isRecurring !== "true") {
    const incomeDate = parseISO(income.date);
    if (incomeDate >= monthStart && incomeDate <= monthEnd) {
      return amount;
    }
    return 0;
  }

  const recurrence = income.recurrence;

  if (recurrence === "custom" && income.customDates) {
    try {
      const customDays: number[] = JSON.parse(income.customDates);
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
    const incomeDate = parseISO(income.date);
    if (incomeDate.getMonth() === monthStart.getMonth()) {
      return amount;
    }
    return 0;
  }

  if (recurrence === "weekly") {
    const startDate = parseISO(income.date);
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
    const startDate = parseISO(income.date);
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

// Section Header Component
function SectionHeader({ 
  title, 
  subtitle, 
  icon: Icon, 
  variant 
}: { 
  title: string; 
  subtitle: string; 
  icon: React.ElementType; 
  variant: "real" | "plan";
}) {
  const colors = variant === "real" 
    ? "from-red-500 to-orange-500" 
    : "from-emerald-500 to-teal-500";
  
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`p-2 rounded-lg bg-gradient-to-br ${colors}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

// Data Source Label Component
function DataSourceLabel({ type }: { type: "bank" | "plan" }) {
  return (
    <Badge 
      variant="outline" 
      className={`text-[10px] gap-1 ${
        type === "bank" 
          ? "border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30" 
          : "border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
      }`}
    >
      {type === "bank" ? <Building2 className="h-2.5 w-2.5" /> : <Target className="h-2.5 w-2.5" />}
      {type === "bank" ? "From linked accounts" : "From your budget plan"}
    </Badge>
  );
}

// Real Cash Flow Stat Card
function RealCashFlowCard({
  title,
  value,
  icon: Icon,
  description,
  isLoading,
  isNegative = false,
  isWarning = false,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  description: string;
  isLoading: boolean;
  isNegative?: boolean;
  isWarning?: boolean;
}) {
  return (
    <Card className={`relative overflow-visible border ${
      isWarning ? "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20" : ""
    }`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 px-4 pt-4">
        <CardTitle className="text-xs font-medium text-muted-foreground truncate">
          {title}
        </CardTitle>
        <div className={`flex h-7 w-7 items-center justify-center rounded-md shrink-0 ${
          isNegative ? "bg-red-100 dark:bg-red-950/50" : "bg-orange-100 dark:bg-orange-950/50"
        }`}>
          <Icon className={`h-3.5 w-3.5 ${isNegative ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400"}`} />
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {isLoading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <div className={`text-xl font-bold truncate ${
            isNegative ? "text-red-600 dark:text-red-400" : ""
          }`}>{value}</div>
        )}
        <p className="text-[10px] text-muted-foreground mt-1 truncate">{description}</p>
      </CardContent>
    </Card>
  );
}

// Plan Stat Card
function PlanStatCard({
  title,
  value,
  icon: Icon,
  description,
  isLoading,
  variant = "default",
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  description: string;
  isLoading: boolean;
  variant?: "income" | "spending" | "savings" | "default";
}) {
  const colors = {
    income: "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400",
    spending: "bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400",
    savings: "bg-teal-100 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400",
    default: "bg-muted text-muted-foreground",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 px-4 pt-4">
        <CardTitle className="text-xs font-medium text-muted-foreground truncate">
          {title}
        </CardTitle>
        <div className={`flex h-7 w-7 items-center justify-center rounded-md shrink-0 ${colors[variant]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {isLoading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <div className={`text-xl font-bold truncate ${
            variant === "income" ? "text-emerald-600 dark:text-emerald-400" :
            variant === "savings" ? "text-teal-600 dark:text-teal-400" : ""
          }`}>{value}</div>
        )}
        <p className="text-[10px] text-muted-foreground mt-1 truncate">{description}</p>
      </CardContent>
    </Card>
  );
}

// Where Your Money Went Widget
function WhereYourMoneyWent({ 
  transactions, 
  isLoading 
}: { 
  transactions: Array<{ category: string | null; personalCategory?: string | null; amount: string; isTransfer?: boolean }>; 
  isLoading: boolean 
}) {
  // Transfer/income categories to exclude
  const excludedCategories = new Set([
    "TRANSFER_IN", "TRANSFER_OUT", "INCOME", "LOAN_PAYMENTS",
    "Transfer", "Transfers", "Income", "Payroll", "Deposit",
  ]);

  // Group by personalCategory (or category fallback), exclude transfers/income, positive amounts only
  const categoryTotals = transactions
    .filter(tx => {
      if (parseFloat(tx.amount) <= 0) return false;
      if (tx.isTransfer) return false;
      const cat = tx.personalCategory || tx.category || "";
      if (excludedCategories.has(cat)) return false;
      return true;
    })
    .reduce((acc, tx) => {
      const category = tx.personalCategory || tx.category || "Uncategorized";
      acc[category] = (acc[category] || 0) + parseFloat(tx.amount);
      return acc;
    }, {} as Record<string, number>);

  // Get top 5 categories
  const topCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const maxAmount = topCategories[0]?.[1] || 0;

  const categoryIcons: Record<string, LucideIcon> = {
    "Credit Cards": CreditCard,
    "Rent": Home,
    "Mortgage": Home,
    "Subscriptions": Smartphone,
    "Food": UtensilsCrossed,
    "Groceries": ShoppingCart,
    "Transportation": Car,
    "Utilities": Lightbulb,
    "Entertainment": Tv,
    "Shopping": ShoppingBag,
    "Healthcare": Heart,
    "Insurance": Shield,
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="px-4 py-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            Where Your Money Went
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-orange-200 dark:border-orange-800">
      <CardHeader className="px-4 py-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-orange-500" />
            Where Your Money Went
          </CardTitle>
          <DataSourceLabel type="bank" />
        </div>
        <CardDescription className="text-xs">Top spending categories this month</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {topCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No transaction data available
          </p>
        ) : (
          <div className="space-y-3">
            {topCategories.map(([category, amount], index) => {
              const IconComponent = categoryIcons[category] || BarChart3;
              return (
                <div key={category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-orange-100 dark:bg-orange-950/50">
                        <IconComponent className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                      </div>
                      <span className="font-medium">{category}</span>
                    </div>
                    <span className="font-semibold text-red-600 dark:text-red-400">
                      {formatCurrency(amount)}
                    </span>
                  </div>
                  <Progress 
                    value={(amount / maxAmount) * 100} 
                    className="h-2"
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Fix My Cashflow CTA Component
function FixMyCashflowCTA({ 
  cashflowAmount, 
  onOpen 
}: { 
  cashflowAmount: number; 
  onOpen: () => void;
}) {
  if (cashflowAmount >= 0) return null;

  return (
    <Alert className="border-red-200 dark:border-red-800 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30">
      <AlertTriangle className="h-4 w-4 text-red-600" />
      <AlertTitle className="text-red-700 dark:text-red-400">Negative Cash Flow Detected</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="text-sm text-muted-foreground mb-3">
          Your spending exceeds your income by {formatCurrency(Math.abs(cashflowAmount))} this month.
          Let AI help you create an action plan to improve your finances.
        </p>
        <Button 
          onClick={onOpen}
          className="gap-2 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600"
          data-testid="button-fix-cashflow"
        >
          <Brain className="h-4 w-4" />
          Fix My Cashflow with AI
          <ChevronRight className="h-4 w-4" />
        </Button>
      </AlertDescription>
    </Alert>
  );
}

// Mismatch Alert Component
function MismatchAlert({
  planSavings,
  realCashflow,
  budgetSpending,
  realSpending,
}: {
  planSavings: number;
  realCashflow: number;
  budgetSpending: number;
  realSpending: number;
}) {
  const alerts: { type: "warning" | "critical"; message: string }[] = [];

  // Check if plan looks good but real money is falling behind
  if (planSavings > 0 && realCashflow < 0) {
    alerts.push({
      type: "critical",
      message: "Your plan looks good, but your real money is falling behind. Actual spending exceeds your income.",
    });
  }

  // Check if real spending exceeds budgeted spending by >20%
  // Only show this warning when budgetedSpending is meaningful (covers most spending)
  // and the overage is reasonable (< 500%) to avoid misleading percentages when
  // budgets only cover a subset of total spending categories.
  if (budgetSpending > 0 && realSpending > budgetSpending * 1.2) {
    const overagePercent = Math.round(((realSpending - budgetSpending) / budgetSpending) * 100);
    // Only show if the overage is within a believable range (< 500%)
    // A huge % usually means budgets only cover a few categories vs all bank spending
    if (overagePercent < 500) {
      alerts.push({
        type: "warning",
        message: `Your actual spending is ${overagePercent}% higher than your budgeted spending this month.`,
      });
    }
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert, index) => (
        <Alert 
          key={index} 
          variant={alert.type === "critical" ? "destructive" : "default"}
          className={alert.type === "warning" ? "border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-950/20" : ""}
        >
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{alert.type === "critical" ? "Reality Check" : "Budget Warning"}</AlertTitle>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const [showAIHelper, setShowAIHelper] = useState(false);
  const [vaultBannerDismissed, setVaultBannerDismissed] = useState(
    () => localStorage.getItem("vault_dashboard_dismissed") === "true"
  );
  const [birthdayBannerDismissed, setBirthdayBannerDismissed] = useState(
    () => localStorage.getItem("birthday_banner_dismissed") === new Date().toDateString()
  );
  const qc = useQueryClient();

  const { data: session } = useQuery({ queryKey: ["/api/auth/session"], retry: false });
  const sessionData = session as any;

  const { data: vaultStats } = useQuery<{ success: boolean; data: { totalFiles: number } }>({
    queryKey: ["/api/vault/storage-stats"],
  });

  const { data: anomalyData } = useQuery<{ anomalies: unknown[]; alerts: Array<{ id: string; severity: string; title: string; description: string; isDismissed: boolean }> }>({
    queryKey: ["/api/anomalies"],
  });

  const { data: netWorthData, isLoading: netWorthLoading } = useQuery<{
    netWorth: number;
    totalAssets: number;
    totalLiabilities: number;
  }>({
    queryKey: ["/api/net-worth"],
  });

  const dismissAnomalyMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/anomalies/${id}/dismiss`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/anomalies"] }),
  });

  // Handle subscription success from Stripe checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscription') === 'success') {
      fetch('/api/stripe/sync-subscription', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
        .then(res => res.json())
        .then(data => {
          console.log('Subscription sync result:', data);
          queryClient.invalidateQueries({ queryKey: ['/api/stripe/subscription'] });
        })
        .catch(err => console.error('Subscription sync error:', err));

      toast({
        title: "Subscription Activated!",
        description: "Welcome to BudgetSmart AI! Your subscription is now active.",
      });

      if (import.meta.env.VITE_PARTNERO_ENABLED === 'true' && typeof window !== 'undefined' && (window as any).po) {
        try {
          (window as any).po('customer', 'conversion', {
            action: 'subscription_started',
          });
        } catch (e) {
          console.log('Partnero tracking error:', e);
        }
      }

      window.history.replaceState({}, '', '/dashboard');
    }
  }, [toast]);

  const { data: bills = [], isLoading: billsLoading } = useQuery<Bill[]>({
    queryKey: ["/api/bills"],
  });

  const { data: income = [], isLoading: incomeLoading } = useQuery<Income[]>({
    queryKey: ["/api/income"],
  });

  const { data: budgets = [], isLoading: budgetsLoading } = useQuery<Budget[]>({
    queryKey: ["/api/budgets"],
  });

  // Use unified transactions endpoint for accurate spending totals
  const now = new Date();
  const startDate = format(startOfMonth(now), "yyyy-MM-dd");
  const endDate = format(endOfMonth(now), "yyyy-MM-dd");

  interface UnifiedTransaction {
    id: string;
    date: string;
    amount: string;
    merchant: string;
    category: string | null;
    personalCategory: string | null;
    source: "plaid" | "manual";
    isTransfer: boolean;
    pending: boolean;
  }

  const { data: allTransactions = [], isLoading: transactionsLoading } = useQuery<UnifiedTransaction[]>({
    queryKey: ["/api/transactions/all", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/transactions/all?startDate=${startDate}&endDate=${endDate}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: savingsGoals = [], isLoading: savingsGoalsLoading } = useQuery<SavingsGoal[]>({
    queryKey: ["/api/savings-goals"],
  });

  const isLoading = billsLoading || incomeLoading || transactionsLoading || budgetsLoading || savingsGoalsLoading;

  // ============================================
  // SECTION A: REAL CASH FLOW CALCULATIONS
  // (Bank-derived data only)
  // ============================================
  
  // Real income from bank transactions (deposits)
  const realIncomeFromBank = allTransactions
    .filter((tx) => parseFloat(tx.amount) < 0 && !tx.isTransfer && !tx.pending)
    .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount)), 0);

  // Real spending from bank transactions (withdrawals/purchases)
  const realSpendingFromBank = allTransactions
    .filter((tx) => parseFloat(tx.amount) > 0 && !tx.isTransfer && !tx.pending)
    .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

  // Net Cash Flow (Bank Balance Change)
  const bankBalanceChange = realIncomeFromBank - realSpendingFromBank;

  // Get upcoming bills (next 30 days)
  const upcomingBills = bills
    .filter((bill) => bill.isPaused !== "true")
    .map((bill) => ({
      ...bill,
      nextDue: getNextDueDate(bill.dueDay, bill.recurrence, bill.customDates, bill.startDate),
    }))
    .filter((bill) => {
      const thirtyDaysFromNow = addDays(now, 30);
      return isBefore(bill.nextDue, thirtyDaysFromNow) && isAfter(bill.nextDue, addDays(now, -1));
    })
    .sort((a, b) => a.nextDue.getTime() - b.nextDue.getTime());

  const upcomingBillsTotal = upcomingBills.reduce(
    (sum, bill) => sum + parseFloat(bill.amount),
    0
  );

  // ============================================
  // SECTION B: YOUR FINANCIAL PLAN CALCULATIONS
  // (Budget-based data only)
  // ============================================
  
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  
  // Budgeted Income (from income table - planned income)
  const budgetedIncome = income.reduce(
    (sum, inc) => sum + calculateMonthlyIncomeTotal(inc, monthStart, monthEnd),
    0
  );

  // Budgeted Spending (from budgets table — current month only)
  const currentMonth = format(now, "yyyy-MM");
  const budgetedSpending = budgets
    .filter((budget) => budget.month === currentMonth)
    .reduce(
    (sum, budget) => sum + parseFloat(budget.amount),
    0
  );

  // Planned Savings (budgeted income - budgeted spending)
  const plannedSavings = budgetedIncome - budgetedSpending;

  // Monthly bills total (for plan section)
  // Annualized-then-divided approach for accuracy:
  //   weekly:    amount × 52 / 12  ≈ 4.333 payments/month
  //   biweekly:  amount × 26 / 12  ≈ 2.167 payments/month
  //   monthly:   amount × 1
  //   yearly:    amount / 12
  const monthlyBillsPlanned = bills
    .filter((bill) => bill.isPaused !== "true")
    .reduce((sum, bill) => {
      const amount = parseFloat(bill.amount);
      if (bill.recurrence === "monthly") return sum + amount;
      if (bill.recurrence === "weekly") return sum + (amount * 52) / 12;
      if (bill.recurrence === "biweekly") return sum + (amount * 26) / 12;
      if (bill.recurrence === "yearly") return sum + amount / 12;
      return sum;
    }, 0);

  // ============================================
  // Handle AI Helper Modal
  // ============================================
  const handleOpenAIHelper = () => {
    // Navigate to AI assistant with context
    navigate("/ai-assistant?context=cashflow-fix");
    toast({
      title: "AI Financial Advisor",
      description: "Opening your personalized cashflow improvement plan...",
    });
  };

  return (
    <div className="space-y-6">
      {/* Birthday Banner */}
      {(() => {
        if (birthdayBannerDismissed) return null;
        const birthday = sessionData?.birthday;
        if (!birthday) return null;
        const today = new Date();
        const parts = birthday.split("-");
        if (parts.length !== 3) return null;
        const isBirthday = parseInt(parts[1]) === today.getMonth() + 1 && parseInt(parts[2]) === today.getDate();
        if (!isBirthday) return null;
        const name = sessionData?.displayName || sessionData?.firstName || sessionData?.username || "there";
        return (
          <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-pink-500/10 via-rose-500/10 to-orange-500/10 border border-pink-300/40 dark:border-pink-700/40">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎂</span>
              <div>
                <p className="font-semibold text-pink-700 dark:text-pink-300">
                  Happy Birthday, {name}!
                </p>
                <p className="text-sm text-muted-foreground">We hope you have a wonderful day.</p>
              </div>
            </div>
            <button
              className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
              onClick={() => {
                localStorage.setItem("birthday_banner_dismissed", new Date().toDateString());
                setBirthdayBannerDismissed(true);
              }}
              aria-label="Dismiss birthday banner"
            >
              ×
            </button>
          </div>
        );
      })()}

      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent" data-testid="text-dashboard-title">
            {(() => {
              const hour = new Date().getHours();
              const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
              const name = sessionData?.displayName || sessionData?.firstName;
              return name ? `${greeting}, ${name}!` : "Financial Dashboard";
            })()}
          </h1>
          <HelpTooltip
            title="About Your Dashboard"
            content="Your dashboard is split into two views: Real Cash Flow shows what actually happened with your money, while Your Financial Plan shows your budgeted intentions. Compare them to understand the gap between reality and plan."
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Your complete financial picture for {format(now, "MMMM yyyy")}
        </p>
      </div>

      {/* Mismatch Alerts */}
      <MismatchAlert
        planSavings={plannedSavings}
        realCashflow={bankBalanceChange}
        budgetSpending={budgetedSpending}
        realSpending={realSpendingFromBank}
      />

      {/* ============================================ */}
      {/* ANOMALY ALERTS WIDGET                        */}
      {/* ============================================ */}
      {(() => {
        const unresolvedAlerts = (anomalyData?.alerts ?? []).filter((a) => !a.isDismissed);
        if (unresolvedAlerts.length === 0) return null;
        const topAlerts = unresolvedAlerts.slice(0, 3);
        return (
          <Card className="border-2 border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-amber-500" />
                  <CardTitle className="text-sm font-semibold">
                    Security Alerts
                    <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">
                      {unresolvedAlerts.length}
                    </Badge>
                  </CardTitle>
                </div>
                <Link href="/anomalies">
                  <Button variant="ghost" size="sm" className="text-xs h-7">
                    View All <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {topAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-start justify-between gap-3 p-2 rounded-lg bg-white/60 dark:bg-black/20 border ${alert.severity === "high" ? "border-red-200 dark:border-red-900 animate-pulse" : "border-amber-200 dark:border-amber-900"}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium">{alert.title}</span>
                      <Badge
                        variant={alert.severity === "high" ? "destructive" : "secondary"}
                        className="text-xs h-4 px-1 capitalize"
                      >
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{alert.description}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => dismissAnomalyMutation.mutate(alert.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })()}

      {/* ============================================ */}
      {/* FREE PLAN USAGE SUMMARY WIDGET               */}
      {/* ============================================ */}
      {sessionData?.plan === "free" || !sessionData?.plan ? (
        <UsageSummaryWidget />
      ) : null}

      {/* ============================================ */}
      {/* SECTION A: REAL CASH FLOW (Your Actual Money) */}
      {/* ============================================ */}
      <div className="space-y-4">
        <SectionHeader 
          title="Real Cash Flow" 
          subtitle="Your Actual Money — What really happened this month"
          icon={Building2}
          variant="real"
        />
        
        <div className="p-4 rounded-lg border-2 border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50/50 to-red-50/30 dark:from-orange-950/20 dark:to-red-950/10">
          {/* Real Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <RealCashFlowCard
              title="Bank Deposits"
              value={formatCurrency(realIncomeFromBank)}
              icon={TrendingUp}
              description="Actual income received"
              isLoading={isLoading}
            />
            <RealCashFlowCard
              title="Total Outgoing"
              value={formatCurrency(realSpendingFromBank)}
              icon={TrendingDown}
              description="All spending this month"
              isLoading={isLoading}
              isNegative
            />
            <RealCashFlowCard
              title="Bank Balance Change"
              value={formatCurrency(bankBalanceChange)}
              icon={Wallet}
              description={bankBalanceChange >= 0 ? "Net surplus" : "Net deficit"}
              isLoading={isLoading}
              isNegative={bankBalanceChange < 0}
              isWarning={bankBalanceChange < 0}
            />
            <RealCashFlowCard
              title="Upcoming Bills"
              value={formatCurrency(upcomingBillsTotal)}
              icon={Calendar}
              description={`${upcomingBills.length} bills in 30 days`}
              isLoading={isLoading}
            />
          </div>

          {/* Net Worth Widget */}
          <Card className="border-orange-200 dark:border-orange-800 mb-4">
            <CardHeader className="px-4 py-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CircleDollarSign className="h-4 w-4 text-orange-500" />
                  Net Worth
                </CardTitle>
                <div className="flex items-center gap-2">
                  <DataSourceLabel type="bank" />
                  <Link href="/net-worth">
                    <Button variant="ghost" size="sm" className="text-xs h-7">
                      Details <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>
              <CardDescription className="text-xs">Total Assets minus Total Liabilities</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {netWorthLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-8 w-48" />
                </div>
              ) : netWorthData ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Assets</span>
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(netWorthData.totalAssets)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Liabilities</span>
                    <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                      -{formatCurrency(netWorthData.totalLiabilities)}
                    </span>
                  </div>
                  <div className="border-t pt-2 flex items-center justify-between">
                    <span className="text-sm font-medium">Net Worth</span>
                    <span className={`text-xl font-bold ${netWorthData.netWorth >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {formatCurrency(netWorthData.netWorth)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Link a bank account to see your net worth
                </p>
              )}
            </CardContent>
          </Card>

          {/* Fix My Cashflow CTA */}
          <FixMyCashflowCTA 
            cashflowAmount={bankBalanceChange} 
            onOpen={handleOpenAIHelper} 
          />

          {/* Where Your Money Went + Upcoming Bills */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <WhereYourMoneyWent 
              transactions={allTransactions} 
              isLoading={isLoading} 
            />
            
            {/* Upcoming Payments Preview */}
            <Card className="border-orange-200 dark:border-orange-800">
              <CardHeader className="px-4 py-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Calendar className="h-4 w-4 text-orange-500" />
                    Upcoming Payments
                  </CardTitle>
                  <DataSourceLabel type="bank" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : upcomingBills.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No bills due in the next 30 days
                  </p>
                ) : (
                  <div className="space-y-2">
                    {upcomingBills.slice(0, 5).map((bill) => {
                      const daysUntil = Math.ceil(
                        (bill.nextDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                      );
                      const daysColor =
                        daysUntil < 0 || daysUntil < 3
                          ? "text-red-600 dark:text-red-400"
                          : daysUntil <= 7
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400";
                      const rowBg =
                        daysUntil < 0 || daysUntil < 3
                          ? "bg-red-50/60 dark:bg-red-950/20 border border-red-200 dark:border-red-800"
                          : daysUntil <= 7
                          ? "bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800"
                          : "bg-muted/50";
                      return (
                        <div key={bill.id} className={`flex items-center justify-between p-2 rounded-lg ${rowBg}`}>
                          <div>
                            <p className="font-medium text-sm">{bill.name}</p>
                            <p className={`text-xs font-medium ${daysColor}`}>
                              {daysUntil < 0
                                ? `Overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? "s" : ""}`
                                : daysUntil === 0
                                ? "Due today"
                                : daysUntil === 1
                                ? "Tomorrow"
                                : `In ${daysUntil} days`}
                            </p>
                          </div>
                          <span className="font-semibold text-red-600 dark:text-red-400">
                            {formatCurrency(bill.amount)}
                          </span>
                        </div>
                      );
                    })}
                    {upcomingBills.length > 5 && (
                      <Link href="/bills">
                        <Button variant="ghost" size="sm" className="w-full gap-1">
                          View all {upcomingBills.length} bills
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Money Timeline - 90 Day Forecast */}
          <div className="mt-4">
            <MoneyTimeline />
          </div>

          {/* Cash Flow Forecast - Detailed 30 Day View */}
          <div className="mt-4">
            <FeatureGate
              feature="cash_flow_forecast"
              bullets={[
                "Forecast your cash position before bills hit",
                "Spot risky dates and upcoming shortfalls early",
                "Plan proactive moves to avoid overdrafts",
              ]}
            >
              <CashFlowForecast />
            </FeatureGate>
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* SECTION B: YOUR FINANCIAL PLAN (Your Intentions) */}
      {/* ============================================ */}
      <div className="space-y-4">
        <SectionHeader 
          title="Your Financial Plan" 
          subtitle="Your Intentions — What you planned to do this month"
          icon={Target}
          variant="plan"
        />
        
        <div className="p-4 rounded-lg border-2 border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50/50 to-teal-50/30 dark:from-emerald-950/20 dark:to-teal-950/10">
          {/* Plan Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <PlanStatCard
              title="Budgeted Income"
              value={formatCurrency(budgetedIncome)}
              icon={TrendingUp}
              description="Expected income this month"
              isLoading={isLoading}
              variant="income"
            />
            <PlanStatCard
              title="Budgeted Spending"
              value={formatCurrency(budgetedSpending)}
              icon={Receipt}
              description="Planned spending limits"
              isLoading={isLoading}
              variant="spending"
            />
            <PlanStatCard
              title="Planned Bills"
              value={formatCurrency(monthlyBillsPlanned)}
              icon={Calendar}
              description="Recurring monthly bills"
              isLoading={isLoading}
            />
            <PlanStatCard
              title="Planned Savings"
              value={formatCurrency(Math.max(0, plannedSavings))}
              icon={PiggyBank}
              description="Target savings this month"
              isLoading={isLoading}
              variant="savings"
            />
          </div>

          {/* Financial Health Score + Smart Savings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FeatureGate
              feature="financial_health"
              bullets={[
                "Get a live financial health score and trend",
                "See priority actions to improve your score",
                "Track progress across key money habits",
              ]}
            >
              <FinancialHealthScore />
            </FeatureGate>
            <SmartSavings />
          </div>

          {/* Money Leaks + Spendability */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <MoneyLeaksWidget />
            <SpendabilityWidget />
          </div>

          {/* Savings Goals Progress */}
          <div className="mt-4">
            <Card className="border-emerald-200 dark:border-emerald-800">
              <CardHeader className="px-4 py-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <PiggyBank className="h-4 w-4 text-emerald-500" />
                    Savings Goals
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <DataSourceLabel type="plan" />
                    <Link href="/savings-goals">
                      <Button variant="ghost" size="sm" className="text-xs h-7">
                        Manage <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
                <CardDescription className="text-xs">Track progress toward your financial goals</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : savingsGoals.length === 0 ? (
                  <div className="text-center py-6 space-y-3">
                    <div className="flex justify-center">
                      <div className="p-3 rounded-full bg-emerald-100 dark:bg-emerald-950/50">
                        <Target className="h-6 w-6 text-emerald-500" />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Set a savings goal to track your progress
                    </p>
                    <Link href="/savings-goals">
                      <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                        <PiggyBank className="h-4 w-4" />
                        + Add Goal
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {savingsGoals.slice(0, 4).map((goal: SavingsGoal) => {
                      const current = parseFloat(String(goal.currentAmount ?? "0"));
                      const target = parseFloat(String(goal.targetAmount ?? "0"));
                      const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
                      return (
                        <div key={goal.id} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium truncate">{goal.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0 ml-2">
                              {formatCurrency(current)} / {formatCurrency(target)}
                            </span>
                          </div>
                          <Progress value={pct} className="h-2" />
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-medium ${
                              pct >= 100
                                ? "text-emerald-600 dark:text-emerald-400"
                                : pct >= 50
                                ? "text-teal-600 dark:text-teal-400"
                                : "text-muted-foreground"
                            }`}>
                              {pct >= 100 ? "🎉 Goal reached!" : `${pct}% complete`}
                            </span>
                            {goal.targetDate && (
                              <span className="text-xs text-muted-foreground">
                                By {format(parseISO(String(goal.targetDate)), "MMM yyyy")}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {savingsGoals.length > 4 && (
                      <Link href="/savings-goals">
                        <Button variant="ghost" size="sm" className="w-full gap-1 text-xs">
                          View all {savingsGoals.length} goals
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* The Gap - Visual Comparison */}
      {!vaultBannerDismissed && vaultStats?.data?.totalFiles === 0 && (
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-amber-500/20 via-amber-400/10 to-transparent p-5">
          <button
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted text-muted-foreground"
            onClick={() => {
              setVaultBannerDismissed(true);
              localStorage.setItem("vault_dashboard_dismissed", "true");
            }}
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex flex-col sm:flex-row gap-4 pr-8">
            <div className="flex items-start gap-3 flex-1">
              <div className="h-11 w-11 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                <Shield className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2 py-0.5 font-semibold">NEW</span>
                  <h3 className="font-bold">🔒 Financial Vault</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Store all your financial documents securely with unlimited storage. AI reads and understands every document so you can ask questions instantly.
                </p>
                <ul className="space-y-1 mb-4">
                  {[
                    "Tax returns, insurance policies, warranties & more",
                    "Ask AI questions about any document",
                    "Auto-alerts before documents expire",
                    "Unlimited storage — included free with your plan",
                  ].map(item => (
                    <li key={item} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="text-amber-400 mt-0.5">✓</span>{item}
                    </li>
                  ))}
                </ul>
                <Link href="/vault">
                  <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white">
                    Explore Financial Vault →
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* The Gap - Visual Comparison */}
      <Card className="border-2 border-dashed">
        <CardHeader className="px-4 py-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-primary" />
            The Gap: Plan vs Reality
          </CardTitle>
          <CardDescription>Compare your financial plan to what actually happened</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Income Gap</p>
              <p className={`text-xl font-bold ${realIncomeFromBank >= budgetedIncome ? "text-emerald-600" : "text-red-600"}`}>
                {realIncomeFromBank >= budgetedIncome ? "+" : ""}{formatCurrency(realIncomeFromBank - budgetedIncome)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {realIncomeFromBank >= budgetedIncome ? "Over plan" : "Under plan"}
              </p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Spending Gap</p>
              <p className={`text-xl font-bold ${realSpendingFromBank <= budgetedSpending ? "text-emerald-600" : "text-red-600"}`}>
                {realSpendingFromBank > budgetedSpending ? "+" : ""}{formatCurrency(realSpendingFromBank - budgetedSpending)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {realSpendingFromBank <= budgetedSpending ? "Under budget" : "Over budget"}
              </p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Savings Gap</p>
              <p className={`text-xl font-bold ${bankBalanceChange >= plannedSavings ? "text-emerald-600" : "text-red-600"}`}>
                {bankBalanceChange >= plannedSavings ? "+" : ""}{formatCurrency(bankBalanceChange - plannedSavings)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {bankBalanceChange >= plannedSavings ? "Ahead of plan" : "Behind plan"}
              </p>
            </div>
          </div>
          
          {/* Summary Message */}
          <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-sm">
                {bankBalanceChange >= plannedSavings ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    Great job! Your actual savings exceed your plan. Keep up the good work!
                  </span>
                ) : bankBalanceChange >= 0 ? (
                  <span className="text-yellow-600 dark:text-yellow-400">
                    You're saving money, but {formatCurrency(plannedSavings - bankBalanceChange)} less than planned. Review your spending to get back on track.
                  </span>
                ) : (
                  <span className="text-red-600 dark:text-red-400">
                    Your spending exceeds your income. Use the "Fix My Cashflow" button above to get personalized advice.
                  </span>
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
