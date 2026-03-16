// FEATURE: DEBT_TRACKING | tier: free | limit: 3 debts
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Sparkles,
  Loader2,
  Download,
  RefreshCw,
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

function formatPercent(rate: number | string | null | undefined): string {
  const num = typeof rate === "string" ? parseFloat(rate) : (rate || 0);
  return `${num.toFixed(2)}%`;
}

function getDebtTypeIcon(debtType: string) {
  switch (debtType) {
    case "Credit Card":
      return <CreditCard className="h-4 w-4" />;
    case "Mortgage":
    case "HELOC":
      return <Building2 className="h-4 w-4" />;
    default:
      return <DollarSign className="h-4 w-4" />;
  }
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

export default function DebtsPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<DebtDetails | null>(null);
  const [deletingDebtId, setDeletingDebtId] = useState<string | null>(null);

  const { data: debts = [], isLoading } = useQuery<DebtDetails[]>({
    queryKey: ["/api/debts"],
  });

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

  const [isAutoImporting, setIsAutoImporting] = useState(false);

  // Get credit and loan accounts from Plaid (filter out explicitly disabled accounts)
  const plaidCreditLoanAccounts = useMemo(() => {
    return plaidAccounts.filter(a => 
      ["credit", "loan"].includes(a.type) && 
      a.isActive !== "false"
    );
  }, [plaidAccounts]);

  // Get linked Plaid account IDs from existing debts
  const linkedPlaidAccountIds = useMemo(() => {
    return new Set(debts.filter(d => d.linkedPlaidAccountId).map(d => d.linkedPlaidAccountId));
  }, [debts]);

  // Unlinked Plaid credit/loan accounts that could be imported
  const unlinkedPlaidAccounts = useMemo(() => {
    return plaidCreditLoanAccounts.filter(a => !linkedPlaidAccountIds.has(a.id));
  }, [plaidCreditLoanAccounts, linkedPlaidAccountIds]);

  // Auto-import debts from unlinked Plaid accounts
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
          const subtype = account.subtype.toLowerCase();
          if (subtype.includes("mortgage")) debtType = "Mortgage";
          else if (subtype.includes("auto") || subtype.includes("car")) debtType = "Auto Loan";
          else if (subtype.includes("student")) debtType = "Student Loan";
          else if (subtype.includes("line of credit") || subtype.includes("loc")) debtType = "Line of Credit";
          else if (subtype.includes("heloc")) debtType = "HELOC";
          else if (subtype.includes("personal")) debtType = "Personal Loan";
          else debtType = account.type === "loan" ? "Personal Loan" : "Credit Card";
        }

        const minPaymentRate = account.type === "credit" ? 0.02 : 0.01;
        const estimatedMinPayment = Math.max(25, balance * minPaymentRate);

        const creditLimit = account.type === "credit" && account.balanceLimit
          ? account.balanceLimit
          : null;

        const payload = {
          name: account.name,
          debtType,
          currentBalance: balance.toFixed(2),
          apr: "0",
          minimumPayment: estimatedMinPayment.toFixed(2),
          creditLimit: creditLimit || "",
          linkedPlaidAccountId: account.id,
          lender: account.officialName || "",
          accountNumber: account.mask || "",
        };

        await apiRequest("POST", "/api/debts", payload);
        imported++;
      }

      queryClient.invalidateQueries({ queryKey: ["/api/debts"] });
      toast({ 
        title: `Imported ${imported} debt${imported !== 1 ? "s" : ""}`, 
        description: "Please add APR rates for accurate payoff calculations."
      });
    } catch (error) {
      toast({ title: "Import failed", description: "Could not import some accounts. Please try again.", variant: "destructive" });
    } finally {
      setIsAutoImporting(false);
    }
  };

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
        linkedPlaidAccountId: data.linkedPlaidAccountId && data.linkedPlaidAccountId !== "none" ? data.linkedPlaidAccountId : null,
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
      if (msg.toLowerCase().includes("limit") || msg.toLowerCase().includes("upgrade") || msg.toLowerCase().includes("plan")) {
        toast({
          title: "Debt limit reached",
          description: "You've used all 3 debts on the free plan. Upgrade to Pro for unlimited debt tracking.",
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
        linkedPlaidAccountId: data.linkedPlaidAccountId && data.linkedPlaidAccountId !== "none" ? data.linkedPlaidAccountId : null,
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
      debtType: debt.debtType as typeof DEBT_TYPES[number],
      currentBalance: debt.currentBalance,
      apr: debt.apr,
      minimumPayment: debt.minimumPayment,
      paymentFrequency: (debt.paymentFrequency || "Monthly") as typeof PAYMENT_FREQUENCIES[number],
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

  const toMonthlyPayment = (amount: number, frequency: string | null | undefined): number => {
    switch (frequency) {
      case "Weekly": return amount * 52 / 12;
      case "Biweekly": return amount * 26 / 12;
      case "Semi-monthly": return amount * 2;
      case "Quarterly": return amount / 3;
      case "Annually": return amount / 12;
      case "Monthly":
      default: return amount;
    }
  };

  const totalDebt = useMemo(() => {
    return debts.reduce((sum, d) => sum + parseFloat(d.currentBalance), 0);
  }, [debts]);

  const totalMinPayments = useMemo(() => {
    return debts.reduce((sum, d) => {
      const payment = parseFloat(d.minimumPayment);
      return sum + toMonthlyPayment(payment, d.paymentFrequency);
    }, 0);
  }, [debts]);

  const avgApr = useMemo(() => {
    if (debts.length === 0) return 0;
    const totalApr = debts.reduce((sum, d) => sum + parseFloat(d.apr), 0);
    return totalApr / debts.length;
  }, [debts]);

  const selectedDebtType = form.watch("debtType");
  const isRevolvingCredit = ["Credit Card", "Line of Credit", "HELOC"].includes(selectedDebtType);
  const watchedLinkedAccountId = form.watch("linkedPlaidAccountId");

  const handleAccountLinkChange = (accountId: string) => {
    form.setValue("linkedPlaidAccountId", accountId);
    if (accountId && accountId !== "none") {
      const account = plaidAccounts.find(a => a.id === accountId);
      if (account) {
        if (account.balanceCurrent) {
          form.setValue("currentBalance", Math.abs(parseFloat(account.balanceCurrent)).toFixed(2));
        }
        if (account.balanceLimit) {
          form.setValue("creditLimit", parseFloat(account.balanceLimit).toFixed(2));
        }
        if (account.mask) {
          form.setValue("accountNumber", account.mask);
        }
        if (!form.getValues("name") && account.name) {
          form.setValue("name", account.name);
        }
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
      const account = plaidAccounts.find(a => a.id === accountId);
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Debt Management</h1>
          <p className="text-muted-foreground">Track and manage your loans and credit</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Debt Management
            <HelpTooltip title="Debt Management" content="Track your loans, credit cards, and other debts. Add APR, terms, and payment details for accurate payoff calculations." />
          </h1>
          <p className="text-muted-foreground">Track and manage your loans and credit</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline" data-testid="button-debt-payoff">
            <Link href="/debt-payoff">
              <TrendingDown className="h-4 w-4 mr-2" />
              Debt Payoff
            </Link>
          </Button>
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
            Add Debt
          </Button>
        </div>
      </div>

      {/* Auto-import suggestion */}
      {unlinkedPlaidAccounts.length > 0 && debts.length === 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-3 rounded-full bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">We found {unlinkedPlaidAccounts.length} credit card{unlinkedPlaidAccounts.length !== 1 ? "s" : ""} and loan{unlinkedPlaidAccounts.length !== 1 ? "s" : ""}</h3>
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

      {/* Stats cards — always visible, no FeatureGate */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Total Debt</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive" data-testid="text-total-debt">
              {formatCurrency(totalDebt)}
            </div>
            <p className="text-xs text-muted-foreground">{debts.length} active debts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Monthly Payments</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-payments">
              {formatCurrency(totalMinPayments)}
            </div>
            <p className="text-xs text-muted-foreground">Minimum payments due</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Average APR</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-apr">
              {formatPercent(avgApr)}
            </div>
            <p className="text-xs text-muted-foreground">Across all debts</p>
          </CardContent>
        </Card>
      </div>

      {/* Debt table — always visible, no FeatureGate */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Your Debts
          </CardTitle>
          <CardDescription>
            Add your loans and credit accounts with APR and payment details for accurate payoff planning
          </CardDescription>
        </CardHeader>
        <CardContent>
          {debts.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">No debts added yet</h3>
              <p className="text-muted-foreground mb-4">
                Add your credit cards, loans, and other debts to track them and plan your payoff strategy.
              </p>
              <Button onClick={handleOpenCreate} data-testid="button-add-first-debt">
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Debt
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">APR</TableHead>
                    <TableHead className="text-right">Min. Payment</TableHead>
                    <TableHead className="text-right">Term</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debts.map((debt) => (
                    <TableRow key={debt.id} data-testid={`row-debt-${debt.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {debt.linkedPlaidAccountId && (
                            <Link2 className="h-3 w-3 text-primary" />
                          )}
                          <div>
                            <div className="font-medium">{debt.name}</div>
                            {debt.lender && (
                              <div className="text-xs text-muted-foreground">{debt.lender}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getDebtTypeColor(debt.debtType)}>
                          {getDebtTypeIcon(debt.debtType)}
                          <span className="ml-1">{debt.debtType}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(debt.currentBalance)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={parseFloat(debt.apr) > 20 ? "text-destructive font-medium" : ""}>
                          {formatPercent(debt.apr)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div>{formatCurrency(debt.minimumPayment)}</div>
                        {debt.paymentFrequency && debt.paymentFrequency !== "Monthly" && (
                          <div className="text-xs text-muted-foreground">{debt.paymentFrequency}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {debt.termMonths ? `${debt.termMonths} mo` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(debt)}
                            data-testid={`button-edit-debt-${debt.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingDebtId(debt.id)}
                            data-testid={`button-delete-debt-${debt.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDebt ? "Edit Debt" : "Add New Debt"}</DialogTitle>
            <DialogDescription>
              {editingDebt
                ? "Update the details of your debt."
                : "Add a new loan, credit card, or other debt to track."}
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
                      <FormLabel>APR (Annual Percentage Rate) *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input type="number" step="0.01" className="pr-7" placeholder="19.99" {...field} data-testid="input-debt-apr" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                        </div>
                      </FormControl>
                      <FormDescription>The annual interest rate charged</FormDescription>
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
                      <FormDescription>Minimum payment amount per payment period</FormDescription>
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
                      <FormDescription>How often payments are due</FormDescription>
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
                          <FormDescription>Initial amount borrowed</FormDescription>
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
                          <FormDescription>Duration of the loan agreement</FormDescription>
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
                        <FormDescription>Maximum credit available</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="dueDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Day</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" max="31" placeholder="15" {...field} data-testid="input-debt-due-day" />
                      </FormControl>
                      <FormDescription>Day of month payment is due</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="accountNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Number (Last 4)</FormLabel>
                      <FormControl>
                        <Input placeholder="1234" maxLength={4} {...field} data-testid="input-debt-account" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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

                {!isRevolvingCredit && (
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-debt-start-date" />
                        </FormControl>
                        <FormDescription>When the loan was originated</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

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
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel-debt">
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-debt">
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
