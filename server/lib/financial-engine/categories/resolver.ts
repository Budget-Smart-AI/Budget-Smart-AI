/**
 * Category resolver.
 *
 * Given a transaction (from any aggregator) and the user's merchant overrides,
 * return the canonical Monarch category name. The resolver applies a fixed
 * priority chain so callers don't need to know which signals exist for a
 * given transaction.
 *
 * Priority (first hit wins):
 *   1. **User merchant override** — if the user has manually re-categorised
 *      this merchant, that always wins. Stickiness is the whole point.
 *   2. **Provider PFC / MX category** — Plaid PFC detailed → primary → fallback,
 *      MX category → top-level fallback. The map files handle precedence
 *      within their own taxonomy.
 *   3. **Legacy BSAI category** — pre-Monarch-alignment categories that the
 *      adapter populated. We translate via `legacyToMonarch` if we know
 *      the mapping, otherwise we accept the legacy name as-is (it might
 *      already be a Monarch name, or close enough).
 *   4. **"Uncategorized"** — fallback so the resolver always returns something.
 *
 * The resolver is pure: same inputs → same output. Use it everywhere a
 * transaction needs to be categorised so the logic stays in one place.
 */

import { findMonarchCategory, MONARCH_CATEGORY_NAMES } from "./monarch-categories";
import {
  isPlaidTransfer,
  plaidPfcToMonarch,
  type MonarchCategoryDef,
} from "./plaid-pfc-map";
import { isMxTransfer, mxCategoryToMonarch } from "./mx-category-map";

/** Optional provider-category fields that adapters may populate on a
 * NormalizedTransaction. None are required; the resolver falls through to
 * the next signal when a field is absent. */
export interface CategorySignals {
  /** Plaid PFC primary category (e.g. `FOOD_AND_DRINK`). */
  pfcPrimary?: string | null;
  /** Plaid PFC detailed category (e.g. `FOOD_AND_DRINK_GROCERIES`). */
  pfcDetailed?: string | null;
  /** MX category (e.g. `Groceries`). */
  mxCategory?: string | null;
  /** MX top-level category (e.g. `Food & Dining`). */
  mxTopLevel?: string | null;
  /** The transaction's existing (legacy or already-resolved) category name. */
  category?: string | null;
  /** The merchant name (used to look up user overrides). */
  merchant?: string | null;
  /** The aggregator that produced this transaction. */
  provider?: string | null;
}

/** A user's merchant-level category override. */
export interface MerchantCategoryOverride {
  /** Lowercase, trimmed merchant name. The override matcher uses
   * exact-equality on this normalised key. */
  merchantKey: string;
  /** The Monarch category name to apply for this merchant. */
  monarchCategory: string;
}

/** Map from normalised merchant key → Monarch category. The resolver looks
 * up by `merchant.trim().toLowerCase()`. */
export type MerchantOverrideMap = ReadonlyMap<string, string>;

/** Build a MerchantOverrideMap from a list of overrides loaded from the DB. */
export function buildOverrideMap(
  overrides: readonly MerchantCategoryOverride[]
): MerchantOverrideMap {
  const map = new Map<string, string>();
  for (const o of overrides) {
    if (!o.merchantKey || !o.monarchCategory) continue;
    map.set(o.merchantKey.trim().toLowerCase(), o.monarchCategory);
  }
  return map;
}

/** Normalise a merchant string for override lookup. */
export function normaliseMerchantKey(merchant: string | null | undefined): string {
  return (merchant ?? "").trim().toLowerCase();
}

/**
 * Translate a few well-known legacy BSAI category names to their Monarch
 * equivalents. This isn't exhaustive — it just handles names where the
 * legacy spelling differs from Monarch's. For names that are already
 * Monarch-compatible (e.g. "Groceries"), we let them pass through.
 *
 * Add entries here as we discover legacy category names that don't exist
 * in MONARCH_CATEGORY_NAMES.
 */
const LEGACY_TO_MONARCH: Record<string, string> = {
  // Existing EXPENSE_CATEGORIES that need renaming
  "Restaurant & Bars": "Restaurants & Bars",
  "Healthcare": "Medical",
  "Electrical": "Gas & Electric",
  "Credit Card": "Credit Card Payment",
  "Maintenance": "Auto Maintenance",
  "Communications": "Internet & Cable",
  "Furniture & Houseware": "Furniture & Housewares",
  "Taxi & Ride Share": "Taxi & Ride Shares",
  // Income legacy categories
  "Salary": "Paychecks",
  "Freelance": "Business Income",
  "Business": "Business Income",
  "Investments": "Investment Income",
  "Rental": "Rental Income",
  "Refunds": "Refunds & Returns",
  // BSAI's old grab-bag
  "Other": "Miscellaneous",
};

/** True if `name` is exactly a Monarch canonical category name. */
function isKnownMonarchCategory(name: string): boolean {
  return MONARCH_CATEGORY_NAMES.includes(name);
}

/** Translate a legacy / unknown category name to Monarch. */
function legacyToMonarch(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (isKnownMonarchCategory(trimmed)) return trimmed;
  const remap = LEGACY_TO_MONARCH[trimmed];
  if (remap) return remap;
  // Try case-insensitive match against Monarch canonical list.
  const found = findMonarchCategory(trimmed);
  return found?.name ?? null;
}

/**
 * The main entry point. Given category signals and the user's merchant
 * overrides, return the Monarch canonical category name. Always returns a
 * known Monarch category name; falls back to "Uncategorized".
 */
export function resolveCategory(
  signals: CategorySignals,
  overrides: MerchantOverrideMap
): string {
  // 1. Merchant override (highest priority — user intent)
  const merchantKey = normaliseMerchantKey(signals.merchant);
  if (merchantKey) {
    const override = overrides.get(merchantKey);
    if (override && isKnownMonarchCategory(override)) return override;
  }

  // 2. Provider category map — Plaid first, then MX (most installations
  //    use one or the other for any given transaction; the order doesn't
  //    matter except we try Plaid first by convention).
  const plaidHit = plaidPfcToMonarch(signals.pfcDetailed, signals.pfcPrimary);
  if (plaidHit) return plaidHit;

  const mxHit = mxCategoryToMonarch(signals.mxCategory, signals.mxTopLevel);
  if (mxHit) return mxHit;

  // 3. Legacy / pre-existing category name
  if (signals.category) {
    const legacy = legacyToMonarch(signals.category);
    if (legacy) return legacy;
  }

  // 4. Final fallback
  return "Uncategorized";
}

/**
 * Convenience wrapper: returns the full Monarch category def (with group +
 * kind + subscriptionLike flags), not just the name. Useful for engine
 * modules that need to branch on `kind` (transfer / income / expense).
 */
export function resolveCategoryDef(
  signals: CategorySignals,
  overrides: MerchantOverrideMap
): MonarchCategoryDef {
  const name = resolveCategory(signals, overrides);
  const def = findMonarchCategory(name);
  if (def) return def;
  // Should be impossible because resolveCategory always returns a known name,
  // but guard anyway.
  return { name: "Uncategorized", group: "Other", kind: "expense" };
}

/**
 * Cross-provider transfer detection. Returns true if any of the available
 * signals indicate this transaction is a transfer between the user's own
 * accounts (and therefore should be excluded from spending and income totals).
 *
 * Used by `expenses.ts` and `income.ts` to filter transfers more reliably
 * than the legacy keyword-match approach.
 */
export function isTransfer(signals: CategorySignals): boolean {
  if (isPlaidTransfer(signals.pfcPrimary)) return true;
  if (isMxTransfer(signals.mxTopLevel)) return true;
  // Fall through to category name check (transfer-like Monarch names).
  if (signals.category) {
    const name = signals.category.trim().toLowerCase();
    if (
      name === "transfer" ||
      name === "credit card payment" ||
      name === "balance adjustments" ||
      name === "loan repayment"
    ) {
      return true;
    }
  }
  return false;
}
