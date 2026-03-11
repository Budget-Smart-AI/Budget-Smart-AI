import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/help-tooltip";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { COUNTRIES } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Loader2, Shield, ShieldCheck, ShieldOff, QrCode, LogOut, User, Save, Trash2,
  AlertTriangle, CreditCard, Calendar, Sparkles, ExternalLink, Copy,
  Download, Check, Camera, Globe, Cake, Eye, EyeOff, Mail, Lock, KeyRound, SlidersHorizontal,
} from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocation, Link } from "wouter";
import { HouseholdSettings } from "@/components/household-settings";
import { PWAInstallCard } from "@/components/pwa-install-prompt";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, RefreshCw, Plus, Tag, FileDown, Database } from "lucide-react";
import { SettingsLayout } from "@/components/settings-layout";
import MerchantsPage from "@/pages/merchants";
import EmailSettings from "@/pages/email-settings";
import { ThemePicker } from "@/components/settings/ThemePicker";
import { UnlinkConfirmDialog } from "@/components/unlink-confirm-dialog";

// ─── Types reused from bank-accounts ────────────────────────────────────────
interface PlaidAccountGroup {
  id: string;
  institutionName: string | null;
  institutionId: string | null;
  status: string | null;
  accounts: Array<{
    id: string;
    plaidItemId: string;
    accountId: string;
    name: string;
    officialName: string | null;
    type: string;
    subtype: string | null;
    mask: string | null;
    balanceCurrent: string | null;
    balanceAvailable: string | null;
    balanceLimit: string | null;
    isoCurrencyCode: string | null;
    lastSynced: string | null;
    isActive: string | null;
  }>;
}

interface MxMemberGroup {
  id: string;
  memberGuid: string;
  institutionName: string;
  institutionCode: string;
  connectionStatus: string | null;
  aggregatedAt: string | null;
  accounts: Array<{
    id: string;
    accountGuid: string;
    name: string;
    type: string;
    subtype: string | null;
    balance: string | null;
    availableBalance: string | null;
    creditLimit: string | null;
    currencyCode: string | null;
    isActive: string | null;
    mask: string | null;
    lastSynced: string | null;
  }>;
}

interface UnifiedAccount {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  balance: string | null;
  currency: string | null;
  source: "plaid" | "mx" | "manual";
  isActive: boolean;
  lastSynced: string | null;
}

// ─── IANA Timezone list (common subset) ───────────────────────────────────────
const TIMEZONES = [
  "America/Toronto", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Vancouver", "America/Edmonton", "America/Winnipeg",
  "America/Halifax", "America/St_Johns", "America/Phoenix", "America/Anchorage",
  "America/Honolulu", "America/Sao_Paulo", "America/Argentina/Buenos_Aires",
  "America/Bogota", "America/Lima", "America/Mexico_City", "America/Caracas",
  "Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Rome",
  "Europe/Madrid", "Europe/Amsterdam", "Europe/Brussels", "Europe/Stockholm",
  "Europe/Oslo", "Europe/Copenhagen", "Europe/Zurich", "Europe/Warsaw",
  "Europe/Prague", "Europe/Budapest", "Europe/Vienna", "Europe/Athens",
  "Europe/Helsinki", "Europe/Bucharest", "Europe/Istanbul", "Europe/Moscow",
  "Africa/Johannesburg", "Africa/Lagos", "Africa/Cairo", "Africa/Nairobi",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Karachi", "Asia/Dhaka", "Asia/Bangkok",
  "Asia/Singapore", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Tokyo",
  "Asia/Seoul", "Asia/Jakarta", "Asia/Manila", "Asia/Taipei", "Asia/Kuala_Lumpur",
  "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth",
  "Australia/Adelaide", "Pacific/Auckland", "Pacific/Fiji",
  "UTC",
];

function getTimezoneLabel(tz: string): string {
  try {
    const offset = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value || "";
    return `${tz.replace(/_/g, " ")} (${offset})`;
  } catch {
    return tz.replace(/_/g, " ");
  }
}

// Returns a consistent color based on the first letter of a name
function getInitialColor(name: string): string {
  const colors = [
    "bg-emerald-500", "bg-teal-500", "bg-cyan-500", "bg-blue-500",
    "bg-indigo-500", "bg-violet-500", "bg-purple-500", "bg-pink-500",
    "bg-rose-500", "bg-orange-500", "bg-amber-500", "bg-green-500",
  ];
  const idx = (name.charCodeAt(0) || 0) % colors.length;
  return colors[idx];
}

const mfaCodeSchema = z.object({
  code: z.string().length(6, "Code must be 6 digits"),
});

const profileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email("Valid email required").optional().or(z.literal("")),
  phone: z.string().optional(),
  country: z.string().optional(),
  displayName: z.string().max(100).optional(),
  birthday: z.string().optional(),
  timezone: z.string().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[a-z]/, "Must contain at least one lowercase letter")
    .regex(/[0-9]/, "Must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Must contain at least one special character"),
  confirmPassword: z.string().min(1, "Please confirm your new password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type MfaCodeFormData = z.infer<typeof mfaCodeSchema>;
type ProfileFormData = z.infer<typeof profileSchema>;
type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

type MfaModalStep = "qr" | "verify" | "backup";

// Password strength helper
function getPasswordStrength(password: string): { label: string; color: string; percent: number } {
  if (!password) return { label: "", color: "", percent: 0 };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 2) return { label: "Weak", color: "bg-red-500", percent: 25 };
  if (score <= 3) return { label: "Fair", color: "bg-amber-500", percent: 50 };
  if (score <= 4) return { label: "Strong", color: "bg-blue-500", percent: 75 };
  return { label: "Very Strong", color: "bg-green-500", percent: 100 };
}

// Month names and days helpers
const MONTHS = [
  { value: "01", label: "January" }, { value: "02", label: "February" },
  { value: "03", label: "March" }, { value: "04", label: "April" },
  { value: "05", label: "May" }, { value: "06", label: "June" },
  { value: "07", label: "July" }, { value: "08", label: "August" },
  { value: "09", label: "September" }, { value: "10", label: "October" },
  { value: "11", label: "November" }, { value: "12", label: "December" },
];

function getDaysInMonth(month: string, year: string): number {
  if (!month || !year) return 31;
  return new Date(parseInt(year), parseInt(month), 0).getDate();
}

// ─── Accounts Tab ─────────────────────────────────────────────────────────────
function AccountsTab() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState<{ type: "plaid" | "mx"; id: string; name: string } | null>(null);

  const { data: plaidGroups = [], isLoading: plaidLoading, refetch: refetchPlaid } =
    useQuery<PlaidAccountGroup[]>({ queryKey: ["/api/plaid/accounts"] });

  const { data: mxMembers = [], isLoading: mxLoading, refetch: refetchMx } =
    useQuery<MxMemberGroup[]>({ queryKey: ["/api/mx/members"] });

  const { data: unifiedAccounts = [], refetch: refetchUnified } =
    useQuery<UnifiedAccount[]>({ queryKey: ["/api/accounts"] });

  const togglePlaidActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/plaid/accounts/${id}/toggle-active`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      toast({ title: "Account updated" });
    },
    onError: () => toast({ title: "Failed to update account", variant: "destructive" }),
  });

  const toggleMxActive = useMutation({
    mutationFn: async (id: string) => apiRequest("PATCH", `/api/mx/accounts/${id}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mx/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      toast({ title: "Account updated" });
    },
    onError: () => toast({ title: "Failed to update account", variant: "destructive" }),
  });

  const disconnectPlaid = useMutation({
    mutationFn: async (itemId: string) => apiRequest("DELETE", `/api/plaid/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      setConfirmDisconnect(null);
      toast({ title: "Account disconnected" });
    },
    onError: () => toast({ title: "Failed to disconnect account", variant: "destructive" }),
  });

  const disconnectMx = useMutation({
    mutationFn: async (memberId: string) => apiRequest("DELETE", `/api/mx/members/${memberId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mx/members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      setConfirmDisconnect(null);
      toast({ title: "Account disconnected" });
    },
    onError: () => toast({ title: "Failed to disconnect account", variant: "destructive" }),
  });

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await apiRequest("POST", "/api/plaid/accounts/refresh-balances");
      await refetchPlaid();
      await refetchMx();
      await refetchUnified();
      toast({ title: "Accounts refreshed" });
    } catch {
      toast({ title: "Refresh failed", variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  const formatBalance = (balance: string | null, currency: string | null = "CAD") => {
    if (balance === null || balance === undefined) return "—";
    const num = parseFloat(balance);
    if (isNaN(num)) return "—";
    return new Intl.NumberFormat("en-CA", { style: "currency", currency: currency || "CAD" }).format(num);
  };

  const isLoading = plaidLoading || mxLoading;
  const hasNoAccounts = plaidGroups.length === 0 && mxMembers.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Linked Bank Accounts</h2>
          <p className="text-sm text-muted-foreground">Manage your connected financial institutions. Clicking <strong>Unlink</strong> revokes your data-access consent and disconnects the account.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh All
          </Button>
          <Button size="sm" onClick={() => navigate("/accounts")}>
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </Button>
        </div>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">Loading accounts…</CardContent>
        </Card>
      )}

      {!isLoading && hasNoAccounts && (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No bank accounts linked yet.</p>
            <Button onClick={() => navigate("/accounts")}>
              <Plus className="h-4 w-4 mr-2" />
              Add Account
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Plaid institution groups */}
      {plaidGroups.map((group) => (
        <Card key={group.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" />
                {group.institutionName || "Unknown Institution"}
                <Badge variant={group.status === "active" ? "default" : "destructive"} className="text-xs">
                  {group.status || "active"}
                </Badge>
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDisconnect({ type: "plaid", id: group.id, name: group.institutionName || "Unknown Institution" })}
              >
                Unlink Account
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.accounts.map((acc) => (
              <div key={acc.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{acc.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {acc.type}{acc.subtype ? ` · ${acc.subtype}` : ""}
                    {acc.mask ? ` ···${acc.mask}` : ""}
                  </p>
                  {acc.lastSynced && (
                    <p className="text-xs text-muted-foreground">
                      Last synced: {new Date(acc.lastSynced).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatBalance(acc.balanceCurrent, acc.isoCurrencyCode)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => togglePlaidActive.mutate({ id: acc.id, isActive: acc.isActive !== "true" })}
                  >
                    {acc.isActive === "true" ? "Hide" : "Show"}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* MX institution groups */}
      {mxMembers.map((member) => (
        <Card key={member.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" />
                {member.institutionName || "Unknown Institution"}
                <Badge
                  variant={member.connectionStatus === "CONNECTED" ? "default" : "secondary"}
                  className="text-xs"
                >
                  {member.connectionStatus || "connected"}
                </Badge>
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDisconnect({ type: "mx", id: member.id, name: member.institutionName || "Unknown Institution" })}
              >
                Unlink Account
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {member.accounts.map((acc) => (
              <div key={acc.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{acc.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {acc.type}{acc.subtype ? ` · ${acc.subtype}` : ""}
                    {acc.mask ? ` ···${acc.mask}` : ""}
                  </p>
                  {acc.lastSynced && (
                    <p className="text-xs text-muted-foreground">
                      Last synced: {new Date(acc.lastSynced).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatBalance(acc.balance, acc.currencyCode)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleMxActive.mutate(acc.id)}
                  >
                    {acc.isActive === "true" ? "Hide" : "Show"}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Confirm disconnect dialog */}
      <UnlinkConfirmDialog
        open={!!confirmDisconnect}
        institutionName={confirmDisconnect?.name ?? ""}
        onConfirm={() => {
          if (!confirmDisconnect) return;
          if (confirmDisconnect.type === "plaid") {
            disconnectPlaid.mutate(confirmDisconnect.id);
          } else {
            disconnectMx.mutate(confirmDisconnect.id);
          }
        }}
        onClose={() => setConfirmDisconnect(null)}
      />

    </div>
  );
}

// ─── Categories Tab ────────────────────────────────────────────────────────────
function CategoriesTab() {
  const [, navigate] = useLocation();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Categories
          </CardTitle>
          <CardDescription>Manage your expense, income, and bill categories</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create and manage custom categories to organize your finances. Custom categories appear
            in all transaction dropdowns alongside the built-in defaults.
          </p>
          <Button onClick={() => navigate("/categories")}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Open Categories Manager
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Data Tab ──────────────────────────────────────────────────────────────────
function DataTab() {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [accountId, setAccountId] = useState("all");
  const [downloading, setDownloading] = useState(false);
  const [downloadingFull, setDownloadingFull] = useState(false);

  const { data: accounts = [] } = useQuery<UnifiedAccount[]>({ queryKey: ["/api/accounts"] });

  const handleDownloadCSV = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (accountId && accountId !== "all") params.set("accountId", accountId);
      const url = `/api/user/export/transactions${params.toString() ? `?${params}` : ""}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const href = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `budgetsmart-transactions-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(href);
      document.body.removeChild(a);
      toast({ title: "Transactions exported" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadFull = async () => {
    setDownloadingFull(true);
    try {
      const response = await fetch("/api/user/export-data", { credentials: "include" });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const href = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `budgetsmart-full-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(href);
      document.body.removeChild(a);
      toast({ title: "Full export downloaded" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setDownloadingFull(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Export Transactions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            Export Your Data
          </CardTitle>
          <CardDescription>Download your financial data in CSV or JSON format</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Download Transactions */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Download Transactions</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="data-start-date" className="text-xs">Start Date</Label>
                <Input
                  id="data-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="data-end-date" className="text-xs">End Date</Label>
                <Input
                  id="data-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="data-account" className="text-xs">Account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="data-account">
                    <SelectValue placeholder="All accounts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All accounts</SelectItem>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleDownloadCSV} disabled={downloading}>
              {downloading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Downloading…</>
              ) : (
                <><Download className="h-4 w-4 mr-2" />Download CSV</>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Includes all transactions in the selected date range.
            </p>
          </div>

          <Separator />

          {/* Full Account Export */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Export Full Account Data</h3>
            <p className="text-sm text-muted-foreground">
              Download a complete export of your BudgetSmart data including profile, accounts,
              transactions, budgets, and bills in JSON format.
            </p>
            <Button variant="outline" onClick={handleDownloadFull} disabled={downloadingFull}>
              {downloadingFull ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Downloading…</>
              ) : (
                <><Download className="h-4 w-4 mr-2" />Download Full Export</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Privacy Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Privacy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            <Link href="/privacy" className="text-sm text-primary hover:underline">Privacy Policy</Link>
          </div>
          <div className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            <Link href="/terms" className="text-sm text-primary hover:underline">Terms of Service</Link>
          </div>
          <div className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            <Link href="/security" className="text-sm text-primary hover:underline">Security Settings</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Privacy Tab ──────────────────────────────────────────────────────────────
function PrivacyTab({ onLogout }: { onLogout: () => void }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [downloading, setDownloading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);

  const handleDownloadData = async () => {
    setDownloading(true);
    try {
      const response = await fetch("/api/user/export-data", { credentials: "include" });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const href = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `budgetsmart-data-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(href);
      document.body.removeChild(a);
      toast({ title: "Data exported", description: "Your data has been downloaded." });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/user/delete-account", {
        password: deletePassword,
        reason: deleteReason || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Account deleted", description: "Your account has been permanently deleted." });
      setDeleteDialogOpen(false);
      onLogout();
      navigate("/");
    },
    onError: (error: Error) => {
      toast({ title: "Deletion failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      {/* Download My Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Download My Data
          </CardTitle>
          <CardDescription>
            Export a copy of all your BudgetSmart data (GDPR / PIPEDA data portability right).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Your download will include: profile information, accounts, transactions, bills, income,
            budgets, savings goals, vault document metadata, and support tickets — in JSON format.
          </p>
          <Button onClick={handleDownloadData} disabled={downloading}>
            {downloading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Preparing download…</>
            ) : (
              <><Download className="h-4 w-4 mr-2" />Download My Data</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Data Retention Policy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Data Retention Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>We keep your data only as long as required for legal, regulatory, and business purposes:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="font-medium text-foreground">Transaction records</span> — 7 years (legal / tax requirement)</li>
            <li><span className="font-medium text-foreground">Audit logs</span> — 2 years (SOC 2 compliance)</li>
            <li><span className="font-medium text-foreground">Read notifications</span> — 90 days</li>
            <li><span className="font-medium text-foreground">AI usage logs</span> — 90 days</li>
            <li><span className="font-medium text-foreground">Closed support tickets</span> — 3 years</li>
            <li><span className="font-medium text-foreground">Inactive sessions</span> — 30 days</li>
          </ul>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Link href="/privacy" className="text-primary hover:underline flex items-center gap-1 text-sm">
              <ExternalLink className="h-3 w-3" /> Privacy Policy
            </Link>
            <Link href="/terms" className="text-primary hover:underline flex items-center gap-1 text-sm">
              <ExternalLink className="h-3 w-3" /> Terms of Service
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Delete My Account */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Delete My Account
          </CardTitle>
          <CardDescription>
            Permanently remove your personal data from BudgetSmart.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Deleting your account will anonymise all personal information and cancel your
            subscription. Transaction history is retained for 7 years as required by law.
            <strong className="text-foreground"> This cannot be undone.</strong>
          </p>
          <Button
            variant="destructive"
            onClick={() => { setDeletePassword(""); setDeleteReason(""); setDeleteDialogOpen(true); }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete My Account
          </Button>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirm Account Deletion
            </DialogTitle>
            <DialogDescription>
              This will permanently delete your account and all personal data. Enter your password to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label htmlFor="privacy-delete-password">Current Password</Label>
              <div className="relative">
                <Input
                  id="privacy-delete-password"
                  type={showDeletePassword ? "text" : "password"}
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowDeletePassword((v) => !v)}
                >
                  {showDeletePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="privacy-delete-reason">Reason (optional)</Label>
              <Input
                id="privacy-delete-reason"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Tell us why you're leaving (optional)"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!deletePassword || deleteAccountMutation.isPending}
                onClick={() => deleteAccountMutation.mutate()}
              >
                {deleteAccountMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting…</>
                ) : (
                  "Delete My Account"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Billing Tab ──────────────────────────────────────────────────────────────
interface BillingPaymentMethod {
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
}

interface BillingSubscription {
  noSubscription?: boolean;
  planName: string;
  status: string;
  isTrial: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  amount: number | null;
  currency: string | null;
  interval: string | null;
  paymentMethod: BillingPaymentMethod | null;
  cancelAtPeriodEnd: boolean;
}

interface BillingInvoice {
  id: string;
  date: string | null;
  amount: number | null;
  currency: string | null;
  status: string;
  pdfUrl: string | null;
  hostedUrl: string | null;
}

function BillingTab() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: billing, isLoading: billingLoading } = useQuery<BillingSubscription | { noSubscription: true }>({
    queryKey: ["/api/billing/subscription"],
  });

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery<{ invoices: BillingInvoice[] }>({
    queryKey: ["/api/billing/invoices"],
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/customer-portal");
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (billingLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  // No stripe customer or no subscription
  if (!billing || (billing as { noSubscription?: boolean }).noSubscription) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-4">
          <CreditCard className="w-10 h-10 mx-auto text-muted-foreground" />
          <p className="text-lg font-medium">No active subscription found.</p>
          <p className="text-sm text-muted-foreground">
            Subscribe to a plan to unlock all features.
          </p>
          <Button onClick={() => navigate("/upgrade")} className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600">
            <Sparkles className="w-4 h-4 mr-2" />
            Start a Plan
          </Button>
        </CardContent>
      </Card>
    );
  }

  const b = billing as BillingSubscription;

  const statusBadge = () => {
    if (b.status === "active" && !b.isTrial) {
      return <Badge className="bg-emerald-500 text-white">Active</Badge>;
    }
    if (b.isTrial) {
      return <Badge className="bg-amber-500 text-white">Trial</Badge>;
    }
    if (b.status === "past_due") {
      return <Badge variant="destructive">Payment Past Due</Badge>;
    }
    if (b.status === "canceled") {
      return <Badge variant="secondary">Canceled</Badge>;
    }
    return <Badge variant="secondary">{b.status}</Badge>;
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  const formatAmount = (cents: number | null, currency: string | null) => {
    if (cents == null || !currency) return "";
    const dollars = cents / 100;
    return `$${dollars.toFixed(2)} ${currency.toUpperCase()}`;
  };

  const cardBrandLogo = (brand: string) => {
    const b = brand.toLowerCase();
    if (b === "visa") {
      return (
        <svg width="38" height="24" viewBox="0 0 38 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block mr-2">
          <rect width="38" height="24" rx="4" fill="#1A1F71"/>
          <text x="7" y="17" fontSize="12" fill="#F7B600" fontFamily="Arial" fontWeight="bold">VISA</text>
        </svg>
      );
    }
    if (b === "mastercard") {
      return (
        <svg width="38" height="24" viewBox="0 0 38 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block mr-2">
          <rect width="38" height="24" rx="4" fill="#252525"/>
          <circle cx="15" cy="12" r="7" fill="#EB001B"/>
          <circle cx="23" cy="12" r="7" fill="#F79E1B"/>
          <path d="M19 6.8a7 7 0 0 1 0 10.4A7 7 0 0 1 19 6.8z" fill="#FF5F00"/>
        </svg>
      );
    }
    if (b === "amex" || b === "american express") {
      return (
        <svg width="38" height="24" viewBox="0 0 38 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block mr-2">
          <rect width="38" height="24" rx="4" fill="#2E77BC"/>
          <text x="5" y="17" fontSize="9" fill="white" fontFamily="Arial" fontWeight="bold">AMEX</text>
        </svg>
      );
    }
    return <CreditCard className="inline-block w-6 h-6 mr-2 text-muted-foreground" />;
  };

  const invoices: BillingInvoice[] = invoicesData?.invoices ?? [];

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-2xl font-bold">{b.planName || "Premium"}</p>
            {statusBadge()}
          </div>

          {b.isTrial && b.trialEndsAt && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Calendar className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm">
                Your trial ends on <strong>{formatDate(b.trialEndsAt)}</strong>.
                {b.amount != null && (
                  <> You will be charged <strong>{formatAmount(b.amount, b.currency)}</strong> on that date.</>
                )}
              </p>
            </div>
          )}

          {b.status === "past_due" && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-500">
                Your last payment failed. Please update your payment method.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Next Payment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Next Payment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {b.cancelAtPeriodEnd ? (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted border">
              <AlertTriangle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Your plan is canceled and expires on <strong>{formatDate(b.currentPeriodEnd)}</strong>.
              </p>
            </div>
          ) : b.status === "past_due" ? (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-500">
                Your last payment failed. Please update your payment method.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {b.amount != null && b.currency
                ? <><span className="text-foreground font-medium">{formatAmount(b.amount, b.currency)}</span> on <span className="text-foreground font-medium">{formatDate(b.currentPeriodEnd)}</span></>
                : formatDate(b.currentPeriodEnd)
              }
            </p>
          )}
        </CardContent>
      </Card>

      {/* Payment Method */}
      {b.paymentMethod && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Payment Method
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center">
              {cardBrandLogo(b.paymentMethod.brand)}
              <span className="text-sm">
                <span className="capitalize">{b.paymentMethod.brand}</span> ending in{" "}
                <strong>{b.paymentMethod.last4}</strong>, expires{" "}
                {String(b.paymentMethod.expiryMonth).padStart(2, "0")}/{b.paymentMethod.expiryYear}
              </span>
            </div>
            <Button
              variant="outline"
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
            >
              {portalMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Opening...</>
              ) : (
                <><ExternalLink className="w-4 h-4 mr-2" />Update Payment Method</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Manage Subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5" />
            Manage Subscription
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
            className="w-full"
          >
            {portalMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Opening...</>
            ) : (
              <><ExternalLink className="w-4 h-4 mr-2" />Manage Subscription</>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            You'll be redirected to our secure billing portal where you can upgrade, downgrade, cancel, or view invoice history.
          </p>
        </CardContent>
      </Card>

      {/* Invoice History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Invoice History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices found.</p>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv: BillingInvoice) => (
                <div key={inv.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="text-sm">
                    <p className="font-medium">{formatDate(inv.date)}</p>
                    <p className="text-muted-foreground">
                      {inv.amount != null ? formatAmount(inv.amount, inv.currency) : "—"} ·{" "}
                      <span className="capitalize">{inv.status}</span>
                    </p>
                  </div>
                  {inv.pdfUrl && (
                    <a
                      href={inv.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" /> PDF
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface SettingsProps {
  onLogout: () => void;
}

export default function Settings({ onLogout }: SettingsProps) {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 2FA modal state
  const [mfaModalOpen, setMfaModalOpen] = useState(false);
  const [mfaModalStep, setMfaModalStep] = useState<MfaModalStep>("qr");
  const [mfaSetupData, setMfaSetupData] = useState<{ qrCode: string; secret: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disableMfaModalOpen, setDisableMfaModalOpen] = useState(false);

  // Delete account multi-step state
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2 | 3>(0);
  const [deleteEmailInput, setDeleteEmailInput] = useState("");
  const [deletePasswordInput, setDeletePasswordInput] = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);

  // Password visibility toggles for change-password form
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);

  // Avatar state
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  // Birthday separate state (month, day, year)
  const [bdMonth, setBdMonth] = useState("");
  const [bdDay, setBdDay] = useState("");
  const [bdYear, setBdYear] = useState("");

  // Timezone search
  const [tzSearch, setTzSearch] = useState("");

  const mfaForm = useForm<MfaCodeFormData>({
    resolver: zodResolver(mfaCodeSchema),
    defaultValues: { code: "" },
  });

  const disableMfaForm = useForm<MfaCodeFormData>({
    resolver: zodResolver(mfaCodeSchema),
    defaultValues: { code: "" },
  });

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: "", lastName: "", email: "", phone: "", country: "US",
      displayName: "", birthday: "", timezone: "America/Toronto",
    },
  });

  const changePasswordForm = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["/api/auth/session"],
  });

  const { data: mfaStatus, refetch: refetchMfaStatus } = useQuery({
    queryKey: ["/api/auth/2fa/status"],
  });

  const { data: subscriptionData, isLoading: subscriptionLoading } = useQuery({
    queryKey: ["/api/stripe/subscription"],
  });

  const billingPortalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe/create-portal-session");
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.url) window.open(data.url, "_blank");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (session && (session as any).authenticated) {
      const s = session as any;
      // Parse birthday into parts
      if (s.birthday) {
        const parts = s.birthday.split("-");
        if (parts.length === 3) {
          setBdYear(parts[0]);
          setBdMonth(parts[1]);
          setBdDay(parts[2]);
        }
      }
      profileForm.reset({
        firstName: s.firstName || "",
        lastName: s.lastName || "",
        email: s.email || "",
        phone: s.phone || "",
        country: s.country || "US",
        displayName: s.displayName || "",
        birthday: s.birthday || "",
        timezone: s.timezone || "America/Toronto",
      });
      if (s.avatarUrl) setAvatarPreview(s.avatarUrl);
    }
  }, [session]);

  // Build birthday string whenever parts change
  useEffect(() => {
    if (bdYear && bdMonth && bdDay) {
      profileForm.setValue("birthday", `${bdYear}-${bdMonth}-${bdDay}`);
    } else {
      profileForm.setValue("birthday", "");
    }
  }, [bdYear, bdMonth, bdDay]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const response = await apiRequest("PATCH", "/api/auth/profile", {
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        email: data.email || null,
        phone: data.phone || null,
        country: data.country || null,
        displayName: data.displayName || null,
        birthday: data.birthday || null,
        timezone: data.timezone || null,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Profile Saved", description: "Your profile has been updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
    },
    onError: (error: Error) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("avatar", file);
      const response = await fetch("/api/user/avatar", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Upload failed");
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      setAvatarPreview(data.avatarUrl);
      setAvatarFile(null);
      toast({ title: "Photo Saved", description: "Your profile photo has been updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
    },
    onError: (error: Error) => {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    },
  });

  const removeAvatarMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/user/avatar");
      return response.json();
    },
    onSuccess: () => {
      setAvatarPreview(null);
      setAvatarFile(null);
      toast({ title: "Photo Removed", description: "Your profile photo has been removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
    },
    onError: (error: Error) => {
      toast({ title: "Remove Failed", description: error.message, variant: "destructive" });
    },
  });

  const setupMfaMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/auth/mfa/setup");
      return response.json();
    },
    onSuccess: (data: any) => {
      setMfaSetupData({ qrCode: data.qrCode, secret: data.manualEntryKey || data.secret });
      setMfaModalStep("qr");
      setMfaModalOpen(true);
    },
    onError: (error: Error) => {
      toast({ title: "Setup Failed", description: error.message, variant: "destructive" });
    },
  });

  const enableMfaMutation = useMutation({
    mutationFn: async (data: MfaCodeFormData) => {
      const response = await apiRequest("POST", "/api/auth/mfa/enable", { code: data.code });
      return response.json();
    },
    onSuccess: (data: any) => {
      setBackupCodes(data.backupCodes || []);
      setMfaModalStep("backup");
      mfaForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
      refetchMfaStatus();
    },
    onError: (error: Error) => {
      toast({ title: "Invalid Code", description: error.message, variant: "destructive" });
    },
  });

  const disableMfaMutation = useMutation({
    mutationFn: async (data: MfaCodeFormData) => {
      const response = await apiRequest("POST", "/api/auth/mfa/disable", { code: data.code });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "2FA Disabled", description: "Two-factor authentication has been removed" });
      disableMfaForm.reset();
      setDisableMfaModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
      refetchMfaStatus();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Disable 2FA", description: error.message, variant: "destructive" });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/logout");
      return response.json();
    },
    onSuccess: () => {
      queryClient.clear();
      toast({ title: "Logged Out", description: "You have been logged out successfully" });
      onLogout();
      navigate("/");
    },
    onError: (error: Error) => {
      toast({ title: "Logout Failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/auth/account");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Account Deleted", description: "Your account and all associated data have been permanently deleted" });
      onLogout();
      navigate("/");
    },
    onError: (error: Error) => {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: ChangePasswordFormData) => {
      const response = await apiRequest("POST", "/api/auth/change-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        confirmPassword: data.confirmPassword,
      });
      return response.json();
    },
    onSuccess: () => {
      changePasswordForm.reset();
      setPasswordChangeSuccess(true);
      setTimeout(() => setPasswordChangeSuccess(false), 5000);
      toast({ title: "Password Updated", description: "Your password has been changed successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Password Change Failed", description: error.message, variant: "destructive" });
    },
  });

  const { data: prefsData } = useQuery<{ prefNeedsReview: boolean; prefEditPending: boolean; prefMerchantDisplay: string }>({
    queryKey: ["/api/user/preferences"],
  });

  const [prefNeedsReview, setPrefNeedsReview] = useState<boolean>(true);
  const [prefEditPending, setPrefEditPending] = useState<boolean>(false);
  const [prefMerchantDisplay, setPrefMerchantDisplay] = useState<string>("enriched");

  useEffect(() => {
    if (prefsData) {
      setPrefNeedsReview(prefsData.prefNeedsReview);
      setPrefEditPending(prefsData.prefEditPending);
      setPrefMerchantDisplay(prefsData.prefMerchantDisplay);
    }
  }, [prefsData]);

  const updatePrefMutation = useMutation({
    mutationFn: async (updates: { prefNeedsReview?: boolean; prefEditPending?: boolean; prefMerchantDisplay?: string }) => {
      const response = await apiRequest("PATCH", "/api/user/preferences", updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/preferences"] });
      toast({ title: "Preferences Saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save preferences", description: error.message, variant: "destructive" });
    },
  });

  const handleDownloadBackupCodes = () => {
    const content = [
      "BudgetSmart 2FA Backup Codes", "============================",
      "Keep these codes safe. Each code can only be used once.", "",
      ...backupCodes.map((c, i) => `${i + 1}. ${c}`), "",
      `Generated: ${new Date().toLocaleString()}`,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "budgetsmart-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setAvatarFile(file);
  };

  const mfaEnabled = (mfaStatus as any)?.enabled ?? (session as any)?.mfaEnabled ?? false;
  const sessionData = session as any;
  const isGoogleUser = !!(sessionData?.isGoogleUser);
  const emailVerified = !!(sessionData?.emailVerified);

  // Initials and color for avatar fallback
  const firstName = sessionData?.firstName || "";
  const lastName = sessionData?.lastName || "";
  const initials = firstName && lastName
    ? `${firstName[0]}${lastName[0]}`.toUpperCase()
    : (firstName || sessionData?.username || "?")[0]?.toUpperCase() || "?";
  const avatarColor = getInitialColor(firstName || sessionData?.username || "");

  // Password strength for change-password form
  const watchNewPw = changePasswordForm.watch("newPassword") || "";
  const pwStrength = getPasswordStrength(watchNewPw);

  // Current local time for timezone display
  const watchTz = profileForm.watch("timezone") || "America/Toronto";
  const [localTime, setLocalTime] = useState("");
  useEffect(() => {
    const tick = () => {
      try {
        setLocalTime(new Intl.DateTimeFormat("en-US", {
          timeZone: watchTz,
          hour: "numeric", minute: "2-digit", second: "2-digit",
          hour12: true, weekday: "short",
        }).format(new Date()));
      } catch { setLocalTime(""); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [watchTz]);

  // Current year for birthday year range
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 120 }, (_, i) => String(currentYear - i));
  const daysInMonth = getDaysInMonth(bdMonth, bdYear);
  const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, "0"));

  const filteredTimezones = TIMEZONES.filter((tz) =>
    tz.toLowerCase().replace(/_/g, " ").includes(tzSearch.toLowerCase())
  );

  // Convenience: user email for delete confirmation
  const userEmail = sessionData?.email || "";

  // Determine active settings tab from URL path (e.g. /settings/profile → "profile")
  const activeTab = location.split("/")[2] || "profile";

  return (
    <>
    <SettingsLayout activeTab={activeTab}>

      {/* ── Profile Tab ── */}
      {activeTab === "profile" && (<>

      {/* ── Profile Information Card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile Information
          </CardTitle>
          <CardDescription>Update your personal information and how BudgetSmart addresses you</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {sessionLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <>
              {/* ── Avatar Section ── */}
              <div className="flex flex-col items-center gap-3">
                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <div className={`w-24 h-24 rounded-full overflow-hidden flex items-center justify-center text-white text-2xl font-bold shadow-lg ${!avatarPreview ? avatarColor : ""}`}>
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>
                  <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                    <Camera className="w-5 h-5 text-white" />
                    <span className="text-white text-xs font-medium">Change photo</span>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="flex gap-2">
                  {avatarFile && (
                    <Button
                      size="sm"
                      onClick={() => uploadAvatarMutation.mutate(avatarFile)}
                      disabled={uploadAvatarMutation.isPending}
                      data-testid="button-save-photo"
                    >
                      {uploadAvatarMutation.isPending ? (
                        <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Saving...</>
                      ) : (
                        <><Camera className="w-3 h-3 mr-1" />Save Photo</>
                      )}
                    </Button>
                  )}
                  {(avatarPreview && !avatarFile) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => removeAvatarMutation.mutate()}
                      disabled={removeAvatarMutation.isPending}
                      data-testid="button-remove-photo"
                    >
                      {removeAvatarMutation.isPending ? (
                        <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Removing...</>
                      ) : (
                        "Remove Photo"
                      )}
                    </Button>
                  )}
                  {!avatarPreview && !avatarFile && (
                    <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <Camera className="w-3 h-3 mr-1" />Upload Photo
                    </Button>
                  )}
                </div>
              </div>

              {/* ── Profile Form ── */}
              <Form {...profileForm}>
                <form onSubmit={profileForm.handleSubmit((data) => updateProfileMutation.mutate(data))} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={profileForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="John" data-testid="input-first-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={profileForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Doe" data-testid="input-last-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={profileForm.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                          Display Name
                        </FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Johnny" data-testid="input-display-name" />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">We'll address you by this name in the app and emails</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={profileForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" placeholder="john@example.com" data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={profileForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input {...field} type="tel" placeholder="+1 (555) 123-4567" data-testid="input-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={profileForm.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "US"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-country">
                              <SelectValue placeholder="Select your country" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {COUNTRIES.map((country) => (
                              <SelectItem key={country.code} value={country.code}>
                                {country.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Birthday */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Cake className="w-3.5 h-3.5 text-pink-500" />
                      Birthday
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <Select value={bdMonth} onValueChange={setBdMonth}>
                        <SelectTrigger data-testid="select-bd-month">
                          <SelectValue placeholder="Month" />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={bdDay} onValueChange={setBdDay}>
                        <SelectTrigger data-testid="select-bd-day">
                          <SelectValue placeholder="Day" />
                        </SelectTrigger>
                        <SelectContent>
                          {days.map((d) => (
                            <SelectItem key={d} value={d}>{parseInt(d)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={bdYear} onValueChange={setBdYear}>
                        <SelectTrigger data-testid="select-bd-year">
                          <SelectValue placeholder="Year" />
                        </SelectTrigger>
                        <SelectContent>
                          {years.map((y) => (
                            <SelectItem key={y} value={y}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">Helps us personalize your experience</p>
                  </div>

                  {/* Timezone */}
                  <FormField
                    control={profileForm.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5 text-blue-500" />
                          Timezone
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "America/Toronto"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-timezone">
                              <SelectValue placeholder="Select timezone" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <div className="p-2">
                              <input
                                className="w-full px-2 py-1 text-sm border rounded mb-1 bg-background"
                                placeholder="Search timezones..."
                                value={tzSearch}
                                onChange={(e) => setTzSearch(e.target.value)}
                              />
                            </div>
                            {filteredTimezones.map((tz) => (
                              <SelectItem key={tz} value={tz}>
                                {getTimezoneLabel(tz)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {localTime && (
                          <p className="text-xs text-muted-foreground">
                            Current local time: <span className="font-medium text-foreground">{localTime}</span>
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    disabled={updateProfileMutation.isPending}
                    data-testid="button-save-profile"
                  >
                    {updateProfileMutation.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" />Save Changes</>
                    )}
                  </Button>
                </form>
              </Form>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Account Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Username</p>
              <p className="text-sm text-muted-foreground" data-testid="text-username">
                {sessionData?.username || "Loading..."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Subscription & Billing
          </CardTitle>
          <CardDescription>Manage your subscription and billing information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscriptionLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (subscriptionData as any)?.hasSubscription ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Plan</p>
                  <p className="text-sm text-muted-foreground">
                    {(subscriptionData as any)?.plan?.name || "Premium"}
                  </p>
                </div>
                <Badge
                  variant={(subscriptionData as any)?.status === "active" ? "default" : "secondary"}
                  className={(subscriptionData as any)?.status === "trialing" ? "bg-amber-500" : ""}
                >
                  {(subscriptionData as any)?.status === "trialing" && (
                    <Sparkles className="w-3 h-3 mr-1" />
                  )}
                  {(subscriptionData as any)?.status === "trialing"
                    ? "Trial"
                    : (subscriptionData as any)?.status === "active"
                    ? "Active"
                    : (subscriptionData as any)?.status}
                </Badge>
              </div>

              {(subscriptionData as any)?.status === "trialing" && (subscriptionData as any)?.trialEndsAt && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <Calendar className="w-4 h-4 text-amber-500" />
                  <span className="text-sm">
                    Trial ends on{" "}
                    {new Date((subscriptionData as any)?.trialEndsAt).toLocaleDateString("en-US", {
                      month: "long", day: "numeric", year: "numeric",
                    })}
                  </span>
                </div>
              )}

              {(subscriptionData as any)?.subscriptionEndsAt && (subscriptionData as any)?.status !== "trialing" && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Next billing date</span>
                  <span>
                    {new Date((subscriptionData as any)?.subscriptionEndsAt).toLocaleDateString("en-US", {
                      month: "long", day: "numeric", year: "numeric",
                    })}
                  </span>
                </div>
              )}

              <Button
                variant="outline"
                onClick={() => billingPortalMutation.mutate()}
                disabled={billingPortalMutation.isPending}
                className="w-full"
              >
                {billingPortalMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Opening...</>
                ) : (
                  <><ExternalLink className="w-4 h-4 mr-2" />Manage Subscription</>
                )}
              </Button>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground mb-4">No active subscription</p>
              <Button
                onClick={() => navigate("/upgrade")}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                View Plans
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <PWAInstallCard />
      </>)}

      {/* ── Security Tab ── */}
      {activeTab === "security" && (<>

      {/* ── Security Card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Security
          </CardTitle>
          <CardDescription>Manage your sign-in method, password, and account protection</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Section A — Email & Sign-In Method */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email &amp; Sign-In Method
            </h3>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/40">
              <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{userEmail || "No email on file"}</p>
              </div>
              {emailVerified ? (
                <Badge variant="default" className="bg-green-600 flex-shrink-0">
                  <Check className="w-3 h-3 mr-1" />
                  Verified
                </Badge>
              ) : (
                <Badge variant="secondary" className="flex-shrink-0">Unverified</Badge>
              )}
            </div>

            {isGoogleUser ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
                  {/* Google colored logo */}
                  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 48 48" aria-label="Google">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  <div>
                    <p className="text-sm font-medium">Connected with Google</p>
                    <p className="text-xs text-muted-foreground">Your password is managed by Google.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    To change your password, visit your{" "}
                    <a
                      href="https://myaccount.google.com/security"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium"
                    >
                      Google Account settings
                    </a>.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Change Password
                </h4>
                {passwordChangeSuccess && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <p className="text-sm text-green-700 dark:text-green-400 font-medium">Password updated successfully!</p>
                  </div>
                )}
                <Form {...changePasswordForm}>
                  <form
                    onSubmit={changePasswordForm.handleSubmit((data) => changePasswordMutation.mutate(data))}
                    className="space-y-4"
                  >
                    <FormField
                      control={changePasswordForm.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                {...field}
                                type={showCurrentPw ? "text" : "password"}
                                placeholder="Enter current password"
                                data-testid="input-current-password"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                                onClick={() => setShowCurrentPw(!showCurrentPw)}
                                tabIndex={-1}
                              >
                                {showCurrentPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={changePasswordForm.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                {...field}
                                type={showNewPw ? "text" : "password"}
                                placeholder="Enter new password"
                                data-testid="input-new-password"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                                onClick={() => setShowNewPw(!showNewPw)}
                                tabIndex={-1}
                              >
                                {showNewPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </FormControl>
                          {watchNewPw && (
                            <div className="space-y-1 mt-1">
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${pwStrength.color}`}
                                  style={{ width: `${pwStrength.percent}%` }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Strength: <span className="font-medium text-foreground">{pwStrength.label}</span>
                              </p>
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={changePasswordForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm New Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                {...field}
                                type={showConfirmPw ? "text" : "password"}
                                placeholder="Confirm new password"
                                data-testid="input-confirm-password"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                                onClick={() => setShowConfirmPw(!showConfirmPw)}
                                tabIndex={-1}
                              >
                                {showConfirmPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      disabled={changePasswordMutation.isPending}
                      data-testid="button-update-password"
                    >
                      {changePasswordMutation.isPending ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</>
                      ) : (
                        <><KeyRound className="w-4 h-4 mr-2" />Update Password</>
                      )}
                    </Button>
                  </form>
                </Form>
              </div>
            )}
          </div>

          <Separator />

          {/* Section B — Two-Factor Authentication */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Two-Factor Authentication
            </h3>
            <p className="text-xs text-muted-foreground">
              Add an extra layer of security using an authenticator app like Google Authenticator or Authy.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              {mfaEnabled ? (
                <Badge variant="default" className="bg-green-600">
                  <ShieldCheck className="w-3 h-3 mr-1" />
                  Enabled ✓
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <ShieldOff className="w-3 h-3 mr-1" />
                  Disabled
                </Badge>
              )}
            </div>
            {!mfaEnabled ? (
              <Button
                onClick={() => setupMfaMutation.mutate()}
                disabled={setupMfaMutation.isPending}
                data-testid="button-setup-mfa"
              >
                {setupMfaMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...</>
                ) : (
                  <><QrCode className="w-4 h-4 mr-2" />Enable 2FA</>
                )}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => setDisableMfaModalOpen(true)}
                data-testid="button-disable-mfa"
              >
                <ShieldOff className="w-4 h-4 mr-2" />
                Disable 2FA
              </Button>
            )}
          </div>

          <Separator />

          {/* Section D — Danger Zone */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Danger Zone
            </h3>
            <div className="rounded-lg border border-destructive/40 p-4 space-y-3">
              <div>
                <h4 className="font-semibold text-destructive">Delete Account</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Permanently delete your account and all associated data. This action cannot be undone.
                  You must cancel your subscription first.
                </p>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  You must cancel your subscription or trial before you can delete your account.
                </p>
              </div>
              <Button
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => setDeleteStep(1)}
                data-testid="button-delete-account"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete My Account
              </Button>
            </div>
          </div>

        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogOut className="w-5 h-5" />
            Session
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-logout"
          >
            {logoutMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Logging out...</>
            ) : (
              <><LogOut className="w-4 h-4 mr-2" />Log Out</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ── 2FA Setup Modal ── */}
      <Dialog open={mfaModalOpen} onOpenChange={(open) => {
        if (!open) { setMfaModalOpen(false); setMfaSetupData(null); mfaForm.reset(); }
      }}>
        <DialogContent className="sm:max-w-md">
          {mfaModalStep === "qr" && mfaSetupData && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <QrCode className="w-5 h-5" />
                  Step 1: Scan QR Code
                </DialogTitle>
                <DialogDescription>
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex justify-center">
                  <img
                    src={mfaSetupData.qrCode}
                    alt="2FA QR Code"
                    className="border rounded-lg bg-white p-2 w-48 h-48"
                    data-testid="img-mfa-qrcode"
                  />
                </div>
                <div className="p-3 rounded-lg bg-muted text-sm">
                  <p className="text-muted-foreground mb-1">Or enter this key manually:</p>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs break-all flex-1">{mfaSetupData.secret}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(mfaSetupData.secret);
                        toast({ title: "Copied", description: "Secret key copied to clipboard" });
                      }}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <Button className="w-full" onClick={() => setMfaModalStep("verify")}>Continue</Button>
              </div>
            </>
          )}

          {mfaModalStep === "verify" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Step 2: Verify Code
                </DialogTitle>
                <DialogDescription>
                  Enter the 6-digit code from your authenticator app to confirm setup.
                </DialogDescription>
              </DialogHeader>
              <Form {...mfaForm}>
                <form onSubmit={mfaForm.handleSubmit((data) => enableMfaMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={mfaForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>6-digit code</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="000000"
                            maxLength={6}
                            inputMode="numeric"
                            autoFocus
                            className="text-center text-2xl tracking-[0.5em] font-mono"
                            data-testid="input-mfa-setup-code"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setMfaModalStep("qr")} className="flex-1">Back</Button>
                    <Button type="submit" disabled={enableMfaMutation.isPending} className="flex-1" data-testid="button-enable-mfa">
                      {enableMfaMutation.isPending ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</>
                      ) : "Verify"}
                    </Button>
                  </div>
                </form>
              </Form>
            </>
          )}

          {mfaModalStep === "backup" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  2FA is now enabled!
                </DialogTitle>
                <DialogDescription>
                  Save these backup codes in a safe place. You will not see them again.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Save these codes in a safe place — they can recover your account if you lose access to your authenticator app. Each code can only be used once.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code) => (
                    <code key={code} className="text-center font-mono text-sm bg-muted rounded px-2 py-1">{code}</code>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleDownloadBackupCodes} className="flex-1">
                    <Download className="w-4 h-4 mr-2" />Download
                  </Button>
                  <Button onClick={() => { setMfaModalOpen(false); setMfaSetupData(null); setBackupCodes([]); }} className="flex-1">
                    Done
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Disable 2FA Modal ── */}
      <Dialog open={disableMfaModalOpen} onOpenChange={(open) => {
        if (!open) { setDisableMfaModalOpen(false); disableMfaForm.reset(); }
      }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldOff className="w-5 h-5" />
              Disable Two-Factor Authentication
            </DialogTitle>
            <DialogDescription>
              Enter your current 6-digit authenticator code to disable 2FA.
            </DialogDescription>
          </DialogHeader>
          <Form {...disableMfaForm}>
            <form onSubmit={disableMfaForm.handleSubmit((data) => disableMfaMutation.mutate(data))} className="space-y-4">
              <FormField
                control={disableMfaForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Authenticator code</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="000000"
                        maxLength={6}
                        inputMode="numeric"
                        autoFocus
                        className="text-center text-2xl tracking-[0.5em] font-mono"
                        data-testid="input-mfa-disable-code"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setDisableMfaModalOpen(false)} className="flex-1">Cancel</Button>
                <Button type="submit" variant="destructive" disabled={disableMfaMutation.isPending} className="flex-1">
                  {disableMfaMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Disabling...</>
                  ) : "Disable 2FA"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Account Multi-Step Dialog ── */}
      <Dialog
        open={deleteStep > 0}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteStep(0);
            setDeleteEmailInput("");
            setDeletePasswordInput("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {deleteStep === 1 && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Delete Account — Step 1 of 3
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-3 text-sm">
                    <p>The following will be permanently deleted:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>All bank account connections and transaction history</li>
                      <li>Bills, expenses, and income records</li>
                      <li>Budgets, savings goals, and financial reports</li>
                      <li>Categories and reconciliation rules</li>
                      <li>All personal and profile information</li>
                      <li>documents uploaded to your vault</li>
                    </ul>
                    <p className="font-semibold text-destructive">This action cannot be undone.</p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 mt-2">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteStep(0)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => setDeleteStep(2)}
                  data-testid="button-delete-step1-next"
                >
                  I Understand, Continue
                </Button>
              </div>
            </>
          )}

          {deleteStep === 2 && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Delete Account — Step 2 of 3
                </DialogTitle>
                <DialogDescription>
                  To confirm, type your email address <strong>{userEmail}</strong> below.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <Input
                  placeholder={userEmail || "your@email.com"}
                  value={deleteEmailInput}
                  onChange={(e) => setDeleteEmailInput(e.target.value)}
                  data-testid="input-delete-confirm-email"
                />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setDeleteStep(1)}>
                    Back
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    disabled={deleteEmailInput.trim().toLowerCase() !== userEmail.trim().toLowerCase()}
                    onClick={() => setDeleteStep(3)}
                    data-testid="button-delete-step2-next"
                  >
                    Continue
                  </Button>
                </div>
              </div>
            </>
          )}

          {deleteStep === 3 && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Delete Account — Step 3 of 3
                </DialogTitle>
                <DialogDescription>
                  {isGoogleUser
                    ? "Re-authenticate with Google to authorize account deletion."
                    : "Enter your password to authorize account deletion."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                {!isGoogleUser && (
                  <div className="relative">
                    <Input
                      type={showDeletePassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={deletePasswordInput}
                      onChange={(e) => setDeletePasswordInput(e.target.value)}
                      data-testid="input-delete-confirm-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                      onClick={() => setShowDeletePassword(!showDeletePassword)}
                      tabIndex={-1}
                    >
                      {showDeletePassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setDeleteStep(2)}>
                    Back
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    disabled={(!isGoogleUser && !deletePasswordInput) || deleteAccountMutation.isPending}
                    onClick={() => deleteAccountMutation.mutate()}
                    data-testid="button-confirm-delete"
                  >
                    {deleteAccountMutation.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>
                    ) : (
                      <><Trash2 className="w-4 h-4 mr-2" />Permanently Delete Account</>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      </>)}

      {/* ── Household Tab ── */}
      {activeTab === "household" && (
        <HouseholdSettings />
      )}

      {/* ── Preferences Tab ── */}
      {activeTab === "preferences" && (<>

      {/* ── Appearance / Theme Picker ── */}
      <Card>
        <CardContent className="pt-6">
          <ThemePicker />
        </CardContent>
      </Card>

      {/* ── Preferences Card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5" />
            Preferences
          </CardTitle>
          <CardDescription>Customize how BudgetSmart handles your transactions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Toggle 1 — Needs Review */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Mark uncategorized transactions as Needs Review</Label>
              <p className="text-xs text-muted-foreground">
                Any new uncategorized synced transaction will be flagged. They'll appear in the Needs Review filter on your transactions page.
              </p>
            </div>
            <Switch
              checked={prefNeedsReview}
              onCheckedChange={(val) => {
                setPrefNeedsReview(val);
                updatePrefMutation.mutate({ prefNeedsReview: val });
              }}
            />
          </div>

          <Separator />

          {/* Toggle 2 — Edit Pending */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Allow edits to pending transactions</Label>
              <p className="text-xs text-muted-foreground">
                When on, pending transactions are editable and included in reports. Note: if the amount changes when it posts, your edits may be lost.
              </p>
            </div>
            <Switch
              checked={prefEditPending}
              onCheckedChange={(val) => {
                setPrefEditPending(val);
                updatePrefMutation.mutate({ prefEditPending: val });
              }}
            />
          </div>

          <Separator />

          {/* Toggle 3 — Merchant Display */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Show merchant display names</Label>
            <RadioGroup
              value={prefMerchantDisplay}
              onValueChange={(val) => {
                setPrefMerchantDisplay(val);
                updatePrefMutation.mutate({ prefMerchantDisplay: val });
              }}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="enriched" id="pref-enriched" />
                <Label htmlFor="pref-enriched" className="text-sm font-normal cursor-pointer">
                  Clean names <span className="text-muted-foreground">(e.g. Netflix, Starbucks)</span>
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="raw" id="pref-raw" />
                <Label htmlFor="pref-raw" className="text-sm font-normal cursor-pointer">
                  Raw bank descriptions <span className="text-muted-foreground">(e.g. NFLX*SUBSCRIPTION CA)</span>
                </Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      </>)}

      {/* ── Accounts Tab ── */}
      {activeTab === "accounts" && <AccountsTab />}

      {/* ── Categories Tab ── */}
      {activeTab === "categories" && <CategoriesTab />}

      {/* ── Merchants Tab ── */}
      {activeTab === "merchants" && <MerchantsPage />}

      {/* ── Data Tab ── */}
      {activeTab === "data" && <DataTab />}

      {/* ── Privacy Tab ── */}
      {activeTab === "privacy" && <PrivacyTab onLogout={onLogout} />}

      {/* ── Billing Tab ── */}
      {activeTab === "billing" && <BillingTab />}

      {/* ── Notifications Tab ── */}
      {activeTab === "notifications" && <EmailSettings />}

    </SettingsLayout>
    </>
  );
}
