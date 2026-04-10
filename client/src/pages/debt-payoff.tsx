// FEATURE: DEBT_PAYOFF_PLANNER | tier: pro | limit: unlimited
import { useState, useMemo, useEffect } from "react";
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
import { format, addMonths } from "date-fns";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { DebtDetails, PlaidAccount } from "@shared/schema";
import { useFeatureUsage } from "@/contexts/FeatureUsageContext";
import { trackUpgradeCta } from "@/lib/trackUpgradeCta";

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
      return amount * 52 / 12;
    case "Biweekly":
      return amount * 26 / 12;
    case "Semi-monthly":
      return amount * 2;
    case "Quarterly":
      return amount / 3;
    case "Annually":
      return amount / 12;
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

  while (remainingBalance > 0 && month < 360) {
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

function calculateAvalanche(
  debts: DebtItem[],
  extraPayment: number = 0
): { months: number; totalInterest: number; payoffOrder: string[]; schedule: PayoffScheduleItem[] } {
  if (debts.length === 0) {
    return { months: 0, totalInterest: 0, payoffOrder: [], schedule: [] };
  }

  // Avalanche: sort by highest interest rate first
  const sortedDebts = [...debts].sort((a, b) => b.interestRate - a.interestRate);
  const balances = new Map(sortedDebts.map(d => [d.id, d.balance]));
  const schedule: PayoffScheduleItem[] = [];
  const payoffOrder: string[] = [];

  let month = 0;
  let totalInterest = 0;

  while (Array.from(balances.values()).some(b => b > 0) && month < 360) {
    month++;
    const date = addMonths(new Date(), month);

    // Identify the highest-rate debt that still has a balance
    const highestRateDebtId = sortedDebts
      .filter(d => (balances.get(d.id) || 0) > 0)
      .sort((a, b) => b.interestRate - a.interestRate)[0]?.id;

    for (const debt of sortedDebts) {
      const balance = balances.get(debt.id) || 0;
      if (balance <= 0) continue;

      const monthlyRate = debt.interestRate / 100 / 12;
      const interest = balance * monthlyRate;
      totalInterest += interest;

      // Base payment: minimum payment, but don't overpay
      let payment = Math.min(debt.minimumPayment, balance + interest);

      // Apply extra payment to highest-rate remaining debt
      if (debt.id === highestRateDebtId && extraPayment > 0) {
        const remaining = balance + interest - payment;
        payment += Math.min(extraPayment, remaining);
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

function calculateSnowball(
  debts: DebtItem[],
  extraPayment: number = 0
): { months: number; totalInterest: number; payoffOrder: string[]; schedule: PayoffScheduleItem[] } {
  if (debts.length === 0) {
    return { months: 0, totalInterest: 0, payoffOrder: [], schedule: [] };
  }

  // Snowball: sort by smallest balance first
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

    // Identify the smallest-balance debt that still has a balance
    const smallestBalanceDebtId = sortedDebts
      .filter(d => (balances.get(d.id) || 0) > 0)
      .sort((a, b) => (balances.get(a.id) || 0) - (balances.get(b.id) || 0))[0]?.id;

    for (const debt of sortedDebts) {
      const balance = balances.get(debt.id) || 0;
      if (balance <= 0) continue;

      const monthlyRate = debt.interestRate / 100 / 12;
      const interest = balance * monthlyRate;
      totalInterest += interest;

      let payment = debt.minimumPayment;

      // Apply rolling snowball to smallest-balance debt
      if (debt.id === smallestBalanceDebtId) {
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
        // Roll freed minimum payment into the snowball
        snowball += debt.minimumPayment;
      }
    }
  }

  return { months: month, totalInterest, payoffOrder, schedule };
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
  debts: DebtItem[];
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

  const { data: debtDetails = [], isLoading: isLoadingDebts } = useQuery<DebtDetails[]>({
    queryKey: ["/api/debts"],
  });

  type GroupedAccounts = {
    id: string;
    institutionName: string;
    accounts: PlaidAccount[];
  };

  const { data: groupedAccounts = [], isLoading: isLoadingAccounts } = useQuery<GroupedAccounts[]>({
    queryKey: ["/api/plaid/accounts"],
  });

  const plaidAccounts = useMemo(() => {
    return groupedAccounts.flatMap(group => group.accounts || []);
  }, [groupedAccounts]);

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

  const linkedPlaidAccountIds = useMemo(() => {
    return new Set(debtDetails.filter(d => d.linkedPlaidAccountId).map(d => d.linkedPlaidAccountId));
  }, [debtDetails]);

  const unlinkedPlaidDebts: DebtItem[] = useMemo(() => {
    return plaidAccounts
      .filter(account =>
        ["credit", "loan"].includes(account.type) &&
        account.isActive !== "false" &&
        !linkedPlaidAccountIds.has(account.id) &&
        account.balanceCurrent &&
        parseFloat(account.balanceCurrent) > 0
      )
      .map(account => ({
        id: `plaid-${account.id}`,
        name: `${account.name}${account.mask ? ` (${account.mask})` : ""}`,
        balance: Math.abs(parseFloat(account.balanceCurrent || "0")),
        interestRate: 0,
        minimumPayment: Math.abs(parseFloat(account.balanceCurrent || "0")) * 0.02,
        category: account.type === "credit" ? "Credit Card" : "Loans",
      }));
  }, [plaidAccounts, linkedPlaidAccountIds]);

  const allDebts = useMemo(() => {
    return [...debtItems, ...unlinkedPlaidDebts];
  }, [debtItems, unlinkedPlaidDebts]);

  const isLoading = isLoadingDebts || isLoadingAccounts;

  const avalancheResult = useMemo(() => calculateAvalanche(allDebts, extraPayment), [allDebts, extraPayment]);
  const snowballResult = useMemo(() => calculateSnowball(allDebts, extraPayment), [allDebts, extraPayment]);

  const selectedResult = selectedMethod === "avalanche" ? avalancheResult : snowballResult;

  const totalDebt = allDebts.reduce((sum, d) => sum + d.balance, 0);
  const totalMinPayments = allDebts.reduce((sum, d) => sum + d.minimumPayment, 0);
  const interestSaved = snowballResult.totalInterest - avalancheResult.totalInterest;
  const payoffDate = addMonths(new Date(), selectedResult.months);

  const weightedAvgApr = useMemo(() => {
    if (totalDebt === 0) return 0;
    return allDebts.reduce((sum, d) => sum + (d.interestRate * d.balance), 0) / totalDebt;
  }, [allDebts, totalDebt]);

  const debtsWithoutApr = allDebts.filter(d => d.interestRate === 0).length;
  // "All debts missing APR" = every debt is at 0% — this is the blocking state
  const allAprMissing = allDebts.length > 0 && debtsWithoutApr === allDebts.length;
  // Debt-to-Payment ratio (monthly):
  // Formula: Total Debt ÷ Total Monthly Minimum Payments
  // Interpretation: How many months of minimum payments equal your total debt.
  // E.g., 72x means it would take 72 months (6 years) of minimums to clear the principal alone.
  // Thresholds: <20x = manageable, 20-36x = caution, 36-60x = high, >60x = critical
  const debtToPaymentRatioMonthly = totalMinPayments > 0 ? totalDebt / totalMinPayments : null;
  // Annual equivalent = monthly ratio ÷ 12 (total debt vs annual payments)
  const debtToPaymentRatioAnnual = debtToPaymentRatioMonthly !== null ? debtToPaymentRatioMonthly / 12 : null;

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

      {/* ── BLOCKING APR Warning ── */}
      {allAprMissing && (
        <Card className="border-destructive/60 bg-destructive/5 shadow-sm">
          <CardContent className="py-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-start gap-3 flex-1">
                <AlertTriangle className="h-6 w-6 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-destructive text-sm">
                    Interest rates are required for accurate payoff calculations
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Without APR, projections assume 0% interest which is unrealistic. All{" "}
                    <strong>{allDebts.length} debt{allDebts.length !== 1 ? "s" : ""}</strong> are currently
                    missing interest rates — payoff dates, total interest, and extra payment savings shown
                    below are not meaningful until rates are set.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setShowAprDialog(true)}
                className="shrink-0 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                data-testid="button-set-interest-rates"
              >
                <Percent className="h-4 w-4 mr-2" />
                Set Interest Rates
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Partial APR warning (some missing, but not all) ── */}
      {!allAprMissing && debtsWithoutApr > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {debtsWithoutApr} debt{debtsWithoutApr > 1 ? "s are" : " is"} missing APR information
              </p>
              <p className="text-xs text-muted-foreground">
                Projections for these debts assume 0% interest. Add interest rates for accurate calculations.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-yellow-500/50 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/10"
              onClick={() => setShowAprDialog(true)}
            >
              <Percent className="h-3 w-3 mr-1" />
              Set Rates
            </Button>
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
                        <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-400">
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
            {debtsWithoutApr > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setShowAprDialog(true)}
                data-testid="button-set-apr-inline"
              >
                <Percent className="h-3 w-3 mr-1" />
                Set Interest Rates
              </Button>
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
                    {avalancheResult.payoffOrder.length > 0 && (
                      <div className="pt-1 border-t border-dashed">
                        <p className="text-muted-foreground text-xs mb-1">First payoff:</p>
                        <p className="text-xs font-medium truncate">{avalancheResult.payoffOrder[0]}</p>
                      </div>
                    )}
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
                    {snowballResult.payoffOrder.length > 0 && (
                      <div className="pt-1 border-t border-dashed">
                        <p className="text-muted-foreground text-xs mb-1">First payoff:</p>
                        <p className="text-xs font-medium truncate">{snowballResult.payoffOrder[0]}</p>
                      </div>
                    )}
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
                  Payoff Order ({selectedMethod === "avalanche" ? "highest rate first" : "smallest balance first"})
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
              {allAprMissing && (
                <span className="ml-1 text-destructive font-medium">
                  — set interest rates above for accurate projections
                </span>
              )}
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

      {/* Set APR Dialog */}
      <SetAprDialog
        open={showAprDialog}
        onClose={() => setShowAprDialog(false)}
        debts={allDebts}
        onSaved={() => {}}
      />
    </div>
    </DebtPayoffGate>
  );
}
