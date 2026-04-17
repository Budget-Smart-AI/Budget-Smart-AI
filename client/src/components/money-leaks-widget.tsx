import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, TrendingDown, Eye, ChevronRight, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface LeakInfo {
  type: "recurring_small" | "price_increase" | "duplicate" | "unused_subscription";
  name: string;
  amount: number;
  frequency: string;
  monthlyImpact: number;
  yearlyImpact: number;
  firstSeen: string;
  occurrences: number;
  confidence: number;
}

interface LeaksResponse {
  leaks: LeakInfo[];
  summary: {
    totalLeaksFound: number;
    totalMonthlyLeaks: number;
    totalYearlyLeaks: number;
    existingAlerts: number;
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

export function MoneyLeaksWidget() {
  const [, navigate] = useLocation();
  const { data, isLoading, error } = useQuery<LeaksResponse>({
    queryKey: ['/api/leaks/detect'],
    staleTime: 1000 * 60 * 30, // Cache for 30 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null; // Silently fail for this widget
  }

  const hasLeaks = data.summary.totalLeaksFound > 0;

  return (
    <Card className={cn(
      "transition-all",
      hasLeaks && "border-amber-500/50"
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className={cn(
              "h-4 w-4",
              hasLeaks ? "text-amber-500" : "text-muted-foreground"
            )} />
            Silent Money Leaks
          </CardTitle>
          {hasLeaks && (
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
              {data.summary.totalLeaksFound} found
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs">
          Recurring charges draining your account
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasLeaks ? (
          <>
            <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div>
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  {formatCurrency(data.summary.totalMonthlyLeaks)}/month
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(data.summary.totalYearlyLeaks)}/year in potential leaks
                </p>
              </div>
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>

            <div className="space-y-2">
              {data.leaks.slice(0, 3).map((leak, i) => (
                <div 
                  key={i} 
                  className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                  data-testid={`leak-item-${i}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <TrendingDown className="h-3 w-3 text-red-500 shrink-0" />
                    <span className="text-sm truncate">{leak.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-medium text-red-500">
                      -{formatCurrency(leak.monthlyImpact)}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {leak.frequency}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            {data.leaks.length > 3 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                data-testid="view-all-leaks"
                onClick={() => navigate('/subscriptions')}
              >
                View all {data.leaks.length} leaks
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 text-center text-muted-foreground">
            <DollarSign className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No obvious money leaks detected</p>
            <p className="text-xs">Connect more accounts for better analysis</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}