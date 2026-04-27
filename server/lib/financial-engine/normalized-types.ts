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
  /** Unique ID — our internal DB row UUID (plaid_transactions.id, etc.).
   *  Adapters set this to the local row's primary key. */
  id: string;
  /**
   * Provider-issued transaction id — Plaid `transaction_id`, MX
   * `transaction_guid`. Distinct from `id` (which is our internal UUID).
   * Populated by adapters; null for manual entries. Used by Phase 3
   * stream-membership matching: NormalizedRecurringStream.rawTransactionIds
   * holds provider ids, so the period calculator looks up by this field.
   */
  providerTransactionId?: string | null;
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
  /** §6.2.7-prep: canonical_category_id slug from canonical_categories.
   * Adapters pull this directly off the source row (`tx.canonicalCategoryId`)
   * since Phase A's INSERT-time dual-write populates it. NULL is allowed
   * for rows the resolver couldn't map at insert time; the engine buckets
   * those under '__uncategorized__' in byCategory aggregations. */
  canonicalCategoryId?: string | null;
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

  /**
   * Provider-First SSOT (added 2026-04-26 — see PROVIDER_FIRST_SSOT_STRATEGY.md).
   *
   * Return all recurring inflow + outflow streams the provider has detected for
   * this user. Replaces our home-grown recurring-income-detector.ts and
   * bill-detection.ts — Plaid's `/transactions/recurring/get` and MX's
   * recurring_transactions endpoint do this with ML trained on tens of
   * millions of accounts; we just normalize their output to one shape.
   *
   * Implementations:
   *   - PlaidAdapter: calls `/transactions/recurring/get` per Plaid item,
   *     merges inflow_streams + outflow_streams from the response.
   *   - MxAdapter: calls MX's recurring transactions endpoint per member.
   *   - ManualAdapter: synthesizes streams from user-flagged income/bills
   *     rows (no provider-side detection — manual entries are user-driven).
   */
  getRecurringStreams(userId: string): Promise<NormalizedRecurringStream[]>;
}

// ─── Normalized Recurring Stream ──────────────────────────────────────────
//
// Provider-First SSOT shape (added 2026-04-26). Every provider's recurring
// detection collapses into this single type. Downstream code (period
// calculator, Income page, wizard, AI snapshot, Forecast) reads from this —
// never from raw provider data.
//
// Maps directly from:
//   - Plaid `/transactions/recurring/get` response (inflow_streams[] + outflow_streams[])
//   - MX `/users/{user}/recurring_transactions` response
//   - Manual income_sources / bills rows the user explicitly created

/** Recurring frequency, normalized across providers. */
export type RecurringStreamFrequency =
  | "weekly"
  | "biweekly"
  | "semi-monthly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "irregular"
  | null;

/** Stream lifecycle stage. Mirrors Plaid's status enum (it's the most
 * granular); MX states map onto it; manual entries are always "active". */
export type RecurringStreamStatus =
  | "early_detection"  // < 3 occurrences (Plaid's pre-mature stage)
  | "active"            // current and being observed
  | "mature"            // ≥ 3 occurrences with stable cadence
  | "late"              // expected occurrence missed
  | "tombstoned";       // user dismissed (soft delete — see strategy §8.2)

/** Plaid's confidence_level values, harmonised across providers. */
export type RecurringStreamConfidence =
  | "very_high"
  | "high"
  | "medium"
  | "low";

export interface NormalizedRecurringStream {
  /** Provider-stable id. Plaid `stream_id`, MX recurring guid, or
   *  `manual-income-{rowId}` / `manual-bill-{rowId}` for manual entries. */
  streamId: string;
  /** Originating provider (provenance / debugging only — caller code MUST
   *  NOT branch on this). */
  providerSource: "plaid" | "mx" | "manual";
  /** Which Plaid item / MX member / "manual" pseudo-item this stream
   *  belongs to. Used to scope webhook re-fetches to a single item. */
  itemId: string;
  /** Account the stream lands in. Must match a NormalizedAccount.id. */
  accountId: string;
  /** Inflow = income (paychecks, dividends, gig payouts).
   *  Outflow = bills + subscriptions. */
  direction: "inflow" | "outflow";
  /** Display merchant name (provider-cleaned). For Plaid this is
   *  `merchant_name` from the stream payload; for MX, the recurring
   *  transaction's merchant.name; for manual, the user-entered source. */
  merchant: string;
  /** Canonical merchant id (Plaid `entity_id`, MX `merchant.guid`, null
   *  for manual). Used by tombstone-resurfacing logic to recognise a
   *  Plaid-renamed stream as the same logical merchant. */
  merchantId: string | null;
  /** Canonical category id (resolved through the adapter's remapCategory). */
  category: string;
  /** Raw provider category for debugging — `INCOME_WAGES`, `Subscriptions`,
   *  etc. Don't use for branching; downstream reads `category`. */
  rawProviderCategory: string;
  /** Cadence inferred or asserted by the provider. */
  frequency: RecurringStreamFrequency;
  /** Lifecycle stage (mature / active / etc.). Drives auto-promotion gate. */
  status: RecurringStreamStatus;
  /** Provider's confidence in this stream. very_high+mature = auto-promote
   *  candidate (per strategy §8.1 decision). */
  confidence: RecurringStreamConfidence;
  /** Most recent occurrence amount, in dollars (always positive). */
  lastAmount: number;
  /** Average across observed occurrences. Equal to lastAmount for streams
   *  with one occurrence. */
  averageAmount: number;
  /** Most recent occurrence date (yyyy-MM-dd). */
  lastDate: string;
  /** Provider-predicted next occurrence date (yyyy-MM-dd) when known. Plaid
   *  populates this; MX may; manual leaves null and the period calculator
   *  computes from frequency + lastDate instead. */
  nextExpectedDate: string | null;
  /** Number of observed occurrences in the detection window. */
  occurrenceCount: number;
  /** Provider says this stream is currently active. Tombstoned streams set
   *  this false at the registry layer (provider may still report active). */
  isActive: boolean;
  /** Member transaction ids comprising this stream. Used to highlight
   *  recurring rows in transaction lists without storing a per-tx flag
   *  (per strategy §8.4 decision — no `recurring_indicator` column). */
  rawTransactionIds: string[];
}

// ─── Normalized Merchant ──────────────────────────────────────────────────
//
// Provider-First SSOT shape (added 2026-04-26). Cleaned merchant data
// already provided by Plaid (`counterparties[0]` / `merchant_name`) and MX
// (`merchant`). Replaces most of the AI-driven merchant-enricher path —
// see strategy §1.5.

export interface NormalizedMerchant {
  /** Canonical merchant id from the provider. Plaid `entity_id`, MX
   *  `merchant.guid`. Null when the provider has no canonical id (free-form
   *  manual entries, ATM ops, etc.). */
  entityId: string | null;
  /** Display name — already cleaned. "Starbucks" not "TST*STARBUCKS #1234". */
  cleanName: string;
  /** Logo URL when the provider supplied one. */
  logoUrl: string | null;
  /** Merchant website URL when supplied. */
  websiteUrl: string | null;
  /** Canonical category id the merchant typically classifies into. */
  category: string;
  /** Confidence in the merchant data. Maps from Plaid
   *  `personal_finance_category.confidence_level`. */
  confidence: RecurringStreamConfidence;
}
