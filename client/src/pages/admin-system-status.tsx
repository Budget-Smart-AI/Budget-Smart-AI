import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Activity, Database, Lock, Users, Clock, RefreshCw, Shield, AlertTriangle, CheckCircle2, XCircle, Link as LinkIcon } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SystemStatusResponse {
  health: {
    database: { status: "ok" | "error"; latencyMs: number };
    encryption: { status: "ok" | "error" };
    activeSessions: number;
    uptime: { seconds: number; formatted: string };
  };
  securityEvents: {
    "auth.login_failed": number;
    "security.rate_limit_exceeded": number;
    "auth.account_locked": number;
    "admin.data_accessed": number;
  };
  recentAuditLog: AuditRow[];
}

interface AuditRow {
  id: string;
  event_type: string;
  actor_id: string | null;
  actor_type: string | null;
  actor_ip: string | null;
  outcome: string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function outcomeBadge(outcome: string) {
  if (outcome === "success")
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">success</Badge>;
  if (outcome === "failure")
    return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-0">failure</Badge>;
  if (outcome === "blocked")
    return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-0">blocked</Badge>;
  return <Badge variant="outline">{outcome}</Badge>;
}

function rowClass(outcome: string): string {
  if (outcome === "success") return "bg-green-50/40 dark:bg-green-950/10";
  if (outcome === "failure") return "bg-red-50/40 dark:bg-red-950/10";
  if (outcome === "blocked") return "bg-amber-50/40 dark:bg-amber-950/10";
  return "";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminSystemStatus() {
  const { data, isLoading, refetch, isFetching } = useQuery<SystemStatusResponse>({
    queryKey: ["/api/admin/system-status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/system-status", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const health = data?.health;
  const securityEvents = data?.securityEvents;
  const recentAuditLog = data?.recentAuditLog ?? [];

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">System Status</h1>
            <p className="text-sm text-muted-foreground">SOC 2 monitoring &amp; infrastructure health</p>
          </div>
        </div>
        <Button
          onClick={() => refetch()}
          disabled={isFetching}
          variant="outline"
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Run Health Check
        </Button>
      </div>

      {/* ── 1. System Health Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Database */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Database</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {health?.database.status === "ok" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className={`text-2xl font-bold ${health?.database.status === "ok" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {health?.database.status?.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Latency: {health?.database.latencyMs ?? 0} ms
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Encryption */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Encryption</CardTitle>
            <Lock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {health?.encryption.status === "ok" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className={`text-2xl font-bold ${health?.encryption.status === "ok" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {health?.encryption.status?.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">AES-256-GCM</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Active Sessions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{health?.activeSessions ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Sessions not yet expired</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Uptime */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold">{health?.uptime.formatted}</div>
                <p className="text-xs text-muted-foreground mt-1">Current process uptime</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 2. Security Events (last 24 hours) ────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Security Events — Last 24 Hours</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg border bg-muted/30 space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Failed Logins
              </div>
              {isLoading ? (
                <Skeleton className="h-6 w-10" />
              ) : (
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {securityEvents?.["auth.login_failed"] ?? 0}
                </div>
              )}
              <p className="text-xs text-muted-foreground">auth.login_failed</p>
            </div>

            <div className="p-4 rounded-lg border bg-muted/30 space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Rate Limit Triggers
              </div>
              {isLoading ? (
                <Skeleton className="h-6 w-10" />
              ) : (
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {securityEvents?.["security.rate_limit_exceeded"] ?? 0}
                </div>
              )}
              <p className="text-xs text-muted-foreground">security.rate_limit_exceeded</p>
            </div>

            <div className="p-4 rounded-lg border bg-muted/30 space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4 text-orange-500" />
                Locked Accounts
              </div>
              {isLoading ? (
                <Skeleton className="h-6 w-10" />
              ) : (
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {securityEvents?.["auth.account_locked"] ?? 0}
                </div>
              )}
              <p className="text-xs text-muted-foreground">auth.account_locked</p>
            </div>

            <div className="p-4 rounded-lg border bg-muted/30 space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Activity className="h-4 w-4 text-blue-500" />
                Admin Data Access
              </div>
              {isLoading ? (
                <Skeleton className="h-6 w-10" />
              ) : (
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {securityEvents?.["admin.data_accessed"] ?? 0}
                </div>
              )}
              <p className="text-xs text-muted-foreground">admin.data_accessed</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 3. Recent Audit Log ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Recent Audit Log</CardTitle>
              <span className="text-xs text-muted-foreground">(last 20 entries)</span>
            </div>
            <Link href="/admin/audit-log">
              <Button variant="outline" size="sm" className="gap-2">
                <LinkIcon className="h-3 w-3" />
                Full Log
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : recentAuditLog.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No audit events found.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentAuditLog.map((row) => (
                    <TableRow key={row.id} className={rowClass(row.outcome)}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(row.created_at), "MMM d, HH:mm:ss")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.event_type}</TableCell>
                      <TableCell className="text-xs">
                        {row.actor_id
                          ? <span>{row.actor_type === "admin" ? "admin:" : ""}{row.actor_id}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>{outcomeBadge(row.outcome)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {row.actor_ip ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Infrastructure Status ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Infrastructure Status</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                label: "Hosting",
                value: "Railway",
                detail: "SOC 2 Type II certified",
                status: "certified",
              },
              {
                label: "Database",
                value: "NeonDB",
                detail: "Point-in-Time Recovery enabled",
                status: "certified",
              },
              {
                label: "CDN / Security",
                value: "Cloudflare",
                detail: "SOC 2 Type II certified",
                status: "certified",
              },
              {
                label: "Bank Data — Plaid",
                value: "Plaid",
                detail: "Production approved",
                status: "certified",
              },
              {
                label: "Bank Data — MX",
                value: "MX",
                detail: "Pending production approval",
                status: "pending",
              },
              {
                label: "Compliance",
                value: "SOC 2 Type I",
                detail: "Scheduled June/July 2026 via Comp AI",
                status: "pending",
              },
            ].map((item) => (
              <div key={item.label} className="p-4 rounded-lg border bg-muted/30 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.status === "certified" ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0 text-xs">
                      ✓ Active
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-xs">
                      Pending
                    </Badge>
                  )}
                </div>
                <div className="text-lg font-bold">{item.value}</div>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
