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
import { format, parseISO } from "date-fns";
import type { SavingsGoal } from "@shared/schema";
import { FinancialHealthScore } from "@/components/financial-health-score";
import { DemoBanner } from "@/components/demo-banner";
import { CashFlowForecast } from "@/components/cash-flow-forecast";
import { SmartSavings } from "@/components/smart-savings";
import { MoneyTimeline } from "@/components/money-timeline";
import { MoneyLeaksWidget } from "@/components/money-leaks-widget";
import { SpendabilityWidget } from "@/components/spendability-widget";
import { FeatureGate } from "@/components/FeatureGate";
import { Link } from "wouter";
import { KpiCard, type KpiTone } from "@/components/kpi-card";

// Dashboard data type from the centralized financial engine
interface DashboardData {
  income: {
    budgetedIncome: number;
    actualIncome: number;
    effectiveIncome: number;
    hasBankData: boolean;
    bySource: Array<{ source: string; amount: number; category: string; isRecurring: boolean; frequency?: string }>;
  };
  expenses: {
    total: number;
    count: number;
    previousTotal: number;
    momChangePercent: number;
    byCategory: Record<string, number>;
    topCategories: Array<{ category: string; amount: number; percentage: number }>;
    topMerchants: Array<{ merchant: string; amount: number; count: number }>;
    dailyAverage: number;
    projectedMonthly: number;
    dailyTotals: Record<string, number>;
  };
  bills: {
    thisMonthBills: Array<{ billId: string; billName: string; amount: number; category: string; dueDate: string; recurrence: string; isPaused: boolean }>;
    thisMonthTotal: number;
    upcomingBills: Array<{ billId: string; billName: string; amount: number; category: string; dueDate: string; recurrence: string; isPaused: boolean; daysUntil: number }>;
    monthlyEstimate: number;
    annualEstimate: number;
  };
  cashFlow: {
    realCashFlow: number;
    realIncome: number;
    realSpending: number;
    plannedCashFlow: number;
    plannedSavings: number;
  };
  netWorth: {
    netWorth: number;
    totalAssets: number;
    totalLiabilities: number;
    assetPercent: number;
    latestChange: number;
    assetBreakdown: Record<string, number>;
    liabilityBreakdown: Record<string, number>;
  };
  savingsGoals: {
    totalSaved: number;
    totalTarget: number;
    overallProgress: number;
    goals: Array<{ id: string; name: string; current: number; target: number; percentage: number; remaining: number; isComplete: boolean; daysLeft: number | null }>;
  };
  healthScore: {
    totalScore: number;
    savingsRateScore: number;
    budgetScore: number;
    savingsGoalScore: number;
    billScore: number;
    savingsRate: number;
    budgetCount: number;
    billCount: number;
    avgGoalProgress: number;
  };
  safeToSpend: {
    safeToSpend: number;
    dailyAllowance: number;
    daysRemaining: number;
  };
  gaps: {
    incomeGap: number;
    spendingGap: number;
    savingsGap: number;
  };
  alerts: {
    negativeCashFlow: boolean;
    budgetOverage: boolean;
    budgetOveragePercent: number;
    planVsRealityMismatch: boolean;
  };
}

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
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
//
// "bank" used to render in orange, but that made every Real Cash Flow card
// feel warm/amber which clashed with the mint glass theme. Now both pills
// live in the green/teal family — "bank" is a muted neutral-slate pill to
// keep a visual distinction from the solid emerald "plan" pill without
// introducing a second accent colour.
function DataSourceLabel({ type }: { type: "bank" | "plan" }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] gap-1 ${
        type === "bank"
          ? "border-border/60 text-muted-foreground bg-muted/40 dark:bg-muted/20"
          : "border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
      }`}
    >
      {type === "bank" ? <Building2 className="h-2.5 w-2.5" /> : <Target className="h-2.5 w-2.5" />}
      {type === "bank" ? "From linked accounts" : "From your budget plan"}
    </Badge>
  );
}

// Real Cash Flow Stat Card — Phase 3.3 thin wrapper over <KpiCard>.
// Keeps the existing call signature so we can ship 3.3 without touching 8+
// call sites in one diff; tone is chosen here from `title` + `isNegative`.
function RealCashFlowCard({
  title,
  value,
  icon,
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
  // Per-card tone table. Negatives always go red; positives pick emerald for
  // inflow, teal for the net-flow card, amber for "bills due".
  const tone: KpiTone = isNegative
    ? "red"
    : title.toLowerCase().includes("bills")
    ? "amber"
    : title.toLowerCase().includes("balance change") || title.toLowerCase().includes("cash flow")
    ? "teal"
    : title.toLowerCase().includes("outgoing")
    ? "red"
    : "emerald";

  // A deposit growing is favorable; outgoing growing is not.
  const favorableDirection: "up" | "down" =
    title.toLowerCase().includes("outgoing") || title.toLowerCase().includes("bills") ? "down" : "up";

  return (
    <KpiCard
      title={title}
      value={value}
      icon={icon}
      description={description}
      isLoading={isLoading}
      tone={tone}
      isNegative={isNegative}
      isWarning={isWarning}
      favorableDirection={favorableDirection}
    />
  );
}

// Plan Stat Card — Phase 3.3 thin wrapper over <KpiCard>.
function PlanStatCard({
  title,
  value,
  icon,
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
  const toneByVariant: Record<string, KpiTone> = {
    income: "emerald",
    spending: "blue",
    savings: "teal",
    default: "amber",
  };

  return (
    <KpiCard
      title={title}
      value={value}
      icon={icon}
      description={description}
      isLoading={isLoading}
      tone={toneByVariant[variant] ?? "amber"}
      favorableDirection={variant === "spending" ? "down" : "up"}
    />
  );
}

// Legacy inline card bodies were removed in Phase 3.3 (2026-04-17).
// Both RealCashFlowCard + PlanStatCard now delegate to <KpiCard>.

// [REMOVED] WhereYourMoneyWent local-calc widget — replaced by engine-powered
// inline rendering at line ~841 using dashboard.expenses.topCategories

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
          // "warning" variant used bright yellow which washed out the mint
          // glass palette. Softened to a translucent amber glass pill — still
          // reads as cautionary but blends with the surrounding cards.
          className={
            alert.type === "warning"
              ? "border-amber-300/50 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/15 backdrop-blur-sm [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400"
              : ""
          }
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

  // ============================================
  // CENTRALIZED FINANCIAL ENGINE
  // Single API call replaces all client-side calculations
  // ============================================
  const { data: dashboard, isLoading: dashboardLoading } = useQuery<DashboardData>({
    queryKey: ["/api/engine/dashboard"],
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

  const now = new Date();

  // Keep query for CRUD operations on bills and goals that are used elsewhere
  // but the dashboard itself doesn't need to fetch these separately anymore
  const { data: savingsGoals = [], isLoading: savingsGoalsLoading } = useQuery<SavingsGoal[]>({
    queryKey: ["/api/savings-goals"],
  });

  // For the processing banner, we need onboarding state
  const isProcessing =
    !dashboardLoading &&
    sessionData?.onboardingComplete === true &&
    !dashboard?.expenses?.count;

  useEffect(() => {
    if (!isProcessing) return;
    const interval = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["/api/engine/dashboard"] });
      qc.invalidateQueries({ queryKey: ["/api/reports/money-timeline"] });
    }, 15000);
    return () => clearInterval(interval);
  }, [isProcessing, qc]);

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

      {/* Demo Data Banner */}
      <DemoBanner />

      {/* Dashboard tooltip anchor — greeting itself lives in the topbar.
       * Keep a hidden HelpTooltip trigger so the "About Your Dashboard" copy
       * is still discoverable next to other header icons. */}
      <div className="sr-only" aria-hidden="false">
        <HelpTooltip
          title="About Your Dashboard"
          content="Your dashboard is split into two views: Real Cash Flow shows what actually happened with your money, while Your Financial Plan shows your budgeted intentions. Compare them to understand the gap between reality and plan."
        />
      </div>

      {/* Fix 7: Processing Banner — shown right after onboarding while transactions sync */}
      {isProcessing && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Analyzing your finances...</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              We're categorizing your transactions and detecting recurring bills. Usually takes 1–2 minutes.
            </p>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">Auto-refreshing...</span>
        </div>
      )}

      {/* Mismatch Alerts */}
      {dashboard && (
        <MismatchAlert
          planSavings={dashboard.cashFlow.plannedSavings}
          realCashflow={dashboard.cashFlow.realCashFlow}
          budgetSpending={dashboard.expenses.total}
          realSpending={dashboard.income.actualIncome}
        />
      )}

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
      {/* SECTION A: REAL CASH FLOW (Your Actual Money) */}
      {/* ============================================ */}
      <div className="space-y-4">
        <SectionHeader 
          title="Real Cash Flow" 
          subtitle="Your Actual Money — What really happened this month"
          icon={Building2}
          variant="real"
        />
        
        {/* Section wrapper — was orange/red gradient which made the entire
         * page feel amber. Swapped to translucent emerald/teal glass so it
         * visually owns "Real Cash Flow" without fighting the mint bg. */}
        <div className="p-4 rounded-lg border border-emerald-200/60 dark:border-emerald-700/30 bg-gradient-to-br from-emerald-50/40 to-teal-50/30 dark:from-emerald-950/20 dark:to-teal-950/10 backdrop-blur-sm">
          {/* Real Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <RealCashFlowCard
              title="Bank Deposits"
              value={formatCurrency(dashboard?.income.actualIncome ?? 0)}
              icon={TrendingUp}
              description={`Actual income received · ${format(now, "MMM yyyy")}`}
              isLoading={dashboardLoading}
            />
            <RealCashFlowCard
              title="Total Outgoing"
              value={formatCurrency(dashboard?.expenses.total ?? 0)}
              icon={TrendingDown}
              description={`All spending · ${format(now, "MMM yyyy")}`}
              isLoading={dashboardLoading}
              isNegative
            />
            <RealCashFlowCard
              title="Bank Balance Change"
              value={formatCurrency(dashboard?.cashFlow.realCashFlow ?? 0)}
              icon={Wallet}
              description={(dashboard?.cashFlow.realCashFlow ?? 0) >= 0 ? "Net surplus" : "Net deficit"}
              isLoading={dashboardLoading}
              isNegative={(dashboard?.cashFlow.realCashFlow ?? 0) < 0}
              isWarning={(dashboard?.cashFlow.realCashFlow ?? 0) < 0}
            />
            <RealCashFlowCard
              title="Bills Due This Month"
              value={formatCurrency(dashboard?.bills.thisMonthTotal ?? 0)}
              icon={Calendar}
              description={`${dashboard?.bills.thisMonthBills.length ?? 0} bill${(dashboard?.bills.thisMonthBills.length ?? 0) !== 1 ? "s" : ""} · ${format(now, "MMM d")}–${format(new Date(now.getFullYear(), now.getMonth() + 1, 0), "MMM d, yyyy")}`}
              isLoading={dashboardLoading}
            />
          </div>

          {/* Net Worth Widget */}
          <Card className="mb-4">
            <CardHeader className="px-4 py-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CircleDollarSign className="h-4 w-4 text-emerald-500" />
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
              {dashboardLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-8 w-48" />
                </div>
              ) : dashboard?.netWorth ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Assets</span>
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(dashboard.netWorth.totalAssets)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Liabilities</span>
                    <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                      -{formatCurrency(dashboard.netWorth.totalLiabilities)}
                    </span>
                  </div>
                  <div className="border-t pt-2 flex items-center justify-between">
                    <span className="text-sm font-medium">Net Worth</span>
                    <span className={`text-xl font-bold ${dashboard.netWorth.netWorth >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {formatCurrency(dashboard.netWorth.netWorth)}
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
            cashflowAmount={dashboard?.cashFlow.realCashFlow ?? 0}
            onOpen={handleOpenAIHelper}
          />

          {/* Where Your Money Went + Upcoming Bills */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            {/* Where Your Money Went - now use dashboard.expenses.topCategories.
             *
             * Refreshed Apr 2026 to match the Claude mockup: each category gets
             * its own icon pill colour AND a matching progress-bar fill so the
             * card reads as a small legend. Removes the uniform orange icons
             * and green-only bars the previous version used. Amount text is
             * neutral (not red) since the category label already signals spend
             * and red-on-everything was too alarmist.
             */}
            <Card>
              <CardHeader className="px-4 py-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CreditCard className="h-4 w-4 text-emerald-500" />
                    Where Your Money Went
                  </CardTitle>
                  <DataSourceLabel type="bank" />
                </div>
                <CardDescription className="text-xs">Top spending categories this month</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {dashboardLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : !dashboard?.expenses.topCategories || dashboard.expenses.topCategories.length === 0 ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dashboard.expenses.topCategories.map((item) => {
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
                      // Per-category palette. Each entry is { icon-bg, icon-fg,
                      // bar-fill, bar-track } — kept as literal class strings so
                      // Tailwind's JIT can pick them up. Fallback = slate.
                      const categoryPalette: Record<
                        string,
                        { iconBg: string; iconFg: string; barFill: string; barTrack: string }
                      > = {
                        "Healthcare":     { iconBg: "bg-rose-100 dark:bg-rose-950/40",      iconFg: "text-rose-600 dark:text-rose-400",      barFill: "bg-rose-500",     barTrack: "bg-rose-100/60 dark:bg-rose-950/30" },
                        "Insurance":      { iconBg: "bg-emerald-100 dark:bg-emerald-950/40", iconFg: "text-emerald-600 dark:text-emerald-400", barFill: "bg-emerald-500", barTrack: "bg-emerald-100/60 dark:bg-emerald-950/30" },
                        "Transportation": { iconBg: "bg-sky-100 dark:bg-sky-950/40",        iconFg: "text-sky-600 dark:text-sky-400",        barFill: "bg-sky-500",      barTrack: "bg-sky-100/60 dark:bg-sky-950/30" },
                        "Shopping":       { iconBg: "bg-violet-100 dark:bg-violet-950/40",  iconFg: "text-violet-600 dark:text-violet-400",  barFill: "bg-violet-500",   barTrack: "bg-violet-100/60 dark:bg-violet-950/30" },
                        "Food":           { iconBg: "bg-amber-100 dark:bg-amber-950/40",    iconFg: "text-amber-600 dark:text-amber-400",    barFill: "bg-amber-500",    barTrack: "bg-amber-100/60 dark:bg-amber-950/30" },
                        "Groceries":      { iconBg: "bg-amber-100 dark:bg-amber-950/40",    iconFg: "text-amber-600 dark:text-amber-400",    barFill: "bg-amber-500",    barTrack: "bg-amber-100/60 dark:bg-amber-950/30" },
                        "Rent":           { iconBg: "bg-indigo-100 dark:bg-indigo-950/40",  iconFg: "text-indigo-600 dark:text-indigo-400",  barFill: "bg-indigo-500",   barTrack: "bg-indigo-100/60 dark:bg-indigo-950/30" },
                        "Mortgage":       { iconBg: "bg-indigo-100 dark:bg-indigo-950/40",  iconFg: "text-indigo-600 dark:text-indigo-400",  barFill: "bg-indigo-500",   barTrack: "bg-indigo-100/60 dark:bg-indigo-950/30" },
                        "Subscriptions":  { iconBg: "bg-teal-100 dark:bg-teal-950/40",      iconFg: "text-teal-600 dark:text-teal-400",      barFill: "bg-teal-500",     barTrack: "bg-teal-100/60 dark:bg-teal-950/30" },
                        "Utilities":      { iconBg: "bg-yellow-100 dark:bg-yellow-950/40",  iconFg: "text-yellow-600 dark:text-yellow-400",  barFill: "bg-yellow-500",   barTrack: "bg-yellow-100/60 dark:bg-yellow-950/30" },
                        "Entertainment":  { iconBg: "bg-pink-100 dark:bg-pink-950/40",      iconFg: "text-pink-600 dark:text-pink-400",      barFill: "bg-pink-500",     barTrack: "bg-pink-100/60 dark:bg-pink-950/30" },
                        "Credit Cards":   { iconBg: "bg-orange-100 dark:bg-orange-950/40",  iconFg: "text-orange-600 dark:text-orange-400",  barFill: "bg-orange-500",   barTrack: "bg-orange-100/60 dark:bg-orange-950/30" },
                      };
                      const fallbackPalette = {
                        iconBg: "bg-slate-100 dark:bg-slate-900/50",
                        iconFg: "text-slate-600 dark:text-slate-400",
                        barFill: "bg-slate-500",
                        barTrack: "bg-slate-100/60 dark:bg-slate-900/40",
                      };
                      const palette = categoryPalette[item.category] ?? fallbackPalette;
                      const IconComponent = categoryIcons[item.category] || BarChart3;
                      const maxAmount = dashboard.expenses.topCategories[0]?.amount || item.amount;
                      const pct = Math.min(100, Math.max(0, (item.amount / maxAmount) * 100));
                      return (
                        <div key={item.category} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded-md ${palette.iconBg}`}>
                                <IconComponent className={`h-3.5 w-3.5 ${palette.iconFg}`} />
                              </div>
                              <span className="font-medium">{item.category}</span>
                            </div>
                            <span className="font-semibold tabular-nums text-foreground">
                              {formatCurrency(item.amount)}
                            </span>
                          </div>
                          {/* Hand-rolled bar so fill colour can vary per row
                           * (the shadcn Progress primitive uses bg-primary on
                           * the indicator which would force every bar green). */}
                          <div
                            className={`h-2 w-full rounded-full overflow-hidden ${palette.barTrack}`}
                            role="progressbar"
                            aria-valuenow={Math.round(pct)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${item.category} spend as share of top category`}
                          >
                            <div
                              className={`h-full rounded-full transition-all ${palette.barFill}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upcoming Payments Preview */}
            <Card>
              <CardHeader className="px-4 py-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Calendar className="h-4 w-4 text-emerald-500" />
                    Upcoming Payments
                  </CardTitle>
                  <DataSourceLabel type="bank" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {dashboardLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : !dashboard?.bills.upcomingBills || dashboard.bills.upcomingBills.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No bills due in the next 30 days
                  </p>
                ) : (
                  <div className="space-y-2">
                    {dashboard.bills.upcomingBills.slice(0, 5).map((bill) => {
                      const daysUntil = bill.daysUntil;
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
                        <div key={bill.billId} className={`flex items-center justify-between p-2 rounded-lg ${rowBg}`}>
                          <div>
                            <p className="font-medium text-sm">{bill.billName}</p>
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
                    {(dashboard.bills.upcomingBills.length ?? 0) > 5 && (
                      <Link href="/bills">
                        <Button variant="ghost" size="sm" className="w-full gap-1">
                          View all {dashboard.bills.upcomingBills.length} bills
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Money Timeline - 90 Day Forecast (only render when transactions exist) */}
          {(dashboard?.expenses?.count ?? 0) > 0 && (
            <div className="mt-4">
              <MoneyTimeline />
            </div>
          )}

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
              value={formatCurrency(dashboard?.income.budgetedIncome ?? 0)}
              icon={TrendingUp}
              description="Expected income this month"
              isLoading={dashboardLoading}
              variant="income"
            />
            <PlanStatCard
              title="Budgeted Spending"
              value={formatCurrency(dashboard?.expenses.total ?? 0)}
              icon={Receipt}
              description="Planned spending limits"
              isLoading={dashboardLoading}
              variant="spending"
            />
            <PlanStatCard
              title="Monthly Bill Budget"
              value={formatCurrency(dashboard?.bills.monthlyEstimate ?? 0)}
              icon={Calendar}
              description={`Budget estimate · ${format(now, "MMM yyyy")} (not actual dates)`}
              isLoading={dashboardLoading}
            />
            <PlanStatCard
              title="Planned Savings"
              value={formatCurrency(Math.max(0, dashboard?.cashFlow.plannedSavings ?? 0))}
              icon={PiggyBank}
              description="Target savings this month"
              isLoading={dashboardLoading}
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
                    <Link href="/savings">
                      <Button variant="ghost" size="sm" className="text-xs h-7">
                        Manage <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
                <CardDescription className="text-xs">Track progress toward your financial goals</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {dashboardLoading || savingsGoalsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : !dashboard?.savingsGoals.goals || dashboard.savingsGoals.goals.length === 0 ? (
                  <div className="text-center py-6 space-y-3">
                    <div className="flex justify-center">
                      <div className="p-3 rounded-full bg-emerald-100 dark:bg-emerald-950/50">
                        <Target className="h-6 w-6 text-emerald-500" />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Set a savings goal to track your progress
                    </p>
                    <Link href="/savings">
                      <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                        <PiggyBank className="h-4 w-4" />
                        + Add Goal
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {dashboard.savingsGoals.goals.slice(0, 4).map((goal) => {
                      const pct = goal.percentage;
                      return (
                        <div key={goal.id} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium truncate">{goal.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0 ml-2">
                              {formatCurrency(goal.current)} / {formatCurrency(goal.target)}
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
                            {goal.daysLeft !== null && (
                              <span className="text-xs text-muted-foreground">
                                {goal.daysLeft} days left
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {(dashboard.savingsGoals.goals.length ?? 0) > 4 && (
                      <Link href="/savings">
                        <Button variant="ghost" size="sm" className="w-full gap-1 text-xs">
                          View all {dashboard.savingsGoals.goals.length} goals
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
              <p className={`text-xl font-bold ${(dashboard?.income.actualIncome ?? 0) >= (dashboard?.income.budgetedIncome ?? 0) ? "text-emerald-600" : "text-red-600"}`}>
                {(dashboard?.income.actualIncome ?? 0) >= (dashboard?.income.budgetedIncome ?? 0) ? "+" : ""}{formatCurrency((dashboard?.gaps.incomeGap ?? 0))}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {(dashboard?.income.actualIncome ?? 0) >= (dashboard?.income.budgetedIncome ?? 0) ? "Over plan" : "Under plan"}
              </p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Spending Gap</p>
              {(dashboard?.income.budgetedIncome ?? 0) === 0 ? (
                <>
                  <p className="text-sm font-semibold text-muted-foreground">No budget set</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    <a href="/budgets" className="underline underline-offset-2 hover:text-primary">Create a budget</a> to track gaps
                  </p>
                </>
              ) : (
                <>
                  <p className={`text-xl font-bold ${(dashboard?.expenses.total ?? 0) <= (dashboard?.income.budgetedIncome ?? 0) ? "text-emerald-600" : "text-red-600"}`}>
                    {(dashboard?.expenses.total ?? 0) > (dashboard?.income.budgetedIncome ?? 0) ? "+" : ""}{formatCurrency((dashboard?.gaps.spendingGap ?? 0))}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {(dashboard?.expenses.total ?? 0) <= (dashboard?.income.budgetedIncome ?? 0) ? "Under budget" : "Over budget"}
                  </p>
                </>
              )}
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Savings Gap</p>
              {(dashboard?.income.budgetedIncome ?? 0) === 0 && (dashboard?.income.actualIncome ?? 0) === 0 ? (
                <>
                  <p className="text-sm font-semibold text-muted-foreground">No plan set</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Add income &amp; budgets to see your savings gap
                  </p>
                </>
              ) : (
                <>
                  <p className={`text-xl font-bold ${(dashboard?.cashFlow.realCashFlow ?? 0) >= (dashboard?.cashFlow.plannedSavings ?? 0) ? "text-emerald-600" : "text-red-600"}`}>
                    {(dashboard?.cashFlow.realCashFlow ?? 0) >= (dashboard?.cashFlow.plannedSavings ?? 0) ? "+" : ""}{formatCurrency((dashboard?.gaps.savingsGap ?? 0))}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {(dashboard?.cashFlow.realCashFlow ?? 0) >= (dashboard?.cashFlow.plannedSavings ?? 0) ? "Ahead of plan" : "Behind plan"}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Summary Message */}
          <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-sm">
                {(dashboard?.cashFlow.realCashFlow ?? 0) >= (dashboard?.cashFlow.plannedSavings ?? 0) ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    Great job! Your actual savings exceed your plan. Keep up the good work!
                  </span>
                ) : (dashboard?.cashFlow.realCashFlow ?? 0) >= 0 ? (
                  <span className="text-yellow-600 dark:text-yellow-400">
                    You're saving money, but {formatCurrency((dashboard?.cashFlow.plannedSavings ?? 0) - (dashboard?.cashFlow.realCashFlow ?? 0))} less than planned. Review your spending to get back on track.
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
