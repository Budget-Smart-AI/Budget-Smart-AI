/**
 * IncomeRegistryManager
 *
 * Step 6 of the Income overhaul. Renders the user's `income_sources` registry
 * with inline editing for the per-stream classification (mode + cadence +
 * category) and a "schedule rate change" form for raises/tax-bracket changes.
 *
 * Data flow:
 *   GET    /api/income/registry              — list active sources + history
 *   POST   /api/income/registry/refresh      — re-run auto-classifier
 *   PATCH  /api/income/registry/:id          — edit display name / cadence / mode
 *   POST   /api/income/registry/:id/rate     — schedule a unit-amount change
 *   DELETE /api/income/registry/:id          — soft-deactivate
 *
 * Concretely solves UAT-6 cases:
 *   • Coreslab May 1 raise — rate change with effectiveFrom = "2026-05-01"
 *   • Roche misclassified as Salary — Edit → Category → "Other"
 *   • Etsy variable income — Edit → Mode → "variable"
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw, Trash2, Plus, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { INCOME_CATEGORIES, RECURRENCE_OPTIONS } from "@shared/schema";

const MODE_OPTIONS = ["fixed", "variable", "irregular"] as const;
type Mode = (typeof MODE_OPTIONS)[number];

interface AmountRow {
  id: string;
  sourceId: string;
  amount: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string | null;
}

interface RegistrySource {
  id: string;
  displayName: string;
  normalizedSource: string;
  recurrence: string;
  mode: Mode;
  cadenceAnchor: string;
  cadenceExtra: string | null;
  category: string;
  isActive: boolean;
  autoDetected: boolean;
  detectedAt: string | null;
  amounts: AmountRow[];
  activeUnitAmount: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MODE_DESCRIPTIONS: Record<Mode, string> = {
  fixed: "Same amount every paycheck — salaried employees.",
  variable: "Amount fluctuates — contractors, OT-heavy roles. Engine averages last 3 months.",
  irregular: "Unpredictable — entrepreneurs, freelancers. Engine shows actuals only, no projection.",
};

export function IncomeRegistryManager({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ sources: RegistrySource[] }>({
    queryKey: ["/api/income/registry"],
    enabled: open,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/income/registry/refresh");
      return res.json();
    },
    onSuccess: (resp: any) => {
      toast({
        title: `Detected ${resp.sourcesDetected ?? 0} income sources`,
        description: `Analyzed ${resp.depositsAnalyzed ?? 0} deposits over the last 6 months.`,
      });
      qc.invalidateQueries({ queryKey: ["/api/income/registry"] });
      qc.invalidateQueries({ queryKey: ["/api/engine/income"] });
      qc.invalidateQueries({ queryKey: ["/api/engine/dashboard"] });
    },
    onError: (e: any) => {
      toast({
        title: "Failed to refresh",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[820px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Manage Income Sources
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            The registry is the single source of truth for income projections.
            Edit cadence, classification, or schedule a rate change here — the
            engine recomputes the moment you save.
          </p>
        </DialogHeader>

        <div className="flex items-center justify-between py-2">
          <div className="text-sm text-muted-foreground">
            {data?.sources?.length ?? 0} active source
            {(data?.sources?.length ?? 0) === 1 ? "" : "s"}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            data-testid="button-registry-refresh"
          >
            {refreshMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh from bank history
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3" />
            Loading registry…
          </div>
        ) : (data?.sources?.length ?? 0) === 0 ? (
          <div className="text-center py-10 border border-dashed rounded-lg">
            <p className="text-sm text-muted-foreground mb-3">
              No income sources registered yet.
            </p>
            <Button
              size="sm"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Auto-detect from my bank history
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {data!.sources.map((s: RegistrySource) => (
              <SourceCard key={s.id} source={s} />
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourceCard({ source }: { source: RegistrySource }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [displayName, setDisplayName] = useState(source.displayName);
  const [recurrence, setRecurrence] = useState(source.recurrence);
  const [mode, setMode] = useState<Mode>(source.mode);
  const [category, setCategory] = useState(source.category);
  const [showRate, setShowRate] = useState(false);
  const [rateAmount, setRateAmount] = useState(
    source.activeUnitAmount?.toFixed(2) ?? "",
  );
  const [rateEffective, setRateEffective] = useState(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [rateReason, setRateReason] = useState("");

  const dirty =
    displayName !== source.displayName ||
    recurrence !== source.recurrence ||
    mode !== source.mode ||
    category !== source.category;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/income/registry"] });
    qc.invalidateQueries({ queryKey: ["/api/engine/income"] });
    qc.invalidateQueries({ queryKey: ["/api/engine/dashboard"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/income/registry/${source.id}`, {
        displayName,
        recurrence,
        mode,
        category,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Source updated" });
      invalidate();
    },
    onError: (e: any) =>
      toast({
        title: "Update failed",
        description: e?.message || "",
        variant: "destructive",
      }),
  });

  const rateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/income/registry/${source.id}/rate`, {
        amount: rateAmount,
        effectiveFrom: rateEffective,
        reason: rateReason || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Rate change scheduled",
        description: `New amount $${Number(rateAmount).toFixed(2)} effective ${rateEffective}.`,
      });
      setShowRate(false);
      setRateReason("");
      invalidate();
    },
    onError: (e: any) =>
      toast({
        title: "Rate change failed",
        description: e?.message || "",
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/income/registry/${source.id}`),
    onSuccess: () => {
      toast({ title: "Source deactivated" });
      invalidate();
    },
    onError: (e: any) =>
      toast({
        title: "Deactivate failed",
        description: e?.message || "",
        variant: "destructive",
      }),
  });

  const future = source.amounts.filter(
    (a) => a.effectiveFrom > format(new Date(), "yyyy-MM-dd"),
  );

  return (
    <Card data-testid={`registry-source-${source.normalizedSource}`}>
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="font-semibold text-base h-9"
              data-testid={`input-displayname-${source.id}`}
            />
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {source.autoDetected && (
                <Badge variant="secondary" className="text-[10px]">
                  Auto-detected
                </Badge>
              )}
              {source.activeUnitAmount !== null && (
                <span className="text-sm text-muted-foreground">
                  ${source.activeUnitAmount.toFixed(2)} per pay
                </span>
              )}
              {future.length > 0 && (
                <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">
                  {future.length} scheduled change{future.length === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:bg-destructive/10"
            onClick={() => {
              if (confirm(`Deactivate ${source.displayName}? Past income stays; future projections stop.`)) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Cadence</Label>
            <Select value={recurrence} onValueChange={setRecurrence}>
              <SelectTrigger className="h-9" data-testid={`select-recurrence-${source.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECURRENCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Classification</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger className="h-9" data-testid={`select-mode-${source.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9" data-testid={`select-category-${source.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INCOME_CATEGORIES.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground italic">
          {MODE_DESCRIPTIONS[mode]}
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending}
            data-testid={`button-save-${source.id}`}
          >
            {saveMutation.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
            Save changes
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowRate((s) => !s)}
            data-testid={`button-rate-${source.id}`}
          >
            <Plus className="h-3 w-3 mr-1" />
            Schedule rate change
          </Button>
        </div>

        {showRate && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">New amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={rateAmount}
                  onChange={(e) => setRateAmount(e.target.value)}
                  data-testid={`input-rate-amount-${source.id}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Effective from</Label>
                <Input
                  type="date"
                  value={rateEffective}
                  onChange={(e) => setRateEffective(e.target.value)}
                  data-testid={`input-rate-date-${source.id}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reason (optional)</Label>
                <Input
                  placeholder="e.g. Coreslab raise May 2026"
                  value={rateReason}
                  onChange={(e) => setRateReason(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => rateMutation.mutate()}
                disabled={!rateAmount || !rateEffective || rateMutation.isPending}
                data-testid={`button-rate-confirm-${source.id}`}
              >
                {rateMutation.isPending && (
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                )}
                Schedule change
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowRate(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {source.amounts.length > 1 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">
              Amount history ({source.amounts.length} entries)
            </summary>
            <ul className="mt-2 space-y-1">
              {source.amounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between border-b pb-1">
                  <span>${Number(a.amount).toFixed(2)}</span>
                  <span>
                    {a.effectiveFrom}
                    {a.effectiveTo ? ` → ${a.effectiveTo}` : " → present"}
                  </span>
                  {a.reason && <span className="italic">{a.reason}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
