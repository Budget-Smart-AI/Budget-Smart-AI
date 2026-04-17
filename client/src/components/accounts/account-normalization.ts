/**
 * Normalizes accounts from all three provider sources (Plaid, MX, manual) into
 * a single shape grouped by Monarch-style category: Cash / Investments / Loans /
 * Credit Cards / Other.
 *
 * This is the one place the app maps provider-specific `type`/`subtype` strings
 * onto the five display buckets used by the Accounts page. Keeping it here — not
 * in a page component — lets the Summary sidebar and the By-Type view agree on
 * the same numbers.
 *
 * Sign convention:
 *   - Cash / Investments / Other → positive values are assets.
 *   - Credit Cards / Loans       → positive values are liabilities (amount owed).
 *     We store them as positive numbers and let the consumer subtract.
 */

export type AccountGroup =
  | "cash"
  | "investments"
  | "loans"
  | "credit_cards"
  | "other";

export type AccountSource = "plaid" | "mx" | "manual";

export interface NormalizedAccount {
  /** App-internal id (plaidAccounts.id / mxAccounts.id / manualAccounts.id) */
  id: string;
  /** Display name (account nickname or official name) */
  name: string;
  /** Institution shown in the metadata row; null for manual */
  institutionName: string | null;
  /** Last 4 digits for the metadata row; null when not available */
  mask: string | null;
  /** Provider-specific raw type (for fallback rendering and debugging) */
  rawType: string;
  /** Provider-specific subtype */
  subtype: string | null;
  /** Normalized Monarch-style bucket */
  group: AccountGroup;
  /** Balance in the account's currency, as a number (may be negative) */
  balance: number;
  /** Credit limit when applicable (credit cards, LOC) */
  limit: number | null;
  /** Currency code, best-effort */
  currency: string;
  /** Where this account came from */
  source: AccountSource;
  /** ISO timestamp of last successful sync, if any */
  lastSynced: string | null;
  /** Whether provider marks this account as active */
  isActive: boolean;
}

const toNumber = (v: string | number | null | undefined, fallback = 0): number => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const lc = (s: string | null | undefined) => (s ?? "").toLowerCase();

/** Map Plaid `type` + `subtype` onto a Monarch-style bucket. */
export function classifyPlaid(type: string, subtype: string | null): AccountGroup {
  const t = lc(type);
  const s = lc(subtype);
  if (t === "depository") return "cash";
  if (t === "credit") return "credit_cards";
  if (t === "loan") return "loans";
  if (t === "investment" || t === "brokerage") return "investments";
  // Plaid "other" — try subtype first
  if (s.includes("mortgage") || s.includes("loan")) return "loans";
  if (s.includes("credit")) return "credit_cards";
  return "other";
}

/** Map MX type onto a Monarch-style bucket. */
export function classifyMx(type: string, subtype: string | null): AccountGroup {
  const t = lc(type);
  const s = lc(subtype);
  if (t === "checking" || t === "savings" || t === "cash" || t === "money_market" || t === "prepaid") return "cash";
  if (t === "credit_card" || t === "line_of_credit") return "credit_cards";
  if (t === "loan" || t === "mortgage") return "loans";
  if (t === "investment" || t === "brokerage" || t === "retirement" || t === "ira" || t === "401k") return "investments";
  if (s.includes("mortgage") || s.includes("loan")) return "loans";
  return "other";
}

/** Map manual account type onto a Monarch-style bucket. */
export function classifyManual(type: string): AccountGroup {
  const t = lc(type);
  if (t === "cash" || t === "paypal" || t === "venmo" || t === "chequing" || t === "savings") return "cash";
  if (t === "credit_card" || t === "credit") return "credit_cards";
  if (t === "loan" || t === "mortgage" || t === "student_loan" || t === "auto_loan") return "loans";
  if (t === "investment" || t === "brokerage" || t === "retirement") return "investments";
  return "other";
}

/** Sign-aware balance: loans/credit cards count as liabilities. */
export function signedBalance(a: NormalizedAccount): number {
  return a.group === "loans" || a.group === "credit_cards" ? -a.balance : a.balance;
}

export interface NormalizeInput {
  plaidGroups: Array<{
    institutionName: string | null;
    accounts: Array<{
      id: string;
      name: string;
      officialName: string | null;
      type: string;
      subtype: string | null;
      mask: string | null;
      balanceCurrent: string | null;
      balanceLimit: string | null;
      isoCurrencyCode: string | null;
      lastSynced: string | null;
      isActive: string | null;
    }>;
  }>;
  mxMembers: Array<{
    institutionName: string;
    accounts: Array<{
      id: string;
      name: string;
      type: string;
      subtype: string | null;
      balance: string | null;
      creditLimit: string | null;
      currencyCode: string | null;
      mask: string | null;
      lastSynced: string | null;
      isActive: string | null;
    }>;
  }>;
  manualAccounts: Array<{
    id: string;
    name: string;
    type: string;
    balance: string | null;
    currency: string | null;
    isActive: string | null;
  }>;
}

export function normalizeAllAccounts(input: NormalizeInput): NormalizedAccount[] {
  const out: NormalizedAccount[] = [];

  for (const group of input.plaidGroups) {
    for (const a of group.accounts) {
      if (a.isActive === "false") continue;
      out.push({
        id: a.id,
        name: a.name || a.officialName || "Account",
        institutionName: group.institutionName,
        mask: a.mask,
        rawType: a.type,
        subtype: a.subtype,
        group: classifyPlaid(a.type, a.subtype),
        balance: toNumber(a.balanceCurrent),
        limit: a.balanceLimit !== null && a.balanceLimit !== "" ? toNumber(a.balanceLimit) : null,
        currency: a.isoCurrencyCode || "USD",
        source: "plaid",
        lastSynced: a.lastSynced,
        isActive: a.isActive !== "false",
      });
    }
  }

  for (const m of input.mxMembers) {
    for (const a of m.accounts) {
      if (a.isActive === "false") continue;
      out.push({
        id: a.id,
        name: a.name || "Account",
        institutionName: m.institutionName,
        mask: a.mask,
        rawType: a.type,
        subtype: a.subtype,
        group: classifyMx(a.type, a.subtype),
        balance: toNumber(a.balance),
        limit: a.creditLimit !== null && a.creditLimit !== "" ? toNumber(a.creditLimit) : null,
        currency: a.currencyCode || "USD",
        source: "mx",
        lastSynced: a.lastSynced,
        isActive: a.isActive !== "false",
      });
    }
  }

  for (const a of input.manualAccounts) {
    if (a.isActive === "false") continue;
    out.push({
      id: a.id,
      name: a.name,
      institutionName: null,
      mask: null,
      rawType: a.type,
      subtype: null,
      group: classifyManual(a.type),
      balance: toNumber(a.balance),
      limit: null,
      currency: a.currency || "USD",
      source: "manual",
      lastSynced: null,
      isActive: a.isActive !== "false",
    });
  }

  return out;
}

export const GROUP_LABELS: Record<AccountGroup, string> = {
  cash: "Cash",
  investments: "Investments",
  credit_cards: "Credit Cards",
  loans: "Loans",
  other: "Other",
};

/** Display order in both the by-type view and the summary sidebar. */
export const GROUP_ORDER: AccountGroup[] = ["cash", "investments", "credit_cards", "loans", "other"];

export interface GroupedAccounts {
  group: AccountGroup;
  label: string;
  accounts: NormalizedAccount[];
  /** Sum of raw balances (positive numbers — the "size" of the group) */
  rawTotal: number;
  /** Sign-aware total — subtract liabilities. Matches net-worth semantics. */
  signedTotal: number;
}

export function groupByType(accounts: NormalizedAccount[]): GroupedAccounts[] {
  const buckets = new Map<AccountGroup, NormalizedAccount[]>();
  for (const g of GROUP_ORDER) buckets.set(g, []);
  for (const a of accounts) buckets.get(a.group)!.push(a);

  return GROUP_ORDER
    .map((group) => {
      const list = buckets.get(group)!;
      const rawTotal = list.reduce((sum, a) => sum + a.balance, 0);
      const signedTotal = list.reduce((sum, a) => sum + signedBalance(a), 0);
      return {
        group,
        label: GROUP_LABELS[group],
        accounts: list,
        rawTotal,
        signedTotal,
      };
    })
    .filter((g) => g.accounts.length > 0);
}

/** Totals used by both the summary sidebar and the CSV exporter. */
export interface BalanceSheet {
  assets: number;
  liabilities: number;
  netWorth: number;
  byGroup: Record<AccountGroup, number>;
}

export function computeBalanceSheet(accounts: NormalizedAccount[]): BalanceSheet {
  const byGroup: Record<AccountGroup, number> = {
    cash: 0,
    investments: 0,
    credit_cards: 0,
    loans: 0,
    other: 0,
  };
  let assets = 0;
  let liabilities = 0;
  for (const a of accounts) {
    byGroup[a.group] += a.balance;
    if (a.group === "loans" || a.group === "credit_cards") {
      liabilities += a.balance;
    } else {
      assets += a.balance;
    }
  }
  return { assets, liabilities, netWorth: assets - liabilities, byGroup };
}
