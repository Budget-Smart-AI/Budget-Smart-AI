// FEATURE: NET_WORTH_TRACKING | tier: free | limit: unlimited
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
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

interface NetWorthData {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  breakdown: {
    assets: {
      cashAndBank: number;
      investments: number;
      realEstate: number;
      vehicles: number;
      otherAssets: number;
    };
    liabilities: {
      creditCards: number;
      loans: number;
      mortgages: number;
      otherLiabilities: number;
    };
  };
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}


export default function NetWorth() {
  const { toast } = useToast();
  const colors = useChartColors();

  const ASSET_COLORS = [colors.chart1, colors.chart2, colors.chart3, colors.chart4, colors.muted];
  const LIABILITY_COLORS = [colors.danger, colors.chart4, colors.chart5, colors.muted];

  const { data: netWorth, isLoading: netWorthLoading } = useQuery<NetWorthData>({
    queryKey: ["/api/net-worth"],
  });

  const { data: history = [], isLoading: historyLoading } = useQuery<NetWorthSnapshot[]>({
    queryKey: ["/api/net-worth/history"],
  });

  const snapshotMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/net-worth/snapshot"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/net-worth/history"] });
      toast({ title: "Snapshot saved successfully" });
    },
    onError: () => toast({ title: "Failed to save snapshot", variant: "destructive" }),
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

  const assetData = [
    { name: "Cash & Bank", value: netWorth.breakdown.assets.cashAndBank, icon: Wallet },
    { name: "Investments", value: netWorth.breakdown.assets.investments, icon: TrendingUp },
    { name: "Real Estate", value: netWorth.breakdown.assets.realEstate, icon: Home },
    { name: "Vehicles", value: netWorth.breakdown.assets.vehicles, icon: Car },
    { name: "Other Assets", value: netWorth.breakdown.assets.otherAssets, icon: Building2 },
  ].filter(d => d.value > 0);

  const liabilityData = [
    { name: "Credit Cards", value: netWorth.breakdown.liabilities.creditCards, icon: CreditCard },
    { name: "Loans", value: netWorth.breakdown.liabilities.loans, icon: Landmark },
    { name: "Mortgages", value: netWorth.breakdown.liabilities.mortgages, icon: Home },
    { name: "Other", value: netWorth.breakdown.liabilities.otherLiabilities, icon: Building2 },
  ].filter(d => d.value > 0);

  const chartData = history
    .slice()
    .reverse()
    .map(h => ({
      date: format(parseISO(h.date), "MMM yyyy"),
      netWorth: parseFloat(h.netWorth),
      assets: parseFloat(h.totalAssets),
      liabilities: parseFloat(h.totalLiabilities),
    }));

  const latestChange = history.length >= 2
    ? parseFloat(history[0].netWorth) - parseFloat(history[1].netWorth)
    : 0;

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

      {/* Main Net Worth Card */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
        <CardHeader>
          <CardDescription>Total Net Worth</CardDescription>
          <div className="flex items-baseline gap-4">
            <CardTitle className="text-4xl font-bold">
              {formatCurrency(netWorth.netWorth)}
            </CardTitle>
            {latestChange !== 0 && (
              <div className={`flex items-center gap-1 text-sm ${latestChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                {latestChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {formatCurrency(Math.abs(latestChange))} vs last snapshot
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Assets vs Liabilities Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <CardTitle className="text-lg">Total Assets</CardTitle>
            </div>
            <CardTitle className="text-2xl text-green-600">{formatCurrency(netWorth.totalAssets)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {assetData.map((item, i) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ASSET_COLORS[i] }} />
                    <span className="text-sm">{item.name}</span>
                  </div>
                  <span className="font-medium">{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
              <CardTitle className="text-lg">Total Liabilities</CardTitle>
            </div>
            <CardTitle className="text-2xl text-red-600">{formatCurrency(netWorth.totalLiabilities)}</CardTitle>
          </CardHeader>
          <CardContent>
            {liabilityData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No liabilities recorded</p>
            ) : (
              <div className="space-y-3">
                {liabilityData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: LIABILITY_COLORS[i] }} />
                      <span className="text-sm">{item.name}</span>
                    </div>
                    <span className="font-medium">{formatCurrency(item.value)}</span>
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
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Net Worth Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Assets</span>
                  <span className="text-green-600">{formatCurrency(netWorth.totalAssets)}</span>
                </div>
                <Progress
                  value={(netWorth.totalAssets / (netWorth.totalAssets + netWorth.totalLiabilities)) * 100}
                  className="h-3 bg-red-200"
                />
              </div>
              <div className="flex items-center justify-center gap-8 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span>Assets ({((netWorth.totalAssets / (netWorth.totalAssets + netWorth.totalLiabilities)) * 100).toFixed(0)}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span>Liabilities ({((netWorth.totalLiabilities / (netWorth.totalAssets + netWorth.totalLiabilities)) * 100).toFixed(0)}%)</span>
                </div>
              </div>
            </div>
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
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
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
