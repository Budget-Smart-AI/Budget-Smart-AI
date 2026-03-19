// FEATURE: INCOME_TRACKING | tier: free | limit: unlimited
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Plus, Pencil, Trash2, DollarSign, ChevronLeft, ChevronRight, Search, Filter, ArrowUpDown, Sparkles, Loader2, CheckCircle2, Calendar, X, AlertTriangle, ShieldCheck, MessageCircle, ChevronDown, ChevronUp } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, addMonths, parseISO, getDaysInMonth, eachDayOfInterval, getDay, addWeeks, isBefore, isAfter, isEqual } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { INCOME_CATEGORIES, RECURRENCE_OPTIONS, type Income } from "@shared/schema";
import { FloatingChatbot, type TransactionContext } from "@/components/floating-chatbot";
import { DemoBanner } from "@/components/demo-banner";

const incomeFormSchema = z.object({
  source: z.string().min(1, "Source is required"),
  amount: z.string().min(1, "Amount is required"),
  category: z.enum(INCOME_CATEGORIES),
  date: z.string().min(1, "Date is required"),
  isRecurring: z.boolean().optional(),
  recurrence: z.enum(RECURRENCE_OPTIONS).nullable().optional(),
  dueDay: z.number().min(1).max(31).nullable().optional(),
  customDates: z.array(z.number()).optional(),
  notes: z.string().optional(),
  futureAmount: z.string().nullable().optional(),
  amountChangeDate: z.string().nullable().optional(),
});

type IncomeFormValues = z.infer<typeof incomeFormSchema>;

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

type SortConfig = {
  key: keyof Income;
  direction: "asc" | "desc";
};

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

// Calculate total monthly income accounting for recurrence
function calculateMonthlyIncomeTotal(income: Income, monthStart: Date, monthEnd: Date): number {
  const amount = parseFloat(income.amount);
  if (isNaN(amount)) return 0;

  const incomeStartDate = parseISO(income.date);

  // Non-recurring income: only count if the exact date falls within this month
  if (income.isRecurring !== "true") {
    if (incomeStartDate >= monthStart && incomeStartDate <= monthEnd) {
      return amount;
    }
    return 0;
  }

  // Recurring income: must have started on or before the end of this month
  if (isAfter(incomeStartDate, monthEnd)) {
    return 0;
  }

  const recurrence = income.recurrence;

  if (recurrence === "custom" && income.customDates) {
    // Custom dates: count how many custom days fall in this month
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
    // Monthly: exactly 1 payment per month (regardless of which month)
    return amount;
  }

  if (recurrence === "yearly") {
    // Yearly: only counts if the income's start month matches the selected month
    // Must match BOTH month AND year (or be a future occurrence in the same month)
    const startMonth = incomeStartDate.getMonth(); // 0-11
    const selectedMonth = monthStart.getMonth();
    if (startMonth === selectedMonth) {
      return amount;
    }
    return 0;
  }

  if (recurrence === "weekly") {
    // Weekly: count how many matching weekdays fall in this month on/after start date
    const dayOfWeek = getDay(incomeStartDate);
    let count = 0;
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    for (const day of allDays) {
      if (getDay(day) === dayOfWeek && !isBefore(day, incomeStartDate)) {
        count++;
      }
    }
    return amount * count;
  }

  if (recurrence === "biweekly") {
    // Biweekly: walk forward from start date in 2-week steps, count hits in month
    let count = 0;
    let payDate = incomeStartDate;

    // Advance to first occurrence on or after monthStart
    while (isBefore(payDate, monthStart)) {
      payDate = addWeeks(payDate, 2);
    }

    // Count all occurrences within the month
    while (!isAfter(payDate, monthEnd)) {
      count++;
      payDate = addWeeks(payDate, 2);
    }

    return amount * count;
  }

  // Default fallback: treat as monthly (1 payment)
  return amount;
}

function IncomeForm({
  income,
  onClose,
  defaultDate,
}: {
  income?: Income;
  onClose: () => void;
  defaultDate: string;
}) {
  const { toast } = useToast();
  const isEditing = !!income;

  const parseCustomDates = (customDatesStr: string | null | undefined): number[] => {
    if (!customDatesStr) return [];
    try {
      return JSON.parse(customDatesStr) as number[];
    } catch {
      return [];
    }
  };

  const form = useForm<IncomeFormValues>({
    resolver: zodResolver(incomeFormSchema),
    defaultValues: {
      source: income?.source || "",
      amount: income?.amount || "",
      category: (income?.category as typeof INCOME_CATEGORIES[number]) || "Salary",
      date: income?.date || defaultDate,
      isRecurring: income?.isRecurring === "true",
      recurrence: (income?.recurrence as typeof RECURRENCE_OPTIONS[number]) || "monthly",
      dueDay: income?.dueDay || 1,
      customDates: parseCustomDates(income?.customDates),
      notes: income?.notes || "",
      futureAmount: income?.futureAmount || null,
      amountChangeDate: income?.amountChangeDate || null,
    },
  });

  const isRecurring = form.watch("isRecurring");
  const recurrence = form.watch("recurrence");
  const customDates = form.watch("customDates") || [];

  const preparePayload = (values: IncomeFormValues) => {
    return {
      ...values,
      isRecurring: values.isRecurring ? "true" : "false",
      customDates: values.recurrence === "custom" && values.customDates?.length
        ? JSON.stringify(values.customDates)
        : null,
      dueDay: values.recurrence === "custom" ? null : values.dueDay,
      futureAmount: values.futureAmount || null,
      amountChangeDate: values.amountChangeDate || null,
    };
  };

  const createMutation = useMutation({
    mutationFn: async (values: IncomeFormValues) => {
      return apiRequest("POST", "/api/income", preparePayload(values));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      toast({ title: "Income added successfully" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to add income", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: IncomeFormValues) => {
      return apiRequest("PATCH", `/api/income/${income?.id}`, preparePayload(values));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      toast({ title: "Income updated successfully" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to update income", variant: "destructive" });
    },
  });

  const onSubmit = (values: IncomeFormValues) => {
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
          name="source"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Source</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Company Name, Client" {...field} />
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

        {isEditing && (income as any)?.autoDetected && (
          <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Auto-detected</span>
            {(income as any)?.recurrence && (
              <Badge variant="secondary" className="text-xs ml-auto">
                Detected as {(income as any).recurrence}
              </Badge>
            )}
          </div>
        )}

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {INCOME_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isRecurring"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Recurring Income</FormLabel>
                <FormDescription>
                  Mark if this is a regular recurring income
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {isRecurring && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="recurrence"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recurrence</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || "monthly"}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select recurrence" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {RECURRENCE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option.charAt(0).toUpperCase() + option.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {recurrence !== "custom" && recurrence !== "weekly" && recurrence !== "biweekly" && (
                <FormField
                  control={form.control}
                  name="dueDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pay Day (1-31)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={31}
                          placeholder="e.g., 15"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {recurrence === "custom" && (
              <FormField
                control={form.control}
                name="customDates"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Payment Days</FormLabel>
                    <FormDescription>
                      Click on the days of the month when you receive this income
                    </FormDescription>
                    <div className="grid grid-cols-7 gap-1 mt-2">
                      {DAY_OPTIONS.map((day) => {
                        const isSelected = customDates.includes(day);
                        return (
                          <Button
                            key={day}
                            type="button"
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              const newDates = isSelected
                                ? customDates.filter((d) => d !== day)
                                : [...customDates, day].sort((a, b) => a - b);
                              field.onChange(newDates);
                            }}
                          >
                            {day}
                          </Button>
                        );
                      })}
                    </div>
                    {customDates.length > 0 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Selected: {customDates.join(", ")}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </>
        )}

        {/* Scheduled Amount Change - only for recurring income */}
        {isRecurring && (
          <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Scheduled Amount Change</span>
              <span className="text-xs text-muted-foreground">(optional)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Use this for income that changes on a specific date (e.g., after tax bracket changes, raises, or seasonal adjustments).
            </p>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="futureAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Amount ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="e.g., 4100.00"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amountChangeDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Change Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        )}

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

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : isEditing ? "Update Income" : "Add Income"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function IncomePage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDetectDialogOpen, setIsDetectDialogOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<Income | undefined>();
  const [deletingIncome, setDeletingIncome] = useState<Income | undefined>();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "date", direction: "desc" });
  const { toast } = useToast();

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
      .catch(() => {/* silently ignore */});
  }, [flagsLoaded]);

  const dismissFlag = async (flagId: string) => {
    try {
      await apiRequest("POST", `/api/ai/teller/flags/${flagId}/dismiss`);
      setTellerFlags((prev) => prev.filter((f) => f.id !== flagId));
    } catch {/* ignore */}
  };

  const openTeller = (inc: Income) => {
    setTellerTransaction({
      id: inc.id,
      merchant: inc.source,
      amount: parseFloat(inc.amount as string),
      date: inc.date,
      category: inc.category,
      notes: inc.notes || undefined,
      source: "manual",
    });
    setTellerOpen(true);
  };

  // Detect income state
  const [detectedIncome, setDetectedIncome] = useState<any[]>([]);
  const [selectedDetected, setSelectedDetected] = useState<Set<number>>(new Set());
  const [isDetecting, setIsDetecting] = useState(false);
  const [isAddingDetected, setIsAddingDetected] = useState(false);

  const deduplicateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/income/deduplicate");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      // Always show the review dialog so the user sees what happened
      setDedupReviewData(data);
      setIsDedupReviewOpen(true);
    },
    onError: () => {
      toast({ title: "Failed to clean duplicates", variant: "destructive" });
    },
  });

  const detectIncome = async () => {
    setIsDetecting(true);
    setDetectedIncome([]);
    setSelectedDetected(new Set());
    setIsDetectDialogOpen(true); // Open dialog immediately to show loading state
    try {
      const response = await apiRequest("POST", "/api/income/detect");
      const data = await response.json();
      setDetectedIncome(data.suggestions || []);
      // Auto-select high confidence income
      const highConfidence = new Set<number>();
      data.suggestions?.forEach((s: any, i: number) => {
        if (s.confidence === "high") highConfidence.add(i);
      });
      setSelectedDetected(highConfidence);
    } catch (error) {
      toast({ title: "Failed to detect income", variant: "destructive" });
      setIsDetectDialogOpen(false);
    } finally {
      setIsDetecting(false);
    }
  };

  const toggleDetectedIncome = (index: number) => {
    setSelectedDetected(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const addSelectedIncome = async () => {
    if (selectedDetected.size === 0) return;
    setIsAddingDetected(true);
    try {
      const incomeToAdd = Array.from(selectedDetected).map(i => detectedIncome[i]);
      for (const inc of incomeToAdd) {
        await apiRequest("POST", "/api/income", {
          source: inc.name,
          amount: inc.amount,
          category: inc.category,
          date: format(new Date(), "yyyy-MM-dd"),
          isRecurring: "true",
          recurrence: inc.recurrence,
          dueDay: inc.dueDay,
          notes: `Auto-detected from ${inc.source === "plaid" ? "bank transactions" : "AI analysis"}`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      toast({ title: `Added ${incomeToAdd.length} income source${incomeToAdd.length > 1 ? "s" : ""}` });
      setIsDetectDialogOpen(false);
      setDetectedIncome([]);
      setSelectedDetected(new Set());
    } catch (error) {
      toast({ title: "Failed to add income", variant: "destructive" });
    } finally {
      setIsAddingDetected(false);
    }
  };

  // Dedup review dialog state
  const [dedupReviewData, setDedupReviewData] = useState<{
    removed: number;
    message: string;
    flaggedForReview: Array<{ source: string; date: string; amount: string; count: number; ids: string[] }>;
  } | null>(null);
  const [isDedupReviewOpen, setIsDedupReviewOpen] = useState(false);

  const [bannerDismissed, setBannerDismissed] = useState(false);

  const flaggedTransactionIds = new Set(tellerFlags.map((f: any) => f.transaction_id));

  const { data: allIncome = [], isLoading } = useQuery<Income[]>({
    queryKey: ["/api/income"],
  });

  const autoDetectedIncome = allIncome.filter((inc) => (inc as any).autoDetected === true);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/income/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      toast({ title: "Income deleted successfully" });
      setDeletingIncome(undefined);
    },
    onError: () => {
      toast({ title: "Failed to delete income", variant: "destructive" });
    },
  });

  const handleEdit = (income: Income) => {
    setEditingIncome(income);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingIncome(undefined);
  };

  const handleSort = (key: SortConfig["key"]) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const filteredIncome = allIncome
    .filter((inc) => {
      const incomeDate = parseISO(inc.date);
      // For recurring income, show if the start date is on or before the end of the month
      // For one-time income, check if it falls within this month
      const isRelevantToMonth = inc.isRecurring === "true" 
        ? incomeDate <= monthEnd  // Recurring: started on or before end of month
        : (incomeDate >= monthStart && incomeDate <= monthEnd);  // One-time: in this month
      const matchesSearch = inc.source.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || inc.category === categoryFilter;
      return isRelevantToMonth && matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      let valA: any = a[sortConfig.key];
      let valB: any = b[sortConfig.key];

      if (sortConfig.key === "amount") {
        valA = parseFloat(valA);
        valB = parseFloat(valB);
      } else if (sortConfig.key === "date") {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }

      if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

  // Calculate total for the selected month — use filteredIncome so it respects
  // the month filter, search, and category filter (matching what's shown in the table).
  // calculateMonthlyIncomeTotal handles recurrence multipliers correctly.
  const monthlyTotal = filteredIncome.reduce(
    (sum, inc) => sum + calculateMonthlyIncomeTotal(inc, monthStart, monthEnd),
    0
  );

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: SortConfig["key"] }) => (
    <TableHead 
      className="cursor-pointer hover:text-primary transition-colors"
      onClick={() => handleSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </div>
    </TableHead>
  );

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

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Income</h1>
            <HelpTooltip
              title="About Income"
              content="Record all your income sources including salary, freelance work, and investments. Set up recurring income entries to avoid manual entry each pay period. Income data feeds into your dashboard and reports."
            />
          </div>
          <p className="text-muted-foreground">Track your income sources</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => deduplicateMutation.mutate()}
            disabled={deduplicateMutation.isPending}
            title="Remove duplicate income records"
          >
            {deduplicateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Clean Duplicates
          </Button>
          <Button variant="outline" onClick={detectIncome} disabled={isDetecting}>
            {isDetecting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Detect Income
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingIncome(undefined)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Income
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingIncome ? "Edit Income" : "Add New Income"}</DialogTitle>
            </DialogHeader>
            <IncomeForm
              income={editingIncome}
              onClose={handleCloseDialog}
              defaultDate={format(new Date(), "yyyy-MM-dd")}
            />
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Auto-detected income banner */}
      {!bannerDismissed && autoDetectedIncome.length > 0 && (
        <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <Sparkles className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-primary">
              {autoDetectedIncome.length} recurring income source{autoDetectedIncome.length > 1 ? "s were" : " was"} auto-detected from your bank history
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review and edit them below. Click the pencil icon to see detection details.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setBannerDismissed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Detect Income Dialog */}
      <Dialog open={isDetectDialogOpen} onOpenChange={(open) => !isDetecting && setIsDetectDialogOpen(open)}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Detected Recurring Income
            </DialogTitle>
          </DialogHeader>
          {isDetecting ? (
            <div className="text-center py-12">
              <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin mb-4" />
              <p className="text-muted-foreground font-medium">Analyzing your transactions...</p>
              <p className="text-sm text-muted-foreground mt-2">
                Looking for recurring deposits and income patterns (excluding small amounts under $200).
              </p>
            </div>
          ) : detectedIncome.length === 0 ? (
            <div className="text-center py-8">
              <DollarSign className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No new recurring income detected.</p>
              <p className="text-sm text-muted-foreground mt-1">
                All detected income sources are already in your list, or we couldn't find recurring patterns.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                We found {detectedIncome.length} recurring income source{detectedIncome.length > 1 ? "s" : ""} in your transactions.
                Select which ones to add.
              </p>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {detectedIncome.map((inc, index) => (
                  <div
                    key={index}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedDetected.has(index) ? "bg-primary/5 border-primary" : "hover:bg-muted/50"
                    }`}
                    onClick={() => toggleDetectedIncome(index)}
                  >
                    <Checkbox
                      checked={selectedDetected.has(index)}
                      onCheckedChange={() => toggleDetectedIncome(index)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{inc.name}</span>
                        {inc.confidence === "high" && (
                          <Badge variant="secondary" className="text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            High confidence
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="text-green-600 font-medium">{formatCurrency(inc.amount)}</span>
                        <span>•</span>
                        <span>{inc.recurrence}</span>
                        <span>•</span>
                        <Badge variant="outline" className="text-xs">{inc.category}</Badge>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {inc.source === "plaid" ? "Bank" : "AI"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-4 border-t">
                <span className="text-sm text-muted-foreground">
                  {selectedDetected.size} of {detectedIncome.length} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsDetectDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={addSelectedIncome}
                    disabled={selectedDetected.size === 0 || isAddingDetected}
                  >
                    {isAddingDetected ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Add {selectedDetected.size} Income{selectedDetected.size !== 1 ? "s" : ""}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Income Sources
            </CardTitle>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search income..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    <SelectValue placeholder="Category" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {INCOME_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 border rounded-md p-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-medium min-w-[120px] text-center text-sm">
                  {format(currentMonth, "MMM yyyy")}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(monthlyTotal)}
            <span className="text-sm font-normal text-muted-foreground ml-2">
              total for {format(currentMonth, "MMMM")}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredIncome.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="mb-4">No income recorded matching filters</p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Income
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader label="Source" sortKey="source" />
                  <SortHeader label="Category" sortKey="category" />
                  <SortHeader label="Date" sortKey="date" />
                  <SortHeader label="Amount" sortKey="amount" />
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIncome.map((inc) => (
                  <TableRow
                    key={inc.id}
                    className={flaggedTransactionIds.has(inc.id) ? "border-l-2 border-l-amber-400" : ""}
                    onMouseEnter={() => setTellerHoverId(inc.id)}
                    onMouseLeave={() => setTellerHoverId(null)}
                  >
                    <TableCell className="font-medium">
                      <div>
                        {inc.source}
                        {inc.isRecurring === "true" && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {inc.recurrence === "custom" && inc.customDates
                              ? `Custom (Days ${JSON.parse(inc.customDates).join(", ")})`
                              : inc.recurrence === "weekly" || inc.recurrence === "biweekly"
                                ? inc.recurrence.charAt(0).toUpperCase() + inc.recurrence.slice(1)
                                : inc.recurrence && inc.dueDay
                                  ? `${inc.recurrence.charAt(0).toUpperCase() + inc.recurrence.slice(1)} (Pay Day ${inc.dueDay})`
                                  : "Recurring"}
                          </Badge>
                        )}
                        {inc.notes && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {inc.notes}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{inc.category}</Badge>
                    </TableCell>
                    <TableCell>{format(parseISO(inc.date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-right font-semibold text-green-600">
                      {formatCurrency(inc.amount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {/* Ask AI button — visible on hover */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 transition-opacity ${tellerHoverId === inc.id ? "opacity-100" : "opacity-0"} text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30`}
                          onClick={() => openTeller(inc)}
                          aria-label="Ask AI about this income"
                          title="Ask AI about this income"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(inc)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeletingIncome(inc)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── AI Bank Teller Chatbot ── */}
      <FloatingChatbot
        externalOpen={tellerOpen}
        onExternalClose={() => { setTellerOpen(false); setTellerTransaction(null); }}
        transactionContext={tellerTransaction}
        tellerMode={true}
      />

      <AlertDialog open={!!deletingIncome} onOpenChange={() => setDeletingIncome(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Income</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingIncome?.source}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingIncome && deleteMutation.mutate(deletingIncome.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clean Duplicates Review Dialog */}
      <Dialog open={isDedupReviewOpen} onOpenChange={setIsDedupReviewOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Clean Duplicates — Results
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Exact duplicates removed */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  {dedupReviewData?.removed ?? 0} exact duplicate{(dedupReviewData?.removed ?? 0) !== 1 ? "s" : ""} removed
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                  {(dedupReviewData?.removed ?? 0) > 0
                    ? "Records where source, date, amount, category, and notes all matched — safest to remove."
                    : "No exact duplicates found in your income records."}
                </p>
              </div>
            </div>

            {/* Manual/auto-import conflicts */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">
                  0 manual / auto-import conflicts found
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  No auto-imported records had a matching manual entry within ±1 day and 1% amount.
                </p>
              </div>
            </div>

            {/* Flagged for review */}
            {(dedupReviewData?.flaggedForReview?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <p className="text-sm font-medium">
                    {dedupReviewData!.flaggedForReview.length} group{dedupReviewData!.flaggedForReview.length !== 1 ? "s" : ""} flagged for your review
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  These entries appear 3+ times on the same day with the same amount. They may be legitimate (e.g., 3 separate client payments) — review before deleting.
                </p>
                <div className="space-y-2 max-h-[240px] overflow-y-auto">
                  {dedupReviewData!.flaggedForReview.map((group, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{group.source}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(group.date), "MMM d, yyyy")} · {formatCurrency(group.amount)} · appears {group.count}×
                        </p>
                      </div>
                      <Badge variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 shrink-0 text-xs">
                        Keep all
                      </Badge>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground italic">
                  To remove any of these, use the delete (🗑) button on the income row directly.
                </p>
              </div>
            )}

            {/* All clear message when nothing flagged */}
            {(dedupReviewData?.flaggedForReview?.length ?? 0) === 0 && (dedupReviewData?.removed ?? 0) === 0 && (
              <div className="text-center py-4">
                <ShieldCheck className="h-10 w-10 mx-auto text-green-500 mb-2" />
                <p className="text-sm font-medium">Your income records look clean!</p>
                <p className="text-xs text-muted-foreground mt-1">No duplicates or suspicious entries were found.</p>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t">
            <Button onClick={() => setIsDedupReviewOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
