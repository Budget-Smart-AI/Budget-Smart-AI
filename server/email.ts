import nodemailer from "nodemailer";
import { format, setDate, isBefore, addMonths, addDays, addWeeks, setDay, subDays, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, subWeeks } from "date-fns";
import { storage } from "./storage";
import type { Bill, Expense, Income, Budget, SavingsGoal } from "@shared/schema";
import { startAiCoachScheduler } from "./ai-coach";
import { checkVaultExpiryNotifications } from "./routes/vault";

// Lazy SMTP transporter – only created once POSTMARK_SERVER is confirmed
// present so that missing env vars can never crash the process at import time.
let _transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter(): ReturnType<typeof nodemailer.createTransport> | null {
  if (!process.env.POSTMARK_SERVER || !process.env.POSTMARK_USERNAME || !process.env.POSTMARK_PASSWORD) {
    return null;
  }
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.POSTMARK_SERVER,
      port: 587,
      secure: false,
      auth: {
        user: process.env.POSTMARK_USERNAME,
        pass: process.env.POSTMARK_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false
      },
    });
  }
  return _transporter;
}

function getNextDueDate(dueDay: number, recurrence: string, customDates?: string | null, startDate?: string | null): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Handle one-time payments
  if (recurrence === "one_time") {
    if (startDate) {
      return parseISO(startDate);
    }
    // If no start date, use dueDay of current/next month
    let nextDue = setDate(today, dueDay);
    if (isBefore(nextDue, today)) {
      nextDue = addMonths(nextDue, 1);
    }
    return nextDue;
  }

  // Handle custom dates
  if (recurrence === "custom" && customDates) {
    try {
      const dates: string[] = JSON.parse(customDates);
      const futureDates = dates
        .map(d => parseISO(d))
        .filter(d => !isBefore(d, today))
        .sort((a, b) => a.getTime() - b.getTime());
      if (futureDates.length > 0) {
        return futureDates[0];
      }
      // If no future dates, return the last date
      const allDates = dates.map(d => parseISO(d)).sort((a, b) => b.getTime() - a.getTime());
      return allDates[0] || today;
    } catch {
      return today;
    }
  }

  // Handle weekly (dueDay is day of week 0-6)
  if (recurrence === "weekly") {
    // If start date is in the future, use that as the first due date
    if (startDate) {
      const start = parseISO(startDate);
      start.setHours(0, 0, 0, 0);
      if (!isBefore(start, today)) {
        // Start date is in the future - return it as the next due date
        return start;
      }
      // Start date is in the past - calculate next occurrence from start date
      let nextDue = start;
      while (isBefore(nextDue, today) || nextDue.getTime() === today.getTime()) {
        nextDue = addWeeks(nextDue, 1);
      }
      return nextDue;
    }
    // No start date - use current week's occurrence of the day
    let nextDue = setDay(today, dueDay, { weekStartsOn: 0 });
    nextDue.setHours(0, 0, 0, 0);
    if (isBefore(nextDue, today) || nextDue.getTime() === today.getTime()) {
      nextDue = addWeeks(nextDue, 1);
    }
    return nextDue;
  }

  // For monthly, yearly, biweekly - dueDay is day of month (1-31)
  let nextDue = setDate(today, dueDay);
  nextDue.setHours(0, 0, 0, 0);

  if (isBefore(nextDue, today)) {
    if (recurrence === "monthly") {
      nextDue = addMonths(nextDue, 1);
    } else if (recurrence === "yearly") {
      nextDue = addMonths(nextDue, 12);
    } else if (recurrence === "biweekly") {
      // Keep adding 14 days until we get a future date
      while (isBefore(nextDue, today)) {
        nextDue = addDays(nextDue, 14);
      }
    }
  }

  return nextDue;
}

function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

async function sendBillReminder(bill: Bill, dueDate: Date): Promise<boolean> {
  if (!process.env.POSTMARK_SERVER || !process.env.POSTMARK_USERNAME) {
    console.warn('[Email] Postmark not configured, skipping email send');
    return false;
  }
  const fromEmail = process.env.ALERT_EMAIL_FROM;
  const toEmail = process.env.ALERT_EMAIL_TO;

  if (!fromEmail || !toEmail) {
    console.log("Email configuration missing, skipping notification");
    return false;
  }

  const subject = `Upcoming Bill Reminder - ${bill.name}`;
  const body = `Your bill for ${bill.name} in the amount of ${formatCurrency(bill.amount)} is due tomorrow (${format(dueDate, "MMMM d, yyyy")}).

Category: ${bill.category}
Recurrence: ${bill.recurrence}
${bill.notes ? `Notes: ${bill.notes}` : ""}

This is an automated reminder from Budget Smart AI.`;

  const tr = getTransporter();
  if (!tr) {
    console.log("[Email] SMTP not configured, skipping bill reminder.");
    return false;
  }

  try {
    await tr.sendMail({
      from: fromEmail,
      to: toEmail,
      subject: subject,
      text: body,
    });
    console.log(`Email sent for bill: ${bill.name}`);
    return true;
  } catch (error) {
    console.error(`Failed to send email for bill ${bill.name}:`, error);
    return false;
  }
}

export async function checkAndSendReminders(): Promise<void> {
  console.log("Checking for bills due tomorrow...");

  const bills = await storage.getAllBills();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = format(today, "yyyy-MM-dd");

  for (const bill of bills) {
    const nextDue = getNextDueDate(bill.dueDay, bill.recurrence, bill.customDates, bill.startDate);
    const reminderDate = subDays(nextDue, 1);
    reminderDate.setHours(0, 0, 0, 0);

    // Check if today is the reminder day (1 day before due date)
    if (format(reminderDate, "yyyy-MM-dd") === todayStr) {
      // Check if we've already sent a notification for this billing cycle
      // Use full date for weekly/biweekly/custom/one_time, "yyyy-MM" for monthly/yearly
      const cycleKey = (bill.recurrence === "biweekly" || bill.recurrence === "weekly" || bill.recurrence === "custom" || bill.recurrence === "one_time")
        ? format(nextDue, "yyyy-MM-dd")
        : format(nextDue, "yyyy-MM");

      if (bill.lastNotifiedCycle !== cycleKey) {
        console.log(`Sending reminder for bill: ${bill.name}, due: ${format(nextDue, "yyyy-MM-dd")}`);

        const sent = await sendBillReminder(bill, nextDue);

        if (sent) {
          await storage.updateBillNotifiedCycle(bill.id, cycleKey);
        }
      } else {
        console.log(`Already notified for bill: ${bill.name} this cycle`);
      }
    }
  }

  console.log("Finished checking bills");
}

export function startEmailScheduler(): void {
  // Run checks immediately on startup
  checkAndSendReminders().catch(console.error);
  checkAndSendWeeklyDigests().catch(console.error);
  checkAndSendMonthlyReports().catch(console.error);
  checkVaultExpiryNotifications().catch(console.error);

  // Then run every 24 hours (once per day)
  const oneDayMs = 24 * 60 * 60 * 1000;
  setInterval(() => {
    checkAndSendReminders().catch(console.error);
    checkAndSendWeeklyDigests().catch(console.error);
    checkAndSendMonthlyReports().catch(console.error);
    checkVaultExpiryNotifications().catch(console.error);
  }, oneDayMs);

  console.log("Email scheduler started - checking reminders, weekly digests, and monthly reports daily");

  // Start AI Coach scheduler
  startAiCoachScheduler();
}

// Generate weekly financial summary
interface WeeklySummary {
  totalSpent: number;
  totalIncome: number;
  expensesByCategory: Record<string, number>;
  upcomingBills: { name: string; amount: number; dueDate: Date }[];
  budgetStatus: { category: string; spent: number; limit: number; percent: number }[];
  savingsProgress: { name: string; current: number; target: number; percent: number }[];
}

async function generateWeeklySummary(userId: string): Promise<WeeklySummary> {
  const now = new Date();
  const weekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 0 });
  const weekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 0 });
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");

  // Get expenses for last week
  const allExpenses = await storage.getExpenses(userId);
  const weekExpenses = allExpenses.filter((e: Expense) => {
    return e.date >= weekStartStr && e.date <= weekEndStr;
  });

  // Get income for last week
  const allIncome = await storage.getIncomes(userId);
  const weekIncome = allIncome.filter((i: Income) => {
    return i.date >= weekStartStr && i.date <= weekEndStr;
  });

  // Calculate totals
  const totalSpent = weekExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  const totalIncome = weekIncome.reduce((sum, i) => sum + parseFloat(i.amount), 0);

  // Group expenses by category
  const expensesByCategory: Record<string, number> = {};
  for (const expense of weekExpenses) {
    const cat = expense.category || "Other";
    expensesByCategory[cat] = (expensesByCategory[cat] || 0) + parseFloat(expense.amount);
  }

  // Get upcoming bills for next 7 days
  const bills = await storage.getBills(userId);
  const upcomingBills: { name: string; amount: number; dueDate: Date }[] = [];
  const nextWeek = addDays(now, 7);

  for (const bill of bills) {
    if (bill.isPaused === "true") continue;
    const dueDate = getNextDueDate(bill.dueDay, bill.recurrence, bill.customDates, bill.startDate);
    if (dueDate <= nextWeek) {
      upcomingBills.push({
        name: bill.name,
        amount: parseFloat(bill.amount),
        dueDate,
      });
    }
  }

  // Get budget status for current month
  const currentMonth = format(now, "yyyy-MM");
  const budgets = await storage.getBudgets(userId);
  const monthExpenses = allExpenses.filter((e: Expense) => e.date.startsWith(currentMonth));

  const budgetStatus: { category: string; spent: number; limit: number; percent: number }[] = [];
  for (const budget of budgets) {
    const catExpenses = monthExpenses.filter((e: Expense) =>
      e.category.toLowerCase() === budget.category.toLowerCase()
    );
    const spent = catExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const limit = parseFloat(budget.amount);
    const percent = limit > 0 ? (spent / limit) * 100 : 0;
    budgetStatus.push({ category: budget.category, spent, limit, percent });
  }

  // Get savings goals progress
  const savingsGoals = await storage.getSavingsGoals(userId);
  const savingsProgress: { name: string; current: number; target: number; percent: number }[] = [];
  for (const goal of savingsGoals) {
    const current = parseFloat(goal.currentAmount);
    const target = parseFloat(goal.targetAmount);
    const percent = target > 0 ? (current / target) * 100 : 0;
    savingsProgress.push({ name: goal.name, current, target, percent });
  }

  return {
    totalSpent,
    totalIncome,
    expensesByCategory,
    upcomingBills,
    budgetStatus,
    savingsProgress,
  };
}

// Generate monthly financial report
interface MonthlySummary {
  month: string;
  totalSpent: number;
  totalIncome: number;
  netSavings: number;
  expensesByCategory: Record<string, number>;
  budgetPerformance: { category: string; spent: number; limit: number; percent: number; status: string }[];
  savingsProgress: { name: string; current: number; target: number; percent: number }[];
  comparedToLastMonth: { spendingChange: number; incomeChange: number };
  topExpenseCategories: { category: string; amount: number }[];
}

async function generateMonthlySummary(userId: string): Promise<MonthlySummary> {
  const now = new Date();
  const lastMonth = subMonths(now, 1);
  const lastMonthStr = format(lastMonth, "yyyy-MM");
  const twoMonthsAgoStr = format(subMonths(now, 2), "yyyy-MM");
  const monthName = format(lastMonth, "MMMM yyyy");

  // Get expenses for last month
  const allExpenses = await storage.getExpenses(userId);
  const lastMonthExpenses = allExpenses.filter((e: Expense) => e.date.startsWith(lastMonthStr));
  const prevMonthExpenses = allExpenses.filter((e: Expense) => e.date.startsWith(twoMonthsAgoStr));

  // Get income for last month
  const allIncome = await storage.getIncomes(userId);
  const lastMonthIncome = allIncome.filter((i: Income) => i.date.startsWith(lastMonthStr));
  const prevMonthIncome = allIncome.filter((i: Income) => i.date.startsWith(twoMonthsAgoStr));

  // Calculate totals
  const totalSpent = lastMonthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  const totalIncome = lastMonthIncome.reduce((sum, i) => sum + parseFloat(i.amount), 0);
  const netSavings = totalIncome - totalSpent;

  const prevTotalSpent = prevMonthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  const prevTotalIncome = prevMonthIncome.reduce((sum, i) => sum + parseFloat(i.amount), 0);

  const spendingChange = prevTotalSpent > 0 ? ((totalSpent - prevTotalSpent) / prevTotalSpent) * 100 : 0;
  const incomeChange = prevTotalIncome > 0 ? ((totalIncome - prevTotalIncome) / prevTotalIncome) * 100 : 0;

  // Group expenses by category
  const expensesByCategory: Record<string, number> = {};
  for (const expense of lastMonthExpenses) {
    const cat = expense.category || "Other";
    expensesByCategory[cat] = (expensesByCategory[cat] || 0) + parseFloat(expense.amount);
  }

  // Top expense categories
  const topExpenseCategories = Object.entries(expensesByCategory)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Get budget performance
  const budgets = await storage.getBudgets(userId);
  const budgetPerformance: { category: string; spent: number; limit: number; percent: number; status: string }[] = [];

  for (const budget of budgets) {
    const catExpenses = lastMonthExpenses.filter((e: Expense) =>
      e.category.toLowerCase() === budget.category.toLowerCase()
    );
    const spent = catExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const limit = parseFloat(budget.amount);
    const percent = limit > 0 ? (spent / limit) * 100 : 0;
    let status = "On Track";
    if (percent >= 100) status = "Over Budget";
    else if (percent >= 80) status = "Warning";
    budgetPerformance.push({ category: budget.category, spent, limit, percent, status });
  }

  // Get savings goals progress
  const savingsGoals = await storage.getSavingsGoals(userId);
  const savingsProgress: { name: string; current: number; target: number; percent: number }[] = [];
  for (const goal of savingsGoals) {
    const current = parseFloat(goal.currentAmount);
    const target = parseFloat(goal.targetAmount);
    const percent = target > 0 ? (current / target) * 100 : 0;
    savingsProgress.push({ name: goal.name, current, target, percent });
  }

  return {
    month: monthName,
    totalSpent,
    totalIncome,
    netSavings,
    expensesByCategory,
    budgetPerformance,
    savingsProgress,
    comparedToLastMonth: { spendingChange, incomeChange },
    topExpenseCategories,
  };
}

// Send weekly digest email
async function sendWeeklyDigest(userId: string, email: string): Promise<boolean> {
  if (!process.env.POSTMARK_SERVER || !process.env.POSTMARK_USERNAME) {
    console.warn('[Email] Postmark not configured, skipping email send');
    return false;
  }
  const fromEmail = process.env.ALERT_EMAIL_FROM;
  if (!fromEmail) {
    console.log("Email configuration missing, skipping weekly digest");
    return false;
  }

  try {
    const summary = await generateWeeklySummary(userId);
    const weekRange = `${format(startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 0 }), "MMM d")} - ${format(endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 0 }), "MMM d, yyyy")}`;

    // Build category breakdown
    const categoryBreakdown = Object.entries(summary.expensesByCategory)
      .sort(([, a], [, b]) => b - a)
      .map(([cat, amount]) => `  - ${cat}: ${formatCurrency(amount)}`)
      .join("\n");

    // Build upcoming bills list
    const billsList = summary.upcomingBills
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .map(b => `  - ${b.name}: ${formatCurrency(b.amount)} (due ${format(b.dueDate, "MMM d")})`)
      .join("\n") || "  No bills due this week";

    // Build budget status
    const budgetList = summary.budgetStatus
      .map(b => {
        const statusIcon = b.percent >= 100 ? "[OVER]" : b.percent >= 80 ? "[WARNING]" : "[OK]";
        return `  ${statusIcon} ${b.category}: ${formatCurrency(b.spent)} of ${formatCurrency(b.limit)} (${b.percent.toFixed(0)}%)`;
      })
      .join("\n") || "  No budgets set";

    // Build savings progress
    const savingsList = summary.savingsProgress
      .map(s => `  - ${s.name}: ${formatCurrency(s.current)} of ${formatCurrency(s.target)} (${s.percent.toFixed(0)}%)`)
      .join("\n") || "  No savings goals";

    const subject = `Your Weekly Financial Summary - ${weekRange}`;
    const body = `Hi there!

Here's your financial summary for the week of ${weekRange}:

WEEKLY OVERVIEW
===============
Total Spent: ${formatCurrency(summary.totalSpent)}
Total Income: ${formatCurrency(summary.totalIncome)}
Net: ${formatCurrency(summary.totalIncome - summary.totalSpent)}

SPENDING BY CATEGORY
====================
${categoryBreakdown || "  No expenses this week"}

UPCOMING BILLS (Next 7 Days)
============================
${billsList}

BUDGET STATUS (This Month)
==========================
${budgetList}

SAVINGS PROGRESS
================
${savingsList}

---
Keep up the great work managing your finances!

Best regards,
Budget Smart AI

To manage your email preferences, visit your settings at ${process.env.APP_URL || "https://app.budgetsmart.io"}/email-settings`;

    const tr = getTransporter();
    if (!tr) {
      console.log("[Email] SMTP not configured, skipping weekly digest.");
      return false;
    }

    await tr.sendMail({
      from: fromEmail,
      to: email,
      subject: subject,
      text: body,
    });

    console.log(`Weekly digest sent to: ${email}`);
    return true;
  } catch (error) {
    console.error("Failed to send weekly digest:", error);
    return false;
  }
}

// Send monthly report email
async function sendMonthlyReport(userId: string, email: string): Promise<boolean> {
  if (!process.env.POSTMARK_SERVER || !process.env.POSTMARK_USERNAME) {
    console.warn('[Email] Postmark not configured, skipping email send');
    return false;
  }
  const fromEmail = process.env.ALERT_EMAIL_FROM;
  if (!fromEmail) {
    console.log("Email configuration missing, skipping monthly report");
    return false;
  }

  try {
    const summary = await generateMonthlySummary(userId);

    // Build category breakdown
    const categoryBreakdown = summary.topExpenseCategories
      .map(({ category, amount }) => `  - ${category}: ${formatCurrency(amount)}`)
      .join("\n");

    // Build budget performance
    const budgetList = summary.budgetPerformance
      .map(b => {
        const statusIcon = b.status === "Over Budget" ? "[OVER]" : b.status === "Warning" ? "[WARNING]" : "[OK]";
        return `  ${statusIcon} ${b.category}: ${formatCurrency(b.spent)} of ${formatCurrency(b.limit)} (${b.percent.toFixed(0)}%)`;
      })
      .join("\n") || "  No budgets set";

    // Build savings progress
    const savingsList = summary.savingsProgress
      .map(s => `  - ${s.name}: ${formatCurrency(s.current)} of ${formatCurrency(s.target)} (${s.percent.toFixed(0)}%)`)
      .join("\n") || "  No savings goals";

    // Comparison text
    const spendingTrend = summary.comparedToLastMonth.spendingChange > 0
      ? `up ${summary.comparedToLastMonth.spendingChange.toFixed(1)}%`
      : summary.comparedToLastMonth.spendingChange < 0
        ? `down ${Math.abs(summary.comparedToLastMonth.spendingChange).toFixed(1)}%`
        : "unchanged";
    const incomeTrend = summary.comparedToLastMonth.incomeChange > 0
      ? `up ${summary.comparedToLastMonth.incomeChange.toFixed(1)}%`
      : summary.comparedToLastMonth.incomeChange < 0
        ? `down ${Math.abs(summary.comparedToLastMonth.incomeChange).toFixed(1)}%`
        : "unchanged";

    const subject = `Your Monthly Financial Report - ${summary.month}`;
    const body = `Hi there!

Here's your complete financial report for ${summary.month}:

MONTHLY OVERVIEW
================
Total Income:    ${formatCurrency(summary.totalIncome)}
Total Spending:  ${formatCurrency(summary.totalSpent)}
Net Savings:     ${formatCurrency(summary.netSavings)} ${summary.netSavings >= 0 ? "(Great job!)" : "(Consider reducing expenses)"}

COMPARED TO PREVIOUS MONTH
==========================
Spending is ${spendingTrend}
Income is ${incomeTrend}

TOP SPENDING CATEGORIES
=======================
${categoryBreakdown || "  No expenses recorded"}

BUDGET PERFORMANCE
==================
${budgetList}

SAVINGS GOALS PROGRESS
======================
${savingsList}

---
${summary.netSavings >= 0
  ? "Congratulations on positive savings this month! Keep it up!"
  : "Tip: Review your spending categories to find areas where you can cut back."}

Best regards,
Budget Smart AI

To manage your email preferences, visit your settings at ${process.env.APP_URL || "https://app.budgetsmart.io"}/email-settings`;

    const tr = getTransporter();
    if (!tr) {
      console.log("[Email] SMTP not configured, skipping monthly report.");
      return false;
    }

    await tr.sendMail({
      from: fromEmail,
      to: email,
      subject: subject,
      text: body,
    });

    console.log(`Monthly report sent to: ${email}`);
    return true;
  } catch (error) {
    console.error("Failed to send monthly report:", error);
    return false;
  }
}

// Check and send weekly digests
export async function checkAndSendWeeklyDigests(): Promise<void> {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday

  console.log(`[Email] Checking weekly digests (day: ${dayOfWeek})...`);

  try {
    const users = await storage.getUsers();

    for (const user of users) {
      const settings = await storage.getNotificationSettings(String(user.id));

      // Check if weekly digest is enabled and today matches their preferred day
      if (settings?.weeklyDigestEnabled === "true") {
        const preferredDay = settings.weeklyDigestDay ?? 0; // Default to Sunday

        if (dayOfWeek === preferredDay) {
          const email = settings.emailAddress || user.email;
          if (email) {
            await sendWeeklyDigest(String(user.id), email);
          }
        }
      }
    }
  } catch (error) {
    console.error("[Email] Error sending weekly digests:", error);
  }
}

// Check and send monthly reports
export async function checkAndSendMonthlyReports(): Promise<void> {
  const now = new Date();
  const dayOfMonth = now.getDate();

  // Send monthly reports on the 1st of each month
  if (dayOfMonth !== 1) {
    return;
  }

  console.log("[Email] Sending monthly reports...");

  try {
    const users = await storage.getUsers();

    for (const user of users) {
      const settings = await storage.getNotificationSettings(String(user.id));

      // Check if monthly report is enabled
      if (settings?.monthlyReportEnabled === "true") {
        const email = settings.emailAddress || user.email;
        if (email) {
          await sendMonthlyReport(String(user.id), email);
        }
      }
    }
  } catch (error) {
    console.error("[Email] Error sending monthly reports:", error);
  }
}

// Send test email to verify email configuration
export async function sendTestEmail(email: string): Promise<{ success: boolean; message: string; details?: string }> {
  const fromEmail = process.env.ALERT_EMAIL_FROM;

  // Check configuration
  if (!process.env.POSTMARK_SERVER || !process.env.POSTMARK_USERNAME || !process.env.POSTMARK_PASSWORD) {
    return {
      success: false,
      message: "Email credentials not configured",
      details: "POSTMARK_SERVER, POSTMARK_USERNAME, and POSTMARK_PASSWORD environment variables are required"
    };
  }

  if (!fromEmail) {
    return {
      success: false,
      message: "Sender email not configured",
      details: "ALERT_EMAIL_FROM environment variable is missing"
    };
  }

  if (!email) {
    return {
      success: false,
      message: "No recipient email address",
      details: "Please enter an email address or ensure your account has an email"
    };
  }

  const subject = "Budget Smart AI - Test Email";
  const body = `Hello!

This is a test email from Budget Smart AI to verify your email notification settings are working correctly.

If you received this email, your notifications are properly configured!

Email Configuration Status:
- Email Server: Connected
- Sender Address: ${fromEmail}
- Recipient Address: ${email}
- Timestamp: ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}

You can now expect to receive:
- Bill reminders before your bills are due
- Budget alerts when you approach spending limits
- Weekly digests (if enabled)
- Monthly financial reports (if enabled)

Best regards,
Budget Smart AI

---
To manage your notification preferences, visit your Email Settings page.`;

  try {
    const tr = getTransporter();
    if (!tr) {
      // Should not reach here since POSTMARK_SERVER is checked above, but guard anyway
      return {
        success: false,
        message: "Email not configured",
        details: "POSTMARK_SERVER environment variable is missing"
      };
    }
    await tr.sendMail({
      from: fromEmail,
      to: email,
      subject: subject,
      text: body,
    });

    console.log(`Test email sent successfully to: ${email}`);
    return {
      success: true,
      message: "Test email sent successfully",
      details: `Email sent to ${email}. Please check your inbox (and spam folder).`
    };
  } catch (error: any) {
    console.error("Failed to send test email:", error);

    let errorMessage = "Failed to send email";
    let errorDetails = "Unknown error occurred";

    if (error.code === "ECONNREFUSED") {
      errorDetails = "Could not connect to email server. Check POSTMARK_SERVER configuration.";
    } else if (error.code === "EAUTH") {
      errorDetails = "Authentication failed. Check POSTMARK_USERNAME and POSTMARK_PASSWORD.";
    } else if (error.responseCode === 421 || error.responseCode === 450) {
      errorDetails = "Email server temporarily unavailable. Please try again later.";
    } else if (error.responseCode === 550 || error.responseCode === 553) {
      errorDetails = "Invalid recipient email address or sender not authorized.";
    } else if (error.message) {
      errorDetails = error.message;
    }

    return {
      success: false,
      message: errorMessage,
      details: errorDetails
    };
  }
}

// Send household invitation email
export async function sendHouseholdInvitation(
  toEmail: string,
  inviterName: string,
  householdName: string,
  role: string,
  inviteToken: string
): Promise<boolean> {
  if (!process.env.POSTMARK_SERVER || !process.env.POSTMARK_USERNAME) {
    console.warn('[Email] Postmark not configured, skipping email send');
    return false;
  }
  const fromEmail = process.env.ALERT_EMAIL_FROM;
  const appUrl = process.env.APP_URL || "https://app.budgetsmart.io";

  if (!fromEmail) {
    console.log("Email configuration missing, skipping invitation email");
    return false;
  }

  const inviteUrl = `${appUrl}/invitation/${inviteToken}`;
  const roleDescription = role === "member"
    ? "full access to view and manage your shared finances"
    : "view-only access to review your finances as an advisor";

  const subject = `${inviterName} invited you to join ${householdName} on Budget Smart AI`;
  const body = `Hi there!

${inviterName} has invited you to join their household "${householdName}" on Budget Smart AI as a ${role}.

As a ${role}, you will have ${roleDescription}.

Click the link below to accept this invitation:
${inviteUrl}

This invitation will expire in 7 days.

If you don't have an account yet, you'll be able to create one when you click the link.

If you didn't expect this invitation, you can safely ignore this email.

Best regards,
The Budget Smart AI Team`;

  try {
    const tr = getTransporter();
    if (!tr) {
      console.log("[Email] SMTP not configured, skipping invitation email.");
      return false;
    }
    await tr.sendMail({
      from: fromEmail,
      to: toEmail,
      subject: subject,
      text: body,
    });
    console.log(`Household invitation email sent to: ${toEmail}`);
    return true;
  } catch (error) {
    console.error("Failed to send invitation email:", error);
    return false;
  }
}

// Send email verification for new account registration
export async function sendEmailVerification(
  toEmail: string,
  firstName: string,
  verificationToken: string
): Promise<boolean> {
  if (!process.env.POSTMARK_SERVER || !process.env.POSTMARK_USERNAME) {
    console.warn('[Email] Postmark not configured, skipping email send');
    return false;
  }
  const fromEmail = process.env.ALERT_EMAIL_FROM;
  const appUrl = process.env.APP_URL || "https://app.budgetsmart.io";

  if (!fromEmail) {
    console.log("Email configuration missing, skipping verification email");
    return false;
  }

  const verifyUrl = `${appUrl}/verify-email/${verificationToken}`;

  const subject = "Verify your email address - Budget Smart AI";
  const body = `Hi ${firstName}!

Welcome to Budget Smart AI! Please verify your email address to complete your registration.

Click the link below to verify your email:
${verifyUrl}

This link will expire in 24 hours.

After verifying your email, you'll be asked to set up two-factor authentication (2FA) to secure your account. This is required for all email-based accounts to protect your financial data.

If you didn't create an account with Budget Smart AI, you can safely ignore this email.

Best regards,
The Budget Smart AI Team`;

  try {
    const tr = getTransporter();
    if (!tr) {
      console.log("[Email] SMTP not configured, skipping verification email.");
      return false;
    }
    await tr.sendMail({
      from: fromEmail,
      to: toEmail,
      subject: subject,
      text: body,
    });
    console.log(`Email verification sent to: ${toEmail}`);
    return true;
  } catch (error) {
    console.error("Failed to send verification email:", error);
    return false;
  }
}
