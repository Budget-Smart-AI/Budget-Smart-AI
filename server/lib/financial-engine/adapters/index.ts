/**
 * Banking Adapter Registry
 *
 * Central export for all banking adapters.
 *
 * To add a new aggregator:
 *   1. Create a new adapter (e.g., basiq-adapter.ts for Australia)
 *   2. Export the singleton instance here
 *   3. Use it in the engine routes when fetching that provider's data
 *
 * The engine itself never imports these adapters — only the route layer does.
 * The engine only sees NormalizedTransaction[] and NormalizedAccount[].
 */

export { plaidAdapter } from "./plaid-adapter";
export { mxAdapter } from "./mx-adapter";
export { manualAdapter } from "./manual-adapter";

// Re-export types for convenience
export type {
  BankingAdapter,
  NormalizedTransaction,
  NormalizedAccount,
  AccountCategory,
} from "../normalized-types";