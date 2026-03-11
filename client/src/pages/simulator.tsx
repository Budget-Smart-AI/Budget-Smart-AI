// FEATURE: WHAT_IF_SIMULATOR | tier: pro | limit: 20 simulations/month
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Calculator, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  DollarSign,
  XCircle,
  Plus,
  CreditCard,
  Sparkles,
  ArrowRight,
  Clock,
  PiggyBank
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface SimulationOption {
  id: string;
  name: string;
  amount: string;
  category?: string;
  recurrence?: string;
  balance?: string;
  interestRate?: string;
  minimumPayment?: string;
}

interface SimulationResult {
  baseline: {
    lowestBalance: number;
    lowestBalanceDate: string;
    dangerDay: number | null;
    endBalance: number;
  };
  simulated: {
    lowestBalance: number;
    lowestBalanceDate: string;
    dangerDay: number | null;
    endBalance: number;
  };
  impact: {
    monthlyImpact: number;
    yearlyImpact: number;
    daysGained: number;
    debtPayoffChange: {
      originalPayoffMonths: number;
      newPayoffMonths: number;
      interestSaved: number;
      debtName: string;
    } | null;
  };
  message: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function SimulatorPage() {
  const [selectedTab, setSelectedTab] = useState("cancel");
  const [selectedBillId, setSelectedBillId] = useState<string>("");
  const [selectedDebtId, setSelectedDebtId] = useState<string>("");
  const [extraPaymentAmount, setExtraPaymentAmount] = useState<string>("100");
  const [newIncomeAmount, setNewIncomeAmount] = useState<string>("500");
  const [result, setResult] = useState<SimulationResult | null>(null);

  const { data: options, isLoading: optionsLoading } = useQuery<{
    bills: SimulationOption[];
    debts: SimulationOption[];
  }>({
    queryKey: ['/api/simulator/options'],
  });

  const simulateMutation = useMutation({
    mutationFn: async (changes: Array<{
      type: "cancel_subscription" | "extra_payment" | "new_income" | "reduce_expense";
      billId?: string;
      amount?: number;
      debtId?: string;
    }>) => {
      const response = await apiRequest('POST', '/api/simulator/what-if', { changes });
      return await response.json() as SimulationResult;
    },
    onSuccess: (data) => {
      setResult(data);
    },
  });

  const handleSimulate = () => {
    const changes: Array<{
      type: "cancel_subscription" | "extra_payment" | "new_income" | "reduce_expense";
      billId?: string;
      amount?: number;
      debtId?: string;
    }> = [];

    if (selectedTab === "cancel" && selectedBillId) {
      changes.push({ type: "cancel_subscription", billId: selectedBillId });
    } else if (selectedTab === "extra" && selectedDebtId) {
      changes.push({ 
        type: "extra_payment", 
        debtId: selectedDebtId, 
        amount: parseFloat(extraPaymentAmount) || 0 
      });
    } else if (selectedTab === "income") {
      changes.push({ 
        type: "new_income", 
        amount: parseFloat(newIncomeAmount) || 0 
      });
    }

    if (changes.length > 0) {
      simulateMutation.mutate(changes);
    }
  };

  if (optionsLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const selectedBill = options?.bills.find(b => b.id === selectedBillId);
  const selectedDebt = options?.debts.find(d => d.id === selectedDebtId);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Calculator className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="simulator-title">What If Simulator</h1>
          <p className="text-muted-foreground">Test financial scenarios before making real changes</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Choose a Scenario
            </CardTitle>
            <CardDescription>
              See how different choices affect your financial future
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="cancel" data-testid="tab-cancel">
                  <XCircle className="h-4 w-4 mr-1" />
                  Cancel
                </TabsTrigger>
                <TabsTrigger value="extra" data-testid="tab-extra">
                  <CreditCard className="h-4 w-4 mr-1" />
                  Pay Extra
                </TabsTrigger>
                <TabsTrigger value="income" data-testid="tab-income">
                  <Plus className="h-4 w-4 mr-1" />
                  New Income
                </TabsTrigger>
              </TabsList>

              <TabsContent value="cancel" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="bill-select">Select a subscription to cancel</Label>
                  <Select value={selectedBillId} onValueChange={setSelectedBillId}>
                    <SelectTrigger id="bill-select" data-testid="select-bill">
                      <SelectValue placeholder="Choose a subscription..." />
                    </SelectTrigger>
                    <SelectContent>
                      {options?.bills.map(bill => (
                        <SelectItem key={bill.id} value={bill.id}>
                          {bill.name} - {formatCurrency(parseFloat(bill.amount))}/{bill.recurrence}
                        </SelectItem>
                      ))}
                      {(!options?.bills || options.bills.length === 0) && (
                        <SelectItem value="none" disabled>No cancellable subscriptions found</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {selectedBill && (
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm font-medium">{selectedBill.name}</p>
                    <p className="text-2xl font-bold text-red-500">
                      -{formatCurrency(parseFloat(selectedBill.amount))}
                      <span className="text-sm text-muted-foreground font-normal">/{selectedBill.recurrence}</span>
                    </p>
                    <Badge variant="secondary" className="mt-2">{selectedBill.category}</Badge>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="extra" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="debt-select">Select a debt to pay extra on</Label>
                  <Select value={selectedDebtId} onValueChange={setSelectedDebtId}>
                    <SelectTrigger id="debt-select" data-testid="select-debt">
                      <SelectValue placeholder="Choose a debt..." />
                    </SelectTrigger>
                    <SelectContent>
                      {options?.debts.map(debt => (
                        <SelectItem key={debt.id} value={debt.id}>
                          {debt.name} - {formatCurrency(parseFloat(debt.balance || "0"))} @ {debt.interestRate}%
                        </SelectItem>
                      ))}
                      {(!options?.debts || options.debts.length === 0) && (
                        <SelectItem value="none" disabled>No debts with balance found</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="extra-amount">Extra monthly payment</Label>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <Input
                      id="extra-amount"
                      type="number"
                      value={extraPaymentAmount}
                      onChange={(e) => setExtraPaymentAmount(e.target.value)}
                      placeholder="100"
                      data-testid="input-extra-amount"
                    />
                  </div>
                </div>

                {selectedDebt && (
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm font-medium">{selectedDebt.name}</p>
                    <p className="text-lg">Balance: {formatCurrency(parseFloat(selectedDebt.balance || "0"))}</p>
                    <p className="text-sm text-muted-foreground">
                      Interest: {selectedDebt.interestRate}% | Min Payment: {formatCurrency(parseFloat(selectedDebt.minimumPayment || "0"))}
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="income" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="income-amount">Additional monthly income</Label>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <Input
                      id="income-amount"
                      type="number"
                      value={newIncomeAmount}
                      onChange={(e) => setNewIncomeAmount(e.target.value)}
                      placeholder="500"
                      data-testid="input-new-income"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    e.g., side hustle, freelance work, or a raise
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <Button 
              className="w-full mt-6" 
              onClick={handleSimulate}
              disabled={simulateMutation.isPending || (
                (selectedTab === "cancel" && !selectedBillId) ||
                (selectedTab === "extra" && (!selectedDebtId || !extraPaymentAmount)) ||
                (selectedTab === "income" && !newIncomeAmount)
              )}
              data-testid="button-simulate"
            >
              {simulateMutation.isPending ? (
                <>Calculating...</>
              ) : (
                <>
                  <Calculator className="h-4 w-4 mr-2" />
                  Run Simulation
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className={cn(
          "transition-all",
          result ? "border-primary" : "border-dashed"
        )}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              Simulation Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!result ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Calculator className="h-12 w-12 mb-4 opacity-50" />
                <p>Select a scenario and run the simulation to see results</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className={cn(
                  "p-4 rounded-lg text-center",
                  result.impact.daysGained > 0 || result.impact.monthlyImpact > 0
                    ? "bg-emerald-500/10 border border-emerald-500/30"
                    : "bg-muted"
                )}>
                  <p className="text-lg font-semibold" data-testid="result-message">
                    {result.message}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <div className="text-sm text-muted-foreground mb-1">Monthly Savings</div>
                    <div className={cn(
                      "text-xl font-bold",
                      result.impact.monthlyImpact > 0 ? "text-emerald-500" : "text-foreground"
                    )}>
                      {result.impact.monthlyImpact > 0 ? "+" : ""}
                      {formatCurrency(result.impact.monthlyImpact)}
                    </div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <div className="text-sm text-muted-foreground mb-1">Yearly Savings</div>
                    <div className={cn(
                      "text-xl font-bold",
                      result.impact.yearlyImpact > 0 ? "text-emerald-500" : "text-foreground"
                    )}>
                      {result.impact.yearlyImpact > 0 ? "+" : ""}
                      {formatCurrency(result.impact.yearlyImpact)}
                    </div>
                  </div>
                </div>

                {result.impact.daysGained > 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                    <Clock className="h-5 w-5 text-emerald-500" />
                    <div>
                      <div className="font-medium">Extra Safe Days</div>
                      <div className="text-sm text-muted-foreground">
                        You gain <span className="font-bold text-emerald-500">{result.impact.daysGained}</span> more days before going negative
                      </div>
                    </div>
                  </div>
                )}

                {result.impact.debtPayoffChange && (
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                    <div className="flex items-center gap-2 mb-2">
                      <PiggyBank className="h-5 w-5 text-primary" />
                      <span className="font-medium">{result.impact.debtPayoffChange.debtName}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Payoff: </span>
                        <span className="line-through">{result.impact.debtPayoffChange.originalPayoffMonths} mo</span>
                        <ArrowRight className="h-3 w-3 inline mx-1" />
                        <span className="font-bold text-emerald-500">{result.impact.debtPayoffChange.newPayoffMonths} mo</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Interest Saved: </span>
                        <span className="font-bold text-emerald-500">
                          {formatCurrency(result.impact.debtPayoffChange.interestSaved)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-3">90-Day Comparison</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-muted-foreground/50" />
                        <span className="font-medium">Without Change</span>
                      </div>
                      <div className="text-muted-foreground">
                        Lowest: {formatCurrency(result.baseline.lowestBalance)}
                      </div>
                      <div className="text-muted-foreground">
                        End Balance: {formatCurrency(result.baseline.endBalance)}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-500" />
                        <span className="font-medium">With Change</span>
                      </div>
                      <div className="text-emerald-600 dark:text-emerald-400">
                        Lowest: {formatCurrency(result.simulated.lowestBalance)}
                      </div>
                      <div className="text-emerald-600 dark:text-emerald-400">
                        End Balance: {formatCurrency(result.simulated.endBalance)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}