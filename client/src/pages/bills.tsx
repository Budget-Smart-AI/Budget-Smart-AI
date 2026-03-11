// FEATURE: BILL_TRACKING | tier: free | limit: 5 bills
// FEATURE: BILL_REMINDERS | tier: free | limit: unlimited
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
import { Plus, Pencil, Trash2, Receipt, X, CalendarPlus, Upload, Download, FileSpreadsheet, Search, Filter, ArrowUpDown, FileDown, Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format, setDate, addMonths, isBefore, addDays, addWeeks, getDay, setDay, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BILL_CATEGORIES, RECURRENCE_OPTIONS, type Bill } from "@shared/schema";
import { FeatureGate } from "@/components/FeatureGate";

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

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function getNextDueDate(dueDay: number, recurrence: string, customDates?: string | null, startDate?: string | null): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Handle one-time payments
  if (recurrence === "one_time") {
    if (startDate) {
      return parseISO(startDate);
    }
    // If no start date, use dueDay of current/next month
    let nextDue = setDate(today, dueDay);
    if (isBefore(nextDue, today)) {
      nextDue = addMonths(nextDue, 1);
    }
    return nextDue;
  }

  if (recurrence === "custom" && customDates) {
    try {
      const dates: string[] = JSON.parse(customDates);
      const futureDates = dates
        .map(d => parseISO(d))
        .filter(d => !isBefore(d, today))
        .sort((a, b) => a.getTime() - b.getTime());
      if (futureDates.length > 0) {
        return futureDates[0];
      }
      // If no future dates, return the last date
      const allDates = dates.map(d => parseISO(d)).sort((a, b) => b.getTime() - a.getTime());
      return allDates[0] || today;
    } catch {
      return today;
    }
  }

  if (recurrence === "weekly") {
    // dueDay is day of week (0-6, Sunday-Saturday)
    if (startDate) {
      const start = parseISO(startDate);
      start.setHours(0, 0, 0, 0);
      
      // Find the first occurrence of dueDay on or after start date
      let nextDue = setDay(start, dueDay, { weekStartsOn: 0 });
      // If the calculated day is before the start date, move to next week
      if (isBefore(nextDue, start)) {
        nextDue = addWeeks(nextDue, 1);
      }
      
      // If start date is in the future, find first occurrence of dueDay on/after start
      if (!isBefore(start, today)) {
        return nextDue;
      }
      
      // Start date is in the past - keep adding weeks until we get a future date
      while (isBefore(nextDue, today)) {
        nextDue = addWeeks(nextDue, 1);
      }
      return nextDue;
    }
    // No start date - use current week's occurrence of the day
    let nextDue = setDay(today, dueDay, { weekStartsOn: 0 });
    if (isBefore(nextDue, today) || nextDue.getTime() === today.getTime()) {
      nextDue = addWeeks(nextDue, 1);
    }
    return nextDue;
  }

  // For monthly, yearly, biweekly - dueDay is day of month (1-31)
  // Check if start date is provided and in the future
  if (startDate) {
    const start = parseISO(startDate);
    start.setHours(0, 0, 0, 0);
    
    if (!isBefore(start, today)) {
      // Start date is in the future - return it as the next due date
      return start;
    }
    
    // Start date is in the past - calculate next occurrence from start date
    let nextDue = start;
    
    if (recurrence === "monthly") {
      // Move forward month by month until we get a future date
      while (isBefore(nextDue, today)) {
        nextDue = addMonths(nextDue, 1);
      }
      return nextDue;
    } else if (recurrence === "yearly") {
      // Move forward year by year until we get a future date
      while (isBefore(nextDue, today)) {
        nextDue = addMonths(nextDue, 12);
      }
      return nextDue;
    } else if (recurrence === "biweekly") {
      // Move forward 14 days at a time until we get a future date
      while (isBefore(nextDue, today)) {
        nextDue = addDays(nextDue, 14);
      }
      return nextDue;
    }
  }
  
  // No start date - use dueDay of current month as starting point
  let nextDue = setDate(today, dueDay);

  if (isBefore(nextDue, today)) {
    if (recurrence === "monthly") {
      nextDue = addMonths(nextDue, 1);
    } else if (recurrence === "yearly") {
      nextDue = addMonths(nextDue, 12);
    } else if (recurrence === "biweekly") {
      // Keep adding 14 days until we get a future date
      while (isBefore(nextDue, today)) {
        nextDue = addDays(nextDue, 14);
      }
    }
  }

  return nextDue;
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
      return apiRequest("POST", "/api/bills", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
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
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isDetectDialogOpen, setIsDetectDialogOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | undefined>();
  const [deletingBill, setDeletingBill] = useState<Bill | undefined>();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "nextDue", direction: "asc" });
  const { toast } = useToast();

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
        if (s.confidence === "high") highConfidence.add(i);
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
    try {
      const billsToAdd = Array.from(selectedDetected).map(i => detectedBills[i]);
      for (const bill of billsToAdd) {
        await apiRequest("POST", "/api/bills", {
          name: bill.name,
          amount: bill.amount,
          category: bill.category,
          dueDay: bill.dueDay,
          recurrence: bill.recurrence,
          notes: `Auto-detected from ${bill.source === "plaid" ? "bank transactions" : "AI analysis"}`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({ title: `Added ${billsToAdd.length} bill${billsToAdd.length > 1 ? "s" : ""}` });
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
      const response = await fetch("/api/bills/template");
      if (!response.ok) throw new Error("Failed to download template");
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
      const response = await fetch("/api/bills/export");
      if (!response.ok) throw new Error("Failed to export bills");
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

  const { data: bills = [], isLoading } = useQuery<Bill[]>({
    queryKey: ["/api/bills"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/bills/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
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

  const filteredBills = bills
    .filter((bill) => {
      const matchesSearch = bill.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || bill.category === categoryFilter;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      let valA: any, valB: any;
      
      if (sortConfig.key === "nextDue") {
        valA = getNextDueDate(a.dueDay, a.recurrence, a.customDates, a.startDate).getTime();
        valB = getNextDueDate(b.dueDay, b.recurrence, b.customDates, b.startDate).getTime();
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
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-bills-title">Recurring Bills</h1>
            <HelpTooltip
              title="About Bills"
              content="Bills are meant for scheduled, recurring payments that match what you've set up in your banking platform - things like rent, utilities, insurance, and loan payments. Budget Smart AI tracks due dates and sends you reminders before payments are due."
            />
          </div>
          <p className="text-muted-foreground">
            Manage your recurring bills and receive reminders
          </p>
        </div>
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
              <FeatureGate feature="bill_tracking" blurIntensity="low">
                <Button onClick={() => setEditingBill(undefined)} data-testid="button-add-bill">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Bill
                </Button>
              </FeatureGate>
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
      </div>

      <ImportDialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen} downloadTemplate={downloadTemplate} />

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
                        {bill.confidence === "high" && (
                          <Badge variant="secondary" className="text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            High confidence
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{formatCurrency(bill.amount)}</span>
                        <span>•</span>
                        <span>{bill.recurrence}</span>
                        <span>•</span>
                        <Badge variant="outline" className="text-xs">{bill.category}</Badge>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {bill.source === "plaid" ? "Bank" : "AI"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-4 border-t">
                <span className="text-sm text-muted-foreground">
                  {selectedDetected.size} of {detectedBills.length} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsDetectDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={addSelectedBills}
                    disabled={selectedDetected.size === 0 || isAddingDetected}
                  >
                    {isAddingDetected ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Add {selectedDetected.size} Bill{selectedDetected.size !== 1 ? "s" : ""}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Card>
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
        <CardContent>
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
            <Table>
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
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBills.map((bill) => {
                  const nextDue = getNextDueDate(bill.dueDay, bill.recurrence, bill.customDates, bill.startDate);
                  return (
                    <TableRow key={bill.id} data-testid={`row-bill-${bill.id}`}>
                      <TableCell className="font-medium">
                        <div>
                          {bill.name}
                          {bill.notes && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {bill.notes}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{bill.category}</Badge>
                      </TableCell>
                      <TableCell>
                        {bill.startDate ? format(parseISO(bill.startDate), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell>
                        <span className={isBefore(nextDue, new Date()) ? "text-destructive font-semibold" : ""}>
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
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(bill)}
                            data-testid={`button-edit-bill-${bill.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingBill(bill)}
                            data-testid={`button-delete-bill-${bill.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
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
