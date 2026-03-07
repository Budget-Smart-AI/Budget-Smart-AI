import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  User,
  Shield,
  Home,
  Sliders,
  Building2,
  Tag,
  Store,
  Download,
  CreditCard,
  Bell,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const SETTINGS_TABS = [
  { title: "Profile", slug: "profile", icon: User },
  { title: "Security", slug: "security", icon: Shield },
  { title: "Household", slug: "household", icon: Home },
  { title: "Preferences", slug: "preferences", icon: Sliders },
  { title: "Accounts", slug: "accounts", icon: Building2 },
  { title: "Categories", slug: "categories", icon: Tag },
  { title: "Merchants", slug: "merchants", icon: Store },
  { title: "Data", slug: "data", icon: Download },
  { title: "Billing", slug: "billing", icon: CreditCard },
  { title: "Notifications", slug: "notifications", icon: Bell },
] as const;

interface SettingsLayoutProps {
  activeTab: string;
  children: React.ReactNode;
}

export function SettingsLayout({ activeTab, children }: SettingsLayoutProps) {
  const [location] = useLocation();
  const { data: session } = useQuery({ queryKey: ["/api/auth/session"], retry: false });
  const s = session as any;

  const displayName = s?.displayName || s?.firstName || s?.username || "User";
  const avatarUrl: string | null = s?.avatarUrl ?? null;
  const firstName: string = s?.firstName || "";
  const lastName: string = s?.lastName || "";
  const initials =
    firstName && lastName
      ? `${firstName[0]}${lastName[0]}`.toUpperCase()
      : (s?.username || "U")[0]?.toUpperCase() || "U";

  const planLabel: string = s?.planStatus
    ? `${s.planStatus} — Active`
    : "Free Plan";

  const activeConfig = SETTINGS_TABS.find((t) => t.slug === activeTab);
  const pageTitle = activeConfig?.title ?? "Settings";

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-settings-title">
            {pageTitle}
          </h1>
          <p className="text-muted-foreground text-sm">Manage your account settings</p>
        </div>
        {/* User info chip */}
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-card shadow-sm">
          <Avatar className="h-9 w-9 shrink-0">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{planLabel}</p>
          </div>
        </div>
      </div>

      {/* ── Mobile: horizontal scrollable tab bar ── */}
      <div className="md:hidden overflow-x-auto scrollbar-none -mx-1 px-1">
        <div className="flex gap-1 pb-1 min-w-max">
          {SETTINGS_TABS.map((tab) => {
            const isActive = tab.slug === activeTab;
            return (
              <Link key={tab.slug} href={`/settings/${tab.slug}`}>
                <div
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer select-none",
                    isActive
                      ? "bg-[#1a365d] text-white"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  data-testid={`settings-tab-${tab.slug}`}
                >
                  <tab.icon className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:block">{tab.title}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Desktop: sidebar + content ── */}
      <div className="flex gap-6">
        {/* Sidebar */}
        <nav className="hidden md:flex flex-col w-48 shrink-0 space-y-0.5">
          {SETTINGS_TABS.map((tab) => {
            const isActive = tab.slug === activeTab;
            return (
              <Link key={tab.slug} href={`/settings/${tab.slug}`}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer select-none",
                    isActive
                      ? "bg-[#1a365d] text-white"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  data-testid={`settings-tab-${tab.slug}`}
                >
                  <tab.icon className="h-4 w-4 shrink-0" />
                  <span>{tab.title}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Content area */}
        <div className="flex-1 min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
