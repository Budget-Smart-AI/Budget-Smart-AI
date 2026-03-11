// FEATURE: SAVINGS_GOALS | tier: free | limit: 1 goal
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Target, PiggyBank, TrendingUp, Sparkles, Loader2, Brain, DollarSign, Calendar, TrendingDown, CheckCircle2, ArrowRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, differenceInDays, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type SavingsGoal } from "@shared/schema";
import { FeatureGate } from "@/components/FeatureGate";

const GOAL_COLORS = [
  { value: "#3b82f6", label: "Blue" },
  { value: "#10b981", label: "Green" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#ef4444", label: "Red" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#ec4899", label: "Pink" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#84cc16", label: "Lime" },
];

const savingsGoalFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  targetAmount: z.string().min(1, "Target amount is required"),
  currentAmount: z.string().optional(),
  targetDate: z.string().optional(),
  color: z.string().optional(),
  notes: z.string().optional(),
});

type SavingsGoalFormValues = z.infer<typeof savingsGoalFormSchema>;

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function SavingsGoalForm({
  goal,
  onClose,
}: {
  goal?: SavingsGoal;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!goal;

  const form = useForm<SavingsGoalFormValues>({
    resolver: zodResolver(savingsGoalFormSchema),
    defaultValues: {
      name: goal?.name || "",
      targetAmount: goal?.targetAmount || "",
      currentAmount: goal?.currentAmount || "0",
      targetDate: goal?.targetDate || "",
      color: goal?.color || "#3b82f6",
      notes: goal?.notes || "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: SavingsGoalFormValues) => {
      return apiRequest("POST", "/api/savings-goals", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/savings-goals"] });
      toast({ title: "Savings goal created successfully" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to create savings goal", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: SavingsGoalFormValues) => {
      return apiRequest("PATCH", `/api/savings-goals/${goal?.id}`, values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/savings-goals"] });
      toast({ title: "Savings goal updated successfully" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to update savings goal", variant: "destructive" });
    },
  });

  const onSubmit = (values: SavingsGoalFormValues) => {
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Goal Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Emergency Fund, Vacation" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="targetAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target Amount ($)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" placeholder="0.00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="currentAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current Amount ($)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" placeholder="0.00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="targetDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Target Date (optional)</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="color"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Color</FormLabel>
              <div className="flex gap-2 flex-wrap">
                {GOAL_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => field.onChange(color.value)}
                    className={`w-8 h-8 rounded-full transition-all ${
                      field.value === color.value ? "ring-2 ring-offset-2 ring-primary" : ""
                    }`}
                    style={{ backgroundColor: color.value }}
                    title={color.label}
                  />
                ))}
              </div>
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

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : isEditing ? "Update Goal" : "Create Goal"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function AddMoneyDialog({ goal, onClose }: { goal: SavingsGoal; onClose: () => void }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");

  const updateMutation = useMutation({
    mutationFn: async (newAmount: string) => {
      return apiRequest("PATCH", `/api/savings-goals/${goal.id}`, {
        currentAmount: newAmount,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/savings-goals"] });
      toast({ title: "Savings updated successfully" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to update savings", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const addAmount = parseFloat(amount) || 0;
    const currentAmount = parseFloat(goal.currentAmount) || 0;
    const newTotal = currentAmount + addAmount;
    updateMutation.mutate(String(newTotal));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground mb-2">
          Current: {formatCurrency(goal.currentAmount)}
        </p>
        <Input
          type="number"
          step="0.01"
          placeholder="Amount to add"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={updateMutation.isPending || !amount}>
          {updateMutation.isPending ? "Adding..." : "Add Money"}
        </Button>
      </div>
    </form>
  );
}

interface AiSavingsAdvice {
  recommendedMonthly: number;
  suggestedTarget: number;
  suggestedTimelineMonths: number;
  feasibility: "easy" | "moderate" | "challenging" | "difficult";
  strategy: string;
  actionPlan: string[];
  savingsTips: string[];
  potentialCutbacks: { category: string; currentMonthly: number; suggestedMonthly: number; monthlySavings: number }[];
  milestones: { amount: number; description: string; estimatedDate: string }[];
  overallAdvice: string;
  financialSnapshot: { monthlyIncome: number; monthlySpending: number; monthlySurplus: number };
}

export default function SavingsGoalsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | undefined>();
  const [deletingGoal, setDeletingGoal] = useState<SavingsGoal | undefined>();
  const [addingMoneyGoal, setAddingMoneyGoal] = useState<SavingsGoal | undefined>();
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiGoalInput, setAiGoalInput] = useState("");
  const [aiTargetInput, setAiTargetInput] = useState("");
  const [aiAdvice, setAiAdvice] = useState<AiSavingsAdvice | null>(null);
  const [selectedGoalForAi, setSelectedGoalForAi] = useState<SavingsGoal | null>(null);
  const { toast } = useToast();

  const { data: goals = [], isLoading } = useQuery<SavingsGoal[]>({
    queryKey: ["/api/savings-goals"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/savings-goals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/savings-goals"] });
      toast({ title: "Savings goal deleted successfully" });
      setDeletingGoal(undefined);
    },
    onError: () => {
      toast({ title: "Failed to delete savings goal", variant: "destructive" });
    },
  });

  const aiAdvisorMutation = useMutation({
    mutationFn: async (params: { goalName: string; targetAmount?: string; currentAmount?: string; targetDate?: string }) => {
      const res = await apiRequest("POST", "/api/ai/savings-advisor", params);
      return res.json();
    },
    onSuccess: (data: AiSavingsAdvice) => {
      setAiAdvice(data);
    },
    onError: () => {
      toast({ title: "Failed to get AI advice", variant: "destructive" });
    },
  });

  const handleAiAdvisor = (goal?: SavingsGoal) => {
    setAiAdvice(null);
    if (goal) {
      setSelectedGoalForAi(goal);
      setAiGoalInput(goal.name);
      setAiTargetInput(goal.targetAmount);
      setAiDialogOpen(true);
      aiAdvisorMutation.mutate({
        goalName: goal.name,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        targetDate: goal.targetDate || undefined,
      });
    } else {
      setSelectedGoalForAi(null);
      setAiGoalInput("");
      setAiTargetInput("");
      setAiDialogOpen(true);
    }
  };

  const handleAiSubmit = () => {
    if (!aiGoalInput.trim()) {
      toast({ title: "Please enter what you're saving for" });
      return;
    }
    aiAdvisorMutation.mutate({
      goalName: aiGoalInput,
      targetAmount: aiTargetInput || undefined,
    });
  };

  const handleEdit = (goal: SavingsGoal) => {
    setEditingGoal(goal);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingGoal(undefined);
  };

  const totalSaved = goals.reduce((sum, g) => sum + parseFloat(g.currentAmount), 0);
  const totalTarget = goals.reduce((sum, g) => sum + parseFloat(g.targetAmount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Savings Goals</h1>
            <HelpTooltip
              title="About Savings Goals"
              content="Create savings targets with amounts and deadlines. Track your progress visually and stay motivated as you contribute. Color-code your goals for easy identification and break large targets into milestones."
            />
          </div>
          <p className="text-muted-foreground">Track progress towards your financial goals</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => handleAiAdvisor()}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            AI Advisor
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <FeatureGate feature="savings_goals" blurIntensity="low">
              <Button onClick={() => setEditingGoal(undefined)}>
                <Plus className="h-4 w-4 mr-2" />
                New Goal
              </Button>
              </FeatureGate>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{editingGoal ? "Edit Goal" : "Create Savings Goal"}</DialogTitle>
              </DialogHeader>
              <SavingsGoalForm goal={editingGoal} onClose={handleCloseDialog} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {goals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PiggyBank className="h-5 w-5" />
              Total Savings Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Saved</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalSaved)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Target</p>
                <p className="text-2xl font-bold">{formatCurrency(totalTarget)}</p>
              </div>
            </div>
            <div className="mt-4">
              <Progress value={(totalSaved / totalTarget) * 100} className="h-3" />
              <p className="text-sm text-muted-foreground mt-1">
                {Math.round((totalSaved / totalTarget) * 100)}% of all goals achieved
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
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ))
        ) : goals.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="text-center py-12">
              <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground mb-4">No savings goals yet</p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Goal
              </Button>
            </CardContent>
          </Card>
        ) : (
          goals.map((goal) => {
            const current = parseFloat(goal.currentAmount);
            const target = parseFloat(goal.targetAmount);
            const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
            const remaining = target - current;
            const isComplete = current >= target;

            let daysLeft: number | null = null;
            if (goal.targetDate) {
              daysLeft = differenceInDays(parseISO(goal.targetDate), new Date());
            }

            return (
              <Card key={goal.id} className="overflow-hidden">
                <div className="h-2" style={{ backgroundColor: goal.color || "#3b82f6" }} />
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Target className="h-4 w-4" style={{ color: goal.color || "#3b82f6" }} />
                      {goal.name}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(goal)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeletingGoal(goal)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-2xl font-bold" style={{ color: goal.color || "#3b82f6" }}>
                          {formatCurrency(current)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          of {formatCurrency(target)}
                        </p>
                      </div>
                      <p className="text-lg font-semibold">{Math.round(percentage)}%</p>
                    </div>

                    <Progress
                      value={percentage}
                      className="h-3"
                      style={{ "--progress-background": goal.color || "#3b82f6" } as React.CSSProperties}
                    />

                    <div className="flex justify-between text-sm text-muted-foreground">
                      {isComplete ? (
                        <span className="text-green-600 font-medium">Goal achieved!</span>
                      ) : (
                        <span>{formatCurrency(remaining)} to go</span>
                      )}
                      {daysLeft !== null && daysLeft > 0 && (
                        <span>{daysLeft} days left</span>
                      )}
                      {daysLeft !== null && daysLeft <= 0 && !isComplete && (
                        <span className="text-red-600">Past due</span>
                      )}
                    </div>

                    {goal.notes && (
                      <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
                        {goal.notes}
                      </p>
                    )}

                    <div className="flex gap-2 mt-2">
                      {!isComplete && (
                        <Button
                          className="flex-1"
                          variant="outline"
                          onClick={() => setAddingMoneyGoal(goal)}
                        >
                          <TrendingUp className="h-4 w-4 mr-2" />
                          Add Money
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => handleAiAdvisor(goal)}
                        title="Get AI savings advice"
                      >
                        <Sparkles className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <AlertDialog open={!!deletingGoal} onOpenChange={() => setDeletingGoal(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Savings Goal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingGoal?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingGoal && deleteMutation.mutate(deletingGoal.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!addingMoneyGoal} onOpenChange={() => setAddingMoneyGoal(undefined)}>
        <DialogContent className="sm:max-w-[300px]">
          <DialogHeader>
            <DialogTitle>Add to {addingMoneyGoal?.name}</DialogTitle>
          </DialogHeader>
          {addingMoneyGoal && (
            <AddMoneyDialog goal={addingMoneyGoal} onClose={() => setAddingMoneyGoal(undefined)} />
          )}
        </DialogContent>
      </Dialog>

      {/* AI Savings Advisor Dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={(open) => { setAiDialogOpen(open); if (!open) { setAiAdvice(null); setSelectedGoalForAi(null); } }}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-violet-500" />
              AI Savings Advisor
            </DialogTitle>
          </DialogHeader>

          {!aiAdvice && !aiAdvisorMutation.isPending && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Tell us what you're saving for and we'll analyze your finances to create a personalized savings plan.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">What are you saving for?</label>
                  <Input
                    value={aiGoalInput}
                    onChange={(e) => setAiGoalInput(e.target.value)}
                    placeholder="e.g., Emergency fund, vacation, new car, house down payment..."
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Target amount (optional)</label>
                  <Input
                    value={aiTargetInput}
                    onChange={(e) => setAiTargetInput(e.target.value)}
                    placeholder="e.g., 5000"
                    type="number"
                    step="100"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Leave blank and we'll suggest an appropriate amount</p>
                </div>
              </div>
              <Button onClick={handleAiSubmit} className="w-full">
                <Sparkles className="h-4 w-4 mr-2" />
                Get Personalized Plan
              </Button>
            </div>
          )}

          {aiAdvisorMutation.isPending && (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-violet-500 mb-4" />
              <p className="font-medium">Analyzing your finances...</p>
              <p className="text-sm text-muted-foreground mt-1">Creating a personalized savings plan for "{aiGoalInput}"</p>
            </div>
          )}

          {aiAdvice && !aiAdvisorMutation.isPending && (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 pb-4">
                {/* Financial Snapshot */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Monthly Income</p>
                    <p className="text-sm font-bold text-green-600">{formatCurrency(aiAdvice.financialSnapshot.monthlyIncome)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Monthly Spending</p>
                    <p className="text-sm font-bold text-red-500">{formatCurrency(aiAdvice.financialSnapshot.monthlySpending)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Available</p>
                    <p className={`text-sm font-bold ${aiAdvice.financialSnapshot.monthlySurplus >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {formatCurrency(aiAdvice.financialSnapshot.monthlySurplus)}
                    </p>
                  </div>
                </div>

                {/* Main Recommendation */}
                <Card className="border-violet-500/20 bg-gradient-to-r from-violet-500/5 to-indigo-500/5">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-violet-500/10 shrink-0">
                        <DollarSign className="h-5 w-5 text-violet-500" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Recommended Monthly Savings</p>
                        <p className="text-2xl font-bold text-violet-600">{formatCurrency(aiAdvice.recommendedMonthly)}</p>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            Target: {formatCurrency(aiAdvice.suggestedTarget)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            ~{aiAdvice.suggestedTimelineMonths} months
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded-full ${
                        aiAdvice.feasibility === 'easy' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        aiAdvice.feasibility === 'moderate' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        aiAdvice.feasibility === 'challenging' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {aiAdvice.feasibility === 'easy' ? 'Very Achievable' :
                         aiAdvice.feasibility === 'moderate' ? 'Achievable' :
                         aiAdvice.feasibility === 'challenging' ? 'Challenging' : 'Difficult'}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Strategy */}
                <div>
                  <p className="text-sm font-medium mb-1">Strategy</p>
                  <p className="text-sm text-muted-foreground">{aiAdvice.strategy}</p>
                </div>

                {/* Action Plan */}
                {aiAdvice.actionPlan && aiAdvice.actionPlan.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      Action Plan
                    </p>
                    <div className="space-y-2">
                      {aiAdvice.actionPlan.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-sm">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <span className="text-muted-foreground">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Potential Cutbacks */}
                {aiAdvice.potentialCutbacks && aiAdvice.potentialCutbacks.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <TrendingDown className="h-3.5 w-3.5 text-amber-500" />
                      Where to Cut Back
                    </p>
                    <div className="space-y-2">
                      {aiAdvice.potentialCutbacks.map((cutback, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm bg-muted/40 rounded-lg px-3 py-2">
                          <span className="font-medium">{cutback.category}</span>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">{formatCurrency(cutback.currentMonthly)}</span>
                            <ArrowRight className="h-3 w-3" />
                            <span className="text-green-600 font-medium">{formatCurrency(cutback.suggestedMonthly)}</span>
                            <span className="text-green-600 text-xs">(save {formatCurrency(cutback.monthlySavings)})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Milestones */}
                {aiAdvice.milestones && aiAdvice.milestones.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-blue-500" />
                      Milestones
                    </p>
                    <div className="space-y-1.5">
                      {aiAdvice.milestones.map((milestone, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{milestone.description}</span>
                          <div className="flex items-center gap-2 text-xs shrink-0 ml-2">
                            <span className="font-medium">{formatCurrency(milestone.amount)}</span>
                            {milestone.estimatedDate && (
                              <span className="text-muted-foreground">({milestone.estimatedDate})</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tips */}
                {aiAdvice.savingsTips && aiAdvice.savingsTips.length > 0 && (
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                      Savings Tips
                    </p>
                    <ul className="space-y-1.5">
                      {aiAdvice.savingsTips.map((tip, idx) => (
                        <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-violet-500 shrink-0">&#8226;</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Overall Advice */}
                {aiAdvice.overallAdvice && (
                  <p className="text-sm text-muted-foreground italic border-t pt-3">
                    {aiAdvice.overallAdvice}
                  </p>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
