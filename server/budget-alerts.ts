import { storage } from "./storage";
import { format, setDate, addMonths, isBefore, isAfter, startOfMonth, endOfMonth } from "date-fns";
import type { Budget, Expense, Bill } from "@shared/schema";

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
      const category = expense.category.toLowerCase();
      categorySpending[category] = (categorySpending[category] || 0) + toCents(expense.amount);
    }

    const currentMonthBills = bills.filter((b: Bill) => isBillDueInMonth(b, currentMonth));
    for (const bill of currentMonthBills) {
      const category = bill.category.toLowerCase();
      categorySpending[category] = (categorySpending[category] || 0) + toCents(bill.amount);
    }

    for (const budget of budgets) {
      const budgetCategory = budget.category.toLowerCase();
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

      if (percentage >= 100 && !hasActiveAlert) {
        await storage.createBudgetAlert({
          userId,
          budgetId: String(budget.id),
          category: budget.category,
          month: currentMonth,
          thresholdPercent: 100,
          currentPercent: Math.round(percentage),
          amountSpent: String(spentDollars.toFixed(2)),
          budgetAmount: String(limitDollars.toFixed(2)),
          alertSentAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"),
          emailSent: "false"
        });

        await storage.createNotification({
          userId,
          type: "budget_alert",
          title: `Budget Exceeded: ${budget.category}`,
          message: `You've exceeded your ${budget.category} budget! Spent $${spentDollars.toFixed(2)} of $${limitDollars.toFixed(2)} limit.`,
          link: "/budgets",
          isRead: "false",
          createdAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss")
        });

        console.log(`[Budget] Created exceeded alert for ${budget.category}`);
      } else if (percentage >= 80 && percentage < 100 && !hasActiveAlert) {
        await storage.createBudgetAlert({
          userId,
          budgetId: String(budget.id),
          category: budget.category,
          month: currentMonth,
          thresholdPercent: 80,
          currentPercent: Math.round(percentage),
          amountSpent: String(spentDollars.toFixed(2)),
          budgetAmount: String(limitDollars.toFixed(2)),
          alertSentAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"),
          emailSent: "false"
        });

        await storage.createNotification({
          userId,
          type: "budget_alert",
          title: `Budget Warning: ${budget.category}`,
          message: `You've used ${percentage.toFixed(0)}% of your ${budget.category} budget. Spent $${spentDollars.toFixed(2)} of $${limitDollars.toFixed(2)} limit.`,
          link: "/budgets",
          isRead: "false",
          createdAt: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss")
        });

        console.log(`[Budget] Created warning alert for ${budget.category}`);
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
