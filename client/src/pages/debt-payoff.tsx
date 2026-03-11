// FEATURE: DEBT_PAYOFF_PLANNER | tier: pro | limit: unlimited
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpTooltip } from "@/components/help-tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CreditCard,
  TrendingDown,
  Calendar,
  DollarSign,
  Target,
  Zap,
  Snowflake,
  Calculator,
  PiggyBank,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Brain,
  Loader2,
  Sparkles,
  Edit,
  Percent,
  Scale,
} from "lucide-react";
import { format, addMonths } from "date-fns";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { DebtDetails, PlaidAccount } from "@shared/schema";

interface DebtItem {
  id: string;
  name: string;
  balance: number;
  interestRate: number;
  minimumPayment: number;
  category: string;
}

// Convert payment amount to monthly equivalent based on frequency
const toMonthlyPayment = (amount: number, frequency: string | null | undefined): number => {
  switch (frequency) {
    case "Weekly":
      return amount * 52 / 12; // 52 weeks per year
    case "Biweekly":
      return amount * 26 / 12; // 26 biweekly payments per year
    case "Semi-monthly":
      return amount * 2; // 2 payments per month
    case "Quarterly":
      return amount / 3; // 4 payments per year
    case "Annually":
      return amount / 12; // 1 payment per year
    case "Monthly":
    default:
      return amount;
  }
};

interface PayoffScheduleItem {
  month: number;
  date: Date;
  debtName: string;
  payment: number;
  principal: number;
  interest: number;
  remainingBalance: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCurrencyPrecise(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

// Calculate payoff schedule for a single debt
function calculateDebtPayoff(
  balance: number,
  interestRate: number,
  monthlyPayment: number,
  startDate: Date = new Date()
): { months: number; totalInterest: number; schedule: PayoffScheduleItem[] } {
  const schedule: PayoffScheduleItem[] = [];
  let remainingBalance = balance;
  let month = 0;
  let totalInterest = 0;
  const monthlyRate = interestRate / 100 / 12;

  while (remainingBalance > 0 && month < 360) { // Max 30 years
    month++;
    const interest = remainingBalance * monthlyRate;
    const payment = Math.min(monthlyPayment, remainingBalance + interest);
    const principal = payment - interest;
    remainingBalance = Math.max(0, remainingBalance - principal);
    totalInterest += interest;

    schedule.push({
      month,
      date: addMonths(startDate, month),
      debtName: "",
      payment,
      principal,
      interest,
      remainingBalance,
    });
  }

  return { months: month, totalInterest, schedule };
}

// Calculate debt avalanche payoff (highest interest first)
function calculateAvalanche(
  debts: DebtItem[],
  extraPayment: number = 0
): { months: number; totalInterest: number; payoffOrder: string[]; schedule: PayoffScheduleItem[] } {
  if (debts.length === 0) {
    return { months: 0, totalInterest: 0, payoffOrder: [], schedule: [] };
  }

  // Sort by interest rate (highest first)
  const sortedDebts = [...debts].sort((a, b) => b.interestRate - a.interestRate);
  const balances = new Map(sortedDebts.map(d => [d.id, d.balance]));
  const schedule: PayoffScheduleItem[] = [];
  const payoffOrder: string[] = [];

  let month = 0;
  let totalInterest = 0;
  const totalMinPayment = debts.reduce((sum, d) => sum + d.minimumPayment, 0);
  let availableExtra = extraPayment;

  while (Array.from(balances.values()).some(b => b > 0) && month < 360) {
    month++;
    const date = addMonths(new Date(), month);

    for (const debt of sortedDebts) {
      const balance = balances.get(debt.id) || 0;
      if (balance <= 0) continue;

      const monthlyRate = debt.interestRate / 100 / 12;
      const interest = balance * monthlyRate;
      totalInterest += interest;

      // Minimum payment for this debt
      let payment = Math.min(debt.minimumPayment, balance + interest);

      // Add extra payment to highest interest debt with remaining balance
      const isHighestRemainingDebt = sortedDebts
        .filter(d => (balances.get(d.id) || 0) > 0)
        .sort((a, b) => b.interestRate - a.interestRate)[0]?.id === debt.id;

      if (isHighestRemainingDebt && availableExtra > 0) {
        const extraForThisDebt = Math.min(availableExtra + (totalMinPayment - debts.filter(d => (balances.get(d.id) || 0) > 0).reduce((sum, d) => sum + d.minimumPayment, 0)), balance + interest - payment);
        payment += Math.max(0, extraPayment);
      }

      const principal = Math.min(payment - interest, balance);
      const newBalance = Math.max(0, balance - principal);
      balances.set(debt.id, newBalance);

      schedule.push({
        month,
        date,
        debtName: debt.name,
        payment,
        principal,
        interest,
        remainingBalance: newBalance,
      });

      if (newBalance === 0 && balance > 0) {
        payoffOrder.push(debt.name);
      }
    }
  }

  return { months: month, totalInterest, payoffOrder, schedule };
}

// Calculate debt snowball payoff (smallest balance first)
function calculateSnowball(
  debts: DebtItem[],
  extraPayment: number = 0
): { months: number; totalInterest: number; payoffOrder: string[]; schedule: PayoffScheduleItem[] } {
  if (debts.length === 0) {
    return { months: 0, totalInterest: 0, payoffOrder: [], schedule: [] };
  }

  // Sort by balance (smallest first)
  const sortedDebts = [...debts].sort((a, b) => a.balance - b.balance);
  const balances = new Map(sortedDebts.map(d => [d.id, d.balance]));
  const schedule: PayoffScheduleItem[] = [];
  const payoffOrder: string[] = [];

  let month = 0;
  let totalInterest = 0;
  let snowball = extraPayment;

  while (Array.from(balances.values()).some(b => b > 0) && month < 360) {
    month++;
    const date = addMonths(new Date(), month);

    for (const debt of sortedDebts) {
      const balance = balances.get(debt.id) || 0;
      if (balance <= 0) continue;

      const monthlyRate = debt.interestRate / 100 / 12;
      const interest = balance * monthlyRate;
      totalInterest += interest;

      // Minimum payment for this debt
      let payment = debt.minimumPayment;

      // Add snowball to smallest remaining debt
      const isSmallestRemainingDebt = sortedDebts
        .filter(d => (balances.get(d.id) || 0) > 0)
        .sort((a, b) => (balances.get(a.id) || 0) - (balances.get(b.id) || 0))[0]?.id === debt.id;

      if (isSmallestRemainingDebt) {
        payment += snowball;
      }

      payment = Math.min(payment, balance + interest);
      const principal = payment - interest;
      const newBalance = Math.max(0, balance - principal);
      balances.set(debt.id, newBalance);

      schedule.push({
        month,
        date,
        debtName: debt.name,
        payment,
        principal,
        interest,
        remainingBalance: newBalance,
      });

      if (newBalance === 0 && balance > 0) {
        payoffOrder.push(debt.name);
        // Add this debt's minimum payment to the snowball
        snowball += debt.minimumPayment;
      }
    }
  }

  return { months: month, totalInterest, payoffOrder, schedule };
}

const DEBT_CATEGORIES = ["Credit Card", "Line of Credit", "Loans", "Mortgage", "Student Loans", "Auto Loan", "Other"];

export default function DebtPayoff() {
  const { toast } = useToast();
  const [extraPayment, setExtraPayment] = useState<number>(0);
  const [selectedMethod, setSelectedMethod] = useState<"avalanche" | "snowball">("avalanche");
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Fetch debt details from the new API
  const { data: debtDetails = [], isLoading: isLoadingDebts } = useQuery<DebtDetails[]>({
    queryKey: ["/api/debts"],
  });

  // Fetch Plaid accounts for credit/loan accounts not yet in debt details
  // The API returns grouped accounts by institution, we need to flatten them
  type GroupedAccounts = {
    id: string;
    institutionName: string;
    accounts: PlaidAccount[];
  };
  
  const { data: groupedAccounts = [], isLoading: isLoadingAccounts } = useQuery<GroupedAccounts[]>({
    queryKey: ["/api/plaid/accounts"],
  });
  
  // Flatten all accounts from all institutions
  const plaidAccounts = useMemo(() => {
    return groupedAccounts.flatMap(group => group.accounts || []);
  }, [groupedAccounts]);

  // Convert debt details to debt items (with monthly payment conversion)
  const debtItems: DebtItem[] = useMemo(() => {
    return debtDetails.map(debt => ({
      id: debt.id,
      name: debt.name,
      balance: parseFloat(debt.currentBalance),
      interestRate: parseFloat(debt.apr),
      minimumPayment: toMonthlyPayment(parseFloat(debt.minimumPayment), debt.paymentFrequency),
      category: debt.debtType,
    }));
  }, [debtDetails]);

  // Get linked Plaid account IDs from debt details
  const linkedPlaidAccountIds = useMemo(() => {
    return new Set(debtDetails.filter(d => d.linkedPlaidAccountId).map(d => d.linkedPlaidAccountId));
  }, [debtDetails]);

  // Add unlinked Plaid credit/loan accounts as potential debts (with 0% APR until set)
  const unlinkedPlaidDebts: DebtItem[] = useMemo(() => {
    return plaidAccounts
      .filter(account =>
        ["credit", "loan"].includes(account.type) &&
        account.isActive !== "false" && // Include active and default accounts
        !linkedPlaidAccountIds.has(account.id) &&
        account.balanceCurrent &&
        parseFloat(account.balanceCurrent) > 0
      )
      .map(account => ({
        id: `plaid-${account.id}`,
        name: `${account.name}${account.mask ? ` (${account.mask})` : ""}`,
        balance: Math.abs(parseFloat(account.balanceCurrent || "0")),
        interestRate: 0, // Unknown until user sets it in Debts page
        minimumPayment: Math.abs(parseFloat(account.balanceCurrent || "0")) * 0.02, // Estimate 2% minimum
        category: account.type === "credit" ? "Credit Card" : "Loans",
      }));
  }, [plaidAccounts, linkedPlaidAccountIds]);

  // Combine all debts
  const allDebts = useMemo(() => {
    return [...debtItems, ...unlinkedPlaidDebts];
  }, [debtItems, unlinkedPlaidDebts]);

  const isLoading = isLoadingDebts || isLoadingAccounts;

  // Calculate payoff results
  const avalancheResult = useMemo(() => calculateAvalanche(allDebts, extraPayment), [allDebts, extraPayment]);
  const snowballResult = useMemo(() => calculateSnowball(allDebts, extraPayment), [allDebts, extraPayment]);

  const selectedResult = selectedMethod === "avalanche" ? avalancheResult : snowballResult;

  const totalDebt = allDebts.reduce((sum, d) => sum + d.balance, 0);
  const totalMinPayments = allDebts.reduce((sum, d) => sum + d.minimumPayment, 0);
  const interestSaved = snowballResult.totalInterest - avalancheResult.totalInterest;
  const payoffDate = addMonths(new Date(), selectedResult.months);

  // Calculate weighted average APR
  const weightedAvgApr = useMemo(() => {
    if (totalDebt === 0) return 0;
    return allDebts.reduce((sum, d) => sum + (d.interestRate * d.balance), 0) / totalDebt;
  }, [allDebts, totalDebt]);

  // Count debts missing APR
  const debtsWithoutApr = allDebts.filter(d => d.interestRate === 0).length;

  // AI Analysis function
  const handleAiAnalysis = async () => {
    if (allDebts.length === 0) {
      toast({ title: "No debts to analyze", description: "Add some debts first to get AI recommendations.", variant: "destructive" });
      return;
    }

    setIsAnalyzing(true);
    setAiAnalysis(null);

    try {
      const debtSummary = allDebts.map(d => 
        `${d.name}: Balance $${d.balance.toFixed(0)}, APR ${d.interestRate}%, Min Payment $${d.minimumPayment.toFixed(0)}`
      ).join("; ");

      const prompt = `As a financial advisor, analyze these debts and provide a personalized payoff strategy:

Debts: ${debtSummary}

Total Debt: $${totalDebt.toFixed(0)}
Monthly Minimum Payments: $${totalMinPayments.toFixed(0)}
Weighted Average APR: ${weightedAvgApr.toFixed(1)}%
Extra Monthly Payment Available: $${extraPayment}

Avalanche Method: ${avalancheResult.months} months, $${avalancheResult.totalInterest.toFixed(0)} total interest
Snowball Method: ${snowballResult.months} months, $${snowballResult.totalInterest.toFixed(0)} total interest

Provide:
1. Which strategy is best for this person and why
2. Debt-to-payment ratio analysis
3. Specific action steps to accelerate payoff
4. One creative tip to save more money on interest

Keep the response concise and actionable.`;

      const response = await apiRequest("POST", "/api/ai/chat", { message: prompt });
      const data = await response.json();
      setAiAnalysis(data.message);
    } catch (error) {
      toast({ title: "Analysis failed", description: "Unable to get AI recommendations. Please try again.", variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Debt Payoff Tools</h1>
          <p className="text-muted-foreground">Calculate your path to becoming debt-free</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Debt Payoff Tools</h1>
            <HelpTooltip
              title="Debt Payoff Strategies"
              content="Use the Avalanche method (highest interest first) to save money, or the Snowball method (smallest balance first) for quick wins that build motivation."
            />
          </div>
          <p className="text-muted-foreground">Calculate your path to becoming debt-free</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleAiAnalysis}
            disabled={isAnalyzing || allDebts.length === 0}
            data-testid="button-ai-analyze"
          >
            {isAnalyzing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Brain className="h-4 w-4 mr-2" />
            )}
            AI Advisor
          </Button>
          <Button asChild data-testid="button-manage-debts">
            <Link href="/debts">
              <Edit className="h-4 w-4 mr-2" />
              Manage Debts
            </Link>
          </Button>
        </div>
      </div>

      {debtsWithoutApr > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {debtsWithoutApr} debt{debtsWithoutApr > 1 ? "s are" : " is"} missing APR information
              </p>
              <p className="text-xs text-muted-foreground">
                Add interest rates in the <Link href="/debts" className="text-primary underline">Debts page</Link> for accurate payoff calculations
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {aiAnalysis && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Debt Payoff Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
              {aiAnalysis}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-950">
                <CreditCard className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Debt</p>
                <p className="text-2xl font-bold">{formatCurrency(totalDebt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950">
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Min. Payments</p>
                <p className="text-2xl font-bold">{formatCurrency(totalMinPayments)}/mo</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-950">
                <Scale className="w-5 h-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  Debt Ratio
                  <HelpTooltip 
                    title="Debt-to-Payment Ratio" 
                    content="Total debt divided by monthly payments. Lower is better. Under 20x is manageable, 20-36x needs attention, over 36x is high-risk." 
                  />
                </p>
                <p className={`text-2xl font-bold ${
                  totalMinPayments === 0 ? "" :
                  totalDebt / totalMinPayments <= 20 ? "text-green-600" :
                  totalDebt / totalMinPayments <= 36 ? "text-amber-600" :
                  "text-red-600"
                }`}>
                  {totalMinPayments > 0 ? `${(totalDebt / totalMinPayments).toFixed(1)}x` : "N/A"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-950">
                <Calendar className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Debt-Free Date</p>
                <p className="text-2xl font-bold">
                  {allDebts.length > 0 ? format(payoffDate, "MMM yyyy") : "N/A"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-950">
                <TrendingDown className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Interest</p>
                <p className="text-2xl font-bold">{formatCurrency(selectedResult.totalInterest)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Debts List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Your Debts
              </span>
              <Button size="sm" variant="outline" asChild data-testid="button-add-debt-link">
                <Link href="/debts">
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Link>
              </Button>
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              {allDebts.length} debt{allDebts.length !== 1 ? "s" : ""} tracked
              {weightedAvgApr > 0 && (
                <Badge variant="outline" className="text-xs">
                  <Percent className="h-3 w-3 mr-1" />
                  {weightedAvgApr.toFixed(1)}% avg APR
                </Badge>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {allDebts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No debts tracked yet.</p>
                <p className="text-sm mb-4">Add your debts to see payoff strategies.</p>
                <Button asChild size="sm">
                  <Link href="/debts">Add Your First Debt</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {allDebts.map((debt) => (
                  <div key={debt.id} className="p-3 rounded-lg border bg-card">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium">{debt.name}</p>
                        <Badge variant="secondary" className="text-xs mt-1">
                          {debt.category}
                        </Badge>
                      </div>
                      {debt.interestRate === 0 && (
                        <Badge variant="outline" className="text-xs text-yellow-600">
                          Missing APR
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Balance</p>
                        <p className="font-medium">{formatCurrency(debt.balance)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Rate</p>
                        <p className={`font-medium ${debt.interestRate === 0 ? "text-yellow-600" : ""}`}>
                          {debt.interestRate}%
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Min.</p>
                        <p className="font-medium">{formatCurrency(debt.minimumPayment)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payoff Calculator */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5" />
              Payoff Calculator
            </CardTitle>
            <CardDescription>
              Compare strategies and see how extra payments help
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Extra Payment Input */}
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <Label>Extra Monthly Payment</Label>
                <div className="flex items-center gap-2 mt-1">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <Input
                    type="number"
                    value={extraPayment}
                    onChange={(e) => setExtraPayment(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="max-w-32"
                  />
                  <span className="text-sm text-muted-foreground">/ month</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Monthly</p>
                <p className="text-lg font-bold">
                  {formatCurrency(totalMinPayments + extraPayment)}
                </p>
              </div>
            </div>

            {/* Strategy Comparison */}
            <Tabs value={selectedMethod} onValueChange={(v) => setSelectedMethod(v as "avalanche" | "snowball")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="avalanche" className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Avalanche
                </TabsTrigger>
                <TabsTrigger value="snowball" className="flex items-center gap-2">
                  <Snowflake className="w-4 h-4" />
                  Snowball
                </TabsTrigger>
              </TabsList>

              <TabsContent value="avalanche" className="mt-4">
                <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-orange-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-orange-800 dark:text-orange-200">Debt Avalanche</p>
                      <p className="text-sm text-orange-700 dark:text-orange-300">
                        Pay off highest interest rate first. Saves you the most money in interest.
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="snowball" className="mt-4">
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start gap-3">
                    <Snowflake className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-800 dark:text-blue-200">Debt Snowball</p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Pay off smallest balance first. Builds momentum with quick wins.
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Comparison Table */}
            {allDebts.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div className={`p-4 rounded-lg border-2 ${selectedMethod === "avalanche" ? "border-primary bg-primary/5" : "border-muted"}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-orange-500" />
                    <span className="font-medium">Avalanche</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Time to payoff</span>
                      <span className="font-medium">{avalancheResult.months} months</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total interest</span>
                      <span className="font-medium">{formatCurrency(avalancheResult.totalInterest)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Debt-free</span>
                      <span className="font-medium">{format(addMonths(new Date(), avalancheResult.months), "MMM yyyy")}</span>
                    </div>
                  </div>
                </div>

                <div className={`p-4 rounded-lg border-2 ${selectedMethod === "snowball" ? "border-primary bg-primary/5" : "border-muted"}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Snowflake className="w-4 h-4 text-blue-500" />
                    <span className="font-medium">Snowball</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Time to payoff</span>
                      <span className="font-medium">{snowballResult.months} months</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total interest</span>
                      <span className="font-medium">{formatCurrency(snowballResult.totalInterest)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Debt-free</span>
                      <span className="font-medium">{format(addMonths(new Date(), snowballResult.months), "MMM yyyy")}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Interest Savings */}
            {interestSaved > 0 && (
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2">
                  <PiggyBank className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-green-800 dark:text-green-200">
                    Avalanche saves you {formatCurrency(interestSaved)} in interest!
                  </span>
                </div>
              </div>
            )}

            {/* Payoff Order */}
            {selectedResult.payoffOrder.length > 0 && (
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Payoff Order
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedResult.payoffOrder.map((name, index) => (
                    <div key={name} className="flex items-center gap-2">
                      <Badge variant="outline" className="flex items-center gap-1">
                        <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                          {index + 1}
                        </span>
                        {name}
                      </Badge>
                      {index < selectedResult.payoffOrder.length - 1 && (
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    <Badge className="bg-green-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Debt Free!
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Extra Payment Impact */}
      {allDebts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Extra Payment Impact
            </CardTitle>
            <CardDescription>
              See how additional payments accelerate your payoff
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Extra Payment</TableHead>
                  <TableHead>Months to Payoff</TableHead>
                  <TableHead>Total Interest</TableHead>
                  <TableHead>Interest Saved</TableHead>
                  <TableHead>Debt-Free Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[0, 50, 100, 200, 500].map((extra) => {
                  const result = calculateAvalanche(allDebts, extra);
                  const baseResult = calculateAvalanche(allDebts, 0);
                  const saved = baseResult.totalInterest - result.totalInterest;

                  return (
                    <TableRow key={extra} className={extra === extraPayment ? "bg-primary/5" : ""}>
                      <TableCell className="font-medium">
                        {extra === 0 ? "Minimum only" : `+${formatCurrency(extra)}/mo`}
                        {extra === extraPayment && extra > 0 && (
                          <Badge variant="outline" className="ml-2 text-xs">Current</Badge>
                        )}
                      </TableCell>
                      <TableCell>{result.months} months</TableCell>
                      <TableCell>{formatCurrency(result.totalInterest)}</TableCell>
                      <TableCell className={saved > 0 ? "text-green-600 font-medium" : ""}>
                        {saved > 0 ? formatCurrency(saved) : "-"}
                      </TableCell>
                      <TableCell>{format(addMonths(new Date(), result.months), "MMM yyyy")}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {allDebts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No Debts to Calculate</h3>
            <p className="text-muted-foreground mb-4">
              Add debts with balances to see your payoff projections.
            </p>
            <Button asChild>
              <Link href="/debts">Add Your First Debt</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
