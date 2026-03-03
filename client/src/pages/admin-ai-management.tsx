import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  Bot,
  CheckCircle2,
  XCircle,
  DollarSign,
  Activity,
  Clock,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Save,
  Users,
  Zap,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskSlot {
  id: number;
  task_slot: string;
  task_label: string;
  task_description: string;
  category: string;
  provider: string;
  model_id: string;
  call_count: number;
  total_cost: number;
}

interface RegistryModel {
  provider: string;
  modelId: string;
  displayName: string;
  description: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
  contextWindow: number;
  recommended?: boolean;
  badge?: string;
  bestFor?: string;
}

interface AIConfigResponse {
  taskSlots: TaskSlot[];
  registry: RegistryModel[];
}

interface ProviderStatus {
  provider: string;
  configured: boolean;
  available: boolean;
}

type StatsPeriod = "today" | "7days" | "30days" | "90days" | "all";

interface StatsOverview {
  period: string;
  totalCalls: number;
  totalCost: number;
  successRate: number;
  avgDurationMs: number;
  bySlot: Array<{ task_slot: string; call_count: number; total_cost: number }>;
  byProvider: Array<{ provider: string; call_count: number; total_cost: number }>;
  dailyCosts: Array<{ date: string; deepseek_cost: number; openai_cost: number; deepseek_calls: number; openai_calls: number }>;
  topUsers: Array<{ user_id: number; username: string; call_count: number; total_cost: number }>;
}

interface AIError {
  id: number;
  user_id: number;
  task_slot: string;
  provider: string;
  model_id: string;
  error_message: string;
  duration_ms: number;
  feature_context: string | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCost(n: number) {
  return `$${(n ?? 0).toFixed(4)}`;
}

function fmtPct(n: number) {
  // successRate from /api/admin/ai-stats/overview is already a string percentage like "95.2";
  // ai_confidence from anomaly_alerts is a decimal 0–1. Support both formats.
  const pct = (n ?? 0) > 1 ? n : n * 100;
  return `${pct.toFixed(1)}%`;
}

const PROVIDER_COLORS: Record<string, string> = {
  deepseek: "#3b82f6",
  openai: "#22c55e",
};

const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];

// ─── Provider Status Badges ───────────────────────────────────────────────────

function ProviderStatusRow({ statuses }: { statuses: ProviderStatus[] }) {
  return (
    <div className="flex flex-wrap gap-3 mb-6">
      {statuses.map((s) => (
        <div
          key={s.provider}
          className="flex items-center gap-2 rounded-lg border px-4 py-2 bg-card"
        >
          <span className="font-semibold capitalize">{s.provider}</span>
          {s.configured ? (
            <Badge variant="default" className="bg-green-600 text-white gap-1">
              <CheckCircle2 className="h-3 w-3" /> Configured
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" /> Not configured
            </Badge>
          )}
          {s.available ? (
            <Badge variant="outline" className="text-green-600 border-green-600 gap-1">
              <Zap className="h-3 w-3" /> Available
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground gap-1">
              <XCircle className="h-3 w-3" /> Unavailable
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({
  slot,
  registry,
}: {
  slot: TaskSlot;
  registry: RegistryModel[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedModel, setSelectedModel] = useState<string>(
    `${slot.provider}::${slot.model_id}`
  );

  const saveMutation = useMutation({
    mutationFn: () => {
      const [provider, modelId] = selectedModel.split("::");
      return apiRequest("PATCH", `/api/admin/ai-config/${slot.task_slot}`, {
        provider,
        modelId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-config"] });
      toast({ title: "Model updated", description: `${slot.task_label} saved.` });
    },
    onError: () =>
      toast({ title: "Save failed", variant: "destructive" }),
  });

  const isDirty = selectedModel !== `${slot.provider}::${slot.model_id}`;

  return (
    <Card className="flex flex-col gap-0">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{slot.task_label}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{slot.task_description}</p>
          </div>
          <Badge variant="outline" className="text-xs shrink-0">
            {slot.category}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Select value={selectedModel} onValueChange={setSelectedModel}>
          <SelectTrigger className="w-full text-sm">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {registry.map((m) => (
              <SelectItem
                key={`${m.provider}::${m.modelId}`}
                value={`${m.provider}::${m.modelId}`}
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    {m.displayName}
                    {m.recommended && (
                      <span className="ml-1 text-xs text-green-600">(recommended)</span>
                    )}
                    {m.badge && (
                      <span className="ml-1 text-xs text-blue-600">[{m.badge}]</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ${m.inputCostPer1M}/1M in · ${m.outputCostPer1M}/1M out
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            {slot.call_count ?? 0} calls (7d)
          </span>
          <span className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            {fmtCost(slot.total_cost)} (7d)
          </span>
        </div>

        <Button
          size="sm"
          disabled={!isDirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="self-end gap-1"
        >
          <Save className="h-3 w-3" />
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Monthly Cost Projection ──────────────────────────────────────────────────

function MonthlyCostProjection({ slots }: { slots: TaskSlot[] }) {
  const total7d = slots.reduce((s, t) => s + (t.total_cost ?? 0), 0);
  const projection = (total7d / 7) * 30;

  return (
    <Card className="mt-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Monthly Cost Projection
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">{fmtCost(projection)}</span>
          <span className="text-sm text-muted-foreground">/ month (based on 7-day average)</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          7-day spend: {fmtCost(total7d)} · Daily avg: {fmtCost(total7d / 7)}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon,
  sub,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-1">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium uppercase tracking-wide">{title}</span>
          {icon}
        </div>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Tab 1: Model Configuration ───────────────────────────────────────────────

function ModelConfigTab() {
  const { data, isLoading, isError } = useQuery<AIConfigResponse>({
    queryKey: ["/api/admin/ai-config"],
  });

  const { data: providerStatuses, isLoading: statusLoading } = useQuery<ProviderStatus[]>({
    queryKey: ["/api/admin/ai-config/provider-status"],
  });

  if (isError) {
    return (
      <div className="flex items-center justify-center h-40 text-destructive gap-2">
        <XCircle className="h-5 w-5" />
        Failed to load AI configuration.
      </div>
    );
  }

  const slots = data?.taskSlots ?? [];
  const registry = data?.registry ?? [];

  // Group by category
  const categories = Array.from(new Set(slots.map((s) => s.category)));

  return (
    <div>
      {/* Provider status */}
      {statusLoading ? (
        <div className="flex gap-3 mb-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-48" />
        </div>
      ) : providerStatuses ? (
        <ProviderStatusRow statuses={providerStatuses} />
      ) : null}

      {/* Task cards by category */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-lg" />
          ))}
        </div>
      ) : (
        categories.map((cat) => (
          <div key={cat} className="mb-8">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              {cat}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {slots
                .filter((s) => s.category === cat)
                .map((slot) => (
                  <TaskCard key={slot.id} slot={slot} registry={registry} />
                ))}
            </div>
          </div>
        ))
      )}

      {/* Monthly projection */}
      {!isLoading && slots.length > 0 && <MonthlyCostProjection slots={slots} />}
    </div>
  );
}

// ─── Tab 2: Usage & Analytics ─────────────────────────────────────────────────

function UsageAnalyticsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<StatsPeriod>("7days");
  const [errorsOpen, setErrorsOpen] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<StatsOverview>({
    queryKey: ["/api/admin/ai-stats/overview", period],
    queryFn: () =>
      apiRequest("GET", `/api/admin/ai-stats/overview?period=${period}`).then((r) => r.json()),
  });

  const { data: errors, isLoading: errorsLoading } = useQuery<AIError[]>({
    queryKey: ["/api/admin/ai-stats/errors"],
    enabled: errorsOpen,
  });

  const anomalyMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/anomalies/run-detection"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-stats/overview"] });
      toast({ title: "Anomaly detection completed" });
    },
    onError: () => toast({ title: "Detection failed", variant: "destructive" }),
  });

  const periodOptions: { label: string; value: StatsPeriod }[] = [
    { label: "Today", value: "today" },
    { label: "7 Days", value: "7days" },
    { label: "30 Days", value: "30days" },
    { label: "90 Days", value: "90days" },
    { label: "All Time", value: "all" },
  ];

  const topSlots = (stats?.bySlot ?? [])
    .sort((a, b) => b.total_cost - a.total_cost)
    .slice(0, 5);

  const providerPieData = (stats?.byProvider ?? []).map((p) => ({
    name: p.provider,
    value: p.total_cost,
  }));

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex gap-2 flex-wrap">
        {periodOptions.map((opt) => (
          <Button
            key={opt.value}
            variant={period === opt.value ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Stat cards */}
      {statsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Cost"
            value={fmtCost(stats?.totalCost ?? 0)}
            icon={<DollarSign className="h-4 w-4" />}
          />
          <StatCard
            title="Total Calls"
            value={(stats?.totalCalls ?? 0).toLocaleString()}
            icon={<Activity className="h-4 w-4" />}
          />
          <StatCard
            title="Success Rate"
            value={fmtPct(stats?.successRate ?? 0)}
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <StatCard
            title="Avg Response"
            value={`${Math.round(stats?.avgDurationMs ?? 0)}ms`}
            icon={<Clock className="h-4 w-4" />}
          />
        </div>
      )}

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Daily stacked bar */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Daily Costs by Provider</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats?.dailyCosts ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v.toFixed(3)}`} />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toFixed(4)}`, ""]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="deepseek_cost" name="DeepSeek" stackId="a" fill={PROVIDER_COLORS.deepseek} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="openai_cost" name="OpenAI" stackId="a" fill={PROVIDER_COLORS.openai} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Provider donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cost by Provider</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : providerPieData.length === 0 ? (
              <div className="flex items-center justify-center h-56 text-muted-foreground text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={providerPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }: { name: string; percent: number }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {providerPieData.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={PROVIDER_COLORS[entry.name] ?? PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtCost(v)} contentStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cost by task slot (horizontal bar) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Top 5 Task Slots by Cost</CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : topSlots.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topSlots} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v.toFixed(3)}`} />
                <YAxis type="category" dataKey="task_slot" tick={{ fontSize: 11 }} width={120} />
                <Tooltip
                  formatter={(value: number) => [`$${value.toFixed(4)}`, "Cost"]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="total_cost" name="Cost" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top users table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Top 10 Users by AI Cost
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {statsLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(stats?.topUsers ?? []).slice(0, 10).map((u, idx) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{u.username ?? `User #${u.user_id}`}</TableCell>
                    <TableCell className="text-right">{u.call_count.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{fmtCost(u.total_cost)}</TableCell>
                  </TableRow>
                ))}
                {(stats?.topUsers ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      No data for this period
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Anomaly detection panel */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Anomaly Detection
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Run the anomaly detection engine to identify unusual AI usage patterns.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="self-start gap-1"
            disabled={anomalyMutation.isPending}
            onClick={() => anomalyMutation.mutate()}
          >
            <RefreshCw className={`h-3 w-3 ${anomalyMutation.isPending ? "animate-spin" : ""}`} />
            {anomalyMutation.isPending ? "Running…" : "Run Detection Now"}
          </Button>
        </CardContent>
      </Card>

      {/* Recent errors collapsible */}
      <Collapsible open={errorsOpen} onOpenChange={setErrorsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 w-full justify-between border rounded-lg px-4 py-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <XCircle className="h-4 w-4 text-destructive" />
              Recent AI Errors
            </span>
            {errorsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2">
            <CardContent className="p-0">
              {errorsLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Task Slot</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(errors ?? []).map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(e.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{e.task_slot}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {e.provider}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{e.model_id}</TableCell>
                        <TableCell className="text-xs text-destructive max-w-xs truncate">
                          {e.error_message}
                        </TableCell>
                        <TableCell className="text-right text-xs">{e.duration_ms}ms</TableCell>
                      </TableRow>
                    ))}
                    {(errors ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                          No errors recorded
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminAIManagement() {
  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="flex items-center gap-3 mb-6">
        <Bot className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">AI Model Management</h1>
          <p className="text-sm text-muted-foreground">
            Configure AI providers, assign models to tasks, and monitor usage.
          </p>
        </div>
      </div>

      <Tabs defaultValue="config">
        <TabsList className="mb-6">
          <TabsTrigger value="config">Model Configuration</TabsTrigger>
          <TabsTrigger value="analytics">Usage &amp; Analytics</TabsTrigger>
        </TabsList>
        <TabsContent value="config">
          <ModelConfigTab />
        </TabsContent>
        <TabsContent value="analytics">
          <UsageAnalyticsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
