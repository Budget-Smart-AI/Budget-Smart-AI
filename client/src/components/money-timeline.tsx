import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  DollarSign,
  Shield,
  AlertCircle,
  ChevronRight,
  Wallet,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface TimelinePoint {
  date: string;
  balance: number;
  events: Array<{
    date: string;
    type: "bill" | "income" | "spending";
    name: string;
    amount: number;
    category?: string;
  }>;
  status: "safe" | "warning" | "danger";
}

interface MoneyTimelineData {
  currentBalance: number;
  timeline: TimelinePoint[];
  dangerDate: string | null;
  daysUntilDanger: number | null;
  projectedShortfall: number | null;
  safeToSpend: number;
  emotionalHook: string;
  hookSeverity: "safe" | "warning" | "danger";
  summary: {
    totalExpectedIncome: number;
    totalExpectedBills: number;
    totalPredictedSpending: number;
    averageDailySpending: number;
    lowestProjectedBalance: number;
    lowestBalanceDate: string;
    daysUntilLowBalance: number | null;
    totalDays: number;
    hasLinkedAccounts: boolean;
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getStatusColor(status: "safe" | "warning" | "danger"): string {
  switch (status) {
    case "danger": return "bg-red-500";
    case "warning": return "bg-amber-500";
    case "safe": return "bg-emerald-500";
  }
}

function getStatusBg(status: "safe" | "warning" | "danger"): string {
  switch (status) {
    case "danger": return "bg-red-500/10 border-red-500/30";
    case "warning": return "bg-amber-500/10 border-amber-500/30";
    case "safe": return "bg-emerald-500/10 border-emerald-500/30";
  }
}

export function MoneyTimeline() {
  const { data, isLoading, error } = useQuery<MoneyTimelineData>({
    queryKey: ['/api/reports/money-timeline'],
  });

  if (isLoading) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Money Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Unable to load timeline data.</p>
        </CardContent>
      </Card>
    );
  }

  // Sample every 7 days for the timeline visualization
  const weeklyPoints = data.timeline.filter((_, index) => index % 7 === 0 || index === data.timeline.length - 1);

  return (
    <Card className="col-span-full overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle data-testid="money-timeline-title">Money Timeline</CardTitle>
            <Badge variant="outline" className="text-xs">90 Days</Badge>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col items-end">
                <span className="font-semibold text-foreground" data-testid="safe-to-spend">
                  {formatCurrency(data.safeToSpend)}
                </span>
                <span className="text-xs text-muted-foreground">Safe to spend · 7-day forecast</span>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div 
          className={cn(
            "p-4 rounded-lg border flex items-center gap-3",
            getStatusBg(data.hookSeverity)
          )}
          data-testid="emotional-hook"
        >
          {data.hookSeverity === "danger" ? (
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
          ) : data.hookSeverity === "warning" ? (
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          ) : (
            <Shield className="h-5 w-5 text-emerald-500 flex-shrink-0" />
          )}
          <div className="flex-1">
            <p className={cn(
              "font-semibold",
              data.hookSeverity === "danger" ? "text-red-600 dark:text-red-400" :
              data.hookSeverity === "warning" ? "text-amber-600 dark:text-amber-400" :
              "text-emerald-600 dark:text-emerald-400"
            )}>
              {data.emotionalHook}
            </p>
            {data.projectedShortfall && data.daysUntilDanger !== null && (
              <p className="text-sm text-muted-foreground mt-1">
                You will be short {formatCurrency(data.projectedShortfall)} on {formatDate(data.dangerDate!)}.
              </p>
            )}
          </div>
          
          {data.hookSeverity !== "safe" && (
            <Link href="/ai-assistant">
              <Button variant="outline" size="sm" className="flex-shrink-0" data-testid="fix-with-ai-button">
                Fix with AI
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          )}
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
          <span>Today: {formatCurrency(data.currentBalance)}</span>
          <span>Day 90: {formatCurrency(data.timeline[data.timeline.length - 1]?.balance || 0)}</span>
        </div>

        <ScrollArea className="w-full whitespace-nowrap pb-4">
          <div className="flex items-end gap-1 h-40 px-2">
            {weeklyPoints.map((point, index) => {
              const maxBalance = Math.max(...data.timeline.map(p => Math.abs(p.balance)));
              const normalizedHeight = Math.max(10, (Math.abs(point.balance) / maxBalance) * 100);
              const isNegative = point.balance < 0;
              
              return (
                <div
                  key={point.date}
                  className="flex flex-col items-center gap-1 min-w-[60px]"
                  data-testid={`timeline-point-${index}`}
                >
                  <div className="text-xs font-medium text-center">
                    {isNegative ? (
                      <span className="text-red-500">{formatCurrency(point.balance)}</span>
                    ) : (
                      <span className={cn(
                        point.status === "warning" ? "text-amber-500" : "text-foreground"
                      )}>
                        {formatCurrency(point.balance)}
                      </span>
                    )}
                  </div>
                  
                  <div 
                    className={cn(
                      "w-8 rounded-t-sm transition-all",
                      getStatusColor(point.status),
                      isNegative && "rounded-b-sm rounded-t-none"
                    )}
                    style={{ 
                      height: `${normalizedHeight}px`,
                      transform: isNegative ? 'translateY(100%)' : 'none'
                    }}
                  />
                  
                  <div className="text-xs text-muted-foreground text-center mt-1">
                    {formatDate(point.date)}
                  </div>
                  
                  {point.events.length > 0 && (
                    <div className="flex gap-0.5">
                      {point.events.slice(0, 3).map((event, i) => (
                        <div
                          key={i}
                          className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            event.type === "income" ? "bg-emerald-500" :
                            event.type === "bill" ? "bg-red-400" : "bg-gray-400"
                          )}
                          title={`${event.name}: ${formatCurrency(event.amount)}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-emerald-500 mb-1">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div className="text-lg font-semibold">
              {formatCurrency(data.summary.totalExpectedIncome)}
            </div>
            <div className="text-xs text-muted-foreground">Income (Next 30 Days)</div>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-red-500 mb-1">
              <TrendingDown className="h-4 w-4" />
            </div>
            <div className="text-lg font-semibold">
              {formatCurrency(data.summary.totalExpectedBills)}
            </div>
            <div className="text-xs text-muted-foreground">Bills (Next 30 Days)</div>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-amber-500 mb-1">
              <DollarSign className="h-4 w-4" />
            </div>
            <div className="text-lg font-semibold">
              {formatCurrency(data.summary.totalPredictedSpending)}
            </div>
            <div className="text-xs text-muted-foreground">Predicted Spending</div>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
            </div>
            <div className="text-lg font-semibold">
              {formatCurrency(data.summary.averageDailySpending)}
            </div>
            <div className="text-xs text-muted-foreground">Daily Avg Spend</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}