// FEATURE: INVESTMENT_TRACKING | tier: free | limit: unlimited
// FEATURE: PORTFOLIO_ADVISOR | tier: free | limit: 1 insight/month (free), unlimited (pro/family)
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Building2, Wallet, PiggyBank, Bitcoin, RefreshCw, Link2, Brain, Send, Loader2, BarChart3, AlertTriangle, HelpCircle, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { INVESTMENT_ACCOUNT_TYPES, HOLDING_TYPES, type InvestmentAccount, type Holding, type PlaidAccount } from "@shared/schema";
import { useChartColors } from "@/hooks/useChartColors";
import { FeatureGate } from "@/components/FeatureGate";

const accountFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  accountType: z.enum(INVESTMENT_ACCOUNT_TYPES),
  institution: z.string().optional(),
  accountNumber: z.string().optional(),
  balance: z.string().optional(),
  notes: z.string().optional(),
});

const holdingFormSchema = z.object({
  investmentAccountId: z.string().min(1, "Account is required"),
  symbol: z.string().min(1, "Symbol is required").transform(v => v.toUpperCase()),
  name: z.string().min(1, "Name is required"),
  holdingType: z.enum(HOLDING_TYPES),
  quantity: z.string().min(1, "Quantity is required"),
  costBasis: z.string().optional(),
  currentPrice: z.string().optional(),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;
type HoldingFormValues = z.infer<typeof holdingFormSchema>;

// ── New advisor data types ────────────────────────────────────────────────────
interface EnrichedHolding {
  symbol: string;
  shares: number;
  currentPrice: number;
  avgCost: number;
  marketValue: number;
  gainLossDollars: number;
  gainLossPct: number;
  week52High: number;
  week52Low: number;
  vsHighPct: number;
  name: string;
}

interface PortfolioSnapshot {
  date: string;
  totalValue: number;
  totalCostBasis: number;
}

interface ActionItem {
  symbol: string;
  action: string;
  reasoning: string;
}

interface NewsArticle {
  symbol: string;
  headline: string;
  source: string;
  sentiment: string;
  timePublished: string;
  url: string;
}

interface AdvisorData {
  portfolio: {
    totalValue: number;
    totalCostBasis: number;
    totalGainLoss: number;
    totalGainLossPct: number;
    holdings: EnrichedHolding[];
  };
  history: PortfolioSnapshot[];
  news: NewsArticle[];
  analysis: {
    content: string;
    generatedAt: string;
    fromCache: boolean;
  };
  actions: ActionItem[];
}

interface ChatMessage {
  role: "user" | "advisor";
  content: string;
  timestamp: string;
}

interface LinkablePlaidAccount extends PlaidAccount {
  isLinked: boolean;
}

function formatCurrency(amount: string | number | null | undefined) {
  if (!amount) return "$0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function getAccountTypeIcon(type: string) {
  switch (type) {
    case "brokerage": return <TrendingUp className="h-4 w-4" />;
    case "retirement_401k":
    case "retirement_ira":
    case "retirement_roth": return <PiggyBank className="h-4 w-4" />;
    case "crypto_wallet":
    case "crypto_exchange": return <Bitcoin className="h-4 w-4" />;
    default: return <Wallet className="h-4 w-4" />;
  }
}

function formatAccountType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function getActionBadgeClass(action: string): string {
  switch (action) {
    case "BUY_MORE": return "bg-green-100 text-green-800";
    case "CONSIDER_SELLING": return "bg-orange-100 text-orange-800";
    case "AVERAGE_DOWN": return "bg-blue-100 text-blue-800";
    case "TAKE_PROFITS": return "bg-purple-100 text-purple-800";
    case "MONITOR": return "bg-yellow-100 text-yellow-800";
    default: return "bg-gray-100 text-gray-700"; // HOLD
  }
}

/** Very simple markdown renderer — converts ### headers, **bold**, bullet lists */
function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-base font-semibold mt-4 mb-1">
          {line.slice(4)}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="text-lg font-bold mt-5 mb-2">
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="text-xl font-bold mt-5 mb-2">
          {line.slice(2)}
        </h1>,
      );
    } else if (line.match(/^[\*\-] /)) {
      elements.push(
        <li key={i} className="ml-4 text-sm list-disc">
          {renderInline(line.slice(2))}
        </li>,
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-sm">
          {renderInline(line)}
        </p>,
      );
    }
  });

  return <div className="space-y-0.5">{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  // Handle **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function AccountForm({ account, onClose }: { account?: InvestmentAccount; onClose: () => void }) {
  const { toast } = useToast();
  const isEditing = !!account;
  const [selectedPlaidAccount, setSelectedPlaidAccount] = useState<LinkablePlaidAccount | null>(null);

  // Fetch linkable Plaid accounts
  const { data: linkableAccounts = [] } = useQuery<LinkablePlaidAccount[]>({
    queryKey: ["/api/investment-accounts/linkable-plaid-accounts"],
    enabled: !isEditing,
  });

  const unlinkedAccounts = linkableAccounts.filter(a => !a.isLinked);

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      name: account?.name || "",
      accountType: (account?.accountType as typeof INVESTMENT_ACCOUNT_TYPES[number]) || "brokerage",
      institution: account?.institution || "",
      accountNumber: account?.accountNumber || "",
      balance: account?.balance || "",
      notes: account?.notes || "",
    },
  });

  // When a Plaid account is selected, prefill the form
  const handleSelectPlaidAccount = (plaidAccount: LinkablePlaidAccount) => {
    setSelectedPlaidAccount(plaidAccount);
    form.setValue("name", plaidAccount.name || plaidAccount.officialName || "");
    form.setValue("balance", plaidAccount.balanceCurrent || "");
    form.setValue("accountNumber", plaidAccount.mask || "");
    // Try to determine account type from subtype
    const subtype = plaidAccount.subtype?.toLowerCase() || "";
    if (subtype.includes("401") || subtype.includes("pension")) {
      form.setValue("accountType", "retirement_401k");
    } else if (subtype.includes("ira") && subtype.includes("roth")) {
      form.setValue("accountType", "retirement_roth");
    } else if (subtype.includes("ira") || subtype.includes("rrsp")) {
      form.setValue("accountType", "retirement_ira");
    } else {
      form.setValue("accountType", "brokerage");
    }
  };

  const createMutation = useMutation({
    mutationFn: (values: AccountFormValues) => {
      if (selectedPlaidAccount) {
        return apiRequest("POST", "/api/investment-accounts/import-from-plaid", {
          plaidAccountId: selectedPlaidAccount.accountId,
          ...values,
        });
      }
      return apiRequest("POST", "/api/investment-accounts", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investment-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investment-accounts/linkable-plaid-accounts"] });
      toast({ title: "Account created successfully" });
      onClose();
    },
    onError: () => toast({ title: "Failed to create account", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (values: AccountFormValues) => apiRequest("PATCH", `/api/investment-accounts/${account?.id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investment-accounts"] });
      toast({ title: "Account updated successfully" });
      onClose();
    },
    onError: () => toast({ title: "Failed to update account", variant: "destructive" }),
  });

  const onSubmit = (values: AccountFormValues) => {
    if (isEditing) updateMutation.mutate(values);
    else createMutation.mutate(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Show linked bank accounts if available and not editing */}
        {!isEditing && unlinkedAccounts.length > 0 && (
          <div className="space-y-2">
            <FormLabel>Import from Connected Bank</FormLabel>
            <Select
              value={selectedPlaidAccount?.id || "manual"}
              onValueChange={(value) => {
                if (value === "manual") {
                  setSelectedPlaidAccount(null);
                  form.reset();
                } else {
                  const account = unlinkedAccounts.find(a => a.id === value);
                  if (account) handleSelectPlaidAccount(account);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a linked account or add manually" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Add account manually</SelectItem>
                {unlinkedAccounts.map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name} {acc.mask && `(...${acc.mask})`} - {formatCurrency(acc.balanceCurrent)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPlaidAccount && (
              <p className="text-xs text-muted-foreground">
                Importing from: {selectedPlaidAccount.officialName || selectedPlaidAccount.name}
              </p>
            )}
          </div>
        )}

        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Account Name</FormLabel>
            <FormControl><Input placeholder="My Brokerage Account" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="accountType" render={({ field }) => (
            <FormItem>
              <FormLabel>Account Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {INVESTMENT_ACCOUNT_TYPES.map(type => (
                    <SelectItem key={type} value={type}>{formatAccountType(type)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="balance" render={({ field }) => (
            <FormItem>
              <FormLabel>Account Balance</FormLabel>
              <FormControl><Input type="number" step="0.01" placeholder="50000.00" {...field} /></FormControl>
              <FormDescription>Total account value</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="institution" render={({ field }) => (
          <FormItem>
            <FormLabel>Institution (Optional)</FormLabel>
            <FormControl><Input placeholder="Fidelity, Vanguard, Scotia iTRADE..." {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="accountNumber" render={({ field }) => (
          <FormItem>
            <FormLabel>Account Number (Last 4 digits)</FormLabel>
            <FormControl><Input placeholder="1234" maxLength={4} {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>Notes (Optional)</FormLabel>
            <FormControl><Input placeholder="Any notes..." {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
            {isEditing ? "Update" : "Create"} Account
          </Button>
        </div>
      </form>
    </Form>
  );
}

function HoldingForm({ holding, accounts, onClose }: { holding?: Holding; accounts: InvestmentAccount[]; onClose: () => void }) {
  const { toast } = useToast();
  const isEditing = !!holding;
  const [fetchingPrice, setFetchingPrice] = useState(false);

  const form = useForm<HoldingFormValues>({
    resolver: zodResolver(holdingFormSchema),
    defaultValues: {
      investmentAccountId: holding?.investmentAccountId || accounts[0]?.id || "",
      symbol: holding?.symbol || "",
      name: holding?.name || "",
      holdingType: (holding?.holdingType as typeof HOLDING_TYPES[number]) || "stock",
      quantity: holding?.quantity || "",
      costBasis: holding?.costBasis || "",
      currentPrice: holding?.currentPrice || "",
    },
  });

  const fetchCurrentPrice = async () => {
    const symbol = form.getValues("symbol");
    if (!symbol) {
      toast({ title: "Enter a symbol first", variant: "destructive" });
      return;
    }
    setFetchingPrice(true);
    try {
      const res = await apiRequest("GET", `/api/stocks/${symbol.toUpperCase()}/quote`);
      const data = await res.json();
      if (data.price) {
        form.setValue("currentPrice", data.price.toFixed(2));
        if (data.name && !form.getValues("name")) {
          form.setValue("name", data.name);
        }
        toast({ title: `Price fetched: $${data.price.toFixed(2)}` });
      } else {
        toast({ title: "Could not fetch price for this symbol", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Failed to fetch price", variant: "destructive" });
    } finally {
      setFetchingPrice(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: (values: HoldingFormValues) => {
      const currentValue = values.currentPrice && values.quantity
        ? String(parseFloat(values.currentPrice) * parseFloat(values.quantity))
        : undefined;
      return apiRequest("POST", "/api/holdings", { ...values, currentValue });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      toast({ title: "Holding added successfully" });
      onClose();
    },
    onError: () => toast({ title: "Failed to add holding", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (values: HoldingFormValues) => {
      const currentValue = values.currentPrice && values.quantity
        ? String(parseFloat(values.currentPrice) * parseFloat(values.quantity))
        : undefined;
      return apiRequest("PATCH", `/api/holdings/${holding?.id}`, { ...values, currentValue });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      toast({ title: "Holding updated successfully" });
      onClose();
    },
    onError: () => toast({ title: "Failed to update holding", variant: "destructive" }),
  });

  const onSubmit = (values: HoldingFormValues) => {
    if (isEditing) updateMutation.mutate(values);
    else createMutation.mutate(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="investmentAccountId" render={({ field }) => (
          <FormItem>
            <FormLabel>Account</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              </FormControl>
              <SelectContent>
                {accounts.map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="symbol" render={({ field }) => (
            <FormItem>
              <FormLabel>Symbol</FormLabel>
              <FormControl><Input placeholder="AAPL, MSFT, VTI..." {...field} className="uppercase" /></FormControl>
              <FormDescription>Stock ticker symbol</FormDescription>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="holdingType" render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {HOLDING_TYPES.map(type => (
                    <SelectItem key={type} value={type}>{type.replace(/_/g, " ").toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl><Input placeholder="Apple Inc., Microsoft Corp..." {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid grid-cols-3 gap-4">
          <FormField control={form.control} name="quantity" render={({ field }) => (
            <FormItem>
              <FormLabel>Shares</FormLabel>
              <FormControl><Input type="number" step="any" placeholder="100" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="costBasis" render={({ field }) => (
            <FormItem>
              <FormLabel>Total Cost</FormLabel>
              <FormControl><Input type="number" step="0.01" placeholder="15000.00" {...field} /></FormControl>
              <FormDescription>What you paid</FormDescription>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="currentPrice" render={({ field }) => (
            <FormItem>
              <FormLabel>Current Price</FormLabel>
              <div className="flex gap-2">
                <FormControl><Input type="number" step="0.01" placeholder="175.50" {...field} /></FormControl>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={fetchCurrentPrice}
                  disabled={fetchingPrice}
                  title="Get current price"
                >
                  {fetchingPrice ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
              <FormDescription>Per share - click icon to fetch live price</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
            {isEditing ? "Update" : "Add"} Holding
          </Button>
        </div>
      </form>
    </Form>
  );
}

function LinkPlaidAccountDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();

  const { data: linkableAccounts = [], isLoading } = useQuery<LinkablePlaidAccount[]>({
    queryKey: ["/api/investment-accounts/linkable-plaid-accounts"],
  });

  const linkMutation = useMutation({
    mutationFn: (plaidAccountId: string) =>
      apiRequest("POST", "/api/investment-accounts/import-from-plaid", { plaidAccountId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investment-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investment-accounts/linkable-plaid-accounts"] });
      toast({ title: "Account linked successfully" });
    },
    onError: () => toast({ title: "Failed to link account", variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  }

  const unlinkedAccounts = linkableAccounts.filter(a => !a.isLinked);

  if (unlinkedAccounts.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p>No investment accounts found in your connected banks.</p>
        <p className="text-sm mt-2">Connect a bank with investment/brokerage accounts to link them here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Select an investment account from your connected banks to track here:
      </p>
      <div className="space-y-2">
        {unlinkedAccounts.map(account => (
          <div
            key={account.id}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
          >
            <div>
              <p className="font-medium">{account.name}</p>
              <p className="text-sm text-muted-foreground">
                {account.officialName || account.subtype} {account.mask && `(...${account.mask})`}
              </p>
              {account.balanceCurrent && (
                <p className="text-sm font-medium">{formatCurrency(account.balanceCurrent)}</p>
              )}
            </div>
            <Button
              size="sm"
              onClick={() => linkMutation.mutate(account.accountId)}
              disabled={linkMutation.isPending}
            >
              {linkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Link"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AIAdvisor({ holdings }: { holdings: Holding[] }) {
  const { toast } = useToast();
  const colors = useChartColors();

  // ── Chat state ──────────────────────────────────────────────────────────────
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => {
    try {
      const stored = localStorage.getItem("investment_advisor_chat");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Sparkline timeframe ─────────────────────────────────────────────────────
  const [sparklineDays, setSparklineDays] = useState<30 | 90 | 180 | 365>(30);

  // ── Advisor data ────────────────────────────────────────────────────────────
  const {
    data: advisorData,
    isLoading: advisorLoading,
    refetch: refetchAdvisor,
    dataUpdatedAt,
  } = useQuery<AdvisorData>({
    queryKey: ["/api/investments/advisor-data"],
    enabled: holdings.length > 0,
    staleTime: 25 * 60 * 1000, // 25 min — server cache is 30 min
  });

  // Persist chat to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("investment_advisor_chat", JSON.stringify(chatHistory));
    } catch { /* ignore */ }
  }, [chatHistory]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isChatting]);

  const handleRefresh = () => {
    queryClient.removeQueries({ queryKey: ["/api/investments/advisor-data"] });
    refetchAdvisor();
  };

  const handleRegenerateAnalysis = async () => {
    try {
      const res = await fetch("/api/investments/advisor-data?refresh=true");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      queryClient.invalidateQueries({ queryKey: ["/api/investments/advisor-data"] });
      refetchAdvisor();
    } catch {
      toast({ title: "Failed to regenerate", variant: "destructive" });
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || isChatting) return;
    const question = chatInput.trim();
    setChatInput("");

    const userMsg: ChatMessage = {
      role: "user",
      content: question,
      timestamp: new Date().toISOString(),
    };
    setChatHistory((prev) => [...prev, userMsg]);
    setIsChatting(true);

    try {
      const res = await apiRequest("POST", "/api/investments/advisor-chat", {
        question,
        chatHistory: chatHistory.map((m) => ({ role: m.role, content: m.content })),
      });
      const data = await res.json();
      setChatHistory((prev) => [
        ...prev,
        { role: "advisor", content: data.answer, timestamp: data.timestamp ?? new Date().toISOString() },
      ]);
    } catch {
      toast({ title: "Failed to get response", variant: "destructive" });
    } finally {
      setIsChatting(false);
    }
  };

  // ── Sparkline data prep ─────────────────────────────────────────────────────
  const sparklineData = (() => {
    if (!advisorData?.history?.length) return [];
    const cutoff = new Date(Date.now() - sparklineDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const filtered = advisorData.history
      .filter((s) => s.date >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date));
    return filtered.map((s) => ({
      date: s.date.slice(5), // MM-DD
      value: s.totalValue,
      cost: s.totalCostBasis,
    }));
  })();

  const sparklineColor =
    sparklineData.length >= 2 &&
    sparklineData[sparklineData.length - 1].value >= sparklineData[0].value
      ? colors.success
      : colors.danger;

  // ── Action badge lookup ─────────────────────────────────────────────────────
  const actionMap = new Map<string, ActionItem>(
    (advisorData?.actions ?? []).map((a) => [a.symbol, a]),
  );

  // ── No holdings ─────────────────────────────────────────────────────────────
  if (holdings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle>AI Investment Advisor</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Add holdings to your portfolio to get AI-powered investment analysis and recommendations.
          </p>
        </CardContent>
      </Card>
    );
  }

  const portfolio = advisorData?.portfolio;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <CardTitle>AI Investment Advisor</CardTitle>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleRegenerateAnalysis} disabled={advisorLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${advisorLoading ? "animate-spin" : ""}`} />
                Regenerate Analysis
              </Button>
            </div>
          </div>
          {portfolio && (
            <div className="flex flex-wrap gap-4 mt-2 text-sm">
              <div>
                <span className="text-muted-foreground">Portfolio Value: </span>
                <span className="font-semibold">{formatCurrency(portfolio.totalValue)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total Return: </span>
                <span className={`font-semibold ${portfolio.totalGainLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {portfolio.totalGainLoss >= 0 ? "+" : ""}{formatCurrency(portfolio.totalGainLoss)} ({portfolio.totalGainLossPct >= 0 ? "+" : ""}{portfolio.totalGainLossPct.toFixed(1)}%)
                </span>
              </div>
              {dataUpdatedAt > 0 && (
                <div className="text-muted-foreground text-xs self-center">
                  Updated: {new Date(dataUpdatedAt).toLocaleTimeString()}
                  {advisorData?.analysis.fromCache && " (cached)"}
                </div>
              )}
            </div>
          )}
        </CardHeader>
      </Card>

      {/* ── Portfolio Sparkline ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Portfolio History</CardTitle>
            <div className="flex gap-1">
              {([30, 90, 180, 365] as const).map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={sparklineDays === d ? "default" : "outline"}
                  className="text-xs px-2 py-1 h-7"
                  onClick={() => setSparklineDays(d)}
                >
                  {d === 365 ? "1Y" : d === 180 ? "6M" : d === 90 ? "3M" : "1M"}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {advisorLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : sparklineData.length < 3 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Portfolio history builds over time as you use BudgetSmart. Check back tomorrow for your first trend data.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={sparklineData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                  width={45}
                />
                <RechartsTooltip
                  formatter={(value: number) => [formatCurrency(value), ""]}
                  labelStyle={{ fontSize: 11 }}
                />
                {sparklineData[0]?.cost && (
                  <ReferenceLine
                    y={sparklineData[0].cost}
                    stroke={colors.muted}
                    strokeDasharray="4 2"
                    label={{ value: "Cost basis", fontSize: 10, fill: colors.muted }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={sparklineColor}
                  strokeWidth={2}
                  dot={false}
                  name="Portfolio Value"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── AI Narrative ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">AI Analysis</CardTitle>
          <CardDescription className="text-xs">
            🤖 Analysis based on live prices, your cost basis, and recent news • Refreshes every 30 min
          </CardDescription>
        </CardHeader>
        <CardContent>
          {advisorLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : advisorData?.analysis?.content ? (
            <MarkdownContent content={advisorData.analysis.content} />
          ) : (
            <p className="text-muted-foreground text-sm">
              Click "Regenerate Analysis" to get your personalized AI analysis.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Holdings Detail Table ───────────────────────────────────────────── */}
      {portfolio && portfolio.holdings.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Holdings Detail</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs pl-4">Symbol</TableHead>
                    <TableHead className="text-right text-xs hidden sm:table-cell">Shares</TableHead>
                    <TableHead className="text-right text-xs hidden md:table-cell">Avg Cost</TableHead>
                    <TableHead className="text-right text-xs">Current</TableHead>
                    <TableHead className="text-right text-xs">Value</TableHead>
                    <TableHead className="text-right text-xs">Gain/Loss</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {portfolio.holdings.map((h) => {
                    const isBigMove = Math.abs(h.gainLossPct) > 20;
                    const action = actionMap.get(h.symbol);
                    return (
                      <TableRow key={h.symbol}>
                        <TableCell className="font-medium text-xs pl-4 py-2">
                          <div>{h.symbol}</div>
                          <div className="text-muted-foreground text-xs hidden sm:block truncate max-w-[120px]">{h.name}</div>
                        </TableCell>
                        <TableCell className="text-right text-xs hidden sm:table-cell py-2">{h.shares.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-xs hidden md:table-cell py-2">{formatCurrency(h.avgCost)}</TableCell>
                        <TableCell className="text-right text-xs py-2">{formatCurrency(h.currentPrice)}</TableCell>
                        <TableCell className="text-right text-xs py-2">{formatCurrency(h.marketValue)}</TableCell>
                        <TableCell className={`text-right py-2 ${h.gainLossDollars >= 0 ? "text-green-600" : "text-red-600"} ${isBigMove ? "font-bold text-sm" : "text-xs"}`}>
                          <div className="flex items-center justify-end gap-0.5">
                            {h.gainLossDollars >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            <span>{formatCurrency(Math.abs(h.gainLossDollars))}</span>
                          </div>
                          <div className="text-xs">{h.gainLossPct >= 0 ? "+" : ""}{h.gainLossPct.toFixed(1)}%</div>
                        </TableCell>
                        <TableCell className="py-2">
                          {action ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className={`text-xs cursor-default ${getActionBadgeClass(action.action)}`}>
                                  {action.action.replace("_", " ")}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">{action.reasoning}</TooltipContent>
                            </Tooltip>
                          ) : (
                            advisorLoading ? <Skeleton className="h-5 w-12" /> : null
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Ask the Advisor — Persistent Chat ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Ask the Advisor</CardTitle>
            {chatHistory.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => {
                  setChatHistory([]);
                  localStorage.removeItem("investment_advisor_chat");
                }}
              >
                Clear chat
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Chat thread */}
          {chatHistory.length > 0 && (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex flex-col gap-0.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <span className="text-xs text-muted-foreground">
                    {msg.role === "user" ? "You" : "AI Advisor"} · {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {msg.role === "advisor" ? <MarkdownContent content={msg.content} /> : msg.content}
                  </div>
                </div>
              ))}
              {isChatting && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  AI Advisor is typing…
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}

          {/* Suggested chips — only before first message */}
          {chatHistory.length === 0 && !isChatting && advisorData && (
            <div className="flex flex-wrap gap-2">
              {[
                portfolio?.holdings.length && portfolio.holdings.some((h) => h.gainLossPct < 0) &&
                  `Why am I down so much on ${portfolio.holdings.reduce((worst, h) => h.gainLossPct < worst.gainLossPct ? h : worst, portfolio.holdings[0]).symbol}?`,
                "Should I buy more of my winners?",
                "Am I too concentrated in any one stock?",
                "What's the news saying about my holdings?",
                "Should I rebalance my portfolio?",
                "What would a 10% market drop do to my portfolio?",
              ]
                .filter(Boolean)
                .map((chip, i) => (
                  <button
                    key={i}
                    className="text-xs rounded-full border px-3 py-1 hover:bg-muted transition-colors"
                    onClick={() => {
                      setChatInput(chip as string);
                    }}
                  >
                    {chip}
                  </button>
                ))}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Ask anything about your portfolio…"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="min-h-[60px] resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChat();
                }
              }}
            />
            <Button
              onClick={handleSendChat}
              disabled={isChatting || !chatInput.trim()}
              className="self-end"
              size="sm"
            >
              {isChatting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Edit Cost Basis Dialog ────────────────────────────────────────────────────
function EditCostBasisDialog({ holding, onClose }: { holding: Holding; onClose: () => void }) {
  const { toast } = useToast();
  const [costBasis, setCostBasis] = useState(holding.costBasis || "");

  const updateMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/holdings/${holding.id}`, { costBasis }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      toast({ title: "Cost basis updated" });
      onClose();
    },
    onError: () => toast({ title: "Failed to update cost basis", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter the total amount you paid for <strong>{holding.symbol}</strong> ({parseFloat(holding.quantity).toLocaleString()} shares).
      </p>
      <div className="space-y-1">
        <label className="text-sm font-medium">Total Cost Basis ($)</label>
        <Input
          type="number"
          step="0.01"
          min="0"
          placeholder="e.g. 15000.00"
          value={costBasis}
          onChange={(e) => setCostBasis(e.target.value)}
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          What you paid in total (not per share). Used to calculate your return %.
        </p>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending || !costBasis}
        >
          {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}

export default function Investments() {
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [holdingDialogOpen, setHoldingDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<InvestmentAccount | undefined>();
  const [editingHolding, setEditingHolding] = useState<Holding | undefined>();
  const [editingCostBasisHolding, setEditingCostBasisHolding] = useState<Holding | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<"account" | "holding">("account");
  const { toast } = useToast();

  const { data: accounts = [], isLoading: accountsLoading } = useQuery<InvestmentAccount[]>({
    queryKey: ["/api/investment-accounts"],
  });

  const { data: holdings = [], isLoading: holdingsLoading } = useQuery<Holding[]>({
    queryKey: ["/api/holdings"],
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, type }: { id: string; type: "account" | "holding" }) => {
      if (!id) {
        console.error("No ID provided for delete");
        return Promise.reject(new Error("No ID provided"));
      }
      return apiRequest("DELETE", `/api/${type === "account" ? "investment-accounts" : "holdings"}/${id}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/investment-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      toast({ title: `${variables.type === "account" ? "Account" : "Holding"} deleted` });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const refreshPricesMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/holdings/refresh-prices"),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investments/analysis"] });
      toast({ title: data.message || "Prices refreshed" });
    },
    onError: () => toast({ title: "Failed to refresh prices", variant: "destructive" }),
  });

  const totalValue = accounts.reduce((sum, account) => {
    const accountHoldings = holdings.filter(h => h.investmentAccountId === account.id);
    if (accountHoldings.length > 0) {
      return sum + accountHoldings.reduce((s, h) => s + parseFloat(h.currentValue || "0"), 0);
    }
    return sum + parseFloat((account as any).balance || "0");
  }, 0);
  const totalCost = holdings.reduce((sum, h) => sum + parseFloat(h.costBasis || "0"), 0);
  const totalGain = totalValue - totalCost;
  const gainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  if (accountsLoading || holdingsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-1 sm:px-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Investments</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Track your portfolio with AI-powered insights</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="text-xs sm:text-sm"
            onClick={() => refreshPricesMutation.mutate()}
            disabled={refreshPricesMutation.isPending || holdings.length === 0}
          >
            <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 ${refreshPricesMutation.isPending ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh Prices</span>
            <span className="sm:hidden">Refresh</span>
          </Button>

          <Dialog open={accountDialogOpen} onOpenChange={(open) => {
            setAccountDialogOpen(open);
            if (!open) setEditingAccount(undefined);
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs sm:text-sm">
                <Building2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Add Account</span>
                <span className="sm:hidden">Account</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingAccount ? "Edit" : "Add"} Investment Account</DialogTitle>
              </DialogHeader>
              <AccountForm account={editingAccount} onClose={() => {
                setAccountDialogOpen(false);
                setEditingAccount(undefined);
              }} />
            </DialogContent>
          </Dialog>

          <Dialog open={holdingDialogOpen} onOpenChange={(open) => {
            setHoldingDialogOpen(open);
            if (!open) setEditingHolding(undefined);
          }}>
            <DialogTrigger asChild>
              <Button disabled={accounts.length === 0} size="sm" className="text-xs sm:text-sm">
                <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Add Holding</span>
                <span className="sm:hidden">Holding</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingHolding ? "Edit" : "Add"} Holding</DialogTitle>
              </DialogHeader>
              <HoldingForm holding={editingHolding} accounts={accounts} onClose={() => {
                setHoldingDialogOpen(false);
                setEditingHolding(undefined);
              }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <Card>
          <CardHeader className="p-3 sm:pb-2 sm:p-6">
            <CardDescription className="text-xs sm:text-sm">Total Value</CardDescription>
            <CardTitle className="text-lg sm:text-2xl">{formatCurrency(totalValue)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-3 sm:pb-2 sm:p-6">
            <CardDescription className="text-xs sm:text-sm">Cost Basis</CardDescription>
            <CardTitle className="text-lg sm:text-2xl">{formatCurrency(totalCost)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-3 sm:pb-2 sm:p-6">
            <CardDescription className="text-xs sm:text-sm">Gain/Loss</CardDescription>
            <CardTitle className={`text-lg sm:text-2xl flex items-center gap-1 sm:gap-2 ${totalGain >= 0 ? "text-green-600" : "text-red-600"}`}>
              {totalGain >= 0 ? <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" /> : <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5" />}
              {formatCurrency(Math.abs(totalGain))}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-3 sm:pb-2 sm:p-6">
            <CardDescription className="text-xs sm:text-sm">Return %</CardDescription>
            {totalCost > 0 ? (
              <CardTitle className={`text-lg sm:text-2xl ${gainPercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                {gainPercent >= 0 ? "+" : ""}{gainPercent.toFixed(2)}%
              </CardTitle>
            ) : (
              <div className="flex items-center gap-1.5 mt-1">
                <CardTitle className="text-lg sm:text-2xl text-muted-foreground">N/A</CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help flex-shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[200px] text-xs">
                    Enter cost basis on your holdings to calculate returns.
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="portfolio" className="space-y-4">
        <TabsList>
          <TabsTrigger value="portfolio"><BarChart3 className="h-4 w-4 mr-2" />Portfolio</TabsTrigger>
          <TabsTrigger value="advisor"><Brain className="h-4 w-4 mr-2" />AI Advisor</TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio" className="space-y-4">
          {/* Accounts */}
          <Card>
            <CardHeader>
              <CardTitle>Investment Accounts</CardTitle>
            </CardHeader>
            <CardContent>
              {accounts.length === 0 ? (
                <p className="text-muted-foreground text-center py-6 sm:py-8 text-sm sm:text-base">
                  No investment accounts yet. Add one manually or link from your connected bank accounts.
                </p>
              ) : (
                <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {accounts.map(account => {
                    const accountHoldings = holdings.filter(h => h.investmentAccountId === account.id);
                    const accountValue = accountHoldings.reduce((sum, h) => sum + parseFloat(h.currentValue || "0"), 0) || parseFloat(account.balance || "0");

                    return (
                      <Card key={account.id} className="relative">
                        <CardHeader className="p-3 sm:pb-2 sm:p-6">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              {getAccountTypeIcon(account.accountType)}
                              <div className="min-w-0">
                                <CardTitle className="text-sm sm:text-base truncate">{account.name}</CardTitle>
                                <CardDescription className="text-xs sm:text-sm truncate">{account.institution || formatAccountType(account.accountType)}</CardDescription>
                              </div>
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <Button size="icon" variant="ghost" className="h-7 w-7 sm:h-9 sm:w-9" onClick={() => {
                                setEditingAccount(account);
                                setAccountDialogOpen(true);
                              }}><Pencil className="h-3 w-3 sm:h-4 sm:w-4" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 sm:h-9 sm:w-9" onClick={() => {
                                setDeleteId(account.id);
                                setDeleteType("account");
                              }}><Trash2 className="h-3 w-3 sm:h-4 sm:w-4" /></Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                          <div className="text-xl sm:text-2xl font-bold">{formatCurrency(accountValue)}</div>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <p className="text-xs sm:text-sm text-muted-foreground">{accountHoldings.length} holdings</p>
                            {accountHoldings.length === 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs px-2 py-0"
                                onClick={() => {
                                  setEditingHolding(undefined);
                                  // Pre-select this account in the form
                                  setEditingHolding({ investmentAccountId: account.id } as any);
                                  setHoldingDialogOpen(true);
                                }}
                              >
                                <Plus className="h-3 w-3 mr-1" />Add Holdings
                              </Button>
                            )}
                          </div>
                          {account.notes?.includes("Linked from Plaid") && (
                            <Badge variant="secondary" className="mt-2 text-xs"><Link2 className="h-3 w-3 mr-1" />Linked</Badge>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Holdings Table */}
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <CardTitle className="text-base sm:text-xl">Holdings</CardTitle>
                {holdings.some(h => h.lastPriceUpdate) && (
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    Updated: {new Date(holdings.find(h => h.lastPriceUpdate)?.lastPriceUpdate || "").toLocaleString()}
                  </p>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              {holdings.length === 0 ? (
                <p className="text-muted-foreground text-center py-6 sm:py-8 text-sm">No holdings yet. Add your stocks, ETFs, or other investments.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs sm:text-sm">Symbol</TableHead>
                        <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Name</TableHead>
                        <TableHead className="text-xs sm:text-sm hidden lg:table-cell">Type</TableHead>
                        <TableHead className="text-right text-xs sm:text-sm hidden sm:table-cell">Shares</TableHead>
                        <TableHead className="text-right text-xs sm:text-sm hidden md:table-cell">Price</TableHead>
                        <TableHead className="text-right text-xs sm:text-sm">Value</TableHead>
                        <TableHead className="text-right text-xs sm:text-sm">Gain/Loss</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {holdings.map(holding => {
                        const value = parseFloat(holding.currentValue || "0");
                        const cost = parseFloat(holding.costBasis || "0");
                        const gain = value - cost;
                        const gainPct = cost > 0 ? (gain / cost) * 100 : 0;

                        return (
                          <TableRow key={holding.id}>
                            <TableCell className="font-medium text-xs sm:text-sm p-2 sm:p-4">{holding.symbol}</TableCell>
                            <TableCell className="hidden sm:table-cell text-xs sm:text-sm p-2 sm:p-4 max-w-[120px] truncate">{holding.name}</TableCell>
                            <TableCell className="hidden lg:table-cell p-2 sm:p-4"><Badge variant="outline" className="text-xs">{holding.holdingType}</Badge></TableCell>
                            <TableCell className="text-right hidden sm:table-cell text-xs sm:text-sm p-2 sm:p-4">{parseFloat(holding.quantity).toLocaleString()}</TableCell>
                            <TableCell className="text-right hidden md:table-cell text-xs sm:text-sm p-2 sm:p-4">{formatCurrency(holding.currentPrice)}</TableCell>
                            <TableCell className="text-right font-medium text-xs sm:text-sm p-2 sm:p-4">{formatCurrency(value)}</TableCell>
                            <TableCell className={`text-right text-xs sm:text-sm p-2 sm:p-4 whitespace-nowrap ${cost > 0 ? (gain >= 0 ? "text-green-600" : "text-red-600") : "text-muted-foreground"}`}>
                              {cost > 0 ? (
                                <>
                                  <span className="hidden sm:inline">{formatCurrency(gain)} </span>
                                  ({gainPct >= 0 ? "+" : ""}{gainPct.toFixed(1)}%)
                                </>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help underline decoration-dotted">N/A</span>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs max-w-[180px]">
                                    Enter cost basis to calculate returns
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                            <TableCell className="p-2 sm:p-4">
                              <div className="flex gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className={`h-7 w-7 sm:h-9 sm:w-9 ${!cost ? "text-orange-500 hover:text-orange-600" : ""}`}
                                      onClick={() => setEditingCostBasisHolding(holding)}
                                    >
                                      <DollarSign className="h-3 w-3 sm:h-4 sm:w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs">
                                    {cost ? "Edit cost basis" : "Enter cost basis to calculate returns"}
                                  </TooltipContent>
                                </Tooltip>
                                <Button size="icon" variant="ghost" className="h-7 w-7 sm:h-9 sm:w-9" onClick={() => {
                                  setEditingHolding(holding);
                                  setHoldingDialogOpen(true);
                                }}><Pencil className="h-3 w-3 sm:h-4 sm:w-4" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 sm:h-9 sm:w-9" onClick={() => {
                                  setDeleteId(holding.id);
                                  setDeleteType("holding");
                                }}><Trash2 className="h-3 w-3 sm:h-4 sm:w-4" /></Button>
                              </div>
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
        </TabsContent>

        <TabsContent value="advisor">
          <FeatureGate
            feature="portfolio_advisor"
            displayName="portfolio insights"
            bullets={[
              "Get AI portfolio insights and risk observations",
              "Spot concentration risks and allocation gaps",
              "Receive practical ideas to optimize holdings",
            ]}
          >
            <AIAdvisor holdings={holdings} />
          </FeatureGate>
        </TabsContent>
      </Tabs>

      {/* Edit Cost Basis Dialog */}
      <Dialog open={!!editingCostBasisHolding} onOpenChange={(open) => { if (!open) setEditingCostBasisHolding(undefined); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Cost Basis</DialogTitle>
          </DialogHeader>
          {editingCostBasisHolding && (
            <EditCostBasisDialog
              holding={editingCostBasisHolding}
              onClose={() => setEditingCostBasisHolding(undefined)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteType}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. {deleteType === "account" && "All holdings in this account will also be deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteId) return;
                deleteMutation.mutate({ id: deleteId, type: deleteType });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
