/**
 * Income Calculation Engine
 *
 * Centralizes all income-related calculations:
 *   - Recurring income calculation (weekly, biweekly, semimonthly, monthly,
 *     yearly, custom)
 *   - Bank deposit detection from normalized transactions (provider-agnostic)
 *   - Income-to-budget reconciliation
 *   - Monthly income forecasting from the income-source registry
 *
 * Two data paths feed this module:
 *
 *   1. Legacy `Income` rows (one per detected paycheck event). Maintained for
 *      back-compat with older clients and as a fallback when no registry is
 *      provided. These rows MUST NOT drive past/current-month projections —
 *      doing so caused UAT-6's duplicate-recurring-income bug where April
 *      Coreslab projected at 2× the real amount because two near-identical
 *      rows existed.
 *
 *   2. Registry: `incomeSources` (one row per recurring stream) +
 *      `incomeSourceAmounts` (effective-dated unit amounts). When supplied,
 *      this is the authoritative source of *future-month projections*. For
 *      past/current months we still use real bank deposits as ground truth
 *      and only consult the registry for the expectedAmount/drift signal.
 *
 * All monetary amounts are handled in cents (integers) to avoid floating-point
 * errors.
 */

import {
  startOfMonth,
  endOfMonth,
  parseISO,
  getDay,
  eachDayOfInterval,
  isBefore,
  isAfter,
  addWeeks,
  getDaysInMonth,
  differenceInDays,
} from 'date-fns';
import {
  IncomeResult,
  IncomeBySourceEntry,
  IncomeProjectionConfidence,
  IncomeSourceMode,
} from './types';
import type { NormalizedTransaction } from './normalized-types';
import type { Income, IncomeSource, IncomeSourceAmount } from '@shared/schema';

// ─── Precision Helpers ──────────────────────────────────────────────────────

/**
 * Convert dollars to cents (integers) to avoid floating-point errors
 * @param amount Currency amount in dollars or string
 * @returns Amount in cents as an integer
 */
function toCents(amount: string | number): number {
  return Math.round(parseFloat(String(amount)) * 100);
}

/**
 * Convert cents (integers) back to dollars
 * @param cents Amount in cents as an integer
 * @returns Amount in dollars
 */
function toDollars(cents: number): number {
  return Math.round(cents) / 100;
}

// ─── Cadence helpers (registry + legacy share these) ────────────────────────

/**
 * Resolve the semimonthly day-pair for a source.
 * Default ([15, "last"]) matches the most common payroll convention and what
 * Roche Pharma uses on the test account.
 *
 * Stored on `incomeSources.cadenceExtra` (or legacy `income.customDates`) as
 * JSON: `{"semimonthlyDays":[15,"last"]}` or `[15,"last"]`.
 */
function resolveSemimonthlyDays(cadenceExtraRaw: string | null | undefined): [number | "last", number | "last"] {
  if (cadenceExtraRaw) {
    try {
      const parsed = JSON.parse(cadenceExtraRaw);
      const arr = Array.isArray(parsed) ? parsed : parsed?.semimonthlyDays;
      if (Array.isArray(arr) && arr.length === 2) {
        return [arr[0] as number | "last", arr[1] as number | "last"];
      }
    } catch {
      // fall through to default
    }
  }
  return [15, "last"];
}

/**
 * Resolve a semimonthly anchor (day or "last") to an actual day-of-month for
 * a given calendar month. Caps numeric anchors at the month length so a
 * source anchored at the 31st still produces a valid date in February.
 */
function resolveSemimonthlyDay(anchor: number | "last", monthStart: Date): number {
  const dim = getDaysInMonth(monthStart);
  if (anchor === "last") return dim;
  if (anchor < 1) return 1;
  if (anchor > dim) return dim;
  return anchor;
}

/**
 * Build the list of expected pay-dates within a month for a registry source.
 * Returned dates are yyyy-MM-dd strings (UTC-naïve, matching the rest of the
 * codebase). Returns an empty list for "irregular" or for sources whose
 * cadence_anchor is after the month window.
 */
function projectedPayDatesInMonth(
  source: IncomeSource,
  monthStart: Date,
  monthEnd: Date,
): string[] {
  const recurrence = source.recurrence;
  if (recurrence === "irregular" || recurrence === "one_time") return [];

  const anchor = parseISO(source.cadenceAnchor);
  if (isAfter(anchor, monthEnd)) return [];

  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (recurrence === "weekly") {
    const dow = getDay(anchor);
    const dates: string[] = [];
    for (const d of eachDayOfInterval({ start: monthStart, end: monthEnd })) {
      if (getDay(d) === dow && !isBefore(d, anchor)) dates.push(fmt(d));
    }
    return dates;
  }

  if (recurrence === "biweekly") {
    const dates: string[] = [];
    let p = anchor;
    while (isBefore(p, monthStart)) p = addWeeks(p, 2);
    while (!isAfter(p, monthEnd)) {
      dates.push(fmt(p));
      p = addWeeks(p, 2);
    }
    return dates;
  }

  if (recurrence === "semimonthly") {
    const [a, b] = resolveSemimonthlyDays(source.cadenceExtra);
    const day1 = resolveSemimonthlyDay(a, monthStart);
    const day2 = resolveSemimonthlyDay(b, monthStart);
    const y = monthStart.getFullYear();
    const m = monthStart.getMonth();
    const dates = [
      new Date(y, m, day1),
      new Date(y, m, day2),
    ]
      .filter((d) => !isBefore(d, anchor))
      .map(fmt);
    // Dedup in case both anchors land on the same day (e.g. [15,15]).
    return Array.from(new Set(dates)).sort();
  }

  if (recurrence === "monthly") {
    const day = anchor.getDate();
    const dim = getDaysInMonth(monthStart);
    const target = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth(),
      Math.min(day, dim),
    );
    return isBefore(target, anchor) ? [] : [fmt(target)];
  }

  if (recurrence === "yearly") {
    if (anchor.getMonth() !== monthStart.getMonth()) return [];
    return [fmt(anchor)];
  }

  if (recurrence === "custom" && source.cadenceExtra) {
    try {
      const parsed = JSON.parse(source.cadenceExtra);
      const days: number[] = Array.isArray(parsed) ? parsed : parsed?.customDays ?? [];
      const dim = getDaysInMonth(monthStart);
      return days
        .filter((d) => Number.isFinite(d) && d >= 1 && d <= dim)
        .map((d) => fmt(new Date(monthStart.getFullYear(), monthStart.getMonth(), d)))
        .filter((s) => !isBefore(parseISO(s), anchor));
    } catch {
      return [];
    }
  }

  return [];
}

/**
 * Find the active income_source_amount row for a given pay date.
 * "Active" means: effective_from <= date AND (effective_to IS NULL OR effective_to >= date).
 * If multiple rows match (shouldn't happen — closed properly — but tolerate it),
 * pick the one with the latest effective_from.
 */
function activeAmountForDate(
  amounts: IncomeSourceAmount[],
  date: string,
): IncomeSourceAmount | null {
  let match: IncomeSourceAmount | null = null;
  for (const row of amounts) {
    if (row.effectiveFrom > date) continue;
    if (row.effectiveTo && row.effectiveTo < date) continue;
    if (!match || row.effectiveFrom > match.effectiveFrom) match = row;
  }
  return match;
}

// ─── Core Calculation ──────────────────────────────────────────────────────

/**
 * Calculate total monthly income from a single legacy `Income` record.
 *
 * Used by the back-compat path and the legacy detector — NOT by the
 * registry-driven path. The registry uses `projectedPayDatesInMonth` plus
 * effective-dated unit amounts so a source can change rate mid-month.
 *
 * Business Rules:
 * - Non-recurring: counts only if exact date falls in the month range
 * - Custom: parses JSON array of day numbers, counts valid days <= daysInMonth, multiplies by amount
 * - Monthly: returns amount × 1
 * - Yearly: returns amount only if start month matches selected month
 * - Weekly: counts occurrences where day-of-week matches within the month
 * - Biweekly: walks forward from start date in 2-week intervals, counts hits in month
 * - Semimonthly: exactly 2 occurrences anchored to a configured day-pair
 *   (defaults to 15th + last day). Day-pair stored on
 *   `income.customDates` as JSON `{semimonthlyDays:[15,"last"]}` or
 *   bare `[15,"last"]`.
 * - Irregular / one_time: zero monthly projection (handled at registry level
 *   for past/current actuals; legacy rows fall through to monthly fallback).
 *
 * @param income Income record with recurrence settings
 * @param monthStart First day of the month (Date object)
 * @param monthEnd Last day of the month (Date object)
 * @returns Monthly total in dollars (decimal)
 */
export function calculateMonthlyIncomeTotal(
  income: Income,
  monthStart: Date,
  monthEnd: Date
): number {
  const amountCents = toCents(income.amount);
  if (amountCents === 0) return 0;

  const incomeStartDate = parseISO(income.date);

  // Non-recurring: only count if the exact date falls within this month
  if (income.isRecurring !== 'true') {
    if (incomeStartDate >= monthStart && incomeStartDate <= monthEnd) {
      return toDollars(amountCents);
    }
    return 0;
  }

  // Recurring: must have started on or before the end of this month
  if (isAfter(incomeStartDate, monthEnd)) {
    return 0;
  }

  const recurrence = income.recurrence;

  // Custom: parse JSON array of day numbers (1-31)
  if (recurrence === 'custom' && income.customDates) {
    try {
      const customDays: number[] = JSON.parse(income.customDates);
      const daysInMonth = getDaysInMonth(monthStart);
      const validDays = customDays.filter((day) => day > 0 && day <= daysInMonth);
      return toDollars(amountCents * validDays.length);
    } catch {
      // If parsing fails, treat as monthly
      return toDollars(amountCents);
    }
  }

  // Monthly: straightforward
  if (recurrence === 'monthly') {
    return toDollars(amountCents);
  }

  // Yearly: only count if the income's start month matches the selected month
  if (recurrence === 'yearly') {
    if (incomeStartDate.getMonth() === monthStart.getMonth()) {
      return toDollars(amountCents);
    }
    return 0;
  }

  // Weekly: count occurrences where day-of-week matches within the month
  if (recurrence === 'weekly') {
    const dayOfWeek = getDay(incomeStartDate);
    let count = 0;
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    for (const day of allDays) {
      if (getDay(day) === dayOfWeek && !isBefore(day, incomeStartDate)) {
        count++;
      }
    }
    return toDollars(amountCents * count);
  }

  // Biweekly: walk forward from start date in 2-week intervals, count hits in month
  if (recurrence === 'biweekly') {
    let count = 0;
    let payDate = incomeStartDate;
    // Advance to first occurrence on or after monthStart
    while (isBefore(payDate, monthStart)) {
      payDate = addWeeks(payDate, 2);
    }
    // Count all occurrences within the month
    while (!isAfter(payDate, monthEnd)) {
      count++;
      payDate = addWeeks(payDate, 2);
    }
    return toDollars(amountCents * count);
  }

  // Semimonthly: exactly 2 occurrences per month on the configured day-pair.
  // Day-pair lives on `customDates` as JSON. Defaults to [15,"last"].
  if (recurrence === 'semimonthly') {
    const [a, b] = resolveSemimonthlyDays(income.customDates);
    const day1 = resolveSemimonthlyDay(a, monthStart);
    const day2 = resolveSemimonthlyDay(b, monthStart);
    const y = monthStart.getFullYear();
    const m = monthStart.getMonth();
    const dates = [
      new Date(y, m, day1),
      new Date(y, m, day2),
    ].filter((d) => !isBefore(d, incomeStartDate));
    // Dedup in case of [15,15] etc.
    const uniq = Array.from(new Set(dates.map((d) => d.getTime())));
    return toDollars(amountCents * uniq.length);
  }

  // Irregular: legacy rows shouldn't claim monthly projection. Caller is
  // expected to use the registry path; if not, fall back to zero.
  if (recurrence === 'irregular') {
    return 0;
  }

  // Fallback: treat as monthly if recurrence is unrecognized
  return toDollars(amountCents);
}

// ─── Bank Income Detection (Provider-Agnostic) ───────────────────────────
//
// All provider-specific logic (Plaid sign conventions, MX field names, etc.)
// is handled by the adapter layer BEFORE data reaches the engine.
// The engine only works with NormalizedTransaction objects.

// ─── Recurring Income Source Detection (Historical, fallback only) ───────
//
// Used when the registry hasn't been populated yet. After the auto-detector
// upserts into income_sources (Step 5), this path is largely vestigial — kept
// as a safety net so a user with stale data still sees something sensible.

function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  const mean = avg(arr);
  const variance = arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Normalize a source/merchant name for grouping.
 * MUST stay in lockstep with `incomeSources.normalizedSource` so registry
 * matches and detector groupings collapse to the same key.
 */
export function normalizeSourceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(direct dep|dir dep|payroll|deposit|payment|pay|inc|ltd|llc|corp|co)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface DetectedRecurringSource {
  source: string;
  avgAmount: number;
  frequency: string;
  occurrences: number;
}

/**
 * Detect recurring income sources from historical transactions.
 * Groups income transactions by normalized source name, analyzes interval
 * consistency, and returns sources with detected frequency patterns.
 */
function detectRecurringIncomeSources(
  historicalIncomeTx: NormalizedTransaction[]
): DetectedRecurringSource[] {
  // Group by normalized source name
  const groups: Record<string, { date: string; amount: number; rawName: string }[]> = {};

  for (const tx of historicalIncomeTx) {
    const rawName = tx.merchant || 'Unknown';
    const key = normalizeSourceName(rawName);
    if (!key || key.length < 2) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push({
      date: tx.date,
      amount: Math.abs(parseFloat(String(tx.amount))),
      rawName,
    });
  }

  const results: DetectedRecurringSource[] = [];

  for (const [, entries] of Object.entries(groups)) {
    if (entries.length < 2) continue;

    // Sort by date ascending
    entries.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate intervals between consecutive occurrences
    const intervals: number[] = [];
    for (let i = 1; i < entries.length; i++) {
      const days = differenceInDays(parseISO(entries[i].date), parseISO(entries[i - 1].date));
      if (days > 0) intervals.push(days);
    }

    if (intervals.length === 0) continue;

    const meanInterval = avg(intervals);
    const sd = stdDev(intervals);

    // Only mark as recurring if interval is reasonably consistent (stddev < 35% of mean)
    if (sd > meanInterval * 0.35) continue;

    // Detect frequency from average interval
    let frequency: string | null = null;
    if (meanInterval >= 6 && meanInterval <= 8) frequency = 'weekly';
    else if (meanInterval >= 13 && meanInterval <= 16) frequency = 'biweekly';
    // Semimonthly averages out to ~15.2 days too, so the band overlaps
    // biweekly. We can't disambiguate from intervals alone — the registry
    // (Step 5 detector) makes the call based on calendar-date pattern.
    else if (meanInterval >= 28 && meanInterval <= 35) frequency = 'monthly';
    else if (meanInterval >= 88 && meanInterval <= 95) frequency = 'quarterly';

    if (!frequency) continue;

    // Use the most recent raw name
    const rawName = entries[entries.length - 1].rawName;
    const amounts = entries.map((e) => e.amount);
    const meanAmount = avg(amounts);

    // Skip small recurring credits (interest, cashback, etc.) — not meaningful income
    if (meanAmount < 100) continue;

    results.push({
      source: rawName,
      avgAmount: Math.round(meanAmount * 100) / 100,
      frequency,
      occurrences: entries.length,
    });
  }

  return results;
}

// ─── Registry-driven Projection ────────────────────────────────────────────

interface RegistryProjection {
  /** Sum of unit_amount × occurrences across all pay dates in the window. */
  expectedAmount: number;
  /** Pay dates the cadence engine emitted for this month. */
  expectedDates: string[];
  /** Most-recently-active unit amount in the window (for display). */
  unitAmount: number | null;
  /** Whether the projection is meaningful (false for irregular sources). */
  hasProjection: boolean;
}

function projectFromRegistry(
  source: IncomeSource,
  amounts: IncomeSourceAmount[],
  monthStart: Date,
  monthEnd: Date,
): RegistryProjection {
  const dates = projectedPayDatesInMonth(source, monthStart, monthEnd);
  if (source.recurrence === "irregular" || source.recurrence === "one_time") {
    return {
      expectedAmount: 0,
      expectedDates: dates,
      unitAmount: null,
      hasProjection: false,
    };
  }

  let cents = 0;
  let lastUnit: number | null = null;
  for (const d of dates) {
    const row = activeAmountForDate(amounts, d);
    if (!row) continue;
    cents += toCents(row.amount);
    lastUnit = parseFloat(String(row.amount));
  }

  return {
    expectedAmount: toDollars(cents),
    expectedDates: dates,
    unitAmount: lastUnit,
    hasProjection: dates.length > 0,
  };
}

function confidenceFor(
  source: IncomeSource,
  expected: number,
  actual: number,
  hasActuals: boolean,
): IncomeProjectionConfidence {
  if (source.recurrence === "irregular") return "low";
  if (!hasActuals) return source.mode === "fixed" ? "high" : "medium";
  if (expected === 0) return "low";
  const drift = Math.abs(actual - expected) / expected;
  if (drift <= 0.05) return "high";
  if (drift <= 0.20) return "medium";
  return "low";
}

// ─── Main Export ───────────────────────────────────────────────────────────

/**
 * Calculate all income metrics for a period.
 *
 * Income is transaction-first: when any bank transactions exist in the period
 * (income or not), we know the user has connected accounts and we use actual
 * deposits as the ground truth. Manual income records are kept as a "budgeted"
 * reference but never override real bank data.
 *
 * Period semantics drive what `bySource[i].amount` means:
 *   - Past or current month → amount = sum of actual deposits in window.
 *     `expectedAmount` carries the registry projection so the UI can show
 *     a side-by-side actual-vs-expected if the source has a registry row.
 *   - Future month → amount = registry projection (irregular = $0).
 *
 * The registry path is preferred whenever `incomeSources` is supplied. The
 * legacy `Income[]` projection from `incomeRecords` is consulted only as a
 * fallback for sources that don't yet have a registry entry. This is the fix
 * for UAT-6's duplicate-income bug: legacy rows can no longer inflate
 * past/current actuals because we read deposits directly from the bank feed.
 *
 * @param params Configuration object
 * @param params.income Array of legacy Income records (back-compat / fallback)
 * @param params.incomeSources Registry rows (preferred when supplied)
 * @param params.incomeSourceAmounts Effective-dated unit amounts for the registry
 * @param params.transactions Normalized transactions (already provider-agnostic)
 * @param params.historicalTransactions Optional 3-month lookback for detector
 * @param params.monthStart First day of calculation period
 * @param params.monthEnd Last day of calculation period
 * @param params.today Reference "now" — defaults to new Date(). Override in tests.
 * @returns IncomeResult with budgeted, actual, and effective income
 */
export function calculateIncomeForPeriod(params: {
  income: Income[];
  incomeSources?: IncomeSource[];
  incomeSourceAmounts?: IncomeSourceAmount[];
  transactions: NormalizedTransaction[];
  historicalTransactions?: NormalizedTransaction[];
  monthStart: Date;
  monthEnd: Date;
  today?: Date;
}): IncomeResult {
  const {
    income: incomeRecords = [],
    incomeSources = [],
    incomeSourceAmounts = [],
    transactions = [],
    historicalTransactions,
    monthStart,
    monthEnd,
    today = new Date(),
  } = params;

  // Period classification — drives whether bySource amounts come from
  // actuals (past/current) or from the registry projection (future).
  const isFutureMonth = isAfter(monthStart, today);
  const isPastMonth = isBefore(monthEnd, today);
  const isCurrentMonth = !isFutureMonth && !isPastMonth;

  // Pre-bucket registry amounts by sourceId for O(1) lookups inside the loop.
  const amountsBySourceId: Record<string, IncomeSourceAmount[]> = {};
  for (const a of incomeSourceAmounts) {
    if (!amountsBySourceId[a.sourceId]) amountsBySourceId[a.sourceId] = [];
    amountsBySourceId[a.sourceId].push(a);
  }

  // ─── Step A: Sum actual bank deposits ─────────────────────────────────
  // Group by normalized merchant name so we can both compute the actual
  // total and match it against registry sources.
  const bySource: IncomeBySourceEntry[] = [];
  let actualIncomeCents = 0;
  let hasAnyTransactions = false;
  const transactionStartDate = startOfMonth(monthStart);
  const transactionEndDate = endOfMonth(monthEnd);

  // depositsByKey: normalized name → { total, merchant, category, count }
  const depositsByKey: Record<
    string,
    { total: number; count: number; merchant: string; category: string }
  > = {};

  for (const tx of transactions) {
    try {
      const txDate = parseISO(tx.date);
      if (isBefore(txDate, transactionStartDate) || isAfter(txDate, transactionEndDate)) {
        continue;
      }
      hasAnyTransactions = true;

      // Skip pending, transfers, non-income for the actual income sum.
      // The Plaid adapter (post-Step-2) is now strict about isIncome —
      // INCOME_INTEREST_EARNED and INCOME_DIVIDENDS no longer leak through.
      if (tx.isPending || tx.isTransfer || !tx.isIncome) continue;

      actualIncomeCents += toCents(tx.amount);

      const merchantName = tx.merchant || 'Unknown';
      const key = normalizeSourceName(merchantName);
      if (!depositsByKey[key]) {
        depositsByKey[key] = {
          total: 0,
          count: 0,
          merchant: merchantName,
          // Prefer the resolved incomeCategory from the classifier (Step 2)
          // over the raw category string. This is what makes <$2 deposits
          // show as "Interest" and Amare/affiliate deposits show as
          // "Other Income" instead of binary "Salary".
          category: tx.incomeCategory || tx.category || 'Other',
        };
      }
      depositsByKey[key].total += parseFloat(String(tx.amount));
      depositsByKey[key].count += 1;
    } catch {
      continue;
    }
  }

  // ─── Step B: Registry-driven sources ──────────────────────────────────
  // For each active registry source, build a bySource entry. Use actuals
  // for past/current months and projection for future months. Drift
  // detection feeds the confidence indicator.
  const registryKeysHandled = new Set<string>();

  for (const src of incomeSources) {
    if (!src.isActive) continue;

    const key = src.normalizedSource || normalizeSourceName(src.displayName);
    registryKeysHandled.add(key);

    const amounts = amountsBySourceId[src.id] || [];
    const projection = projectFromRegistry(src, amounts, monthStart, monthEnd);

    // Match deposits to this source via normalized name (exact, then partial).
    let matched = depositsByKey[key];
    if (!matched) {
      for (const [k, info] of Object.entries(depositsByKey)) {
        if (k.includes(key) || key.includes(k)) {
          matched = info;
          // Don't delete from depositsByKey here — we want one source to be
          // able to match, but other registry rows iterating later need to
          // see the same data. Dedup by key happens after the loop.
          break;
        }
      }
    }

    const actualAmount = matched ? Math.round(matched.total * 100) / 100 : 0;
    const actualCount = matched ? matched.count : 0;

    // Choose which amount to display.
    let displayAmount: number;
    let confidence: IncomeProjectionConfidence;
    if (isFutureMonth) {
      // Future months: skip rows we can't meaningfully project. That covers
      // irregular, one_time, and recurring sources with no cadence dates in
      // this window (e.g. a monthly source whose anchor day falls outside
      // the window). Shipping zero-amount future rows confused users (UAT:
      // "why are Credit Memo / OPOS / Old Navy showing $0 in May/June?").
      if (!projection.hasProjection) {
        continue;
      }
      displayAmount = projection.expectedAmount;
      confidence = confidenceFor(src, projection.expectedAmount, actualAmount, false);
    } else {
      // Past or current: show actuals. If irregular and no actuals exist,
      // skip — irregular sources shouldn't appear as $0 rows.
      if (src.recurrence === "irregular" && actualAmount === 0) {
        continue;
      }
      displayAmount = actualAmount;
      confidence = confidenceFor(
        src,
        projection.expectedAmount,
        actualAmount,
        actualCount > 0,
      );
    }

    bySource.push({
      source: src.displayName,
      sourceId: src.id,
      amount: displayAmount,
      category: src.category || 'Salary',
      isRecurring: src.recurrence !== "irregular" && src.recurrence !== "one_time",
      frequency: src.recurrence,
      mode: (src.mode || "fixed") as IncomeSourceMode,
      confidence,
      expectedAmount: projection.hasProjection ? projection.expectedAmount : undefined,
      hasProjection: projection.hasProjection,
      unitAmount: projection.unitAmount ?? undefined,
      expectedOccurrences: projection.expectedDates.length,
      actualOccurrences: actualCount,
    });
  }

  // ─── Step C: Add unmatched bank deposits ──────────────────────────────
  // Deposits whose normalized name didn't match any registry source. These
  // include: brand-new income streams not yet detected, one-off bonuses,
  // small interest payments, refunds tagged as income by the classifier.
  const MIN_INCOME_SOURCE_AMOUNT = 100; // $100 floor for "real" income source rows

  // Build a set of normalized keys covered by either registry sources
  // (exact OR partial match) so we don't double-count.
  const coveredKeys = new Set<string>(registryKeysHandled);
  for (const k of Object.keys(depositsByKey)) {
    for (const reg of registryKeysHandled) {
      if (reg.includes(k) || k.includes(reg)) coveredKeys.add(k);
    }
  }

  for (const [key, info] of Object.entries(depositsByKey)) {
    if (coveredKeys.has(key)) continue;
    if (info.total < MIN_INCOME_SOURCE_AMOUNT) continue;
    bySource.push({
      source: info.merchant,
      amount: Math.round(info.total * 100) / 100,
      category: info.category,
      isRecurring: false,
      // No registry mode — this is a free-floating deposit. Future months
      // shouldn't project from this without confirmation, so leave
      // expectedAmount/unitAmount empty.
      mode: undefined,
      confidence: "none",
      actualOccurrences: info.count,
    });
  }

  // ─── Step D: Legacy `Income[]` fallback ───────────────────────────────
  // ONLY consulted when no registry sources are supplied. This is the
  // back-compat path for callers that haven't been wired to load
  // incomeSources yet. Once Step 5's detector is shipped and we run a
  // backfill, every active source will have a registry row and this loop
  // becomes a no-op for production data.
  let budgetedIncomeCents = 0;

  if (incomeSources.length === 0) {
    const existingByName = new Set(bySource.map((s) => normalizeSourceName(s.source)));
    for (const incomeRecord of incomeRecords) {
      const monthlyAmount = calculateMonthlyIncomeTotal(incomeRecord, monthStart, monthEnd);
      const cents = toCents(monthlyAmount);
      budgetedIncomeCents += cents;

      if (cents > 0) {
        const k = normalizeSourceName(incomeRecord.source || 'Unknown');
        if (!existingByName.has(k)) {
          existingByName.add(k);
          bySource.push({
            source: incomeRecord.source || 'Unknown',
            // For past/current months we already have the actual on bySource.
            // Only use the legacy projection for future months.
            amount: isFutureMonth ? monthlyAmount : 0,
            category: incomeRecord.category || 'Other',
            isRecurring: incomeRecord.isRecurring === 'true',
            frequency: incomeRecord.recurrence || undefined,
            confidence: isFutureMonth ? "low" : "none",
            expectedAmount: monthlyAmount,
          });
        }
      }
    }

    // ─── Step E: Pattern-based detection (also fallback only) ────────────
    if (historicalTransactions && historicalTransactions.length > 0) {
      const historicalIncome = historicalTransactions.filter(
        (tx) => !tx.isPending && !tx.isTransfer && tx.isIncome,
      );
      if (historicalIncome.length > 0) {
        const detected = detectRecurringIncomeSources(historicalIncome);
        const allSourceNames = new Set(bySource.map((s) => normalizeSourceName(s.source)));
        for (const d of detected) {
          const nd = normalizeSourceName(d.source);
          if (allSourceNames.has(nd)) continue;
          let dup = false;
          for (const existing of allSourceNames) {
            if (existing.includes(nd) || nd.includes(existing)) { dup = true; break; }
          }
          if (dup) continue;
          bySource.push({
            source: d.source,
            amount: isFutureMonth ? d.avgAmount : 0,
            category: 'Salary',
            isRecurring: true,
            frequency: d.frequency,
            confidence: 'low',
            expectedAmount: d.avgAmount,
          });
        }
      }
    }
  } else {
    // Registry path: budgetedIncome reflects what the registry expects this
    // month, not what's in the legacy table. This keeps the "Plan vs Reality"
    // gap calculation honest.
    let cents = 0;
    for (const e of bySource) {
      if (typeof e.expectedAmount === "number") cents += toCents(e.expectedAmount);
    }
    budgetedIncomeCents = cents;
  }

  const budgetedIncome = toDollars(budgetedIncomeCents);
  const actualIncome = toDollars(actualIncomeCents);

  // Transaction-first: if the user has ANY bank data for this period, trust it.
  // For future months we always fall back to the registry projection because
  // there *can't* be actuals yet.
  const hasBankData = hasAnyTransactions;
  const effectiveIncome = isFutureMonth
    ? budgetedIncome
    : hasBankData
      ? actualIncome
      : budgetedIncome;

  return {
    budgetedIncome,
    actualIncome,
    effectiveIncome,
    hasBankData,
    bySource,
  };
}
