/**
 * Onboarding wizard — Phase 5 rebuild (2026-04-27).
 *
 * Replaces the 1,900+ line legacy wizard with a 3-step flow that does
 * exactly one thing: get the user's first bank connected and wait for
 * the post-Link pipeline to finish.
 *
 * Steps:
 *   1. Welcome              — single hero + Get Started button
 *   2. Connect Bank         — Plaid Link launcher
 *   3. Sync Status (wait)   — polls /api/onboarding/sync-status every
 *                             3s, ticks three checkmarks (transactions
 *                             loaded → recurring computed → income
 *                             detected), auto-advances to dashboard on
 *                             allComplete=true. No timeout to dashboard.
 *
 * Two arrival paths from the parent (App.tsx mounts this whenever
 * onboarding_complete=false):
 *   - Live path: user just connected their bank → started watching the
 *     ticks → dashboard. No celebration interstitial.
 *   - Come-back path: user closed the browser mid-sync → returned later
 *     to find allComplete=true → AllSetSplash with confetti → dashboard.
 *
 * The trigger between live and come-back is a session-scoped ref:
 * if SyncStatusStep ever mounted, future "all complete" reads use the
 * live path; otherwise we know they didn't see the live tick and show
 * the splash.
 *
 * No client-side detect-now calls — that runs server-side on Plaid
 * INITIAL_UPDATE / RECURRING_TRANSACTIONS_UPDATE webhooks.
 *
 * No manual income input, no budget goal, no save-step persistence.
 * The legacy 5-step wizard's residual responsibilities (income confirm,
 * budget goal) live on the dashboard banners + Income page.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Sparkles, Building2, ArrowRight, MailIcon } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Types ──────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  open: boolean;
  onComplete: () => void;
  /**
   * User clicked the X to dismiss before completing the flow. The
   * pipeline still runs server-side, so this is safe. The parent
   * should hide the wizard for the rest of this session but NOT mark
   * onboarding_complete=true — on next page load (or after refresh)
   * the wizard reappears if onboarding_complete is still false. This
   * matches "I'll do this later" semantics.
   */
  onDismiss?: () => void;
  isDemo?: boolean;
}

interface SyncStatus {
  transactionsLoaded: boolean;
  recurringComputed: boolean;
  incomeDetected: boolean;
  allComplete: boolean;
  hasPlaidItems: boolean;
}

type Stage = "welcome" | "connect" | "sync" | "splash";

// ─── Constants ──────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;
const SOFT_MESSAGE_AFTER_MS = 90_000;     // 90s on same stage → "bank is slow today"
const EMAIL_LINK_AFTER_MS = 180_000;      // 3min → show email-me-when-ready link
const ALL_COMPLETE_HOLD_MS = 800;          // brief "all green" pause before dismissing

// ─── Welcome step ───────────────────────────────────────────────────────

function WelcomeStep({ onNext, isDemo }: { onNext: () => void; isDemo: boolean }) {
  return (
    <div className="space-y-6 py-2 text-center">
      <div className="text-5xl mb-2" aria-hidden>👋</div>
      <div>
        <h2 className="text-2xl font-bold">Welcome to Budget Smart AI</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect your bank — we'll do the rest.<br />
          Your income, bills, and spending will be detected automatically.
        </p>
      </div>
      <Button
        onClick={onNext}
        size="lg"
        className="w-full gap-2"
        disabled={isDemo}
        data-testid="button-onboarding-get-started"
      >
        Get Started <ArrowRight className="h-4 w-4" />
      </Button>
      {isDemo && (
        <p className="text-xs text-muted-foreground">
          You're in demo mode — connecting a real bank is disabled.
        </p>
      )}
    </div>
  );
}

// ─── Connect Bank step ──────────────────────────────────────────────────

function ConnectBankStep({
  onConnected,
}: {
  onConnected: () => void;
}) {
  const { toast } = useToast();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [isExchanging, setIsExchanging] = useState(false);

  const fetchLinkToken = useCallback(async () => {
    try {
      const res = await apiRequest("POST", "/api/plaid/create-link-token");
      const data = await res.json();
      if (data.link_token) {
        setLinkToken(data.link_token);
        setIntentId(data.intent_id ?? null);
        return data.link_token;
      }
    } catch (err: any) {
      setPendingOpen(false);
      toast({
        title: "Couldn't open bank connection",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    }
    return null;
  }, [toast]);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: any) => {
      setIsExchanging(true);
      try {
        await apiRequest("POST", "/api/plaid/exchange-token", {
          public_token: publicToken,
          intent_id: intentId,
          metadata: { institution: metadata?.institution },
        });
        // Single-use intent — clear state so any re-attempt fetches fresh.
        setIntentId(null);
        setLinkToken(null);
        // Hand off to sync step. The webhook handler is already running
        // server-side; we just need to start polling.
        onConnected();
      } catch (err: any) {
        toast({
          title: "Couldn't connect that account",
          description: err?.message || "Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsExchanging(false);
      }
    },
    [intentId, onConnected, toast],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => setPendingOpen(false),
  });

  // Auto-open Plaid once token arrives after the user clicks Connect.
  useEffect(() => {
    if (pendingOpen && linkToken && ready) {
      setPendingOpen(false);
      open();
    }
  }, [pendingOpen, linkToken, ready, open]);

  // Frozen-modal safety: if pendingOpen has been true for 90s without a
  // token landing, reset so the user can retry. Lesson from the prior bug
  // — a bad token fetch left the wizard dimmed forever.
  useEffect(() => {
    if (!pendingOpen) return;
    const t = setTimeout(() => {
      if (pendingOpen && !linkToken) {
        setPendingOpen(false);
        toast({
          title: "Bank connection didn't open",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    }, 90_000);
    return () => clearTimeout(t);
  }, [pendingOpen, linkToken, toast]);

  const handleClick = useCallback(async () => {
    if (linkToken && ready) {
      open();
      return;
    }
    setPendingOpen(true);
    await fetchLinkToken();
  }, [linkToken, ready, open, fetchLinkToken]);

  return (
    <div className="space-y-6 py-2 text-center">
      <div className="text-5xl mb-2" aria-hidden>🏦</div>
      <div>
        <h2 className="text-2xl font-bold">Connect your bank</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We use Plaid to securely link your accounts. We never see your
          login credentials, and you can disconnect anytime.
        </p>
      </div>
      <Button
        onClick={handleClick}
        size="lg"
        className="w-full gap-2"
        disabled={pendingOpen || isExchanging}
        data-testid="button-onboarding-connect-bank"
      >
        {pendingOpen || isExchanging ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {isExchanging ? "Connecting…" : "Opening…"}
          </>
        ) : (
          <>
            <Building2 className="h-4 w-4" />
            Connect with Plaid
          </>
        )}
      </Button>
      <p className="text-xs text-muted-foreground">
        🔒 Bank-level encryption. Your credentials are never stored.
      </p>
    </div>
  );
}

// ─── Sync Status (wait) step ────────────────────────────────────────────

interface CheckmarkRowProps {
  label: string;
  done: boolean;
  active: boolean;
}

function CheckmarkRow({ label, done, active }: CheckmarkRowProps) {
  return (
    <div
      className={`flex items-center gap-3 py-2 transition-colors ${
        done ? "text-emerald-600 dark:text-emerald-400" : active ? "text-foreground" : "text-muted-foreground"
      }`}
    >
      <div className="shrink-0">
        {done ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : active ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
        )}
      </div>
      <span className={`text-sm ${done ? "font-medium" : ""}`}>{label}</span>
    </div>
  );
}

function SyncStatusStep({
  onAllComplete,
  onLogoutAndWait,
  liveTickRef,
}: {
  onAllComplete: () => void;
  onLogoutAndWait: () => void;
  liveTickRef: React.MutableRefObject<boolean>;
}) {
  // Mark this step as having been seen — drives the come-back-path
  // splash decision. Read by the parent on next mount.
  useEffect(() => {
    liveTickRef.current = true;
  }, [liveTickRef]);

  const { data: status } = useQuery<SyncStatus>({
    queryKey: ["/api/onboarding/sync-status"],
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  // Track when each stage flipped so we can detect "no progress in 90s
  // on the same stage" for the soft message.
  const [mountedAt] = useState(() => Date.now());
  const [lastProgressAt, setLastProgressAt] = useState(() => Date.now());
  const [showSoftMessage, setShowSoftMessage] = useState(false);
  const [showEmailLink, setShowEmailLink] = useState(false);
  const [emailRequested, setEmailRequested] = useState(false);

  // Whenever any boolean flips, refresh lastProgressAt.
  const transactionsLoaded = !!status?.transactionsLoaded;
  const recurringComputed = !!status?.recurringComputed;
  const incomeDetected = !!status?.incomeDetected;
  const allComplete = !!status?.allComplete;

  useEffect(() => {
    setLastProgressAt(Date.now());
    setShowSoftMessage(false);
  }, [transactionsLoaded, recurringComputed, incomeDetected]);

  // Tick a soft 1Hz interval that re-evaluates the wait-too-long flags.
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setShowSoftMessage(now - lastProgressAt > SOFT_MESSAGE_AFTER_MS);
      setShowEmailLink(now - mountedAt > EMAIL_LINK_AFTER_MS);
    }, 1000);
    return () => clearInterval(t);
  }, [lastProgressAt, mountedAt]);

  // When everything's green, hold for ALL_COMPLETE_HOLD_MS so the user
  // sees the third checkmark land before we close — then dismiss.
  useEffect(() => {
    if (!allComplete) return;
    const t = setTimeout(() => onAllComplete(), ALL_COMPLETE_HOLD_MS);
    return () => clearTimeout(t);
  }, [allComplete, onAllComplete]);

  const handleEmailMe = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/onboarding/notify-when-ready");
      setEmailRequested(true);
      // Brief delay so user sees the confirmation, then log them out.
      setTimeout(() => onLogoutAndWait(), 1500);
    } catch {
      // Swallow — the user can just keep waiting if this fails.
      setEmailRequested(true);
      setTimeout(() => onLogoutAndWait(), 1500);
    }
  }, [onLogoutAndWait]);

  // Determine which stage is "active" (next-to-tick) for the live spinner.
  const activeStage = !transactionsLoaded
    ? "transactions"
    : !recurringComputed
      ? "recurring"
      : !incomeDetected
        ? "income"
        : "done";

  return (
    <div className="space-y-6 py-2">
      <div className="text-center space-y-2">
        <div className="text-4xl" aria-hidden>✨</div>
        <h2 className="text-xl font-bold">Setting up your dashboard</h2>
        <p className="text-sm text-muted-foreground">
          This usually takes 30–90 seconds.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 px-4 py-2">
        <CheckmarkRow
          label="Connecting to your bank"
          done={transactionsLoaded}
          active={activeStage === "transactions"}
        />
        <CheckmarkRow
          label="Finding your income"
          done={recurringComputed}
          active={activeStage === "recurring"}
        />
        <CheckmarkRow
          label="Building your dashboard"
          done={incomeDetected}
          active={activeStage === "income"}
        />
      </div>

      {showSoftMessage && !allComplete && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 px-3 py-2">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Your bank is being a bit slow today — we'll keep going.
          </p>
        </div>
      )}

      {showEmailLink && !allComplete && !emailRequested && (
        <button
          onClick={handleEmailMe}
          className="w-full text-sm text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-2 underline underline-offset-2 transition-colors py-1"
          data-testid="button-email-me-when-ready"
        >
          <MailIcon className="h-3.5 w-3.5" />
          Taking a while? Email me when ready
        </button>
      )}

      {emailRequested && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 px-3 py-2 text-center">
          <p className="text-xs text-emerald-800 dark:text-emerald-200">
            Got it — we'll email you when your dashboard is ready.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── All-set splash (come-back arrival) ─────────────────────────────────

function AllSetSplash({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="space-y-6 py-4 text-center">
      <div className="relative">
        <div className="text-6xl mb-2" aria-hidden>🎉</div>
        <Sparkles className="absolute top-0 right-1/3 h-5 w-5 text-emerald-500" aria-hidden />
        <Sparkles className="absolute top-3 left-1/3 h-4 w-4 text-amber-500" aria-hidden />
      </div>
      <div>
        <h2 className="text-2xl font-bold">You're all set</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your dashboard is ready. Let's go take a look.
        </p>
      </div>
      <Button
        onClick={onContinue}
        size="lg"
        className="w-full gap-2"
        data-testid="button-onboarding-go-to-dashboard"
      >
        Go to my dashboard <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ─── Step progress dots ─────────────────────────────────────────────────

function StepDots({ stage }: { stage: Stage }) {
  // Splash is its own arrival state — no dots there.
  if (stage === "splash") return null;
  const stageIndex = stage === "welcome" ? 0 : stage === "connect" ? 1 : 2;
  return (
    <div className="flex justify-center gap-2 pb-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i < stageIndex
              ? "w-6 bg-emerald-500"
              : i === stageIndex
                ? "w-8 bg-primary"
                : "w-6 bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

// ─── Root component ─────────────────────────────────────────────────────

export function OnboardingWizard({ open, onComplete, onDismiss, isDemo = false }: OnboardingWizardProps) {
  const [stage, setStage] = useState<Stage>("welcome");

  // Tracks whether the user has actively watched the SyncStatusStep tick
  // through to allComplete in this session. If they have, future
  // allComplete reads dismiss to the dashboard immediately. If they
  // HAVEN'T (came back from a closed browser), we show AllSetSplash.
  const liveTickRef = useRef(false);

  // Read sync-status on mount: drives the come-back-path decision.
  const { data: status, isLoading: statusLoading } = useQuery<SyncStatus>({
    queryKey: ["/api/onboarding/sync-status"],
    enabled: open,
    refetchOnMount: true,
    staleTime: 0,
  });

  // Decide initial stage on every open transition. We don't want to keep
  // resetting to Welcome each time the dialog re-renders, just on the
  // edge transitions.
  useEffect(() => {
    if (!open) return;
    if (statusLoading) return;
    if (status?.allComplete && !liveTickRef.current) {
      setStage("splash");
      return;
    }
    if (status?.hasPlaidItems && !status?.allComplete) {
      // User connected previously, sync still in progress — drop into
      // SyncStatusStep without making them re-click the Welcome button.
      setStage("sync");
      return;
    }
    setStage("welcome");
  }, [open, status?.allComplete, status?.hasPlaidItems, statusLoading]);

  const handleAllComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/onboarding/sync-status"] });
    onComplete();
  }, [onComplete]);

  const handleLogoutAndWait = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {
      // Even if logout fails, drop them out of the wizard — the email
      // will arrive regardless.
    }
    window.location.href = "/login";
  }, []);

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        // Phase 5: the X button (shadcn's built-in DialogPrimitive.Close)
        // calls onOpenChange(false) directly. We route that to onDismiss
        // — the parent hides the wizard for this session but does NOT
        // mark onboarding_complete=true. The post-Plaid-Link pipeline
        // runs server-side regardless of whether the wizard is open, so
        // closing it doesn't lose any work. Click-outside and escape are
        // still blocked below (preventDefault on the DialogContent
        // handlers) so the X is the only intentional close path.
        if (!isOpen) {
          onDismiss?.();
        }
      }}
    >
      <DialogContent
        className="max-w-md max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        data-testid="onboarding-wizard-dialog"
      >
        <StepDots stage={stage} />

        {stage === "welcome" && (
          <WelcomeStep onNext={() => setStage("connect")} isDemo={isDemo} />
        )}

        {stage === "connect" && (
          <ConnectBankStep onConnected={() => setStage("sync")} />
        )}

        {stage === "sync" && (
          <SyncStatusStep
            onAllComplete={handleAllComplete}
            onLogoutAndWait={handleLogoutAndWait}
            liveTickRef={liveTickRef}
          />
        )}

        {stage === "splash" && (
          <AllSetSplash onContinue={handleAllComplete} />
        )}
      </DialogContent>
    </Dialog>
  );
}
