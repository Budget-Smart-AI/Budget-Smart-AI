// FEATURE: BUDGET_CREATION | tier: free | limit: 2 budgets
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, PieChart, ChevronLeft, ChevronRight, Sparkles, Loader2, Settings2, Banknote } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, addMonths, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EXPENSE_CATEGORIES, type Budget } from "@shared/schema";
import { DemoBanner } from "@/components/demo-banner";

// ════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function getDaysUntilPayday(nextPayday: string | null, budgetPeriod: string): number | null {
  if (!nextPayday || budgetPeriod === 'monthly') return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let payday = new Date(nextPayday);
  payday.setHours(0, 0, 0, 0);
  const intervalDays = budgetPeriod === 'biweekly' ? 14 : 7;
  while (payday < today) {
    payday = new Date(payday.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  }
  return Math.ceil((payday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// ════════════════════════════════════════
// SCHEMAS & TYPES
// ════════════════════════════════════════

const budgetFormSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.string().min(1, "Amount is required"),
  month: z.string(),
});

type BudgetFormValues = z.infer<typeof budgetFormSchema>;

interface AiBudgetSuggestion {
  category: string;
  suggestedAmount: number;
  reasoning: string;
  confidence: "high" | "medium" | "low";
  type: "necessity" | "discretionary" | "savings-opportunity";
}

// API Response Types
interface BudgetItem {
  id: string;
  category: string;
  amount: number;
  spent: number;
  percentage: number;
  paceStatus: "under" | "on-pace" | "over-pace" | "over-budget";
  paceLabel: string;
  projected: number;
  lastMonthSpent?: number;
}

interface BudgetsResult {
  items: BudgetItem[];
  totalBudget: number;
  totalSpent: number;
  overallPercentage: number;
  monthProgress: number;
  totalDaysInMonth: number;
  totalPaceStatus: "under" | "on-pace" | "over-pace" | "over-budget";
  healthCounts: {
    overBudget: number;
    overPace: number;
    onPace: number;
    under: number;
  };
}

// ════════════════════════════════════════
// BUDGET FORM COMPONENT
// ════════════════════════════════════════

function BudgetForm({
  budget,
  onClose,
  currentMonth,
  existingCategories,
}: {
  budget?: Budget;
  onClose: () => void;
  currentMonth: string;
  existingCategories: string[];
}) {
  const { toast } = useToast();
  const isEditing = !!budget;

  const availableCategories = isEditing
    ? EXPENSE_CATEGORIES
    : EXPENSE_CATEGORIES.filter((cat) => !existingCategories.includes(cat));

  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetFormSchema),
    defaultValues: {
      category: (budget?.canonicalCategoryId as typeof EXPENSE_CATEGORIES[number]) || availableCategories[0],
      amount: budget?.amount || "",
      month: budget?.month || currentMonth,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: BudgetFormValues) => {
      return apiRequest("POST", "/api/budgets", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      toast({ title: "Budget created successfully" });
      onClose();
    },
    onError: (error: Error) => {
      const is402 = error.message.includes("reached the limit") || error.message.includes("Upgrade to Pro");
      toast({
        title: is402 ? "Budget limit reached" : "Failed to create budget",
        description: is402
          ? "You've used all 5 budgets on the free plan. Upgrade to Pro for unlimited budgets."
          : error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: BudgetFormValues) => {
      return apiRequest("PATCH", `/api/budgets/${budget?.id}`, values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      toast({ title: "Budget updated successfully" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to update budget", variant: "destructive" });
    },
  });

  const onSubmit = (values: BudgetFormValues) => {
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
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                disabled={isEditing}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(isEditing ? EXPENSE_CATEGORIES : availableCategories).map((category) => (
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
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Budget Amount ($)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="0.00" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || (!isEditing && availableCategories.length === 0)}>
            {isPending ? "Saving..." : isEditing ? "Update Budget" : "Set Budget"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ════════════════════════════════════════
// MAIN PAGE COMPONENT
// ════════════════════════════════════════

export default function BudgetsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | undefined>();
  const [deletingBudget, setDeletingBudget] = useState<Budget | undefined>();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiBudgetSuggestion[]>([]);
  const [aiAdvice, setAiAdvice] = useState("");
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [adjustedAmounts, setAdjustedAmounts] = useState<Record<string, string>>({});
  const [filterStatus, setFilterStatus] = useState<"all" | "over" | "on-pace" | "under">("all");
  const [sortBy, setSortBy] = useState<"default" | "spent-desc" | "name" | "over-first">("over-first");
  const [showBudgetSettings, setShowBudgetSettings] = useState(false);
  const [budgetPeriodSetting, setBudgetPeriodSetting] = useState('monthly');
  const [nextPaydaySetting, setNextPaydaySetting] = useState('');
  const { toast } = useToast();

  const { data: userBudgetSettings, refetch: refetchBudgetSettings } = useQuery<{
    budgetPeriod: string;
    nextPayday: string | null;
  }>({
    queryKey: ['/api/user/budget-settings'],
    queryFn: async () => {
      const r = await apiRequest('GET', '/api/user/budget-settings');
      return r.json();
    },
  });

  useEffect(() => {
    if (userBudgetSettings) {
      setBudgetPeriodSetting(userBudgetSettings.budgetPeriod || 'monthly');
      setNextPaydaySetting(userBudgetSettings.nextPayday || '');
    }
  }, [userBudgetSettings]);

  const saveBudgetSettings = async () => {
    try {
      await apiRequest('PATCH', '/api/user/budget-settings', {
        budgetPeriod: budgetPeriodSetting,
        nextPayday: nextPaydaySetting || null,
      });
      refetchBudgetSettings();
      setShowBudgetSettings(false);
      toast({ title: 'Settings saved', description: 'Budget settings updated.' });
    } catch (err: any) {
      toast({
        title: 'Could not save settings',
        description: err?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const now = new Date();
  const monthStr = format(currentMonth, "yyyy-MM");

  // Fetch all budgets (raw list) for determining existing categories
  const { data: allBudgets = [], isLoading: budgetsLoading } = useQuery<Budget[]>({
    queryKey: ["/api/budgets"],
  });

  // Fetch budgets with calculations from the engine.
  // NOTE: must go through `apiRequest` (not bare `fetch`) so the request is
  // routed to the isolated engine host (api.budgetsmart.io) in production
  // — see resolveApiUrl in lib/queryClient.ts. Bare fetch hits the website
  // host and 404s post engine-isolation, which leaves the UI in an empty
  // state even when raw budgets exist.
  const { data: budgetsData, isLoading: budgetsDataLoading } = useQuery<BudgetsResult>({
    queryKey: ["/api/engine/budgets", monthStr],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/engine/budgets?month=${monthStr}`);
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/budgets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/engine/budgets"] });
      toast({ title: "Budget deleted successfully" });
      setDeletingBudget(undefined);
    },
    onError: () => {
      toast({ title: "Failed to delete budget", variant: "destructive" });
    },
  });

  const aiSuggestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/suggest-budgets", { month: monthStr });
      return res.json();
    },
    onSuccess: (data: { suggestions: AiBudgetSuggestion[]; overallAdvice: string }) => {
      if (data.suggestions.length === 0) {
        toast({ title: data.overallAdvice || "No suggestions available", variant: "default" });
        return;
      }
      setAiSuggestions(data.suggestions);
      setAiAdvice(data.overallAdvice);
      setSelectedSuggestions(new Set(data.suggestions.map(s => s.category)));
      const amounts: Record<string, string> = {};
      data.suggestions.forEach(s => { amounts[s.category] = s.suggestedAmount.toFixed(2); });
      setAdjustedAmounts(amounts);
      setAiDialogOpen(true);
    },
    onError: () => {
      toast({ title: "Failed to get AI suggestions", variant: "destructive" });
    },
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async (budgets: { category: string; amount: string; month: string }[]) => {
      for (const budget of budgets) {
        await apiRequest("POST", "/api/budgets", budget);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/engine/budgets"] });
      toast({ title: "Budgets created from AI suggestions" });
      setAiDialogOpen(false);
      setAiSuggestions([]);
    },
    onError: () => {
      toast({ title: "Failed to create budgets", variant: "destructive" });
    },
  });

  const handleAcceptSuggestions = () => {
    const budgetsToCreate = aiSuggestions
      .filter(s => selectedSuggestions.has(s.category))
      .map(s => ({
        category: s.category,
        amount: adjustedAmounts[s.category] || s.suggestedAmount.toFixed(2),
        month: monthStr,
      }));
    if (budgetsToCreate.length === 0) {
      toast({ title: "No suggestions selected" });
      return;
    }
    bulkCreateMutation.mutate(budgetsToCreate);
  };

  const toggleSuggestion = (category: string) => {
    setSelectedSuggestions(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingBudget(undefined);
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  // Filter budgets for current month
  const monthBudgets = allBudgets.filter((b) => b.month === monthStr);
  const existingCategories = monthBudgets.map((b) => b.category);

  const isLoading = budgetsLoading || budgetsDataLoading;

  // Extract data from engine or provide defaults
  const engineData = budgetsData || {
    items: [],
    totalBudget: 0,
    totalSpent: 0,
    overallPercentage: 0,
    monthProgress: 0,
    totalDaysInMonth: 0,
    totalPaceStatus: "on-pace" as const,
    healthCounts: { overBudget: 0, overPace: 0, onPace: 0, under: 0 },
  };

  // ── Filter + sort ─────────────────────────────────────────────────────────
  const overBudgetCount = engineData.healthCounts.overBudget;

  const filteredBudgets = engineData.items
    .filter(b => {
      if (filterStatus === "all") return true;
      if (filterStatus === "over") return b.paceStatus === "over-budget";
      if (filterStatus === "on-pace") return b.paceStatus === "on-pace";
      if (filterStatus === "under") return b.paceStatus === "under";
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "over-first") {
        const aOver = a.paceStatus === "over-budget" ? 1 : 0;
        const bOver = b.paceStatus === "over-budget" ? 1 : 0;
        return bOver - aOver;
      }
      if (sortBy === "spent-desc") {
        return b.spent - a.spent;
      }
      if (sortBy === "name") {
        return a.category.localeCompare(b.category);
      }
      return 0;
    });

  // ── Paycheck-aligned calculations ─────────────────────────────────────────
  const daysUntilPayday = getDaysUntilPayday(
    userBudgetSettings?.nextPayday ?? null,
    userBudgetSettings?.budgetPeriod || 'monthly'
  );
  const remaining = Math.max(engineData.totalBudget - engineData.totalSpent, 0);
  const safePerDay = daysUntilPayday && daysUntilPayday > 0
    ? remaining / daysUntilPayday
    : null;

  return (
    <div className="space-y-6">
      <DemoBanner />
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Budgets</h1>
            <HelpTooltip
              title="About Budgets"
              content="Set monthly spending limits by category and track your progress. Get visual indicators when approaching limits, and use AI-powered suggestions for realistic budget amounts based on your spending history."
            />
          </div>
          <p className="text-muted-foreground">Set spending limits by category</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBudgetSettings(true)}
            className="p-2 border border-border rounded-lg hover:bg-muted transition-colors"
            title="Budget Settings">
            <Settings2 size={15} className="text-muted-foreground" />
          </button>
          <Button
            variant="outline"
            onClick={() => aiSuggestMutation.mutate()}
            disabled={aiSuggestMutation.isPending}
          >
            {aiSuggestMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {aiSuggestMutation.isPending ? "Analyzing..." : "AI Suggest"}
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingBudget(undefined)}>
                <Plus className="h-4 w-4 mr-2" />
                Set Budget
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>{editingBudget ? "Edit Budget" : "Set Category Budget"}</DialogTitle>
              </DialogHeader>
              <BudgetForm
                budget={editingBudget}
                onClose={handleCloseDialog}
                currentMonth={monthStr}
                existingCategories={existingCategories}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── MONTH NAVIGATOR ── */}
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

      {/* ── ENHANCED OVERVIEW BAR ── */}
      {engineData.items.length > 0 && (
        <div className="rounded-xl border border-border p-5">
          {/* Top row: Budget and Spent */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Total Budget</p>
              <p className="text-2xl font-bold">{formatCurrency(engineData.totalBudget)}</p>
            </div>
            <div className="text-center hidden sm:block">
              <p className="text-xs text-muted-foreground mb-0.5">Spent</p>
              <p className="text-lg font-semibold text-muted-foreground">
                {engineData.totalBudget > 0 ? `${Math.min(engineData.overallPercentage, 100).toFixed(1)}%` : "0%"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-0.5">Total Spent</p>
              <p className={`text-2xl font-bold ${engineData.totalSpent > engineData.totalBudget ? "text-red-500" : "text-green-500"}`}>
                {formatCurrency(engineData.totalSpent)}
              </p>
            </div>
          </div>

          {/* Progress bar with pace marker */}
          <div className="relative h-3 bg-muted rounded-full overflow-hidden mb-2">
            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-all ${
                engineData.totalSpent > engineData.totalBudget ? "bg-red-500" : "bg-primary"
              }`}
              style={{ width: `${Math.min(engineData.overallPercentage, 100)}%` }}
            />
            {/* Pace marker line */}
            {engineData.totalBudget > 0 && (
              <div
                className="absolute top-0 h-full w-0.5 bg-white/60"
                style={{ left: `${Math.min(engineData.monthProgress * 100, 99)}%` }}
                title={`Expected pace: Day ${now.getDate()} of ${engineData.totalDaysInMonth}`}
              />
            )}
          </div>

          {/* Bottom row: remaining + pace */}
          <div className="flex items-center justify-between text-sm flex-wrap gap-2">
            <span className="text-muted-foreground">
              {formatCurrency(Math.max(engineData.totalBudget - engineData.totalSpent, 0))} remaining
            </span>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-muted-foreground">
                Day {now.getDate()} of {engineData.totalDaysInMonth}
              </span>
              {engineData.totalBudget > 0 && (
                <span className={`text-xs font-medium flex items-center gap-1 ${
                  engineData.totalPaceStatus === "over-budget" || engineData.totalPaceStatus === "over-pace"
                    ? "text-amber-500"
                    : "text-green-500"
                }`}>
                  {(engineData.totalPaceStatus === "over-budget" || engineData.totalPaceStatus === "over-pace") && "⚠️"}
                  {(engineData.totalPaceStatus === "on-pace" || engineData.totalPaceStatus === "under") && "✓"}
                  {engineData.totalPaceStatus === "over-budget" ? "Over budget"
                    : engineData.totalPaceStatus === "over-pace" ? "Over pace"
                    : engineData.totalPaceStatus === "on-pace" ? "On pace"
                    : "Under pace"}
                </span>
              )}
            </div>
          </div>

          {/* Payday countdown row */}
          {daysUntilPayday !== null && (
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
              <div className="flex items-center gap-1.5">
                <Banknote size={12} className="text-green-500 shrink-0" />
                {daysUntilPayday === 0 ? (
                  <span className="text-green-500 font-medium">Payday today!</span>
                ) : daysUntilPayday === 1 ? (
                  <span className="text-green-500 font-medium">Payday tomorrow</span>
                ) : (
                  <span className="text-muted-foreground">
                    Payday in{' '}
                    <span className="font-medium text-foreground">{daysUntilPayday} days</span>
                  </span>
                )}
              </div>
              {safePerDay !== null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Safe to spend:</span>
                  <span className={`font-medium ${
                    safePerDay < 20 ? 'text-red-500' : safePerDay < 50 ? 'text-amber-500' : 'text-green-500'
                  }`}>
                    {formatCurrency(safePerDay)}/day
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── HEALTH SUMMARY ── */}
      {engineData.items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
            <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-red-500">{engineData.healthCounts.overBudget} Over Budget</p>
              <p className="text-xs text-muted-foreground">Need attention</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-500">{engineData.healthCounts.overPace} Over Pace</p>
              <p className="text-xs text-muted-foreground">Watch closely</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-green-500">{engineData.healthCounts.onPace} On Pace</p>
              <p className="text-xs text-muted-foreground">Looking good</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
            <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium">{engineData.healthCounts.under} Under Pace</p>
              <p className="text-xs text-muted-foreground">Ahead of budget</p>
            </div>
          </div>
        </div>
      )}

      {/* ── FILTER + SORT BAR ── */}
      {engineData.items.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Filter chips */}
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { key: "all", label: "All" },
              { key: "over", label: `Over Budget${overBudgetCount > 0 ? ` ${overBudgetCount}` : ""}` },
              { key: "on-pace", label: "On Pace" },
              { key: "under", label: "Under Pace" },
            ].map(filter => (
              <button
                key={filter.key}
                onClick={() => setFilterStatus(filter.key as typeof filterStatus)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filterStatus === filter.key
                    ? filter.key === "over"
                      ? "bg-red-500/20 text-red-500 border border-red-500/30"
                      : "bg-primary/20 text-primary border border-primary/30"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Sort selector */}
          <Select value={sortBy} onValueChange={val => setSortBy(val as typeof sortBy)}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="over-first">Over Budget First</SelectItem>
              <SelectItem value="spent-desc">Highest Spend</SelectItem>
              <SelectItem value="name">A → Z</SelectItem>
              <SelectItem value="default">Default Order</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── BUDGET CARDS GRID ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {isLoading ? (
          [1, 2, 3, 4].map((i) => (
            <Card key={i} variant="glass">
              <CardContent className="pt-6">
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          ))
        ) : engineData.items.length === 0 ? (
          <div className="col-span-full rounded-xl border border-border p-12 text-center">
            <PieChart className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground mb-4">No budgets set for this month</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Set Your First Budget
            </Button>
          </div>
        ) : filteredBudgets.length === 0 ? (
          <div className="col-span-full rounded-xl border border-border p-8 text-center">
            <p className="text-muted-foreground">No budgets match the selected filter.</p>
            <button
              onClick={() => setFilterStatus("all")}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Clear filter
            </button>
          </div>
        ) : (
          filteredBudgets.map((budget) => {
            // Engine returns `budgetAmount` (per BudgetItemResult). The legacy
            // `amount` shape is kept as a fallback for any not-yet-migrated
            // callers so we never display $NaN again (UAT-8 #134 root cause).
            const spent = Number(budget.spent ?? 0);
            const limit = Number(
              (budget as any).budgetAmount ?? (budget as any).amount ?? 0
            );
            const remaining = Math.max(limit - spent, 0);
            const percentage = Number(budget.percentage ?? 0);
            const paceStatus = budget.paceStatus;
            const projected = Number(budget.projected ?? 0);
            const isOverBudget = spent > limit;
            const isOverPace = paceStatus === "over-pace";

            return (
              <div
                key={budget.id}
                // Phase 3.4: neutral (on-pace) cards opt into glass-surface so
                // they sit on the mint theme substrate. Over-budget / over-pace
                // KEEP their warning colors — those are functional cues, not
                // theme choices. See feedback_color_palette_policy.md.
                className={`rounded-xl border p-4 transition-all ${
                  isOverBudget
                    ? "border-red-500/30 bg-red-500/5"
                    : isOverPace
                    ? "border-amber-500/20 bg-amber-500/5"
                    : "border-0 glass-surface"
                }`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {isOverBudget && (
                      <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                    )}
                    {isOverPace && !isOverBudget && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                    )}
                    {!isOverBudget && !isOverPace && (
                      <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                    )}
                    <h3 className="font-semibold text-sm">{budget.category}</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(monthBudgets.find(b => b.id === budget.id)!)}
                      className="p-1.5 hover:bg-muted rounded-md transition-colors"
                      title="Edit budget"
                    >
                      <Pencil size={13} className="text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => setDeletingBudget(monthBudgets.find(b => b.id === budget.id))}
                      className="p-1.5 hover:bg-muted rounded-md transition-colors"
                      title="Delete budget"
                    >
                      <Trash2 size={13} className="text-red-400" />
                    </button>
                  </div>
                </div>

                {/* Amount row */}
                <div className="flex items-baseline justify-between mb-2">
                  <span className={`text-lg font-bold ${isOverBudget ? "text-red-500" : ""}`}>
                    {formatCurrency(spent)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    of {formatCurrency(limit)}
                  </span>
                </div>

                {/* Progress bar with pace marker */}
                <div className="relative h-2 bg-muted rounded-full overflow-hidden mb-2">
                  <div
                    className={`absolute left-0 top-0 h-full rounded-full ${
                      isOverBudget
                        ? "bg-red-500"
                        : isOverPace
                        ? "bg-amber-500"
                        : "bg-primary"
                    }`}
                    style={{ width: `${percentage}%`, transition: "width 0.3s ease" }}
                  />
                  {/* Pace marker */}
                  {!isOverBudget && limit > 0 && (
                    <div
                      className="absolute top-0 h-full w-0.5 bg-white/50"
                      style={{ left: `${Math.min(engineData.monthProgress * 100, 99)}%` }}
                    />
                  )}
                </div>

                {/* Status row */}
                <div className="flex items-center justify-between text-xs">
                  <span className={
                    isOverBudget ? "text-red-500"
                      : paceStatus === "over-pace" ? "text-amber-500"
                      : "text-green-500"
                  }>
                    {isOverBudget
                      ? `⚠️ Over by ${formatCurrency(spent - limit)}`
                      : paceStatus === "over-pace"
                      ? `⚠️ Over pace`
                      : paceStatus === "on-pace"
                      ? `✓ On pace`
                      : `✓ Under pace`}
                  </span>
                  <span className="text-muted-foreground">
                    {isOverBudget
                      ? `${Math.round((spent / limit) * 100)}%`
                      : `${formatCurrency(remaining)} left`}
                  </span>
                </div>

                {/* Projection row — only show if meaningful */}
                {!isOverBudget && limit > 0 && projected > limit * 0.85 && spent > 0 && (
                  <div
                    className={`mt-2 pt-2 border-t border-border/50 text-xs ${
                      projected > limit ? "text-amber-500" : "text-muted-foreground"
                    }`}
                  >
                    Projected: {formatCurrency(projected)}
                    {projected > limit && (
                      <span className="text-amber-500 ml-1">
                        (+{formatCurrency(projected - limit)})
                      </span>
                    )}
                  </div>
                )}

                {/* MoM comparison */}
                {budget.lastMonthSpent !== undefined && budget.lastMonthSpent > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {(() => {
                      const diff = spent - budget.lastMonthSpent!;
                      const pct = budget.lastMonthSpent! > 0
                        ? (diff / budget.lastMonthSpent!) * 100
                        : 0;
                      if (Math.abs(pct) < 5) return null;
                      return (
                        <span className={diff > 0 ? "text-amber-500" : "text-green-500"}>
                          {diff > 0 ? "↑" : "↓"}
                          {Math.abs(pct).toFixed(0)}% vs last month
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── DELETE CONFIRMATION ── */}
      <AlertDialog open={!!deletingBudget} onOpenChange={() => setDeletingBudget(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Budget</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the budget for "{deletingBudget?.canonicalCategoryId}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingBudget && deleteMutation.mutate(deletingBudget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── BUDGET SETTINGS DIALOG ── */}
      <Dialog open={showBudgetSettings} onOpenChange={setShowBudgetSettings}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Budget Settings</DialogTitle>
            <DialogDescription>Configure how your budget period resets.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 mt-2">
            <div>
              <label className="text-sm font-medium mb-2.5 block">Budget Period</label>
              <div className="grid grid-cols-3 gap-2">
                {["monthly", "biweekly", "weekly"].map((period) => (
                  <button
                    key={period}
                    onClick={() => setBudgetPeriodSetting(period)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      budgetPeriodSetting === period
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {period.charAt(0).toUpperCase() + period.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {budgetPeriodSetting !== "monthly" && (
              <div>
                <label className="text-sm font-medium mb-2.5 block">Next Payday</label>
                <Input
                  type="date"
                  value={nextPaydaySetting}
                  onChange={(e) => setNextPaydaySetting(e.target.value)}
                />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowBudgetSettings(false)}>
                Cancel
              </Button>
              <Button onClick={saveBudgetSettings}>
                Save Settings
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── AI SUGGESTIONS DIALOG ── */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Budget Suggestions</DialogTitle>
            <DialogDescription>Review and customize AI-suggested budgets</DialogDescription>
          </DialogHeader>
          {aiSuggestions.length > 0 && (
            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              {aiAdvice && (
                <p className="text-sm text-muted-foreground italic">{aiAdvice}</p>
              )}
              {aiSuggestions.map((suggestion) => (
                <div key={suggestion.category} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                  <Checkbox
                    checked={selectedSuggestions.has(suggestion.category)}
                    onCheckedChange={() => toggleSuggestion(suggestion.category)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm">{suggestion.category}</p>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={adjustedAmounts[suggestion.category] || suggestion.suggestedAmount.toFixed(2)}
                          onChange={(e) => setAdjustedAmounts(prev => ({
                            ...prev,
                            [suggestion.category]: e.target.value,
                          }))}
                        />
                        <span className="text-sm font-medium text-muted-foreground">
                          {formatCurrency(parseFloat(adjustedAmounts[suggestion.category] || suggestion.suggestedAmount))}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Current: {formatCurrency(suggestion.currentAmount)} | Suggested: {formatCurrency(suggestion.suggestedAmount)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {aiSuggestions.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No suggestions available yet.</p>
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setAiDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAcceptSuggestions} disabled={selectedSuggestions.size === 0}>
              Apply Selected
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}