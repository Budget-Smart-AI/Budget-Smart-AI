import { storage } from "./storage";
import { pool } from "./db";
import { format, setDate, addMonths, isBefore, isAfter, startOfMonth, endOfMonth } from "date-fns";
import type { Budget, Expense, Bill } from "@shared/schema";

/**
 * Check whether a notification of the given type+title already exists for
 * this user in the current calendar month.  Used to prevent duplicate
 * budget_alert / budget_warning notifications when the hourly scheduler fires.
 */
async function notificationAlreadySentThisMonth(
  userId: string,
  type: string,
  title: string
): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT 1 FROM notifications
       WHERE user_id = $1
         AND type = $2
         AND title = $3
         AND created_at >= date_trunc('month', NOW())
         AND created_at <  date_trunc('month', NOW()) + interval '1 month'
       LIMIT 1`,
      [userId, type, title]
    );
    return (result.rowCount ?? 0) > 0;
  } catch {
    // If the query fails (e.g. table not yet created) allow the notification
    // to be created so we don't silently swallow alerts.
    return false;
  }
}

// Convert dollar amount string to integer cents to avoid floating point errors
function toCents(amount: string | number): number {
  return Math.round(parseFloat(String(amount)) * 100);
}

// Convert cents back to dollars (as number with two decimal places)
function toDollars(cents: number): number {
  return Math.round(cents) / 100;
}

function isBillDueInMonth(bill: Bill, month: string): boolean {
  const now = new Date();
  const [year, monthNum] = month.split("-").map(Number);
  const monthStart = startOfMonth(new Date(year, monthNum - 1));
  const monthEnd = endOfMonth(new Date(year, monthNum - 1));
  
  const dueDay = bill.dueDay;
  
  if (bill.recurrence === "monthly") {
    return true;
  }
  
  if (bill.recurrence === "yearly") {
    let dueDate = setDate(new Date(year, monthNum - 1), dueDay);
    return !isBefore(dueDate, monthStart) && !isAfter(dueDate, monthEnd);
  }
  
  return true;
}

export async function checkBudgetAlerts(userId: string): Promise<void> {
  console.log(`[Budget] Checking budget alerts for user ${userId}`);

  try {
    const budgets = await storage.getBudgets(userId);
    if (budgets.length === 0) {
      console.log(`[Budget] No budgets found for user ${userId}`);
      return;
    }

    // §6.2.7-prep follow-up: build canonical_category_id → display_name map
    // so notification text reads as "Budget Exceeded: Groceries" rather than
    // the raw slug "Budget Exceeded: food_groceries". One DB query per
    // budget-alerts run; the taxonomy is small (~67 system rows + per-user customs).
    const canonicalNameByIdResult = await pool.query<{ id: string; display_name: string }>(
      "SELECT id, display_name FROM canonical_categories WHERE user_id IS NULL OR user_id = $1",
      [userId],
    );
    const canonicalNameById = new Map(
      canonicalNameByIdResult.rows.map((r) => [r.id, r.display_name]),
    );
    const displayNameFor = (canonicalId: string): string =>
      canonicalNameById.get(canonicalId) ?? canonicalId;

    const currentMonth = format(new Date(), "yyyy-MM");
    const allExpenses = await storage.getAllExpenses();
    const allBills = await storage.getAllBills();
    
    const expenses = allExpenses.filter((e: Expense) => e.userId === userId);
    const bills = allBills.filter((b: Bill) => b.userId === userId);

    const currentMonthExpenses = expenses.filter((e: Expense) => {
      const expenseMonth = e.date.substring(0, 7);
      return expenseMonth === currentMonth;
    });

    const categorySpending: Record<string, number> = {};
    for (const expense of currentMonthExpenses) {
      const category = expense.canonicalCategoryId.toLowerCase();
      categorySpending[category] = (categorySpending[category] || 0) + toCents(expense.amount);
    }

    const currentMonthBills = bills.filter((b: Bill) => isBillDueInMonth(b, currentMonth));
    for (const bill of currentMonthBills) {
      const category = bill.canonicalCategoryId.toLowerCase();
      categorySpending[category] = (categorySpending[category] || 0) + toCents(bill.amount);
    }

    for (const budget of budgets) {
      const budgetCategory = budget.canonicalCategoryId.toLowerCase();
      const spentCents = categorySpending[budgetCategory] || 0;
      const limitCents = toCents(budget.amount);
      const spentDollars = toDollars(spentCents);
      const limitDollars = toDollars(limitCents);
      const percentage = limitDollars > 0 ? (spentDollars / limitDollars) * 100 : 0;

      const existingAlerts = await storage.getBudgetAlerts(userId, currentMonth);
      const hasActiveAlert = existingAlerts.some(a => 
        a.budgetId === String(budget.id) && 
        a.month === currentMonth
      );

      // Display name for user-facing strings; raw slug stays for DB writes.
      const budgetCategoryName = displayNameFor(budget.canonicalCategoryId);

      if (percentage >= 100 && !hasActiveAlert) {
        await storage.createBudgetAlert({
          userId,
          budgetId: String(budget.id),
          category: budget.canonicalCategoryId,
          month: currentMonth,
          thresholdPercent: 100,
          currentPercent: Math.round(percentage),
          amountSpent: String(spentDollars.toFixed(2)),
          budgetAmount: String(limitDollars.toFixed(2)),
          alertSentAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"),
          emailSent: "false"
        });

        // Dedup guard: only create the notification if one hasn't already been
        // sent for this category this month (prevents duplicates when the
        // hourly scheduler fires multiple times).
        const notifTitle = `Budget Exceeded: ${budgetCategoryName}`;
        const alreadyNotified = await notificationAlreadySentThisMonth(userId, "budget_alert", notifTitle);
        if (!alreadyNotified) {
          await storage.createNotification({
            userId,
            type: "budget_alert",
            title: notifTitle,
            message: `You've exceeded your ${budgetCategoryName} budget! Spent $${spentDollars.toFixed(2)} of $${limitDollars.toFixed(2)} limit.`,
            link: "/budgets",
            isRead: "false",
            createdAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss")
          });
          console.log(`[Budget] ✅ Created exceeded notification for ${budgetCategoryName}`);
        } else {
          console.log(`[Budget] Dedup: notification already sent for ${budgetCategoryName} this month, skipping`);
        }
      } else if (percentage >= 80 && percentage < 100 && !hasActiveAlert) {
        await storage.createBudgetAlert({
          userId,
          budgetId: String(budget.id),
          category: budget.canonicalCategoryId,
          month: currentMonth,
          thresholdPercent: 80,
          currentPercent: Math.round(percentage),
          amountSpent: String(spentDollars.toFixed(2)),
          budgetAmount: String(limitDollars.toFixed(2)),
          alertSentAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"),
          emailSent: "false"
        });

        // Dedup guard: only create the notification if one hasn't already been
        // sent for this category this month.
        const warnTitle = `Budget Warning: ${budgetCategoryName}`;
        const alreadyWarned = await notificationAlreadySentThisMonth(userId, "budget_alert", warnTitle);
        if (!alreadyWarned) {
          await storage.createNotification({
            userId,
            type: "budget_alert",
            title: warnTitle,
            message: `You've used ${percentage.toFixed(0)}% of your ${budgetCategoryName} budget. Spent $${spentDollars.toFixed(2)} of $${limitDollars.toFixed(2)} limit.`,
            link: "/budgets",
            isRead: "false",
            createdAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss")
          });
          console.log(`[Budget] ✅ Created warning notification for ${budgetCategoryName}`);
        } else {
          console.log(`[Budget] Dedup: warning notification already sent for ${budgetCategoryName} this month, skipping`);
        }
      }
    }

    console.log(`[Budget] Finished checking alerts for user ${userId}`);
  } catch (error) {
    console.error(`[Budget] Error checking alerts for user ${userId}:`, error);
  }
}

export async function checkAllUsersBudgetAlerts(): Promise<void> {
  console.log("[Budget] Checking budget alerts for all users...");
  
  try {
    const users = await storage.getUsers();
    for (const user of users) {
      await checkBudgetAlerts(String(user.id));
    }
    console.log("[Budget] Finished checking all users");
  } catch (error) {
    console.error("[Budget] Error checking all users:", error);
  }
}
