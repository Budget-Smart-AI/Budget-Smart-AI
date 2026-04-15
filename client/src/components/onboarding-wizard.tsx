import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
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
import { Button } from "@/components/ui/button";
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
import { EXPENSE_CATEGORIES } from "@shared/schema";
import {
  Building2,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Sparkles,
  BarChart3,
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Car,
  Film,
  ShoppingBag,
  Utensils,
  ChevronRight,
  Smartphone,
  BellOff,
  Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  open: boolean;
  onComplete: () => void;
  isDemo?: boolean;
}

interface WizardProvider {
  providerId: string;
  displayName: string;
  showInWizard: boolean;
  isEnabled: boolean;
}

// ─── Country detection ────────────────────────────────────────────────────────

function detectCountry(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || "";
    if (locale.includes("CA") || locale.toLowerCase().includes("-ca")) return "CA";
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.includes("America")) return "US";
  } catch {
    // ignore
  }
  return "US";
}

// ─── Progress Indicator ───────────────────────────────────────────────────────

function StepProgress({ current, total }: { current: number; total: number }) {
  const labels = ["Welcome", "Connect Bank", "Monthly Income", "You're Ready!"];
  // Show 100% on the final step
  const pct = current >= total ? 100 : Math.round(((current - 1) / total) * 100);
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground">
          Step {current} of {total} — {labels[current - 1]}
        </p>
        <p className="text-xs text-muted-foreground">{pct}%</p>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
              i < current - 1
                ? "bg-primary"
                : i === current - 1
                ? "bg-primary animate-pulse"
                : "bg-muted"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Step 1: Welcome ──────────────────────────────────────────────────────────

function WelcomeStep({
  onNext,
  firstName,
}: {
  onNext: () => void;
  firstName?: string | null;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="text-4xl mb-3">🎉</div>
        <h2 className="text-2xl font-bold tracking-tight">
          Welcome to BudgetSmart AI{firstName ? `, ${firstName}` : ""}!
        </h2>
        <p className="text-muted-foreground text-sm">
          Let's get your finances set up in under 5 minutes
        </p>
      </div>

      <div className="space-y-3">
        {[
          {
            icon: <Building2 className="h-5 w-5 text-blue-500" />,
            title: "Connect your bank — see everything instantly",
            bg: "bg-blue-50 dark:bg-blue-950/30",
          },
          {
            icon: <Sparkles className="h-5 w-5 text-purple-500" />,
            title: "AI categorizes every transaction automatically",
            bg: "bg-purple-50 dark:bg-purple-950/30",
          },
          {
            icon: <BarChart3 className="h-5 w-5 text-green-500" />,
            title: "Know exactly where your money goes",
            bg: "bg-green-50 dark:bg-green-950/30",
          },
        ].map((item, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 p-3 rounded-lg ${item.bg}`}
          >
            <div className="shrink-0">{item.icon}</div>
            <p className="text-sm font-medium">{item.title}</p>
          </div>
        ))}
      </div>

      <Button onClick={onNext} className="w-full gap-2" size="lg">
        Let's Go <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ─── Step 2: Connect Bank ─────────────────────────────────────────────────────

function ConnectBankStep({
  onNext,
  onSkip,
  onPlaidOpen,
  onBankConnected,
  initialCountry,
  onCountryChange,
}: {
  onNext: () => void;
  onSkip: () => void;
  onPlaidOpen?: (isOpen: boolean) => void;
  onBankConnected: (connected: boolean, accountCount?: number, txCount?: number) => void;
  initialCountry: string;
  onCountryChange: (country: string, state: string) => void;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  // Provider-agnostic bank-link intent. Held in component state ONLY — never
  // persisted to localStorage / sessionStorage / React Query cache. The server
  // validates this id matches the still-current session user before
  // exchanging the Plaid public_token (or syncing the MX member).
  const [intentId, setIntentId] = useState<string | null>(null);
  const [mxIntentId, setMxIntentId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [accountCount, setAccountCount] = useState(0);
  const [txCount, setTxCount] = useState(0);
  const [autoAdvanceTimer, setAutoAdvanceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  // MX widget state
  const [mxWidgetUrl, setMxWidgetUrl] = useState<string | null>(null);
  const [showMxWidget, setShowMxWidget] = useState(false);
  const [mxLoading, setMxLoading] = useState(false);
  // Consent + country state
  const [showPlaidConsent, setShowPlaidConsent] = useState(false);
  const [plaidPrivacyChecked, setPlaidPrivacyChecked] = useState(false);
  const [showMxConsent, setShowMxConsent] = useState(false);
  const [mxPrivacyChecked, setMxPrivacyChecked] = useState(false);
  // Inline consent checkbox (in wizard step)
  const [consentChecked, setConsentChecked] = useState(false);
  // Country / state
  const [country, setCountry] = useState(initialCountry || detectCountry());
  const [stateProvince, setStateProvince] = useState("");
  // Sub-step: 'connect-bank' | 'phone-ready'
  const [subStep, setSubStep] = useState<"connect-bank" | "phone-ready">("connect-bank");
  const [pendingPlaidOpen, setPendingPlaidOpen] = useState(false);

  const { toast } = useToast();

  const { data: wizardProviders = [], isLoading: providersLoading } = useQuery<WizardProvider[]>({
    queryKey: ["/api/bank-providers"],
  });

  const wizardEnabledProviders = wizardProviders.filter((p) => p.showInWizard);
  const plaidEnabled = wizardEnabledProviders.some((p) => p.providerId === "plaid");
  const mxEnabled = wizardEnabledProviders.some((p) => p.providerId === "mx");
  const preferredProvider = wizardEnabledProviders[0]?.providerId ?? null;

  // Link token creation is deferred — NOT fetched on mount.
  // It's fetched when the user clicks "I'm Ready — Connect My Bank" in the
  // phone-ready sub-step, so Plaid's SMS verification doesn't fire early.
  const fetchLinkToken = useCallback(async () => {
    try {
      const res = await apiRequest("POST", "/api/plaid/create-link-token");
      const data = await res.json();
      if (data.link_token) {
        setLinkToken(data.link_token);
        // Capture the bank-link intent — must be passed back at exchange time.
        setIntentId(data.intent_id ?? null);
        return data.link_token;
      }
    } catch (error: any) {
      console.error("Error fetching link token:", error);
      setPendingPlaidOpen(false);
      const msg = error?.message || "Failed to connect bank account.";
      toast({
        title: "Unable to connect bank",
        description: msg,
        variant: "destructive",
      });
    }
    return null;
  }, [toast]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
    };
  }, [autoAdvanceTimer]);

  // Notify parent of country/state changes
  useEffect(() => {
    onCountryChange(country, stateProvince);
  }, [country, stateProvince]);

  // Reset state when country changes
  useEffect(() => {
    setStateProvince("");
  }, [country]);

  const onPlaidSuccess = useCallback(async (publicToken: string, metadata: any) => {
    onPlaidOpen?.(false);
    setIsConnecting(true);
    try {
      await apiRequest("POST", "/api/plaid/exchange-token", {
        public_token: publicToken,
        intent_id: intentId,
        metadata: { institution: metadata.institution },
      });
      // Single-use intent — clear immediately. Server enforces single-use too.
      setIntentId(null);
      setLinkToken(null);
      setConnected(true);
      setIsSyncing(true);
      setSyncMessage("🎉 Connected! Finding your transactions...");

      // Poll for transactions
      let attempts = 0;
      const maxAttempts = 10;
      let syncSuccess = false;

      while (attempts < maxAttempts && !syncSuccess) {
        attempts++;
        try {
          const syncRes = await apiRequest("POST", "/api/plaid/transactions/fetch-historical");
          const syncData = await syncRes.json();

          if (syncData.added > 0 || attempts >= maxAttempts) {
            syncSuccess = true;
            setTxCount(syncData.added || 0);

            // Get account count
            try {
              const acctRes = await apiRequest("GET", "/api/plaid/accounts");
              const accts = await acctRes.json();
              const count = Array.isArray(accts)
                ? accts.reduce((sum: number, item: any) => sum + (item.accounts?.length || 0), 0)
                : 0;
              setAccountCount(count);
              onBankConnected(true, count, syncData.added || 0);
            } catch {
              onBankConnected(true, 1, syncData.added || 0);
            }
          } else {
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }

      setIsSyncing(false);
      setSyncMessage("");
      await apiRequest("POST", "/api/onboarding/save-step", { step: 2 });
    } catch {
      toast({ title: "Failed to connect bank account", variant: "destructive" });
      setConnected(false);
    } finally {
      setIsConnecting(false);
    }
    // intentId is read inside this callback (passed to exchange-token).
    // Omitting it from deps caches a stale `null` value in the closure
    // because the callback is created before fetchLinkToken runs. Leaving it
    // out was the cause of the 403 bank_link_session_invalid error on the
    // onboarding flow.
  }, [toast, onPlaidOpen, onBankConnected, intentId]);

  const onPlaidExit = useCallback(() => {
    onPlaidOpen?.(false);
  }, [onPlaidOpen]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: onPlaidExit,
  });

  // Auto-open Plaid once link token arrives after user clicked connect
  useEffect(() => {
    if (pendingPlaidOpen && linkToken && ready) {
      setPendingPlaidOpen(false);
      onPlaidOpen?.(true);
      open();
    }
  }, [pendingPlaidOpen, linkToken, ready, open, onPlaidOpen]);

  const openPlaidLink = useCallback(async () => {
    if (linkToken && ready) {
      // Token already available — open immediately
      onPlaidOpen?.(true);
      open();
    } else {
      // Fetch token now, auto-open via effect above
      setPendingPlaidOpen(true);
      await fetchLinkToken();
    }
  }, [open, ready, onPlaidOpen, linkToken, fetchLinkToken]);

  // Save country/state to DB then show phone-ready screen
  const handleConnectBank = useCallback(async () => {
    try {
      await apiRequest("PATCH", "/api/user/household", {
        country,
        provinceState: stateProvince || null,
      });
    } catch (err) {
      console.error("Failed to save country:", err);
    }
    setSubStep("phone-ready");
  }, [country, stateProvince]);

  const handlePlaidConsentAccept = useCallback(() => {
    setShowPlaidConsent(false);
    openPlaidLink();
  }, [openPlaidLink]);

  const handleOpenMX = useCallback(async () => {
    setMxLoading(true);
    try {
      const res = await apiRequest("GET", "/api/mx/connect-widget");
      const data = await res.json();
      if (data.widgetUrl) {
        setMxWidgetUrl(data.widgetUrl);
        // Capture intent — must be passed back when MX posts memberConnected.
        setMxIntentId(data.intent_id ?? null);
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
              await apiRequest("POST", `/api/mx/members/${memberGuid}/sync`, {
                intent_id: mxIntentId,
              });
              await apiRequest("POST", "/api/mx/transactions/sync");
            }
            // Single-use intent — clear immediately.
            setMxIntentId(null);
            toast({ title: "Bank account connected!" });
          } catch (err) {
            console.error("[MX wizard] Sync error:", err);
          }
          setConnected(true);
          onBankConnected(true, 1, 0);
          setShowMxWidget(false);
          onPlaidOpen?.(false);
          await apiRequest("POST", "/api/onboarding/save-step", { step: 2 });
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [mxEnabled, toast, onPlaidOpen, onBankConnected, mxIntentId]);

  // Auto-advance after 30s if syncing
  useEffect(() => {
    if (isSyncing) {
      const timer = setTimeout(() => {
        setSyncMessage("Your transactions are loading in the background. Let's keep going!");
        setIsSyncing(false);
        onBankConnected(true, accountCount, txCount);
      }, 30000);
      setAutoAdvanceTimer(timer);
      return () => clearTimeout(timer);
    }
  }, [isSyncing]);

  const skipBankConnection = useCallback(() => {
    onSkip();
  }, [onSkip]);

  // ── Phone Ready sub-step ──────────────────────────────────────────────────
  if (subStep === "phone-ready") {
    return (
      <div className="flex flex-col items-center text-center px-1">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
          <Smartphone size={28} className="text-amber-500" />
        </div>

        <h2 className="text-lg font-bold mb-2">Get Your Phone Ready</h2>
        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
          Your bank will verify your identity before sharing data. Here's what to expect:
        </p>

        <div className="w-full space-y-2.5 mb-5 text-left">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border">
            <BellOff size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-0.5">
                Turn off Silent / Do Not Disturb
              </p>
              <p className="text-xs text-muted-foreground">
                You must receive notifications to complete the bank verification.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border">
            <Smartphone size={16} className="text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold mb-0.5">Open your banking app</p>
              <p className="text-xs text-muted-foreground">
                Many banks (Scotiabank, TD, RBC, Chase, Bank of America and others) send a push
                notification to their app to confirm it's really you. Approve it when it appears.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border">
            <Info size={16} className="text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Missed the notification?</span>{" "}
                Just close and try again — your data is always safe.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={openPlaidLink}
          className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          I'm Ready — Connect My Bank
          <ArrowRight size={16} />
        </button>

        <button
          onClick={skipBankConnection}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground underline transition-colors"
        >
          Skip for now — add manually →
        </button>
      </div>
    );
  }

  // ── Main connect-bank sub-step ────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <div className="text-3xl mb-2">🏦</div>
        <h2 className="text-xl font-bold">Connect your bank to unlock the magic</h2>
        <p className="text-sm text-muted-foreground">
          Securely link your bank — your credentials are never stored by BudgetSmart
        </p>
      </div>

      {providersLoading ? (
        <div className="text-center py-8">
          <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading connection options...</p>
        </div>
      ) : isSyncing ? (
        <div className="text-center py-8 space-y-3">
          <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
          <p className="font-semibold text-lg">🎉 Connected! Finding your transactions...</p>
          <p className="text-sm text-muted-foreground">
            Fetching up to 2 years of transaction history. This may take 30–60 seconds.
          </p>
          {syncMessage && (
            <p className="text-xs text-muted-foreground italic">{syncMessage}</p>
          )}
        </div>
      ) : connected ? (
        <div className="text-center py-4 space-y-4">
          <CheckCircle2 className="h-14 w-14 mx-auto text-green-500" />
          <p className="font-semibold text-lg text-green-600 dark:text-green-400">
            Bank connected successfully!
          </p>
          {txCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {txCount} transactions imported across {accountCount} account{accountCount !== 1 ? "s" : ""}
            </p>
          )}

          {/* Add another bank — upgrade required for free users */}
          <div className="bg-muted/40 border border-border rounded-xl p-4 text-left space-y-2">
            <p className="text-sm font-semibold">Want to add another bank?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Multiple bank connections require a <strong>Pro</strong> or <strong>Family</strong> plan.
              Upgrade anytime from Settings → Billing.
            </p>
            <a
              href="/settings/billing"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              View upgrade options <ArrowRight size={12} />
            </a>
          </div>

          <Button onClick={onNext} className="w-full gap-2" size="lg">
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {wizardEnabledProviders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No automated bank connection is currently available. You can skip and add accounts manually later.
            </p>
          ) : (
            <>
              {/* ── Country / State selector ── */}
              <div className="w-full space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Your Country
                  </label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="US">🇺🇸 United States</SelectItem>
                      <SelectItem value="CA">🇨🇦 Canada</SelectItem>
                      <SelectItem value="GB">🇬🇧 United Kingdom</SelectItem>
                      <SelectItem value="AU">🇦🇺 Australia</SelectItem>
                      <SelectItem value="OTHER">🌍 Other Country</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(country === "US" || country === "CA") && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      {country === "CA" ? "Province" : "State"}
                    </label>
                    <Select value={stateProvince} onValueChange={setStateProvince}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={`Select ${country === "CA" ? "province" : "state"}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {country === "CA" ? (
                          <>
                            <SelectItem value="AB">Alberta</SelectItem>
                            <SelectItem value="BC">British Columbia</SelectItem>
                            <SelectItem value="MB">Manitoba</SelectItem>
                            <SelectItem value="NB">New Brunswick</SelectItem>
                            <SelectItem value="NL">Newfoundland and Labrador</SelectItem>
                            <SelectItem value="NS">Nova Scotia</SelectItem>
                            <SelectItem value="NT">Northwest Territories</SelectItem>
                            <SelectItem value="NU">Nunavut</SelectItem>
                            <SelectItem value="ON">Ontario</SelectItem>
                            <SelectItem value="PE">Prince Edward Island</SelectItem>
                            <SelectItem value="QC">Quebec</SelectItem>
                            <SelectItem value="SK">Saskatchewan</SelectItem>
                            <SelectItem value="YT">Yukon</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="AL">Alabama</SelectItem>
                            <SelectItem value="AK">Alaska</SelectItem>
                            <SelectItem value="AZ">Arizona</SelectItem>
                            <SelectItem value="AR">Arkansas</SelectItem>
                            <SelectItem value="CA">California</SelectItem>
                            <SelectItem value="CO">Colorado</SelectItem>
                            <SelectItem value="CT">Connecticut</SelectItem>
                            <SelectItem value="DE">Delaware</SelectItem>
                            <SelectItem value="FL">Florida</SelectItem>
                            <SelectItem value="GA">Georgia</SelectItem>
                            <SelectItem value="HI">Hawaii</SelectItem>
                            <SelectItem value="ID">Idaho</SelectItem>
                            <SelectItem value="IL">Illinois</SelectItem>
                            <SelectItem value="IN">Indiana</SelectItem>
                            <SelectItem value="IA">Iowa</SelectItem>
                            <SelectItem value="KS">Kansas</SelectItem>
                            <SelectItem value="KY">Kentucky</SelectItem>
                            <SelectItem value="LA">Louisiana</SelectItem>
                            <SelectItem value="ME">Maine</SelectItem>
                            <SelectItem value="MD">Maryland</SelectItem>
                            <SelectItem value="MA">Massachusetts</SelectItem>
                            <SelectItem value="MI">Michigan</SelectItem>
                            <SelectItem value="MN">Minnesota</SelectItem>
                            <SelectItem value="MS">Mississippi</SelectItem>
                            <SelectItem value="MO">Missouri</SelectItem>
                            <SelectItem value="MT">Montana</SelectItem>
                            <SelectItem value="NE">Nebraska</SelectItem>
                            <SelectItem value="NV">Nevada</SelectItem>
                            <SelectItem value="NH">New Hampshire</SelectItem>
                            <SelectItem value="NJ">New Jersey</SelectItem>
                            <SelectItem value="NM">New Mexico</SelectItem>
                            <SelectItem value="NY">New York</SelectItem>
                            <SelectItem value="NC">North Carolina</SelectItem>
                            <SelectItem value="ND">North Dakota</SelectItem>
                            <SelectItem value="OH">Ohio</SelectItem>
                            <SelectItem value="OK">Oklahoma</SelectItem>
                            <SelectItem value="OR">Oregon</SelectItem>
                            <SelectItem value="PA">Pennsylvania</SelectItem>
                            <SelectItem value="RI">Rhode Island</SelectItem>
                            <SelectItem value="SC">South Carolina</SelectItem>
                            <SelectItem value="SD">South Dakota</SelectItem>
                            <SelectItem value="TN">Tennessee</SelectItem>
                            <SelectItem value="TX">Texas</SelectItem>
                            <SelectItem value="UT">Utah</SelectItem>
                            <SelectItem value="VT">Vermont</SelectItem>
                            <SelectItem value="VA">Virginia</SelectItem>
                            <SelectItem value="WA">Washington</SelectItem>
                            <SelectItem value="WV">West Virginia</SelectItem>
                            <SelectItem value="WI">Wisconsin</SelectItem>
                            <SelectItem value="WY">Wyoming</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* ── Shared computer warning ── */}
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-left">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  <strong>Shared computer?</strong> Use a private/incognito window to prevent bank login conflicts.
                </p>
              </div>

              {/* ── Revoke notice ── */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-left">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  <strong>You can revoke this consent at any time.</strong> Go to{" "}
                  <strong>Settings → Accounts</strong> and click <strong>Unlink</strong> next to any
                  connected account to remove access immediately.
                </p>
              </div>

              {/* ── Inline consent checkbox ── */}
              <div className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/20">
                <Checkbox
                  id="plaid-consent-wizard"
                  checked={consentChecked}
                  onCheckedChange={(c) => setConsentChecked(c === true)}
                  className="mt-0.5"
                />
                <label
                  htmlFor="plaid-consent-wizard"
                  className="text-xs text-muted-foreground leading-relaxed cursor-pointer"
                >
                  I have read and agree to BudgetSmart AI's{" "}
                  <a href="/privacy" target="_blank" className="text-primary underline">
                    Privacy Policy
                  </a>{" "}
                  and consent to my financial data being accessed through Plaid as described.
                  <span className="block mt-1.5 text-muted-foreground/70">
                    You can revoke this at any time via Settings → Accounts → Unlink.
                  </span>
                </label>
              </div>

              {/* ── Connect button ── */}
              {preferredProvider === "plaid" && (
                <button
                  onClick={handleConnectBank}
                  disabled={!consentChecked || !country || isConnecting}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  {isConnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Building2 className="h-4 w-4" />
                  )}
                  Connect Bank Account
                </button>
              )}
              {preferredProvider === "mx" && (
                <button
                  onClick={() => setShowMxConsent(true)}
                  disabled={!consentChecked || !country || mxLoading || isConnecting}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  {mxLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Building2 className="h-4 w-4" />
                  )}
                  Connect Bank Account
                </button>
              )}

              {!country && (
                <p className="text-xs text-amber-500 text-center -mt-2">
                  Please select your country first
                </p>
              )}
            </>
          )}

          <div className="text-center">
            <button
              onClick={onSkip}
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Don't want to connect yet? Add transactions manually →
            </button>
          </div>
        </div>
      )}

      {/* MX Connect Widget overlay */}
      {mxEnabled && showMxWidget && mxWidgetUrl && createPortal(
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 2147483647,
            display: "flex", alignItems: "center", justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.7)",
          }}
        >
          <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "480px", height: "600px", background: "white", borderRadius: "12px", overflow: "hidden" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <span className="font-semibold text-sm">Connect Your Bank</span>
              <button onClick={() => handleMxDialogChange(false)} className="rounded-full p-1 hover:bg-muted transition-colors" aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>
            <iframe src={mxWidgetUrl} style={{ width: "100%", flex: 1, border: "none" }} title="MX Connect" allow="camera; microphone" />
          </div>
        </div>,
        document.body
      )}

      {/* MX Consent Dialog */}
      <AlertDialog open={showMxConsent} onOpenChange={(o) => { setShowMxConsent(o); if (!o) setMxPrivacyChecked(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Connect Your Bank via MX</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">By connecting your bank account, you consent to BudgetSmart accessing your financial data through MX Technologies. Your bank credentials are entered directly with your bank — BudgetSmart never sees or stores them.</span>
              <span className="block bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-blue-800 dark:text-blue-200 text-sm">
                <strong>You can revoke this consent at any time.</strong> Go to <strong>Settings → Accounts</strong> and click <strong>Unlink</strong>.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-3 px-6 pb-2">
            <Checkbox id="mx-consent" checked={mxPrivacyChecked} onCheckedChange={(c) => setMxPrivacyChecked(c === true)} />
            <label htmlFor="mx-consent" className="text-sm leading-snug cursor-pointer select-none">
              I agree to BudgetSmart AI's{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary/80">Privacy Policy</a>{" "}
              and consent to my financial data being accessed through MX Technologies.
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleMxConsentAccept} disabled={!mxPrivacyChecked}>I Consent — Connect Bank</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Step 3: Monthly Income ───────────────────────────────────────────────────

function MonthlyIncomeStep({
  onNext,
  onSkip,
  detectedIncome,
  detectedEmployer,
  selectedCountry,
}: {
  onNext: (income: number | null) => void;
  onSkip: () => void;
  detectedIncome?: number | null;
  detectedEmployer?: string | null;
  selectedCountry: string;
}) {
  const [income, setIncome] = useState<string>(detectedIncome ? String(detectedIncome) : "");
  const [confirmed, setConfirmed] = useState(false);

  // Currency label based on country
  const currencyLabel =
    selectedCountry === "CA" ? "CAD $" :
    selectedCountry === "GB" ? "GBP £" :
    selectedCountry === "AU" ? "AUD $" :
    "USD $";

  const handleNext = () => {
    const val = parseFloat(income);
    onNext(isNaN(val) || val <= 0 ? null : val);
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="text-3xl mb-2">💰</div>
        <h2 className="text-xl font-bold">What's your monthly take-home income?</h2>
        <p className="text-sm text-muted-foreground">
          This helps us calculate how much you can save and spend
        </p>
      </div>

      {detectedIncome && detectedEmployer && !confirmed && (
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            ✅ We detected your income as{" "}
            <strong>${detectedIncome.toLocaleString()}</strong> from{" "}
            <strong>{detectedEmployer}</strong> — is this correct?
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-green-300 text-green-700 hover:bg-green-100"
              onClick={() => {
                setIncome(String(detectedIncome));
                setConfirmed(true);
              }}
            >
              ✓ Yes, that's correct
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1"
              onClick={() => setConfirmed(true)}
            >
              No, I'll adjust
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">Monthly take-home income</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">
            {currencyLabel}
          </span>
          <Input
            type="number"
            min="0"
            step="100"
            placeholder="e.g. 4500"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            className="pl-20 text-lg h-12"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Enter your net (after-tax) monthly income
        </p>
      </div>

      <div className="space-y-2">
        <Button
          onClick={handleNext}
          disabled={!income || parseFloat(income) <= 0}
          className="w-full gap-2"
          size="lg"
        >
          Continue <ArrowRight className="h-4 w-4" />
        </Button>
        <button
          onClick={onSkip}
          className="w-full text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors py-1"
        >
          I'll set this later
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: First Budget Goal ────────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
  { key: "Restaurant & Bars", label: "Food & Dining", icon: <Utensils className="h-5 w-5" />, emoji: "🍕" },
  { key: "Groceries", label: "Groceries", icon: <ShoppingCart className="h-5 w-5" />, emoji: "🛒" },
  { key: "Transportation", label: "Transportation", icon: <Car className="h-5 w-5" />, emoji: "🚗" },
  { key: "Entertainment", label: "Entertainment", icon: <Film className="h-5 w-5" />, emoji: "🎬" },
  { key: "Shopping", label: "Shopping", icon: <ShoppingBag className="h-5 w-5" />, emoji: "🛍️" },
];

function BudgetGoalStep({
  onNext,
  onSkip,
  topCategories,
  selectedCountry,
}: {
  onNext: (category: string, amount: number) => void;
  onSkip: () => void;
  topCategories?: Array<{ category: string; total: number }>;
  selectedCountry: string;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [budgetAmount, setBudgetAmount] = useState<string>("");

  const currencyLabel =
    selectedCountry === "CA" ? "CAD $" :
    selectedCountry === "GB" ? "GBP £" :
    selectedCountry === "AU" ? "AUD $" :
    "USD $";

  // Build display categories: use top categories from transactions if available, else defaults
  const displayCategories = topCategories && topCategories.length > 0
    ? topCategories.slice(0, 5).map((tc) => {
        const def = DEFAULT_CATEGORIES.find((d) => d.key === tc.category);
        return {
          key: tc.category,
          label: def?.label || tc.category,
          emoji: def?.emoji || "📊",
          suggested: Math.round(tc.total * 1.1 / 50) * 50, // 10% above avg, rounded to $50
        };
      })
    : DEFAULT_CATEGORIES.map((d) => ({ ...d, suggested: 0 }));

  const selectedDef = displayCategories.find((c) => c.key === selectedCategory);

  const handleNext = () => {
    if (!selectedCategory) return;
    const val = parseFloat(budgetAmount);
    if (isNaN(val) || val <= 0) return;
    onNext(selectedCategory, val);
  };

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <div className="text-3xl mb-2">🎯</div>
        <h2 className="text-xl font-bold">Pick your #1 spending category to watch</h2>
        <p className="text-sm text-muted-foreground">
          We'll create your first budget automatically
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {displayCategories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => {
              setSelectedCategory(cat.key);
              if ((cat as any).suggested) {
                setBudgetAmount(String((cat as any).suggested));
              }
            }}
            className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
              selectedCategory === cat.key
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/50 hover:bg-muted/50"
            }`}
          >
            <span className="text-xl">{cat.emoji}</span>
            <span className="font-medium text-sm flex-1">{cat.label}</span>
            {selectedCategory === cat.key && (
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            )}
          </button>
        ))}
      </div>

      {selectedCategory && (
        <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <label className="text-sm font-medium">
            What's your monthly goal for{" "}
            <span className="text-primary">{selectedDef?.label || selectedCategory}</span>?
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">
              {currencyLabel}
            </span>
            <Input
              type="number"
              min="0"
              step="50"
              placeholder="e.g. 500"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              className="pl-20 text-lg h-12"
              autoFocus
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Button
          onClick={handleNext}
          disabled={!selectedCategory || !budgetAmount || parseFloat(budgetAmount) <= 0}
          className="w-full gap-2"
          size="lg"
        >
          Create My Budget <ArrowRight className="h-4 w-4" />
        </Button>
        <button
          onClick={onSkip}
          className="w-full text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors py-1"
        >
          I'll set this later
        </button>
      </div>
    </div>
  );
}

// ─── Step 5: You're Ready! ────────────────────────────────────────────────────

function ReadyStep({
  onComplete,
  onExplore,
  summary,
}: {
  onComplete: () => void;
  onExplore: () => void;
  summary: {
    bankConnected: boolean;
    accountCount: number;
    monthlyIncome: number | null;
    budgetCategory: string | null;
    budgetAmount: number | null;
    txCount: number;
    billsDetected: number;
  };
}) {
  const items = [
    summary.bankConnected && {
      label: `Bank connected (${summary.accountCount} account${summary.accountCount !== 1 ? "s" : ""})`,
      show: true,
    },
    summary.monthlyIncome && {
      label: `Monthly income: $${summary.monthlyIncome.toLocaleString()}`,
      show: true,
    },
    summary.budgetCategory && summary.budgetAmount && {
      label: `Budget goal: $${summary.budgetAmount.toLocaleString()} for ${summary.budgetCategory}`,
      show: true,
    },
    summary.txCount > 0 && {
      label: `${summary.txCount.toLocaleString()} transactions imported`,
      show: true,
    },
    summary.billsDetected > 0 && {
      label: `${summary.billsDetected} recurring bills detected`,
      show: true,
    },
  ].filter(Boolean) as Array<{ label: string; show: boolean }>;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="text-5xl mb-3 animate-bounce">🎉</div>
        <h2 className="text-2xl font-bold">You're all set!</h2>
        <p className="text-sm text-muted-foreground">
          Here's what we set up for you:
        </p>
      </div>

      {items.length > 0 && (
        <div className="bg-muted/50 rounded-xl p-4 space-y-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Your Setup Summary
          </p>
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              <span className="text-sm font-medium">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Button onClick={onComplete} className="w-full gap-2" size="lg">
          Go to My Dashboard <ArrowRight className="h-4 w-4" />
        </Button>
        <Button onClick={onExplore} variant="outline" className="w-full gap-2" size="lg">
          Explore Features <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function OnboardingWizard({ open, onComplete, isDemo = false }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [plaidOpen, setPlaidOpen] = useState(false);
  const { toast } = useToast();

  // Collected data
  const [bankConnected, setBankConnected] = useState(false);
  const [accountCount, setAccountCount] = useState(0);
  const [txCount, setTxCount] = useState(0);
  const [monthlyIncome, setMonthlyIncome] = useState<number | null>(null);
  const [budgetCategory, setBudgetCategory] = useState<string | null>(null);
  const [budgetAmount, setBudgetAmount] = useState<number | null>(null);
  const [billsDetected, setBillsDetected] = useState(0);

  // Country / state selected in Step 2
  const [selectedCountry, setSelectedCountry] = useState<string>(detectCountry());
  const [selectedState, setSelectedState] = useState<string>("");

  // Progress tracking
  const [progress, setProgress] = useState<Record<string, boolean>>({
    bank: false,
    income: false,
    budget: false,
  });

  // Session data for firstName + existing country
  const { data: session } = useQuery<any>({
    queryKey: ["/api/auth/session"],
    enabled: open,
  });

  const firstName = session?.firstName || null;

  // Pre-populate country from existing user profile
  useEffect(() => {
    if (session?.country && session.country !== "US") {
      setSelectedCountry(session.country);
    }
  }, [session]);

  // Onboarding status
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

  // Restore state from onboarding status
  useEffect(() => {
    if (!onboardingStatus) return;
    if (onboardingStatus.hasPlaidConnection && step === 1) {
      setBankConnected(true);
      setStep(2);
    }
    if (onboardingStatus.analysisData?.recurringBills) {
      setBillsDetected(onboardingStatus.analysisData.recurringBills.length);
    }
    if (onboardingStatus.currentStep > step) {
      setStep(onboardingStatus.currentStep);
    }
  }, [onboardingStatus]);

  // Detect income from analysis data
  const detectedIncome = onboardingStatus?.analysisData?.incomeSources?.[0];
  const detectedIncomeAmount = detectedIncome
    ? Math.round(parseFloat(detectedIncome.amount || "0"))
    : null;
  const detectedEmployer = detectedIncome?.source || null;

  // Top spending categories from analysis
  const topCategories = onboardingStatus?.analysisData?.recurringBills
    ? onboardingStatus.analysisData.recurringBills
        .slice(0, 5)
        .map((b: any) => ({ category: b.category || "Other", total: parseFloat(b.amount || "0") }))
    : undefined;

  async function handleSkip() {
    if (isDemo) {
      toast({ title: "Demo mode — setup wizard closed." });
      onComplete();
      return;
    }
    try {
      await apiRequest("POST", "/api/onboarding/complete", { progress });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      toast({ title: "Setup skipped. You can configure your budget anytime." });
      onComplete();
    } catch {
      toast({ title: "Failed to skip", variant: "destructive" });
    }
  }

  async function handleComplete() {
    if (isDemo) {
      onComplete();
      return;
    }
    try {
      await apiRequest("POST", "/api/onboarding/complete", { progress });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      onComplete();
    } catch {
      toast({ title: "Failed to complete setup", variant: "destructive" });
    }
  }

  // Step handlers
  const handleBankConnected = useCallback((connected: boolean, accts?: number, txs?: number) => {
    setBankConnected(connected);
    setAccountCount(accts || 0);
    setTxCount(txs || 0);
    setProgress((p) => ({ ...p, bank: connected }));
  }, []);

  const handleCountryChange = useCallback((country: string, state: string) => {
    setSelectedCountry(country);
    setSelectedState(state);
  }, []);

  const handleIncomeNext = async (income: number | null) => {
    setMonthlyIncome(income);
    setProgress((p) => ({ ...p, income: income !== null }));

    if (income && !isDemo) {
      try {
        await apiRequest("POST", "/api/onboarding/save-income-goal", {
          monthlyIncome: income,
        });
      } catch (err) {
        console.error("Failed to save income:", err);
      }
    }
    // Step 4 = You're Ready (budget step removed — budget creation is in the Budget panel)
    await apiRequest("POST", "/api/onboarding/save-step", { step: 4 });
    setStep(4);
  };

  const TOTAL_STEPS = 4;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !plaidOpen) handleSkip();
      }}
    >
      <DialogContent
        className={`max-w-md max-h-[90vh] overflow-y-auto ${plaidOpen ? "pointer-events-none opacity-50" : ""}`}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => { if (!plaidOpen) e.preventDefault(); }}
        style={plaidOpen ? { zIndex: 10 } : undefined}
      >
        <StepProgress current={step} total={TOTAL_STEPS} />

        {step === 1 && (
          <WelcomeStep
            firstName={firstName}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <ConnectBankStep
            onNext={() => setStep(3)}
            onSkip={async () => {
              await apiRequest("POST", "/api/onboarding/save-step", { step: 3 });
              setStep(3);
            }}
            onPlaidOpen={setPlaidOpen}
            onBankConnected={handleBankConnected}
            initialCountry={selectedCountry}
            onCountryChange={handleCountryChange}
          />
        )}

        {step === 3 && (
          <MonthlyIncomeStep
            onNext={handleIncomeNext}
            onSkip={async () => {
              await apiRequest("POST", "/api/onboarding/save-step", { step: 4 });
              setStep(4);
            }}
            detectedIncome={detectedIncomeAmount}
            detectedEmployer={detectedEmployer}
            selectedCountry={selectedCountry}
          />
        )}

        {/* Step 4 = You're Ready! (BudgetGoalStep removed — budgets are created in the Budget panel) */}
        {step === 4 && (
          <ReadyStep
            onComplete={handleComplete}
            onExplore={handleComplete}
            summary={{
              bankConnected,
              accountCount,
              monthlyIncome,
              budgetCategory: null,
              budgetAmount: null,
              txCount,
              billsDetected,
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
