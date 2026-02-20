import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Hash,
  ArrowUpRight,
  X,
  Building2,
  CreditCard,
  Filter,
} from "lucide-react";
import { format, parseISO, startOfMonth, startOfQuarter, startOfYear, isWithinInterval, subYears } from "date-fns";

interface PlaidTransaction {
  id: string;
  plaidAccountId: string;
  transactionId: string;
  amount: string;
  date: string;
  name: string;
  merchantName?: string;
  logoUrl?: string;
  category?: string;
  personalCategory?: string;
  pending: string;
  matchType?: string;
  isoCurrencyCode?: string;
}

interface PlaidAccount {
  id: string;
  name: string;
  mask?: string;
  type: string;
  subtype?: string;
  institutionName?: string;
}

interface TransactionDrilldownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  merchant: string;
  category?: string;
  initialTransaction?: PlaidTransaction;
}

type TimePeriod = "monthly" | "quarterly" | "yearly";

interface ChartDataPoint {
  period: string;
  total: number;
  count: number;
  label: string;
  startDate: Date;
  endDate: Date;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Math.abs(amount));
};

const formatDate = (dateString: string) => {
  return format(parseISO(dateString), "MMM d, yyyy");
};

// Custom tooltip for the bar chart
function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload as ChartDataPoint;
    return (
      <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[180px]">
        <p className="font-semibold text-sm mb-2">{data.label}</p>
        <div className="space-y-1">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Total:</span>
            <span className="font-medium text-primary">{formatCurrency(data.total)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Transactions:</span>
            <span className="font-medium">{data.count}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Average:</span>
            <span className="font-medium">{formatCurrency(data.count > 0 ? data.total / data.count : 0)}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

export function TransactionDrilldown({
  open,
  onOpenChange,
  merchant,
  category,
  initialTransaction,
}: TransactionDrilldownProps) {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("monthly");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  // Calculate date range (2 years back from today)
  const endDate = new Date();
  const startDate = subYears(endDate, 2);
  
  const formattedStartDate = format(startDate, "yyyy-MM-dd");
  const formattedEndDate = format(endDate, "yyyy-MM-dd");

  // Fetch all transactions for the date range
  const { data: allTransactions = [] } = useQuery<PlaidTransaction[]>({
    queryKey: ["/api/plaid/transactions", `?startDate=${formattedStartDate}&endDate=${formattedEndDate}`],
  });

  // Fetch accounts for filtering
  const { data: accounts = [] } = useQuery<PlaidAccount[]>({
    queryKey: ["/api/plaid/accounts"],
  });

  // Filter transactions by merchant/category
  const filteredTransactions = useMemo(() => {
    return allTransactions.filter((t) => {
      const merchantMatch =
        (t.merchantName?.toLowerCase() === merchant.toLowerCase()) ||
        (t.name?.toLowerCase().includes(merchant.toLowerCase()));

      const categoryMatch = !category ||
        t.personalCategory === category ||
        t.category === category;

      const accountMatch = selectedAccountId === "all" ||
        t.plaidAccountId === selectedAccountId;

      // Only include debits (positive amounts in Plaid = money spent)
      const isDebit = parseFloat(t.amount) > 0;

      return merchantMatch && categoryMatch && accountMatch && isDebit;
    });
  }, [allTransactions, merchant, category, selectedAccountId]);

  // Generate chart data based on time period
  const chartData = useMemo(() => {
    const data: ChartDataPoint[] = [];
    const now = new Date();

    if (timePeriod === "monthly") {
      // Last 24 months
      for (let i = 23; i >= 0; i--) {
        const monthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - i, 1));
        const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);

        const monthTransactions = filteredTransactions.filter((t) => {
          const txDate = parseISO(t.date);
          return isWithinInterval(txDate, { start: monthStart, end: monthEnd });
        });

        const total = monthTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);

        data.push({
          period: format(monthStart, "MMM yy"),
          total,
          count: monthTransactions.length,
          label: format(monthStart, "MMMM yyyy"),
          startDate: monthStart,
          endDate: monthEnd,
        });
      }
    } else if (timePeriod === "quarterly") {
      // Last 8 quarters
      for (let i = 7; i >= 0; i--) {
        const quarterStart = startOfQuarter(new Date(now.getFullYear(), now.getMonth() - i * 3, 1));
        const quarterEnd = new Date(quarterStart.getFullYear(), quarterStart.getMonth() + 3, 0);

        const quarterTransactions = filteredTransactions.filter((t) => {
          const txDate = parseISO(t.date);
          return isWithinInterval(txDate, { start: quarterStart, end: quarterEnd });
        });

        const total = quarterTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
        const quarter = Math.floor(quarterStart.getMonth() / 3) + 1;

        data.push({
          period: `Q${quarter} ${format(quarterStart, "yy")}`,
          total,
          count: quarterTransactions.length,
          label: `Q${quarter} ${format(quarterStart, "yyyy")}`,
          startDate: quarterStart,
          endDate: quarterEnd,
        });
      }
    } else {
      // Last 3 years
      for (let i = 2; i >= 0; i--) {
        const yearStart = startOfYear(new Date(now.getFullYear() - i, 0, 1));
        const yearEnd = new Date(now.getFullYear() - i, 11, 31);

        const yearTransactions = filteredTransactions.filter((t) => {
          const txDate = parseISO(t.date);
          return isWithinInterval(txDate, { start: yearStart, end: yearEnd });
        });

        const total = yearTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);

        data.push({
          period: format(yearStart, "yyyy"),
          total,
          count: yearTransactions.length,
          label: format(yearStart, "yyyy"),
          startDate: yearStart,
          endDate: yearEnd,
        });
      }
    }

    return data;
  }, [filteredTransactions, timePeriod]);

  // Calculate summary statistics
  const stats = useMemo(() => {
    if (filteredTransactions.length === 0) {
      return {
        totalTransactions: 0,
        totalAmount: 0,
        averageAmount: 0,
        largestTransaction: null as PlaidTransaction | null,
        trend: 0,
      };
    }

    const amounts = filteredTransactions.map((t) => parseFloat(t.amount));
    const totalAmount = amounts.reduce((sum, a) => sum + a, 0);
    const maxAmount = Math.max(...amounts);
    const largestTransaction = filteredTransactions.find(
      (t) => parseFloat(t.amount) === maxAmount
    );

    // Calculate trend (compare last 3 months to previous 3 months)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const recentTotal = filteredTransactions
      .filter((t) => parseISO(t.date) >= threeMonthsAgo)
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const previousTotal = filteredTransactions
      .filter((t) => {
        const date = parseISO(t.date);
        return date >= sixMonthsAgo && date < threeMonthsAgo;
      })
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const trend = previousTotal > 0 ? ((recentTotal - previousTotal) / previousTotal) * 100 : 0;

    return {
      totalTransactions: filteredTransactions.length,
      totalAmount,
      averageAmount: totalAmount / filteredTransactions.length,
      largestTransaction,
      trend,
    };
  }, [filteredTransactions]);

  // Sort transactions by date (newest first)
  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [filteredTransactions]);

  // Get account name helper
  const getAccountName = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return "Unknown";
    return account.institutionName
      ? `${account.institutionName} - ${account.name}`
      : account.name;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">{merchant}</DialogTitle>
                {category && (
                  <Badge variant="secondary" className="mt-1">
                    {category}
                  </Badge>
                )}
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Accounts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Accounts</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        <span className="flex items-center gap-2">
                          <CreditCard className="h-3 w-3" />
                          {account.institutionName ? `${account.institutionName} - ` : ""}
                          {account.name}
                          {account.mask && ` (...${account.mask})`}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex rounded-lg border overflow-hidden">
                {(["monthly", "quarterly", "yearly"] as TimePeriod[]).map((period) => (
                  <Button
                    key={period}
                    variant={timePeriod === period ? "default" : "ghost"}
                    size="sm"
                    className="rounded-none border-0"
                    onClick={() => setTimePeriod(period)}
                  >
                    {period.charAt(0).toUpperCase() + period.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid grid-cols-3 gap-4 mt-4">
          {/* Left side - Chart and Transactions */}
          <div className="col-span-2 flex flex-col gap-4 overflow-hidden">
            {/* Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Spending Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="period"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        className="text-muted-foreground"
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `$${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`}
                        className="text-muted-foreground"
                      />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
                      <Bar
                        dataKey="total"
                        radius={[4, 4, 0, 0]}
                        onMouseEnter={(_, index) => setHoveredBar(index)}
                        onMouseLeave={() => setHoveredBar(null)}
                      >
                        {chartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              hoveredBar === index
                                ? "hsl(var(--primary))"
                                : entry.total > 0
                                ? "hsl(var(--primary) / 0.7)"
                                : "hsl(var(--muted))"
                            }
                            className="transition-colors duration-150"
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Transactions List */}
            <Card className="flex-1 overflow-hidden flex flex-col">
              <CardHeader className="pb-2 flex-shrink-0">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    Transaction History
                  </span>
                  <Badge variant="outline">{sortedTransactions.length} transactions</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-0">
                <ScrollArea className="h-[280px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky top-0 bg-card">Date</TableHead>
                        <TableHead className="sticky top-0 bg-card">Description</TableHead>
                        <TableHead className="sticky top-0 bg-card">Account</TableHead>
                        <TableHead className="sticky top-0 bg-card text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedTransactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            No transactions found
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortedTransactions.map((tx) => (
                          <TableRow key={tx.id} className="hover:bg-muted/50">
                            <TableCell className="font-medium">
                              {formatDate(tx.date)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {tx.merchantName || tx.name}
                                </span>
                                {tx.personalCategory && (
                                  <span className="text-xs text-muted-foreground">
                                    {tx.personalCategory}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {getAccountName(tx.plaidAccountId)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-medium text-destructive">
                              {formatCurrency(parseFloat(tx.amount))}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Right side - Summary Stats */}
          <div className="space-y-4">
            {/* Total Amount Card */}
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Spent</p>
                    <p className="text-3xl font-bold text-primary">
                      {formatCurrency(stats.totalAmount)}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-primary" />
                  </div>
                </div>
                {stats.trend !== 0 && (
                  <div className={`flex items-center gap-1 mt-3 text-sm ${
                    stats.trend > 0 ? "text-destructive" : "text-emerald-600"
                  }`}>
                    {stats.trend > 0 ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                    <span>{Math.abs(stats.trend).toFixed(1)}% vs previous period</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Transaction Count */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Transactions</p>
                    <p className="text-2xl font-bold">{stats.totalTransactions}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Hash className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Average Transaction */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Average Transaction</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(stats.averageAmount)}
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Largest Transaction */}
            <Card>
              <CardContent className="pt-6">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Largest Transaction</p>
                  {stats.largestTransaction ? (
                    <div className="space-y-2">
                      <p className="text-2xl font-bold text-destructive">
                        {formatCurrency(parseFloat(stats.largestTransaction.amount))}
                      </p>
                      <div className="text-sm text-muted-foreground">
                        <p>{formatDate(stats.largestTransaction.date)}</p>
                        <p className="truncate">
                          {stats.largestTransaction.merchantName || stats.largestTransaction.name}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No transactions</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick Insights */}
            {stats.totalTransactions > 0 && (
              <Card className="bg-muted/50">
                <CardContent className="pt-6">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2">
                    <ArrowUpRight className="h-4 w-4 text-primary" />
                    Quick Insights
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>
                      Avg {formatCurrency(stats.averageAmount)} per visit
                    </li>
                    <li>
                      {(stats.totalTransactions / 24).toFixed(1)} transactions/month
                    </li>
                    {chartData.length > 0 && (
                      <li>
                        Most active: {chartData.reduce((max, d) => d.count > max.count ? d : max, chartData[0]).label}
                      </li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
