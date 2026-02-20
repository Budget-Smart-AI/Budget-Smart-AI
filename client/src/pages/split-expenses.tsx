import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Check, Users, ArrowRight, Wallet, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SplitExpense, SplitParticipant, HouseholdMember, User } from "@shared/schema";

interface SplitExpenseWithParticipants extends SplitExpense {
  participants: SplitParticipant[];
}

interface BalanceData {
  balances: Array<{ from: string; to: string; amount: number }>;
  members: Array<HouseholdMember & { user: User }>;
}

const splitFormSchema = z.object({
  description: z.string().min(1, "Description is required"),
  totalAmount: z.string().min(1, "Amount is required"),
  category: z.string().optional(),
  date: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
});

const settlementFormSchema = z.object({
  toUserId: z.string().min(1, "Recipient is required"),
  amount: z.string().min(1, "Amount is required"),
  notes: z.string().optional(),
});

type SplitFormValues = z.infer<typeof splitFormSchema>;
type SettlementFormValues = z.infer<typeof settlementFormSchema>;

function formatCurrency(amount: string | number | null | undefined) {
  if (!amount) return "$0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function SplitForm({
  members,
  onClose,
}: {
  members: Array<HouseholdMember & { user: User }>;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [selectedMembers, setSelectedMembers] = useState<string[]>(members.map(m => m.userId));
  const [selectedBillId, setSelectedBillId] = useState<string>("");

  // Fetch existing bills to allow selection
  const { data: bills = [] } = useQuery<any[]>({ queryKey: ["/api/bills"] });

  const form = useForm<SplitFormValues>({
    resolver: zodResolver(splitFormSchema),
    defaultValues: {
      description: "",
      totalAmount: "",
      category: "",
      date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    },
  });

  // When a bill is selected, populate the form
  const handleBillSelect = (billId: string) => {
    setSelectedBillId(billId);
    if (billId && billId !== "custom") {
      const bill = bills.find((b: any) => b.id === billId);
      if (bill) {
        form.setValue("description", bill.name);
        form.setValue("totalAmount", bill.amount);
        form.setValue("category", bill.category || "");
      }
    } else {
      form.setValue("description", "");
      form.setValue("totalAmount", "");
      form.setValue("category", "");
    }
  };

  const createMutation = useMutation({
    mutationFn: async (values: SplitFormValues) => {
      const totalAmount = parseFloat(values.totalAmount);
      const shareAmount = totalAmount / selectedMembers.length;

      const participants = selectedMembers.map(userId => ({
        userId,
        shareAmount: shareAmount.toFixed(2),
        sharePercent: (100 / selectedMembers.length).toFixed(2),
      }));

      return apiRequest("POST", "/api/split-expenses", {
        ...values,
        participants,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/split-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/split-expenses/balances"] });
      toast({ title: "Split expense created" });
      onClose();
    },
    onError: () => toast({ title: "Failed to create split", variant: "destructive" }),
  });

  const totalAmount = parseFloat(form.watch("totalAmount") || "0");
  const sharePerPerson = selectedMembers.length > 0 ? totalAmount / selectedMembers.length : 0;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
        {/* Option to select from existing bills */}
        {bills.length > 0 && (
          <div className="space-y-2">
            <FormLabel>Quick Fill from Bills</FormLabel>
            <Select value={selectedBillId} onValueChange={handleBillSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select a bill or enter custom expense" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom expense</SelectItem>
                {bills.map((bill: any) => (
                  <SelectItem key={bill.id} value={bill.id}>
                    {bill.name} - {formatCurrency(bill.amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select a recurring bill to auto-fill, or enter a custom expense
            </p>
          </div>
        )}

        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl><Input placeholder="Dinner, groceries, utilities..." {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="totalAmount" render={({ field }) => (
            <FormItem>
              <FormLabel>Total Amount</FormLabel>
              <FormControl><Input type="number" step="0.01" placeholder="100.00" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="date" render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl><Input type="date" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div>
          <FormLabel>Split Between</FormLabel>
          <div className="mt-2 space-y-2">
            {members.map(member => (
              <div
                key={member.userId}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedMembers.includes(member.userId)
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-muted-foreground/50"
                }`}
                onClick={() => {
                  if (selectedMembers.includes(member.userId)) {
                    if (selectedMembers.length > 1) {
                      setSelectedMembers(prev => prev.filter(id => id !== member.userId));
                    }
                  } else {
                    setSelectedMembers(prev => [...prev, member.userId]);
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {member.user.username?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span>{member.user.username}</span>
                </div>
                {selectedMembers.includes(member.userId) && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {formatCurrency(sharePerPerson)}
                    </span>
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes (Optional)</FormLabel>
            <FormControl><Input placeholder="Any notes..." {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending || selectedMembers.length === 0}>
            Create Split
          </Button>
        </div>
      </form>
    </Form>
  );
}

function SettleUpForm({
  members,
  currentUserId,
  suggestedTo,
  suggestedAmount,
  onClose,
}: {
  members: Array<HouseholdMember & { user: User }>;
  currentUserId: string;
  suggestedTo?: string;
  suggestedAmount?: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const otherMembers = members.filter(m => m.userId !== currentUserId);

  const form = useForm<SettlementFormValues>({
    resolver: zodResolver(settlementFormSchema),
    defaultValues: {
      toUserId: suggestedTo || otherMembers[0]?.userId || "",
      amount: suggestedAmount?.toFixed(2) || "",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: SettlementFormValues) =>
      apiRequest("POST", "/api/settlements", {
        ...values,
        fromUserId: currentUserId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/split-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/split-expenses/balances"] });
      toast({ title: "Payment recorded" });
      onClose();
    },
    onError: () => toast({ title: "Failed to record payment", variant: "destructive" }),
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
        <FormField control={form.control} name="toUserId" render={({ field }) => (
          <FormItem>
            <FormLabel>Pay To</FormLabel>
            <div className="space-y-2">
              {otherMembers.map(member => (
                <div
                  key={member.userId}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    field.value === member.userId
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/50"
                  }`}
                  onClick={() => field.onChange(member.userId)}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {member.user.username?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span>{member.user.username}</span>
                  {field.value === member.userId && <Check className="h-4 w-4 text-primary ml-auto" />}
                </div>
              ))}
            </div>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="amount" render={({ field }) => (
          <FormItem>
            <FormLabel>Amount</FormLabel>
            <FormControl><Input type="number" step="0.01" placeholder="50.00" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes (Optional)</FormLabel>
            <FormControl><Input placeholder="Venmo, cash, etc." {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending}>Record Payment</Button>
        </div>
      </form>
    </Form>
  );
}

export default function SplitExpenses() {
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [settleDialogOpen, setSettleDialogOpen] = useState(false);
  const [settleTarget, setSettleTarget] = useState<{ to: string; amount: number } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: session } = useQuery<{ userId: string; householdId?: string }>({
    queryKey: ["/api/auth/session"],
  });

  const { data: splits = [], isLoading: splitsLoading } = useQuery<SplitExpenseWithParticipants[]>({
    queryKey: ["/api/split-expenses"],
    enabled: !!session?.householdId,
  });

  const { data: balanceData, isLoading: balancesLoading } = useQuery<BalanceData>({
    queryKey: ["/api/split-expenses/balances"],
    enabled: !!session?.householdId,
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/split-expenses/${deleteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/split-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/split-expenses/balances"] });
      toast({ title: "Split expense deleted" });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const markPaidMutation = useMutation({
    mutationFn: (participantId: string) => apiRequest("PATCH", `/api/split-participants/${participantId}/pay`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/split-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/split-expenses/balances"] });
      toast({ title: "Marked as paid" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  if (!session?.householdId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Split Expenses</h1>
          <p className="text-muted-foreground">Share expenses with your household</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Household Required</h3>
            <p className="text-muted-foreground mb-4">
              You need to be part of a household to use split expenses.
              Create or join a household in Settings.
            </p>
            <Button variant="outline" asChild>
              <a href="/settings">Go to Settings</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (splitsLoading || balancesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const members = balanceData?.members || [];
  const balances = balanceData?.balances || [];
  const currentUserId = session.userId;

  // What I owe to others
  const iOwe = balances
    .filter(b => b.from === currentUserId)
    .reduce((sum, b) => sum + b.amount, 0);

  // What others owe me
  const owedToMe = balances
    .filter(b => b.to === currentUserId)
    .reduce((sum, b) => sum + b.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Split Expenses</h1>
          <p className="text-muted-foreground">Share expenses with your household</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={settleDialogOpen} onOpenChange={(open) => {
            setSettleDialogOpen(open);
            if (!open) setSettleTarget(null);
          }}>
            <DialogTrigger asChild>
              <Button variant="outline"><Wallet className="h-4 w-4 mr-2" />Settle Up</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Payment</DialogTitle>
              </DialogHeader>
              <SettleUpForm
                members={members}
                currentUserId={currentUserId}
                suggestedTo={settleTarget?.to}
                suggestedAmount={settleTarget?.amount}
                onClose={() => {
                  setSettleDialogOpen(false);
                  setSettleTarget(null);
                }}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={splitDialogOpen} onOpenChange={setSplitDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Split</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Split Expense</DialogTitle>
              </DialogHeader>
              <SplitForm members={members} onClose={() => setSplitDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Balance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className={iOwe > 0 ? "border-red-200 dark:border-red-800" : ""}>
          <CardHeader className="pb-2">
            <CardDescription>You Owe</CardDescription>
            <CardTitle className={`text-2xl ${iOwe > 0 ? "text-red-600" : ""}`}>
              {formatCurrency(iOwe)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {balances.filter(b => b.from === currentUserId).map((balance, i) => {
              const toMember = members.find(m => m.userId === balance.to);
              return (
                <div key={i} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">
                        {toMember?.user.username?.charAt(0).toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{toMember?.user.username}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSettleTarget({ to: balance.to, amount: balance.amount });
                      setSettleDialogOpen(true);
                    }}
                  >
                    Pay {formatCurrency(balance.amount)}
                  </Button>
                </div>
              );
            })}
            {iOwe === 0 && <p className="text-sm text-muted-foreground">All settled up!</p>}
          </CardContent>
        </Card>

        <Card className={owedToMe > 0 ? "border-green-200 dark:border-green-800" : ""}>
          <CardHeader className="pb-2">
            <CardDescription>Owed to You</CardDescription>
            <CardTitle className={`text-2xl ${owedToMe > 0 ? "text-green-600" : ""}`}>
              {formatCurrency(owedToMe)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {balances.filter(b => b.to === currentUserId).map((balance, i) => {
              const fromMember = members.find(m => m.userId === balance.from);
              return (
                <div key={i} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">
                        {fromMember?.user.username?.charAt(0).toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{fromMember?.user.username}</span>
                  </div>
                  <span className="text-sm font-medium text-green-600">
                    {formatCurrency(balance.amount)}
                  </span>
                </div>
              );
            })}
            {owedToMe === 0 && <p className="text-sm text-muted-foreground">No one owes you</p>}
          </CardContent>
        </Card>
      </div>

      {/* Recent Splits */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Split Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {splits.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No split expenses yet. Add one to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {splits.map(split => {
                const creator = members.find(m => m.userId === split.createdBy);

                return (
                  <div key={split.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-medium">{split.description}</h4>
                        <p className="text-sm text-muted-foreground">
                          {format(parseISO(split.date), "MMM d, yyyy")} · Paid by {creator?.user.username}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={split.status === "settled" ? "default" : "secondary"}>
                          {split.status}
                        </Badge>
                        <span className="text-lg font-bold">{formatCurrency(split.totalAmount)}</span>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteId(split.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {split.participants.map(p => {
                        const member = members.find(m => m.userId === p.userId);
                        const isPaid = p.isPaid === "true" || p.userId === split.createdBy;

                        return (
                          <div
                            key={p.id}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                              isPaid
                                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                                : "bg-muted"
                            }`}
                          >
                            <Avatar className="h-5 w-5">
                              <AvatarFallback className="text-xs">
                                {member?.user.username?.charAt(0).toUpperCase() || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span>{member?.user.username}</span>
                            <span className="font-medium">{formatCurrency(p.shareAmount)}</span>
                            {!isPaid && p.userId !== split.createdBy && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 w-5 p-0 ml-1"
                                onClick={() => markPaidMutation.mutate(p.id)}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                            )}
                            {isPaid && <Check className="h-3 w-3" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete split expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this split expense and all participant records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
