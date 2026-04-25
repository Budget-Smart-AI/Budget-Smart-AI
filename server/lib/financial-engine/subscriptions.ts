/**
 * Subscription Calculations
 *
 * Handles subscription-specific logic where subscriptions are bills
 * with particular characteristics (recurring, often monthly/smaller payments).
 *
 * Key responsibilities:
 * - Identify and categorize subscriptions (active vs paused)
 * - Calculate normalized monthly and yearly totals
 * - Track upcoming renewals within 7-day window
 * - Count auto-detected subscriptions
 */

import {
  addDays,
  differenceInDays,
  startOfDay,
  format,
} from 'date-fns';
import type { Bill } from '@shared/schema';
import { SubscriptionsResult, BillOccurrence } from './types';
import { getNextBillOccurrence, getBillsForPeriod } from './bills';

/**
 * Subscription categories — Monarch-aligned model.
 *
 * Following Monarch's design (and the operator's 2026-04-15 decision):
 * subscriptions are NOT a separate concept. They are a filter over recurring
 * bills whose category is in a small, intentional set: streaming/software/
 * dues/digital-media/internet/phone/fitness/insurance/education/business-
 * insurance. A daily Starbucks run is not a subscription.
 *
 * The canonical list comes from `categories/monarch-categories.ts` —
 * categories with `subscriptionLike: true`. We also accept legacy BSAI
 * category names for backwards compatibility (existing user Bills) and
 * translate them through the resolver's legacy-name map.
 */
import {
  SUBSCRIPTION_LIKE_CATEGORIES,
  findMonarchCategory,
} from './categories/monarch-categories';

/** The legacy "Subscriptions" bucket that pre-dated Monarch alignment. We
 * still treat user Bills with `category === "Subscriptions"` as subscriptions
 * so historical data renders correctly. */
const LEGACY_SUBSCRIPTION_CATEGORIES = new Set<string>(['Subscriptions']);

/**
 * Determine if a bill is subscription-like.
 *
 * Decision: a bill is subscription-like iff its category resolves to a
 * Monarch category whose `subscriptionLike` flag is true, OR it's the
 * legacy "Subscriptions" user-created category.
 *
 * Notably NOT subscription-like (departing from BSAI's old behaviour):
 *   - "Other" (catch-all is not a subscription)
 *   - "Coffee Shops", "Travel", "Business Travel & Meals" (these are
 *     spending categories, not subscriptions)
 *   - "Communications" alone (mapped to "Internet & Cable" / "Phone" which
 *     are subscription-like; the legacy name will be normalised by the
 *     resolver)
 */
function isSubscriptionCategory(bill: Bill): boolean {
  // §6.2.8: category column dropped — use canonicalCategoryId as the source of truth.
  // Check if the canonical slug is a subscription-like category.
  const canonicalId = bill.canonicalCategoryId || "";
  if (canonicalId === "lifestyle_subscriptions") return true;
  // Also check against the Monarch subscription-like list by display name
  if (LEGACY_SUBSCRIPTION_CATEGORIES.has(canonicalId)) return true;
  if ((SUBSCRIPTION_LIKE_CATEGORIES as readonly string[]).includes(canonicalId)) {
    return true;
  }
  const def = findMonarchCategory(canonicalId);
  if (def?.subscriptionLike) return true;
  return false;
}

/**
 * Calculate the normalized monthly cost for a single subscription.
 * Converts various recurrence patterns to equivalent monthly rate.
 *
 * @param bill - The subscription to calculate for
 * @returns Monthly cost in dollars
 */
function getMonthlySubscriptionCost(bill: Bill): number {
  const dollars = parseFloat(bill.amount);

  switch (bill.recurrence) {
    case 'weekly':
      // Weekly × 52 weeks ÷ 12 months
      return (dollars * 52) / 12;
    case 'biweekly':
      // Biweekly × 26 cycles ÷ 12 months
      return (dollars * 26) / 12;
    case 'monthly':
      return dollars;
    case 'yearly':
      // Yearly ÷ 12 months
      return dollars / 12;
    case 'one_time':
    case 'custom':
      // These don't have a reliable monthly recurrence
      return 0;
    default:
      return 0;
  }
}

/**
 * Convert internal bill to subscription occurrence format.
 * Computes the next due date from today so the client can render it.
 */
function billToSubscriptionOccurrence(bill: Bill, today: Date): BillOccurrence & { daysUntil?: number } & Record<string, any> {
  const nextDue = getNextBillOccurrence(bill, today);
  const daysUntil = nextDue ? differenceInDays(nextDue, startOfDay(today)) : undefined;

  return {
    // Spread the full bill so the client has access to id, name, merchant, notes, etc.
    ...bill,
    billId: bill.id,
    billName: bill.name,
    amount: parseFloat(bill.amount),
    category: bill.canonicalCategoryId,
    dueDate: nextDue ? format(nextDue, 'yyyy-MM-dd') : '',
    recurrence: bill.recurrence,
    isPaused: bill.isPaused === 'true',
    daysUntil,
  };
}

/**
 * Calculate subscription metrics.
 *
 * Groups subscriptions into:
 * - Active: non-paused subscription-category bills
 * - Paused: subscription-category bills with isPaused === "true"
 *
 * Normalizes monthly and yearly totals across various recurrence patterns.
 * Identifies upcoming renewals within 7 days from today.
 *
 * @param params.bills - Array of all bills from database
 * @param params.today - Reference date for 7-day upcoming calculation (defaults to now)
 * @returns SubscriptionsResult with all subscription metrics
 */
export function calculateSubscriptions(params: {
  bills: Bill[];
  today?: Date;
}): SubscriptionsResult {
  const { bills } = params;
  const today = params.today || new Date();
  const todayStart = startOfDay(today);

  // Filter to subscription-like bills only
  const subscriptions = bills.filter(isSubscriptionCategory);

  // Separate active and paused
  const activeSubscriptions = subscriptions.filter((s) => s.isPaused !== 'true');
  const pausedSubscriptions = subscriptions.filter((s) => s.isPaused === 'true');

  // Convert to output format with computed due dates
  const active = activeSubscriptions.map((s) => billToSubscriptionOccurrence(s, todayStart));
  const paused = pausedSubscriptions.map((s) => billToSubscriptionOccurrence(s, todayStart));

  // Calculate monthly total (normalized)
  const monthlyTotal = activeSubscriptions.reduce(
    (sum, sub) => sum + getMonthlySubscriptionCost(sub),
    0
  );

  // Calculate yearly total
  const yearlyTotal = monthlyTotal * 12;

  // Find upcoming renewals within 7 days
  const sevenDaysLater = addDays(todayStart, 7);
  const upcomingOccurrences = getBillsForPeriod(
    activeSubscriptions,
    todayStart,
    sevenDaysLater
  );

  const upcomingRenewals = upcomingOccurrences.map((occ) => {
    const days = differenceInDays(occ.dueDate, todayStart);

    return {
      ...billToSubscriptionOccurrence(occ.bill, todayStart),
      dueDate: format(occ.dueDate, 'yyyy-MM-dd'),
      daysUntil: days,
    };
  });

  // Count auto-detected subscriptions
  // Auto-detected bills have a linked bank account ID (from any provider)
  const autoDetectedCount = activeSubscriptions.filter(
    (sub) => (sub as any).linkedPlaidAccountId || (sub as any).linkedMXAccountId
  ).length;

  return {
    active,
    paused,
    monthlyTotal,
    yearlyTotal,
    upcomingRenewals,
    autoDetectedCount,
  };
}