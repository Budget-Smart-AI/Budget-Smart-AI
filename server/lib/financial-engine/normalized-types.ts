/**
 * Normalized Types — Aggregator-Agnostic Data Layer
 *
 * These types define the universal shapes that the financial engine works with.
 * Every banking aggregator (Plaid, MX, or a future provider) maps its data
 * into these types via an adapter. The engine NEVER sees provider-specific fields.
 *
 * To add a new aggregator:
 *   1. Create a new adapter file (e.g., adapters/acme-adapter.ts)
 *   2. Implement BankingAdapter
 *   3. Register it in adapters/index.ts
 *   — zero changes to the engine or routes.
 */

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
  /** Merchant or payee name */
  merchant: string;
  /** Expense category (normalized to app categories if possible) */
  category: string;
  /** Is this a transfer between the user's own accounts? */
  isTransfer: boolean;
  /** Is this transaction still pending? */
  isPending: boolean;
  /** Is this flagged as income by the provider? */
  isIncome: boolean;
  /** If this transaction is matched to a manual expense, the expense ID */
  matchedExpenseId?: string;
  /** Match status (unmatched / matched / etc.) */
  matchType?: string;
  /** CAD equivalent amount (for multi-currency support) */
  cadEquivalent?: number;
  /** The originating provider (for provenance, NOT for logic branching) */
  provider: string;
}

// ─── Normalized Account ───────────────────────────────────────────────────

export type AccountCategory =
  | "checking"
  | "savings"
  | "depository"
  | "credit"
  | "loan"
  | "mortgage"
  | "credit_card"
  | "line_of_credit"
  | "investment"
  | "other";

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
  /** The originating provider (for provenance, NOT for logic branching) */
  provider: string;
}

// ─── Banking Adapter Interface ────────────────────────────────────────────

/**
 * Every aggregator implements this interface.
 *
 * The adapter is responsible for:
 * - Converting provider-specific fields to normalized types
 * - Handling sign conventions (Plaid's negative-is-income, etc.)
 * - Mapping provider categories to app categories
 * - Resolving pending/transfer flags from provider-specific fields
 */
export interface BankingAdapter {
  /** Human-readable provider name (e.g. "Plaid", "MX", "Basiq") */
  readonly providerName: string;

  /**
   * Normalize an array of raw accounts from the provider.
   * @param rawAccounts - Provider-specific account objects
   * @returns Array of NormalizedAccount
   */
  normalizeAccounts(rawAccounts: any[]): NormalizedAccount[];

  /**
   * Normalize an array of raw transactions from the provider.
   * @param rawTransactions - Provider-specific transaction objects
   * @returns Array of NormalizedTransaction
   */
  normalizeTransactions(rawTransactions: any[]): NormalizedTransaction[];
}
