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
import { Plus, CreditCard, Calendar, Trash2, RefreshCw, Sparkles, Loader2, Check } from "lucide-react";
import { RECURRENCE_OPTIONS, type Bill } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { format, addDays, addWeeks, addMonths, parseISO, setDate, setDay, isBefore } from "date-fns";

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
      await apiRequest("POST", "/api/bills", {
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
        await apiRequest("POST", "/api/bills", {
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-4 sm:p-6 max-w-4xl space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-page-title">Subscriptions</h1>
            <HelpTooltip
              title="About Subscriptions"
              content="Track recurring subscription services like streaming, software, and gym memberships. Subscriptions are bills with category 'Subscriptions' that you can pause without deleting. They're included in your Monthly Bills total on the dashboard."
            />
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">Track your recurring subscriptions and memberships</p>
        </div>
        <div className="flex gap-2">
          <DetectSubscriptionsDialog existingSubscriptions={subscriptions} onSuccess={() => {}} />
          <AddSubscriptionDialog onSuccess={() => {}} />
        </div>
      </div>

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
                return (
                  <div
                    key={sub.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 border rounded-lg hover-elevate gap-2 sm:gap-4"
                    data-testid={`subscription-item-${sub.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm sm:text-base">{sub.name}</span>
                        <Badge variant="secondary" className="text-xs">{sub.recurrence}</Badge>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-4 mt-1 text-xs sm:text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(nextDue, "MMM d")}
                        </span>
                        {sub.merchant && <span className="hidden sm:inline">{sub.merchant}</span>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
                      <span className="text-base sm:text-lg font-bold">{formatCurrency(sub.amount)}</span>
                      <div className="flex items-center gap-2">
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
              {pausedSubscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 border rounded-lg opacity-60 gap-2 sm:gap-4"
                  data-testid={`subscription-paused-${sub.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm sm:text-base">{sub.name}</span>
                      <Badge variant="secondary" className="text-xs">{sub.recurrence}</Badge>
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
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
