import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Shield, Download, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { format, subDays } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditRow {
  id: string;
  event_type: string;
  event_category: string;
  actor_id: string | null;
  actor_type: string | null;
  actor_ip: string | null;
  actor_user_agent: string | null;
  target_type: string | null;
  target_id: string | null;
  target_user_id: string | null;
  action: string;
  outcome: string;
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  session_id: string | null;
  created_at: string;
}

interface AuditLogResponse {
  rows: AuditRow[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Event type options ───────────────────────────────────────────────────────

const EVENT_TYPES = [
  "auth.login",
  "auth.login_failed",
  "auth.logout",
  "auth.password_change",
  "auth.account_locked",
  "user.created",
  "user.deleted",
  "user.role_changed",
  "data.bank_connected",
  "data.bank_disconnected",
  "data.bank_synced",
  "data.transactions_viewed",
  "data.export_requested",
  "data.account_deleted",
  "admin.user_viewed",
  "admin.settings_changed",
  "admin.data_accessed",
  "security.rate_limit_exceeded",
  "security.suspicious_activity",
  "billing.subscription_created",
  "billing.subscription_cancelled",
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function outcomeVariant(outcome: string): "default" | "destructive" | "secondary" | "outline" {
  if (outcome === "success") return "default";
  if (outcome === "failure") return "destructive";
  if (outcome === "blocked") return "secondary";
  return "outline";
}

function rowClass(outcome: string): string {
  if (outcome === "failure") return "bg-red-50 dark:bg-red-950/20";
  if (outcome === "blocked") return "bg-amber-50 dark:bg-amber-950/20";
  return "";
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildParams(
  from: string,
  to: string,
  eventType: string,
  outcome: string,
  actorId: string,
  targetUserId: string,
  offset: number,
): string {
  const p = new URLSearchParams();
  if (from) p.set("from", new Date(from).toISOString());
  if (to) p.set("to", new Date(to).toISOString());
  if (eventType && eventType !== "all") p.set("eventType", eventType);
  if (outcome && outcome !== "all") p.set("outcome", outcome);
  if (actorId.trim()) p.set("actorId", actorId.trim());
  if (targetUserId.trim()) p.set("targetUserId", targetUserId.trim());
  p.set("limit", "200");
  p.set("offset", String(offset));
  return p.toString();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminAuditLog() {
  const defaultTo = new Date();
  const defaultFrom = subDays(defaultTo, 7);

  const [from, setFrom] = useState(toDatetimeLocal(defaultFrom));
  const [to, setTo] = useState(toDatetimeLocal(defaultTo));
  const [eventType, setEventType] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [actorId, setActorId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [offset, setOffset] = useState(0);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const queryParams = useMemo(
    () => buildParams(from, to, eventType, outcome, actorId, targetUserId, offset),
    [from, to, eventType, outcome, actorId, targetUserId, offset],
  );

  const { data, isLoading, refetch } = useQuery<AuditLogResponse>({
    queryKey: ["/api/admin/audit-log", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/admin/audit-log?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportCsv() {
    const headers = [
      "id", "created_at", "event_type", "actor_id", "actor_ip",
      "target_user_id", "action", "outcome", "error_message",
    ];
    const esc = (v: string | null | undefined) => {
      const s = v ?? "";
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const csvRows = rows.map((r) =>
      [
        esc(r.id),
        esc(r.created_at),
        esc(r.event_type),
        esc(r.actor_id),
        esc(r.actor_ip),
        esc(r.target_user_id),
        esc(r.action),
        esc(r.outcome),
        esc(r.error_message),
      ].join(","),
    );
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Audit Log</h1>
            <p className="text-sm text-muted-foreground">SOC 2 compliance event trail — 2-year retention</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">From</label>
              <Input
                type="datetime-local"
                value={from}
                onChange={(e) => { setFrom(e.target.value); setOffset(0); }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">To</label>
              <Input
                type="datetime-local"
                value={to}
                onChange={(e) => { setTo(e.target.value); setOffset(0); }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Event Type</label>
              <Select value={eventType} onValueChange={(v) => { setEventType(v); setOffset(0); }}>
                <SelectTrigger>
                  <SelectValue placeholder="All events" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Outcome</label>
              <Select value={outcome} onValueChange={(v) => { setOutcome(v); setOffset(0); }}>
                <SelectTrigger>
                  <SelectValue placeholder="All outcomes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All outcomes</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failure">Failure</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Actor ID</label>
              <Input
                placeholder="User / system ID"
                value={actorId}
                onChange={(e) => { setActorId(e.target.value); setOffset(0); }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Target User ID</label>
              <Input
                placeholder="Target user ID"
                value={targetUserId}
                onChange={(e) => { setTargetUserId(e.target.value); setOffset(0); }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results summary */}
      <div className="text-sm text-muted-foreground">
        {isLoading ? "Loading…" : `Showing ${rows.length} of ${total.toLocaleString()} events`}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Time</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                      No audit events found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const expanded = expandedRows.has(row.id);
                    return (
                      <>
                        <TableRow
                          key={row.id}
                          className={`cursor-pointer hover:bg-muted/50 ${rowClass(row.outcome)}`}
                          onClick={() => toggleRow(row.id)}
                        >
                          <TableCell className="pr-0">
                            {expanded
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            }
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap font-mono">
                            {format(new Date(row.created_at), "yyyy-MM-dd HH:mm:ss")}
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-xs">{row.event_type}</span>
                          </TableCell>
                          <TableCell className="text-xs max-w-[140px] truncate" title={row.actor_id ?? undefined}>
                            {row.actor_id ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-xs max-w-[140px] truncate" title={row.target_user_id ?? undefined}>
                            {row.target_user_id ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {row.actor_ip ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant={outcomeVariant(row.outcome)}>{row.outcome}</Badge>
                          </TableCell>
                        </TableRow>

                        {expanded && (
                          <TableRow key={`${row.id}-detail`} className={rowClass(row.outcome)}>
                            <TableCell />
                            <TableCell colSpan={6} className="pb-4">
                              <div className="text-xs space-y-2 pl-2">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1">
                                  <div><span className="font-semibold text-muted-foreground">Action:</span> {row.action}</div>
                                  <div><span className="font-semibold text-muted-foreground">Category:</span> {row.event_category}</div>
                                  <div><span className="font-semibold text-muted-foreground">Actor type:</span> {row.actor_type ?? "—"}</div>
                                  <div><span className="font-semibold text-muted-foreground">Session:</span> {row.session_id ?? "—"}</div>
                                  <div><span className="font-semibold text-muted-foreground">Target type:</span> {row.target_type ?? "—"}</div>
                                  <div><span className="font-semibold text-muted-foreground">Target ID:</span> {row.target_id ?? "—"}</div>
                                </div>
                                {row.error_message && (
                                  <div className="text-destructive font-mono bg-destructive/10 rounded p-2">
                                    {row.error_message}
                                  </div>
                                )}
                                {row.actor_user_agent && (
                                  <div className="text-muted-foreground break-all">{row.actor_user_agent}</div>
                                )}
                                {row.metadata && (
                                  <pre className="bg-muted rounded p-2 overflow-x-auto text-xs">
                                    {JSON.stringify(row.metadata, null, 2)}
                                  </pre>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 200 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 200))}
          >
            Previous
          </Button>
          <span className="text-sm self-center">
            Page {Math.floor(offset / 200) + 1} of {Math.ceil(total / 200)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + 200 >= total}
            onClick={() => setOffset(offset + 200)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
