/**
 * Admin Communications Hub
 * /admin/communications
 *
 * Tab 1 – Email Log      : every email ever sent, filterable, CSV export
 * Tab 2 – Templates      : template list with send counts
 * Tab 3 – Broadcast      : send one-off email to user segments
 * Tab 4 – Email Health   : delivery / bounce / open stats from Postmark + local DB
 * Tab 5 – System Alerts  : create / manage in-app push notification banners
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Mail,
  Download,
  Send,
  RefreshCw,
  Plus,
  Trash2,
  Activity,
  AlertTriangle,
  CheckCircle,
  Info,
  AlertCircle,
  Users,
  BarChart3,
  FileText,
  Bell,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailLogEntry {
  id: string;
  userId?: string | null;
  recipientEmail: string;
  subject: string;
  type: string;
  status: string;
  postmarkMessageId?: string | null;
  sentAt: string;
  openedAt?: string | null;
  bouncedAt?: string | null;
}

interface EmailLogResponse {
  data: EmailLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

interface EmailTemplate {
  key: string;
  name: string;
  subject: string;
  description: string;
  totalSent: number;
  lastSentAt?: string | null;
}

interface BroadcastPreview {
  count: number;
  segment: string;
}

interface Broadcast {
  id: string;
  subject: string;
  message: string;
  recipientSegment: string;
  status: string;
  sentAt?: string | null;
  totalRecipients: number;
  successCount: number;
  failCount: number;
  createdAt: string;
}

interface EmailHealth {
  local: {
    totalSent: number;
    totalFailed: number;
    totalBounced: number;
    totalOpened: number;
    last7Days: number;
    deliveryRate: number;
    openRate: number;
    bounceRate: number;
  };
  postmark?: {
    sent: number;
    bounced: number;
    opens: number;
    deliveryRate: number;
    bounceRate: number;
    openRate: number;
  } | null;
}

interface SystemAlert {
  id: string;
  type: "info" | "warning" | "critical" | "success";
  message: string;
  linkUrl?: string | null;
  linkText?: string | null;
  createdAt: string;
  expiresAt?: string | null;
  isActive: boolean;
  dismissedAt?: string | null;
  dismissalCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, string> = {
    sent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    bounced: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    opened: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

function alertTypeBadge(type: string) {
  const map: Record<string, { label: string; cls: string }> = {
    info: { label: "Info", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
    warning: { label: "Warning", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
    critical: { label: "Critical", cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
    success: { label: "Success", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" },
  };
  const v = map[type] ?? { label: type, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy HH:mm"); } catch { return d; }
}

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

// ─── Tab 1: Email Log ─────────────────────────────────────────────────────────

function EmailLogTab() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const params = new URLSearchParams({
    page: String(page),
    pageSize: "25",
    ...(typeFilter !== "all" && { type: typeFilter }),
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(search && { search }),
  });

  const { data, isLoading, refetch } = useQuery<EmailLogResponse>({
    queryKey: [`/api/admin/communications/email-log?${params}`],
  });

  const handleExport = () => {
    const exportParams = new URLSearchParams({
      ...(typeFilter !== "all" && { type: typeFilter }),
      ...(statusFilter !== "all" && { status: statusFilter }),
      ...(search && { search }),
    });
    window.open(`/api/admin/communications/email-log/export?${exportParams}`, "_blank");
  };

  const EMAIL_TYPES = [
    "welcome", "bill_reminder", "email_verification", "weekly_digest",
    "monthly_report", "broadcast", "household_invitation", "upgrade_confirmation",
    "spending_alert", "usage_milestone", "password_reset", "support_reply", "test",
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs mb-1 block">Search recipient / subject</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="email or subject…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
                  className="h-8 text-sm"
                />
                <Button size="sm" variant="secondary" onClick={() => { setSearch(searchInput); setPage(1); }}>
                  Search
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Type</Label>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-sm w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {EMAIL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-sm w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="bounced">Bounced</SelectItem>
                  <SelectItem value="opened">Opened</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Email Log
            {data && <span className="ml-2 text-sm font-normal text-muted-foreground">({data.total.toLocaleString()} total)</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead>Opened</TableHead>
                  <TableHead>Postmark ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : !data?.data.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No emails found
                    </TableCell>
                  </TableRow>
                ) : (
                  data.data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm font-mono">{row.recipientEmail}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{row.subject}</TableCell>
                      <TableCell>
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {row.type.replace(/_/g, " ")}
                        </span>
                      </TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(row.sentAt)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(row.openedAt)}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground truncate max-w-[120px]">
                        {row.postmarkMessageId ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {/* Pagination */}
          {data && data.total > data.pageSize && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-xs text-muted-foreground">
                Page {data.page} of {Math.ceil(data.total / data.pageSize)}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= Math.ceil(data.total / data.pageSize)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 2: Templates ─────────────────────────────────────────────────────────

function TemplatesTab() {
  const { data: templates = [], isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/admin/communications/templates"],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Email Templates</CardTitle>
        <CardDescription>All transactional email templates used by the system.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Total Sent</TableHead>
              <TableHead>Last Sent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : templates.map((t) => (
              <TableRow key={t.key}>
                <TableCell>
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{t.key}</div>
                </TableCell>
                <TableCell className="text-sm">{t.subject}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{t.description}</TableCell>
                <TableCell className="text-right font-mono text-sm">{t.totalSent.toLocaleString()}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(t.lastSentAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── Tab 3: Broadcast ─────────────────────────────────────────────────────────

function BroadcastTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [segment, setSegment] = useState("all");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: preview } = useQuery<BroadcastPreview>({
    queryKey: [`/api/admin/communications/broadcasts/preview?segment=${segment}`],
    enabled: !!segment,
  });

  const { data: broadcasts = [], isLoading: broadcastsLoading } = useQuery<Broadcast[]>({
    queryKey: ["/api/admin/communications/broadcasts"],
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/communications/broadcasts/send", {
        subject,
        message,
        recipientSegment: segment,
      }),
    onSuccess: () => {
      toast({ title: "Broadcast sent!", description: `Email queued for ${preview?.count ?? 0} recipients.` });
      setSubject("");
      setMessage("");
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/admin/communications/broadcasts"] });
    },
    onError: (err: any) => {
      toast({ title: "Send failed", description: err?.message ?? "Unknown error", variant: "destructive" });
      setConfirmOpen(false);
    },
  });

  const canSend = subject.trim().length > 0 && message.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Compose */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compose Broadcast</CardTitle>
          <CardDescription>Send a one-off email to a segment of users.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Recipient Segment</Label>
              <Select value={segment} onValueChange={setSegment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="free">Free Plan</SelectItem>
                  <SelectItem value="pro">Pro Plan</SelectItem>
                  <SelectItem value="family">Family Plan</SelectItem>
                </SelectContent>
              </Select>
              {preview && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Users className="h-3 w-3" />
                  {preview.count.toLocaleString()} recipients with email addresses
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input
                placeholder="Email subject…"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea
              placeholder="Write your message here…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">{message.length} characters</p>
          </div>
          <div className="flex justify-end">
            <Button
              disabled={!canSend || sendMutation.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              <Send className="h-4 w-4 mr-2" />
              Send Broadcast
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Broadcast</DialogTitle>
            <DialogDescription>
              You are about to send <strong>"{subject}"</strong> to{" "}
              <strong>{preview?.count?.toLocaleString() ?? "?"} recipients</strong> ({segment} segment).
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? "Sending…" : "Confirm Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Past broadcasts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Past Broadcasts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Segment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Recipients</TableHead>
                <TableHead className="text-right">Success</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead>Sent At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcastsLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Loading…</TableCell>
                </TableRow>
              ) : !broadcasts.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No broadcasts yet</TableCell>
                </TableRow>
              ) : broadcasts.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="text-sm font-medium">{b.subject}</TableCell>
                  <TableCell>
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded capitalize">{b.recipientSegment}</span>
                  </TableCell>
                  <TableCell>{statusBadge(b.status)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{b.totalRecipients}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-emerald-600">{b.successCount}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-red-600">{b.failCount}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(b.sentAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 4: Email Health ──────────────────────────────────────────────────────

function EmailHealthTab() {
  const { data: health, isLoading, refetch } = useQuery<EmailHealth>({
    queryKey: ["/api/admin/communications/email-health"],
    refetchInterval: 60_000,
  });

  const StatCard = ({
    label,
    value,
    sub,
    color,
  }: {
    label: string;
    value: string | number;
    sub?: string;
    color?: string;
  }) => (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${color ?? ""}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading health data…
      </div>
    );
  }

  const local = health?.local;
  const pm = health?.postmark;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {/* Local DB stats */}
      <div>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
          Local Database Stats
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Sent (all time)" value={local?.totalSent.toLocaleString() ?? "—"} />
          <StatCard label="Last 7 Days" value={local?.last7Days.toLocaleString() ?? "—"} />
          <StatCard
            label="Delivery Rate"
            value={local ? pct(local.deliveryRate) : "—"}
            color={local && local.deliveryRate >= 95 ? "text-emerald-600" : "text-amber-600"}
          />
          <StatCard
            label="Bounce Rate"
            value={local ? pct(local.bounceRate) : "—"}
            color={local && local.bounceRate <= 2 ? "text-emerald-600" : "text-red-600"}
          />
          <StatCard label="Open Rate" value={local ? pct(local.openRate) : "—"} />
          <StatCard label="Total Bounced" value={local?.totalBounced.toLocaleString() ?? "—"} color="text-orange-600" />
          <StatCard label="Total Failed" value={local?.totalFailed.toLocaleString() ?? "—"} color="text-red-600" />
          <StatCard label="Total Opened" value={local?.totalOpened.toLocaleString() ?? "—"} color="text-blue-600" />
        </div>
      </div>

      {/* Postmark stats */}
      {pm ? (
        <div>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            Postmark API Stats (Last 30 Days)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Sent" value={pm.sent.toLocaleString()} />
            <StatCard
              label="Delivery Rate"
              value={pct(pm.deliveryRate)}
              color={pm.deliveryRate >= 95 ? "text-emerald-600" : "text-amber-600"}
            />
            <StatCard
              label="Bounce Rate"
              value={pct(pm.bounceRate)}
              color={pm.bounceRate <= 2 ? "text-emerald-600" : "text-red-600"}
            />
            <StatCard label="Open Rate" value={pct(pm.openRate)} />
            <StatCard label="Bounced" value={pm.bounced.toLocaleString()} color="text-orange-600" />
            <StatCard label="Opens" value={pm.opens.toLocaleString()} color="text-blue-600" />
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="pt-4 pb-4 text-sm text-muted-foreground">
            Postmark API stats unavailable — POSTMARK_USERNAME not configured or API call failed.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 5: System Alerts ─────────────────────────────────────────────────────

function SystemAlertsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [newMessage, setNewMessage] = useState("");
  const [newType, setNewType] = useState<"info" | "warning" | "critical" | "success">("info");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkText, setNewLinkText] = useState("");
  const [newExpiresHours, setNewExpiresHours] = useState("");

  const { data: alerts = [], isLoading, refetch } = useQuery<SystemAlert[]>({
    queryKey: ["/api/admin/communications/system-alerts"],
    refetchInterval: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/communications/system-alerts", {
        type: newType,
        message: newMessage.trim(),
        linkUrl: newLinkUrl.trim() || null,
        linkText: newLinkText.trim() || null,
        expiresInHours: newExpiresHours ? parseInt(newExpiresHours, 10) : null,
      }),
    onSuccess: () => {
      toast({ title: "Alert created", description: "System alert is now live." });
      setNewMessage("");
      setNewLinkUrl("");
      setNewLinkText("");
      setNewExpiresHours("");
      qc.invalidateQueries({ queryKey: ["/api/admin/communications/system-alerts"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/communications/active-alerts"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create alert", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/admin/communications/system-alerts/${id}`),
    onSuccess: () => {
      toast({ title: "Alert deactivated" });
      qc.invalidateQueries({ queryKey: ["/api/admin/communications/system-alerts"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/communications/active-alerts"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to deactivate", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const activeAlerts = alerts.filter((a) => a.isActive);
  const historyAlerts = alerts.filter((a) => !a.isActive);

  const AlertTypeIcon = ({ type }: { type: string }) => {
    if (type === "critical") return <AlertCircle className="h-4 w-4 text-red-500" />;
    if (type === "warning") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    if (type === "success") return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    return <Info className="h-4 w-4 text-blue-500" />;
  };

  return (
    <div className="space-y-6">
      {/* Create new alert */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create System Alert</CardTitle>
          <CardDescription>
            Alerts appear as banners at the top of the app for all logged-in users.
            Critical alerts cannot be dismissed by users.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Alert Type</Label>
              <Select value={newType} onValueChange={(v) => setNewType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">ℹ️ Info (blue, dismissible)</SelectItem>
                  <SelectItem value="warning">⚠️ Warning (amber, dismissible)</SelectItem>
                  <SelectItem value="critical">🚨 Critical (red, cannot dismiss)</SelectItem>
                  <SelectItem value="success">✅ Success (green, dismissible)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Link URL (optional)</Label>
              <Input
                placeholder="https://…"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Link Text (optional)</Label>
              <Input
                placeholder="Learn more"
                value={newLinkText}
                onChange={(e) => setNewLinkText(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2 space-y-1.5">
              <Label>
                Message <span className="text-muted-foreground text-xs">(max 200 chars)</span>
              </Label>
              <Input
                placeholder="Alert message shown to all users…"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value.slice(0, 200))}
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">{newMessage.length}/200</p>
            </div>
            <div className="space-y-1.5">
              <Label>Auto-expire after (hours, optional)</Label>
              <Input
                type="number"
                placeholder="e.g. 24"
                value={newExpiresHours}
                onChange={(e) => setNewExpiresHours(e.target.value)}
                min={1}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              disabled={!newMessage.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              <Plus className="h-4 w-4 mr-2" />
              {createMutation.isPending ? "Creating…" : "Create Alert"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active alerts */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Active Alerts
              {activeAlerts.length > 0 && (
                <Badge className="ml-2 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                  {activeAlerts.length}
                </Badge>
              )}
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
          ) : !activeAlerts.length ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No active alerts</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead className="text-right">Dismissals</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeAlerts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <AlertTypeIcon type={a.type} />
                        {alertTypeBadge(a.type)}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm max-w-[280px]">{a.message}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.linkUrl ? (
                        <a href={a.linkUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {a.linkText || a.linkUrl}
                        </a>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{a.dismissalCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(a.createdAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(a.expiresAt)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => deactivateMutation.mutate(a.id)}
                        disabled={deactivateMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* History */}
      {historyAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Alert History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="text-right">Dismissals</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Deactivated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyAlerts.slice(0, 20).map((a) => (
                  <TableRow key={a.id} className="opacity-60">
                    <TableCell>{alertTypeBadge(a.type)}</TableCell>
                    <TableCell className="text-sm">{a.message}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{a.dismissalCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(a.createdAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(a.dismissedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminCommunications() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Communications Hub</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage email logs, templates, broadcasts, delivery health, and system alerts.
        </p>
      </div>

      <Tabs defaultValue="log">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="log" className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Email Log
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" /> Templates
          </TabsTrigger>
          <TabsTrigger value="broadcast" className="flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5" /> Broadcast
          </TabsTrigger>
          <TabsTrigger value="health" className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Email Health
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" /> System Alerts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="log" className="mt-4">
          <EmailLogTab />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="broadcast" className="mt-4">
          <BroadcastTab />
        </TabsContent>
        <TabsContent value="health" className="mt-4">
          <EmailHealthTab />
        </TabsContent>
        <TabsContent value="alerts" className="mt-4">
          <SystemAlertsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
