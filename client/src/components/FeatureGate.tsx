/**
 * FeatureGate
 *
 * A reusable component that wraps a feature UI section.
 *
 * Behaviour:
 *  – If the user has access → renders children normally.
 *  – If limit reached or upgrade required → renders children with a CSS blur
 *    overlay, plus a centred UpgradePromptOverlay card on top with animated shimmer.
 *  – If remaining === 1 (last free usage) → renders children normally plus
 *    a dismissible warning banner below them.
 *
 * The component subscribes to FeatureUsageContext so gate state updates in
 * real-time as the user hits limits during the session.
 */

import { useState, ReactNode } from "react";
import { Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeatureUsage } from "@/contexts/FeatureUsageContext";
import { useLocation } from "wouter";
import { trackUpgradeCta } from "@/lib/trackUpgradeCta";

// ─── Shimmer animation ────────────────────────────────────────────────────────
const shimmerStyles = `
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
`;

// ─── Feature display copy ─────────────────────────────────────────────────────

const FEATURE_HEADINGS: Record<string, string> = {
  ai_assistant: "AI Financial Advisor",
  receipt_scanning: "Receipt Scanning",
  portfolio_advisor: "Portfolio Advisor",
  ai_insights: "AI Insights",
  ai_daily_coach: "AI Daily Coach",
  financial_reports: "Advanced Reports",
  data_export_csv: "Data Export",
  data_export_json: "Data Export",
  what_if_simulator: "What-If Simulator",
  debt_payoff_planner: "Debt Payoff Planner",
  mx_bank_connections: "Bank Connections",
  plaid_bank_connections: "Bank Connections",
  budget_creation: "Additional Budgets",
  savings_goals: "Additional Savings Goals",
};

const FALLBACK_COPY = {
  heading: "Pro Feature",
};

const DEFAULT_BULLETS = [
  "Unlock full access to this feature",
  "Remove free-tier limits and restrictions",
  "Get all Pro tools in one plan",
];

// ─── Blur intensity map ───────────────────────────────────────────────────────

const BLUR_CLASS: Record<"low" | "medium" | "high", string> = {
  low: "backdrop-blur-[6px]",
  medium: "backdrop-blur-[6px]",
  high: "backdrop-blur-[6px]",
};

// ─── UpgradePromptOverlay ─────────────────────────────────────────────────────

interface OverlayProps {
  featureKey: string;
  reason: "limit_reached" | "upgrade_required";
  limit: number | null;
  remaining: number | null;
  resetDate: Date | null;
  displayName?: string;
  bullets?: string[];
}

function daysUntil(date: Date): number {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function UpgradePromptOverlay({
  featureKey,
  reason,
  limit,
  resetDate,
  displayName,
  bullets,
}: OverlayProps) {
  const [, navigate] = useLocation();
  const heading = FEATURE_HEADINGS[featureKey.toLowerCase()] ?? FALLBACK_COPY.heading;
  const days = resetDate ? daysUntil(resetDate) : null;
  const resolvedBullets = bullets?.length ? bullets.slice(0, 3) : DEFAULT_BULLETS;

  const isLimitReached = reason === "limit_reached";

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center p-4"
      aria-label="Upgrade required to access this feature"
    >
      <div
        className={[
          "relative w-full max-w-[360px] rounded-2xl p-6",
          "bg-background/90 backdrop-blur-md",
          "border border-amber-500/30",
          "shadow-[0_0_40px_rgba(245,158,11,0.12)]",
        ].join(" ")}
      >
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15"
            aria-hidden="true"
          >
            <Lock className="h-8 w-8 text-[#F59E0B]" />
          </div>
          <h3 className="text-lg font-bold text-foreground">
            {displayName ?? heading}
          </h3>
          {isLimitReached && (
            <p className="mt-1 text-xs text-muted-foreground">
              You have used all {limit ?? "free"} {displayName?.toLowerCase() ?? "uses"}
              {days !== null && days > 0 ? ` - resets in ${days} day${days !== 1 ? "s" : ""}` : ""}
            </p>
          )}
        </div>

        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          {resolvedBullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2">
              <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>

      <Button
        className="mt-5 w-full rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-black hover:from-amber-400 hover:to-yellow-400 font-semibold"
        onClick={() => {
          trackUpgradeCta("feature_gate");
          navigate("/upgrade");
        }}
      >
        Unlock with Pro — See Plans →
      </Button>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Cancel anytime. Unlock all features with Pro.
        </p>
      </div>
    </div>
  );
}

// ─── LastUsageWarningBanner ───────────────────────────────────────────────────

const DISMISSAL_KEY_PREFIX = "bsai_gate_dismissed_";

/** Feature-specific "last usage" warning message and upgrade CTA */
const LAST_USAGE_COPY: Record<string, { warning: string; cta: string }> = {
  ai_assistant: {
    warning: "Last free message this month",
    cta: "Upgrade to Pro for unlimited AI access →",
  },
  receipt_scanning: {
    warning: "Last free receipt scan this month",
    cta: "Upgrade to Pro for unlimited scanning →",
  },
  portfolio_advisor: {
    warning: "Last free portfolio insight this month",
    cta: "Upgrade to Pro for unlimited advisor access →",
  },
  data_export_csv: {
    warning: "Last free export this month",
    cta: "Upgrade to Pro for unlimited exports →",
  },
  budget_creation: {
    warning: "Approaching your budget limit",
    cta: "Upgrade to Pro for unlimited budgets →",
  },
  savings_goals: {
    warning: "Last free savings goal",
    cta: "Upgrade to Pro for unlimited goals →",
  },
  mx_bank_connections: {
    warning: "Last free bank connection",
    cta: "Upgrade to Pro to connect all your accounts →",
  },
  plaid_bank_connections: {
    warning: "Last free bank connection",
    cta: "Upgrade to Pro to connect all your accounts →",
  },
};

const DEFAULT_LAST_USAGE_COPY = {
  warning: "Last free use this month",
  cta: "Upgrade to Pro for unlimited access →",
};

interface WarningBannerProps {
  featureKey: string;
}

function LastUsageWarningBanner({ featureKey }: WarningBannerProps) {
  const storageKey = `${DISMISSAL_KEY_PREFIX}${featureKey}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const copy =
    LAST_USAGE_COPY[featureKey.toLowerCase()] ?? DEFAULT_LAST_USAGE_COPY;

  const handleDismiss = () => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // ignore storage errors
    }
    setDismissed(true);
  };

  return (
    <div
      role="alert"
      className={[
        "flex items-center justify-between gap-3 rounded-xl px-4 py-3 mt-3",
        "bg-amber-500/15 border border-amber-500/30 text-amber-300",
        "animate-in slide-in-from-bottom-2 duration-300",
      ].join(" ")}
    >
      <span className="text-sm">
        ⚡ {copy.warning} —{" "}
        <button
          className="font-semibold underline underline-offset-2 hover:text-amber-200 transition-colors"
          onClick={() => {
            window.location.href = "/upgrade";
          }}
        >
          {copy.cta}
        </button>
      </span>
      <button
        onClick={handleDismiss}
        className="shrink-0 rounded-full p-0.5 hover:bg-amber-500/20 transition-colors"
        aria-label="Dismiss warning"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── FeatureGate ─────────────────────────────────────────────────────────────

export interface FeatureGateProps {
  /** Feature key from FEATURES (e.g. "ai_assistant") */
  feature: string;
  /** The actual feature UI */
  children: ReactNode;
  /** Blur intensity when gated (default: "medium") */
  blurIntensity?: "low" | "medium" | "high";
  /**
   * Optional display name for the feature used in override messages.
   * Falls back to the value stored in the context.
   */
  displayName?: string;
  /**
   * 2-3 short bullets shown in the locked overlay.
   */
  bullets?: string[];
}

export function FeatureGate({
  feature,
  children,
  blurIntensity = "medium",
  displayName,
  bullets,
}: FeatureGateProps) {
  const { getFeatureState, isLoading } = useFeatureUsage();

  // While the initial load is in progress, render children normally
  // (avoids a flicker of the gated UI before we know the user's state).
  if (isLoading) return <>{children}</>;

  const state = getFeatureState(feature);

  // Unknown feature or no data yet → render children normally
  if (!state) return <>{children}</>;

  // ── Fully allowed ──────────────────────────────────────────────────────────
  if (state.allowed) {
    // Show subtle "last usage" warning banner when only 1 use remains
    const showLastUsageWarning =
      state.remaining === 1 && state.limit !== null;

    return (
      <div className="relative">
        {children}
        {showLastUsageWarning && (
          <LastUsageWarningBanner featureKey={feature} />
        )}
      </div>
    );
  }

  // ── Gated (limit_reached or upgrade_required) ──────────────────────────────
  const blurClass = BLUR_CLASS[blurIntensity];

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div
        className="select-none pointer-events-none"
        aria-hidden="true"
      >
        {children}
      </div>

      <div className={`absolute inset-0 ${blurClass} bg-background/35 z-[5]`} aria-hidden="true" />

      {/* Animated shimmer sweep */}
      <div
        className="absolute inset-0 z-[6] pointer-events-none"
        aria-hidden="true"
        style={{
          background: 'linear-gradient(105deg, transparent 40%, rgba(245, 158, 11, 0.08) 50%, transparent 60%)',
          animation: 'shimmer 2.8s ease-in-out infinite',
        }}
      />

      <UpgradePromptOverlay
        featureKey={feature}
        reason={state.reason as "limit_reached" | "upgrade_required"}
        limit={state.limit}
        remaining={state.remaining}
        resetDate={state.resetDate}
        displayName={displayName}
        bullets={bullets}
      />

      {/* Inject shimmer styles */}
      <style>{shimmerStyles}</style>
    </div>
  );
}
