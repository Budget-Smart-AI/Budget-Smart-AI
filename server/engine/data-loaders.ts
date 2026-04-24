/**
 * Engine data loaders — provider-agnostic normalized fetchers.
 *
 * The engine operates on NormalizedAccount and NormalizedTransaction types,
 * not provider-specific shapes. These loaders fan out across every connected
 * provider (Plaid, MX, Manual, plus any future provider added as an adapter)
 * and return a single unified array.
 *
 * Adding a new banking aggregator:
 *   1. Add its adapter to server/lib/financial-engine/adapters/
 *   2. Extend EngineStorage with methods to read its raw data
 *   3. Add a block here that fetches + normalizes via the adapter
 *   4. No route-level changes needed.
 */
import { format } from "date-fns";
import { EngineStorage } from "./storage";
import { plaidAdapter } from "../lib/financial-engine/adapters/plaid-adapter";
import { mxAdapter } from "../lib/financial-engine/adapters/mx-adapter";
import { manualAdapter } from "../lib/financial-engine/adapters/manual-adapter";
import type {
  NormalizedAccount,
  NormalizedTransaction,
} from "../lib/financial-engine/normalized-types";

/**
 * All active bank/investment/manual accounts across every provider,
 * normalized into a single array.
 */
export async function getAllNormalizedAccounts(
  userIds: string[]
): Promise<NormalizedAccount[]> {
  const all: NormalizedAccount[] = [];

  for (const userId of userIds) {
    const plaidItems = await EngineStorage.getPlaidItems(userId);
    for (const item of plaidItems) {
      const raw = await EngineStorage.getPlaidAccounts(item.id);
      // Inject the parent plaid_item's status + institution into each account
      // so the adapter can surface connection-health to the UI (UAT-8 #142).
      // plaid_accounts has no status column — it lives only on plaid_items.
      const enriched = raw.map((acc: any) => ({
        ...acc,
        itemStatus: item.status ?? "active",
        plaidItemInstitutionName: item.institutionName ?? null,
        plaidItemId: item.id,
      }));
      all.push(...plaidAdapter.normalizeAccounts(enriched));
    }
  }

  for (const userId of userIds) {
    const rawMx = await EngineStorage.getMxAccountsByUserId(userId);
    all.push(...mxAdapter.normalizeAccounts(rawMx));
  }

  for (const userId of userIds) {
    const rawManual = await EngineStorage.getManualAccounts(userId);
    all.push(...manualAdapter.normalizeAccounts(rawManual));
  }

  return dedupeAccounts(all);
}

/**
 * Collapse accounts that point at the same underlying financial product.
 *
 * UAT-11 #110: Ryan's Scotia mortgage appeared twice in every liability
 * surface — once at $95K, once at $1.05M. Root cause: Plaid re-issued the
 * `account_id` when the Item was reconnected in update mode, so the old
 * row stayed around (with a stale balance) and a new row was inserted
 * with the real balance. Both showed up because the engine unions by id
 * only.
 *
 * Dedup key: provider + institutionName + mask + accountType. This
 * matches the natural uniqueness of "this specific account at this
 * institution" without depending on Plaid's unstable account_id. Within
 * a group we keep the row with the most recent `lastSyncedAt` (current
 * balance), or — if that's missing — the row with the larger abs(balance)
 * because a stale mortgage reconnect typically shows a smaller balance
 * that only reflects accrued interest from the orphan period.
 *
 * Accounts that don't present a mask (manual accounts, some investment
 * types) are passed through unchanged — they have no dedup signal.
 */
function dedupeAccounts(accounts: NormalizedAccount[]): NormalizedAccount[] {
  const groups = new Map<string, NormalizedAccount[]>();
  const passthrough: NormalizedAccount[] = [];

  for (const acc of accounts) {
    const mask = acc.mask ?? null;
    const inst = acc.institutionName ?? null;
    if (!mask || !inst) {
      passthrough.push(acc);
      continue;
    }
    const key = `${acc.provider}::${inst}::${mask}::${acc.accountType}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(acc);
    groups.set(key, bucket);
  }

  const winners: NormalizedAccount[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length === 1) {
      winners.push(bucket[0]);
      continue;
    }
    // Score each candidate: prefer most recent lastSyncedAt, then larger
    // abs(balance) as a tiebreaker for the stale-reconnect case above.
    const sorted = bucket.slice().sort((a, b) => {
      const aSync = a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0;
      const bSync = b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0;
      if (bSync !== aSync) return bSync - aSync;
      return Math.abs(b.balance) - Math.abs(a.balance);
    });
    const winner = sorted[0];
    const duplicates = sorted.slice(1).map((a) => ({
      id: a.id,
      balance: a.balance,
      lastSyncedAt: a.lastSyncedAt,
    }));
    console.log("[engine.accounts] dedup — collapsed duplicate", {
      institution: winner.institutionName,
      mask: winner.mask,
      accountType: winner.accountType,
      provider: winner.provider,
      kept: { id: winner.id, balance: winner.balance, lastSyncedAt: winner.lastSyncedAt },
      dropped: duplicates,
    });
    winners.push(winner);
  }

  return [...winners, ...passthrough];
}

/**
 * All normalized transactions in a date range across every provider.
 * Only pulls from active accounts (isActive === "true").
 */
export async function getAllNormalizedTransactions(
  userIds: string[],
  startDate: Date | string,
  endDate: Date | string
): Promise<NormalizedTransaction[]> {
  const all: NormalizedTransaction[] = [];
  const startStr =
    typeof startDate === "string" ? startDate : format(startDate, "yyyy-MM-dd");
  const endStr =
    typeof endDate === "string" ? endDate : format(endDate, "yyyy-MM-dd");

  // Plaid.
  // UAT-11 #109 parity: match the adapter's soft-default semantics here so
  // transactions from accounts with null/undefined `is_active` columns
  // (rows created before the default was added) still flow through. The
  // strict `=== "true"` check was silently hiding transactions on older
  // accounts the same way it was hiding their balances.
  for (const userId of userIds) {
    const plaidItems = await EngineStorage.getPlaidItems(userId);
    for (const item of plaidItems) {
      const raw = await EngineStorage.getPlaidAccounts(item.id);
      const activeIds = raw
        .filter(
          (a) =>
            a.isActive !== false &&
            a.isActive !== "false" &&
            (a.isActive as any) !== 0 &&
            a.isActive !== "0",
        )
        .map((a) => a.id);
      if (activeIds.length > 0) {
        const rawTx = await EngineStorage.getPlaidTransactions(activeIds, {
          startDate: startStr,
          endDate: endStr,
        });
        all.push(...plaidAdapter.normalizeTransactions(rawTx));
      }
    }
  }

  // MX
  for (const userId of userIds) {
    const rawMx = await EngineStorage.getMxAccountsByUserId(userId);
    const activeIds = rawMx
      .filter((a: any) => a.isActive === "true" || a.isActive === true)
      .map((a: any) => a.id || a.guid);
    if (activeIds.length > 0) {
      const rawTx = await EngineStorage.getMxTransactions(activeIds, {
        startDate: startStr,
        endDate: endStr,
      });
      all.push(...mxAdapter.normalizeTransactions(rawTx));
    }
  }

  // Manual (per-user fetch — matches existing engine behaviour)
  for (const userId of userIds) {
    const rawManual = await EngineStorage.getManualTransactionsByUser(userId, {
      startDate: startStr,
      endDate: endStr,
    });
    all.push(...manualAdapter.normalizeTransactions(rawManual));
  }

  // Dedupe by transaction id — household members sharing an account can
  // otherwise produce duplicates.
  const seen = new Set<string>();
  const deduped: NormalizedTransaction[] = [];
  for (const tx of all) {
    if (!seen.has(tx.id)) {
      seen.add(tx.id);
      deduped.push(tx);
    }
  }
  return deduped;
}
