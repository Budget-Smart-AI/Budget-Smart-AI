/**
 * Category module barrel.
 *
 * Single entry point so callers don't need to know which file each helper
 * lives in. Import from `server/lib/financial-engine/categories`.
 *
 * Wiring status (as of 2026-04-15):
 *   - Module is foundational, not yet called from `expenses.ts`, `income.ts`,
 *     or any adapter. Subsequent commits in the Monarch-alignment rollout
 *     will switch the engine modules to call `resolveCategory()` and the
 *     adapters to populate the new `pfcPrimary` / `mxCategory` etc. fields.
 *   - The legacy `EXPENSE_CATEGORIES` / `INCOME_CATEGORIES` enums in
 *     `shared/schema.ts` are unchanged. Existing user data continues to
 *     work. The migration is additive and incremental.
 */

export {
  MONARCH_CATEGORIES,
  MONARCH_CATEGORY_NAMES,
  MONARCH_GROUPS,
  SUBSCRIPTION_LIKE_CATEGORIES,
  TRANSFER_CATEGORIES,
  REFUND_CATEGORY,
  findMonarchCategory,
} from "./monarch-categories";
export type { MonarchCategoryDef, MonarchCategoryKind } from "./monarch-categories";

export {
  PLAID_DETAILED_TO_MONARCH,
  PLAID_PRIMARY_TO_MONARCH,
  PLAID_TRANSFER_PRIMARIES,
  plaidPfcToMonarch,
  isPlaidTransfer,
} from "./plaid-pfc-map";

export {
  MX_CATEGORY_TO_MONARCH,
  mxCategoryToMonarch,
  isMxTransfer,
} from "./mx-category-map";

export {
  resolveCategory,
  resolveCategoryDef,
  isTransfer,
  buildOverrideMap,
  normaliseMerchantKey,
} from "./resolver";
export type {
  CategorySignals,
  MerchantCategoryOverride,
  MerchantOverrideMap,
} from "./resolver";
