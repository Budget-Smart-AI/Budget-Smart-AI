/**
 * Income classification — deterministic, PFC-detailed-aware.
 *
 * One central function maps a credit transaction to a Budget Smart AI
 * INCOME_CATEGORIES value. Used by:
 *   - PlaidAdapter to populate `category` and `isIncome` on NormalizedTransaction
 *   - auto-reconciler to assign `category` when creating new income rows
 *   - the Income page Add-button heuristic
 *
 * The mapping prefers Plaid PFC detailed when available, then falls back to
 * counterparty type, then to amount-based heuristics, then to a safe default
 * of "Other" (NEVER "Salary" — the previous default that caused $0.72 interest
 * deposits to show up as Salary).
 *
 * Rules (first match wins):
 *   1. PFC detailed prefix → fixed mapping
 *      - INCOME_WAGES                       → "Salary"
 *      - INCOME_INTEREST_EARNED             → "Interest"
 *      - INCOME_DIVIDENDS                   → "Investments"
 *      - INCOME_RETIREMENT_PENSION          → "Other"
 *      - INCOME_TAX_REFUND                  → "Refunds"
 *      - INCOME_UNEMPLOYMENT                → "Other"
 *      - INCOME_OTHER_INCOME                → "Other"
 *   2. PFC primary === "INCOME" with no detailed match → "Other"
 *   3. counterpartyType === "INCOME_SOURCE" → "Salary"  (Plaid identified an
 *      employer / government payer)
 *   4. amount < $2 (or whatever AMOUNT_INTEREST_FLOOR is set to) → "Interest"
 *      (catches micro-interest deposits that lack PFC tagging)
 *   5. legacy keyword scan on raw category for the older accounts that
 *      pre-date PFC v2:
 *        salary | payroll | wages | employment → "Salary"
 *        interest                              → "Interest"
 *        dividend | invest                     → "Investments"
 *        refund                                → "Refunds"
 *   6. fallback → "Other"
 *
 * The function returns BOTH the chosen category and `isIncome` (true if this
 * credit should count toward the user's income totals; false for things like
 * pure refunds that we want to surface but not count). Refunds count as income
 * by default (Monarch convention) — set `treatRefundsAsIncome: false` to flip.
 */

export type IncomeCategoryName =
  | "Salary"
  | "Interest"
  | "Freelance"
  | "Business"
  | "Investments"
  | "Rental"
  | "Gifts"
  | "Refunds"
  | "Other";

export interface IncomeClassifierInput {
  /** Plaid PFC detailed (UPPERCASE_WITH_UNDERSCORES). */
  pfcDetailed?: string | null;
  /** Plaid PFC primary (e.g. "INCOME", "TRANSFER_IN"). */
  pfcPrimary?: string | null;
  /** Counterparty type from Plaid v2 ("INCOME_SOURCE", "MERCHANT", etc). */
  counterpartyType?: string | null;
  /** Absolute amount in dollars. Used for the <$2 interest heuristic. */
  amount: number;
  /** Whether this transaction is a credit (money in). Non-credits never get
   * classified as income. */
  isCredit: boolean;
  /** Whether this transaction was already flagged as a transfer. Transfers
   * are never income. */
  isTransfer: boolean;
  /** Raw category string from the legacy mapping (the column used pre-PFC).
   * Only consulted when PFC fields are absent. */
  legacyCategory?: string | null;
  /** Optional merchant string for affiliate/known-payer detection. */
  merchant?: string | null;
}

export interface IncomeClassifierResult {
  category: IncomeCategoryName;
  /** Whether this credit should count toward the user's income totals. */
  isIncome: boolean;
}

/** Threshold below which an unflagged credit is assumed to be interest. */
export const AMOUNT_INTEREST_FLOOR = 2.0;

/** Affiliate / partner payers that are common-enough to short-circuit
 *  to "Other" with isIncome=true. Keep small — most should arrive with
 *  PFC INCOME_OTHER_INCOME from Plaid already. */
const AFFILIATE_MERCHANT_PATTERNS: RegExp[] = [
  /amare/i,
  /clickbank/i,
  /amazon associates/i,
  /paypal.*payout/i,
];

/** Direct PFC-detailed → category map. Matched as exact string AND prefix.
 *
 * UAT-17 (2026-05-01): expanded to cover Plaid PFC v2 income subcategories
 * the original list missed. INCOME_SALARY is what Plaid actually returns
 * for Canadian payrolls (Scotiabank et al.) — its absence from this map
 * was the root cause of Coreslab/Roche showing $0 received in April /
 * March / earlier despite valid INCOME_SALARY-tagged transactions in
 * plaid_transactions. INCOME_BENEFITS / INCOME_GIG_ECONOMY / etc. were
 * also missing from the previous version.
 */
const PFC_DETAILED_MAP: Array<{ prefix: string; category: IncomeCategoryName }> = [
  { prefix: "INCOME_WAGES", category: "Salary" },
  { prefix: "INCOME_SALARY", category: "Salary" },
  { prefix: "INCOME_MILITARY", category: "Salary" },
  { prefix: "INCOME_INTEREST_EARNED", category: "Interest" },
  { prefix: "INCOME_DIVIDENDS", category: "Investments" },
  { prefix: "INCOME_RETIREMENT_PENSION", category: "Other" },
  { prefix: "INCOME_TAX_REFUND", category: "Refunds" },
  { prefix: "INCOME_UNEMPLOYMENT", category: "Other" },
  { prefix: "INCOME_OTHER_INCOME", category: "Other" },
  { prefix: "INCOME_BENEFITS", category: "Other" },
  { prefix: "INCOME_GIG_ECONOMY", category: "Freelance" },
  { prefix: "INCOME_RENTAL_INCOME", category: "Rental" },
  { prefix: "INCOME_CHILD_SUPPORT", category: "Other" },
  { prefix: "INCOME_ALIMONY", category: "Other" },
];

/**
 * Classify a credit transaction into an INCOME_CATEGORIES value.
 *
 * Returns category="Other" and isIncome=false for transactions that are not
 * credits or that are flagged as transfers.
 */
export function classifyIncomeTransaction(
  input: IncomeClassifierInput
): IncomeClassifierResult {
  // Non-credits and transfers are never income.
  if (!input.isCredit || input.isTransfer) {
    return { category: "Other", isIncome: false };
  }

  const pfcDetailedRaw = (input.pfcDetailed || "").toUpperCase().trim();
  const pfcPrimaryRaw = (input.pfcPrimary || "").toUpperCase().trim();

  // ── Rule 1: PFC detailed prefix match ─────────────────────────────────────
  if (pfcDetailedRaw) {
    for (const { prefix, category } of PFC_DETAILED_MAP) {
      if (pfcDetailedRaw.startsWith(prefix)) {
        return { category, isIncome: true };
      }
    }
  }

  // ── Rule 2: PFC primary INCOME with no detailed match → Other Income ──────
  if (pfcPrimaryRaw === "INCOME") {
    return { category: "Other", isIncome: true };
  }

  // ── Rule 3: Counterparty INCOME_SOURCE → Salary ───────────────────────────
  if ((input.counterpartyType || "").toUpperCase() === "INCOME_SOURCE") {
    return { category: "Salary", isIncome: true };
  }

  // ── Rule 4: Sub-$2 unflagged credit → Interest ────────────────────────────
  if (input.amount < AMOUNT_INTEREST_FLOOR) {
    return { category: "Interest", isIncome: true };
  }

  // ── Rule 5: Affiliate merchants → Other ───────────────────────────────────
  if (input.merchant) {
    for (const pattern of AFFILIATE_MERCHANT_PATTERNS) {
      if (pattern.test(input.merchant)) {
        return { category: "Other", isIncome: true };
      }
    }
  }

  // ── Rule 6: Legacy keyword scan (pre-PFC accounts) ────────────────────────
  const legacy = (input.legacyCategory || "").toLowerCase().trim();
  if (legacy) {
    if (/\b(salary|payroll|wages|employment|paycheck)\b/.test(legacy)) {
      return { category: "Salary", isIncome: true };
    }
    if (/\binterest\b/.test(legacy)) {
      return { category: "Interest", isIncome: true };
    }
    if (/\b(dividend|invest)/.test(legacy)) {
      return { category: "Investments", isIncome: true };
    }
    if (/\brefund\b/.test(legacy)) {
      return { category: "Refunds", isIncome: true };
    }
    if (/\bgift\b/.test(legacy)) {
      return { category: "Gifts", isIncome: true };
    }
    if (/\brent/.test(legacy)) {
      return { category: "Rental", isIncome: true };
    }
    if (/\bfreelanc/.test(legacy)) {
      return { category: "Freelance", isIncome: true };
    }
    if (/\bbusiness\b/.test(legacy)) {
      return { category: "Business", isIncome: true };
    }
  }

  // ── Rule 7: Fallback ──────────────────────────────────────────────────────
  // A credit we couldn't positively classify. Default is NOT income — refunds,
  // corrections, and merchant credits land here. The previous code's broad
  // /income/i regex was the bug that incorrectly counted these as income.
  return { category: "Other", isIncome: false };
}
