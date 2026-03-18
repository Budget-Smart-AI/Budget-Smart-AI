import { useState } from "react";
import { FloatingChatbot } from "@/components/floating-chatbot";
import { LayoutDashboard, Receipt, CreditCard, DollarSign, PieChart, Target, BarChart3, Settings, Users, User, Building2, Wallet, Bot, RefreshCw, Tag, Mail, Sparkles, Brain, HelpCircle, Zap, BookOpen, TrendingDown, Landmark, TrendingUp, Home, Calendar, Users2, MessageSquare, Calculator, ScanLine, Shield, ShieldAlert, Cpu, Store, Activity, LogOut, Lock, FileText, ArrowRight, Loader2 } from "lucide-react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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

const overviewItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Net Worth", url: "/net-worth", icon: TrendingUp },
  { title: "Calendar", url: "/calendar", icon: Calendar },
  { title: "AI Assistant", url: "/ai-assistant", icon: Bot },
  { title: "What-If Simulator", url: "/simulator", icon: Calculator },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Security Alerts", url: "/anomalies", icon: ShieldAlert },
];

const trackingItems = [
  {
    title: "Income",
    url: "/income",
    icon: DollarSign,
  },
  {
    title: "Expenses",
    url: "/expenses",
    icon: Receipt,
  },
  {
    title: "Bills",
    url: "/bills",
    icon: CreditCard,
  },
  {
    title: "Subscriptions",
    url: "/subscriptions",
    icon: RefreshCw,
  },
  {
    title: "Accounts",
    url: "/accounts",
    icon: Building2,
  },
  {
    title: "Receipt Scanner",
    url: "/receipts",
    icon: ScanLine,
  },
  {
    title: "Financial Vault",
    url: "/vault",
    icon: Shield,
  },
  {
    title: "Investments",
    url: "/investments",
    icon: TrendingUp,
  },
  {
    title: "Assets",
    url: "/assets",
    icon: Home,
  },
  {
    title: "Liabilities",
    url: "/liabilities",
    icon: TrendingDown,
  },
  {
    title: "TaxSmart AI",
    url: "/tax-smart",
    badge: "Pro",
    icon: FileText,
  },
];

const planningItems = [
  {
    title: "Budgets",
    url: "/budgets",
    icon: PieChart,
  },
  {
    title: "Savings Goals",
    url: "/savings",
    icon: Target,
  },
  {
    title: "Debt Payoff",
    url: "/debt-payoff",
    icon: Landmark,
  },
  {
    title: "Split Expenses",
    url: "/split-expenses",
    icon: Users2,
  },
];

const settingsItems = [
  {
    title: "Setup Wizard",
    url: "/setup-wizard",
    icon: Sparkles,
  },
  {
    title: "Settings",
    url: "/settings/profile",
    icon: Settings,
  },
];

const supportItems = [
  {
    title: "Help Center",
    url: "/help",
    icon: BookOpen,
  },
  {
    title: "Support",
    url: "/support",
    icon: HelpCircle,
  },
];

const adminMenuItems = [
  {
    title: "Users",
    url: "/admin/users",
    icon: Users,
  },
  {
    title: "Sales Chatbot",
    url: "/admin/sales-chat",
    icon: MessageSquare,
  },
  {
    title: "Support",
    url: "/admin/support",
    icon: HelpCircle,
  },
  {
    title: "Bank Providers",
    url: "/admin/bank-providers",
    icon: Building2,
  },
  {
    title: "Audit Log",
    url: "/admin/audit-log",
    icon: Shield,
  },
  {
    title: "System Status",
    url: "/admin/system-status",
    icon: Activity,
  },
  {
    title: "Communications",
    url: "/admin/communications",
    icon: Mail,
  },
  {
    title: "AI Models",
    url: "/admin/ai-models",
    icon: Cpu,
  },
];

interface AppSidebarProps {
  isAdmin?: boolean;
  username?: string;
  onLogout?: () => void;
}

function formatResetDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AppSidebar({ isAdmin = false, username, onLogout }: AppSidebarProps) {
  const [location, navigate] = useLocation();
  const [upgradeModalFeature, setUpgradeModalFeature] = useState<UpgradeModalFeature | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const { plan, getFeatureState, usageMap } = useFeatureUsage();

  const { data: session } = useQuery({ queryKey: ["/api/auth/session"], retry: false });
  const logoutMutation = useLogout(onLogout);

  const s = session as any;
  const displayName = s?.displayName || s?.firstName || username || "User";
  const avatarUrl = s?.avatarUrl || null;
  const firstName = s?.firstName || "";
  const lastName = s?.lastName || "";
  const initials = firstName && lastName
    ? `${firstName[0]}${lastName[0]}`.toUpperCase()
    : (username || "U")[0]?.toUpperCase() || "U";

  const isFree = !plan || plan === "free";

  // Primary usage for free plan card: prefer ai_assistant (most visible limit)
  const aiUsage = usageMap.get("ai_assistant");
  const usageCurrent = aiUsage?.currentUsage ?? 0;
  const usageLimit = aiUsage?.limit ?? 10;
  const usagePct = usageLimit > 0 ? (usageCurrent / usageLimit) * 100 : 0;
  const usageResetStr = aiUsage?.resetDate ? formatResetDate(aiUsage.resetDate) : "";

  const handleNavClick = (item: { title: string; url: string }, e: React.MouseEvent) => {
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

  const renderNavItem = (item: { title: string; url: string; icon: typeof Bot }) => {
    const featureKey = GATED_NAV_FEATURE[item.title];
    const state = featureKey ? getFeatureState(featureKey) : null;
    const showLock = isFree && state?.upgradeRequired;
    const isActive = location === item.url;

    if (showLock) {
      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            isActive={isActive}
            data-testid={`nav-${item.title.toLowerCase().replace(/ /g, "-")}`}
            onClick={(e: React.MouseEvent) => handleNavClick(item, e)}
            className="cursor-pointer"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{item.title}</span>
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    }
    // Dashboard gets special styling with text-primary when active
    const isDashboard = item.title === "Dashboard";
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          asChild
          isActive={isActive}
          data-testid={`nav-${item.title.toLowerCase().replace(/ /g, "-")}`}
        >
          <Link href={item.url}>
            <item.icon className={cn("h-4 w-4", isDashboard && isActive && "text-primary")} />
            <span>{item.title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <>
    <Sidebar>
      <SidebarHeader className="p-4">
        <BudgetSmartLogoWithText showTagline={true} />
      </SidebarHeader>
      <SidebarContent>
        {isFree && (
          <SidebarGroup className="px-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      trackUpgradeCta("sidebar");
                      navigate("/upgrade");
                    }}
                    className="w-full rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-sm py-2.5 px-3 flex items-center justify-center gap-2 transition-all"
                  >
                    <Zap className="h-4 w-4" />
                    Upgrade Plan
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  Unlock unlimited AI, all bank connections & more
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="mt-2 px-2 py-2 rounded-lg border border-border/80 bg-muted/30">
              <p className="text-xs font-medium text-foreground">
                {usageCurrent}/{usageLimit} AI uses left
              </p>
              <div className="h-1.5 rounded-full mt-1.5 overflow-hidden bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-colors",
                    usagePct >= 90 ? "bg-red-500" : usagePct >= 70 ? "bg-amber-500" : "bg-emerald-500"
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
        <SidebarGroup>
          <SidebarGroupLabel>Overview</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {overviewItems.map((item) => renderNavItem(item))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Tracking</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {trackingItems.map((item) => renderNavItem(item))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Planning</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {planningItems.map((item) => renderNavItem(item))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.url.startsWith("/settings") ? location.startsWith("/settings") : location === item.url}
                    data-testid={`nav-${item.title.toLowerCase()}`}
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
        <SidebarGroup>
          <SidebarGroupLabel>Help</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {supportItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`nav-${item.title.toLowerCase()}`}
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
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      data-testid={`nav-admin-${item.title.toLowerCase()}`}
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
          <SidebarGroup className="px-2 pb-2">
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
      <SidebarFooter className="p-4 border-t">
        <div className="space-y-3">
          <Link href="/settings/profile">
            <div className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer" data-testid="sidebar-user-profile">
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
              {/* Help icon */}
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

              {/* Logout icon */}
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
                    {logoutMutation.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <LogOut className="h-4 w-4" />
                    }
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Logout</TooltipContent>
              </Tooltip>

              {/* AI Chat icon */}
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

              {import.meta.env.VITE_PARTNERO_ENABLED === 'true' && (
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
    </>
  );
}
