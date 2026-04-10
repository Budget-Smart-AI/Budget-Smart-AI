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
} from 'date-fns';
import type { Bill } from '@shared/schema';
import { SubscriptionsResult, BillOccurrence } from './types';
import { getNextBillOccurrence, getBillsForPeriod } from './bills';

/**
 * Subscription categories that indicate a recurring, subscription-like expense.
 * These are bill categories that commonly represent subscriptions.
 */
const SUBSCRIPTION_CATEGORIES = [
  'Communications',    // Internet, phone services
  'Entertainment',     // Streaming services, apps
  'Fitness',          // Gym memberships, fitness apps
  'Education',        // Online courses, learning platforms
  'Business Travel & Meals',
  'Travel',           // Travel memberships, services
  'Coffee Shops',     // Membership/recurring visits
  'Other',            // Catch-all for misc subscriptions
];

/**
 * Determine if a bill is subscription-like based on category.
 * Categories in SUBSCRIPTION_CATEGORIES are considered subscriptions.
 *
 * @param bill - The bill to check
 * @returns true if the bill is subscription-like
 */
function isSubscriptionCategory(bill: Bill): boolean {
  return SUBSCRIPTION_CATEGORIES.includes(bill.category);
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
 */
function billToSubscriptionOccurrence(bill: Bill): BillOccurrence {
  return {
    billId: bill.id,
    billName: bill.name,
    amount: parseFloat(bill.amount),
    category: bill.category,
    dueDate: '',  // Will be set by caller if needed
    recurrence: bill.recurrence,
    isPaused: bill.isPaused === 'true',
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

  // Convert to output format
  const active = activeSubscriptions.map(billToSubscriptionOccurrence);
  const paused = pausedSubscriptions.map(billToSubscriptionOccurrence);

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
    const billOccurrence = billToSubscriptionOccurrence(occ.bill);
    const days = differenceInDays(occ.dueDate, todayStart);

    return {
      ...billOccurrence,
      dueDate: occ.bill.name, // Placeholder for renewing subscription name
      daysUntil: days,
    } as BillOccurrence & { daysUntil: number };
  });

  // Count auto-detected subscriptions
  // Auto-detected bills have a linked bank account ID (from any provider)
  const autoDetectedCount = activeSubscriptions.filter(
    (sub) => (sub as any).linkedPlaidAccountId || (sub as any).linkedBankAccountId
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
