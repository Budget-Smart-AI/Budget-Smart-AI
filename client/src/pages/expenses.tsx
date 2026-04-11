import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Receipt,
  Plus,
  Pencil,
  Trash2,
  Search,
  ArrowUpDown,
  Zap,
  Building2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Tag,
  Briefcase,
  CheckSquare,
  RefreshCw,
  Check,
  Link2,
  FileText,
  AlertTriangle,
  Circle,
  Loader2,
  CheckCircle2,
  X,
  MessageCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EXPENSE_CATEGORIES, TAX_CATEGORIES, type Expense } from "@shared/schema";
import { FloatingChatbot, type TransactionContext } from "@/components/floating-chatbot";
import { DemoBanner } from "@/components/demo-banner";

// ─── types ──────────────────────────────────────────────────────────────────

// Helper function to determine expense source
const getExpenseSource = (expense: Expense): string => {
  // If externalTransactionId is null/empty, it's a manual entry
  if (!expense.externalTransactionId) {
    return "Manual";
  }
  // TODO: Determine if transaction is from Plaid or MX by querying
  // plaidTransactions or mxTransactions tables. For now, default to "Bank"
  // as any externalTransactionId indicates an auto-imported transaction
  return "Bank";
};

interface ExpenseResult {
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
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(num);
}

/** Returns true if this expense was originally in a foreign currency. */
function isForeignCurrency(expense: Expense): boolean {
  const iso = (expense as any).isoCurrencyCode;
  return iso && iso !== "CAD";
}

const CURRENCY_FLAG: Record<string, string> = {
  USD: "🇺🇸", GBP: "🇬🇧", EUR: "🇪🇺", AUD: "🇦🇺", MXN: "🇲🇽",
  JPY: "🇯🇵", CHF: "🇨🇭", HKD: "🇭🇰", SGD: "🇸🇬", NZD: "🇳🇿",
  SEK: "🇸🇪", NOK: "🇳🇴", DKK: "🇩🇰", INR: "🇮🇳", BRL: "🇧🇷", ZAR: "🇿🇦",
};

function getCurrencyFlag(isoCurrency: string): string {
  return CURRENCY_FLAG[isoCurrency.toUpperCase()] ?? "🌐";
}

function getMonthRange(date: Date) {
  return { start: startOfMonth(date), end: endOfMonth(date) };
}

const CATEGORY_COLORS: Record<string, string> = {
  "Groceries": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "Restaurant & Bars": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "Transportation": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "Entertainment": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  "Shopping": "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  "Healthcare": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  "Education": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  "Fitness": "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  "Gas": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  "Travel": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  "Coffee Shops": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  "Other": "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category] ?? "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
}

// ─── Status icon component ───────────────────────────────────────────────────

type ExpenseStatus = "reconciled" | "matched_bill" | "matched_receipt" | "needs_review" | "unmatched";

function getExpenseStatus(expense: Expense): ExpenseStatus {
  if ((expense as any).needsReview === true || (expense as any).needsReview === "true") {
    return "needs_review";
  }
  if ((expense as any).reconciled === "true") {
    return "reconciled";
  }
  if ((expense as any).matchType === "bill" || (expense as any).matchedBillId) {
    return "matched_bill";
  }
  if ((expense as any).matchType === "receipt" || (expense as any).matchedReceiptId) {
    return "matched_receipt";
  }
  return "unmatched";
}

function StatusIcon({ expense }: { expense: Expense }) {
  const status = getExpenseStatus(expense);

  switch (status) {
    case "reconciled":
      return (
        <span title="Reconciled" className="inline-flex items-center justify-center">
          <Check className="h-4 w-4 text-green-500" />
        </span>
      );
    case "matched_bill":
      return (
        <span title="Matched to bill" className="inline-flex items-center justify-center">
          <Link2 className="h-4 w-4 text-blue-500" />
        </span>
      );
    case "matched_receipt":
      return (
        <span title="Matched to receipt" className="inline-flex items-center justify-center">
          <FileText className="h-4 w-4 text-purple-500" />
        </span>
      );
    case "needs_review":
      return (
        <span title="Needs review" className="inline-flex items-center justify-center">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        </span>
      );
    default:
      return (
        <span title="Unmatched" className="inline-flex items-center justify-center">
          <Circle className="h-4 w-4 text-muted-foreground/40" />
        </span>
      );
  }
}

function isAlreadyMatched(expense: Expense): boolean {
  const status = getExpenseStatus(expense);
  return status === "reconciled" || status === "matched_bill" || status === "matched_receipt";
}

// ─── Read-only summary modal ─────────────────────────────────────────────────

function ExpenseSummary({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const status = getExpenseStatus(expense);

  const statusLabel: Record<ExpenseStatus, string> = {
    reconciled: "Reconciled",
    matched_bill: "Matched to Bill",
    matched_receipt: "Matched to Receipt",
    needs_review: "Needs Review",
    unmatched: "Unmatched",
  };

  const statusColor: Record<ExpenseStatus, string> = {
    reconciled: "text-green-600 bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
    matched_bill: "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
    matched_receipt: "text-purple-600 bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800",
    needs_review: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
    unmatched: "text-muted-foreground bg-muted border-border",
  };

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium ${statusColor[status]}`}>
        <StatusIcon expense={expense} />
        <span>{statusLabel[status]}</span>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Merchant</p>
          <p className="font-medium">{expense.merchant}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Amount</p>
          <p className="font-semibold text-red-500">{formatCurrency(expense.amount)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Date</p>
          <p className="font-medium">{format(parseISO(expense.date), "MMMM d, yyyy")}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Category</p>
          <Badge className={`text-xs font-medium ${getCategoryColor(expense.category)}`} variant="secondary">
            {expense.category}
          </Badge>
        </div>
        {expense.notes && (
          <div className="col-span-2">
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Notes</p>
            <p className="font-medium">{expense.notes}</p>
          </div>
        )}
        {(expense.taxDeductible === "true" || expense.isBusinessExpense === "true") && (
          <div className="col-span-2 flex gap-2">
            {expense.taxDeductible === "true" && (
              <Badge variant="outline" className="border-green-500 text-green-600">Tax Deductible</Badge>
            )}
            {expense.isBusinessExpense === "true" && (
              <Badge variant="outline" className="border-blue-500 text-blue-600">Business Expense</Badge>
            )}
          </div>
        )}
        {expense.taxCategory && (
          <div className="col-span-2">
            <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Tax Category</p>
            <p className="font-medium">{expense.taxCategory}</p>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button variant="outline" onClick={onClose}>
          <X className="h-4 w-4 mr-2" />
          Close
        </Button>
      </div>
    </div>
  );
}

// ─── form schema ────────────────────────────────────────────────────────────

const expenseFormSchema = z.object({
  merchant: z.string().min(1, "Merchant name is required"),
  amount: z.string().min(1, "Amount is required"),
  date: z.string().min(1, "Date is required"),
  category: z.enum(EXPENSE_CATEGORIES),
  notes: z.string().optional(),
  taxDeductible: z.boolean().optional().default(false),
  isBusinessExpense: z.boolean().optional().default(false),
  taxCategory: z.string().optional(),
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

// ─── sort config ────────────────────────────────────────────────────────────

type SortKey = "merchant" | "date" | "category" | "amount";
type SortConfig = { key: SortKey; direction: "asc" | "desc" };

// ─── date range options ─────────────────────────────────────────────────────

type DateRange = "this_month" | "last_month" | "last_3_months" | "all_time";

function getDateRangeLabel(range: DateRange) {
  switch (range) {
    case "this_month": return "This Month";
    case "last_month": return "Last Month";
    case "last_3_months": return "Last 3 Months";
    case "all_time": return "All Time";
  }
}

// ─── status filter ──────────────────────────────────────────────────────────

type StatusFilter = "all" | "manual" | "tax_deductible" | "business";

// ─── ExpenseForm component ──────────────────────────────────────────────────

function ExpenseForm({ expense, onClose }: { expense?: Expense; onClose: () => void }) {
  const { toast } = useToast();
  const isEditing = !!expense;

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      merchant: expense?.merchant ?? "",
      amount: expense?.amount ?? "",
      date: expense?.date ?? format(new Date(), "yyyy-MM-dd"),
      category: (expense?.category as typeof EXPENSE_CATEGORIES[number]) ?? "Other",
      notes: expense?.notes ?? "",
      taxDeductible: expense?.taxDeductible === "true",
      isBusinessExpense: expense?.isBusinessExpense === "true",
      taxCategory: expense?.taxCategory ?? "",
    },
  });

  const taxDeductible = form.watch("taxDeductible");

  const createMutation = useMutation({
    mutationFn: async (values: ExpenseFormValues) => {
      return apiRequest("POST", "/api/expenses", {
        ...values,
        taxDeductible: values.taxDeductible ? "true" : "false",
        isBusinessExpense: values.isBusinessExpense ? "true" : "false",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({ title: "Expense added successfully" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to add expense", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: ExpenseFormValues) => {
      return apiRequest("PATCH", `/api/expenses/${expense?.id}`, {
        ...values,
        taxDeductible: values.taxDeductible ? "true" : "false",
        isBusinessExpense: values.isBusinessExpense ? "true" : "false",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({ title: "Expense updated successfully" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to update expense", variant: "destructive" });
    },
  });

  const onSubmit = (values: ExpenseFormValues) => {
    if (isEditing) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="merchant"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Merchant Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Whole Foods Market" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount ($)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" placeholder="0.00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="Any additional notes..." className="resize-none" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Tax & Business</p>

          <FormField
            control={form.control}
            name="taxDeductible"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <FormLabel className="cursor-pointer">Tax Deductible</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isBusinessExpense"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <FormLabel className="cursor-pointer">Business Expense</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          {taxDeductible && (
            <FormField
              control={form.control}
              name="taxCategory"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tax Category</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Home Office, Business Travel" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} className="bg-green-600 hover:bg-green-700 text-white">
            {isPending ? "Saving..." : isEditing ? "Update Expense" : "Add Expense"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export default function ExpensesPage() {
  const { toast } = useToast();

  // modal state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>();
  const [deletingExpense, setDeletingExpense] = useState<Expense | undefined>();

  // read-only summary modal
  const [summaryExpense, setSummaryExpense] = useState<Expense | undefined>();
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  // AI Teller state
  const [tellerOpen, setTellerOpen] = useState(false);
  const [tellerTransaction, setTellerTransaction] = useState<TransactionContext | null>(null);
  const [tellerHoverId, setTellerHoverId] = useState<string | null>(null);

  // Teller flags state
  const [tellerFlags, setTellerFlags] = useState<any[]>([]);
  const [flagsBannerOpen, setFlagsBannerOpen] = useState(true);
  const [flagsBannerExpanded, setFlagsBannerExpanded] = useState(false);
  const [flagsLoaded, setFlagsLoaded] = useState(false);

  // Load teller flags on mount
  useEffect(() => {
    if (flagsLoaded) return;
    setFlagsLoaded(true);
    apiRequest("GET", "/api/ai/teller/flags")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setTellerFlags(data);
      })
      .catch(() => {/* silently ignore — feature may not be available */});
  }, [flagsLoaded]);

  const dismissFlag = async (flagId: string) => {
    try {
      await apiRequest("POST", `/api/ai/teller/flags/${flagId}/dismiss`);
      setTellerFlags((prev) => prev.filter((f) => f.id !== flagId));
    } catch {/* ignore */}
  };

  const openTeller = (expense: Expense) => {
    setTellerTransaction({
      id: expense.id,
      merchant: expense.merchant,
      amount: parseFloat(expense.amount as string),
      date: expense.date,
      category: expense.category,
      notes: expense.notes || undefined,
      source: getExpenseSource(expense).toLowerCase(),
      isoCurrencyCode: (expense as any).isoCurrencyCode || "CAD",
    });
    setTellerOpen(true);
  };

  // tax category dialog
  const [taxCategoryExpense, setTaxCategoryExpense] = useState<Expense | undefined>();
  const [isTaxCategoryOpen, setIsTaxCategoryOpen] = useState(false);
  const [selectedTaxCategory, setSelectedTaxCategory] = useState<string>("other_business");

  // filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>("this_month");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // sort
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "date", direction: "desc" });

  // pagination
  const [page, setPage] = useState(1);

  // bulk select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // These must be declared before the useQuery hooks that reference them
  const now = new Date();
  const thisMonthRange = getMonthRange(now);
  const lastMonthRange = getMonthRange(subMonths(now, 1));

  const monthStart = format(thisMonthRange.start, "yyyy-MM-dd");
  const monthEnd = format(thisMonthRange.end, "yyyy-MM-dd");
  const prevMonthStart = format(lastMonthRange.start, "yyyy-MM-dd");
  const prevMonthEnd = format(lastMonthRange.end, "yyyy-MM-dd");

  // fetch raw expense list for table display and filtering
  const { data: expenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
  });

  // fetch financial engine stats for summary cards
  const { data: expenseStats } = useQuery<ExpenseResult>({
    queryKey: ["/api/engine/expenses", { startDate: monthStart, endDate: monthEnd }],
    queryFn: async () => {
      const res = await fetch(`/api/engine/expenses?startDate=${monthStart}&endDate=${monthEnd}`);
      return res.json();
    },
  });

  // ── mutations ──────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/expenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({ title: "Expense deleted" });
      setDeletingExpense(undefined);
    },
    onError: () => toast({ title: "Failed to delete expense", variant: "destructive" }),
  });

  const bulkPatchMutation = useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: Record<string, string> }) => {
      await Promise.all(ids.map((id) => apiRequest("PATCH", `/api/expenses/${id}`, patch)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      setSelectedIds(new Set());
      toast({ title: "Expenses updated" });
    },
    onError: () => toast({ title: "Failed to update expenses", variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => apiRequest("DELETE", `/api/expenses/${id}`)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      setSelectedIds(new Set());
      toast({ title: "Expenses deleted" });
    },
    onError: () => toast({ title: "Failed to delete expenses", variant: "destructive" }),
  });

  // Addition 1: Auto-Reconcile All — calls POST /api/transactions/auto-reconcile
  // and shows "X transactions reconciled automatically" toast
  const autoReconcileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/transactions/auto-reconcile");
      return res.json();
    },
    onSuccess: (data: { billMatches?: number; expenseMatches?: number; autoCreated?: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      const total = (data.billMatches ?? 0) + (data.expenseMatches ?? 0) + (data.autoCreated ?? 0);
      toast({
        title: `${total} transaction${total !== 1 ? "s" : ""} reconciled automatically`,
        description: [
          data.billMatches ? `${data.billMatches} matched to bills` : null,
          data.expenseMatches ? `${data.expenseMatches} matched to expenses` : null,
          data.autoCreated ? `${data.autoCreated} auto-created` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "No new matches found",
      });
    },
    onError: () => toast({ title: "Auto-reconcile failed", variant: "destructive" }),
  });

  // Single expense patch — used by "Mark as Tax Deductible" context menu
  const singlePatchMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, string> }) =>
      apiRequest("PATCH", `/api/expenses/${id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      setIsTaxCategoryOpen(false);
      setTaxCategoryExpense(undefined);
      toast({ title: "Expense marked as tax deductible" });
    },
    onError: () => toast({ title: "Failed to update expense", variant: "destructive" }),
  });

  // Addition 2: Bulk reconcile by category — marks all filtered expenses in the
  // selected category as reconciled
  const bulkReconcileCategoryMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => apiRequest("PATCH", `/api/expenses/${id}`, { reconciled: "true" })));
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({
        title: `${ids.length} expense${ids.length !== 1 ? "s" : ""} reconciled`,
        description: categoryFilter !== "all" ? `All "${categoryFilter}" expenses marked as reconciled` : undefined,
      });
    },
    onError: () => toast({ title: "Failed to reconcile expenses", variant: "destructive" }),
  });

  // ── computed stats (filtered by date range, used for table display) ────────

  const thisMonthExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        const d = parseISO(e.date);
        return d >= thisMonthRange.start && d <= thisMonthRange.end;
      }),
    [expenses, thisMonthRange.start, thisMonthRange.end]
  );

  // ── filtering & sorting ────────────────────────────────────────────────────

  const filteredExpenses = useMemo(() => {
    let result = [...expenses];

    // date range
    if (dateRange !== "all_time") {
      const cutoff =
        dateRange === "this_month"
          ? thisMonthRange.start
          : dateRange === "last_month"
          ? lastMonthRange.start
          : subMonths(now, 3);
      const end =
        dateRange === "this_month"
          ? thisMonthRange.end
          : dateRange === "last_month"
          ? lastMonthRange.end
          : now;
      result = result.filter((e) => {
        const d = parseISO(e.date);
        return d >= cutoff && d <= end;
      });
    }

    // search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((e) => e.merchant.toLowerCase().includes(q));
    }

    // category
    if (categoryFilter !== "all") {
      result = result.filter((e) => e.category === categoryFilter);
    }

    // status
    if (statusFilter === "manual") {
      // expenses without a plaid/mx source are manual — all expenses in this table are manual
    } else if (statusFilter === "tax_deductible") {
      result = result.filter((e) => e.taxDeductible === "true");
    } else if (statusFilter === "business") {
      result = result.filter((e) => e.isBusinessExpense === "true");
    }

    // sort
    result.sort((a, b) => {
      let valA: string | number = a[sortConfig.key];
      let valB: string | number = b[sortConfig.key];

      if (sortConfig.key === "amount") {
        valA = parseFloat(a.amount);
        valB = parseFloat(b.amount);
      } else if (sortConfig.key === "date") {
        valA = a.date;
        valB = b.date;
      }

      if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [expenses, search, categoryFilter, dateRange, statusFilter, sortConfig, thisMonthRange, lastMonthRange, now]);

  // ── pagination ─────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / PAGE_SIZE));
  const pagedExpenses = filteredExpenses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── unique categories from data ────────────────────────────────────────────

  const uniqueCategories = useMemo(
    () => Array.from(new Set(expenses.map((e) => e.category))).sort(),
    [expenses]
  );

  // ── IDs of filtered expenses for bulk category reconcile ──────────────────

  const filteredCategoryIds = useMemo(
    () => filteredExpenses.map((e) => e.id),
    [filteredExpenses]
  );

  // ── handlers ───────────────────────────────────────────────────────────────

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
    setPage(1);
  };

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setIsDialogOpen(true);
  };

  const handleRowClick = (expense: Expense) => {
    if (isAlreadyMatched(expense)) {
      // Addition 4: show read-only summary for already-matched transactions
      setSummaryExpense(expense);
      setIsSummaryOpen(true);
    } else {
      handleEdit(expense);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingExpense(undefined);
  };

  const handleCloseSummary = () => {
    setIsSummaryOpen(false);
    setSummaryExpense(undefined);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pagedExpenses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pagedExpenses.map((e) => e.id)));
    }
  };

  const selectedArray = Array.from(selectedIds);

  // ── sort header helper ─────────────────────────────────────────────────────

  const flaggedTransactionIds = new Set(tellerFlags.map((f: any) => f.transaction_id));

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <TableHead
      className="cursor-pointer hover:text-primary transition-colors select-none"
      onClick={() => handleSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </div>
    </TableHead>
  );

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <DemoBanner />
      {/* ── Teller Alert Banner ── */}
      {flagsBannerOpen && tellerFlags.length > 0 && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                AI Bank Teller flagged {tellerFlags.length} transaction{tellerFlags.length !== 1 ? "s" : ""} for review
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Possible issues detected — click to review
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                onClick={() => setFlagsBannerExpanded((v) => !v)}
              >
                {flagsBannerExpanded ? (
                  <><ChevronUp className="h-3.5 w-3.5 mr-1" />Hide</>
                ) : (
                  <><ChevronDown className="h-3.5 w-3.5 mr-1" />Show</>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                onClick={() => setFlagsBannerOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {flagsBannerExpanded && (
            <div className="border-t border-amber-200 dark:border-amber-800 divide-y divide-amber-100 dark:divide-amber-900">
              {tellerFlags.map((flag: any) => (
                <div key={flag.id} className="flex items-start gap-3 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{flag.message}</p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5 capitalize">
                      {flag.flag_type.replace("_", " ")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40 shrink-0"
                    onClick={() => dismissFlag(flag.id)}
                  >
                    Dismiss
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          </div>
          <p className="text-muted-foreground mt-1">Track your spending across all categories</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Addition 1: Auto-Reconcile All button */}
          <Button
            variant="outline"
            className="border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
            onClick={() => autoReconcileMutation.mutate()}
            disabled={autoReconcileMutation.isPending}
          >
            {autoReconcileMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            {autoReconcileMutation.isPending ? "Reconciling..." : "Auto-Reconcile"}
          </Button>
          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => { setEditingExpense(undefined); setIsDialogOpen(true); }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Expense
          </Button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 – Total This Month */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total This Month</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-2xl font-bold text-red-500">{formatCurrency(expenseStats?.total ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">{expenseStats?.count ?? 0} transactions</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 2 – Total Last Month */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Last Month</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-2xl font-bold text-muted-foreground">{formatCurrency(expenseStats?.previousTotal ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">Previous period</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 3 – Month-over-Month Change */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">MoM Change</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className={`text-2xl font-bold ${(expenseStats?.momChangePercent ?? 0) > 0 ? "text-red-500" : "text-green-500"}`}>
                  {expenseStats?.momChangePercent?.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {(expenseStats?.momChangePercent ?? 0) > 0 ? "Increase" : "Decrease"}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 4 – Top Category */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top Category</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : expenseStats?.topCategories && expenseStats.topCategories.length > 0 ? (
              <>
                <p className="text-2xl font-bold">{formatCurrency(expenseStats.topCategories[0].amount)}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">{expenseStats.topCategories[0].category}</p>
              </>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Main Table Card ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              All Expenses
            </CardTitle>
          </div>

          {/* ── Filters Bar ── */}
          <div className="flex flex-wrap gap-3 pt-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by merchant..."
                className="pl-9"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            {/* Addition 2: Category filter dropdown */}
            <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {uniqueCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date Range */}
            <Select value={dateRange} onValueChange={(v) => { setDateRange(v as DateRange); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["this_month", "last_month", "last_3_months", "all_time"] as DateRange[]).map((r) => (
                  <SelectItem key={r} value={r}>{getDateRangeLabel(r)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status */}
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as StatusFilter); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="tax_deductible">Tax Deductible</SelectItem>
                <SelectItem value="business">Business</SelectItem>
              </SelectContent>
            </Select>

            {/* Addition 2: "Reconcile All [Category]" button — appears when a category is selected */}
            {categoryFilter !== "all" && filteredCategoryIds.length > 0 && (
              <Button
                variant="outline"
                className="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950 whitespace-nowrap"
                onClick={() => bulkReconcileCategoryMutation.mutate(filteredCategoryIds)}
                disabled={bulkReconcileCategoryMutation.isPending}
              >
                {bulkReconcileCategoryMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Reconcile All {categoryFilter}
              </Button>
            )}
          </div>

          {/* ── Bulk Actions ── */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-2 p-3 bg-muted/50 rounded-lg border">
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  bulkPatchMutation.mutate({ ids: selectedArray, patch: { taxDeductible: "true" } })
                }
                disabled={bulkPatchMutation.isPending}
              >
                <Tag className="h-3.5 w-3.5 mr-1" />
                Mark Tax Deductible
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  bulkPatchMutation.mutate({ ids: selectedArray, patch: { isBusinessExpense: "true" } })
                }
                disabled={bulkPatchMutation.isPending}
              >
                <Briefcase className="h-3.5 w-3.5 mr-1" />
                Mark Business
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  bulkPatchMutation.mutate({ ids: selectedArray, patch: { reconciled: "true" } })
                }
                disabled={bulkPatchMutation.isPending}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Reconcile Selected
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => bulkDeleteMutation.mutate(selectedArray)}
                disabled={bulkDeleteMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete Selected
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            /* ── Empty State ── */
            <div className="text-center py-16 text-muted-foreground">
              <Receipt className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-semibold mb-2">No expenses yet</h3>
              <p className="text-sm max-w-sm mx-auto mb-6">
                Connect a bank account to automatically import your transactions as expenses, or add one manually.
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Button variant="outline" asChild>
                  <Link href="/accounts">
                    <Building2 className="h-4 w-4 mr-2" />
                    Connect Bank
                  </Link>
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => { setEditingExpense(undefined); setIsDialogOpen(true); }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Manually
                </Button>
              </div>
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No expenses match your filters</p>
              <p className="text-sm mt-1">Try adjusting your search or filter criteria</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          pagedExpenses.length > 0 &&
                          pagedExpenses.every((e) => selectedIds.has(e.id))
                        }
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    {/* Addition 3: Status column header */}
                    <TableHead className="w-10">
                      <span className="sr-only">Status</span>
                    </TableHead>
                    <SortHeader label="Merchant" sortKey="merchant" />
                    <SortHeader label="Date" sortKey="date" />
                    <SortHeader label="Category" sortKey="category" />
                    <SortHeader label="Amount" sortKey="amount" />
                    <TableHead>Source</TableHead>
                    <TableHead>Tax</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedExpenses.map((expense) => {
                    const matched = isAlreadyMatched(expense);
                    const isFlagged = flaggedTransactionIds.has(expense.id);
                    return (
                      <TableRow
                        key={expense.id}
                        className={`${selectedIds.has(expense.id) ? "bg-muted/40" : ""} ${matched ? "cursor-pointer hover:bg-muted/30" : ""} ${isFlagged ? "border-l-2 border-l-amber-400" : ""}`}
                        onMouseEnter={() => setTellerHoverId(expense.id)}
                        onMouseLeave={() => setTellerHoverId(null)}
                        onClick={matched ? () => handleRowClick(expense) : undefined}
                      >
                        {/* Checkbox */}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(expense.id)}
                            onCheckedChange={() => toggleSelect(expense.id)}
                            aria-label={`Select ${expense.merchant}`}
                          />
                        </TableCell>

                        {/* Addition 3: Status icon column */}
                        <TableCell>
                          <StatusIcon expense={expense} />
                        </TableCell>

                        {/* Merchant */}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0 uppercase">
                              {expense.merchant.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium leading-tight">{expense.merchant}</p>
                              {expense.notes && (
                                <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                                  {expense.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Date */}
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(parseISO(expense.date), "MMM d, yyyy")}
                        </TableCell>

                        {/* Category */}
                        <TableCell>
                          <Badge className={`text-xs font-medium ${getCategoryColor(expense.category)}`} variant="secondary">
                            {expense.category}
                          </Badge>
                        </TableCell>

                        {/* Amount — Part 3: show foreign currency info */}
                        <TableCell className="font-semibold text-red-500 whitespace-nowrap">
                          {isForeignCurrency(expense) ? (
                            <div>
                              <div className="flex items-center gap-1">
                                <span>{getCurrencyFlag((expense as any).isoCurrencyCode)}</span>
                                <span>{parseFloat(expense.amount as string).toFixed(2)} {(expense as any).isoCurrencyCode}</span>
                              </div>
                              <div className="text-xs text-muted-foreground font-normal">
                                ~{formatCurrency(effectiveCadAmount(expense))} CAD
                              </div>
                            </div>
                          ) : (
                            formatCurrency(expense.amount)
                          )}
                        </TableCell>

                        {/* Source */}
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {getExpenseSource(expense) === "Manual" ? (
                              <Pencil className="h-3.5 w-3.5" />
                            ) : (
                              <Link2 className="h-3.5 w-3.5" />
                            )}
                            <span>{getExpenseSource(expense)}</span>
                          </div>
                        </TableCell>

                        {/* Tax */}
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {expense.taxDeductible === "true" && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500 text-green-600 w-fit">
                                Tax
                              </Badge>
                            )}
                            {expense.isBusinessExpense === "true" && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500 text-blue-600 w-fit">
                                Biz
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        {/* Actions */}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {/* Ask AI button — visible on hover */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-8 w-8 transition-opacity ${tellerHoverId === expense.id ? "opacity-100" : "opacity-0"} text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30`}
                              onClick={(e) => { e.stopPropagation(); openTeller(expense); }}
                              aria-label="Ask AI about this transaction"
                              title="Ask AI about this transaction"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEdit(expense)}
                              aria-label="Edit expense"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setTaxCategoryExpense(expense);
                                    setSelectedTaxCategory(expense.taxCategory || "other_business");
                                    setIsTaxCategoryOpen(true);
                                  }}
                                >
                                  <Tag className="h-4 w-4 mr-2 text-green-600" />
                                  Mark as Tax Deductible
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setDeletingExpense(expense)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* ── Pagination ── */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredExpenses.length)} of{" "}
                    {filteredExpenses.length} expenses
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Add / Edit Modal ── */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); }}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingExpense ? "Edit Expense" : "Add New Expense"}</DialogTitle>
          </DialogHeader>
          <ExpenseForm expense={editingExpense} onClose={handleCloseDialog} />
        </DialogContent>
      </Dialog>

      {/* Addition 4: Read-only summary modal for already-matched/reconciled transactions */}
      <Dialog open={isSummaryOpen} onOpenChange={(open) => { if (!open) handleCloseSummary(); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Transaction Summary
            </DialogTitle>
          </DialogHeader>
          {summaryExpense && (
            <ExpenseSummary expense={summaryExpense} onClose={handleCloseSummary} />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Tax Category Selector Dialog ── */}
      <Dialog
        open={isTaxCategoryOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsTaxCategoryOpen(false);
            setTaxCategoryExpense(undefined);
          }
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-green-600" />
              Mark as Tax Deductible
            </DialogTitle>
          </DialogHeader>
          {taxCategoryExpense && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="font-medium">{taxCategoryExpense.merchant}</p>
                <p className="text-muted-foreground">
                  {formatCurrency(taxCategoryExpense.amount)} · {format(parseISO(taxCategoryExpense.date), "MMM d, yyyy")}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Tax Category</Label>
                <Select value={selectedTaxCategory} onValueChange={setSelectedTaxCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tax category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="business_meals">Business Meals</SelectItem>
                    <SelectItem value="software">Software &amp; Subscriptions</SelectItem>
                    <SelectItem value="home_office">Home Office</SelectItem>
                    <SelectItem value="travel">Business Travel</SelectItem>
                    <SelectItem value="professional_development">Professional Development</SelectItem>
                    <SelectItem value="equipment">Equipment</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="vehicle">Vehicle</SelectItem>
                    <SelectItem value="other_business">Other Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsTaxCategoryOpen(false);
                    setTaxCategoryExpense(undefined);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={singlePatchMutation.isPending}
                  onClick={() =>
                    singlePatchMutation.mutate({
                      id: taxCategoryExpense.id,
                      patch: { taxDeductible: "true", taxCategory: selectedTaxCategory },
                    })
                  }
                >
                  {singlePatchMutation.isPending ? "Saving..." : "Mark as Tax Deductible"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── AI Bank Teller Chatbot ── */}
      <FloatingChatbot
        externalOpen={tellerOpen}
        onExternalClose={() => { setTellerOpen(false); setTellerTransaction(null); }}
        transactionContext={tellerTransaction}
        tellerMode={true}
      />

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!deletingExpense} onOpenChange={() => setDeletingExpense(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the expense from "{deletingExpense?.merchant}" for{" "}
              {deletingExpense ? formatCurrency(deletingExpense.amount) : ""}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingExpense && deleteMutation.mutate(deletingExpense.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
