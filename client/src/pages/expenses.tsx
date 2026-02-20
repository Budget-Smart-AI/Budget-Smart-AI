import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { Plus, Pencil, Trash2, CreditCard, ChevronLeft, ChevronRight, Upload, Download, FileSpreadsheet, Search, Filter, ArrowUpDown } from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EXPENSE_CATEGORIES, type Expense } from "@shared/schema";

const expenseFormSchema = z.object({
  merchant: z.string().min(1, "Merchant is required"),
  amount: z.string().min(1, "Amount is required"),
  date: z.string().min(1, "Date is required"),
  category: z.enum(EXPENSE_CATEGORIES),
  notes: z.string().optional(),
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

type SortConfig = {
  key: keyof Expense;
  direction: "asc" | "desc";
};

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function ExpenseForm({
  expense,
  onClose,
}: {
  expense?: Expense;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!expense;

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      merchant: expense?.merchant || "",
      amount: expense?.amount || "",
      date: expense?.date || format(new Date(), "yyyy-MM-dd"),
      category: (expense?.category as typeof EXPENSE_CATEGORIES[number]) || "Other",
      notes: expense?.notes || "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: ExpenseFormValues) => {
      return apiRequest("POST", "/api/expenses", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({ title: "Expense added successfully" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to add expense", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: ExpenseFormValues) => {
      return apiRequest("PATCH", `/api/expenses/${expense?.id}`, values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({ title: "Expense updated successfully" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to update expense", variant: "destructive" });
    },
  });

  const onSubmit = (values: ExpenseFormValues) => {
    if (isEditing) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="merchant"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Merchant</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., Amazon, Whole Foods"
                  {...field}
                  data-testid="input-expense-merchant"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    {...field}
                    data-testid="input-expense-amount"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    {...field}
                    data-testid="input-expense-date"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-expense-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Any additional notes..."
                  className="resize-none"
                  {...field}
                  data-testid="input-expense-notes"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-expense">
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} data-testid="button-save-expense">
            {isPending ? "Saving..." : isEditing ? "Update Expense" : "Add Expense"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; total: number; errors: string[] } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const csvData = event.target?.result as string;
      setImporting(true);
      setImportResult(null);
      
      try {
        const response = await apiRequest("POST", "/api/expenses/import", { csvData });
        const result = await response.json();
        setImportResult(result);
        queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
        if (result.imported > 0) {
          toast({ title: `Successfully imported ${result.imported} expenses` });
        }
      } catch (error) {
        toast({ title: "Failed to import expenses", variant: "destructive" });
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const downloadTemplate = async () => {
    try {
      const response = await fetch("/api/expenses/template");
      if (!response.ok) throw new Error("Failed to download template");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "expenses_template.csv";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({ title: "Failed to download template", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Expenses from CSV
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted p-4 rounded-lg space-y-3">
            <p className="text-sm">
              Download the CSV template, fill in your expenses, then upload the file to import them all at once.
            </p>
            <Button variant="outline" onClick={downloadTemplate} className="w-full" data-testid="button-download-expenses-template">
              <Download className="h-4 w-4 mr-2" />
              Download CSV Template
            </Button>
          </div>
          
          <div className="space-y-2">
            <p className="text-sm font-medium">Upload your CSV file:</p>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={importing}
                className="flex-1"
                data-testid="input-expenses-csv-upload"
              />
            </div>
            {importing && (
              <p className="text-sm text-muted-foreground">Importing...</p>
            )}
          </div>
          
          {importResult && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Import Results: {importResult.imported} of {importResult.total} expenses imported
              </p>
              {importResult.errors.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 max-h-32 overflow-auto">
                  <p className="text-sm font-medium text-destructive mb-1">Errors:</p>
                  {importResult.errors.map((error, i) => (
                    <p key={i} className="text-xs text-destructive">{error}</p>
                  ))}
                </div>
              )}
            </div>
          )}
          
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Categories:</strong> Groceries, Dining, Transportation, Entertainment, Shopping, Healthcare, Education, Other</p>
            <p><strong>Date format:</strong> YYYY-MM-DD (e.g., 2025-01-22)</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Expenses() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>();
  const [deletingExpense, setDeletingExpense] = useState<Expense | undefined>();
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "date", direction: "desc" });
  const { toast } = useToast();

  const { data: expenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/expenses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({ title: "Expense deleted successfully" });
      setDeletingExpense(undefined);
    },
    onError: () => {
      toast({ title: "Failed to delete expense", variant: "destructive" });
    },
  });

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingExpense(undefined);
  };

  const handleSort = (key: SortConfig["key"]) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  // Filter expenses by selected month, search, and category
  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);

  const filteredExpenses = expenses
    .filter((expense) => {
      const expenseDate = parseISO(expense.date);
      const isInMonth = expenseDate >= monthStart && expenseDate <= monthEnd;
      const matchesSearch = expense.merchant.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || expense.category === categoryFilter;
      return isInMonth && matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      let valA: any = a[sortConfig.key];
      let valB: any = b[sortConfig.key];

      if (sortConfig.key === "amount") {
        valA = parseFloat(valA);
        valB = parseFloat(valB);
      } else if (sortConfig.key === "date") {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }

      if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

  const monthTotal = filteredExpenses.reduce(
    (sum, expense) => sum + parseFloat(expense.amount),
    0
  );

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: SortConfig["key"] }) => (
    <TableHead 
      className="cursor-pointer hover:text-primary transition-colors"
      onClick={() => handleSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-expenses-title">Manual Expenses</h1>
            <HelpTooltip
              title="About Manual Expenses"
              content="Log your day-to-day spending manually. Track one-time purchases with merchant details, amounts, and categories. Use this alongside bank-imported transactions for a complete picture of your spending."
            />
          </div>
          <p className="text-muted-foreground">
            Track your one-time purchases and spending
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setIsImportDialogOpen(true)} data-testid="button-import-expenses">
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingExpense(undefined)} data-testid="button-add-expense">
                <Plus className="h-4 w-4 mr-2" />
                Add Expense
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>
                  {editingExpense ? "Edit Expense" : "Add New Expense"}
                </DialogTitle>
              </DialogHeader>
              <ExpenseForm expense={editingExpense} onClose={handleCloseDialog} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <ImportDialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Expenses
            </CardTitle>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search expenses..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-expense-search"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    <SelectValue placeholder="Category" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 border rounded-md p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
                  data-testid="button-prev-month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-medium min-w-[140px] text-center text-sm" data-testid="text-selected-month">
                  {format(selectedMonth, "MMMM yyyy")}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
                  data-testid="button-next-month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <div className="text-2xl font-bold text-primary" data-testid="text-month-total">
            {formatCurrency(monthTotal)}
            <span className="text-sm font-normal text-muted-foreground ml-2">
              total for {format(selectedMonth, "MMMM")}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-expenses">
              <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="mb-4">No expenses for {format(selectedMonth, "MMMM yyyy")}</p>
              <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-first-expense">
                <Plus className="h-4 w-4 mr-2" />
                Add an Expense
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader label="Merchant" sortKey="merchant" />
                  <SortHeader label="Category" sortKey="category" />
                  <SortHeader label="Date" sortKey="date" />
                  <SortHeader label="Amount" sortKey="amount" />
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.map((expense) => (
                  <TableRow key={expense.id} data-testid={`row-expense-${expense.id}`}>
                    <TableCell className="font-medium">
                      <div>
                        {expense.merchant}
                        {expense.notes && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {expense.notes}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{expense.category}</Badge>
                    </TableCell>
                    <TableCell>{format(parseISO(expense.date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(expense.amount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(expense)}
                          data-testid={`button-edit-expense-${expense.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingExpense(expense)}
                          data-testid={`button-delete-expense-${expense.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingExpense} onOpenChange={() => setDeletingExpense(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the expense from "{deletingExpense?.merchant}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-expense">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingExpense && deleteMutation.mutate(deletingExpense.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-expense"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
