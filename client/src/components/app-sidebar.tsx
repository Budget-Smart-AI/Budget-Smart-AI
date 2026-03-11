import { LayoutDashboard, Receipt, CreditCard, DollarSign, PieChart, Target, BarChart3, Settings, Users, User, Building2, Wallet, Bot, RefreshCw, Tag, Mail, Sparkles, Brain, HelpCircle, Zap, BookOpen, TrendingDown, Landmark, TrendingUp, Home, Calendar, Users2, MessageSquare, Calculator, ScanLine, Shield, ShieldAlert, Cpu, Store, Activity } from "lucide-react";
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

const overviewItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Net Worth",
    url: "/net-worth",
    icon: TrendingUp,
  },
  {
    title: "Calendar",
    url: "/calendar",
    icon: Calendar,
  },
  {
    title: "AI Assistant",
    url: "/ai-assistant",
    icon: Bot,
  },
  {
    title: "What-If Simulator",
    url: "/simulator",
    icon: Calculator,
  },
  {
    title: "Reports",
    url: "/reports",
    icon: BarChart3,
  },
  {
    title: "Security Alerts",
    url: "/anomalies",
    icon: ShieldAlert,
  },
];

const trackingItems = [
  {
    title: "Income",
    url: "/income",
    icon: DollarSign,
  },
  {
    title: "Bills",
    url: "/bills",
    icon: Receipt,
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
    title: "Debts",
    url: "/debts",
    icon: Landmark,
  },
  {
    title: "Debt Payoff",
    url: "/debt-payoff",
    icon: TrendingDown,
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
    title: "AI Management",
    url: "/admin/ai-management",
    icon: Cpu,
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
];

interface AppSidebarProps {
  isAdmin?: boolean;
  username?: string;
}

export function AppSidebar({ isAdmin = false, username }: AppSidebarProps) {
  const [location] = useLocation();

  const { data: session } = useQuery({ queryKey: ["/api/auth/session"], retry: false });
  const s = session as any;
  const displayName = s?.displayName || s?.firstName || username || "User";
  const avatarUrl = s?.avatarUrl || null;
  const firstName = s?.firstName || "";
  const lastName = s?.lastName || "";
  const initials = firstName && lastName
    ? `${firstName[0]}${lastName[0]}`.toUpperCase()
    : (username || "U")[0]?.toUpperCase() || "U";

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 shadow-lg shadow-emerald-500/30">
            <Brain className="h-5 w-5 text-white" />
            <div className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-gradient-to-r from-yellow-400 to-amber-400 flex items-center justify-center shadow-sm">
              <Zap className="h-2 w-2 text-white" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-base font-extrabold bg-gradient-to-r from-emerald-400 via-green-400 to-teal-400 bg-clip-text text-transparent tracking-tight">Budget Smart AI</span>
            <span className="text-[10px] text-sidebar-foreground/60 font-medium tracking-wide">Smarter Money, Brighter Future</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Overview</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {overviewItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`nav-${item.title.toLowerCase().replace(" ", "-")}`}
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
          <SidebarGroupLabel>Tracking</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {trackingItems.map((item) => (
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
        <SidebarGroup>
          <SidebarGroupLabel>Planning</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {planningItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`nav-${item.title.toLowerCase().replace(" ", "-")}`}
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
            </div>
          </Link>
          <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
            {import.meta.env.VITE_PARTNERO_ENABLED === 'true' && (
              <>
                <Link href="/affiliate" className="hover:text-primary transition-colors">
                  Affiliate Program
                </Link>
                <span>·</span>
              </>
            )}
            <Link href="/help" className="hover:text-primary transition-colors">
              Help
            </Link>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
