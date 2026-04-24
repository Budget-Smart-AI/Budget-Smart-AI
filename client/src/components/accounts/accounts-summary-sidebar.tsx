/**
 * Monarch-style summary panel that sits next to the Accounts By-Type view.
 *
 * Responsibilities:
 *   - Render headline Assets / Liabilities / Net Worth numbers sourced from
 *     the engine (SSOT) — see `engineTotals` prop. Falls back to a local
 *     balance-sheet calc only when engine totals haven't loaded yet.
 *   - Render a horizontal stacked bar for Assets vs Liabilities share, driven
 *     by the engine totals.
 *   - Break down each side by group (Cash, Investments, Credit Cards, Loans,
 *     Other), with a toggle between $ totals and % of-side. Per-group numbers
 *     remain from the local normalizer — the engine doesn't expose
 *     Monarch-style group buckets yet (see ARCHITECTURE.md §6.1 / Phase B
 *     Canonical Accounts).
 *   - View-mode dropdown (Balances / Performance / Recent activity). Only
 *     Balances is wired up today — the others emit a toast via the parent
 *     because they need extra endpoints; the UI slot is here so we can add
 *     them without another layout pass.
 *   - Download CSV of all accounts.
 *
 * SSOT note (ARCHITECTURE.md §6.1, UAT-12 #94): the headline Net Worth /
 * Total Assets / Total Liabilities on THIS panel MUST match the Net Worth page
 * and the Dashboard tile. All three now read from `loadAndCalculateNetWorth`
 * via `/api/engine/accounts` → `engineTotals`.
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  normalizeAllAccounts,
  computeBalanceSheet,
  GROUP_LABELS,
  type AccountGroup,
  type NormalizeInput,
} from "./account-normalization";

export type AccountsViewMode = "balances" | "performance" | "activity";

/**
 * Engine-sourced totals (SSOT). Shape matches `/api/engine/accounts` →
 * `totals`. Liabilities is a positive number (amount owed).
 */
export interface AccountsEngineTotals {
  assets: number;
  liabilities: number;
  netWorth: number;
}

interface AccountsSummarySidebarProps extends NormalizeInput {
  viewMode: AccountsViewMode;
  onViewModeChange: (mode: AccountsViewMode) => void;
  /**
   * Engine totals from `/api/engine/accounts`. When provided, these override
   * the local `computeBalanceSheet` result for the headline Net Worth / Assets
   * / Liabilities — this is the Phase A §6.1 SSOT cutover. Optional so the
   * component keeps working if the parent hasn't wired the engine query yet
   * (in which case it falls back to the local calc for all fields).
   */
  engineTotals?: AccountsEngineTotals;
}

function fmt(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

const ASSET_GROUPS: AccountGroup[] = ["cash", "investments", "other"];
const LIABILITY_GROUPS: AccountGroup[] = ["credit_cards", "loans"];

export function AccountsSummarySidebar({
  plaidGroups,
  mxMembers,
  manualAccounts,
  viewMode,
  onViewModeChange,
  engineTotals,
}: AccountsSummarySidebarProps) {
  const [displayMode, setDisplayMode] = useState<"totals" | "percent">("totals");

  const { balanceSheet, accounts } = useMemo(() => {
    const normalized = normalizeAllAccounts({ plaidGroups, mxMembers, manualAccounts });
    return {
      accounts: normalized,
      balanceSheet: computeBalanceSheet(normalized),
    };
  }, [plaidGroups, mxMembers, manualAccounts]);

  // Per-group breakdown stays local (engine doesn't expose Monarch-style
  // groups yet — that's Phase B Canonical Accounts). Headline totals come
  // from the engine when available, otherwise fall back to the local calc.
  // This is the §6.1 SSOT cutover: Net Worth / Assets / Liabilities shown
  // on this panel now match the Net Worth page and the Dashboard tile.
  const { byGroup } = balanceSheet;
  const assets = engineTotals?.assets ?? balanceSheet.assets;
  const liabilities = engineTotals?.liabilities ?? balanceSheet.liabilities;
  const netWorth = engineTotals?.netWorth ?? balanceSheet.netWorth;

  const total = assets + liabilities;
  const assetShare = total > 0 ? (assets / total) * 100 : 0;
  const liabShare = total > 0 ? (liabilities / total) * 100 : 0;
  const isPositive = netWorth >= 0;

  const downloadCsv = () => {
    const header = ["Group", "Name", "Institution", "Mask", "Subtype", "Source", "Balance", "Currency"];
    const rows = accounts.map((a) => [
      GROUP_LABELS[a.group],
      a.name,
      a.institutionName ?? "",
      a.mask ?? "",
      a.subtype ?? "",
      a.source,
      a.balance.toFixed(2),
      a.currency,
    ]);
    const escape = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const csv = [header, ...rows].map((r) => r.map((c) => escape(String(c))).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `budgetsmart-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderLine = (group: AccountGroup, side: "asset" | "liability") => {
    const amount = byGroup[group];
    if (amount === 0) return null;
    const side_total = side === "asset" ? assets : liabilities;
    const pct = side_total > 0 ? (amount / side_total) * 100 : 0;
    return (
      <div key={group} className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{GROUP_LABELS[group]}</span>
        <span
          className={cn(
            "tabular-nums font-medium",
            side === "liability" ? "text-red-600" : "",
          )}
        >
          {displayMode === "totals"
            ? `${side === "liability" ? "-" : ""}${fmt(amount)}`
            : `${pct.toFixed(0)}%`}
        </span>
      </div>
    );
  };

  return (
    <Card
      data-testid="accounts-summary-sidebar"
      variant="glass"
      className="lg:sticky lg:top-4"
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Summary</CardTitle>
          <Select value={viewMode} onValueChange={(v) => onViewModeChange(v as AccountsViewMode)}>
            <SelectTrigger className="h-8 w-auto text-xs" data-testid="accounts-view-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="balances">Balances</SelectItem>
              <SelectItem value="performance">Performance</SelectItem>
              <SelectItem value="activity">Recent activity</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <CardDescription className="text-xs">
          Across {accounts.length} account{accounts.length === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Net worth headline */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Net Worth
          </div>
          <div
            className={cn(
              "text-2xl font-bold tabular-nums",
              isPositive ? "text-green-600" : "text-red-600",
            )}
            data-testid="summary-net-worth"
          >
            {fmt(netWorth)}
          </div>
        </div>

        {/* Proportional bar */}
        {total > 0 && (
          <div className="space-y-2">
            <div className="w-full h-3 rounded-full overflow-hidden flex bg-muted">
              {assetShare > 0 && (
                <div
                  className="h-full bg-green-500"
                  style={{ width: `${assetShare}%` }}
                />
              )}
              {liabShare > 0 && (
                <div
                  className="h-full bg-red-500"
                  style={{ width: `${liabShare}%` }}
                />
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1 align-middle" />
                Assets {assetShare.toFixed(0)}%
              </span>
              <span>
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1 align-middle" />
                Liabilities {liabShare.toFixed(0)}%
              </span>
            </div>
          </div>
        )}

        {/* Totals / Percent toggle */}
        <div className="flex items-center justify-end">
          <div className="inline-flex rounded-md border p-0.5 text-xs">
            <button
              type="button"
              className={cn(
                "px-2 py-1 rounded-sm transition-colors",
                displayMode === "totals" ? "bg-muted font-medium" : "text-muted-foreground",
              )}
              onClick={() => setDisplayMode("totals")}
              data-testid="summary-toggle-totals"
            >
              Totals
            </button>
            <button
              type="button"
              className={cn(
                "px-2 py-1 rounded-sm transition-colors",
                displayMode === "percent" ? "bg-muted font-medium" : "text-muted-foreground",
              )}
              onClick={() => setDisplayMode("percent")}
              data-testid="summary-toggle-percent"
            >
              Percent
            </button>
          </div>
        </div>

        {/* Assets side */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-green-600">Assets</span>
            <span className="text-sm font-semibold text-green-600 tabular-nums">
              {fmt(assets)}
            </span>
          </div>
          <div className="space-y-1 pl-1">
            {ASSET_GROUPS.map((g) => renderLine(g, "asset"))}
            {assets === 0 && (
              <p className="text-xs text-muted-foreground">No asset accounts.</p>
            )}
          </div>
        </div>

        {/* Liabilities side */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-red-600">Liabilities</span>
            <span className="text-sm font-semibold text-red-600 tabular-nums">
              -{fmt(liabilities)}
            </span>
          </div>
          <div className="space-y-1 pl-1">
            {LIABILITY_GROUPS.map((g) => renderLine(g, "liability"))}
            {liabilities === 0 && (
              <p className="text-xs text-muted-foreground">No liabilities.</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={downloadCsv}
            className="w-full"
            data-testid="summary-download-csv"
            disabled={accounts.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Download CSV
          </Button>
          {viewMode !== "balances" && (
            <div className="mt-3 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="mr-1">
                Preview
              </Badge>
              {viewMode === "performance"
                ? "Performance metrics are still wiring up — shipping in a follow-up."
                : "Recent activity feed is still wiring up — shipping in a follow-up."}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
