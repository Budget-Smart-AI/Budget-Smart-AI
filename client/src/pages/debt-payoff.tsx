// FEATURE: DEBT_PAYOFF_PLANNER | tier: pro | limit: unlimited
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpTooltip } from "@/components/help-tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  Lock,
  BarChart3,
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
// 2026-04-22: parseISO added to the import — line 475 uses it to parse
// payoffData.payoffDate. Previously unimported; would have thrown a
// ReferenceError at runtime once any user had a debt with a valid
// payoffDate. Short-circuited today (totalDebt === 0 → payoffDate
// falsy → ternary skipped), but a latent crash as soon as debts exist.
import { format, addMonths, parseISO } from "date-fns";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { DebtDetails } from "@shared/schema";
import { useFeatureUsage } from "@/contexts/FeatureUsageContext";
import { trackUpgradeCta } from "@/lib/trackUpgradeCta";

interface DebtPayoffScheduleItem {
  month: number;
  date: string;
  payment: number;
  principal: number;
  interest: number;
  remainingBalance: number;
}

interface DebtPayoffResult {
  totalDebt: number;
  totalMinPayments: number;
  weightedAvgApr: number;
  avalanche: {
    months: number;
    totalInterest: number;
    totalPaid: number;
    payoffOrder: string[];
    schedule: DebtPayoffScheduleItem[];
  };
  snowball: {
    months: number;
    totalInterest: number;
    totalPaid: number;
    payoffOrder: string[];
    schedule: DebtPayoffScheduleItem[];
  };
  interestSaved: number;
  payoffDate: string;
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

// ── Default APR ranges by account type ──────────────────────────────────────
// These are realistic market ranges as of 2024-2025
const DEFAULT_APR_RANGES: Record<string, { min: number; max: number; suggested: number; label: string }> = {
  "Mortgage":        { min: 4.0,  max: 7.0,   suggested: 6.0,   label: "4–7%" },
  "Credit Card":     { min: 19.99, max: 22.99, suggested: 21.99, label: "19.99–22.99%" },
  "Line of Credit":  { min: 7.0,  max: 12.0,  suggested: 9.5,   label: "7–12%" },
  "HELOC":           { min: 7.0,  max: 12.0,  suggested: 9.5,   label: "7–12%" },
  "Auto Loan":       { min: 5.0,  max: 9.0,   suggested: 7.0,   label: "5–9%" },
  "Student Loan":    { min: 5.0,  max: 8.0,   suggested: 6.5,   label: "5–8%" },
  "Personal Loan":   { min: 9.0,  max: 18.0,  suggested: 12.0,  label: "9–18%" },
  "Medical Debt":    { min: 0.0,  max: 8.0,   suggested: 0.0,   label: "0–8%" },
  "Other":           { min: 8.0,  max: 20.0,  suggested: 10.0,  label: "8–20%" },
};

function getSuggestedApr(category: string): number {
  return DEFAULT_APR_RANGES[category]?.suggested ?? 10.0;
}

function getAprRangeLabel(category: string): string {
  return DEFAULT_APR_RANGES[category]?.label ?? "8–20%";
}

// ─── Debt Payoff Upgrade Gate ─────────────────────────────────────────────────
function DebtPayoffGate({ children }: { children: React.ReactNode }) {
  const { getFeatureState, isLoading } = useFeatureUsage();
  const [, navigate] = useLocation();

  if (isLoading) return <>{children}</>;

  const state = getFeatureState("debt_payoff_planner");

  if (!state || state.allowed) return <>{children}</>;

  return (
    <div className="container mx-auto px-4 py-4 sm:p-6 max-w-4xl">
      {/* Page header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="h-10 w-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
          <TrendingDown className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Debt Payoff Planner</h1>
          <p className="text-sm text-muted-foreground">Your personalized path to becoming debt-free</p>
        </div>
      </div>

      {/* Upgrade card */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-background via-background to-amber-950/10 shadow-[0_0_60px_rgba(245,158,11,0.08)]">
        {/* Shimmer sweep */}
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            background: 'linear-gradient(105deg, transparent 35%, rgba(245,158,11,0.06) 50%, transparent 65%)',
            animation: 'shimmer 3s ease-in-out infinite',
          }}
        />
        <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>

        <div className="relative z-10 px-6 py-10 sm:px-12 sm:py-14 flex flex-col items-center text-center gap-6">
          {/* Icon */}
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/15 border border-amber-500/20">
            <Lock className="h-10 w-10 text-amber-400" />
          </div>

          {/* Headline */}
          <div className="space-y-2 max-w-xl">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Debt Payoff Planner
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              Stop guessing when you'll be debt-free. Pro users get a precise, month-by-month plan —
              <span className="text-amber-400 font-semibold"> see exactly how much interest you'll save and when you'll be free.</span>
            </p>
          </div>

          {/* Feature bullets — 2-column grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg text-left">
            {[
              { icon: Calculator, text: "Avalanche vs Snowball comparison — see which strategy saves you the most money" },
              { icon: TrendingDown, text: "Exact debt-free date projections with month-by-month payoff schedule" },
              { icon: Zap, text: "See how even $50/month extra can shave years off your debt and save thousands" },
              { icon: BarChart3, text: "AI Debt Advisor analyzes your situation and gives personalized payoff recommendations" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
                <Icon className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <span className="text-sm text-muted-foreground leading-snug">{text}</span>
              </div>
            ))}
          </div>

          {/* Social proof */}
          <div className="flex flex-col sm:flex-row items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-green-400" />
              <span>Pro users save an average of <strong className="text-foreground">$4,200 in interest</strong> using our planner</span>
            </div>
            <span className="hidden sm:inline text-border">·</span>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-blue-400" />
              <span>Become debt-free months or years sooner</span>
            </div>
          </div>

          {/* CTA */}
          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            <Button
              size="lg"
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-black hover:from-amber-400 hover:to-yellow-400 font-bold text-base shadow-lg shadow-amber-500/20"
              onClick={() => {
                trackUpgradeCta("feature_gate");
                navigate("/upgrade");
              }}
            >
              Unlock Debt Payoff Planner →
            </Button>
            <p className="text-xs text-muted-foreground">
              Cancel anytime. Your financial freedom starts today.
            </p>
          </div>
        </div>
      </div>

      {/* Blurred preview */}
      <div className="mt-6 relative overflow-hidden rounded-xl border border-border/50 opacity-40 pointer-events-none select-none">
        <div className="absolute inset-0 z-10" style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
        <div className="p-5 space-y-4">
          {/* Preview summary cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Debt", value: "$24,500" },
              { label: "Debt-Free Date", value: "Mar 2028" },
              { label: "Interest Saved", value: "$3,840" },
            ].map(item => (
              <div key={item.label} className="border rounded-lg p-3 bg-muted/20">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-lg font-bold">{item.value}</p>
              </div>
            ))}
          </div>
          {/* Preview debt list */}
          <div className="space-y-2">
            {[
              { name: "Visa Credit Card", balance: "$8,200", rate: "19.99%", min: "$164/mo" },
              { name: "Car Loan", balance: "$12,400", rate: "6.9%", min: "$280/mo" },
              { name: "Student Loan", balance: "$3,900", rate: "5.5%", min: "$85/mo" },
            ].map(debt => (
              <div key={debt.name} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{debt.name}</p>
                    <p className="text-xs text-muted-foreground">{debt.rate} APR · {debt.min}</p>
                  </div>
                </div>
                <p className="text-sm font-bold">{debt.balance}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const DEBT_CATEGORIES = ["Credit Card", "Line of Credit", "Loans", "Mortgage", "Student Loans", "Auto Loan", "Other"];

// ── Set Interest Rates Dialog ─────────────────────────────────────────────────
interface AprEditRow {
  id: string;
  name: string;
  category: string;
  currentApr: number;
  suggestedApr: number;
  editedApr: string;
  isPlaid: boolean;
}

interface SetAprDialogProps {
  open: boolean;
  onClose: () => void;
  debts: DebtDetails[];
  onSaved: () => void;
}

function SetAprDialog({ open, onClose, debts, onSaved }: SetAprDialogProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<AprEditRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize rows when dialog opens
  useEffect(() => {
    if (open) {
      setRows(
        debts
          .filter(d => !d.id.startsWith("plaid-")) // only manual debts can be saved via API
          .map(d => ({
            id: d.id,
            name: d.name,
            category: d.category,
            currentApr: d.interestRate,
            suggestedApr: getSuggestedApr(d.category),
            editedApr: d.interestRate > 0 ? String(d.interestRate) : String(getSuggestedApr(d.category)),
            isPlaid: false,
          }))
      );
    }
  }, [open, debts]);

  const updateRow = (id: string, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, editedApr: value } : r));
  };

  const handleSave = async () => {
    setIsSaving(true);
    const results: { success: boolean; name: string }[] = [];

    for (const row of rows) {
      const apr = parseFloat(row.editedApr);
      if (isNaN(apr) || apr < 0 || apr > 100) {
        results.push({ success: false, name: row.name });
        continue;
      }
      // Only save if the value actually changed
      if (apr === row.currentApr) continue;

      try {
        await apiRequest("PUT", `/api/debts/${row.id}`, { apr: apr.toFixed(2) });
        results.push({ success: true, name: row.name });
      } catch {
        results.push({ success: false, name: row.name });
      }
    }

    setIsSaving(false);
    const saved = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    if (failed > 0) {
      toast({
        title: "Some rates could not be saved",
        description: `${saved} updated, ${failed} failed. You can edit rates directly on the Debts page.`,
        variant: "destructive",
      });
    } else if (saved > 0) {
      toast({
        title: "Interest rates saved",
        description: `Updated APR for ${saved} debt${saved !== 1 ? "s" : ""}. Payoff projections now reflect accurate rates.`,
      });
    }

    queryClient.invalidateQueries({ queryKey: ["/api/debts"] });
    onSaved();
    onClose();
  };

  const plaidOnly = debts.every(d => d.id.startsWith("plaid-"));

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-primary" />
            Set Interest Rates (APR)
          </DialogTitle>
          <DialogDescription>
            Review and confirm the APR for each debt. Suggested rates are based on typical market ranges
            for each debt type. You can edit any value before saving.
          </DialogDescription>
        </DialogHeader>

        {plaidOnly ? (
          <div className="py-4 text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
            <p className="font-medium">Plaid-linked accounts cannot be edited here.</p>
            <p className="text-sm mt-1">
              Interest rates for bank-connected accounts are read-only. To set rates, add the debts
              manually on the <Link href="/debts" className="text-primary underline">Debts page</Link>.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map(row => (
              <div key={row.id} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center p-3 rounded-lg border bg-card">
                <div>
                  <p className="font-medium text-sm">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.category} · Typical range: {getAprRangeLabel(row.category)}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Suggested</p>
                  <p className="font-medium text-foreground">{row.suggestedApr}%</p>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={row.editedApr}
                    onChange={e => updateRow(row.id, e.target.value)}
                    className="w-24 text-right"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            ))}

            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">Suggested APR ranges (2024–2025 market rates):</p>
              <ul className="space-y-0.5">
                <li>• <strong>Mortgage:</strong> 4–7% · <strong>Credit Card:</strong> 19.99–22.99%</li>
                <li>• <strong>Line of Credit:</strong> 7–12% · <strong>Auto Loan:</strong> 5–9%</li>
                <li>• <strong>Student Loan:</strong> 5–8% · <strong>Personal Loan:</strong> 9–18%</li>
              </ul>
            </div>
          </div>
        )}

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          {!plaidOnly && (
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Interest Rates"
              )}
            </Button>
          )}
          {plaidOnly && (
            <Button asChild>
              <Link href="/debts">Go to Debts Page</Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DebtPayoff() {
  const { toast } = useToast();
  const [extraPayment, setExtraPayment] = useState<number>(0);
  const [selectedMethod, setSelectedMethod] = useState<"avalanche" | "snowball">("avalanche");
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAprDialog, setShowAprDialog] = useState(false);

  const { data: debts = [] } = useQuery<DebtDetails[]>({
    queryKey: ["/api/debts"],
  });

  const { data: payoffData, isLoading } = useQuery<DebtPayoffResult>({
    queryKey: ["/api/engine/debts", { extraPayment }],
  });

  const selectedResult = selectedMethod === "avalanche" ? payoffData?.avalanche : payoffData?.snowball;
  const totalDebt = payoffData?.totalDebt ?? 0;
  const totalMinPayments = payoffData?.totalMinPayments ?? 0;
  const interestSaved = payoffData?.interestSaved ?? 0;
  const payoffDate = payoffData?.payoffDate ? parseISO(payoffData.payoffDate) : new Date();
  const weightedAvgApr = payoffData?.weightedAvgApr ?? 0;

  const avalancheResult = payoffData?.avalanche;
  const snowballResult = payoffData?.snowball;

  // Debt-to-Payment ratio (monthly):
  // Formula: Total Debt ÷ Total Monthly Minimum Payments
  // Interpretation: How many months of minimum payments equal your total debt.
  // E.g., 72x means it would take 72 months (6 years) of minimums to clear the principal alone.
  // Thresholds: <20x = manageable, 20-36x = caution, 36-60x = high, >60x = critical
  const debtToPaymentRatioMonthly = totalMinPayments > 0 ? totalDebt / totalMinPayments : null;
  // Annual equivalent = monthly ratio ÷ 12 (total debt vs annual payments)
  const debtToPaymentRatioAnnual = debtToPaymentRatioMonthly !== null ? debtToPaymentRatioMonthly / 12 : null;

  const handleAiAnalysis = async () => {
    if (totalDebt === 0) {
      toast({ title: "No debts to analyze", description: "Add some debts first to get AI recommendations.", variant: "destructive" });
      return;
    }

    setIsAnalyzing(true);
    setAiAnalysis(null);

    try {
      const prompt = `As a financial advisor, analyze these debts and provide a personalized payoff strategy:

Total Debt: $${totalDebt.toFixed(0)}
Monthly Minimum Payments: $${totalMinPayments.toFixed(0)}
Weighted Average APR: ${weightedAvgApr.toFixed(1)}%
Extra Monthly Payment Available: $${extraPayment}

Avalanche Method: ${avalancheResult?.months ?? 0} months, $${(avalancheResult?.totalInterest ?? 0).toFixed(0)} total interest
Snowball Method: ${snowballResult?.months ?? 0} months, $${(snowballResult?.totalInterest ?? 0).toFixed(0)} total interest

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
    <DebtPayoffGate>
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
          {/* 2026-04-22: wrapped in TooltipProvider so the disabled state
              (totalDebt === 0) explains itself. Previously the button
              just looked dead — no tooltip, no toast — because disabled
              buttons swallow the onClick that would have fired the
              "No debts to analyze" toast. */}
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button
                    variant="outline"
                    onClick={handleAiAnalysis}
                    disabled={isAnalyzing || totalDebt === 0}
                    data-testid="button-ai-analyze"
                  >
                    {isAnalyzing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Brain className="h-4 w-4 mr-2" />
                    )}
                    AI Advisor
                  </Button>
                </span>
              </TooltipTrigger>
              {totalDebt === 0 && (
                <TooltipContent>
                  <p>Add a debt first to unlock AI payoff recommendations.</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <Button asChild data-testid="button-manage-debts">
            <Link href="/liabilities">
              <Edit className="h-4 w-4 mr-2" />
              Manage Debts
            </Link>
          </Button>
        </div>
      </div>


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
                  {/* FIX: Label explicitly documents "Monthly" ratio so it's unambiguous.
                      Formula: Total Debt ÷ Monthly Minimum Payments.
                      E.g., $87,500 ÷ $1,200/mo = 72.9x means 72.9 months of minimums to clear principal.
                      Annual equivalent = Monthly ratio ÷ 12 (shown in tooltip). */}
                  Debt Ratio
                  <HelpTooltip
                    title="Monthly Debt-to-Payment Ratio"
                    content={`Total debt ÷ monthly minimum payments.\n\nCurrent: ${debtToPaymentRatioMonthly !== null ? debtToPaymentRatioMonthly.toFixed(1) : "N/A"}x monthly (${debtToPaymentRatioAnnual !== null ? debtToPaymentRatioAnnual.toFixed(1) : "N/A"}x annual).\n\nThis shows how many months of minimum payments equal your total debt (ignoring interest). Lower is better.\n\nUnder 20x = manageable · 20–36x = needs attention · 36–60x = high risk · Over 60x = critical`}
                  />
                </p>
                {debtToPaymentRatioMonthly !== null ? (
                  <div>
                    <p className={`text-2xl font-bold ${
                      debtToPaymentRatioMonthly <= 20 ? "text-green-600" :
                      debtToPaymentRatioMonthly <= 36 ? "text-amber-600" :
                      "text-red-600"
                    }`}>
                      {debtToPaymentRatioMonthly.toFixed(1)}x
                    </p>
                    <p className="text-xs text-muted-foreground">
                      monthly · {debtToPaymentRatioAnnual!.toFixed(1)}x annual
                    </p>
                  </div>
                ) : (
                  <p className="text-2xl font-bold">N/A</p>
                )}
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
                  {totalDebt > 0 ? format(payoffDate, "MMM yyyy") : "N/A"}
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
                <p className="text-2xl font-bold">{formatCurrency(selectedResult?.totalInterest ?? 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Summary Card */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Summary
              </span>
              <Button size="sm" variant="outline" asChild data-testid="button-manage-debts-card">
                <Link href="/debts">
                  <Edit className="h-3 w-3 mr-1" />
                  Manage
                </Link>
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {totalDebt === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No debts tracked yet.</p>
                <p className="text-sm mb-4">Add your debts to see payoff strategies.</p>
                {/* 2026-04-22: was `/debts` (which redirects to /liabilities).
                    Using `?add=1` so the Liabilities page auto-opens its
                    Add-Manual-Debt dialog on mount — Ryan's complaint was
                    that clicking this button just navigated away with no
                    obvious next step. */}
                <Button asChild size="sm">
                  <Link href="/liabilities?add=1">Add Your First Debt</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-lg border bg-muted/30">
                  <p className="text-sm text-muted-foreground">Total Debt</p>
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(totalDebt)}</p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/30">
                  <p className="text-sm text-muted-foreground">Minimum Monthly</p>
                  <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalMinPayments)}</p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/30">
                  <p className="text-sm text-muted-foreground">Avg Interest Rate</p>
                  <p className="text-2xl font-bold text-amber-600">{weightedAvgApr.toFixed(1)}%</p>
                </div>
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
            {totalDebt > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div className={`p-4 rounded-lg border-2 ${selectedMethod === "avalanche" ? "border-primary bg-primary/5" : "border-muted"}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-orange-500" />
                    <span className="font-medium">Avalanche</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Time to payoff</span>
                      <span className="font-medium">{avalancheResult?.months} months</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total interest</span>
                      <span className="font-medium">{formatCurrency(avalancheResult?.totalInterest ?? 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Debt-free</span>
                      <span className="font-medium">{avalancheResult ? format(addMonths(new Date(), avalancheResult.months), "MMM yyyy") : "N/A"}</span>
                    </div>
                    {avalancheResult?.payoffOrder.length ? (
                      <div className="pt-1 border-t border-dashed">
                        <p className="text-muted-foreground text-xs mb-1">First payoff:</p>
                        <p className="text-xs font-medium truncate">{avalancheResult.payoffOrder[0]}</p>
                      </div>
                    ) : null}
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
                      <span className="font-medium">{snowballResult?.months} months</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total interest</span>
                      <span className="font-medium">{formatCurrency(snowballResult?.totalInterest ?? 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Debt-free</span>
                      <span className="font-medium">{snowballResult ? format(addMonths(new Date(), snowballResult.months), "MMM yyyy") : "N/A"}</span>
                    </div>
                    {snowballResult?.payoffOrder.length ? (
                      <div className="pt-1 border-t border-dashed">
                        <p className="text-muted-foreground text-xs mb-1">First payoff:</p>
                        <p className="text-xs font-medium truncate">{snowballResult.payoffOrder[0]}</p>
                      </div>
                    ) : null}
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
            {selectedResult?.payoffOrder.length ? (
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Payoff Order ({selectedMethod === "avalanche" ? "highest rate first" : "smallest balance first"})
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                  {(selectedResult?.payoffOrder ?? []).map((name, index) => (
                    <div key={name} className="flex items-center gap-2">
                      <Badge variant="outline" className="flex items-center gap-1">
                        <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                          {index + 1}
                        </span>
                        {name}
                      </Badge>
                      {index < (selectedResult?.payoffOrder?.length ?? 0) - 1 && (
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
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Extra Payment Impact */}
      {totalDebt > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Extra Payment Impact
            </CardTitle>
            <CardDescription>
              See how additional payments accelerate your payoff (Avalanche method)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground mb-4">
              Current extra payment: <span className="font-semibold text-foreground">{formatCurrency(extraPayment)}</span>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="p-4 rounded-lg border bg-muted/30">
                <p className="text-xs text-muted-foreground">Months to Payoff</p>
                <p className="text-2xl font-bold mt-1">{avalancheResult?.months} months</p>
              </div>
              <div className="p-4 rounded-lg border bg-muted/30">
                <p className="text-xs text-muted-foreground">Total Interest</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(avalancheResult?.totalInterest ?? 0)}</p>
              </div>
              <div className="p-4 rounded-lg border bg-muted/30">
                <p className="text-xs text-muted-foreground">Interest Saved vs Min</p>
                <p className="text-2xl font-bold mt-1 text-green-600">{formatCurrency(snowballResult?.totalInterest ? snowballResult.totalInterest - (avalancheResult?.totalInterest ?? 0) : 0)}</p>
              </div>
              <div className="p-4 rounded-lg border bg-muted/30">
                <p className="text-xs text-muted-foreground">Debt-Free Date</p>
                <p className="text-lg font-bold mt-1">{avalancheResult ? format(addMonths(new Date(), avalancheResult.months), "MMM yyyy") : "N/A"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </DebtPayoffGate>
  );
}