/**
 * KpiCard — unified hero stat card (Phase 3.3 — 2026-04-17).
 *
 * Replaces `RealCashFlowCard` and `PlanStatCard` on the dashboard so the two
 * stat rows don't fork again. Key differences from what shipped before:
 *
 *   1. Numbers default to `text-foreground` (solid charcoal). Only negative
 *      values get color (red). We no longer paint positives emerald — the
 *      mockup reads as "green accents on a neutral grid", not "green
 *      everywhere". See docs/phase-3-ui-overhaul-plan.md §3.3 for the full
 *      rationale.
 *   2. Icon tile is per-card (emerald / red / teal / amber / blue) — not a
 *      shared "income / spending / default" palette.
 *   3. `DeltaPill` renders the MoM % change below the subtitle. Green when
 *      the move is favorable for this KPI, amber otherwise. Callers pass
 *      `favorableDirection: "up" | "down"` because a deposit going up is
 *      favorable but outgoing going up is not.
 *   4. Card uses the base `<Card variant="glass">` primitive + a bigger
 *      `--radius-card-lg` override for the hero row.
 */

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tones
// ---------------------------------------------------------------------------

export type KpiTone = "emerald" | "red" | "teal" | "amber" | "blue";

/**
 * Icon-tile styling per tone. The gradient uses Tailwind's from-/to-
 * primitives with fractional opacities so the tile reads as a colored wash
 * over the glass surface rather than a solid pill.
 */
const toneStyles: Record<KpiTone, { tile: string; icon: string }> = {
  emerald: {
    tile: "bg-gradient-to-br from-emerald-500/25 to-emerald-400/10",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  red: {
    tile: "bg-gradient-to-br from-red-500/25 to-red-400/10",
    icon: "text-red-600 dark:text-red-400",
  },
  teal: {
    tile: "bg-gradient-to-br from-teal-500/25 to-teal-400/10",
    icon: "text-teal-600 dark:text-teal-400",
  },
  amber: {
    tile: "bg-gradient-to-br from-amber-500/25 to-amber-400/10",
    icon: "text-amber-600 dark:text-amber-400",
  },
  blue: {
    tile: "bg-gradient-to-br from-blue-500/25 to-blue-400/10",
    icon: "text-blue-600 dark:text-blue-400",
  },
};

// ---------------------------------------------------------------------------
// DeltaPill
// ---------------------------------------------------------------------------

export function DeltaPill({
  delta,
  favorableDirection,
}: {
  delta: number | null | undefined;
  favorableDirection: "up" | "down";
}) {
  if (delta == null || !Number.isFinite(delta) || delta === 0) return null;

  const isFavorable = favorableDirection === "up" ? delta > 0 : delta < 0;
  const tone = isFavorable
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  const sign = delta > 0 ? "+" : "";

  return (
    <span
      className={cn(
        "inline-flex items-center h-5 px-1.5 rounded-md text-[11px] font-semibold",
        tone
      )}
      data-testid="kpi-delta-pill"
    >
      {sign}
      {delta.toFixed(1)}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// KpiCard
// ---------------------------------------------------------------------------

export interface KpiCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  description: string;
  isLoading: boolean;
  /** Icon-tile color. Per-card, not per-category. */
  tone: KpiTone;
  /**
   * Solid-red the number (money leaving / deficit / overspend). Positive
   * values never take a colored number — they stay `text-foreground`.
   */
  isNegative?: boolean;
  /** Bump the card border to amber/red when a metric is alarming. */
  isWarning?: boolean;
  /** Month-over-month % change. Pass `null`/`undefined` to hide the pill. */
  momDelta?: number | null;
  /** Whether "up" is good for this KPI (deposits) or bad (outgoing). */
  favorableDirection?: "up" | "down";
  /** Opt-in test id. */
  "data-testid"?: string;
}

export function KpiCard({
  title,
  value,
  icon: Icon,
  description,
  isLoading,
  tone,
  isNegative = false,
  isWarning = false,
  momDelta,
  favorableDirection = "up",
  ...rest
}: KpiCardProps) {
  const styles = toneStyles[tone];

  return (
    <Card
      variant="glass"
      className={cn(
        "relative overflow-visible rounded-[var(--radius-card-lg)]",
        // Warning border stays — this is a functional cue, not a theme tweak.
        isWarning && "ring-1 ring-red-300/60 dark:ring-red-700/50"
      )}
      {...rest}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 px-5 pt-5">
        <CardTitle className="text-xs font-medium text-muted-foreground truncate">
          {title}
        </CardTitle>
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl shrink-0",
            styles.tile
          )}
          aria-hidden
        >
          <Icon className={cn("h-[18px] w-[18px]", styles.icon)} />
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-6 space-y-1">
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div
            className={cn(
              "text-[28px] md:text-[32px] font-bold leading-none tracking-[-0.02em] truncate",
              // Only negatives get color — positives stay on the neutral grid.
              isNegative ? "text-red-600 dark:text-red-400" : "text-foreground"
            )}
            data-testid="kpi-value"
          >
            {value}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground mt-1 truncate">
          {description}
        </p>

        {momDelta != null && (
          <div className="pt-0.5">
            <DeltaPill delta={momDelta} favorableDirection={favorableDirection} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default KpiCard;
