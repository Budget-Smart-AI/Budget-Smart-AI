import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Gauge, DollarSign, Calendar, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpendabilityResponse {
  currentBalance: number;
  safeToSpend: number;
  dailyAllowance: number;
  upcomingBillsTotal: number;
  upcomingBillsCount: number;
  daysUntilNextPayday: number;
  status: "safe" | "caution" | "danger";
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

export function SpendabilityWidget() {
  const { data, isLoading, error } = useQuery<SpendabilityResponse>({
    queryKey: ['/api/autopilot/spendability'],
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null;
  }

  const statusColors = {
    safe: "text-emerald-500",
    caution: "text-amber-500",
    danger: "text-red-500",
  };

  const statusBgColors = {
    safe: "bg-emerald-500/10 border-emerald-500/30",
    caution: "bg-amber-500/10 border-amber-500/30",
    danger: "bg-red-500/10 border-red-500/30",
  };

  const StatusIcon = data.status === "danger" 
    ? AlertTriangle 
    : data.status === "caution"
    ? AlertTriangle
    : CheckCircle;

  const spendabilityPercent = data.currentBalance > 0 
    ? Math.min(100, (data.safeToSpend / data.currentBalance) * 100)
    : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className={cn("h-4 w-4", statusColors[data.status])} />
            Spendability Meter
          </CardTitle>
          <Badge 
            variant="secondary" 
            className={cn(
              "border",
              statusBgColors[data.status],
              statusColors[data.status]
            )}
          >
            <StatusIcon className="h-3 w-3 mr-1" />
            {data.status === "safe" ? "Good" : data.status === "caution" ? "Caution" : "Warning"}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          Based on balance minus bills due this week
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn(
          "p-4 rounded-lg border text-center",
          statusBgColors[data.status]
        )}>
          <p className="text-xs text-muted-foreground mb-1">Daily Allowance</p>
          <p className={cn("text-3xl font-bold", statusColors[data.status])} data-testid="daily-allowance">
            {formatCurrency(data.dailyAllowance)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">per day until payday</p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Safe to Spend</span>
            <span className="font-medium">{formatCurrency(data.safeToSpend)}</span>
          </div>
          <Progress 
            value={spendabilityPercent} 
            className="h-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>of {formatCurrency(data.currentBalance)} balance</span>
            <span>{Math.round(spendabilityPercent)}%</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <DollarSign className="h-3 w-3" />
              <span className="text-xs">Bills (Next 7 Days)</span>
            </div>
            <p className="font-medium">
              {formatCurrency(data.upcomingBillsTotal)}
              <span className="text-xs text-muted-foreground ml-1">
                ({data.upcomingBillsCount} bill{data.upcomingBillsCount !== 1 ? "s" : ""})
              </span>
            </p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <Calendar className="h-3 w-3" />
              <span className="text-xs">Days to Payday</span>
            </div>
            <p className="font-medium">{data.daysUntilNextPayday} days</p>
          </div>
        </div>

        <p className="text-sm text-center text-muted-foreground">
          {data.message}
        </p>
      </CardContent>
    </Card>
  );
}