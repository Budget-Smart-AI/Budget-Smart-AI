/**
 * Normalized Types — Aggregator-Agnostic Data Layer
 *
 * These types define the universal shapes that the financial engine works with.
 * Every banking aggregator (Plaid, MX, Finicity, or a future provider) maps its
 * data into these types via an adapter. The engine NEVER sees provider-specific
 * fields; when it needs a piece of provider-supplied intelligence (category,
 * merchant cleanup, income classification, item-health status) it asks the
 * adapter, not the raw row.
 *
 * To add a new aggregator:
 *   1. Create a new adapter file (e.g., adapters/finicity-adapter.ts)
 *   2. Implement BankingAdapter (all methods — `canonicalize*`, `classifyIncome`,
 *      `remapCategory`, `normalizeMerchant`, `normalizeItemStatus`)
 *   3. Register it in adapters/index.ts
 *   — zero changes to the engine, routes, or calling pages.
 *
 * Design rule: never add `provider === "Foo"` branching anywhere outside the
 * adapter file itself. If you feel the need to, extend the interface instead.
 */

// ─── Canonical enumerations (provider-agnostic) ───────────────────────────

/** Provider-neutral item / connection status. Every adapter maps its vendor-
 * specific status ("error", "login_required", "ITEM_LOGIN_REQUIRED",
 * "REAUTH_REQUIRED", "PENDING_EXPIRATION", "DISCONNECTED", etc.) down to one
 * of these four values. UI code keys off this set alone. */
export type ProviderItemStatus =
  | "healthy"
  | "reauth_required"
  | "error"
  | "disconnected";

/** Provider-neutral transaction-matching status used by the reconciler /
 *  duplicate-detection pipeline. Adapters don't populate this directly —
 *  it's set by the engine after running its matcher. */
export type MatchStatus = "unmatched" | "matched" | "suggested" | "rejected";

/** Canonical account categories. The complete set the engine works with. */
export type AccountCategory =
  | "checking"
  | "savings"
  | "depository"
  | "credit"
  | "credit_card"
  | "loan"
  | "mortgage"
  | "line_of_credit"
  | "investment"
  | "brokerage"
  | "other";

// ─── Normalized Transaction ───────────────────────────────────────────────

export interface NormalizedTransaction {
  /** Unique ID (provider-generated) */
  id: string;
  /** Transaction date in yyyy-MM-dd format */
  date: string;
  /**
   * Amount in dollars (always positive).
   * Use the `direction` field to determine debit vs credit.
   */
  amount: number;
  /** Whether this is money in or money out */
  direction: "credit" | "debit";
  /** Merchant or payee name — already cleaned by the adapter's
   * `normalizeMerchant` step. Do NOT strip prefixes downstream, that's
   * the adapter's job. */
  merchant: string;
  /** Resolved category name. Adapters set this to the canonical
   * Monarch-aligned category via `remapCategory`. Never a raw vendor enum. */
  category: string;
  /** Is this a transfer between the user's own accounts? */
  isTransfer: boolean;
  /** Is this transaction still pending? */
  isPending: boolean;
  /** Is this flagged as income by the provider's classifier? */
  isIncome: boolean;
  /** If this transaction is matched to a manual expense, the expense ID */
  matchedExpenseId?: string;
  /** Match status (unmatched / matched / etc.) */
  matchType?: string;
  /** CAD equivalent amount (for multi-currency support) */
  cadEquivalent?: number;
  /** The originating provider (for provenance / debugging ONLY — engine code
   *  must NOT branch on this). */
  provider: string;

  /** Resolved INCOME_CATEGORIES value when `isIncome === true`. Computed by
   * the adapter's `classifyIncome` method and used by the auto-reconciler
   * when creating new income rows so we never default to "Salary" for
   * interest, dividends, or affiliate credits. Null for non-income rows. */
  incomeCategory?: string | null;

  /** Confidence score for the resolved category (0–1). Adapters that have
   *  high-confidence taxonomies (Plaid PFC v2, MX topLevelCategory) set this
   *  to 1.0; legacy keyword matches fall to 0.5. Consumers can use this to
   *  flag low-confidence categorizations for manual review. */
  categoryConfidence?: number;

  /** Raw provider category for audit / debugging only. Do NOT use for
   *  business logic — always read `category` instead. Adapters expose this
   *  so support can see what the vendor originally returned. */
  rawProviderCategory?: string | null;

  /** Optional free-form signals surfaced by the adapter so downstream
   *  classifiers (e.g. the income-registry classifier) can refine a
   *  decision beyond the canonical `category` / `incomeCategory` values.
   *
   *  This map is intentionally loose — the engine never reads specific
   *  keys; only specialised modules (registry-classifier) check for
   *  optional hints like `pfcDetailed`, `pfcPrimary`, `mxTopLevel`. If a
   *  future adapter has no signals to share, leave this undefined. */
  providerSignals?: Record<string, string | null | undefined>;
}

// ─── Normalized Account ───────────────────────────────────────────────────

export interface NormalizedAccount {
  /** Unique ID */
  id: string;
  /** Human-readable account name */
  name: string;
  /** Standardized account category */
  accountType: AccountCategory;
  /** Current balance in dollars (positive = asset, negative = liability is OK) */
  balance: number;
  /** Whether the user has enabled this account in the app */
  isActive: boolean;
  /** The originating provider (for provenance / debugging ONLY). */
  provider: string;
  /** Canonical item / connection status. Adapters map their vendor-specific
   *  strings down to this enum. `undefined` ≈ "healthy" for manual accounts. */
  itemStatus?: ProviderItemStatus;
  /** Human-readable institution name (bank name, brokerage name). */
  institutionName?: string | null;
  /** Last 4 digits / mask if the provider surfaces one. */
  mask?: string | null;
  /** Credit limit for credit/line-of-credit accounts, dollars. */
  creditLimit?: number | null;
  /** Last successful sync timestamp (ISO string). */
  lastSyncedAt?: string | null;
}

// ─── Classifier input / output shapes ─────────────────────────────────────

export interface ClassifyIncomeInput {
  amount: number;
  isCredit: boolean;
  isTransfer: boolean;
  legacyCategory?: string | null;
  merchant?: string | null;
  /** Free-form provider signals (PFC fields, MX category strings, etc.).
   *  Adapters populate what they have; shared classifier reads what's present. */
  providerSignals?: Record<string, string | null | undefined>;
}

export interface ClassifyIncomeResult {
  /** Resolved INCOME_CATEGORIES value. */
  category: string;
  /** Whether this credit should count as income. */
  isIncome: boolean;
}

// ─── Banking Adapter Interface ────────────────────────────────────────────

/**
 * Every aggregator implements this interface.
 *
 * The adapter is responsible for:
 * - Converting provider-specific fields to normalized types
 * - Handling sign conventions (Plaid's negative-is-income, etc.)
 * - Mapping provider categories to canonical app categories
 * - Cleaning merchant strings (POS prefix stripping, brand aliasing)
 * - Classifying income
 * - Mapping item/connection status to the provider-neutral enum
 */
export interface BankingAdapter {
  /** Human-readable provider name (e.g. "Plaid", "MX", "Manual"). */
  readonly providerName: string;

  /** Normalize raw account rows to NormalizedAccount. */
  normalizeAccounts(rawAccounts: any[]): NormalizedAccount[];

  /** Normalize raw transaction rows to NormalizedTransaction. */
  normalizeTransactions(rawTransactions: any[]): NormalizedTransaction[];

  /** Map this provider's raw category string to the canonical Monarch-aligned
   *  category name. Returns `"Uncategorized"` when the provider has no data.
   *  Called by `normalizeTransactions` internally and exposed for one-off
   *  re-categorization flows (user-initiated recategorize, bulk cleanup). */
  remapCategory(rawCategory: string | null | undefined, signals?: Record<string, string | null | undefined>): {
    category: string;
    confidence: number;
  };

  /** Clean up merchant string: strip vendor-specific noise (Plaid "Apos/"
   *  prefix, MX duplicate suffixes, bare card numbers, etc.). Idempotent.
   *  If the adapter has nothing to add it should return the input unchanged. */
  normalizeMerchant(rawMerchant: string | null | undefined): string;

  /** Map a vendor-specific item / connection status string to the
   *  provider-neutral enum. Used by the bank-accounts alert banner. */
  normalizeItemStatus(rawStatus: string | null | undefined): ProviderItemStatus;

  /** Classify whether a credit is income and which income bucket it belongs
   *  to. Delegates to the shared classifier for Plaid PFC + MX +
   *  manual-with-keywords, but adapters can override for provider-specific
   *  shortcuts. */
  classifyIncome(input: ClassifyIncomeInput): ClassifyIncomeResult;
}
