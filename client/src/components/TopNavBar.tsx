"use client";

/**
 * Top navigation bar — mockup-aligned (April 2026).
 *
 * Previously hosted 7 pill-style feature shortcuts in the centre; those
 * were removed because the sidebar is the source of truth for navigation
 * and the pills ate horizontal space on smaller screens. Current layout:
 *
 *   [sidebar-trigger] [greeting + date] ───  [search] ─── [upgrade?] [theme] [bell] [settings] [plan badge] [avatar]
 *
 * The search input is a visual-only placeholder for now — command palette
 * wiring lands in a follow-up PR.
 */

import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Zap, Search, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationsDropdown } from "@/components/notifications-dropdown";
import { ThemeQuickSwitcher } from "@/components/ui/ThemeQuickSwitcher";
import { useFeatureUsage } from "@/contexts/FeatureUsageContext";
import { trackUpgradeCta } from "@/lib/trackUpgradeCta";
import { cn } from "@/lib/utils";

const UPGRADE_CTA_PULSE_SEEN_KEY = "bsai_upgrade_cta_pulse_seen";

function getGreeting(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function TopNavBar() {
  const [, navigate] = useLocation();
  const { plan } = useFeatureUsage();
  const [showUpgradePulse, setShowUpgradePulse] = useState(false);

  const { data: session } = useQuery({ queryKey: ["/api/auth/session"], retry: false });
  const s = session as Record<string, unknown> | undefined;
  const displayName = (s?.displayName || s?.firstName || s?.username || "User") as string;
  const avatarUrl = (s?.avatarUrl as string) || null;
  const firstName = (s?.firstName as string) || "";
  const lastName = (s?.lastName as string) || "";
  const initials =
    firstName && lastName
      ? `${firstName[0]}${lastName[0]}`.toUpperCase()
      : ((s?.username as string) || "U")[0]?.toUpperCase() || "U";

  const greetingName = firstName || (displayName.split(" ")[0] ?? "there");

  const isFree = !plan || plan === "free";
  const isProOnly = plan === "pro";
  const isPro = plan === "pro" || plan === "family" || plan === "lifetime";

  // Compute greeting + subtitle once per mount. Good enough — we only cross
  // a greeting boundary at 12:00 / 18:00 / 00:00, and the session is short.
  const { greeting, monthYear } = useMemo(() => {
    const now = new Date();
    return { greeting: getGreeting(now), monthYear: formatMonthYear(now) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First-login pulse: show until user has seen it (stored in sessionStorage)
  useEffect(() => {
    if (!isFree) return;
    try {
      const seen = sessionStorage.getItem(UPGRADE_CTA_PULSE_SEEN_KEY);
      if (!seen) setShowUpgradePulse(true);
    } catch {
      setShowUpgradePulse(false);
    }
  }, [isFree]);

  const handleUpgradeClick = () => {
    try {
      sessionStorage.setItem(UPGRADE_CTA_PULSE_SEEN_KEY, "1");
    } catch {
      // ignore
    }
    setShowUpgradePulse(false);
    trackUpgradeCta("top_nav");
    navigate("/upgrade");
  };

  return (
    <header
      className={cn(
        // Phase 3.2: h-24 for bigger greeting breathing room + glass tokens for the sticky backdrop
        "sticky top-0 z-40 flex h-24 shrink-0 items-center gap-3",
        "border-b border-[color:rgb(var(--glass-border))] bg-[color:rgb(var(--glass-surface))] backdrop-blur-xl",
        "px-4 md:px-6"
      )}
      data-testid="top-nav-bar"
    >
      {/* Left: Sidebar trigger + greeting.
       * The greeting is the full page header now — Dashboard no longer
       * renders its own hero. Uses the brand gradient on the title and a
       * muted subtitle for visual parity with the mockup. */}
      <div className="flex items-center gap-3 min-w-0">
        <SidebarTrigger data-testid="button-sidebar-toggle" className="md:h-8 md:w-8 shrink-0" />
        <div className="min-w-0 hidden sm:block">
          {/* Solid emerald greeting — classy, no gradients or glow effects. */}
          <h1
            className="font-display text-lg md:text-xl lg:text-2xl font-bold leading-[1.1] truncate tracking-[-0.01em] text-emerald-700 dark:text-emerald-400"
            data-testid="topbar-greeting"
          >
            {greeting}, {greetingName}
          </h1>
          <p className="text-sm md:text-base text-muted-foreground/90 leading-tight truncate">
            Here's your financial snapshot for {monthYear}
          </p>
        </div>
      </div>

      {/* Center: Search (visual-only for now) */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        <label className="group relative w-full max-w-md hidden md:flex items-center">
          {/* Phase 3.2: icon sits at left-3.5 to clear the bumped pl-10 padding */}
          <Search className="absolute left-3.5 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
          <input
            type="search"
            placeholder="Search transactions, budgets, goals…"
            aria-label="Search"
            data-testid="topbar-search"
            className={cn(
              // Phase 3.2: taller, fully-rounded pill with glass tokens to match the sidebar island
              "w-full h-10 pl-10 pr-3 text-sm rounded-[var(--radius-island)]",
              "bg-[color:rgb(var(--glass-surface))] border border-[color:rgb(var(--glass-border))] backdrop-blur-sm",
              "placeholder:text-muted-foreground/70 text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40",
              "transition-colors"
            )}
          />
        </label>
      </div>

      {/* Right: Upgrade, theme, notifications, settings, plan badge, avatar */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isFree && (
          <Button
            size="sm"
            onClick={handleUpgradeClick}
            data-testid="topbar-upgrade-cta"
            className={cn(
              "rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-medium px-3 md:px-4",
              showUpgradePulse &&
                "animate-pulse ring-2 ring-amber-400/80 ring-offset-2 ring-offset-background"
            )}
          >
            <Zap className="h-4 w-4 md:mr-1.5" />
            <span className="hidden md:inline">Upgrade</span>
          </Button>
        )}

        <ThemeQuickSwitcher />
        <NotificationsDropdown />

        <Link href="/settings/profile">
          <Button
            variant="ghost"
            size="icon"
            data-testid="topbar-settings"
            aria-label="Settings"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </Link>

        <div className="flex items-center gap-2 pl-1">
          {isProOnly && (
            <Link href="/upgrade">
              <span className="hidden lg:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-medium hover:bg-amber-500/20 transition-colors whitespace-nowrap cursor-pointer">
                <Users className="h-3 w-3" />
                Add Family
              </span>
            </Link>
          )}
          {isPro && (
            <span
              className="hidden md:inline text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30"
              title={`${plan?.charAt(0).toUpperCase()}${plan?.slice(1)} member`}
            >
              {plan === "family" ? "Family ✓" : plan === "lifetime" ? "Lifetime ✓" : "Pro ✓"}
            </span>
          )}
          <Link href="/settings/profile">
            <Avatar
              className="h-8 w-8 border border-border/60 cursor-pointer"
              data-testid="topbar-avatar"
            >
              {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
              <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>
    </header>
  );
}
