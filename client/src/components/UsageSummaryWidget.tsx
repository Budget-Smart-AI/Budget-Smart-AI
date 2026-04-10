import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronUp, BarChart3, Zap } from "lucide-react";
import { format, parseISO } from "date-fns";

interface FeatureUsageItem {
  key: string;
  displayName: string;
  used: number;
  limit: number;
  remaining: number;
  resetDate: string | null;
  percentUsed: number;
}

interface FeatureUsageData {
  plan: string;
  features: FeatureUsageItem[];
  resetDate: string | null;
  daysUntilReset: number | null;
}

/** Route each feature key to its most relevant page */
/** Progress bar colour thresholds */
const USAGE_CRITICAL_THRESHOLD = 86;
const USAGE_WARNING_THRESHOLD = 61;

/** Route each feature key to its most relevant page */
function getFeatureRoute(key: string): string {
  const routeMap: Record<string, string> = {
    ai_assistant: "/ai-assistant",
    receipt_scanning: "/receipts",
    receipt_scanner: "/receipts",
    portfolio_advisor: "/investments",
    ai_budget_suggestions: "/budgets",
    ai_savings_advisor: "/savings",
    manual_transactions: "/bank-accounts",
    manual_accounts: "/bank-accounts",
    bank_connections: "/accounts",
    expense_tracking: "/expenses",
    budgets: "/budgets",
    savings_goals: "/savings",
    debt_tracking: "/debts",
    bill_tracking: "/bills",
    data_export_csv: "/reports",
    categories_management: "/categories",
    asset_tracking: "/assets",
  };
  return routeMap[key] ?? "/dashboard";
}

/** Colour the progress bar based on % used */
function progressColor(pct: number): string {
  if (pct >= USAGE_CRITICAL_THRESHOLD) return "#EF4444";
  if (pct >= USAGE_WARNING_THRESHOLD) return "#F59E0B";
  return "#22C55E";
}

const STORAGE_KEY = "usage_widget_collapsed";
const AUTO_EXPAND_THRESHOLD = 80;

export function UsageSummaryWidget() {
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<FeatureUsageData>({
    queryKey: ["/api/user/feature-usage"],
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });

  // Determine auto-expand: if any feature >= 80%, expand
  const shouldAutoExpand =
    (data?.features ?? []).some((f) => f.percentUsed >= AUTO_EXPAND_THRESHOLD);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "true";
  });

  // Auto-expand once when a feature reaches 80%
  useEffect(() => {
    if (shouldAutoExpand) {
      setCollapsed(false);
      localStorage.setItem(STORAGE_KEY, "false");
    }
  }, [shouldAutoExpand]);

  const handleToggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  // Only render for free plan users
  if (!isLoading && data && data.plan !== "free") return null;
  if (!isLoading && !data) return null;

  const resetLabel = (() => {
    if (!data?.resetDate) return null;
    try {
      const d = parseISO(data.resetDate);
      const monthLabel = format(d, "MMMM d");
      return data.daysUntilReset !== null
        ? `Resets ${monthLabel} (${data.daysUntilReset} day${data.daysUntilReset !== 1 ? "s" : ""})`
        : `Resets ${monthLabel}`;
    } catch {
      return null;
    }
  })();

  return (
    <Card className="border border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50/60 to-teal-50/40 dark:from-emerald-950/30 dark:to-teal-950/20">
      <CardHeader className="py-3 px-4 pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <CardTitle className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              Your Free Plan Usage
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={handleToggle}
            aria-label={collapsed ? "Expand usage widget" : "Collapse usage widget"}
          >
            {collapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        {!collapsed && resetLabel && (
          <p className="text-xs text-muted-foreground mt-0.5 pl-6">{resetLabel}</p>
        )}
      </CardHeader>

      {!collapsed && (
        <CardContent className="px-4 pb-4 pt-3 space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {(data?.features ?? []).slice(0, 8).map((feature) => (
                  <button
                    key={feature.key}
                    className="w-full text-left hover:bg-white/50 dark:hover:bg-white/5 rounded px-1 py-0.5 transition-colors"
                    onClick={() => navigate(getFeatureRoute(feature.key))}
                    title={`Go to ${feature.displayName}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs mb-1">
                      <span className="text-muted-foreground truncate max-w-[60%]">
                        {feature.displayName}
                      </span>
                      <span
                        className="font-medium tabular-nums shrink-0"
                        style={{ color: progressColor(feature.percentUsed) }}
                      >
                        {feature.used}/{feature.limit}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${feature.percentUsed}%`,
                          backgroundColor: progressColor(feature.percentUsed),
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3 h-8 text-xs border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                onClick={() => navigate("/upgrade")}
              >
                <Zap className="h-3 w-3 mr-1.5" />
                Upgrade for unlimited access →
              </Button>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
