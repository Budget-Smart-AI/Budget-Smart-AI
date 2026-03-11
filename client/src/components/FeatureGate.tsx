/**
 * FeatureGate
 *
 * A reusable component that wraps a feature UI section.
 *
 * Behaviour:
 *  – If the user has access → renders children normally.
 *  – If limit reached or upgrade required → renders children with a CSS blur
 *    overlay, plus a centred UpgradePromptOverlay card on top.
 *  – If remaining === 1 (last free usage) → renders children normally plus
 *    a dismissible warning banner below them.
 *
 * The component subscribes to FeatureUsageContext so gate state updates in
 * real-time as the user hits limits during the session.
 */

import { useState, ReactNode } from "react";
import { Zap, Lock, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeatureUsage } from "@/contexts/FeatureUsageContext";
import { useLocation } from "wouter";

// ─── Feature display copy ─────────────────────────────────────────────────────

const FEATURE_COPY: Record<
  string,
  { icon: string; heading: string; body: string; cta: string }
> = {
  ai_assistant: {
    icon: "⚡",
    heading: "AI Financial Advisor",
    body: "Your AI financial advisor, unlimited — ask anything about your money.",
    cta: "Unlock with Pro",
  },
  receipt_scanning: {
    icon: "📷",
    heading: "Receipt Scanning",
    body: "Scan unlimited receipts, auto-categorized and matched to transactions.",
    cta: "Unlock with Pro",
  },
  portfolio_advisor: {
    icon: "📈",
    heading: "Portfolio Advisor",
    body: "Full portfolio analysis with Canadian tax context (TFSA, RRSP, FHSA).",
    cta: "Unlock with Pro",
  },
  ai_insights: {
    icon: "✨",
    heading: "AI Insights",
    body: "Proactive AI-generated financial insights tailored to your spending.",
    cta: "Unlock with Pro",
  },
  ai_daily_coach: {
    icon: "🎯",
    heading: "AI Daily Coach",
    body: "Daily financial briefings and personalized coaching to hit your goals.",
    cta: "Unlock with Pro",
  },
  financial_reports: {
    icon: "📊",
    heading: "Advanced Reports",
    body: "Deep-dive analytics with custom date ranges and export capabilities.",
    cta: "Unlock with Pro",
  },
  data_export_csv: {
    icon: "📤",
    heading: "Data Export",
    body: "Export all your financial data to CSV or JSON for complete control.",
    cta: "Unlock with Pro",
  },
  data_export_json: {
    icon: "📤",
    heading: "Data Export",
    body: "Export all your financial data to CSV or JSON for complete control.",
    cta: "Unlock with Pro",
  },
  what_if_simulator: {
    icon: "🔮",
    heading: "What-If Simulator",
    body: "Model financial scenarios — what if you saved more, earned less, or changed jobs?",
    cta: "Unlock with Pro",
  },
  debt_payoff_planner: {
    icon: "💳",
    heading: "Debt Payoff Planner",
    body: "Avalanche & snowball payoff strategies with a personalized payoff timeline.",
    cta: "Unlock with Pro",
  },
  mx_bank_connections: {
    icon: "🏦",
    heading: "Additional Bank Connection",
    body: "Connect all your accounts for a complete picture of your finances.",
    cta: "Unlock with Pro",
  },
  plaid_bank_connections: {
    icon: "🏦",
    heading: "Additional Bank Connection",
    body: "Connect all your accounts for a complete picture of your finances.",
    cta: "Unlock with Pro",
  },
  budget_creation: {
    icon: "📋",
    heading: "Additional Budgets",
    body: "Create unlimited budgets to track every category of your spending.",
    cta: "Unlock with Pro",
  },
  savings_goals: {
    icon: "🎯",
    heading: "Additional Savings Goals",
    body: "Set unlimited savings goals and track your progress automatically.",
    cta: "Unlock with Pro",
  },
};

const FALLBACK_COPY = {
  icon: "🔒",
  heading: "Pro Feature",
  body: "This feature unlocks more of your financial potential.",
  cta: "Unlock with Pro",
};

// ─── Blur intensity map ───────────────────────────────────────────────────────

const BLUR_CLASS: Record<"low" | "medium" | "high", string> = {
  low: "blur-[3px]",
  medium: "blur-[6px]",
  high: "blur-[10px]",
};

// ─── UpgradePromptOverlay ─────────────────────────────────────────────────────

interface OverlayProps {
  featureKey: string;
  reason: "limit_reached" | "upgrade_required";
  limit: number | null;
  remaining: number | null;
  resetDate: Date | null;
  displayName?: string;
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
}: OverlayProps) {
  const [, navigate] = useLocation();
  const copy = FEATURE_COPY[featureKey.toLowerCase()] ?? FALLBACK_COPY;
  const days = resetDate ? daysUntil(resetDate) : null;

  const isLimitReached = reason === "limit_reached";

  return (
    <div
      className="absolute inset-0 flex items-center justify-center z-10 p-4"
      aria-label="Upgrade required to access this feature"
    >
      {/* Card */}
      <div
        className={[
          "relative w-full max-w-sm rounded-2xl border p-6 shadow-2xl",
          "bg-[#0D1F0F]/90 border-[#22C55E]/30 backdrop-blur-xl",
          "animate-in fade-in zoom-in-95 duration-300",
        ].join(" ")}
      >
        {/* Icon + heading */}
        <div className="text-center mb-4">
          <div className="text-3xl mb-2" aria-hidden="true">
            {copy.icon}
          </div>
          {isLimitReached ? (
            <>
              <h3 className="text-base font-semibold text-white leading-snug">
                ⚡ You've used all {limit ?? "your free"}{" "}
                {displayName?.toLowerCase() ?? "uses"} this month
              </h3>
              {days !== null && days > 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  Resets in {days} day{days !== 1 ? "s" : ""}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-[#22C55E] uppercase tracking-wider mb-1">
                Pro Feature
              </p>
              <h3 className="text-base font-semibold text-white leading-snug">
                {copy.heading}
              </h3>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                {copy.body}
              </p>
            </>
          )}
        </div>

        {/* CTA */}
        <Button
          className="w-full bg-[#22C55E] hover:bg-[#16a34a] text-white font-semibold rounded-xl h-10 text-sm transition-all"
          onClick={() => navigate("/upgrade")}
        >
          {copy.cta}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>

        {/* Secondary link */}
        <div className="mt-3 text-center">
          {isLimitReached ? (
            <button
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-2"
              onClick={() => navigate("/upgrade")}
            >
              See all Pro features
            </button>
          ) : (
            <button
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              onClick={() => {
                /* no-op dismiss — user can scroll away */
              }}
            >
              Maybe Later
            </button>
          )}
        </div>
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
}

export function FeatureGate({
  feature,
  children,
  blurIntensity = "medium",
  displayName,
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
      {/* Blurred content */}
      <div
        className={`${blurClass} select-none pointer-events-none`}
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Scrim */}
      <div className="absolute inset-0 bg-[#0D1F0F]/40 z-[5]" aria-hidden="true" />

      {/* Upgrade prompt */}
      <UpgradePromptOverlay
        featureKey={feature}
        reason={state.reason as "limit_reached" | "upgrade_required"}
        limit={state.limit}
        remaining={state.remaining}
        resetDate={state.resetDate}
        displayName={displayName}
      />
    </div>
  );
}
