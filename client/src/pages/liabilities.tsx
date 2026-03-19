// FEATURE: DEBT_TRACKING | tier: free | limit: 5 debts
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CreditCard,
  Plus,
  Pencil,
  Trash2,
  Building2,
  Calendar,
  Percent,
  DollarSign,
  Link2,
  TrendingDown,
  AlertTriangle,
  Loader2,
  Download,
  RefreshCw,
  Landmark,
  Home,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { HelpTooltip } from "@/components/help-tooltip";
import type { DebtDetails, PlaidAccount } from "@shared/schema";
import { Link } from "wouter";

const DEBT_TYPES = [
  "Credit Card",
  "Line of Credit",
  "Personal Loan",
  "Auto Loan",
  "Student Loan",
  "Mortgage",
  "HELOC",
  "Medical Debt",
  "Other"
] as const;

const PAYMENT_FREQUENCIES = [
  "Weekly",
  "Biweekly",
  "Semi-monthly",
  "Monthly",
  "Quarterly",
  "Annually"
] as const;

const debtFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  debtType: z.enum(DEBT_TYPES),
  currentBalance: z.string().min(1, "Current balance is required"),
  apr: z.string().min(1, "APR is required"),
  minimumPayment: z.string().min(1, "Minimum payment is required"),
  paymentFrequency: z.enum(PAYMENT_FREQUENCIES).optional(),
  originalPrincipal: z.string().optional(),
  termMonths: z.string().optional(),
  creditLimit: z.string().optional(),
  dueDay: z.string().optional(),
  lender: z.string().optional(),
  accountNumber: z.string().optional(),
  linkedPlaidAccountId: z.string().optional(),
  startDate: z.string().optional(),
  notes: z.string().optional(),
});

type DebtFormData = z.infer<typeof debtFormSchema>;

function formatCurrency(amount: number | string | null | undefined): string {
  const num = typeof amount === "string" ? parseFloat(amount) : (amount || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function getDebtTypeColor(debtType: string) {
  switch (debtType) {
    case "Credit Card":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    case "Mortgage":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "Auto Loan":
      return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    case "Student Loan":
      return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    case "Line of Credit":
    case "HELOC":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// ─── Plaid account grouping helpers ──────────────────────────────────────────

interface PlaidLiabilityGroup {
  label: string;
  icon: React.ElementType;
  accounts: PlaidAccount[];
}

// Keywords that indicate a line of credit — checked against subtype AND account name
const LOC_KEYWORDS = [
  "line of credit",
  "loc",
  "credit line",
  "home equity",
  "heloc",
  "personal line of credit",
  "business line of credit",
  "scotialine",
  "creditline",
  "overdraft",
];

function isLoc(account: PlaidAccount): boolean {
  const subtype = (account.subtype || "").toLowerCase();
  const name = (account.name || "").toLowerCase();
  const officialName = ((account as any).officialName || "").toLowerCase();
  return LOC_KEYWORDS.some(
    (kw) => subtype.includes(kw) || name.includes(kw) || officialName.includes(kw)
  );
}

function groupPlaidLiabilities(accounts: PlaidAccount[]): PlaidLiabilityGroup[] {
  const mortgages = accounts.filter(
    (a) => a.type === "loan" && a.subtype?.toLowerCase().includes("mortgage")
  );
  // Lines of credit: loan-type or credit-type with LOC keywords in subtype OR name
  const loc = accounts.filter(
    (a) => (a.type === "loan" || a.type === "credit") && isLoc(a)
  );
  // True credit cards: credit-type accounts that are NOT lines of credit
  const creditCards = accounts.filter(
    (a) => a.type === "credit" && !isLoc(a)
  );
  const otherLoans = accounts.filter(
    (a) =>
      a.type === "loan" &&
      !mortgages.includes(a) &&
      !loc.includes(a)
  );

  const groups: PlaidLiabilityGroup[] = [];
  if (mortgages.length > 0) groups.push({ label: "Mortgages", icon: Home, accounts: mortgages });
  if (loc.length > 0) groups.push({ label: "Lines of Credit", icon: Landmark, accounts: loc });
  if (creditCards.length > 0) groups.push({ label: "Credit Cards", icon: CreditCard, accounts: creditCards });
  if (otherLoans.length > 0) groups.push({ label: "Other Loans", icon: DollarSign, accounts: otherLoans });
  return groups;
}

export default function LiabilitiesPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<DebtDetails | null>(null);
  const [deletingDebtId, setDeletingDebtId] = useState<string | null>(null);

  // ── Manual debts ──────────────────────────────────────────────────────────
  const { data: debts = [], isLoading: isLoadingDebts } = useQuery<DebtDetails[]>({
    queryKey: ["/api/debts"],
  });

  // ── Plaid accounts ────────────────────────────────────────────────────────
  type GroupedAccounts = {
    id: string;
    institutionName: string;
    accounts: PlaidAccount[];
  };

  const { data: groupedAccounts = [], isLoading: isLoadingAccounts } = useQuery<GroupedAccounts[]>({
    queryKey: ["/api/plaid/accounts"],
  });

  const plaidAccounts = useMemo(
    () => groupedAccounts.flatMap((g) => g.accounts || []),
    [groupedAccounts]
  );

  // Filter to credit + loan accounts only
  const plaidLiabilityAccounts = useMemo(
    () => plaidAccounts.filter((a) => ["credit", "loan"].includes(a.type) && a.isActive !== "false"),
    [plaidAccounts]
  );

  const plaidGroups = useMemo(
    () => groupPlaidLiabilities(plaidLiabilityAccounts),
    [plaidLiabilityAccounts]
  );

  const plaidTotal = useMemo(
    () =>
      plaidLiabilityAccounts.reduce(
        (sum, a) => sum + Math.abs(parseFloat(a.balanceCurrent || "0")),
        0
      ),
    [plaidLiabilityAccounts]
  );

  const manualTotal = useMemo(
    () => debts.reduce((sum, d) => sum + parseFloat(d.currentBalance), 0),
    [debts]
  );

  const grandTotal = plaidTotal + manualTotal;

  // ── Auto-import helpers ───────────────────────────────────────────────────
  const linkedPlaidAccountIds = useMemo(
    () => new Set(debts.filter((d) => d.linkedPlaidAccountId).map((d) => d.linkedPlaidAccountId)),
    [debts]
  );

  const unlinkedPlaidAccounts = useMemo(
    () => plaidLiabilityAccounts.filter((a) => !linkedPlaidAccountIds.has(a.id)),
    [plaidLiabilityAccounts, linkedPlaidAccountIds]
  );

  const [isAutoImporting, setIsAutoImporting] = useState(false);

  const handleAutoImport = async () => {
    if (unlinkedPlaidAccounts.length === 0) {
      toast({ title: "No accounts to import", description: "All your credit cards and loans are already tracked." });
      return;
    }
    setIsAutoImporting(true);
    let imported = 0;
    try {
      for (const account of unlinkedPlaidAccounts) {
        const balance = Math.abs(parseFloat(account.balanceCurrent || "0"));
        if (balance === 0) continue;
        let debtType = "Other";
        if (account.type === "credit") {
          debtType = "Credit Card";
        } else if (account.subtype) {
          const sub = account.subtype.toLowerCase();
          if (sub.includes("mortgage")) debtType = "Mortgage";
          else if (sub.includes("auto") || sub.includes("car")) debtType = "Auto Loan";
          else if (sub.includes("student")) debtType = "Student Loan";
          else if (sub.includes("line of credit") || sub.includes("loc")) debtType = "Line of Credit";
          else if (sub.includes("heloc")) debtType = "HELOC";
          else if (sub.includes("personal")) debtType = "Personal Loan";
          else debtType = account.type === "loan" ? "Personal Loan" : "Credit Card";
        }
        const minPaymentRate = account.type === "credit" ? 0.02 : 0.01;
        const estimatedMinPayment = Math.max(25, balance * minPaymentRate);
        const creditLimit =
          account.type === "credit" && account.balanceLimit ? account.balanceLimit : null;
        await apiRequest("POST", "/api/debts", {
          name: account.name,
          debtType,
          currentBalance: balance.toFixed(2),
          apr: "0",
          minimumPayment: estimatedMinPayment.toFixed(2),
          creditLimit: creditLimit || "",
          linkedPlaidAccountId: account.id,
          lender: account.officialName || "",
          accountNumber: account.mask || "",
        });
        imported++;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/debts"] });
      toast({
        title: `Imported ${imported} debt${imported !== 1 ? "s" : ""}`,
        description: "Please add APR rates for accurate payoff calculations.",
      });
    } catch (error: any) {
      const msg = (error?.message || "").toLowerCase();
      if (msg.includes("limit") || msg.includes("upgrade") || msg.includes("plan") || msg.includes("402")) {
        toast({
          title: "Debt limit reached",
          description: "You've used all 5 debts on the free plan. Upgrade to Pro for unlimited debt tracking.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Import failed", description: "Could not import some accounts.", variant: "destructive" });
      }
    } finally {
      setIsAutoImporting(false);
    }
  };

  // ── Form ──────────────────────────────────────────────────────────────────
  const form = useForm<DebtFormData>({
    resolver: zodResolver(debtFormSchema),
    defaultValues: {
      name: "",
      debtType: "Credit Card",
      currentBalance: "",
      apr: "",
      minimumPayment: "",
      originalPrincipal: "",
      termMonths: "",
      creditLimit: "",
      dueDay: "",
      lender: "",
      accountNumber: "",
      linkedPlaidAccountId: "",
      startDate: "",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: DebtFormData) => {
      const payload = {
        ...data,
        termMonths: data.termMonths ? parseInt(data.termMonths) : null,
        dueDay: data.dueDay ? parseInt(data.dueDay) : null,
        linkedPlaidAccountId:
          data.linkedPlaidAccountId && data.linkedPlaidAccountId !== "none"
            ? data.linkedPlaidAccountId
            : null,
      };
      await apiRequest("POST", "/api/debts", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/debts"] });
      toast({ title: "Debt added successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      const msg = error.message || "";
      if (msg.toLowerCase().includes("limit") || msg.toLowerCase().includes("upgrade")) {
        toast({
          title: "Debt limit reached",
          description: "You've used all 5 debts on the free plan. Upgrade to Pro for unlimited debt tracking.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Failed to add debt", variant: "destructive" });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: DebtFormData }) => {
      const payload = {
        ...data,
        termMonths: data.termMonths ? parseInt(data.termMonths) : null,
        dueDay: data.dueDay ? parseInt(data.dueDay) : null,
        linkedPlaidAccountId:
          data.linkedPlaidAccountId && data.linkedPlaidAccountId !== "none"
            ? data.linkedPlaidAccountId
            : null,
      };
      await apiRequest("PATCH", `/api/debts/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/debts"] });
      toast({ title: "Debt updated successfully" });
      setIsDialogOpen(false);
      setEditingDebt(null);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to update debt", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/debts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/debts"] });
      toast({ title: "Debt deleted successfully" });
      setDeletingDebtId(null);
    },
    onError: () => {
      toast({ title: "Failed to delete debt", variant: "destructive" });
    },
  });

  const handleOpenCreate = () => {
    setEditingDebt(null);
    form.reset({
      name: "",
      debtType: "Credit Card",
      currentBalance: "",
      apr: "",
      minimumPayment: "",
      paymentFrequency: "Monthly",
      originalPrincipal: "",
      termMonths: "",
      creditLimit: "",
      dueDay: "",
      lender: "",
      accountNumber: "",
      linkedPlaidAccountId: "",
      startDate: "",
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (debt: DebtDetails) => {
    setEditingDebt(debt);
    form.reset({
      name: debt.name,
      debtType: debt.debtType as (typeof DEBT_TYPES)[number],
      currentBalance: debt.currentBalance,
      apr: debt.apr,
      minimumPayment: debt.minimumPayment,
      paymentFrequency: (debt.paymentFrequency || "Monthly") as (typeof PAYMENT_FREQUENCIES)[number],
      originalPrincipal: debt.originalPrincipal || "",
      termMonths: debt.termMonths?.toString() || "",
      creditLimit: debt.creditLimit || "",
      dueDay: debt.dueDay?.toString() || "",
      lender: debt.lender || "",
      accountNumber: debt.accountNumber || "",
      linkedPlaidAccountId: debt.linkedPlaidAccountId || "",
      startDate: debt.startDate || "",
      notes: debt.notes || "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: DebtFormData) => {
    if (editingDebt) {
      updateMutation.mutate({ id: editingDebt.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const selectedDebtType = form.watch("debtType");
  const isRevolvingCredit = ["Credit Card", "Line of Credit", "HELOC"].includes(selectedDebtType);
  const watchedLinkedAccountId = form.watch("linkedPlaidAccountId");

  const handleAccountLinkChange = (accountId: string) => {
    form.setValue("linkedPlaidAccountId", accountId);
    if (accountId && accountId !== "none") {
      const account = plaidAccounts.find((a) => a.id === accountId);
      if (account) {
        if (account.balanceCurrent) {
          form.setValue("currentBalance", Math.abs(parseFloat(account.balanceCurrent)).toFixed(2));
        }
        if (account.balanceLimit) {
          form.setValue("creditLimit", parseFloat(account.balanceLimit).toFixed(2));
        }
        if (account.mask) form.setValue("accountNumber", account.mask);
        if (!form.getValues("name") && account.name) form.setValue("name", account.name);
        toast({
          title: "Account linked",
          description: `Balance synced: ${formatCurrency(Math.abs(parseFloat(account.balanceCurrent || "0")))}`,
        });
      }
    }
  };

  const syncBalanceFromLinkedAccount = () => {
    const accountId = form.getValues("linkedPlaidAccountId");
    if (accountId && accountId !== "none") {
      const account = plaidAccounts.find((a) => a.id === accountId);
      if (account?.balanceCurrent) {
        form.setValue("currentBalance", Math.abs(parseFloat(account.balanceCurrent)).toFixed(2));
        if (account.balanceLimit) {
          form.setValue("creditLimit", parseFloat(account.balanceLimit).toFixed(2));
        }
        toast({
          title: "Balance synced",
          description: `Updated to ${formatCurrency(Math.abs(parseFloat(account.balanceCurrent)))}`,
        });
      }
    }
  };

  const isLoading = isLoadingDebts || isLoadingAccounts;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Liabilities</h1>
          <p className="text-muted-foreground">Everything you owe in one place</p>
        </div>
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Liabilities
            <HelpTooltip
              title="Liabilities"
              content="All your debts in one place — credit cards, mortgages, and loans pulled from your linked bank accounts, plus any manually tracked debts."
            />
          </h1>
          <p className="text-muted-foreground">Everything you owe in one place</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {unlinkedPlaidAccounts.length > 0 && (
            <Button
              variant="outline"
              onClick={handleAutoImport}
              disabled={isAutoImporting}
              data-testid="button-auto-import"
            >
              {isAutoImporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Import from Banks ({unlinkedPlaidAccounts.length})
            </Button>
          )}
          <Button onClick={handleOpenCreate} data-testid="button-add-debt">
            <Plus className="h-4 w-4 mr-2" />
            Add Manual Debt
          </Button>
        </div>
      </div>

      {/* ── Total card ── */}
      <Card className="border-red-500/20 bg-red-500/5">
        <CardContent className="flex items-center justify-between py-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-red-500/10">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Liabilities</p>
              <p className="text-3xl font-bold text-red-600" data-testid="text-total-liabilities">
                {formatCurrency(grandTotal)}
              </p>
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground space-y-1">
            {plaidTotal > 0 && (
              <p>
                <span className="font-medium text-foreground">{formatCurrency(plaidTotal)}</span> from linked accounts
              </p>
            )}
            {manualTotal > 0 && (
              <p>
                <span className="font-medium text-foreground">{formatCurrency(manualTotal)}</span> manually tracked
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Auto-import suggestion ── */}
      {unlinkedPlaidAccounts.length > 0 && debts.length === 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-3 rounded-full bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">
                We found {unlinkedPlaidAccounts.length} credit card
                {unlinkedPlaidAccounts.length !== 1 ? "s" : ""} and loan
                {unlinkedPlaidAccounts.length !== 1 ? "s" : ""}
              </h3>
              <p className="text-sm text-muted-foreground">
                Import your debts from connected bank accounts to automatically track balances
              </p>
            </div>
            <Button onClick={handleAutoImport} disabled={isAutoImporting} data-testid="button-import-banner">
              {isAutoImporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Import All
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Plaid liability groups ── */}
      {plaidGroups.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            From Linked Accounts
          </h2>
          {plaidGroups.map((group) => {
            const GroupIcon = group.icon;
            const groupTotal = group.accounts.reduce(
              (sum, a) => sum + Math.abs(parseFloat(a.balanceCurrent || "0")),
              0
            );
            return (
              <Card key={group.label}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <GroupIcon className="h-4 w-4 text-muted-foreground" />
                      {group.label}
                    </CardTitle>
                    <span className="text-sm font-semibold text-red-600">
                      {formatCurrency(groupTotal)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {group.accounts.map((account) => {
                      const balance = Math.abs(parseFloat(account.balanceCurrent || "0"));
                      // Find institution name from grouped accounts
                      const institution = groupedAccounts.find((g) =>
                        g.accounts.some((a) => a.id === account.id)
                      )?.institutionName;
                      return (
                        <div
                          key={account.id}
                          className="flex items-center justify-between py-2 border-b last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{account.name}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                {institution && (
                                  <p className="text-xs text-muted-foreground">{institution}</p>
                                )}
                                {account.mask && (
                                  <p className="text-xs text-muted-foreground">••••{account.mask}</p>
                                )}
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                                  {account.subtype || account.type}
                                </Badge>
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-primary border-primary/30">
                                  Linked
                                </Badge>
                              </div>
                            </div>
                          </div>
                          <span className="text-sm font-semibold text-red-600">
                            {formatCurrency(balance)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Manually tracked debts ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Pencil className="h-5 w-5 text-muted-foreground" />
            Manually Tracked
            <span className="text-sm font-normal text-muted-foreground">
              — for loans not connected to Plaid
            </span>
          </h2>
          <Button variant="outline" size="sm" onClick={handleOpenCreate} data-testid="button-add-manual-debt">
            <Plus className="h-4 w-4 mr-1" />
            Add Manual Debt
          </Button>
        </div>

        <Card>
          <CardContent className="pt-4">
            {debts.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <h3 className="text-base font-medium mb-1">No manual debts added</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add debts that aren't connected to a bank account, or import from your linked accounts above.
                </p>
                <Button onClick={handleOpenCreate} data-testid="button-add-first-debt">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Debt
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {debts.map((debt) => (
                  <div
                    key={debt.id}
                    className="flex items-center justify-between py-3 border-b last:border-0"
                    data-testid={`row-debt-${debt.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        {debt.debtType === "Mortgage" ? (
                          <Home className="h-4 w-4 text-muted-foreground" />
                        ) : debt.debtType === "Credit Card" ? (
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          {debt.linkedPlaidAccountId && (
                            <Link2 className="h-3 w-3 text-primary" />
                          )}
                          <p className="text-sm font-medium">{debt.name}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {debt.lender && (
                            <p className="text-xs text-muted-foreground">{debt.lender}</p>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1 py-0 h-4 ${getDebtTypeColor(debt.debtType)}`}
                          >
                            {debt.debtType}
                          </Badge>
                          {parseFloat(debt.apr) > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {parseFloat(debt.apr).toFixed(2)}% APR
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-red-600">
                        {formatCurrency(debt.currentBalance)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleOpenEdit(debt)}
                        data-testid={`button-edit-debt-${debt.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setDeletingDebtId(debt.id)}
                        data-testid={`button-delete-debt-${debt.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Footer CTA ── */}
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <TrendingDown className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Ready to pay off your debt faster?</p>
              <p className="text-xs text-muted-foreground">
                Use our Debt Payoff Strategies to find the best approach for your situation.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/debt-payoff">
              View Debt Payoff Strategies
              <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* ── Add/Edit Dialog ── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDebt ? "Edit Debt" : "Add Manual Debt"}</DialogTitle>
            <DialogDescription>
              {editingDebt
                ? "Update the details of your debt."
                : "Add a loan, credit card, or other debt to track manually."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Chase Sapphire" {...field} data-testid="input-debt-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="debtType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-debt-type">
                            <SelectValue placeholder="Select debt type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DEBT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="currentBalance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Balance *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input type="number" step="0.01" className="pl-7" placeholder="0.00" {...field} data-testid="input-debt-balance" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="apr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>APR *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input type="number" step="0.01" className="pr-7" placeholder="19.99" {...field} data-testid="input-debt-apr" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="minimumPayment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minimum Payment *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input type="number" step="0.01" className="pl-7" placeholder="0.00" {...field} data-testid="input-debt-min-payment" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="paymentFrequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Frequency</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "Monthly"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-payment-frequency">
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PAYMENT_FREQUENCIES.map((freq) => (
                            <SelectItem key={freq} value={freq}>{freq}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="lender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lender/Bank</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Chase, Bank of America" {...field} data-testid="input-debt-lender" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!isRevolvingCredit && (
                  <>
                    <FormField
                      control={form.control}
                      name="originalPrincipal"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Original Principal</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                              <Input type="number" step="0.01" className="pl-7" placeholder="0.00" {...field} data-testid="input-debt-principal" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="termMonths"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Loan Term (Months)</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="60" {...field} data-testid="input-debt-term" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {isRevolvingCredit && (
                  <FormField
                    control={form.control}
                    name="creditLimit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Credit Limit</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                            <Input type="number" step="0.01" className="pl-7" placeholder="0.00" {...field} data-testid="input-debt-limit" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="linkedPlaidAccountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Link to Bank Account</FormLabel>
                      <div className="flex gap-2">
                        <Select onValueChange={handleAccountLinkChange} value={field.value || "none"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-linked-account" className="flex-1">
                              <SelectValue placeholder="Select account to link" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No linked account</SelectItem>
                            {plaidAccounts.length > 0 ? (
                              plaidAccounts.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.name} {account.mask && `(****${account.mask})`}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="no-accounts" disabled>
                                {isLoadingAccounts ? "Loading accounts..." : "No accounts connected"}
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        {watchedLinkedAccountId && watchedLinkedAccountId !== "none" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={syncBalanceFromLinkedAccount}
                            title="Sync balance from bank"
                            data-testid="button-sync-balance"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <FormDescription>
                        {plaidAccounts.length === 0 && !isLoadingAccounts ? (
                          <Link href="/accounts" className="text-primary underline">
                            Connect bank accounts to enable auto-sync
                          </Link>
                        ) : watchedLinkedAccountId && watchedLinkedAccountId !== "none" ? (
                          "Click the sync button to update balance from your bank"
                        ) : (
                          "Select an account to auto-sync balance"
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Input placeholder="Any additional notes..." {...field} data-testid="input-debt-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  data-testid="button-cancel-debt"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-debt"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Saving..."
                    : editingDebt
                    ? "Update Debt"
                    : "Add Debt"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deletingDebtId} onOpenChange={() => setDeletingDebtId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Debt</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this debt? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingDebtId && deleteMutation.mutate(deletingDebtId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
