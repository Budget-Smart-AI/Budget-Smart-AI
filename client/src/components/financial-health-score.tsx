import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Target,
  Wallet,
  PiggyBank,
  Receipt,
  Lightbulb,
  Info,
  Sparkles,
  Brain
} from "lucide-react";

interface HealthScoreData {
  score: number;
  grade: string;
  gradeColor: string;
  breakdown: {
    savingsRate: { score: number; maxScore: number; value: string; label: string };
    budgetAdherence: { score: number; maxScore: number; value: string; label: string };
    savingsGoals: { score: number; maxScore: number; value: string; label: string };
    billTracking: { score: number; maxScore: number; value: string; label: string };
    debtRatio?: { score: number; maxScore: number; value: string; label: string };
  };
  tips: string[];
  monthlyStats: {
    income: number;
    expenses: number;
    savings: number;
    savingsRate: string;
  };
  aiExplanation?: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getGradeColors(grade: string): { bg: string; text: string; border: string; ring: string } {
  switch (grade) {
    case "A":
    case "A+":
      return { 
        bg: "bg-emerald-100 dark:bg-emerald-950/50", 
        text: "text-emerald-700 dark:text-emerald-400", 
        border: "border-emerald-200 dark:border-emerald-800",
        ring: "stroke-emerald-500"
      };
    case "B":
    case "B+":
      return { 
        bg: "bg-teal-100 dark:bg-teal-950/50", 
        text: "text-teal-700 dark:text-teal-400", 
        border: "border-teal-200 dark:border-teal-800",
        ring: "stroke-teal-500"
      };
    case "C":
    case "C+":
      return { 
        bg: "bg-yellow-100 dark:bg-yellow-950/50", 
        text: "text-yellow-700 dark:text-yellow-400", 
        border: "border-yellow-200 dark:border-yellow-800",
        ring: "stroke-yellow-500"
      };
    case "D":
    case "D+":
      return { 
        bg: "bg-orange-100 dark:bg-orange-950/50", 
        text: "text-orange-700 dark:text-orange-400", 
        border: "border-orange-200 dark:border-orange-800",
        ring: "stroke-orange-500"
      };
    default:
      return { 
        bg: "bg-red-100 dark:bg-red-950/50", 
        text: "text-red-700 dark:text-red-400", 
        border: "border-red-200 dark:border-red-800",
        ring: "stroke-red-500"
      };
  }
}

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const colors = getGradeColors(grade);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-24 h-24 sm:w-28 sm:h-28">
      <svg className="w-24 h-24 sm:w-28 sm:h-28 transform -rotate-90" viewBox="0 0 128 128">
        <circle
          cx="64"
          cy="64"
          r="45"
          stroke="currentColor"
          strokeWidth="8"
          fill="transparent"
          className="text-muted/20"
        />
        <circle
          cx="64"
          cy="64"
          r="45"
          strokeWidth="8"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={colors.ring}
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl sm:text-3xl font-bold ${colors.text}`}>{score}</span>
        <span className="text-[10px] text-muted-foreground">out of 100</span>
      </div>
    </div>
  );
}

function BreakdownItem({
  icon: Icon,
  label,
  score,
  maxScore,
  value,
}: {
  icon: React.ElementType;
  label: string;
  score: number;
  maxScore: number;
  value: string;
}) {
  const percent = (score / maxScore) * 100;
  const isGood = percent >= 70;
  const isWarning = percent >= 40 && percent < 70;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs sm:text-sm">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className={`w-3 h-3 sm:w-4 sm:h-4 shrink-0 ${
            isGood ? "text-emerald-500" : isWarning ? "text-yellow-500" : "text-red-500"
          }`} />
          <span className="truncate">{label}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-muted-foreground text-[10px] hidden sm:inline">{value}</span>
          <Badge variant="outline" className={`text-[10px] ${
            isGood ? "border-emerald-200 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400" :
            isWarning ? "border-yellow-200 text-yellow-600 dark:border-yellow-800 dark:text-yellow-400" :
            "border-red-200 text-red-600 dark:border-red-800 dark:text-red-400"
          }`}>
            {score}/{maxScore}
          </Badge>
        </div>
      </div>
      <Progress 
        value={percent} 
        className={`h-1.5 ${
          isGood ? "[&>div]:bg-emerald-500" : 
          isWarning ? "[&>div]:bg-yellow-500" : 
          "[&>div]:bg-red-500"
        }`} 
      />
    </div>
  );
}

// AI Explanation Block Component
function AIExplanation({ explanation, grade }: { explanation: string; grade: string }) {
  if (!explanation) return null;

  return (
    <div className="p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
      <div className="flex items-start gap-2">
        <div className="p-1.5 rounded-md bg-primary/10 shrink-0">
          <Brain className="h-3.5 w-3.5 text-primary" />
        </div>
        <div>
          <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            AI Financial Analysis
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {explanation}
          </p>
        </div>
      </div>
    </div>
  );
}

// Data Source Label
function DataSourceLabel() {
  return (
    <Badge 
      variant="outline" 
      className="text-[10px] gap-1 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
    >
      <Target className="h-2.5 w-2.5" />
      From your budget plan
    </Badge>
  );
}

export function FinancialHealthScore() {
  const { data, isLoading, error } = useQuery<HealthScoreData>({
    queryKey: ["/api/reports/financial-health"],
  });

  if (isLoading) {
    return (
      <Card className="border-emerald-200 dark:border-emerald-800">
        <CardHeader className="px-4 py-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4" />
            Financial Health Score
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="w-24 h-24 rounded-full" />
            <Skeleton className="w-full h-4" />
            <Skeleton className="w-full h-4" />
            <Skeleton className="w-full h-4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-emerald-200 dark:border-emerald-800">
        <CardHeader className="px-4 py-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4" />
            Financial Health Score
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-muted-foreground text-center py-4 text-sm">
            Add income and budget data to calculate your financial health score.
          </p>
        </CardContent>
      </Card>
    );
  }

  const gradeColors = getGradeColors(data.grade);

  return (
    <Card className="border-emerald-200 dark:border-emerald-800">
      <CardHeader className="px-4 py-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="w-4 h-4 text-emerald-500" />
                Financial Health Score
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Based on your financial plan & budgets
              </CardDescription>
            </div>
            <Tooltip>
              <TooltipTrigger>
                <Badge className={`${gradeColors.bg} ${gradeColors.text} ${gradeColors.border} border text-lg px-2 py-0.5 shrink-0`}>
                  {data.grade}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Calculated from savings rate, budget adherence, goals & bills</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <DataSourceLabel />
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {/* Score Ring + Grade */}
        <div className="flex items-center justify-center gap-4">
          <ScoreRing score={data.score} grade={data.grade} />
        </div>

        {/* AI Explanation */}
        <AIExplanation 
          explanation={data.aiExplanation || generateDefaultExplanation(data)} 
          grade={data.grade} 
        />

        {/* Plan-Based Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900">
            <div className="flex items-center justify-center gap-1 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-3 h-3" />
              <span className="text-[10px]">Budgeted</span>
            </div>
            <p className="font-semibold mt-1 text-sm">{formatCurrency(data.monthlyStats.income)}</p>
          </div>
          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900">
            <div className="flex items-center justify-center gap-1 text-blue-600 dark:text-blue-400">
              <TrendingDown className="w-3 h-3" />
              <span className="text-[10px]">Planned</span>
            </div>
            <p className="font-semibold mt-1 text-sm">{formatCurrency(data.monthlyStats.expenses)}</p>
          </div>
          <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900">
            <div className="flex items-center justify-center gap-1 text-teal-600 dark:text-teal-400">
              <Wallet className="w-3 h-3" />
              <span className="text-[10px]">Target</span>
            </div>
            <p className={`font-semibold mt-1 text-sm ${data.monthlyStats.savings >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {formatCurrency(data.monthlyStats.savings)}
            </p>
          </div>
        </div>

        {/* Score Breakdown */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Info className="w-3 h-3" />
            Score Breakdown
          </div>

          <BreakdownItem
            icon={PiggyBank}
            label={data.breakdown.savingsRate.label}
            score={data.breakdown.savingsRate.score}
            maxScore={data.breakdown.savingsRate.maxScore}
            value={`${data.breakdown.savingsRate.value}%`}
          />

          <BreakdownItem
            icon={Target}
            label={data.breakdown.budgetAdherence.label}
            score={data.breakdown.budgetAdherence.score}
            maxScore={data.breakdown.budgetAdherence.maxScore}
            value={data.breakdown.budgetAdherence.value}
          />

          <BreakdownItem
            icon={Wallet}
            label={data.breakdown.savingsGoals.label}
            score={data.breakdown.savingsGoals.score}
            maxScore={data.breakdown.savingsGoals.maxScore}
            value={data.breakdown.savingsGoals.value}
          />

          <BreakdownItem
            icon={Receipt}
            label={data.breakdown.billTracking.label}
            score={data.breakdown.billTracking.score}
            maxScore={data.breakdown.billTracking.maxScore}
            value={data.breakdown.billTracking.value}
          />

          {data.breakdown.debtRatio && (
            <BreakdownItem
              icon={Receipt}
              label={data.breakdown.debtRatio.label}
              score={data.breakdown.debtRatio.score}
              maxScore={data.breakdown.debtRatio.maxScore}
              value={data.breakdown.debtRatio.value}
            />
          )}
        </div>

        {/* Tips */}
        {data.tips.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Lightbulb className="w-3 h-3 text-yellow-500" />
              Tips to Improve
            </div>
            <ul className="space-y-1.5">
              {data.tips.slice(0, 3).map((tip, index) => (
                <li key={index} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-primary mt-0.5 shrink-0">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Generate a default explanation based on the score data
function generateDefaultExplanation(data: HealthScoreData): string {
  const score = data.score;
  const savingsRate = parseFloat(data.breakdown.savingsRate.value) || 0;
  const grade = data.grade;
  
  if (score >= 80) {
    return `You're in excellent financial shape with a ${savingsRate}% savings rate and strong budget discipline. Keep maintaining these healthy habits to build long-term wealth.`;
  } else if (score >= 60) {
    return `Your finances are on track with a ${grade} grade. Focus on increasing your savings rate and staying within budget to move from ${grade} to a higher grade.`;
  } else if (score >= 40) {
    return `There's room for improvement in your financial health. Consider reducing discretionary spending and setting up automatic savings to boost your score from ${grade}.`;
  } else {
    return `Your financial health needs attention. Start by creating a realistic budget, tracking all expenses, and identifying areas where you can cut back to improve from grade ${grade}.`;
  }
}
