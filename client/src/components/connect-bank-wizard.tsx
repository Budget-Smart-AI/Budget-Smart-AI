/**
 * ConnectBankWizard
 *
 * A focused 2-step mini-wizard shown when the user clicks "Connect Bank Account"
 * from the Accounts page (or anywhere outside the full onboarding flow).
 *
 * Step 1 — Country / State selector + consent checkbox
 * Step 2 — "Get Your Phone Ready" interstitial
 * → Then opens Plaid (or MX) directly
 *
 * On success it calls onSuccess() so the parent can refresh account lists.
 */

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { usePlaidLink } from "react-plaid-link";
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
import {
  Building2,
  Loader2,
  ArrowRight,
  Smartphone,
  BellOff,
  Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConnectBankWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** Pre-populate country from user profile */
  initialCountry?: string;
}

interface WizardProvider {
  providerId: string;
  displayName: string;
  showInWizard: boolean;
  isEnabled: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Step indicator ───────────────────────────────────────────────────────────

function MiniProgress({ step }: { step: 1 | 2 }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground">
          {step === 1 ? "Step 1 of 2 — Your Location" : "Step 2 of 2 — Get Ready"}
        </p>
        <p className="text-xs text-muted-foreground">{step === 1 ? "50%" : "100%"}</p>
      </div>
      <div className="flex gap-1.5">
        {[1, 2].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
              i < step
                ? "bg-primary"
                : i === step
                ? "bg-primary animate-pulse"
                : "bg-muted"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Step 1: Country / State + Consent ───────────────────────────────────────

function LocationConsentStep({
  initialCountry,
  onNext,
  onCancel,
}: {
  initialCountry: string;
  onNext: (country: string, state: string) => void;
  onCancel: () => void;
}) {
  const [country, setCountry] = useState(initialCountry || detectCountry());
  const [stateProvince, setStateProvince] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);

  // Reset state when country changes
  useEffect(() => {
    setStateProvince("");
  }, [country]);

  const canProceed = !!country && consentChecked;

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <div className="text-3xl mb-2">🏦</div>
        <h2 className="text-xl font-bold">Connect your bank to unlock the magic</h2>
        <p className="text-sm text-muted-foreground">
          Securely link your bank — your credentials are never stored by BudgetSmart
        </p>
      </div>

      {/* Country selector */}
      <div className="space-y-3">
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

      {/* Shared computer warning */}
      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
        <p className="text-xs text-amber-800 dark:text-amber-200">
          <strong>Shared computer?</strong> Use a private/incognito window to prevent bank login conflicts.
        </p>
      </div>

      {/* Revoke notice */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <p className="text-xs text-blue-800 dark:text-blue-200">
          <strong>You can revoke this consent at any time.</strong> Go to{" "}
          <strong>Settings → Accounts</strong> and click <strong>Unlink</strong> next to any
          connected account to remove access immediately.
        </p>
      </div>

      {/* Consent checkbox */}
      <div className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/20">
        <Checkbox
          id="cbw-consent"
          checked={consentChecked}
          onCheckedChange={(c) => setConsentChecked(c === true)}
          className="mt-0.5"
        />
        <label
          htmlFor="cbw-consent"
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

      {/* CTA */}
      <Button
        onClick={() => onNext(country, stateProvince)}
        disabled={!canProceed}
        className="w-full gap-2"
        size="lg"
      >
        Continue <ArrowRight className="h-4 w-4" />
      </Button>

      <div className="text-center">
        <button
          onClick={onCancel}
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Phone Ready ──────────────────────────────────────────────────────

function PhoneReadyStep({
  onReady,
  onSkip,
}: {
  onReady: () => void;
  onSkip: () => void;
}) {
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
        onClick={onReady}
        className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
      >
        I'm Ready — Connect My Bank
        <ArrowRight size={16} />
      </button>

      <button
        onClick={onSkip}
        className="mt-3 text-xs text-muted-foreground hover:text-foreground underline transition-colors"
      >
        Skip for now — add manually →
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ConnectBankWizard({
  open,
  onOpenChange,
  onSuccess,
  initialCountry,
}: ConnectBankWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [country, setCountry] = useState(initialCountry || detectCountry());
  const [plaidIsOpen, setPlaidIsOpen] = useState(false);

  // Plaid link token
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);

  // MX state
  const [mxWidgetUrl, setMxWidgetUrl] = useState<string | null>(null);
  const [showMxWidget, setShowMxWidget] = useState(false);
  const [mxLoading, setMxLoading] = useState(false);
  const [showMxConsent, setShowMxConsent] = useState(false);
  const [mxPrivacyChecked, setMxPrivacyChecked] = useState(false);

  // Provider config
  const [preferredProvider, setPreferredProvider] = useState<"plaid" | "mx" | null>(null);
  const [providersLoaded, setProvidersLoaded] = useState(false);

  // Reset to step 1 whenever the dialog opens
  useEffect(() => {
    if (open) {
      setStep(1);
      setLinkToken(null);
      setPlaidIsOpen(false);
    }
  }, [open]);

  // Load providers + Plaid link token when dialog opens
  useEffect(() => {
    if (!open) return;
    async function init() {
      try {
        setTokenLoading(true);
        const res = await apiRequest("GET", "/api/bank-providers");
        const providers: WizardProvider[] = await res.json();
        const wizardProviders = providers.filter((p) => p.showInWizard && p.isEnabled);
        const preferred = wizardProviders[0]?.providerId as "plaid" | "mx" | null ?? null;
        setPreferredProvider(preferred);
        setProvidersLoaded(true);

        if (preferred === "plaid" || !preferred) {
          const tokenRes = await apiRequest("POST", "/api/plaid/create-link-token");
          const tokenData = await tokenRes.json();
          setLinkToken(tokenData.link_token);
        }
      } catch (err) {
        console.error("[ConnectBankWizard] init error:", err);
      } finally {
        setTokenLoading(false);
      }
    }
    init();
  }, [open]);

  // Plaid success handler
  const onPlaidSuccess = useCallback(
    async (publicToken: string, metadata: any) => {
      setPlaidIsOpen(false);
      try {
        await apiRequest("POST", "/api/plaid/exchange-token", {
          public_token: publicToken,
          metadata: { institution: metadata.institution },
        });
        // Kick off historical fetch in background
        apiRequest("POST", "/api/plaid/transactions/fetch-historical").catch(() => {});
        queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/plaid/transactions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/mx/members"] });
        toast({ title: "🎉 Bank account connected!" });
        onOpenChange(false);
        onSuccess();
      } catch {
        toast({ title: "Failed to connect bank account", variant: "destructive" });
      }
    },
    [toast, onOpenChange, onSuccess]
  );

  const onPlaidExit = useCallback(() => {
    setPlaidIsOpen(false);
  }, []);

  const { open: openPlaid, ready: plaidReady } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: onPlaidExit,
  });

  // MX handlers
  const handleOpenMX = useCallback(async () => {
    setMxLoading(true);
    try {
      const res = await apiRequest("GET", "/api/mx/connect-widget");
      const data = await res.json();
      if (data.widgetUrl) {
        setMxWidgetUrl(data.widgetUrl);
        setShowMxWidget(true);
        setPlaidIsOpen(true);
      } else {
        toast({ title: "Failed to get connect widget", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: error.message || "Failed to connect", variant: "destructive" });
    } finally {
      setMxLoading(false);
    }
  }, [toast]);

  // MX postMessage listener
  useEffect(() => {
    if (!open) return;
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
            toast({ title: "🎉 Bank account connected!" });
          } catch (err) {
            console.error("[ConnectBankWizard MX] Sync error:", err);
          }
          setShowMxWidget(false);
          setPlaidIsOpen(false);
          queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
          queryClient.invalidateQueries({ queryKey: ["/api/mx/members"] });
          onOpenChange(false);
          onSuccess();
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [open, toast, onOpenChange, onSuccess]);

  // Step 1 → save country → go to step 2
  const handleLocationNext = useCallback(
    async (selectedCountry: string, selectedState: string) => {
      setCountry(selectedCountry);
      try {
        await apiRequest("PATCH", "/api/user/household", {
          country: selectedCountry,
          provinceState: selectedState || null,
        });
      } catch (err) {
        console.error("[ConnectBankWizard] Failed to save country:", err);
      }
      setStep(2);
    },
    []
  );

  // Step 2 → open bank connection
  const handleReady = useCallback(() => {
    if (preferredProvider === "mx") {
      setShowMxConsent(true);
    } else {
      // Default to Plaid
      setPlaidIsOpen(true);
      openPlaid();
    }
  }, [preferredProvider, openPlaid]);

  const handleSkip = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen && !plaidIsOpen) onOpenChange(false);
        }}
      >
        <DialogContent
          className={`max-w-md max-h-[90vh] overflow-y-auto ${plaidIsOpen ? "pointer-events-none opacity-50" : ""}`}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => { if (!plaidIsOpen) e.preventDefault(); }}
          style={plaidIsOpen ? { zIndex: 10 } : undefined}
        >
          <MiniProgress step={step} />

          {step === 1 && (
            <LocationConsentStep
              initialCountry={initialCountry || detectCountry()}
              onNext={handleLocationNext}
              onCancel={() => onOpenChange(false)}
            />
          )}

          {step === 2 && (
            <PhoneReadyStep
              onReady={handleReady}
              onSkip={handleSkip}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* MX Connect Widget overlay */}
      {showMxWidget && mxWidgetUrl &&
        createPortal(
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
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                width: "480px",
                height: "600px",
                background: "white",
                borderRadius: "12px",
                overflow: "hidden",
              }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                <span className="font-semibold text-sm">Connect Your Bank</span>
                <button
                  onClick={() => {
                    setShowMxWidget(false);
                    setPlaidIsOpen(false);
                  }}
                  className="rounded-full p-1 hover:bg-muted transition-colors"
                  aria-label="Close"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M12 4L4 12M4 4L12 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
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

      {/* MX Consent Dialog */}
      <AlertDialog
        open={showMxConsent}
        onOpenChange={(o) => {
          setShowMxConsent(o);
          if (!o) setMxPrivacyChecked(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Connect Your Bank via MX</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                By connecting your bank account, you consent to BudgetSmart accessing your
                financial data through MX Technologies. Your bank credentials are entered directly
                with your bank — BudgetSmart never sees or stores them.
              </span>
              <span className="block bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-blue-800 dark:text-blue-200 text-sm">
                <strong>You can revoke this consent at any time.</strong> Go to{" "}
                <strong>Settings → Accounts</strong> and click <strong>Unlink</strong>.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-3 px-6 pb-2">
            <Checkbox
              id="cbw-mx-consent"
              checked={mxPrivacyChecked}
              onCheckedChange={(c) => setMxPrivacyChecked(c === true)}
            />
            <label
              htmlFor="cbw-mx-consent"
              className="text-sm leading-snug cursor-pointer select-none"
            >
              I agree to BudgetSmart AI's{" "}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-primary hover:text-primary/80"
              >
                Privacy Policy
              </a>{" "}
              and consent to my financial data being accessed through MX Technologies.
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowMxConsent(false);
                handleOpenMX();
              }}
              disabled={!mxPrivacyChecked}
            >
              I Consent — Connect Bank
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
