/**
 * Plaid Banking Adapter
 *
 * Converts Plaid-specific data into the normalized types used by the engine.
 *
 * Key Plaid conventions this adapter handles:
 * - amount < 0 = income/deposit (credit), amount > 0 = spending (debit)
 * - Account type/subtype hierarchy (e.g., "depository" / "checking")
 * - balanceCurrent vs balanceAvailable
 * - isActive stored as string "true" / "false"
 *
 * PFC fields exposed to the engine (added 2026-04-15 for Monarch alignment):
 * - pfcPrimary: Plaid PFC primary (FOOD_AND_DRINK, TRANSFER_OUT, etc.)
 * - pfcDetailed: Plaid PFC detailed (FOOD_AND_DRINK_GROCERIES, etc.)
 * The Monarch-aligned category resolver in
 * `server/lib/financial-engine/categories/` reads these to produce the
 * canonical Monarch category name without any keyword string-matching.
 */

import {
  BankingAdapter,
  NormalizedAccount,
  NormalizedTransaction,
  AccountCategory,
} from "../normalized-types";

// Categories that represent movement between accounts, not real income or expense.
// Includes both legacy Plaid basic-category strings ("transfer", "payment") AND
// PFC v2 primary enums ("TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS") because
// `tx.category` now stores the PFC primary since the 2026-04 sync refactor.
// UAT-6: TRANSFER_IN credits were leaking into actual-income sums, inflating
// the /income page by 30-50% for users with frequent bank-to-bank moves.
const TRANSFER_CATEGORIES = new Set([
  // Legacy Plaid basic categories
  "transfer",
  "credit card",
  "payment",
  "loan",
  "loan payments",
  "internal account transfer",
  // PFC v2 primary enums (lowercased for case-insensitive match)
  "transfer_in",
  "transfer_out",
  "loan_payments",
  "bank_fees",
]);

// PFC v2 detailed prefixes that represent non-income credits / non-expense debits.
// Used for prefix-based check when `tx.personalFinanceCategoryDetailed` is populated.
const TRANSFER_DETAILED_PREFIXES = [
  "TRANSFER_IN_",
  "TRANSFER_OUT_",
  "LOAN_PAYMENTS_",
  "BANK_FEES_",
];

/**
 * Map Plaid subtype → normalized AccountCategory
 *
 * UAT-6 P3-23: widened investment-subtype coverage. Plaid's taxonomy includes
 * far more retirement/brokerage subtypes than the original mapping handled
 * ("brokerage/401k/ira/rrsp" only). Accounts under those other subtypes were
 * falling through to "other" and therefore contributing $0 to the net-worth
 * Assets side. The canonical Plaid type for all investment/retirement
 * accounts is `type === "investment"`, so any tx with that type is now the
 * primary trigger — the subtype list is a belt-and-suspenders fallback for
 * Plaid quirks where `type` arrives empty or as something vendor-specific.
 */
const INVESTMENT_SUBTYPES = new Set([
  "brokerage", "cash management", "non-taxable brokerage account",
  "mutual fund", "stock plan", "trust", "ugma", "utma",
  // Retirement accounts (US + Canada + UK)
  "401a", "401k", "403b", "457b", "ira", "roth", "roth 401k",
  "sep ira", "simple ira", "sarsep", "keogh", "pension", "retirement",
  "profit sharing plan", "non-custodial wallet",
  "rrsp", "rssp", "rrif", "lif", "lira", "lrif", "lrsp", "prif", "rlif", "resp", "rdsp", "tfsa",
  "isa", "cash isa", "sipp",
  // Education & health-tax-advantaged
  "529", "education savings account", "hsa", "health reimbursement arrangement",
  // Annuities & insurance-linked
  "fixed annuity", "variable annuity", "other annuity",
  "life insurance", "other insurance",
  // Guarantees / fixed-income wrappers
  "gic",
]);

function mapPlaidAccountType(type?: string, subtype?: string): AccountCategory {
  const sub = (subtype || "").toLowerCase();
  const t = (type || "").toLowerCase();

  if (sub === "checking") return "checking";
  if (sub === "savings") return "savings";
  if (t === "depository") return "depository";
  if (t === "credit" || sub === "credit card") return "credit";
  if (sub === "line of credit" || sub === "line_of_credit") return "line_of_credit";
  if (sub === "mortgage") return "mortgage";
  if (t === "loan" || sub.includes("loan") || sub === "auto") return "loan";
  if (t === "investment" || t === "brokerage" || INVESTMENT_SUBTYPES.has(sub)) return "investment";
  return "other";
}

export class PlaidAdapter implements BankingAdapter {
  readonly providerName = "Plaid";

  normalizeAccounts(rawAccounts: any[]): NormalizedAccount[] {
    return rawAccounts.map((acc) => ({
      id: acc.id,
      name: acc.name || acc.officialName || "Plaid Account",
      accountType: mapPlaidAccountType(acc.type, acc.subtype),
      balance: parseFloat(String(acc.balanceCurrent ?? acc.balance ?? 0)) || 0,
      isActive: acc.isActive === true || acc.isActive === "true",
      provider: "Plaid",
    }));
  }

  normalizeTransactions(rawTransactions: any[]): NormalizedTransaction[] {
    return rawTransactions.map((tx) => {
      const rawAmount = parseFloat(String(tx.amount || 0));
      // Plaid: negative = credit (income), positive = debit (spending)
      const isCredit = rawAmount < 0;
      const amount = Math.abs(rawAmount);

      const category = tx.personalCategory || tx.category || "Other";
      const categoryLower = String(category).toLowerCase();

      // Resolve PFC detailed (uppercase, stable) for precise transfer/loan detection.
      const pfcDetailedRaw = tx.personalFinanceCategoryDetailed
        ? String(tx.personalFinanceCategoryDetailed).toUpperCase()
        : "";
      const isTransferByDetailed = pfcDetailedRaw !== "" &&
        TRANSFER_DETAILED_PREFIXES.some((p) => pfcDetailedRaw.startsWith(p));

      const isTransfer =
        tx.isTransfer === true ||
        tx.isTransfer === "true" ||
        TRANSFER_CATEGORIES.has(categoryLower) ||
        isTransferByDetailed;

      const isPending = tx.pending === true || tx.pending === "true";

      // PFC v2 income detection: counterpartyType "INCOME_SOURCE" identifies employers/gov payers.
      // Also check PFC primary category — if Plaid says it's income, trust that.
      // Note: we do NOT treat all credits as income — refunds, corrections, and
      // merchant credits are credits but not income. We rely on Plaid's PFC
      // classification and counterparty type for accurate income detection.
      const pfcPrimaryRaw = (tx.category || "").toUpperCase();
      const counterpartyType = tx.counterpartyType || null;
      const isIncomeByPFC = pfcPrimaryRaw === "INCOME";
      const isIncomeByCounterparty = counterpartyType === "INCOME_SOURCE";
      // Also check the mapped category for income-related keywords
      const isIncomeByCategory = /salary|payroll|income|wages|employment/i.test(category);
      // A credit is only income if Plaid explicitly classifies it as such,
      // OR the mapped category is income-related. Plain credits (refunds,
      // corrections, merchant credits) are NOT income.
      const isIncome = isIncomeByPFC || isIncomeByCounterparty || (isCredit && !isTransfer && isIncomeByCategory);

      // Expose Plaid PFC fields for the Monarch category resolver. The PFC
      // primary lives at `tx.category` (existing column), the detailed at
      // `tx.personalFinanceCategoryDetailed` (added during the enrichment
      // refactor in the `fix(enrichment)` commits earlier this month).
      // Both are nullable — the resolver tolerates absent fields.
      const pfcPrimary = pfcPrimaryRaw || null;
      const pfcDetailed = pfcDetailedRaw || null;

      return {
        id: tx.id,
        date: tx.date,
        amount,
        direction: isCredit ? "credit" : "debit",
        merchant: tx.counterpartyName || tx.merchantName || tx.name || "Unknown",
        category: String(category),
        isTransfer,
        isPending,
        isIncome,
        matchedExpenseId: tx.matchedExpenseId || undefined,
        matchType: tx.matchType || undefined,
        cadEquivalent: tx.cadEquivalent != null
          ? parseFloat(String(tx.cadEquivalent))
          : undefined,
        provider: "Plaid",
        // Provider category signals consumed by `categories/resolver.ts`.
        pfcPrimary,
        pfcDetailed,
      } as NormalizedTransaction;
    });
  }
}

export const plaidAdapter = new PlaidAdapter();
