/**
 * Left-rail navigation — 6 collapsible groups (April 2026 overhaul).
 *
 * Groups: Home · Money In & Out · Wealth · Plan & Grow · AI Studio · Account.
 * Home / Money In & Out / AI Studio are expanded by default; Wealth /
 * Plan & Grow / Account are collapsed. Collapse state persists in
 * localStorage and the group containing the active route auto-expands on
 * mount. Receipt Scanner nests under Expenses via `.nav-sub-item` (L
 * connector rendered in CSS).
 *
 * Badges are surfaced via a small `NavBadge` type so future wiring into
 * NotificationsContext/BillsContext only needs to change the data layer,
 * not the UI.
 */
import { useEffect, useMemo, useState } from "react";
import { FloatingChatbot } from "@/components/floating-chatbot";
import {
  LayoutDashboard,
  Receipt,
  CreditCard,
  DollarSign,
  PieChart,
  Target,
  BarChart3,
  Settings,
  Users,
  User,
  Building2,
  Bot,
  Mail,
  Sparkles,
  HelpCircle,
  Zap,
  BookOpen,
  TrendingDown,
  Landmark,
  TrendingUp,
  Home,
  Calendar,
  Users2,
  MessageSquare,
  Calculator,
  ScanLine,
  Shield,
  ShieldAlert,
  Cpu,
  Activity,
  LogOut,
  Lock,
  FileText,
  ArrowRight,
  Loader2,
  ChevronDown,
  Tag,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BudgetSmartLogoWithText } from "@/components/logo";
import { useLogout } from "@/hooks/use-logout";
import { useFeatureUsage } from "@/contexts/FeatureUsageContext";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { UpgradeModal, type UpgradeModalFeature } from "@/components/UpgradeModal";
import { ReferralModal } from "@/components/ReferralModal";
import { Heart } from "lucide-react";
import { trackUpgradeCta } from "@/lib/trackUpgradeCta";
import { cn } from "@/lib/utils";

/** Nav items that are gated on paid plans (feature key from featureGate).
 * Only include features that use the sidebar UpgradeModal popup.
 * Features with full-page shimmer gates (What-If Simulator, Debt Payoff,
 * Split Expenses, Financial Vault) are intentionally excluded so sidebar
 * clicks navigate directly to the page where the page-level gate handles
 * access control. */
const GATED_NAV_FEATURE: Record<string, string> = {
  "AI Assistant": "ai_assistant",
};

type NavBadge =
  | { kind: "danger"; count: number }
  | { kind: "count"; count: number }
  | { kind: "tag"; label: string; tone?: "new" | "pro" };

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  badge?: NavBadge;
  /** Renders with an L-connector under the preceding item. */
  sub?: boolean;
}

interface NavGroupDef {
  id: string;
  label: string;
  items: NavItem[];
  /** Default expanded on first mount (before localStorage). */
  defaultOpen: boolean;
}

// Dynamic badge counts (Security Alerts, Bills & Subscriptions) are wired
// inside AppSidebar — see `dynamicBadges` below. They read from the same
// React Query cache the Dashboard already populates (matching query keys),
// so no extra network requests. Static tag badges (NEW / Pro) live on the
// nav item directly.
const NAV_GROUPS: NavGroupDef[] = [
  {
    id: "home",
    label: "Home",
    defaultOpen: true,
    items: [
      { title: "Dashboard", url: "/dashboard", icon: Home },
      { title: "Calendar", url: "/calendar", icon: Calendar },
      {
        title: "Security Alerts",
        url: "/anomalies",
        icon: ShieldAlert,
      },
    ],
  },
  {
    id: "money",
    label: "Money In & Out",
    defaultOpen: true,
    items: [
      { title: "Income", url: "/income", icon: DollarSign },
      { title: "Expenses", url: "/expenses", icon: Receipt },
      { title: "Receipt Scanner", url: "/receipts", icon: ScanLine, sub: true },
      {
        title: "Bills & Subscriptions",
        url: "/bills",
        icon: CreditCard,
      },
      { title: "Accounts", url: "/accounts", icon: Building2 },
    ],
  },
  {
    id: "wealth",
    label: "Wealth",
    defaultOpen: false,
    items: [
      { title: "Net Worth", url: "/net-worth", icon: TrendingUp },
      { title: "Investments", url: "/investments", icon: TrendingUp },
      { title: "Assets", url: "/assets", icon: Wallet },
      { title: "Liabilities", url: "/liabilities", icon: TrendingDown },
      { title: "Financial Vault", url: "/vault", icon: Shield },
    ],
  },
  {
    id: "plan",
    label: "Plan & Grow",
    defaultOpen: false,
    items: [
      { title: "Budgets", url: "/budgets", icon: PieChart },
      { title: "Savings Goals", url: "/savings", icon: Target },
      { title: "Debt Payoff", url: "/debt-payoff", icon: Landmark },
      { title: "Split Expenses", url: "/split-expenses", icon: Users2 },
    ],
  },
  {
    id: "ai",
    label: "AI Studio",
    defaultOpen: true,
    items: [
      {
        title: "AI Assistant",
        url: "/ai-assistant",
        icon: Bot,
        badge: { kind: "tag", label: "NEW", tone: "new" },
      },
      { title: "What-If Simulator", url: "/simulator", icon: Calculator },
      { title: "Reports", url: "/reports", icon: BarChart3 },
      {
        title: "TaxSmart AI",
        url: "/tax-smart",
        icon: FileText,
        badge: { kind: "tag", label: "Pro", tone: "pro" },
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    defaultOpen: false,
    items: [
      { title: "Setup Wizard", url: "/setup-wizard", icon: Sparkles },
      { title: "Settings", url: "/settings/profile", icon: Settings },
      { title: "Help Center", url: "/help", icon: BookOpen },
      { title: "Support", url: "/support", icon: HelpCircle },
    ],
  },
];

const adminMenuItems: NavItem[] = [
  { title: "Users", url: "/admin/users", icon: Users },
  { title: "Sales Chatbot", url: "/admin/sales-chat", icon: MessageSquare },
  { title: "Support", url: "/admin/support", icon: HelpCircle },
  { title: "Bank Providers", url: "/admin/bank-providers", icon: Building2 },
  { title: "Audit Log", url: "/admin/audit-log", icon: Shield },
  { title: "System Status", url: "/admin/system-status", icon: Activity },
  { title: "Communications", url: "/admin/communications", icon: Mail },
  { title: "AI Models", url: "/admin/ai-models", icon: Cpu },
];

const COLLAPSE_STORAGE_KEY = "budget-sidebar-collapsed-groups";

interface AppSidebarProps {
  isAdmin?: boolean;
  username?: string;
  onLogout?: () => void;
}

function formatResetDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Read the persisted collapsed-group set, returning an empty Set if
 *  storage is unavailable or the value is malformed. */
function readCollapsedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    // ignore
  }
  return new Set();
}

function writeCollapsedGroups(set: Set<string>) {
  try {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}

/** Renders the small pill on the right of a nav row. */
function Badge({ badge }: { badge: NavBadge }) {
  if (badge.kind === "danger") {
    return (
      <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
        {badge.count}
      </span>
    );
  }
  if (badge.kind === "count") {
    return (
      <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-[10px] font-bold leading-none">
        {badge.count}
      </span>
    );
  }
  const toneClasses =
    badge.tone === "pro"
      ? "bg-amber-500/15 text-amber-600 dark:text-amber-300"
      : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white";
  return (
    <span
      className={cn(
        "ml-auto inline-flex items-center h-[18px] px-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider leading-none",
        toneClasses
      )}
    >
      {badge.label}
    </span>
  );
}

export function AppSidebar({ isAdmin = false, username, onLogout }: AppSidebarProps) {
  const [location, navigate] = useLocation();
  const [upgradeModalFeature, setUpgradeModalFeature] = useState<UpgradeModalFeature | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const { plan, getFeatureState, usageMap } = useFeatureUsage();

  // Collapse state: Set of group ids that are collapsed. Initialized from
  // defaults (groups with defaultOpen=false start collapsed) then
  // overridden by anything in localStorage.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const initial = new Set(NAV_GROUPS.filter((g) => !g.defaultOpen).map((g) => g.id));
    const persisted = readCollapsedGroups();
    if (persisted.size > 0) return persisted;
    return initial;
  });

  // Auto-expand the group containing the active route (once per location).
  useEffect(() => {
    const activeGroup = NAV_GROUPS.find((g) => g.items.some((it) => it.url === location));
    if (!activeGroup) return;
    setCollapsed((prev) => {
      if (!prev.has(activeGroup.id)) return prev;
      const next = new Set(prev);
      next.delete(activeGroup.id);
      writeCollapsedGroups(next);
      return next;
    });
  }, [location]);

  const toggleGroup = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeCollapsedGroups(next);
      return next;
    });
  };

  const { data: session } = useQuery({ queryKey: ["/api/auth/session"], retry: false });
  const logoutMutation = useLogout(onLogout);

  // Live badge counts. Query keys match Dashboard's exactly so React Query
  // dedupes — no extra network requests on routes that already fetch these.
  // Returning `undefined` when the count is zero hides the badge entirely
  // (cleaner than rendering a "0" pill).
  const { data: anomalyData } = useQuery<{
    alerts: Array<{ id: string; isDismissed: boolean }>;
  }>({
    queryKey: ["/api/anomalies"],
  });
  const { data: dashboardData } = useQuery<{
    bills?: { upcomingBills?: Array<{ isPaused: boolean }> };
  }>({
    queryKey: ["/api/engine/dashboard"],
  });

  const unresolvedAlertsCount = (anomalyData?.alerts ?? []).filter(
    (a: { isDismissed: boolean }) => !a.isDismissed
  ).length;
  const upcomingBillsCount = (dashboardData?.bills?.upcomingBills ?? []).filter(
    (b: { isPaused: boolean }) => !b.isPaused
  ).length;

  const dynamicBadges: Record<string, NavBadge | undefined> = {
    "Security Alerts":
      unresolvedAlertsCount > 0
        ? { kind: "danger", count: unresolvedAlertsCount }
        : undefined,
    "Bills & Subscriptions":
      upcomingBillsCount > 0
        ? { kind: "count", count: upcomingBillsCount }
        : undefined,
  };

  const s = session as any;
  const displayName = s?.displayName || s?.firstName || username || "User";
  const avatarUrl = s?.avatarUrl || null;
  const firstName = s?.firstName || "";
  const lastName = s?.lastName || "";
  const initials =
    firstName && lastName
      ? `${firstName[0]}${lastName[0]}`.toUpperCase()
      : (username || "U")[0]?.toUpperCase() || "U";

  const isFree = !plan || plan === "free";

  // Primary usage for free plan card: prefer ai_assistant (most visible limit)
  const aiUsage = usageMap.get("ai_assistant");
  const usageCurrent = aiUsage?.currentUsage ?? 0;
  const usageLimit = aiUsage?.limit ?? 10;
  const usageRemaining = Math.max(0, usageLimit - usageCurrent);
  const usagePct = usageLimit > 0 ? (usageCurrent / usageLimit) * 100 : 0;
  const usageResetStr = aiUsage?.resetDate ? formatResetDate(aiUsage.resetDate) : "";

  const handleNavClick = (item: NavItem, e: React.MouseEvent) => {
    const featureKey = GATED_NAV_FEATURE[item.title];
    if (!featureKey || !isFree) return;
    const state = getFeatureState(featureKey);
    if (state?.upgradeRequired) {
      e.preventDefault();
      setUpgradeModalFeature({
        featureKey,
        displayName: item.title,
        benefits: [],
      });
    }
  };

  const isItemActive = (item: NavItem) => {
    if (item.url.startsWith("/settings")) return location.startsWith("/settings");
    return location === item.url;
  };

  const renderNavItem = (item: NavItem) => {
    const featureKey = GATED_NAV_FEATURE[item.title];
    const state = featureKey ? getFeatureState(featureKey) : null;
    const showLock = isFree && state?.upgradeRequired;
    const isActive = isItemActive(item);
    const testId = `nav-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    // Static (NEW/Pro) badges live on the item; dynamic counts come from
    // the live-data lookup. Item-level wins if both are present.
    const resolvedBadge = item.badge ?? dynamicBadges[item.title];

    // Phase 3.1: main nav items read as medium-weight with 18px icons so
    // they're visibly heavier than sub-items (which keep default weight +
    // indent via `.nav-sub-item`). This matches the mockup's two-level
    // hierarchy inside each group.
    const labelClass = cn("flex-1 truncate", !item.sub && "font-medium");
    const iconClass = "h-[18px] w-[18px] shrink-0";

    if (showLock) {
      return (
        <SidebarMenuItem key={item.title} className={item.sub ? "relative" : undefined}>
          <SidebarMenuButton
            isActive={isActive}
            data-testid={testId}
            onClick={(e: React.MouseEvent) => handleNavClick(item, e)}
            className={cn("cursor-pointer", item.sub && "nav-sub-item")}
          >
            <item.icon className={iconClass} />
            <span className={labelClass}>{item.title}</span>
            {resolvedBadge ? <Badge badge={resolvedBadge} /> : null}
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    }

    return (
      <SidebarMenuItem key={item.title} className={item.sub ? "relative" : undefined}>
        <SidebarMenuButton
          asChild
          isActive={isActive}
          data-testid={testId}
          className={cn(item.sub && "nav-sub-item")}
        >
          <Link href={item.url}>
            <item.icon className={iconClass} />
            <span className={labelClass}>{item.title}</span>
            {resolvedBadge ? <Badge badge={resolvedBadge} /> : null}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const groupHasActive = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const g of NAV_GROUPS) {
      map.set(
        g.id,
        g.items.some((it) => isItemActive(it))
      );
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return (
    <>
      <Sidebar variant="floating" className="!border-r-0">
        <SidebarHeader className="p-4">
          <BudgetSmartLogoWithText showTagline={true} />
        </SidebarHeader>
        <SidebarContent className="gap-0 px-2 sidebar-scroll">
          {isFree && (
            <SidebarGroup className="px-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        trackUpgradeCta("sidebar");
                        navigate("/upgrade");
                      }}
                      className="w-full rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-sm py-2.5 px-3 flex items-center justify-center gap-2 transition-all shadow-sm"
                      data-testid="sidebar-upgrade-cta"
                    >
                      <Zap className="h-4 w-4" />
                      Upgrade Plan
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    Unlock unlimited AI, all bank connections &amp; more
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="mt-2 px-2 py-2 rounded-lg border border-border/60 bg-background/40 backdrop-blur-sm">
                <p className="text-xs font-medium text-foreground">
                  {usageRemaining}/{usageLimit} AI uses left
                </p>
                <div className="h-1.5 rounded-full mt-1.5 overflow-hidden bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-colors",
                      usagePct >= 90
                        ? "bg-red-500"
                        : usagePct >= 70
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                    )}
                    style={{ width: `${Math.min(100, usagePct)}%` }}
                  />
                </div>
                {usageResetStr && (
                  <p className="text-[10px] text-muted-foreground mt-1">Resets {usageResetStr}</p>
                )}
                <Link
                  href="/upgrade"
                  className="text-[10px] text-primary hover:underline mt-0.5 inline-block"
                >
                  See all limits →
                </Link>
              </div>
            </SidebarGroup>
          )}

          {NAV_GROUPS.map((group) => {
            const isOpen = !collapsed.has(group.id);
            const hasActive = groupHasActive.get(group.id);
            return (
              <SidebarGroup key={group.id} className="px-1 py-1.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isOpen}
                  data-testid={`nav-group-${group.id}`}
                  className={cn(
                    // Phase 3.1: beefier group header -- teal brand label with
                    // wider letter-spacing reads cleanly as a section divider
                    // above the menu items below.
                    "w-full flex items-center justify-between px-3 py-2 text-[12px] font-bold uppercase tracking-[0.08em] transition-colors",
                    hasActive
                      ? "text-[color:var(--nav-group-label)]"
                      : "text-muted-foreground/80 hover:text-foreground"
                  )}
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                      !isOpen && "-rotate-90"
                    )}
                    aria-hidden
                  />
                </button>
                {isOpen && (
                  <SidebarGroupContent className="mt-0.5">
                    <SidebarMenu>{group.items.map((item) => renderNavItem(item))}</SidebarMenu>
                  </SidebarGroupContent>
                )}
              </SidebarGroup>
            );
          })}

          {isAdmin && (
            <SidebarGroup className="px-1 py-1.5">
              <div className="px-3 py-2 text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground/80">
                Administration
              </div>
              <SidebarGroupContent className="mt-0.5">
                <SidebarMenu>
                  {adminMenuItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={location === item.url}
                        data-testid={`nav-admin-${item.title.toLowerCase().replace(/ /g, "-")}`}
                      >
                        <Link href={item.url}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* Family plan upsell — only for Pro users (not family, not free, not admin) */}
          {!isAdmin && plan === "pro" && (
            <SidebarGroup className="px-1 pb-2">
              <div className="mx-1 p-3 rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <Users2 className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <p className="text-xs font-semibold text-amber-500">Family Plan</p>
                </div>
                <p className="text-xs text-muted-foreground mb-2.5 leading-relaxed">
                  Add up to 6 members and share budgets with your household.
                </p>
                <Link href="/upgrade">
                  <button
                    type="button"
                    className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-xs font-medium transition-colors"
                  >
                    Upgrade to Family
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </Link>
              </div>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter className="p-4 border-t border-border/40">
          <div className="space-y-3">
            <Link href="/settings/profile">
              <div
                className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                data-testid="sidebar-user-profile"
              >
                <Avatar className="h-8 w-8">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {initials || <User className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-medium truncate">{displayName}</span>
                  <span className="text-xs text-muted-foreground">Personal Account</span>
                </div>
                {isFree && (
                  <Link href="/settings/billing">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border hover:border-emerald-500 hover:text-emerald-600 transition-colors cursor-pointer">
                      Free
                    </span>
                  </Link>
                )}
              </div>
            </Link>
            <TooltipProvider>
              <div className="flex items-center gap-1 px-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href="/help">
                      <button
                        type="button"
                        className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label="Help"
                      >
                        <HelpCircle className="h-4 w-4" />
                      </button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="top">Help</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => logoutMutation.mutate()}
                      disabled={logoutMutation.isPending}
                      className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                      data-testid="sidebar-logout-button"
                      aria-label="Logout"
                    >
                      {logoutMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <LogOut className="h-4 w-4" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Logout</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setChatOpen(true)}
                      className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors relative"
                      aria-label="AI Financial Assistant"
                    >
                      <div className="relative">
                        <Bot className="h-4 w-4" />
                        <Sparkles className="h-2.5 w-2.5 text-emerald-500 absolute -top-1 -right-1" />
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">AI Financial Assistant</TooltipContent>
                </Tooltip>

                {/* Gold-heart Refer-a-friend button. Visible to all users —
                 * the modal itself will degrade gracefully if the Partnero
                 * referral program is disabled server-side. */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setReferralOpen(true)}
                      className="h-9 w-9 flex items-center justify-center rounded-md text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 transition-colors"
                      aria-label="Refer a friend — 30% off + $30"
                      data-testid="sidebar-referral-button"
                    >
                      <Heart className="h-4 w-4 fill-amber-500" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Refer a friend — 30% off + $30
                  </TooltipContent>
                </Tooltip>

                {import.meta.env.VITE_PARTNERO_ENABLED === "true" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link href="/affiliate">
                        <button
                          type="button"
                          className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          aria-label="Affiliate Program"
                        >
                          <Tag className="h-4 w-4" />
                        </button>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="top">Affiliate Program</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TooltipProvider>
          </div>
        </SidebarFooter>
        {upgradeModalFeature && (
          <UpgradeModal
            open={!!upgradeModalFeature}
            onOpenChange={(open) => !open && setUpgradeModalFeature(null)}
            feature={upgradeModalFeature}
            source="locked_nav"
          />
        )}
      </Sidebar>
      <FloatingChatbot externalOpen={chatOpen} onExternalClose={() => setChatOpen(false)} />
      <ReferralModal open={referralOpen} onOpenChange={setReferralOpen} />
    </>
  );
}
