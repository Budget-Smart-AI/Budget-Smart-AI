"use client";

/**
 * Top navigation bar — mockup-aligned (April 2026).
 *
 * Previously hosted 7 pill-style feature shortcuts in the centre; those
 * were removed because the sidebar is the source of truth for navigation
 * and the pills ate horizontal space on smaller screens. Current layout:
 *
 *   [sidebar-trigger] [greeting + date] ── [Ask AI] ── [upgrade?] [theme] [bell] [settings] [plan badge] [avatar]
 *
 * The centre is an "Ask Budget Smart AI" input. Submitting dispatches a
 * `bsai:ask-ai` CustomEvent on window; AppSidebar listens and opens the
 * FloatingChatbot with the prompt auto-sent as the first message. The
 * legacy placeholder search bar (which never had a command palette wired
 * up) was removed as part of the 2026-04-22 UI polish pass.
 */

import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Zap, Sparkles, Settings, Users, CornerDownLeft } from "lucide-react";
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
  const [askInput, setAskInput] = useState("");

  // Submit handler for the "Ask Budget Smart AI" input. Dispatches a
  // window-level CustomEvent which AppSidebar listens for — the sidebar
  // opens the FloatingChatbot and hands the prompt off as the initial
  // message. We use an event (not a context) to keep TopNavBar and
  // AppSidebar decoupled — neither owns the chat state directly.
  const handleAskAi = (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = askInput.trim();
    if (!prompt) return;
    window.dispatchEvent(
      new CustomEvent("bsai:ask-ai", { detail: { prompt } }),
    );
    setAskInput("");
  };

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

      {/* Center: Ask Budget Smart AI.
       * Brand-aligned gradient sparkle orb as the leading icon, glass pill
       * input, subtle ⏎ "Ask" hint on the right. Submitting opens the
       * FloatingChatbot with the prompt auto-sent. */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        <form
          role="search"
          onSubmit={handleAskAi}
          className="group relative w-full max-w-md hidden md:flex items-center"
          data-testid="topbar-ask-ai-form"
        >
          {/* Budget Smart AI brand icon — gradient orb with sparkle, mirrors
           * the AI Assistant avatar / floating chat trigger so the brand
           * signal is consistent across the app chrome. */}
          <span
            aria-hidden
            className={cn(
              "absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center",
              "h-7 w-7 rounded-full shadow-sm shadow-emerald-500/20 pointer-events-none",
              "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500",
              "ring-1 ring-white/40 dark:ring-white/10"
            )}
          >
            <Sparkles className="h-3.5 w-3.5 text-white drop-shadow-sm" />
            {/* Idle ping — gentle pulse so the input reads as "alive", not just
             * another search bar. Only shows when the input is empty. */}
            {!askInput && (
              <span className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-400/60 to-teal-400/60 animate-ping opacity-60" />
            )}
          </span>

          <input
            type="text"
            value={askInput}
            onChange={(e) => setAskInput(e.target.value)}
            placeholder="Ask Budget Smart AI anything…"
            aria-label="Ask Budget Smart AI"
            data-testid="topbar-ask-ai-input"
            autoComplete="off"
            className={cn(
              // Match the glass-island styling used by the sidebar & other chrome.
              "w-full h-10 pl-11 pr-16 text-sm rounded-[var(--radius-island)]",
              "bg-[color:rgb(var(--glass-surface))] border border-[color:rgb(var(--glass-border))] backdrop-blur-sm",
              "placeholder:text-muted-foreground/70 text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40",
              "transition-colors"
            )}
          />

          {/* Enter hint — only emphasised once the user has typed something.
           * Keeps the input discoverable as a submit surface without adding a
           * loud "Send" button. */}
          <kbd
            aria-hidden
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 h-6 px-1.5 rounded-md",
              "text-[10px] font-medium",
              "border border-[color:rgb(var(--glass-border))] bg-[color:rgb(var(--glass-surface))]",
              "transition-opacity duration-150",
              askInput.trim()
                ? "opacity-100 text-emerald-600 dark:text-emerald-400 border-emerald-500/40"
                : "opacity-60 text-muted-foreground"
            )}
          >
            <CornerDownLeft className="h-3 w-3" />
            Ask
          </kbd>

          <button type="submit" className="sr-only" aria-label="Send question to AI">
            Ask AI
          </button>
        </form>
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
