"use client";

import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Zap, DollarSign, Bell, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationsDropdown } from "@/components/notifications-dropdown";
import { ThemeQuickSwitcher } from "@/components/ui/ThemeQuickSwitcher";
import { useFeatureUsage } from "@/contexts/FeatureUsageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { trackUpgradeCta } from "@/lib/trackUpgradeCta";
import { cn } from "@/lib/utils";

const FEATURE_LINKS = [
  { label: "AI Assistant", href: "/ai-assistant" },
  { label: "Reports", href: "/reports" },
  { label: "Receipt Scanner", href: "/receipts" },
  { label: "What-If Simulator", href: "/simulator" },
  { label: "Accounts", href: "/accounts" },
  { label: "Calendar", href: "/calendar" },
];

const UPGRADE_CTA_PULSE_SEEN_KEY = "bsai_upgrade_cta_pulse_seen";

export function TopNavBar() {
  const [location, navigate] = useLocation();
  const isMobile = useIsMobile();
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

  const isFree = !plan || plan === "free";
  const isPro = plan === "pro" || plan === "family" || plan === "lifetime";

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
        "sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-2",
        "border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60",
        "px-4 md:px-6"
      )}
    >
      {/* Left: Sidebar trigger */}
      <div className="flex items-center gap-2 shrink-0">
        <SidebarTrigger data-testid="button-sidebar-toggle" className="md:h-8 md:w-8" />
      </div>

      {/* Center: Feature pills or mobile dropdown */}
      <nav className="flex items-center justify-center flex-1 min-w-0">
        {isMobile ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-teal-500/50 bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 hover:text-teal-300"
              >
                Features
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-56">
              {FEATURE_LINKS.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href}>{item.label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {FEATURE_LINKS.map((item) => (
              <Link key={item.href} href={item.href}>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    location === item.href
                      ? "bg-teal-500/30 text-teal-300 border border-teal-500/50"
                      : "bg-teal-500/10 text-teal-400 border border-teal-500/30 hover:bg-teal-500/20 hover:text-teal-300"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Right: Upgrade, Refer & Earn, Notifications, Avatar */}
      <div className="flex items-center gap-2 shrink-0">
        {isFree && (
          <Button
            size="sm"
            onClick={handleUpgradeClick}
            className={cn(
              "rounded-full bg-amber-500 hover:bg-amber-600 text-white font-medium px-4",
              showUpgradePulse &&
                "animate-pulse ring-2 ring-amber-400/80 ring-offset-2 ring-offset-background"
            )}
          >
            <Zap className="h-4 w-4 mr-1.5" />
            Upgrade
          </Button>
        )}

        {/* TODO: Re-enable after AppSumo launch */}
        <Button
          variant="outline"
          size="sm"
          className="hidden rounded-full border-[#7C3AED] text-[#7C3AED] hover:bg-[#7C3AED]/10 hover:text-[#8B5CF6]"
          asChild
        >
          <Link href="/affiliate">
            <DollarSign className="h-4 w-4 mr-1.5" />
            Earn 30%
          </Link>
        </Button>

        <ThemeQuickSwitcher />
        <NotificationsDropdown />

        <div className="flex items-center gap-2">
          {isPro && (
            <span
              className="text-xs font-medium text-emerald-400/90 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30"
              title="Pro member"
            >
              Pro ✓
            </span>
          )}
          <Link href="/settings/profile">
            <Avatar className="h-8 w-8 border border-border">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>
    </header>
  );
}
