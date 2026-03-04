import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, Globe, CheckCircle2, XCircle, Save, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BankProviderRow {
  id: string;
  provider_id: string;
  display_name: string;
  description: string;
  is_enabled: boolean;
  show_in_wizard: boolean;
  show_in_accounts: boolean;
  supported_countries: string[];
  primary_regions: string[];
  fallback_order: number;
  status: string;
  status_message: string | null;
  logo_url: string | null;
  updated_at: string;
  updated_by: string | null;
}

// ─── Provider Row Card ────────────────────────────────────────────────────────

function ProviderCard({ provider }: { provider: BankProviderRow }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isEnabled, setIsEnabled] = useState(provider.is_enabled);
  const [showInWizard, setShowInWizard] = useState(provider.show_in_wizard);
  const [showInAccounts, setShowInAccounts] = useState(provider.show_in_accounts);
  const [fallbackOrder, setFallbackOrder] = useState(provider.fallback_order);

  const isDirty =
    isEnabled !== provider.is_enabled ||
    showInWizard !== provider.show_in_wizard ||
    showInAccounts !== provider.show_in_accounts ||
    fallbackOrder !== provider.fallback_order;

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/admin/bank-providers/${provider.provider_id}`, {
        isEnabled,
        showInWizard,
        showInAccounts,
        fallbackOrder,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bank-providers"] });
      toast({ title: "Provider updated", description: `${provider.display_name} saved.` });
    },
    onError: () =>
      toast({ title: "Save failed", variant: "destructive" }),
  });

  return (
    <Card className={`transition-all ${isEnabled ? "border-green-200 bg-green-50/30 dark:bg-green-950/10" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white dark:bg-muted rounded-lg border shadow-sm">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {provider.display_name}
                {isEnabled ? (
                  <Badge variant="default" className="bg-green-600 text-white text-[10px] gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Enabled
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-[10px] gap-1">
                    <XCircle className="h-3 w-3" /> Disabled
                  </Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">{provider.description}</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs shrink-0">
            Priority {fallbackOrder}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Countries */}
        <div className="flex items-start gap-2">
          <Globe className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Supported:</span>{" "}
            {provider.supported_countries.slice(0, 10).join(", ")}
            {provider.supported_countries.length > 10 &&
              ` +${provider.supported_countries.length - 10} more`}
          </div>
        </div>

        {/* Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Enabled</p>
              <p className="text-xs text-muted-foreground">Available to users</p>
            </div>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Show in Wizard</p>
              <p className="text-xs text-muted-foreground">Onboarding flow</p>
            </div>
            <Switch checked={showInWizard} onCheckedChange={setShowInWizard} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Show in Accounts</p>
              <p className="text-xs text-muted-foreground">Bank accounts page</p>
            </div>
            <Switch checked={showInAccounts} onCheckedChange={setShowInAccounts} />
          </div>
        </div>

        {/* Fallback order */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium w-32">Fallback Order</label>
          <input
            type="number"
            min={1}
            max={99}
            value={fallbackOrder}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1 && val <= 99) setFallbackOrder(val);
            }}
            className="w-20 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
          <span className="text-xs text-muted-foreground">
            Lower = higher priority (tried first)
          </span>
        </div>

        {/* Save button */}
        {isDirty && (
          <Button
            className="w-full gap-2"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        )}

        {provider.updated_by && (
          <p className="text-[10px] text-muted-foreground text-right">
            Last updated by {provider.updated_by} on{" "}
            {new Date(provider.updated_at).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminBankProviders() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: providers, isLoading, error } = useQuery<BankProviderRow[]>({
    queryKey: ["/api/admin/bank-providers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/bank-providers");
      return res.json() as Promise<BankProviderRow[]>;
    },
  });

  const enabledCount = providers?.filter((p) => p.is_enabled).length ?? 0;

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Bank Provider Configuration
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Control which bank connection providers are available, for which countries, and in what priority order.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ["/api/admin/bank-providers"] })
          }
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Providers</p>
            <p className="text-2xl font-bold">{providers?.length ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Enabled</p>
            <p className="text-2xl font-bold text-green-600">{isLoading ? "—" : enabledCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Disabled</p>
            <p className="text-2xl font-bold text-muted-foreground">
              {isLoading ? "—" : (providers?.length ?? 0) - enabledCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Countries Covered</p>
            <p className="text-2xl font-bold">
              {providers
                ? new Set(providers.flatMap((p) => p.supported_countries)).size
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Provider cards */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Failed to load bank providers. Please try refreshing the page.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(providers ?? []).map((provider) => (
            <ProviderCard key={provider.provider_id} provider={provider} />
          ))}
        </div>
      )}

      {/* Coverage table */}
      {providers && providers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Country Coverage Matrix</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Primary Regions</TableHead>
                    <TableHead>Total Countries</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.map((p) => (
                    <TableRow key={p.provider_id}>
                      <TableCell className="font-medium">{p.display_name}</TableCell>
                      <TableCell>
                        {p.is_enabled ? (
                          <Badge variant="default" className="bg-green-600 text-white text-[10px]">
                            Enabled
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-[10px]">
                            Disabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{p.fallback_order}</TableCell>
                      <TableCell className="text-xs">
                        {p.primary_regions.join(", ")}
                      </TableCell>
                      <TableCell>{p.supported_countries.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
