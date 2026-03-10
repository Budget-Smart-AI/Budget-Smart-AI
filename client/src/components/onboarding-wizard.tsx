import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { INCOME_CATEGORIES, BILL_CATEGORIES, RECURRENCE_OPTIONS } from "@shared/schema";
import {
  Building2,
  Sparkles,
  CheckCircle2,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ArrowRight,
  ArrowLeft,
  X,
} from "lucide-react";

interface IncomeSource {
  source: string;
  amount: number;
  category: string;
  recurrence: string;
  dueDay: number;
  confidence: string;
  selected: boolean;
}

interface RecurringBill {
  name: string;
  amount: number;
  category: string;
  recurrence: string;
  dueDay: number;
  confidence: string;
  selected: boolean;
}

interface OnboardingWizardProps {
  open: boolean;
  onComplete: () => void;
  isDemo?: boolean;
}

function AnalysisCard({
  item,
  type,
  categories,
  onToggle,
  onUpdate,
  onDelete,
}: {
  item: IncomeSource | RecurringBill;
  type: "income" | "bill";
  categories: readonly string[];
  onToggle: () => void;
  onUpdate: (updates: Partial<IncomeSource & RecurringBill>) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const name = type === "income" ? (item as IncomeSource).source : (item as RecurringBill).name;

  const confidenceColor = item.confidence === "high"
    ? "default"
    : item.confidence === "medium"
    ? "secondary"
    : "outline";

  if (isEditing) {
    return (
      <Card className="border-primary">
        <CardContent className="p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder={type === "income" ? "Source name" : "Bill name"}
              defaultValue={name}
              onChange={(e) =>
                type === "income"
                  ? onUpdate({ source: e.target.value })
                  : onUpdate({ name: e.target.value })
              }
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Amount"
              defaultValue={String(item.amount)}
              onChange={(e) => onUpdate({ amount: parseFloat(e.target.value) || 0 })}
            />
            <Select
              defaultValue={item.category}
              onValueChange={(val) => onUpdate({ category: val })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              defaultValue={item.recurrence}
              onValueChange={(val) => onUpdate({ recurrence: val })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECURRENCE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Day of month:</span>
            <Input
              type="number"
              min={1}
              max={31}
              className="w-16 h-7 text-xs"
              defaultValue={String(item.dueDay)}
              onChange={(e) => onUpdate({ dueDay: parseInt(e.target.value) || 1 })}
            />
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={item.selected ? "border-primary/50" : "opacity-50"}>
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <Checkbox checked={item.selected} onCheckedChange={onToggle} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.category} &middot; {item.recurrence} &middot; day {item.dueDay}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-medium text-sm">${Number(item.amount).toFixed(2)}</span>
                <Badge variant={confidenceColor} className="text-xs">
                  {item.confidence}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsEditing(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function WelcomeStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-2xl">Welcome to Budget Smart AI!</DialogTitle>
        <DialogDescription>
          Let's set up your budget in a few quick steps.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-6">
        <div className="flex items-start gap-3">
          <Building2 className="h-5 w-5 mt-0.5 text-primary shrink-0" />
          <div>
            <p className="font-medium">Connect your bank</p>
            <p className="text-sm text-muted-foreground">
              Securely link your bank account to automatically import transactions.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 mt-0.5 text-primary shrink-0" />
          <div>
            <p className="font-medium">AI-powered analysis</p>
            <p className="text-sm text-muted-foreground">
              Our AI will identify your recurring income and bills automatically.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 mt-0.5 text-primary shrink-0" />
          <div>
            <p className="font-medium">Review and customize</p>
            <p className="text-sm text-muted-foreground">
              Review what we found, make edits, and add anything we missed.
            </p>
          </div>
        </div>
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Skip setup
        </Button>
        <Button onClick={onNext} className="gap-2">
          Get Started <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}

interface WizardProvider {
  providerId: string;
  displayName: string;
  showInWizard: boolean;
  isEnabled: boolean;
}

function PlaidConnectionStep({ onNext, onSkip, onPlaidOpen }: { onNext: () => void; onSkip: () => void; onPlaidOpen?: (isOpen: boolean) => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  // MX widget state
  const [mxWidgetUrl, setMxWidgetUrl] = useState<string | null>(null);
  const [showMxWidget, setShowMxWidget] = useState(false);
  const [mxLoading, setMxLoading] = useState(false);
  // Consent dialog state
  const [showPlaidConsent, setShowPlaidConsent] = useState(false);
  const [plaidPrivacyChecked, setPlaidPrivacyChecked] = useState(false);
  const [showMxConsent, setShowMxConsent] = useState(false);
  const [mxPrivacyChecked, setMxPrivacyChecked] = useState(false);
  const { toast } = useToast();

  // Fetch which providers are enabled in the wizard
  const { data: wizardProviders = [], isLoading: providersLoading } = useQuery<WizardProvider[]>({
    queryKey: ["/api/bank-providers"],
  });

  const wizardEnabledProviders = wizardProviders.filter((p) => p.showInWizard);
  const plaidEnabled = wizardEnabledProviders.some((p) => p.providerId === "plaid");
  const mxEnabled = wizardEnabledProviders.some((p) => p.providerId === "mx");
  // Use the first enabled provider as preferred
  const preferredProvider = wizardEnabledProviders[0]?.providerId ?? null;

  useEffect(() => {
    if (providersLoading) return;
    if (!plaidEnabled) return; // Only fetch Plaid token when Plaid is enabled
    async function fetchLinkToken() {
      try {
        const res = await apiRequest("POST", "/api/plaid/create-link-token");
        const data = await res.json();
        setLinkToken(data.link_token);
      } catch (error) {
        console.error("Error fetching link token:", error);
        toast({ title: "Failed to initialize bank connection", variant: "destructive" });
      }
    }
    fetchLinkToken();
  }, [plaidEnabled, providersLoading]);

  const onPlaidSuccess = useCallback(async (publicToken: string, metadata: any) => {
    onPlaidOpen?.(false);
    setIsConnecting(true);
    try {
      await apiRequest("POST", "/api/plaid/exchange-token", {
        public_token: publicToken,
        metadata: { institution: metadata.institution },
      });
      toast({ title: "Bank account connected!" });
      setConnected(true);

      setIsSyncing(true);

      // Poll for transactions with retries - Plaid needs time to prepare data for new connections
      let attempts = 0;
      const maxAttempts = 10;
      let syncSuccess = false;

      while (attempts < maxAttempts && !syncSuccess) {
        attempts++;
        try {
          // Use fetch-historical for initial connection to get up to 2 years of data
          // This uses transactionsGet with explicit date ranges which is more reliable
          const syncRes = await apiRequest("POST", "/api/plaid/transactions/fetch-historical");
          const syncData = await syncRes.json();

          // Check if we got transactions
          if (syncData.added > 0 || attempts >= maxAttempts) {
            syncSuccess = true;
          } else {
            // Wait 3 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        } catch (syncError) {
          console.log("Sync attempt failed, retrying...", syncError);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
      setIsSyncing(false);

      await apiRequest("POST", "/api/onboarding/save-step", { step: 2 });
    } catch (error) {
      toast({ title: "Failed to connect bank account", variant: "destructive" });
      setConnected(false);
    } finally {
      setIsConnecting(false);
    }
  }, [toast, onPlaidOpen]);

  const onPlaidExit = useCallback(() => {
    onPlaidOpen?.(false);
  }, [onPlaidOpen]);

  // usePlaidLink must always be called (React hooks rule); token=null is safe when Plaid is disabled
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: onPlaidExit,
  });

  const handleOpenPlaid = useCallback(() => {
    onPlaidOpen?.(true);
    open();
  }, [open, onPlaidOpen]);

  const handlePlaidConsentAccept = useCallback(() => {
    setShowPlaidConsent(false);
    handleOpenPlaid();
  }, [handleOpenPlaid]);

  const handlePlaidConsentDialogChange = useCallback((isOpen: boolean) => {
    setShowPlaidConsent(isOpen);
    if (!isOpen) setPlaidPrivacyChecked(false);
  }, []);

  // MX connect handler
  const handleOpenMX = useCallback(async () => {
    setMxLoading(true);
    try {
      const res = await apiRequest("GET", "/api/mx/connect-widget");
      const data = await res.json();
      if (data.widgetUrl) {
        setMxWidgetUrl(data.widgetUrl);
        setShowMxWidget(true);
        onPlaidOpen?.(true);
      } else {
        toast({ title: "Failed to get connect widget", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: error.message || "Failed to connect", variant: "destructive" });
    } finally {
      setMxLoading(false);
    }
  }, [toast, onPlaidOpen]);

  const handleMxConsentAccept = useCallback(() => {
    setShowMxConsent(false);
    handleOpenMX();
  }, [handleOpenMX]);

  const handleMxConsentDialogChange = useCallback((isOpen: boolean) => {
    setShowMxConsent(isOpen);
    if (!isOpen) setMxPrivacyChecked(false);
  }, []);

  const handleMxDialogChange = useCallback((isOpen: boolean) => {
    setShowMxWidget(isOpen);
    if (!isOpen) onPlaidOpen?.(false);
  }, [onPlaidOpen]);

  // Handle postMessage from MX widget
  useEffect(() => {
    if (!mxEnabled) return;
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.mx === true) {
        const { type, metadata } = event.data;
        if (type === "mx/connect/memberConnected") {
          try {
            const memberGuid = metadata?.member_guid;
            if (memberGuid) {
              await apiRequest("POST", `/api/mx/members/${memberGuid}/sync`);
              await apiRequest("POST", "/api/mx/transactions/sync");
            }
            toast({ title: "Bank account connected!" });
          } catch (err) {
            console.error("[MX wizard] Sync error (background sync will retry):", err);
            toast({ title: "Bank account connected!", description: "Initial sync encountered an error — transactions will sync shortly." });
          }
          setConnected(true);
          setShowMxWidget(false);
          onPlaidOpen?.(false);
          await apiRequest("POST", "/api/onboarding/save-step", { step: 2 });
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [mxEnabled, toast, onPlaidOpen]);

  const providerName =
    preferredProvider === "mx" ? "MX" :
    preferredProvider === "plaid" ? "Plaid" :
    "bank connection";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Connect Your Bank Account</DialogTitle>
        <DialogDescription>
          Securely connect your bank to import transactions for analysis.
        </DialogDescription>
      </DialogHeader>
      <div className="py-8">
        {providersLoading ? (
          <div className="text-center">
            <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading connection options...</p>
          </div>
        ) : !connected ? (
          <div className="text-center">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            {wizardEnabledProviders.length === 0 ? (
              <p className="text-sm text-muted-foreground mb-4">
                No automated bank connection is currently available. You can skip and add accounts manually later.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  We use {providerName} to securely connect to your bank. Your credentials are never stored by Budget Smart AI.
                </p>
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-6 text-left">
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    <strong>Shared computer?</strong> If others use this browser with their own accounts, please use a private/incognito window to prevent bank login conflicts.
                  </p>
                </div>
                {/* Show the preferred provider's connect button */}
                {preferredProvider === "plaid" && (
                  <Button
                    onClick={() => setShowPlaidConsent(true)}
                    disabled={!ready || !linkToken || isConnecting}
                    className="gap-2"
                    size="lg"
                  >
                    {isConnecting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                    Connect Bank Account
                  </Button>
                )}
                {preferredProvider === "mx" && (
                  <Button
                    onClick={() => setShowMxConsent(true)}
                    disabled={mxLoading || isConnecting}
                    className="gap-2"
                    size="lg"
                  >
                    {mxLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                    Connect Bank Account
                  </Button>
                )}
              </>
            )}
          </div>
        ) : isSyncing ? (
          <div className="text-center">
            <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
            <p className="font-medium">Syncing your transactions...</p>
            <p className="text-sm text-muted-foreground mt-1">
              Fetching up to 2 years of transaction history. This may take 30-60 seconds.
            </p>
          </div>
        ) : (
          <div className="text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <p className="font-medium">Bank account connected!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Transactions synced. Ready for AI analysis.
            </p>
          </div>
        )}
      </div>

      {/* MX Connect Widget — full-screen overlay, mirrors Plaid Link pattern */}
      {mxEnabled && showMxWidget && mxWidgetUrl && createPortal(
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483647,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.7)",
          }}
        >
          <div
            className="mx-widget-overlay-content bg-background shadow-2xl"
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <span className="font-semibold text-sm">Connect Your Bank</span>
              <button
                onClick={() => handleMxDialogChange(false)}
                className="rounded-full p-1 hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <iframe
              src={mxWidgetUrl}
              style={{ width: "100%", flex: 1, border: "none" }}
              title="MX Connect"
              allow="camera; microphone"
            />
          </div>
        </div>,
        document.body
      )}

      {/* Plaid Informed Consent Dialog */}
      <AlertDialog open={showPlaidConsent} onOpenChange={handlePlaidConsentDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Connect Your Bank via Plaid</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                By connecting your bank account, you consent to BudgetSmart accessing your financial data through Plaid. This includes account balances, transaction history, and account details. Your bank credentials are entered directly with your bank — BudgetSmart never sees or stores them.
              </span>
              <span className="block bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-amber-800 dark:text-amber-200 text-sm">
                <strong>Shared computer?</strong> If others use this browser with their own accounts, please use a private/incognito window to prevent bank login conflicts.
              </span>
              <span className="block bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-blue-800 dark:text-blue-200 text-sm">
                <strong>You can revoke this consent at any time.</strong> Go to <strong>Settings → Accounts</strong> and click <strong>Unlink</strong> next to any connected account to remove access immediately.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-3 px-6 pb-2">
            <Checkbox
              id="plaid-privacy-consent-wizard"
              checked={plaidPrivacyChecked}
              onCheckedChange={(checked) => setPlaidPrivacyChecked(checked === true)}
            />
            <label htmlFor="plaid-privacy-consent-wizard" className="text-sm leading-snug cursor-pointer select-none">
              I have read and agree to BudgetSmart AI's{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary/80">
                Privacy Policy
              </a>{" "}
              and consent to my financial data being accessed through Plaid as described above.
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePlaidConsentAccept} disabled={!plaidPrivacyChecked}>I Consent — Connect Bank</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* MX Informed Consent Dialog */}
      <AlertDialog open={showMxConsent} onOpenChange={handleMxConsentDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Connect Your Bank via MX</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                By connecting your bank account, you consent to BudgetSmart accessing your financial data through MX Technologies. This includes:
              </span>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Account balances and account details</li>
                <li>Transaction history</li>
                <li>Account holder information</li>
              </ul>
              <span className="block text-sm">
                Your bank credentials are entered directly with your bank — BudgetSmart never sees or stores them. Your data is used solely to provide budgeting and financial insights within this app.
              </span>
              <span className="block bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-blue-800 dark:text-blue-200 text-sm">
                <strong>You can revoke this consent at any time.</strong> Go to <strong>Settings → Accounts</strong> and click <strong>Unlink</strong> next to any connected account to remove access immediately.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-3 px-6 pb-2">
            <Checkbox
              id="mx-privacy-consent-wizard"
              checked={mxPrivacyChecked}
              onCheckedChange={(checked) => setMxPrivacyChecked(checked === true)}
            />
            <label htmlFor="mx-privacy-consent-wizard" className="text-sm leading-snug cursor-pointer select-none">
              I have read and agree to BudgetSmart AI's{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary/80">
                Privacy Policy
              </a>{" "}
              and consent to my financial data being accessed through MX Technologies as described above.
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMxConsentAccept} disabled={!mxPrivacyChecked}>I Consent — Connect Bank</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onSkip}>
          Skip for now
        </Button>
        <Button onClick={onNext} disabled={!connected || isSyncing} className="gap-2">
          Continue <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}

function AIAnalysisStep({
  incomeSources,
  setIncomeSources,
  recurringBills,
  setRecurringBills,
  onNext,
  onBack,
}: {
  incomeSources: IncomeSource[];
  setIncomeSources: React.Dispatch<React.SetStateAction<IncomeSource[]>>;
  recurringBills: RecurringBill[];
  setRecurringBills: React.Dispatch<React.SetStateAction<RecurringBill[]>>;
  onNext: () => void;
  onBack: () => void;
}) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: plaidAccounts } = useQuery<any[]>({
    queryKey: ["/api/plaid/accounts"],
  });

  const hasConnectedAccounts = Array.isArray(plaidAccounts) && plaidAccounts.length > 0;

  useEffect(() => {
    if (plaidAccounts === undefined) return; // still loading
    if (!hasConnectedAccounts) {
      // Clear any stale cached data from a previously-connected account
      setIncomeSources([]);
      setRecurringBills([]);
      setAnalysisComplete(false);
      return;
    }
    if (incomeSources.length === 0 && recurringBills.length === 0 && !analysisComplete) {
      runAnalysis();
    } else if (incomeSources.length > 0 || recurringBills.length > 0) {
      setAnalysisComplete(true);
    }
  }, [plaidAccounts]);

  async function runAnalysis() {
    setIsAnalyzing(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/analyze-transactions");
      const data = await res.json();

      setIncomeSources(
        (data.incomeSources || []).map((s: any) => ({
          ...s,
          amount: Number(s.amount) || 0,
          dueDay: Number(s.dueDay) || 1,
          selected: s.confidence === "high" || s.confidence === "medium",
        }))
      );
      setRecurringBills(
        (data.recurringBills || []).map((b: any) => ({
          ...b,
          amount: Number(b.amount) || 0,
          dueDay: Number(b.dueDay) || 1,
          selected: b.confidence === "high" || b.confidence === "medium",
        }))
      );
      setAnalysisComplete(true);
    } catch (err: any) {
      setError(err.message || "Failed to analyze transactions");
      toast({ title: "Analysis failed", description: "You can retry or skip to manual entry.", variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  }

  function toggleIncome(idx: number) {
    setIncomeSources((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, selected: !s.selected } : s))
    );
  }

  function updateIncome(idx: number, updates: Partial<IncomeSource>) {
    setIncomeSources((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...updates } : s))
    );
  }

  function deleteIncome(idx: number) {
    setIncomeSources((prev) => prev.filter((_, i) => i !== idx));
  }

  function toggleBill(idx: number) {
    setRecurringBills((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, selected: !b.selected } : b))
    );
  }

  function updateBill(idx: number, updates: Partial<RecurringBill>) {
    setRecurringBills((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, ...updates } : b))
    );
  }

  function deleteBill(idx: number) {
    setRecurringBills((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>AI Analysis Results</DialogTitle>
        <DialogDescription>
          We found these recurring patterns. Select the ones to add to your budget.
        </DialogDescription>
      </DialogHeader>

      {plaidAccounts === undefined ? (
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Checking bank connection...</p>
        </div>
      ) : !hasConnectedAccounts ? (
        <div className="text-center py-8 space-y-3">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="font-medium">No bank account connected</p>
          <p className="text-sm text-muted-foreground">
            Connect a bank account first to detect income and bills automatically.
          </p>
          <Button variant="outline" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Go Back to Connect
          </Button>
        </div>
      ) : isAnalyzing ? (
        <div className="text-center py-12">
          <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
          <p className="font-medium">Analyzing your transactions...</p>
          <p className="text-sm text-muted-foreground mt-1">
            Our AI is identifying income and recurring bills.
          </p>
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={runAnalysis} variant="outline">
            Retry Analysis
          </Button>
        </div>
      ) : (
        <div className="space-y-4 py-4 max-h-[50vh] overflow-y-auto">
          <div>
            <h3 className="font-medium text-sm mb-2">
              Income Sources ({incomeSources.filter((s) => s.selected).length} selected)
            </h3>
            {incomeSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recurring income detected.</p>
            ) : (
              <div className="space-y-2">
                {incomeSources.map((inc, idx) => (
                  <AnalysisCard
                    key={idx}
                    item={inc}
                    type="income"
                    categories={INCOME_CATEGORIES}
                    onToggle={() => toggleIncome(idx)}
                    onUpdate={(updates) => updateIncome(idx, updates)}
                    onDelete={() => deleteIncome(idx)}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-medium text-sm mb-2">
              Recurring Bills ({recurringBills.filter((b) => b.selected).length} selected)
            </h3>
            {recurringBills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recurring bills detected.</p>
            ) : (
              <div className="space-y-2">
                {recurringBills.map((bill, idx) => (
                  <AnalysisCard
                    key={idx}
                    item={bill}
                    type="bill"
                    categories={BILL_CATEGORIES}
                    onToggle={() => toggleBill(idx)}
                    onUpdate={(updates) => updateBill(idx, updates)}
                    onDelete={() => deleteBill(idx)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {hasConnectedAccounts && (
          <Button onClick={onNext} disabled={isAnalyzing} className="gap-2">
            <CheckCircle2 className="h-4 w-4" /> Complete Setup
          </Button>
        )}
      </div>
    </>
  );
}

function ManualBillStep({
  incomeSources,
  recurringBills,
  manualBills,
  setManualBills,
  onComplete,
  onBack,
}: {
  incomeSources: IncomeSource[];
  recurringBills: RecurringBill[];
  manualBills: RecurringBill[];
  setManualBills: React.Dispatch<React.SetStateAction<RecurringBill[]>>;
  onComplete: () => void;
  onBack: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newCategory, setNewCategory] = useState("Other");
  const [newRecurrence, setNewRecurrence] = useState("monthly");
  const [newDueDay, setNewDueDay] = useState("1");
  const { toast } = useToast();

  function addManualBill() {
    if (!newName.trim() || !newAmount) {
      toast({ title: "Please enter a name and amount", variant: "destructive" });
      return;
    }
    setManualBills((prev) => [
      ...prev,
      {
        name: newName.trim(),
        amount: parseFloat(newAmount) || 0,
        category: newCategory,
        recurrence: newRecurrence,
        dueDay: parseInt(newDueDay) || 1,
        confidence: "manual",
        selected: true,
      },
    ]);
    setNewName("");
    setNewAmount("");
    setNewCategory("Other");
    setNewRecurrence("monthly");
    setNewDueDay("1");
  }

  function removeManualBill(idx: number) {
    setManualBills((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleFinish() {
    setIsSubmitting(true);
    try {
      const selectedIncome = incomeSources.filter((s) => s.selected);
      const selectedBills = [
        ...recurringBills.filter((b) => b.selected),
        ...manualBills,
      ];

      if (selectedIncome.length > 0 || selectedBills.length > 0) {
        await apiRequest("POST", "/api/onboarding/save-selections", {
          incomeSources: selectedIncome,
          bills: selectedBills,
        });
      }

      await apiRequest("POST", "/api/onboarding/complete");

      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });

      toast({
        title: "Setup complete!",
        description: `Added ${selectedIncome.length} income source(s) and ${selectedBills.length} bill(s).`,
      });
      onComplete();
    } catch (error) {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const totalIncome = incomeSources.filter((s) => s.selected).length;
  const totalBills = recurringBills.filter((b) => b.selected).length + manualBills.length;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add Any Missing Bills</DialogTitle>
        <DialogDescription>
          Add any recurring bills that were not detected automatically.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input
            placeholder="Bill name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            placeholder="Amount"
            type="number"
            step="0.01"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
          />
          <Select value={newCategory} onValueChange={setNewCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {BILL_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={newRecurrence} onValueChange={setNewRecurrence}>
            <SelectTrigger>
              <SelectValue placeholder="Recurrence" />
            </SelectTrigger>
            <SelectContent>
              {RECURRENCE_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Day:</span>
            <Input
              type="number"
              min={1}
              max={31}
              value={newDueDay}
              onChange={(e) => setNewDueDay(e.target.value)}
              className="w-20"
            />
          </div>
          <Button onClick={addManualBill} className="gap-2">
            <Plus className="h-4 w-4" /> Add Bill
          </Button>
        </div>

        {manualBills.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Manually added bills:</h4>
            {manualBills.map((bill, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 border rounded-md">
                <div>
                  <span className="text-sm font-medium">{bill.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    ${bill.amount.toFixed(2)} / {bill.recurrence}
                  </span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeManualBill(idx)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="bg-muted p-3 rounded-lg">
          <p className="text-sm font-medium">Summary</p>
          <p className="text-xs text-muted-foreground">
            {totalIncome} income source(s) and {totalBills} bill(s) will be added to your budget.
          </p>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button onClick={handleFinish} disabled={isSubmitting} className="gap-2">
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Complete Setup
        </Button>
      </div>
    </>
  );
}

export function OnboardingWizard({ open, onComplete, isDemo = false }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [recurringBills, setRecurringBills] = useState<RecurringBill[]>([]);
  const [manualBills, setManualBills] = useState<RecurringBill[]>([]);
  const [plaidOpen, setPlaidOpen] = useState(false);
  const { toast } = useToast();

  const { data: onboardingStatus } = useQuery<{
    onboardingComplete: boolean;
    currentStep: number;
    hasPlaidConnection: boolean;
    hasAnalysis: boolean;
    analysisData: { incomeSources?: any[]; recurringBills?: any[] } | null;
  }>({
    queryKey: ["/api/onboarding/status"],
    enabled: open,
  });

  useEffect(() => {
    if (onboardingStatus) {
      if (onboardingStatus.hasPlaidConnection && step === 1) {
        setStep(2);
      }
      if (onboardingStatus.analysisData) {
        if (onboardingStatus.analysisData.incomeSources && incomeSources.length === 0) {
          setIncomeSources(
            onboardingStatus.analysisData.incomeSources.map((s: any) => ({
              ...s,
              amount: Number(s.amount) || 0,
              dueDay: Number(s.dueDay) || 1,
              selected: s.confidence === "high" || s.confidence === "medium",
            }))
          );
        }
        if (onboardingStatus.analysisData.recurringBills && recurringBills.length === 0) {
          setRecurringBills(
            onboardingStatus.analysisData.recurringBills.map((b: any) => ({
              ...b,
              amount: Number(b.amount) || 0,
              dueDay: Number(b.dueDay) || 1,
              selected: b.confidence === "high" || b.confidence === "medium",
            }))
          );
        }
      }
      if (onboardingStatus.currentStep > step) {
        setStep(onboardingStatus.currentStep);
      }
    }
  }, [onboardingStatus]);

  async function handleSkip() {
    // In demo mode, just close the wizard without making API calls
    if (isDemo) {
      toast({ title: "Demo mode - setup wizard closed." });
      onComplete();
      return;
    }
    
    try {
      await apiRequest("POST", "/api/onboarding/complete");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      toast({ title: "Setup skipped. You can configure your budget anytime." });
      onComplete();
    } catch {
      toast({ title: "Failed to skip", variant: "destructive" });
    }
  }

  const progressValue = (step / 3) * 100;

  // Handle completing setup from step 3 (previously step 4 handled this)
  async function handleCompleteFromStep3() {
    try {
      // Save selected income and bills
      const selectedIncome = incomeSources.filter(s => s.selected);
      const selectedBills = recurringBills.filter(b => b.selected);

      for (const inc of selectedIncome) {
        await apiRequest("POST", "/api/income", {
          source: inc.source,
          amount: String(inc.amount),
          category: inc.category || "Other",
          date: new Date().toISOString().split("T")[0],
          isRecurring: true,
          recurrence: inc.recurrence || "monthly",
          dueDay: inc.dueDay || 1,
        });
      }

      for (const bill of selectedBills) {
        await apiRequest("POST", "/api/bills", {
          name: bill.name,
          amount: bill.amount,
          category: bill.category,
          recurrence: bill.recurrence,
          dueDay: bill.dueDay,
        });
      }

      // Mark onboarding complete
      await apiRequest("POST", "/api/onboarding/complete");
      
      toast({ title: "Setup complete!", description: `Added ${selectedIncome.length} income source(s) and ${selectedBills.length} bill(s).` });
      onComplete();
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && !plaidOpen) handleSkip(); }}>
      <DialogContent
        className={`max-w-2xl max-h-[90vh] overflow-y-auto ${plaidOpen ? 'pointer-events-none opacity-50' : ''}`}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => { if (!plaidOpen) e.preventDefault(); }}
        style={plaidOpen ? { zIndex: 10 } : undefined}
      >
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">Step {step} of 3</p>
            {step > 1 && (
              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={handleSkip}>
                <X className="h-3 w-3" /> Skip
              </Button>
            )}
          </div>
          <Progress value={progressValue} className="h-2" />
        </div>

        {step === 1 && (
          <WelcomeStep onNext={() => setStep(2)} onSkip={handleSkip} />
        )}
        {step === 2 && (
          <PlaidConnectionStep
            onNext={() => setStep(3)}
            onSkip={handleSkip}
            onPlaidOpen={setPlaidOpen}
          />
        )}
        {step === 3 && (
          <AIAnalysisStep
            incomeSources={incomeSources}
            setIncomeSources={setIncomeSources}
            recurringBills={recurringBills}
            setRecurringBills={setRecurringBills}
            onNext={handleCompleteFromStep3}
            onBack={() => setStep(2)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
