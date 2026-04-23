/**
 * Left-rail navigation — "TV remote" redesign (2026-04-22).
 *
 * Structure:
 *   [Logo]                                (compact wordmark)
 *   [ · ·  ·   ]                          round-icon row: Dashboard /
 *                                         Calendar / Security Alerts
 *   ─────────────────────
 *   🏦 Wallet        ▾                    top-level w/ icon + accordion
 *     │── Income                          sub items: smaller text, no
 *     │── Expenses                        icons, rail + stub connectors
 *     │── Receipt Scanner
 *     │── Bills & Subscriptions
 *     └── Accounts
 *   📈 Wealth        ▸
 *   🎯 Plan & Grow   ▸
 *   ✨ AI Studio     ▾
 *   ─────────────────────                 separator
 *   ⚙️ Account       ▸
 *
 * Key behavior changes vs. the prior layout:
 *   - "Home" group removed; its three items become round icon buttons
 *     below the logo.
 *   - "Money In & Out" → "Wallet".
 *   - Receipt Scanner is now a sibling of Expenses under Wallet (was
 *     nested underneath Expenses as a sub-sub-item).
 *   - Accordion: opening any top-level group auto-closes the others so
 *     the scroll area never gets cluttered.
 *   - Sub items lose their individual icons; they now sit on a continuous
 *     rail with short horizontal stubs so hierarchy reads at a glance.
 *   - Bottom-left avatar + "Personal Account" card removed (redundant
 *     with the avatar in TopNavBar).
 *   - A subtle divider + spacing sits between AI Studio and Account so
 *     "Account" reads as its own settings/support shelf.
 *
 * Collapse state is still persisted to localStorage (same key), but
 * accordion-closes-others means we normally only store a single open id.
 */
import { useEffect, useMemo, useState } from "react";
import { FloatingChatbot } from "@/components/floating-chatbot";
import {
  Target,
  Settings,
  Users,
  Building2,
  Bot,
  Mail,
  Sparkles,
  HelpCircle,
  Zap,
  TrendingUp,
  Home,
  Calendar,
  Users2,
  MessageSquare,
  Shield,
  ShieldAlert,
  Cpu,
  Activity,
  LogOut,
  Lock,
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
  /** Optional — the 2026-04-22 redesign drops icons from sub items, but
   *  the type stays optional so we can revisit without a refactor. */
  icon?: LucideIcon;
  badge?: NavBadge;
}

interface NavGroupDef {
  id: string;
  label: string;
  /** Top-level icon rendered next to the group label. Drives the "this
   *  group is about X" glance. */
  icon: LucideIcon;
  items: NavItem[];
  /** Default expanded on first mount (before localStorage). Only ONE
   *  group should have this set to true under the accordion model. */
  defaultOpen: boolean;
}

/** Pinned top-row items — rendered as round icon buttons below the logo
 *  so the most-trafficked pages are one tap away on any screen size.
 *  These used to live inside the "Home" group, which has been removed
 *  from NAV_GROUPS. */
const QUICK_ACCESS: Array<{
  title: string;
  url: string;
  icon: LucideIcon;
  badgeKey?: string;
}> = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Calendar", url: "/calendar", icon: Calendar },
  { title: "Security Alerts", url: "/anomalies", icon: ShieldAlert, badgeKey: "Security Alerts" },
];

// Dynamic badge counts (Security Alerts, Bills & Subscriptions) are wired
// inside AppSidebar — see `dynamicBadges` below. They read from the same
// React Query cache the Dashboard already populates (matching query keys),
// so no extra network requests. Static tag badges (NEW / Pro) live on the
// nav item directly.
const NAV_GROUPS: NavGroupDef[] = [
  {
    id: "wallet",
    label: "Wallet",
    icon: Wallet,
    defaultOpen: true,
    items: [
      { title: "Income", url: "/income" },
      { title: "Expenses", url: "/expenses" },
      { title: "Receipt Scanner", url: "/receipts" },
      { title: "Bills & Subscriptions", url: "/bills" },
      { title: "Accounts", url: "/accounts" },
    ],
  },
  {
    id: "wealth",
    label: "Wealth",
    icon: TrendingUp,
    defaultOpen: false,
    items: [
      { title: "Net Worth", url: "/net-worth" },
      { title: "Investments", url: "/investments" },
      { title: "Assets", url: "/assets" },
      { title: "Liabilities", url: "/liabilities" },
      { title: "Financial Vault", url: "/vault" },
    ],
  },
  {
    id: "plan",
    label: "Plan & Grow",
    icon: Target,
    defaultOpen: false,
    items: [
      { title: "Budgets", url: "/budgets" },
      { title: "Savings Goals", url: "/savings" },
      { title: "Debt Payoff", url: "/debt-payoff" },
      { title: "Split Expenses", url: "/split-expenses" },
    ],
  },
  {
    id: "ai",
    label: "AI Studio",
    icon: Sparkles,
    defaultOpen: false,
    items: [
      {
        title: "AI Assistant",
        url: "/ai-assistant",
        badge: { kind: "tag", label: "NEW", tone: "new" },
      },
      { title: "What-If Simulator", url: "/simulator" },
      { title: "Reports", url: "/reports" },
      {
        title: "TaxSmart AI",
        url: "/tax-smart",
        badge: { kind: "tag", label: "Pro", tone: "pro" },
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    icon: Settings,
    defaultOpen: false,
    items: [
      { title: "Setup Wizard", url: "/setup-wizard" },
      { title: "Settings", url: "/settings/profile" },
      { title: "Help Center", url: "/help" },
      { title: "Support", url: "/support" },
    ],
  },
];

/** IDs of groups that sit below the "Account" separator — they render
 *  in a visually distinct shelf (spacing + horizontal divider above). */
const FOOTER_GROUP_IDS = new Set(["account"]);

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
  // Prompt queued from elsewhere (e.g. the "Ask Budget Smart AI" input in
  // TopNavBar) to be auto-sent as the first message when the floating
  // chatbot opens. Cleared once the chatbot reports the message was sent.
  const [pendingChatPrompt, setPendingChatPrompt] = useState<string | null>(null);
  const [referralOpen, setReferralOpen] = useState(false);
  const { plan, getFeatureState, usageMap } = useFeatureUsage();

  // Accordion model (2026-04-22): only one top-level group is open at a
  // time. We still persist to the same localStorage key for continuity,
  // but under the new behavior the Set will normally contain N-1 ids
  // (every group except the one that's open). On first mount we honour
  // `defaultOpen: true` — at most one group should set that.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const initial = new Set(NAV_GROUPS.filter((g) => !g.defaultOpen).map((g) => g.id));
    const persisted = readCollapsedGroups();
    if (persisted.size > 0) return persisted;
    return initial;
  });

  // Auto-expand the group containing the active route. Under the
  // accordion model this ALSO collapses whichever group was previously
  // open — matches the "only one open at a time" rule.
  useEffect(() => {
    const activeGroup = NAV_GROUPS.find((g) => g.items.some((it) => it.url === location));
    if (!activeGroup) return;
    setCollapsed((prev) => {
      if (!prev.has(activeGroup.id)) return prev;
      const next = new Set(NAV_GROUPS.map((g) => g.id));
      next.delete(activeGroup.id);
      writeCollapsedGroups(next);
      return next;
    });
  }, [location]);

  // Listen for the "Ask Budget Smart AI" input dispatched from TopNavBar.
  // Window CustomEvent keeps the two components decoupled — neither needs
  // a direct reference to the other.
  useEffect(() => {
    const handler = (ev: Event) => {
      const prompt = (ev as CustomEvent<{ prompt?: string }>).detail?.prompt?.trim();
      if (!prompt) return;
      setPendingChatPrompt(prompt);
      setChatOpen(true);
    };
    window.addEventListener("bsai:ask-ai", handler as EventListener);
    return () => window.removeEventListener("bsai:ask-ai", handler as EventListener);
  }, []);

  // Accordion toggle (2026-04-22): opening a group auto-collapses the
  // others so only one is open at a time. Collapsing an already-open group
  // just adds it to the closed set without touching siblings, so the user
  // can also choose to have nothing open.
  const toggleGroup = (id: string) => {
    setCollapsed((prev) => {
      const wasOpen = !prev.has(id);
      if (wasOpen) {
        // Close this group, leave the others as-is.
        const next = new Set(prev);
        next.add(id);
        writeCollapsedGroups(next);
        return next;
      }
      // Opening: close everything else (accordion).
      const next = new Set(NAV_GROUPS.map((g) => g.id));
      next.delete(id);
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

  // 2026-04-22: avatar / displayName / initials derivations were removed
  // along with the bottom-left user card; TopNavBar is now the single
  // surface for identity in the chrome. `session` is still queried so
  // React Query populates the cache for other consumers.
  void session;
  void username;
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

  // 2026-04-22 redesign: every item in NAV_GROUPS is a sub-item of a
  // top-level group, so we drop the per-item icon entirely and apply the
  // `.nav-sub-item` class (smaller text + connector stub) to every row.
  // Top-level group icons live in the group header, not here.
  const renderNavItem = (item: NavItem) => {
    const featureKey = GATED_NAV_FEATURE[item.title];
    const state = featureKey ? getFeatureState(featureKey) : null;
    const showLock = isFree && state?.upgradeRequired;
    const isActive = isItemActive(item);
    const testId = `nav-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const resolvedBadge = item.badge ?? dynamicBadges[item.title];

    if (showLock) {
      return (
        <SidebarMenuItem key={item.title} className="nav-sub-item">
          <SidebarMenuButton
            isActive={isActive}
            data-testid={testId}
            onClick={(e: React.MouseEvent) => handleNavClick(item, e)}
            className="cursor-pointer"
          >
            <span className="flex-1 truncate">{item.title}</span>
            {resolvedBadge ? <Badge badge={resolvedBadge} /> : null}
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    }

    return (
      <SidebarMenuItem key={item.title} className="nav-sub-item">
        <SidebarMenuButton
          asChild
          isActive={isActive}
          data-testid={testId}
        >
          <Link href={item.url}>
            <span className="flex-1 truncate">{item.title}</span>
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
        <SidebarHeader className="px-3 pt-3 pb-2 gap-2">
          <BudgetSmartLogoWithText compact />
          {/* Round-icon quick access row: Dashboard / Calendar / Alerts.
           * These were previously inside a "Home" group; promoting them to
           * pinned icons keeps the most-trafficked pages one tap away on
           * mobile as well as desktop. */}
          <TooltipProvider>
            <div className="flex items-center justify-between gap-1 mt-1">
              {QUICK_ACCESS.map((q) => {
                const isActive = location === q.url;
                const badge = q.badgeKey ? dynamicBadges[q.badgeKey] : undefined;
                return (
                  <Tooltip key={q.title}>
                    <TooltipTrigger asChild>
                      <Link href={q.url}>
                        <button
                          type="button"
                          aria-label={q.title}
                          data-testid={`quick-${q.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                          className={cn(
                            "relative h-9 w-9 flex items-center justify-center rounded-full transition-colors",
                            "border border-[color:rgb(var(--glass-border))] bg-[color:rgb(var(--glass-surface))] backdrop-blur-sm",
                            isActive
                              ? "text-emerald-600 dark:text-emerald-300 border-emerald-500/50 bg-emerald-500/10"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                          )}
                        >
                          <q.icon className="h-[15px] w-[15px]" />
                          {badge && badge.kind === "danger" && (
                            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                              {badge.count}
                            </span>
                          )}
                        </button>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{q.title}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
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
            const isFooterGroup = FOOTER_GROUP_IDS.has(group.id);
            return (
              <SidebarGroup
                key={group.id}
                className={cn(
                  "px-1 py-1",
                  // Account group sits in its own "shelf" below a divider
                  // so settings/support reads as separate from the nav.
                  isFooterGroup && "mt-2 pt-3 border-t border-border/40"
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isOpen}
                  data-testid={`nav-group-${group.id}`}
                  className={cn(
                    // Top-level rows read heavier than sub items: icon + bold
                    // label. Active group lights up in brand teal; the rest
                    // sits on the subdued foreground until hovered.
                    "w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-[13px] font-semibold transition-colors",
                    hasActive
                      ? "text-[color:var(--nav-group-label,theme(colors.emerald.600))] bg-emerald-500/[0.06]"
                      : "text-foreground/85 hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <group.icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      hasActive
                        ? "text-emerald-500 dark:text-emerald-300"
                        : "text-muted-foreground"
                    )}
                    aria-hidden
                  />
                  <span className="flex-1 text-left truncate">{group.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-transform duration-200 text-muted-foreground/70",
                      !isOpen && "-rotate-90"
                    )}
                    aria-hidden
                  />
                </button>
                {isOpen && (
                  <SidebarGroupContent className="mt-1">
                    {/* nav-sub-group draws the continuous vertical rail; each
                     * .nav-sub-item row adds its own horizontal stub via
                     * ::before. See index.css for the visual details. */}
                    <div className="nav-sub-group">
                      <SidebarMenu>{group.items.map((item) => renderNavItem(item))}</SidebarMenu>
                    </div>
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
        <SidebarFooter className="px-2 py-2 border-t border-border/40">
          <TooltipProvider>
            {/* Icon-button utility row. The avatar + "Personal Account"
             * card has moved to TopNavBar so the rail stays slim. */}
            <div className="flex items-center justify-between gap-1 px-1">
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
      <FloatingChatbot
        externalOpen={chatOpen}
        onExternalClose={() => {
          setChatOpen(false);
          setPendingChatPrompt(null);
        }}
        initialMessage={pendingChatPrompt}
        onInitialMessageSent={() => setPendingChatPrompt(null)}
      />
      <ReferralModal open={referralOpen} onOpenChange={setReferralOpen} />
    </>
  );
}
