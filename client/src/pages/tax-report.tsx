import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileText,
  Download,
  Receipt,
  TrendingDown,
  DollarSign,
  Tag,
  Info,
  ArrowUpDown,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Home,
  Car,
  Briefcase,
  BookOpen,
  Monitor,
  Utensils,
  Plane,
  Package,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Expense } from "@shared/schema";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount);
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

// Canadian marginal tax rate assumption for savings estimate
const ASSUMED_TAX_RATE = 0.33;

// Tax category display info
const TAX_CATEGORY_INFO: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  business_meals: { label: "Business Meals", icon: Utensils, color: "text-orange-500" },
  software: { label: "Software & Subscriptions", icon: Monitor, color: "text-blue-500" },
  home_office: { label: "Home Office", icon: Home, color: "text-green-500" },
  travel: { label: "Business Travel", icon: Plane, color: "text-cyan-500" },
  professional_development: { label: "Professional Development", icon: BookOpen, color: "text-indigo-500" },
  equipment: { label: "Equipment", icon: Package, color: "text-purple-500" },
  marketing: { label: "Marketing", icon: Tag, color: "text-pink-500" },
  vehicle: { label: "Vehicle", icon: Car, color: "text-yellow-500" },
  other_business: { label: "Other Business", icon: Briefcase, color: "text-gray-500" },
};

function getTaxCategoryInfo(key: string) {
  return TAX_CATEGORY_INFO[key] ?? { label: key || "Uncategorized", icon: Tag, color: "text-gray-500" };
}

type SortKey = "date" | "merchant" | "amount" | "category";
type SortDir = "asc" | "desc";

// ─── CSV export ──────────────────────────────────────────────────────────────

function exportToCSV(expenses: Expense[], year: number) {
  const headers = ["Date", "Merchant", "Amount (CAD)", "Category", "Tax Category", "Notes"];
  const rows = expenses.map((e) => [
    e.date,
    `"${e.merchant.replace(/"/g, '""')}"`,
    parseFloat(e.amount).toFixed(2),
    `"${e.category}"`,
    `"${e.taxCategory || ""}"`,
    `"${(e.notes || "").replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tax-deductible-expenses-${year}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function TaxReport() {
  const { toast } = useToast();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Fetch all expenses and filter client-side
  const { data: allExpenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
  });

  // Filter to tax-deductible expenses for the selected year
  const taxExpenses = useMemo(() => {
    return allExpenses.filter((e) => {
      const isDeductible = e.taxDeductible === "true" || e.isBusinessExpense === "true";
      if (!isDeductible) return false;
      const expYear = parseInt(e.date.substring(0, 4));
      return expYear === year;
    });
  }, [allExpenses, year]);

  // Summary stats
  const totalDeductible = useMemo(
    () => taxExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0),
    [taxExpenses]
  );

  const businessExpenses = useMemo(
    () => taxExpenses.filter((e) => e.isBusinessExpense === "true"),
    [taxExpenses]
  );

  const totalBusiness = useMemo(
    () => businessExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0),
    [businessExpenses]
  );

  const estimatedSavings = totalDeductible * ASSUMED_TAX_RATE;

  // Group by tax category
  const byCategory = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    taxExpenses.forEach((e) => {
      const cat = e.taxCategory || "other_business";
      if (!map[cat]) map[cat] = { total: 0, count: 0 };
      map[cat].total += parseFloat(e.amount);
      map[cat].count++;
    });
    return Object.entries(map)
      .map(([key, val]) => ({ key, ...val }))
      .sort((a, b) => b.total - a.total);
  }, [taxExpenses]);

  const maxCategoryTotal = byCategory.length > 0 ? byCategory[0].total : 1;

  // Unique tax categories for filter
  const uniqueTaxCategories = useMemo(
    () => Array.from(new Set(taxExpenses.map((e) => e.taxCategory || "other_business"))),
    [taxExpenses]
  );

  // Filtered + sorted expenses for table
  const filteredExpenses = useMemo(() => {
    let result = [...taxExpenses];
    if (categoryFilter !== "all") {
      result = result.filter((e) => (e.taxCategory || "other_business") === categoryFilter);
    }
    result.sort((a, b) => {
      let valA: string | number = a[sortKey as keyof Expense] as string;
      let valB: string | number = b[sortKey as keyof Expense] as string;
      if (sortKey === "amount") {
        valA = parseFloat(a.amount);
        valB = parseFloat(b.amount);
      }
      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [taxExpenses, categoryFilter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortHeader = ({ label, sk }: { label: string; sk: SortKey }) => (
    <TableHead
      className="cursor-pointer hover:text-primary transition-colors select-none"
      onClick={() => handleSort(sk)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Tax Report</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Canadian tax-deductible expense summary for your accountant
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Year selector */}
          <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y} Tax Year
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Download CSV */}
          <Button
            variant="outline"
            onClick={() => {
              if (taxExpenses.length === 0) {
                toast({ title: "No tax-deductible expenses to export", variant: "destructive" });
                return;
              }
              exportToCSV(taxExpenses, year);
              toast({ title: `CSV exported for ${year} tax year` });
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Download CSV
          </Button>

          {/* Link to expenses to mark more */}
          <Button variant="outline" asChild>
            <Link href="/expenses">
              <Tag className="h-4 w-4 mr-2" />
              Mark Expenses
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-green-500" />
              Total Deductible
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalDeductible)}</p>
                <p className="text-xs text-muted-foreground mt-1">{taxExpenses.length} expenses in {year}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Briefcase className="h-4 w-4 text-blue-500" />
              Business Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalBusiness)}</p>
                <p className="text-xs text-muted-foreground mt-1">{businessExpenses.length} business expenses</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Tag className="h-4 w-4 text-purple-500" />
              Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-2xl font-bold">{byCategory.length}</p>
                <p className="text-xs text-muted-foreground mt-1">tax categories used</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-amber-500" />
              Est. Tax Savings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <p className="text-2xl font-bold text-amber-600">{formatCurrency(estimatedSavings)}</p>
                <p className="text-xs text-muted-foreground mt-1">at 33% marginal rate</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Category Breakdown ── */}
      {byCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4" />
              Breakdown by Tax Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {byCategory.map(({ key, total, count }) => {
                const info = getTaxCategoryInfo(key);
                const Icon = info.icon;
                const pct = (total / maxCategoryTotal) * 100;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${info.color}`} />
                        <span className="font-medium">{info.label}</span>
                        <span className="text-muted-foreground text-xs">({count})</span>
                      </div>
                      <span className="font-semibold">{formatCurrency(total)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/70 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Expense Table ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4" />
              Tax-Deductible Expenses — {year}
            </CardTitle>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tax Categories</SelectItem>
                {uniqueTaxCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {getTaxCategoryInfo(cat).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : taxExpenses.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-semibold mb-2">No tax-deductible expenses for {year}</h3>
              <p className="text-sm max-w-sm mx-auto mb-6">
                Go to the Expenses page and mark expenses as "Tax Deductible" or "Business Expense" to see them here.
              </p>
              <Button variant="outline" asChild>
                <Link href="/expenses">
                  <Tag className="h-4 w-4 mr-2" />
                  Go to Expenses
                </Link>
              </Button>
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <p className="font-medium">No expenses in this category</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader label="Date" sk="date" />
                  <SortHeader label="Merchant" sk="merchant" />
                  <SortHeader label="Amount" sk="amount" />
                  <SortHeader label="Category" sk="category" />
                  <TableHead>Tax Category</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.map((expense) => {
                  const taxCatInfo = getTaxCategoryInfo(expense.taxCategory || "other_business");
                  const TaxIcon = taxCatInfo.icon;
                  return (
                    <TableRow key={expense.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(parseISO(expense.date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0 uppercase">
                            {expense.merchant.charAt(0)}
                          </div>
                          <span className="font-medium">{expense.merchant}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-green-600 whitespace-nowrap">
                        {formatCurrency(parseFloat(expense.amount))}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {expense.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm">
                          <TaxIcon className={`h-3.5 w-3.5 ${taxCatInfo.color}`} />
                          <span>{taxCatInfo.label}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {expense.taxDeductible === "true" && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500 text-green-600">
                              Tax
                            </Badge>
                          )}
                          {expense.isBusinessExpense === "true" && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500 text-blue-600">
                              Biz
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                        {expense.notes || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* Total row */}
          {filteredExpenses.length > 0 && (
            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <span className="text-sm font-medium text-muted-foreground">
                {filteredExpenses.length} expense{filteredExpenses.length !== 1 ? "s" : ""}
              </span>
              <span className="font-bold text-green-600">
                Total: {formatCurrency(filteredExpenses.reduce((s, e) => s + parseFloat(e.amount), 0))}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Canadian Tax Tips ── */}
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-amber-800 dark:text-amber-300">
            <Info className="h-4 w-4" />
            Canadian Tax Guidance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">T2125 — Business Income</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Self-employed? Report business income and expenses on Form T2125 (Statement of Business or Professional Activities).
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">HST Input Tax Credits</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Keep all receipts showing HST paid on business expenses. You may claim Input Tax Credits (ITCs) to recover HST paid.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">T777 — Home Office Expenses</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Employees working from home may claim home office expenses on Form T777. Calculate the workspace percentage of your home.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Vehicle Expenses</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Keep a mileage log for business vehicle use. You can deduct the business-use portion of fuel, insurance, maintenance, and depreciation.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Meals & Entertainment (50% Rule)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Only 50% of business meal and entertainment expenses are deductible under CRA rules. Ensure these are categorized correctly.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Keep Records for 6 Years</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  CRA requires you to keep all supporting documents for at least 6 years from the end of the tax year they relate to.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-amber-200 dark:border-amber-800">
            <p className="text-xs text-muted-foreground">
              <strong>Disclaimer:</strong> This report is for informational purposes only and does not constitute tax advice.
              Consult a qualified Canadian tax professional (CPA) for advice specific to your situation.
              Tax laws change — always verify with the{" "}
              <a
                href="https://www.canada.ca/en/revenue-agency.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
              >
                CRA website <ExternalLink className="h-3 w-3" />
              </a>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
