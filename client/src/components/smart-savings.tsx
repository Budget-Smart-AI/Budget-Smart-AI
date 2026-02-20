import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PiggyBank,
  Sparkles,
  ArrowRight,
  Calendar,
  ShieldCheck,
  TrendingUp,
  Target,
  Info,
  Coins,
} from "lucide-react";
import { Link } from "wouter";

interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  current: number;
  remaining: number;
}

interface SafeToSaveData {
  safeToSave: number;
  breakdown: {
    currentBalance: number;
    upcomingBills: number;
    predictedSpending: number;
    safetyBuffer: number;
  };
  roundUpSuggestion: {
    potential: number;
    averagePerTransaction: number;
  };
  nextIncomeIn: number | null;
  savingsGoals: SavingsGoal[];
  recommendations: string[];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function BreakdownItem({
  label,
  amount,
  isSubtraction = false,
}: {
  label: string;
  amount: number;
  isSubtraction?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs sm:text-sm">
      <span className="text-muted-foreground truncate pr-2">{label}</span>
      <span className={`shrink-0 ${isSubtraction ? "text-red-500" : ""}`}>
        {isSubtraction ? "-" : ""}{formatCurrency(amount)}
      </span>
    </div>
  );
}

export function SmartSavings() {
  const { data, isLoading, error } = useQuery<SafeToSaveData>({
    queryKey: ["/api/savings/safe-to-save"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="px-4 py-4 sm:px-6 sm:py-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
            Smart Savings
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
          <Skeleton className="w-full h-20 sm:h-24 mb-4" />
          <Skeleton className="w-full h-14 sm:h-16" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader className="px-4 py-4 sm:px-6 sm:py-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
            Smart Savings
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
          <p className="text-muted-foreground text-center py-4 text-sm">
            Connect a bank account to see your safe savings amount.
          </p>
        </CardContent>
      </Card>
    );
  }

  const hasSavingsAmount = data.safeToSave > 0;
  const topGoal = data.savingsGoals[0];

  return (
    <Card>
      <CardHeader className="px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
              Smart Savings Autopilot
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-1">
              AI-calculated safe amount to save right now
            </CardDescription>
          </div>
          {data.nextIncomeIn && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="gap-1 text-xs shrink-0">
                  <Calendar className="w-3 h-3" />
                  {data.nextIncomeIn}d to payday
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Next income in {data.nextIncomeIn} days</TooltipContent>
            </Tooltip>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 space-y-4 sm:space-y-6">
        {/* Safe to Save Amount */}
        <div className={`text-center p-4 sm:p-6 rounded-xl ${hasSavingsAmount ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800" : "bg-muted/50"}`}>
          <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-muted-foreground mb-2">
            <ShieldCheck className={`w-3 h-3 sm:w-4 sm:h-4 ${hasSavingsAmount ? "text-green-600 dark:text-green-400" : ""}`} />
            Safe to Save
          </div>
          <div className={`text-3xl sm:text-4xl font-bold ${hasSavingsAmount ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
            {formatCurrency(data.safeToSave)}
          </div>
          {hasSavingsAmount && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-2">
              Without affecting your bills or daily spending
            </p>
          )}
        </div>

        {/* Breakdown */}
        <div className="space-y-2 p-3 sm:p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-medium mb-3">
            <Info className="w-3 h-3 sm:w-4 sm:h-4" />
            How we calculated this
          </div>
          <BreakdownItem label="Current Balance" amount={data.breakdown.currentBalance} />
          <BreakdownItem label="Upcoming Bills (14 days)" amount={data.breakdown.upcomingBills} isSubtraction />
          <BreakdownItem label="Predicted Spending (14 days)" amount={data.breakdown.predictedSpending} isSubtraction />
          <BreakdownItem label="Safety Buffer" amount={data.breakdown.safetyBuffer} isSubtraction />
          <div className="border-t pt-2 mt-2 flex items-center justify-between font-medium text-sm">
            <span>Safe to Save</span>
            <span className="text-green-600 dark:text-green-400">{formatCurrency(data.safeToSave)}</span>
          </div>
        </div>

        {/* Round-up Suggestion */}
        {data.roundUpSuggestion.potential > 10 && (
          <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
            <Coins className="w-6 h-6 sm:w-8 sm:h-8 text-blue-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-xs sm:text-sm">Round-Up Savings</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Could add {formatCurrency(data.roundUpSuggestion.potential)}/month
              </p>
            </div>
            <Badge variant="secondary" className="text-[10px] sm:text-xs shrink-0">
              ~${data.roundUpSuggestion.averagePerTransaction.toFixed(2)}/tx
            </Badge>
          </div>
        )}

        {/* Top Savings Goal */}
        {topGoal && hasSavingsAmount && (
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
                <span className="font-medium text-xs sm:text-sm truncate">{topGoal.name}</span>
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground shrink-0">
                {formatCurrency(topGoal.remaining)} to go
              </span>
            </div>
            <Progress
              value={(topGoal.current / topGoal.target) * 100}
              className="h-2"
            />
            <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
              Saving {formatCurrency(data.safeToSave)} would get you{" "}
              {Math.round((data.safeToSave / topGoal.remaining) * 100)}% closer
            </p>
          </div>
        )}

        {/* Recommendations */}
        {data.recommendations.length > 0 && (
          <div className="space-y-2">
            {data.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2 text-xs sm:text-sm">
                <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-green-500 mt-0.5 shrink-0" />
                <span className="text-muted-foreground">{rec}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action Button */}
        {hasSavingsAmount && (
          <Link href="/goals">
            <Button className="w-full gap-2 text-sm" variant="default">
              <PiggyBank className="w-4 h-4" />
              Transfer to Savings Goal
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
