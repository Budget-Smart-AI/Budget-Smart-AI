/**
 * Financial Snapshot Helper — shared financial context for AI endpoints.
 *
 * Background
 * ----------
 * Several AI endpoints under /api/ai/* (savings-advisor, chat, forecast,
 * suggest-budgets) historically rolled their own "pull income + expenses +
 * bills + plaid transactions and average over 3 months" pipelines. That was
 * drifting away from the financial engine and producing numbers that didn't
 * match the Dashboard / Reports UI the user actually sees. On 2026-04-22 the
 * AI Savings Advisor surfaced $1,400 income / $46,426 spending / $NaN — wildly
 * off — because it was:
 *
 *   - using only the caller's own userId (no household fan-out)
 *   - treating `bills` as already-monthly (no recurrence normalization)
 *   - double-counting with Math.max(expenses + bills, plaidSpending + bills)
 *   - missing transfer / credit-card-payment filtering
 *   - reading Plaid transactions directly instead of going through the
 *     adapter layer (so MX-only households saw empty values, and any future
 *     aggregator would be invisible)
 *
 * This module centralizes the snapshot. Every AI endpoint should import
 * `getHouseholdFinancialSnapshot` and pass the caller's `householdUserIds`
 * (resolved from the session) instead of rolling its own pipeline.
 *
 * The snapshot returns monthly averages computed from the financial engine —
 * the same engine that powers /api/engine/dashboard — so the numbers the AI
 * reasons about are guaranteed to match what the user sees on-screen.
 */

import { startOfMonth, endOfMonth, subMonths } from "date-fns";

import {
  calculateIncomeForPeriod,
  calculateExpensesForPeriod,
  calculateBillsForPeriod,
} from "./financial-engine";

import { EngineStorage } from "../engine/storage";
import { getAllNormalizedTransactions } from "../engine/data-loaders";
import { pool } from "../db";

// ─── Types ────────────────────────────────────────────────────────────────

export interface FinancialSnapshotOptions {
  /**
   * Number of trailing whole months to average over. Defaults to 3.
   * The "current" month is INCLUDED as the last month (trailing window ending
   * at today). For 3-month snapshots we pull [today-3mo .. today].
   */
  months?: number;
  /** Override "now" for deterministic tests. Defaults to new Date(). */
  now?: Date;
}

export interface FinancialSnapshot {
  /** Window over which monthly averages were computed. */
  window: {
    months: number;
    startDate: string; // yyyy-MM-dd (inclusive)
    endDate: string;   // yyyy-MM-dd (inclusive)
  };
  /**
   * Average monthly income across the window. Prefers actualIncome (bank
   * deposits) when bank data is available; falls back to budgetedIncome
   * (user-entered income records) otherwise. Matches the engine's
   * `effectiveIncome` logic.
   */
  monthlyIncome: number;
  /**
   * Average monthly spending across the window. Computed by the engine:
   * deduplicated (manual vs bank), transfer-filtered, credit-card-payment
   * filtered, household-aware. This is a single number — NOT an artificially
   * Math.max'd combo.
   */
  monthlySpending: number;
  /**
   * Monthly bills estimate (from the recurring bills registry, normalized
   * across weekly / biweekly / monthly / yearly recurrences). NOT added on
   * top of `monthlySpending` — bills that land as bank transactions are
   * already inside `monthlySpending`. Exposed separately so the AI can
   * reason about "fixed" vs "discretionary" if it wants.
   */
  monthlyBills: number;
  /**
   * monthlyIncome - monthlySpending. Can be negative.
   */
  monthlySurplus: number;
  /**
   * Category → monthly-average dollars. Keys come from the engine's
   * effective-category resolution (Monarch-aligned Plaid PFC v2 path).
   */
  spendingByCategory: Record<string, number>;
  /** Whether the window contains any connected-provider bank data. */
  hasBankData: boolean;
  /** Whether the user has any user-entered income records. */
  hasBudgetedIncome: boolean;
  /**
   * Count of normalized transactions observed in the window. Useful for the
   * AI to gauge how much context it's actually reasoning over — "0 txns"
   * means we're effectively a new account and it should hedge.
   */
  transactionCount: number;
}

// ─── Implementation ───────────────────────────────────────────────────────

/**
 * Compute a household-scoped financial snapshot using the financial engine.
 *
 * This function is provider-agnostic by construction: `getAllNormalizedTransactions`
 * fans out across every adapter (Plaid, MX, Manual, future aggregators), so
 * adding a new provider automatically flows into AI endpoints that use this
 * helper — no per-endpoint update needed.
 *
 * @param userIds Household user IDs to aggregate over. For a solo user, pass
 *                `[userId]`. For a household, pass the full member list
 *                (e.g. `await storage.getHouseholdMemberUserIds(householdId)`).
 * @param opts    Window size (default 3 months) and optional `now` for tests.
 */
export async function getHouseholdFinancialSnapshot(
  userIds: string[],
  opts: FinancialSnapshotOptions = {},
): Promise<FinancialSnapshot> {
  const months = Math.max(1, opts.months ?? 3);
  const now = opts.now ?? new Date();

  // Window is [startOfMonth(now - months + 1), endOfMonth(now)] — that's
  // exactly `months` whole calendar months, including the current one.
  const windowStart = startOfMonth(subMonths(now, months - 1));
  const windowEnd = endOfMonth(now);

  // Fetch raw inputs. All calls are household-fanned-out at the storage layer.
  const [
    billsData,
    incomeData,
    incomeSources,
    expensesData,
    transactions,
    historicalTransactions,
  ] = await Promise.all([
    EngineStorage.getBillsByUserIds(userIds),
    EngineStorage.getIncomesByUserIds(userIds),
    EngineStorage.getIncomeSourcesByUserIds(userIds),
    EngineStorage.getExpensesByUserIds(userIds),
    // Transactions for the active window (used for per-month income + expense calcs)
    getAllNormalizedTransactions(userIds, windowStart, windowEnd),
    // Extra lookback for the income engine's recurring-source detector
    getAllNormalizedTransactions(
      userIds,
      startOfMonth(subMonths(now, months + 3 - 1)),
      windowEnd,
    ),
  ]);

  // Second pass to load effective-dated unit amounts for the income registry.
  const incomeSourceAmounts = incomeSources.length > 0
    ? await EngineStorage.getIncomeSourceAmountsBySourceIds(incomeSources.map((s) => s.id))
    : [];

  // Accumulators
  let totalIncome = 0;
  let totalSpending = 0;
  let hasBankData = false;
  const categoryTotals: Record<string, number> = {};

  // Walk one month at a time so the engine can apply its per-period rules
  // (transfer exclusion, dedupe against matched expenses, etc.) correctly.
  for (let i = 0; i < months; i++) {
    const monthStart = startOfMonth(subMonths(now, months - 1 - i));
    const monthEnd = endOfMonth(monthStart);
    const prevMonthStart = startOfMonth(subMonths(monthStart, 1));
    const prevMonthEnd = endOfMonth(prevMonthStart);

    const income = calculateIncomeForPeriod({
      income: incomeData,
      incomeSources,
      incomeSourceAmounts,
      transactions,
      historicalTransactions,
      monthStart,
      monthEnd,
      today: now,
    });

    const expenses = calculateExpensesForPeriod({
      expenses: expensesData,
      transactions,
      monthStart,
      monthEnd,
      prevMonthStart,
      prevMonthEnd,
    });

    totalIncome += income.effectiveIncome;
    totalSpending += expenses.total;
    hasBankData = hasBankData || income.hasBankData;

    for (const [cat, amount] of Object.entries(expenses.byCategory)) {
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + amount;
    }
  }

  // Bills: engine normalizes recurrence → monthly. Value is already monthly.
  const billsResult = calculateBillsForPeriod({
    bills: billsData,
    monthStart: startOfMonth(now),
    monthEnd: endOfMonth(now),
  });

  const monthlyIncome = round(totalIncome / months);
  const monthlySpending = round(totalSpending / months);
  const monthlyBills = round(billsResult.monthlyEstimate);
  const monthlySurplus = round(monthlyIncome - monthlySpending);

  // §6.2.7-prep: categoryTotals is keyed on canonical_categories.id slugs
  // (or the engine's "__uncategorized__" sentinel). Translate to display
  // names for AI prompt consumption — the AI reasons over natural language,
  // not slug ids. One DB query is enough; the canonical taxonomy is small
  // (~67 system rows + a handful of user customs).
  const slugToDisplayName = await loadCanonicalDisplayNameMap();
  const spendingByCategory: Record<string, number> = {};
  for (const [slug, total] of Object.entries(categoryTotals)) {
    const displayName =
      slug === "__uncategorized__"
        ? "Uncategorized"
        : (slugToDisplayName.get(slug) ?? slug);
    // Multiple slugs could in theory map to the same display name (shouldn't
    // happen with current taxonomy, but be defensive — sum if so).
    spendingByCategory[displayName] =
      (spendingByCategory[displayName] ?? 0) + round(total / months);
  }

  return {
    window: {
      months,
      startDate: toIsoDate(windowStart),
      endDate: toIsoDate(windowEnd),
    },
    monthlyIncome,
    monthlySpending,
    monthlyBills,
    monthlySurplus,
    spendingByCategory,
    hasBankData,
    hasBudgetedIncome: incomeData.length > 0,
    transactionCount: transactions.length,
  };
}

// ─── Private helpers ──────────────────────────────────────────────────────

function round(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Load canonical_categories.id → display_name map for translating engine
 * output (slugs) into display names for AI prompt consumption.
 *
 * Includes user-owned rows alongside system rows — both have `display_name`,
 * and downstream AI prompts shouldn't have to know the difference. Pre-launch
 * this is ~67 system rows + a handful of user customs, so a per-snapshot
 * query is fine; can cache in-process if it ever shows up in profiles.
 */
async function loadCanonicalDisplayNameMap(): Promise<Map<string, string>> {
  const { rows } = await pool.query<{ id: string; display_name: string }>(
    "SELECT id, display_name FROM canonical_categories",
  );
  const m = new Map<string, string>();
  for (const r of rows) m.set(r.id, r.display_name);
  return m;
}
