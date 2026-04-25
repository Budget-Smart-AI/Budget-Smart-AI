/**
 * AI Financial Coach Module
 * Generates proactive financial insights:
 * - Spending pace alerts (week-over-week increase > 25%)
 * - Budget trajectory warnings
 * - Unused subscription detection
 * - Savings opportunity identification
 */

import { storage } from "./storage";
import type { InsertAiInsight } from "@shared/schema";
import { format, subDays, subMonths, startOfWeek, endOfWeek, parseISO, differenceInDays } from "date-fns";
import { auditLog } from "./audit-logger";

interface SpendingData {
  thisWeek: number;
  lastWeek: number;
  byCategory: Record<string, { thisWeek: number; lastWeek: number }>;
}

interface BudgetStatus {
  category: string;
  budgeted: number;
  spent: number;
  percentUsed: number;
  daysLeft: number;
  projectedOverage: number;
}

interface SubscriptionUsage {
  merchantName: string;
  lastCharge: string;
  daysSinceLastUse: number;
  monthlyAmount: number;
}

/**
 * Calculate spending comparison between this week and last week
 */
async function getSpendingComparison(userId: string): Promise<SpendingData> {
  const now = new Date();
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 0 });
  const thisWeekEnd = endOfWeek(now, { weekStartsOn: 0 });
  const lastWeekStart = subDays(thisWeekStart, 7);
  const lastWeekEnd = subDays(thisWeekEnd, 7);

  // Get Plaid items and accounts
  const plaidItems = await storage.getPlaidItems(userId);
  if (plaidItems.length === 0) {
    return { thisWeek: 0, lastWeek: 0, byCategory: {} };
  }

  const allAccounts = await Promise.all(
    plaidItems.map(item => storage.getPlaidAccounts(item.id))
  );
  const accountIds = allAccounts.flat()
    .filter(a => a.isActive === "true")
    .map(a => a.id);

  if (accountIds.length === 0) {
    return { thisWeek: 0, lastWeek: 0, byCategory: {} };
  }

  // Get transactions for both weeks
  const transactions = await storage.getPlaidTransactions(accountIds, {
    startDate: format(lastWeekStart, "yyyy-MM-dd"),
    endDate: format(thisWeekEnd, "yyyy-MM-dd"),
  });

  // Separate by week
  const thisWeekTxs = transactions.filter(tx => {
    const date = parseISO(tx.date);
    return date >= thisWeekStart && date <= thisWeekEnd;
  });

  const lastWeekTxs = transactions.filter(tx => {
    const date = parseISO(tx.date);
    return date >= lastWeekStart && date <= lastWeekEnd;
  });

  // Calculate totals
  const sumSpending = (txs: typeof transactions) =>
    txs
      .filter(tx => parseFloat(tx.amount) > 0) // Positive = spending in Plaid
      .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

  const thisWeek = sumSpending(thisWeekTxs);
  const lastWeek = sumSpending(lastWeekTxs);

  // Calculate by category
  const byCategory: Record<string, { thisWeek: number; lastWeek: number }> = {};

  for (const tx of thisWeekTxs) {
    const amount = parseFloat(tx.amount);
    if (amount <= 0) continue;
    // §6.2.8: category/personalCategory columns dropped — use canonicalCategoryId
    const cat = tx.canonicalCategoryId || "Other";
    if (!byCategory[cat]) byCategory[cat] = { thisWeek: 0, lastWeek: 0 };
    byCategory[cat].thisWeek += amount;
  }

  for (const tx of lastWeekTxs) {
    const amount = parseFloat(tx.amount);
    if (amount <= 0) continue;
    // §6.2.8: category/personalCategory columns dropped — use canonicalCategoryId
    const cat = tx.canonicalCategoryId || "Other";
    if (!byCategory[cat]) byCategory[cat] = { thisWeek: 0, lastWeek: 0 };
    byCategory[cat].lastWeek += amount;
  }

  return { thisWeek, lastWeek, byCategory };
}

/**
 * Check budget trajectories for the current month
 */
async function getBudgetTrajectories(userId: string): Promise<BudgetStatus[]> {
  const now = new Date();
  const currentMonth = format(now, "yyyy-MM");
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - dayOfMonth;

  // Get budgets
  const budgets = await storage.getBudgets(userId);
  if (budgets.length === 0) return [];

  // Get Plaid transactions for this month
  const plaidItems = await storage.getPlaidItems(userId);
  const allAccounts = await Promise.all(
    plaidItems.map(item => storage.getPlaidAccounts(item.id))
  );
  const accountIds = allAccounts.flat()
    .filter(a => a.isActive === "true")
    .map(a => a.id);

  const transactions = accountIds.length > 0
    ? await storage.getPlaidTransactions(accountIds, {
        startDate: `${currentMonth}-01`,
      })
    : [];

  // Calculate spending by category
  const spendingByCategory: Record<string, number> = {};
  for (const tx of transactions) {
    const amount = parseFloat(tx.amount);
    if (amount <= 0) continue;
    // §6.2.8: category/personalCategory columns dropped — use canonicalCategoryId
    const cat = tx.canonicalCategoryId || "Other";
    spendingByCategory[cat] = (spendingByCategory[cat] || 0) + amount;
  }

  // Calculate trajectories
  const statuses: BudgetStatus[] = [];

  for (const budget of budgets) {
    const budgeted = parseFloat(budget.amount);
    // §6.2.8: category column dropped — use canonicalCategoryId
    const spent = spendingByCategory[budget.canonicalCategoryId] || 0;
    const percentUsed = (spent / budgeted) * 100;

    // Project spending based on current pace
    const dailyRate = spent / dayOfMonth;
    const projectedTotal = dailyRate * daysInMonth;
    const projectedOverage = projectedTotal - budgeted;

    statuses.push({
      category: budget.canonicalCategoryId,
      budgeted,
      spent,
      percentUsed,
      daysLeft,
      projectedOverage: Math.max(0, projectedOverage),
    });
  }

  return statuses;
}

/**
 * Find potentially unused subscriptions
 */
async function findUnusedSubscriptions(userId: string): Promise<SubscriptionUsage[]> {
  // Get Plaid transactions for the last 90 days
  const plaidItems = await storage.getPlaidItems(userId);
  const allAccounts = await Promise.all(
    plaidItems.map(item => storage.getPlaidAccounts(item.id))
  );
  const accountIds = allAccounts.flat()
    .filter(a => a.isActive === "true")
    .map(a => a.id);

  if (accountIds.length === 0) return [];

  const ninetyDaysAgo = format(subDays(new Date(), 90), "yyyy-MM-dd");
  const transactions = await storage.getPlaidTransactions(accountIds, {
    startDate: ninetyDaysAgo,
  });

  // Known subscription merchants (common streaming, software, etc.)
  const subscriptionKeywords = [
    "netflix", "hulu", "disney", "spotify", "apple music", "youtube",
    "amazon prime", "hbo", "paramount", "peacock", "adobe", "microsoft",
    "dropbox", "google storage", "icloud", "gym", "fitness", "planet fitness",
    "audible", "kindle", "playstation", "xbox", "nintendo",
  ];

  // Group transactions by merchant
  const merchantTransactions: Record<string, { amounts: number[]; dates: string[] }> = {};

  for (const tx of transactions) {
    const amount = parseFloat(tx.amount);
    if (amount <= 0 || amount > 100) continue; // Subscriptions are usually under $100

    const merchant = (tx.merchantName || tx.name || "").toLowerCase();
    if (!merchant) continue;

    // Check if it's a known subscription type
    const isSubscription = subscriptionKeywords.some(kw => merchant.includes(kw));
    if (!isSubscription) continue;

    if (!merchantTransactions[merchant]) {
      merchantTransactions[merchant] = { amounts: [], dates: [] };
    }
    merchantTransactions[merchant].amounts.push(amount);
    merchantTransactions[merchant].dates.push(tx.date);
  }

  // Find subscriptions that haven't been charged in 60+ days
  const unused: SubscriptionUsage[] = [];
  const now = new Date();

  for (const [merchant, data] of Object.entries(merchantTransactions)) {
    if (data.dates.length < 2) continue; // Need recurring pattern

    const lastDate = data.dates.sort().pop()!;
    const daysSinceLast = differenceInDays(now, parseISO(lastDate));

    // Average amount
    const avgAmount = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length;

    // If charged monthly but not in 60+ days, might be unused
    if (daysSinceLast >= 60) {
      unused.push({
        merchantName: merchant,
        lastCharge: lastDate,
        daysSinceLastUse: daysSinceLast,
        monthlyAmount: avgAmount,
      });
    }
  }

  return unused;
}

/**
 * Detect savings opportunities based on income patterns
 */
async function detectSavingsOpportunities(userId: string): Promise<{ hasSurplus: boolean; avgSurplus: number }> {
  // Get last 3 months of data
  const now = new Date();
  const threeMonthsAgo = format(subMonths(now, 3), "yyyy-MM-dd");

  // Get income
  const incomes = await storage.getIncomes(userId);
  const monthlyIncome = incomes
    .filter(i => i.date >= threeMonthsAgo)
    .reduce((sum, i) => sum + parseFloat(i.amount), 0) / 3;

  // Get Plaid spending
  const plaidItems = await storage.getPlaidItems(userId);
  const allAccounts = await Promise.all(
    plaidItems.map(item => storage.getPlaidAccounts(item.id))
  );
  const accountIds = allAccounts.flat()
    .filter(a => a.isActive === "true")
    .map(a => a.id);

  let monthlySpending = 0;
  if (accountIds.length > 0) {
    const transactions = await storage.getPlaidTransactions(accountIds, {
      startDate: threeMonthsAgo,
    });
    monthlySpending = transactions
      .filter(tx => parseFloat(tx.amount) > 0)
      .reduce((sum, tx) => sum + parseFloat(tx.amount), 0) / 3;
  }

  const avgSurplus = monthlyIncome - monthlySpending;

  return {
    hasSurplus: avgSurplus > 100, // Consider > $100/month as opportunity
    avgSurplus: Math.round(avgSurplus),
  };
}

/**
 * Generate all AI insights for a user
 */
export async function generateAiInsights(userId: string): Promise<void> {
  const insights: InsertAiInsight[] = [];
  const now = new Date();
  const expiresAt = format(subDays(now, -7), "yyyy-MM-dd'T'HH:mm:ss'Z'"); // 7 days from now

  try {
    // 1. Spending pace analysis
    const spending = await getSpendingComparison(userId);
    if (spending.lastWeek > 0) {
      const percentChange = ((spending.thisWeek - spending.lastWeek) / spending.lastWeek) * 100;

      if (percentChange > 25) {
        insights.push({
          userId,
          insightType: "spending_pace",
          title: "Spending Pace Alert",
          message: `You've spent ${percentChange.toFixed(0)}% more this week ($${spending.thisWeek.toFixed(0)}) compared to last week ($${spending.lastWeek.toFixed(0)}).`,
          severity: percentChange > 50 ? "warning" : "info",
          actionUrl: "/transactions",
          expiresAt,
        });
      }

      // Check individual categories
      for (const [category, data] of Object.entries(spending.byCategory)) {
        if (data.lastWeek > 50) { // Only if meaningful last week spending
          const catChange = ((data.thisWeek - data.lastWeek) / data.lastWeek) * 100;
          if (catChange > 50 && data.thisWeek > 100) {
            insights.push({
              userId,
              insightType: "spending_pace",
              title: `${category} Spending Up`,
              message: `${category} spending is up ${catChange.toFixed(0)}% this week ($${data.thisWeek.toFixed(0)} vs $${data.lastWeek.toFixed(0)} last week).`,
              severity: "info",
              category,
              actionUrl: "/transactions",
              expiresAt,
            });
          }
        }
      }
    }

    // 2. Budget trajectory warnings
    const budgetStatuses = await getBudgetTrajectories(userId);
    for (const status of budgetStatuses) {
      // Warn if on pace to exceed by 20%+ and past first week of month
      if (status.projectedOverage > 0 && status.daysLeft > 7 && status.percentUsed > 60) {
        const dayToExceed = Math.ceil((status.budgeted / (status.spent / (30 - status.daysLeft))));
        insights.push({
          userId,
          insightType: "budget_trajectory",
          title: `${status.category} Budget Warning`,
          message: `At current pace, you'll exceed your $${status.budgeted.toFixed(0)} ${status.category} budget by the ${dayToExceed}th.`,
          severity: status.percentUsed > 80 ? "warning" : "info",
          category: status.category,
          actionUrl: "/budgets",
          expiresAt,
        });
      }
    }

    // 3. Unused subscription detection
    const unusedSubs = await findUnusedSubscriptions(userId);
    for (const sub of unusedSubs) {
      insights.push({
        userId,
        insightType: "subscription_unused",
        title: "Unused Subscription?",
        message: `${sub.merchantName} hasn't been used in ${sub.daysSinceLastUse} days. You're paying ~$${sub.monthlyAmount.toFixed(0)}/month.`,
        severity: "info",
        actionUrl: "/transactions",
        expiresAt,
      });
    }

    // 4. Savings opportunity
    const savingsOpp = await detectSavingsOpportunities(userId);
    if (savingsOpp.hasSurplus) {
      insights.push({
        userId,
        insightType: "savings_opportunity",
        title: "Savings Opportunity",
        message: `You typically have $${savingsOpp.avgSurplus} extra each month. Consider setting up automatic savings!`,
        severity: "info",
        actionUrl: "/goals",
        expiresAt,
      });
    }

    // Save insights (avoid duplicates)
    for (const insight of insights) {
      // Check for existing similar insight
      const existing = await storage.getAiInsights(userId, { includeRead: true, includeDismissed: true });
      const isDuplicate = existing.some(e =>
        e.insightType === insight.insightType &&
        e.title === insight.title &&
        e.isDismissed !== "true" &&
        differenceInDays(now, parseISO(e.createdAt!)) < 3
      );

      if (!isDuplicate) {
        await storage.createAiInsight(insight);

        // Also create a notification for warnings/alerts
        if (insight.severity === "warning" || insight.severity === "alert") {
          try {
            await storage.createNotification({
              userId,
              type: "ai_insight",
              title: insight.title,
              message: insight.message,
              isRead: "false",
            });
          } catch (err) {
            console.error("Failed to create insight notification:", err);
          }
        }
      }
    }

    console.log(`Generated ${insights.length} AI insights for user ${userId}`);
  } catch (error) {
    console.error(`Error generating AI insights for user ${userId}:`, error);
  }
}

/**
 * Run AI coach for all users (called by scheduler)
 */
export async function runAiCoachForAllUsers(): Promise<void> {
  console.log("Running AI Coach for all users...");

  try {
    // Get all users with Plaid items (active users)
    const users = await storage.getUsers();

    let successCount = 0;
    let errorCount = 0;
    for (const user of users) {
      try {
        await generateAiInsights(user.id);
        successCount++;
      } catch (error) {
        console.error(`Error running AI coach for user ${user.id}:`, error);
        errorCount++;
      }
    }

    // Clean up expired insights
    await storage.deleteExpiredAiInsights();

    auditLog({
      eventType: "data.ai_coach_run",
      eventCategory: "data",
      actorId: null,
      actorType: "system",
      action: "ai_coach_run",
      outcome: errorCount > 0 && successCount === 0 ? "failure" : "success",
      metadata: { usersProcessed: successCount, errors: errorCount },
    });

    console.log("AI Coach completed for all users");
  } catch (error) {
    console.error("Error running AI Coach:", error);
    auditLog({
      eventType: "data.ai_coach_run",
      eventCategory: "data",
      actorId: null,
      actorType: "system",
      action: "ai_coach_run",
      outcome: "failure",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Start the AI Coach scheduler
 * Runs daily at 8 AM
 */
export function startAiCoachScheduler(): void {
  // Run immediately on startup (after a delay to let app initialize)
  setTimeout(() => {
    runAiCoachForAllUsers().catch(console.error);
  }, 60000); // 1 minute delay

  // Schedule to run daily at 8 AM
  const scheduleDaily = () => {
    const now = new Date();
    const next8AM = new Date(now);
    next8AM.setHours(8, 0, 0, 0);

    if (next8AM <= now) {
      next8AM.setDate(next8AM.getDate() + 1);
    }

    const msUntilNext = next8AM.getTime() - now.getTime();

    setTimeout(() => {
      runAiCoachForAllUsers().catch(console.error);
      // Schedule next run
      setInterval(() => {
        runAiCoachForAllUsers().catch(console.error);
      }, 24 * 60 * 60 * 1000); // Every 24 hours
    }, msUntilNext);

    console.log(`AI Coach scheduled to run at ${next8AM.toISOString()}`);
  };

  scheduleDaily();
}
