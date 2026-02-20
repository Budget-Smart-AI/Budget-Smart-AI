import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Wallet,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Trash2,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EXPENSE_CATEGORIES, type Expense } from "@shared/schema";

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(num);
}

type SortKey = "merchant" | "category" | "date" | "amount";

export default function OtherExpenses() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "date",
    direction: "desc",
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  // Fetch all expenses
  const { data: allExpenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
  });

  // Filter to only bank-imported expenses (Other Expenses)
  const bankImportedExpenses = allExpenses.filter(
    (e) => e.notes && e.notes.includes("Imported from bank transaction")
  );

  // Filter by current month
  const monthlyExpenses = bankImportedExpenses.filter((expense) => {
    const expDate = parseISO(expense.date);
    return expDate >= monthStart && expDate <= monthEnd;
  });

  // Apply search and category filter
  const filteredExpenses = monthlyExpenses
    .filter((expense) => {
      const matchesSearch = expense.merchant.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || expense.category === categoryFilter;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      const direction = sortConfig.direction === "asc" ? 1 : -1;
      switch (sortConfig.key) {
        case "merchant":
          return a.merchant.localeCompare(b.merchant) * direction;
        case "category":
          return a.category.localeCompare(b.category) * direction;
        case "date":
          return (a.date > b.date ? 1 : -1) * direction;
        case "amount":
          return (parseFloat(a.amount) - parseFloat(b.amount)) * direction;
        default:
          return 0;
      }
    });

  const monthlyTotal = filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

  // Get unique categories from bank-imported expenses
  const usedCategories = Array.from(new Set(bankImportedExpenses.map(e => e.category)));

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/expenses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({ title: "Expense deleted" });
      setDeleteId(null);
    },
    onError: () => {
      toast({ title: "Failed to delete expense", variant: "destructive" });
    },
  });

  function SortHeader({ label, sortKey }: { label: string; sortKey: SortKey }) {
    return (
      <TableHead
        className="cursor-pointer select-none hover:bg-muted/50"
        onClick={() => {
          if (sortConfig.key === sortKey) {
            setSortConfig({ key: sortKey, direction: sortConfig.direction === "asc" ? "desc" : "asc" });
          } else {
            setSortConfig({ key: sortKey, direction: "asc" });
          }
        }}
      >
        <div className="flex items-center gap-1">
          {label}
          <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
        </div>
      </TableHead>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="h-8 w-8" />
            Other Expenses
            <HelpTooltip
              title="About Other Expenses"
              content="These are transactions automatically imported from your connected bank accounts. They're separated from manual expenses to give you a clear view of bank-sourced spending that you can review and categorize."
            />
          </h1>
          <p className="text-muted-foreground mt-1">
            Bank transactions not matched to bills or recurring expenses (restaurants, gas, services, etc.)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center">
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(monthlyTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredExpenses.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usedCategories.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search merchants..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {EXPENSE_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : filteredExpenses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Other Expenses</h3>
            <p className="text-muted-foreground">
              {bankImportedExpenses.length === 0
                ? "Transactions reconciled as \"Other Expenses\" from your bank account will appear here."
                : "No expenses match your current filters for this month."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader label="Merchant" sortKey="merchant" />
                <SortHeader label="Category" sortKey="category" />
                <SortHeader label="Date" sortKey="date" />
                <SortHeader label="Amount" sortKey="amount" />
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="font-medium">{expense.merchant}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{expense.category}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{expense.date}</TableCell>
                  <TableCell className="font-medium text-red-600">
                    {formatCurrency(expense.amount)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteId(expense.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this expense entry. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
