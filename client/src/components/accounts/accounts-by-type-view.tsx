/**
 * Monarch-style grouped Accounts view.
 *
 * Renders the user's connected and manual accounts organized into collapsible
 * type groups (Cash, Investments, Credit Cards, Loans, Other). Each group
 * shows a subtotal in its header; each account row shows an institution +
 * mask metadata line and a right-aligned balance.
 *
 * This component is deliberately pure-presentational — it receives the three
 * provider lists as props and normalizes them via `normalizeAllAccounts`, so
 * it has no knowledge of queries, routing, or mutations. The parent page
 * (bank-accounts.tsx) owns data fetching and any row-click behavior.
 */

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  Wallet,
  TrendingUp,
  CreditCard,
  Landmark,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  normalizeAllAccounts,
  groupByType,
  type AccountGroup,
  type NormalizedAccount,
  type NormalizeInput,
} from "./account-normalization";

const GROUP_ICON: Record<AccountGroup, any> = {
  cash: Wallet,
  investments: TrendingUp,
  credit_cards: CreditCard,
  loans: Landmark,
  other: Building2,
};

function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

interface AccountsByTypeViewProps extends NormalizeInput {
  isLoading?: boolean;
  onSelectAccount?: (account: NormalizedAccount) => void;
  /** Sections that start collapsed. Default: none (all expanded). */
  initiallyCollapsed?: AccountGroup[];
}

export function AccountsByTypeView({
  plaidGroups,
  mxMembers,
  manualAccounts,
  isLoading = false,
  onSelectAccount,
  initiallyCollapsed = [],
}: AccountsByTypeViewProps) {
  const [collapsed, setCollapsed] = useState<Set<AccountGroup>>(
    () => new Set(initiallyCollapsed),
  );

  const groups = useMemo(() => {
    const accounts = normalizeAllAccounts({ plaidGroups, mxMembers, manualAccounts });
    return groupByType(accounts);
  }, [plaidGroups, mxMembers, manualAccounts]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="py-4 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <p className="text-sm">No accounts connected yet.</p>
          <p className="text-xs mt-1">
            Connect a bank, brokerage, or loan — or add a manual account — to see it here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const toggle = (g: AccountGroup) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  };

  return (
    <div className="space-y-3" data-testid="accounts-by-type">
      {groups.map((group) => {
        const Icon = GROUP_ICON[group.group];
        const isCollapsed = collapsed.has(group.group);
        const isLiabilityGroup = group.group === "loans" || group.group === "credit_cards";

        return (
          <Card key={group.group} data-testid={`accounts-group-${group.group}`}>
            <button
              type="button"
              onClick={() => toggle(group.group)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors rounded-t-lg"
              aria-expanded={!isCollapsed}
              data-testid={`accounts-group-toggle-${group.group}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <Icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    isLiabilityGroup ? "text-red-600" : "text-green-600",
                  )}
                />
                <span className="font-semibold">{group.label}</span>
                <Badge variant="secondary" className="text-xs">
                  {group.accounts.length}
                </Badge>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={cn(
                    "text-base font-semibold tabular-nums",
                    isLiabilityGroup ? "text-red-600" : "",
                  )}
                >
                  {isLiabilityGroup ? "-" : ""}
                  {formatCurrency(group.rawTotal)}
                </span>
              </div>
            </button>

            {!isCollapsed && (
              <CardContent className="pt-0 pb-2 px-0">
                <div className="divide-y divide-border/50">
                  {group.accounts.map((a) => (
                    <AccountRow
                      key={`${a.source}:${a.id}`}
                      account={a}
                      isLiability={isLiabilityGroup}
                      onClick={onSelectAccount ? () => onSelectAccount(a) : undefined}
                    />
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function AccountRow({
  account,
  isLiability,
  onClick,
}: {
  account: NormalizedAccount;
  isLiability: boolean;
  onClick?: () => void;
}) {
  const secondaryLine = [
    account.institutionName,
    account.mask ? `••${account.mask}` : null,
    account.subtype || (account.source === "manual" ? "Manual" : null),
  ]
    .filter(Boolean)
    .join(" · ");

  // Row is a button when onClick is provided, otherwise a plain div — we never
  // want the "Manual" type rows to look clickable when there's no handler.
  const Wrapper: any = onClick ? Button : "div";
  const wrapperProps = onClick
    ? {
        variant: "ghost" as const,
        onClick,
        "data-testid": `account-row-${account.source}-${account.id}`,
      }
    : {
        "data-testid": `account-row-${account.source}-${account.id}`,
      };

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "w-full px-4 py-3 flex items-center justify-between text-left",
        onClick && "h-auto rounded-none hover:bg-muted/50",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{account.name}</div>
        {secondaryLine && (
          <div className="text-xs text-muted-foreground truncate">{secondaryLine}</div>
        )}
      </div>
      <div className="text-right shrink-0 ml-3">
        <div
          className={cn(
            "text-sm font-semibold tabular-nums",
            isLiability ? "text-red-600" : "",
          )}
        >
          {isLiability ? "-" : ""}
          {formatCurrency(account.balance, account.currency)}
        </div>
        {account.limit !== null && account.group === "credit_cards" && (
          <div className="text-xs text-muted-foreground">
            of {formatCurrency(account.limit, account.currency)} limit
          </div>
        )}
      </div>
    </Wrapper>
  );
}
