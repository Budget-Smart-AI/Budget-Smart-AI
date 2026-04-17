// FEATURE: NET_WORTH_TRACKING | tier: free | limit: unlimited
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Wallet, Building2, Car, Home, CreditCard, Landmark, PiggyBank, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { NetWorthSnapshot } from "@shared/schema";
import { useChartColors } from "@/hooks/useChartColors";

interface NetWorthResult {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  assetPercent: number;
  latestChange: number;
  assetBreakdown: Record<string, number>;
  liabilityBreakdown: Record<string, number>;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCurrencyFull(amount: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function NetWorth() {
  const { toast } = useToast();
  const colors = useChartColors();

  const ASSET_COLORS = [colors.chart1, colors.chart2, colors.chart3, colors.chart4, colors.muted];
  const LIABILITY_COLORS = [colors.danger, colors.chart4, colors.chart5, colors.muted];

  const { data: netWorth, isLoading: netWorthLoading } = useQuery<NetWorthResult>({
    queryKey: ["/api/engine/net-worth"],
  });

  const { data: history = [], isLoading: historyLoading } = useQuery<NetWorthSnapshot[]>({
    queryKey: ["/api/engine/net-worth/history"],
  });

  const snapshotMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/engine/net-worth/snapshot"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engine/net-worth/history"] });
      toast({ title: "Snapshot saved successfully" });
    },
    onError: (err: unknown) => {
      // Surface the real reason — was silently swallowed before (CORS on engine
      // POST vs. canWrite=false vs. network error all looked the same to the user).
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "Unknown error";
      console.error("[net-worth] snapshot failed:", err);
      toast({
        title: "Failed to save snapshot",
        description: message,
        variant: "destructive",
      });
    },
  });

  if (netWorthLoading || historyLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!netWorth) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Unable to calculate net worth</p>
      </div>
    );
  }

  // Map asset breakdown from engine response
  const assetData = Object.entries(netWorth.assetBreakdown)
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => {
      const iconMap: Record<string, any> = {
        cashAndBank: Wallet,
        investments: TrendingUp,
        realEstate: Home,
        vehicles: Car,
        otherAssets: Building2,
      };
      const Icon = iconMap[key] || Building2;
      const nameMap: Record<string, string> = {
        cashAndBank: "Chequing & Savings",
        investments: "Investments",
        realEstate: "Real Estate",
        vehicles: "Vehicles",
        otherAssets: "Other Assets",
      };
      return { name: nameMap[key] || key, value, icon: Icon };
    });

  const liabilityData = Object.entries(netWorth.liabilityBreakdown)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => {
      const iconMap: Record<string, any> = {
        creditCards: CreditCard,
        mortgages: Home,
        loans: Landmark,
        otherLiabilities: Building2,
      };
      const Icon = iconMap[key] || Building2;
      const nameMap: Record<string, string> = {
        creditCards: "Credit Cards",
        mortgages: "Mortgages",
        loans: "Other Loans",
        otherLiabilities: "Other",
      };
      return { name: nameMap[key] || key, value, icon: Icon };
    });

  const chartData = history
    .slice()
    .reverse()
    .map(h => ({
      date: format(parseISO(h.date), "MMM yyyy"),
      netWorth: parseFloat(h.netWorth),
      assets: parseFloat(h.totalAssets),
      liabilities: parseFloat(h.totalLiabilities),
    }));

  const isPositive = netWorth.netWorth >= 0;
  const assetPct = netWorth.assetPercent;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Net Worth</h1>
          <p className="text-muted-foreground">Track your overall financial health</p>
        </div>
        <Button onClick={() => snapshotMutation.mutate()} disabled={snapshotMutation.isPending}>
          <Camera className="h-4 w-4 mr-2" />
          Save Snapshot
        </Button>
      </div>

      {/* Main Net Worth Card — label/number pairs in a 3-column grid so labels
          stay anchored to their values instead of drifting to the left edge on
          wide screens. */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
        <CardHeader className="pb-3">
          <CardDescription>Net Worth Summary</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            {/* Total Assets */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                Total Assets
              </div>
              <div className="text-2xl font-semibold text-green-600">
                {formatCurrencyFull(netWorth.totalAssets)}
              </div>
            </div>

            {/* Total Liabilities */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <TrendingDown className="h-3.5 w-3.5 text-red-600" />
                Total Liabilities
              </div>
              <div className="text-2xl font-semibold text-red-600">
                {formatCurrencyFull(Math.abs(netWorth.totalLiabilities))}
              </div>
            </div>

            {/* Net Worth */}
            <div className="space-y-1 sm:border-l sm:border-border/60 sm:pl-6">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Net Worth
              </div>
              <div className={`text-3xl font-bold ${isPositive ? "text-green-600" : "text-red-600"}`}>
                {formatCurrencyFull(netWorth.netWorth)}
              </div>
              {netWorth.latestChange !== 0 && (
                <div className={`flex items-center gap-1 text-xs ${netWorth.latestChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {netWorth.latestChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {formatCurrency(Math.abs(netWorth.latestChange))} vs last snapshot
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assets vs Liabilities Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Assets Card */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <CardTitle className="text-lg">Assets</CardTitle>
            </div>
            <CardTitle className="text-2xl text-green-600">{formatCurrencyFull(netWorth.totalAssets)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {assetData.length > 0 ? (
                assetData.map((asset) => (
                  <div key={asset.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <asset.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{asset.name}</span>
                    </div>
                    <span className="font-medium text-sm">{formatCurrencyFull(asset.value)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No assets recorded</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Liabilities Card */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-red-600" />
                <CardTitle className="text-lg">Liabilities</CardTitle>
              </div>
              <Link href="/liabilities" className="text-xs text-primary hover:underline">
                View all liabilities →
              </Link>
            </div>
            <CardTitle className="text-2xl text-red-600">{formatCurrencyFull(Math.abs(netWorth.totalLiabilities))}</CardTitle>
          </CardHeader>
          <CardContent>
            {liabilityData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No liabilities recorded</p>
            ) : (
              <div className="space-y-3">
                {liabilityData.map((liability) => (
                  <div key={liability.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <liability.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{liability.name}</span>
                    </div>
                    <span className="font-medium text-sm text-red-600">{formatCurrencyFull(Math.abs(liability.value))}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Asset Allocation Pie Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Asset Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            {assetData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No assets to display</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={assetData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {assetData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={ASSET_COLORS[index % ASSET_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrencyFull(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assets vs Liabilities</CardTitle>
            <CardDescription>Share of your total balance sheet</CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const absLiab = Math.abs(netWorth.totalLiabilities);
              const total = netWorth.totalAssets + absLiab;
              const assetShare = total > 0 ? (netWorth.totalAssets / total) * 100 : 0;
              const liabShare = total > 0 ? (absLiab / total) * 100 : 0;
              return (
                <div className="space-y-4">
                  {/* Proportional horizontal bar: green segment = assets, red = liabilities.
                      Built with flex widths rather than Progress so both colors render correctly. */}
                  <div className="w-full h-4 rounded-full overflow-hidden flex bg-muted">
                    {assetShare > 0 && (
                      <div
                        className="h-full bg-green-500 transition-all"
                        style={{ width: `${assetShare}%` }}
                        data-testid="bar-assets"
                      />
                    )}
                    {liabShare > 0 && (
                      <div
                        className="h-full bg-red-500 transition-all"
                        style={{ width: `${liabShare}%` }}
                        data-testid="bar-liabilities"
                      />
                    )}
                  </div>

                  {/* Legend + amounts */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-start gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500 mt-1 shrink-0" />
                      <div>
                        <div className="font-medium">Assets · {assetShare.toFixed(0)}%</div>
                        <div className="text-green-600">
                          {formatCurrencyFull(netWorth.totalAssets)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500 mt-1 shrink-0" />
                      <div>
                        <div className="font-medium">Liabilities · {liabShare.toFixed(0)}%</div>
                        <div className="text-red-600">
                          {formatCurrencyFull(absLiab)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Historical Chart */}
      {chartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Net Worth History</CardTitle>
            <CardDescription>Track your net worth over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    className="text-xs"
                  />
                  <Tooltip formatter={(value: number) => formatCurrencyFull(value)} />
                  <Line
                    type="monotone"
                    dataKey="netWorth"
                    stroke={colors.chart3}
                    strokeWidth={2}
                    dot={{ fill: colors.chart3 }}
                    name="Net Worth"
                  />
                  <Line
                    type="monotone"
                    dataKey="assets"
                    stroke={colors.success}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Assets"
                  />
                  <Line
                    type="monotone"
                    dataKey="liabilities"
                    stroke={colors.danger}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Liabilities"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {chartData.length <= 1 && (
        <Card>
          <CardContent className="py-12 text-center">
            <PiggyBank className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Save snapshots regularly to see your net worth history over time.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
