// FEATURE: INCOME_TRACKING | tier: free | limit: unlimited
import { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  FormDescription,
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
import { Plus, Trash2, DollarSign, ChevronLeft, ChevronRight, Search, Filter, ArrowUpDown, Sparkles, Loader2, CheckCircle2, Calendar, X, AlertTriangle, ShieldCheck, MessageCircle, ChevronDown, ChevronUp, Wand2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, addMonths, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { INCOME_CATEGORIES, RECURRENCE_OPTIONS, type Income } from "@shared/schema";
import { canonicalizeRecurrence } from "@shared/recurrence";
import { FloatingChatbot, type TransactionContext } from "@/components/floating-chatbot";
import { DemoBanner } from "@/components/demo-banner";
import { IncomeRegistryManager } from "@/components/income-registry-manager";

const incomeFormSchema = z.object({
  source: z.string().min(1, "Source is required"),
  amount: z.string().min(1, "Amount is required"),
  category: z.enum(INCOME_CATEGORIES),
  date: z.string().min(1, "Date is required"),
  isRecurring: z.boolean().optional(),
  recurrence: z.enum(RECURRENCE_OPTIONS).nullable().optional(),
  dueDay: z.number().min(1).max(31).nullable().optional(),
  customDates: z.array(z.number()).optional(),
  notes: z.string().optional(),
});

type IncomeFormValues = z.infer<typeof incomeFormSchema>;

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

type SortConfig = {
  key: keyof Income;
  direction: "asc" | "desc";
};

interface IncomeResult {
  budgetedIncome: number;
  actualIncome: number;
  effectiveIncome: number;
  hasBankData: boolean;
  bySource: Array<{
    source: string;
    amount: number;
    category: string;
    isRecurring: boolean;
    frequency?: string;
    /** Registry id — present when the row maps to an editable income_sources row. */
    sourceId?: string;
    /** Per-paycheck unit amount from income_source_amounts. */
    unitAmount?: number;
    /** Projected total for future months (unit × occurrences). */
    expectedAmount?: number;
    /** Whether the registry can project a non-zero amount for the period. */
    hasProjection?: boolean;
    /** Registry classification mode. */
    mode?: "fixed" | "variable" | "irregular";
  }>;
}

function formatCurrency(amount: string | number) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

/**
 * Step 7 — keep this normaliser in lockstep with the server's
 * `normalizeSourceName` (server/lib/financial-engine/income.ts) and
 * the classifier copy in registry-classifier.ts. Used here purely for
 * client-side fuzzy matching of typed source names against registry rows.
 */
function normalizeSourceForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(direct dep|dir dep|payroll|deposit|payment|pay|inc|ltd|llc|corp|co)\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function IncomeForm({
  income,
  onClose,
  defaultDate,
}: {
  income?: Income;
  onClose: () => void;
  defaultDate: string;
}) {
  const { toast } = useToast();
  const isEditing = !!income;

  const parseCustomDates = (customDatesStr: string | null | undefined): number[] => {
    if (!customDatesStr) return [];
    try {
      return JSON.parse(customDatesStr) as number[];
    } catch {
      return [];
    }
  };

  const form = useForm<IncomeFormValues>({
    resolver: zodResolver(incomeFormSchema),
    defaultValues: {
      source: income?.source || "",
      amount: income?.amount || "",
      category: (income?.category as typeof INCOME_CATEGORIES[number]) || "Salary",
      date: income?.date || defaultDate,
      isRecurring: income?.isRecurring === "true",
      recurrence: (income?.recurrence as typeof RECURRENCE_OPTIONS[number]) || "monthly",
      dueDay: income?.dueDay || 1,
      customDates: parseCustomDates(income?.customDates),
      notes: income?.notes || "",
    },
  });

  const isRecurring = form.watch("isRecurring");
  const recurrence = form.watch("recurrence");
  const customDates = form.watch("customDates") || [];

  // ─── Step 7: Prefill from registry ───────────────────────────────────────
  // When ADDING a new income row (not editing), pull the user's registered
  // sources so we can:
  //   (a) offer a "Prefill from a known source" picker, and
  //   (b) auto-fill amount/category/recurrence when the typed source matches
  //       a registry entry (only fields the user hasn't customised yet).
  // This is the fix for "the Add button shows different prefilled amounts
  // depending on which month I'm viewing" — the registry's active unit
  // amount is calendar-stable, so the prefill is now month-agnostic.
  type RegistrySrc = {
    id: string;
    displayName: string;
    normalizedSource: string;
    recurrence: string;
    category: string;
    cadenceAnchor: string;
    activeUnitAmount: number | null;
  };
  const { data: registryData } = useQuery<{ sources: RegistrySrc[] }>({
    queryKey: ["/api/income/registry"],
    enabled: !isEditing,
  });
  const registrySources: RegistrySrc[] = registryData?.sources ?? [];

  // Apply a registry source to the form. Only overwrites fields that are
  // empty / at-default so we don't blow away user keystrokes.
  const applyRegistrySource = (sourceId: string) => {
    const src = registrySources.find((s: RegistrySrc) => s.id === sourceId);
    if (!src) return;
    form.setValue("source", src.displayName);
    if (src.activeUnitAmount !== null && (form.getValues("amount") === "" || form.getValues("amount") === "0")) {
      form.setValue("amount", src.activeUnitAmount.toFixed(2));
    }
    form.setValue("category", src.category as typeof INCOME_CATEGORIES[number]);
    if (src.recurrence && src.recurrence !== "irregular" && src.recurrence !== "one_time") {
      form.setValue("isRecurring", true);
      form.setValue("recurrence", src.recurrence as typeof RECURRENCE_OPTIONS[number]);
    }
    // Anchor day-of-month from the cadence anchor (yyyy-MM-dd).
    if (src.cadenceAnchor && /^\d{4}-\d{2}-\d{2}$/.test(src.cadenceAnchor)) {
      const day = parseInt(src.cadenceAnchor.slice(8, 10), 10);
      if (Number.isFinite(day)) form.setValue("dueDay", day);
    }
  };

  // Auto-prefill on source-field blur if the typed text matches a registry
  // row by normalized name. Triggers a one-shot apply.
  const sourceField = form.watch("source");
  useEffect(() => {
    if (isEditing) return;
    if (!sourceField || sourceField.length < 3) return;
    const typed = normalizeSourceForMatch(sourceField);
    if (!typed) return;
    const match = registrySources.find((s) =>
      s.normalizedSource === typed || s.normalizedSource.includes(typed) || typed.includes(s.normalizedSource),
    );
    if (!match) return;
    // Only auto-apply if amount is still blank (don't fight the user's typing).
    const currentAmount = form.getValues("amount");
    if (currentAmount === "" || currentAmount === "0") {
      applyRegistrySource(match.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceField, registrySources.length, isEditing]);

  const preparePayload = (values: IncomeFormValues, extra?: Record<string, unknown>) => {
    return {
      ...values,
      isRecurring: values.isRecurring ? "true" : "false",
      customDates: values.recurrence === "custom" && values.customDates?.length
        ? JSON.stringify(values.customDates)
        : null,
      dueDay: values.recurrence === "custom" ? null : values.dueDay,
      detectionSource: "manual" as const,
      ...extra,
    };
  };

  // ── Amount-cadence mismatch dialog state (UAT-10 #172) ──────────────────
  const [mismatchOpen, setMismatchOpen] = useState(false);
  const [mismatchData, setMismatchData] = useState<{
    observedMedian: number;
    suggestedAmount: number;
    sampleSize: number;
    pendingValues: IncomeFormValues;
    mode: "create" | "update";
  } | null>(null);

  /**
   * Shared fetch helper that bypasses apiRequest so we can inspect a 422
   * body for the AMOUNT_CADENCE_MISMATCH code + observedMedian.
   */
  async function incomeFetch(
    method: string,
    url: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });

    if (res.status === 422) {
      // Try to parse the mismatch payload — if it isn't ours, rethrow generic
      const json = await res.json().catch(() => null);
      if (json?.code === "AMOUNT_CADENCE_MISMATCH") {
        // Stash the mismatch info; the caller will open the dialog
        throw Object.assign(new Error("AMOUNT_CADENCE_MISMATCH"), { mismatch: json });
      }
      throw new Error("Some fields have errors. Please review and try again.");
    }

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(text || "Request failed");
    }

    return res;
  }

  const createMutation = useMutation({
    mutationFn: async (values: IncomeFormValues & { _skip?: boolean }) => {
      const skip = values._skip;
      const { _skip, ...clean } = values;
      return incomeFetch("POST", "/api/income", preparePayload(clean, skip ? { skipAmountValidation: true } : {}));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      toast({ title: "Income added successfully" });
      onClose();
    },
    onError: (err: any) => {
      if (err?.mismatch) {
        // Open the confirmation dialog instead of a toast
        setMismatchData({
          observedMedian: err.mismatch.observedMedian,
          suggestedAmount: err.mismatch.suggestedAmount,
          sampleSize: err.mismatch.sampleSize,
          pendingValues: form.getValues(),
          mode: "create",
        });
        setMismatchOpen(true);
        return;
      }
      toast({ title: "Failed to add income", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: IncomeFormValues & { _skip?: boolean }) => {
      const skip = values._skip;
      const { _skip, ...clean } = values;
      return incomeFetch("PATCH", `/api/income/${income?.id}`, preparePayload(clean, skip ? { skipAmountValidation: true } : {}));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      toast({ title: "Income updated successfully" });
      onClose();
    },
    onError: (err: any) => {
      if (err?.mismatch) {
        setMismatchData({
          observedMedian: err.mismatch.observedMedian,
          suggestedAmount: err.mismatch.suggestedAmount,
          sampleSize: err.mismatch.sampleSize,
          pendingValues: form.getValues(),
          mode: "update",
        });
        setMismatchOpen(true);
        return;
      }
      toast({ title: "Failed to update income", variant: "destructive" });
    },
  });

  const handleMismatchUseSuggestion = () => {
    if (!mismatchData) return;
    form.setValue("amount", mismatchData.suggestedAmount.toFixed(2));
    setMismatchOpen(false);
    setMismatchData(null);
    // Re-submit with the corrected amount (no skip flag needed — it will pass)
    const vals = { ...mismatchData.pendingValues, amount: mismatchData.suggestedAmount.toFixed(2) };
    if (mismatchData.mode === "update") {
      updateMutation.mutate(vals);
    } else {
      createMutation.mutate(vals);
    }
  };

  const handleMismatchSaveAnyway = () => {
    if (!mismatchData) return;
    setMismatchOpen(false);
    const vals = { ...mismatchData.pendingValues, _skip: true };
    setMismatchData(null);
    if (mismatchData.mode === "update") {
      updateMutation.mutate(vals);
    } else {
      createMutation.mutate(vals);
    }
  };

  const onSubmit = (values: IncomeFormValues) => {
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
        {!isEditing && registrySources.length > 0 && (
          <div className="rounded-md border bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <p className="text-xs font-medium text-primary">
                Prefill from a known income source
              </p>
            </div>
            <Select onValueChange={applyRegistrySource}>
              <SelectTrigger className="h-8 text-sm" data-testid="select-registry-prefill">
                <SelectValue placeholder="Pick a registered source…" />
              </SelectTrigger>
              <SelectContent>
                {registrySources.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.displayName}
                    {s.activeUnitAmount !== null && (
                      <span className="ml-2 text-muted-foreground text-xs">
                        ${s.activeUnitAmount.toFixed(2)} • {s.recurrence}
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Picks the active unit amount and cadence — same values the engine uses to project this stream.
            </p>
          </div>
        )}

        <FormField
          control={form.control}
          name="source"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Source</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Company Name, Client" {...field} />
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
                  <Input type="number" step="0.01" placeholder="0.00" {...field} />
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {INCOME_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
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
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isRecurring"
          render={({ field }) => (
            <FormItem className="flex items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="cursor-pointer">This is recurring income</FormLabel>
            </FormItem>
          )}
        />

        {isRecurring && (
          <div className="space-y-4 pl-4 border-l-2 border-primary/30">
            <FormField
              control={form.control}
              name="recurrence"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recurrence Pattern</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value || "monthly"}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {RECURRENCE_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt.charAt(0).toUpperCase() + opt.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {recurrence !== "custom" && (
              <FormField
                control={form.control}
                name="dueDay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Day of Month (1-31)</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(parseInt(v))}
                      defaultValue={field.value?.toString() || "1"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DAY_OPTIONS.map((day) => (
                          <SelectItem key={day} value={day.toString()}>{day}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {recurrence === "custom" && (
              <FormField
                control={form.control}
                name="customDates"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Days of Month</FormLabel>
                    <div className="grid grid-cols-7 gap-2">
                      {DAY_OPTIONS.map((day) => (
                        <Button
                          key={day}
                          type="button"
                          variant={customDates.includes(day) ? "default" : "outline"}
                          className="h-8"
                          onClick={() => {
                            const updated = customDates.includes(day)
                              ? customDates.filter(d => d !== day)
                              : [...customDates, day].sort((a, b) => a - b);
                            field.onChange(updated);
                          }}
                        >
                          {day}
                        </Button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                <Textarea placeholder="Any additional notes..." className="resize-none" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : isEditing ? "Update Income" : "Add Income"}
          </Button>
        </div>
      </form>

      {/* ── Amount-cadence mismatch confirmation (UAT-10 #172) ─────────── */}
      <AlertDialog open={mismatchOpen} onOpenChange={setMismatchOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Amount doesn't match recent deposits
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  The amount you entered ({formatCurrency(parseFloat(form.getValues("amount") || "0"))})
                  is significantly higher than your recent deposits for this source.
                </p>
                {mismatchData && (
                  <div className="rounded-md border bg-muted/50 p-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Median of last {mismatchData.sampleSize} deposits:</span>
                      <span className="font-semibold">{formatCurrency(mismatchData.observedMedian)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Suggested amount:</span>
                      <span className="font-semibold text-green-600">{formatCurrency(mismatchData.suggestedAmount)}</span>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  This could happen if the bank reported a monthly aggregate for a weekly pay cycle.
                  You can use the suggested amount, save anyway, or cancel.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={handleMismatchSaveAnyway}>
              Save anyway
            </Button>
            <AlertDialogAction onClick={handleMismatchUseSuggestion}>
              Use {mismatchData ? formatCurrency(mismatchData.suggestedAmount) : "suggestion"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  );
}

export default function IncomePage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDetectDialogOpen, setIsDetectDialogOpen] = useState(false);
  // Step 6: registry manager dialog (rate changes + mode classification)
  const [isRegistryOpen, setIsRegistryOpen] = useState(false);
  // When non-null, the registry manager auto-expands this source on open so
  // the user lands directly on Edit / Rate-change for the row they clicked.
  const [registryFocusId, setRegistryFocusId] = useState<string | undefined>();
  const [registryFocusMode, setRegistryFocusMode] = useState<"edit" | "rate" | undefined>();
  const [editingIncome, setEditingIncome] = useState<Income | undefined>();
  const [deletingIncome, setDeleteingIncome] = useState<Income | undefined>();
  // Inline delete for a registry-backed row in the "Detected from Bank" list.
  const [deletingRegistrySource, setDeletingRegistrySource] = useState<{
    id: string;
    name: string;
  } | undefined>();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "date", direction: "desc" });
  const { toast } = useToast();

  // AI Teller state
  const [tellerOpen, setTellerOpen] = useState(false);
  const [tellerTransaction, setTellerTransaction] = useState<TransactionContext | null>(null);
  const [tellerHoverId, setTellerHoverId] = useState<string | null>(null);

  // Teller flags state
  const [tellerFlags, setTellerFlags] = useState<any[]>([]);
  const [flagsBannerOpen, setFlagsBannerOpen] = useState(true);
  const [flagsBannerExpanded, setFlagsBannerExpanded] = useState(false);
  const [flagsLoaded, setFlagsLoaded] = useState(false);

  // Load teller flags on mount
  useEffect(() => {
    if (flagsLoaded) return;
    setFlagsLoaded(true);
    apiRequest("GET", "/api/ai/teller/flags")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setTellerFlags(data);
      })
      .catch(() => {/* silently ignore */});
  }, [flagsLoaded]);

  const dismissFlag = async (flagId: string) => {
    try {
      await apiRequest("POST", `/api/ai/teller/flags/${flagId}/dismiss`);
      setTellerFlags((prev) => prev.filter((f) => f.id !== flagId));
    } catch {/* ignore */}
  };

  const openTeller = (inc: Income) => {
    setTellerTransaction({
      id: inc.id,
      merchant: inc.source,
      amount: parseFloat(inc.amount as string),
      date: inc.date,
      category: inc.category,
      notes: inc.notes || undefined,
      source: "manual",
    });
    setTellerOpen(true);
  };

  // Detect income state
  const [detectedIncome, setDetectedIncome] = useState<any[]>([]);
  const [selectedDetected, setSelectedDetected] = useState<Set<number>>(new Set());
  const [isDetecting, setIsDetecting] = useState(false);
  const [isAddingDetected, setIsAddingDetected] = useState(false);

  const deduplicateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/income/deduplicate");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      // Always show the review dialog so the user sees what happened
      setDedupReviewData(data);
      setIsDedupReviewOpen(true);
    },
    onError: () => {
      toast({ title: "Failed to clean duplicates", variant: "destructive" });
    },
  });

  const detectIncome = async () => {
    setIsDetecting(true);
    setDetectedIncome([]);
    setSelectedDetected(new Set());
    setIsDetectDialogOpen(true); // Open dialog immediately to show loading state
    try {
      const response = await apiRequest("POST", "/api/income/detect");
      const data = await response.json();
      setDetectedIncome(data.suggestions || []);
      // Auto-select high confidence income
      const highConfidence = new Set<number>();
      data.suggestions?.forEach((s: any, i: number) => {
        if (s.confidence === "high") highConfidence.add(i);
      });
      setSelectedDetected(highConfidence);
    } catch (error) {
      toast({ title: "Failed to detect income", variant: "destructive" });
      setIsDetectDialogOpen(false);
    } finally {
      setIsDetecting(false);
    }
  };

  const toggleDetectedIncome = (index: number) => {
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

  const addSelectedIncome = async () => {
    if (selectedDetected.size === 0) return;
    setIsAddingDetected(true);
    try {
      const incomeToAdd = Array.from(selectedDetected).map(i => detectedIncome[i]);
      for (const inc of incomeToAdd) {
        await apiRequest("POST", "/api/income", {
          source: inc.name,
          amount: inc.amount,
          category: inc.category,
          date: format(new Date(), "yyyy-MM-dd"),
          isRecurring: "true",
          recurrence: inc.recurrence,
          dueDay: inc.dueDay,
          notes: `Auto-detected from ${inc.source === "plaid" ? "bank transactions" : "AI analysis"}`,
          skipAmountValidation: true, // detection-sourced amounts already validated (#172)
          detectionSource: inc.source === "plaid" ? "plaid" : inc.source === "ai" ? "ai" : "manual",
          detectionRef: inc.plaidStreamId ?? null,
          detectionRefType: inc.plaidStreamId ? "plaid_stream_id" : null,
          detectionConfidence: inc.confidence ?? null,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      toast({ title: `Added ${incomeToAdd.length} income source${incomeToAdd.length > 1 ? "s" : ""}` });
      setIsDetectDialogOpen(false);
      setDetectedIncome([]);
      setSelectedDetected(new Set());
    } catch (error) {
      toast({ title: "Failed to add income", variant: "destructive" });
    } finally {
      setIsAddingDetected(false);
    }
  };

  // Dedup review dialog state
  const [dedupReviewData, setDedupReviewData] = useState<{
    removed: number;
    message: string;
    flaggedForReview: Array<{ source: string; date: string; amount: string; count: number; ids: string[] }>;
  } | null>(null);
  const [isDedupReviewOpen, setIsDedupReviewOpen] = useState(false);

  const [bannerDismissed, setBannerDismissed] = useState(false);

  const flaggedTransactionIds = new Set(tellerFlags.map((f: any) => f.transaction_id));

  const { data: allIncome = [], isLoading } = useQuery<Income[]>({
    queryKey: ["/api/income"],
  });

  const autoDetectedIncome = allIncome.filter((inc) => (inc as any).autoDetected === true);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/income/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      toast({ title: "Income deleted successfully" });
      setDeleteingIncome(undefined);
    },
    onError: () => {
      toast({ title: "Failed to delete income", variant: "destructive" });
    },
  });

  // Delete an auto-detected registry-backed source inline from the top list.
  // Backend does a soft-delete (isActive=false) so historical projections
  // still resolve, but future projections stop immediately and the row
  // disappears from bySource on next fetch.
  const deleteRegistrySourceMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/income/registry/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/income/registry"] });
      queryClient.invalidateQueries({ queryKey: ["/api/engine/income"] });
      queryClient.invalidateQueries({ queryKey: ["/api/engine/dashboard"] });
      toast({ title: "Income source removed" });
      setDeletingRegistrySource(undefined);
    },
    onError: (err: any) => {
      toast({
        title: "Failed to remove source",
        description: err?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  // Open the Registry Manager and auto-focus a specific source. The modal
  // reads registryFocusId/Mode to scroll-into-view and expand the Rate-change
  // form when mode === "rate". Gives every top-list row first-class Edit and
  // Rate-change actions without duplicating the modal's controls inline.
  const openRegistryFor = (sourceId: string, mode: "edit" | "rate") => {
    setRegistryFocusId(sourceId);
    setRegistryFocusMode(mode);
    setIsRegistryOpen(true);
  };

  const handleEdit = (income: Income) => {
    setEditingIncome(income);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingIncome(undefined);
  };

  const handleSort = (key: SortConfig["key"]) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  // Fetch income stats from the centralized financial engine
  const { data: incomeStats, isLoading: statsLoading } = useQuery<IncomeResult>({
    queryKey: ["/api/engine/income", format(monthStart, "yyyy-MM-dd"), format(monthEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/engine/income?startDate=${format(monthStart, "yyyy-MM-dd")}&endDate=${format(monthEnd, "yyyy-MM-dd")}`);
      return response.json();
    },
  });

  // UAT-6 P1-15: belt-and-suspenders filter for transfer-sourced rows that
  // slipped in before the server-side detector was hardened (2026-04-17). The
  // server now rejects TRANSFER_IN_*/TRANSFER_OUT_*/LOAN_PAYMENTS_*/BANK_FEES_*
  // credits at detect-time, but legacy rows can still exist in the Income
  // table. Drop any row whose source/category reads as a transfer so it never
  // paints on the /income page. No data is deleted — just hidden.
  const TRANSFER_HINTS = [
    "transfer", "internal transfer", "account transfer",
    "venmo", "zelle", "credit card payment", "loan payment",
    "card payment", "payment from", "payment to",
  ];
  const looksLikeTransfer = (inc: Income) => {
    const src = (inc.source || "").toLowerCase();
    const cat = (inc.category || "").toLowerCase();
    if (cat === "transfer" || cat === "loan_payments" || cat === "bank_fees") return true;
    return TRANSFER_HINTS.some((h) => src.includes(h));
  };

  // Filter income list based on search and category (for the data table)
  const filteredIncome = allIncome
    .filter((inc) => {
      if (looksLikeTransfer(inc)) return false;
      // Filter by selected month
      const incDate = new Date(inc.date);
      if (incDate < monthStart || incDate > monthEnd) return false;
      const matchesSearch = inc.source.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || inc.category === categoryFilter;
      return matchesSearch && matchesCategory;
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
      <DemoBanner />
      {/* ── Teller Alert Banner ── */}
      {flagsBannerOpen && tellerFlags.length > 0 && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                AI Bank Teller flagged {tellerFlags.length} transaction{tellerFlags.length !== 1 ? "s" : ""} for review
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Possible issues detected — click to review
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                onClick={() => setFlagsBannerExpanded((v) => !v)}
              >
                {flagsBannerExpanded ? (
                  <><ChevronUp className="h-3.5 w-3.5 mr-1" />Hide</>
                ) : (
                  <><ChevronDown className="h-3.5 w-3.5 mr-1" />Show</>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                onClick={() => setFlagsBannerOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {flagsBannerExpanded && (
            <div className="border-t border-amber-200 dark:border-amber-800 divide-y divide-amber-100 dark:divide-amber-900">
              {tellerFlags.map((flag: any) => (
                <div key={flag.id} className="flex items-start gap-3 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{flag.message}</p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5 capitalize">
                      {flag.flag_type.replace("_", " ")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40 shrink-0"
                    onClick={() => dismissFlag(flag.id)}
                  >
                    Dismiss
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Income</h1>
            <HelpTooltip
              title="About Income"
              content="Record all your income sources including salary, freelance work, and investments. Set up recurring income entries to avoid manual entry each pay period. Income data feeds into your dashboard and reports."
            />
          </div>
          <p className="text-muted-foreground">Track your income sources</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setIsRegistryOpen(true)}
            data-testid="button-open-registry"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Manage Sources
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingIncome(undefined)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Income
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingIncome ? "Edit Income" : "Add New Income"}</DialogTitle>
            </DialogHeader>
            <IncomeForm
              income={editingIncome}
              onClose={handleCloseDialog}
              defaultDate={format(new Date(), "yyyy-MM-dd")}
            />
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Auto-detected income banner */}
      {!bannerDismissed && autoDetectedIncome.length > 0 && (
        <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <Sparkles className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-primary">
              {autoDetectedIncome.length} recurring income source{autoDetectedIncome.length > 1 ? "s were" : " was"} auto-detected from your bank history
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review and edit them below. Click the edit icon to see detection details.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setBannerDismissed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Registry Manager Dialog (Step 6) */}
      <IncomeRegistryManager
        open={isRegistryOpen}
        onOpenChange={(open) => {
          setIsRegistryOpen(open);
          if (!open) {
            setRegistryFocusId(undefined);
            setRegistryFocusMode(undefined);
          }
        }}
        focusSourceId={registryFocusId}
        focusMode={registryFocusMode}
      />

      {/* Detect Income Dialog */}
      <Dialog open={isDetectDialogOpen} onOpenChange={(open) => !isDetecting && setIsDetectDialogOpen(open)}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Detected Recurring Income
            </DialogTitle>
          </DialogHeader>
          {isDetecting ? (
            <div className="text-center py-12">
              <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin mb-4" />
              <p className="text-muted-foreground font-medium">Analyzing your transactions...</p>
              <p className="text-sm text-muted-foreground mt-2">
                Looking for recurring deposits and income patterns (excluding small amounts under $200).
              </p>
            </div>
          ) : detectedIncome.length === 0 ? (
            <div className="text-center py-8">
              <DollarSign className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No new recurring income detected.</p>
              <p className="text-sm text-muted-foreground mt-1">
                All detected income sources are already in your list, or we couldn't find recurring patterns.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                We found {detectedIncome.length} recurring income source{detectedIncome.length > 1 ? "s" : ""} in your transactions.
                Select which ones to add.
              </p>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {detectedIncome.map((inc, index) => (
                  <div
                    key={index}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedDetected.has(index) ? "bg-primary/5 border-primary" : "hover:bg-muted/50"
                    }`}
                    onClick={() => toggleDetectedIncome(index)}
                  >
                    <Checkbox
                      checked={selectedDetected.has(index)}
                      onCheckedChange={() => toggleDetectedIncome(index)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{inc.name}</span>
                        {inc.confidence === "high" && (
                          <Badge variant="secondary" className="text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            High confidence
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="text-green-600 font-medium">{formatCurrency(inc.amount)}</span>
                        <span>•</span>
                        <span>{inc.recurrence}</span>
                        <span>•</span>
                        <Badge variant="outline" className="text-xs">{inc.category}</Badge>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {inc.source === "plaid" ? "Bank" : "AI"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-4 border-t">
                <span className="text-sm text-muted-foreground">
                  {selectedDetected.size} of {detectedIncome.length} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsDetectDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={addSelectedIncome}
                    disabled={selectedDetected.size === 0 || isAddingDetected}
                  >
                    {isAddingDetected ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Add {selectedDetected.size} Income{selectedDetected.size !== 1 ? "s" : ""}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Phase 3.4: Income-sources panel opts into the mint-glass surface so
       * it sits on the same substrate as the dashboard hero row rather than
       * the flat card that used to paint over the themed bg. */}
      <Card variant="glass">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Income Sources
            </CardTitle>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search income..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
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
                  {INCOME_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 border rounded-md p-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-medium min-w-[120px] text-center text-sm">
                  {format(currentMonth, "MMM yyyy")}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {statsLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(incomeStats?.actualIncome || 0)}
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      received in {format(currentMonth, "MMMM")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Actual income detected from bank deposits
                  </p>
                </div>
                {(incomeStats?.budgetedIncome || 0) > 0 && (
                  <div className="border-l pl-6">
                    <div className="text-lg font-semibold text-muted-foreground">
                      {formatCurrency(incomeStats?.budgetedIncome || 0)}
                      <span className="text-sm font-normal ml-2">planned</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      From your manual income entries
                    </p>
                  </div>
                )}
              </div>
            )}
            <span className="inline-flex items-center rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              Bank Detected
            </span>
          </div>
          {/* Bank-detected income sources from bySource */}
          {!statsLoading && incomeStats?.bySource && incomeStats.bySource.length > 0 && (
            <div className="mt-4 border rounded-lg p-4 bg-muted/30">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                Income Sources Detected from Bank
              </h4>
              <div className="space-y-2">
                {incomeStats.bySource.map((source, idx) => {
                  // Check if this source is already in the income table
                  const normalizedSource = source.source.toLowerCase().replace(/[^a-z0-9]/g, '');
                  const alreadyInTable = allIncome.some((inc) => {
                    const normalizedInc = (inc.source || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    return normalizedInc.includes(normalizedSource) || normalizedSource.includes(normalizedInc);
                  });

                  const frequencyLabel = source.frequency
                    ? source.frequency.charAt(0).toUpperCase() + source.frequency.slice(1)
                    : null;

                  // Registry-backed row? If yes, we offer Edit / Rate change /
                  // Delete inline. If not, it's an unmatched bank deposit and
                  // we fall back to the legacy "Add" flow so the user can
                  // promote it into a real income record.
                  const hasRegistry = Boolean(source.sourceId);

                  return (
                    <div key={idx} className="flex items-center justify-between py-2 px-3 rounded-md bg-background">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-green-600/10 flex items-center justify-center text-green-600 font-medium text-sm">
                          {source.source.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{source.source}</p>
                          <p className="text-xs text-muted-foreground">
                            {source.category}
                            {frequencyLabel ? ` · ${frequencyLabel}` : ''}
                            {source.isRecurring && !frequencyLabel ? ' · Recurring' : ''}
                            {typeof source.unitAmount === "number" && source.unitAmount > 0 && (
                              <> · {formatCurrency(source.unitAmount)} per pay</>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-green-600">
                          {formatCurrency(source.amount)}
                        </span>
                        {hasRegistry ? (
                          <div className="flex items-center gap-1" data-testid={`registry-actions-${source.sourceId}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Edit source — rate change, cadence, mode, or category"
                              aria-label={`Edit ${source.source}`}
                              onClick={() => openRegistryFor(source.sourceId!, "rate")}
                              data-testid={`button-rate-${source.sourceId}`}
                            >
                              <Wand2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              title="Remove this income source"
                              aria-label={`Remove ${source.source}`}
                              onClick={() =>
                                setDeletingRegistrySource({ id: source.sourceId!, name: source.source })
                              }
                              data-testid={`button-delete-${source.sourceId}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : !alreadyInTable && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                // UAT-8 FIX: server-side Zod validation rejects:
                                //   - categories outside INCOME_CATEGORIES (["Salary",
                                //     "Freelance", "Business", "Investments", "Rental",
                                //     "Gifts", "Refunds", "Other"])
                                //   - recurrence values outside RECURRENCE_OPTIONS
                                //     (["weekly","biweekly","monthly","yearly",
                                //     "custom","one_time"])
                                // Previously we passed raw Plaid categories (e.g.
                                // "Employment", "Deposit") and "quarterly" through
                                // unchanged, so the request 400'd — which surfaced
                                // as "Failed to add income" on every click.
                                const ALLOWED_INCOME_CATEGORIES = new Set([
                                  "Salary","Freelance","Business","Investments",
                                  "Rental","Gifts","Refunds","Other",
                                ]);
                                const mappedCategory = (() => {
                                  const raw = (source.category || "").toString();
                                  if (raw === "Employment") return "Salary";
                                  if (ALLOWED_INCOME_CATEGORIES.has(raw)) return raw;
                                  // Heuristics for Plaid/aggregator values.
                                  if (/salary|payroll|wages|employment/i.test(raw)) return "Salary";
                                  if (/freelance|contract|1099/i.test(raw)) return "Freelance";
                                  if (/business|self.?employed/i.test(raw)) return "Business";
                                  if (/invest|dividend|interest/i.test(raw)) return "Investments";
                                  if (/rent/i.test(raw)) return "Rental";
                                  if (/gift/i.test(raw)) return "Gifts";
                                  if (/refund/i.test(raw)) return "Refunds";
                                  return "Other";
                                })();

                                // Canonicalize the detected frequency via the shared helper so semi-monthly
                                // and quarterly get preserved instead of silently collapsing.
                                // If the frequency is unrecognized, refuse to save — the user should
                                // re-verify the source on the Income page.
                                const mappedRecurrence = canonicalizeRecurrence(source.frequency);
                                if (source.isRecurring && !mappedRecurrence) {
                                  toast({
                                    title: "Unrecognized income frequency",
                                    description: `Can't auto-add "${source.source}" — the detected frequency "${source.frequency}" isn't a supported cadence. Please add it manually.`,
                                    variant: "destructive",
                                  });
                                  return;
                                }

                                await apiRequest("POST", "/api/income", {
                                  source: source.source,
                                  amount: String(source.amount), // schema transforms but be explicit
                                  category: mappedCategory,
                                  date: format(new Date(), "yyyy-MM-dd"),
                                  isRecurring: source.isRecurring ? "true" : "false",
                                  recurrence: mappedRecurrence,
                                  notes: "Added from bank detection",
                                  skipAmountValidation: true, // detection-sourced amounts already validated (#172)
                                });
                                queryClient.invalidateQueries({ queryKey: ["/api/income"] });
                                queryClient.invalidateQueries({ queryKey: ["/api/engine/income"] });
                                toast({ title: `Added ${source.source} to income` });
                              } catch (error) {
                                const message = error instanceof Error ? error.message : "Unknown error";
                                toast({
                                  title: "Failed to add income",
                                  description: message,
                                  variant: "destructive",
                                });
                              }
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardHeader>
        {/*
          Legacy "Sources" table removed 2026-04-21 per operator decision
          (Ryan, UAT Wave 3): the registry in "Income Sources Detected from
          Bank" above is now the single source of truth. The previous table
          rendered `filteredIncome` (from /api/income), which double-counted
          with the registry on the Dashboard and surfaced paycheck-by-paycheck
          rows that users couldn't reconcile against their bank feed. Paycheck
          history should come from the bank transactions view, not a parallel
          store. `filteredIncome` / allIncome are still used for duplicate
          detection in the "alreadyInTable" check above.
        */}
        {!statsLoading && (!incomeStats?.bySource || incomeStats.bySource.length === 0) && (
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="mb-4">
                No income sources yet — connect your bank or add a source manually.
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button onClick={() => setIsRegistryOpen(true)} variant="outline">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Detect from bank
                </Button>
                <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Income
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── AI Bank Teller Chatbot ── */}
      <FloatingChatbot
        externalOpen={tellerOpen}
        onExternalClose={() => { setTellerOpen(false); setTellerTransaction(null); }}
        transactionContext={tellerTransaction}
        tellerMode={true}
      />

      <AlertDialog open={!!deletingIncome} onOpenChange={() => setDeleteingIncome(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Income</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the income entry for {deletingIncome?.source}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deletingIncome?.id || "")}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Inline delete for a registry-backed "Detected from Bank" source.
          Soft-delete: past paychecks stay visible; future projections stop. */}
      <AlertDialog
        open={!!deletingRegistrySource}
        onOpenChange={(open) => !open && setDeletingRegistrySource(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove income source?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <span className="font-medium">{deletingRegistrySource?.name}</span> from
              your income registry? Past paychecks stay visible in history, but future
              projections stop immediately. You can always re-detect it from bank history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletingRegistrySource &&
                deleteRegistrySourceMutation.mutate(deletingRegistrySource.id)
              }
              disabled={deleteRegistrySourceMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete-registry"
            >
              {deleteRegistrySourceMutation.isPending ? "Removing..." : "Remove source"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dedup Review Dialog */}
      <Dialog open={isDedupReviewOpen} onOpenChange={setIsDedupReviewOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Duplicate Cleanup Results
            </DialogTitle>
          </DialogHeader>
          {dedupReviewData ? (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Removed {dedupReviewData.removed} duplicate income entrie{dedupReviewData.removed === 1 ? "s" : ""}
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                  {dedupReviewData.message}
                </p>
              </div>

              {dedupReviewData.flaggedForReview.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-3">
                    Flagged for Review ({dedupReviewData.flaggedForReview.length})
                  </p>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {dedupReviewData.flaggedForReview.map((item, idx) => (
                      <div key={idx} className="p-3 border rounded-lg bg-muted/50">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-sm">{item.source}</p>
                            <p className="text-xs text-muted-foreground">{item.date}</p>
                            <p className="text-xs text-muted-foreground">{item.count} transaction{item.count !== 1 ? 's' : ''}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{formatCurrency(parseFloat(item.amount))}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
