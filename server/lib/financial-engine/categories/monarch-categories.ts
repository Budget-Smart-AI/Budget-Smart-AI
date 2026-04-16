/**
 * Monarch Money — Canonical Category Taxonomy
 *
 * BSAI's canonical category list, modeled on Monarch Money's default categories
 * so that BSAI's calculations and UI labels match what users coming from Monarch
 * (or comparing the two side-by-side) expect to see.
 *
 * Why a canonical list:
 *   - Plaid PFC and MX have different category taxonomies. Without a canonical
 *     middle layer, the UI shows different category names depending on which
 *     aggregator a transaction came from. That's confusing and breaks
 *     cross-account reporting.
 *   - Monarch's category set has been refined over ~5 years of real user
 *     feedback. Adopting it gives us a battle-tested taxonomy.
 *
 * Structure:
 *   - Each category belongs to exactly one Group (e.g., "Auto & Transport").
 *   - Groups roll up to either INCOME, EXPENSE, or TRANSFER (used to decide
 *     which engine modules consume the transaction).
 *
 * Backwards compatibility:
 *   - The legacy EXPENSE_CATEGORIES / INCOME_CATEGORIES enums in
 *     `shared/schema.ts` are NOT being removed. Existing user-entered Bills,
 *     Expenses, and Income rows continue to use those.
 *   - New transactions get an additional `monarchCategory` field populated
 *     by the resolver. UI and engine modules will migrate to read
 *     `monarchCategory` first, falling back to the legacy `category`.
 */

export type MonarchCategoryKind = "income" | "expense" | "transfer";

export interface MonarchCategoryDef {
  /** Canonical name shown to the user (matches Monarch's label). */
  name: string;
  /** Group the category rolls up to. */
  group: string;
  /** Kind for engine-side classification. */
  kind: MonarchCategoryKind;
  /**
   * If this category is "subscription-like" when it appears on a Recurring
   * series (used by the Recurring view to surface a "Subscriptions" filter
   * — Monarch model: subscriptions are not a distinct entity, just a filter
   * over Recurring entries in subscription-leaning categories).
   */
  subscriptionLike?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Income
// ────────────────────────────────────────────────────────────────────────────
const INCOME: MonarchCategoryDef[] = [
  { name: "Paychecks", group: "Income", kind: "income" },
  { name: "Interest", group: "Income", kind: "income" },
  { name: "Business Income", group: "Income", kind: "income" },
  { name: "Rental Income", group: "Income", kind: "income" },
  { name: "Investment Income", group: "Income", kind: "income" },
  { name: "Other Income", group: "Income", kind: "income" },
];

// ────────────────────────────────────────────────────────────────────────────
// Auto & Transport
// ────────────────────────────────────────────────────────────────────────────
const AUTO_TRANSPORT: MonarchCategoryDef[] = [
  { name: "Auto Payment", group: "Auto & Transport", kind: "expense" },
  { name: "Public Transit", group: "Auto & Transport", kind: "expense" },
  { name: "Gas", group: "Auto & Transport", kind: "expense" },
  { name: "Auto Maintenance", group: "Auto & Transport", kind: "expense" },
  { name: "Parking & Tolls", group: "Auto & Transport", kind: "expense" },
  { name: "Taxi & Ride Shares", group: "Auto & Transport", kind: "expense" },
];

// ────────────────────────────────────────────────────────────────────────────
// Housing
// ────────────────────────────────────────────────────────────────────────────
const HOUSING: MonarchCategoryDef[] = [
  { name: "Mortgage", group: "Housing", kind: "expense" },
  { name: "Rent", group: "Housing", kind: "expense" },
  { name: "Home Improvement", group: "Housing", kind: "expense" },
];

// ────────────────────────────────────────────────────────────────────────────
// Bills & Utilities
// ────────────────────────────────────────────────────────────────────────────
const BILLS_UTILITIES: MonarchCategoryDef[] = [
  { name: "Garbage", group: "Bills & Utilities", kind: "expense" },
  { name: "Water", group: "Bills & Utilities", kind: "expense" },
  { name: "Gas & Electric", group: "Bills & Utilities", kind: "expense" },
  { name: "Internet & Cable", group: "Bills & Utilities", kind: "expense", subscriptionLike: true },
  { name: "Phone", group: "Bills & Utilities", kind: "expense", subscriptionLike: true },
];

// ────────────────────────────────────────────────────────────────────────────
// Food & Dining
// ────────────────────────────────────────────────────────────────────────────
const FOOD_DINING: MonarchCategoryDef[] = [
  { name: "Groceries", group: "Food & Dining", kind: "expense" },
  { name: "Restaurants & Bars", group: "Food & Dining", kind: "expense" },
  { name: "Coffee Shops", group: "Food & Dining", kind: "expense" },
];

// ────────────────────────────────────────────────────────────────────────────
// Travel & Lifestyle
// ────────────────────────────────────────────────────────────────────────────
const TRAVEL_LIFESTYLE: MonarchCategoryDef[] = [
  { name: "Travel & Vacation", group: "Travel & Lifestyle", kind: "expense" },
  { name: "Entertainment & Recreation", group: "Travel & Lifestyle", kind: "expense" },
  { name: "Personal", group: "Travel & Lifestyle", kind: "expense" },
  { name: "Pets", group: "Travel & Lifestyle", kind: "expense" },
  { name: "Fun Money", group: "Travel & Lifestyle", kind: "expense" },
];

// ────────────────────────────────────────────────────────────────────────────
// Shopping
// ────────────────────────────────────────────────────────────────────────────
const SHOPPING: MonarchCategoryDef[] = [
  { name: "Shopping", group: "Shopping", kind: "expense" },
  { name: "Clothing", group: "Shopping", kind: "expense" },
  { name: "Furniture & Housewares", group: "Shopping", kind: "expense" },
  { name: "Electronics", group: "Shopping", kind: "expense" },
];

// ────────────────────────────────────────────────────────────────────────────
// Children
// ────────────────────────────────────────────────────────────────────────────
const CHILDREN: MonarchCategoryDef[] = [
  { name: "Child Care", group: "Children", kind: "expense" },
  { name: "Child Activities", group: "Children", kind: "expense" },
];

// ────────────────────────────────────────────────────────────────────────────
// Education
// ────────────────────────────────────────────────────────────────────────────
const EDUCATION: MonarchCategoryDef[] = [
  { name: "Student Loans", group: "Education", kind: "expense" },
  { name: "Education", group: "Education", kind: "expense", subscriptionLike: true },
];

// ────────────────────────────────────────────────────────────────────────────
// Health & Wellness
// ────────────────────────────────────────────────────────────────────────────
const HEALTH_WELLNESS: MonarchCategoryDef[] = [
  { name: "Medical", group: "Health & Wellness", kind: "expense" },
  { name: "Dentist", group: "Health & Wellness", kind: "expense" },
  { name: "Fitness", group: "Health & Wellness", kind: "expense", subscriptionLike: true },
];

// ────────────────────────────────────────────────────────────────────────────
// Financial
// ────────────────────────────────────────────────────────────────────────────
const FINANCIAL: MonarchCategoryDef[] = [
  { name: "Loan Repayment", group: "Financial", kind: "expense" },
  { name: "Financial & Legal Services", group: "Financial", kind: "expense" },
  { name: "Financial Fees", group: "Financial", kind: "expense" },
  { name: "Cash & ATM", group: "Financial", kind: "expense" },
  { name: "Insurance", group: "Financial", kind: "expense", subscriptionLike: true },
  { name: "Taxes", group: "Financial", kind: "expense" },
];

// ────────────────────────────────────────────────────────────────────────────
// Gifts & Donations
// ────────────────────────────────────────────────────────────────────────────
const GIFTS_DONATIONS: MonarchCategoryDef[] = [
  { name: "Gifts", group: "Gifts & Donations", kind: "expense" },
  { name: "Charity", group: "Gifts & Donations", kind: "expense" },
];

// ────────────────────────────────────────────────────────────────────────────
// Business
// ────────────────────────────────────────────────────────────────────────────
const BUSINESS: MonarchCategoryDef[] = [
  { name: "Advertising & Promotion", group: "Business", kind: "expense" },
  { name: "Business Utilities & Communication", group: "Business", kind: "expense" },
  { name: "Employee Wages & Contract Labor", group: "Business", kind: "expense" },
  { name: "Business Travel & Meals", group: "Business", kind: "expense" },
  { name: "Business Auto Expenses", group: "Business", kind: "expense" },
  { name: "Business Insurance", group: "Business", kind: "expense", subscriptionLike: true },
  { name: "Office Supplies & Expenses", group: "Business", kind: "expense" },
  { name: "Office Rent", group: "Business", kind: "expense" },
  { name: "Postage & Shipping", group: "Business", kind: "expense" },
];

// ────────────────────────────────────────────────────────────────────────────
// Subscriptions & Software (a Monarch group that catches subscription-likes)
// ────────────────────────────────────────────────────────────────────────────
const SUBSCRIPTIONS_SOFTWARE: MonarchCategoryDef[] = [
  { name: "Software & Tech", group: "Subscriptions & Software", kind: "expense", subscriptionLike: true },
  { name: "Streaming Services", group: "Subscriptions & Software", kind: "expense", subscriptionLike: true },
  { name: "Digital Media", group: "Subscriptions & Software", kind: "expense", subscriptionLike: true },
  { name: "Dues & Subscriptions", group: "Subscriptions & Software", kind: "expense", subscriptionLike: true },
];

// ────────────────────────────────────────────────────────────────────────────
// Transfers (kind: transfer — excluded from expense/income totals)
// ────────────────────────────────────────────────────────────────────────────
const TRANSFERS: MonarchCategoryDef[] = [
  { name: "Transfer", group: "Transfers", kind: "transfer" },
  { name: "Credit Card Payment", group: "Transfers", kind: "transfer" },
  { name: "Balance Adjustments", group: "Transfers", kind: "transfer" },
];

// ────────────────────────────────────────────────────────────────────────────
// Refunds & Returns (operator preference: separate surface, not netted in)
// ────────────────────────────────────────────────────────────────────────────
const REFUNDS_RETURNS: MonarchCategoryDef[] = [
  { name: "Refunds & Returns", group: "Refunds & Returns", kind: "income" },
];

// ────────────────────────────────────────────────────────────────────────────
// Other (catch-all — matches Monarch's behaviour)
// ────────────────────────────────────────────────────────────────────────────
const OTHER: MonarchCategoryDef[] = [
  { name: "Uncategorized", group: "Other", kind: "expense" },
  { name: "Check", group: "Other", kind: "expense" },
  { name: "Miscellaneous", group: "Other", kind: "expense" },
];

// ────────────────────────────────────────────────────────────────────────────
// Master list (export)
// ────────────────────────────────────────────────────────────────────────────

export const MONARCH_CATEGORIES: readonly MonarchCategoryDef[] = [
  ...INCOME,
  ...AUTO_TRANSPORT,
  ...HOUSING,
  ...BILLS_UTILITIES,
  ...FOOD_DINING,
  ...TRAVEL_LIFESTYLE,
  ...SHOPPING,
  ...CHILDREN,
  ...EDUCATION,
  ...HEALTH_WELLNESS,
  ...FINANCIAL,
  ...GIFTS_DONATIONS,
  ...BUSINESS,
  ...SUBSCRIPTIONS_SOFTWARE,
  ...TRANSFERS,
  ...REFUNDS_RETURNS,
  ...OTHER,
];

/** Just the canonical names, in display order. Useful for enums and pickers. */
export const MONARCH_CATEGORY_NAMES = MONARCH_CATEGORIES.map((c) => c.name);

/** Lookup a category def by name. Case-insensitive, returns undefined if not found. */
export function findMonarchCategory(name: string): MonarchCategoryDef | undefined {
  const target = name.trim().toLowerCase();
  return MONARCH_CATEGORIES.find((c) => c.name.toLowerCase() === target);
}

/** Get all unique group names in display order. */
export const MONARCH_GROUPS: readonly string[] = (() => {
  const seen = new Set<string>();
  const groups: string[] = [];
  for (const c of MONARCH_CATEGORIES) {
    if (!seen.has(c.group)) {
      seen.add(c.group);
      groups.push(c.group);
    }
  }
  return groups;
})();

/** Categories whose `subscriptionLike` flag is true. The Recurring view filters
 * by these to surface the "Subscriptions" tab without needing a separate entity. */
export const SUBSCRIPTION_LIKE_CATEGORIES: readonly string[] =
  MONARCH_CATEGORIES.filter((c) => c.subscriptionLike).map((c) => c.name);

/** Categories with kind === "transfer". Used to exclude from spending/income totals. */
export const TRANSFER_CATEGORIES: readonly string[] =
  MONARCH_CATEGORIES.filter((c) => c.kind === "transfer").map((c) => c.name);

/** The canonical name for refunds/returns (operator decision: separate surface). */
export const REFUND_CATEGORY = "Refunds & Returns";
