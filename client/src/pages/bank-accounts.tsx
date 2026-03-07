import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Building2,
  RefreshCw,
  Link2,
  Unlink,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Pencil,
  History,
  RotateCcw,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EXPENSE_CATEGORIES, BILL_CATEGORIES, MANUAL_ACCOUNT_TYPES, MX_SUPPORTED_COUNTRIES, type PlaidTransaction, type ManualAccount, type ManualTransaction } from "@shared/schema";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Wallet, Trash2, Upload, Download, Banknote, CreditCard as CreditCardIcon, TrendingUp } from "lucide-react";
import { TransactionDrilldown } from "@/components/transaction-drilldown";
import { BankProviderSelectionDialog } from "@/components/bank-provider-selection";

// Category color map mirrors server/merchant-categories.ts CATEGORY_COLORS
const CATEGORY_COLORS: Record<string, string> = {
  'Food & Dining':    '#f97316',
  'Shopping':         '#3b82f6',
  'Transportation':   '#a855f7',
  'Housing':          '#22c55e',
  'Health & Wellness':'#ec4899',
  'Entertainment':    '#eab308',
  'Subscriptions':    '#06b6d4',
  'Financial':        '#6b7280',
  'Income':           '#10b981',
  'Personal Care':    '#f43f5e',
  'Education':        '#6366f1',
  'Travel':           '#0ea5e9',
  'Gifts & Donations':'#8b5cf6',
  'Transfers':        '#64748b',
  'Other':            '#71717a',
};

const CATEGORY_TAXONOMY: Record<string, string[]> = {
  'Food & Dining': ['Groceries','Supermarket','Restaurants','Fast Food','Coffee Shops','Bars & Alcohol','Food Delivery','Meal Kits'],
  'Shopping': ['Online Shopping','Clothing & Apparel','Electronics','Home & Garden','Sporting Goods','Pharmacies','Department Stores','Wholesale Clubs'],
  'Transportation': ['Gas & Fuel','Parking','Rideshare','Public Transit','Auto Insurance','Auto Maintenance','Car Payments','Tolls'],
  'Housing': ['Rent','Mortgage','Home Insurance','Home Maintenance','Utilities - Electric','Utilities - Gas','Utilities - Water','Internet','Cable & Satellite'],
  'Health & Wellness': ['Doctor & Medical','Dental','Vision','Pharmacy & Prescriptions','Health Insurance','Gym & Fitness','Mental Health'],
  'Entertainment': ['Streaming Services','Gaming','Movies & Events','Music','Sports & Recreation','Hobbies'],
  'Subscriptions': ['Software & Apps','News & Magazines','Cloud Storage','Membership Clubs'],
  'Financial': ['Bank Fees','ATM Withdrawals','Credit Card Payments','Loan Payments','Investment Contributions','Tax Payments'],
  'Income': ['Salary & Wages','Freelance Income','Business Income','Investment Returns','Government Benefits','Refunds & Cashback'],
  'Personal Care': ['Hair & Beauty','Spa & Massage','Personal Products'],
  'Education': ['Tuition & Fees','Books & Supplies','Online Courses','Childcare'],
  'Travel': ['Hotels & Lodging','Flights','Vacation Packages','Travel Insurance','Car Rental'],
  'Gifts & Donations': ['Charitable Donations','Gifts','Religious Contributions'],
  'Transfers': ['Account Transfers','E-Transfers','Peer Payments'],
  'Other': ['Uncategorized','Miscellaneous'],
};

function formatCurrency(amount: string | number, currency: string = "CAD") {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency,
  }).format(num);
}

interface PlaidAccountGroup {
  id: string;
  institutionName: string | null;
  institutionId: string | null;
  status: string | null;
  accounts: Array<{
    id: string;
    plaidItemId: string;
    accountId: string;
    name: string;
    officialName: string | null;
    type: string;
    subtype: string | null;
    mask: string | null;
    balanceCurrent: string | null;
    balanceAvailable: string | null;
    balanceLimit: string | null;
    isoCurrencyCode: string | null;
    lastSynced: string | null;
    isActive: string | null;
  }>;
}

interface MxMemberGroup {
  id: string;
  memberGuid: string;
  institutionName: string;
  institutionCode: string;
  connectionStatus: string | null;
  aggregatedAt: string | null;
  accounts: Array<{
    id: string;
    accountGuid: string;
    name: string;
    type: string;
    subtype: string | null;
    balance: string | null;
    availableBalance: string | null;
    creditLimit: string | null;
    currencyCode: string | null;
    isActive: string | null;
    mask: string | null;
    lastSynced: string | null;
  }>;
}

type SortKey = "date" | "name" | "amount" | "matchType" | "personalCategory";

function PlaidLinkButton({ onSuccess, autoOpen = false }: { onSuccess: () => void; autoOpen?: boolean }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [limitError, setLimitError] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch link token
  useEffect(() => {
    async function fetchLinkToken() {
      try {
        const res = await apiRequest("POST", "/api/plaid/create-link-token");
        const data = await res.json();
        if (data.link_token) {
          setLinkToken(data.link_token);
          setLimitError(null);
        } else if (data.error) {
          setLimitError(data.message || data.error);
        }
      } catch (error: any) {
        // Handle 403 limit error
        if (error?.message?.includes("limit")) {
          setLimitError(error.message);
        } else {
          console.error("Error fetching link token:", error);
        }
      }
    }
    fetchLinkToken();
  }, []);

  const onPlaidSuccess = useCallback(async (publicToken: string, metadata: any) => {
    try {
      await apiRequest("POST", "/api/plaid/exchange-token", {
        public_token: publicToken,
        metadata: {
          institution: metadata.institution,
        },
      });
      toast({ title: "Bank account connected successfully" });
      onSuccess();
    } catch (error) {
      toast({ title: "Failed to connect bank account", variant: "destructive" });
    }
  }, [onSuccess, toast]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
  });

  const handleOpenPlaid = () => {
    setShowWarning(false);
    open();
  };

  // Auto-open when autoOpen prop is true and ready
  useEffect(() => {
    if (autoOpen && ready && linkToken && !showWarning) {
      // Auto-open the Plaid connection
      open();
    }
  }, [autoOpen, ready, linkToken, showWarning, open]);

  // If limit reached, show disabled button with tooltip
  if (limitError) {
    return (
      <Button disabled className="gap-2" title={limitError}>
        <Link2 className="h-4 w-4" />
        Bank Limit Reached
      </Button>
    );
  }

  return (
    <>
      <Button onClick={() => setShowWarning(true)} disabled={!ready || !linkToken} className="gap-2">
        <Link2 className="h-4 w-4" />
        Connect Bank Account
      </Button>
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Connect Bank Account</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">You'll be redirected to securely connect your bank through Plaid.</span>
              <span className="block bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-amber-800 dark:text-amber-200 text-sm">
                <strong>Shared computer?</strong> If others use this browser with their own accounts, please use a private/incognito window to prevent bank login conflicts.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleOpenPlaid}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// MX Connect Widget Button
function MXConnectButton({ onSuccess, autoOpen = false }: { onSuccess: () => void; autoOpen?: boolean }) {
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null);
  const [showWidget, setShowWidget] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const openMXConnect = async () => {
    setLoading(true);
    try {
      const res = await apiRequest("GET", "/api/mx/connect-widget");
      const data = await res.json();
      if (data.widgetUrl) {
        setWidgetUrl(data.widgetUrl);
        setShowWidget(true);
      } else {
        toast({ title: "Failed to get connect widget", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: error.message || "Failed to connect", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Auto-open when autoOpen prop is true
  useEffect(() => {
    if (autoOpen && !showWidget && !loading) {
      openMXConnect();
    }
  }, [autoOpen, showWidget, loading]);

  // Handle postMessage from MX widget
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // MX widget sends messages when connection completes
      if (event.data?.mx === true) {
        const { type, metadata } = event.data;
        if (type === "mx/connect/memberConnected") {
          // Sync the new member
          try {
            const memberGuid = metadata?.member_guid;
            if (memberGuid) {
              await apiRequest("POST", `/api/mx/members/${memberGuid}/sync`);
              // Sync transactions
              await apiRequest("POST", "/api/mx/transactions/sync");
              toast({ title: "Bank account connected successfully" });
              onSuccess();
            }
          } catch (error) {
            toast({ title: "Connected, syncing data...", description: "Transactions will sync in background" });
          }
          setShowWidget(false);
        } else if (type === "mx/connect/loaded") {
          console.log("MX Connect widget loaded");
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onSuccess, toast]);

  return (
    <>
      <Button onClick={openMXConnect} disabled={loading} className="gap-2" variant="outline">
        <Building2 className="h-4 w-4" />
        {loading ? "Loading..." : "Connect via MX"}
      </Button>
      
      <Dialog open={showWidget} onOpenChange={setShowWidget}>
        <DialogContent className="max-w-2xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>Connect Your Bank</DialogTitle>
          </DialogHeader>
          {widgetUrl && (
            <iframe
              src={widgetUrl}
              className="w-full h-full border-0 rounded-lg"
              title="MX Connect"
              allow="camera; microphone"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReconcileDialog({
  transaction,
  open,
  onOpenChange,
  bills,
  expenses,
  incomes,
  isEditMode = false,
  categories = EXPENSE_CATEGORIES as unknown as string[],
}: {
  transaction: PlaidTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bills: any[];
  expenses: any[];
  incomes: any[];
  isEditMode?: boolean;
  categories?: readonly string[] | string[];
}) {
  const [matchType, setMatchType] = useState<string>("unmatched");
  const [matchedId, setMatchedId] = useState<string>("");
  const [category, setCategory] = useState<string>("Other");
  const [updateIncomeAmount, setUpdateIncomeAmount] = useState<boolean>(true);
  const { toast } = useToast();

  // Initialize values when editing an already reconciled transaction
  useEffect(() => {
    if (transaction && isEditMode) {
      setMatchType(transaction.matchType || "unmatched");
      setCategory(transaction.personalCategory || "Other");
      // Set matched ID based on type
      if (transaction.matchType === "bill" && transaction.matchedBillId) {
        setMatchedId(transaction.matchedBillId);
      } else if (transaction.matchType === "expense" && transaction.matchedExpenseId) {
        setMatchedId(transaction.matchedExpenseId);
      } else if (transaction.matchType === "income" && transaction.matchedIncomeId) {
        setMatchedId(transaction.matchedIncomeId);
      } else {
        setMatchedId("");
      }
    } else if (transaction && !isEditMode) {
      // Reset for new reconciliation
      setMatchType("unmatched");
      setMatchedId("");
      setCategory(transaction.personalCategory || "Other");
    }
  }, [transaction, isEditMode]);

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      if (!transaction) return;
      if (matchType === "unmatched" && !isEditMode) {
        // When marking as "Other Expense", create an expense entry automatically
        await apiRequest("POST", `/api/plaid/transactions/${transaction.id}/create-expense`, {
          category,
        });
      } else {
        // For edit mode or matching to an existing item, use reconcile endpoint
        await apiRequest("POST", `/api/plaid/transactions/${transaction.id}/reconcile`, {
          matchType,
          matchedId: matchedId || undefined,
          personalCategory: category,
          updateIncomeAmount: matchType === "income" ? updateIncomeAmount : undefined,
        });
      }
    },
    onSuccess: () => {
      // Use predicate to invalidate all transaction queries regardless of parameters
      queryClient.invalidateQueries({ predicate: (query) => 
        (query.queryKey[0] as string)?.startsWith?.("/api/plaid/transactions") ?? false
      });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      toast({ 
        title: isEditMode 
          ? "Reconciliation updated" 
          : matchType === "unmatched" 
            ? "Added to Other Expenses" 
            : "Transaction reconciled" 
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to reconcile", variant: "destructive" });
    },
  });

  if (!transaction) return null;

  const txAmount = parseFloat(transaction.amount);
  const isDebit = txAmount > 0;

  // Get candidates based on match type
  const getCandidates = () => {
    if (matchType === "bill") return bills;
    if (matchType === "expense") return expenses;
    if (matchType === "income") return incomes;
    return [];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Reconciliation" : "Reconcile Transaction"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted p-3 rounded-lg space-y-1">
            <div className="flex items-center gap-3">
              {transaction.logoUrl ? (
                <img
                  src={transaction.logoUrl}
                  alt=""
                  className="w-10 h-10 rounded-full object-contain bg-white"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center">
                  <span className="text-lg font-medium text-muted-foreground">
                    {(transaction.merchantName || transaction.name).charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <p className="font-medium">{transaction.merchantName || transaction.name}</p>
                <p className="text-sm text-muted-foreground">{transaction.date}</p>
              </div>
            </div>
            <p className={`text-lg font-bold ${isDebit ? "text-red-600" : "text-green-600"}`}>
              {isDebit ? "-" : "+"}{formatCurrency(Math.abs(txAmount), transaction.isoCurrencyCode || "CAD")}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Match Type</label>
            <Select value={matchType} onValueChange={(v) => { setMatchType(v); setMatchedId(""); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bill">Match to Bill</SelectItem>
                <SelectItem value="expense">Match to Expense</SelectItem>
                <SelectItem value="income">Match to Income</SelectItem>
                <SelectItem value="unmatched">Keep as Other Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {matchType !== "unmatched" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Match</label>
              <Select value={matchedId} onValueChange={setMatchedId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {getCandidates().map((item: any) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name || item.merchant || item.source} - {formatCurrency(item.amount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {matchType === "income" && matchedId && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Checkbox
                id="updateIncomeAmount"
                checked={updateIncomeAmount}
                onCheckedChange={(checked) => setUpdateIncomeAmount(checked === true)}
                data-testid="checkbox-update-income"
              />
              <label htmlFor="updateIncomeAmount" className="text-sm cursor-pointer">
                Update income entry with this transaction amount ({formatCurrency(Math.abs(parseFloat(transaction?.amount || "0")))})
              </label>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => reconcileMutation.mutate()}
              disabled={reconcileMutation.isPending || (matchType !== "unmatched" && !matchedId)}
              className="flex-1"
              data-testid="button-save-reconcile"
            >
              {isEditMode
                ? "Save Changes"
                : matchType === "unmatched"
                  ? "Add to Other Expenses"
                  : "Match"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Manual Account Type Icons
const ACCOUNT_TYPE_ICONS: Record<string, React.ReactNode> = {
  cash: <Banknote className="h-4 w-4" />,
  paypal: <Wallet className="h-4 w-4" />,
  venmo: <Wallet className="h-4 w-4" />,
  other: <CreditCardIcon className="h-4 w-4" />,
};

// Manual Account Dialog for Create/Edit
function ManualAccountDialog({
  open,
  onOpenChange,
  account,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: ManualAccount | null;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("cash");
  const [balance, setBalance] = useState("0");
  const { toast } = useToast();

  useEffect(() => {
    if (account) {
      setName(account.name);
      setType(account.type);
      setBalance(account.balance || "0");
    } else {
      setName("");
      setType("cash");
      setBalance("0");
    }
  }, [account, open]);

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/accounts/manual", { name, type, balance });
    },
    onSuccess: () => {
      toast({ title: "Manual account created" });
      onOpenChange(false);
      onSuccess();
    },
    onError: () => {
      toast({ title: "Failed to create account", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/accounts/manual/${account?.id}`, { name, type, balance });
    },
    onSuccess: () => {
      toast({ title: "Account updated" });
      onOpenChange(false);
      onSuccess();
    },
    onError: () => {
      toast({ title: "Failed to update account", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? "Edit Account" : "Add Manual Account"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="account-name">Account Name</Label>
            <Input
              id="account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Cash, PayPal Balance"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-type">Account Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    <div className="flex items-center gap-2">
                      {ACCOUNT_TYPE_ICONS[t]}
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="starting-balance">Starting Balance</Label>
            <Input
              id="starting-balance"
              type="number"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => account ? updateMutation.mutate() : createMutation.mutate()}
            disabled={!name || createMutation.isPending || updateMutation.isPending}
          >
            {account ? "Save" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Manual Transaction Dialog
function ManualTransactionDialog({
  open,
  onOpenChange,
  account,
  transaction,
  onSuccess,
  categories = EXPENSE_CATEGORIES as unknown as string[],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: ManualAccount | null;
  transaction?: ManualTransaction | null;
  onSuccess: () => void;
  categories?: readonly string[] | string[];
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState<string>("Other");
  const [notes, setNotes] = useState("");
  const [isDeposit, setIsDeposit] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (transaction) {
      const txAmount = parseFloat(transaction.amount);
      setIsDeposit(txAmount < 0);
      setAmount(Math.abs(txAmount).toString());
      setDate(transaction.date);
      setMerchant(transaction.merchant);
      setCategory(transaction.category || "Other");
      setNotes(transaction.notes || "");
    } else {
      setAmount("");
      setDate(format(new Date(), "yyyy-MM-dd"));
      setMerchant("");
      setCategory("Other");
      setNotes("");
      setIsDeposit(false);
    }
  }, [transaction, open]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const finalAmount = isDeposit ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount));
      await apiRequest("POST", "/api/transactions/manual", {
        accountId: account?.id,
        amount: finalAmount.toString(),
        date,
        merchant,
        category,
        notes: notes || null,
      });
    },
    onSuccess: () => {
      toast({ title: "Transaction added" });
      onOpenChange(false);
      onSuccess();
    },
    onError: () => {
      toast({ title: "Failed to add transaction", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const finalAmount = isDeposit ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount));
      await apiRequest("PATCH", `/api/transactions/manual/${transaction?.id}`, {
        amount: finalAmount.toString(),
        date,
        merchant,
        category,
        notes: notes || null,
      });
    },
    onSuccess: () => {
      toast({ title: "Transaction updated" });
      onOpenChange(false);
      onSuccess();
    },
    onError: () => {
      toast({ title: "Failed to update transaction", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/transactions/manual/${transaction?.id}`);
    },
    onSuccess: () => {
      toast({ title: "Transaction deleted" });
      onOpenChange(false);
      onSuccess();
    },
    onError: () => {
      toast({ title: "Failed to delete transaction", variant: "destructive" });
    },
  });

  if (!account) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {transaction ? "Edit Transaction" : `Add Transaction to ${account.name}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={!isDeposit ? "default" : "outline"}
              className="flex-1"
              onClick={() => setIsDeposit(false)}
            >
              Expense
            </Button>
            <Button
              type="button"
              variant={isDeposit ? "default" : "outline"}
              className="flex-1"
              onClick={() => setIsDeposit(true)}
            >
              Deposit
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tx-amount">Amount</Label>
              <Input
                id="tx-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tx-date">Date</Label>
              <Input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tx-merchant">Merchant / Description</Label>
            <Input
              id="tx-merchant"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="e.g., Grocery Store"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tx-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tx-notes">Notes (optional)</Label>
            <Input
              id="tx-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
            />
          </div>
        </div>
        <div className="flex justify-between">
          {transaction && (
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => transaction ? updateMutation.mutate() : createMutation.mutate()}
              disabled={!amount || !merchant || createMutation.isPending || updateMutation.isPending}
            >
              {transaction ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BankAccounts() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [search, setSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "date",
    direction: "desc",
  });
  const [reconcileTransaction, setReconcileTransaction] = useState<PlaidTransaction | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [disconnectItemId, setDisconnectItemId] = useState<string | null>(null);
  const [disconnectMxMemberId, setDisconnectMxMemberId] = useState<string | null>(null);
  const [drilldownTransaction, setDrilldownTransaction] = useState<PlaidTransaction | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Manual accounts state
  const [activeTab, setActiveTab] = useState("bank");
  const [showManualAccountDialog, setShowManualAccountDialog] = useState(false);
  
  // Provider selection state
  const [showProviderSelection, setShowProviderSelection] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<"plaid" | "mx" | null>(null);
  const [editingManualAccount, setEditingManualAccount] = useState<ManualAccount | null>(null);
  const [selectedManualAccount, setSelectedManualAccount] = useState<ManualAccount | null>(null);
  const [showManualTxDialog, setShowManualTxDialog] = useState(false);
  const [editingManualTx, setEditingManualTx] = useState<ManualTransaction | null>(null);
  const [deleteManualAccountId, setDeleteManualAccountId] = useState<string | null>(null);

  const startDate = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const endDate = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  // Fetch user session to get country for bank provider selection
  const { data: session, isLoading: sessionLoading } = useQuery<{ 
    authenticated: boolean;
    country?: string;
  }>({
    queryKey: ["/api/auth/session"],
  });
  
  // Determine which bank provider to use based on user's country
  // Only show provider when session is loaded, otherwise null (will defer render)
  const userCountry = session?.country;
  const useMxProvider = userCountry ? MX_SUPPORTED_COUNTRIES.includes(userCountry as typeof MX_SUPPORTED_COUNTRIES[number]) : null;

  // Fetch connected Plaid accounts
  const { data: accountGroups = [], isLoading: accountsLoading } = useQuery<PlaidAccountGroup[]>({
    queryKey: ["/api/plaid/accounts"],
  });

  // Fetch connected MX accounts (bank aggregation)
  const { data: mxMembers = [], isLoading: mxAccountsLoading } = useQuery<MxMemberGroup[]>({
    queryKey: ["/api/mx/members"],
  });

  // Fetch transactions for current month
  const { data: transactions = [], isLoading: transactionsLoading } = useQuery<PlaidTransaction[]>({
    queryKey: ["/api/plaid/transactions", `?startDate=${startDate}&endDate=${endDate}`],
  });

  // Fetch bills, expenses, income for reconciliation dialog
  const { data: bills = [] } = useQuery<any[]>({ queryKey: ["/api/bills"] });
  const { data: expenses = [] } = useQuery<any[]>({ queryKey: ["/api/expenses"] });
  const { data: incomes = [] } = useQuery<any[]>({ queryKey: ["/api/income"] });

  // Fetch custom categories
  const { data: customCategories = [] } = useQuery<{ id: string; name: string; type: string; color: string }[]>({
    queryKey: ["/api/custom-categories"],
  });

  // Combine default and custom expense categories
  const allExpenseCategories = useMemo(() => {
    const customExpenseNames = customCategories
      .filter(c => c.type === "expense")
      .map(c => c.name);
    return [...EXPENSE_CATEGORIES, ...customExpenseNames];
  }, [customCategories]);

  // Fetch manual accounts
  const { data: manualAccounts = [], isLoading: manualAccountsLoading } = useQuery<ManualAccount[]>({
    queryKey: ["/api/accounts/manual"],
  });

  // Fetch transactions for selected manual account
  const { data: manualTransactions = [], isLoading: manualTxLoading } = useQuery<ManualTransaction[]>({
    queryKey: ["/api/transactions/manual/account", selectedManualAccount?.id, `?startDate=${startDate}&endDate=${endDate}`],
    enabled: !!selectedManualAccount,
  });

  // Delete manual account mutation
  const deleteManualAccountMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/accounts/manual/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts/manual"] });
      toast({ title: "Account deleted" });
      setDeleteManualAccountId(null);
      if (selectedManualAccount?.id === deleteManualAccountId) {
        setSelectedManualAccount(null);
      }
    },
    onError: () => {
      toast({ title: "Failed to delete account", variant: "destructive" });
    },
  });

  // Refresh balances mutation
  const refreshBalancesMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/plaid/accounts/refresh-balances");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
      toast({ title: "Balances refreshed" });
    },
    onError: () => {
      toast({ title: "Failed to refresh balances", variant: "destructive" });
    },
  });

  // Sync transactions mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/plaid/transactions/sync");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/transactions"] });
      toast({ title: `Synced: ${data.added} new, ${data.modified} updated, ${data.removed} removed` });
    },
    onError: () => {
      toast({ title: "Failed to sync transactions", variant: "destructive" });
    },
  });

  // Fetch historical transactions mutation (2 years)
  const fetchHistoricalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/plaid/transactions/fetch-historical");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/transactions"] });
      const dateRange = data.dateRange 
        ? `Data available: ${data.dateRange.oldest} to ${data.dateRange.newest}`
        : "";
      toast({ 
        title: `Fetched ${data.added} new transactions`,
        description: `${data.skipped} already existed. ${dateRange}${data.errors?.length ? ` Errors: ${data.errors.join(", ")}` : ""}`,
      });
    },
    onError: () => {
      toast({ title: "Failed to fetch historical transactions", variant: "destructive" });
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("DELETE", `/api/plaid/items/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/transactions"] });
      toast({ title: "Bank account disconnected" });
      setDisconnectItemId(null);
    },
    onError: () => {
      toast({ title: "Failed to disconnect", variant: "destructive" });
    },
  });

  // Toggle account active status
  const toggleAccountMutation = useMutation({
    mutationFn: async ({ accountId, isActive }: { accountId: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/plaid/accounts/${accountId}/toggle-active`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
    },
    onError: () => {
      toast({ title: "Failed to update account status", variant: "destructive" });
    },
  });

  // MX account toggle mutation
  const toggleMxAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      await apiRequest("PATCH", `/api/mx/accounts/${accountId}/toggle`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mx/members"] });
    },
    onError: () => {
      toast({ title: "Failed to update account status", variant: "destructive" });
    },
  });

  // MX member disconnect mutation
  const disconnectMxMutation = useMutation({
    mutationFn: async (memberId: string) => {
      await apiRequest("DELETE", `/api/mx/members/${memberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mx/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mx/transactions"] });
      toast({ title: "Bank account disconnected" });
      setDisconnectMxMemberId(null);
    },
    onError: () => {
      toast({ title: "Failed to disconnect account", variant: "destructive" });
    },
  });

  // Bulk add to other expenses
  const bulkCreateMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/plaid/transactions/bulk-create-expenses", {
        transactionIds: ids,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({ title: `${data.created} transactions added to Other Expenses` });
      setSelectedIds(new Set());
    },
    onError: () => {
      toast({ title: "Failed to add to Other Expenses", variant: "destructive" });
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAccountConnected = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/mx/members"] });
    queryClient.invalidateQueries({ queryKey: ["/api/mx/transactions"] });
    // Reset selected provider after successful connection
    setSelectedProvider(null);
  };

  const handleProviderSelected = (provider: "plaid" | "mx") => {
    setSelectedProvider(provider);
    setShowProviderSelection(false);
    // The selected provider button will now auto-open
  };

  const handleManualAccountSelected = () => {
    setShowProviderSelection(false);
    setEditingManualAccount(null);
    setShowManualAccountDialog(true);
  };

  // Filter and sort transactions
  const filteredTransactions = transactions
    .filter((tx) => {
      const matchesSearch = ((tx as any).merchantCleanName || tx.merchantName || tx.name).toLowerCase().includes(search.toLowerCase());
      const matchesFilter = matchFilter === "all"
        ? true
        : matchFilter === "needs_review"
          ? (tx as any).needsReview === true
          : tx.matchType === matchFilter;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      const direction = sortConfig.direction === "asc" ? 1 : -1;
      switch (sortConfig.key) {
        case "date":
          return (a.date > b.date ? 1 : -1) * direction;
        case "name":
          return ((a.merchantName || a.name).localeCompare(b.merchantName || b.name)) * direction;
        case "amount":
          return (parseFloat(a.amount) - parseFloat(b.amount)) * direction;
        case "matchType":
          return ((a.matchType || "").localeCompare(b.matchType || "")) * direction;
        case "personalCategory":
          return ((a.personalCategory || "").localeCompare(b.personalCategory || "")) * direction;
        default:
          return 0;
      }
    });

  // Calculate net worth: assets - liabilities (only active accounts)
  // Liability account types: credit, loan, mortgage
  const liabilityTypes = ["credit", "loan", "mortgage"];
  
  const totalBalance = accountGroups.reduce((sum, group) => {
    return sum + group.accounts
      .filter(acc => acc.isActive !== "false") // Only active accounts
      .reduce((accSum, acc) => {
        const balance = acc.balanceCurrent ? parseFloat(acc.balanceCurrent) : 0;
        // Liabilities (credit cards, loans, mortgages) should be subtracted
        const isLiability = liabilityTypes.includes(acc.type.toLowerCase());
        return accSum + (isLiability ? -balance : balance);
      }, 0);
  }, 0);

  const monthlySpending = transactions
    .filter(tx => parseFloat(tx.amount) > 0)
    .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

  const monthlyIncome = transactions
    .filter(tx => parseFloat(tx.amount) < 0)
    .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount)), 0);

  const unmatchedCount = transactions.filter(tx => tx.matchType === "unmatched").length;

  const selectableTransactions = filteredTransactions.filter(tx => tx.matchType === "unmatched" || tx.reconciled !== "true");

  const toggleSelectAll = () => {
    if (selectedIds.size === selectableTransactions.length && selectableTransactions.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableTransactions.map(tx => tx.id)));
    }
  };

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
    <div className="space-y-4 sm:space-y-6 px-1 sm:px-0">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-5 w-5 sm:h-8 sm:w-8" />
            Accounts
            <HelpTooltip
              title="About Accounts"
              content="Manage all your financial accounts in one place. Connect bank accounts via Plaid for automatic transaction syncing, or add manual accounts (Cash, PayPal, Venmo) to track non-bank spending."
            />
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Manage connected bank accounts and manual accounts
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeTab === "bank" && accountGroups.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refreshBalancesMutation.mutate()}
                disabled={refreshBalancesMutation.isPending}
                className="gap-1 text-xs sm:text-sm"
              >
                <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 ${refreshBalancesMutation.isPending ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="gap-1 text-xs sm:text-sm"
              >
                <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Sync</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchHistoricalMutation.mutate()}
                disabled={fetchHistoricalMutation.isPending}
                className="gap-1 text-xs sm:text-sm"
                data-testid="button-fetch-historical"
              >
                <History className={`h-3 w-3 sm:h-4 sm:w-4 ${fetchHistoricalMutation.isPending ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">2 Years</span>
              </Button>
            </>
          )}
          {activeTab === "bank" && (
            <div className="flex gap-2">
              {selectedProvider === null ? (
                <Button 
                  onClick={() => setShowProviderSelection(true)} 
                  className="gap-2"
                >
                  <Link2 className="h-4 w-4" />
                  Connect Bank Account
                </Button>
              ) : selectedProvider === "mx" ? (
                <MXConnectButton onSuccess={handleAccountConnected} autoOpen={true} />
              ) : (
                <PlaidLinkButton onSuccess={handleAccountConnected} autoOpen={true} />
              )}
            </div>
          )}
          {activeTab === "manual" && (
            <Button onClick={() => { setEditingManualAccount(null); setShowManualAccountDialog(true); }} className="gap-2 text-xs sm:text-sm">
              <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Add Manual Account</span>
              <span className="sm:hidden">Add</span>
            </Button>
          )}
        </div>
      </div>

      {/* Tabs for Bank vs Manual */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="bank" className="gap-2">
            <Building2 className="h-4 w-4" />
            Connected Banks
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-2">
            <Wallet className="h-4 w-4" />
            Manual Accounts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-4 sm:space-y-6 mt-4 sm:mt-6">
          {/* Manual Accounts Grid */}
          {manualAccountsLoading ? (
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-28 sm:h-32" />
              <Skeleton className="h-28 sm:h-32" />
            </div>
          ) : manualAccounts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12 text-center px-4">
                <Wallet className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-3 sm:mb-4" />
                <h3 className="text-base sm:text-lg font-semibold mb-2">No Manual Accounts</h3>
                <p className="text-sm sm:text-base text-muted-foreground mb-4">
                  Add manual accounts to track cash, PayPal, Venmo, or other non-bank spending.
                </p>
                <Button onClick={() => { setEditingManualAccount(null); setShowManualAccountDialog(true); }} className="gap-2 text-sm">
                  <Plus className="h-4 w-4" />
                  Add Manual Account
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {manualAccounts.map((account) => (
                  <Card
                    key={account.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${selectedManualAccount?.id === account.id ? "ring-2 ring-primary" : ""}`}
                    onClick={() => setSelectedManualAccount(account)}
                  >
                    <CardHeader className="p-3 sm:pb-2 sm:p-6">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                          {ACCOUNT_TYPE_ICONS[account.type] || <Wallet className="h-4 w-4" />}
                          {account.name}
                        </CardTitle>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px] sm:text-xs capitalize">
                            {account.type}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 sm:h-7 sm:w-7"
                            onClick={(e) => { e.stopPropagation(); setEditingManualAccount(account); setShowManualAccountDialog(true); }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 sm:h-7 sm:w-7 text-destructive"
                            onClick={(e) => { e.stopPropagation(); setDeleteManualAccountId(account.id); }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                      <div className="text-xl sm:text-2xl font-bold">
                        {formatCurrency(account.balance || "0", account.currency || "USD")}
                      </div>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                        Tap to view transactions
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Selected Account Transactions */}
              {selectedManualAccount && (
                <Card>
                  <CardHeader className="p-3 sm:p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                        {ACCOUNT_TYPE_ICONS[selectedManualAccount.type]}
                        <span className="truncate">{selectedManualAccount.name}</span>
                      </CardTitle>
                      <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                        <Button variant="outline" size="icon" className="h-8 w-8 sm:h-10 sm:w-10" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                          <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                        <span className="text-xs sm:text-sm font-medium min-w-[80px] sm:min-w-[120px] text-center">
                          {format(currentMonth, "MMM yyyy")}
                        </span>
                        <Button variant="outline" size="icon" className="h-8 w-8 sm:h-10 sm:w-10" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                          <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                        <Button onClick={() => { setEditingManualTx(null); setShowManualTxDialog(true); }} className="gap-1 sm:gap-2 ml-1 sm:ml-2 text-xs sm:text-sm h-8 sm:h-10">
                          <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                          <span className="hidden sm:inline">Add Transaction</span>
                          <span className="sm:hidden">Add</span>
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                    {manualTxLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ) : manualTransactions.length === 0 ? (
                      <div className="text-center py-6 sm:py-8 text-muted-foreground text-sm">
                        No transactions this month. Tap "Add" to get started.
                      </div>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs sm:text-sm">Date</TableHead>
                              <TableHead className="text-xs sm:text-sm">Merchant</TableHead>
                              <TableHead className="text-xs sm:text-sm">Amount</TableHead>
                              <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Category</TableHead>
                              <TableHead className="text-xs sm:text-sm">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {manualTransactions.map((tx) => {
                              const amount = parseFloat(tx.amount);
                              const isDebit = amount > 0;
                              return (
                                <TableRow key={tx.id}>
                                  <TableCell className="text-xs sm:text-sm p-2 sm:p-4 whitespace-nowrap">{tx.date}</TableCell>
                                  <TableCell className="p-2 sm:p-4">
                                    <div>
                                      <p className="text-xs sm:text-sm font-medium truncate max-w-[100px] sm:max-w-none">{tx.merchant}</p>
                                    </div>
                                  </TableCell>
                                  <TableCell className={`font-medium text-xs sm:text-sm p-2 sm:p-4 whitespace-nowrap ${isDebit ? "text-red-600" : "text-green-600"}`}>
                                    {isDebit ? "-" : "+"}{formatCurrency(Math.abs(amount))}
                                  </TableCell>
                                  <TableCell className="hidden sm:table-cell p-2 sm:p-4">
                                    <Badge variant="outline" className="text-xs">
                                      {tx.category || "Other"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="p-2 sm:p-4">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 sm:h-9 sm:w-9 p-0"
                                      onClick={() => { setEditingManualTx(tx); setShowManualTxDialog(true); }}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="bank" className="space-y-6 mt-6">

      {/* Summary Cards */}
      {accountGroups.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:pb-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium">Net Worth</CardTitle>
              <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">{formatCurrency(totalBalance)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:pb-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium">Spending</CardTitle>
              <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-red-500" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold text-red-600">{formatCurrency(monthlySpending)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:pb-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium">Income</CardTitle>
              <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-green-500" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold text-green-600">{formatCurrency(monthlyIncome)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:pb-2 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium">Unmatched</CardTitle>
              <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-500" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold text-yellow-600">{unmatchedCount}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Connected Accounts */}
      {accountsLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (accountGroups.length === 0 && mxMembers.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Bank Accounts Connected</h3>
            <p className="text-muted-foreground mb-4">
              Connect your bank accounts to automatically import and categorize transactions.
            </p>
            <div className="flex gap-2">
              {selectedProvider === null ? (
                <Button 
                  onClick={() => setShowProviderSelection(true)} 
                  className="gap-2"
                >
                  <Link2 className="h-4 w-4" />
                  Connect Bank Account
                </Button>
              ) : selectedProvider === "mx" ? (
                <MXConnectButton onSuccess={handleAccountConnected} autoOpen={true} />
              ) : (
                <PlaidLinkButton onSuccess={handleAccountConnected} autoOpen={true} />
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {accountGroups.map((group) => (
            <Card key={group.id}>
              <CardHeader className="p-3 sm:pb-2 sm:p-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                    <Building2 className="h-3 w-3 sm:h-4 sm:w-4" />
                    {group.institutionName || "Bank"}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Badge variant={group.status === "active" ? "default" : "destructive"} className="text-[10px] sm:text-xs">
                      {group.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 sm:h-7 sm:w-7"
                      onClick={() => setDisconnectItemId(group.id)}
                    >
                      <Unlink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0 sm:p-6 sm:pt-0">
                {group.accounts.map((account) => {
                  const isActive = account.isActive !== "false";
                  return (
                    <div
                      key={account.id}
                      className={`flex items-center justify-between p-2 rounded ${isActive ? "bg-muted/50" : "bg-muted/20 opacity-60"}`}
                      data-testid={`account-row-${account.id}`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <Switch
                          checked={isActive}
                          onCheckedChange={(checked) => {
                            toggleAccountMutation.mutate({ accountId: account.id, isActive: checked });
                          }}
                          data-testid={`toggle-account-${account.id}`}
                        />
                        <div className="min-w-0">
                          <p className={`text-xs sm:text-sm font-medium truncate ${!isActive ? "line-through" : ""}`}>{account.name}</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                            {account.subtype || account.type} {account.mask ? `(...${account.mask})` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-xs sm:text-sm font-bold ${!isActive ? "text-muted-foreground" : ""}`}>
                          {account.balanceCurrent ? formatCurrency(account.balanceCurrent, account.isoCurrencyCode || "CAD") : "N/A"}
                        </p>
                        {account.balanceAvailable && (
                          <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
                            Avail: {formatCurrency(account.balanceAvailable, account.isoCurrencyCode || "CAD")}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {group.accounts[0]?.lastSynced && (
                  <p className="text-[10px] sm:text-xs text-muted-foreground pt-1">
                    Last synced: {format(new Date(group.accounts[0].lastSynced), "MMM d, h:mm a")}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
          
          {/* MX Member Cards */}
          {mxMembers.map((member) => (
            <Card key={member.id}>
              <CardHeader className="p-3 sm:pb-2 sm:p-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                    <Building2 className="h-3 w-3 sm:h-4 sm:w-4" />
                    {member.institutionName || "Bank"}
                    <Badge variant="outline" className="text-[10px]">MX</Badge>
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Badge variant={member.connectionStatus === "CONNECTED" ? "default" : "secondary"} className="text-[10px] sm:text-xs">
                      {member.connectionStatus || "unknown"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 sm:h-7 sm:w-7"
                      onClick={() => setDisconnectMxMemberId(member.id)}
                      data-testid={`button-disconnect-mx-${member.id}`}
                    >
                      <Unlink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0 sm:p-6 sm:pt-0">
                {member.accounts.map((account) => {
                  const isActive = account.isActive !== "false";
                  return (
                    <div
                      key={account.id}
                      className={`flex items-center justify-between p-2 rounded ${isActive ? "bg-muted/50" : "bg-muted/20 opacity-60"}`}
                      data-testid={`mx-account-row-${account.id}`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <Switch
                          checked={isActive}
                          onCheckedChange={() => toggleMxAccountMutation.mutate(account.id)}
                          data-testid={`toggle-mx-account-${account.id}`}
                        />
                        <div className="min-w-0">
                          <p className={`text-xs sm:text-sm font-medium truncate ${!isActive ? "line-through" : ""}`}>{account.name}</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                            {account.subtype || account.type} {account.mask ? `(...${account.mask})` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-xs sm:text-sm font-bold ${!isActive ? "text-muted-foreground" : ""}`}>
                          {account.balance ? formatCurrency(account.balance, account.currencyCode || "USD") : "N/A"}
                        </p>
                        {account.availableBalance && (
                          <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
                            Avail: {formatCurrency(account.availableBalance, account.currencyCode || "USD")}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {member.aggregatedAt && (
                  <p className="text-[10px] sm:text-xs text-muted-foreground pt-1">
                    Last synced: {format(new Date(member.aggregatedAt), "MMM d, h:mm a")}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Transactions Section */}
      {accountGroups.length > 0 && (
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base sm:text-xl">Transactions</CardTitle>
              <div className="flex items-center gap-1 sm:gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8 sm:h-10 sm:w-10" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
                <span className="text-xs sm:text-sm font-medium min-w-[90px] sm:min-w-[120px] text-center">
                  {format(currentMonth, "MMM yyyy")}
                </span>
                <Button variant="outline" size="icon" className="h-8 w-8 sm:h-10 sm:w-10" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 mt-3">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
              <Select value={matchFilter} onValueChange={setMatchFilter}>
                <SelectTrigger className="w-full sm:w-[160px] text-sm">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="bill">Matched Bills</SelectItem>
                  <SelectItem value="expense">Matched Expenses</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="unmatched">Unmatched</SelectItem>
                  <SelectItem value="needs_review">Needs Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {transactionsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {transactions.length === 0
                  ? "No transactions found. Click \"Sync Transactions\" to fetch from your bank."
                  : "No transactions match your filters."}
              </div>
            ) : (
              <>
                {selectedIds.size > 0 && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-muted rounded-lg mb-3">
                    <span className="text-xs sm:text-sm font-medium">{selectedIds.size} selected</span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="text-xs sm:text-sm"
                        onClick={() => bulkCreateMutation.mutate(Array.from(selectedIds))}
                        disabled={bulkCreateMutation.isPending}
                      >
                        {bulkCreateMutation.isPending ? "Adding..." : "Add to Expenses"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs sm:text-sm"
                        onClick={() => setSelectedIds(new Set())}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                )}
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 sm:w-10">
                          <Checkbox
                            checked={selectableTransactions.length > 0 && selectedIds.size === selectableTransactions.length}
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                        <SortHeader label="Date" sortKey="date" />
                        <SortHeader label="Merchant" sortKey="name" />
                        <SortHeader label="Amount" sortKey="amount" />
                        <TableHead className="hidden sm:table-cell">Category</TableHead>
                        <TableHead className="hidden sm:table-cell">Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.map((tx) => {
                        const amount = parseFloat(tx.amount);
                        const isDebit = amount > 0;
                        const isSelectable = tx.matchType === "unmatched" || tx.reconciled !== "true";
                        return (
                          <TableRow key={tx.id}>
                            <TableCell className="p-2 sm:p-4">
                              {isSelectable && (
                                <Checkbox
                                  checked={selectedIds.has(tx.id)}
                                  onCheckedChange={() => toggleSelect(tx.id)}
                                />
                              )}
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm p-2 sm:p-4 whitespace-nowrap">{tx.date}</TableCell>
                            <TableCell className="p-2 sm:p-4">
                              <div
                                className="cursor-pointer hover:text-primary transition-colors group flex items-center gap-2"
                                onClick={() => setDrilldownTransaction(tx)}
                              >
                                {tx.merchantCleanName === null && !tx.merchantLogoUrl && !tx.logoUrl ? (
                                  <Skeleton className="w-6 h-6 rounded-full flex-shrink-0" />
                                ) : (tx.merchantLogoUrl || tx.logoUrl) ? (
                                  <img
                                    src={(tx.merchantLogoUrl || tx.logoUrl)!}
                                    alt=""
                                    className="w-6 h-6 rounded-full object-contain flex-shrink-0 bg-white"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                ) : (
                                  <div
                                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-white"
                                    style={{ backgroundColor: CATEGORY_COLORS[(tx as any).category || 'Other'] || '#71717a' }}
                                  >
                                    <span className="text-xs font-semibold">
                                      {((tx as any).merchantCleanName || tx.merchantName || tx.name).charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                )}
                                <div className="flex flex-col min-w-0">
                                  {(tx as any).merchantCleanName === null ? (
                                    <Skeleton className="h-3 w-20 mb-1" />
                                  ) : (
                                    <p className="text-xs sm:text-sm font-medium group-hover:underline flex items-center gap-1 truncate max-w-[120px] sm:max-w-none">
                                      {(tx as any).merchantCleanName || tx.merchantName || tx.name}
                                      {(tx as any).isSubscription === "true" && (
                                        <span title="Recurring" className="text-cyan-500 flex-shrink-0">
                                          <RotateCcw className="h-3 w-3" />
                                        </span>
                                      )}
                                      <TrendingUp className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline flex-shrink-0" />
                                    </p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className={`font-medium text-xs sm:text-sm p-2 sm:p-4 whitespace-nowrap ${isDebit ? "text-red-600" : "text-green-600"}`}>
                              {isDebit ? "-" : "+"}{formatCurrency(Math.abs(amount), tx.isoCurrencyCode || "CAD")}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell p-2 sm:p-4">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="focus:outline-none">
                                    {(tx as any).subcategory ? (
                                      <Badge
                                        variant="outline"
                                        className="text-xs cursor-pointer hover:opacity-80 transition-opacity"
                                        style={{
                                          borderColor: CATEGORY_COLORS[(tx as any).category || 'Other'] || '#71717a',
                                          color: CATEGORY_COLORS[(tx as any).category || 'Other'] || '#71717a',
                                        }}
                                      >
                                        {(tx as any).subcategory}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs cursor-pointer hover:opacity-80">
                                        {tx.personalCategory || "Other"}
                                      </Badge>
                                    )}
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto w-52">
                                  <DropdownMenuLabel className="text-xs text-muted-foreground">Change category</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {Object.entries(CATEGORY_TAXONOMY).map(([cat, subs]) => (
                                    <div key={cat}>
                                      <DropdownMenuLabel
                                        className="text-xs font-semibold py-1"
                                        style={{ color: CATEGORY_COLORS[cat] || '#71717a' }}
                                      >
                                        {cat}
                                      </DropdownMenuLabel>
                                      {subs.map((sub) => (
                                        <DropdownMenuItem
                                          key={sub}
                                          className="text-xs pl-4 cursor-pointer"
                                          onClick={async () => {
                                            try {
                                              await apiRequest("PATCH", `/api/transactions/${tx.id}/category`, {
                                                category: cat,
                                                subcategory: sub,
                                                transactionType: 'plaid',
                                              });
                                              queryClient.invalidateQueries({ queryKey: ["/api/plaid/transactions"] });
                                              toast({ title: "Category updated" });
                                            } catch {
                                              toast({ title: "Failed to update category", variant: "destructive" });
                                            }
                                          }}
                                        >
                                          {sub}
                                        </DropdownMenuItem>
                                      ))}
                                    </div>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell p-2 sm:p-4">
                              {tx.matchType === "unmatched" ? (
                                <Badge variant="secondary" className="text-xs gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  Unmatched
                                </Badge>
                              ) : tx.reconciled === "true" ? (
                                <Badge className="text-xs gap-1 bg-green-100 text-green-800 hover:bg-green-100">
                                  <CheckCircle2 className="h-3 w-3" />
                                  {tx.matchType}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs gap-1">
                                  {tx.matchType}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="p-2 sm:p-4">
                              {isSelectable ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs sm:text-sm h-7 sm:h-9 px-2 sm:px-3"
                                  onClick={() => {
                                    setIsEditMode(false);
                                    setReconcileTransaction(tx);
                                  }}
                                  data-testid={`button-reconcile-${tx.id}`}
                                >
                                  <span className="hidden sm:inline">Reconcile</span>
                                  <span className="sm:hidden">Match</span>
                                </Button>
                              ) : tx.reconciled === "true" ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs sm:text-sm h-7 sm:h-9 px-2 sm:px-3 gap-1"
                                  onClick={() => {
                                    setIsEditMode(true);
                                    setReconcileTransaction(tx);
                                  }}
                                  data-testid={`button-edit-${tx.id}`}
                                >
                                  <Pencil className="h-3 w-3" />
                                  <span className="hidden sm:inline">Edit</span>
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
        </TabsContent>
      </Tabs>

      {/* Reconcile Dialog */}
      <ReconcileDialog
        transaction={reconcileTransaction}
        open={!!reconcileTransaction}
        onOpenChange={(open) => {
          if (!open) {
            setReconcileTransaction(null);
            setIsEditMode(false);
          }
        }}
        bills={bills}
        expenses={expenses}
        incomes={incomes}
        isEditMode={isEditMode}
        categories={allExpenseCategories}
      />

      {/* Disconnect Confirmation */}
      <AlertDialog open={!!disconnectItemId} onOpenChange={(open) => { if (!open) setDisconnectItemId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Bank Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the bank connection and all associated transaction data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => disconnectItemId && disconnectMutation.mutate(disconnectItemId)}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* MX Disconnect Confirmation */}
      <AlertDialog open={!!disconnectMxMemberId} onOpenChange={(open) => { if (!open) setDisconnectMxMemberId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Bank Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the bank connection and all associated transaction data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => disconnectMxMemberId && disconnectMxMutation.mutate(disconnectMxMemberId)}
              data-testid="button-confirm-disconnect-mx"
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Manual Account Confirmation */}
      <AlertDialog open={!!deleteManualAccountId} onOpenChange={(open) => { if (!open) setDeleteManualAccountId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Manual Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the account and all its transactions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteManualAccountId && deleteManualAccountMutation.mutate(deleteManualAccountId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual Account Dialog */}
      <ManualAccountDialog
        open={showManualAccountDialog}
        onOpenChange={setShowManualAccountDialog}
        account={editingManualAccount}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/accounts/manual"] });
        }}
      />

      {/* Manual Transaction Dialog */}
      <ManualTransactionDialog
        open={showManualTxDialog}
        onOpenChange={setShowManualTxDialog}
        account={selectedManualAccount}
        transaction={editingManualTx}
        categories={allExpenseCategories}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/transactions/manual/account", selectedManualAccount?.id] });
          queryClient.invalidateQueries({ queryKey: ["/api/accounts/manual"] });
        }}
      />

      {/* Transaction Drilldown Dialog */}
      {drilldownTransaction && (
        <TransactionDrilldown
          open={!!drilldownTransaction}
          onOpenChange={(open) => { if (!open) setDrilldownTransaction(null); }}
          merchant={drilldownTransaction.merchantName || drilldownTransaction.name}
          category={drilldownTransaction.personalCategory || undefined}
          initialTransaction={drilldownTransaction as any}
        />
      )}

      {/* Bank Provider Selection Dialog */}
      <BankProviderSelectionDialog
        open={showProviderSelection}
        onOpenChange={setShowProviderSelection}
        userCountry={session?.country || ""}
        onSelectProvider={handleProviderSelected}
        onSelectManual={handleManualAccountSelected}
      />
    </div>
  );
}
