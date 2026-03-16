// FEATURE: SUBSCRIPTION_TRACKING | tier: pro | limit: unlimited (disabled on free)
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, CreditCard, Calendar, Trash2, RefreshCw, Sparkles, Loader2, Check, Bell, BellOff, TrendingDown, AlertCircle, Lock, TrendingUp, ShieldCheck, Eye } from "lucide-react";
import { RECURRENCE_OPTIONS, type Bill } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { format, addDays, addWeeks, addMonths, parseISO, setDate, setDay, isBefore } from "date-fns";
import { FeatureGate } from "@/components/FeatureGate";
import { useFeatureUsage } from "@/contexts/FeatureUsageContext";
import { useLocation } from "wouter";
import { trackUpgradeCta } from "@/lib/trackUpgradeCta";

function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(num);
}

// Calculate next due date for a bill based on its dueDay and recurrence
function getBillNextDueDate(dueDay: number, recurrence: string, customDates?: string | null): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
      const allDates = dates.map(d => parseISO(d)).sort((a, b) => b.getTime() - a.getTime());
      return allDates[0] || today;
    } catch {
      return today;
    }
  }

  if (recurrence === "weekly") {
    let nextDue = setDay(today, dueDay, { weekStartsOn: 0 });
    if (isBefore(nextDue, today) || nextDue.getTime() === today.getTime()) {
      nextDue = addWeeks(nextDue, 1);
    }
    return nextDue;
  }

  let nextDue = setDate(today, dueDay);
  if (isBefore(nextDue, today)) {
    if (recurrence === "monthly") {
      nextDue = addMonths(nextDue, 1);
    } else if (recurrence === "yearly") {
      nextDue = addMonths(nextDue, 12);
    } else if (recurrence === "biweekly") {
      nextDue = addDays(nextDue, 14);
    }
  }
  return nextDue;
}

/** Returns true if the bill's notes contain the auto-detected marker */
function isAutoDetected(bill: Bill): boolean {
  return !!(bill.notes && bill.notes.includes("auto_detected"));
}

/** Extract cancel-reminder date from notes if set */
function getCancelReminderDate(bill: Bill): string | null {
  if (!bill.notes) return null;
  const match = bill.notes.match(/CancelReminder:(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

// ─── Subscription Intelligence Upgrade Overlay ───────────────────────────────

function SubscriptionIntelligenceGate({ children }: { children: React.ReactNode }) {
  const { getFeatureState, isLoading } = useFeatureUsage();
  const [, navigate] = useLocation();

  if (isLoading) return <>{children}</>;

  const state = getFeatureState("subscription_tracking");

  // If allowed (pro/family), render children normally
  if (!state || state.allowed) return <>{children}</>;

  // Free tier — show full-page upgrade overlay
  return (
    <div className="container mx-auto px-4 py-4 sm:p-6 max-w-4xl">
      {/* Page header — always visible */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold">Subscriptions</h1>
            <HelpTooltip
              title="About Subscriptions"
              content="Track recurring subscription services like streaming, software, and gym memberships. Upgrade to Pro to unlock full subscription intelligence."
            />
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">Track your recurring subscriptions and memberships</p>
        </div>
      </div>

      {/* Upgrade card — full width, compelling */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-background via-background to-amber-950/10 shadow-[0_0_60px_rgba(245,158,11,0.08)]">
        {/* Shimmer sweep */}
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            background: 'linear-gradient(105deg, transparent 35%, rgba(245,158,11,0.06) 50%, transparent 65%)',
            animation: 'shimmer 3s ease-in-out infinite',
          }}
        />
        <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>

        <div className="relative z-10 px-6 py-10 sm:px-12 sm:py-14 flex flex-col items-center text-center gap-6">
          {/* Icon */}
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/15 border border-amber-500/20">
            <Lock className="h-10 w-10 text-amber-400" />
          </div>

          {/* Headline */}
          <div className="space-y-2 max-w-xl">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Subscription Intelligence
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              The average person wastes <span className="text-amber-400 font-semibold">$624/year</span> on forgotten subscriptions.
              Pro users find and cancel hidden charges in minutes — not months.
            </p>
          </div>

          {/* Feature bullets — 2-column grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg text-left">
            {[
              { icon: Eye, text: "See every subscription you're paying for — even the ones you forgot about" },
              { icon: AlertCircle, text: "Detect hidden charges and sneaky price increases before they drain your account" },
              { icon: Bell, text: "Set cancel reminders before your next billing date so you never get charged again" },
              { icon: TrendingDown, text: "Track your total monthly subscription spend and find where to cut" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
                <Icon className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <span className="text-sm text-muted-foreground leading-snug">{text}</span>
              </div>
            ))}
          </div>

          {/* Social proof / urgency */}
          <div className="flex flex-col sm:flex-row items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-green-400" />
              <span>Pro users save an average of <strong className="text-foreground">$52/month</strong></span>
            </div>
            <span className="hidden sm:inline text-border">·</span>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-blue-400" />
              <span>AI-powered detection from your real bank transactions</span>
            </div>
          </div>

          {/* CTA */}
          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            <Button
              size="lg"
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-black hover:from-amber-400 hover:to-yellow-400 font-bold text-base shadow-lg shadow-amber-500/20"
              onClick={() => {
                trackUpgradeCta("feature_gate");
                navigate("/upgrade");
              }}
            >
              Unlock Subscription Intelligence →
            </Button>
            <p className="text-xs text-muted-foreground">
              Cancel anytime. Most users recover the cost in the first month.
            </p>
          </div>
        </div>
      </div>

      {/* Blurred preview of what they're missing */}
      <div className="mt-6 relative overflow-hidden rounded-xl border border-border/50 opacity-40 pointer-events-none select-none">
        <div className="absolute inset-0 z-10" style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
        <div className="p-6 space-y-3">
          {[
            { name: "Netflix", amount: "$18.99", recurrence: "monthly", badge: "Due soon" },
            { name: "Spotify Premium", amount: "$11.99", recurrence: "monthly", badge: "" },
            { name: "Adobe Creative Cloud", amount: "$59.99", recurrence: "monthly", badge: "Price increase detected" },
            { name: "Amazon Prime", amount: "$99.00", recurrence: "yearly", badge: "" },
          ].map((sub) => (
            <div key={sub.name} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{sub.name}</span>
                  {sub.badge && <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">{sub.badge}</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">{sub.recurrence}</span>
              </div>
              <span className="font-bold">{sub.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Add Subscription Dialog ──────────────────────────────────────────────────

function AddSubscriptionDialog({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    amount: "",
    recurrence: "monthly",
    dueDay: new Date().getDate(),
    merchant: "",
    notes: "",
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      await apiRequest("POST", "/api/subscriptions", {
        name: data.name,
        amount: data.amount,
        category: "Subscriptions", // Always set to Subscriptions
        recurrence: data.recurrence,
        dueDay: data.dueDay,
        merchant: data.merchant || null,
        notes: data.notes || null,
        isPaused: "false",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({ title: "Subscription added" });
      setOpen(false);
      setFormData({
        name: "",
        amount: "",
        recurrence: "monthly",
        dueDay: new Date().getDate(),
        merchant: "",
        notes: "",
      });
      onSuccess();
    },
    onError: () => {
      toast({ title: "Failed to add subscription", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-subscription">
          <Plus className="w-4 h-4 mr-2" />
          Add Subscription
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Subscription</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Netflix, Spotify, etc."
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              data-testid="input-subscription-name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                data-testid="input-subscription-amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurrence">Frequency</Label>
              <Select
                value={formData.recurrence}
                onValueChange={(value) => setFormData({ ...formData, recurrence: value })}
              >
                <SelectTrigger data-testid="select-recurrence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.filter(r => r !== "custom").map((rec) => (
                    <SelectItem key={rec} value={rec}>{rec.charAt(0).toUpperCase() + rec.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dueDay">Due Day (of month)</Label>
            <Input
              id="dueDay"
              type="number"
              min="1"
              max="31"
              value={formData.dueDay}
              onChange={(e) => setFormData({ ...formData, dueDay: parseInt(e.target.value) || 1 })}
              data-testid="input-due-day"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="merchant">Merchant (optional)</Label>
            <Input
              id="merchant"
              placeholder="Company name"
              value={formData.merchant}
              onChange={(e) => setFormData({ ...formData, merchant: e.target.value })}
              data-testid="input-merchant"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              placeholder="Additional notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              data-testid="input-notes"
            />
          </div>

          <Button
            onClick={() => createMutation.mutate(formData)}
            disabled={createMutation.isPending || !formData.name || !formData.amount}
            className="w-full"
            data-testid="button-save-subscription"
          >
            {createMutation.isPending ? "Saving..." : "Add Subscription"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface DetectedSubscription {
  name: string;
  amount: number;
  frequency: string;
  merchant: string;
  confidence: number;
  lastChargeDate: string;
  transactionCount: number;
}

function DetectSubscriptionsDialog({
  existingSubscriptions,
  onSuccess,
}: {
  existingSubscriptions: Bill[];
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<DetectedSubscription[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);

  const handleDetect = async () => {
    setDetecting(true);
    setDetected([]);
    setSelected(new Set());

    try {
      const res = await apiRequest("POST", "/api/subscriptions/detect");
      const data = await res.json();

      // Filter out subscriptions that already exist
      const existingNames = new Set(existingSubscriptions.map(s => s.name.toLowerCase()));
      const existingMerchants = new Set(existingSubscriptions.map(s => s.merchant?.toLowerCase()).filter(Boolean));

      const filtered = data.subscriptions.filter((sub: DetectedSubscription) =>
        !existingNames.has(sub.name.toLowerCase()) &&
        !existingMerchants.has(sub.merchant.toLowerCase())
      );

      setDetected(filtered);
      // Select all by default
      setSelected(new Set(filtered.map((_: any, i: number) => i)));
    } catch (error) {
      toast({ title: "Failed to detect subscriptions", variant: "destructive" });
    } finally {
      setDetecting(false);
    }
  };

  const handleAddSelected = async () => {
    setAdding(true);
    try {
      const toAdd = detected.filter((_, i) => selected.has(i));

      for (const sub of toAdd) {
        await apiRequest("POST", "/api/subscriptions", {
          name: sub.name,
          amount: sub.amount.toFixed(2),
          category: "Subscriptions",
          recurrence: sub.frequency === "yearly" ? "yearly" : sub.frequency === "weekly" ? "weekly" : "monthly",
          dueDay: new Date(sub.lastChargeDate).getDate(),
          merchant: sub.merchant,
          notes: `Detected from ${sub.transactionCount} transactions`,
          isPaused: "false",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({ title: `Added ${toAdd.length} subscription${toAdd.length !== 1 ? "s" : ""}` });
      setOpen(false);
      setDetected([]);
      onSuccess();
    } catch (error) {
      toast({ title: "Failed to add subscriptions", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const toggleSelect = (index: number) => {
    const newSelected = new Set(selected);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelected(newSelected);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-detect-subscriptions">
          <Sparkles className="w-4 h-4 mr-2" />
          Detect Subscriptions
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Detect Subscriptions with AI</DialogTitle>
        </DialogHeader>

        {detected.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Analyze your bank transactions to automatically detect recurring subscription charges like Netflix, Spotify, gym memberships, and more.
            </p>
            <Button
              onClick={handleDetect}
              disabled={detecting}
              className="w-full"
              data-testid="button-start-detection"
            >
              {detecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing Transactions...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Analyze My Transactions
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Found {detected.length} potential subscription{detected.length !== 1 ? "s" : ""}. Select the ones you want to add:
            </p>

            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {detected.map((sub, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                  onClick={() => toggleSelect(index)}
                >
                  <Checkbox
                    checked={selected.has(index)}
                    onCheckedChange={() => toggleSelect(index)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">{sub.name}</span>
                      <span className="font-bold text-primary">{formatCurrency(sub.amount)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{sub.frequency}</span>
                      <span>•</span>
                      <span>{sub.transactionCount} charges found</span>
                      <span>•</span>
                      <span>{Math.round(sub.confidence * 100)}% confident</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {detected.length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                No new subscriptions detected. All recurring charges are already tracked!
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDetected([]);
                  setSelected(new Set());
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddSelected}
                disabled={adding || selected.size === 0}
                className="flex-1"
                data-testid="button-add-detected"
              >
                {adding ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Add {selected.size} Subscription{selected.size !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Dialog to set or clear a cancellation reminder on a subscription */
function CancelReminderDialog({
  bill,
  onSuccess,
}: {
  bill: Bill;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const existingReminder = getCancelReminderDate(bill);
  const nextDue = getBillNextDueDate(bill.dueDay, bill.recurrence, bill.customDates);
  // Default reminder: 3 days before next billing date
  const defaultReminderDate = format(addDays(nextDue, -3), "yyyy-MM-dd");
  const [reminderDate, setReminderDate] = useState(existingReminder || defaultReminderDate);

  const updateMutation = useMutation({
    mutationFn: async (date: string | null) => {
      // Inject or remove CancelReminder tag in notes
      let notes = (bill.notes || "").replace(/\s*\|\s*CancelReminder:\d{4}-\d{2}-\d{2}/g, "").trim();
      if (date) {
        notes = notes ? `${notes} | CancelReminder:${date}` : `CancelReminder:${date}`;
      }
      await apiRequest("PATCH", `/api/bills/${bill.id}`, { notes });
    },
    onSuccess: (_, date) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({
        title: date
          ? `Cancel reminder set for ${format(parseISO(date as string), "MMM d, yyyy")}`
          : "Cancel reminder removed",
      });
      setOpen(false);
      onSuccess();
    },
    onError: () => {
      toast({ title: "Failed to update reminder", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={existingReminder ? `Cancel reminder: ${existingReminder}` : "Set cancel reminder"}
        >
          {existingReminder ? (
            <Bell className="w-4 h-4 text-amber-500" />
          ) : (
            <BellOff className="w-4 h-4 text-muted-foreground" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancellation Reminder</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Set a reminder to cancel <strong>{bill.name}</strong> before the next charge on{" "}
            <strong>{format(nextDue, "MMM d, yyyy")}</strong>.
          </p>

          {existingReminder && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="text-amber-700 dark:text-amber-400">
                Reminder set: Cancel by <strong>{format(parseISO(existingReminder), "MMM d, yyyy")}</strong> to avoid next charge
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reminder-date">Remind me on</Label>
            <Input
              id="reminder-date"
              type="date"
              value={reminderDate}
              onChange={(e) => setReminderDate(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            {existingReminder && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => updateMutation.mutate(null)}
                disabled={updateMutation.isPending}
              >
                <BellOff className="w-4 h-4 mr-2" />
                Remove
              </Button>
            )}
            <Button
              className="flex-1"
              onClick={() => updateMutation.mutate(reminderDate)}
              disabled={updateMutation.isPending || !reminderDate}
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Bell className="w-4 h-4 mr-2" />
              )}
              {existingReminder ? "Update Reminder" : "Set Reminder"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Subscriptions Page ──────────────────────────────────────────────────

export default function Subscriptions() {
  const { toast } = useToast();

  // Fetch all bills and filter for subscriptions
  const { data: bills = [], isLoading } = useQuery<Bill[]>({
    queryKey: ["/api/bills"],
  });

  // Filter bills that have category "Subscriptions"
  const subscriptions = bills.filter(bill => bill.category === "Subscriptions");

  const togglePauseMutation = useMutation({
    mutationFn: async ({ id, isPaused }: { id: string; isPaused: boolean }) => {
      await apiRequest("PATCH", `/api/bills/${id}`, {
        isPaused: isPaused ? "true" : "false",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
    },
    onError: () => {
      toast({ title: "Failed to update subscription", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/bills/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({ title: "Subscription deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete subscription", variant: "destructive" });
    },
  });

  // Separate active and paused subscriptions
  const activeSubscriptions = subscriptions.filter(sub => sub.isPaused !== "true");
  const pausedSubscriptions = subscriptions.filter(sub => sub.isPaused === "true");

  // Auto-detected count
  const autoDetectedCount = subscriptions.filter(isAutoDetected).length;

  // Calculate totals from active subscriptions only
  const monthlyTotal = activeSubscriptions.reduce((sum, sub) => {
    const amount = parseFloat(sub.amount);
    switch (sub.recurrence) {
      case "weekly": return sum + (amount * 52 / 12);
      case "biweekly": return sum + (amount * 26 / 12);
      case "monthly": return sum + amount;
      case "yearly": return sum + (amount / 12);
      default: return sum + amount;
    }
  }, 0);

  const yearlyTotal = monthlyTotal * 12;

  // Upcoming renewals in next 7 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7Days = addDays(today, 7);
  const upcomingRenewals = activeSubscriptions.filter(sub => {
    const nextDue = getBillNextDueDate(sub.dueDay, sub.recurrence, sub.customDates);
    return nextDue >= today && nextDue <= in7Days;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Wrap the entire page content in the gate — free users see the upgrade overlay
  return (
    <SubscriptionIntelligenceGate>
      <div className="container mx-auto px-4 py-4 sm:p-6 max-w-4xl space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-page-title">Subscriptions</h1>
              <HelpTooltip
                title="About Subscriptions"
                content="Track recurring subscription services like streaming, software, and gym memberships. Subscriptions are bills with category 'Subscriptions' that you can pause without deleting. They're included in your Monthly Bills total on the dashboard. Subscriptions flagged 'Auto-detected' were automatically created from your bank transactions."
              />
            </div>
            <p className="text-sm sm:text-base text-muted-foreground">Track your recurring subscriptions and memberships</p>
          </div>
          <div className="flex gap-2">
            <DetectSubscriptionsDialog existingSubscriptions={subscriptions} onSuccess={() => {}} />
            <AddSubscriptionDialog onSuccess={() => {}} />
          </div>
        </div>

        {/* ── Summary Banner ─────────────────────────────────────────────────── */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 flex-1">
                <div className="p-2 rounded-full bg-primary/10">
                  <TrendingDown className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">You're spending</p>
                  <p className="text-2xl font-bold text-primary" data-testid="text-monthly-summary">
                    {formatCurrency(monthlyTotal)}<span className="text-base font-normal text-muted-foreground">/month</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    on {activeSubscriptions.length} active subscription{activeSubscriptions.length !== 1 ? "s" : ""}
                    {autoDetectedCount > 0 && (
                      <span className="ml-1">
                        · <span className="text-blue-600 dark:text-blue-400">{autoDetectedCount} auto-detected</span>
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {upcomingRenewals.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span className="text-amber-700 dark:text-amber-400">
                    <strong>{upcomingRenewals.length}</strong> renewal{upcomingRenewals.length !== 1 ? "s" : ""} in the next 7 days
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Stats Cards ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card>
            <CardHeader className="p-3 sm:pb-2 sm:p-6">
              <CardDescription className="text-xs sm:text-sm">Active</CardDescription>
              <CardTitle className="text-xl sm:text-3xl" data-testid="text-active-count">{activeSubscriptions.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="p-3 sm:pb-2 sm:p-6">
              <CardDescription className="text-xs sm:text-sm">Monthly</CardDescription>
              <CardTitle className="text-lg sm:text-3xl" data-testid="text-monthly-total">{formatCurrency(monthlyTotal)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="p-3 sm:pb-2 sm:p-6">
              <CardDescription className="text-xs sm:text-sm">Yearly</CardDescription>
              <CardTitle className="text-lg sm:text-3xl" data-testid="text-yearly-total">{formatCurrency(yearlyTotal)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* ── Active Subscriptions ───────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Active Subscriptions
            </CardTitle>
            <CardDescription>
              These subscriptions are included in your Monthly Bills on the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeSubscriptions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No active subscriptions. Add one to get started.</p>
            ) : (
              <div className="space-y-3">
                {activeSubscriptions.map((sub) => {
                  const nextDue = getBillNextDueDate(sub.dueDay, sub.recurrence, sub.customDates);
                  const autoDetected = isAutoDetected(sub);
                  const cancelReminder = getCancelReminderDate(sub);
                  const isDueSoon = nextDue >= today && nextDue <= in7Days;

                  return (
                    <div
                      key={sub.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 border rounded-lg hover-elevate gap-2 sm:gap-4 ${isDueSoon ? "border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/10" : ""}`}
                      data-testid={`subscription-item-${sub.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm sm:text-base">{sub.name}</span>
                          <Badge variant="secondary" className="text-xs">{sub.recurrence}</Badge>
                          {autoDetected && (
                            <Badge variant="outline" className="text-xs border-blue-300 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30">
                              <Sparkles className="w-3 h-3 mr-1" />
                              Auto-detected
                            </Badge>
                          )}
                          {isDueSoon && (
                            <Badge variant="outline" className="text-xs border-amber-300 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
                              Due soon
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4 mt-1 text-xs sm:text-sm text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(nextDue, "MMM d")}
                          </span>
                          {sub.merchant && <span className="hidden sm:inline">{sub.merchant}</span>}
                          {cancelReminder && (
                            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <Bell className="w-3 h-3" />
                              Cancel by {format(parseISO(cancelReminder), "MMM d")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
                        <span className="text-base sm:text-lg font-bold">{formatCurrency(sub.amount)}</span>
                        <div className="flex items-center gap-1">
                          <CancelReminderDialog bill={sub} onSuccess={() => {}} />
                          <Switch
                            checked={true}
                            onCheckedChange={() => togglePauseMutation.mutate({ id: sub.id, isPaused: true })}
                            data-testid={`switch-subscription-${sub.id}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 sm:h-10 sm:w-10"
                            onClick={() => deleteMutation.mutate(sub.id)}
                            data-testid={`button-delete-${sub.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Paused Subscriptions ───────────────────────────────────────────── */}
        {pausedSubscriptions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-muted-foreground">
                <RefreshCw className="w-5 h-5" />
                Paused Subscriptions
              </CardTitle>
              <CardDescription>
                These subscriptions are NOT included in your Monthly Bills
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pausedSubscriptions.map((sub) => {
                  const autoDetected = isAutoDetected(sub);
                  return (
                    <div
                      key={sub.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 border rounded-lg opacity-60 gap-2 sm:gap-4"
                      data-testid={`subscription-paused-${sub.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm sm:text-base">{sub.name}</span>
                          <Badge variant="secondary" className="text-xs">{sub.recurrence}</Badge>
                          {autoDetected && (
                            <Badge variant="outline" className="text-xs border-blue-300 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30">
                              <Sparkles className="w-3 h-3 mr-1" />
                              Auto-detected
                            </Badge>
                          )}
                        </div>
                        {sub.merchant && (
                          <p className="text-xs sm:text-sm text-muted-foreground mt-1 hidden sm:block">{sub.merchant}</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
                        <span className="text-base sm:text-lg">{formatCurrency(sub.amount)}</span>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={false}
                            onCheckedChange={() => togglePauseMutation.mutate({ id: sub.id, isPaused: false })}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 sm:h-10 sm:w-10"
                            onClick={() => deleteMutation.mutate(sub.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </SubscriptionIntelligenceGate>
  );
}
