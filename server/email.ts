import { ServerClient } from "postmark";
import { format, setDate, isBefore, addMonths, addDays, addWeeks, setDay, subDays, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, subWeeks } from "date-fns";
import { storage } from "./storage";
import { logEmail } from "./email-logger";
import type { Bill, Expense, Income, Budget, SavingsGoal } from "@shared/schema";
import { startAiCoachScheduler } from "./ai-coach";
import { checkVaultExpiryNotifications } from "./routes/vault";
import { db, pool } from "./db";
import { auditLog } from "./audit-logger";

/**
 * Check whether a bill reminder has already been sent for the given
 * (billId, reminderDate) pair today.  Uses a direct pool query so it works
 * even before the Drizzle ORM schema is fully initialised.
 */
async function isBillReminderAlreadySent(billId: string, reminderDate: string): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT 1 FROM bill_reminders_sent WHERE bill_id = $1 AND reminder_date = $2 LIMIT 1`,
      [billId, reminderDate]
    );
    return result.rowCount !== null && result.rowCount > 0;
  } catch {
    // If the table doesn't exist yet (first deploy), fall through and let the
    // legacy lastNotifiedCycle guard handle it.  The table will be created on
    // the next startup via ensureBillRemindersSentTable().
    return false;
  }
}

/**
 * Record that a bill reminder was sent for (billId, reminderDate).
 * Uses INSERT … ON CONFLICT DO NOTHING so a duplicate call is a no-op.
 */
async function recordBillReminderSent(userId: string, billId: string, reminderDate: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO bill_reminders_sent (user_id, bill_id, reminder_date, sent_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT ON CONSTRAINT uq_bill_reminder_date DO NOTHING`,
      [userId, billId, reminderDate]
    );
  } catch (err) {
    // Non-fatal: log but don't block the caller.
    console.error(`[BillReminder] Failed to record reminder sent for bill ${billId}:`, err);
  }
}

// Lazy Postmark HTTP client – avoids crashes when POSTMARK_USERNAME is absent.
// Uses the HTTP API instead of SMTP so it works on Railway (which blocks SMTP).
let _postmarkClient: ServerClient | null = null;

function getPostmarkClient(): ServerClient | null {
  const token = process.env.POSTMARK_USERNAME;
  if (!token) return null;
  if (!_postmarkClient) {
    _postmarkClient = new ServerClient(token);
  }
  return _postmarkClient;
}

// Guard to prevent startEmailScheduler from being invoked more than once
// (e.g. during hot-reload or if registerRoutes is accidentally called twice).
let schedulerStarted = false;

// Guard to prevent checkAndSendReminders from running concurrently.
// A single concurrent run would pass the lastNotifiedCycle check twice
// (before either has had a chance to update it) and send duplicate emails.
let reminderCheckInProgress = false;

// Shared helper used by this module and other server modules (routes.ts, vault.ts).
export async function sendEmailViaPostmark(options: {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
}): Promise<void> {
  const client = getPostmarkClient();
  if (!client) {
    throw new Error("[Email] Postmark not configured: POSTMARK_USERNAME is missing");
  }
  await client.sendEmail({
    From: options.from,
    To: options.to,
    ReplyTo: options.replyTo,
    Subject: options.subject,
    TextBody: options.text,
    HtmlBody: options.html,
  });
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
  if (!process.env.POSTMARK_USERNAME) {
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

  const client = getPostmarkClient();
  if (!client) {
    console.log("[Email] Postmark not configured, skipping bill reminder.");
    return false;
  }

  try {
    const result = await client.sendEmail({
      From: fromEmail,
      To: toEmail,
      Subject: subject,
      TextBody: body,
    });
    logEmail({ userId: bill.userId, recipientEmail: toEmail, subject, type: "bill_reminder", status: "sent", postmarkMessageId: (result as any)?.MessageID ?? null }).catch(() => {});
    console.log(`Email sent for bill: ${bill.name}`);
    return true;
  } catch (error: any) {
    if (error?.statusCode === 422 && error?.code === 400) {
      console.error(
        `[Email] Failed to send bill reminder — the 'From' address "${fromEmail}" is not a verified Sender Signature on your Postmark account. ` +
        `Please go to https://account.postmarkapp.com/signature_domains and add/verify "${fromEmail}", ` +
        `or update the ALERT_EMAIL_FROM environment variable to a verified sender address.`
      );
    } else {
      console.error(`Failed to send email for bill ${bill.name}:`, error);
    }
    return false;
  }
}

export async function checkAndSendReminders(): Promise<void> {
  if (reminderCheckInProgress) {
    console.log("[EmailScheduler] Reminder check already in progress, skipping concurrent run.");
    return;
  }
  reminderCheckInProgress = true;
  try {
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
      // ── Deduplication layer 1: DB-level check (survives deploys/restarts) ──
      // Check bill_reminders_sent table first — this is the primary guard that
      // prevents duplicate emails on every deploy.
      const alreadySentToday = await isBillReminderAlreadySent(bill.id, todayStr);
      if (alreadySentToday) {
        console.log(`[BillReminder] Already sent reminder for bill: ${bill.name} on ${todayStr} (DB record found), skipping.`);
        continue;
      }

      // ── Deduplication layer 2: legacy lastNotifiedCycle check ──
      // Use full date for weekly/biweekly/custom/one_time, "yyyy-MM" for monthly/yearly
      const cycleKey = (bill.recurrence === "biweekly" || bill.recurrence === "weekly" || bill.recurrence === "custom" || bill.recurrence === "one_time")
        ? format(nextDue, "yyyy-MM-dd")
        : format(nextDue, "yyyy-MM");

      if (bill.lastNotifiedCycle !== cycleKey) {
        console.log(`Sending reminder for bill: ${bill.name}, due: ${format(nextDue, "yyyy-MM-dd")}`);

        const sent = await sendBillReminder(bill, nextDue);

        if (sent) {
          // Write deduplication record BEFORE updating the bill row so that
          // even if the bill update fails, the DB guard prevents a re-send.
          await recordBillReminderSent(bill.userId, bill.id, todayStr);
          await storage.updateBillNotifiedCycle(bill.id, cycleKey);
          auditLog({
            eventType: "billing.bill_reminder_sent",
            eventCategory: "billing",
            actorId: null,
            actorType: "system",
            targetUserId: bill.userId,
            action: "bill_reminder_sent",
            outcome: "success",
            metadata: { billId: bill.id, billName: bill.name, dueDate: format(nextDue, "yyyy-MM-dd"), cycleKey },
          });
        }
      } else {
        console.log(`Already notified for bill: ${bill.name} this cycle`);
      }
    }
  }

  console.log("Finished checking bills");
  } finally {
    reminderCheckInProgress = false;
  }
}

/**
 * Daily check: send trial-end reminder emails to users who opted in and whose
 * trial expires within the next TRIAL_REMINDER_DAYS_BEFORE days.
 * This complements the Stripe `customer.subscription.trial_will_end` webhook
 * and acts as a fallback for users who signed up without going through Stripe.
 */
const TRIAL_REMINDER_DAYS_BEFORE = 3;

/**
 * DEPRECATED: Trial reminder email builder - kept for backwards compatibility only.
 * No longer used in the freemium model.
 */
export function buildTrialReminderEmail(firstName: string, trialEndStr: string): {
  subject: string;
  text: string;
  html: string;
} {
  return {
    subject: "Your Budget Smart AI trial ends soon",
    text: `Hi ${firstName},\n\nJust a heads-up — your free trial ends on ${trialEndStr}.\n\nIf Budget Smart AI has been helpful, you don't need to do anything — your subscription will continue automatically.\n\nIf it's not the right fit, you can cancel anytime before your trial ends at https://app.budgetsmart.io/settings.\n\nThanks for trying Budget Smart AI!\n\nThe Budget Smart AI Team`,
    html: `<p>Hi ${firstName},</p>
<p>Just a heads-up — your free trial ends on <strong>${trialEndStr}</strong>.</p>
<p>If Budget Smart AI has been helpful, you don't need to do anything — your subscription will continue automatically.</p>
<p>If it's not the right fit, you can cancel anytime before your trial ends at <a href="https://app.budgetsmart.io/settings">your account settings</a>.</p>
<p>Thanks for trying Budget Smart AI!<br>The Budget Smart AI Team</p>`,
  };
}

/**
 * DEPRECATED: Trial reminders are no longer used in the freemium model.
 * This function is kept for backwards compatibility but will not send any emails.
 */
export async function checkAndSendTrialReminders(): Promise<void> {
  // Trials removed in freemium model - function disabled
  console.log("[TrialReminder] Skipped - no trials in freemium model");
  return;
}

export function startEmailScheduler(): void {
  if (schedulerStarted) {
    console.warn("[EmailScheduler] Scheduler already started — ignoring duplicate call.");
    return;
  }
  schedulerStarted = true;

  // Run checks immediately on startup
  checkAndSendReminders().catch(console.error);
  checkAndSendWeeklyDigests().catch(console.error);
  checkAndSendMonthlyReports().catch(console.error);
  checkVaultExpiryNotifications().catch(console.error);
  checkAndSendTrialReminders().catch(console.error);
  checkAndSendUsageMilestoneEmails().catch(console.error);

  // Then run every 24 hours (once per day)
  const oneDayMs = 24 * 60 * 60 * 1000;
  setInterval(() => {
    checkAndSendReminders().catch(console.error);
    checkAndSendWeeklyDigests().catch(console.error);
    checkAndSendMonthlyReports().catch(console.error);
    checkVaultExpiryNotifications().catch(console.error);
    checkAndSendTrialReminders().catch(console.error);
    checkAndSendUsageMilestoneEmails().catch(console.error);
    // Run data retention cleanup weekly (every Sunday)
    if (new Date().getDay() === 0) {
      runDataRetentionCleanup().catch(console.error);
    }
  }, oneDayMs);

  console.log("Email scheduler started - checking reminders, weekly digests, and monthly reports daily");

  // Start AI Coach scheduler
  startAiCoachScheduler();
}

/** Weekly data retention cleanup — removes stale sessions, AI logs, notifications, and old support tickets. */
async function runDataRetentionCleanup(): Promise<void> {
  try {
    // Sessions older than 30 days
    const r0 = await (db as any).$client.query(
      `DELETE FROM session WHERE expire < NOW() - INTERVAL '30 days'`,
    );
    // AI usage logs older than 90 days
    const r1 = await (db as any).$client.query(
      `DELETE FROM ai_usage_log WHERE created_at < NOW() - INTERVAL '90 days'`,
    );
    const r2 = await (db as any).$client.query(
      `DELETE FROM anomaly_alerts WHERE is_dismissed = true AND dismissed_at < NOW() - INTERVAL '180 days'`,
    );
    // SOC 2: Retain audit logs for a minimum of 2 years
    const r3 = await (db as any).$client.query(
      `DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '2 years'`,
    );
    // Read notifications older than 90 days
    const r4 = await (db as any).$client.query(
      `DELETE FROM notifications WHERE is_read = 'true' AND created_at < NOW() - INTERVAL '90 days'`,
    );
    // Closed support tickets older than 3 years (keep open tickets forever)
    const r5 = await (db as any).$client.query(
      `DELETE FROM support_tickets WHERE status = 'closed' AND created_at < NOW() - INTERVAL '3 years'`,
    );
    // NOTE: transactions are NOT deleted (7-year legal requirement)
    console.log(
      `[Retention] Deleted ${r0.rowCount} expired sessions, ` +
      `${r1.rowCount} AI log rows, ` +
      `${r2.rowCount} dismissed anomaly alerts, ` +
      `${r3.rowCount} expired audit log entries, ` +
      `${r4.rowCount} read notifications, ` +
      `${r5.rowCount} closed support tickets`,
    );
  } catch (err) {
    console.error("[Retention] Data retention cleanup failed:", err);
  }
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
  if (!process.env.POSTMARK_USERNAME) {
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

    const client = getPostmarkClient();
    if (!client) {
      console.log("[Email] Postmark not configured, skipping weekly digest.");
      return false;
    }

    const result = await client.sendEmail({
      From: fromEmail,
      To: email,
      Subject: subject,
      TextBody: body,
    });
    logEmail({ userId, recipientEmail: email, subject, type: "weekly_digest", status: "sent", postmarkMessageId: (result as any)?.MessageID ?? null }).catch(() => {});
    console.log(`Weekly digest sent to: ${email}`);
    return true;
  } catch (error) {
    console.error("Failed to send weekly digest:", error);
    return false;
  }
}

// Send monthly report email
async function sendMonthlyReport(userId: string, email: string): Promise<boolean> {
  if (!process.env.POSTMARK_USERNAME) {
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

    const client = getPostmarkClient();
    if (!client) {
      console.log("[Email] Postmark not configured, skipping monthly report.");
      return false;
    }

    const result = await client.sendEmail({
      From: fromEmail,
      To: email,
      Subject: subject,
      TextBody: body,
    });
    logEmail({ userId, recipientEmail: email, subject, type: "monthly_report", status: "sent", postmarkMessageId: (result as any)?.MessageID ?? null }).catch(() => {});
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
  if (!process.env.POSTMARK_USERNAME) {
    return {
      success: false,
      message: "Email credentials not configured",
      details: "POSTMARK_USERNAME environment variable is required"
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
    const client = getPostmarkClient();
    if (!client) {
      return {
        success: false,
        message: "Email not configured",
        details: "POSTMARK_USERNAME environment variable is missing"
      };
    }
    const result = await client.sendEmail({
      From: fromEmail,
      To: email,
      Subject: subject,
      TextBody: body,
    });
    logEmail({ userId: null, recipientEmail: email, subject, type: "test", status: "sent", postmarkMessageId: (result as any)?.MessageID ?? null }).catch(() => {});
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

    if (error.statusCode === 401) {
      errorDetails = "Authentication failed. Check POSTMARK_USERNAME (server API token).";
    } else if (error.statusCode === 422) {
      errorDetails = "Invalid email request. Check sender/recipient addresses.";
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
  if (!process.env.POSTMARK_USERNAME) {
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
    const client = getPostmarkClient();
    if (!client) {
      console.log("[Email] Postmark not configured, skipping invitation email.");
      return false;
    }
    const result = await client.sendEmail({
      From: fromEmail,
      To: toEmail,
      Subject: subject,
      TextBody: body,
    });
    logEmail({ userId: null, recipientEmail: toEmail, subject, type: "household_invitation", status: "sent", postmarkMessageId: (result as any)?.MessageID ?? null }).catch(() => {});
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
  if (!process.env.POSTMARK_USERNAME) {
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
    const client = getPostmarkClient();
    if (!client) {
      console.log("[Email] Postmark not configured, skipping verification email.");
      return false;
    }
    const result = await client.sendEmail({
      From: fromEmail,
      To: toEmail,
      Subject: subject,
      TextBody: body,
    });
    logEmail({ userId: null, recipientEmail: toEmail, subject, type: "email_verification", status: "sent", postmarkMessageId: (result as any)?.MessageID ?? null }).catch(() => {});
    console.log(`Email verification sent to: ${toEmail}`);
    return true;
  } catch (error) {
    console.error("Failed to send verification email:", error);
    return false;
  }
}

export async function sendWelcomeEmail(
  toEmail: string,
  firstName: string
): Promise<boolean> {
  if (!process.env.POSTMARK_USERNAME) {
    console.warn('[Email] Postmark not configured, skipping welcome email');
    return false;
  }
  const fromEmail = process.env.ALERT_EMAIL_FROM;
  const appUrl = process.env.APP_URL || "https://app.budgetsmart.io";

  if (!fromEmail) {
    console.log("Email configuration missing, skipping welcome email");
    return false;
  }

  const subject = "Welcome to Budget Smart AI 🎉";
  const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
  <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #059669; font-size: 28px; margin: 0;">Welcome to Budget Smart AI!</h1>
      <p style="color: #6b7280; font-size: 16px; margin-top: 8px;">Hi ${firstName}, your free account is ready.</p>
    </div>
    <h2 style="color: #111827; font-size: 18px;">What's included in your free tier:</h2>
    <ul style="color: #374151; font-size: 15px; line-height: 1.8;">
      <li>Track bills, income &amp; budgets</li>
      <li>Manual transaction entry</li>
      <li>Basic AI insights (limited queries/month)</li>
      <li>Savings goals</li>
      <li>Reports &amp; analytics</li>
    </ul>
    <h2 style="color: #111827; font-size: 18px;">Getting started:</h2>
    <p style="color: #374151; font-size: 15px;">1. Connect your first bank account to automatically import transactions<br>
    2. Set up your monthly budget categories<br>
    3. Ask the AI assistant for personalized insights</p>
    <div style="text-align: center; margin-top: 28px;">
      <a href="${appUrl}/dashboard" style="background: #059669; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
        Go to Dashboard
      </a>
    </div>
    <hr style="margin: 32px 0; border: none; border-top: 1px solid #e5e7eb;">
    <p style="color: #9ca3af; font-size: 13px; text-align: center;">
      Want full access? <a href="${appUrl}/upgrade" style="color: #059669;">Upgrade to Pro or Family</a> for unlimited bank accounts, unlimited AI queries, and more.
    </p>
    <p style="color: #9ca3af; font-size: 13px; text-align: center;">© ${new Date().getFullYear()} Budget Smart AI</p>
  </div>
</body>
</html>`;

  const textBody = `Welcome to Budget Smart AI, ${firstName}!

Your free account is ready.

What's included in your free tier:
- Track bills, income & budgets
- Manual transaction entry
- Basic AI insights (limited queries/month)
- Savings goals
- Reports & analytics

Getting started:
1. Connect your first bank account: ${appUrl}/dashboard
2. Set up your monthly budget categories
3. Ask the AI assistant for personalized insights

Want full access? Upgrade to Pro or Family at ${appUrl}/upgrade

Best regards,
The Budget Smart AI Team`;

  try {
    const client = getPostmarkClient();
    if (!client) {
      console.log("[Email] Postmark not configured, skipping welcome email.");
      return false;
    }
    const result = await client.sendEmail({
      From: fromEmail,
      To: toEmail,
      Subject: subject,
      TextBody: textBody,
      HtmlBody: htmlBody,
    });
    logEmail({ userId: null, recipientEmail: toEmail, subject, type: "welcome", status: "sent", postmarkMessageId: (result as any)?.MessageID ?? null }).catch(() => {});
    console.log(`Welcome email sent to: ${toEmail}`);
    return true;
  } catch (error) {
    console.error("Failed to send welcome email:", error);
    return false;
  }
}

export async function sendUpgradeConfirmationEmail(
  toEmail: string,
  firstName: string,
  planName: string
): Promise<boolean> {
  if (!process.env.POSTMARK_USERNAME) {
    console.warn('[Email] Postmark not configured, skipping upgrade confirmation email');
    return false;
  }
  const fromEmail = process.env.ALERT_EMAIL_FROM;
  const appUrl = process.env.APP_URL || "https://app.budgetsmart.io";

  if (!fromEmail) {
    console.log("Email configuration missing, skipping upgrade confirmation email");
    return false;
  }

  const subject = `Your Budget Smart AI ${planName} plan is now active!`;
  const textBody = `Hi ${firstName},

Your upgrade to the ${planName} plan is confirmed and your account has been updated.

You now have access to all ${planName} features. Head to your dashboard to get started.

${appUrl}/dashboard

Best regards,
The Budget Smart AI Team`;

  try {
    const client = getPostmarkClient();
    if (!client) {
      console.log("[Email] Postmark not configured, skipping upgrade confirmation email.");
      return false;
    }
    const result = await client.sendEmail({
      From: fromEmail,
      To: toEmail,
      Subject: subject,
      TextBody: textBody,
    });
    logEmail({ userId: null, recipientEmail: toEmail, subject, type: "upgrade_confirmation", status: "sent", postmarkMessageId: (result as any)?.MessageID ?? null }).catch(() => {});
    console.log(`Upgrade confirmation email sent to: ${toEmail}`);
    return true;
  } catch (error) {
    console.error("Failed to send upgrade confirmation email:", error);
    return false;
  }
}

/**
 * Check all free users for feature usage milestones (80% warning, 100% limit hit)
 * and send notification emails if not already sent this month.
 * Runs daily from the email scheduler.
 */
/**
 * Send a spending alert email when a user's spending threshold is exceeded.
 */
export async function sendSpendingAlertEmail(user: any, alert: any, currentSpend: number): Promise<boolean> {
  if (!process.env.POSTMARK_USERNAME) return false;
  const fromEmail = process.env.ALERT_EMAIL_FROM;
  if (!fromEmail || !user?.email) return false;

  const label = alert.category || alert.merchantName || "total spending";
  const periodLabel = alert.period === "weekly" ? "week" : "month";
  const subject = `⚠️ Spending Alert: ${label} threshold reached`;
  const body = `Hi ${user.firstName || user.username || "there"},

You've spent $${currentSpend.toFixed(2)} on ${label} this ${periodLabel}.

Your alert threshold was $${parseFloat(alert.threshold).toFixed(2)}.

Log in to Budget Smart AI to review your spending and adjust your budget.

${process.env.APP_URL || "https://app.budgetsmart.io"}/dashboard

Best regards,
Budget Smart AI`;

  try {
    const client = getPostmarkClient();
    if (!client) return false;
    const result = await client.sendEmail({
      From: fromEmail,
      To: user.email,
      Subject: subject,
      TextBody: body,
    });
    logEmail({ userId: user.id ? String(user.id) : null, recipientEmail: user.email, subject, type: "spending_alert", status: "sent", postmarkMessageId: (result as any)?.MessageID ?? null }).catch(() => {});
    console.log(`[SpendingAlert] Alert email sent to ${user.email} for ${label}`);
    return true;
  } catch (err) {
    console.error("[SpendingAlert] Failed to send alert email:", err);
    return false;
  }
}

export async function checkAndSendUsageMilestoneEmails(): Promise<void> {
  const client = getPostmarkClient();
  const fromEmail = process.env.ALERT_EMAIL_FROM;
  const appUrl = process.env.APP_URL || "https://app.budgetsmart.io";

  if (!client || !fromEmail) {
    console.log("[UsageMilestone] Email not configured, skipping usage milestone emails.");
    return;
  }

  // Lazy import to avoid circular dependencies
  const { FEATURE_LIMITS } = await import("./lib/features");
  const freeLimits = FEATURE_LIMITS.free as Record<string, number | null>;

  // Fetch all usage rows for free users in the current month that haven't had
  // both milestone emails sent yet, joined with user details.
  let rows: any[];
  try {
    const result = await pool.query(
      `SELECT
         ufu.id,
         ufu.user_id,
         ufu.feature_key,
         ufu.usage_count,
         ufu.warning_sent_at,
         ufu.limit_sent_at,
         u.email,
         u.first_name,
         u.username
       FROM user_feature_usage ufu
       JOIN users u ON u.id = ufu.user_id
       WHERE ufu.period_start = date_trunc('month', NOW())
         AND (u.plan IS NULL OR u.plan = 'free')
         AND (u.is_deleted IS NULL OR u.is_deleted = false)
         AND u.email IS NOT NULL
         AND u.email != ''
         -- Only rows where at least one milestone notification hasn't been sent
         AND (ufu.warning_sent_at IS NULL OR ufu.limit_sent_at IS NULL)`,
    );
    rows = result.rows;
  } catch (err) {
    console.error("[UsageMilestone] Failed to query usage rows:", err);
    return;
  }

  const resetDate = (() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  })();
  const resetDateStr = format(resetDate, "MMMM d, yyyy");

  for (const row of rows) {
    const limit = freeLimits[row.feature_key as string];
    if (!limit || limit <= 0) continue; // not a limited feature

    const pct = (row.usage_count / limit) * 100;
    const featureName = row.feature_key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
    const firstName = row.first_name || row.username || "there";

    try {
      // 80% warning — send once if not already sent
      if (pct >= 80 && pct < 100 && !row.warning_sent_at) {
        const subject = `You're running low on ${featureName} this month`;
        const text = `Hi ${firstName},

You've used ${row.usage_count} of your ${limit} free ${featureName.toLowerCase()} this month. Upgrade to Pro for unlimited access, or your usage resets on ${resetDateStr}.

Upgrade now: ${appUrl}/upgrade

Best regards,
The Budget Smart AI Team`;

        await client.sendEmail({ From: fromEmail, To: row.email, Subject: subject, TextBody: text });
        await pool.query(
          `UPDATE user_feature_usage SET warning_sent_at = NOW() WHERE id = $1`,
          [row.id],
        );
        console.log(`[UsageMilestone] 80% warning sent for user ${row.user_id}, feature ${row.feature_key}`);
      }

      // 100% limit hit — send once if not already sent
      if (pct >= 100 && !row.limit_sent_at) {
        const subject = `You've used all your free ${featureName}`;
        const text = `Hi ${firstName},

You've reached your ${limit} ${featureName.toLowerCase()} limit for this month. Your usage resets on ${resetDateStr}.

Upgrade to Pro for unlimited access and never hit a limit again.

Upgrade now: ${appUrl}/upgrade

Best regards,
The Budget Smart AI Team`;

        await client.sendEmail({ From: fromEmail, To: row.email, Subject: subject, TextBody: text });
        await pool.query(
          `UPDATE user_feature_usage SET limit_sent_at = NOW() WHERE id = $1`,
          [row.id],
        );
        console.log(`[UsageMilestone] 100% limit email sent for user ${row.user_id}, feature ${row.feature_key}`);
      }
    } catch (emailErr) {
      console.error(
        `[UsageMilestone] Failed to send email to ${row.email} for feature ${row.feature_key}:`,
        emailErr,
      );
    }
  }
}
