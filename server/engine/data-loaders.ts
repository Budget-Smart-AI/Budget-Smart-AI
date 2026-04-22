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

  return all;
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

  // Plaid
  for (const userId of userIds) {
    const plaidItems = await EngineStorage.getPlaidItems(userId);
    for (const item of plaidItems) {
      const raw = await EngineStorage.getPlaidAccounts(item.id);
      const activeIds = raw.filter((a) => a.isActive === "true").map((a) => a.id);
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
