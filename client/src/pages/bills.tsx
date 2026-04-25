// FEATURE: BILL_TRACKING | tier: free | limit: unlimited
// FEATURE: BILL_REMINDERS | tier: free | limit: unlimited
import { useState, useEffect, useRef } from "react";
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
import { Plus, Pencil, Trash2, Receipt, X, CalendarPlus, Upload, Download, FileSpreadsheet, Search, Filter, ArrowUpDown, FileDown, Sparkles, Loader2, CheckCircle2, ChevronDown, ChevronUp, DollarSign, TrendingUp, Calendar } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format, setDate, addMonths, isBefore, addDays, addWeeks, getDay, setDay, parseISO, differenceInDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BILL_CATEGORIES, RECURRENCE_OPTIONS, type Bill } from "@shared/schema";
import {
  useCategoryMap,
  getCategoryDisplayName,
} from "@/lib/canonical-categories";
import { useFeatureUsage } from "@/contexts/FeatureUsageContext";
import { AlertTriangle, Crown } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import SubscriptionsContent from "@/pages/subscriptions";

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const billFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  amount: z.string().min(1, "Amount is required"),
  category: z.enum(BILL_CATEGORIES),
  dueDay: z.number().min(0).max(31),
  recurrence: z.enum(RECURRENCE_OPTIONS),
  customDates: z.string().nullable().optional(),
  notes: z.string().optional(),
  startingBalance: z.string().nullable().optional(),
  paymentsRemaining: z.number().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

type BillFormValues = z.infer<typeof billFormSchema>;

type SortConfig = {
  key: keyof Bill | "nextDue";
  direction: "asc" | "desc";
};

// Extended bill type with payment status from /api/bills/payment-status
type BillWithPaymentStatus = Bill & {
  isPaidThisMonth: boolean;
  lastPayment: { amount: string; paidDate: string; status: string } | null;
  currentMonth: string;
};

// Payment history record from /api/bills/:id/payments
type BillPaymentRecord = {
  id: string;
  billId: string;
  transactionId: string | null;
  amount: string;
  paidDate: string;
  month: string;
  status: string;
  createdAt: string;
};

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

// NOTE: getNextDueDate logic has been moved to the centralized financial engine
// The engine API now handles all due date calculations

// Payment status badge component
function PaymentStatusBadge({
  bill,
  nextDue,
}: {
  bill: BillWithPaymentStatus;
  nextDue: Date;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (bill.isPaidThisMonth && bill.lastPayment) {
    const paidDate = parseISO(bill.lastPayment.paidDate);
    return (
      <div className="flex flex-col gap-0.5">
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800 w-fit">
          â Paid
        </Badge>
        <span className="text-xs text-muted-foreground">
          {formatCurrency(bill.lastPayment.amount)} on {format(paidDate, "MMM d")}
        </span>
      </div>
    );
  }

  if (isBefore(nextDue, today)) {
    return (
      <Badge variant="destructive" className="w-fit">
        Overdue
      </Badge>
    );
  }

  const daysUntilDue = differenceInDays(nextDue, today);

  if (daysUntilDue <= 7) {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800 w-fit">
          Due in {daysUntilDue}d
        </Badge>
      </div>
    );
  }

  return (
    <Badge variant="secondary" className="w-fit text-muted-foreground">
      Upcoming
    </Badge>
  );
}

// Payment history sub-row component
function BillPaymentHistory({ billId }: { billId: string }) {
  const { data: payments = [], isLoading } = useQuery<BillPaymentRecord[]>({
    queryKey: [`/api/bills/${billId}/payments`],
  });

  if (isLoading) {
    return (
      <div className="px-4 py-3 bg-muted/30 border-t">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading payment history...
        </div>
      </div>
    );
  }

  const recentPayments = payments.slice(0, 6);

  return (
    <div className="px-4 py-3 bg-muted/30 border-t">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Payment History (Last 6 Months)
      </p>
      {recentPayments.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No payment records found.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {recentPayments.map((payment) => {
            const paidDate = parseISO(payment.paidDate);
            return (
              <div
                key={payment.id}
                className="flex items-center gap-1.5 bg-background border rounded-md px-2.5 py-1.5 text-xs"
              >
                <span className="text-green-600 dark:text-green-400 font-medium">â</span>
                <span className="font-medium">{format(paidDate, "MMM d, yyyy")}</span>
                <span className="text-muted-foreground">â</span>
                <span className="font-semibold">{formatCurrency(payment.amount)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BillForm({
  bill,
  onClose,
}: {
  bill?: Bill;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!bill;
  const [customDateInput, setCustomDateInput] = useState("");

  const form = useForm<BillFormValues>({
    resolver: zodResolver(billFormSchema),
    defaultValues: {
      name: bill?.name || "",
      amount: bill?.amount || "",
      category: (bill?.category as typeof BILL_CATEGORIES[number]) || "Other",
      dueDay: bill?.dueDay || 1,
      recurrence: (bill?.recurrence as typeof RECURRENCE_OPTIONS[number]) || "monthly",
      customDates: bill?.customDates || null,
      notes: bill?.notes || "",
      startingBalance: bill?.startingBalance || null,
      paymentsRemaining: bill?.paymentsRemaining || null,
      startDate: bill?.startDate || null,
      endDate: bill?.endDate || null,
    },
  });

  const recurrence = form.watch("recurrence");
  const customDates = form.watch("customDates");

  const parsedCustomDates: string[] = customDates ? JSON.parse(customDates) : [];

  const addCustomDate = () => {
    if (!customDateInput) return;
    const newDates = [...parsedCustomDates, customDateInput].sort();
    form.setValue("customDates", JSON.stringify(newDates));
    setCustomDateInput("");
  };

  const removeCustomDate = (dateToRemove: string) => {
    const newDates = parsedCustomDates.filter(d => d !== dateToRemove);
    form.setValue("customDates", newDates.length > 0 ? JSON.stringify(newDates) : null);
  };

  const createMutation = useMutation({
    mutationFn: async (values: BillFormValues) => {
      return apiRequest("POST", "/api/bills", { ...values, detectionSource: "manual" as const });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills/payment-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/engine/bills"] });
      toast({ title: "Bill created successfully" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to create bill", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: BillFormValues) => {
      return apiRequest("PATCH", `/api/bills/${bill?.id}`, values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills/payment-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/engine/bills"] });
      toast({ title: "Bill updated successfully" });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to update bill", variant: "destructive" });
    },
  });

  const onSubmit = (values: BillFormValues) => {
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
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bill Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., Netflix Subscription"
                  {...field}
                  data-testid="input-bill-name"
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
                    data-testid="input-bill-amount"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-bill-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {BILL_CATEGORIES.map((category) => (
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
        </div>

        <FormField
          control={form.control}
          name="recurrence"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Recurrence</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-bill-recurrence">
                    <SelectValue placeholder="Select recurrence" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "one_time" ? "One Time" : option.charAt(0).toUpperCase() + option.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Day selector - changes based on recurrence type */}
        {recurrence === "weekly" && (
          <FormField
            control={form.control}
            name="dueDay"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Day of Week</FormLabel>
                <Select
                  onValueChange={(val) => field.onChange(parseInt(val))}
                  defaultValue={String(field.value)}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-bill-day-of-week">
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((day) => (
                      <SelectItem key={day.value} value={String(day.value)}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}


        {recurrence === "one_time" && (
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Due Date</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    {...field}
                    value={field.value || ""}
                    onChange={(e) => field.onChange(e.target.value || null)}
                    data-testid="input-bill-one-time-date"
                  />
                </FormControl>
                <p className="text-sm text-muted-foreground">
                  When this one-time payment is due
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {recurrence === "custom" && (
          <div className="space-y-3">
            <FormLabel>Custom Payment Dates</FormLabel>
            <div className="flex gap-2">
              <Input
                type="date"
                value={customDateInput}
                onChange={(e) => setCustomDateInput(e.target.value)}
                className="flex-1"
                data-testid="input-custom-date"
              />
              <Button
                type="button"
                variant="outline"
                onClick={addCustomDate}
                disabled={!customDateInput}
                data-testid="button-add-custom-date"
              >
                <CalendarPlus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            {parsedCustomDates.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {parsedCustomDates.map((date) => (
                  <Badge key={date} variant="secondary" className="flex items-center gap-1">
                    {format(parseISO(date), "MMM d, yyyy")}
                    <button
                      type="button"
                      onClick={() => removeCustomDate(date)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {parsedCustomDates.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Add specific dates when this bill is due
              </p>
            )}
          </div>
        )}

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
                  data-testid="input-bill-notes"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startingBalance"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Starting Balance ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 5000.00"
                    {...field}
                    value={field.value || ""}
                    onChange={(e) => field.onChange(e.target.value || null)}
                    data-testid="input-bill-starting-balance"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="paymentsRemaining"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payments Remaining</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="Leave empty for indefinite"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                    data-testid="input-bill-payments-remaining"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {recurrence !== "one_time" && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                        data-testid="input-bill-start-date"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      When the bill starts
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                        data-testid="input-bill-end-date"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      When the bill ends
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <p className="text-sm text-muted-foreground -mt-2">
              Use End Date OR Payments Remaining to indicate when a recurring bill ends (e.g., car loan, phone financing).
            </p>
          </>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-bill">
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} data-testid="button-save-bill">
            {isPending ? "Saving..." : isEditing ? "Update Bill" : "Add Bill"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function ImportDialog({
  open,
  onOpenChange,
  downloadTemplate
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  downloadTemplate: () => void;
}) {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; total: number; errors: string[] } | null>(null);
  const [pendingCsvData, setPendingCsvData] = useState<string | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const csvData = event.target?.result as string;
      setPendingCsvData(csvData);
      setShowImportConfirm(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const executeImport = async (mode: "replace" | "add") => {
    if (!pendingCsvData) return;

    setShowImportConfirm(false);
    setImporting(true);
    setImportResult(null);

    try {
      const response = await apiRequest("POST", "/api/bills/import", {
        csvData: pendingCsvData,
        mode
      });
      const result = await response.json();
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills/payment-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/engine/bills"] });
      if (result.imported > 0) {
        toast({ title: `Successfully imported ${result.imported} bills` });
      }
    } catch (error) {
      toast({ title: "Failed to import bills", variant: "destructive" });
    } finally {
      setImporting(false);
      setPendingCsvData(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import Bills from CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg space-y-3">
              <p className="text-sm">
                Download the CSV template, fill in your bills, then upload the file to import them all at once.
              </p>
              <Button variant="outline" onClick={downloadTemplate} className="w-full" data-testid="button-download-template-dialog">
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
                  data-testid="input-csv-upload"
                />
              </div>
              {importing && (
                <p className="text-sm text-muted-foreground">Importing...</p>
              )}
            </div>

            {importResult && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Import Results: {importResult.imported} of {importResult.total} bills imported
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
              <p><strong>Categories:</strong> {BILL_CATEGORIES.join(", ")}</p>
              <p><strong>Recurrence:</strong> weekly, biweekly, monthly, yearly, custom, one_time</p>
              <p><strong>dueDay:</strong> 1-31 for monthly/yearly, 0-6 (Sun-Sat) for weekly</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showImportConfirm} onOpenChange={setShowImportConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>How would you like to import?</AlertDialogTitle>
            <AlertDialogDescription>
              Choose how to handle the imported bills:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-4">
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-3"
              onClick={() => executeImport("add")}
              data-testid="button-import-add"
            >
              <div className="text-left">
                <div className="font-medium">Add to existing bills</div>
                <div className="text-sm text-muted-foreground">Keep your current bills and add the imported ones</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-3 border-destructive/50 hover:bg-destructive/10"
              onClick={() => executeImport("replace")}
              data-testid="button-import-replace"
            >
              <div className="text-left">
                <div className="font-medium text-destructive">Replace all bills</div>
                <div className="text-sm text-muted-foreground">Delete all existing bills and replace with imported ones</div>
              </div>
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-import">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function Bills() {
  // §6.2.7-prep Phase C: canonical-aware category map for bill row badges.
  const categoryMap = useCategoryMap();

  const [activeTab, setActiveTab] = useState("bills");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isDetectDialogOpen, setIsDetectDialogOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | undefined>();
  const [deletingBill, setDeletingBill] = useState<Bill | undefined>();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "nextDue", direction: "asc" });
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
  const { toast } = useToast();
  const { getFeatureState } = useFeatureUsage();

  // Detect bills state
  const [detectedBills, setDetectedBills] = useState<any[]>([]);
  const [selectedDetected, setSelectedDetected] = useState<Set<number>>(new Set());
  const [isDetecting, setIsDetecting] = useState(false);
  const [isAddingDetected, setIsAddingDetected] = useState(false);

  const detectBills = async () => {
    setIsDetecting(true);
    setDetectedBills([]);
    setSelectedDetected(new Set());
    setIsDetectDialogOpen(true); // Open dialog immediately to show loading state
    try {
      const response = await apiRequest("POST", "/api/bills/detect");
      const data = await response.json();
      setDetectedBills(data.suggestions || []);
      // Auto-select high confidence bills
      const highConfidence = new Set<number>();
      data.suggestions?.forEach((s: any, i: number) => {
        if (s.confidenceLabel === "high") highConfidence.add(i);
      });
      setSelectedDetected(highConfidence);
    } catch (error) {
      toast({ title: "Failed to detect bills", variant: "destructive" });
      setIsDetectDialogOpen(false);
    } finally {
      setIsDetecting(false);
    }
  };

  const toggleDetectedBill = (index: number) => {
    setSelectedDetected(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const addSelectedBills = async () => {
    if (selectedDetected.size === 0) return;
    setIsAddingDetected(true);
    let addedCount = 0;
    let limitHit = false;
    try {
      const billsToAdd = Array.from(selectedDetected).map(i => detectedBills[i]);
      for (const bill of billsToAdd) {
        const response = await apiRequest("POST", "/api/bills", {
          name: bill.name,
          amount: bill.amount,
          category: bill.category,
          dueDay: bill.dueDay,
          recurrence: bill.recurrence,
          // Use the actual first detected charge as startDate (not today) so the UI
          // can compute correct "Next Due" countdowns from startDate + recurrence.
          startDate: (bill as any).startDate || (bill as any).lastChargeDate || undefined,
          notes: `Auto-detected from bank transactions`,
          autoDetected: true,
          detectedAt: new Date().toISOString(),
          detectionSource: "plaid" as const,
          detectionRef: (bill as any).plaidStreamId ?? null,
          detectionRefType: (bill as any).plaidStreamId ? "plaid_stream_id" as const : null,
          detectionConfidence: (bill as any).confidence ?? null,
        });
        if (response.status === 402) {
          limitHit = true;
          break;
        }
        addedCount++;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills/payment-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/engine/bills"] });
      if (addedCount > 0) {
        toast({ title: `Added ${addedCount} bill${addedCount !== 1 ? "s" : ""}` });
      }
      if (limitHit) {
        toast({
          title: `Bill limit reached`,
          description: `Added ${addedCount} bill${addedCount !== 1 ? "s" : ""}. Upgrade to Pro to add unlimited bills.`,
          variant: "destructive",
        });
      }
      setIsDetectDialogOpen(false);
      setDetectedBills([]);
      setSelectedDetected(new Set());
    } catch (error) {
      toast({ title: "Failed to add bills", variant: "destructive" });
    } finally {
      setIsAddingDetected(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await apiRequest("GET", "/api/bills/template");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bills_template.csv";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({ title: "Failed to download template", variant: "destructive" });
    }
  };

  const exportBills = async () => {
    try {
      const response = await apiRequest("GET", "/api/bills/export");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bills_export_${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: "Bills exported successfully" });
    } catch (error) {
      toast({ title: "Failed to export bills", variant: "destructive" });
    }
  };

  // Use payment-status endpoint which returns bills enriched with isPaidThisMonth + lastPayment
  const { data: bills = [], isLoading } = useQuery<BillWithPaymentStatus[]>({
    queryKey: ["/api/bills/payment-status"],
  });

  // Fetch engine-computed bill summaries (monthly/annual estimates, upcoming bills, next due dates)
  const { data: engineBills } = useQuery<{
    thisMonthBills: Array<{ billId: string; billName: string; amount: number; category: string; dueDate: string; recurrence: string; isPaused: boolean }>;
    thisMonthTotal: number;
    upcomingBills: Array<{ billId: string; billName: string; amount: number; dueDate: string; daysUntil: number; recurrence: string; isPaused: boolean }>;
    monthlyEstimate: number;
    annualEstimate: number;
    byRecurrence: Record<string, number>;
  }>({
    queryKey: ["/api/engine/bills"],
  });

  // Build a lookup from billId â engine-computed next due date
  const engineDueDateMap = new Map<string, string>();
  if (engineBills?.upcomingBills) {
    for (const ub of engineBills.upcomingBills) {
      engineDueDateMap.set(ub.billId, ub.dueDate);
    }
  }
  if (engineBills?.thisMonthBills) {
    for (const mb of engineBills.thisMonthBills) {
      if (!engineDueDateMap.has(mb.billId)) {
        engineDueDateMap.set(mb.billId, mb.dueDate);
      }
    }
  }

  // Auto-detect bills when page loads with 0 bills.
  // If user has Plaid-linked accounts but no bills, automatically run
  // detection and import high-confidence results (mirrors Monarch behaviour).
  const autoDetectRan = useRef(false);
  useEffect(() => {
    if (isLoading || autoDetectRan.current) return;
    if (bills.length > 0) return;
    autoDetectRan.current = true;

    (async () => {
      try {
        const response = await apiRequest("POST", "/api/bills/detect");
        const data = await response.json();
        const suggestions = data.suggestions || [];
        if (suggestions.length === 0) return;

        const toImport = suggestions.filter((s) => s.confidence >= 0.7);
        if (toImport.length === 0) return;

        let addedCount = 0;
        for (const s of toImport) {
          try {
            await apiRequest("POST", "/api/bills", {
              name: s.name || s.merchant,
              amount: String(s.amount),
              dueDay: String(s.dueDay || 1),
              recurrence: s.recurrence || s.frequency || "monthly",
              category: s.category || "Bills & Utilities",
              autoPay: "false",
              isPaused: "false",
              notes: "Auto-detected (" + Math.round(s.confidence * 100) + "% confidence)",
              autoDetected: true,
              detectedAt: new Date().toISOString(),
              detectionSource: "plaid" as const,
              detectionRef: s.plaidStreamId ?? null,
              detectionRefType: s.plaidStreamId ? "plaid_stream_id" as const : null,
              detectionConfidence: s.confidence != null ? String(s.confidence) : null,
            });
            addedCount++;
          } catch { /* skip */ }
        }

        if (addedCount > 0) {
          queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
          queryClient.invalidateQueries({ queryKey: ["/api/bills/payment-status"] });
          queryClient.invalidateQueries({ queryKey: ["/api/engine/bills"] });
          toast({
            title: "Auto-detected " + addedCount + " recurring bill" + (addedCount !== 1 ? "s" : ""),
            description: "Bills were imported from your transaction history.",
          });
        }
      } catch { /* Silent */ }
    })();
  }, [isLoading, bills.length]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/bills/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills/payment-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/engine/bills"] });
      toast({ title: "Bill deleted successfully" });
      setDeletingBill(undefined);
    },
    onError: () => {
      toast({ title: "Failed to delete bill", variant: "destructive" });
    },
  });

  const handleEdit = (bill: Bill) => {
    setEditingBill(bill);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingBill(undefined);
  };

  const handleSort = (key: SortConfig["key"]) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const toggleExpanded = (billId: string) => {
    setExpandedBillId(prev => prev === billId ? null : billId);
  };

  const filteredBills = bills
    .filter((bill) => {
      const matchesSearch = bill.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || bill.category === categoryFilter;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      let valA: any, valB: any;

      if (sortConfig.key === "nextDue") {
        // Use engine-computed due dates for sorting when available
        const aDueStr = engineDueDateMap.get(a.id);
        const bDueStr = engineDueDateMap.get(b.id);
        const aDate = aDueStr ? parseISO(aDueStr) : (a.startDate ? new Date(a.startDate) : new Date());
        const bDate = bDueStr ? parseISO(bDueStr) : (b.startDate ? new Date(b.startDate) : new Date());

        valA = aDate.getTime();
        valB = bDate.getTime();
      } else {
        valA = a[sortConfig.key as keyof Bill];
        valB = b[sortConfig.key as keyof Bill];

        if (sortConfig.key === "amount" || sortConfig.key === "startingBalance") {
          valA = parseFloat(valA || "0");
          valB = parseFloat(valB || "0");
        }
      }

      if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

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
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-bills-title">Bills & Subscriptions</h1>
            <HelpTooltip
              title="About Bills"
              content="Bills are meant for scheduled, recurring payments that match what you've set up in your banking platform - things like rent, utilities, insurance, and loan payments. Budget Smart AI tracks due dates and sends you reminders before payments are due."
            />
          </div>
          <p className="text-muted-foreground">
            Manage your recurring bills and subscriptions
          </p>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="bills">Bills</TabsTrigger>
            <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          </TabsList>
        </Tabs>
        {activeTab === "subscriptions" ? (
          <SubscriptionsContent />
        ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={detectBills} disabled={isDetecting} data-testid="button-detect-bills">
            {isDetecting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Detect Bills
          </Button>
          <Button variant="outline" onClick={downloadTemplate} data-testid="button-download-template">
            <Download className="h-4 w-4 mr-2" />
            Template
          </Button>
          <Button variant="outline" onClick={() => setIsImportDialogOpen(true)} data-testid="button-import-bills">
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" onClick={exportBills} data-testid="button-export-bills">
            <FileDown className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingBill(undefined)} data-testid="button-add-bill">
                <Plus className="h-4 w-4 mr-2" />
                Add Bill
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>
                  {editingBill ? "Edit Bill" : "Add New Bill"}
                </DialogTitle>
              </DialogHeader>
              <BillForm bill={editingBill} onClose={handleCloseDialog} />
            </DialogContent>
          </Dialog>
        </div>
        )}
      </div>

      <ImportDialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen} downloadTemplate={downloadTemplate} />

      {/* Engine-powered summary cards */}
      {engineBills && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Card variant="glass">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <DollarSign className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">This Month</p>
                  <p className="text-lg font-bold" data-testid="text-this-month-total">
                    {formatCurrency(engineBills.thisMonthTotal)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card variant="glass">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-blue-500/10">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Monthly Estimate</p>
                  <p className="text-lg font-bold" data-testid="text-monthly-estimate">
                    {formatCurrency(engineBills.monthlyEstimate)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card variant="glass">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-amber-500/10">
                  <Calendar className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Annual Estimate</p>
                  <p className="text-lg font-bold" data-testid="text-annual-estimate">
                    {formatCurrency(engineBills.annualEstimate)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card variant="glass">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-green-500/10">
                  <Receipt className="w-4 h-4 text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Upcoming (30 days)</p>
                  <p className="text-lg font-bold" data-testid="text-upcoming-count">
                    {engineBills.upcomingBills?.length || 0} bills
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detect Bills Dialog */}
      <Dialog open={isDetectDialogOpen} onOpenChange={(open) => !isDetecting && setIsDetectDialogOpen(open)}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Detected Recurring Bills
            </DialogTitle>
          </DialogHeader>
          {isDetecting ? (
            <div className="text-center py-12">
              <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin mb-4" />
              <p className="text-muted-foreground font-medium">Analyzing your transactions...</p>
              <p className="text-sm text-muted-foreground mt-2">
                Checking Plaid recurring transactions and using AI to find billing patterns.
              </p>
            </div>
          ) : detectedBills.length === 0 ? (
            <div className="text-center py-8">
              <Receipt className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No new recurring bills detected.</p>
              <p className="text-sm text-muted-foreground mt-1">
                All detected bills are already in your list, or we couldn't find recurring patterns.
              </p>
            </div>
          ) : (
            <>
              {/* Plan limit banner */}
              {(() => {
                const billState = getFeatureState("bill_tracking");
                if (!billState) return null;
                const { remaining, limit, allowed } = billState;

                if (!allowed || remaining === 0) {
                  return (
                    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                      <Crown className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-amber-300">Bill limit reached</p>
                        <p className="text-xs text-amber-200/80 mt-0.5">
                          You've used all {limit} free bills. Upgrade to Pro to add unlimited bills.
                        </p>
                        <button
                          className="mt-1.5 text-xs font-semibold text-amber-300 underline underline-offset-2 hover:text-amber-200"
                          onClick={() => { setIsDetectDialogOpen(false); window.location.href = "/upgrade"; }}
                        >
                          Upgrade to Pro â
                        </button>
                      </div>
                    </div>
                  );
                }

                if (remaining !== null && remaining < selectedDetected.size) {
                  return (
                    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-amber-300">
                          You can only add {remaining} more bill{remaining !== 1 ? "s" : ""} on your current plan
                        </p>
                        <p className="text-xs text-amber-200/80 mt-0.5">
                          You have {remaining} of {limit} bill slot{remaining !== 1 ? "s" : ""} remaining.
                          Only the first {remaining} selected will be added.{" "}
                          <button
                            className="font-semibold underline underline-offset-2 hover:text-amber-200"
                            onClick={() => { setIsDetectDialogOpen(false); window.location.href = "/upgrade"; }}
                          >
                            Upgrade to Pro for unlimited bills â
                          </button>
                        </p>
                      </div>
                    </div>
                  );
                }

                if (remaining !== null && remaining <= 2 && remaining > 0) {
                  return (
                    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/8 px-4 py-3">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                      <p className="text-xs text-amber-300">
                        â¡ Only {remaining} bill slot{remaining !== 1 ? "s" : ""} remaining on your free plan.{" "}
                        <button
                          className="font-semibold underline underline-offset-2 hover:text-amber-200"
                          onClick={() => { setIsDetectDialogOpen(false); window.location.href = "/upgrade"; }}
                        >
                          Upgrade to Pro â
                        </button>
                      </p>
                    </div>
                  );
                }

                return null;
              })()}
              <p className="text-sm text-muted-foreground mb-4">
                We found {detectedBills.length} recurring payment{detectedBills.length > 1 ? "s" : ""} in your transactions.
                Select which ones to add as bills.
              </p>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {detectedBills.map((bill, index) => (
                  <div
                    key={index}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedDetected.has(index) ? "bg-primary/5 border-primary" : "hover:bg-muted/50"
                    }`}
                    onClick={() => toggleDetectedBill(index)}
                  >
                    <Checkbox
                      checked={selectedDetected.has(index)}
                      onCheckedChange={() => toggleDetectedBill(index)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{bill.name}</span>
                        {bill.confidenceLabel === "high" && (
                          <Badge variant="secondary" className="text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            High confidence
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{formatCurrency(bill.amount)}</span>
                        <span>â¢</span>
                        <span>{bill.recurrence}</span>
                        <span>â¢</span>
                        <Badge variant="outline" className="text-xs">{bill.category}</Badge>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {Math.round((bill.confidence ?? 0) * 100)}% confident
                    </span>
                  </div>
                ))}
              </div>
              {(() => {
                const billState = getFeatureState("bill_tracking");
                const remaining = billState?.remaining ?? null;
                const isAtLimit = billState ? !billState.allowed || billState.remaining === 0 : false;
                const effectiveCount = remaining !== null
                  ? Math.min(selectedDetected.size, remaining)
                  : selectedDetected.size;

                return (
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm text-muted-foreground">
                        {selectedDetected.size} of {detectedBills.length} selected
                      </span>
                      {remaining !== null && remaining < selectedDetected.size && !isAtLimit && (
                        <span className="text-xs text-amber-400">
                          Only {effectiveCount} will be added (plan limit)
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setIsDetectDialogOpen(false)}>
                        Cancel
                      </Button>
                      {isAtLimit ? (
                        <Button
                          className="bg-gradient-to-r from-amber-500 to-yellow-500 text-black hover:from-amber-400 hover:to-yellow-400 font-semibold"
                          onClick={() => { setIsDetectDialogOpen(false); window.location.href = "/upgrade"; }}
                        >
                          <Crown className="h-4 w-4 mr-2" />
                          Upgrade to Add More
                        </Button>
                      ) : (
                        <Button
                          onClick={addSelectedBills}
                          disabled={selectedDetected.size === 0 || isAddingDetected}
                        >
                          {isAddingDetected ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4 mr-2" />
                          )}
                          Add {effectiveCount} Bill{effectiveCount !== 1 ? "s" : ""}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Card variant="glass">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              All Bills
            </CardTitle>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search bills..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-bill-search"
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
                  {BILL_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        {/*
         * 2026-04-22 horizontal-scroll fix:
         * 10-column bill table (Name / Category / Start Date / Next Due /
         * Recurrence / Amount / Balance / Payments Left / Status / Actions)
         * overflows at 90-100% zoom. Same treatment as expenses.tsx and
         * bank-accounts.tsx: drop CardContent horizontal padding to 0 on
         * mobile / 16px on sm+, and tighten cell padding on the Table.
         */}
        <CardContent className="px-0 sm:px-4 pb-4 sm:pb-6">
          {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredBills.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-no-bills">
                <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="mb-4">No bills found</p>
                <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-first-bill">
                  <Plus className="h-4 w-4 mr-2" />
                  Add your first bill
                </Button>
              </div>
            ) : (
              // Same tightening as Expenses/Accounts: `h-10 px-3` on TableHead,
              // `px-3 py-2.5` on TableCell. With 10 columns, the ~8px saved per
              // column recovers ~80px — enough to kill the scrollbar at 100%.
              <Table className="[&_th]:h-10 [&_th]:px-3 [&_td]:px-3 [&_td]:py-2.5">
                <TableHeader>
                  <TableRow>
                    <SortHeader label="Name" sortKey="name" />
                    <SortHeader label="Category" sortKey="category" />
                    <SortHeader label="Start Date" sortKey="startDate" />
                    <SortHeader label="Next Due" sortKey="nextDue" />
                    <TableHead>Recurrence</TableHead>
                    <SortHeader label="Amount" sortKey="amount" />
                    <SortHeader label="Balance" sortKey="startingBalance" />
                    <SortHeader label="Payments Left" sortKey="paymentsRemaining" />
                    <TableHead>Status</TableHead>
                    {/* 120px → 100px: three icon-only buttons at h-7 w-7 + gap-0.5 fit */}
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBills.map((bill) => {
                    // Use engine-computed due date when available, otherwise fall back to startDate
                    const engineDueDate = engineDueDateMap.get(bill.id);
                    const nextDue = engineDueDate ? parseISO(engineDueDate) : (bill.startDate ? parseISO(bill.startDate) : new Date());
                    const isExpanded = expandedBillId === bill.id;
                    return (
                      <>
                        <TableRow key={bill.id} data-testid={`row-bill-${bill.id}`} className="group">
                          <TableCell className="font-medium">
                            {/* max-w-[180px] on name + notes: prevents Name column from
                             * dominating when a bill has a long title */}
                            <div className="min-w-0 max-w-[180px]">
                              <p className="truncate">{bill.name}</p>
                              {bill.notes && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {bill.notes}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {/* §6.2.7-prep Phase C: canonical-aware display name */}
                            <Badge variant="secondary">{getCategoryDisplayName(bill as any, categoryMap)}</Badge>
                          </TableCell>
                          <TableCell>
                            {bill.startDate ? format(parseISO(bill.startDate), "MMM d, yyyy") : "-"}
                          </TableCell>
                          <TableCell>
                            <span className={isBefore(nextDue, new Date()) && !bill.isPaidThisMonth ? "text-destructive font-semibold" : ""}>
                              {format(nextDue, "MMM d, yyyy")}
                            </span>
                          </TableCell>
                          <TableCell className="capitalize">{bill.recurrence === "one_time" ? "One Time" : bill.recurrence}</TableCell>
                          <TableCell className="font-semibold">
                            {formatCurrency(bill.amount)}
                          </TableCell>
                          <TableCell>
                            {bill.startingBalance ? formatCurrency(bill.startingBalance) : "-"}
                          </TableCell>
                          <TableCell>
                            {bill.paymentsRemaining !== null ? bill.paymentsRemaining : "-"}
                          </TableCell>
                          <TableCell>
                            <PaymentStatusBadge bill={bill} nextDue={nextDue} />
                          </TableCell>
                          <TableCell>
                            {/* icon buttons: default h-9 w-9 → h-7 w-7 to match new tighter row height */}
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => toggleExpanded(bill.id)}
                                title={isExpanded ? "Hide payment history" : "Show payment history"}
                                data-testid={`button-expand-bill-${bill.id}`}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleEdit(bill)}
                                data-testid={`button-edit-bill-${bill.id}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setDeletingBill(bill)}
                                data-testid={`button-delete-bill-${bill.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${bill.id}-history`} className="hover:bg-transparent">
                            <TableCell colSpan={10} className="p-0">
                              <BillPaymentHistory billId={bill.id} />
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            )}

          {/* Inline limit banner â shown below the bills list when at/near the limit */}
          {(() => {
            const billState = getFeatureState("bill_tracking");
            if (!billState || billState.limit === null) return null;
            const { allowed, limit, remaining } = billState;
            if (allowed && remaining !== null && remaining > 2) return null;

            if (!allowed || remaining === 0) {
              return (
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                  <Crown className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-300">
                      You've reached the {limit} bill limit on Free.
                    </p>
                    <p className="text-xs text-amber-200/80 mt-0.5">
                      Upgrade to Pro for unlimited bills.{" "}
                      <a href="/upgrade" className="font-semibold underline underline-offset-2 hover:text-amber-200">
                        Upgrade to Pro â
                      </a>
                    </p>
                  </div>
                </div>
              );
            }

            if (remaining !== null && remaining <= 2) {
              return (
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/8 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  <p className="text-xs text-amber-300">
                    â¡ Only {remaining} bill slot{remaining !== 1 ? "s" : ""} remaining on your free plan.{" "}
                    <a href="/upgrade" className="font-semibold underline underline-offset-2 hover:text-amber-200">
                      Upgrade to Pro for unlimited bills â
                    </a>
                  </p>
                </div>
              );
            }

            return null;
          })()}
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingBill} onOpenChange={() => setDeletingBill(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingBill?.name}"? This will stop all future reminders for this bill.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-bill">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingBill && deleteMutation.mutate(deletingBill.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-bill"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
