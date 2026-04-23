/**
 * Budget Smart AI logo — inline SVG, theme-aware.
 *
 * Previously this file pointed at a pair of PNGs hosted on files.budgetsmart.io.
 * That worked but had two problems Ryan flagged:
 *   1. The wordmark baked the "Budget Smart" text in a dark ink that
 *      disappeared in dark mode.
 *   2. It was bigger than the redesigned sidebar wants — the new "TV
 *      remote" rail aims for a smaller, more dynamic brand mark.
 *
 * The rewrite below renders a gradient lightning bolt inside a rounded
 * square, with an optional wordmark next to it. The mark uses emerald →
 * teal → cyan — the same gradient we use on the AI avatars and the
 * floating chatbot trigger, so brand signal stays consistent across the
 * app chrome. The wordmark text uses `currentColor` so it inherits from
 * the parent text-colour (foreground in both themes).
 */

import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** Pixel size of the square mark. Default 36px. */
  size?: number;
}

/** Icon-only mark. Use inside tight spaces (round-icon rows, favicons). */
export function BudgetSmartLogo({ className = "", size = 36 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-label="Budget Smart AI"
      role="img"
    >
      <defs>
        <linearGradient id="bsai-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="55%" stopColor="#0d9488" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient id="bsai-logo-bolt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="100%" stopColor="#f0fdfa" stopOpacity="0.95" />
        </linearGradient>
        <filter id="bsai-logo-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="0.6" floodColor="#0d9488" floodOpacity="0.25" />
        </filter>
      </defs>
      {/* Rounded square tile — the brand container shape */}
      <rect
        x="2"
        y="2"
        width="36"
        height="36"
        rx="10"
        ry="10"
        fill="url(#bsai-logo-bg)"
      />
      {/* Subtle highlight ring for depth */}
      <rect
        x="2.5"
        y="2.5"
        width="35"
        height="35"
        rx="9.5"
        ry="9.5"
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1"
      />
      {/* Lightning bolt — the brand glyph */}
      <path
        d="M22.5 6 L11.5 22.5 L18.5 22.5 L16 34 L28.5 16 L21 16 L23.5 6 Z"
        fill="url(#bsai-logo-bolt)"
        filter="url(#bsai-logo-shadow)"
      />
    </svg>
  );
}

/** Icon + wordmark. Used in the sidebar header. */
export function BudgetSmartLogoWithText({
  showTagline = false,
  compact = false,
}: {
  showTagline?: boolean;
  /** Smaller variant used by the narrower post-2026-04-22 sidebar. */
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center", compact ? "gap-2" : "gap-2.5")}>
      <BudgetSmartLogo size={compact ? 30 : 36} />
      <div className="flex flex-col leading-none min-w-0">
        <span
          className={cn(
            "font-bold tracking-tight truncate",
            compact ? "text-[15px]" : "text-base",
            // Inherit from parent text colour so dark mode flips it to light
            // automatically — the old PNG wordmark baked a dark ink that
            // vanished on dark backgrounds.
            "text-foreground"
          )}
        >
          BudgetSmart
          <span className="ml-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
            AI
          </span>
        </span>
        {showTagline && (
          <span className="text-[10px] text-muted-foreground tracking-wide mt-0.5">
            Smart money, smarter decisions
          </span>
        )}
      </div>
    </div>
  );
}
