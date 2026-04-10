import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Calendar,
  DollarSign,
  ArrowDown,
  ArrowUp,
  Info,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ReferenceLine,
} from "recharts";
import { format, parseISO } from "date-fns";

interface CashFlowEvent {
  date: string;
  type: "bill" | "income" | "spending";
  name: string;
  amount: number;
  category?: string;
}

interface DailyProjection {
  date: string;
  balance: number;
  events: CashFlowEvent[];
  isLowBalance: boolean;
}

interface LowBalanceWarning {
  date: string;
  projectedBalance: number;
  daysUntilNextIncome: number;
  severity: "warning" | "critical";
}

interface CashFlowForecast {
  currentBalance: number;
  projectedBalances: DailyProjection[];
  lowBalanceWarning: LowBalanceWarning | null;
  summary: {
    totalExpectedIncome: number;
    totalExpectedBills: number;
    totalPredictedSpending: number;
    averageDailySpending: number;
    lowestProjectedBalance: number;
    lowestBalanceDate: string;
    daysUntilLowBalance: number | null;
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatShortDate(dateStr: string): string {
  return format(parseISO(dateStr), "MMM d");
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DailyProjection }>;
  label?: string;
}

function CustomChartTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || !payload[0]) return null;

  const data = payload[0].payload;

  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 min-w-[200px]">
      <div className="font-medium mb-2">
        {format(parseISO(data.date), "EEEE, MMM d")}
      </div>
      <div className={`text-lg font-bold ${data.isLowBalance ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
        {formatCurrency(data.balance)}
      </div>
      {data.events.length > 0 && (
        <div className="mt-2 pt-2 border-t space-y-1">
          {data.events.slice(0, 5).map((event, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1">
                {event.type === "income" ? (
                  <ArrowUp className="w-3 h-3 text-green-500" />
                ) : (
                  <ArrowDown className="w-3 h-3 text-red-500" />
                )}
                <span className="truncate max-w-[120px]">{event.name}</span>
              </span>
              <span className={event.amount > 0 ? "text-green-600" : "text-red-500"}>
                {event.amount > 0 ? "+" : ""}{formatCurrency(event.amount)}
              </span>
            </div>
          ))}
          {data.events.length > 5 && (
            <div className="text-xs text-muted-foreground">
              +{data.events.length - 5} more events
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CashFlowForecast() {
  const { data, isLoading, error } = useQuery<CashFlowForecast>({
    queryKey: ["/api/reports/cash-flow-forecast"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="px-4 py-4 sm:px-6 sm:py-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" />
            Cash Flow Forecast
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
          <Skeleton className="w-full h-[160px] sm:h-[200px]" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-4">
            <Skeleton className="h-14 sm:h-16" />
            <Skeleton className="h-14 sm:h-16" />
            <Skeleton className="h-14 sm:h-16" />
            <Skeleton className="h-14 sm:h-16" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader className="px-4 py-4 sm:px-6 sm:py-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" />
            Cash Flow Forecast
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
          <p className="text-muted-foreground text-center py-4 text-sm">
            Connect a bank account to see your cash flow forecast.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data
  const chartData = data.projectedBalances.map((proj) => ({
    ...proj,
    dateLabel: formatShortDate(proj.date),
  }));

  const minBalance = Math.min(...chartData.map(d => d.balance));
  const maxBalance = Math.max(...chartData.map(d => d.balance));
  const yAxisMin = Math.floor(Math.min(0, minBalance - 100) / 100) * 100;
  const yAxisMax = Math.ceil((maxBalance + 100) / 100) * 100;

  return (
    <Card>
      <CardHeader className="px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" />
              30-Day Cash Flow Forecast
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-1">
              Projected balance based on bills, income & spending patterns
            </CardDescription>
          </div>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="gap-1 text-xs shrink-0">
                <DollarSign className="w-3 h-3" />
                {formatCurrency(data.currentBalance)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Current balance</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 space-y-4">
        {/* Low Balance Warning */}
        {data.lowBalanceWarning && (
          <Alert variant={data.lowBalanceWarning.severity === "critical" ? "destructive" : "default"}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {data.lowBalanceWarning.severity === "critical" ? "Critical Balance Warning" : "Low Balance Warning"}
            </AlertTitle>
            <AlertDescription>
              Balance projected to drop to {formatCurrency(data.lowBalanceWarning.projectedBalance)} on{" "}
              {format(parseISO(data.lowBalanceWarning.date), "MMMM d")}
              {data.lowBalanceWarning.daysUntilNextIncome > 0 && (
                <span> ({data.lowBalanceWarning.daysUntilNextIncome} days until next income)</span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Chart */}
        <div className="h-[160px] sm:h-[200px] mt-4 -mx-2 sm:mx-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[yAxisMin, yAxisMax]}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${value / 1000}k`}
                width={40}
              />
              <RechartsTooltip content={<CustomChartTooltip />} />
              <ReferenceLine y={500} stroke="hsl(var(--destructive))" strokeDasharray="5 5" label="" />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="hsl(var(--primary))"
                fill="url(#balanceGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 pt-4 border-t">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-1 text-green-600 dark:text-green-400">
              <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="text-[10px] sm:text-xs">Expected Income</span>
            </div>
            <p className="font-semibold text-sm sm:text-base">{formatCurrency(data.summary.totalExpectedIncome)}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-1 text-red-600 dark:text-red-400">
              <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="text-[10px] sm:text-xs">Bills (30-Day Forecast)</span>
            </div>
            <p className="font-semibold text-sm sm:text-base">{formatCurrency(data.summary.totalExpectedBills)}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-1 text-orange-600 dark:text-orange-400">
              <DollarSign className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="text-[10px] sm:text-xs">Avg Daily</span>
            </div>
            <p className="font-semibold text-sm sm:text-base">{formatCurrency(data.summary.averageDailySpending)}</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <Tooltip>
              <TooltipTrigger className="w-full">
                <div className="flex items-center justify-center gap-1 text-muted-foreground">
                  <Info className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="text-[10px] sm:text-xs">Lowest Point</span>
                </div>
                <p className={`font-semibold text-sm sm:text-base ${data.summary.lowestProjectedBalance < 500 ? "text-red-500" : ""}`}>
                  {formatCurrency(data.summary.lowestProjectedBalance)}
                </p>
              </TooltipTrigger>
              <TooltipContent>
                On {format(parseISO(data.summary.lowestBalanceDate), "MMM d")}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
