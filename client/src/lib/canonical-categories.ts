// ─── Canonical categories client lookup ──────────────────────────────────────
// §6.2.7 Phase B — single source of truth for category display on the client.
//
// The server's GET /api/categories returns a merged list of system canonicals
// (user_id IS NULL) and the current user's own custom rows (user_id = me).
// Each row carries display_name, color, and icon, so the UI never needs a
// hardcoded category map again.
//
// Usage:
//   const { displayName, color, icon } = useCategory(canonicalId);
//   const expenseOptions = useExpenseCategories();
//
// Mutations on user-owned categories invalidate the ['/api/categories'] key,
// which triggers an automatic refetch.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CanonicalCategory } from "@shared/schema";

const QUERY_KEY = ["/api/categories"] as const;

/** Fetch the merged system + user-owned category list. */
export function useCanonicalCategories() {
  return useQuery<CanonicalCategory[]>({
    queryKey: QUERY_KEY,
    // The default queryFn from queryClient.ts handles fetch + auth headers.
    // Refetch on window focus is fine — the list is short and rarely changes.
    staleTime: 60_000,
  });
}

/** Build a lookup map keyed on canonical id. */
export function useCategoryMap(): Map<string, CanonicalCategory> {
  const { data: categories = [] } = useCanonicalCategories();
  return useMemo(() => {
    const m = new Map<string, CanonicalCategory>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);
}

/** Resolve a single canonical id to its row. Returns undefined if unknown. */
export function useCategory(canonicalId: string | null | undefined) {
  const map = useCategoryMap();
  return canonicalId ? map.get(canonicalId) : undefined;
}

/**
 * The user-visible display string for a transaction.
 *
 * Resolution order:
 *   1. The canonical row's `display_name` (lookup via canonicalCategoryId).
 *   2. The legacy `category` text on the tx row, if still present.
 *   3. "Uncategorized" — last-ditch fallback for rows with neither.
 *
 * Once §6.2.8 drops the legacy `category` column, step 2 disappears and the
 * fallback to "Uncategorized" handles deleted-category cases.
 */
export interface TxLikeForCategory {
  canonicalCategoryId?: string | null;
  category?: string | null;
}

export function getCategoryDisplayName(
  tx: TxLikeForCategory | null | undefined,
  map: Map<string, CanonicalCategory>,
): string {
  if (!tx) return "Uncategorized";
  if (tx.canonicalCategoryId) {
    const row = map.get(tx.canonicalCategoryId);
    if (row) return row.displayName;
  }
  if (tx.category && tx.category.trim()) return tx.category;
  return "Uncategorized";
}

export function getCategoryColor(
  tx: TxLikeForCategory | null | undefined,
  map: Map<string, CanonicalCategory>,
  fallback = "#71717a",
): string {
  if (tx?.canonicalCategoryId) {
    const row = map.get(tx.canonicalCategoryId);
    if (row?.color) return row.color;
  }
  return fallback;
}

export function getCategoryIcon(
  tx: TxLikeForCategory | null | undefined,
  map: Map<string, CanonicalCategory>,
): string | null {
  if (tx?.canonicalCategoryId) {
    const row = map.get(tx.canonicalCategoryId);
    if (row?.icon) return row.icon;
  }
  return null;
}

/** Filtered views for category-picker dropdowns. */
export function useExpenseCategories(): CanonicalCategory[] {
  const { data = [] } = useCanonicalCategories();
  return useMemo(
    () => data.filter((c) => c.appliesToExpense && !c.isGroup),
    [data],
  );
}

export function useBillCategories(): CanonicalCategory[] {
  const { data = [] } = useCanonicalCategories();
  return useMemo(
    () => data.filter((c) => c.appliesToBill && !c.isGroup),
    [data],
  );
}

export function useIncomeCategories(): CanonicalCategory[] {
  const { data = [] } = useCanonicalCategories();
  return useMemo(
    () => data.filter((c) => c.appliesToIncome && !c.isGroup),
    [data],
  );
}

/** User-owned rows only (filter on user_id IS NOT NULL — set by server). */
export function useUserCategories(): CanonicalCategory[] {
  const { data = [] } = useCanonicalCategories();
  return useMemo(() => data.filter((c) => c.userId !== null), [data]);
}

/** System rows only. */
export function useSystemCategories(): CanonicalCategory[] {
  const { data = [] } = useCanonicalCategories();
  return useMemo(() => data.filter((c) => c.userId === null), [data]);
}
