/**
 * Recurring Income Auto-Detector
 *
 * Analyzes Plaid transaction history to automatically detect recurring income
 * patterns and marks matching income records as auto-detected.
 *
 * Algorithm:
 * 1. Fetch all inflow (credit) transactions from the last 12 months
 * 2. Group by normalized source name
 * 3. For each group with 2+ entries, analyze interval consistency
 * 4. If interval stddev < 30% of mean → mark as recurring with detected frequency
 * 5. Update matching income records in the DB
 */

import { db } from "./db";
import { storage } from "./storage";
import { income as incomeTable } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { format, differenceInDays, parseISO } from "date-fns";
import { isNonIncomeCanonical } from "./lib/canonical-flags";

const MIN_INCOME_THRESHOLD = 200; // Ignore deposits under $200

/**
 * PFC v2 prefixes and legacy Plaid categories that identify non-income credits.
 * UAT-6 P1-15: internal account transfers (savings → checking, Venmo-to-bank)
 * were leaking into auto-detected income because the detector only filtered by
 * amount sign/threshold. The Plaid adapter already has this logic — duplicating
 * the minimum set here to keep this module self-contained before we move it
 * behind the adapter layer in the next refactor pass.
 */
const NON_INCOME_PFC_DETAILED_PREFIXES = [
  "TRANSFER_IN_",
  "TRANSFER_OUT_",
  "LOAN_PAYMENTS_",
  "BANK_FEES_",
];

/** True if a Plaid tx row is a transfer/loan/fee, not real income.
 *
 * §6.3.1: replaced the local NON_INCOME_CATEGORY_VALUES legacy-string set
 * with the canonical-id helper isNonIncomeCanonical. The PFC detailed
 * prefix check stays as a defense-in-depth fallback for rows that arrived
 * before the canonical resolver ran. */
function isNonIncomeTx(t: any): boolean {
  const pfcDetailed = String(t.personalFinanceCategoryDetailed || "").toUpperCase();
  if (pfcDetailed && NON_INCOME_PFC_DETAILED_PREFIXES.some((p) => pfcDetailed.startsWith(p))) {
    return true;
  }
  if (isNonIncomeCanonical(t.canonicalCategoryId)) return true;
  if (t.isTransfer === true || t.isTransfer === "true") return true;
  return false;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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
 * Strips common bank suffixes, lowercases, removes special chars.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(direct dep|dir dep|payroll|deposit|payment|pay|inc|ltd|llc|corp|co)\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detect frequency from average interval in days.
 * Returns null if the interval doesn't match a known pattern.
 */
function detectFrequency(avgDays: number): string | null {
  // UAT-8 FIX: Previous biweekly bucket (13-16) swallowed the 15-day
  // semi-monthly cadence (15th/30th) and doubled projected income.
  // Biweekly is now strict 13-14; semi-monthly (~15d) is explicit.
  if (avgDays >= 6 && avgDays <= 8) return "weekly";
  if (avgDays >= 13 && avgDays <= 14) return "biweekly";
  if (avgDays >= 15 && avgDays <= 17) return "semi-monthly";
  if (avgDays >= 28 && avgDays <= 32) return "monthly";
  if (avgDays >= 88 && avgDays <= 95) return "quarterly";
  if (avgDays >= 360 && avgDays <= 370) return "yearly";
  return null;
}

// ─── Main Detection Function ─────────────────────────────────────────────────

export interface DetectionResult {
  source: string;
  frequency: string;
  avgAmount: number;
  occurrences: number;
  incomeIdsUpdated: string[];
}

export async function detectRecurringIncome(userId: string): Promise<DetectionResult[]> {
  console.log(`[IncomeDetector] Running for user ${userId}`);

  // 1. Get all Plaid transactions for this user (last 12 months, inflows only)
  const plaidItems = await storage.getPlaidItems(userId);
  if (plaidItems.length === 0) {
    console.log(`[IncomeDetector] No Plaid items for user ${userId}, skipping`);
    return [];
  }

  const allAccountIds: string[] = [];
  for (const item of plaidItems) {
    const accounts = await storage.getPlaidAccounts(item.id);
    const activeAccounts = accounts.filter((a) => a.isActive === "true");
    allAccountIds.push(...activeAccounts.map((a) => a.id));
  }

  if (allAccountIds.length === 0) return [];

  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 12);

  const transactions = await storage.getPlaidTransactions(allAccountIds, {
    startDate: format(startDate, "yyyy-MM-dd"),
    endDate: format(endDate, "yyyy-MM-dd"),
  });

  // Filter to inflows only (negative amounts = credits in Plaid) above threshold.
  // UAT-6 P1-15: also reject transfers, loan payments, and bank-fee credits —
  // those produce false "recurring income" entries (savings → checking, card
  // payments reversing as credits, etc.). The Plaid adapter already classifies
  // these via PFC v2; we apply the same rules here before fingerprinting.
  const inflows = transactions.filter(
    (t) =>
      parseFloat(t.amount) < 0 &&
      Math.abs(parseFloat(t.amount)) >= MIN_INCOME_THRESHOLD &&
      !isNonIncomeTx(t)
  );

  if (inflows.length === 0) {
    console.log(`[IncomeDetector] No qualifying inflows for user ${userId}`);
    return [];
  }

  // 2. Group by normalized name
  const groups: Record<string, { date: string; amount: number; rawName: string }[]> = {};
  for (const tx of inflows) {
    const rawName = tx.merchantName || tx.name || "Unknown";
    const key = normalizeName(rawName);
    if (!key || key.length < 2) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push({
      date: tx.date,
      amount: Math.abs(parseFloat(tx.amount)),
      rawName,
    });
  }

  // 3. Get existing income records for this user
  const existingIncome = await storage.getIncomes(userId);

  const results: DetectionResult[] = [];

  // 4. Analyze each group
  for (const [normalizedKey, entries] of Object.entries(groups)) {
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

    // Only mark as recurring if interval is consistent (stddev < 30% of mean)
    if (sd > meanInterval * 0.3) continue;

    const frequency = detectFrequency(meanInterval);
    if (!frequency) continue;

    // Check amount consistency (within 15%)
    const amounts = entries.map((e) => e.amount);
    const meanAmount = avg(amounts);
    const amountsConsistent = amounts.every(
      (a) => Math.abs(a - meanAmount) / meanAmount < 0.15
    );

    // Use the most common raw name from the group
    const rawName = entries[entries.length - 1].rawName;

    console.log(
      `[IncomeDetector] Detected: "${rawName}" → ${frequency}, avg $${meanAmount.toFixed(2)}, ` +
        `${entries.length} occurrences, interval stddev=${sd.toFixed(1)}d`
    );

    // 5. Find matching income records and update them
    const matchingIncome = existingIncome.filter((inc) => {
      // ── CRITICAL: Never mark auto-imported records as recurring.
      // Auto-imported records are individual paycheck snapshots created by the
      // auto-reconciler. Marking them recurring causes the frontend to project
      // each historical record forward, multiplying the total by the number of
      // historical records × occurrences per month (e.g. 20 records × 2 = 40×).
      //
      // Auto-imported records are identified by their notes field containing
      // "Auto-imported from bank transaction". These records represent individual
      // transactions and should remain as one-time (isRecurring = false) entries.
      // The server-side dedup in GET /api/income already collapses them correctly.
      if (inc.notes && inc.notes.includes("Auto-imported from bank transaction")) {
        return false;
      }

      const incNorm = normalizeName(inc.source);
      return (
        incNorm.includes(normalizedKey) ||
        normalizedKey.includes(incNorm) ||
        inc.source.toLowerCase().includes(normalizedKey) ||
        normalizedKey.includes(inc.source.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim())
      );
    });

    const updatedIds: string[] = [];

    for (const inc of matchingIncome) {
      // Only update if not already manually set as recurring by user
      // (autoDetected = false means user hasn't touched it, or it was manually set)
      // We update if: not already recurring OR already auto-detected (re-run)
      const alreadyManuallySet =
        inc.isRecurring === "true" && inc.autoDetected === false;
      if (alreadyManuallySet) continue;

      try {
        // Map detected labels to the subset of RECURRENCE_OPTIONS the schema
        // accepts. "semi-monthly" and "quarterly" aren't in the enum yet, so we
        // map them conservatively (underproject rather than overproject):
        //   semi-monthly → biweekly  (closest 2×/mo cadence; ~8% under-rate)
        //   quarterly    → monthly   (legacy mapping, preserved)
        let storedRecurrence: string;
        if (frequency === "quarterly") storedRecurrence = "monthly";
        else if (frequency === "semi-monthly") storedRecurrence = "biweekly";
        else storedRecurrence = frequency;

        await db
          .update(incomeTable)
          .set({
            isRecurring: "true",
            recurrence: storedRecurrence,
            autoDetected: true,
            detectedAt: new Date(),
          })
          .where(and(eq(incomeTable.id, inc.id), eq(incomeTable.userId, userId)));

        updatedIds.push(inc.id);
        console.log(`[IncomeDetector] Updated income "${inc.source}" (${inc.id}) → ${frequency}`);
      } catch (err) {
        console.error(`[IncomeDetector] Failed to update income ${inc.id}:`, err);
      }
    }

    results.push({
      source: rawName,
      frequency,
      avgAmount: Math.round(meanAmount * 100) / 100,
      occurrences: entries.length,
      incomeIdsUpdated: updatedIds,
    });
  }

  console.log(
    `[IncomeDetector] Done for user ${userId}: ${results.length} patterns found, ` +
      `${results.reduce((s, r) => s + r.incomeIdsUpdated.length, 0)} records updated`
  );

  return results;
}

// ─── Suggestion-Mode Detector ────────────────────────────────────────────────

export interface IncomeSuggestion {
  name: string;
  amount: number;
  category: string | null;
  recurrence: "weekly" | "biweekly" | "semi-monthly" | "monthly" | "quarterly" | "yearly";
  frequency: string;       // Uppercase Plaid-style for UI back-compat ("WEEKLY", "BIWEEKLY", etc.)
  dueDay: number;          // Day of month typically received (1-31)
  confidence: "high" | "medium" | "low";
  occurrences: number;
  lastDate: string;        // YYYY-MM-DD
  sampleSize: number;
}

const RECURRENCE_TO_FREQUENCY: Record<string, string> = {
  weekly: "WEEKLY",
  biweekly: "BIWEEKLY",
  "semi-monthly": "SEMI_MONTHLY",
  monthly: "MONTHLY",
  quarterly: "QUARTERLY",
  yearly: "ANNUALLY",
};

/**
 * Suggestion-mode detector — returns the shape /api/income/detect emits to
 * the Income page "Detect Income" dialog. Does NOT write to the DB.
 *
 * Confidence mapping:
 *   - 3+ occurrences, amount variance < 15%  → "high"
 *   - 3+ occurrences, amount variance >= 15% → "medium"
 *   - 2 occurrences                          → "low"
 */
export async function detectRecurringIncomeSuggestions(
  userId: string,
): Promise<IncomeSuggestion[]> {
  console.log(`[IncomeSuggestions] Running for user ${userId}`);

  // 1. Gather Plaid items + active account IDs (same as detectRecurringIncome)
  const plaidItems = await storage.getPlaidItems(userId);
  if (plaidItems.length === 0) {
    console.log(`[IncomeSuggestions] No Plaid items for user ${userId}, skipping`);
    return [];
  }

  const allAccountIds: string[] = [];
  for (const item of plaidItems) {
    const accounts = await storage.getPlaidAccounts(item.id);
    const activeAccounts = accounts.filter((a) => a.isActive === "true");
    allAccountIds.push(...activeAccounts.map((a) => a.id));
  }

  if (allAccountIds.length === 0) return [];

  // 2. Pull last 12 months of transactions
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 12);

  const transactions = await storage.getPlaidTransactions(allAccountIds, {
    startDate: format(startDate, "yyyy-MM-dd"),
    endDate: format(endDate, "yyyy-MM-dd"),
  });

  // 3. Filter inflows above threshold, reject non-income
  const inflows = transactions.filter(
    (t) =>
      parseFloat(t.amount) < 0 &&
      Math.abs(parseFloat(t.amount)) >= MIN_INCOME_THRESHOLD &&
      !isNonIncomeTx(t)
  );

  if (inflows.length === 0) {
    console.log(`[IncomeSuggestions] No qualifying inflows for user ${userId}`);
    return [];
  }

  // 4. Group by normalized name
  const groups: Record<string, { date: string; amount: number; rawName: string; category: string | null }[]> = {};
  for (const tx of inflows) {
    const rawName = tx.merchantName || tx.name || "Unknown";
    const key = normalizeName(rawName);
    if (!key || key.length < 2) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push({
      date: tx.date,
      amount: Math.abs(parseFloat(tx.amount)),
      rawName,
      category: (tx as any).personalCategory || (tx as any).category || null,
    });
  }

  const suggestions: IncomeSuggestion[] = [];

  // 5. Analyze each group with >= 2 entries
  for (const [, entries] of Object.entries(groups)) {
    if (entries.length < 2) continue;

    // Sort by date ascending
    entries.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate intervals
    const intervals: number[] = [];
    for (let i = 1; i < entries.length; i++) {
      const days = differenceInDays(parseISO(entries[i].date), parseISO(entries[i - 1].date));
      if (days > 0) intervals.push(days);
    }

    if (intervals.length === 0) continue;

    const meanInterval = avg(intervals);
    const sd = stdDev(intervals);

    // Reject if stddev > 30% of mean (inconsistent cadence)
    if (sd > meanInterval * 0.3) continue;

    const frequency = detectFrequency(meanInterval);
    if (!frequency) continue;

    // Compute mean amount and amount variance
    const amounts = entries.map((e) => e.amount);
    const meanAmount = avg(amounts);
    const amountVariance = amounts.length > 1
      ? Math.max(...amounts.map((a) => Math.abs(a - meanAmount) / meanAmount))
      : 0;

    // Most common raw name (use the latest occurrence's name)
    const name = entries[entries.length - 1].rawName;

    // Last date and due day
    const lastDate = entries[entries.length - 1].date;
    const dueDay = lastDate ? new Date(lastDate).getDate() : 1;

    // Guess category from the most common category in the group
    const catCounts: Record<string, number> = {};
    for (const e of entries) {
      const c = e.category || "null";
      catCounts[c] = (catCounts[c] || 0) + 1;
    }
    let bestCat: string | null = null;
    let bestCatCount = 0;
    for (const [cat, count] of Object.entries(catCounts)) {
      if (cat !== "null" && count > bestCatCount) {
        bestCat = cat;
        bestCatCount = count;
      }
    }

    // Map category to income category labels
    let mappedCategory: string | null = bestCat;
    if (bestCat) {
      const upper = bestCat.toUpperCase();
      if (upper.includes("PAYROLL") || upper.includes("SALARY")) mappedCategory = "Salary";
      else if (upper.includes("INVESTMENT") || upper.includes("DIVIDEND")) mappedCategory = "Investments";
      else if (upper.includes("RENT")) mappedCategory = "Rental";
      else if (upper.includes("FREELANCE") || upper.includes("CONTRACT")) mappedCategory = "Freelance";
      else if (upper.includes("BUSINESS")) mappedCategory = "Business";
      else if (upper.includes("TRANSFER")) mappedCategory = null;
    }

    // Confidence: 3+ & variance<15% → high; 3+ → medium; 2 → low
    let confidence: "high" | "medium" | "low";
    if (entries.length >= 3 && amountVariance < 0.15) {
      confidence = "high";
    } else if (entries.length >= 3) {
      confidence = "medium";
    } else {
      confidence = "low";
    }

    const recurrence = frequency as IncomeSuggestion["recurrence"];

    suggestions.push({
      name,
      amount: Math.round(meanAmount * 100) / 100,
      category: mappedCategory,
      recurrence,
      frequency: RECURRENCE_TO_FREQUENCY[frequency] || frequency.toUpperCase(),
      dueDay,
      confidence,
      occurrences: entries.length,
      lastDate,
      sampleSize: entries.length,
    });
  }

  // Sort by amount descending
  suggestions.sort((a, b) => b.amount - a.amount);

  console.log(
    `[IncomeSuggestions] Done for user ${userId}: ${suggestions.length} suggestions found`
  );

  return suggestions;
}
