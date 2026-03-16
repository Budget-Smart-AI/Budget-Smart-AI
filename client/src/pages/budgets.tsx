// FEATURE: BUDGET_CREATION | tier: free | limit: 2 budgets
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Plus, Pencil, Trash2, PieChart, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, Sparkles, Loader2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, addMonths, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EXPENSE_CATEGORIES, type Budget, type Expense } from "@shared/schema";
import { FeatureGate } from "@/components/FeatureGate";

const budgetFormSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.string().min(1, "Amount is required"),
  month: z.string(),
});

type BudgetFormValues = z.infer<typeof budgetFormSchema>;

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

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
      category: (budget?.category as typeof EXPENSE_CATEGORIES[number]) || availableCategories[0],
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

interface BudgetWithSpent extends Budget {
  spent: number;
  percentage: number;
}

interface AiBudgetSuggestion {
  category: string;
  suggestedAmount: number;
  reasoning: string;
  confidence: "high" | "medium" | "low";
  type: "necessity" | "discretionary" | "savings-opportunity";
}

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
  const { toast } = useToast();

  const monthStr = format(currentMonth, "yyyy-MM");

  const { data: allBudgets = [], isLoading: budgetsLoading } = useQuery<Budget[]>({
    queryKey: ["/api/budgets"],
  });

  const { data: allExpenses = [], isLoading: expensesLoading } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/budgets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
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

  // Calculate spent per category for current month
  const monthExpenses = allExpenses.filter((exp) => {
    const expDate = parseISO(exp.date);
    return expDate >= monthStart && expDate <= monthEnd;
  });

  const spentByCategory: Record<string, number> = {};
  monthExpenses.forEach((exp) => {
    spentByCategory[exp.category] = (spentByCategory[exp.category] || 0) + parseFloat(exp.amount);
  });

  // Combine budgets with spent amounts
  const budgetsWithSpent: BudgetWithSpent[] = monthBudgets.map((budget) => {
    const spent = spentByCategory[budget.category] || 0;
    const budgetAmount = parseFloat(budget.amount);
    const percentage = budgetAmount > 0 ? Math.min((spent / budgetAmount) * 100, 100) : 0;
    return { ...budget, spent, percentage };
  });

  const existingCategories = monthBudgets.map((b) => b.category);
  const totalBudget = budgetsWithSpent.reduce((sum, b) => sum + parseFloat(b.amount), 0);
  const totalSpent = budgetsWithSpent.reduce((sum, b) => sum + b.spent, 0);

  const isLoading = budgetsLoading || expensesLoading;

  return (
    <div className="space-y-6">
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
          <FeatureGate
            feature="budget_creation"
            blurIntensity="low"
            bullets={[
              "Create unlimited category budgets",
              "Track planned vs actual spending in detail",
              "Adjust quickly as your monthly priorities change",
            ]}
          >
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
          </FeatureGate>
        </div>
      </div>

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

      {budgetsWithSpent.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5" />
                Monthly Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Budget</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalBudget)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Spent</p>
                  <p className={`text-2xl font-bold ${totalSpent > totalBudget ? "text-red-600" : "text-green-600"}`}>
                    {formatCurrency(totalSpent)}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <Progress value={(totalSpent / totalBudget) * 100} className="h-3" />
                <p className="text-sm text-muted-foreground mt-1">
                  {formatCurrency(totalBudget - totalSpent)} remaining
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            [1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))
          ) : budgetsWithSpent.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="text-center py-12">
                <PieChart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground mb-4">No budgets set for this month</p>
                <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Set Your First Budget
                </Button>
              </CardContent>
            </Card>
          ) : (
            budgetsWithSpent.map((budget) => {
              const isOverBudget = budget.spent > parseFloat(budget.amount);
              const remaining = parseFloat(budget.amount) - budget.spent;

              return (
                <Card key={budget.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{budget.category}</CardTitle>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(budget)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeletingBudget(budget)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Spent</span>
                        <span className={isOverBudget ? "text-red-600 font-semibold" : ""}>
                          {formatCurrency(budget.spent)} / {formatCurrency(budget.amount)}
                        </span>
                      </div>
                      <Progress
                        value={budget.percentage}
                        className={`h-2 ${isOverBudget ? "[&>div]:bg-red-500" : ""}`}
                      />
                      <div className="flex items-center justify-between text-sm">
                        {isOverBudget ? (
                          <div className="flex items-center gap-1 text-red-600">
                            <AlertTriangle className="h-4 w-4" />
                            <span>Over by {formatCurrency(Math.abs(remaining))}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            <span>{formatCurrency(remaining)} left</span>
                          </div>
                        )}
                        <span className="text-muted-foreground">{Math.round(budget.percentage)}%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

      <AlertDialog open={!!deletingBudget} onOpenChange={() => setDeletingBudget(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Budget</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the budget for "{deletingBudget?.category}"? This action cannot be undone.
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

      {/* AI Suggestions Review Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Budget Suggestions
            </DialogTitle>
          </DialogHeader>
          {aiAdvice && (
            <p className="text-sm text-muted-foreground border-l-2 border-primary pl-3">{aiAdvice}</p>
          )}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {aiSuggestions.map((suggestion) => (
              <div
                key={suggestion.category}
                className={`p-3 rounded-lg border transition-colors ${
                  selectedSuggestions.has(suggestion.category)
                    ? "border-primary/50 bg-primary/5"
                    : "opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedSuggestions.has(suggestion.category)}
                    onCheckedChange={() => toggleSuggestion(suggestion.category)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{suggestion.category}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={
                            suggestion.confidence === "high" ? "default" :
                            suggestion.confidence === "medium" ? "secondary" : "outline"
                          }
                          className="text-xs"
                        >
                          {suggestion.confidence}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            suggestion.type === "necessity" ? "border-blue-300 text-blue-700" :
                            suggestion.type === "savings-opportunity" ? "border-green-300 text-green-700" :
                            "border-orange-300 text-orange-700"
                          }`}
                        >
                          {suggestion.type === "savings-opportunity" ? "save" : suggestion.type}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={adjustedAmounts[suggestion.category] || ""}
                        onChange={(e) => setAdjustedAmounts(prev => ({
                          ...prev,
                          [suggestion.category]: e.target.value,
                        }))}
                        className="h-7 w-28 text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{suggestion.reasoning}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-3 border-t">
            <Button variant="ghost" size="sm" onClick={() => setAiDialogOpen(false)}>
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedSuggestions(new Set(aiSuggestions.map(s => s.category)))}
              >
                Select All
              </Button>
              <Button
                size="sm"
                onClick={handleAcceptSuggestions}
                disabled={selectedSuggestions.size === 0 || bulkCreateMutation.isPending}
              >
                {bulkCreateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Accept {selectedSuggestions.size > 0 ? `(${selectedSuggestions.size})` : ""}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
