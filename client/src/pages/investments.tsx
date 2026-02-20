import { useState } from "react";
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
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Building2, Wallet, PiggyBank, Bitcoin, RefreshCw, Link2, Brain, Send, Loader2, BarChart3, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { INVESTMENT_ACCOUNT_TYPES, HOLDING_TYPES, type InvestmentAccount, type Holding, type PlaidAccount } from "@shared/schema";

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

interface PortfolioAnalysis {
  totalValue: number;
  totalCostBasis: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  holdings: HoldingAnalysis[];
  overallRecommendation: string;
  diversificationScore: number;
  riskAssessment: string;
  actionItems: string[];
  marketOutlook: string;
  generatedAt: string;
}

interface HoldingAnalysis {
  holdingId: string;
  symbol: string;
  name: string;
  currentPrice: number | null;
  yourCostBasis: number;
  quantity: number;
  currentValue: number;
  gainLoss: number;
  gainLossPercent: number;
  technicalAnalysis: string;
  recommendation: "strong_buy" | "buy" | "hold" | "sell" | "strong_sell";
  reasoning: string;
  riskLevel: "low" | "medium" | "high";
  confidence: number;
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

function getRecommendationColor(rec: string) {
  switch (rec) {
    case "strong_buy": return "text-green-600 bg-green-100";
    case "buy": return "text-green-500 bg-green-50";
    case "hold": return "text-yellow-600 bg-yellow-100";
    case "sell": return "text-red-500 bg-red-50";
    case "strong_sell": return "text-red-600 bg-red-100";
    default: return "text-gray-600 bg-gray-100";
  }
}

function getRecommendationIcon(rec: string) {
  switch (rec) {
    case "strong_buy":
    case "buy": return <CheckCircle className="h-4 w-4" />;
    case "hold": return <AlertTriangle className="h-4 w-4" />;
    case "sell":
    case "strong_sell": return <XCircle className="h-4 w-4" />;
    default: return null;
  }
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
  const [question, setQuestion] = useState("");
  const { toast } = useToast();

  const { data: analysis, isLoading: analysisLoading, refetch: refetchAnalysis } = useQuery<PortfolioAnalysis>({
    queryKey: ["/api/investments/analysis"],
    enabled: holdings.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const askMutation = useMutation({
    mutationFn: (q: string) => apiRequest("POST", "/api/investments/ask-advisor", { question: q }),
    onError: () => toast({ title: "Failed to get advice", variant: "destructive" }),
  });

  const handleAsk = () => {
    if (!question.trim()) return;
    askMutation.mutate(question);
  };

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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle>AI Investment Advisor</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchAnalysis()} disabled={analysisLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${analysisLoading ? "animate-spin" : ""}`} />
            Refresh Analysis
          </Button>
        </div>
        <CardDescription>
          AI-powered portfolio analysis with buy/sell recommendations based on technical indicators
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {analysisLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-40" />
          </div>
        ) : analysis ? (
          <>
            {/* Overall Assessment */}
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium mb-2">Portfolio Assessment</h4>
              <p className="text-sm">{analysis.overallRecommendation}</p>
              <div className="flex gap-4 mt-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Diversification:</span>{" "}
                  <span className={analysis.diversificationScore >= 70 ? "text-green-600" : analysis.diversificationScore >= 40 ? "text-yellow-600" : "text-red-600"}>
                    {analysis.diversificationScore}/100
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Risk Level:</span>{" "}
                  <span>{analysis.riskAssessment}</span>
                </div>
              </div>
            </div>

            {/* Action Items */}
            {analysis.actionItems.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Action Items</h4>
                <ul className="space-y-2">
                  {analysis.actionItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Individual Holdings Analysis */}
            <div>
              <h4 className="font-medium mb-3">Holdings Analysis</h4>
              <div className="space-y-3">
                {analysis.holdings.map(h => (
                  <div key={h.holdingId} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{h.symbol}</span>
                        <Badge className={getRecommendationColor(h.recommendation)}>
                          {getRecommendationIcon(h.recommendation)}
                          <span className="ml-1">{h.recommendation.replace("_", " ").toUpperCase()}</span>
                        </Badge>
                      </div>
                      <span className={h.gainLoss >= 0 ? "text-green-600" : "text-red-600"}>
                        {h.gainLossPercent >= 0 ? "+" : ""}{h.gainLossPercent.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{h.reasoning}</p>
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Risk: {h.riskLevel}</span>
                      <span>Confidence: {h.confidence}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">Click "Refresh Analysis" to get AI-powered insights.</p>
        )}

        {/* Ask the Advisor */}
        <div className="border-t pt-4">
          <h4 className="font-medium mb-2">Ask the Advisor</h4>
          <div className="flex gap-2">
            <Textarea
              placeholder="Ask any investment question... e.g., 'Should I rebalance my portfolio?' or 'What's the outlook for tech stocks?'"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
          <Button
            className="mt-2"
            onClick={handleAsk}
            disabled={askMutation.isPending || !question.trim()}
          >
            {askMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Ask
          </Button>

          {askMutation.data && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg">
              <h5 className="font-medium mb-2">Advisor's Response:</h5>
              <p className="text-sm whitespace-pre-wrap">{(askMutation.data as any).advice}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Investments() {
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [holdingDialogOpen, setHoldingDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<InvestmentAccount | undefined>();
  const [editingHolding, setEditingHolding] = useState<Holding | undefined>();
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
    mutationFn: () => apiRequest("DELETE", `/api/${deleteType === "account" ? "investment-accounts" : "holdings"}/${deleteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investment-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      toast({ title: `${deleteType === "account" ? "Account" : "Holding"} deleted` });
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

  const totalValue = holdings.reduce((sum, h) => sum + parseFloat(h.currentValue || "0"), 0);
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
            <CardTitle className={`text-lg sm:text-2xl ${gainPercent >= 0 ? "text-green-600" : "text-red-600"}`}>
              {gainPercent >= 0 ? "+" : ""}{gainPercent.toFixed(2)}%
            </CardTitle>
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
                          <p className="text-xs sm:text-sm text-muted-foreground">{accountHoldings.length} holdings</p>
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
                            <TableCell className={`text-right text-xs sm:text-sm p-2 sm:p-4 whitespace-nowrap ${gain >= 0 ? "text-green-600" : "text-red-600"}`}>
                              <span className="hidden sm:inline">{formatCurrency(gain)} </span>({gainPct >= 0 ? "+" : ""}{gainPct.toFixed(1)}%)
                            </TableCell>
                            <TableCell className="p-2 sm:p-4">
                              <div className="flex gap-1">
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
          <AIAdvisor holdings={holdings} />
        </TabsContent>
      </Tabs>

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
            <AlertDialogAction onClick={() => deleteMutation.mutate()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
