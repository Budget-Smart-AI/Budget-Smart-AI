import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Plus, Pencil, Trash2, Users, Shield, ShieldCheck, Check, X, Clock,
  CreditCard, AlertTriangle, Pause, Eye, ChevronDown, ChevronUp,
  HardDrive, Bot, Activity, Landmark, TrendingUp, TrendingDown,
  BarChart2, DollarSign, Database, Wrench,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface User {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  country: string | null;
  displayName: string | null;
  birthday: string | null;
  timezone: string | null;
  avatarUrl: string | null;
  householdName: string | null;
  addressLine1: string | null;
  city: string | null;
  provinceState: string | null;
  postalCode: string | null;
  isAdmin: boolean;
  isApproved: boolean;
  mfaEnabled: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  subscriptionPlanId: string | null;
  subscriptionStatus: string | null;
  /** DB plan field (free / pro / family) — set manually or by Stripe webhook */
  plan: string | null;
  /** Stripe subscription ID — present when user has a Stripe subscription */
  stripeSubscriptionId: string | null;
}

/**
 * Returns true when the user has a non-free DB plan but NO active Stripe subscription.
 * This indicates the plan was set manually (admin override / support grant).
 */
function isManualOverride(user: User): boolean {
  const hasDbPlan = !!user.plan && user.plan !== "free";
  const hasActiveStripe =
    !!user.stripeSubscriptionId && user.subscriptionStatus === "active";
  return hasDbPlan && !hasActiveStripe;
}

interface Plan {
  id: string;
  name: string;
  price: string;
  billingPeriod: string;
  isActive: string;
}

interface AiFeatureCost {
  featureTag: string;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostUsd: number;
  callCount: number;
  lastUsed: string | null;
}

interface UserAnalytics {
  storage: {
    totalFiles: number;
    vaultFiles: number;
    receiptFiles: number;
    storageMB: number;
    storageGB: number;
    storageTrend: "growing" | "stable";
  };
  aiCosts: {
    byFeature: AiFeatureCost[];
    totalCostUsd: number;
    avgMonthlyCostUsd: number;
    estimatedAnnualCostUsd: number;
  };
  activity: {
    lastLoginAt: string | null;
    totalLogins: number;
    bankAccountCount: number;
    transactionCount: number;
    receiptCount: number;
    budgetCount: number;
    billCount: number;
    savingsGoalCount: number;
    lastSyncAt: string | null;
  };
  financialOverview: {
    netWorthUsd: number;
    manualAccountCount: number;
    subscriptionStatus: string | null;
    subscriptionPlanId: string | null;
    subscriptionStartAt: string | null;
    accountCreatedAt: string | null;
    stripeCustomerId: string | null;
  };
}

interface AggregateInsightsData {
  activeUsers: number;
  aiSpendThisMonth: number;
  aiSpendTotal: number;
  avgAiPerUserMonth: number;
  avgStorageMB: number;
  costPerActiveUser: number;
  usersApproachingStorageLimit: Array<{ userId: string; totalBytes: number; totalMB: number }>;
  topAiCostUsers: Array<{
    userId: string;
    username: string | null;
    email: string | null;
    displayName: string | null;
    totalCostUsd: number;
    callCount: number;
  }>;
  featureUsage?: {
    freeUserCount: number;
    byFeature: Array<{
      featureKey: string;
      usersUsing: number;
      avgUsage: number;
      usersAtLimit: number;
    }>;
    conversionSignals: Array<{
      userId: string;
      username: string | null;
      email: string | null;
      displayName: string | null;
      featuresAtLimit: number;
    }>;
  };
}

const createUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  isAdmin: z.boolean().default(false),
  isApproved: z.boolean().default(true),
});

const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;

const updateUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional().or(z.literal("")),
  email: z.string().email("Valid email required").optional().or(z.literal("")).nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  displayName: z.string().max(100).optional().nullable(),
  birthday: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  isAdmin: z.boolean().optional(),
  isApproved: z.boolean().optional(),
  subscriptionPlanId: z.string().optional().nullable(),
  subscriptionStatus: z.string().optional().nullable(),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;
type UpdateUserFormValues = z.infer<typeof updateUserSchema>;

// Returns a consistent color based on the first character of a name
function getInitialColor(name: string): string {
  const colors = [
    "bg-emerald-500", "bg-teal-500", "bg-cyan-500", "bg-blue-500",
    "bg-indigo-500", "bg-violet-500", "bg-purple-500", "bg-pink-500",
    "bg-rose-500", "bg-orange-500", "bg-amber-500", "bg-green-500",
  ];
  const code = name.length > 0 ? name.charCodeAt(0) : 0;
  return colors[code % colors.length];
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      <span className="text-sm text-foreground">
        {value && value.trim() !== "" ? value : <span className="text-muted-foreground italic">Not provided</span>}
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <div className={`rounded-lg border bg-muted/30 p-3 flex flex-col gap-1 ${accent ?? ""}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-lg font-bold leading-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          className="w-full flex items-center justify-between py-2 px-3 rounded-md border bg-muted/20 hover:bg-muted/40 transition-colors text-sm font-semibold"
          type="button"
        >
          <span className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground" />
            {title}
          </span>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 pb-1 space-y-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

// Format a USD cost: use 6 decimal places for micro-costs (< $0.01) for precision,
// or 4 decimal places otherwise for readability.
function fmtUsd(n: number) {
  const decimals = n > 0 && n < 0.01 ? 6 : 4;
  return `$${n.toFixed(decimals)}`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "N/A";
  try {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return d;
  }
}

function UserAnalyticsSection({ userId }: { userId: string }) {
  const { data: analytics, isLoading, error } = useQuery<UserAnalytics>({
    queryKey: [`/api/admin/users/${userId}/analytics`],
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="text-xs text-muted-foreground italic p-3 border rounded-md">
        Analytics data unavailable
      </div>
    );
  }

  const { storage, aiCosts, activity, financialOverview } = analytics;

  return (
    <div className="space-y-3">
      {/* Section 1 — Storage */}
      <CollapsibleSection title="Storage" icon={HardDrive}>
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label="Total Files"
            value={storage.totalFiles}
            sub={`${storage.vaultFiles} vault · ${storage.receiptFiles} receipts`}
            icon={Database}
          />
          <StatCard
            label="Storage Used"
            value={storage.storageMB < 1024
              ? `${storage.storageMB} MB`
              : `${storage.storageGB} GB`}
            sub={`${storage.storageMB} MB total`}
            icon={HardDrive}
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          {storage.storageTrend === "growing"
            ? <><TrendingUp className="w-3.5 h-3.5 text-amber-500" /> Trend: <span className="text-amber-600 font-medium">Growing</span></>
            : <><TrendingDown className="w-3.5 h-3.5 text-green-500" /> Trend: <span className="text-green-600 font-medium">Stable</span></>
          }
        </div>
      </CollapsibleSection>

      {/* Section 2 — AI Cost Tracking */}
      <CollapsibleSection title="AI Cost Tracking" icon={Bot}>
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Total AI Spend" value={fmtUsd(aiCosts.totalCostUsd)} icon={DollarSign} />
          <StatCard label="Avg / Month" value={fmtUsd(aiCosts.avgMonthlyCostUsd)} icon={BarChart2} />
          <StatCard
            label="Est. Annual"
            value={fmtUsd(aiCosts.estimatedAnnualCostUsd)}
            sub="projected 12-month"
            icon={TrendingUp}
          />
          <StatCard label="AI Calls" value={aiCosts.byFeature.reduce((s, f) => s + f.callCount, 0)} icon={Activity} />
        </div>
        {aiCosts.byFeature.length > 0 && (
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-2 font-medium text-muted-foreground">Feature</th>
                  <th className="text-right p-2 font-medium text-muted-foreground">Calls</th>
                  <th className="text-right p-2 font-medium text-muted-foreground">Cost (USD)</th>
                </tr>
              </thead>
              <tbody>
                {aiCosts.byFeature.map((f) => (
                  <tr key={f.featureTag} className="border-t">
                    <td className="p-2 font-mono">{f.featureTag}</td>
                    <td className="p-2 text-right">{f.callCount}</td>
                    <td className="p-2 text-right font-mono">{fmtUsd(f.totalCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {aiCosts.byFeature.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No AI usage recorded yet</p>
        )}
      </CollapsibleSection>

      {/* Section 3 — Activity & Engagement */}
      <CollapsibleSection title="Activity & Engagement" icon={Activity}>
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label="Last Login"
            value={fmtDate(activity.lastLoginAt)}
            icon={Clock}
          />
          <StatCard
            label="Total Logins"
            value={activity.totalLogins}
            icon={Activity}
          />
          <StatCard
            label="Bank Accounts"
            value={activity.bankAccountCount}
            icon={Landmark}
          />
          <StatCard
            label="Transactions"
            value={activity.transactionCount}
            icon={BarChart2}
          />
          <StatCard label="Receipts Scanned" value={activity.receiptCount} icon={Database} />
          <StatCard label="Budgets Created" value={activity.budgetCount} icon={DollarSign} />
          <StatCard label="Bills Tracked" value={activity.billCount} icon={CreditCard} />
          <StatCard label="Savings Goals" value={activity.savingsGoalCount} icon={TrendingUp} />
        </div>
        <div className="flex flex-col gap-0.5 px-1">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Last Bank Sync</span>
          <span className="text-sm">{fmtDate(activity.lastSyncAt)}</span>
        </div>
      </CollapsibleSection>

      {/* Section 4 — Financial Overview */}
      <CollapsibleSection title="Financial Overview" icon={Landmark}>
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label="Net Worth"
            value={`$${financialOverview.netWorthUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            sub="connected accounts aggregate"
            icon={DollarSign}
          />
          <StatCard
            label="Manual Accounts"
            value={financialOverview.manualAccountCount}
            icon={Database}
          />
        </div>
        <div className="grid grid-cols-1 gap-2 text-xs px-1">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground font-medium uppercase tracking-wide">Subscription Status</span>
            <span>
              {financialOverview.subscriptionStatus
                ? <Badge variant="outline" className="text-xs">{financialOverview.subscriptionStatus}</Badge>
                : <span className="text-muted-foreground italic">No subscription</span>}
            </span>
          </div>
          {financialOverview.accountCreatedAt && (
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground font-medium uppercase tracking-wide">Account Created</span>
              <span className="text-sm">{fmtDate(financialOverview.accountCreatedAt)}</span>
            </div>
          )}
          {financialOverview.stripeCustomerId && (
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground font-medium uppercase tracking-wide">Stripe Customer ID</span>
              <span className="font-mono text-xs">{financialOverview.stripeCustomerId}</span>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Section 5 — Feature Usage (free plan only) */}
      <UserFeatureUsageSection userId={userId} />
    </div>
  );
}

// ── Per-user feature usage (free plan) ─────────────────────────────────────
interface AdminFeatureUsageItem {
  key: string;
  displayName: string;
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
}
interface AdminFeatureUsageData {
  plan: string;
  features: AdminFeatureUsageItem[];
}

const USAGE_CRITICAL_THRESHOLD = 86;
const USAGE_WARNING_THRESHOLD = 61;

function progressColor(pct: number) {
  if (pct >= USAGE_CRITICAL_THRESHOLD) return "bg-red-500";
  if (pct >= USAGE_WARNING_THRESHOLD) return "bg-amber-500";
  return "bg-emerald-500";
}

function UserFeatureUsageSection({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery<AdminFeatureUsageData>({
    queryKey: [`/api/admin/users/${userId}/feature-usage`],
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <CollapsibleSection title="Feature Usage" icon={BarChart2}>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </CollapsibleSection>
    );
  }

  if (!data || data.plan !== "free" || data.features.length === 0) {
    return (
      <CollapsibleSection title="Feature Usage" icon={BarChart2}>
        <p className="text-xs text-muted-foreground italic">
          {!data || data.plan !== "free"
            ? "Feature usage tracking is for free-plan users only."
            : "No limited-feature usage recorded this month."}
        </p>
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection title="Feature Usage (This Month)" icon={BarChart2}>
      <div className="space-y-1.5">
        {data.features.map((f) => (
          <div key={f.key} className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground truncate max-w-[65%]">{f.displayName}</span>
              <span
                className={`font-medium tabular-nums ${
                  f.percentUsed >= USAGE_CRITICAL_THRESHOLD
                    ? "text-red-600 dark:text-red-400"
                    : f.percentUsed >= USAGE_WARNING_THRESHOLD
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {f.used}/{f.limit}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${progressColor(f.percentUsed)}`}
                style={{ width: `${f.percentUsed}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}

// ── Aggregate Insights (shown at top of User Management page) ──────────────────
function AggregateInsights() {
  const { data, isLoading } = useQuery<AggregateInsightsData>({
    queryKey: ["/api/admin/analytics/aggregate"],
    staleTime: 120_000,
  });

  const [showTop10, setShowTop10] = useState(false);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="p-3 sm:p-4 pb-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-muted-foreground" />
          Platform Aggregate Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 space-y-4">
        {/* Metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard label="Active Users" value={data.activeUsers} icon={Users} />
          <StatCard
            label="AI Spend This Month"
            value={`$${data.aiSpendThisMonth.toFixed(4)}`}
            icon={DollarSign}
          />
          <StatCard
            label="AI Spend All-Time"
            value={`$${data.aiSpendTotal.toFixed(4)}`}
            icon={TrendingUp}
          />
          <StatCard
            label="Avg AI / User / Month"
            value={`$${data.avgAiPerUserMonth.toFixed(4)}`}
            icon={BarChart2}
          />
          <StatCard
            label="Avg Storage / User"
            value={`${data.avgStorageMB} MB`}
            icon={HardDrive}
          />
          <StatCard
            label="Cost / Active User"
            value={`$${data.costPerActiveUser.toFixed(4)}`}
            sub="all-time AI / active users"
            icon={Activity}
          />
          {data.usersApproachingStorageLimit.length > 0 && (
            <StatCard
              label="Near Storage Limit"
              value={data.usersApproachingStorageLimit.length}
              sub="> 80% of 400 MB"
              icon={AlertTriangle}
              accent="border-amber-400"
            />
          )}
        </div>

        {/* Top 10 AI cost users */}
        {data.topAiCostUsers.length > 0 && (
          <Collapsible open={showTop10} onOpenChange={setShowTop10}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                <Bot className="w-3.5 h-3.5" />
                Top 10 Highest AI Cost Users
                {showTop10 ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2 font-medium text-muted-foreground">#</th>
                      <th className="text-left p-2 font-medium text-muted-foreground">User</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">Calls</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topAiCostUsers.map((u, i) => (
                      <tr key={u.userId} className="border-t">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2">{u.displayName || u.username || u.userId}</td>
                        <td className="p-2 text-right">{u.callCount}</td>
                        <td className="p-2 text-right font-mono">{fmtUsd(u.totalCostUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Free plan feature usage — conversion signals */}
        {data.featureUsage && data.featureUsage.freeUserCount > 0 && (
          <div className="space-y-3 border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5" />
              Free-Plan Feature Usage — This Month ({data.featureUsage.freeUserCount} free users)
            </p>
            {data.featureUsage.byFeature.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2 font-medium text-muted-foreground">Feature</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">Users</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">Avg Usage</th>
                      <th className="text-right p-2 font-medium text-muted-foreground">At Limit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.featureUsage.byFeature.map((f) => (
                      <tr key={f.featureKey} className="border-t">
                        <td className="p-2 font-medium capitalize">
                          {f.featureKey.replace(/_/g, " ")}
                        </td>
                        <td className="p-2 text-right">{f.usersUsing}</td>
                        <td className="p-2 text-right">{f.avgUsage}</td>
                        <td className="p-2 text-right">
                          {f.usersAtLimit > 0 ? (
                            <Badge variant="destructive" className="text-xs h-4 px-1.5">
                              {f.usersAtLimit}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No feature usage recorded this month.</p>
            )}

            {data.featureUsage.conversionSignals.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  High-Intent Upgrade Candidates (hit limit, still on free)
                </p>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2 font-medium text-muted-foreground">User</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Features at Limit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.featureUsage.conversionSignals.map((u) => (
                        <tr key={u.userId} className="border-t">
                          <td className="p-2">{u.displayName || u.username || u.userId}</td>
                          <td className="p-2 text-right">
                            <Badge variant="outline" className="text-xs">
                              {u.featuresAtLimit}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UserDetailPanel({ user, plans }: { user: User; plans?: Plan[] }) {
  const firstName = user.firstName || "";
  const lastName = user.lastName || "";
  const initials = firstName && lastName
    ? `${firstName[0]}${lastName[0]}`.toUpperCase()
    : (firstName || user.username || "?").charAt(0).toUpperCase();
  const avatarColor = getInitialColor(firstName || user.username || "?");

  const planName = plans?.find(p => p.id === user.subscriptionPlanId)?.name ?? null;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 py-2">
      {/* Avatar + name header */}
      <div className="flex flex-col items-center gap-3 pb-5 border-b">
        <Avatar className="h-20 w-20 text-2xl font-bold">
          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.username} />}
          <AvatarFallback className={`${avatarColor} text-white text-2xl font-bold`}>
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="text-center">
          <p className="font-semibold text-lg leading-tight">
            {user.displayName ||
              (firstName || lastName ? `${firstName} ${lastName}`.trim() : user.username)}
          </p>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
        </div>
      </div>

      {/* Profile fields */}
      <div className="grid grid-cols-1 gap-4">
        <DetailField label="First Name" value={user.firstName} />
        <DetailField label="Last Name" value={user.lastName} />
        <DetailField label="Display Name" value={user.displayName} />
        <DetailField label="Email" value={user.email} />
        <DetailField label="Phone" value={user.phone} />
        <DetailField label="Birthday" value={user.birthday ? formatDate(user.birthday) : null} />
        <DetailField label="Timezone" value={user.timezone} />
        <DetailField label="Country" value={user.country} />

        {/* Status */}
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Status</span>
          {user.isDeleted ? (
            <Badge variant="destructive" className="w-fit text-xs">Deleted</Badge>
          ) : user.isApproved ? (
            <Badge className="w-fit bg-green-600 text-white text-xs">Active</Badge>
          ) : (
            <Badge variant="outline" className="w-fit border-amber-500 text-amber-500 text-xs">Inactive</Badge>
          )}
        </div>

        <DetailField label="Username" value={user.username} />

        {/* Role */}
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Role</span>
          {user.isAdmin ? (
            <Badge className="w-fit bg-emerald-600 text-white text-xs">
              <ShieldCheck className="w-3 h-3 mr-1" />
              Admin
            </Badge>
          ) : (
            <Badge variant="secondary" className="w-fit text-xs">
              <Shield className="w-3 h-3 mr-1" />
              User
            </Badge>
          )}
        </div>

        {/* Plan */}
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Plan</span>
          {planName ? (
            <div className="flex flex-col gap-1">
              <Badge className="w-fit bg-blue-600 text-white text-xs">
                <CreditCard className="w-3 h-3 mr-1" />
                {planName}
              </Badge>
              {user.subscriptionStatus && (
                <Badge
                  variant="outline"
                  className={`w-fit text-xs ${
                    user.subscriptionStatus === "active"
                      ? "border-green-500 text-green-600"
                      : user.subscriptionStatus === "trialing"
                      ? "border-blue-500 text-blue-600"
                      : user.subscriptionStatus === "past_due" || user.subscriptionStatus === "unpaid"
                      ? "border-red-500 text-red-600"
                      : user.subscriptionStatus === "canceled"
                      ? "border-gray-500 text-gray-600"
                      : user.subscriptionStatus === "paused"
                      ? "border-yellow-500 text-yellow-600"
                      : "border-gray-400 text-gray-500"
                  }`}
                >
                  {user.subscriptionStatus}
                </Badge>
              )}
            </div>
          ) : (
            <Badge variant="outline" className="w-fit text-xs text-muted-foreground">No Plan</Badge>
          )}
        </div>

        {/* MFA */}
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">MFA</span>
          {user.mfaEnabled ? (
            <Badge className="w-fit bg-green-600 text-white text-xs">Enabled</Badge>
          ) : (
            <Badge variant="outline" className="w-fit text-xs">Disabled</Badge>
          )}
        </div>

        {/* Created */}
        <DetailField label="Created" value={formatDate(user.createdAt)} />
      </div>

      {/* Household & Address */}
      {(user.householdName || user.addressLine1 || user.city || user.provinceState || user.postalCode) && (
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            Household &amp; Address
          </h3>
          <div className="grid grid-cols-1 gap-4">
            <DetailField label="Household Name" value={user.householdName} />
            <DetailField label="Address" value={user.addressLine1} />
            <DetailField label="City" value={user.city} />
            <DetailField label="Province / State" value={user.provinceState} />
            <DetailField label="Postal Code" value={user.postalCode} />
          </div>
        </div>
      )}

      {/* Analytics & Cost Insights */}
      <div className="border-t pt-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-muted-foreground" />
          User Analytics &amp; Cost Insights
        </h3>
        <UserAnalyticsSection userId={user.id} />
      </div>
    </div>
  );
}

function UserForm({
  user,
  plans,
  onClose,
}: {
  user?: User;
  plans?: Plan[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!user;

  const form = useForm<CreateUserFormValues | UpdateUserFormValues>({
    resolver: zodResolver(isEditing ? updateUserSchema : createUserSchema),
    defaultValues: isEditing
      ? {
          username: user.username,
          password: "",
          email: user.email ?? "",
          firstName: user.firstName ?? "",
          lastName: user.lastName ?? "",
          phone: user.phone ?? "",
          displayName: user.displayName ?? "",
          birthday: user.birthday ?? "",
          timezone: user.timezone ?? "",
          country: user.country ?? "",
          isAdmin: user.isAdmin,
          isApproved: user.isApproved,
          subscriptionPlanId: user.subscriptionPlanId,
          subscriptionStatus: user.subscriptionStatus,
        }
      : { username: "", password: "", isAdmin: false, isApproved: true },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateUserFormValues) => {
      const response = await apiRequest("POST", "/api/admin/users", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User created successfully" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create user", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateUserFormValues) => {
      const payload: Record<string, unknown> = {};
      if (data.username && data.username !== user?.username) payload.username = data.username;
      if (data.password && data.password.length > 0) payload.password = data.password;
      if (data.isAdmin !== undefined) payload.isAdmin = data.isAdmin;
      if (data.isApproved !== undefined) payload.isApproved = data.isApproved;
      // Profile fields – send even when empty string to allow clearing
      payload.email = data.email || null;
      payload.firstName = data.firstName || null;
      payload.lastName = data.lastName || null;
      payload.phone = data.phone || null;
      payload.displayName = data.displayName || null;
      payload.birthday = data.birthday || null;
      payload.timezone = data.timezone || null;
      payload.country = data.country || null;
      // Include subscriptionPlanId - can be null to remove plan
      if (data.subscriptionPlanId !== undefined) {
        payload.subscriptionPlanId = data.subscriptionPlanId === "none" ? null : data.subscriptionPlanId;
      }
      // Include subscriptionStatus - can be null to remove status
      if (data.subscriptionStatus !== undefined) {
        payload.subscriptionStatus = data.subscriptionStatus === "none" ? null : data.subscriptionStatus;
      }

      const response = await apiRequest("PATCH", `/api/admin/users/${user!.id}`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated successfully" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update user", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: CreateUserFormValues | UpdateUserFormValues) => {
    if (isEditing) {
      updateMutation.mutate(data as UpdateUserFormValues);
    } else {
      createMutation.mutate(data as CreateUserFormValues);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="Enter username" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{isEditing ? "New Password (leave blank to keep current)" : "Password"}</FormLabel>
              <FormControl>
                <Input type="password" placeholder={isEditing ? "Enter new password" : "Enter password"} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {isEditing && (
          <div className="space-y-4 rounded-md border p-4">
            <p className="text-sm font-medium leading-none">Profile Information</p>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="First name" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Last name" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Display name" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="Email address" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input placeholder="Phone number" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="birthday"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Birthday</FormLabel>
                    <FormControl>
                      <Input placeholder="YYYY-MM-DD" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. US" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timezone</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. America/Toronto" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <FormField
          control={form.control}
          name="isApproved"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Approved</FormLabel>
                <FormDescription>
                  User can only log in once their account is approved.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isAdmin"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Administrator</FormLabel>
                <FormDescription>
                  Admins can manage all users and have full access to the system.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {isEditing && plans && plans.length > 0 && (
          <>
            <FormField
              control={form.control}
              name="subscriptionPlanId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subscription Plan</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || "none"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a plan" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No Plan</SelectItem>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name} - ${plan.price}/{plan.billingPeriod}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Manually assign a subscription plan to this user.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="subscriptionStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subscription Status</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || "none"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No Status</SelectItem>
                      {SUBSCRIPTION_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Manually set the subscription status for this user.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {isEditing ? "Update User" : "Create User"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function AdminUsers() {
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | undefined>();
  const [deletingUser, setDeletingUser] = useState<User | undefined>();
  const [viewingUser, setViewingUser] = useState<User | undefined>();

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ["/api/admin/landing/pricing"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User deleted successfully" });
      setDeletingUser(undefined);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete user", description: error.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${id}`, { isApproved: true });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User approved", description: "The user can now log in to the system." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to approve user", description: error.message, variant: "destructive" });
    },
  });

  const handleApprove = (user: User) => {
    approveMutation.mutate(user.id);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setIsFormOpen(true);
  };

  const handleView = (user: User) => {
    setViewingUser(user);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingUser(undefined);
  };

  return (
    <div className="space-y-4 sm:space-y-6 px-1 sm:px-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            User Management
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage system users and permissions</p>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingUser(undefined)} size="sm" className="text-xs sm:text-sm w-fit">
              <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingUser ? "Edit User" : "Create New User"}</DialogTitle>
            </DialogHeader>
            <UserForm user={editingUser} plans={plans} onClose={handleCloseForm} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Platform Aggregate Insights */}
      <AggregateInsights />

      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-xl">All Users</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 sm:h-12 w-full" />
              <Skeleton className="h-10 sm:h-12 w-full" />
              <Skeleton className="h-10 sm:h-12 w-full" />
            </div>
          ) : !users || users.length === 0 ? (
            <div className="text-center py-6 sm:py-8 text-muted-foreground">
              <Users className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-50" />
              <p className="text-sm sm:text-base">No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sm:text-sm">Username</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden md:table-cell">Name</TableHead>
                    <TableHead className="text-xs sm:text-sm">Status</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Role</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden md:table-cell">Plan</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden lg:table-cell">MFA</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden lg:table-cell">Created</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell className="font-medium text-xs sm:text-sm p-2 sm:p-4">{user.username}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs sm:text-sm p-2 sm:p-4">
                        {user.firstName || user.lastName
                          ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
                          : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="p-2 sm:p-4">
                        {user.isApproved ? (
                          <Badge variant="default" className="bg-green-600 text-[10px] sm:text-xs">
                            <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                            <span className="hidden sm:inline">Approved</span>
                            <span className="sm:hidden">OK</span>
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-500 text-amber-500 text-[10px] sm:text-xs">
                            <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                            <span className="hidden sm:inline">Pending</span>
                            <span className="sm:hidden">Wait</span>
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell p-2 sm:p-4">
                        {user.isAdmin ? (
                          <Badge variant="default" className="bg-emerald-600 text-[10px] sm:text-xs">
                            <ShieldCheck className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] sm:text-xs">
                            <Shield className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                            User
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell p-2 sm:p-4">
                        {user.subscriptionPlanId ? (
                          <div className="flex flex-col gap-1">
                            <Badge variant="default" className="bg-blue-600 text-[10px] sm:text-xs w-fit">
                              <CreditCard className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                              {plans?.find(p => p.id === user.subscriptionPlanId)?.name || "Unknown"}
                            </Badge>
                            {user.subscriptionStatus && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] sm:text-xs w-fit ${
                                  user.subscriptionStatus === "active"
                                    ? "border-green-500 text-green-600"
                                    : user.subscriptionStatus === "trialing"
                                    ? "border-blue-500 text-blue-600"
                                    : user.subscriptionStatus === "past_due" || user.subscriptionStatus === "unpaid"
                                    ? "border-red-500 text-red-600"
                                    : user.subscriptionStatus === "canceled"
                                    ? "border-gray-500 text-gray-600"
                                    : user.subscriptionStatus === "paused"
                                    ? "border-yellow-500 text-yellow-600"
                                    : "border-gray-400 text-gray-500"
                                }`}
                              >
                                {user.subscriptionStatus === "active" && <Check className="w-2.5 h-2.5 mr-0.5" />}
                                {user.subscriptionStatus === "trialing" && <Clock className="w-2.5 h-2.5 mr-0.5" />}
                                {(user.subscriptionStatus === "past_due" || user.subscriptionStatus === "unpaid") && <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />}
                                {user.subscriptionStatus === "canceled" && <X className="w-2.5 h-2.5 mr-0.5" />}
                                {user.subscriptionStatus === "paused" && <Pause className="w-2.5 h-2.5 mr-0.5" />}
                                {user.subscriptionStatus}
                              </Badge>
                            )}
                            {isManualOverride(user) && (
                              <Badge variant="outline" className="text-[10px] sm:text-xs w-fit border-orange-500 text-orange-600">
                                <Wrench className="w-2.5 h-2.5 mr-0.5" />
                                Manual Override
                              </Badge>
                            )}
                          </div>
                        ) : isManualOverride(user) ? (
                          <div className="flex flex-col gap-1">
                            <Badge variant="default" className="bg-orange-600 text-[10px] sm:text-xs w-fit">
                              <Wrench className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                              {user.plan?.charAt(0).toUpperCase()}{user.plan?.slice(1)}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] sm:text-xs w-fit border-orange-500 text-orange-600">
                              Manual Override
                            </Badge>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px] sm:text-xs text-muted-foreground">
                            No Plan
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell p-2 sm:p-4">
                        {user.mfaEnabled ? (
                          <Badge variant="default" className="bg-green-600 text-[10px] sm:text-xs">Enabled</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] sm:text-xs">Disabled</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs sm:text-sm p-2 sm:p-4">
                        {user.createdAt
                          ? new Date(user.createdAt).toLocaleDateString()
                          : "N/A"}
                      </TableCell>
                      <TableCell className="text-right p-2 sm:p-4">
                        <div className="flex justify-end gap-1 sm:gap-2">
                          {!user.isApproved && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 sm:h-9 sm:w-9 p-0"
                              onClick={() => handleApprove(user)}
                              data-testid={`button-approve-${user.id}`}
                            >
                              <Check className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 sm:h-9 sm:w-9 p-0"
                            onClick={() => handleView(user)}
                            data-testid={`button-view-${user.id}`}
                          >
                            <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 sm:h-9 sm:w-9 p-0"
                            onClick={() => handleEdit(user)}
                            data-testid={`button-edit-${user.id}`}
                          >
                            <Pencil className="w-3 h-3 sm:w-4 sm:h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 sm:h-9 sm:w-9 p-0"
                            onClick={() => setDeletingUser(user)}
                            data-testid={`button-delete-${user.id}`}
                          >
                            <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingUser} onOpenChange={() => setDeletingUser(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the user "{deletingUser?.username}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingUser && deleteMutation.mutate(deletingUser.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* User Detail Panel */}
      <Sheet open={!!viewingUser} onOpenChange={(open) => { if (!open) setViewingUser(undefined); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>User Profile</SheetTitle>
          </SheetHeader>
          {viewingUser && <UserDetailPanel user={viewingUser} plans={plans} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
