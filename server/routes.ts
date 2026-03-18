import type { Express, Request as ExpressRequest } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { db, pool } from "./db";
import multer from "multer";
import sharp from "sharp";
import { S3Client as AvatarS3Client, PutObjectCommand as AvatarPutObjectCommand, DeleteObjectCommand as AvatarDeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  insertBillSchema, insertExpenseSchema, updateBillSchema, updateExpenseSchema,
  insertIncomeSchema, updateIncomeSchema,
  insertBudgetSchema, updateBudgetSchema,
  insertSavingsGoalSchema, updateSavingsGoalSchema,
  insertDebtDetailsSchema, updateDebtDetailsSchema,
  loginSchema, contactFormSchema, supportFormSchema, createUserSchema, updateUserSchema,
  registerSchema, updateProfileSchema, updateHouseholdSchema, grantFinancialAccessSchema,
  createHouseholdSchema, createInvitationSchema,
  insertManualAccountSchema, updateManualAccountSchema,
  insertManualTransactionSchema, updateManualTransactionSchema,
  insertInvestmentAccountSchema, updateInvestmentAccountSchema,
  insertHoldingSchema, updateHoldingSchema,
  insertAssetSchema, updateAssetSchema,
  insertSplitExpenseSchema, updateSplitExpenseSchema,
  insertSplitParticipantSchema, insertSettlementPaymentSchema,
  BILL_CATEGORIES, EXPENSE_CATEGORIES, RECURRENCE_OPTIONS, MANUAL_ACCOUNT_TYPES, DEBT_TYPES,
  INVESTMENT_ACCOUNT_TYPES, HOLDING_TYPES, ASSET_CATEGORIES, TAX_CATEGORIES
} from "@shared/schema";
import { startEmailScheduler, sendHouseholdInvitation, sendTestEmail, sendEmailVerification, sendEmailViaPostmark, sendWelcomeEmail } from "./email";
import crypto from "crypto";
import { requireAuth, requireAdmin, requireWriteAccess, verifyPassword, hashPassword, generateMfaSecretKey, verifyMfaToken, generateMfaQrCode, generateBackupCodes, loadHouseholdIntoSession, setupGoogleOAuth } from "./auth";
import passport from "passport";
import { authRateLimiter, apiRateLimiter, sensitiveApiRateLimiter } from "./rate-limiter";
import { generateCashFlowForecast, findNextIncomeDate, calculateAverageDailySpending } from "./cash-flow";
import { getStockQuote, getStockAnalysis, generateAnalysisSummary, batchUpdatePrices } from "./alpha-vantage";
import { getAdvisorData, invalidateAdvisorCache, advisorChat, savePortfolioSnapshot, type ChatMessage } from "./investment-advisor";
import { salesChat, getGreeting } from "./sales-chatbot";
import { salesLeadFormSchema, billPayments, spendingAlerts, insertSpendingAlertSchema, updateSpendingAlertSchema, plaidItems, expenses, plaidTransactions } from "@shared/schema";
import { eq, and, ne, isNull } from "drizzle-orm";
import receiptsRouter from "./routes/receipts";
import vaultRouter from "./routes/vault";
import adminPlansRouter from "./routes/admin-plans";
import adminCommunicationsRouter from "./routes/admin-communications";
import { registerPasswordResetRoutes } from "./routes/auth-password-reset";
import { encrypt as fieldEncrypt, decrypt as fieldDecrypt, decrypt } from "./encryption";
import { auditLogFromRequest, getClientIp } from "./audit-logger";
import { checkAndConsume, getFeatureLimit } from "./lib/featureGate";
import { getEffectivePlan } from "./lib/planResolver";
import { autoReconcile } from "./lib/auto-reconciler";

// CSV parsing helper
function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Handle quoted values with commas
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^"|"$/g, ''));
    
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }
  
  return rows;
}

// Check whether Postmark is configured for use in routes that send email.
function isEmailConfigured(): boolean {
  return !!process.env.POSTMARK_USERNAME;
}

// Account lockout constants
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Set up Google OAuth
  setupGoogleOAuth(app);

  // Start the email scheduler
  startEmailScheduler();

  // Startup validation — warn about missing email routing configuration
  if (!process.env.SUPPORT_EMAIL && !process.env.ALERT_EMAIL_TO) {
    console.warn("[CONFIG] Neither SUPPORT_EMAIL nor ALERT_EMAIL_TO is set. Contact-form and support-ticket emails will not be delivered.");
  }
  if (!process.env.SALES_EMAIL && !process.env.ALERT_EMAIL_TO) {
    console.warn("[CONFIG] Neither SALES_EMAIL nor ALERT_EMAIL_TO is set. Sales-lead notification emails will not be delivered.");
  }

  // Receipt scanner routes
  app.use("/api/receipts", receiptsRouter);
  app.use("/api/vault", vaultRouter);
  
  // Admin plan-feature management routes (protected with requireAdmin)
  app.use("/api/admin/plans", adminPlansRouter);
  // Admin communications hub (email log, templates, broadcast, health, system alerts)
  app.use("/api/admin/communications", adminCommunicationsRouter);
  registerPasswordResetRoutes(app);

  // Field encryption status endpoint (admin only)
  app.get("/api/encryption/status", requireAuth, requireAdmin, (_req, res) => {
    const keySet = !!process.env.FIELD_ENCRYPTION_KEY;
    let operational = false;
    if (keySet) {
      try {
        fieldDecrypt(fieldEncrypt("health-check"));
        operational = true;
      } catch {
        operational = false;
      }
    }
    res.json({
      algorithm: "AES-256-GCM",
      keyConfigured: keySet,
      operational,
      message: !keySet
        ? "FIELD_ENCRYPTION_KEY is not set. Generate a key with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" and add it to your environment."
        : operational
        ? "Field encryption is active. Sensitive columns are encrypted at rest."
        : "FIELD_ENCRYPTION_KEY is set but encryption failed. Check that the key is exactly 64 hex characters.",
    });
  });

  // Test route for debugging landing page API
  app.get("/api/landing-test", (_req, res) => res.json({ test: "ok" }));

  // FEATURE: BILL_TRACKING | tier: free | limit: 5 bills
  // Bills API
  app.get("/api/bills", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const householdId = req.session.householdId;

      let bills;
      if (householdId) {
        // Get all household member IDs and fetch their bills
        const memberIds = await storage.getHouseholdMemberUserIds(householdId);
        bills = await storage.getBillsByUserIds(memberIds);
      } else {
        bills = await storage.getBills(userId);
      }

      // Get disabled Plaid account IDs to filter out linked bills
      const plaidItems = await storage.getPlaidItems(userId);
      let disabledPlaidAccountIds = new Set<string>();
      if (plaidItems.length > 0) {
        const allAccounts = await Promise.all(plaidItems.map(item => storage.getPlaidAccounts(item.id)));
        disabledPlaidAccountIds = new Set(
          allAccounts.flat().filter(a => a.isActive !== "true").map(a => a.id)
        );
      }

      // Filter out bills linked to disabled Plaid accounts
      const filteredBills = bills.filter(bill => {
        if (bill.linkedPlaidAccountId && disabledPlaidAccountIds.has(bill.linkedPlaidAccountId)) {
          return false;
        }
        return true;
      });

      res.json(filteredBills);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bills" });
    }
  });

  // Bills CSV template download - must be before /:id route
  app.get("/api/bills/template", (_req, res) => {
    const headers = ["name", "amount", "category", "dueDay", "recurrence", "customDates", "notes", "startingBalance", "paymentsRemaining", "startDate", "endDate"];
    const exampleRows = [
      ["Netflix", "15.99", "Subscriptions", "15", "monthly", "", "Monthly streaming service", "", "", "", ""],
      ["Rent", "1500.00", "Rent", "1", "monthly", "", "Apartment rent", "", "", "2024-01-01", ""],
      ["Car Insurance", "120.00", "Insurance", "10", "monthly", "", "", "", "", "", ""],
      ["Gym Membership", "50.00", "Fitness", "1", "weekly", "", "Every Monday", "", "", "", ""],
      ["Credit Card Payment", "500.00", "Credit Card", "25", "monthly", "", "Minimum payment", "15000.00", "36", "2024-06-01", ""],
      ["Mortgage", "2200.00", "Mortgage", "1", "monthly", "", "30-year fixed", "350000.00", "300", "2023-01-01", ""],
      ["Property Tax", "2500.00", "Other", "15", "custom", "[2025-03-15,2025-09-15]", "Semi-annual payment", "", "", "", ""],
      ["Internet", "79.99", "Internet", "20", "monthly", "", "High-speed fiber", "", "", "", ""],
      ["Phone Financing", "35.00", "Phone", "5", "monthly", "", "iPhone 24-month plan", "", "24", "2024-01-05", "2026-01-05"],
      ["Car Loan", "450.00", "Loans", "15", "monthly", "", "", "18000.00", "48", "2024-01-15", "2028-01-15"],
    ];

    // Helper to escape CSV values properly
    const escapeCSV = (value: string) => {
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csvContent = [
      headers.join(","),
      ...exampleRows.map(row => row.map(escapeCSV).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=bills_template.csv");
    res.send(csvContent);
  });

  // Bills CSV export
  app.get("/api/bills/export", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const householdId = req.session.householdId;

      let bills;
      if (householdId) {
        const memberIds = await storage.getHouseholdMemberUserIds(householdId);
        bills = await storage.getBillsByUserIds(memberIds);
      } else {
        bills = await storage.getBills(userId);
      }

      const headers = ["name", "amount", "category", "dueDay", "recurrence", "customDates", "notes", "startingBalance", "paymentsRemaining", "startDate", "endDate"];

      // Helper to escape CSV values properly
      const escapeCSV = (value: string | null | undefined) => {
        const str = value ?? "";
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = bills.map(bill => [
        escapeCSV(bill.name),
        escapeCSV(bill.amount),
        escapeCSV(bill.category),
        String(bill.dueDay),
        escapeCSV(bill.recurrence),
        escapeCSV(bill.customDates),
        escapeCSV(bill.notes),
        escapeCSV(bill.startingBalance),
        bill.paymentsRemaining !== null ? String(bill.paymentsRemaining) : "",
        escapeCSV(bill.startDate),
        escapeCSV(bill.endDate),
      ].join(","));

      const csvContent = [headers.join(","), ...rows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=bills_export.csv");
      auditLogFromRequest(req, {
        eventType: "data.export_requested",
        eventCategory: "data",
        actorId: userId,
        action: "export_bills_csv",
        outcome: "success",
        metadata: { count: bills.length },
      });
      res.send(csvContent);
    } catch (error) {
      console.error("Bills export error:", error);
      res.status(500).json({ error: "Failed to export bills" });
    }
  });

  // Bills CSV import
  app.post("/api/bills/import", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { csvData, mode = "add" } = req.body;
      if (!csvData || typeof csvData !== "string") {
        return res.status(400).json({ error: "CSV data is required" });
      }

      const rows = parseCSV(csvData);
      if (rows.length === 0) {
        return res.status(400).json({ error: "No valid data rows found in CSV" });
      }

      const results = { imported: 0, deleted: 0, errors: [] as string[] };

      // If mode is "replace", delete all existing bills for this user first
      if (mode === "replace") {
        const existingBills = await storage.getBills(userId);
        for (const bill of existingBills) {
          await storage.deleteBill(bill.id);
          results.deleted++;
        }
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const category = row.category as typeof BILL_CATEGORIES[number];
          if (!BILL_CATEGORIES.includes(category)) {
            results.errors.push(`Row ${i + 2}: Invalid category "${row.category}". Valid: ${BILL_CATEGORIES.join(", ")}`);
            continue;
          }

          const recurrence = row.recurrence as typeof RECURRENCE_OPTIONS[number];
          if (!RECURRENCE_OPTIONS.includes(recurrence)) {
            results.errors.push(`Row ${i + 2}: Invalid recurrence "${row.recurrence}". Valid: ${RECURRENCE_OPTIONS.join(", ")}`);
            continue;
          }

          // Parse customDates - handle both JSON array format and comma-separated in brackets
          let customDates = row.customDates || null;
          if (customDates && !customDates.startsWith("[")) {
            // If it's not already a JSON array, try to parse as-is
            customDates = null;
          } else if (customDates) {
            // Clean up the customDates format - ensure it's valid JSON
            try {
              // Handle format like [2025-03-15,2025-09-15] without quotes
              if (!customDates.includes('"')) {
                const dates = customDates.slice(1, -1).split(',').map(d => d.trim());
                customDates = JSON.stringify(dates);
              }
              // Validate it's a valid JSON array
              JSON.parse(customDates);
            } catch {
              results.errors.push(`Row ${i + 2}: Invalid customDates format. Use [2025-03-15,2025-09-15] or ["2025-03-15","2025-09-15"]`);
              continue;
            }
          }

          const billData = {
            name: row.name,
            amount: row.amount,
            category,
            dueDay: parseInt(row.dueDay) || 1,
            recurrence,
            customDates,
            notes: row.notes || undefined,
            startingBalance: row.startingBalance || undefined,
            paymentsRemaining: row.paymentsRemaining ? parseInt(row.paymentsRemaining) : undefined,
            startDate: row.startDate || undefined,
            endDate: row.endDate || undefined,
          };

          const parsed = insertBillSchema.safeParse(billData);
          if (!parsed.success) {
            results.errors.push(`Row ${i + 2}: ${parsed.error.errors.map(e => e.message).join(", ")}`);
            continue;
          }

          await storage.createBill({ ...parsed.data, userId });
          results.imported++;
        } catch (err) {
          results.errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }

      res.json({
        success: true,
        imported: results.imported,
        deleted: results.deleted,
        total: rows.length,
        errors: results.errors,
      });
    } catch (error) {
      console.error("Bills import error:", error);
      res.status(500).json({ error: "Failed to import bills" });
    }
  });

  // Detect recurring bills from Plaid transactions using unified pattern-matching
  // Uses the same algorithm as /api/subscriptions/detect so both show the same comprehensive list.
  // Items already saved as subscriptions are excluded from bills results, and vice versa.
  app.post("/api/bills/detect", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;

      // Get existing bills AND subscriptions so we can exclude both
      const existingBills = await storage.getBills(userId);
      const existingBillNames = existingBills.map(b => b.name.toLowerCase());
      // Subscriptions are bills with category "Subscriptions"
      const existingSubscriptionNames = existingBills
        .filter(b => b.category === "Subscriptions")
        .map(b => b.name.toLowerCase());

      // Get all Plaid transactions from the last 12 months
      const plaidItems = await storage.getPlaidItems(userId);
      if (plaidItems.length === 0) {
        return res.json({ suggestions: [], existingCount: existingBills.length, analyzedCount: 0 });
      }

      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      // Collect all active account IDs
      const allAccountIds: string[] = [];
      for (const item of plaidItems) {
        const accounts = await storage.getPlaidAccounts(item.id);
        for (const account of accounts) {
          if (account.isActive === "true") {
            allAccountIds.push(account.id);
          }
        }
      }

      if (allAccountIds.length === 0) {
        return res.json({ suggestions: [], existingCount: existingBills.length, analyzedCount: 0 });
      }

      // Fetch all transactions at once
      const allTransactions = await storage.getPlaidTransactions(allAccountIds, {
        startDate: twelveMonthsAgo.toISOString().split("T")[0],
        endDate: new Date().toISOString().split("T")[0],
      });

      // Helper: get mode (most common value) from an array of numbers
      const getMode = (arr: number[]): number => {
        const freq: Record<number, number> = {};
        let maxFreq = 0;
        let mode = arr[0];
        for (const v of arr) {
          freq[v] = (freq[v] || 0) + 1;
          if (freq[v] > maxFreq) { maxFreq = freq[v]; mode = v; }
        }
        return mode;
      };

      // Group transactions by merchant name (normalized)
      const merchantGroups: Record<string, any[]> = {};
      for (const tx of allTransactions) {
        // Only look at expenses (positive amounts in Plaid are money leaving account)
        const amount = parseFloat(tx.amount);
        if (amount <= 0) continue;

        const merchant = (tx.merchantName || tx.name || "").toLowerCase().trim();
        if (!merchant || merchant.length < 3) continue;

        if (!merchantGroups[merchant]) {
          merchantGroups[merchant] = [];
        }
        merchantGroups[merchant].push(tx);
      }

      // Analyze each merchant group for recurring patterns
      const detected: any[] = [];

      for (const [merchant, rawTransactions] of Object.entries(merchantGroups)) {
        if (rawTransactions.length < 2) continue;

        // Sort by date
        rawTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // NSF deduplication: if two transactions from same merchant are within 10 days
        // and within 5% of each other in amount, keep only the first (NSF retry pattern)
        const transactions: typeof rawTransactions = [];
        for (let i = 0; i < rawTransactions.length; i++) {
          const tx = rawTransactions[i];
          const txDate = new Date(tx.date).getTime();
          const isDuplicate = transactions.some(prev => {
            const prevDate = new Date(prev.date).getTime();
            const daysDiff = Math.abs(txDate - prevDate) / (1000 * 60 * 60 * 24);
            const prevAmt = parseFloat(prev.amount);
            const txAmt = parseFloat(tx.amount);
            const amountDiff = prevAmt > 0 ? Math.abs(txAmt - prevAmt) / prevAmt : 1;
            return daysDiff <= 10 && amountDiff < 0.05;
          });
          if (!isDuplicate) transactions.push(tx);
        }

        if (transactions.length < 2) continue;

        // Get amounts and check for consistency
        const amounts = transactions.map(tx => parseFloat(tx.amount));
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;

        // Check if amounts are consistent (within 10% of average)
        const amountsConsistent = amounts.every(a => Math.abs(a - avgAmount) / avgAmount < 0.1);
        if (!amountsConsistent && transactions.length < 4) continue;

        // Analyze frequency
        const dates = transactions.map(tx => new Date(tx.date).getTime());
        const intervals: number[] = [];
        for (let i = 1; i < dates.length; i++) {
          intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
        }

        if (intervals.length === 0) continue;

        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

        // Determine frequency
        let frequency = "monthly";
        let confidence = 0.5;

        if (avgInterval >= 6 && avgInterval <= 8) {
          frequency = "weekly";
          confidence = 0.8;
        } else if (avgInterval >= 13 && avgInterval <= 16) {
          frequency = "biweekly";
          confidence = 0.75;
        } else if (avgInterval >= 25 && avgInterval <= 38) {
          frequency = "monthly";
          confidence = 0.85;
        } else if (avgInterval >= 355 && avgInterval <= 375) {
          frequency = "yearly";
          confidence = 0.9;
        } else if (avgInterval >= 85 && avgInterval <= 95) {
          frequency = "quarterly";
          confidence = 0.7;
        } else {
          continue; // Not a recognizable pattern
        }

        // Increase confidence based on transaction count
        if (transactions.length >= 6) confidence = Math.min(confidence + 0.1, 0.95);
        if (transactions.length >= 12) confidence = Math.min(confidence + 0.05, 0.98);

        // Use mode (most common day of month) as the predominant charge day
        const daysOfMonth = transactions.map(tx => new Date(tx.date).getDate());
        const predominantDay = getMode(daysOfMonth);

        // Get display name (capitalize first letters)
        const displayName = (transactions[0].merchantName || transactions[0].name || merchant)
          .split(" ")
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ");

        detected.push({
          name: displayName,
          amount: Math.round(avgAmount * 100) / 100,
          frequency,
          recurrence: frequency,
          dueDay: predominantDay,
          merchant: displayName,
          confidence,
          confidenceLabel: confidence >= 0.85 ? "high" : confidence >= 0.7 ? "medium" : "low",
          lastChargeDate: transactions[transactions.length - 1].date,
          transactionCount: transactions.length,
          predominantDay,
          source: "pattern",
          category: "Other",
        });
      }

      // Sort by confidence and amount
      detected.sort((a, b) => b.confidence - a.confidence || b.amount - a.amount);

      // Filter out items already saved as bills (any category) OR as subscriptions
      const suggestions = detected.filter(s => {
        const nameLower = s.name.toLowerCase();
        // Exclude if already a bill
        if (existingBillNames.some(existing => existing.includes(nameLower) || nameLower.includes(existing))) {
          return false;
        }
        return true;
      });

      res.json({
        suggestions,
        existingCount: existingBills.length,
        analyzedCount: allTransactions.length,
        detectedCount: detected.length,
      });
    } catch (error: any) {
      console.error("Bills detect error:", error);
      res.status(500).json({ error: error.message || "Failed to detect bills" });
    }
  });

  // GET /api/bills/payment-status — all bills with current month paid/unpaid status
  // IMPORTANT: This route MUST be before /api/bills/:id to avoid "payment-status" being treated as :id
  app.get("/api/bills/payment-status", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const bills = await storage.getBills(userId);
      const { rows: payments } = await pool.query(
        `SELECT bill_id, amount, paid_date, status FROM bill_payments WHERE user_id = $1 AND month = $2`,
        [userId, currentMonth]
      );
      const paymentMap = new Map<string, { amount: string; paidDate: string; status: string }>();
      for (const p of payments as any[]) {
        paymentMap.set(p.bill_id, { amount: p.amount, paidDate: p.paid_date, status: p.status });
      }
      const result = bills.map((bill) => {
        const payment = paymentMap.get(bill.id);
        return { ...bill, currentMonth, isPaidThisMonth: !!payment, lastPayment: payment || null };
      });
      res.json(result);
    } catch (error) {
      console.error("GET /api/bills/payment-status error:", error);
      res.status(500).json({ error: "Failed to fetch bill payment status" });
    }
  });

  // GET /api/bills/:id/payments — payment history for a specific bill (last 12 months)
  app.get("/api/bills/:id/payments", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const billId = req.params.id as string;
      const bill = await storage.getBill(billId);
      if (!bill || bill.userId !== userId) {
        return res.status(404).json({ error: "Bill not found" });
      }
      const now = new Date();
      const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const startMonth = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, "0")}`;
      const { rows } = await pool.query(
        `SELECT id, bill_id, transaction_id, amount, paid_date, month, status, created_at
         FROM bill_payments
         WHERE bill_id = $1 AND user_id = $2 AND month >= $3
         ORDER BY month DESC`,
        [billId, userId, startMonth]
      );
      res.json((rows as any[]).map((r) => ({
        id: r.id,
        billId: r.bill_id,
        transactionId: r.transaction_id,
        amount: r.amount,
        paidDate: r.paid_date,
        month: r.month,
        status: r.status,
        createdAt: r.created_at,
      })));
    } catch (error) {
      console.error("GET /api/bills/:id/payments error:", error);
      res.status(500).json({ error: "Failed to fetch bill payment history" });
    }
  });

  app.get("/api/bills/:id", async (req, res) => {
    try {
      const bill = await storage.getBill(req.params.id);
      if (!bill) {
        return res.status(404).json({ error: "Bill not found" });
      }
      res.json(bill);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bill" });
    }
  });

  app.post("/api/bills", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const billLimit = await getFeatureLimit(plan, "bill_tracking");
      if (billLimit !== null) {
        if (billLimit === 0) {
          return res.status(402).json({ feature: "bill_tracking", remaining: 0, resetDate: null, upgradeRequired: true });
        }
        const { rows: billRows } = await pool.query<{ cnt: number }>(
          "SELECT COUNT(*)::int AS cnt FROM bills WHERE user_id = $1",
          [userId]
        );
        if ((billRows[0]?.cnt ?? 0) >= billLimit) {
          return res.status(402).json({ feature: "bill_tracking", remaining: 0, resetDate: null });
        }
      }
      const parsed = insertBillSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid bill data", details: parsed.error });
      }
      const data = parsed.data;
      const bill = await storage.createBill({
        ...data,
        userId,
        amount: String(parseFloat(String(data.amount))),
        dueDay: parseInt(String(data.dueDay), 10),
      });
      res.status(201).json(bill);
    } catch (error) {
      console.error("POST /api/bills error:", error);
      res.status(500).json({ error: "Failed to create bill", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch("/api/bills/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const parsed = updateBillSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid bill data", details: parsed.error });
      }
      const bill = await storage.updateBill((req.params.id as string), parsed.data);
      if (!bill) {
        return res.status(404).json({ error: "Bill not found" });
      }
      res.json(bill);
    } catch (error) {
      res.status(500).json({ error: "Failed to update bill" });
    }
  });

  app.delete("/api/bills/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const deleted = await storage.deleteBill((req.params.id as string));
      if (!deleted) {
        return res.status(404).json({ error: "Bill not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete bill" });
    }
  });

  // FEATURE: EXPENSE_TRACKING | tier: free | limit: 100 expenses/month
  // Expenses API
  app.get("/api/expenses", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const householdId = req.session.householdId;

      let expenses;
      if (householdId) {
        const memberIds = await storage.getHouseholdMemberUserIds(householdId);
        expenses = await storage.getExpensesByUserIds(memberIds);
      } else {
        expenses = await storage.getExpenses(userId);
      }

      res.json(expenses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch expenses" });
    }
  });

  // Expenses CSV template download - must be before /:id route
  app.get("/api/expenses/template", (_req, res) => {
    const headers = ["merchant", "amount", "date", "category", "notes"];
    const today = new Date().toISOString().split("T")[0];
    const exampleRows = [
      ["Costco", "150.75", today, "Groceries", "Weekly groceries"],
      ["Shell Gas Station", "65.00", today, "Gas", "Gas fill-up"],
      ["Amazon", "49.99", today, "Shopping", "Household items"],
      ["McDonald's", "12.50", today, "Restaurant & Bars", "Lunch"],
      ["CVS Pharmacy", "25.00", today, "Healthcare", "Medicine"],
    ];
    
    const csvContent = [
      headers.join(","),
      ...exampleRows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=expenses_template.csv");
    res.send(csvContent);
  });

  // Expenses CSV import
  app.post("/api/expenses/import", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { csvData } = req.body;
      if (!csvData || typeof csvData !== "string") {
        return res.status(400).json({ error: "CSV data is required" });
      }
      
      const rows = parseCSV(csvData);
      if (rows.length === 0) {
        return res.status(400).json({ error: "No valid data rows found in CSV" });
      }
      
      const results = { imported: 0, errors: [] as string[] };
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const category = row.category as typeof EXPENSE_CATEGORIES[number];
          if (!EXPENSE_CATEGORIES.includes(category)) {
            results.errors.push(`Row ${i + 2}: Invalid category "${row.category}". Valid: ${EXPENSE_CATEGORIES.join(", ")}`);
            continue;
          }
          
          const expenseData = {
            merchant: row.merchant,
            amount: row.amount,
            date: row.date,
            category,
            notes: row.notes || undefined,
          };
          
          const parsed = insertExpenseSchema.safeParse(expenseData);
          if (!parsed.success) {
            results.errors.push(`Row ${i + 2}: ${parsed.error.errors.map(e => e.message).join(", ")}`);
            continue;
          }
          
          await storage.createExpense({ ...parsed.data, userId });
          results.imported++;
        } catch (err) {
          results.errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }
      
      res.json({
        success: true,
        imported: results.imported,
        total: rows.length,
        errors: results.errors,
      });
    } catch (error) {
      console.error("Expenses import error:", error);
      res.status(500).json({ error: "Failed to import expenses" });
    }
  });

  app.get("/api/expenses/:id", requireAuth, async (req, res) => {
    try {
      const expense = await storage.getExpense((req.params.id as string));
      if (!expense) {
        return res.status(404).json({ error: "Expense not found" });
      }
      res.json(expense);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch expense" });
    }
  });

  app.post("/api/expenses", requireAuth, requireWriteAccess, apiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "expense_tracking");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "expense_tracking",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      const parsed = insertExpenseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid expense data", details: parsed.error });
      }
      const expense = await storage.createExpense({ ...parsed.data, userId });
      res.status(201).json(expense);
    } catch (error) {
      res.status(500).json({ error: "Failed to create expense" });
    }
  });

  app.patch("/api/expenses/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const parsed = updateExpenseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid expense data", details: parsed.error });
      }
      const expense = await storage.updateExpense((req.params.id as string), parsed.data);
      if (!expense) {
        return res.status(404).json({ error: "Expense not found" });
      }
      res.json(expense);
    } catch (error) {
      res.status(500).json({ error: "Failed to update expense" });
    }
  });

  app.delete("/api/expenses/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const deleted = await storage.deleteExpense((req.params.id as string));
      if (!deleted) {
        return res.status(404).json({ error: "Expense not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete expense" });
    }
  });

  // FEATURE: INCOME_TRACKING | tier: free | limit: unlimited
  // Income API
  app.get("/api/income", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const householdId = req.session.householdId;

      let incomes;
      if (householdId) {
        const memberIds = await storage.getHouseholdMemberUserIds(householdId);
        incomes = await storage.getIncomesByUserIds(memberIds);
      } else {
        incomes = await storage.getIncomes(userId);
      }

      // Get disabled Plaid account IDs to filter out linked incomes
      // Also filter by plaid_items.status = 'active' to exclude ghost transactions
      // from disconnected/error items (fixes inflated income totals)
      const plaidItems = await storage.getPlaidItems(userId);
      let disabledPlaidAccountIds = new Set<string>();
      if (plaidItems.length > 0) {
        // Collect accounts from inactive items OR accounts marked inactive
        const allAccountsNested = await Promise.all(plaidItems.map(item => storage.getPlaidAccounts(item.id)));
        const allAccounts = allAccountsNested.flat();
        // Disable accounts that are themselves inactive
        const inactiveByAccount = allAccounts.filter(a => a.isActive !== "true").map(a => a.id);
        // Disable ALL accounts belonging to a plaid_item that is not 'active'
        const inactiveItemIds = new Set(
          plaidItems.filter(item => item.status !== "active").map(item => item.id)
        );
        const inactiveByItem = allAccounts
          .filter(a => inactiveItemIds.has(a.plaidItemId))
          .map(a => a.id);
        disabledPlaidAccountIds = new Set([...inactiveByAccount, ...inactiveByItem]);
      }

      // Filter out incomes linked to disabled/inactive Plaid accounts
      const filteredIncomes = incomes.filter(inc => {
        if (inc.linkedPlaidAccountId && disabledPlaidAccountIds.has(inc.linkedPlaidAccountId)) {
          return false;
        }
        return true;
      });

      // ── Dedup recurring income: keep only the most recent record per
      // (source, recurrence) group.
      //
      // WHY THIS IS NEEDED:
      // The "Detect Income" flow historically imported every individual Plaid
      // paycheck as a RECURRING income entry (e.g., each biweekly Roche Pharma
      // deposit became its own recurring record). The frontend then projects ALL
      // of them forward into the selected month, multiplying the total by the
      // number of historical records × occurrences per month.
      //
      // Example: 20 historical "Roche Pharma biweekly" records each contribute
      // 2 occurrences in March → 40× the actual income instead of 2×.
      //
      // The fix: for recurring income with the same source name and recurrence
      // pattern, only the MOST RECENT record represents the current schedule.
      // Older records are superseded historical snapshots and should not be
      // projected forward. Non-recurring (one-time) records are always kept.
      //
      // SAFETY: manually-created recurring records (user-entered) are preserved
      // because they typically have unique source names. Only auto-imported
      // records with identical source+recurrence are collapsed.
      const deduplicatedIncomes = (() => {
        // Separate recurring from non-recurring
        const nonRecurring = filteredIncomes.filter(inc => inc.isRecurring !== "true");
        const recurring = filteredIncomes.filter(inc => inc.isRecurring === "true");

        // For recurring: group by (source lowercase, recurrence)
        // Keep only the most recent record per group (highest date)
        const recurringMap = new Map<string, typeof recurring[0]>();
        for (const inc of recurring) {
          const key = `${inc.source.toLowerCase().trim()}|${inc.recurrence || "monthly"}`;
          const existing = recurringMap.get(key);
          if (!existing || inc.date > existing.date) {
            recurringMap.set(key, inc);
          }
        }

        return [...nonRecurring, ...Array.from(recurringMap.values())];
      })();

      res.json(deduplicatedIncomes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch income" });
    }
  });

  app.get("/api/income/:id", async (req, res) => {
    try {
      const income = await storage.getIncome(req.params.id);
      if (!income) {
        return res.status(404).json({ error: "Income not found" });
      }
      res.json(income);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch income" });
    }
  });

  // Auto-detect recurring income from transaction history (pattern-based, no AI)
  // Deduplicate income records — SAFER version:
  //   Step 1: Remove records where the SAME Plaid transaction was imported twice
  //           (identified by matching notes containing the same plaid transaction ID).
  //   Step 2: Flag (but do NOT auto-delete) same source+date+amount appearing 3+ times.
  //   Step 3: Remove "Auto-imported" entries where a manual entry exists within ±1 day
  //           and within 1% of the same amount.
  // Returns count removed + flagged groups for user review.
  app.post("/api/income/deduplicate", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { pool: dedupPool } = await import("./db");

      let removed = 0;

      // ── Step 1: Remove EXACT duplicates only when ALL fields match ──────────
      // Requires source + date + amount + category + notes ALL identical.
      // This catches the case where the same record was inserted twice (e.g., a
      // double-sync bug) but will NOT delete legitimate same-day same-amount
      // payments from different transactions (e.g., 3 × $400 Stripe payouts).
      const { rows: exactDupGroups } = await dedupPool.query(`
        SELECT source, date, amount, category, notes,
               COUNT(*) as cnt,
               MIN(id) as keep_id,
               ARRAY_AGG(id ORDER BY created_at ASC, id ASC) as all_ids
        FROM income
        WHERE user_id = $1
        GROUP BY source, date, amount, category, notes
        HAVING COUNT(*) > 1
      `, [userId]);

      for (const group of exactDupGroups) {
        // Only delete the extras — keep the oldest (first in all_ids after ORDER BY created_at)
        const idsToDelete = (group.all_ids as string[]).filter((id: string) => id !== group.keep_id);
        if (idsToDelete.length > 0) {
          await dedupPool.query(
            `DELETE FROM income WHERE id = ANY($1) AND user_id = $2`,
            [idsToDelete, userId]
          );
          removed += idsToDelete.length;
        }
      }

      // ── Step 2: Flag suspicious entries (same source+date+amount, 3+ times) ─
      // These are NOT auto-deleted — returned to the frontend for user review.
      // Legitimate case: 3 × $400 Stripe payments same day = 3 real customers.
      // Suspicious case: same record imported 3 times by a sync bug.
      const { rows: suspicious } = await dedupPool.query(`
        SELECT source, date, amount, COUNT(*) as count,
               ARRAY_AGG(id ORDER BY created_at ASC) as ids
        FROM income
        WHERE user_id = $1
          AND (notes IS NULL OR notes NOT LIKE '%Auto-imported from bank transaction%')
        GROUP BY source, date, amount
        HAVING COUNT(*) >= 3
      `, [userId]);

      // ── Step 3: Remove "Auto-imported" entries where a manual entry exists ──
      // Tighter thresholds: ±1 day (was ±3) and within 1% amount (was 5%).
      // This prevents false positives like $400 auto-import vs $380 manual entry.
      const { rows: autoImported } = await dedupPool.query(`
        SELECT id, source, date, amount
        FROM income
        WHERE user_id = $1
          AND notes LIKE '%Auto-imported from bank transaction%'
      `, [userId]);

      for (const autoInc of autoImported) {
        const amt = parseFloat(autoInc.amount);
        const { rows: manualMatches } = await dedupPool.query(`
          SELECT id FROM income
          WHERE user_id = $1
            AND id != $2
            AND (notes IS NULL OR notes NOT LIKE '%Auto-imported from bank transaction%')
            AND LOWER(source) = LOWER($3)
            AND ABS(date::date - $4::date) <= 1
            AND ABS(amount::numeric - $5) / NULLIF($5, 0) < 0.01
          LIMIT 1
        `, [userId, autoInc.id, autoInc.source, autoInc.date, amt]);

        if (manualMatches.length > 0) {
          await dedupPool.query(`DELETE FROM income WHERE id = $1 AND user_id = $2`, [autoInc.id, userId]);
          removed++;
        }
      }

      console.log(`[Income Dedup] Removed ${removed} exact duplicate income records for user ${userId}. Flagged ${suspicious.length} group(s) for review.`);
      res.json({
        removed,
        message: removed > 0
          ? `Removed ${removed} exact duplicate income record${removed !== 1 ? "s" : ""}`
          : "No exact duplicates found",
        flaggedForReview: suspicious.map((g: any) => ({
          source: g.source,
          date: g.date,
          amount: g.amount,
          count: parseInt(g.count),
          ids: g.ids,
        })),
      });
    } catch (error: any) {
      console.error("income deduplicate error:", error);
      res.status(500).json({ error: error.message || "Failed to deduplicate income" });
    }
  });

  app.post("/api/income/detect-recurring", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { detectRecurringIncome } = await import("./recurring-income-detector");
      const results = await detectRecurringIncome(userId);
      const totalUpdated = results.reduce((s, r) => s + r.incomeIdsUpdated.length, 0);
      res.json({
        success: true,
        patternsFound: results.length,
        recordsUpdated: totalUpdated,
        results,
      });
    } catch (error: any) {
      console.error("detect-recurring error:", error);
      res.status(500).json({ error: error.message || "Failed to detect recurring income" });
    }
  });

  // Income detection endpoint - finds recurring income from Plaid transactions
  app.post("/api/income/detect", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { plaidClient } = await import("./plaid");
      const { routeAI } = await import("./ai-router");

      // Minimum amount threshold to filter out small transfers (e.g., Etsy sales, refunds)
      const MIN_INCOME_THRESHOLD = 200;

      // Get existing income to filter out duplicates
      const existingIncome = await storage.getIncomes(userId);
      const existingSourceNames = existingIncome.map(i => i.source.toLowerCase());

      // Get Plaid recurring transactions (inflow streams)
      const items = await storage.getPlaidItems(userId);
      const plaidRecurring: any[] = [];

      for (const item of items) {
        try {
          const accounts = await storage.getPlaidAccounts(item.id);
          // Only include explicitly active accounts (isActive === "true")
          const activeAccounts = accounts.filter(a => a.isActive === "true");
          const accountIds = activeAccounts.map(a => a.accountId);
          if (accountIds.length === 0) continue;

          const response = await plaidClient.transactionsRecurringGet({
            access_token: decrypt(item.accessToken),
            account_ids: accountIds,
          });

          // Get inflow streams (income/deposits)
          if (response.data.inflow_streams) {
            for (const stream of response.data.inflow_streams) {
              const amount = Math.abs(stream.average_amount?.amount || 0);
              // Only include significant income (above threshold)
              if (amount >= MIN_INCOME_THRESHOLD && stream.is_active) {
                plaidRecurring.push({
                  name: stream.merchant_name || stream.description || "Unknown",
                  amount,
                  frequency: stream.frequency,
                  lastDate: stream.last_date,
                  category: stream.personal_finance_category?.primary || null,
                });
              }
            }
          }
        } catch (itemError: any) {
          console.error(`Error fetching recurring income for item ${item.id}:`, itemError?.response?.data || itemError);
        }
      }

      // Also get recent transactions for AI analysis (last 6 months)
      const allAccounts = [];
      for (const item of items) {
        const accounts = await storage.getPlaidAccounts(item.id);
        // Only include explicitly active accounts (isActive === "true")
        const activeAccounts = accounts.filter(a => a.isActive === "true");
        allAccounts.push(...activeAccounts);
      }
      const accountIds = allAccounts.map(a => a.id);

      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 6);

      const transactions = await storage.getPlaidTransactions(accountIds, {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      });

      // Filter to inflows only (negative amounts are deposits in Plaid)
      // and filter out small amounts
      const inflowTx = transactions
        .filter(t => parseFloat(t.amount) < 0 && Math.abs(parseFloat(t.amount)) >= MIN_INCOME_THRESHOLD)
        .map(t => ({
          date: t.date,
          name: t.merchantName || t.name,
          amount: Math.abs(parseFloat(t.amount)),
          category: t.category,
        }));

      // Use AI to analyze transactions for recurring income patterns
      const INCOME_CATS = ["Salary", "Freelance", "Business", "Investments", "Rental", "Gifts", "Refunds", "Other"];

      let aiSuggestions: any[] = [];
      if (inflowTx.length > 0) {
        const prompt = `Analyze these ${inflowTx.length} bank deposit transactions (last 6 months) and identify recurring income sources.

IMPORTANT: Only identify SIGNIFICANT recurring income like:
- Regular salary/payroll deposits
- Consistent freelance/contract payments
- Business income
- Rental income
- Investment dividends

DO NOT include:
- Small one-time refunds
- Random small deposits under $200
- One-off transfers between accounts
- Small marketplace sales (Etsy, eBay, etc.)

Transactions:
${JSON.stringify(inflowTx.slice(0, 500))}

Find patterns that occur 2+ times with similar amounts (within 10% variance). For each recurring income source, provide:
- name: Clean source name (employer/payer name)
- amount: Typical amount (positive number)
- category: One of: ${INCOME_CATS.join(", ")}
- recurrence: weekly, biweekly, monthly, or yearly
- dueDay: Day of month (1-31) typically received
- confidence: high (3+ occurrences, consistent amounts), medium (2 occurrences)

Return JSON: { "income": [...] }`;

        try {
          const aiRes = await routeAI({
            taskSlot: "detection_auto",
            userId: req.session.userId!,
            featureContext: "income_detect",
            jsonMode: true,
            temperature: 0.2,
            maxTokens: 4000,
            messages: [
              { role: "system", content: "You are a financial analyst. Identify significant recurring income patterns only. Ignore small or one-off deposits. Return only valid JSON." },
              { role: "user", content: prompt },
            ],
          });

          const result = JSON.parse(aiRes.content || "{}");
          aiSuggestions = result.income || [];
        } catch (aiError) {
          console.error("AI income analysis error:", aiError);
        }
      }

      // Combine Plaid recurring with AI suggestions
      const allSuggestions: any[] = [];

      // Add Plaid recurring income (higher confidence)
      for (const rec of plaidRecurring) {
        // Map Plaid frequency to our recurrence
        let recurrence = "monthly";
        if (rec.frequency === "WEEKLY") recurrence = "weekly";
        else if (rec.frequency === "BIWEEKLY") recurrence = "biweekly";
        else if (rec.frequency === "ANNUALLY") recurrence = "yearly";

        // Get pay day from last date
        const dueDay = rec.lastDate ? new Date(rec.lastDate).getDate() : 1;

        // Map Plaid category to income categories
        let category = "Other";
        const plaidCat = (rec.category || "").toUpperCase();
        if (plaidCat.includes("PAYROLL") || plaidCat.includes("SALARY")) category = "Salary";
        else if (plaidCat.includes("INVESTMENT") || plaidCat.includes("DIVIDEND")) category = "Investments";
        else if (plaidCat.includes("RENT")) category = "Rental";
        else if (plaidCat.includes("TRANSFER")) category = "Other";

        allSuggestions.push({
          name: rec.name,
          amount: rec.amount.toFixed(2),
          category,
          recurrence,
          dueDay,
          source: "plaid",
          confidence: "high",
        });
      }

      // Add AI suggestions (may have duplicates with Plaid)
      for (const ai of aiSuggestions) {
        // Check if already in Plaid suggestions (by similar name)
        const aiNameLower = (ai.name || "").toLowerCase();
        const alreadyInPlaid = allSuggestions.some(s =>
          s.name.toLowerCase().includes(aiNameLower) || aiNameLower.includes(s.name.toLowerCase())
        );
        if (!alreadyInPlaid && parseFloat(ai.amount) >= MIN_INCOME_THRESHOLD) {
          allSuggestions.push({
            name: ai.name,
            amount: String(ai.amount),
            category: INCOME_CATS.includes(ai.category) ? ai.category : "Other",
            recurrence: ai.recurrence || "monthly",
            dueDay: ai.dueDay || 1,
            source: "ai",
            confidence: ai.confidence || "medium",
          });
        }
      }

      // Filter out income sources that already exist
      const newSuggestions = allSuggestions.filter(s => {
        const nameLower = s.name.toLowerCase();
        return !existingSourceNames.some(existing =>
          existing.includes(nameLower) || nameLower.includes(existing)
        );
      });

      // Sort by confidence then amount
      newSuggestions.sort((a, b) => {
        if (a.confidence === "high" && b.confidence !== "high") return -1;
        if (b.confidence === "high" && a.confidence !== "high") return 1;
        return parseFloat(b.amount) - parseFloat(a.amount);
      });

      res.json({
        suggestions: newSuggestions,
        existingCount: existingIncome.length,
        plaidRecurringCount: plaidRecurring.length,
        aiAnalyzedCount: inflowTx.length,
        minThreshold: MIN_INCOME_THRESHOLD,
      });
    } catch (error: any) {
      console.error("Income detect error:", error);
      res.status(500).json({ error: error.message || "Failed to detect income" });
    }
  });

  app.post("/api/income", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const parsed = insertIncomeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid income data", details: parsed.error });
      }
      const income = await storage.createIncome({ ...parsed.data, userId });
      res.status(201).json(income);
    } catch (error) {
      res.status(500).json({ error: "Failed to create income" });
    }
  });

  app.patch("/api/income/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const parsed = updateIncomeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid income data", details: parsed.error });
      }
      const income = await storage.updateIncome((req.params.id as string), parsed.data);
      if (!income) {
        return res.status(404).json({ error: "Income not found" });
      }
      res.json(income);
    } catch (error) {
      res.status(500).json({ error: "Failed to update income" });
    }
  });

  app.delete("/api/income/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const deleted = await storage.deleteIncome((req.params.id as string));
      if (!deleted) {
        return res.status(404).json({ error: "Income not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete income" });
    }
  });

  // FEATURE: BUDGET_CREATION | tier: free | limit: 2 budgets
  // Budgets API
  app.get("/api/budgets", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const householdId = req.session.householdId;

      let budgets;
      if (householdId) {
        const memberIds = await storage.getHouseholdMemberUserIds(householdId);
        budgets = await storage.getBudgetsByUserIds(memberIds);
      } else {
        budgets = await storage.getBudgets(userId);
      }

      res.json(budgets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch budgets" });
    }
  });

  app.get("/api/budgets/month/:month", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const householdId = req.session.householdId;

      let budgets;
      if (householdId) {
        const memberIds = await storage.getHouseholdMemberUserIds(householdId);
        budgets = await storage.getBudgetsByUserIdsAndMonth(memberIds, (req.params.month as string));
      } else {
        budgets = await storage.getBudgetsByMonth(userId, (req.params.month as string));
      }

      res.json(budgets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch budgets" });
    }
  });

  app.post("/api/budgets", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const budgetLimit = await getFeatureLimit(plan, "budget_creation");
      if (budgetLimit !== null) {
        if (budgetLimit === 0) {
          return res.status(402).json({ feature: "budget_creation", remaining: 0, resetDate: null, upgradeRequired: true });
        }
        // Use the month from the request body so limits apply per-month, not just current month
        const targetMonthStr = (req.body.month as string) || new Date().toISOString().slice(0, 7);
        const { rows: budgetRows } = await pool.query<{ cnt: number }>(
          "SELECT COUNT(DISTINCT category)::int AS cnt FROM budgets WHERE user_id = $1 AND month = $2",
          [userId, targetMonthStr]
        );
        if ((budgetRows[0]?.cnt ?? 0) >= budgetLimit) {
          return res.status(402).json({ feature: "budget_creation", remaining: 0, resetDate: null });
        }
      }
      const parsed = insertBudgetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid budget data", details: parsed.error });
      }
      const budget = await storage.createBudget({ ...parsed.data, userId });
      res.status(201).json(budget);
    } catch (error) {
      res.status(500).json({ error: "Failed to create budget" });
    }
  });

  app.patch("/api/budgets/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const parsed = updateBudgetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid budget data", details: parsed.error });
      }
      const budget = await storage.updateBudget((req.params.id as string), parsed.data);
      if (!budget) {
        return res.status(404).json({ error: "Budget not found" });
      }
      res.json(budget);
    } catch (error) {
      res.status(500).json({ error: "Failed to update budget" });
    }
  });

  app.delete("/api/budgets/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const deleted = await storage.deleteBudget((req.params.id as string));
      if (!deleted) {
        return res.status(404).json({ error: "Budget not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete budget" });
    }
  });

  // GET /api/budgets/spending?month=YYYY-MM
  // Returns spending per category for a given month (from manual expenses)
  app.get("/api/budgets/spending", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const month = (req.query.month as string) || new Date().toISOString().substring(0, 7);

      // Get all expenses for this user and filter by month
      const allExpenses = await storage.getExpenses(userId);
      const monthExpenses = allExpenses.filter((e: any) => e.date && e.date.startsWith(month));

      // Group by category and sum amounts
      const result: Record<string, number> = {};
      for (const exp of monthExpenses) {
        const cat = exp.category;
        if (cat) {
          result[cat] = (result[cat] || 0) + parseFloat(exp.amount);
        }
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching budget spending:", error);
      res.status(500).json({ error: "Failed to fetch budget spending" });
    }
  });

  // GET /api/reports/category-comparison?month=YYYY-MM
  // Returns spending per category for current month, previous month, and same month last year
  app.get("/api/reports/category-comparison", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const month = (req.query.month as string) || new Date().toISOString().substring(0, 7);

      const [year, mon] = String(month).split("-");
      const yr = parseInt(year);
      const mo = parseInt(mon);

      // Previous month
      const prevMonth = mo === 1 ? 12 : mo - 1;
      const prevYear = mo === 1 ? yr - 1 : yr;

      // Same month last year
      const lastYear = yr - 1;

      async function getSpendingByCategory(y: number, m: number): Promise<Record<string, number>> {
        // Try Plaid transactions first, fall back to manual expenses
        try {
          const { rows } = await pool.query(
            `SELECT
              COALESCE(personal_finance_category, category, 'Other') as category,
              SUM(ABS(amount::numeric)) as total
            FROM plaid_transactions pt
            JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
            JOIN plaid_items pi ON pi.id = pa.plaid_item_id
            WHERE pi.user_id = $1
              AND pi.status = 'active'
              AND EXTRACT(YEAR FROM pt.date::date) = $2
              AND EXTRACT(MONTH FROM pt.date::date) = $3
              AND pt.amount::numeric > 0
              AND (pt.pending IS NULL OR pt.pending = 'false')
            GROUP BY 1
            ORDER BY total DESC
            LIMIT 20`,
            [userId, y, m]
          );
          const map: Record<string, number> = {};
          rows.forEach((row: any) => {
            map[row.category] = parseFloat(row.total);
          });
          // Also add manual expenses for the same period
          const monthStr = `${y}-${String(m).padStart(2, "0")}`;
          const allExpenses = await storage.getExpenses(userId);
          const filtered = allExpenses.filter((e: any) => e.date && e.date.startsWith(monthStr));
          for (const exp of filtered) {
            const cat = exp.category || "Other";
            map[cat] = (map[cat] || 0) + parseFloat(exp.amount);
          }
          return map;
        } catch {
          // Fallback: manual expenses only
          const monthStr = `${y}-${String(m).padStart(2, "0")}`;
          const allExpenses = await storage.getExpenses(userId);
          const filtered = allExpenses.filter((e: any) => e.date && e.date.startsWith(monthStr));
          const map: Record<string, number> = {};
          for (const exp of filtered) {
            const cat = exp.category || "Other";
            map[cat] = (map[cat] || 0) + parseFloat(exp.amount);
          }
          return map;
        }
      }

      const [current, previous, yearAgo] = await Promise.all([
        getSpendingByCategory(yr, mo),
        getSpendingByCategory(prevYear, prevMonth),
        getSpendingByCategory(lastYear, mo),
      ]);

      // Build unified category list
      const allCategories = new Set([
        ...Object.keys(current),
        ...Object.keys(previous),
        ...Object.keys(yearAgo),
      ]);

      const comparison = Array.from(allCategories)
        .map((category) => {
          const curr = current[category] || 0;
          const prev = previous[category] || 0;
          const yago = yearAgo[category] || 0;

          const momChange = prev > 0 ? ((curr - prev) / prev) * 100 : null;
          const yoyChange = yago > 0 ? ((curr - yago) / yago) * 100 : null;

          return { category, current: curr, previousMonth: prev, yearAgo: yago, momChange, yoyChange };
        })
        .filter((c) => c.current > 0 || c.previousMonth > 0)
        .sort((a, b) => b.current - a.current);

      res.json({
        month,
        previousMonth: `${prevYear}-${String(prevMonth).padStart(2, "0")}`,
        yearAgoMonth: `${lastYear}-${String(mo).padStart(2, "0")}`,
        categories: comparison,
      });
    } catch (error) {
      console.error("Error fetching category comparison:", error);
      res.status(500).json({ error: "Failed to fetch category comparison" });
    }
  });

  // FEATURE: SAVINGS_GOALS | tier: free | limit: 1 goal
  // Savings Goals API
  app.get("/api/savings-goals", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const householdId = req.session.householdId;

      let goals;
      if (householdId) {
        const memberIds = await storage.getHouseholdMemberUserIds(householdId);
        goals = await storage.getSavingsGoalsByUserIds(memberIds);
      } else {
        goals = await storage.getSavingsGoals(userId);
      }

      res.json(goals);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch savings goals" });
    }
  });

  app.get("/api/savings-goals/:id", requireAuth, async (req, res) => {
    try {
      const goal = await storage.getSavingsGoal((req.params.id as string));
      if (!goal) {
        return res.status(404).json({ error: "Savings goal not found" });
      }
      res.json(goal);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch savings goal" });
    }
  });

  app.post("/api/savings-goals", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const goalLimit = await getFeatureLimit(plan, "savings_goals");
      if (goalLimit !== null) {
        if (goalLimit === 0) {
          return res.status(402).json({ feature: "savings_goals", remaining: 0, resetDate: null, upgradeRequired: true });
        }
        const { rows: goalRows } = await pool.query<{ cnt: number }>(
          "SELECT COUNT(*)::int AS cnt FROM savings_goals WHERE user_id = $1",
          [userId]
        );
        if ((goalRows[0]?.cnt ?? 0) >= goalLimit) {
          return res.status(402).json({ feature: "savings_goals", remaining: 0, resetDate: null });
        }
      }
      const parsed = insertSavingsGoalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid savings goal data", details: parsed.error });
      }
      const goal = await storage.createSavingsGoal({ ...parsed.data, userId });
      res.status(201).json(goal);
    } catch (error) {
      res.status(500).json({ error: "Failed to create savings goal" });
    }
  });

  app.patch("/api/savings-goals/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const parsed = updateSavingsGoalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid savings goal data", details: parsed.error });
      }
      const goal = await storage.updateSavingsGoal((req.params.id as string), parsed.data);
      if (!goal) {
        return res.status(404).json({ error: "Savings goal not found" });
      }
      res.json(goal);
    } catch (error) {
      res.status(500).json({ error: "Failed to update savings goal" });
    }
  });

  app.delete("/api/savings-goals/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const deleted = await storage.deleteSavingsGoal((req.params.id as string));
      if (!deleted) {
        return res.status(404).json({ error: "Savings goal not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete savings goal" });
    }
  });

  // FEATURE: DEBT_TRACKING | tier: free | limit: 5 debts
  // ============ DEBT DETAILS API ============

  // Get all debt details for user
  app.get("/api/debts", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const debts = await storage.getDebtDetails(userId);
      res.json(debts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch debt details" });
    }
  });

  // Get debt types for dropdown
  app.get("/api/debts/types", requireAuth, async (_req, res) => {
    res.json(DEBT_TYPES);
  });

  // Get single debt detail
  app.get("/api/debts/:id", requireAuth, async (req, res) => {
    try {
      const debt = await storage.getDebtDetail((req.params.id as string));
      if (!debt) {
        return res.status(404).json({ error: "Debt not found" });
      }
      res.json(debt);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch debt detail" });
    }
  });

  // Create new debt detail
  app.post("/api/debts", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const debtLimit = await getFeatureLimit(plan, "debt_tracking");
      if (debtLimit !== null) {
        if (debtLimit === 0) {
          return res.status(402).json({ feature: "debt_tracking", remaining: 0, resetDate: null, upgradeRequired: true });
        }
        const { rows: debtRows } = await pool.query<{ cnt: number }>(
          "SELECT COUNT(*)::int AS cnt FROM debt_details WHERE user_id = $1 AND is_active = 'true'",
          [userId]
        );
        if ((debtRows[0]?.cnt ?? 0) >= debtLimit) {
          return res.status(402).json({ feature: "debt_tracking", remaining: 0, resetDate: null });
        }
      }
      const parsed = insertDebtDetailsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid debt data", details: parsed.error });
      }
      const debt = await storage.createDebtDetail({ ...parsed.data, userId });
      res.status(201).json(debt);
    } catch (error) {
      res.status(500).json({ error: "Failed to create debt detail" });
    }
  });

  // Update debt detail
  app.patch("/api/debts/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const parsed = updateDebtDetailsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid debt data", details: parsed.error });
      }
      const debt = await storage.updateDebtDetail((req.params.id as string), parsed.data);
      if (!debt) {
        return res.status(404).json({ error: "Debt not found" });
      }
      res.json(debt);
    } catch (error) {
      res.status(500).json({ error: "Failed to update debt detail" });
    }
  });

  // Delete debt detail
  app.delete("/api/debts/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const deleted = await storage.deleteDebtDetail((req.params.id as string));
      if (!deleted) {
        return res.status(404).json({ error: "Debt not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete debt detail" });
    }
  });

  // FEATURE: HOUSEHOLD_MANAGEMENT | tier: family | limit: unlimited
  // ============ HOUSEHOLD COLLABORATION API ============

  // Create a new household
  app.post("/api/households", requireAuth, apiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "household_management");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "household_management",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      // Check if user is already in a household
      const existingHousehold = await storage.getHouseholdByUserId(userId);
      if (existingHousehold) {
        return res.status(400).json({ error: "You are already a member of a household" });
      }

      const parsed = createHouseholdSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid household data", details: parsed.error.issues });
      }

      const household = await storage.createHousehold(parsed.data.name, userId);

      // Update session with new household info
      await loadHouseholdIntoSession(req);

      res.status(201).json(household);
    } catch (error) {
      console.error("Create household error:", error);
      res.status(500).json({ error: "Failed to create household" });
    }
  });

  // Get current user's household
  app.get("/api/households/current", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const household = await storage.getHouseholdByUserId(userId);

      if (!household) {
        return res.json({ household: null, members: [], invitations: [] });
      }

      const members = await storage.getHouseholdMembers(household.id);
      const invitations = await storage.getInvitationsByHousehold(household.id);

      // Get current user's role
      const currentMember = members.find(m => m.userId === userId);

      res.json({
        household,
        members: members.map(m => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          user: {
            id: m.user.id,
            username: m.user.username,
            firstName: m.user.firstName,
            lastName: m.user.lastName,
            email: m.user.email,
          }
        })),
        invitations: currentMember?.role === "owner" ? invitations.filter(i => i.status === "pending") : [],
        currentUserRole: currentMember?.role
      });
    } catch (error) {
      console.error("Get household error:", error);
      res.status(500).json({ error: "Failed to fetch household" });
    }
  });

  // Update household name (owner only)
  app.patch("/api/households/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const householdId = req.params.id as string;

      // Verify user is owner
      const member = await storage.getHouseholdMember(householdId, userId);
      if (!member || member.role !== "owner") {
        return res.status(403).json({ error: "Only the household owner can update the household" });
      }

      const parsed = createHouseholdSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid household data" });
      }

      const updated = await storage.updateHousehold(householdId, { name: parsed.data.name });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update household" });
    }
  });

  // Delete household (owner only)
  app.delete("/api/households/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const householdId = req.params.id as string;

      // Verify user is owner
      const member = await storage.getHouseholdMember(householdId, userId);
      if (!member || member.role !== "owner") {
        return res.status(403).json({ error: "Only the household owner can delete the household" });
      }

      await storage.deleteHousehold(householdId);

      // Clear household from session
      req.session.householdId = undefined;
      req.session.householdRole = undefined;

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete household" });
    }
  });

  // Leave household (members and advisors only, not owner)
  app.post("/api/households/leave", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const householdId = req.session.householdId;

      if (!householdId) {
        return res.status(400).json({ error: "You are not in a household" });
      }

      const member = await storage.getHouseholdMember(householdId, userId);
      if (!member) {
        return res.status(400).json({ error: "You are not a member of this household" });
      }

      if (member.role === "owner") {
        return res.status(400).json({ error: "The owner cannot leave the household. Delete the household instead." });
      }

      await storage.removeHouseholdMember(householdId, userId);

      // Clear household from session
      req.session.householdId = undefined;
      req.session.householdRole = undefined;

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to leave household" });
    }
  });

  // Remove a member (owner only)
  app.delete("/api/households/members/:userId", requireAuth, async (req, res) => {
    try {
      const currentUserId = req.session.userId!;
      const targetUserId = req.params.userId as string;
      const householdId = req.session.householdId;

      if (!householdId) {
        return res.status(400).json({ error: "You are not in a household" });
      }

      // Verify current user is owner
      const currentMember = await storage.getHouseholdMember(householdId, currentUserId);
      if (!currentMember || currentMember.role !== "owner") {
        return res.status(403).json({ error: "Only the household owner can remove members" });
      }

      // Can't remove yourself as owner
      if (targetUserId === currentUserId) {
        return res.status(400).json({ error: "The owner cannot be removed. Delete the household instead." });
      }

      const removed = await storage.removeHouseholdMember(householdId, targetUserId);
      if (!removed) {
        return res.status(404).json({ error: "Member not found" });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove member" });
    }
  });

  // Invite a new member (owner only)
  app.post("/api/households/invite", requireAuth, apiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "household_invitations");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "household_invitations",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      const householdId = req.session.householdId;

      if (!householdId) {
        return res.status(400).json({ error: "You are not in a household" });
      }

      // Verify user is owner
      const member = await storage.getHouseholdMember(householdId, userId);
      if (!member || member.role !== "owner") {
        return res.status(403).json({ error: "Only the household owner can invite members" });
      }

      const parsed = createInvitationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid invitation data", details: parsed.error.issues });
      }

      const { email, role } = parsed.data;

      // Check if email is already a member
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        const existingMember = await storage.getHouseholdMember(householdId, existingUser.id);
        if (existingMember) {
          return res.status(400).json({ error: "This user is already a member of your household" });
        }
      }

      // Check for existing pending invitation
      const existingInvitations = await storage.getInvitationsByHousehold(householdId);
      const pending = existingInvitations.find(i => i.email === email && i.status === "pending");
      if (pending) {
        return res.status(400).json({ error: "An invitation has already been sent to this email" });
      }

      // Create invitation
      const invitation = await storage.createInvitation({
        householdId,
        email,
        role,
        invitedBy: userId,
      });

      // Get household and inviter details for email
      const household = await storage.getHousehold(householdId);
      const inviter = await storage.getUser(userId);

      // Send invitation email
      if (household && inviter) {
        const inviterName = inviter.firstName && inviter.lastName
          ? `${inviter.firstName} ${inviter.lastName}`
          : inviter.username;

        await sendHouseholdInvitation(
          email,
          inviterName,
          household.name,
          role,
          invitation.token
        );
      }

      res.status(201).json(invitation);
    } catch (error) {
      console.error("Invite error:", error);
      res.status(500).json({ error: "Failed to send invitation" });
    }
  });

  // Cancel a pending invitation (owner only)
  app.delete("/api/households/invitations/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const householdId = req.session.householdId;
      const invitationId = req.params.id as string;

      if (!householdId) {
        return res.status(400).json({ error: "You are not in a household" });
      }

      // Verify user is owner
      const member = await storage.getHouseholdMember(householdId, userId);
      if (!member || member.role !== "owner") {
        return res.status(403).json({ error: "Only the household owner can cancel invitations" });
      }

      const deleted = await storage.deleteInvitation(invitationId);
      if (!deleted) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to cancel invitation" });
    }
  });

  // ── Household general info (address, country, household name) ─────────────
  app.patch("/api/user/household", requireAuth, async (req, res) => {
    try {
      const parsed = updateHouseholdSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid household data" });
      }
      const userId = req.session.userId!;
      const updated = await storage.updateUserHousehold(userId, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({
        success: true,
        householdName: updated.householdName || null,
        country: updated.country || null,
        addressLine1: updated.addressLine1 || null,
        city: updated.city || null,
        provinceState: updated.provinceState || null,
        postalCode: updated.postalCode || null,
      });
    } catch (error) {
      console.error("Household update error:", error);
      res.status(500).json({ error: "Failed to update household info" });
    }
  });

  // Get household address info for current user
  app.get("/api/user/household", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({
        householdName: user.householdName || null,
        country: user.country || "Canada",
        addressLine1: user.addressLine1 || null,
        city: user.city || null,
        provinceState: user.provinceState || null,
        postalCode: user.postalCode || null,
      });
    } catch (error) {
      console.error("Get household error:", error);
      res.status(500).json({ error: "Failed to fetch household info" });
    }
  });

  // ── User Preferences ──────────────────────────────────────────────────────
  app.get("/api/user/preferences", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({
        prefNeedsReview: user.prefNeedsReview !== false,
        prefEditPending: user.prefEditPending === true,
        prefMerchantDisplay: user.prefMerchantDisplay || "enriched",
      });
    } catch (error) {
      console.error("Get preferences error:", error);
      res.status(500).json({ error: "Failed to fetch preferences" });
    }
  });

  app.patch("/api/user/preferences", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        prefNeedsReview: z.boolean().optional(),
        prefEditPending: z.boolean().optional(),
        prefMerchantDisplay: z.enum(["enriched", "raw"]).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid data" });
      }
      const updated = await storage.updateUserPreferences(req.session.userId!, parsed.data);
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json({
        prefNeedsReview: updated.prefNeedsReview !== false,
        prefEditPending: updated.prefEditPending === true,
        prefMerchantDisplay: updated.prefMerchantDisplay || "enriched",
      });
    } catch (error) {
      console.error("Update preferences error:", error);
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  /**
   * GET /api/user/feature-usage
   * Returns the current free-plan user's limited feature usage for the current month.
   * Used by the UsageSummaryWidget to display a usage dashboard.
   * Only returns features that have a finite monthly limit (> 0) on the free plan.
   */
  // ── Budget Period Settings ────────────────────────────────────────────────
  app.get("/api/user/budget-settings", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { rows } = await pool.query(
        `SELECT budget_period, next_payday FROM users WHERE id = $1`,
        [userId]
      );
      res.json({
        budgetPeriod: rows[0]?.budget_period || 'monthly',
        nextPayday: rows[0]?.next_payday || null,
      });
    } catch (error) {
      console.error("Error fetching budget settings:", error);
      res.status(500).json({ error: "Failed to fetch budget settings" });
    }
  });

  app.patch("/api/user/budget-settings", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { budgetPeriod, nextPayday } = req.body;
      await pool.query(
        `UPDATE users SET budget_period = $1, next_payday = $2 WHERE id = $3`,
        [budgetPeriod || 'monthly', nextPayday || null, userId]
      );
      res.json({ success: true, budgetPeriod: budgetPeriod || 'monthly', nextPayday: nextPayday || null });
    } catch (error) {
      console.error("Error updating budget settings:", error);
      res.status(500).json({ error: "Failed to update budget settings" });
    }
  });

  app.get("/api/user/feature-usage", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);

      const { getUserFeatureSummary } = await import("./lib/featureGate");
      const summary = await getUserFeatureSummary(userId, plan);

      // Only expose features with finite positive limits (not null = unlimited, not 0 = disabled)
      // and collapse MX/Plaid into one combined "Bank Connections (MX / Plaid)" line.
      const mxUsage = summary.find((f) => f.featureKey === "mx_bank_connections");
      const plaidUsage = summary.find((f) => f.featureKey === "plaid_bank_connections");
      const bankConnectionsLimit = await getFeatureLimit(plan, "bank_connections");
      const combinedBankUsed = (mxUsage?.currentUsage ?? 0) + (plaidUsage?.currentUsage ?? 0);

      const limitedFeatures = summary.filter(
        (f) =>
          f.limit !== null &&
          f.limit > 0 &&
          f.featureKey !== "mx_bank_connections" &&
          f.featureKey !== "plaid_bank_connections"
      );

      if (bankConnectionsLimit !== null && bankConnectionsLimit > 0) {
        limitedFeatures.push({
          featureKey: "bank_connections",
          displayName: "Bank Connections (MX / Plaid)",
          allowed: combinedBankUsed < bankConnectionsLimit,
          currentUsage: combinedBankUsed,
          limit: bankConnectionsLimit,
          remaining: Math.max(0, bankConnectionsLimit - combinedBankUsed),
          resetDate: null,
          upgradeRequired: false,
        });
      }

      const resetDate = limitedFeatures.find((f) => f.resetDate)?.resetDate ?? null;
      const resetDateStr = resetDate
        ? resetDate.toISOString().split("T")[0]
        : null;
      const daysUntilReset = resetDate
        ? Math.max(0, Math.ceil((resetDate.getTime() - Date.now()) / 86400000))
        : null;

      const features = limitedFeatures.map((f) => ({
        key: f.featureKey,
        displayName: f.displayName,
        used: f.currentUsage,
        limit: f.limit as number,
        remaining: f.remaining as number,
        resetDate: resetDateStr,
        percentUsed:
          f.limit && f.limit > 0
            ? Math.min(100, Math.round((f.currentUsage / f.limit) * 100))
            : 0,
      }));

      res.json({ plan, features, resetDate: resetDateStr, daysUntilReset });
    } catch (error: any) {
      console.error("Error fetching user feature usage:", error);
      res.status(500).json({ error: "Failed to fetch feature usage" });
    }
  });

  // FEATURE: MERCHANT_MANAGEMENT | tier: free | limit: unlimited
  // ── Merchants ─────────────────────────────────────────────────────────────
  app.get("/api/merchants", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const pool = (db as any).$client as import('pg').Pool;

      // Build union of merchant names from all transaction tables for this user
      const result = await pool.query(`
        SELECT
          COALESCE(me.clean_name, combined.merchant_name) AS display_name,
          combined.merchant_name                          AS raw_name,
          me.logo_url,
          me.category,
          COUNT(combined.id)::int                        AS transaction_count,
          SUM(combined.amount)::numeric(12,2)            AS total_spent,
          MAX(combined.date)                             AS last_transaction
        FROM (
          SELECT pt.id, pt.merchant_name, pt.amount::numeric, pt.date
          FROM plaid_transactions pt
          JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
          JOIN plaid_items pi2 ON pi2.id = pa.plaid_item_id
          WHERE pi2.user_id = $1 AND pt.merchant_name IS NOT NULL AND pt.merchant_name <> ''

          UNION ALL

          SELECT mt.id, mt.description AS merchant_name, mt.amount::numeric, mt.date
          FROM mx_transactions mt
          JOIN mx_accounts ma ON ma.id = mt.mx_account_id
          JOIN mx_members mm ON mm.id = ma.mx_member_id
          WHERE mm.user_id = $1 AND mt.description IS NOT NULL AND mt.description <> ''

          UNION ALL

          SELECT mt2.id, mt2.merchant AS merchant_name, mt2.amount::numeric, mt2.date
          FROM manual_transactions mt2
          WHERE mt2.user_id = $1 AND mt2.merchant IS NOT NULL AND mt2.merchant <> ''
        ) AS combined
        LEFT JOIN merchant_enrichment me ON me.raw_pattern = combined.merchant_name
        GROUP BY
          COALESCE(me.clean_name, combined.merchant_name),
          combined.merchant_name,
          me.logo_url,
          me.category,
          me.raw_pattern
        ORDER BY transaction_count DESC
        LIMIT 500
      `, [userId]);

      res.json({ merchants: result.rows });
    } catch (error) {
      console.error("Get merchants error:", error);
      res.status(500).json({ error: "Failed to fetch merchants" });
    }
  });

  app.patch("/api/merchants/edit", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        rawPattern: z.string().min(1),
        cleanName: z.string().min(1).max(200),
        category: z.string().nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid data" });
      }
      const { rawPattern, cleanName, category } = parsed.data;
      const userId = req.session.userId!;
      const pool = (db as any).$client as import('pg').Pool;

      // Upsert merchant_enrichment with user-confirmed data
      await pool.query(`
        INSERT INTO merchant_enrichment (raw_pattern, clean_name, category, confidence, source)
        VALUES ($1, $2, $3, 1.0, 'user')
        ON CONFLICT (raw_pattern) DO UPDATE
          SET clean_name = EXCLUDED.clean_name,
              category   = EXCLUDED.category,
              confidence  = 1.0,
              source      = 'user',
              updated_at  = NOW()
      `, [rawPattern, cleanName, category || null]);

      // Update category on the authenticated user's transactions only
      if (category) {
        await pool.query(`
          UPDATE plaid_transactions pt
          SET personal_category = $1
          FROM plaid_accounts pa
          JOIN plaid_items pi2 ON pi2.id = pa.plaid_item_id
          WHERE pt.plaid_account_id = pa.id
            AND pi2.user_id = $3
            AND pt.merchant_name = $2
        `, [category, rawPattern, userId]);
        await pool.query(`
          UPDATE mx_transactions mt
          SET personal_category = $1
          FROM mx_accounts ma
          JOIN mx_members mm ON mm.id = ma.mx_member_id
          WHERE mt.mx_account_id = ma.id
            AND mm.user_id = $3
            AND mt.description = $2
        `, [category, rawPattern, userId]);
        await pool.query(`
          UPDATE manual_transactions SET category = $1
          WHERE merchant = $2 AND user_id = $3
        `, [category, rawPattern, userId]);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Edit merchant error:", error);
      res.status(500).json({ error: "Failed to update merchant" });
    }
  });

  app.delete("/api/merchants/reset", requireAuth, async (req, res) => {
    try {
      const schema = z.object({ rawPattern: z.string().min(1) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid data" });
      }
      const userId = req.session.userId!;
      const pool = (db as any).$client as import('pg').Pool;
      // Verify the merchant exists in the user's transaction history before resetting
      const ownerCheck = await pool.query(`
        SELECT 1 FROM (
          SELECT pt.id FROM plaid_transactions pt
          JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
          JOIN plaid_items pi2 ON pi2.id = pa.plaid_item_id
          WHERE pi2.user_id = $1 AND pt.merchant_name = $2
          LIMIT 1
        ) AS sub
        UNION ALL
        SELECT 1 FROM (
          SELECT mt.id FROM mx_transactions mt
          JOIN mx_accounts ma ON ma.id = mt.mx_account_id
          JOIN mx_members mm ON mm.id = ma.mx_member_id
          WHERE mm.user_id = $1 AND mt.description = $2
          LIMIT 1
        ) AS sub2
        UNION ALL
        SELECT 1 FROM manual_transactions WHERE user_id = $1 AND merchant = $2 LIMIT 1
      `, [userId, parsed.data.rawPattern]);
      if (ownerCheck.rowCount === 0) {
        return res.status(403).json({ error: "Merchant not found in your transactions" });
      }
      // Remove user override — AI enrichment will re-apply on next sync
      await pool.query(`DELETE FROM merchant_enrichment WHERE raw_pattern = $1 AND source = 'user'`, [parsed.data.rawPattern]);
      res.json({ success: true });
    } catch (error) {
      console.error("Reset merchant error:", error);
      res.status(500).json({ error: "Failed to reset merchant" });
    }
  });

  // ── Financial Professional Access ─────────────────────────────────────────
  app.get("/api/financial-professional", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const professional = await storage.getFinancialProfessional(userId);
      res.json({ professional: professional || null });
    } catch (error) {
      console.error("Get financial professional error:", error);
      res.status(500).json({ error: "Failed to fetch financial professional access" });
    }
  });

  app.post("/api/financial-professional/grant", requireAuth, async (req, res) => {
    try {
      const parsed = grantFinancialAccessSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid data" });
      }
      const userId = req.session.userId!;
      const accessToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days

      const professional = await storage.grantFinancialAccess(
        userId,
        parsed.data.professionalEmail,
        parsed.data.professionalName,
        accessToken,
        expiresAt
      );

      // Send invitation email to the professional
      const user = await storage.getUser(userId);
      const appUrl = process.env.APP_URL || "https://app.budgetsmart.io";
      const fromEmail = process.env.POSTMARK_FROM_EMAIL || process.env.EMAIL_FROM || "noreply@budgetsmart.io";
      try {
        await sendEmailViaPostmark({
          from: fromEmail,
          to: parsed.data.professionalEmail,
          subject: "Financial Advisor Access — Budget Smart AI",
          html: `
            <p>Hello${parsed.data.professionalName ? ` ${parsed.data.professionalName}` : ""},</p>
            <p>${user?.firstName || user?.username || "A Budget Smart AI user"} has granted you read-only access to their financial account.</p>
            <p><strong>Access Link:</strong> <a href="${appUrl}/advisor-access?token=${accessToken}">${appUrl}/advisor-access?token=${accessToken}</a></p>
            <p>This access expires on <strong>${new Date(expiresAt).toLocaleDateString()}</strong>. It is read-only and can be revoked at any time.</p>
            <p>— The Budget Smart AI Team</p>
          `,
          text: `Hello${parsed.data.professionalName ? ` ${parsed.data.professionalName}` : ""},\n\n${user?.firstName || user?.username || "A Budget Smart AI user"} has granted you read-only access.\n\nAccess link: ${appUrl}/advisor-access?token=${accessToken}\n\nExpires: ${new Date(expiresAt).toLocaleDateString()}\n\nThis access is read-only and can be revoked at any time.`,
        });
      } catch (emailErr) {
        console.error("Failed to send financial professional invitation email:", emailErr);
        // Don't fail the request if email fails
      }

      res.status(201).json({ success: true, professional });
    } catch (error) {
      console.error("Grant financial access error:", error);
      res.status(500).json({ error: "Failed to grant financial professional access" });
    }
  });

  app.delete("/api/financial-professional/revoke", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      await storage.revokeFinancialAccess(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Revoke financial access error:", error);
      res.status(500).json({ error: "Failed to revoke financial professional access" });
    }
  });

  // Get invitation details by token (public - for accept page)
  app.get("/api/invitations/:token", async (req, res) => {
    try {
      const invitation = await storage.getInvitationByToken(req.params.token);

      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      // Check if expired
      if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
        await storage.updateInvitationStatus(invitation.id, "expired");
        return res.status(410).json({ error: "This invitation has expired" });
      }

      if (invitation.status !== "pending") {
        return res.status(410).json({ error: `This invitation has already been ${invitation.status}` });
      }

      // Get household info
      const household = await storage.getHousehold(invitation.householdId);
      const inviter = await storage.getUser(invitation.invitedBy);

      res.json({
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
        },
        household: household ? { id: household.id, name: household.name } : null,
        inviter: inviter ? {
          username: inviter.username,
          firstName: inviter.firstName,
          lastName: inviter.lastName,
        } : null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invitation" });
    }
  });

  // Get pending invitations for current user's email
  app.get("/api/invitations/pending", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);

      if (!user?.email) {
        return res.json([]);
      }

      const invitations = await storage.getInvitationsByEmail(user.email);
      const results = [];

      for (const invitation of invitations) {
        const household = await storage.getHousehold(invitation.householdId);
        const inviter = await storage.getUser(invitation.invitedBy);

        results.push({
          invitation: {
            id: invitation.id,
            token: invitation.token,
            role: invitation.role,
            expiresAt: invitation.expiresAt,
          },
          household: household ? { id: household.id, name: household.name } : null,
          inviter: inviter ? {
            username: inviter.username,
            firstName: inviter.firstName,
            lastName: inviter.lastName,
          } : null,
        });
      }

      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending invitations" });
    }
  });

  // Accept invitation
  app.post("/api/invitations/:token/accept", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const invitation = await storage.getInvitationByToken((req.params.token as string));

      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      if (invitation.status !== "pending") {
        return res.status(410).json({ error: `This invitation has already been ${invitation.status}` });
      }

      // Check if expired
      if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
        await storage.updateInvitationStatus(invitation.id, "expired");
        return res.status(410).json({ error: "This invitation has expired" });
      }

      // Check if user is already in a household
      const existingHousehold = await storage.getHouseholdByUserId(userId);
      if (existingHousehold) {
        return res.status(400).json({ error: "You are already a member of a household. Leave your current household first." });
      }

      // Add user to household
      await storage.addHouseholdMember(invitation.householdId, userId, invitation.role);

      // Mark invitation as accepted
      await storage.updateInvitationStatus(invitation.id, "accepted");

      // Update session with new household info
      await loadHouseholdIntoSession(req);

      res.json({
        success: true,
        householdId: req.session.householdId,
        householdRole: req.session.householdRole
      });
    } catch (error) {
      console.error("Accept invitation error:", error);
      res.status(500).json({ error: "Failed to accept invitation" });
    }
  });

  // Decline invitation
  app.post("/api/invitations/:token/decline", requireAuth, async (req, res) => {
    try {
      const invitation = await storage.getInvitationByToken((req.params.token as string));

      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      if (invitation.status !== "pending") {
        return res.status(410).json({ error: `This invitation has already been ${invitation.status}` });
      }

      await storage.updateInvitationStatus(invitation.id, "declined");

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to decline invitation" });
    }
  });

  // ============ END HOUSEHOLD API ============

  // Endpoint to manually trigger email check (useful for testing)
  app.post("/api/check-reminders", async (_req, res) => {
    try {
      const { checkAndSendReminders } = await import("./email");
      await checkAndSendReminders();
      res.json({ message: "Reminder check completed" });
    } catch (error) {
      res.status(500).json({ error: "Failed to check reminders" });
    }
  });

  // Authentication routes
  // User registration
  app.post("/api/auth/register", authRateLimiter, async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid registration data" });
      }

      const { username, password, email, firstName, lastName, trialEmailReminder, selectedPlanId } = parsed.data;

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already taken" });
      }

      // Check if email already exists
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already registered" });
      }

      const hashedPassword = await hashPassword(password);

      // Email signups require email verification and mandatory MFA
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        email,
        firstName,
        lastName,
        isApproved: true, // Approval is now via email verification
        plan: "free", // All new signups start on free plan — upgrade prompts shown inside app
        trialEmailReminder: trialEmailReminder ? "true" : "false",
        selectedPlanId: selectedPlanId || null,
        emailVerified: "false",
        mfaRequired: "true",
      });

      // Generate verification token and send email
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

      await storage.setEmailVerificationToken(user.id, verificationToken, expiry);
      await sendEmailVerification(email, firstName, verificationToken);

      // Return response indicating email verification is required
      auditLogFromRequest(req, {
        eventType: "user.created",
        eventCategory: "user",
        actorId: user.id,
        action: "register",
        outcome: "success",
        metadata: { username, email },
      });
      res.json({
        success: true,
        emailVerificationRequired: true,
        email: email,
        message: "Please check your email to verify your account."
      });
    } catch (error: any) {
      console.error("Registration error:", error);

      // PostgreSQL error code 42703 — column does not exist (schema mismatch)
      if (error?.code === "42703") {
        console.error("SCHEMA MISMATCH during registration:", error.message);
        return res.status(500).json({
          error: "Registration temporarily unavailable. Please try again in a moment."
        });
      }

      // PostgreSQL error code 23505 — unique constraint violation (duplicate email/username)
      if (error?.code === "23505") {
        return res.status(400).json({
          error: "An account with this email already exists."
        });
      }

      // PostgreSQL error code 23502 — not-null constraint violation
      if (error?.code === "23502") {
        return res.status(400).json({
          error: "Please fill in all required fields."
        });
      }

      // Generic fallback — never expose raw DB errors to the client
      res.status(500).json({ error: "Registration failed. Please try again." });
    }
  });

  // Email verification endpoint
  app.get("/api/auth/verify-email/:token", async (req, res) => {
    try {
      const token = req.params.token as string;

      const user = await storage.getUserByVerificationToken(token);
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired verification token" });
      }

      // Check expiry
      if (user.emailVerificationExpiry && new Date(user.emailVerificationExpiry) < new Date()) {
        return res.status(400).json({ error: "Verification token has expired. Please request a new one." });
      }

      // Mark email as verified
      await storage.verifyUserEmail(user.id);

      // Send welcome email asynchronously (fire-and-forget)
      if (user.email) {
        sendWelcomeEmail(user.email, user.firstName || user.username)
          .catch(err => console.error('Failed to send welcome email after verification:', err));
      }

      res.json({
        success: true,
        message: "Email verified successfully",
        mfaSetupRequired: user.mfaRequired === "true" && user.mfaEnabled !== "true"
      });
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ error: "Failed to verify email" });
    }
  });

  // Resend verification email
  app.post("/api/auth/resend-verification", authRateLimiter, async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal if email exists for security
        return res.json({ success: true, message: "If an account exists with this email, a verification link has been sent." });
      }

      if (user.emailVerified === "true") {
        return res.status(400).json({ error: "Email is already verified" });
      }

      // Generate new token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await storage.setEmailVerificationToken(user.id, verificationToken, expiry);
      await sendEmailVerification(user.email!, user.firstName || user.username, verificationToken);

      res.json({ success: true, message: "Verification email sent" });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ error: "Failed to resend verification email" });
    }
  });

  // Demo login endpoint - logs in as demo user without password
  app.post("/api/auth/demo-login", authRateLimiter, async (req, res) => {
    try {
      const demoUser = await storage.getUserByUsername("demo");
      
      if (!demoUser || demoUser.isDemo !== "true") {
        return res.status(404).json({ error: "Demo account not available" });
      }

      // Regenerate session to prevent session fixation for demo user
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regenerate error:", err);
          return res.status(500).json({ error: "Session error" });
        }
        req.session.userId = demoUser.id;
        req.session.username = demoUser.username;
        req.session.isAdmin = false; // Never grant admin to demo
        req.session.mfaVerified = true;
        req.session.pendingMfa = false;
        (req.session as any).isDemo = true;

        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.status(500).json({ error: "Session save failed" });
          }
          res.json({
            success: true,
            username: demoUser.username,
            isAdmin: false,
            isDemo: true
          });
        });
      });
    } catch (error) {
      console.error("Demo login error:", error);
      res.status(500).json({ error: "Demo login failed" });
    }
  });

  app.post("/api/auth/login", authRateLimiter, async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid login data" });
      }

      const { username, password } = parsed.data;
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        auditLogFromRequest(req, {
          eventType: "auth.login_failed",
          eventCategory: "auth",
          actorId: null,
          action: "login",
          outcome: "failure",
          metadata: { username },
          errorMessage: "User not found",
        });
        return res.status(401).json({ error: "Invalid username or password" });
      }

      // Check account lockout before validating password
      const lockCheck = await pool.query(
        `SELECT failed_login_attempts, locked_until FROM users WHERE id = $1`,
        [user.id]
      );
      const lockRow = lockCheck.rows?.[0];
      if (lockRow?.locked_until && new Date(lockRow.locked_until) > new Date()) {
        auditLogFromRequest(req, {
          eventType: "auth.login_failed",
          eventCategory: "auth",
          actorId: user.id,
          action: "login",
          outcome: "blocked",
          metadata: { username },
          errorMessage: "Account locked",
        });
        // FIX 1: Return remaining lockout time
        const lockoutExpiresAt = new Date(lockRow.locked_until).getTime();
        const remainingMs = lockoutExpiresAt - Date.now();
        const remainingMinutes = Math.ceil(remainingMs / 1000 / 60);
        return res.status(423).json({
          error: "Account temporarily locked",
          code: "ACCOUNT_LOCKED",
          remainingMinutes,
          remainingSeconds: Math.ceil(remainingMs / 1000),
          resetPasswordUrl: "/forgot-password",
        });
      }

      const validPassword = await verifyPassword(password, user.password!);
      if (!validPassword) {
        // Increment failed attempts and lock if >= MAX_FAILED_LOGIN_ATTEMPTS
        const attempts = (lockRow?.failed_login_attempts ?? 0) + 1;
        if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
          await pool.query(
            `UPDATE users SET failed_login_attempts = $1, locked_until = NOW() + (INTERVAL '1 minute' * $3) WHERE id = $2`,
            [attempts, user.id, LOCKOUT_DURATION_MINUTES]
          );
          auditLogFromRequest(req, {
            eventType: "auth.account_locked",
            eventCategory: "auth",
            actorId: user.id,
            action: "account_locked",
            outcome: "blocked",
            metadata: { username, attempts },
          });
          // FIX 2: Send security notification email on lockout
          const fromEmail = process.env.ALERT_EMAIL_FROM;
          if (fromEmail && isEmailConfigured() && user.email) {
            const clientIpForEmail = getClientIp(req);
            const lockoutTime = new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour12: true });
            const firstName = user.firstName || user.username;
            const appUrl = process.env.APP_URL || "https://app.budgetsmart.io";
            sendEmailViaPostmark({
              from: fromEmail,
              to: user.email,
              subject: "Security Alert — BudgetSmart Account Locked",
              html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a1a">
  <div style="text-align:center;margin-bottom:24px">
    <div style="display:inline-block;background:#fef3c7;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:32px;text-align:center">🔒</div>
  </div>
  <h2 style="color:#d97706;margin-bottom:8px">Security Alert — Account Locked</h2>
  <p>Hi ${firstName},</p>
  <p>We noticed multiple failed login attempts on your BudgetSmart account and have temporarily locked it for your security.</p>
  <table style="background:#f9fafb;border-radius:8px;padding:16px;width:100%;margin:16px 0;border-collapse:collapse">
    <tr><td style="padding:4px 0;color:#6b7280;font-size:14px">Account:</td><td style="padding:4px 0;font-size:14px"><strong>${user.email}</strong></td></tr>
    <tr><td style="padding:4px 0;color:#6b7280;font-size:14px">Time:</td><td style="padding:4px 0;font-size:14px">${lockoutTime} EST</td></tr>
    <tr><td style="padding:4px 0;color:#6b7280;font-size:14px">Location:</td><td style="padding:4px 0;font-size:14px">${clientIpForEmail || "Unknown"}</td></tr>
  </table>
  <p>Your account will automatically unlock in <strong>${LOCKOUT_DURATION_MINUTES} minutes</strong>. If this was you, no action needed.</p>
  <p>If this wasn't you, reset your password immediately:</p>
  <div style="text-align:center;margin:24px 0">
    <a href="${appUrl}/forgot-password" style="background:#d97706;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">Reset Password →</a>
  </div>
  <p style="color:#6b7280;font-size:13px">If you need help, contact <a href="mailto:support@budgetsmart.io">support@budgetsmart.io</a></p>
  <p style="color:#6b7280;font-size:13px">The BudgetSmart Security Team</p>
</div>`,
              text: `Security Alert — BudgetSmart Account Locked\n\nHi ${firstName},\n\nWe noticed multiple failed login attempts on your BudgetSmart account and have temporarily locked it for your security.\n\nAccount: ${user.email}\nTime: ${lockoutTime} EST\nLocation: ${clientIpForEmail || "Unknown"}\n\nYour account will automatically unlock in ${LOCKOUT_DURATION_MINUTES} minutes. If this was you, no action needed.\n\nIf this wasn't you, reset your password immediately:\n${appUrl}/forgot-password\n\nIf you need help, contact support@budgetsmart.io\n\nThe BudgetSmart Security Team`,
            }).catch(err => console.error("[Security Email] Failed to send lockout notification:", err));
          }
          // FIX 1: Return lockout response with remaining time
          const remainingMs = LOCKOUT_DURATION_MINUTES * 60 * 1000;
          return res.status(423).json({
            error: "Account temporarily locked",
            code: "ACCOUNT_LOCKED",
            remainingMinutes: LOCKOUT_DURATION_MINUTES,
            remainingSeconds: LOCKOUT_DURATION_MINUTES * 60,
            resetPasswordUrl: "/forgot-password",
          });
        } else {
          await pool.query(
            `UPDATE users SET failed_login_attempts = $1 WHERE id = $2`,
            [attempts, user.id]
          );
        }
        auditLogFromRequest(req, {
          eventType: "auth.login_failed",
          eventCategory: "auth",
          actorId: user.id,
          action: "login",
          outcome: "failure",
          metadata: { username },
          errorMessage: "Invalid password",
        });
        // FIX 4: Progressive attempt warnings
        const attemptsLeft = MAX_FAILED_LOGIN_ATTEMPTS - attempts;
        if (attemptsLeft === 2) {
          return res.status(401).json({
            error: `Incorrect password. 2 attempts remaining before account is temporarily locked.`,
            attemptsRemaining: 2,
          });
        } else if (attemptsLeft === 1) {
          return res.status(401).json({
            error: `Incorrect password. 1 attempt remaining before account is temporarily locked.`,
            attemptsRemaining: 1,
          });
        }
        return res.status(401).json({ error: "Invalid username or password" });
      }

      // Reset failed attempts on successful password check
      const clientIp = getClientIp(req);
      await pool.query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(), last_login_ip = $1 WHERE id = $2`,
        [clientIp, user.id]
      );

      // Check if account is approved
      if (user.isApproved !== "true") {
        return res.status(403).json({ error: "Your account is pending approval. Please wait for admin approval." });
      }

      // Check email verification (only for non-Google OAuth users)
      if (!user.googleId && user.emailVerified !== "true") {
        return res.status(403).json({
          error: "Please verify your email before logging in",
          emailVerificationRequired: true,
          email: user.email
        });
      }

      // Check if MFA setup is required (for email signups that haven't set up MFA yet)
      if (user.mfaRequired === "true" && user.mfaEnabled !== "true") {
        // Regenerate session to prevent session fixation, then partially authenticate
        return req.session.regenerate((regenErr) => {
          if (regenErr) {
            console.error("Session regenerate error:", regenErr);
            return res.status(500).json({ error: "Session error" });
          }
          req.session.userId = user.id;
          req.session.username = user.username;
          req.session.isAdmin = user.isAdmin === "true";
          (req.session as any).mfaSetupRequired = true;
          req.session.mfaVerified = false;
          req.session.pendingMfa = false;

          req.session.save((err) => {
            if (err) {
              console.error("Session save error:", err);
              return res.status(500).json({ error: "Session save failed" });
            }
            res.json({
              mfaSetupRequired: true,
              message: "Please set up two-factor authentication to continue"
            });
          });
        });
      }

      if (user.mfaEnabled === "true" && user.mfaSecret) {
        // Regenerate session to prevent session fixation, then set pending MFA
        return req.session.regenerate((regenErr) => {
          if (regenErr) {
            console.error("Session regenerate error:", regenErr);
            return res.status(500).json({ error: "Session error" });
          }
          req.session.userId = user.id;
          req.session.username = user.username;
          req.session.isAdmin = user.isAdmin === "true";
          req.session.pendingMfa = true;
          req.session.mfaVerified = false;
          req.session.save((err) => {
            if (err) {
              console.error("Session save error:", err);
              return res.status(500).json({ error: "Session save failed" });
            }
            res.json({ mfaRequired: true });
          });
        });
      }

      // Regenerate session to prevent session fixation before setting authenticated state
      req.session.regenerate(async (regenErr) => {
        if (regenErr) {
          console.error("Session regenerate error:", regenErr);
          return res.status(500).json({ error: "Session error" });
        }
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.isAdmin = user.isAdmin === "true";
        req.session.mfaVerified = true;
        req.session.pendingMfa = false;

        // Load household info into session
        try {
          await loadHouseholdIntoSession(req);
        } catch (householdErr) {
          console.error("Failed to load household into session:", householdErr);
          // Continue login even if household info fails to load
        }

        req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            return res.status(500).json({ error: "Session save failed" });
          }
          auditLogFromRequest(req, {
            eventType: "auth.login",
            eventCategory: "auth",
            actorId: user.id,
            action: "login",
            outcome: "success",
            metadata: { username: user.username, isAdmin: user.isAdmin === "true" },
          });
          res.json({
            success: true,
            username: user.username,
            isAdmin: user.isAdmin === "true",
            householdId: req.session.householdId,
            householdRole: req.session.householdRole
          });
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/verify-mfa", authRateLimiter, async (req, res) => {
    try {
      const { mfaCode } = req.body;
      
      if (!req.session.userId || !req.session.pendingMfa) {
        return res.status(401).json({ error: "No pending MFA verification" });
      }

      const user = await storage.getUser(req.session.userId);
      if (!user || !user.mfaSecret) {
        return res.status(401).json({ error: "MFA not configured" });
      }

      const isValid = verifyMfaToken(user.mfaSecret, mfaCode);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid MFA code" });
      }

      req.session.mfaVerified = true;
      req.session.pendingMfa = false;

      // Load household info into session
      await loadHouseholdIntoSession(req);

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ error: "Session save failed" });
        }
        res.json({
          success: true,
          householdId: req.session.householdId,
          householdRole: req.session.householdRole
        });
      });
    } catch (error) {
      console.error("MFA verification error:", error);
      res.status(500).json({ error: "MFA verification failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    const userId = req.session?.userId ?? null;
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      auditLogFromRequest(req, {
        eventType: "auth.logout",
        eventCategory: "auth",
        actorId: userId,
        action: "logout",
        outcome: "success",
      });
      res.json({ success: true });
    });
  });

  // Change password endpoint
  app.post("/api/auth/change-password", authRateLimiter, requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body;

      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({ error: "All fields are required" });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: "New password and confirmation do not match" });
      }

      // Password complexity validation
      if (newPassword.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      if (!/[A-Z]/.test(newPassword)) {
        return res.status(400).json({ error: "Password must contain at least one uppercase letter" });
      }
      if (!/[a-z]/.test(newPassword)) {
        return res.status(400).json({ error: "Password must contain at least one lowercase letter" });
      }
      if (!/[0-9]/.test(newPassword)) {
        return res.status(400).json({ error: "Password must contain at least one number" });
      }
      if (!/[^A-Za-z0-9]/.test(newPassword)) {
        return res.status(400).json({ error: "Password must contain at least one special character" });
      }

      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Google OAuth users cannot change password here
      if (user.googleId && !user.password) {
        return res.status(400).json({ error: "Your password is managed by Google. Visit your Google Account settings to change it." });
      }

      // Verify current password
      const validCurrent = await verifyPassword(currentPassword, user.password!);
      if (!validCurrent) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }

      // New password must differ from current
      const sameAsCurrent = await verifyPassword(newPassword, user.password!);
      if (sameAsCurrent) {
        return res.status(400).json({ error: "New password must be different from your current password" });
      }

      // Hash new password and update
      const newHash = await hashPassword(newPassword);
      await storage.updateUser(userId, { password: newHash });

      // Invalidate all OTHER sessions for this user (keep current)
      try {
        const pool = (db as any).$client as import('pg').Pool;
        const currentSid = req.sessionID;
        await pool.query(
          `DELETE FROM session WHERE sid != $1 AND sess::jsonb -> 'userId' = $2::jsonb`,
          [currentSid, JSON.stringify(userId)]
        );
      } catch (sessionErr) {
        // Non-fatal: log but don't fail the request
        console.error("Failed to invalidate other sessions:", sessionErr);
      }

      console.log(`[audit] auth.password_change userId=${userId}`);

      auditLogFromRequest(req, {
        eventType: "auth.password_change",
        eventCategory: "auth",
        actorId: userId,
        action: "change_password",
        outcome: "success",
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  // Google OAuth routes
  app.get("/api/auth/google", passport.authenticate("google", {
    scope: ["profile", "email"]
  }));

  app.get("/api/auth/google/callback",
    passport.authenticate("google", {
      failureRedirect: "/?error=google_auth_failed",
      session: false
    }),
    async (req, res) => {
      try {
        const user = req.user as any;
        if (!user) {
          return res.redirect("/?error=google_auth_failed");
        }

        // Set up the session manually
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.isAdmin = user.isAdmin === "true";
        req.session.pendingMfa = false;
        req.session.mfaVerified = true;

        // Load household info
        await loadHouseholdIntoSession(req);

        // Save session before redirecting
        req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            return res.redirect("/?error=google_auth_failed");
          }
          // Redirect to the app
          res.redirect("/");
        });
      } catch (error) {
        console.error("Google OAuth callback error:", error);
        res.redirect("/?error=google_auth_failed");
      }
    }
  );

  // Check if Google OAuth is configured
  app.get("/api/auth/providers", (req, res) => {
    res.json({
      google: !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
    });
  });

  // Delete account and all associated data
  app.delete("/api/auth/account", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;

      // Delete all user data in order (respecting foreign key constraints)
      // 1. Delete manual transactions first (they reference manual accounts)
      await storage.deleteAllManualTransactionsByUser(userId);

      // 2. Delete manual accounts
      await storage.deleteAllManualAccountsByUser(userId);

      // 3. Delete plaid transactions (they reference plaid accounts)
      await storage.deleteAllPlaidTransactionsByUser(userId);

      // 4. Delete plaid accounts (they reference plaid items)
      await storage.deleteAllPlaidAccountsByUser(userId);

      // 5. Delete plaid items
      await storage.deleteAllPlaidItemsByUser(userId);

      // 6. Delete reconciliation rules
      await storage.deleteAllReconciliationRulesByUser(userId);

      // 7. Delete expenses
      await storage.deleteAllExpensesByUser(userId);

      // 8. Delete bills
      await storage.deleteAllBillsByUser(userId);

      // 9. Delete incomes
      await storage.deleteAllIncomesByUser(userId);

      // 10. Delete budgets
      await storage.deleteAllBudgetsByUser(userId);

      // 11. Delete savings goals
      await storage.deleteAllSavingsGoalsByUser(userId);

      // 12. Delete categories
      await storage.deleteAllCategoriesByUser(userId);

      // 13. Delete notifications
      await storage.deleteAllNotificationsByUser(userId);

      // 14. Delete household memberships
      await storage.deleteAllHouseholdMembersByUser(userId);

      // 15. Delete households owned by user
      await storage.deleteAllHouseholdsByUser(userId);

      // 16. Delete invitation codes created by user
      await storage.deleteAllInvitationCodesByUser(userId);

      // 17. Delete notification settings
      await storage.deleteAllNotificationSettingsByUser(userId);

      // 18. Delete recurring expenses (subscriptions)
      await storage.deleteAllRecurringExpensesByUser(userId);

      // 19. Delete sync schedules
      await storage.deleteAllSyncSchedulesByUser(userId);

      // 20. Delete budget alerts
      await storage.deleteAllBudgetAlertsByUser(userId);

      // 21. Delete spending alerts
      await storage.deleteAllSpendingAlertsByUser(userId);

      // 22. Delete onboarding analysis data
      await storage.deleteAllOnboardingAnalysisByUser(userId);

      // 23. Delete referral codes and referrals
      await storage.deleteAllReferralsByUser(userId);
      await storage.deleteAllReferralCodesByUser(userId);

      // 23. Finally delete the user
      await storage.deleteUser(userId);

      // Destroy the session
      auditLogFromRequest(req, {
        eventType: "data.account_deleted",
        eventCategory: "data",
        actorId: userId,
        action: "delete_account",
        outcome: "success",
      });
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destroy error after account deletion:", err);
        }
        res.json({ success: true, message: "Account and all data deleted successfully" });
      });
    } catch (error) {
      console.error("Account deletion error:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/user/delete-account — GDPR / privacy-compliant soft-delete
  // Verifies password, cancels Stripe subscription, disconnects all bank
  // accounts, anonymises the user record, wipes sessions/alerts/notifications/
  // vault docs, then sends a confirmation email.
  // ──────────────────────────────────────────────────────────────────────────
  app.post("/api/user/delete-account", requireAuth, sensitiveApiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { password, reason } = req.body as { password?: string; reason?: string };

      if (!password) {
        return res.status(400).json({ error: "Password is required to delete your account" });
      }

      // 1. Verify password
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const passwordValid = await verifyPassword(password, user.password!);
      if (!passwordValid) {
        return res.status(401).json({ error: "Incorrect password" });
      }

      // 2. Audit log
      auditLogFromRequest(req, {
        eventType: "data.account_deleted",
        eventCategory: "data",
        actorId: userId,
        action: "delete_account",
        outcome: "success",
        metadata: { reason: reason || null },
      });

      // 3. Cancel active Stripe subscription (best-effort)
      if (user.stripeSubscriptionId) {
        try {
          const { cancelSubscription } = await import("./stripe");
          await cancelSubscription(user.stripeSubscriptionId, true);
        } catch (stripeErr) {
          console.warn("[DeleteAccount] Stripe cancellation failed (continuing):", stripeErr);
        }
      }

      // 4. Disconnect all Plaid bank accounts (best-effort)
      try {
        const plaidItems = await storage.getPlaidItems(userId);
        const { plaidClient } = await import("./plaid");
        for (const item of plaidItems) {
          try {
            await plaidClient.itemRemove({ access_token: decrypt(item.accessToken) });
          } catch {
            // non-critical
          }
        }
      } catch (plaidErr) {
        console.warn("[DeleteAccount] Plaid disconnect failed (continuing):", plaidErr);
      }

      // 4b. Disconnect all MX bank connections (best-effort)
      if (user.mxUserGuid) {
        try {
          const mxMembers = await storage.getMxMembers(userId);
          const { deleteMember: deleteMxMember } = await import("./mx");
          for (const member of mxMembers) {
            try {
              await deleteMxMember(user.mxUserGuid, member.memberGuid);
            } catch {
              // non-critical
            }
          }
        } catch (mxErr) {
          console.warn("[DeleteAccount] MX disconnect failed (continuing):", mxErr);
        }
      }

      // 5. Anonymise user record (soft-delete — keeps row for FK integrity)
      // Capture email BEFORE anonymization so confirmation email is sent to correct address
      const confirmEmail = user.email;
      await pool.query(
        `UPDATE users SET
           email      = 'deleted_' || id || '@deleted.local',
           username   = 'deleted_' || id,
           first_name = 'Deleted',
           last_name  = 'User',
           password   = '',
           phone      = NULL,
           phone_enc  = NULL,
           google_id  = NULL,
           mx_user_guid = NULL,
           is_deleted = true,
           deleted_at = NOW()
         WHERE id = $1`,
        [userId],
      );

      // 6. Destroy all sessions for this user (best-effort via session table)
      try {
        await pool.query(
          `DELETE FROM session WHERE sess->>'userId' = $1`,
          [userId],
        );
      } catch {
        // session table may use a different JSON shape — non-critical
      }

      // 7. Delete anomaly alerts, notifications, vault documents
      try {
        await pool.query(`DELETE FROM anomaly_alerts WHERE user_id = $1`, [userId]);
      } catch { /* table may not exist */ }
      await storage.deleteAllNotificationsByUser(userId);
      try {
        await pool.query(`DELETE FROM vault_documents WHERE user_id = $1`, [userId]);
      } catch { /* table may not exist */ }

      // 8. Transactions are retained for 7-year legal requirement — not deleted.

      // 9. Send confirmation email (best-effort — use email captured before anonymization)
      if (confirmEmail && process.env.POSTMARK_USERNAME && process.env.ALERT_EMAIL_FROM) {
        sendEmailViaPostmark({
          from: process.env.ALERT_EMAIL_FROM,
          to: confirmEmail,
          subject: "Your BudgetSmart account has been deleted",
          text: `Hi ${user.firstName || "there"},\n\nYour BudgetSmart account has been permanently deleted as requested.\n\nAll personal information has been removed. Transaction history is retained for 7 years as required by law.\n\nIf you did not request this deletion, please contact support immediately.\n\nBudgetSmart Team`,
        }).catch((e) => console.warn("[DeleteAccount] Confirmation email failed:", e));
      }

      // Destroy the current session
      req.session.destroy((err) => {
        if (err) console.error("[DeleteAccount] Session destroy error:", err);
        res.json({ success: true, message: "Account deleted. Goodbye!" });
      });
    } catch (error: any) {
      console.error("[DeleteAccount] Error:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  app.get("/api/auth/session", async (req, res) => {
    // Prevent the browser from caching this response.  A stale cached
    // "authenticated:false" would block the user from entering the app
    // even after a successful login (manifests as 304 responses right after
    // POST /api/auth/login returns 200).
    res.set("Cache-Control", "no-store");

    // Check if user needs mandatory MFA setup
    if (req.session.userId && (req.session as any).mfaSetupRequired) {
      const user = await storage.getUser(req.session.userId);
      return res.json({
        authenticated: false,
        mfaSetupRequired: true,
        username: user?.username || req.session.username,
        email: user?.email || null
      });
    }

    if (req.session.userId && (!req.session.pendingMfa || req.session.mfaVerified)) {
      const user = await storage.getUser(req.session.userId);
      res.json({
        authenticated: true,
        userId: req.session.userId,
        username: user?.username || req.session.username,
        email: user?.email || null,
        firstName: user?.firstName || null,
        lastName: user?.lastName || null,
        phone: user?.phone || null,
        country: user?.country || "US",
        mfaEnabled: user?.mfaEnabled === "true",
        isAdmin: user?.isAdmin === "true",
        isDemo: user?.isDemo === "true",
        onboardingComplete: user?.onboardingComplete === "true",
        householdId: req.session.householdId || null,
        householdRole: req.session.householdRole || null,
        displayName: user?.displayName || null,
        birthday: user?.birthday || null,
        timezone: user?.timezone || "America/Toronto",
        avatarUrl: user?.avatarUrl || null,
        emailVerified: user?.emailVerified === "true",
        isGoogleUser: !!(user?.googleId),
      });
    } else if (req.session.userId && req.session.pendingMfa && !req.session.mfaVerified) {
      res.json({ authenticated: false, mfaRequired: true });
    } else {
      res.json({ authenticated: false });
    }
  });

  // Profile update route
  app.patch("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid profile data" });
      }

      const updates = parsed.data;
      
      // Check if email is being changed and already exists
      if (updates.email) {
        const existingEmail = await storage.getUserByEmail(updates.email);
        if (existingEmail && existingEmail.id !== req.session.userId) {
          return res.status(400).json({ error: "Email already registered" });
        }
      }

      // Validate birthday is a valid past date (not future) using date-only comparison
      if (updates.birthday) {
        const bdParts = updates.birthday.split("-");
        if (bdParts.length !== 3 || bdParts.some((p) => isNaN(parseInt(p)))) {
          return res.status(400).json({ error: "Invalid birthday date format (expected YYYY-MM-DD)" });
        }
        const today = new Date();
        const bdYear = parseInt(bdParts[0]);
        const bdMonth = parseInt(bdParts[1]);
        const bdDay = parseInt(bdParts[2]);
        const todayYear = today.getFullYear();
        const todayMonth = today.getMonth() + 1;
        const todayDay = today.getDate();
        const isFuture =
          bdYear > todayYear ||
          (bdYear === todayYear && bdMonth > todayMonth) ||
          (bdYear === todayYear && bdMonth === todayMonth && bdDay > todayDay);
        if (isFuture) {
          return res.status(400).json({ error: "Birthday cannot be in the future" });
        }
      }

      const updatedUser = await storage.updateUser(req.session.userId!, updates);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        success: true,
        username: updatedUser.username,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        phone: updatedUser.phone,
        displayName: updatedUser.displayName || null,
        birthday: updatedUser.birthday || null,
        timezone: updatedUser.timezone || "America/Toronto",
        avatarUrl: updatedUser.avatarUrl || null,
      });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // ── Avatar helpers (using top-level imports) ──────────────────────────────
  const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req: any, file: any, cb: any) => {
      const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error("Only image files (jpg/png/webp/gif) are allowed"));
    },
  });

  function getAvatarR2Client(): AvatarS3Client {
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.R2_TOKEN_VALUE;
    const rawEndpoint = process.env.R2_ENDPOINT;
    if (!accessKeyId || !secretAccessKey || !rawEndpoint) {
      throw new Error("R2 storage is not configured.");
    }
    const stripped = rawEndpoint.replace(/^["']+|["']+$/g, "");
    let endpoint: string;
    try { endpoint = new URL(stripped).origin; } catch { endpoint = stripped; }
    return new AvatarS3Client({ region: "auto", endpoint, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  }

  function getAvatarPublicUrl(fileKey: string): string {
    const raw = process.env.R2_PUBLIC_URL;
    if (raw) {
      const base = raw.replace(/^["']+|["']+$/g, "").replace(/\/$/, "");
      return `${base}/${fileKey}`;
    }
    return `/api/user/avatar/${fileKey}`;
  }

  // Avatar upload route
  app.post("/api/user/avatar", requireAuth, avatarUpload.single("avatar"), async (req: any, res: any) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Resize to 256x256 webp using sharp
      const resized = await sharp(req.file.buffer)
        .resize(256, 256, { fit: "cover" })
        .webp({ quality: 85 })
        .toBuffer();

      const fileKey = `avatars/${req.session.userId}.webp`;
      const bucket = process.env.R2_BUCKET_NAME;
      if (!bucket) {
        return res.status(500).json({ error: "R2 storage not configured" });
      }

      await getAvatarR2Client().send(new AvatarPutObjectCommand({
        Bucket: bucket,
        Key: fileKey,
        Body: resized,
        ContentType: "image/webp",
        CacheControl: "public, max-age=86400",
      }));

      const avatarUrl = getAvatarPublicUrl(fileKey);
      await storage.updateUser(req.session.userId!, { avatarUrl });

      res.json({ avatarUrl });
    } catch (error: any) {
      console.error("Avatar upload error:", error);
      res.status(500).json({ error: "Failed to upload avatar" });
    }
  });

  app.delete("/api/user/avatar", requireAuth, async (req: any, res: any) => {
    try {
      const fileKey = `avatars/${req.session.userId}.webp`;
      const bucket = process.env.R2_BUCKET_NAME;
      if (bucket) {
        try {
          await getAvatarR2Client().send(new AvatarDeleteObjectCommand({ Bucket: bucket, Key: fileKey }));
        } catch {
          // Ignore R2 deletion errors (file may not exist)
        }
      }
      await storage.updateUser(req.session.userId!, { avatarUrl: null });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Avatar delete error:", error);
      res.status(500).json({ error: "Failed to remove avatar" });
    }
  });

  // 2FA status endpoint
  app.get("/api/auth/2fa/status", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({
        enabled: user.mfaEnabled === "true",
        hasBackupCodes: Array.isArray(user.mfaBackupCodes) && user.mfaBackupCodes.length > 0,
      });
    } catch (error) {
      console.error("2FA status error:", error);
      res.status(500).json({ error: "Failed to get 2FA status" });
    }
  });

  // MFA setup routes
  app.get("/api/auth/mfa/setup", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const secret = generateMfaSecretKey();
      const qrCode = await generateMfaQrCode(user.email || user.username, secret);

      // Store secret temporarily in session until verified
      (req.session as any).pendingMfaSecret = secret;

      // Explicitly save session so the secret persists across requests
      req.session.save((err) => {
        if (err) {
          console.error("Session save error in MFA setup:", err);
          return res.status(500).json({ error: "Session save failed" });
        }
        res.json({
          qrCode,
          secret,
          manualEntryKey: secret,
          mfaEnabled: user.mfaEnabled === "true",
        });
      });
    } catch (error) {
      console.error("MFA setup error:", error);
      res.status(500).json({ error: "MFA setup failed" });
    }
  });

  app.post("/api/auth/mfa/enable", authRateLimiter, requireAuth, async (req, res) => {
    try {
      const { code } = req.body;
      const pendingSecret = (req.session as any).pendingMfaSecret;

      if (!pendingSecret) {
        return res.status(400).json({ error: "No pending MFA setup. Please start setup again." });
      }

      const isValid = verifyMfaToken(pendingSecret, code);
      if (!isValid) {
        return res.status(400).json({ error: "Invalid code. Please try again." });
      }

      // Generate backup codes on successful verification
      const backupCodes = generateBackupCodes();
      await storage.updateUserMfa(req.session.userId!, pendingSecret, true, backupCodes);
      delete (req.session as any).pendingMfaSecret;

      // If this was a mandatory MFA setup, grant full access now
      if ((req.session as any).mfaSetupRequired) {
        delete (req.session as any).mfaSetupRequired;
        req.session.mfaVerified = true;
        await loadHouseholdIntoSession(req);
      }

      req.session.save((err) => {
        if (err) {
          console.error("Session save error after MFA enable:", err);
          return res.status(500).json({ error: "Session save failed" });
        }
        res.json({ success: true, backupCodes });
      });
    } catch (error) {
      console.error("MFA enable error:", error);
      res.status(500).json({ error: "Failed to enable MFA" });
    }
  });

  app.post("/api/auth/mfa/disable", authRateLimiter, requireAuth, async (req, res) => {
    try {
      const { code, password } = req.body;
      const user = await storage.getUser(req.session.userId!);

      if (!user || !user.mfaSecret) {
        return res.status(400).json({ error: "MFA not enabled" });
      }

      // Accept either a current TOTP code or the account password
      let verified = false;
      if (code) {
        verified = verifyMfaToken(user.mfaSecret, code);
      } else if (password && user.password) {
        verified = await verifyPassword(password, user.password);
      }

      if (!verified) {
        return res.status(401).json({ error: "Invalid verification code" });
      }

      await storage.updateUserMfa(req.session.userId!, "", false);
      res.json({ success: true, message: "MFA disabled successfully" });
    } catch (error) {
      console.error("MFA disable error:", error);
      res.status(500).json({ error: "Failed to disable MFA" });
    }
  });

  // Admin: User Management Routes
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getUsers();
      // Return users without sensitive data
      const safeUsers = users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        country: user.country,
        displayName: user.displayName,
        birthday: user.birthday ?? null,
        timezone: user.timezone ?? null,
        avatarUrl: user.avatarUrl,
        householdName: user.householdName ?? null,
        addressLine1: user.addressLine1 ?? null,
        city: user.city ?? null,
        provinceState: user.provinceState ?? null,
        postalCode: user.postalCode ?? null,
        isAdmin: user.isAdmin === "true",
        isApproved: user.isApproved === "true",
        mfaEnabled: user.mfaEnabled === "true",
        isDeleted: user.isDeleted ?? false,
        createdAt: user.createdAt,
        subscriptionPlanId: user.subscriptionPlanId,
        subscriptionStatus: user.subscriptionStatus,
        plan: user.plan ?? null,
        stripeSubscriptionId: user.stripeSubscriptionId ?? null,
        lockedUntil: user.lockedUntil ?? null,
      }));
      auditLogFromRequest(req, {
        eventType: "admin.user_viewed",
        eventCategory: "admin",
        actorId: req.session.userId,
        actorType: "admin",
        action: "list_users",
        outcome: "success",
        metadata: { count: safeUsers.length },
      });
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid user data", details: parsed.error });
      }

      const { username, password, isAdmin, isApproved } = parsed.data;

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({ 
        username, 
        password: hashedPassword, 
        isAdmin, 
        isApproved: isApproved !== false  // Default to true if not specified
      });

      res.status(201).json({
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: user.isAdmin === "true",
        isApproved: user.isApproved === "true",
        mfaEnabled: user.mfaEnabled === "true",
        createdAt: user.createdAt,
      });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const userId = req.params.id as string;
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid user data", details: parsed.error });
      }

      const { username, password, isAdmin, isApproved, subscriptionPlanId, subscriptionStatus,
              email, firstName, lastName, phone, displayName, birthday, timezone, country } = parsed.data;

      // If changing username, check it doesn't already exist
      if (username) {
        const existingUser = await storage.getUserByUsername(username);
        if (existingUser && existingUser.id !== userId) {
          return res.status(400).json({ error: "Username already exists" });
        }
      }

      const updates: Parameters<typeof storage.updateUser>[1] = {};
      if (username) updates.username = username;
      if (password) updates.password = await hashPassword(password);
      if (isAdmin !== undefined) updates.isAdmin = isAdmin;
      if (isApproved !== undefined) updates.isApproved = isApproved;
      if (email !== undefined) updates.email = email;
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (phone !== undefined) updates.phone = phone;
      if (displayName !== undefined) updates.displayName = displayName;
      if (birthday !== undefined) updates.birthday = birthday;
      if (timezone !== undefined) updates.timezone = timezone;
      if (country !== undefined) updates.country = country;

      let user = await storage.updateUser(userId, updates);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Update subscription plan and/or status if provided
      if (subscriptionPlanId !== undefined || subscriptionStatus !== undefined) {
        const stripeUpdates: {
          subscriptionPlanId?: string | null;
          subscriptionStatus?: string | null;
          plan?: string | null;
        } = {};

        if (subscriptionPlanId !== undefined) {
          stripeUpdates.subscriptionPlanId = subscriptionPlanId;
          // Auto-set status to active when assigning a plan, unless status is also being set
          if (subscriptionStatus === undefined && subscriptionPlanId) {
            stripeUpdates.subscriptionStatus = "active";
          } else if (subscriptionPlanId === null) {
            stripeUpdates.subscriptionStatus = null;
          }

          // Derive the plan tier (free/pro/family) from the pricing plan name so that
          // planResolver.ts Priority 3 (manual override via user.plan) works correctly.
          // Without this, getEffectivePlan() falls through to 'free' even when a plan
          // is manually assigned in the admin panel.
          if (subscriptionPlanId === null) {
            stripeUpdates.plan = "free";
          } else {
            try {
              const pricingPlan = await storage.getLandingPricingPlan(subscriptionPlanId);
              if (pricingPlan) {
                const nameLower = pricingPlan.name.toLowerCase();
                if (nameLower.includes("family")) {
                  stripeUpdates.plan = "family";
                } else if (nameLower.includes("pro")) {
                  stripeUpdates.plan = "pro";
                } else {
                  stripeUpdates.plan = "pro"; // default any paid plan to pro
                }
              }
            } catch (err) {
              console.warn(`[Admin] Could not resolve plan tier for planId=${subscriptionPlanId}:`, err);
            }
          }
        }

        if (subscriptionStatus !== undefined) {
          stripeUpdates.subscriptionStatus = subscriptionStatus;
        }

        user = await storage.updateUserStripeInfo(userId, stripeUpdates) || user;
      }

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: user.isAdmin === "true",
        isApproved: user.isApproved === "true",
        mfaEnabled: user.mfaEnabled === "true",
        createdAt: user.createdAt,
        subscriptionPlanId: user.subscriptionPlanId,
        subscriptionStatus: user.subscriptionStatus,
      });
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const userId = req.params.id as string;
      // Prevent self-deletion
      if (userId === req.session.userId) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }

      const deleted = await storage.deleteUser(userId);
      if (!deleted) {
        return res.status(404).json({ error: "User not found" });
      }

      auditLogFromRequest(req, {
        eventType: "user.deleted",
        eventCategory: "user",
        actorId: req.session.userId,
        actorType: "admin",
        targetType: "user",
        targetId: userId,
        action: "admin_delete_user",
        outcome: "success",
      });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // FIX 5: Admin unlock account
  app.post("/api/admin/users/:userId/unlock", requireAdmin, async (req, res) => {
    try {
      const userId = req.params.userId as string;
      await pool.query(
        `UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE id = $1`,
        [userId]
      );
      auditLogFromRequest(req, {
        eventType: "admin.user_unlocked",
        eventCategory: "admin",
        actorId: req.session.userId,
        actorType: "admin",
        targetType: "user",
        targetId: userId,
        action: "admin_unlock_account",
        outcome: "success",
        metadata: { unlockedUserId: userId },
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error unlocking user:", error);
      res.status(500).json({ error: "Failed to unlock account" });
    }
  });

  // ─── Admin User Analytics ─────────────────────────────────────────────────

  /**
   * GET /api/admin/users/:id/analytics
   * Returns per-user analytics data for the admin User Management detail panel.
   * Sections: storage, AI costs, activity & engagement, financial overview.
   * Never returns raw transaction data — only aggregates and metadata.
   */
  app.get("/api/admin/users/:id/analytics", requireAdmin, sensitiveApiRateLimiter, async (req, res) => {
    try {
      const userId = req.params.id as string;

      // ── Section 1: Storage ────────────────────────────────────────────────
      const vaultResult = await pool.query(
        `SELECT
           COUNT(*)::int                     AS file_count,
           COALESCE(SUM(file_size), 0)::bigint AS total_bytes
         FROM vault_documents
         WHERE user_id = $1`,
        [userId],
      );
      const receiptResult = await pool.query(
        `SELECT COUNT(*)::int AS receipt_count FROM receipts WHERE user_id = $1`,
        [userId],
      );
      const vaultRow    = vaultResult.rows[0]  ?? { file_count: 0, total_bytes: 0 };
      const receiptRow  = receiptResult.rows[0] ?? { receipt_count: 0 };
      const totalBytes  = Number(vaultRow.total_bytes ?? 0);
      const totalFiles  = Number(vaultRow.file_count ?? 0) + Number(receiptRow.receipt_count ?? 0);
      const storageMB   = totalBytes / (1024 * 1024);

      // Storage trend: compare last-30d bytes vs prior-30d bytes
      const storageTrendResult = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN uploaded_at >= NOW() - INTERVAL '30 days' THEN file_size ELSE 0 END), 0)::bigint AS recent_bytes,
           COALESCE(SUM(CASE WHEN uploaded_at >= NOW() - INTERVAL '60 days' AND uploaded_at < NOW() - INTERVAL '30 days' THEN file_size ELSE 0 END), 0)::bigint AS prior_bytes
         FROM vault_documents WHERE user_id = $1`,
        [userId],
      );
      const trendRow     = storageTrendResult.rows[0] ?? { recent_bytes: 0, prior_bytes: 0 };
      const recentBytes  = Number(trendRow.recent_bytes ?? 0);
      const priorBytes   = Number(trendRow.prior_bytes ?? 0);
      const storageTrend = recentBytes > priorBytes + 1024 ? "growing" : "stable";

      const storage = {
        totalFiles,
        vaultFiles: Number(vaultRow.file_count ?? 0),
        receiptFiles: Number(receiptRow.receipt_count ?? 0),
        storageMB:    parseFloat(storageMB.toFixed(2)),
        storageGB:    parseFloat((storageMB / 1024).toFixed(4)),
        storageTrend,
      };

      // ── Section 2: AI Costs ───────────────────────────────────────────────
      // Pull cumulative costs directly from ai_usage_log grouped by feature_context
      const aiCostsResult = await pool.query(
        `SELECT
           COALESCE(feature_context, task_slot) AS feature_tag,
           SUM(input_tokens)::bigint              AS total_tokens_in,
           SUM(output_tokens)::bigint             AS total_tokens_out,
           SUM(estimated_cost_usd)::numeric       AS total_cost_usd,
           COUNT(*)::int                          AS call_count,
           MAX(created_at)                        AS last_used
         FROM ai_usage_log
         WHERE user_id = $1 AND success = true
         GROUP BY COALESCE(feature_context, task_slot)
         ORDER BY total_cost_usd DESC`,
        [userId],
      );
      const aiByFeature = aiCostsResult.rows.map(r => ({
        featureTag:   String(r.feature_tag),
        totalTokensIn:  Number(r.total_tokens_in ?? 0),
        totalTokensOut: Number(r.total_tokens_out ?? 0),
        totalCostUsd:   parseFloat(Number(r.total_cost_usd ?? 0).toFixed(6)),
        callCount:      Number(r.call_count ?? 0),
        lastUsed:       r.last_used ?? null,
      }));

      const totalAiCostUsd = aiByFeature.reduce((s, r) => s + r.totalCostUsd, 0);

      // Average monthly spend: total cost / elapsed calendar months since first AI call (min 1)
      const firstCallResult = await pool.query(
        `SELECT MIN(created_at) AS first_call FROM ai_usage_log WHERE user_id = $1 AND success = true`,
        [userId],
      );
      const firstCall = firstCallResult.rows[0]?.first_call;
      let monthsSinceFirst = 1;
      if (firstCall) {
        const first = new Date(firstCall);
        const now   = new Date();
        // Calculate elapsed months as (year diff * 12) + month diff, minimum 1
        monthsSinceFirst = Math.max(
          1,
          (now.getFullYear() - first.getFullYear()) * 12 + (now.getMonth() - first.getMonth()) + 1,
        );
      }
      const avgMonthlyAiCost  = parseFloat((totalAiCostUsd / monthsSinceFirst).toFixed(6));
      const estimatedAnnualCost = parseFloat((avgMonthlyAiCost * 12).toFixed(6));

      const aiCosts = {
        byFeature: aiByFeature,
        totalCostUsd:        parseFloat(totalAiCostUsd.toFixed(6)),
        avgMonthlyCostUsd:   avgMonthlyAiCost,
        estimatedAnnualCostUsd: estimatedAnnualCost,
      };

      // ── Section 3: Activity & Engagement ─────────────────────────────────
      const userResult = await pool.query(
        `SELECT last_login_at FROM users WHERE id = $1`,
        [userId],
      );
      const lastLoginAt = userResult.rows[0]?.last_login_at ?? null;

      // Total logins: count audit log login events
      const loginCountResult = await pool.query(
        `SELECT COUNT(*)::int AS total_logins
         FROM audit_log
         WHERE actor_id = $1 AND event_type IN ('auth.login', 'auth.login_success')`,
        [userId],
      );
      const totalLogins = Number(loginCountResult.rows[0]?.total_logins ?? 0);

      // Connected bank accounts (MX + Plaid)
      const mxAcctResult = await pool.query(
        `SELECT COUNT(DISTINCT ma.id)::int AS count
         FROM mx_accounts ma
         JOIN mx_members mm ON mm.id = ma.mx_member_id
         WHERE mm.user_id = $1`,
        [userId],
      );
      const plaidAcctResult = await pool.query(
        `SELECT COUNT(DISTINCT pa.id)::int AS count
         FROM plaid_accounts pa
         JOIN plaid_items pi ON pi.id = pa.plaid_item_id
         WHERE pi.user_id = $1`,
        [userId],
      );
      const bankAccountCount = Number(mxAcctResult.rows[0]?.count ?? 0)
                             + Number(plaidAcctResult.rows[0]?.count ?? 0);

      // Transactions synced
      const mxTxResult = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM mx_transactions mt
         JOIN mx_accounts ma ON ma.id = mt.mx_account_id
         JOIN mx_members mm ON mm.id = ma.mx_member_id
         WHERE mm.user_id = $1`,
        [userId],
      );
      const plaidTxResult = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM plaid_transactions pt
         JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
         JOIN plaid_items pi ON pi.id = pa.plaid_item_id
         WHERE pi.user_id = $1`,
        [userId],
      );
      const manualTxResult = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM manual_transactions mt
         JOIN manual_accounts ma ON ma.id = mt.manual_account_id
         WHERE ma.user_id = $1`,
        [userId],
      );
      const transactionCount = Number(mxTxResult.rows[0]?.count ?? 0)
                             + Number(plaidTxResult.rows[0]?.count ?? 0)
                             + Number(manualTxResult.rows[0]?.count ?? 0);

      // Other counts
      const [receiptsRes, budgetsRes, billsRes, savingsRes] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS count FROM receipts WHERE user_id = $1`, [userId]),
        pool.query(`SELECT COUNT(*)::int AS count FROM budgets WHERE user_id = $1`, [userId]),
        pool.query(`SELECT COUNT(*)::int AS count FROM bills WHERE user_id = $1`, [userId]),
        pool.query(`SELECT COUNT(*)::int AS count FROM savings_goals WHERE user_id = $1`, [userId]),
      ]);

      // Last sync date (most recent mx/plaid sync)
      const lastSyncResult = await pool.query(
        `SELECT MAX(ts)::text AS last_sync FROM (
           SELECT MAX(last_synced::timestamptz) AS ts FROM mx_accounts ma
           JOIN mx_members mm ON mm.id = ma.mx_member_id WHERE mm.user_id = $1
           UNION ALL
           SELECT MAX(last_synced::timestamptz) AS ts FROM plaid_accounts pa
           JOIN plaid_items pi ON pi.id = pa.plaid_item_id WHERE pi.user_id = $1
         ) sub`,
        [userId],
      );

      const activity = {
        lastLoginAt,
        totalLogins,
        bankAccountCount,
        transactionCount,
        receiptCount:    Number(receiptsRes.rows[0]?.count ?? 0),
        budgetCount:     Number(budgetsRes.rows[0]?.count ?? 0),
        billCount:       Number(billsRes.rows[0]?.count ?? 0),
        savingsGoalCount: Number(savingsRes.rows[0]?.count ?? 0),
        lastSyncAt: lastSyncResult.rows[0]?.last_sync ?? null,
      };

      // ── Section 4: Financial Overview (aggregates only) ───────────────────
      // Net worth from MX accounts
      const mxNetWorthResult = await pool.query(
        `SELECT COALESCE(SUM(
           CASE WHEN ma.type IN ('CREDIT_CARD','LOAN','MORTGAGE','LINE_OF_CREDIT','DEBT')
                THEN -ABS(ma.balance::numeric)
                ELSE COALESCE(ma.balance::numeric, 0)
           END
         ), 0)::numeric AS net_worth
         FROM mx_accounts ma
         JOIN mx_members mm ON mm.id = ma.mx_member_id
         WHERE mm.user_id = $1 AND ma.is_hidden = 'false' AND ma.is_closed = 'false'`,
        [userId],
      );
      // Net worth from Plaid accounts
      const plaidNetWorthResult = await pool.query(
        `SELECT COALESCE(SUM(
           CASE WHEN pa.type IN ('credit','loan')
                THEN -ABS(pa.balance_current::numeric)
                ELSE COALESCE(pa.balance_current::numeric, 0)
           END
         ), 0)::numeric AS net_worth
         FROM plaid_accounts pa
         JOIN plaid_items pi ON pi.id = pa.plaid_item_id
         WHERE pi.user_id = $1 AND pa.is_active = 'true'`,
        [userId],
      );
      // Manual accounts
      const manualAcctResult = await pool.query(
        `SELECT COUNT(*)::int AS count,
                COALESCE(SUM(balance::numeric), 0)::numeric AS balance
         FROM manual_accounts WHERE user_id = $1 AND is_active = 'true'`,
        [userId],
      );

      const netWorth = parseFloat(Number(mxNetWorthResult.rows[0]?.net_worth ?? 0).toFixed(2))
                     + parseFloat(Number(plaidNetWorthResult.rows[0]?.net_worth ?? 0).toFixed(2))
                     + parseFloat(Number(manualAcctResult.rows[0]?.balance ?? 0).toFixed(2));

      // Subscription info
      const subResult = await pool.query(
        `SELECT subscription_status, subscription_plan_id, trial_ends_at, created_at, stripe_customer_id
         FROM users WHERE id = $1`,
        [userId],
      );
      const subRow = subResult.rows[0] ?? {};

      const financialOverview = {
        netWorthUsd:         parseFloat(netWorth.toFixed(2)),
        manualAccountCount:  Number(manualAcctResult.rows[0]?.count ?? 0),
        subscriptionStatus:  subRow.subscription_status ?? null,
        subscriptionPlanId:  subRow.subscription_plan_id ?? null,
        subscriptionStartAt: subRow.trial_ends_at ?? null,
        accountCreatedAt:    subRow.created_at ?? null,
        stripeCustomerId:    subRow.stripe_customer_id ?? null,
      };

      res.json({ storage, aiCosts, activity, financialOverview });
    } catch (error) {
      console.error("Error fetching user analytics:", error);
      res.status(500).json({ error: "Failed to fetch user analytics" });
    }
  });

  /**
   * GET /api/admin/users/:id/feature-usage
   * Returns the current month's feature usage for a specific user (admin only).
   */
  app.get("/api/admin/users/:id/feature-usage", requireAdmin, sensitiveApiRateLimiter, async (req, res) => {
    try {
      const userId = req.params.id as string;
      const plan = await getEffectivePlan(userId);

      const { getUserFeatureSummary } = await import("./lib/featureGate");
      const summary = await getUserFeatureSummary(userId, plan);

      // Return only features that have a finite positive limit
      const limitedFeatures = summary
        .filter((f) => f.limit !== null && f.limit > 0)
        .map((f) => ({
          key: f.featureKey,
          displayName: f.displayName,
          used: f.currentUsage,
          limit: f.limit as number,
          remaining: f.remaining as number,
          percentUsed:
            f.limit && f.limit > 0
              ? Math.min(100, Math.round((f.currentUsage / (f.limit as number)) * 100))
              : 0,
        }));

      res.json({ plan, features: limitedFeatures });
    } catch (error) {
      console.error("Error fetching user feature usage (admin):", error);
      res.status(500).json({ error: "Failed to fetch user feature usage" });
    }
  });

  /**
   * GET /api/admin/analytics/aggregate
   * Returns platform-wide aggregate insights for the top of the User Management page.
   */
  app.get("/api/admin/analytics/aggregate", requireAdmin, sensitiveApiRateLimiter, async (_req, res) => {
    try {
      // Total active users
      const activeUsersResult = await pool.query(
        `SELECT COUNT(*)::int AS count FROM users WHERE is_approved = 'true' AND (is_deleted IS NULL OR is_deleted = false)`,
      );
      const activeUsers = Number(activeUsersResult.rows[0]?.count ?? 1);

      // AI spend this month
      const aiThisMonthResult = await pool.query(
        `SELECT COALESCE(SUM(estimated_cost_usd), 0)::numeric AS total
         FROM ai_usage_log
         WHERE success = true AND created_at >= date_trunc('month', NOW())`,
      );
      // AI spend all-time
      const aiTotalResult = await pool.query(
        `SELECT COALESCE(SUM(estimated_cost_usd), 0)::numeric AS total FROM ai_usage_log WHERE success = true`,
      );
      // AI spend per user per month (last 30 days)
      const aiPerUserMonthResult = await pool.query(
        `SELECT
           COALESCE(AVG(user_cost), 0)::numeric AS avg_cost
         FROM (
           SELECT user_id, SUM(estimated_cost_usd) AS user_cost
           FROM ai_usage_log
           WHERE success = true AND user_id IS NOT NULL AND created_at >= NOW() - INTERVAL '30 days'
           GROUP BY user_id
         ) sub`,
      );

      // Average storage per user
      const avgStorageResult = await pool.query(
        `SELECT COALESCE(AVG(user_bytes), 0)::numeric AS avg_bytes
         FROM (
           SELECT user_id, SUM(COALESCE(file_size, 0)) AS user_bytes
           FROM vault_documents GROUP BY user_id
         ) sub`,
      );

      // Users approaching storage limit (> 400 MB = 400*1024*1024 bytes)
      const storageLimit = 400 * 1024 * 1024;
      const approachingLimitResult = await pool.query(
        `SELECT user_id, SUM(COALESCE(file_size, 0))::bigint AS total_bytes
         FROM vault_documents
         GROUP BY user_id
         HAVING SUM(COALESCE(file_size, 0)) > $1
         ORDER BY total_bytes DESC`,
        [storageLimit * 0.8],
      );

      // Top 10 highest AI cost users (all time)
      const topAiUsersResult = await pool.query(
        `SELECT
           l.user_id,
           u.username,
           u.email,
           u.first_name,
           u.last_name,
           SUM(l.estimated_cost_usd)::numeric AS total_cost,
           COUNT(*)::int AS call_count
         FROM ai_usage_log l
         LEFT JOIN users u ON u.id = l.user_id
         WHERE l.success = true AND l.user_id IS NOT NULL
         GROUP BY l.user_id, u.username, u.email, u.first_name, u.last_name
         ORDER BY total_cost DESC
         LIMIT 10`,
      );

      // Free user feature usage: average % usage per feature, count at limit, conversion signals
      const freeUserCountResult = await pool.query(
        `SELECT COUNT(*)::int AS count FROM users
         WHERE (plan IS NULL OR plan = 'free')
           AND (is_deleted IS NULL OR is_deleted = false)
           AND is_approved = 'true'`,
      );
      const freeUserCount = Number(freeUserCountResult.rows[0]?.count ?? 0);

      // Per feature: users using it, avg usage count, users who received a limit email (at limit)
      const featureStatsResult = await pool.query(
        `SELECT
           ufu.feature_key,
           COUNT(DISTINCT ufu.user_id)::int                          AS users_using,
           ROUND(AVG(ufu.usage_count), 2)::numeric                   AS avg_usage,
           COUNT(CASE WHEN ufu.limit_sent_at IS NOT NULL THEN 1 END)::int AS users_at_limit
         FROM user_feature_usage ufu
         JOIN users u ON u.id = ufu.user_id
         WHERE ufu.period_start = date_trunc('month', NOW())
           AND (u.plan IS NULL OR u.plan = 'free')
           AND (u.is_deleted IS NULL OR u.is_deleted = false)
         GROUP BY ufu.feature_key
         ORDER BY avg_usage DESC`,
      );

      // Users who hit a limit but haven't upgraded (high conversion signal)
      const conversionSignalResult = await pool.query(
        `SELECT
           u.id,
           u.username,
           u.email,
           u.first_name,
           u.last_name,
           COUNT(DISTINCT ufu.feature_key)::int AS features_at_limit
         FROM user_feature_usage ufu
         JOIN users u ON u.id = ufu.user_id
         WHERE ufu.period_start = date_trunc('month', NOW())
           AND ufu.limit_sent_at IS NOT NULL
           AND (u.plan IS NULL OR u.plan = 'free')
           AND (u.is_deleted IS NULL OR u.is_deleted = false)
         GROUP BY u.id, u.username, u.email, u.first_name, u.last_name
         ORDER BY features_at_limit DESC
         LIMIT 20`,
      );

      const aiSpendThisMonth  = parseFloat(Number(aiThisMonthResult.rows[0]?.total ?? 0).toFixed(6));
      const aiSpendTotal      = parseFloat(Number(aiTotalResult.rows[0]?.total ?? 0).toFixed(6));
      const avgAiPerUserMonth = parseFloat(Number(aiPerUserMonthResult.rows[0]?.avg_cost ?? 0).toFixed(6));
      const avgStorageBytes   = Number(avgStorageResult.rows[0]?.avg_bytes ?? 0);
      const costPerActiveUser = activeUsers > 0
        ? parseFloat((aiSpendTotal / activeUsers).toFixed(6))
        : 0;

      res.json({
        activeUsers,
        aiSpendThisMonth,
        aiSpendTotal,
        avgAiPerUserMonth,
        avgStorageMB: parseFloat((avgStorageBytes / (1024 * 1024)).toFixed(2)),
        costPerActiveUser,
        usersApproachingStorageLimit: approachingLimitResult.rows.map(r => ({
          userId:     r.user_id,
          totalBytes: Number(r.total_bytes),
          totalMB:    parseFloat((Number(r.total_bytes) / (1024 * 1024)).toFixed(2)),
        })),
        topAiCostUsers: topAiUsersResult.rows.map(r => ({
          userId:      r.user_id,
          username:    r.username ?? null,
          email:       r.email ?? null,
          displayName: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.username || null,
          totalCostUsd: parseFloat(Number(r.total_cost ?? 0).toFixed(6)),
          callCount:   Number(r.call_count ?? 0),
        })),
        featureUsage: {
          freeUserCount,
          byFeature: featureStatsResult.rows.map(r => ({
            featureKey:   r.feature_key,
            usersUsing:   Number(r.users_using ?? 0),
            avgUsage:     parseFloat(Number(r.avg_usage ?? 0).toFixed(2)),
            usersAtLimit: Number(r.users_at_limit ?? 0),
          })),
          conversionSignals: conversionSignalResult.rows.map(r => ({
            userId:           r.id,
            username:         r.username ?? null,
            email:            r.email ?? null,
            displayName:      [r.first_name, r.last_name].filter(Boolean).join(" ") || r.username || null,
            featuresAtLimit:  Number(r.features_at_limit ?? 0),
          })),
        },
      });
    } catch (error) {
      console.error("Error fetching aggregate analytics:", error);
      res.status(500).json({ error: "Failed to fetch aggregate analytics" });
    }
  });

  // Contact form endpoint
  app.post("/api/contact", sensitiveApiRateLimiter, async (req, res) => {
    try {
      const parsed = contactFormSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid form data", details: parsed.error });
      }

      const { name, email, subject, message } = parsed.data;
      const fromEmail = process.env.ALERT_EMAIL_FROM;

      if (!fromEmail) {
        return res.status(500).json({ error: "Email configuration missing" });
      }

      if (!isEmailConfigured()) {
        return res.status(500).json({ error: "Email not configured on this server" });
      }

      const supportTo = process.env.SUPPORT_EMAIL || process.env.ALERT_EMAIL_TO;
      if (!supportTo) {
        console.error("[CONFIG] Cannot send contact-form email: SUPPORT_EMAIL and ALERT_EMAIL_TO are not set.");
        return res.status(500).json({ error: "Email routing not configured on this server" });
      }

      await sendEmailViaPostmark({
        from: fromEmail,
        to: supportTo,
        replyTo: email,
        subject: `[Budget Smart AI Contact] ${subject}`,
        text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        html: `
          <h2>New Contact Form Submission</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <h3>Message:</h3>
          <p>${message.replace(/\n/g, '<br>')}</p>
        `,
      });

      res.json({ success: true, message: "Message sent successfully" });
    } catch (error) {
      console.error("Contact form error:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // ==================== SUPPORT TICKET SYSTEM ====================

  // Helper: generate BST-YYYYMMDD-XXXX ticket number
  async function generateTicketNumber(): Promise<string> {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const allTickets = await storage.getSupportTickets();
    const todayTickets = allTickets.filter(t => t.ticketNumber && t.ticketNumber.includes(`BST-${dateStr}`));
    const seq = (todayTickets.length + 1).toString().padStart(4, "0");
    return `BST-${dateStr}-${seq}`;
  }

  // Helper: HTML email wrapper with BudgetSmart dark branding
  function buildEmailHtml(title: string, bodyHtml: string): string {
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#1a1a2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;min-height:100vh;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#16213e;border-radius:12px;overflow:hidden;max-width:600px;">
        <tr><td style="background:linear-gradient(135deg,#0f3460,#1a1a2e);padding:30px 40px;text-align:center;">
          <h1 style="margin:0;color:#4ade80;font-size:24px;font-weight:800;">💰 Budget Smart AI</h1>
          <p style="margin:8px 0 0;color:#94a3b8;font-size:13px;">Support Team</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 20px;color:#f1f5f9;font-size:20px;">${title}</h2>
          ${bodyHtml}
          <hr style="border:none;border-top:1px solid #334155;margin:30px 0;">
          <p style="margin:0;color:#64748b;font-size:12px;text-align:center;">
            Budget Smart AI · <a href="https://app.budgetsmart.io" style="color:#4ade80;text-decoration:none;">app.budgetsmart.io</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  }

  // Submit a new support ticket
  app.post("/api/support", sensitiveApiRateLimiter, async (req, res) => {
    try {
      const parsed = supportFormSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid form data", details: parsed.error });
      }

      const { name, email, type, subject, priority, message } = parsed.data;

      const typeLabels: Record<string, string> = {
        ticket: "Support Ticket",
        feature: "Feature Request",
        bug: "Bug Report",
      };
      const typeLabel = typeLabels[type] || "Support Request";

      // Generate unique ticket number
      const ticketNumber = await generateTicketNumber();

      // Get logged-in user id if available
      const userId = req.session?.userId || null;

      // Persist ticket to database
      // Map form priority values (low/medium/high) to ticket priority values (low/normal/high/urgent)
      const ticketPriority = priority === "medium" ? "normal" : (priority || "normal");

      const ticket = await storage.createSupportTicket({
        ticketNumber,
        userId: userId || undefined,
        name: name || undefined,
        email,
        type,
        subject,
        priority: ticketPriority as "low" | "normal" | "high" | "urgent",
        message,
        status: "open",
        emailSent: "false",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Also save initial message to thread
      await storage.createSupportTicketMessage({
        ticketId: ticket.id,
        senderType: "user",
        senderId: userId || undefined,
        message,
        createdAt: new Date().toISOString(),
      });

      const fromEmail = process.env.ALERT_EMAIL_FROM;
      const emailConfigured = fromEmail && isEmailConfigured();

      let emailSent = false;
      if (emailConfigured && fromEmail) {
        const supportTo = process.env.SUPPORT_EMAIL || process.env.ALERT_EMAIL_TO;
        if (!supportTo) {
          console.error("[CONFIG] Cannot send ticket notification: SUPPORT_EMAIL and ALERT_EMAIL_TO are not set.");
        } else {
        // Notify admin
        try {
          await sendEmailViaPostmark({
            from: fromEmail,
            to: supportTo,
            replyTo: email,
            subject: `[New Ticket #${ticketNumber}] ${subject}`,
            html: buildEmailHtml(`New ${typeLabel}: #${ticketNumber}`, `
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:8px 0;border-bottom:1px solid #334155;">
                  <span style="color:#94a3b8;font-size:13px;">Ticket #</span>
                  <span style="color:#f1f5f9;font-size:13px;float:right;">${ticketNumber}</span>
                </td></tr>
                <tr><td style="padding:8px 0;border-bottom:1px solid #334155;">
                  <span style="color:#94a3b8;font-size:13px;">Name</span>
                  <span style="color:#f1f5f9;font-size:13px;float:right;">${name || "N/A"}</span>
                </td></tr>
                <tr><td style="padding:8px 0;border-bottom:1px solid #334155;">
                  <span style="color:#94a3b8;font-size:13px;">Email</span>
                  <span style="color:#f1f5f9;font-size:13px;float:right;">${email}</span>
                </td></tr>
                <tr><td style="padding:8px 0;border-bottom:1px solid #334155;">
                  <span style="color:#94a3b8;font-size:13px;">Type</span>
                  <span style="color:#f1f5f9;font-size:13px;float:right;">${typeLabel}</span>
                </td></tr>
                <tr><td style="padding:8px 0;border-bottom:1px solid #334155;">
                  <span style="color:#94a3b8;font-size:13px;">Priority</span>
                  <span style="color:#f1f5f9;font-size:13px;float:right;">${priority || "normal"}</span>
                </td></tr>
              </table>
              <div style="margin:20px 0;padding:16px;background:#0f1c2e;border-radius:8px;border-left:3px solid #4ade80;">
                <p style="margin:0;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Message</p>
                <p style="margin:8px 0 0;color:#f1f5f9;font-size:14px;line-height:1.6;">${message.replace(/\n/g, "<br>")}</p>
              </div>
              <p style="margin:20px 0 0;"><a href="https://app.budgetsmart.io/admin/support" style="display:inline-block;padding:12px 24px;background:#4ade80;color:#1a1a2e;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">View in Admin Portal →</a></p>
            `),
          });
          emailSent = true;
        } catch (err) {
          console.error("Support admin notification email failed:", err);
        }

        // Confirmation email to user
        try {
          await sendEmailViaPostmark({
            from: fromEmail,
            to: email,
            subject: `Your BudgetSmart Support Request #${ticketNumber} has been received`,
            html: buildEmailHtml("We've received your request!", `
              <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
                Hi ${name || "there"}, thank you for reaching out to BudgetSmart support. We've received your request and will respond shortly.
              </p>
              <div style="margin:20px 0;padding:20px;background:#0f1c2e;border-radius:8px;text-align:center;">
                <p style="margin:0;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Your Ticket Number</p>
                <p style="margin:8px 0 0;color:#4ade80;font-size:28px;font-weight:800;letter-spacing:2px;">${ticketNumber}</p>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
                <tr><td style="padding:8px 0;border-bottom:1px solid #334155;">
                  <span style="color:#94a3b8;font-size:13px;">Subject</span>
                  <span style="color:#f1f5f9;font-size:13px;float:right;">${subject}</span>
                </td></tr>
                <tr><td style="padding:8px 0;border-bottom:1px solid #334155;">
                  <span style="color:#94a3b8;font-size:13px;">Status</span>
                  <span style="color:#fbbf24;font-size:13px;float:right;">Open</span>
                </td></tr>
              </table>
              <p style="margin:20px 0 0;color:#94a3b8;font-size:14px;line-height:1.6;">
                Our team typically responds within <strong style="color:#f1f5f9;">2–4 hours</strong>. You can view your ticket status at any time by logging into BudgetSmart.
              </p>
            `),
          });
        } catch (err) {
          console.error("Support user confirmation email failed:", err);
        }
        } // end else (supportTo configured)
      }

      if (emailSent) {
        await storage.updateSupportTicket(ticket.id, { emailSent: "true" });
      }

      res.json({ success: true, message: "Support request submitted successfully", ticketNumber });

      // ── Fire-and-forget AI triage (non-blocking) ──────────────────────────
      setImmediate(async () => {
        try {
          const { routeAI } = await import("./ai-router");

          const triageSystemPrompt = `You are a support ticket classifier for BudgetSmart AI. Classify the ticket into one of: HOW_TO, LOGIN_ISSUE, BILLING, BANK_CONNECTION, BUG_REPORT, FEATURE_REQUEST, DATA_ISSUE, ACCOUNT_SECURITY, OTHER.
Output a confidence score 0–100 and recommended tier:
- LEVEL_1: can be resolved with information or guidance
- LEVEL_2: requires developer investigation or manual intervention

LEVEL_2 triggers: BUG_REPORT with confidence above 70, DATA_ISSUE, ACCOUNT_SECURITY, or any ticket where confidence in auto-resolution is below 75.
Respond in JSON only: { "category": "...", "confidence": 0, "tier": "LEVEL_1|LEVEL_2", "summary": "...", "suggestedResponse": "..." }`;

          const triageResult = await routeAI({
            taskSlot: "support_triage",
            userId: userId || undefined,
            featureContext: "support_triage",
            maxTokens: 800,
            jsonMode: true,
            messages: [
              { role: "system", content: triageSystemPrompt },
              { role: "user", content: `Ticket subject: ${subject}\nType: ${type}\nMessage: ${message}` },
            ],
          });

          let triageData: { category?: string; confidence?: number; tier?: string; summary?: string; suggestedResponse?: string } = {};
          try { triageData = JSON.parse(triageResult.content); } catch (parseErr) {
            console.error(`[AI Triage] JSON parse failed for ticket ${ticket.id}:`, parseErr, "Raw content:", triageResult.content?.slice(0, 200));
            return;
          }

          const { category, confidence, tier, summary, suggestedResponse } = triageData;

          // Assign support team persona
          const SUPPORT_TEAM = [
            { name: "Sarah Mitchell", role: "Senior Support Specialist" },
            { name: "James Okonkwo", role: "Technical Support Lead" },
            { name: "Priya Sharma", role: "Billing & Account Specialist" },
            { name: "Daniel Reyes", role: "Bank Integration Specialist" },
            { name: "Emma Tremblay", role: "Customer Success Manager" },
          ];
          const persona = SUPPORT_TEAM[Math.floor(Math.random() * SUPPORT_TEAM.length)];

          // Save assignment
          await pool.query(
            `INSERT INTO ticket_assignments (ticket_id, team_member_name, team_member_role) VALUES ($1, $2, $3)`,
            [ticket.id, persona.name, persona.role]
          );

          // Update ticket with triage data
          await pool.query(
            `UPDATE support_tickets SET category=$1, confidence_score=$2, tier=$3, ai_summary=$4 WHERE id=$5`,
            [category ?? null, confidence ?? null, tier ?? null, summary ?? null, ticket.id]
          );

          const fromEmail2 = process.env.ALERT_EMAIL_FROM;
          if (!fromEmail2 || !isEmailConfigured()) return;

          const firstName = name && name.trim() ? name.trim().split(" ")[0] : "there";

          if (tier === "LEVEL_1" && suggestedResponse) {
            // Send AI auto-response
            const l1Subject = `Re: [Ticket #${ticketNumber}] ${subject}`;
            await sendEmailViaPostmark({
              from: fromEmail2,
              to: email,
              subject: l1Subject,
              html: buildEmailHtml(`Support Response from ${persona.name}`, `
                <p style="color:#94a3b8;font-size:14px;line-height:1.6;">Hi ${firstName},</p>
                <p style="color:#94a3b8;font-size:14px;line-height:1.6;">${suggestedResponse.replace(/\n/g, "<br>")}</p>
                <p style="color:#94a3b8;font-size:14px;line-height:1.6;">If this didn't resolve your issue, reply to this email and a team member will follow up.</p>
                <hr style="border:none;border-top:1px solid #334155;margin:20px 0;">
                <p style="margin:0;color:#64748b;font-size:12px;">${persona.name} · ${persona.role} · BudgetSmart Support</p>
              `),
            });
            await pool.query(
              `UPDATE support_tickets SET ai_response_sent_at=$1, status='waiting_for_user' WHERE id=$2`,
              [new Date().toISOString(), ticket.id]
            );
          } else if (tier === "LEVEL_2") {
            // Send escalation acknowledgement
            await sendEmailViaPostmark({
              from: fromEmail2,
              to: email,
              subject: `Re: [Ticket #${ticketNumber}] ${subject}`,
              html: buildEmailHtml("We've received your ticket", `
                <p style="color:#94a3b8;font-size:14px;line-height:1.6;">Hi ${firstName},</p>
                <p style="color:#94a3b8;font-size:14px;line-height:1.6;">We've received your ticket and a member of our team will investigate. Our typical response time is <strong style="color:#f1f5f9;">24–48 hours</strong>.</p>
                <p style="color:#94a3b8;font-size:14px;line-height:1.6;">Your ticket number is <strong style="color:#4ade80;">#${ticketNumber}</strong>. You can view its status in the Support section of your account.</p>
                <hr style="border:none;border-top:1px solid #334155;margin:20px 0;">
                <p style="margin:0;color:#64748b;font-size:12px;">${persona.name} · ${persona.role} · BudgetSmart Support</p>
              `),
            });
            await pool.query(
              `UPDATE support_tickets SET status='escalated' WHERE id=$1`,
              [ticket.id]
            );
          }
        } catch (triageErr) {
          console.error("AI triage error (non-fatal):", triageErr);
        }
      });
    } catch (error) {
      console.error("Support form error:", error);
      res.status(500).json({ error: "Failed to submit support request" });
    }
  });

  // Get tickets for the logged-in user
  app.get("/api/support/my-tickets", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const tickets = await storage.getSupportTicketsByUserId(userId);
      res.json(tickets);
    } catch (error) {
      console.error("My tickets error:", error);
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });

  // Get a single ticket with its full message thread (user-facing)
  app.get("/api/support/my-tickets/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const ticket = await storage.getSupportTicketById((req.params.id as string));
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      if (ticket.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      const messages = await storage.getMessagesByTicketId(ticket.id);
      res.json({ ticket, messages });
    } catch (error) {
      console.error("Get ticket error:", error);
      res.status(500).json({ error: "Failed to fetch ticket" });
    }
  });

  // User replies to their own ticket
  app.post("/api/support/my-tickets/:id/reply", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { message } = req.body;
      if (!message || !message.trim()) return res.status(400).json({ error: "Message is required" });

      const ticket = await storage.getSupportTicketById((req.params.id as string));
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      if (ticket.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      if (ticket.status === "closed") return res.status(400).json({ error: "Cannot reply to a closed ticket" });

      await storage.createSupportTicketMessage({
        ticketId: ticket.id,
        senderType: "user",
        senderId: userId,
        message: message.trim(),
        createdAt: new Date().toISOString(),
      });

      await storage.updateSupportTicket(ticket.id, { status: "waiting_for_admin" });
      res.json({ success: true });
    } catch (error) {
      console.error("Ticket reply error:", error);
      res.status(500).json({ error: "Failed to send reply" });
    }
  });

  // ==================== KNOWLEDGE BASE ROUTES ====================

  // Submit KB article feedback (helpful/not helpful)
  app.post("/api/support/kb-feedback", sensitiveApiRateLimiter, async (req, res) => {
    try {
      const { articleId, helpful } = req.body;
      if (!articleId || typeof helpful !== "boolean") {
        return res.status(400).json({ error: "articleId and helpful (boolean) are required" });
      }
      const userId = req.session?.userId || null;
      await pool.query(
        `INSERT INTO kb_feedback (article_id, helpful, user_id) VALUES ($1, $2, $3)`,
        [String(articleId), helpful, userId]
      );
      res.json({ success: true });
    } catch (error) {
      console.error("KB feedback error:", error);
      res.status(500).json({ error: "Failed to save feedback" });
    }
  });

  // AI-powered knowledge base search answer
  app.post("/api/support/kb-search", sensitiveApiRateLimiter, async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== "string" || query.trim().length < 2) {
        return res.status(400).json({ error: "query is required" });
      }
      const { routeAI } = await import("./ai-router");
      const kbSystemPrompt = `You are a BudgetSmart AI support assistant with expert knowledge of the platform — a Canadian personal finance SaaS covering budgeting, transaction tracking, bank connections via Plaid and MX, bills, subscriptions, AI financial advisor, Financial Vault document storage, receipt scanning, and investment tracking. Answer the user's support question in 2–4 sentences in plain friendly language. If you don't know the answer, say so and suggest they submit a support ticket. Do not make up features that don't exist.`;
      const aiResult = await routeAI({
        taskSlot: "support_kb",
        userId: req.session?.userId,
        featureContext: "support_kb_search",
        maxTokens: 300,
        temperature: 0.4,
        messages: [
          { role: "system", content: kbSystemPrompt },
          { role: "user", content: query.trim() },
        ],
      });
      res.json({ answer: aiResult.content });
    } catch (error) {
      console.error("KB search error:", error);
      res.status(500).json({ error: "Search failed" });
    }
  });

  // ==================== ADMIN AUDIT LOG ROUTES ====================

  app.get("/api/admin/audit-log", requireAdmin, async (req, res) => {
    try {
      const {
        from,
        to,
        eventType,
        outcome,
        actorId,
        targetUserId,
        limit = "200",
        offset = "0",
      } = req.query as Record<string, string>;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (from) {
        conditions.push(`created_at >= $${idx++}`);
        params.push(new Date(from));
      }
      if (to) {
        conditions.push(`created_at <= $${idx++}`);
        params.push(new Date(to));
      }
      if (eventType) {
        conditions.push(`event_type = $${idx++}`);
        params.push(eventType);
      }
      if (outcome) {
        conditions.push(`outcome = $${idx++}`);
        params.push(outcome);
      }
      if (actorId) {
        conditions.push(`actor_id = $${idx++}`);
        params.push(actorId);
      }
      if (targetUserId) {
        conditions.push(`target_user_id = $${idx++}`);
        params.push(targetUserId);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const limitN = Math.min(parseInt(limit, 10) || 200, 1000);
      const offsetN = parseInt(offset, 10) || 0;

      const pool = (db as any).$client as import("pg").Pool;
      const result = await pool.query(
        `SELECT id, event_type, event_category, actor_id, actor_type,
                actor_ip, actor_user_agent, target_type, target_id, target_user_id,
                action, outcome, metadata, error_message, session_id, created_at
           FROM audit_log
          ${where}
          ORDER BY created_at DESC
          LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limitN, offsetN],
      );

      const countResult = await pool.query(
        `SELECT COUNT(*) AS total FROM audit_log ${where}`,
        params,
      );

      auditLogFromRequest(req, {
        eventType: "admin.data_accessed",
        eventCategory: "admin",
        actorId: req.session.userId,
        actorType: "admin",
        action: "view_audit_log",
        outcome: "success",
        metadata: { filters: { from, to, eventType, outcome, actorId, targetUserId }, returned: result.rowCount },
      });

      res.json({
        rows: result.rows,
        total: parseInt(countResult.rows[0]?.total ?? "0", 10),
        limit: limitN,
        offset: offsetN,
      });
    } catch (error) {
      console.error("Error fetching audit log:", error);
      res.status(500).json({ error: "Failed to fetch audit log" });
    }
  });

  // ==================== ADMIN SUPPORT ROUTES ====================

  // List all tickets (admin)
  app.get("/api/admin/support/tickets", requireAdmin, async (req, res) => {
    try {
      const tickets = await storage.getSupportTickets();
      res.json(tickets);
    } catch (error) {
      console.error("Admin tickets error:", error);
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });

  // Get single ticket with messages (admin)
  app.get("/api/admin/support/tickets/:id", requireAdmin, async (req, res) => {
    try {
      const ticket = await storage.getSupportTicketById((req.params.id as string));
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      const messages = await storage.getMessagesByTicketId(ticket.id);
      res.json({ ticket, messages });
    } catch (error) {
      console.error("Admin get ticket error:", error);
      res.status(500).json({ error: "Failed to fetch ticket" });
    }
  });

  // Admin replies to a ticket
  app.post("/api/admin/support/tickets/:id/reply", requireAdmin, async (req, res) => {
    try {
      const adminId = req.session.userId!;
      const { message } = req.body;
      if (!message || !message.trim()) return res.status(400).json({ error: "Message is required" });

      const ticket = await storage.getSupportTicketById((req.params.id as string));
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      await storage.createSupportTicketMessage({
        ticketId: ticket.id,
        senderType: "admin",
        senderId: adminId,
        message: message.trim(),
        createdAt: new Date().toISOString(),
      });

      const now = new Date().toISOString();
      await storage.updateSupportTicket(ticket.id, {
        status: "waiting_for_user",
        adminResponse: message.trim(),
        adminResponseAt: now,
        respondedBy: adminId,
      });

      // Notify user by email
      const fromEmail = process.env.ALERT_EMAIL_FROM;
      if (fromEmail && isEmailConfigured() && ticket.email) {
        const supportReplyTo = process.env.SUPPORT_EMAIL || process.env.ALERT_EMAIL_TO || fromEmail;
        try {
          await sendEmailViaPostmark({
            from: fromEmail,
            to: ticket.email,
            replyTo: supportReplyTo,
            subject: `[BudgetSmart Support #${ticket.ticketNumber || ticket.id}] New response from support team`,
            html: buildEmailHtml("You have a new response!", `
              <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
                Hi ${ticket.name || "there"}, our support team has responded to your ticket <strong style="color:#4ade80;">#${ticket.ticketNumber || ticket.id}</strong>.
              </p>
              <div style="margin:20px 0;padding:16px;background:#0f1c2e;border-radius:8px;border-left:3px solid #4ade80;">
                <p style="margin:0;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Response</p>
                <p style="margin:8px 0 0;color:#f1f5f9;font-size:14px;line-height:1.6;">${message.trim().replace(/\n/g, "<br>")}</p>
              </div>
              <p style="margin:20px 0 0;"><a href="https://app.budgetsmart.io/support" style="display:inline-block;padding:12px 24px;background:#4ade80;color:#1a1a2e;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">View Full Thread →</a></p>
            `),
          });
        } catch (err) {
          console.error("Admin reply notification email failed:", err);
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Admin ticket reply error:", error);
      res.status(500).json({ error: "Failed to send reply" });
    }
  });

  // Admin: update ticket status/priority
  app.patch("/api/admin/support/tickets/:id", requireAdmin, async (req, res) => {
    try {
      const { status, priority } = req.body;
      const updates: Record<string, string> = {};
      if (status) updates.status = status;
      if (priority) updates.priority = priority;
      const ticket = await storage.updateSupportTicket((req.params.id as string), updates as any);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      res.json(ticket);
    } catch (error) {
      console.error("Admin update ticket error:", error);
      res.status(500).json({ error: "Failed to update ticket" });
    }
  });

  // Admin: AI assistant for support tickets
  app.post("/api/admin/support/ai-assist", requireAdmin, async (req, res) => {
    try {
      const { ticketId, question } = req.body;
      if (!ticketId || !question) return res.status(400).json({ error: "ticketId and question are required" });

      const ticket = await storage.getSupportTicketById(ticketId);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      const messages = await storage.getMessagesByTicketId(ticketId);

      const ticketContext = `Ticket #${ticket.ticketNumber || ticket.id}
Subject: ${ticket.subject}
Type: ${ticket.type || "N/A"}
Priority: ${ticket.priority || "normal"}
Status: ${ticket.status}
User: ${ticket.name || "Unknown"} <${ticket.email}>
Submitted: ${ticket.createdAt}

--- Conversation ---
${messages.map(m => `[${m.senderType.toUpperCase()}] ${m.message}`).join("\n\n")}`;

      const { routeAI } = await import("./ai-router");
      const aiResult = await routeAI({
        taskSlot: "support_assistant",
        userId: req.session.userId!,
        featureContext: "admin_support_assist",
        maxTokens: 1024,
        messages: [
          {
            role: "system",
            content: "You are a support assistant for BudgetSmart. Help the admin team respond to tickets professionally. Be empathetic, clear and solution-focused.",
          },
          {
            role: "user",
            content: `Here is the support ticket context:\n\n${ticketContext}\n\n---\n\nAdmin question: ${question}`,
          },
        ],
      });

      const aiResponse = aiResult.content || "No response generated";
      res.json({ response: aiResponse });
    } catch (error) {
      console.error("AI assist error:", error);
      res.status(500).json({ error: "AI assistant failed" });
    }
  });

  // ==================== SALES CHATBOT ROUTES (PUBLIC) ====================

  // Start or resume a chat session
  app.post("/api/sales-chat/session", sensitiveApiRateLimiter, async (req, res) => {
    try {
      const { visitorId, metadata } = req.body;

      if (!visitorId) {
        return res.status(400).json({ error: "visitorId is required" });
      }

      // Check for existing active session
      let session = await storage.getSalesChatSessionByVisitor(visitorId);

      if (!session) {
        // Create new session
        session = await storage.createSalesChatSession({
          visitorId,
          status: "active",
          startedAt: new Date().toISOString(),
          metadata: metadata ? JSON.stringify(metadata) : null,
        });
      }

      res.json({
        sessionId: session.id,
        greeting: getGreeting(),
        isNew: !session.messageCount || session.messageCount === 0,
      });
    } catch (error) {
      console.error("Sales chat session error:", error);
      res.status(500).json({ error: "Failed to start chat session" });
    }
  });

  // Send a message and get AI response
  app.post("/api/sales-chat/message", sensitiveApiRateLimiter, async (req, res) => {
    try {
      const { sessionId, message } = req.body;

      if (!sessionId || !message) {
        return res.status(400).json({ error: "sessionId and message are required" });
      }

      // Verify session exists
      const session = await storage.getSalesChatSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Save user message
      await storage.createSalesChatMessage({
        sessionId,
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
      });

      // Get message history for context
      const messages = await storage.getSalesChatMessages(sessionId);
      const chatHistory = messages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // Get AI response
      const aiResponse = await salesChat(chatHistory, sessionId);

      // Save assistant message
      await storage.createSalesChatMessage({
        sessionId,
        role: "assistant",
        content: aiResponse.message,
        createdAt: new Date().toISOString(),
      });

      res.json({
        response: aiResponse.message,
        showLeadForm: aiResponse.showLeadForm,
      });
    } catch (error) {
      console.error("Sales chat message error:", error);
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  // Submit lead form
  app.post("/api/sales-chat/lead", sensitiveApiRateLimiter, async (req, res) => {
    try {
      const { sessionId, ...leadData } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required" });
      }

      // Validate lead form data
      const parsed = salesLeadFormSchema.safeParse(leadData);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid form data", details: parsed.error });
      }

      // Verify session exists
      const session = await storage.getSalesChatSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Check if lead already exists for this session
      const existingLead = await storage.getSalesLeadBySession(sessionId);
      if (existingLead) {
        return res.status(400).json({ error: "Lead already submitted for this session" });
      }

      // Create the lead
      const lead = await storage.createSalesLead({
        sessionId,
        name: parsed.data.name,
        email: parsed.data.email,
        question: parsed.data.question,
        status: "new",
        createdAt: new Date().toISOString(),
      });

      // Send email notification to sales team
      try {
        const fromEmail = process.env.ALERT_EMAIL_FROM;
        const salesTo = process.env.SALES_EMAIL || process.env.ALERT_EMAIL_TO;
        if (fromEmail && isEmailConfigured() && salesTo) {
          await sendEmailViaPostmark({
            from: fromEmail,
            to: salesTo,
            replyTo: parsed.data.email,
            subject: `[Sales Lead] ${parsed.data.name} - Chat Inquiry`,
            text: `New sales lead from chat:\n\nName: ${parsed.data.name}\nEmail: ${parsed.data.email}\n\nQuestion:\n${parsed.data.question}\n\nView conversation: ${process.env.APP_URL || "https://app.budgetsmart.io"}/admin/sales-chat?session=${sessionId}`,
            html: `
              <h2>New Sales Lead from Chat</h2>
              <p><strong>Name:</strong> ${parsed.data.name}</p>
              <p><strong>Email:</strong> <a href="mailto:${parsed.data.email}">${parsed.data.email}</a></p>
              <h3>Question:</h3>
              <p>${parsed.data.question.replace(/\n/g, '<br>')}</p>
              <p><a href="${process.env.APP_URL || "https://app.budgetsmart.io"}/admin/sales-chat?session=${sessionId}">View Full Conversation</a></p>
            `,
          });
        }
      } catch (emailError) {
        console.error("Failed to send lead notification email:", emailError);
        // Don't fail the request if email fails
      }

      // Add a follow-up message in the chat
      await storage.createSalesChatMessage({
        sessionId,
        role: "assistant",
        content: `Thanks ${parsed.data.name}! I've sent your question to our team. They'll reach out to you at ${parsed.data.email} shortly. Is there anything else I can help you with in the meantime?`,
        createdAt: new Date().toISOString(),
      });

      res.json({
        success: true,
        message: "Thank you! Our team will reach out to you soon.",
        leadId: lead.id,
      });
    } catch (error) {
      console.error("Sales lead submission error:", error);
      res.status(500).json({ error: "Failed to submit lead" });
    }
  });

  // ==================== MX WEBHOOK (no auth required) ====================

  // POST /api/mx/webhook — receives MX webhook events
  // MX uses a single global webhook URL registered once in the MX dashboard.
  // No authentication required — MX calls this directly.
  app.post('/api/mx/webhook', async (req, res) => {
    // Always respond 200 immediately to MX
    res.status(200).json({ received: true });

    try {
      const { type, object_type, object_guid, user_guid } = req.body;

      console.log(`[MX Webhook] type:${type} object_type:${object_type} guid:${object_guid}`);

      // Member finished aggregating — sync transactions
      if (
        object_type === 'member' && (
          type === 'aggregation_completed' ||
          type === 'background_aggregation_completed' ||
          type === 'historical_data_imported'
        )
      ) {
        // Find user who owns this member
        const member = await storage.getMxMemberByGuid(object_guid);

        if (!member) {
          console.error(`[MX Webhook] Member not found: ${object_guid}`);
          return;
        }

        console.log(`[MX Webhook] Starting sync for member ${object_guid}, user ${member.userId}`);

        // Fetch and sync transactions for this member
        const user = await storage.getUser(member.userId);
        if (!user?.mxUserGuid) {
          console.error(`[MX Webhook] No mxUserGuid for user ${member.userId}`);
          return;
        }

        const { fetchAllTransactions, mapMXCategory } = await import('./mx');
        const transactions = await fetchAllTransactions(user.mxUserGuid);

        const accounts = await storage.getMxAccounts(member.id);
        const accountMap = new Map(accounts.map((a: any) => [a.accountGuid, a.id]));

        const toUpsert: any[] = [];
        for (const tx of transactions) {
          const mxAccountId = accountMap.get(tx.account_guid);
          if (!mxAccountId) continue;
          toUpsert.push({
            mxAccountId,
            transactionGuid: tx.guid,
            date: tx.date,
            amount: tx.amount.toString(),
            description: tx.description,
            originalDescription: tx.original_description,
            category: mapMXCategory(tx.top_level_category, tx.category, tx.type === "CREDIT" || tx.is_income === true || tx.amount < 0),
            topLevelCategory: tx.top_level_category,
            type: tx.type,
            status: tx.status,
            isBillPay: tx.is_bill_pay ? 'true' : 'false',
            isDirectDeposit: tx.is_direct_deposit ? 'true' : 'false',
            isExpense: tx.is_expense ? 'true' : 'false',
            isIncome: tx.is_income ? 'true' : 'false',
            isRecurring: tx.is_recurring ? 'true' : 'false',
            isSubscription: tx.is_subscription ? 'true' : 'false',
            merchantGuid: tx.merchant_guid || null,
            transactedAt: tx.transacted_at,
            postedAt: tx.posted_at || null,
            pending: tx.status === 'PENDING' ? 'true' : 'false',
            matchType: 'unmatched',
            needsReview: false,
          });
        }

        if (toUpsert.length > 0) {
          await storage.upsertMxTransactions(toUpsert);
        }

        console.log(`[MX Webhook] Synced ${toUpsert.length} transactions for member ${object_guid}`);
      }

      // Member connection status changed
      if (object_type === 'member' && type === 'member_status_updated') {
        const member = await storage.getMxMemberByGuid(object_guid);

        if (member) {
          const user = await storage.getUser(member.userId);
          if (!user?.mxUserGuid) return;

          const { mxClient } = await import('./mx');
          const response = await mxClient.get(`/users/${user.mxUserGuid}/members/${object_guid}`);
          const status = response.data.member.connection_status;

          await storage.updateMxMember(member.id, { connectionStatus: status });

          console.log(`[MX Webhook] Member status updated: ${status}`);

          // If connected, trigger sync
          if (status === 'CONNECTED') {
            const { fetchAllTransactions, mapMXCategory } = await import('./mx');
            const transactions = await fetchAllTransactions(user.mxUserGuid);

            const accounts = await storage.getMxAccounts(member.id);
            const accountMap = new Map(accounts.map((a: any) => [a.accountGuid, a.id]));

            const toUpsert: any[] = [];
            for (const tx of transactions) {
              const mxAccountId = accountMap.get(tx.account_guid);
              if (!mxAccountId) continue;
              toUpsert.push({
                mxAccountId,
                transactionGuid: tx.guid,
                date: tx.date,
                amount: tx.amount.toString(),
                description: tx.description,
                originalDescription: tx.original_description,
                category: mapMXCategory(tx.top_level_category, tx.category, tx.type === "CREDIT" || tx.is_income === true || tx.amount < 0),
                topLevelCategory: tx.top_level_category,
                type: tx.type,
                status: tx.status,
                isBillPay: tx.is_bill_pay ? 'true' : 'false',
                isDirectDeposit: tx.is_direct_deposit ? 'true' : 'false',
                isExpense: tx.is_expense ? 'true' : 'false',
                isIncome: tx.is_income ? 'true' : 'false',
                isRecurring: tx.is_recurring ? 'true' : 'false',
                isSubscription: tx.is_subscription ? 'true' : 'false',
                merchantGuid: tx.merchant_guid || null,
                transactedAt: tx.transacted_at,
                postedAt: tx.posted_at || null,
                pending: tx.status === 'PENDING' ? 'true' : 'false',
                matchType: 'unmatched',
                needsReview: false,
              });
            }

            if (toUpsert.length > 0) {
              await storage.upsertMxTransactions(toUpsert);
            }

            console.log(`[MX Webhook] Synced ${toUpsert.length} transactions after CONNECTED status`);
          }
        }
      }

    } catch (error) {
      console.error('[MX Webhook] Processing error:', error);
    }
  });

  // GET /api/admin/mx/webhook-info — returns the webhook URL to register in MX dashboard
  app.get('/api/admin/mx/webhook-info', requireAdmin, (req, res) => {
    res.json({
      webhookUrl: process.env.MX_WEBHOOK_URL ||
        `${process.env.APP_URL}/api/mx/webhook`,
      instructions: [
        '1. Go to dashboard.mx.com',
        '2. Navigate to Settings → Webhooks',
        '3. Add the webhookUrl above',
        '4. Select events: aggregation_completed, member_status_updated, historical_data_imported',
        '5. Save for both Development and Production',
      ],
    });
  });

  // GET /api/admin/mx/checklist — MX production readiness checklist
  app.get('/api/admin/mx/checklist', requireAdmin, async (_req, res) => {
    try {
      const webhookUrl = process.env.MX_WEBHOOK_URL;
      const appUrl = process.env.APP_URL;
      const mxApiKey = process.env.MX_API_KEY;
      const mxClientId = process.env.MX_CLIENT_ID;
      const isProduction = process.env.MX_ENVIRONMENT === 'production';

      // Count MX members in DB
      const { mxMembers: mxMembersTable } = await import('@shared/schema');
      const { sql } = await import('drizzle-orm');
      const memberCount = await db.select({
        count: sql`count(*)`
      }).from(mxMembersTable);

      res.json({
        checklist: {
          webhookUrlSet: !!webhookUrl,
          webhookUrl: webhookUrl || 'NOT SET',
          appUrlSet: !!appUrl,
          mxApiKeySet: !!mxApiKey,
          mxClientIdSet: !!mxClientId,
          environment: isProduction ? 'PRODUCTION' : 'DEVELOPMENT/SANDBOX',
          connectedMembers: memberCount[0]?.count || 0,
          readyForProduction: !!(webhookUrl && appUrl && mxApiKey && mxClientId && isProduction),
        },
        nextSteps: !isProduction ? [
          '1. Get MX production key approval from Savanna',
          '2. Set MX_ENVIRONMENT=production in Railway',
          '3. Set MX_API_KEY to production key in Railway',
          `4. Register webhook in MX dashboard: ${webhookUrl || '(set MX_WEBHOOK_URL first)'}`,
          '5. Test with real bank connection',
          '6. Monitor Railway logs for webhook events',
        ] : [
          'MX is configured for production ✅',
        ],
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== PLAID WEBHOOK (no auth required) ====================

  // POST /api/plaid/webhook — receives Plaid webhook events
  // No authentication required — Plaid calls this directly
  app.post("/api/plaid/webhook", async (req, res) => {
    // Respond 200 immediately so Plaid doesn't retry
    res.status(200).json({ received: true });

    // Process asynchronously
    setImmediate(async () => {
      try {
        const { webhook_type, webhook_code, item_id, error } = req.body;

        console.log(`[Plaid Webhook] ═══════════════════════════════════════`);
        console.log(`[Plaid Webhook] Received: type=${webhook_type} code=${webhook_code} plaid_item_id=${item_id}`);

        if (webhook_type === "TRANSACTIONS") {
          // ── FIX 1: item_id in DB is ENCRYPTED — fetch all items and decrypt to find match ──
          // Plaid sends the REAL item_id (e.g. xqo00P5Y0oF3jXLxKypduZyqmz6gB0CRjAad8)
          // but the DB stores an ENCRYPTED version. Direct WHERE item_id = $1 finds nothing.
          // Solution: fetch all items, decrypt each item_id, compare to Plaid's real item_id.
          const { rows: allRows } = await pool.query(
            `SELECT id, user_id, access_token, access_token_enc, item_id, sync_cursor, is_syncing FROM plaid_items`
          );

          console.log(`[Plaid Webhook] Searching ${allRows.length} DB items for plaid_item_id=${item_id}`);

          let item: any = null;
          for (const row of allRows) {
            try {
              const decryptedItemId = decrypt(row.item_id);
              if (decryptedItemId === item_id) {
                item = row;
                console.log(`[Plaid Webhook] ✅ Matched item: internal_id=${row.id} decrypted_item_id=${decryptedItemId.substring(0, 15)}...`);
                break;
              }
            } catch {
              // If decrypt fails, try direct comparison (item_id may already be plaintext)
              if (row.item_id === item_id) {
                item = row;
                console.log(`[Plaid Webhook] ✅ Matched item (plaintext): internal_id=${row.id}`);
                break;
              }
            }
          }

          if (!item) {
            console.error(`[Plaid Webhook] ❌ Item not found for plaid_item_id=${item_id}`);
            console.error(`[Plaid Webhook]   DB has ${allRows.length} items. Decrypted item_ids:`);
            for (const row of allRows) {
              try {
                const dec = decrypt(row.item_id);
                console.error(`[Plaid Webhook]     internal=${row.id} → decrypted=${dec}`);
              } catch {
                console.error(`[Plaid Webhook]     internal=${row.id} → raw=${row.item_id} (decrypt failed)`);
              }
            }
            return;
          }

          console.log(`[Plaid Webhook] DB item found:`);
          console.log(`[Plaid Webhook]   internal_id=${item.id}`);
          console.log(`[Plaid Webhook]   user_id=${item.user_id}`);
          console.log(`[Plaid Webhook]   isSyncing=${item.is_syncing}`);
          console.log(`[Plaid Webhook]   hasCursor=${item.sync_cursor ? 'YES (has cursor)' : 'NO (null = fresh start)'}`);
          console.log(`[Plaid Webhook]   tokenLength=${item.access_token?.length ?? 0}`);

          // ── FIX 2: Resolve access_token from either plaintext or encrypted column ──
          // The DB stores access_token = "ENCRYPTED" (sentinel) and access_token_enc = AES-256-GCM ciphertext.
          // Some older rows may have plaintext in access_token directly.
          // Priority: access_token_enc (decrypt) → access_token (if starts with "access-") → fail
          let accessToken: string = "";

          if (item.access_token_enc) {
            // New rows: decrypt from access_token_enc column
            try {
              accessToken = decrypt(item.access_token_enc);
              console.log(`[Plaid Webhook]   Token resolved from access_token_enc (decrypted)`);
            } catch (decryptErr) {
              console.error(`[Plaid Webhook] ❌ Failed to decrypt access_token_enc for item ${item.id}:`, decryptErr);
              return;
            }
          } else if (item.access_token && item.access_token !== "ENCRYPTED") {
            // Legacy rows: plaintext in access_token column
            accessToken = item.access_token;
            console.log(`[Plaid Webhook]   Token resolved from access_token (plaintext legacy)`);
          } else {
            console.error(`[Plaid Webhook] ❌ No valid access token found for item ${item.id} (access_token="${item.access_token}", access_token_enc=${item.access_token_enc ? 'present' : 'null'})`);
            return;
          }

          const tokenPreview = accessToken.substring(0, 20);
          console.log(`[Plaid Webhook]   tokenStart=${tokenPreview}...`);
          if (!accessToken.startsWith("access-")) {
            console.error(`[Plaid Webhook] ❌ Token does NOT start with "access-" — invalid token!`);
            return;
          }
          console.log(`[Plaid Webhook]   ✅ Token valid (starts with "access-")`);

          const { syncTransactions } = await import("./plaid");

          if (
            webhook_code === "SYNC_UPDATES_AVAILABLE" ||
            webhook_code === "INITIAL_UPDATE" ||
            webhook_code === "DEFAULT_UPDATE"
          ) {
            console.log(`[Plaid Webhook] Starting sync for ${webhook_code} — item ${item.id} (user ${item.user_id})`);
            console.log(`[Plaid Webhook]   cursor=${item.sync_cursor ? 'existing (incremental)' : 'null (fresh)'}`);

            const result = await syncTransactions(accessToken, item.id, item.user_id);
            console.log(`[Plaid Webhook] ✅ Sync complete: +${result.added} added, ~${result.modified} modified, -${result.removed} removed`);

            // Run enrichment in background if new transactions were added
            if (result.added > 0) {
              const { enrichPendingTransactions } = await import("./merchant-enricher");
              enrichPendingTransactions(item.user_id, 100).catch((err: any) =>
                console.error("[Enricher] Background enrichment failed:", err)
              );
            }

          } else if (webhook_code === "HISTORICAL_UPDATE") {
            // HISTORICAL_UPDATE means Plaid has prepared the FULL 24-month history.
            // Reset cursor to null so the sync fetches ALL history from scratch.
            console.log(`[Plaid Webhook] 🔄 HISTORICAL_UPDATE received — resetting cursor for FULL history sync`);
            console.log(`[Plaid Webhook]   Previous cursor: ${item.sync_cursor ? item.sync_cursor.substring(0, 30) + '...' : 'null'}`);

            // Reset cursor to null AND release any stale sync lock
            await pool.query(
              `UPDATE plaid_items SET sync_cursor = NULL, is_syncing = false WHERE id = $1`,
              [item.id]
            );
            console.log(`[Plaid Webhook]   ✅ Cursor reset to NULL — will fetch full 24-month history`);

            // Re-fetch item to confirm reset
            const { rows: freshRows } = await pool.query(
              `SELECT id, user_id, access_token, sync_cursor, is_syncing FROM plaid_items WHERE id = $1`,
              [item.id]
            );
            const freshItem = freshRows[0];
            console.log(`[Plaid Webhook]   Confirmed cursor after reset: ${freshItem?.sync_cursor ?? 'null'}`);
            console.log(`[Plaid Webhook]   Confirmed isSyncing after reset: ${freshItem?.is_syncing}`);

            // Now sync from the very beginning (null cursor = full history)
            console.log(`[Plaid Webhook] Starting FULL history sync for item ${item.id} (user ${item.user_id})`);
            const result = await syncTransactions(accessToken, item.id, item.user_id);
            console.log(`[Plaid Webhook] ✅ HISTORICAL sync complete: +${result.added} added, ~${result.modified} modified, -${result.removed} removed`);

            // Run enrichment in background if new transactions were added
            if (result.added > 0) {
              const { enrichPendingTransactions } = await import("./merchant-enricher");
              enrichPendingTransactions(item.user_id, 100).catch((err: any) =>
                console.error("[Enricher] Background enrichment failed:", err)
              );
            }
          }

        } else if (webhook_type === "ITEM") {
          // For ITEM webhooks, item_id may also be encrypted in DB — use same decrypt-and-compare approach
          const { rows: allItemRows } = await pool.query(
            `SELECT id FROM plaid_items`
          );
          let matchedId: string | null = null;
          for (const row of allItemRows) {
            const { rows: itemRows } = await pool.query(
              `SELECT id, item_id FROM plaid_items WHERE id = $1`,
              [row.id]
            );
            if (itemRows.length > 0) {
              try {
                const decryptedItemId = decrypt(itemRows[0].item_id);
                if (decryptedItemId === item_id || itemRows[0].item_id === item_id) {
                  matchedId = row.id;
                  break;
                }
              } catch {
                if (itemRows[0].item_id === item_id) {
                  matchedId = row.id;
                  break;
                }
              }
            }
          }

          if (webhook_code === "ERROR") {
            const errorCode = error?.error_code || "UNKNOWN";
            console.warn(`[Plaid Webhook] ⚠️  ITEM ERROR for item_id=${item_id}: ${errorCode}`);
            if (matchedId) {
              await pool.query(`UPDATE plaid_items SET status = 'error' WHERE id = $1`, [matchedId]);
            }
          } else if (webhook_code === "PENDING_EXPIRATION") {
            console.warn(`[Plaid Webhook] ⚠️  ITEM PENDING_EXPIRATION for item_id=${item_id}`);
            if (matchedId) {
              await pool.query(`UPDATE plaid_items SET status = 'pending_expiration' WHERE id = $1`, [matchedId]);
            }
          } else if (webhook_code === "USER_PERMISSION_REVOKED") {
            console.warn(`[Plaid Webhook] ⚠️  USER_PERMISSION_REVOKED for item_id=${item_id}`);
            if (matchedId) {
              await pool.query(`UPDATE plaid_items SET status = 'revoked' WHERE id = $1`, [matchedId]);
            }
          }
        }

        console.log(`[Plaid Webhook] ═══════════════════════════════════════`);
      } catch (err) {
        console.error("[Plaid Webhook] ❌ Error processing webhook:", err);
      }
    });
  });

  // POST /api/admin/plaid/register-webhooks — update webhook URL for all Plaid items
  app.post("/api/admin/plaid/register-webhooks", requireAdmin, async (req, res) => {
    try {
      const webhookUrl = process.env.PLAID_WEBHOOK_URL || `${process.env.APP_URL}/api/plaid/webhook`;
      if (!webhookUrl) {
        return res.status(400).json({ error: "PLAID_WEBHOOK_URL or APP_URL environment variable is not set" });
      }

      const { plaidClient } = await import("./plaid");
      const { rows } = await pool.query(
        `SELECT id, access_token, item_id, institution_name FROM plaid_items WHERE status != 'error' ORDER BY created_at DESC`
      );

      let updated = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const item of rows) {
        try {
          await plaidClient.itemWebhookUpdate({
            access_token: decrypt(item.access_token),
            webhook: webhookUrl,
          });
          updated++;
          console.log(`[Plaid] Registered webhook for item ${item.id} (${item.institution_name})`);
        } catch (err: any) {
          failed++;
          const msg = err?.response?.data?.error_message || err?.message || "Unknown error";
          errors.push(`${item.institution_name || item.id}: ${msg}`);
          console.error(`[Plaid] Failed to register webhook for item ${item.id}:`, msg);
        }
      }

      res.json({
        success: true,
        webhookUrl,
        totalItems: rows.length,
        updated,
        failed,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      console.error("Error registering Plaid webhooks:", error);
      res.status(500).json({ error: error.message || "Failed to register webhooks" });
    }
  });

  // FEATURE: PLAID_BANK_CONNECTIONS | tier: free | limit: 1 connection
  // ==================== PLAID ROUTES ====================

  // Create Plaid Link token for frontend
  app.post("/api/plaid/create-link-token", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      
      // Check subscription-based bank limit
      const user = await storage.getUser(userId);
      const plaidItems = await storage.getPlaidItems(userId);
      const currentBankCount = plaidItems.length;
      
      // Get user's subscription plan limits
      let maxBankAccounts = 1; // Default for free/no subscription
      if (user?.subscriptionPlanId) {
        const plan = await storage.getLandingPricingPlan(user.subscriptionPlanId);
        if (plan?.maxBankAccounts) {
          maxBankAccounts = plan.maxBankAccounts;
        }
      }
      
      // Admin users or users with active Family plan (999) get unlimited
      const isAdmin = user?.isAdmin === "true";
      const hasUnlimitedBanks = maxBankAccounts >= 999 || isAdmin;
      
      // Check if user has reached their bank limit
      if (!hasUnlimitedBanks && currentBankCount >= maxBankAccounts) {
        return res.status(403).json({ 
          error: "Bank account limit reached",
          message: `Your plan allows ${maxBankAccounts} bank connection(s). Upgrade to Family plan for unlimited banks or add additional banks for $5 each.`,
          currentCount: currentBankCount,
          maxAllowed: maxBankAccounts
        });
      }
      
      const { plaidClient, PLAID_COUNTRY_CODES, PLAID_LANGUAGE, Products } = await import("./plaid");
      
      // Log request details for debugging
      console.log("[Plaid] Creating link token for user:", userId);
      console.log("[Plaid] Country codes:", PLAID_COUNTRY_CODES);

      // Per Plaid docs: Transactions, Auth, and Liabilities should all be in primary products
      const primaryProducts = [Products.Transactions, Products.Auth, Products.Liabilities];
      const additionalProducts: any[] = [];

      console.log("[Plaid] Primary products:", primaryProducts);
      console.log("[Plaid] Additional products:", additionalProducts);

      try {
        const response = await plaidClient.linkTokenCreate({
          user: { client_user_id: String(userId) },
          client_name: "Budget Smart AI",
          products: primaryProducts,
          additional_consented_products: additionalProducts,
          country_codes: PLAID_COUNTRY_CODES,
          language: PLAID_LANGUAGE,
          webhook: process.env.PLAID_WEBHOOK_URL || `${process.env.APP_URL}/api/plaid/webhook`,
          transactions: {
            days_requested: 730,  // Request up to 2 years of transaction history
          },
        });

        console.log("[Plaid] Link token created successfully with liabilities + additional products");
        return res.json({ 
          link_token: response.data.link_token,
          currentBankCount,
          maxBankAccounts,
          canAddMore: hasUnlimitedBanks || currentBankCount < maxBankAccounts
        });
      } catch (plaidError: any) {
        // Log full error details
        const errorCode = plaidError?.response?.data?.error_code;
        const errorMessage = plaidError?.response?.data?.error_message || '';
        const errorType = plaidError?.response?.data?.error_type || '';
        
        console.log("[Plaid] First attempt failed:", {
          error_type: errorType,
          error_code: errorCode,
          error_message: errorMessage
        });
        
        // If liabilities fails, try with transactions as primary
        if (errorCode === 'INVALID_PRODUCT' || errorMessage.includes('liabilities')) {
          console.log("[Plaid] Retrying with transactions as primary...");
          
          const fallbackResponse = await plaidClient.linkTokenCreate({
            user: { client_user_id: String(userId) },
            client_name: "Budget Smart AI",
            products: [Products.Transactions, Products.Auth],
            country_codes: PLAID_COUNTRY_CODES,
            language: PLAID_LANGUAGE,
            webhook: process.env.PLAID_WEBHOOK_URL || `${process.env.APP_URL}/api/plaid/webhook`,
            transactions: {
              days_requested: 730,  // Request up to 2 years of transaction history
            },
          });

          console.log("[Plaid] Link token created successfully without liabilities");
          return res.json({ 
            link_token: fallbackResponse.data.link_token,
            currentBankCount,
            maxBankAccounts,
            canAddMore: hasUnlimitedBanks || currentBankCount < maxBankAccounts,
            warning: "Connected without liabilities product"
          });
        }
        
        // Re-throw if not a liabilities issue
        throw plaidError;
      }
    } catch (error: any) {
      console.error("Error creating link token:", error?.response?.data || error);
      res.status(500).json({ error: "Failed to create link token", details: error?.response?.data?.error_message });
    }
  });

  // Exchange public token for access token
  app.post("/api/plaid/exchange-token", requireAuth, apiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);

      // Cumulative count check for total bank connections (MX + Plaid) BEFORE creating
      const limit = await getFeatureLimit(plan, "bank_connections");
      if (limit !== null) {
        const { rows } = await pool.query(
          `SELECT
             (SELECT COUNT(*) FROM plaid_items WHERE user_id = $1) +
             (SELECT COUNT(*) FROM mx_members WHERE user_id = $1) AS count`,
          [userId]
        );
        const currentCount = parseInt(rows[0]?.count || "0", 10);
        if (currentCount >= limit) {
          return res.status(402).json({
            feature: "plaid_bank_connections",
            remaining: 0,
            resetDate: null,
            upgradeRequired: true,
          });
        }
      }

      const { plaidClient } = await import("./plaid");
      const { public_token, metadata } = req.body;

      if (!public_token) {
        return res.status(400).json({ error: "public_token is required" });
      }

      // Exchange public token for access token
      const exchangeResponse = await plaidClient.itemPublicTokenExchange({
        public_token,
      });

      const { access_token, item_id } = exchangeResponse.data;

      console.log(
        `[Token Exchange] Saving new item:`,
        `item_id: ${item_id.substring(0, 15)}...`,
        `item_id_length: ${item_id.length}`,
        `token: ${access_token.substring(0, 20)}...`
      );

      // Store the Plaid item
      const plaidItem = await storage.createPlaidItem({
        userId: req.session.userId!,
        accessToken: access_token,
        itemId: item_id,
        institutionId: metadata?.institution?.institution_id || null,
        institutionName: metadata?.institution?.name || null,
      });

      // Fix 4: Deactivate old items for the same institution so they don't
      // show in the UI or get counted in net worth after reconnection.
      const institutionId = metadata?.institution?.institution_id;
      if (institutionId) {
        try {
          await db.update(plaidItems)
            .set({
              status: 'inactive',
            })
            .where(and(
              eq(plaidItems.userId, userId),
              eq(plaidItems.institutionId, institutionId),
              ne(plaidItems.id, plaidItem.id)
            ));
          console.log(`[Token Exchange] Deactivated old items for institution ${institutionId}`);
        } catch (deactivateErr) {
          console.warn(`[Token Exchange] Could not deactivate old items:`, deactivateErr);
        }
      }

      // Fetch and store accounts
      const accountsResponse = await plaidClient.accountsGet({
        access_token,
      });

      for (const account of accountsResponse.data.accounts) {
        await storage.createPlaidAccount({
          plaidItemId: plaidItem.id,
          accountId: account.account_id,
          name: account.name,
          officialName: account.official_name || null,
          type: account.type,
          subtype: account.subtype || null,
          mask: account.mask || null,
          balanceCurrent: account.balances.current?.toString() || null,
          balanceAvailable: account.balances.available?.toString() || null,
          balanceLimit: account.balances.limit?.toString() || null,
          isoCurrencyCode: account.balances.iso_currency_code || "CAD",
        });
      }

      auditLogFromRequest(req, {
        eventType: "data.bank_connected",
        eventCategory: "data",
        actorId: req.session.userId,
        action: "plaid_bank_connected",
        outcome: "success",
        metadata: { itemId: plaidItem.id, institutionName: plaidItem.institutionName },
      });

      // CRITICAL: Per Plaid docs, /transactions/sync MUST be called at least once
      // after the user completes the Link flow to "activate" the item for webhook syncing.
      // Without this initial call, SYNC_UPDATES_AVAILABLE (including historical_update_complete)
      // will never fire. We do this in the background so the response is fast.
      setImmediate(async () => {
        try {
          const { syncTransactions } = await import("./plaid");
          console.log(`[Plaid] Initial sync for new item ${plaidItem.id} (${plaidItem.institutionName}) to activate webhook...`);
          const result = await syncTransactions(access_token, plaidItem.id, req.session.userId!);
          console.log(`[Plaid] Initial sync complete: +${result.added} added, ~${result.modified} modified, -${result.removed} removed`);

          // NOTE: detectRecurringIncome() is intentionally NOT called here.
          // Auto-imported income records (created by auto-reconciler Step 0) must
          // remain as one-time (isRecurring = false) entries. The recurring-income-
          // detector was previously called here and incorrectly marked all historical
          // paycheck records as recurring, causing the frontend to project each one
          // forward and multiply the income total by 10-40x.
          //
          // The recurring-income-detector now skips any record with notes containing
          // "Auto-imported from bank transaction", so it is safe to call manually
          // from /api/income/detect-recurring for user-created income records only.

          // Run enrichment if transactions were added
          if (result.added > 0) {
            const { enrichPendingTransactions } = await import("./merchant-enricher");
            enrichPendingTransactions(req.session.userId!, 100).catch((err: any) =>
              console.error("[Enricher] Background enrichment failed:", err)
            );
          }
        } catch (syncErr: any) {
          // Non-fatal — webhook will still fire when Plaid is ready
          console.warn(`[Plaid] Initial sync failed for item ${plaidItem.id} (will rely on webhook):`, syncErr?.response?.data?.error_code || syncErr?.message);
        }
      });

      res.json({
        success: true,
        item: { id: plaidItem.id, institutionName: plaidItem.institutionName },
        transactionStatus: "pending_webhook",
        message: "Your accounts are connected. Transactions will appear within 1-2 minutes once your bank sends them.",
      });
    } catch (error: any) {
      console.error("Error exchanging token:", error?.response?.data || error);
      res.status(500).json({ error: "Failed to connect bank account" });
    }
  });

  // Get all linked accounts
  app.get("/api/plaid/accounts", requireAuth, async (req, res) => {
    try {
      const items = await storage.getPlaidItems(req.session.userId!);
      const accounts = await storage.getAllPlaidAccounts(req.session.userId!);

      // Group accounts by institution
      const grouped = items.map(item => ({
        id: item.id,
        institutionName: item.institutionName,
        institutionId: item.institutionId,
        status: item.status,
        accounts: accounts.filter(a => a.plaidItemId === item.id),
      }));

      res.json(grouped);
    } catch (error) {
      console.error("Error getting accounts:", error);
      res.status(500).json({ error: "Failed to get accounts" });
    }
  });

  // Toggle account active status (for disabling duplicate accounts)
  const toggleActiveSchema = z.object({
    isActive: z.boolean(),
  });
  
  app.patch("/api/plaid/accounts/:id/toggle-active", requireAuth, async (req, res) => {
    try {
      const id = req.params.id as string;
      const parseResult = toggleActiveSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request: isActive must be a boolean" });
      }
      
      const { isActive } = parseResult.data;
      
      // Verify the account belongs to the user
      const accounts = await storage.getAllPlaidAccounts(req.session.userId!);
      const account = accounts.find(a => a.id === id);
      
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }
      
      const updated = await storage.updatePlaidAccount(id, {
        isActive: isActive ? "true" : "false"
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error toggling account status:", error);
      res.status(500).json({ error: "Failed to update account" });
    }
  });

  // Refresh account balances
  app.post("/api/plaid/accounts/refresh-balances", requireAuth, async (req, res) => {
    try {
      const { plaidClient } = await import("./plaid");
      const items = await storage.getPlaidItems(req.session.userId!);

      for (const item of items) {
        try {
        const response = await plaidClient.accountsBalanceGet({
          access_token: decrypt(item.accessToken),
        });

        for (const account of response.data.accounts) {
            const existing = await storage.getPlaidAccountByAccountId(account.account_id);
            if (existing) {
              await storage.updatePlaidAccount(existing.id, {
                balanceCurrent: account.balances.current?.toString() || null,
                balanceAvailable: account.balances.available?.toString() || null,
                balanceLimit: account.balances.limit?.toString() || null,
                lastSynced: new Date().toISOString(),
              });
            }
          }
        } catch (itemError: any) {
          console.error(`Error refreshing balances for item ${item.id}:`, itemError?.response?.data || itemError);
          await storage.updatePlaidItem(item.id, { status: "error" });
        }
      }

      const accounts = await storage.getAllPlaidAccounts(req.session.userId!);
      res.json(accounts);
    } catch (error) {
      console.error("Error refreshing balances:", error);
      res.status(500).json({ error: "Failed to refresh balances" });
    }
  });

  // Sync transactions — uses /transactions/sync (cursor-based, never returns PRODUCT_NOT_READY)
  app.post("/api/plaid/transactions/sync", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { syncTransactions } = await import("./plaid");
      const items = await storage.getPlaidItems(userId);

      let totalAdded = 0;
      let totalModified = 0;
      let totalRemoved = 0;

      for (const item of items) {
        try {
        console.log(`Syncing transactions for ${item.institutionName} (item ${item.id})...`);
        const result = await syncTransactions(decrypt(item.accessToken), item.id, userId);
        totalAdded += result.added;
          totalModified += result.modified;
          totalRemoved += result.removed;
          await storage.updatePlaidItem(item.id, { status: "active" });
          console.log(`  Done: +${result.added} added, ~${result.modified} modified, -${result.removed} removed`);
        } catch (itemError: any) {
          console.error(`Error syncing transactions for item ${item.id}:`, itemError?.response?.data || itemError);
          await storage.updatePlaidItem(item.id, { status: "error" });
        }
      }

      // Run anomaly detection on new transactions
      if (totalAdded > 0) {
        try {
          const { detectAnomalies } = await import("./anomaly-detection");
          const allAccounts = await Promise.all(
            items.map(item => storage.getPlaidAccounts(item.id))
          );
          const accountIds = allAccounts.flat()
            .filter(a => a.isActive === "true")
            .map(a => a.id);

          if (accountIds.length > 0) {
            const recentTransactions = await storage.getPlaidTransactions(accountIds, {
              startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            });
            await detectAnomalies(userId, recentTransactions, accountIds);
          }
        } catch (anomalyError) {
          console.error("Error running anomaly detection:", anomalyError);
        }
      }

      // Trigger enrichment for newly added transactions in the background
      if (totalAdded > 0) {
        const { enrichPendingTransactions } = await import("./merchant-enricher");
        enrichPendingTransactions(userId, 100).catch(err =>
          console.error('[Enricher] Background enrichment failed:', err)
        );
      }

      res.json({ success: true, added: totalAdded, modified: totalModified, removed: totalRemoved });
    } catch (error) {
      console.error("Error syncing transactions:", error);
      res.status(500).json({ error: "Failed to sync transactions" });
    }
  });

  // Fetch historical transactions (up to 2 years)
  // Uses /transactions/sync (cursor-based) — never returns PRODUCT_NOT_READY
  app.post("/api/plaid/transactions/fetch-historical", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { syncTransactions } = await import("./plaid");
      const items = await storage.getPlaidItems(userId);

      let totalAdded = 0;
      let totalModified = 0;
      let totalRemoved = 0;
      const errors: string[] = [];

      for (const item of items) {
        try {
          console.log(`Fetching historical transactions for item ${item.id} (${item.institutionName})...`);
          const result = await syncTransactions(decrypt(item.accessToken), item.id, userId);
          totalAdded += result.added;
          totalModified += result.modified;
          totalRemoved += result.removed;
          console.log(`  Completed ${item.institutionName}: +${result.added} added, ~${result.modified} modified, -${result.removed} removed`);
        } catch (itemError: any) {
          const errorMsg = itemError?.response?.data?.error_message || itemError?.message || "Unknown error";
          console.error(`Error fetching historical for item ${item.id}:`, errorMsg);
          errors.push(`${item.institutionName}: ${errorMsg}`);
        }
      }

      // Trigger enrichment for newly added transactions in the background
      if (totalAdded > 0) {
        const { enrichPendingTransactions } = await import("./merchant-enricher");
        enrichPendingTransactions(userId, 100).catch(err =>
          console.error('[Enricher] Background enrichment failed:', err)
        );
      }

      res.json({
        success: true,
        added: totalAdded,
        modified: totalModified,
        removed: totalRemoved,
        errors: errors.length > 0 ? errors : undefined,
        message: `Synced ${totalAdded} new transactions via /transactions/sync.`
      });
    } catch (error: any) {
      console.error("Error fetching historical transactions:", error);
      res.status(500).json({ error: "Failed to fetch historical transactions" });
    }
  });

  // Refresh transactions (trigger Plaid to fetch latest data from bank)
  app.post("/api/plaid/transactions/refresh", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { plaidClient } = await import("./plaid");
      const items = await storage.getPlaidItems(userId);

      let refreshed = 0;
      for (const item of items) {
        try {
        await plaidClient.transactionsRefresh({
          access_token: decrypt(item.accessToken),
        });
        refreshed++;
          console.log(`Triggered transaction refresh for item ${item.id}`);
        } catch (itemError: any) {
          console.error(`Error refreshing item ${item.id}:`, itemError?.response?.data || itemError);
        }
      }

      res.json({ success: true, refreshed, message: "Refresh triggered. New transactions will be available shortly." });
    } catch (error) {
      console.error("Error refreshing transactions:", error);
      res.status(500).json({ error: "Failed to refresh transactions" });
    }
  });

  // Get recurring transactions from Plaid
  app.get("/api/plaid/transactions/recurring", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { plaidClient } = await import("./plaid");
      const items = await storage.getPlaidItems(userId);

      const allRecurring: any[] = [];

      for (const item of items) {
        try {
          // Get accounts for this item
          const accounts = await storage.getPlaidAccounts(item.id);
          const accountIds = accounts.map(a => a.accountId);

          if (accountIds.length === 0) continue;

          const response = await plaidClient.transactionsRecurringGet({
            access_token: decrypt(item.accessToken),
            account_ids: accountIds,
          });

          // Add inflow and outflow streams
          if (response.data.inflow_streams) {
            for (const stream of response.data.inflow_streams) {
              allRecurring.push({
                ...stream,
                type: "inflow",
                institutionId: item.institutionId,
              });
            }
          }
          if (response.data.outflow_streams) {
            for (const stream of response.data.outflow_streams) {
              allRecurring.push({
                ...stream,
                type: "outflow",
                institutionId: item.institutionId,
              });
            }
          }
        } catch (itemError: any) {
          console.error(`Error fetching recurring for item ${item.id}:`, itemError?.response?.data || itemError);
        }
      }

      res.json({ recurring: allRecurring });
    } catch (error) {
      console.error("Error fetching recurring transactions:", error);
      res.status(500).json({ error: "Failed to fetch recurring transactions" });
    }
  });

  // Get transactions with optional filters
  // FEATURE: TRANSACTION_HISTORY | tier: free | limit: 90 days (free), unlimited (pro/family)
  // FEATURE: TRANSACTION_SEARCH | tier: free | limit: unlimited
  app.get("/api/plaid/transactions", requireAuth, async (req, res) => {
    try {
      const accounts = await storage.getAllPlaidAccounts(req.session.userId!);
      // Only include explicitly active accounts (isActive === "true") to prevent double-counting
      const activeAccounts = accounts.filter(a => a.isActive === "true");
      const accountIds = activeAccounts.map(a => a.id);

      const options: { startDate?: string; endDate?: string } = {};
      if (req.query.startDate) options.startDate = req.query.startDate as string;
      if (req.query.endDate) options.endDate = req.query.endDate as string;

      let transactions = await storage.getPlaidTransactions(accountIds, options);

      // Filter by matchType if specified
      if (req.query.matchType) {
        const matchType = req.query.matchType as string;
        transactions = transactions.filter(t => t.matchType === matchType);
      }

      res.json(transactions);
    } catch (error) {
      console.error("Error getting transactions:", error);
      res.status(500).json({ error: "Failed to get transactions" });
    }
  });

  // Get transaction category taxonomy
  app.get("/api/transactions/categories", requireAuth, async (_req, res) => {
    try {
      const { getAllCategories, CATEGORY_TAXONOMY } = await import("./merchant-categories");
      res.json({ categories: getAllCategories(), taxonomy: CATEGORY_TAXONOMY });
    } catch (error) {
      console.error("Error getting category taxonomy:", error);
      res.status(500).json({ error: "Failed to get categories" });
    }
  });

  // Correct category for a transaction (Plaid, MX, or Manual)
  app.patch("/api/transactions/:id/category", requireAuth, async (req, res) => {
    try {
      const id = req.params.id as string;
      const { category, subcategory, merchantName, transactionType } = req.body as {
        category: string;
        subcategory?: string;
        merchantName?: string;
        transactionType?: 'plaid' | 'mx' | 'manual';
      };
      const userId = req.session.userId!;
      if (!category) return res.status(400).json({ error: "category is required" });

      const pool = (db as any).$client as import('pg').Pool;
      const type = transactionType || 'plaid';

      if (type === 'plaid') {
        // Verify ownership via account
        const check = await pool.query(
          `SELECT pt.id FROM plaid_transactions pt
           JOIN plaid_accounts pa ON pa.id = pt.plaid_account_id
           JOIN plaid_items pi ON pi.id = pa.plaid_item_id
           WHERE pt.id = $1 AND pi.user_id = $2`,
          [id, userId]
        );
        if (check.rows.length === 0) return res.status(404).json({ error: "Transaction not found" });

        const updateFields: string[] = [
          'category = $1',
          'subcategory = $2',
          'enrichment_source = $3',
          'enrichment_confidence = $4',
        ];
        const values: unknown[] = [category, subcategory || null, 'user_correction', '1.00'];
        if (merchantName) { updateFields.push(`merchant_clean_name = $${values.length + 1}`); values.push(merchantName); }
        values.push(id);
        const { rows } = await pool.query(
          `UPDATE plaid_transactions SET ${updateFields.join(', ')} WHERE id = $${values.length} RETURNING *`,
          values
        );

        // Update enrichment cache
        if (check.rows.length > 0) {
          const tx = await pool.query(`SELECT name FROM plaid_transactions WHERE id = $1`, [id]);
          if (tx.rows.length > 0) {
            const normalized = (tx.rows[0].name as string).toUpperCase().replace(/\s+/g, ' ').trim();
            await pool.query(
              `UPDATE merchant_enrichment SET category = $1, subcategory = $2, source = 'user_correction', confidence = 1.0 WHERE raw_pattern = $3`,
              [category, subcategory || null, normalized]
            ).catch(() => {});
          }
        }

        return res.json(rows[0]);
      } else if (type === 'mx') {
        const check = await pool.query(
          `SELECT mt.id FROM mx_transactions mt
           JOIN mx_accounts ma ON ma.id = mt.mx_account_id
           JOIN mx_members mm ON mm.id = ma.member_id
           WHERE mt.id = $1 AND mm.user_id = $2`,
          [id, userId]
        );
        if (check.rows.length === 0) return res.status(404).json({ error: "Transaction not found" });

        const updateFields: string[] = ['category = $1', 'subcategory = $2', 'enrichment_source = $3', 'enrichment_confidence = $4'];
        const values: unknown[] = [category, subcategory || null, 'user_correction', '1.00'];
        if (merchantName) { updateFields.push(`merchant_clean_name = $${values.length + 1}`); values.push(merchantName); }
        values.push(id);
        const { rows } = await pool.query(
          `UPDATE mx_transactions SET ${updateFields.join(', ')} WHERE id = $${values.length} RETURNING *`,
          values
        );
        return res.json(rows[0]);
      } else {
        // manual transaction
        const check = await pool.query(
          `SELECT id FROM manual_transactions WHERE id = $1 AND user_id = $2`,
          [id, userId]
        );
        if (check.rows.length === 0) return res.status(404).json({ error: "Transaction not found" });

        const updateFields: string[] = ['category = $1', 'subcategory = $2', 'enrichment_source = $3', 'enrichment_confidence = $4'];
        const values: unknown[] = [category, subcategory || null, 'user_correction', '1.00'];
        if (merchantName) { updateFields.push(`merchant_clean_name = $${values.length + 1}`); values.push(merchantName); }
        values.push(id);
        const { rows } = await pool.query(
          `UPDATE manual_transactions SET ${updateFields.join(', ')} WHERE id = $${values.length} RETURNING *`,
          values
        );
        return res.json(rows[0]);
      }
    } catch (error) {
      console.error("Error updating transaction category:", error);
      res.status(500).json({ error: "Failed to update category" });
    }
  });

  // FEATURE: UNMATCHED_TRANSACTIONS | tier: free | limit: unlimited
  // Get unmatched transactions
  app.get("/api/plaid/transactions/unmatched", requireAuth, async (req, res) => {
    try {
      const accounts = await storage.getAllPlaidAccounts(req.session.userId!);
      // Only include explicitly active accounts (isActive === "true")
      const activeAccounts = accounts.filter(a => a.isActive === "true");
      const accountIds = activeAccounts.map(a => a.id);
      const transactions = await storage.getUnmatchedTransactions(accountIds);
      res.json(transactions);
    } catch (error) {
      console.error("Error getting unmatched transactions:", error);
      res.status(500).json({ error: "Failed to get unmatched transactions" });
    }
  });

  // Manually reconcile a transaction
  app.post("/api/plaid/transactions/:id/reconcile", requireAuth, async (req, res) => {
    try {
      const id = req.params.id as string;
      const { matchType, matchedId, personalCategory, updateIncomeAmount } = req.body;

      if (!matchType || !["bill", "expense", "income", "unmatched", "transfer"].includes(matchType)) {
        return res.status(400).json({ error: "Invalid matchType" });
      }

      const updates: Partial<any> = {
        matchType,
        reconciled: "true",
        matchedBillId: null,
        matchedExpenseId: null,
        matchedIncomeId: null,
      };

      if (matchType === "bill" && matchedId) updates.matchedBillId = matchedId;
      if (matchType === "expense" && matchedId) updates.matchedExpenseId = matchedId;
      if (matchType === "income" && matchedId) updates.matchedIncomeId = matchedId;
      if (matchType === "transfer") updates.isTransfer = "true";
      if (personalCategory) updates.personalCategory = personalCategory;

      const transaction = await storage.updatePlaidTransaction(id, updates);
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      // If reconciling as income and user wants to update the income entry
      let updatedIncome = null;
      if (matchType === "income" && matchedId && updateIncomeAmount) {
        // Get the transaction amount (Plaid uses negative for deposits)
        const txAmount = Math.abs(parseFloat(transaction.amount));
        
        // Update the matched income entry with the actual amount from the bank
        const income = await storage.getIncome(matchedId);
        if (income) {
          updatedIncome = await storage.updateIncome(matchedId, {
            amount: txAmount.toString(),
          });
        }
      }

      res.json({ transaction, updatedIncome });
    } catch (error) {
      console.error("Error reconciling transaction:", error);
      res.status(500).json({ error: "Failed to reconcile transaction" });
    }
  });

  // Create expense from unmatched transaction
  app.post("/api/plaid/transactions/:id/create-expense", requireAuth, async (req, res) => {
    try {
      const id = req.params.id as string;
      const { category } = req.body;

      // Get the transaction (include all accounts for reconciliation, not just active)
      const accounts = await storage.getAllPlaidAccounts(req.session.userId!);
      const accountIds = accounts.map(a => a.id);
      const allTransactions = await storage.getPlaidTransactions(accountIds);
      const transaction = allTransactions.find(t => t.id === id);

      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      // Create expense from transaction
      const expense = await storage.createExpense({
        userId: req.session.userId!,
        merchant: transaction.merchantName || transaction.name,
        amount: Math.abs(parseFloat(transaction.amount)).toString(),
        date: transaction.date,
        category: category || transaction.personalCategory || "Other",
        notes: `Imported from bank transaction`,
      });

      // Update the transaction to mark as matched
      await storage.updatePlaidTransaction(id, {
        matchType: "expense",
        matchedExpenseId: expense.id,
        reconciled: "true",
        personalCategory: category || transaction.personalCategory || "Other",
      });

      res.json({ expense, transaction: { id, matchType: "expense", matchedExpenseId: expense.id } });
    } catch (error) {
      console.error("Error creating expense from transaction:", error);
      res.status(500).json({ error: "Failed to create expense" });
    }
  });

  // Bulk create expenses from multiple transactions
  app.post("/api/plaid/transactions/bulk-create-expenses", requireAuth, async (req, res) => {
    try {
      const { transactionIds, category } = req.body;

      if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
        return res.status(400).json({ error: "transactionIds array is required" });
      }

      const accounts = await storage.getAllPlaidAccounts(req.session.userId!);
      // Only include explicitly active accounts (isActive === "true") for bulk operations
      const activeAccounts = accounts.filter(a => a.isActive === "true");
      const accountIds = activeAccounts.map(a => a.id);
      const allTransactions = await storage.getPlaidTransactions(accountIds);

      let created = 0;
      for (const txId of transactionIds) {
        const transaction = allTransactions.find(t => t.id === txId);
        if (!transaction) continue;

        const expenseCategory = category || transaction.personalCategory || "Other";

        const expense = await storage.createExpense({
          userId: req.session.userId!,
          merchant: transaction.merchantName || transaction.name,
          amount: Math.abs(parseFloat(transaction.amount)).toString(),
          date: transaction.date,
          category: expenseCategory,
          notes: `Imported from bank transaction`,
        });

        await storage.updatePlaidTransaction(txId, {
          matchType: "expense",
          matchedExpenseId: expense.id,
          reconciled: "true",
          personalCategory: expenseCategory,
        });
        created++;
      }

      res.json({ success: true, created });
    } catch (error) {
      console.error("Error bulk creating expenses:", error);
      res.status(500).json({ error: "Failed to create expenses" });
    }
  });

  // Disconnect a bank account (delete Plaid item)
  app.delete("/api/plaid/items/:id", requireAuth, async (req, res) => {
    try {
      const id = req.params.id as string;
      const item = await storage.getPlaidItem(id);

      if (!item || item.userId !== req.session.userId) {
        return res.status(404).json({ error: "Item not found" });
      }

      // Delete associated transactions first
      const accounts = await storage.getPlaidAccounts(id);
      for (const account of accounts) {
        const transactions = await storage.getPlaidTransactions([account.id]);
        for (const tx of transactions) {
          await storage.deleteRemovedTransactions([tx.transactionId]);
        }
      }

      // Delete accounts
      await storage.deletePlaidAccountsByItemId(id);

      // Delete the item
      await storage.deletePlaidItem(id);

      // Optionally remove from Plaid (best effort)
        try {
          const { plaidClient } = await import("./plaid");
          await plaidClient.itemRemove({ access_token: decrypt(item.accessToken) });
        } catch (e) {
          // Non-critical - item is already removed locally
        }

      auditLogFromRequest(req, {
        eventType: "data.bank_disconnected",
        eventCategory: "data",
        actorId: req.session.userId,
        action: "plaid_bank_disconnected",
        outcome: "success",
        metadata: { itemId: id, institutionName: item.institutionName },
      });
      res.status(204).send();
    } catch (error) {
      console.error("Error disconnecting bank account:", error);
      res.status(500).json({ error: "Failed to disconnect bank account" });
    }
  });

  // FEATURE: MX_BANK_CONNECTIONS | tier: free | limit: 1 connection
  // ==================== MX BANK INTEGRATION ROUTES ====================

  // Get MX Connect Widget URL
  app.get("/api/mx/connect-widget", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { createMXUser, getConnectWidgetUrl, getMXUser } = await import("./mx");
      
      let mxUserGuid = user.mxUserGuid;
      
      // Create MX user if doesn't exist
      if (!mxUserGuid) {
        const mxUser = await createMXUser(userId, user.email || undefined);
        mxUserGuid = mxUser.guid;
        await storage.updateUser(userId, { mxUserGuid });
      } else {
        // Verify MX user still exists
        const existingUser = await getMXUser(mxUserGuid);
        if (!existingUser) {
          const mxUser = await createMXUser(userId, user.email || undefined);
          mxUserGuid = mxUser.guid;
          await storage.updateUser(userId, { mxUserGuid });
        }
      }

      // Get existing member if updating
      const memberGuid = req.query.memberGuid as string | undefined;
      
      const widgetUrl = await getConnectWidgetUrl(mxUserGuid, memberGuid);
      res.json({ widgetUrl });
    } catch (error: any) {
      console.error("Error getting MX connect widget:", error);
      res.status(500).json({ error: error.message || "Failed to get connect widget" });
    }
  });

  // MX member connected - save member & accounts, then wait for webhook to deliver transactions
  app.post("/api/mx/members/:memberGuid/sync", requireAuth, apiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const memberGuid = req.params.memberGuid as string;
      
      if (!user?.mxUserGuid) {
        return res.status(400).json({ error: "MX user not configured" });
      }

      const { getMember, listAccounts, getInstitution, mapMXAccountType } = await import("./mx");
      
      // Get member details
      const mxMember = await getMember(user.mxUserGuid, memberGuid);
      if (!mxMember) {
        return res.status(404).json({ error: "Member not found" });
      }

      // Get institution details
      const institution = await getInstitution(mxMember.institution_code);
      
      // Create or update member record
      let existingMember = await storage.getMxMemberByGuid(memberGuid);
      if (!existingMember) {
        // Cumulative count check for total bank connections (MX + Plaid) BEFORE creating
        const limit = await getFeatureLimit(plan, "bank_connections");
        if (limit !== null) {
          const { rows } = await pool.query(
            `SELECT
               (SELECT COUNT(*) FROM plaid_items WHERE user_id = $1) +
               (SELECT COUNT(*) FROM mx_members WHERE user_id = $1) AS count`,
            [userId]
          );
          const currentCount = parseInt(rows[0]?.count || "0", 10);
          if (currentCount >= limit) {
            return res.status(402).json({
              feature: "mx_bank_connections",
              remaining: 0,
              resetDate: null,
              upgradeRequired: true,
            });
          }
        }

        existingMember = await storage.createMxMember({
          userId,
          memberGuid: mxMember.guid,
          institutionCode: mxMember.institution_code,
          institutionName: institution?.name || mxMember.name || "Unknown Bank",
          connectionStatus: mxMember.connection_status,
          isOauth: mxMember.is_oauth ? "true" : "false",
          aggregatedAt: mxMember.aggregated_at || null,
        });

        // Fix 9: Deactivate old MX members for same institution on reconnection
        const mxInstitutionCode = mxMember.institution_code;
        if (mxInstitutionCode && existingMember?.id) {
          try {
            const { mxMembers: mxMembersTable } = await import("../shared/schema");
            await db.update(mxMembersTable)
              .set({ connectionStatus: 'INACTIVE' })
              .where(and(
                eq(mxMembersTable.userId, userId),
                eq(mxMembersTable.institutionCode, mxInstitutionCode),
                ne(mxMembersTable.id, existingMember.id)
              ));
            console.log(`[MX Sync] Deactivated old members for institution ${mxInstitutionCode}`);
          } catch (deactivateErr) {
            console.warn(`[MX Sync] Could not deactivate old members:`, deactivateErr);
          }
        }
      } else {
        await storage.updateMxMember(existingMember.id, {
          connectionStatus: mxMember.connection_status,
          aggregatedAt: mxMember.aggregated_at || null,
        });
      }

      // Fetch and save accounts (no transaction sync — webhook will deliver transactions)
      const mxAccounts = await listAccounts(user.mxUserGuid, memberGuid);
      const syncedAccounts = [];

      for (const account of mxAccounts) {
        const existingAccount = await storage.getMxAccountByGuid(account.guid);
        const accountType = mapMXAccountType(account.type);
        
        const accountData = {
          mxMemberId: existingMember.id,
          accountGuid: account.guid,
          name: account.name,
          type: accountType,
          subtype: account.subtype || account.type,
          balance: account.balance?.toString() || "0",
          availableBalance: account.available_balance?.toString() || null,
          creditLimit: account.credit_limit?.toString() || null,
          apr: account.apr?.toString() || null,
          minimumPayment: account.minimum_payment?.toString() || null,
          paymentDueAt: account.payment_due_at || null,
          currencyCode: account.currency_code || "USD",
          isClosed: account.is_closed ? "true" : "false",
          isHidden: account.is_hidden ? "true" : "false",
          isActive: "true",
          mask: account.account_number?.slice(-4) || null,
        };

        if (existingAccount) {
          const updated = await storage.updateMxAccount(existingAccount.id, accountData);
          if (updated) syncedAccounts.push(updated);
        } else {
          const created = await storage.createMxAccount(accountData as any);
          syncedAccounts.push(created);
        }
      }

      // Return webhook-pending response — transactions will arrive via MX webhook
      res.json({
        success: true,
        member: {
          guid: existingMember.memberGuid,
          institutionName: existingMember.institutionName,
        },
        syncStatus: "pending_webhook",
        message: "Your accounts are connected. Transactions will appear within 2-3 minutes automatically.",
      });
    } catch (error: any) {
      console.error("Error syncing MX member:", error);
      res.status(500).json({ error: error.message || "Failed to sync member" });
    }
  });

  // MX manual sync fallback — use when webhook doesn't fire
  app.post('/api/mx/members/:memberGuid/sync-transactions', requireAuth, async (req, res) => {
    try {
      const { memberGuid } = req.params;
      const userId = req.session.userId!;

      const { and, eq } = await import("drizzle-orm");
      const { mxMembers: mxMembersTable } = await import("@shared/schema");

      const member = await db.query.mxMembers.findFirst({
        where: and(
          eq(mxMembersTable.memberGuid, memberGuid),
          eq(mxMembersTable.userId, userId)
        )
      });

      if (!member) {
        return res.status(404).json({ error: 'Member not found' });
      }

      const { syncMXTransactions } = await import("./mx");
      const result = await syncMXTransactions(
        userId,
        memberGuid,
        member.id
      );

      res.json({
        success: true,
        ...result,
        message: `Synced ${result.added} transactions`
      });

    } catch (error: any) {
      console.error('[MX Manual Sync] Error:', error);
      res.status(500).json({
        error: 'Sync failed',
        details: error?.message
      });
    }
  });

  // Sync MX transactions for all accounts
  app.post("/api/mx/transactions/sync", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      
      if (!user?.mxUserGuid) {
        return res.status(400).json({ error: "MX user not configured" });
      }

      const flagNeedsReview = user.prefNeedsReview !== false;

      const { fetchAllTransactions, mapMXCategory } = await import("./mx");
      
      // Fetch all transactions (default 3 years of history)
      const transactions = await fetchAllTransactions(user.mxUserGuid);
      
      // Get account mappings
      const accounts = await storage.getMxAccountsByUserId(userId);
      const accountMap = new Map(accounts.map(a => [a.accountGuid, a.id]));

      // Prepare transactions for upsert
      const toUpsert: any[] = [];
      
      for (const tx of transactions) {
        const mxAccountId = accountMap.get(tx.account_guid);
        if (!mxAccountId) continue; // Skip if account not linked

        toUpsert.push({
          mxAccountId,
          transactionGuid: tx.guid,
          date: tx.date,
          amount: tx.amount.toString(),
          description: tx.description,
          originalDescription: tx.original_description,
          category: mapMXCategory(tx.top_level_category, tx.category, tx.type === "CREDIT" || tx.is_income === true || tx.amount < 0),
          topLevelCategory: tx.top_level_category,
          type: tx.type, // DEBIT or CREDIT
          status: tx.status,
          isBillPay: tx.is_bill_pay ? "true" : "false",
          isDirectDeposit: tx.is_direct_deposit ? "true" : "false",
          isExpense: tx.is_expense ? "true" : "false",
          isIncome: tx.is_income ? "true" : "false",
          isRecurring: tx.is_recurring ? "true" : "false",
          isSubscription: tx.is_subscription ? "true" : "false",
          merchantGuid: tx.merchant_guid || null,
          transactedAt: tx.transacted_at,
          postedAt: tx.posted_at || null,
          pending: tx.status === "PENDING" ? "true" : "false",
          matchType: "unmatched",
          needsReview: flagNeedsReview && (!tx.category || tx.category === "Uncategorized") ? true : false,
        });
      }

      // Batch upsert
      await storage.upsertMxTransactions(toUpsert);

      res.json({ 
        synced: toUpsert.length,
        message: `Synced ${toUpsert.length} transactions (up to 3 years of history)`
      });
    } catch (error: any) {
      console.error("Error syncing MX transactions:", error);
      res.status(500).json({ error: error.message || "Failed to sync transactions" });
    }
  });

  // Get MX members (bank connections)
  app.get("/api/mx/members", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const members = await storage.getMxMembers(userId);
      
      // Get accounts for each member
      const membersWithAccounts = await Promise.all(
        members.map(async (member) => {
          const accounts = await storage.getMxAccounts(member.id);
          return { ...member, accounts };
        })
      );

      res.json(membersWithAccounts);
    } catch (error: any) {
      console.error("Error getting MX members:", error);
      res.status(500).json({ error: error.message || "Failed to get members" });
    }
  });

  // Get MX accounts
  app.get("/api/mx/accounts", requireAuth, async (req, res) => {
    try {
      const accounts = await storage.getMxAccountsByUserId(req.session.userId!);
      res.json(accounts);
    } catch (error: any) {
      console.error("Error getting MX accounts:", error);
      res.status(500).json({ error: error.message || "Failed to get accounts" });
    }
  });

  // Toggle MX account active status
  app.patch("/api/mx/accounts/:id/toggle", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const accounts = await storage.getMxAccountsByUserId(userId);
      const account = accounts.find(a => a.id === req.params.id);
      
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      const newActive = account.isActive === "true" ? "false" : "true";
      const updated = await storage.updateMxAccount((req.params.id as string), { isActive: newActive });
      res.json(updated);
    } catch (error: any) {
      console.error("Error toggling MX account:", error);
      res.status(500).json({ error: "Failed to toggle account" });
    }
  });

  // Get MX transactions
  app.get("/api/mx/transactions", requireAuth, async (req, res) => {
    try {
      const accounts = await storage.getMxAccountsByUserId(req.session.userId!);
      const activeAccounts = accounts.filter(a => a.isActive === "true");
      const accountIds = activeAccounts.map(a => a.id);

      const options: { startDate?: string; endDate?: string } = {};
      if (req.query.startDate) options.startDate = req.query.startDate as string;
      if (req.query.endDate) options.endDate = req.query.endDate as string;

      const transactions = await storage.getMxTransactions(accountIds, options);
      res.json(transactions);
    } catch (error: any) {
      console.error("Error getting MX transactions:", error);
      res.status(500).json({ error: "Failed to get transactions" });
    }
  });

  // Delete MX member and associated data
  app.delete("/api/mx/members/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const member = await storage.getMxMember((req.params.id as string));
      
      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }

      // Get accounts to delete transactions
      const accounts = await storage.getMxAccounts(member.id);
      for (const account of accounts) {
        await storage.deleteMxTransactionsByAccountId(account.id);
      }
      
      // Delete accounts
      await storage.deleteMxAccountsByMemberId(member.id);
      
      // Delete member
      await storage.deleteMxMember(member.id);

      // Optionally delete from MX (best effort)
      if (user?.mxUserGuid) {
        try {
          const { deleteMember } = await import("./mx");
          await deleteMember(user.mxUserGuid, member.memberGuid);
        } catch (e) {
          // Non-critical
        }
      }

      auditLogFromRequest(req, {
        eventType: "data.bank_disconnected",
        eventCategory: "data",
        actorId: req.session.userId,
        action: "mx_bank_disconnected",
        outcome: "success",
        metadata: { memberId: member.id },
      });
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting MX member:", error);
      res.status(500).json({ error: "Failed to delete member" });
    }
  });

  // Refresh MX member connection
  app.post("/api/mx/members/:id/refresh", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const member = await storage.getMxMember((req.params.id as string));
      
      if (!member) {
        return res.status(404).json({ error: "Member not found" });
      }

      if (!user?.mxUserGuid) {
        return res.status(400).json({ error: "MX user not configured" });
      }

      const { aggregateMember } = await import("./mx");
      const result = await aggregateMember(user.mxUserGuid, member.memberGuid);
      
      await storage.updateMxMember(member.id, {
        connectionStatus: result.connection_status,
        aggregatedAt: new Date().toISOString(),
      });

      res.json({ message: "Refresh initiated", status: result.connection_status });
    } catch (error: any) {
      console.error("Error refreshing MX member:", error);
      res.status(500).json({ error: error.message || "Failed to refresh" });
    }
  });

  // FEATURE: AI_ASSISTANT | tier: free | limit: 10 messages/month (free), unlimited (pro/family)
  // ==================== AI ASSISTANT ROUTES ====================

  // Chat with AI assistant
  app.post("/api/ai/chat", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "ai_assistant");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "ai_assistant",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      const { messages } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array is required" });
      }

      // ── Fetch user financial data for context ──────────────────────────────
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        .toISOString().split("T")[0];
      const today = now.toISOString().split("T")[0];

      // Fetch all financial data in parallel
      const [bills, incomes, budgets, savingsGoals] = await Promise.all([
        storage.getBills(userId),
        storage.getIncomes(userId),
        storage.getBudgetsByMonth(userId, currentMonth),
        storage.getSavingsGoals(userId),
      ]);

      // Fetch recent transactions (Plaid + MX)
      let recentTransactions: any[] = [];
      let accountBalances: { name: string; type: string; balance: string }[] = [];

      try {
        // Plaid accounts & transactions
        const plaidItems = await storage.getPlaidItems(userId);
        if (plaidItems.length > 0) {
          const allPlaidAccounts = (
            await Promise.all(plaidItems.map(item => storage.getPlaidAccounts(item.id)))
          ).flat();
          const activePlaidAccounts = allPlaidAccounts.filter(a => a.isActive === "true");

          // Collect balances
          for (const acc of activePlaidAccounts) {
            accountBalances.push({
              name: acc.name,
              type: acc.type || "depository",
              balance: acc.balanceCurrent || "0",
            });
          }

          const plaidAccountIds = activePlaidAccounts.map(a => a.id);
          if (plaidAccountIds.length > 0) {
            const plaidTxns = await storage.getPlaidTransactions(plaidAccountIds, {
              startDate: thirtyDaysAgo,
              endDate: today,
            });
            recentTransactions.push(
              ...plaidTxns
                .filter(t => t.pending !== "true")
                .map(t => ({
                  date: t.date,
                  description: t.merchantName || t.name,
                  amount: parseFloat(t.amount),
                  category: t.personalCategory || t.category || "Other",
                  type: parseFloat(t.amount) > 0 ? "expense" : "income",
                }))
            );
          }
        }

        // MX accounts & transactions
        const mxAccounts = await storage.getMxAccountsByUserId(userId);
        const activeMxAccounts = mxAccounts.filter(a => a.isActive === "true");
        for (const acc of activeMxAccounts) {
          accountBalances.push({
            name: acc.name,
            type: acc.type || "depository",
            balance: acc.balance || "0",
          });
        }
        if (activeMxAccounts.length > 0) {
          const mxTxns = await storage.getMxTransactions(
            activeMxAccounts.map(a => a.id),
            { startDate: thirtyDaysAgo, endDate: today }
          );
          recentTransactions.push(
            ...mxTxns.map(t => ({
              date: t.date,
              description: t.description,
              amount: parseFloat(t.amount),
              category: t.personalCategory || t.category || "Other",
              type: t.type === "CREDIT" ? "income" : "expense",
            }))
          );
        }
      } catch (dataErr) {
        console.warn("[AI Chat] Could not fetch bank data (non-fatal):", dataErr);
      }

      // Sort transactions by date descending, cap at 100
      recentTransactions.sort((a, b) => b.date.localeCompare(a.date));
      recentTransactions = recentTransactions.slice(0, 100);

      // ── Build financial context system prompt ──────────────────────────────
      const upcomingBills = bills
        .filter(b => b.isPaused !== "true")
        .map(b => ({
          name: b.name,
          amount: parseFloat(b.amount),
          dueDay: b.dueDay,
          category: b.category,
          recurrence: b.recurrence,
        }));

      const activeIncomes = incomes
        .filter(i => i.isActive !== "false")
        .map(i => ({
          source: i.source,
          amount: parseFloat(i.amount),
          category: i.category,
          recurrence: i.recurrence,
        }));

      const budgetStatus = budgets.map(b => ({
        category: b.category,
        budgeted: parseFloat(b.amount),
        month: b.month,
      }));

      const goalsProgress = savingsGoals.map(g => ({
        name: g.name,
        target: parseFloat(g.targetAmount),
        current: parseFloat(g.currentAmount),
        percentComplete: g.targetAmount
          ? Math.round((parseFloat(g.currentAmount) / parseFloat(g.targetAmount)) * 100)
          : 0,
      }));

      // Summarise spending by category for the last 30 days
      const spendingByCategory: Record<string, number> = {};
      for (const tx of recentTransactions) {
        if (tx.type === "expense" && tx.amount > 0) {
          spendingByCategory[tx.category] =
            (spendingByCategory[tx.category] || 0) + tx.amount;
        }
      }
      const totalSpent30d = Object.values(spendingByCategory).reduce((s, v) => s + v, 0);
      const totalIncome30d = recentTransactions
        .filter(t => t.type === "income")
        .reduce((s, t) => s + Math.abs(t.amount), 0);

      const totalBalance = accountBalances.reduce(
        (s, a) => s + parseFloat(a.balance || "0"), 0
      );

      const financialContextSystem = `You are BudgetBot, the AI financial assistant built into BudgetSmart — a Canadian AI-powered personal finance platform at budgetsmart.io. You have deep knowledge of BudgetSmart's features AND full access to this user's real financial data.

## ABOUT BUDGETSMART
BudgetSmart is a Canadian AI-powered personal finance app that helps users take control of their money. Key features include:
- **Dashboard**: Real-time overview of balances, spending, income, and net worth
- **Budget Management**: Set monthly category budgets, track actuals vs budgeted, get overspend alerts
- **Transaction Tracking**: Auto-import from connected bank accounts, manual entry, category tagging, receipt scanning
- **Bank Connections**: Connect Canadian and US banks via Plaid or MX (never stores banking credentials)
- **Bills & Reminders**: Track recurring bills, get email reminders before due dates, mark as paid
- **Savings Goals**: Set and track progress toward financial goals (emergency fund, vacation, down payment, etc.)
- **AI Financial Assistant**: Personalized advice based on your real data (that's me!)
- **AI Daily Coach**: Proactive daily financial tips and insights
- **Investment Portfolio Tracking**: Track holdings, cost basis, gains/losses, AI-powered portfolio advice
- **Receipt Scanning**: Upload receipts and auto-extract merchant, amount, date, and category
- **Financial Vault**: Encrypted document storage (AES-256-GCM) for tax docs, insurance, contracts
- **Reports & Analytics**: Spending trends, income vs expense charts, category breakdowns, exportable reports
- **TaxSmart**: AI-powered Canadian tax optimization (TFSA, RRSP, FHSA guidance)
- **Cash Flow Forecasting**: Predict future balances based on bills and income patterns
- **Anomaly Detection**: Alerts for unusual spending or duplicate charges
- **Multi-currency Support**: Track accounts in different currencies with live exchange rates
- **Security**: AES-256-GCM field-level encryption, SOC 2 compliance (targeting August 2026), account lockout after 5 failed attempts, 2FA support
- **Plans**: Free tier (limited features), Pro ($9.99/month), Family ($14.99/month)
- **Support**: support@budgetsmart.io, in-app support tickets

You have FULL access to the user's real financial data shown below. Use this data to give specific, accurate, and personalized answers. Never say you don't have access to their financial information. When asked about BudgetSmart features, answer confidently from the product knowledge above.

TODAY'S DATE: ${today}
CURRENT MONTH: ${currentMonth}

## ACCOUNT BALANCES
${accountBalances.length > 0
  ? accountBalances.map(a => `- ${a.name} (${a.type}): $${parseFloat(a.balance).toFixed(2)}`).join("\n")
  : "No bank accounts connected yet."}
Total Balance: $${totalBalance.toFixed(2)}

## INCOME SOURCES
${activeIncomes.length > 0
  ? activeIncomes.map(i => `- ${i.source}: $${i.amount.toFixed(2)} (${i.recurrence || "monthly"})`).join("\n")
  : "No income sources recorded."}

## BILLS & RECURRING EXPENSES
${upcomingBills.length > 0
  ? upcomingBills.map(b => `- ${b.name}: $${b.amount.toFixed(2)} due day ${b.dueDay} (${b.recurrence}, ${b.category})`).join("\n")
  : "No bills recorded."}

## BUDGET STATUS (${currentMonth})
${budgetStatus.length > 0
  ? budgetStatus.map(b => `- ${b.category}: $${b.budgeted.toFixed(2)} budgeted`).join("\n")
  : "No budgets set for this month."}

## SAVINGS GOALS
${goalsProgress.length > 0
  ? goalsProgress.map(g => `- ${g.name}: $${g.current.toFixed(2)} / $${g.target.toFixed(2)} (${g.percentComplete}% complete)`).join("\n")
  : "No savings goals set."}

## SPENDING SUMMARY (Last 30 Days)
Total Spent: $${totalSpent30d.toFixed(2)}
Total Income Received: $${totalIncome30d.toFixed(2)}
Net: $${(totalIncome30d - totalSpent30d).toFixed(2)}
${Object.entries(spendingByCategory)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 10)
  .map(([cat, amt]) => `- ${cat}: $${amt.toFixed(2)}`)
  .join("\n")}

## RECENT TRANSACTIONS (Last 30 Days — up to 100)
${recentTransactions.slice(0, 50).map(t =>
  `- ${t.date} | ${t.description} | $${Math.abs(t.amount).toFixed(2)} | ${t.category} | ${t.type}`
).join("\n") || "No recent transactions found."}

Provide clear, specific, and actionable financial advice based on the data above. Format responses with headers and bullet points where helpful. Always reference actual numbers from the user's data.`;

      const { bedrockChat } = await import("./lib/bedrock");

      // Filter out any system messages from the client (we build our own)
      const chatMsgs = messages.filter((m: any) => m.role !== "system");

      const content = await bedrockChat({
        feature: "ai_assistant",
        messages: chatMsgs,
        system: financialContextSystem,
        maxTokens: 1500,
        temperature: 0.7,
      });

      // Return { message: "..." } so the frontend's data.response field works,
      // AND include { content: "..." } for any callers that use the new field.
      res.json({ message: content, response: content, content, role: "assistant" });
    } catch (error: any) {
      console.error("AI chat error:", error);
      res.status(500).json({ error: error.message || "Failed to get AI response" });
    }
  });

  // Get suggested prompts
  app.get("/api/ai/suggestions", requireAuth, async (_req, res) => {
    res.json([
      { label: "Monthly Summary", prompt: "Give me a summary of my finances this month" },
      { label: "Spending Analysis", prompt: "What are my top spending categories and how can I reduce them?" },
      { label: "Upcoming Bills", prompt: "What bills do I have coming up in the next 30 days?" },
      { label: "Savings Progress", prompt: "How am I doing on my savings goals?" },
      { label: "Income vs Expenses", prompt: "Compare my income vs expenses for this month" },
      { label: "Spending Trends", prompt: "Show me my spending trends over the last 3 months" },
      { label: "Budget Check", prompt: "Am I staying within my budgets this month?" },
      { label: "Bank Balance", prompt: "What are my current bank account balances?" },
      { label: "Reduce Spending", prompt: "Where can I cut back on spending based on my transaction history?" },
      { label: "Financial Health", prompt: "Give me an overall assessment of my financial health" },
    ]);
  });

  // ============ AI FORECAST & BUDGET SUGGESTIONS ============

  app.post("/api/ai/forecast", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "cash_flow_forecast");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "cash_flow_forecast",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      // Gather 12 months of data
      const now = new Date();
      const startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().split("T")[0];
      const endDate = now.toISOString().split("T")[0];

      // Get Plaid transactions
      const accounts = await storage.getAllPlaidAccounts(userId);
      const accountIds = accounts.map(a => a.id);
      let plaidTransactions: any[] = [];
      if (accountIds.length > 0) {
        plaidTransactions = await storage.getPlaidTransactions(accountIds, { startDate, endDate });
      }

      // Get manual expenses
      const allExpenses = await storage.getExpenses(userId);
      const manualExpenses = allExpenses.filter(e => {
        const d = e.date;
        return d >= startDate && d <= endDate;
      });

      // Merge: use Plaid debits + manual expenses not matched by Plaid
      const matchedExpenseIds = new Set(
        plaidTransactions
          .filter(t => t.matchedExpenseId)
          .map(t => t.matchedExpenseId)
      );

      const merged: { date: string; amount: number; category: string }[] = [];

      // Add Plaid debits (positive amounts = expenses)
      for (const t of plaidTransactions) {
        if (t.pending === "true") continue;
        const amt = parseFloat(t.amount);
        if (amt > 0) {
          merged.push({
            date: t.date,
            amount: amt,
            category: t.personalCategory || t.category || "Other",
          });
        }
      }

      // Add manual expenses not already matched
      for (const e of manualExpenses) {
        if (matchedExpenseIds.has(e.id)) continue;
        merged.push({
          date: e.date,
          amount: parseFloat(e.amount),
          category: e.category || "Other",
        });
      }

      // Group by month and category
      const monthlyData: Record<string, Record<string, number>> = {};
      for (const item of merged) {
        const month = item.date.substring(0, 7); // yyyy-MM
        if (!monthlyData[month]) monthlyData[month] = {};
        monthlyData[month][item.category] = (monthlyData[month][item.category] || 0) + item.amount;
      }

      const historical = Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, categories]) => ({
          month,
          totalSpending: Object.values(categories).reduce((s, v) => s + v, 0),
          categories,
        }));

      if (historical.length < 3) {
        return res.status(400).json({ error: "At least 3 months of spending data required for forecasting." });
      }

      const { routeAI } = await import("./ai-router");

      const forecastPrompt = `You are a financial analyst AI. Analyze the following historical spending data by month and category, then forecast spending for the next 12 months.

Historical spending data (by month and category):
${JSON.stringify(historical)}

Today's date: ${now.toISOString().split("T")[0]}

Provide your response as a JSON object with this exact structure:
{
  "forecast": [
    {
      "month": "yyyy-MM",
      "totalSpending": number,
      "categories": { "CategoryName": number }
    }
  ],
  "insights": [
    {
      "category": "CategoryName",
      "trend": "increasing" | "decreasing" | "stable",
      "percentChange": number,
      "insight": "Human-readable explanation"
    }
  ],
  "overallTrend": "increasing" | "decreasing" | "stable",
  "summary": "2-3 sentence overall summary of spending patterns and forecast"
}

Rules:
- The forecast array must contain exactly 12 entries for the next 12 months starting from the month after today
- Account for seasonal patterns (e.g., holiday spending in December, summer travel)
- Only include categories that appeared in the historical data
- percentChange is relative to the 12-month average for that category
- Provide insights only for the top categories by total spending
- Use the historical category names exactly as provided
- All amounts should be positive numbers rounded to 2 decimal places`;

      const { withAITimeout } = await import("./timeout");
      
      const aiRes = await withAITimeout(() => routeAI({
        taskSlot: "planning_advisor",
        userId: req.session.userId!,
        featureContext: "budget_forecast",
        jsonMode: true,
        temperature: 0.3,
        maxTokens: 4000,
        messages: [
          { role: "system", content: "You are a financial forecasting AI. Always respond with valid JSON." },
          { role: "user", content: forecastPrompt },
        ],
      }));

      const resultText = aiRes.content || "{}";
      let parsed: any;
      try {
        parsed = JSON.parse(resultText);
      } catch {
        parsed = { forecast: [], insights: [], overallTrend: "stable", summary: "Unable to generate forecast." };
      }

      if (!Array.isArray(parsed.forecast)) parsed.forecast = [];
      if (!Array.isArray(parsed.insights)) parsed.insights = [];

      res.json({
        historical,
        forecast: parsed.forecast,
        insights: parsed.insights,
        overallTrend: parsed.overallTrend || "stable",
        summary: parsed.summary || "",
      });
    } catch (error: any) {
      console.error("Forecast error:", error);
      res.status(500).json({ error: error.message || "Failed to generate forecast" });
    }
  });

  // FEATURE: AI_BUDGET_SUGGESTIONS | tier: free | limit: 5 requests/month (free), unlimited (pro/family)
  app.post("/api/ai/suggest-budgets", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "ai_budget_suggestions");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "ai_budget_suggestions",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      const { month } = req.body;

      // Determine target month and 6-month analysis window
      const targetMonth = month || new Date().toISOString().substring(0, 7);
      const [targetYear, targetMon] = targetMonth.split("-").map(Number);
      const startDate = new Date(targetYear, targetMon - 7, 1).toISOString().split("T")[0];
      const endDate = new Date(targetYear, targetMon - 1, 0).toISOString().split("T")[0]; // End of month before target

      // Get Plaid transactions
      const accounts = await storage.getAllPlaidAccounts(userId);
      const accountIds = accounts.map(a => a.id);
      let plaidTransactions: any[] = [];
      if (accountIds.length > 0) {
        plaidTransactions = await storage.getPlaidTransactions(accountIds, { startDate, endDate });
      }

      // Get manual expenses
      const allExpenses = await storage.getExpenses(userId);
      const manualExpenses = allExpenses.filter(e => e.date >= startDate && e.date <= endDate);

      // Merge avoiding double-counting
      const matchedExpenseIds = new Set(
        plaidTransactions.filter(t => t.matchedExpenseId).map(t => t.matchedExpenseId)
      );

      const merged: { date: string; amount: number; category: string }[] = [];
      for (const t of plaidTransactions) {
        if (t.pending === "true") continue;
        const amt = parseFloat(t.amount);
        if (amt > 0) {
          merged.push({ date: t.date, amount: amt, category: t.personalCategory || t.category || "Other" });
        }
      }
      for (const e of manualExpenses) {
        if (matchedExpenseIds.has(e.id)) continue;
        merged.push({ date: e.date, amount: parseFloat(e.amount), category: e.category || "Other" });
      }

      // Group by category and month
      const categoryMonthly: Record<string, Record<string, number>> = {};
      for (const item of merged) {
        const m = item.date.substring(0, 7);
        if (!categoryMonthly[item.category]) categoryMonthly[item.category] = {};
        categoryMonthly[item.category][m] = (categoryMonthly[item.category][m] || 0) + item.amount;
      }

      // Build category summaries
      const categorySummaries: any[] = [];
      const allMonths = Array.from(new Set(merged.map(i => i.date.substring(0, 7)))).sort();
      const analysisMonths = allMonths.length;

      for (const [category, months] of Object.entries(categoryMonthly)) {
        if (!EXPENSE_CATEGORIES.includes(category as any)) continue;
        const amounts = Object.values(months);
        const avg = amounts.reduce((s, v) => s + v, 0) / amounts.length;
        const sortedMonths = Object.entries(months).sort(([a], [b]) => a.localeCompare(b));
        const lastAmount = sortedMonths.length > 0 ? sortedMonths[sortedMonths.length - 1][1] : 0;
        const firstAmount = sortedMonths.length > 0 ? sortedMonths[0][1] : 0;
        const trend = lastAmount > avg * 1.1 ? "increasing" : lastAmount < avg * 0.9 ? "decreasing" : "stable";

        categorySummaries.push({
          category,
          monthlyAverage: Math.round(avg * 100) / 100,
          monthlyMin: Math.min(...amounts),
          monthlyMax: Math.max(...amounts),
          monthsWithData: amounts.length,
          trend,
          lastMonthAmount: Math.round(lastAmount * 100) / 100,
        });
      }

      if (categorySummaries.length === 0) {
        return res.json({
          suggestions: [],
          overallAdvice: "No spending data found. Connect a bank account or add manual expenses to get AI budget suggestions.",
          analysisMonths: 0,
        });
      }

      // Get existing budgets for target month
      const existingBudgets = await storage.getBudgetsByMonth(userId, targetMonth);
      const existingCategories = existingBudgets.map(b => b.category);

      // Filter out categories that already have budgets
      const filteredSummaries = categorySummaries.filter(s => !existingCategories.includes(s.category));

      if (filteredSummaries.length === 0) {
        return res.json({
          suggestions: [],
          overallAdvice: "All your spending categories already have budgets set for this month.",
          analysisMonths,
        });
      }

      const { routeAI } = await import("./ai-router");

      const budgetPrompt = `You are a personal finance advisor. Based on the user's spending history, suggest appropriate monthly budget amounts for each category.

Spending history by category (last ${analysisMonths} months):
${JSON.stringify(filteredSummaries)}

Target budget month: ${targetMonth}
Available expense categories: ${JSON.stringify(EXPENSE_CATEGORIES)}

Provide your response as a JSON object with this exact structure:
{
  "suggestions": [
    {
      "category": "CategoryName",
      "suggestedAmount": number,
      "reasoning": "Brief explanation of why this amount",
      "confidence": "high" | "medium" | "low",
      "type": "necessity" | "discretionary" | "savings-opportunity"
    }
  ],
  "overallAdvice": "1-2 sentences of general budgeting advice based on this user's patterns"
}

Rules:
- Only suggest budgets for categories in the spending history provided
- For necessities (Groceries, Gas, Healthcare, Transportation, Mortgage, Electrical, Communications): suggest 5-10% above the monthly average to provide a buffer
- For discretionary spending (Entertainment, Shopping, Restaurant & Bars, Coffee Shops, Fun Money, Clothing): suggest 5-15% below average as a savings opportunity
- For other categories: suggest the monthly average rounded up
- Round all amounts to the nearest $5
- The "confidence" field should be "high" if 4+ months of data, "medium" if 2-3 months, "low" if 1 month
- Category names must exactly match one of the available categories provided
- suggestedAmount must be a positive number
- "type" should reflect whether the category is a necessity, discretionary, or has a savings-opportunity`;

      const aiRes = await routeAI({
        taskSlot: "planning_advisor",
        userId: req.session.userId!,
        featureContext: "budget_suggest",
        jsonMode: true,
        temperature: 0.3,
        maxTokens: 3000,
        messages: [
          { role: "system", content: "You are a budgeting advisor AI. Always respond with valid JSON." },
          { role: "user", content: budgetPrompt },
        ],
      });

      const resultText = aiRes.content || "{}";
      let parsed: any;
      try {
        parsed = JSON.parse(resultText);
      } catch {
        parsed = { suggestions: [], overallAdvice: "Unable to generate suggestions." };
      }

      // Validate suggestions
      const validSuggestions = (parsed.suggestions || []).filter((s: any) =>
        s.category &&
        EXPENSE_CATEGORIES.includes(s.category) &&
        typeof s.suggestedAmount === "number" &&
        s.suggestedAmount > 0
      );

      res.json({
        suggestions: validSuggestions,
        overallAdvice: parsed.overallAdvice || "",
        analysisMonths,
      });
    } catch (error: any) {
      console.error("Budget suggestion error:", error);
      res.status(500).json({ error: error.message || "Failed to generate budget suggestions" });
    }
  });

  // FEATURE: AI_SAVINGS_ADVISOR | tier: free | limit: 3 requests/month (free), unlimited (pro/family)
  // AI Savings Goal Advisor
  app.post("/api/ai/savings-advisor", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "ai_savings_advisor");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "ai_savings_advisor",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      const { goalName, targetAmount, currentAmount, targetDate } = req.body;

      if (!goalName) {
        return res.status(400).json({ error: "Goal name is required" });
      }

      // Gather user's financial data
      const now = new Date();
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];
      const today = now.toISOString().split("T")[0];

      // Get income
      const allIncome = await storage.getIncomes(userId);
      const recentIncome = allIncome.filter(i => i.date >= threeMonthsAgo);
      const monthlyIncome = recentIncome.reduce((sum, i) => sum + parseFloat(i.amount), 0) / 3;

      // Get expenses
      const allExpenses = await storage.getExpenses(userId);
      const recentExpenses = allExpenses.filter(e => e.date >= threeMonthsAgo);
      const monthlyExpenses = recentExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0) / 3;

      // Get bills
      const allBills = await storage.getBills(userId);
      const monthlyBills = allBills.reduce((sum, b) => sum + parseFloat(b.amount), 0);

      // Get Plaid transactions for spending patterns
      const accounts = await storage.getAllPlaidAccounts(userId);
      const accountIds = accounts.map(a => a.id);
      let plaidTransactions: any[] = [];
      if (accountIds.length > 0) {
        plaidTransactions = await storage.getPlaidTransactions(accountIds, { startDate: threeMonthsAgo, endDate: today });
      }
      const monthlyPlaidSpending = plaidTransactions
        .filter(t => parseFloat(t.amount) > 0 && t.pending !== "true")
        .reduce((sum, t) => sum + parseFloat(t.amount), 0) / 3;

      // Get existing savings goals
      const existingGoals = await storage.getSavingsGoals(userId);
      const existingGoalsSummary = existingGoals.map(g => ({
        name: g.name,
        target: g.targetAmount,
        current: g.currentAmount,
      }));

      // Categorize spending for actionable tips
      const categorySpending: Record<string, number> = {};
      for (const t of plaidTransactions) {
        if (parseFloat(t.amount) > 0 && t.pending !== "true") {
          const cat = t.personalCategory || t.category || "Other";
          categorySpending[cat] = (categorySpending[cat] || 0) + parseFloat(t.amount);
        }
      }
      for (const e of recentExpenses) {
        const cat = e.category || "Other";
        categorySpending[cat] = (categorySpending[cat] || 0) + parseFloat(e.amount);
      }
      // Convert to monthly averages
      const monthlyCategorySpending: Record<string, number> = {};
      for (const [cat, total] of Object.entries(categorySpending)) {
        monthlyCategorySpending[cat] = Math.round((total / 3) * 100) / 100;
      }

      const totalMonthlySpending = Math.max(monthlyExpenses + monthlyBills, monthlyPlaidSpending + monthlyBills);
      const estimatedMonthlySurplus = monthlyIncome - totalMonthlySpending;

      const { routeAI } = await import("./ai-router");

      const savingsPrompt = `You are a personal finance advisor helping a user plan their savings goal. Analyze their financial situation and provide a personalized savings plan.

USER'S SAVINGS GOAL:
- Goal: "${goalName}"
${targetAmount ? `- Target Amount: $${targetAmount}` : "- Target Amount: Not specified (please suggest one)"}
${currentAmount ? `- Currently Saved: $${currentAmount}` : "- Currently Saved: $0"}
${targetDate ? `- Target Date: ${targetDate}` : "- Target Date: Not specified (please suggest one)"}

USER'S FINANCIAL SNAPSHOT (monthly averages, last 3 months):
- Monthly Income: $${Math.round(monthlyIncome)}
- Monthly Expenses (manual): $${Math.round(monthlyExpenses)}
- Monthly Bills (recurring): $${Math.round(monthlyBills)}
- Monthly Bank Spending: $${Math.round(monthlyPlaidSpending)}
- Estimated Monthly Surplus: $${Math.round(estimatedMonthlySurplus)}

SPENDING BY CATEGORY (monthly averages):
${JSON.stringify(monthlyCategorySpending)}

EXISTING SAVINGS GOALS:
${existingGoalsSummary.length > 0 ? JSON.stringify(existingGoalsSummary) : "None"}

Provide your response as a JSON object with this exact structure:
{
  "recommendedMonthly": number (recommended monthly savings amount for this goal),
  "suggestedTarget": number (suggested target amount if not specified, or validate the given one),
  "suggestedTimelineMonths": number (months to reach the goal at recommended rate),
  "feasibility": "easy" | "moderate" | "challenging" | "difficult",
  "strategy": "Brief 1-2 sentence overall strategy",
  "actionPlan": [
    "Step 1: specific actionable advice",
    "Step 2: specific actionable advice",
    "Step 3: specific actionable advice"
  ],
  "savingsTips": [
    "Specific tip based on their spending data that could free up money",
    "Another specific tip",
    "Another specific tip"
  ],
  "potentialCutbacks": [
    { "category": "CategoryName", "currentMonthly": number, "suggestedMonthly": number, "monthlySavings": number }
  ],
  "milestones": [
    { "amount": number, "description": "Milestone description", "estimatedDate": "YYYY-MM" }
  ],
  "overallAdvice": "2-3 sentences of personalized advice for this specific goal"
}

Rules:
- recommendedMonthly should be realistic based on their surplus (no more than 60% of surplus if they have other goals)
- If surplus is negative or very low, acknowledge this and suggest ways to create room
- potentialCutbacks should only include categories where realistic reductions are possible
- Milestones should break the goal into 3-4 achievable checkpoints
- Be specific and actionable - reference their actual spending categories
- suggestedTimelineMonths should account for the currentAmount already saved
- If the goal seems unrealistic given their finances, say so honestly and suggest alternatives`;

      const aiRes = await routeAI({
        taskSlot: "planning_advisor",
        userId: req.session.userId!,
        featureContext: "savings_advisor",
        jsonMode: true,
        temperature: 0.4,
        maxTokens: 3000,
        messages: [
          { role: "system", content: "You are a savings advisor AI. Always respond with valid JSON. Be encouraging but realistic." },
          { role: "user", content: savingsPrompt },
        ],
      });

      const resultText = aiRes.content || "{}";
      let parsed: any;
      try {
        parsed = JSON.parse(resultText);
      } catch {
        parsed = { overallAdvice: "Unable to generate savings advice at this time." };
      }

      res.json({
        ...parsed,
        financialSnapshot: {
          monthlyIncome: Math.round(monthlyIncome),
          monthlySpending: Math.round(totalMonthlySpending),
          monthlySurplus: Math.round(estimatedMonthlySurplus),
        },
      });
    } catch (error: any) {
      console.error("Savings advisor error:", error);
      res.status(500).json({ error: error.message || "Failed to generate savings advice" });
    }
  });

  // ============ ONBOARDING ============

  app.get("/api/onboarding/status", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const analysis = await storage.getOnboardingAnalysis(userId);
      const plaidItemsList = await storage.getPlaidItems(userId);

      let currentStep = 1;
      if (plaidItemsList.length > 0) currentStep = 2;
      if (analysis?.analysisData && analysis.analysisData !== "{}") currentStep = 3;
      if (analysis?.step && analysis.step > currentStep) currentStep = analysis.step;

      res.json({
        onboardingComplete: user?.onboardingComplete === "true",
        currentStep,
        hasPlaidConnection: plaidItemsList.length > 0,
        hasAnalysis: !!analysis?.analysisData && analysis.analysisData !== "{}",
        analysisData: analysis?.analysisData ? JSON.parse(analysis.analysisData) : null,
      });
    } catch (error) {
      console.error("Error checking onboarding status:", error);
      res.status(500).json({ error: "Failed to check onboarding status" });
    }
  });

  app.post("/api/onboarding/complete", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;

        // For demo users, just return success without actually updating
        if ((req.session as any).isDemo) {
          return res.json({ success: true, demo: true });
        }

      const { progress } = req.body;
      await storage.updateUserOnboarding(userId, true, progress);

      // Create default spending alerts for new users
      try {
        const existingAlerts = await db.query.spendingAlerts.findMany({
          where: eq(spendingAlerts.userId, userId),
        });
        if (existingAlerts.length === 0) {
          await db.insert(spendingAlerts).values([
            {
              userId,
              alertType: "total_monthly",
              threshold: "10000",
              period: "monthly",
              notifyEmail: true,
              notifyInApp: true,
              isActive: true,
            },
            {
              userId,
              alertType: "single_transaction",
              threshold: "1000",
              period: "per_transaction",
              notifyEmail: true,
              notifyInApp: true,
              isActive: true,
            },
          ]);
        }
      } catch (alertErr) {
        console.error("[Onboarding] Failed to create default spending alerts (non-fatal):", alertErr);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error completing onboarding:", error);
      res.status(500).json({ error: "Failed to complete onboarding" });
    }
  });

  app.post("/api/onboarding/save-income-goal", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      if ((req.session as any).isDemo) return res.json({ success: true, demo: true });

      const { monthlyIncome, budgetCategory, budgetAmount } = req.body;
      const today = new Date().toISOString().split("T")[0];
      const month = today.slice(0, 7);

      if (monthlyIncome && parseFloat(String(monthlyIncome)) > 0) {
        await storage.createIncome({
          userId,
          source: "Monthly Income",
          amount: String(monthlyIncome),
          date: today,
          category: "Salary",
          isRecurring: "true",
          recurrence: "monthly",
          dueDay: 1,
        });
      }

      if (budgetCategory && budgetAmount && parseFloat(String(budgetAmount)) > 0) {
        const existing = await storage.getBudgetsByMonth(userId, month);
        const alreadyExists = existing.find(b => b.category === budgetCategory);
        if (!alreadyExists) {
          await storage.createBudget({
            userId,
            category: budgetCategory as any,
            amount: String(budgetAmount),
            month,
          });
        } else {
          await storage.updateBudget(alreadyExists.id, { amount: String(budgetAmount) });
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error saving income/goal:", error);
      res.status(500).json({ error: error.message || "Failed to save income and goal" });
    }
  });

  app.post("/api/onboarding/save-step", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { step } = req.body;
      const existing = await storage.getOnboardingAnalysis(userId);
      if (existing) {
        await storage.updateOnboardingAnalysis(userId, { step });
      } else {
        await storage.createOnboardingAnalysis({ userId, analysisData: "{}", step });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to save step" });
    }
  });

  app.post("/api/analyze-transactions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;

      const accounts = await storage.getAllPlaidAccounts(userId);
      const accountIds = accounts.map(a => a.id);

      if (accountIds.length === 0) {
        return res.status(400).json({ error: "No bank accounts connected" });
      }

      const transactions = await storage.getPlaidTransactions(accountIds);

      if (transactions.length === 0) {
        return res.status(400).json({ error: "No transactions found. Please sync your bank account first." });
      }

      // Include ALL transactions for full 12-month analysis - sort chronologically
      const sortedTransactions = [...transactions].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      // Map all transactions for comprehensive analysis
      const txSummary = sortedTransactions.map(t => ({
        date: t.date,
        name: t.name,
        merchantName: t.merchantName,
        amount: t.amount,
        category: t.category,
      }));

      console.log(`Analyzing ${txSummary.length} transactions for recurring patterns...`);

      const { routeAI } = await import("./ai-router");

      const INCOME_CATS = ["Salary", "Freelance", "Business", "Investments", "Rental", "Gifts", "Refunds", "Other"];
      const BILL_CATS = ["Rent", "Internet", "Phone", "Subscriptions", "Utilities", "Insurance", "Loans", "Transportation", "Shopping", "Fitness", "Communications", "Business Expense", "Electrical", "Credit Card", "Line of Credit", "Mortgage", "Entertainment", "Travel", "Maintenance", "Car", "Day Care", "Other"];

      const prompt = `Analyze the following ${txSummary.length} bank transactions spanning 12 months and identify ALL recurring patterns:

1. Recurring income sources (deposits/credits - negative amounts represent income/deposits)
2. Recurring bills/expenses (debits - positive amounts represent charges)

IMPORTANT: Thoroughly analyze ALL transactions to find EVERY recurring pattern. Look for:
- Monthly bills (utilities, subscriptions, memberships, loans, credit cards, mortgages)
- Bi-weekly payments (if any)
- Weekly charges (if any)
- Annual subscriptions

For each income source found, provide:
- source: Name of the income source (employer name, description)
- amount: The typical/average amount as a positive number
- category: One of: ${INCOME_CATS.join(", ")}
- recurrence: One of: weekly, biweekly, monthly, yearly
- dueDay: Day of month (1-31) when typically received
- confidence: "high" (3+ occurrences), "medium" (2 occurrences), or "low"

For each recurring bill found, provide:
- name: Name of the bill/merchant (clean up merchant names)
- amount: The typical/average amount as a positive number
- category: One of: ${BILL_CATS.join(", ")}
- recurrence: One of: weekly, biweekly, monthly, yearly
- dueDay: Day of month (1-31) when typically charged
- confidence: "high" (3+ occurrences), "medium" (2 occurrences), or "low"

Include ALL items that appear recurring (appearing 2+ times). Don't miss any recurring bills!

Return a JSON object with this structure:
{
  "incomeSources": [...],
  "recurringBills": [...]
}

Transactions:
${JSON.stringify(txSummary)}`;

      const aiRes = await routeAI({
        taskSlot: "detection_auto",
        userId: req.session.userId!,
        featureContext: "subscription_detect",
        jsonMode: true,
        temperature: 0.2,
        maxTokens: 8000,
        messages: [
          { role: "system", content: "You are a thorough financial data analyst. Analyze ALL bank transactions to identify EVERY recurring pattern. Be comprehensive - do not miss any recurring bills or income sources. Return only valid JSON." },
          { role: "user", content: prompt },
        ],
      });

      const analysisResult = aiRes.content || "{}";

      let parsed: { incomeSources?: any[]; recurringBills?: any[] };
      try {
        parsed = JSON.parse(analysisResult);
      } catch {
        parsed = { incomeSources: [], recurringBills: [] };
      }

      if (!Array.isArray(parsed.incomeSources)) parsed.incomeSources = [];
      if (!Array.isArray(parsed.recurringBills)) parsed.recurringBills = [];

      // Cache results
      const existing = await storage.getOnboardingAnalysis(userId);
      if (existing) {
        await storage.updateOnboardingAnalysis(userId, {
          analysisData: JSON.stringify(parsed),
          step: 3,
        });
      } else {
        await storage.createOnboardingAnalysis({
          userId,
          analysisData: JSON.stringify(parsed),
          step: 3,
        });
      }

      res.json(parsed);
    } catch (error: any) {
      console.error("Error analyzing transactions:", error);
      res.status(500).json({ error: error.message || "Failed to analyze transactions" });
    }
  });

  app.post("/api/onboarding/save-selections", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { incomeSources, bills: billItems } = req.body;

      let incomeCount = 0;
      let billCount = 0;

      if (Array.isArray(incomeSources)) {
        for (const inc of incomeSources) {
          const today = new Date().toISOString().split("T")[0];
          await storage.createIncome({
            userId,
            source: inc.source,
            amount: String(inc.amount),
            date: today,
            category: inc.category || "Other",
            isRecurring: "true",
            recurrence: inc.recurrence || "monthly",
            dueDay: inc.dueDay || 1,
            isActive: "true",
          });
          incomeCount++;
        }
      }

      if (Array.isArray(billItems)) {
        for (const bill of billItems) {
          await storage.createBill({
            userId,
            name: bill.name,
            amount: String(bill.amount),
            category: bill.category || "Other",
            dueDay: bill.dueDay || 1,
            recurrence: bill.recurrence || "monthly",
            notes: "Added during onboarding",
            startDate: new Date().toISOString().split("T")[0],
          } as any);
          billCount++;
        }
      }

      res.json({ success: true, created: { income: incomeCount, bills: billCount } });
    } catch (error) {
      console.error("Error saving onboarding selections:", error);
      res.status(500).json({ error: "Failed to save selections" });
    }
  });

  // ============ NOTIFICATION SETTINGS ============

  app.get("/api/notification-settings", requireAuth, async (req, res) => {
    try {
      let settings = await storage.getNotificationSettings(req.session.userId!);
      if (!settings) {
        // Create default settings if none exist
        const user = await storage.getUser(req.session.userId!);
        settings = await storage.createNotificationSettings({
          userId: req.session.userId!,
          emailAddress: user?.email || null,
        });
      }
      res.json(settings);
    } catch (error) {
      console.error("Error getting notification settings:", error);
      res.status(500).json({ error: "Failed to get notification settings" });
    }
  });

  app.patch("/api/notification-settings", requireAuth, async (req, res) => {
    try {
      let settings = await storage.getNotificationSettings(req.session.userId!);
      if (!settings) {
        settings = await storage.createNotificationSettings({
          userId: req.session.userId!,
          ...req.body,
        });
      } else {
        settings = await storage.updateNotificationSettings(req.session.userId!, req.body);
      }
      res.json(settings);
    } catch (error) {
      console.error("Error updating notification settings:", error);
      res.status(500).json({ error: "Failed to update notification settings" });
    }
  });

  // Test email endpoint
  app.post("/api/notification-settings/test-email", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const settings = await storage.getNotificationSettings(userId);

      // Get the email to send to (custom email or account email)
      const email = settings?.emailAddress || user?.email;

      if (!email) {
        return res.json({
          success: false,
          message: "No email address configured",
          details: "Please enter a notification email address or ensure your account has an email"
        });
      }

      const result = await sendTestEmail(email);
      res.json(result);
    } catch (error) {
      console.error("Error sending test email:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send test email",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ============ SUBSCRIPTION DETECTION ============

  // FEATURE: SUBSCRIPTION_TRACKING | tier: free | limit: unlimited
  // Detect recurring transactions using the same unified pattern-matching algorithm as /api/bills/detect.
  // Items already saved as bills (any category) are excluded from the results.
  // This ensures both endpoints return the same comprehensive list so users can manually
  // categorize each detected item as either a bill or a subscription.
  app.post("/api/subscriptions/detect", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;

      // Get existing bills (all categories) so we can exclude already-saved items
      const existingBills = await storage.getBills(userId);
      const existingBillNames = existingBills.map(b => b.name.toLowerCase());

      // Get all Plaid transactions from the last 12 months
      const plaidItems = await storage.getPlaidItems(userId);
      if (plaidItems.length === 0) {
        return res.json({ subscriptions: [], suggestions: [], existingCount: existingBills.length, analyzedCount: 0 });
      }

      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      // Collect all account IDs first - only include explicitly active accounts (isActive === "true")
      const allAccountIds: string[] = [];
      for (const item of plaidItems) {
        const accounts = await storage.getPlaidAccounts(item.id);
        for (const account of accounts) {
          if (account.isActive === "true") {
            allAccountIds.push(account.id);
          }
        }
      }

      if (allAccountIds.length === 0) {
        return res.json({ subscriptions: [], suggestions: [], existingCount: existingBills.length, analyzedCount: 0 });
      }

      // Fetch all transactions at once
      const allTransactions = await storage.getPlaidTransactions(allAccountIds, {
        startDate: twelveMonthsAgo.toISOString().split("T")[0],
        endDate: new Date().toISOString().split("T")[0],
      });

      // Helper: get mode (most common value) from an array of numbers
      const getMode = (arr: number[]): number => {
        const freq: Record<number, number> = {};
        let maxFreq = 0;
        let mode = arr[0];
        for (const v of arr) {
          freq[v] = (freq[v] || 0) + 1;
          if (freq[v] > maxFreq) { maxFreq = freq[v]; mode = v; }
        }
        return mode;
      };

      // Group transactions by merchant name (normalized)
      const merchantGroups: Record<string, any[]> = {};
      for (const tx of allTransactions) {
        // Only look at expenses (positive amounts in Plaid are money leaving account)
        const amount = parseFloat(tx.amount);
        if (amount <= 0) continue;

        const merchant = (tx.merchantName || tx.name || "").toLowerCase().trim();
        if (!merchant || merchant.length < 3) continue;

        if (!merchantGroups[merchant]) {
          merchantGroups[merchant] = [];
        }
        merchantGroups[merchant].push(tx);
      }

      // Analyze each merchant group for recurring patterns
      const detected: any[] = [];

      for (const [merchant, rawTransactions] of Object.entries(merchantGroups)) {
        if (rawTransactions.length < 2) continue;

        // Sort by date
        rawTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // NSF deduplication: if two transactions from same merchant are within 10 days
        // and within 5% of each other in amount, keep only the first (NSF retry pattern)
        const transactions: typeof rawTransactions = [];
        for (let i = 0; i < rawTransactions.length; i++) {
          const tx = rawTransactions[i];
          const txDate = new Date(tx.date).getTime();
          const isDuplicate = transactions.some(prev => {
            const prevDate = new Date(prev.date).getTime();
            const daysDiff = Math.abs(txDate - prevDate) / (1000 * 60 * 60 * 24);
            const prevAmt = parseFloat(prev.amount);
            const txAmt = parseFloat(tx.amount);
            const amountDiff = prevAmt > 0 ? Math.abs(txAmt - prevAmt) / prevAmt : 1;
            return daysDiff <= 10 && amountDiff < 0.05;
          });
          if (!isDuplicate) transactions.push(tx);
        }

        if (transactions.length < 2) continue;

        // Get amounts and check for consistency
        const amounts = transactions.map(tx => parseFloat(tx.amount));
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;

        // Check if amounts are consistent (within 10% of average)
        const amountsConsistent = amounts.every(a => Math.abs(a - avgAmount) / avgAmount < 0.1);
        if (!amountsConsistent && transactions.length < 4) continue;

        // Analyze frequency
        const dates = transactions.map(tx => new Date(tx.date).getTime());
        const intervals: number[] = [];
        for (let i = 1; i < dates.length; i++) {
          intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
        }

        if (intervals.length === 0) continue;

        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

        // Determine frequency (widened monthly window to catch slight timing variations)
        let frequency = "monthly";
        let confidence = 0.5;

        if (avgInterval >= 6 && avgInterval <= 8) {
          frequency = "weekly";
          confidence = 0.8;
        } else if (avgInterval >= 13 && avgInterval <= 16) {
          frequency = "biweekly";
          confidence = 0.75;
        } else if (avgInterval >= 25 && avgInterval <= 38) {
          frequency = "monthly";
          confidence = 0.85;
        } else if (avgInterval >= 355 && avgInterval <= 375) {
          frequency = "yearly";
          confidence = 0.9;
        } else if (avgInterval >= 85 && avgInterval <= 95) {
          frequency = "quarterly";
          confidence = 0.7;
        } else {
          continue; // Not a recognizable pattern
        }

        // Increase confidence based on deduplicated transaction count
        if (transactions.length >= 6) confidence = Math.min(confidence + 0.1, 0.95);
        if (transactions.length >= 12) confidence = Math.min(confidence + 0.05, 0.98);

        // Use mode (most common day of month) as the predominant charge day
        const daysOfMonth = transactions.map(tx => new Date(tx.date).getDate());
        const predominantDay = getMode(daysOfMonth);

        // Get display name (capitalize first letters)
        const displayName = (transactions[0].merchantName || transactions[0].name || merchant)
          .split(" ")
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ");

        detected.push({
          name: displayName,
          amount: Math.round(avgAmount * 100) / 100,
          frequency,
          recurrence: frequency,
          dueDay: predominantDay,
          merchant: displayName,
          confidence,
          confidenceLabel: confidence >= 0.85 ? "high" : confidence >= 0.7 ? "medium" : "low",
          lastChargeDate: transactions[transactions.length - 1].date,
          transactionCount: transactions.length,
          predominantDay,
          source: "pattern",
          category: "Other",
        });
      }

      // Sort by confidence and amount
      detected.sort((a, b) => b.confidence - a.confidence || b.amount - a.amount);

      // Filter out items already saved as bills or subscriptions
      const suggestions = detected.filter(s => {
        const nameLower = s.name.toLowerCase();
        return !existingBillNames.some(existing =>
          existing.includes(nameLower) || nameLower.includes(existing)
        );
      });

      // Return both the legacy `subscriptions` field (for backward compat) and the new `suggestions` field
      res.json({
        subscriptions: suggestions,
        suggestions,
        existingCount: existingBills.length,
        analyzedCount: allTransactions.length,
        detectedCount: detected.length,
      });
    } catch (error) {
      console.error("Error detecting subscriptions:", error);
      res.status(500).json({ error: "Failed to detect subscriptions" });
    }
  });

  // GET /api/subscriptions — list all user subscriptions (bills with category="Subscriptions")
  app.get("/api/subscriptions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const bills = await storage.getBills(userId);
      const subscriptions = bills.filter((b: any) => b.category === "Subscriptions");
      res.json(subscriptions);
    } catch (error) {
      console.error("GET /api/subscriptions error:", error);
      res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
  });

  // GET /api/subscriptions/summary — monthly total, count, upcoming renewals
  app.get("/api/subscriptions/summary", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const bills = await storage.getBills(userId);
      const subscriptions = bills.filter((b: any) => b.category === "Subscriptions");
      const active = subscriptions.filter((b: any) => b.isPaused !== "true");

      const monthlyTotal = active.reduce((sum: number, sub: any) => {
        const amount = parseFloat(sub.amount);
        switch (sub.recurrence) {
          case "weekly":   return sum + (amount * 52 / 12);
          case "biweekly": return sum + (amount * 26 / 12);
          case "monthly":  return sum + amount;
          case "yearly":   return sum + (amount / 12);
          default:         return sum + amount;
        }
      }, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const in7Days = new Date(today);
      in7Days.setDate(in7Days.getDate() + 7);

      const upcomingRenewals = active
        .map((sub: any) => {
          const dueDay = sub.dueDay || 1;
          const d = new Date(today);
          d.setDate(dueDay);
          if (d < today) d.setMonth(d.getMonth() + 1);
          return {
            id: sub.id,
            name: sub.name,
            amount: sub.amount,
            nextBillingDate: d.toISOString().split("T")[0],
          };
        })
        .filter((s: any) => {
          const nd = new Date(s.nextBillingDate);
          return nd >= today && nd <= in7Days;
        });

      res.json({
        monthlyTotal: Math.round(monthlyTotal * 100) / 100,
        yearlyTotal: Math.round(monthlyTotal * 12 * 100) / 100,
        activeCount: active.length,
        totalCount: subscriptions.length,
        pausedCount: subscriptions.length - active.length,
        autoDetectedCount: subscriptions.filter((b: any) => b.notes && b.notes.includes("auto_detected")).length,
        upcomingRenewals,
      });
    } catch (error) {
      console.error("GET /api/subscriptions/summary error:", error);
      res.status(500).json({ error: "Failed to fetch subscription summary" });
    }
  });

  // POST /api/subscriptions — create a subscription (bill with category="Subscriptions")
  app.post("/api/subscriptions", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const bill = await storage.createBill({
        ...req.body,
        userId,
        category: "Subscriptions",
      });
      res.status(201).json(bill);
    } catch (error) {
      console.error("POST /api/subscriptions error:", error);
      res.status(500).json({ error: "Failed to create subscription" });
    }
  });

  // PATCH /api/subscriptions/:id — update a subscription
  app.patch("/api/subscriptions/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const bill = await storage.getBill(req.params.id as string);
      if (!bill || bill.userId !== userId) {
        return res.status(404).json({ error: "Subscription not found" });
      }
      const updated = await storage.updateBill(req.params.id as string, req.body);
      res.json(updated);
    } catch (error) {
      console.error("PATCH /api/subscriptions/:id error:", error);
      res.status(500).json({ error: "Failed to update subscription" });
    }
  });

  // DELETE /api/subscriptions/:id — cancel/delete a subscription
  app.delete("/api/subscriptions/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const bill = await storage.getBill(req.params.id as string);
      if (!bill || bill.userId !== userId) {
        return res.status(404).json({ error: "Subscription not found" });
      }
      await storage.deleteBill(req.params.id as string);
      res.status(204).send();
    } catch (error) {
      console.error("DELETE /api/subscriptions/:id error:", error);
      res.status(500).json({ error: "Failed to delete subscription" });
    }
  });

  // FEATURE: CATEGORIES_MANAGEMENT | tier: free | limit: 20 categories
  // ============ CUSTOM CATEGORIES ============

  app.get("/api/custom-categories", requireAuth, async (req, res) => {
    try {
      const categories = await storage.getCustomCategories(req.session.userId!);
      res.json(categories);
    } catch (error) {
      console.error("Error getting custom categories:", error);
      res.status(500).json({ error: "Failed to get custom categories" });
    }
  });

  app.post("/api/custom-categories", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const catLimit = await getFeatureLimit(plan, "categories_management");
      if (catLimit !== null) {
        if (catLimit === 0) {
          return res.status(402).json({ feature: "categories_management", remaining: 0, resetDate: null, upgradeRequired: true });
        }
        const { rows: catRows } = await pool.query<{ cnt: number }>(
          "SELECT COUNT(*)::int AS cnt FROM custom_categories WHERE user_id = $1",
          [userId]
        );
        if ((catRows[0]?.cnt ?? 0) >= catLimit) {
          return res.status(402).json({ feature: "categories_management", remaining: 0, resetDate: null });
        }
      }
      const category = await storage.createCustomCategory({
        ...req.body,
        userId,
      });
      res.status(201).json(category);
    } catch (error) {
      console.error("Error creating custom category:", error);
      res.status(500).json({ error: "Failed to create custom category" });
    }
  });

  app.patch("/api/custom-categories/:id", requireAuth, async (req, res) => {
    try {
      const category = await storage.updateCustomCategory((req.params.id as string), req.body);
      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.json(category);
    } catch (error) {
      console.error("Error updating custom category:", error);
      res.status(500).json({ error: "Failed to update custom category" });
    }
  });

  app.delete("/api/custom-categories/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteCustomCategory((req.params.id as string));
      if (!success) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting custom category:", error);
      res.status(500).json({ error: "Failed to delete custom category" });
    }
  });

  // ============ RECURRING EXPENSES (DEPRECATED - Use Bills with category "Subscriptions") ============
  // These endpoints are deprecated. Subscriptions are now managed as Bills with category "Subscriptions".
  // Run migration: npx tsx server/migrations/migrate-recurring-expenses-to-bills.ts

  app.get("/api/recurring-expenses", requireAuth, async (req, res) => {
    res.setHeader("Deprecation", "true");
    res.setHeader("Link", '</api/bills?category=Subscriptions>; rel="successor-version"');
    try {
      const expenses = await storage.getRecurringExpenses(req.session.userId!);
      res.json(expenses);
    } catch (error) {
      console.error("Error getting recurring expenses:", error);
      res.status(500).json({ error: "Failed to get recurring expenses" });
    }
  });

  app.post("/api/recurring-expenses", requireAuth, async (req, res) => {
    res.setHeader("Deprecation", "true");
    res.setHeader("Link", '</api/bills>; rel="successor-version"');
    try {
      const expense = await storage.createRecurringExpense({
        ...req.body,
        userId: req.session.userId!,
      });
      res.status(201).json(expense);
    } catch (error) {
      console.error("Error creating recurring expense:", error);
      res.status(500).json({ error: "Failed to create recurring expense" });
    }
  });

  app.patch("/api/recurring-expenses/:id", requireAuth, async (req, res) => {
    res.setHeader("Deprecation", "true");
    res.setHeader("Link", '</api/bills/:id>; rel="successor-version"');
    try {
      const expense = await storage.updateRecurringExpense((req.params.id as string), req.body);
      if (!expense) {
        return res.status(404).json({ error: "Recurring expense not found" });
      }
      res.json(expense);
    } catch (error) {
      console.error("Error updating recurring expense:", error);
      res.status(500).json({ error: "Failed to update recurring expense" });
    }
  });

  app.delete("/api/recurring-expenses/:id", requireAuth, async (req, res) => {
    res.setHeader("Deprecation", "true");
    res.setHeader("Link", '</api/bills/:id>; rel="successor-version"');
    try {
      const success = await storage.deleteRecurringExpense((req.params.id as string));
      if (!success) {
        return res.status(404).json({ error: "Recurring expense not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting recurring expense:", error);
      res.status(500).json({ error: "Failed to delete recurring expense" });
    }
  });

  // ============ RECONCILIATION RULES ============

  app.get("/api/reconciliation-rules", requireAuth, async (req, res) => {
    try {
      const rules = await storage.getReconciliationRules(req.session.userId!);
      res.json(rules);
    } catch (error) {
      console.error("Error getting reconciliation rules:", error);
      res.status(500).json({ error: "Failed to get reconciliation rules" });
    }
  });

  app.post("/api/reconciliation-rules", requireAuth, async (req, res) => {
    try {
      const rule = await storage.createReconciliationRule({
        ...req.body,
        userId: req.session.userId!,
      });
      res.status(201).json(rule);
    } catch (error) {
      console.error("Error creating reconciliation rule:", error);
      res.status(500).json({ error: "Failed to create reconciliation rule" });
    }
  });

  app.delete("/api/reconciliation-rules/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteReconciliationRule((req.params.id as string));
      if (!success) {
        return res.status(404).json({ error: "Rule not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting reconciliation rule:", error);
      res.status(500).json({ error: "Failed to delete reconciliation rule" });
    }
  });

  // ============ SYNC SCHEDULES ============

  app.get("/api/sync-schedules", requireAuth, async (req, res) => {
    try {
      const schedules = await storage.getSyncSchedules(req.session.userId!);
      res.json(schedules);
    } catch (error) {
      console.error("Error getting sync schedules:", error);
      res.status(500).json({ error: "Failed to get sync schedules" });
    }
  });

  app.post("/api/sync-schedules", requireAuth, async (req, res) => {
    try {
      const schedule = await storage.createSyncSchedule({
        ...req.body,
        userId: req.session.userId!,
      });
      res.status(201).json(schedule);
    } catch (error) {
      console.error("Error creating sync schedule:", error);
      res.status(500).json({ error: "Failed to create sync schedule" });
    }
  });

  app.patch("/api/sync-schedules/:id", requireAuth, async (req, res) => {
    try {
      const schedule = await storage.updateSyncSchedule((req.params.id as string), req.body);
      if (!schedule) {
        return res.status(404).json({ error: "Sync schedule not found" });
      }
      res.json(schedule);
    } catch (error) {
      console.error("Error updating sync schedule:", error);
      res.status(500).json({ error: "Failed to update sync schedule" });
    }
  });

  app.delete("/api/sync-schedules/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteSyncSchedule((req.params.id as string));
      if (!success) {
        return res.status(404).json({ error: "Sync schedule not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting sync schedule:", error);
      res.status(500).json({ error: "Failed to delete sync schedule" });
    }
  });

  // FEATURE: NOTIFICATIONS | tier: free | limit: unlimited
  // ============ NOTIFICATIONS ============

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const notificationsList = await storage.getNotifications(req.session.userId!, limit);
      res.json(notificationsList);
    } catch (error) {
      console.error("Error getting notifications:", error);
      res.status(500).json({ error: "Failed to get notifications" });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.session.userId!);
      res.json({ count });
    } catch (error) {
      console.error("Error getting unread count:", error);
      res.status(500).json({ error: "Failed to get unread count" });
    }
  });

  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      await storage.markNotificationRead((req.params.id as string));
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification read:", error);
      res.status(500).json({ error: "Failed to mark notification read" });
    }
  });

  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      await storage.markAllNotificationsRead(req.session.userId!);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications read:", error);
      res.status(500).json({ error: "Failed to mark all notifications read" });
    }
  });

  app.delete("/api/notifications/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteNotification((req.params.id as string));
      if (!success) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting notification:", error);
      res.status(500).json({ error: "Failed to delete notification" });
    }
  });

  // ============ SPENDING ALERTS ============

  app.get("/api/spending-alerts", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const alerts = await db.query.spendingAlerts.findMany({
        where: eq(spendingAlerts.userId, userId),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching spending alerts:", error);
      res.status(500).json({ error: "Failed to fetch spending alerts" });
    }
  });

  app.post("/api/spending-alerts", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const parsed = insertSpendingAlertSchema.safeParse({ ...req.body, userId });
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid alert data", details: parsed.error });
      }
      const [alert] = await db.insert(spendingAlerts).values({
        ...parsed.data,
        userId,
      }).returning();
      res.status(201).json(alert);
    } catch (error) {
      console.error("Error creating spending alert:", error);
      res.status(500).json({ error: "Failed to create spending alert" });
    }
  });

  app.patch("/api/spending-alerts/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const id = req.params.id as string;
      const parsed = updateSpendingAlertSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid alert data", details: parsed.error });
      }
      const [updated] = await db.update(spendingAlerts)
        .set(parsed.data)
        .where(and(eq(spendingAlerts.id, id), eq(spendingAlerts.userId, userId)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Alert not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating spending alert:", error);
      res.status(500).json({ error: "Failed to update spending alert" });
    }
  });

  app.delete("/api/spending-alerts/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const id = req.params.id as string;
      const [deleted] = await db.delete(spendingAlerts)
        .where(and(eq(spendingAlerts.id, id), eq(spendingAlerts.userId, userId)))
        .returning();
      if (!deleted) return res.status(404).json({ error: "Alert not found" });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting spending alert:", error);
      res.status(500).json({ error: "Failed to delete spending alert" });
    }
  });

  // ============ BUDGET ALERTS ============

  app.get("/api/budget-alerts", requireAuth, async (req, res) => {
    try {
      const month = req.query.month as string;
      const alerts = await storage.getBudgetAlerts(req.session.userId!, month);
      res.json(alerts);
    } catch (error) {
      console.error("Error getting budget alerts:", error);
      res.status(500).json({ error: "Failed to get budget alerts" });
    }
  });

  // ============ DATA EXPORT ============

  app.get("/api/export/all", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      
      // Get all user data
      const [billsData, expensesData, incomesData, budgetsData, recurringExpensesData] = await Promise.all([
        storage.getBills(userId),
        storage.getExpenses(userId),
        storage.getIncomes(userId),
        storage.getBudgets(userId),
        storage.getRecurringExpenses(userId),
      ]);

      // Get transactions if user has connected bank accounts
      const plaidItems = await storage.getPlaidItems(userId);
      let transactionsData: any[] = [];
      
      if (plaidItems.length > 0) {
        const allAccounts = await Promise.all(
          plaidItems.map(item => storage.getPlaidAccounts(item.id))
        );
        const accountIds = allAccounts.flat().map(a => a.id);
        transactionsData = await storage.getPlaidTransactions(accountIds);
      }

      res.json({
        exportDate: new Date().toISOString(),
        bills: billsData,
        expenses: expensesData,
        income: incomesData,
        budgets: budgetsData,
        recurringExpenses: recurringExpensesData,
        transactions: transactionsData,
      });
    } catch (error) {
      console.error("Error exporting data:", error);
      res.status(500).json({ error: "Failed to export data" });
    }
  });

  // ── Transaction CSV export ──────────────────────────────────────────────────
  app.get("/api/user/export/transactions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { startDate, endDate, accountId } = req.query as {
        startDate?: string;
        endDate?: string;
        accountId?: string;
      };

      const escapeCSV = (value: string | null | undefined): string => {
        const str = value ?? "";
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      // Build account name lookup map
      const accountNameMap = new Map<string, string>();

      // Plaid accounts
      const plaidItems = await storage.getPlaidItems(userId);
      const plaidAccountGroups = await Promise.all(plaidItems.map(i => storage.getPlaidAccounts(i.id)));
      const allPlaidAccounts = plaidAccountGroups.flat();
      for (const acc of allPlaidAccounts) {
        accountNameMap.set(acc.id, acc.name);
      }

      // MX accounts
      const mxAccounts = await storage.getMxAccountsByUserId(userId);
      for (const acc of mxAccounts) {
        accountNameMap.set(acc.id, acc.name);
      }

      // Manual accounts
      const manualAccounts = await storage.getManualAccounts(userId);
      for (const acc of manualAccounts) {
        accountNameMap.set(acc.id, acc.name);
      }

      const dateOpts: { startDate?: string; endDate?: string } = {};
      if (startDate) dateOpts.startDate = startDate;
      if (endDate) dateOpts.endDate = endDate;

      // Gather Plaid transactions
      const activePlaidIds = accountId
        ? [accountId]
        : allPlaidAccounts.filter(a => a.isActive === "true").map(a => a.id);
      const plaidTxns = activePlaidIds.length > 0
        ? await storage.getPlaidTransactions(activePlaidIds, dateOpts)
        : [];

      // Gather MX transactions
      const activeMxIds = accountId
        ? [accountId]
        : mxAccounts.filter(a => a.isActive === "true").map(a => a.id);
      const mxTxns = activeMxIds.length > 0
        ? await storage.getMxTransactions(activeMxIds, dateOpts)
        : [];

      // Gather manual transactions
      const manualTxns = await storage.getManualTransactionsByUser(userId, dateOpts);
      const filteredManual = accountId
        ? manualTxns.filter(t => t.accountId === accountId)
        : manualTxns;

      // Normalise all transactions to CSV rows
      interface CsvRow {
        date: string;
        description: string;
        amount: string;
        category: string;
        account: string;
        status: string;
        notes: string;
      }

      const rows: CsvRow[] = [
        ...plaidTxns.map(t => ({
          date: t.date,
          description: t.merchantName || t.name || "",
          amount: t.amount != null ? String(t.amount) : "0.00",
          category: t.personalCategory || t.category || "",
          account: accountNameMap.get(t.plaidAccountId) ?? "",
          status: t.pending === "true" ? "Pending" : "Posted",
          notes: "",
        })),
        ...mxTxns.map(t => ({
          date: t.date,
          description: t.description || "",
          amount: t.amount != null ? String(t.amount) : "0.00",
          category: t.personalCategory || t.category || "",
          account: accountNameMap.get(t.mxAccountId) ?? "",
          status: t.status ?? "Posted",
          notes: "",
        })),
        ...filteredManual.map(t => ({
          date: t.date,
          description: t.merchant || "",
          amount: t.amount != null ? String(t.amount) : "0.00",
          category: t.category || "",
          account: accountNameMap.get(t.accountId ?? "") ?? "",
          status: "Posted",
          notes: t.notes || "",
        })),
      ];

      rows.sort((a, b) => b.date.localeCompare(a.date));

      const header = "Date,Description,Amount,Category,Account,Status,Notes";
      const csvLines = rows.map(r =>
        [
          escapeCSV(r.date),
          escapeCSV(r.description),
          escapeCSV(r.amount),
          escapeCSV(r.category),
          escapeCSV(r.account),
          escapeCSV(r.status),
          escapeCSV(r.notes),
        ].join(",")
      );

      const dateLabel = new Date().toISOString().split("T")[0];
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="budgetsmart-transactions-${dateLabel}.csv"`);

      console.log(`[audit] data.export_requested userId=${userId}`);

      res.send([header, ...csvLines].join("\n"));
    } catch (error) {
      console.error("Transaction CSV export error:", error);
      res.status(500).json({ error: "Failed to export transactions" });
    }
  });

  // FEATURE: DATA_EXPORT_JSON | tier: pro | limit: 2 exports/month
  // ── Full account data export (JSON) ─────────────────────────────────────────
  app.get("/api/user/export-data", requireAuth, apiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "data_export_json");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "data_export_json",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      auditLogFromRequest(req, {
        eventType: "data.export_requested",
        eventCategory: "data",
        actorId: userId,
        action: "export_data",
        outcome: "success",
      });

      const [billsData, expensesData, incomesData, budgetsData, savingsGoalsData, supportTicketsData] = await Promise.all([
        storage.getBills(userId),
        storage.getExpenses(userId),
        storage.getIncomes(userId),
        storage.getBudgets(userId),
        storage.getSavingsGoals(userId),
        storage.getSupportTicketsByUserId(userId),
      ]);

      const plaidItems = await storage.getPlaidItems(userId);
      const plaidAccountGroups = await Promise.all(plaidItems.map(i => storage.getPlaidAccounts(i.id)));
      const allPlaidAccounts = plaidAccountGroups.flat();
      const plaidTxns = allPlaidAccounts.length > 0
        ? await storage.getPlaidTransactions(allPlaidAccounts.map(a => a.id))
        : [];

      const mxAccounts = await storage.getMxAccountsByUserId(userId);
      const mxTxns = mxAccounts.length > 0
        ? await storage.getMxTransactions(mxAccounts.map(a => a.id))
        : [];

      const manualAccounts = await storage.getManualAccounts(userId);
      const manualTxns = await storage.getManualTransactionsByUser(userId);

      // Vault documents — metadata only (no file content)
      let vaultDocuments: any[] = [];
      try {
        const vaultResult = await pool.query(
          `SELECT id, display_name, file_name, category, file_size, mime_type, created_at, expires_at
             FROM vault_documents WHERE user_id = $1`,
          [userId],
        );
        vaultDocuments = vaultResult.rows;
      } catch { /* vault table may not exist */ }

      const exportPayload = {
        exportDate: new Date().toISOString(),
        profile: user
          ? { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, createdAt: user.createdAt }
          : null,
        accounts: {
          plaid: allPlaidAccounts,
          mx: mxAccounts,
          manual: manualAccounts,
        },
        transactions: {
          plaid: plaidTxns,
          mx: mxTxns,
          manual: manualTxns,
        },
        bills: billsData,
        expenses: expensesData,
        income: incomesData,
        budgets: budgetsData,
        savingsGoals: savingsGoalsData,
        vaultDocuments,
        supportTickets: supportTicketsData,
      };

      res.setHeader("Content-Disposition", 'attachment; filename="budgetsmart-data-export.json"');
      res.json(exportPayload);
    } catch (error) {
      console.error("Full data export error:", error);
      res.status(500).json({ error: "Failed to export data" });
    }
  });

  // FEATURE: DATA_EXPORT_CSV | tier: free | limit: 5 exports/month
  app.get("/api/export/csv/:type", requireAuth, apiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "data_export_csv");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "data_export_csv",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      const type = req.params.type as string;
      let data: any[] = [];
      let headers: string[] = [];
      let filename = "";

      switch (type) {
        case "bills":
          data = await storage.getBills(userId);
          headers = ["name", "amount", "category", "dueDay", "recurrence", "notes"];
          filename = "bills.csv";
          break;
        case "expenses":
          data = await storage.getExpenses(userId);
          headers = ["merchant", "amount", "date", "category", "notes"];
          filename = "expenses.csv";
          break;
        case "income":
          data = await storage.getIncomes(userId);
          headers = ["source", "amount", "date", "category", "isRecurring", "recurrence", "notes"];
          filename = "income.csv";
          break;
        case "transactions":
          const plaidItems = await storage.getPlaidItems(userId);
          if (plaidItems.length > 0) {
            const allAccounts = await Promise.all(
              plaidItems.map(item => storage.getPlaidAccounts(item.id))
            );
            const accountIds = allAccounts.flat().map(a => a.id);
            data = await storage.getPlaidTransactions(accountIds);
          }
          headers = ["date", "name", "merchantName", "amount", "category", "personalCategory", "matchType"];
          filename = "transactions.csv";
          break;
        default:
          return res.status(400).json({ error: "Invalid export type" });
      }

      // Build CSV
      const csvRows = [headers.join(",")];
      for (const row of data) {
        const values = headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          const str = String(val);
          return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        });
        csvRows.push(values.join(","));
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csvRows.join("\n"));
    } catch (error) {
      console.error("Error exporting CSV:", error);
      res.status(500).json({ error: "Failed to export CSV" });
    }
  });

  // FEATURE: FINANCIAL_REPORTS | tier: free | limit: unlimited
  // ============ SPENDING REPORTS ============

  app.get("/api/reports/spending-by-category", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { startDate, endDate } = req.query;
      const expenses = await storage.getExpenses(userId);
      
      // Filter by date range if provided
      let filtered = expenses;
      if (startDate) {
        filtered = filtered.filter(e => e.date >= (startDate as string));
      }
      if (endDate) {
        filtered = filtered.filter(e => e.date <= (endDate as string));
      }

      // Group by category
      const byCategory: Record<string, number> = {};
      for (const expense of filtered) {
        const cat = expense.category || "Other";
        byCategory[cat] = (byCategory[cat] || 0) + parseFloat(expense.amount);
      }

      const data = Object.entries(byCategory).map(([category, amount]) => ({
        category,
        amount: Math.round(amount * 100) / 100,
      })).sort((a, b) => b.amount - a.amount);

      res.json(data);
    } catch (error) {
      console.error("Error getting spending report:", error);
      res.status(500).json({ error: "Failed to get spending report" });
    }
  });

  app.get("/api/reports/monthly-trend", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const [expenses, incomes] = await Promise.all([
        storage.getExpenses(userId),
        storage.getIncomes(userId),
      ]);

      // Group by month
      const monthlyData: Record<string, { expenses: number; income: number }> = {};
      
      for (const expense of expenses) {
        const month = expense.date.substring(0, 7); // yyyy-MM
        if (!monthlyData[month]) monthlyData[month] = { expenses: 0, income: 0 };
        monthlyData[month].expenses += parseFloat(expense.amount);
      }

      for (const inc of incomes) {
        const month = inc.date.substring(0, 7);
        if (!monthlyData[month]) monthlyData[month] = { expenses: 0, income: 0 };
        monthlyData[month].income += parseFloat(inc.amount);
      }

      const data = Object.entries(monthlyData)
        .map(([month, values]) => ({
          month,
          expenses: Math.round(values.expenses * 100) / 100,
          income: Math.round(values.income * 100) / 100,
          net: Math.round((values.income - values.expenses) * 100) / 100,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));

      res.json(data);
    } catch (error) {
      console.error("Error getting monthly trend:", error);
      res.status(500).json({ error: "Failed to get monthly trend" });
    }
  });

  // FEATURE: BUDGET_VS_ACTUAL | tier: free | limit: unlimited
  app.get("/api/reports/budget-vs-actual", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const month = (req.query.month as string) || new Date().toISOString().substring(0, 7);
      const [budgets, expenses] = await Promise.all([
        storage.getBudgetsByMonth(userId, month),
        storage.getExpenses(userId),
      ]);

      // Filter expenses for the month
      const monthExpenses = expenses.filter(e => e.date.startsWith(month));

      // Calculate actual spending per category
      const actualByCategory: Record<string, number> = {};
      for (const expense of monthExpenses) {
        const cat = expense.category || "Other";
        actualByCategory[cat] = (actualByCategory[cat] || 0) + parseFloat(expense.amount);
      }

      // Combine budget and actual
      const data = budgets.map(budget => ({
        category: budget.category,
        budgeted: parseFloat(budget.amount),
        actual: actualByCategory[budget.category] || 0,
        remaining: parseFloat(budget.amount) - (actualByCategory[budget.category] || 0),
        percentUsed: Math.round(((actualByCategory[budget.category] || 0) / parseFloat(budget.amount)) * 100),
      }));

      res.json(data);
    } catch (error) {
      console.error("Error getting budget vs actual:", error);
      res.status(500).json({ error: "Failed to get budget vs actual" });
    }
  });

  // FEATURE: FINANCIAL_HEALTH | tier: pro | limit: unlimited
  // Financial Health Score
  app.get("/api/reports/financial-health", requireAuth, apiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "financial_health");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "financial_health",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      const householdId = req.session.householdId;

      // Determine which users to include
      let userIds = [userId];
      if (householdId) {
        userIds = await storage.getHouseholdMemberUserIds(householdId);
      }

      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);

      // Get all financial data
      const [expenses, incomes, budgets, savingsGoals, bills] = await Promise.all([
        householdId
          ? storage.getExpensesByUserIds(userIds)
          : storage.getExpenses(userId),
        householdId
          ? storage.getIncomesByUserIds(userIds)
          : storage.getIncomes(userId),
        householdId
          ? storage.getBudgetsByUserIds(userIds)
          : storage.getBudgets(userId),
        householdId
          ? storage.getSavingsGoalsByUserIds(userIds)
          : storage.getSavingsGoals(userId),
        householdId
          ? storage.getBillsByUserIds(userIds)
          : storage.getBills(userId),
      ]);

      // Calculate current month data
      const currentMonthExpenses = expenses.filter(e => e.date.startsWith(currentMonth));
      const lastMonthExpenses = expenses.filter(e => e.date.startsWith(lastMonth));

      const totalExpenses = currentMonthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const lastTotalExpenses = lastMonthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

      // Calculate monthly income properly accounting for recurrence (biweekly/weekly)
      const { getIncomeInRange } = await import("./cash-flow");
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      // Get Plaid accounts to check for disabled accounts
      const plaidItems = await storage.getPlaidItems(userId);
      let allPlaidAccounts: any[] = [];
      if (plaidItems.length > 0) {
        const accounts = await Promise.all(plaidItems.map(item => storage.getPlaidAccounts(item.id)));
        allPlaidAccounts = accounts.flat();
      }
      const disabledPlaidAccountIds = new Set(
        allPlaidAccounts.filter(a => a.isActive !== "true").map(a => a.id)
      );

      // Only include active incomes (not disabled, and not linked to disabled Plaid accounts)
      const activeIncomes = incomes.filter(inc => {
        if (inc.isActive === "false") return false;
        if (inc.linkedPlaidAccountId && disabledPlaidAccountIds.has(inc.linkedPlaidAccountId)) return false;
        return true;
      });

      const currentMonthIncomeEvents = getIncomeInRange(activeIncomes, currentMonthStart, currentMonthEnd);
      const lastMonthIncomeEvents = getIncomeInRange(activeIncomes, lastMonthStart, lastMonthEnd);

      const totalIncome = currentMonthIncomeEvents.reduce((sum, e) => sum + e.amount, 0);
      const lastTotalIncome = lastMonthIncomeEvents.reduce((sum, e) => sum + e.amount, 0);

      // Calculate PLAN-BASED totals (not actual transactions)
      // Total budgeted spending from budget categories
      const totalBudgetedSpending = budgets.reduce((sum, b) => sum + parseFloat(b.amount), 0);
      
      // Monthly bills estimate from bills table (plan)
      const activeBills = bills.filter(b => b.isPaused !== "true");
      const monthlyBillsEstimate = activeBills.reduce((sum, bill) => {
        const amount = parseFloat(bill.amount);
        if (bill.recurrence === "monthly") return sum + amount;
        if (bill.recurrence === "biweekly") return sum + amount * 2;
        if (bill.recurrence === "weekly") return sum + amount * 4;
        if (bill.recurrence === "yearly") return sum + amount / 12;
        return sum;
      }, 0);
      
      // Total planned expenses (budgets + bills)
      const totalPlannedExpenses = totalBudgetedSpending + monthlyBillsEstimate;

      // 1. SAVINGS RATE SCORE (0-25 points) - PLAN-BASED
      // Based on planned income vs planned expenses
      // Ideal: 20%+ of income saved = 25 points
      // Good: 10-20% = 15-25 points
      // Poor: 0-10% = 0-15 points
      // Negative: 0 points
      let savingsRateScore = 0;
      let savingsRate = 0;
      if (totalIncome > 0) {
        // Use PLANNED expenses instead of actual
        savingsRate = ((totalIncome - totalPlannedExpenses) / totalIncome) * 100;
        if (savingsRate >= 20) {
          savingsRateScore = 25;
        } else if (savingsRate >= 10) {
          savingsRateScore = 15 + ((savingsRate - 10) / 10) * 10;
        } else if (savingsRate > 0) {
          savingsRateScore = (savingsRate / 10) * 15;
        }
      }

      // 2. BUDGET ADHERENCE SCORE (0-25 points) - PLAN-BASED
      // Since this is plan-based, we check if budgets are set up properly
      // Full points for having budgets that cover major spending categories
      let budgetScore = 0;
      if (budgets.length === 0) {
        // No budgets = 0 points (need to set them up)
        budgetScore = 0;
      } else if (budgets.length >= 5) {
        // 5+ budgets = excellent planning
        budgetScore = 25;
      } else if (budgets.length >= 3) {
        // 3-4 budgets = good planning
        budgetScore = 20;
      } else {
        // 1-2 budgets = minimal planning
        budgetScore = 10 + budgets.length * 3;
      }

      // 3. EMERGENCY FUND / SAVINGS GOALS SCORE (0-25 points)
      // Based on savings goals progress
      let savingsGoalScore = 0;
      if (savingsGoals.length > 0) {
        let totalProgress = 0;
        for (const goal of savingsGoals) {
          const current = parseFloat(goal.currentAmount);
          const target = parseFloat(goal.targetAmount);
          const progress = target > 0 ? (current / target) * 100 : 0;
          totalProgress += Math.min(progress, 100);
        }
        const avgProgress = totalProgress / savingsGoals.length;
        savingsGoalScore = (avgProgress / 100) * 25;
      }

      // 4. BILL PAYMENT CONSISTENCY SCORE (0-25 points) - PLAN-BASED
      // Based on having bills set up and tracked
      let billScore = 0;
      if (activeBills.length === 0) {
        // No bills tracked = 0 points
        billScore = 0;
      } else if (activeBills.length >= 5) {
        // 5+ bills tracked = excellent
        billScore = 25;
      } else if (activeBills.length >= 3) {
        // 3-4 bills = good
        billScore = 20;
      } else {
        // 1-2 bills = minimal
        billScore = 10 + activeBills.length * 3;
      }

      // Calculate total score
      const totalScore = Math.round(savingsRateScore + budgetScore + savingsGoalScore + billScore);

      // Generate tips based on lowest scores
      const tips: string[] = [];
      if (savingsRateScore < 15 && totalIncome > 0) {
        tips.push("Try to save at least 20% of your income each month");
      }
      if (budgetScore < 20 && budgets.length > 0) {
        tips.push("Review your spending to stay within budget limits");
      }
      if (savingsGoalScore < 15) {
        if (savingsGoals.length === 0) {
          tips.push("Set up savings goals to track your progress");
        } else {
          tips.push("Increase contributions to your savings goals");
        }
      }
      if (activeBills.length === 0) {
        tips.push("Add your recurring bills to track them better");
      }
      if (budgets.length === 0) {
        tips.push("Create budgets for your spending categories");
      }

      // Determine grade
      let grade = "F";
      let gradeColor = "red";
      if (totalScore >= 90) {
        grade = "A";
        gradeColor = "green";
      } else if (totalScore >= 80) {
        grade = "B";
        gradeColor = "blue";
      } else if (totalScore >= 70) {
        grade = "C";
        gradeColor = "yellow";
      } else if (totalScore >= 60) {
        grade = "D";
        gradeColor = "orange";
      }

      // Generate AI explanation based on plan data
      const generateAIExplanation = (): string => {
        const plannedSavings = totalIncome - totalPlannedExpenses;
        const savingsRateNum = parseFloat(savingsRate.toFixed(1));
        
        // Build context-aware explanation
        let explanation = "";
        
        if (totalScore >= 80) {
          explanation = `You are financially stable with a strong ${savingsRateNum}% savings rate. `;
          if (budgets.length > 0 && budgetScore >= 20) {
            explanation += "Your budgeting discipline is excellent. ";
          }
          if (savingsGoals.length > 0 && savingsGoalScore >= 15) {
            explanation += "You're making great progress on your savings goals. ";
          }
          explanation += "Keep up the great work!";
        } else if (totalScore >= 60) {
          explanation = `You're on track with a ${grade} grade and ${savingsRateNum}% savings rate. `;
          if (budgetScore < 20) {
            explanation += "Reducing discretionary spending could help you stay within budget. ";
          }
          if (savingsGoalScore < 15) {
            explanation += "Consider increasing contributions to your savings goals. ";
          }
          explanation += `A few adjustments could raise your score from ${grade} to ${String.fromCharCode(grade.charCodeAt(0) - 1)}.`;
        } else if (totalScore >= 40) {
          explanation = `Your financial health needs some attention. `;
          if (savingsRateNum < 10) {
            explanation += `Your ${savingsRateNum}% savings rate is below the recommended 20%. `;
          }
          if (budgetScore < 15) {
            explanation += "You're overspending in some budget categories. ";
          }
          explanation += `Focus on reducing fixed expenses to raise your score from ${grade}.`;
        } else {
          explanation = `Your finances need immediate attention. `;
          if (plannedSavings < 0) {
            explanation += "Your planned spending exceeds your expected income. ";
          }
          if (budgets.length === 0) {
            explanation += "Setting up budgets is the first step to taking control. ";
          }
          explanation += "Consider using the AI cashflow helper to create an action plan.";
        }
        
        return explanation;
      };

      res.json({
        score: totalScore,
        grade,
        gradeColor,
        breakdown: {
          savingsRate: {
            score: Math.round(savingsRateScore),
            maxScore: 25,
            value: savingsRate.toFixed(1),
            label: "Savings Rate",
          },
          budgetAdherence: {
            score: Math.round(budgetScore),
            maxScore: 25,
            value: budgets.length > 0 ? "Active" : "No budgets",
            label: "Budget Adherence",
          },
          savingsGoals: {
            score: Math.round(savingsGoalScore),
            maxScore: 25,
            value: savingsGoals.length > 0 ? `${savingsGoals.length} goals` : "No goals",
            label: "Savings Goals",
          },
          billTracking: {
            score: Math.round(billScore),
            maxScore: 25,
            value: `${activeBills.length} bills`,
            label: "Bill Tracking",
          },
        },
        tips: tips.slice(0, 3), // Max 3 tips
        monthlyStats: {
          income: totalIncome, // Budgeted/planned income
          expenses: totalPlannedExpenses, // Budgeted spending + planned bills
          savings: totalIncome - totalPlannedExpenses, // Planned savings
          savingsRate: savingsRate.toFixed(1),
        },
        aiExplanation: generateAIExplanation(),
      });
    } catch (error) {
      console.error("Error calculating financial health:", error);
      res.status(500).json({ error: "Failed to calculate financial health score" });
    }
  });

  // FEATURE: CASH_FLOW_FORECAST | tier: pro | limit: unlimited
  // ============ CASH FLOW FORECAST ============

  app.get("/api/reports/cash-flow-forecast", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const householdId = req.session.householdId;
      const days = parseInt(req.query.days as string) || 30;

      // Determine which users to include
      let userIds = [userId];
      if (householdId) {
        userIds = await storage.getHouseholdMemberUserIds(householdId);
      }

      // Get financial data
      const [bills, incomes, plaidItems] = await Promise.all([
        householdId
          ? storage.getBillsByUserIds(userIds)
          : storage.getBills(userId),
        householdId
          ? storage.getIncomesByUserIds(userIds)
          : storage.getIncomes(userId),
        storage.getPlaidItems(userId),
      ]);

      // Get Plaid accounts and transactions
      let currentBalance = 0;
      let transactions: any[] = [];
      let allPlaidAccounts: any[] = [];

      if (plaidItems.length > 0) {
        const allAccounts = await Promise.all(
          plaidItems.map(item => storage.getPlaidAccounts(item.id))
        );
        allPlaidAccounts = allAccounts.flat();
        const activeAccounts = allPlaidAccounts.filter(a =>
          a.isActive === "true" &&
          (a.type === "depository" || a.subtype === "checking" || a.subtype === "savings")
        );

        // Sum up current balances
        currentBalance = activeAccounts.reduce((sum, acc) => {
          const balance = parseFloat(acc.balanceCurrent || "0");
          return sum + balance;
        }, 0);

        // Get last 30 days of transactions for spending patterns
        const accountIds = activeAccounts.map(a => a.id);
        if (accountIds.length > 0) {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          transactions = await storage.getPlaidTransactions(accountIds, {
            startDate: thirtyDaysAgo.toISOString().split('T')[0],
          });
        }
      }

      // Also add manual account balances
      const manualAccounts = await storage.getManualAccounts(userId);
      // Include active manual cash accounts (cash, paypal, venmo, etc. are liquid assets)
      const activeManualAccounts = manualAccounts.filter(a => a.isActive === "true");
      currentBalance += activeManualAccounts.reduce((sum, acc) => {
        return sum + parseFloat(acc.balance || "0");
      }, 0);

      // Build set of disabled Plaid account IDs for filtering
      const disabledPlaidAccountIds = new Set(
        allPlaidAccounts.filter(a => a.isActive !== "true").map(a => a.id)
      );

      // Filter to active bills only:
      // - Bill must not be paused (isPaused !== "true")
      // - If linked to a Plaid account, that account must be active
      const activeBills = bills.filter(bill => {
        if (bill.isPaused === "true") return false;
        if (bill.linkedPlaidAccountId && disabledPlaidAccountIds.has(bill.linkedPlaidAccountId)) return false;
        return true;
      });

      // Filter to active incomes only:
      // - Income must not be explicitly disabled (isActive !== "false")
      // - If linked to a Plaid account, that account must be active
      const activeIncomes = incomes.filter(inc => {
        if (inc.isActive === "false") return false;
        if (inc.linkedPlaidAccountId && disabledPlaidAccountIds.has(inc.linkedPlaidAccountId)) return false;
        return true;
      });

      // Generate forecast
      const forecast = generateCashFlowForecast(
        currentBalance,
        activeBills,
        activeIncomes,
        transactions,
        days
      );

      res.json(forecast);
    } catch (error) {
      console.error("Error generating cash flow forecast:", error);
      res.status(500).json({ error: "Failed to generate cash flow forecast" });
    }
  });

  // FEATURE: MONEY_TIMELINE | tier: free | limit: unlimited
  // ============ MONEY TIMELINE (90-DAY FORECAST) ============
  
  app.get("/api/reports/money-timeline", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const householdId = req.session.householdId;
      const days = 90; // Always 90 days for Money Timeline

      // Determine which users to include
      let userIds = [userId];
      if (householdId) {
        userIds = await storage.getHouseholdMemberUserIds(householdId);
      }

      // Get financial data
      const [bills, incomes, plaidItems] = await Promise.all([
        householdId
          ? storage.getBillsByUserIds(userIds)
          : storage.getBills(userId),
        householdId
          ? storage.getIncomesByUserIds(userIds)
          : storage.getIncomes(userId),
        storage.getPlaidItems(userId),
      ]);

      // Get Plaid accounts and transactions
      let currentBalance = 0;
      let transactions: any[] = [];
      let allPlaidAccounts: any[] = [];

      if (plaidItems.length > 0) {
        const allAccounts = await Promise.all(
          plaidItems.map(item => storage.getPlaidAccounts(item.id))
        );
        allPlaidAccounts = allAccounts.flat();
        const activeAccounts = allPlaidAccounts.filter(a =>
          a.isActive === "true" &&
          (a.type === "depository" || a.subtype === "checking" || a.subtype === "savings")
        );

        currentBalance = activeAccounts.reduce((sum, acc) => {
          const balance = parseFloat(acc.balanceCurrent || "0");
          return sum + balance;
        }, 0);

        const accountIds = activeAccounts.map(a => a.id);
        if (accountIds.length > 0) {
          const sixtyDaysAgo = new Date();
          sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
          transactions = await storage.getPlaidTransactions(accountIds, {
            startDate: sixtyDaysAgo.toISOString().split('T')[0],
          });
        }
      }

      // Also add manual account balances
      const manualAccounts = await storage.getManualAccounts(userId);
      const activeManualAccounts = manualAccounts.filter(a => a.isActive === "true");
      currentBalance += activeManualAccounts.reduce((sum, acc) => {
        return sum + parseFloat(acc.balance || "0");
      }, 0);

      // Filter to active bills and incomes
      const disabledPlaidAccountIds = new Set(
        allPlaidAccounts.filter(a => a.isActive !== "true").map(a => a.id)
      );

      const activeBills = bills.filter(bill => {
        if (bill.isPaused === "true") return false;
        if (bill.linkedPlaidAccountId && disabledPlaidAccountIds.has(bill.linkedPlaidAccountId)) return false;
        return true;
      });

      const activeIncomes = incomes.filter(inc => {
        if (inc.isActive === "false") return false;
        if (inc.linkedPlaidAccountId && disabledPlaidAccountIds.has(inc.linkedPlaidAccountId)) return false;
        return true;
      });

      // Generate 90-day forecast
      const forecast = generateCashFlowForecast(
        currentBalance,
        activeBills,
        activeIncomes,
        transactions,
        days
      );

      // Find danger day (first day balance goes negative)
      let dangerDate: string | null = null;
      let daysUntilDanger: number | null = null;
      
      for (let i = 0; i < forecast.projectedBalances.length; i++) {
        const proj = forecast.projectedBalances[i];
        if (proj.balance < 0) {
          dangerDate = proj.date;
          daysUntilDanger = i;
          break;
        }
      }

      // Calculate safe-to-spend today
      // Safe = balance minus upcoming essential bills (next 7 days) minus buffer
      const today = new Date();
      const sevenDaysLater = new Date(today);
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
      
      const next7DaysProjection = forecast.projectedBalances.slice(0, 8);
      const lowestNext7Days = Math.min(...next7DaysProjection.map(p => p.balance));
      
      // Safe to spend = current balance - lowest point in next 7 days - $200 buffer
      const buffer = 200;
      const safeToSpend = Math.max(0, currentBalance - Math.abs(lowestNext7Days - currentBalance) - buffer);

      // Generate emotional hook message
      let emotionalHook: string;
      let hookSeverity: "safe" | "warning" | "danger";
      
      if (daysUntilDanger !== null && daysUntilDanger <= 14) {
        emotionalHook = `You will run out of money in ${daysUntilDanger} days.`;
        hookSeverity = "danger";
      } else if (daysUntilDanger !== null && daysUntilDanger <= 30) {
        emotionalHook = `Caution: You may go negative on ${new Date(dangerDate!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`;
        hookSeverity = "warning";
      } else if (forecast.summary.lowestProjectedBalance < 500) {
        emotionalHook = `Your balance will get tight around ${forecast.summary.lowestBalanceDate}.`;
        hookSeverity = "warning";
      } else {
        const safeDays = daysUntilDanger || 90;
        emotionalHook = `You're safe for the next ${safeDays} days.`;
        hookSeverity = "safe";
      }

      // Build timeline data points (weekly summaries for UI efficiency)
      const timelinePoints = forecast.projectedBalances.map((proj, index) => ({
        date: proj.date,
        balance: proj.balance,
        events: proj.events,
        status: proj.balance < 0 ? "danger" as const : proj.balance < 500 ? "warning" as const : "safe" as const,
      }));

      // Calculate projected shortfall on danger date if applicable
      const projectedShortfall = dangerDate
        ? Math.abs(forecast.projectedBalances.find(p => p.date === dangerDate)?.balance || 0)
        : null;

      res.json({
        currentBalance: Math.round(currentBalance * 100) / 100,
        timeline: timelinePoints,
        dangerDate,
        daysUntilDanger,
        projectedShortfall,
        safeToSpend: Math.round(safeToSpend * 100) / 100,
        emotionalHook,
        hookSeverity,
        summary: {
          ...forecast.summary,
          totalDays: days,
          hasLinkedAccounts: plaidItems.length > 0 || activeManualAccounts.length > 0,
        },
      });
    } catch (error) {
      console.error("Error generating money timeline:", error);
      res.status(500).json({ error: "Failed to generate money timeline" });
    }
  });

  // FEATURE: WHAT_IF_SIMULATOR | tier: pro | limit: 20 simulations/month
  // ============ WHAT-IF SIMULATOR ============

  app.post("/api/simulator/what-if", requireAuth, apiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "what_if_simulator");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "what_if_simulator",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      const householdId = req.session.householdId;
      
      // Parse simulation changes from request body
      const { changes } = req.body as {
        changes: Array<{
          type: "cancel_subscription" | "extra_payment" | "new_income" | "reduce_expense";
          billId?: string;
          billName?: string;
          amount?: number;
          debtId?: string;
        }>;
      };

      if (!changes || !Array.isArray(changes)) {
        return res.status(400).json({ error: "Changes array required" });
      }

      // Determine which users to include
      let userIds = [userId];
      if (householdId) {
        userIds = await storage.getHouseholdMemberUserIds(householdId);
      }

      // Get baseline financial data
      const [bills, incomes, plaidItems, debtDetails] = await Promise.all([
        householdId ? storage.getBillsByUserIds(userIds) : storage.getBills(userId),
        householdId ? storage.getIncomesByUserIds(userIds) : storage.getIncomes(userId),
        storage.getPlaidItems(userId),
        storage.getDebtDetails(userId),
      ]);

      // Get current balance from accounts
      let currentBalance = 0;
      let transactions: any[] = [];
      let allPlaidAccounts: any[] = [];

      if (plaidItems.length > 0) {
        const allAccounts = await Promise.all(
          plaidItems.map(item => storage.getPlaidAccounts(item.id))
        );
        allPlaidAccounts = allAccounts.flat();
        const activeAccounts = allPlaidAccounts.filter(a =>
          a.isActive === "true" &&
          (a.type === "depository" || a.subtype === "checking" || a.subtype === "savings")
        );

        currentBalance = activeAccounts.reduce((sum, acc) => {
          const balance = parseFloat(acc.balanceCurrent || "0");
          return sum + balance;
        }, 0);

        const accountIds = activeAccounts.map(a => a.id);
        if (accountIds.length > 0) {
          const sixtyDaysAgo = new Date();
          sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
          transactions = await storage.getPlaidTransactions(accountIds, {
            startDate: sixtyDaysAgo.toISOString().split('T')[0],
          });
        }
      }

      // Add manual accounts
      const manualAccounts = await storage.getManualAccounts(userId);
      const activeManualAccounts = manualAccounts.filter(a => a.isActive === "true");
      currentBalance += activeManualAccounts.reduce((sum, acc) => {
        return sum + parseFloat(acc.balance || "0");
      }, 0);

      // Apply simulation changes to bills/incomes
      let simulatedBills = [...bills];
      let simulatedIncomes = [...incomes];
      let monthlyImpact = 0;
      let yearlyImpact = 0;
      let debtPayoffChange: { 
        originalPayoffMonths: number; 
        newPayoffMonths: number; 
        interestSaved: number;
        debtName: string;
      } | null = null;

      for (const change of changes) {
        if (change.type === "cancel_subscription" && change.billId) {
          // Remove the bill from simulation
          simulatedBills = simulatedBills.filter(b => b.id !== change.billId);
          const canceledBill = bills.find(b => b.id === change.billId);
          if (canceledBill) {
            const amount = parseFloat(canceledBill.amount);
            // Calculate impact based on recurrence
            if (canceledBill.recurrence === "monthly") {
              monthlyImpact += amount;
              yearlyImpact += amount * 12;
            } else if (canceledBill.recurrence === "yearly") {
              monthlyImpact += amount / 12;
              yearlyImpact += amount;
            } else if (canceledBill.recurrence === "weekly") {
              monthlyImpact += amount * 4.33;
              yearlyImpact += amount * 52;
            } else if (canceledBill.recurrence === "biweekly") {
              monthlyImpact += amount * 2.17;
              yearlyImpact += amount * 26;
            }
          }
        } else if (change.type === "extra_payment" && change.debtId && change.amount) {
          // Calculate debt payoff impact
          const debt = debtDetails.find(d => d.id === change.debtId);
          if (debt) {
            const principal = parseFloat(debt.currentBalance || "0");
            const rate = parseFloat((debt as any).interestRate || "0") / 100 / 12;
            const minPayment = parseFloat(debt.minimumPayment || "0");
            
            // Calculate months to pay off with current payment
            let balance = principal;
            let months = 0;
            let totalInterestOriginal = 0;
            while (balance > 0 && months < 600) {
              const interest = balance * rate;
              totalInterestOriginal += interest;
              balance = balance + interest - minPayment;
              months++;
            }
            
            // Calculate months with extra payment
            balance = principal;
            let newMonths = 0;
            let totalInterestNew = 0;
            const extraPayment = change.amount;
            while (balance > 0 && newMonths < 600) {
              const interest = balance * rate;
              totalInterestNew += interest;
              balance = balance + interest - minPayment - extraPayment;
              newMonths++;
            }
            
            debtPayoffChange = {
              originalPayoffMonths: months,
              newPayoffMonths: newMonths,
              interestSaved: Math.max(0, totalInterestOriginal - totalInterestNew),
              debtName: debt.name || "Debt",
            };
            
            monthlyImpact -= extraPayment; // Costs money now but saves later
          }
        } else if (change.type === "new_income" && change.amount) {
          monthlyImpact += change.amount;
          yearlyImpact += change.amount * 12;
        } else if (change.type === "reduce_expense" && change.billName && change.amount) {
          monthlyImpact += change.amount;
          yearlyImpact += change.amount * 12;
        }
      }

      // Filter active items for baseline
      const disabledPlaidAccountIds = new Set(
        allPlaidAccounts.filter(a => a.isActive !== "true").map(a => a.id)
      );

      const baselineBills = bills.filter(bill => {
        if (bill.isPaused === "true") return false;
        if (bill.linkedPlaidAccountId && disabledPlaidAccountIds.has(bill.linkedPlaidAccountId)) return false;
        return true;
      });

      const activeSimulatedBills = simulatedBills.filter(bill => {
        if (bill.isPaused === "true") return false;
        if (bill.linkedPlaidAccountId && disabledPlaidAccountIds.has(bill.linkedPlaidAccountId)) return false;
        return true;
      });

      const activeIncomes = incomes.filter(inc => {
        if (inc.isActive === "false") return false;
        if (inc.linkedPlaidAccountId && disabledPlaidAccountIds.has(inc.linkedPlaidAccountId)) return false;
        return true;
      });

      // Generate baseline and simulated forecasts
      const baselineForecast = generateCashFlowForecast(
        currentBalance,
        baselineBills,
        activeIncomes,
        transactions,
        90
      );

      const simulatedForecast = generateCashFlowForecast(
        currentBalance,
        activeSimulatedBills,
        simulatedIncomes,
        transactions,
        90
      );

      // Find danger days in both scenarios
      let baselineDangerDay: number | null = null;
      let simulatedDangerDay: number | null = null;

      for (let i = 0; i < baselineForecast.projectedBalances.length; i++) {
        if (baselineForecast.projectedBalances[i].balance < 0) {
          baselineDangerDay = i;
          break;
        }
      }

      for (let i = 0; i < simulatedForecast.projectedBalances.length; i++) {
        if (simulatedForecast.projectedBalances[i].balance < 0) {
          simulatedDangerDay = i;
          break;
        }
      }

      // Calculate days gained (how many more days until danger)
      const daysGained = baselineDangerDay !== null && simulatedDangerDay === null
        ? 90 // Avoided danger entirely
        : baselineDangerDay !== null && simulatedDangerDay !== null
        ? simulatedDangerDay - baselineDangerDay
        : 0;

      res.json({
        baseline: {
          lowestBalance: baselineForecast.summary.lowestProjectedBalance,
          lowestBalanceDate: baselineForecast.summary.lowestBalanceDate,
          dangerDay: baselineDangerDay,
          endBalance: baselineForecast.projectedBalances[89]?.balance || 0,
        },
        simulated: {
          lowestBalance: simulatedForecast.summary.lowestProjectedBalance,
          lowestBalanceDate: simulatedForecast.summary.lowestBalanceDate,
          dangerDay: simulatedDangerDay,
          endBalance: simulatedForecast.projectedBalances[89]?.balance || 0,
        },
        impact: {
          monthlyImpact: Math.round(monthlyImpact * 100) / 100,
          yearlyImpact: Math.round(yearlyImpact * 100) / 100,
          daysGained,
          debtPayoffChange,
        },


        message: daysGained > 0 
          ? `This change gives you ${daysGained} extra safe days!`
          : monthlyImpact > 0
          ? `This saves you ${formatCurrency(monthlyImpact)} per month.`
          : "This change affects your cash flow.",
      });
      // Helper function to format currency
      function formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(amount);
      }

    } catch (error) {
      console.error("Error running what-if simulation:", error);
      res.status(500).json({ error: "Failed to run simulation" });
    }
  });

  // Get user's bills for simulation options
  app.get("/api/simulator/options", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const householdId = req.session.householdId;

      let userIds = [userId];
      if (householdId) {
        userIds = await storage.getHouseholdMemberUserIds(householdId);
      }

      const [bills, debtDetails] = await Promise.all([
        householdId ? storage.getBillsByUserIds(userIds) : storage.getBills(userId),
        storage.getDebtDetails(userId),
      ]);

      // Filter to subscriptions/recurring bills that can be canceled
      const cancellableBills = bills.filter(b => 
        b.recurrence !== "one_time" && 
        b.isPaused !== "true" &&
        (b.category === "Subscriptions" || b.category === "Entertainment" || 
         b.category === "Fitness" || b.category === "Communications")
      );

      // Get debts for extra payment scenarios
      const debtsWithBalance = debtDetails.filter(d => 
        parseFloat(d.currentBalance || "0") > 0
      );

      res.json({
        bills: cancellableBills.map(b => ({
          id: b.id,
          name: b.name,
          amount: b.amount,
          category: b.category,
          recurrence: b.recurrence,
        })),
        debts: debtsWithBalance.map(d => ({
          id: d.id,
          name: d.name,
          balance: d.currentBalance,
          interestRate: (d as any).interestRate,
          minimumPayment: d.minimumPayment,
        })),
      });
    } catch (error) {
      console.error("Error getting simulation options:", error);
      res.status(500).json({ error: "Failed to get simulation options" });
    }
  });

  // FEATURE: SILENT_LEAKS_DETECTOR | tier: pro | limit: unlimited
  // ============ SILENT MONEY LEAKS DETECTOR ============

  app.get("/api/leaks/detect", requireAuth, sensitiveApiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "silent_leaks_detector");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "silent_leaks_detector",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }
      
      // Get Plaid transactions from the last 90 days
      const plaidItems = await storage.getPlaidItems(userId);
      let transactions: any[] = [];

      if (plaidItems.length > 0) {
        const allAccounts = await Promise.all(
          plaidItems.map(item => storage.getPlaidAccounts(item.id))
        );
        const activeAccounts = allAccounts.flat().filter(a =>
          a.isActive === "true" &&
          (a.type === "depository" || a.subtype === "checking" || a.subtype === "savings")
        );

        const accountIds = activeAccounts.map(a => a.id);
        if (accountIds.length > 0) {
          const ninetyDaysAgo = new Date();
          ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
          transactions = await storage.getPlaidTransactions(accountIds, {
            startDate: ninetyDaysAgo.toISOString().split('T')[0],
          });
        }
      }

      // Analyze transactions for leaks
      const leaks: Array<{
        type: "recurring_small" | "price_increase" | "duplicate" | "unused_subscription";
        name: string;
        amount: number;
        frequency: string;
        monthlyImpact: number;
        yearlyImpact: number;
        firstSeen: string;
        occurrences: number;
        confidence: number;
      }> = [];

      // Group transactions by merchant name
      const merchantGroups = new Map<string, Array<{
        amount: number;
        date: string;
        name: string;
      }>>();

      for (const tx of transactions) {
        const amount = parseFloat(tx.amount || "0");
        if (amount <= 0) continue; // Only look at charges (positive amounts in Plaid = money out)
        
        const name = (tx.merchantName || tx.name || "Unknown").toLowerCase().trim();
        if (!merchantGroups.has(name)) {
          merchantGroups.set(name, []);
        }
        merchantGroups.get(name)!.push({
          amount,
          date: tx.date || "",
          name: tx.merchantName || tx.name || "Unknown",
        });
      }

      // Detect patterns
      for (const [merchantKey, txs] of Array.from(merchantGroups)) {
        if (txs.length < 2) continue;

        // Sort by date
        txs.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Check for recurring small charges (under $50)
        const avgAmount = txs.reduce((sum, t) => sum + t.amount, 0) / txs.length;
        if (avgAmount < 50 && txs.length >= 2) {
          // Calculate average days between transactions
          let totalDays = 0;
          for (let i = 1; i < txs.length; i++) {
            const daysDiff = (new Date(txs[i].date).getTime() - new Date(txs[i-1].date).getTime()) / (1000 * 60 * 60 * 24);
            totalDays += daysDiff;
          }
          const avgDays = totalDays / (txs.length - 1);

          let frequency = "irregular";
          let monthlyMultiplier = 1;
          if (avgDays >= 28 && avgDays <= 32) {
            frequency = "monthly";
            monthlyMultiplier = 1;
          } else if (avgDays >= 6 && avgDays <= 8) {
            frequency = "weekly";
            monthlyMultiplier = 4.33;
          } else if (avgDays >= 13 && avgDays <= 16) {
            frequency = "bi-weekly";
            monthlyMultiplier = 2.17;
          } else if (avgDays >= 350 && avgDays <= 380) {
            frequency = "yearly";
            monthlyMultiplier = 1/12;
          }

          if (frequency !== "irregular") {
            const monthlyImpact = avgAmount * monthlyMultiplier;
            leaks.push({
              type: "recurring_small",
              name: txs[0].name,
              amount: Math.round(avgAmount * 100) / 100,
              frequency,
              monthlyImpact: Math.round(monthlyImpact * 100) / 100,
              yearlyImpact: Math.round(monthlyImpact * 12 * 100) / 100,
              firstSeen: txs[0].date,
              occurrences: txs.length,
              confidence: Math.min(0.95, 0.5 + txs.length * 0.1),
            });
          }
        }

        // Check for price increases
        if (txs.length >= 3) {
          const recentAmount = txs[txs.length - 1].amount;
          const olderAmount = txs[0].amount;
          if (recentAmount > olderAmount * 1.1) { // 10% increase
            leaks.push({
              type: "price_increase",
              name: txs[0].name,
              amount: Math.round((recentAmount - olderAmount) * 100) / 100,
              frequency: "detected",
              monthlyImpact: Math.round((recentAmount - olderAmount) * 100) / 100,
              yearlyImpact: Math.round((recentAmount - olderAmount) * 12 * 100) / 100,
              firstSeen: txs[0].date,
              occurrences: txs.length,
              confidence: 0.7,
            });
          }
        }
      }

      // Calculate totals
      const totalMonthlyLeaks = leaks.reduce((sum, l) => sum + l.monthlyImpact, 0);
      const totalYearlyLeaks = leaks.reduce((sum, l) => sum + l.yearlyImpact, 0);

      // Get existing leak alerts to compare
      const existingAlerts = await storage.getLeakAlerts(userId);

      res.json({
        leaks: leaks.sort((a, b) => b.monthlyImpact - a.monthlyImpact),
        summary: {

          totalLeaksFound: leaks.length,
          totalMonthlyLeaks: Math.round(totalMonthlyLeaks * 100) / 100,
          totalYearlyLeaks: Math.round(totalYearlyLeaks * 100) / 100,
          existingAlerts: existingAlerts.length,
        },
        message: totalMonthlyLeaks > 0 
          ? `Found ${formatCurrency(totalMonthlyLeaks)}/month in potential leaks!`
          : "No obvious money leaks detected.",
      });

      // Helper function to format currency
      function formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(amount);
      }

    } catch (error) {
      console.error("Error detecting money leaks:", error);
      res.status(500).json({ error: "Failed to detect money leaks" });
    }
  });

  // Get leak alerts for user
  app.get("/api/leaks/alerts", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const alerts = await storage.getLeakAlerts(userId);
      res.json(alerts);
    } catch (error) {
      console.error("Error getting leak alerts:", error);
      res.status(500).json({ error: "Failed to get leak alerts" });
    }
  });

  // Dismiss a leak alert
  app.post("/api/leaks/alerts/:id/dismiss", requireAuth, async (req, res) => {
    try {
      const id = req.params.id as string;
      const alert = await storage.dismissLeakAlert(id);
      if (!alert) {
        return res.status(404).json({ error: "Alert not found" });
      }
      res.json(alert);
    } catch (error) {
      console.error("Error dismissing leak alert:", error);
      res.status(500).json({ error: "Failed to dismiss alert" });
    }
  });

  // FEATURE: AUTOPILOT_RULES | tier: pro | limit: 10 rules
  // FEATURE: FINANCIAL_AUTOPILOT | tier: pro | limit: unlimited
  // ============ FINANCIAL AUTOPILOT ============

  // Get autopilot rules
  app.get("/api/autopilot/rules", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const rules = await storage.getAutopilotRules(userId);
      res.json(rules);
    } catch (error) {
      console.error("Error getting autopilot rules:", error);
      res.status(500).json({ error: "Failed to get autopilot rules" });
    }
  });

  // Create autopilot rule
  app.post("/api/autopilot/rules", requireAuth, apiRateLimiter, async (req, res) => {
    try {
      if ((req.session as any).isDemo) {
        return res.status(403).json({ error: "Demo accounts cannot create autopilot rules" });
      }
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);

      // Cumulative count check for autopilot_rules
      const limit = await getFeatureLimit(plan, "autopilot_rules");
      if (limit !== null) {
        const { rows } = await pool.query(
          "SELECT COUNT(*) as count FROM autopilot_rules WHERE user_id = $1",
          [userId]
        );
        const currentCount = parseInt(rows[0]?.count || "0", 10);
        if (currentCount >= limit) {
          return res.status(402).json({
            feature: "autopilot_rules",
            remaining: 0,
            resetDate: null,
            upgradeRequired: true,
          });
        }
      }

      const { ruleType, category, threshold, action, isActive } = req.body;
      
      const rule = await storage.createAutopilotRule({
        userId,
        name: ruleType || "Autopilot Rule",
        ruleType: ruleType || "spending_limit",
        category: category || null,
        threshold: threshold?.toString() || "0",
        isActive: isActive !== false ? "true" : "false",
      });
      
      res.json(rule);
    } catch (error) {
      console.error("Error creating autopilot rule:", error);
      res.status(500).json({ error: "Failed to create autopilot rule" });
    }
  });

  // Update autopilot rule
  app.patch("/api/autopilot/rules/:id", requireAuth, async (req, res) => {
    try {
      if ((req.session as any).isDemo) {
        return res.status(403).json({ error: "Demo accounts cannot update autopilot rules" });
      }
      const id = req.params.id as string;
      const rule = await storage.updateAutopilotRule(id, req.body);
      if (!rule) {
        return res.status(404).json({ error: "Rule not found" });
      }
      res.json(rule);
    } catch (error) {
      console.error("Error updating autopilot rule:", error);
      res.status(500).json({ error: "Failed to update autopilot rule" });
    }
  });

  // Delete autopilot rule
  app.delete("/api/autopilot/rules/:id", requireAuth, async (req, res) => {
    try {
      if ((req.session as any).isDemo) {
        return res.status(403).json({ error: "Demo accounts cannot delete autopilot rules" });
      }
      const id = req.params.id as string;
      await storage.deleteAutopilotRule(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting autopilot rule:", error);
      res.status(500).json({ error: "Failed to delete autopilot rule" });
    }
  });

  // Get spendability meter (how much is safe to spend today)
  app.get("/api/autopilot/spendability", requireAuth, apiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "financial_autopilot");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "financial_autopilot",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      const householdId = req.session.householdId;

      let userIds = [userId];
      if (householdId) {
        userIds = await storage.getHouseholdMemberUserIds(householdId);
      }

      // Get financial data
      const [bills, incomes, plaidItems, budgets] = await Promise.all([
        householdId ? storage.getBillsByUserIds(userIds) : storage.getBills(userId),
        householdId ? storage.getIncomesByUserIds(userIds) : storage.getIncomes(userId),
        storage.getPlaidItems(userId),
        storage.getBudgets(userId),
      ]);

      // Calculate current balance
      let currentBalance = 0;
      if (plaidItems.length > 0) {
        const allAccounts = await Promise.all(
          plaidItems.map(item => storage.getPlaidAccounts(item.id))
        );
        const activeAccounts = allAccounts.flat().filter(a =>
          a.isActive === "true" &&
          (a.type === "depository" || a.subtype === "checking" || a.subtype === "savings")
        );
        currentBalance = activeAccounts.reduce((sum, acc) => 
          sum + parseFloat(acc.balanceCurrent || "0"), 0
        );
      }

      // Add manual accounts
      const manualAccounts = await storage.getManualAccounts(userId);
      currentBalance += manualAccounts
        .filter(a => a.isActive === "true")
        .reduce((sum, acc) => sum + parseFloat(acc.balance || "0"), 0);

      // Calculate upcoming bills for next 7 days
      const today = new Date();
      const upcomingBills = bills.filter(bill => {
        if (bill.isPaused === "true") return false;
        const dueDay = bill.dueDay;
        const todayDay = today.getDate();
        const daysUntilDue = dueDay >= todayDay 
          ? dueDay - todayDay 
          : 30 - todayDay + dueDay;
        return daysUntilDue <= 7;
      });

      const upcomingBillsTotal = upcomingBills.reduce((sum, b) => 
        sum + parseFloat(b.amount), 0
      );

      // Calculate safe spending amount
      const safeBuffer = 100; // Minimum buffer
      const safeToSpend = Math.max(0, currentBalance - upcomingBillsTotal - safeBuffer);
      
      // Calculate daily allowance (until next paycheck)
      const nextIncomeDate = incomes
        .filter(i => i.isActive !== "false")
        .map(i => {
          const payDay = parseInt((i as any).payFrequency === "weekly" ? "7" : 
            (i as any).payFrequency === "biweekly" ? "14" : "30");
          return payDay;
        })[0] || 14;
      
      const dailyAllowance = safeToSpend / Math.max(1, nextIncomeDate);

      // Determine spending status
      let status: "safe" | "caution" | "danger" = "safe";
      if (currentBalance < upcomingBillsTotal) {
        status = "danger";
      } else if (safeToSpend < 200) {
        status = "caution";
      }

      res.json({

        currentBalance: Math.round(currentBalance * 100) / 100,
        safeToSpend: Math.round(safeToSpend * 100) / 100,
        dailyAllowance: Math.round(dailyAllowance * 100) / 100,
        upcomingBillsTotal: Math.round(upcomingBillsTotal * 100) / 100,
        upcomingBillsCount: upcomingBills.length,
        daysUntilNextPayday: nextIncomeDate,
        status,
        message: status === "danger" 
          ? "Warning: Bills exceed your balance!"
          : status === "caution"
          ? "Be careful - limited spending room"
          : `You can safely spend ${formatCurrency(dailyAllowance)}/day`,
      });
      // Helper function to format currency
      function formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(amount);
      }

    } catch (error) {
      console.error("Error calculating spendability:", error);
      res.status(500).json({ error: "Failed to calculate spendability" });
    }
  });

  // FEATURE: PAYDAY_OPTIMIZER | tier: pro | limit: unlimited
  // ============ PAYDAY OPTIMIZER ============

  app.get("/api/payday/optimize", requireAuth, apiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "payday_optimizer");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "payday_optimizer",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      const householdId = req.session.householdId;

      let userIds = [userId];
      if (householdId) {
        userIds = await storage.getHouseholdMemberUserIds(householdId);
      }

      const [bills, incomes] = await Promise.all([
        householdId ? storage.getBillsByUserIds(userIds) : storage.getBills(userId),
        householdId ? storage.getIncomesByUserIds(userIds) : storage.getIncomes(userId),
      ]);

      // Get pay dates
      const payDates: number[] = incomes
        .filter(i => i.isActive !== "false")
        .flatMap(i => {
          const payDay = parseInt((i as any).payFrequency === "monthly" ? i.amount.split("-")[0] || "15" : "15");
          if ((i as any).payFrequency === "biweekly") {
            return [1, 15]; // Approximate biweekly as 1st and 15th
          }
          return [payDay];
        });

      // Analyze bill timing
      const recommendations: Array<{
        billName: string;
        currentDueDay: number;
        recommendedDueDay: number;
        reason: string;
        savingsEstimate: number;
      }> = [];

      for (const bill of bills) {
        if (bill.isPaused === "true") continue;
        const dueDay = bill.dueDay;
        
        // Find the closest pay date that comes before the due date
        const sortedPayDates = payDates.sort((a, b) => a - b);
        let optimalDueDay = dueDay;
        let reason = "";

        // Check if due date is too close to start of month (before first paycheck)
        if (dueDay < 5 && payDates.includes(15)) {
          optimalDueDay = 17; // Move to just after mid-month pay
          reason = "Move after mid-month paycheck for better cash flow";
        }
        // Check if clustered with many other bills
        const sameDayBills = bills.filter(b => b.dueDay === dueDay);
        if (sameDayBills.length > 2) {
          optimalDueDay = dueDay + 3; // Spread out
          reason = "Spread out clustered bills for smoother cash flow";
        }

        if (optimalDueDay !== dueDay) {
          recommendations.push({
            billName: bill.name,
            currentDueDay: dueDay,
            recommendedDueDay: optimalDueDay,
            reason,
            savingsEstimate: 0, // Could calculate overdraft fees avoided
          });
        }
      }

      // Calculate bill clustering score
      const dueDayCounts = new Map<number, number>();
      bills.forEach(b => {
        const day = b.dueDay;
        dueDayCounts.set(day, (dueDayCounts.get(day) || 0) + 1);
      });
      const clusteringScore = Math.max(...Array.from(dueDayCounts.values()), 0);

      // Sort pay dates for final response (already sorted above, use existing)
      const finalSortedPayDates = [...payDates].sort((a, b) => a - b);

      res.json({
        recommendations,
        payDates: finalSortedPayDates,
        clusteringScore,
        isOptimized: recommendations.length === 0,
        message: recommendations.length > 0
          ? `Found ${recommendations.length} bills that could be better timed`
          : "Your bill timing is well optimized!",
      });
    } catch (error) {
      console.error("Error optimizing payday:", error);
      res.status(500).json({ error: "Failed to optimize payday" });
    }
  });

  // FEATURE: AI_DAILY_COACH | tier: pro | limit: unlimited
  // ============ AI MONEY COACH NOTIFICATIONS ============

  app.get("/api/coach/daily-briefing", requireAuth, sensitiveApiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "ai_daily_coach");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "ai_daily_coach",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      // Gather financial context
      const [
        spendabilityResponse,
        leaksResponse,
        bills,
        budgets,
      ] = await Promise.all([
        (async () => {
          const householdId = req.session.householdId;
          let userIds = [userId];
          if (householdId) {
            userIds = await storage.getHouseholdMemberUserIds(householdId);
          }
          const [billsData, incomes, plaidItems] = await Promise.all([
            householdId ? storage.getBillsByUserIds(userIds) : storage.getBills(userId),
            householdId ? storage.getIncomesByUserIds(userIds) : storage.getIncomes(userId),
            storage.getPlaidItems(userId),
          ]);

          let balance = 0;
          if (plaidItems.length > 0) {
            const allAccounts = await Promise.all(
              plaidItems.map(item => storage.getPlaidAccounts(item.id))
            );
            balance = allAccounts.flat()
              .filter(a => a.isActive === "true" && a.type === "depository")
              .reduce((sum, acc) => sum + parseFloat(acc.balanceCurrent || "0"), 0);
          }
          const manualAccounts = await storage.getManualAccounts(userId);
          balance += manualAccounts
            .filter(a => a.isActive === "true")
            .reduce((sum, acc) => sum + parseFloat(acc.balance || "0"), 0);

          return { balance, bills: billsData, incomes };
        })(),
        storage.getLeakAlerts(userId),
        storage.getBills(userId),
        storage.getBudgets(userId),
      ]);

      // Build daily insights
      const insights: Array<{
        type: "info" | "warning" | "success" | "tip";
        title: string;
        message: string;
        action?: string;
      }> = [];

      // Check balance status
      if (spendabilityResponse.balance < 500) {
        insights.push({

          type: "warning",
          title: "Low Balance Alert",
          message: `Your account balance is ${formatCurrency(spendabilityResponse.balance)}. Consider reducing spending.`,
        });
      }

      // Check upcoming bills
      const today = new Date();
      const upcomingBills = bills.filter(bill => {
        if (bill.isPaused === "true") return false;
        const dueDay = bill.dueDay;
        const todayDay = today.getDate();
        return Math.abs(dueDay - todayDay) <= 2;
      });

      if (upcomingBills.length > 0) {
        const total = upcomingBills.reduce((sum, b) => sum + parseFloat(b.amount), 0);
        insights.push({
          type: "info",
          title: "Bills Due Soon",
          message: `You have ${upcomingBills.length} bills (${formatCurrency(total)}) due in the next 2 days.`,
          action: "Review bills",
        });
      }

      // Check for leaks
      if (leaksResponse.length > 0) {
        insights.push({
          type: "tip",
          title: "Money Leaks Detected",
          message: `You have ${leaksResponse.length} potential money leaks to review.`,
          action: "View leaks",
        });
      }

      // Daily spending allowance
      const dailyAllowance = spendabilityResponse.balance / 14; // Rough 2-week estimate
      insights.push({
        type: "success",
        title: "Daily Spending Allowance",
        message: `Based on your balance, you can safely spend about ${formatCurrency(dailyAllowance)} per day.`,
      });

      res.json({
        greeting: getGreeting(),
        insights,
        quickStats: {
          balance: spendabilityResponse.balance,
          dailyAllowance: Math.round(dailyAllowance * 100) / 100,
          upcomingBillsCount: upcomingBills.length,
          leaksCount: leaksResponse.length,
        },
      });

      function getGreeting(): string {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
      }

      // Helper function to format currency
      function formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(amount);
      }

    } catch (error) {
      console.error("Error getting daily briefing:", error);
      res.status(500).json({ error: "Failed to get daily briefing" });
    }
  });

  // ============ TRIAL CONVERSION FLOW ============

  // DEPRECATED: Trial status endpoint - kept for backwards compatibility
  // Returns no-op response since trials are removed in freemium model
  app.get("/api/trial/status", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Return minimal response - no trial in freemium model
      res.json({
        daysSinceSignup: 0,
        trialDaysRemaining: 0,
        isTrialExpired: false,
        currentPhase: null,
        valueRealized: { billsTracked: 0, expensesLogged: 0, budgetsCreated: 0, estimatedSavings: 0 },
        showConversionModal: false,
        isPremium: plan === "pro" || plan === "family",
      });
    } catch (error) {
      console.error("Error getting trial status:", error);
      res.status(500).json({ error: "Failed to get trial status" });
    }
  });

  // DEPRECATED: Trial event logging - kept for backwards compatibility
  app.post("/api/trial/events", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { eventType, eventData } = req.body;

      const event = await storage.createTrialEvent({
        userId,
        eventType,
        eventData: eventData || null,
        createdAt: new Date().toISOString(),
      });

      res.json(event);
    } catch (error) {
      console.error("Error logging trial event:", error);
      res.status(500).json({ error: "Failed to log event" });
    }
  });

  // ============ SMART SAVINGS ============

  app.get("/api/savings/safe-to-save", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const householdId = req.session.householdId;

      // Determine which users to include
      let userIds = [userId];
      if (householdId) {
        userIds = await storage.getHouseholdMemberUserIds(householdId);
      }

      // Get financial data
      const [bills, incomes, savingsGoals, plaidItems] = await Promise.all([
        householdId
          ? storage.getBillsByUserIds(userIds)
          : storage.getBills(userId),
        householdId
          ? storage.getIncomesByUserIds(userIds)
          : storage.getIncomes(userId),
        householdId
          ? storage.getSavingsGoalsByUserIds(userIds)
          : storage.getSavingsGoals(userId),
        storage.getPlaidItems(userId),
      ]);

      // Calculate current balance from Plaid accounts
      let currentBalance = 0;
      let transactions: any[] = [];
      let allPlaidAccounts: any[] = [];

      if (plaidItems.length > 0) {
        const allAccounts = await Promise.all(
          plaidItems.map(item => storage.getPlaidAccounts(item.id))
        );
        allPlaidAccounts = allAccounts.flat();
        const activeAccounts = allPlaidAccounts.filter(a =>
          a.isActive === "true" &&
          (a.type === "depository" || a.subtype === "checking" || a.subtype === "savings")
        );

        currentBalance = activeAccounts.reduce((sum, acc) => {
          const balance = parseFloat(acc.balanceCurrent || "0");
          return sum + balance;
        }, 0);

        const accountIds = activeAccounts.map(a => a.id);
        if (accountIds.length > 0) {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          transactions = await storage.getPlaidTransactions(accountIds, {
            startDate: thirtyDaysAgo.toISOString().split('T')[0],
          });
        }
      }

      // Add manual account balances (cash, paypal, venmo, etc. are liquid assets)
      const manualAccounts = await storage.getManualAccounts(userId);
      const activeManualAccounts = manualAccounts.filter(a => a.isActive === "true");
      currentBalance += activeManualAccounts.reduce((sum, acc) => {
        return sum + parseFloat(acc.balance || "0");
      }, 0);

      // Build set of disabled Plaid account IDs for filtering
      const disabledPlaidAccountIds = new Set(
        allPlaidAccounts.filter(a => a.isActive !== "true").map(a => a.id)
      );

      // Filter to active bills only:
      // - Bill must not be paused (isPaused !== "true")
      // - If linked to a Plaid account, that account must be active
      const activeBills = bills.filter(bill => {
        if (bill.isPaused === "true") return false;
        if (bill.linkedPlaidAccountId && disabledPlaidAccountIds.has(bill.linkedPlaidAccountId)) return false;
        return true;
      });

      // Filter to active incomes only:
      // - Income must not be explicitly disabled (isActive !== "false")
      // - If linked to a Plaid account, that account must be active
      const activeIncomes = incomes.filter(inc => {
        if (inc.isActive === "false") return false;
        if (inc.linkedPlaidAccountId && disabledPlaidAccountIds.has(inc.linkedPlaidAccountId)) return false;
        return true;
      });
      let upcomingBills = 0;
      const now = new Date();
      const twoWeeksFromNow = new Date();
      twoWeeksFromNow.setDate(now.getDate() + 14);

      for (const bill of activeBills) {
        const dueDay = bill.dueDay;
        const billDate = new Date(now.getFullYear(), now.getMonth(), dueDay);

        // Check if bill is due in the next 14 days
        if (billDate >= now && billDate <= twoWeeksFromNow) {
          upcomingBills += parseFloat(bill.amount);
        } else {
          // Check next month too
          const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
          if (nextMonthDate >= now && nextMonthDate <= twoWeeksFromNow) {
            upcomingBills += parseFloat(bill.amount);
          }
        }
      }

      // Calculate predicted spending (next 14 days based on historical average)
      const avgDailySpending = calculateAverageDailySpending(transactions, 30);
      const predictedSpending = avgDailySpending * 14;

      // Calculate safety buffer (10% of balance or $200, whichever is higher)
      const safetyBuffer = Math.max(200, currentBalance * 0.1);

      // Calculate safe to save
      const safeToSave = Math.max(0,
        currentBalance - upcomingBills - predictedSpending - safetyBuffer
      );

      // Calculate round-up potential from transactions
      let roundUpPotential = 0;
      let transactionCount = 0;
      for (const tx of transactions) {
        const amount = parseFloat(tx.amount);
        if (amount > 0 && amount < 100) { // Only purchases under $100
          const cents = amount % 1;
          if (cents > 0) {
            roundUpPotential += (1 - cents);
            transactionCount++;
          }
        }
      }

      // Find next income date
      const nextIncome = findNextIncomeDate(activeIncomes);
      const daysUntilNextIncome = nextIncome
        ? Math.ceil((nextIncome.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Format savings goals
      const activeGoals = savingsGoals
        .filter(g => parseFloat(g.currentAmount) < parseFloat(g.targetAmount))
        .map(g => ({
          id: g.id,
          name: g.name,
          target: parseFloat(g.targetAmount),
          current: parseFloat(g.currentAmount),
          remaining: parseFloat(g.targetAmount) - parseFloat(g.currentAmount),
        }));

      // Generate recommendations
      const recommendations: string[] = [];
      if (safeToSave > 100) {
        recommendations.push(`You can safely save $${Math.round(safeToSave)} this week`);
      }
      if (roundUpPotential > 10) {
        recommendations.push(`Round-up savings could add $${Math.round(roundUpPotential)}/month`);
      }
      if (activeGoals.length > 0 && safeToSave > 0) {
        const topGoal = activeGoals[0];
        recommendations.push(`Put it toward your "${topGoal.name}" goal ($${Math.round(topGoal.remaining)} to go)`);
      }

      res.json({
        safeToSave: Math.round(safeToSave * 100) / 100,
        breakdown: {
          currentBalance: Math.round(currentBalance * 100) / 100,
          upcomingBills: Math.round(upcomingBills * 100) / 100,
          predictedSpending: Math.round(predictedSpending * 100) / 100,
          safetyBuffer: Math.round(safetyBuffer * 100) / 100,
        },
        roundUpSuggestion: {
          potential: Math.round(roundUpPotential * 100) / 100,
          averagePerTransaction: transactionCount > 0
            ? Math.round((roundUpPotential / transactionCount) * 100) / 100
            : 0,
        },
        nextIncomeIn: daysUntilNextIncome,
        savingsGoals: activeGoals,
        recommendations,
      });
    } catch (error) {
      console.error("Error calculating safe to save:", error);
      res.status(500).json({ error: "Failed to calculate safe to save amount" });
    }
  });

  // FEATURE: AI_INSIGHTS | tier: pro | limit: unlimited
  // ============ AI INSIGHTS ============

  app.get("/api/ai/insights", requireAuth, sensitiveApiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "ai_insights");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "ai_insights",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      const includeRead = req.query.includeRead === "true";
      const includeDismissed = req.query.includeDismissed === "true";

      const insights = await storage.getAiInsights(userId, {
        includeRead,
        includeDismissed,
      });

      res.json(insights);
    } catch (error) {
      console.error("Error fetching AI insights:", error);
      res.status(500).json({ error: "Failed to fetch AI insights" });
    }
  });

  app.post("/api/ai/insights/:id/read", requireAuth, async (req, res) => {
    try {
      const id = req.params.id as string;
      const insight = await storage.updateAiInsight(id, { isRead: "true" });
      if (!insight) {
        return res.status(404).json({ error: "Insight not found" });
      }
      res.json(insight);
    } catch (error) {
      console.error("Error marking insight as read:", error);
      res.status(500).json({ error: "Failed to update insight" });
    }
  });

  app.post("/api/ai/insights/:id/dismiss", requireAuth, async (req, res) => {
    try {
      const id = req.params.id as string;
      const insight = await storage.updateAiInsight(id, { isDismissed: "true" });
      if (!insight) {
        return res.status(404).json({ error: "Insight not found" });
      }
      res.json(insight);
    } catch (error) {
      console.error("Error dismissing insight:", error);
      res.status(500).json({ error: "Failed to dismiss insight" });
    }
  });

  // FEATURE: SECURITY_ALERTS | tier: pro | limit: unlimited
  // ============ TRANSACTION ANOMALIES ============

  app.get("/api/anomalies", requireAuth, sensitiveApiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "security_alerts");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "security_alerts",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      const includeReviewed = req.query.includeReviewed === "true";
      const includeDismissed = req.query.includeDismissed === "true";

      // Legacy transaction anomalies
      const anomalies = await storage.getTransactionAnomalies(userId, {
        includeReviewed,
      });

      // AI-powered anomaly alerts
      const { getAnomalyAlerts } = await import("./anomaly-detector");
      const alerts = await getAnomalyAlerts(userId, { includeDismissed });

      res.json({ anomalies, alerts });
    } catch (error) {
      console.error("Error fetching anomalies:", error);
      res.status(500).json({ error: "Failed to fetch anomalies" });
    }
  });

  app.post("/api/anomalies/:id/review", requireAuth, async (req, res) => {
    try {
      const id = req.params.id as string;
      const { isFalsePositive } = req.body;

      const anomaly = await storage.updateTransactionAnomaly(id, {
        isReviewed: "true",
        isFalsePositive: isFalsePositive === true ? "true" : "false",
        reviewedAt: new Date().toISOString(),
      });

      if (!anomaly) {
        return res.status(404).json({ error: "Anomaly not found" });
      }

      res.json(anomaly);
    } catch (error) {
      console.error("Error reviewing anomaly:", error);
      res.status(500).json({ error: "Failed to review anomaly" });
    }
  });

  // ===== ANOMALY ALERTS (anomaly_alerts table — AI-powered) =====

  app.patch("/api/anomalies/:id/dismiss", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const id = req.params.id as string;
      const { dismissAlert } = await import("./anomaly-detector");
      const alert = await dismissAlert(id, userId);
      if (!alert) return res.status(404).json({ error: "Anomaly not found" });
      res.json(alert);
    } catch (error) {
      console.error("Error dismissing anomaly:", error);
      res.status(500).json({ error: "Failed to dismiss anomaly" });
    }
  });

  app.patch("/api/anomalies/:id/resolve", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const id = req.params.id as string;
      const { resolveAlert } = await import("./anomaly-detector");
      const alert = await resolveAlert(id, userId);
      if (!alert) return res.status(404).json({ error: "Anomaly not found" });
      res.json(alert);
    } catch (error) {
      console.error("Error resolving anomaly:", error);
      res.status(500).json({ error: "Failed to resolve anomaly" });
    }
  });

  app.post("/api/admin/anomalies/run-detection", requireAdmin, async (req, res) => {
    try {
      const { userId: targetUserId } = req.body || {};
      const { detectAnomalies } = await import("./anomaly-detector");
      if (targetUserId) {
        const alerts = await detectAnomalies(targetUserId);
        return res.json({ ran: 1, totalAlerts: alerts.length });
      }
      // Run for all users
      const allUsers = await storage.getUsers();
      let total = 0;
      for (const user of allUsers) {
        try {
          const alerts = await detectAnomalies(user.id);
          total += alerts.length;
        } catch (err) {
          console.error(`Anomaly detection failed for user ${user.id}:`, err);
        }
      }
      res.json({ ran: allUsers.length, totalAlerts: total });
    } catch (error) {
      console.error("Error running anomaly detection:", error);
      res.status(500).json({ error: "Failed to run anomaly detection" });
    }
  });

  // FEATURE: AI_TRANSACTION_CATEGORIZATION | tier: pro | limit: unlimited
  // ============ AI AUTO-RECONCILIATION ============

  app.post("/api/plaid/transactions/auto-reconcile", requireAuth, sensitiveApiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "ai_transaction_categorization");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "ai_transaction_categorization",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }
      
      // Get all plaid items and accounts for this user
      const plaidItems = await storage.getPlaidItems(userId);
      if (plaidItems.length === 0) {
        return res.json({ reconciled: 0, message: "No connected bank accounts" });
      }

      // Get all active accounts
      const allAccounts = await Promise.all(
        plaidItems.map(item => storage.getPlaidAccounts(item.id))
      );
      const activeAccounts = allAccounts.flat().filter(a => a.isActive === "true");
      const accountIds = activeAccounts.map(a => a.id);

      // Get unreconciled transactions
      const transactions = await storage.getPlaidTransactions(accountIds);
      const unreconciledTxs = transactions.filter(t => t.reconciled !== "true");

      if (unreconciledTxs.length === 0) {
        return res.json({ reconciled: 0, message: "No unreconciled transactions" });
      }

      // Get user's bills, expenses, and income for matching
      const [bills, incomes] = await Promise.all([
        storage.getBills(userId),
        storage.getIncomes(userId),
      ]);

      // Get existing reconciliation rules
      const rules = await storage.getReconciliationRules(userId);

      let reconciledCount = 0;
      const newRules: Array<{ pattern: string; matchType: string; category: string }> = [];

      for (const tx of unreconciledTxs) {
        const merchantName = (tx.merchantName || tx.name || "").toLowerCase();
        const amount = parseFloat(tx.amount);
        const isCredit = amount < 0; // Negative = money coming in

        // Check existing rules first
        let matched = false;
        for (const rule of rules) {
          if (merchantName.includes(rule.merchantPattern.toLowerCase())) {
            await storage.updatePlaidTransaction(tx.id, {
              matchType: rule.matchType,
              personalCategory: rule.matchedCategory,
              reconciled: "true",
              matchedBillId: rule.matchType === "bill" ? rule.matchedItemId : null,
              matchedIncomeId: rule.matchType === "income" ? rule.matchedItemId : null,
            });
            await storage.updateReconciliationRule(rule.id, {
              timesApplied: (rule.timesApplied || 0) + 1,
            });
            reconciledCount++;
            matched = true;
            break;
          }
        }

        if (matched) continue;

        // Auto-detect based on transaction type
        if (isCredit) {
          // Credit transaction - likely income
          // Check for EMT, deposit, payroll keywords
          const incomeKeywords = ["e-transfer", "etransfer", "emt", "deposit", "payroll", "salary", "direct deposit", "refund"];
          const isLikelyIncome = incomeKeywords.some(kw => merchantName.includes(kw));

          if (isLikelyIncome) {
            // Try to match to existing income source
            const matchedIncome = incomes.find(i => 
              merchantName.includes(i.source.toLowerCase()) ||
              Math.abs(Math.abs(amount) - parseFloat(i.amount)) < 1
            );

            await storage.updatePlaidTransaction(tx.id, {
              matchType: "income",
              personalCategory: matchedIncome?.category || "Other",
              reconciled: "true",
              matchedIncomeId: matchedIncome?.id || null,
            });

            // Create a rule for future matching
            if (merchantName.length > 3) {
              newRules.push({
                pattern: merchantName.substring(0, 20),
                matchType: "income",
                category: matchedIncome?.category || "Other",
              });
            }
            reconciledCount++;
            continue;
          }
        } else {
          // Debit transaction - try to match to bills
          const matchedBill = bills.find(b => {
            const billName = b.name.toLowerCase();
            return merchantName.includes(billName) || billName.includes(merchantName.substring(0, 5));
          });

          if (matchedBill) {
            await storage.updatePlaidTransaction(tx.id, {
              matchType: "bill",
              personalCategory: matchedBill.category,
              reconciled: "true",
              matchedBillId: matchedBill.id,
            });

            if (merchantName.length > 3) {
              newRules.push({
                pattern: merchantName.substring(0, 20),
                matchType: "bill",
                category: matchedBill.category,
              });
            }
            reconciledCount++;
            continue;
          }
        }
      }

      // Save new rules
      for (const newRule of newRules) {
        // Check if similar rule already exists
        const exists = rules.some(r => r.merchantPattern.toLowerCase() === newRule.pattern);
        if (!exists) {
          await storage.createReconciliationRule({
            userId,
            merchantPattern: newRule.pattern,
            matchType: newRule.matchType,
            matchedCategory: newRule.category,
            isAutoGenerated: "true",
          });
        }
      }

      res.json({
        reconciled: reconciledCount,
        newRulesCreated: newRules.length,
        message: `Auto-reconciled ${reconciledCount} transactions and created ${newRules.length} new rules`,
      });
    } catch (error) {
      console.error("Error auto-reconciling:", error);
      res.status(500).json({ error: "Failed to auto-reconcile transactions" });
    }
  });

  // ── NEW: Smart auto-reconcile endpoint (uses auto-reconciler.ts) ──────────
  // POST /api/transactions/auto-reconcile
  // Runs the full 3-step auto-reconciliation pipeline for the current user.
  // Step 1: Match transactions → Bills
  // Step 2: Match transactions → Expenses
  // Step 3: Auto-create Expense records for remaining unmatched spending
  app.post("/api/transactions/auto-reconcile", requireAuth, sensitiveApiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const result = await autoReconcile(userId);
      res.json({
        success: true,
        billMatches: result.billMatches,
        expenseMatches: result.expenseMatches,
        autoCreated: result.autoCreated,
        total: result.billMatches + result.expenseMatches + result.autoCreated,
        message: `Reconciled ${result.billMatches + result.expenseMatches + result.autoCreated} transactions ` +
          `(${result.billMatches} bill matches, ${result.expenseMatches} expense matches, ${result.autoCreated} auto-created)`,
      });
    } catch (error) {
      console.error("Error running auto-reconcile:", error);
      res.status(500).json({ error: "Failed to auto-reconcile transactions" });
    }
  });

  // ============ REFERRAL PROGRAM ============
  // TODO: Partnero affiliate program will replace this feature.

  // Get or create referral code for current user
  app.get("/api/referrals/code", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;

      let referralCode = await storage.getReferralCode(userId);

      if (!referralCode) {
        // Generate a unique referral code
        const user = await storage.getUser(userId);
        let code = "";

        // Try to create a personalized code based on username
        if (user?.username) {
          const base = user.username.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);
          const random = Math.random().toString(36).substring(2, 6).toUpperCase();
          code = `${base}${random}`;
        } else {
          // Generate a random code
          code = Math.random().toString(36).substring(2, 10).toUpperCase();
        }

        // Make sure code is unique
        let attempts = 0;
        while (await storage.getReferralCodeByCode(code)) {
          code = Math.random().toString(36).substring(2, 10).toUpperCase();
          attempts++;
          if (attempts > 10) break;
        }

        referralCode = await storage.createReferralCode(userId, code);
      }

      res.json(referralCode);
    } catch (error) {
      console.error("Error getting referral code:", error);
      res.status(500).json({ error: "Failed to get referral code" });
    }
  });

  // Get referral statistics for current user
  app.get("/api/referrals/stats", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;

      const referralCode = await storage.getReferralCode(userId);
      const referrals = await storage.getReferrals(userId);

      const stats = {
        code: referralCode?.code || null,
        totalInvites: referralCode?.totalReferrals || 0,
        successfulReferrals: referralCode?.successfulReferrals || 0,
        pendingReferrals: referrals.filter(r => r.status === "pending").length,
        registeredReferrals: referrals.filter(r => r.status === "registered").length,
        activeReferrals: referrals.filter(r => r.status === "active" || r.status === "rewarded").length,
      };

      res.json(stats);
    } catch (error) {
      console.error("Error getting referral stats:", error);
      res.status(500).json({ error: "Failed to get referral statistics" });
    }
  });

  // Get list of referrals
  app.get("/api/referrals", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const referrals = await storage.getReferrals(userId);

      // Mask email addresses for privacy
      const maskedReferrals = referrals.map(r => ({
        ...r,
        referredEmail: r.referredEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
      }));

      res.json(maskedReferrals);
    } catch (error) {
      console.error("Error getting referrals:", error);
      res.status(500).json({ error: "Failed to get referrals" });
    }
  });

  // Send a referral invitation
  app.post("/api/referrals/invite", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { email } = req.body;

      if (!email || !email.includes("@")) {
        return res.status(400).json({ error: "Valid email is required" });
      }

      // Check if this email already has a referral from this user
      const existingReferral = await storage.getReferralByEmail(email);
      if (existingReferral) {
        return res.status(400).json({ error: "This email has already been invited" });
      }

      // Check if email is already registered
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "This person is already a member" });
      }

      // Get or create referral code
      let referralCode = await storage.getReferralCode(userId);
      if (!referralCode) {
        const code = Math.random().toString(36).substring(2, 10).toUpperCase();
        referralCode = await storage.createReferralCode(userId, code);
      }

      // Create the referral
      const referral = await storage.createReferral({
        referrerId: userId,
        referredEmail: email,
        referralCode: referralCode.code,
      });

      // Increment total referral count
      await storage.incrementReferralCount(userId, false);

      // Send invitation email
      const user = await storage.getUser(userId);
      const appUrl = process.env.APP_URL || "https://app.budgetsmart.io";
      const inviteLink = `${appUrl}/?ref=${referralCode.code}`;

      const fromEmail = process.env.ALERT_EMAIL_FROM;
      if (fromEmail && isEmailConfigured()) {
        await sendEmailViaPostmark({
          from: fromEmail,
          to: email,
          subject: `${user?.firstName || user?.username || "A friend"} invited you to Budget Smart AI!`,
          text: `Hi there!

${user?.firstName || user?.username || "Your friend"} thinks you'd love Budget Smart AI - the AI-powered app for managing your finances.

Join today and start tracking your bills, budgets, and savings goals with intelligent insights.

Sign up here: ${inviteLink}

Why Budget Smart AI?
- AI-powered financial insights
- Automatic bank syncing with Plaid
- Smart budget tracking and alerts
- Savings goal progress tracking
- Household collaboration features

Best regards,
The Budget Smart AI Team`,
        });
      }

      res.json({ success: true, referral });
    } catch (error) {
      console.error("Error sending referral:", error);
      res.status(500).json({ error: "Failed to send referral invitation" });
    }
  });

  // Validate a referral code (public endpoint for registration)
  app.get("/api/referrals/validate/:code", async (req, res) => {
    try {
      const code = req.params.code as string;

      const referralCode = await storage.getReferralCodeByCode(code);

      if (!referralCode) {
        return res.json({ valid: false });
      }

      const user = await storage.getUser(referralCode.userId);

      res.json({
        valid: true,
        referrerName: user?.firstName || user?.username || "A friend",
      });
    } catch (error) {
      console.error("Error validating referral code:", error);
      res.status(500).json({ error: "Failed to validate referral code" });
    }
  });

  // Track successful registration via referral (called during registration)
  app.post("/api/referrals/track-registration", async (req, res) => {
    try {
      const { email, referralCode } = req.body;

      if (!email || !referralCode) {
        return res.status(400).json({ error: "Email and referral code required" });
      }

      // Find the referral code
      const codeRecord = await storage.getReferralCodeByCode(referralCode);
      if (!codeRecord) {
        return res.json({ tracked: false, reason: "Invalid referral code" });
      }

      // Find or create the referral record
      let referral = await storage.getReferralByEmail(email);

      if (!referral) {
        // Create a new referral record
        referral = await storage.createReferral({
          referrerId: codeRecord.userId,
          referredEmail: email,
          referralCode: referralCode,
        });
      }

      // Update referral status to registered
      if (referral.status === "pending") {
        await storage.updateReferralStatus(referral.id, "registered");
        await storage.incrementReferralCount(codeRecord.userId, true);
      }

      res.json({ tracked: true });
    } catch (error) {
      console.error("Error tracking referral registration:", error);
      res.status(500).json({ error: "Failed to track referral" });
    }
  });

  // ============ MANUAL ACCOUNTS (Transaction-Centric Architecture) ============

  // FEATURE: MANUAL_ACCOUNTS | tier: free | limit: 3 accounts
  // Get all manual accounts for user
  app.get("/api/accounts/manual", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const accounts = await storage.getManualAccounts(userId);
      res.json(accounts);
    } catch (error) {
      console.error("Error fetching manual accounts:", error);
      res.status(500).json({ error: "Failed to fetch manual accounts" });
    }
  });

  // Create manual account
  app.post("/api/accounts/manual", requireAuth, requireWriteAccess, apiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);

      // Cumulative count check for manual_accounts
      const limit = await getFeatureLimit(plan, "manual_accounts");
      if (limit !== null) {
        const { rows } = await pool.query(
          "SELECT COUNT(*) as count FROM manual_accounts WHERE user_id = $1",
          [userId]
        );
        const currentCount = parseInt(rows[0]?.count || "0", 10);
        if (currentCount >= limit) {
          return res.status(402).json({
            feature: "manual_accounts",
            remaining: 0,
            resetDate: null,
            upgradeRequired: true,
          });
        }
      }

      const parsed = insertManualAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid account data", details: parsed.error });
      }

      const account = await storage.createManualAccount({
        ...parsed.data,
        userId,
      });
      res.status(201).json(account);
    } catch (error) {
      console.error("Error creating manual account:", error);
      res.status(500).json({ error: "Failed to create manual account" });
    }
  });

  // Update manual account
  app.patch("/api/accounts/manual/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const accountId = req.params.id as string;
      const userId = req.session.userId!;

      // Verify ownership
      const existing = await storage.getManualAccount(accountId);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "Account not found" });
      }

      const parsed = updateManualAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid account data", details: parsed.error });
      }

      const updated = await storage.updateManualAccount(accountId, parsed.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating manual account:", error);
      res.status(500).json({ error: "Failed to update manual account" });
    }
  });

  // Delete manual account
  app.delete("/api/accounts/manual/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const accountId = req.params.id as string;
      const userId = req.session.userId!;

      // Verify ownership
      const existing = await storage.getManualAccount(accountId);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "Account not found" });
      }

      await storage.deleteManualAccount(accountId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting manual account:", error);
      res.status(500).json({ error: "Failed to delete manual account" });
    }
  });

  // ============ MANUAL TRANSACTIONS ============

  // Get transactions for a specific manual account
  app.get("/api/transactions/manual/account/:accountId", requireAuth, async (req, res) => {
    try {
      const accountId = req.params.accountId as string;
      const userId = req.session.userId!;
      const { startDate, endDate } = req.query;

      // Verify account ownership
      const account = await storage.getManualAccount(accountId);
      if (!account || account.userId !== userId) {
        return res.status(404).json({ error: "Account not found" });
      }

      const transactions = await storage.getManualTransactions(accountId, {
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
      });
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching manual transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // Get all manual transactions for user (across all accounts)
  // FEATURE: MANUAL_TRANSACTIONS | tier: free | limit: 50 transactions/month
  app.get("/api/transactions/manual", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { startDate, endDate } = req.query;

      const transactions = await storage.getManualTransactionsByUser(userId, {
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
      });
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching manual transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // Create manual transaction
  app.post("/api/transactions/manual", requireAuth, requireWriteAccess, apiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "manual_transactions");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "manual_transactions",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      const parsed = insertManualTransactionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid transaction data", details: parsed.error });
      }

      const { accountId } = req.body;
      if (!accountId) {
        return res.status(400).json({ error: "Account ID is required" });
      }

      // Verify account ownership
      const account = await storage.getManualAccount(accountId);
      if (!account || account.userId !== userId) {
        return res.status(404).json({ error: "Account not found" });
      }

      const transaction = await storage.createManualTransaction({
        ...parsed.data,
        userId,
        accountId,
      });
      res.status(201).json(transaction);
    } catch (error) {
      console.error("Error creating manual transaction:", error);
      res.status(500).json({ error: "Failed to create transaction" });
    }
  });

  // Update manual transaction
  app.patch("/api/transactions/manual/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const transactionId = req.params.id as string;
      const userId = req.session.userId!;

      // Verify ownership
      const existing = await storage.getManualTransaction(transactionId);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      const parsed = updateManualTransactionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid transaction data", details: parsed.error });
      }

      const updated = await storage.updateManualTransaction(transactionId, parsed.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating manual transaction:", error);
      res.status(500).json({ error: "Failed to update transaction" });
    }
  });

  // Delete manual transaction
  app.delete("/api/transactions/manual/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const transactionId = req.params.id as string;
      const userId = req.session.userId!;

      // Verify ownership
      const existing = await storage.getManualTransaction(transactionId);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      await storage.deleteManualTransaction(transactionId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting manual transaction:", error);
      res.status(500).json({ error: "Failed to delete transaction" });
    }
  });

  // CSV template for manual transactions
  app.get("/api/transactions/manual/template", (_req, res) => {
    const headers = ["date", "amount", "merchant", "category", "notes"];
    const exampleRows = [
      ["2025-01-15", "25.50", "Coffee Shop", "Coffee Shops", "Morning coffee"],
      ["2025-01-16", "150.00", "Grocery Store", "Groceries", "Weekly groceries"],
      ["2025-01-17", "-100.00", "ATM Deposit", "Cash & ATM", "Deposited cash (negative = deposit)"],
    ];

    const csvContent = [
      headers.join(","),
      ...exampleRows.map(row => row.map(v => `"${v}"`).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=manual_transactions_template.csv");
    res.send(csvContent);
  });

  // Bulk CSV import for manual transactions
  app.post("/api/transactions/manual/import/:accountId", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const accountId = req.params.accountId as string;
      const { csvData } = req.body;

      // Verify account ownership
      const account = await storage.getManualAccount(accountId);
      if (!account || account.userId !== userId) {
        return res.status(404).json({ error: "Account not found" });
      }

      const rows = parseCSV(csvData);
      const results = { imported: 0, errors: [] as string[] };

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const amount = parseFloat(row.amount);
          if (isNaN(amount)) {
            results.errors.push(`Row ${i + 2}: Invalid amount "${row.amount}"`);
            continue;
          }

          await storage.createManualTransaction({
            userId,
            accountId,
            date: row.date,
            amount: String(amount),
            merchant: row.merchant || "Unknown",
            category: (row.category || null) as any,
            notes: row.notes || null,
          });
          results.imported++;
        } catch (err) {
          results.errors.push(`Row ${i + 2}: ${(err as Error).message}`);
        }
      }

      res.json(results);
    } catch (error) {
      console.error("Error importing transactions:", error);
      res.status(500).json({ error: "Failed to import transactions" });
    }
  });

  // ============ UNIFIED ACCOUNTS & TRANSACTIONS ============

  // Get ALL accounts (Plaid + Manual combined)
  app.get("/api/accounts", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;

      // Get Plaid accounts
      const plaidAccounts = await storage.getAllPlaidAccounts(userId);

      // Get manual accounts
      const manualAccounts = await storage.getManualAccounts(userId);

      // Normalize to unified format
      const unifiedAccounts = [
        ...plaidAccounts.map(acc => ({
          id: acc.id,
          name: acc.name,
          type: acc.type,
          subtype: acc.subtype,
          balance: acc.balanceCurrent,
          currency: acc.isoCurrencyCode,
          source: "plaid" as const,
          plaidAccountId: acc.accountId,
          isActive: acc.isActive === "true",
          lastSynced: acc.lastSynced,
        })),
        ...manualAccounts.map(acc => ({
          id: acc.id,
          name: acc.name,
          type: acc.type,
          subtype: null,
          balance: acc.balance,
          currency: acc.currency,
          source: "manual" as const,
          plaidAccountId: null,
          isActive: acc.isActive === "true",
          lastSynced: null,
        })),
      ];

      res.json(unifiedAccounts);
    } catch (error) {
      console.error("Error fetching unified accounts:", error);
      res.status(500).json({ error: "Failed to fetch accounts" });
    }
  });

  // Get ALL transactions (Plaid + Manual combined) for date range
  app.get("/api/transactions/all", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { startDate, endDate } = req.query;

      // Get Plaid accounts first - only include explicitly ACTIVE accounts (isActive === "true")
      const plaidAccounts = await storage.getAllPlaidAccounts(userId);
      const activePlaidAccounts = plaidAccounts.filter(a => a.isActive === "true");
      const plaidAccountIds = activePlaidAccounts.map(a => a.id);

      // Get Plaid transactions
      const plaidTransactions = plaidAccountIds.length > 0
        ? await storage.getPlaidTransactions(plaidAccountIds, {
            startDate: startDate as string | undefined,
            endDate: endDate as string | undefined,
          })
        : [];

      // Get manual transactions
      const manualTransactions = await storage.getManualTransactionsByUser(userId, {
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
      });

      // Normalize to unified format
      const unifiedTransactions = [
        ...plaidTransactions.map(tx => ({
          id: tx.id,
          date: tx.date,
          amount: tx.amount,
          merchant: tx.merchantName || tx.name,
          category: tx.personalCategory || tx.category,
          notes: null,
          source: "plaid" as const,
          accountId: tx.plaidAccountId,
          isTransfer: false,
          pending: tx.pending === "true",
        })),
        ...manualTransactions.map(tx => ({
          id: tx.id,
          date: tx.date,
          amount: tx.amount,
          merchant: tx.merchant,
          category: tx.category,
          notes: tx.notes,
          source: "manual" as const,
          accountId: tx.accountId,
          isTransfer: tx.isTransfer === "true",
          pending: false,
        })),
      ];

      // Sort by date descending
      unifiedTransactions.sort((a, b) => b.date.localeCompare(a.date));

      res.json(unifiedTransactions);
    } catch (error) {
      console.error("Error fetching unified transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // Add deprecation headers to old expense endpoints
  app.get("/api/expenses", requireAuth, async (req, res) => {
    res.setHeader("Deprecation", "true");
    res.setHeader("Link", '</api/transactions/manual>; rel="successor-version"');

    try {
      const userId = req.session.userId!;
      const householdId = req.session.householdId;

      let expenses;
      if (householdId) {
        const memberIds = await storage.getHouseholdMemberUserIds(householdId);
        expenses = await storage.getExpensesByUserIds(memberIds);
      } else {
        expenses = await storage.getExpenses(userId);
      }

      res.json(expenses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch expenses" });
    }
  });

  // FEATURE: INVESTMENT_TRACKING | tier: free | limit: unlimited
  // ============ INVESTMENT ACCOUNTS API ============

  app.get("/api/investment-accounts", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const manualAccounts = await storage.getInvestmentAccounts(userId);
      const manualWithSource = manualAccounts.map((a: any) => ({ ...a, source: "manual" }));

      let plaidWithSource: any[] = [];
      try {
        const { rows: plaidAccounts } = await pool.query(
          `SELECT
             pa.id,
             pa.name,
             pa.type AS account_type,
             pa.subtype,
             pa.balance_current AS balance,
             pi.institution_name AS institution,
             pa.mask AS account_number
           FROM plaid_accounts pa
           INNER JOIN plaid_items pi ON pa.plaid_item_id = pi.id
           WHERE pi.user_id = $1
             AND pi.status = 'active'
             AND pa.is_active = 'true'
             AND pa.type = 'investment'
           ORDER BY pa.name`,
          [userId]
        );
        plaidWithSource = plaidAccounts.map((a: any) => ({
          id: a.id,
          name: a.name,
          accountType: a.subtype || "brokerage",
          institution: a.institution,
          accountNumber: a.account_number,
          balance: a.balance,
          source: "plaid",
          notes: "Linked from Plaid",
        }));
      } catch (plaidErr) {
        console.warn("Could not fetch Plaid investment accounts:", plaidErr);
      }

      res.json([...manualWithSource, ...plaidWithSource]);
    } catch (error) {
      console.error("Error fetching investment accounts:", error);
      res.status(500).json({ error: "Failed to fetch investment accounts" });
    }
  });

  // IMPORTANT: This route MUST be before /:id to avoid "linkable-plaid-accounts" being treated as :id
  app.get("/api/investment-accounts/linkable-plaid-accounts", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const plaidAccounts = await storage.getAllPlaidAccounts(userId);

      // Filter for investment-type accounts or any that user might want to track
      const investmentTypes = ["investment", "brokerage", "other"];
      const investmentSubtypes = ["401k", "401a", "403b", "457b", "ira", "roth", "rrsp", "tfsa", "brokerage", "non-taxable brokerage", "pension"];

      const linkableAccounts = plaidAccounts.filter((acc: any) => {
        const type = (acc.type || "").toLowerCase();
        const subtype = (acc.subtype || "").toLowerCase();
        return investmentTypes.includes(type) ||
          investmentSubtypes.some(st => subtype.includes(st)) ||
          subtype.includes("investment");
      });

      // Get already linked account IDs
      const existingAccounts = await storage.getInvestmentAccounts(userId);
      const linkedPlaidIds = existingAccounts
        .filter((a: any) => a.notes?.includes("Linked from Plaid"))
        .map((a: any) => a.notes?.match(/Linked from Plaid account: ([^\s]+)/)?.[1])
        .filter(Boolean);

      const availableAccounts = linkableAccounts.map((acc: any) => ({
        ...acc,
        isLinked: linkedPlaidIds.includes(acc.accountId),
      }));

      res.json(availableAccounts);
    } catch (error) {
      console.error("Error fetching linkable accounts:", error);
      res.status(500).json({ error: "Failed to fetch accounts" });
    }
  });

  app.get("/api/investment-accounts/:id", requireAuth, async (req, res) => {
    try {
      const account = await storage.getInvestmentAccount((req.params.id as string));
      if (!account || account.userId !== req.session.userId) {
        return res.status(404).json({ error: "Investment account not found" });
      }
      res.json(account);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch investment account" });
    }
  });

  app.post("/api/investment-accounts", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const data = insertInvestmentAccountSchema.parse(req.body);
      const account = await storage.createInvestmentAccount({ ...data, userId });
      res.status(201).json(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating investment account:", error);
      res.status(500).json({ error: "Failed to create investment account" });
    }
  });

  app.patch("/api/investment-accounts/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getInvestmentAccount((req.params.id as string));
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ error: "Investment account not found" });
      }
      const data = updateInvestmentAccountSchema.parse(req.body);
      const account = await storage.updateInvestmentAccount((req.params.id as string), data);
      res.json(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update investment account" });
    }
  });

  app.delete("/api/investment-accounts/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getInvestmentAccount((req.params.id as string));
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ error: "Investment account not found" });
      }

      // Also delete any holdings associated with this account
      const accountHoldings = await storage.getHoldings((req.params.id as string));
      for (const holding of accountHoldings) {
        await storage.deleteHolding(holding.id);
      }

      await storage.deleteInvestmentAccount((req.params.id as string));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting investment account:", error);
      res.status(500).json({ error: "Failed to delete investment account" });
    }
  });

  // ============ HOLDINGS API ============

  app.get("/api/holdings", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const holdings = await storage.getHoldingsByUser(userId);
      res.json(holdings);
    } catch (error) {
      console.error("Error fetching holdings:", error);
      res.status(500).json({ error: "Failed to fetch holdings" });
    }
  });

  app.get("/api/investment-accounts/:accountId/holdings", requireAuth, async (req, res) => {
    try {
      const account = await storage.getInvestmentAccount((req.params.accountId as string));
      if (!account || account.userId !== req.session.userId) {
        return res.status(404).json({ error: "Investment account not found" });
      }
      const holdings = await storage.getHoldings((req.params.accountId as string));
      res.json(holdings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch holdings" });
    }
  });

  app.post("/api/holdings", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const data = insertHoldingSchema.parse(req.body);

      // Verify user owns the investment account
      const account = await storage.getInvestmentAccount(data.investmentAccountId);
      if (!account || account.userId !== userId) {
        return res.status(403).json({ error: "Access denied to investment account" });
      }

      const holding = await storage.createHolding({ ...data, userId });
      res.status(201).json(holding);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating holding:", error);
      res.status(500).json({ error: "Failed to create holding" });
    }
  });

  app.patch("/api/holdings/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getHolding((req.params.id as string));
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ error: "Holding not found" });
      }
      const data = updateHoldingSchema.parse(req.body);
      const holding = await storage.updateHolding((req.params.id as string), data);
      res.json(holding);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update holding" });
    }
  });

  app.delete("/api/holdings/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getHolding((req.params.id as string));
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ error: "Holding not found" });
      }
      await storage.deleteHolding((req.params.id as string));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete holding" });
    }
  });

  // ============ STOCK DATA & AI ADVISOR API ============

  // Get real-time stock quote
  app.get("/api/stocks/:symbol/quote", requireAuth, async (req, res) => {
    try {
      const quote = await getStockQuote((req.params.symbol as string).toUpperCase());
      if (!quote) {
        return res.status(404).json({ error: "Quote not found or API unavailable" });
      }
      res.json(quote);
    } catch (error) {
      console.error("Error fetching stock quote:", error);
      res.status(500).json({ error: "Failed to fetch stock quote" });
    }
  });

  // Get comprehensive stock analysis (quote + technicals + fundamentals)
  app.get("/api/stocks/:symbol/analysis", requireAuth, async (req, res) => {
    try {
      const analysis = await getStockAnalysis((req.params.symbol as string).toUpperCase());
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not available" });
      }
      const summary = generateAnalysisSummary(analysis);
      res.json({ ...analysis, summary });
    } catch (error) {
      console.error("Error fetching stock analysis:", error);
      res.status(500).json({ error: "Failed to fetch stock analysis" });
    }
  });

  // Refresh prices for all holdings
  app.post("/api/holdings/refresh-prices", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const holdings = await storage.getHoldingsByUser(userId);

      if (holdings.length === 0) {
        return res.json({ updated: 0, message: "No holdings to update" });
      }

      // Get unique symbols (excluding crypto for now - Alpha Vantage has limited crypto support)
      const stockSymbols = Array.from(new Set(
        holdings
          .filter(h => h.holdingType !== "crypto")
          .map(h => h.symbol)
      ));

      const quotes = await batchUpdatePrices(stockSymbols);
      let updatedCount = 0;

      for (const holding of holdings) {
        const quote = quotes.get(holding.symbol);
        if (quote) {
          const currentValue = String(quote.price * parseFloat(holding.quantity));
          await storage.updateHolding(holding.id, {
            currentPrice: String(quote.price),
            currentValue,
            lastPriceUpdate: new Date().toISOString(),
          });
          updatedCount++;
        }
      }

      res.json({
        updated: updatedCount,
        total: holdings.length,
        message: `Updated prices for ${updatedCount} holdings`,
      });
    } catch (error) {
      console.error("Error refreshing prices:", error);
      res.status(500).json({ error: "Failed to refresh prices" });
    }
  });

  // ── New AI Advisor endpoints ────────────────────────────────────────────────

  // Get comprehensive advisor data (portfolio + history + news + AI analysis)
  app.get("/api/investments/advisor-data", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const forceRefresh = req.query.refresh === "true";
      const data = await getAdvisorData(userId, forceRefresh);

      if (!data) {
        return res.json({ message: "No holdings to analyze" });
      }

      res.json(data);
    } catch (error) {
      console.error("Error fetching advisor data:", error);
      res.status(500).json({ error: "Failed to fetch advisor data" });
    }
  });

  // FEATURE: PORTFOLIO_ADVISOR | tier: free | limit: 1 insight/month (free), unlimited (pro/family)
  // Persistent chat with portfolio context
  app.post("/api/investments/advisor-chat", requireAuth, sensitiveApiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "portfolio_advisor");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "portfolio_advisor",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      const { question, chatHistory = [] } = req.body;

      if (!question || typeof question !== "string") {
        return res.status(400).json({ error: "Question is required" });
      }

      // Get cached advisor data for portfolio context (don't re-run full analysis)
      const advisorData = await getAdvisorData(userId, false);

      let portfolioContextSummary = "The user has no holdings data available.";
      let systemPrompt = "You are a personalized investment advisor for BudgetSmart. Be honest, empathetic, and specific. Always reference actual portfolio numbers when available.";

      if (advisorData) {
        const { portfolio } = advisorData;
        const holdingsSummary = portfolio.holdings
          .map(
            (h) =>
              `${h.symbol}: ${h.shares} shares @ avg $${h.avgCost.toFixed(2)}, current $${h.currentPrice.toFixed(2)}, ${h.gainLossPct >= 0 ? "+" : ""}${h.gainLossPct.toFixed(1)}% (${h.gainLossDollars >= 0 ? "+" : ""}$${h.gainLossDollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`,
          )
          .join("\n");

        portfolioContextSummary = `My portfolio summary:
Total Value: $${portfolio.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Total Invested: $${portfolio.totalCostBasis.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Total Gain/Loss: ${portfolio.totalGainLoss >= 0 ? "+" : ""}$${portfolio.totalGainLoss.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${portfolio.totalGainLossPct >= 0 ? "+" : ""}${portfolio.totalGainLossPct.toFixed(1)}%)

Holdings:
${holdingsSummary}

Previous AI analysis summary:
${advisorData.analysis.content.slice(0, 1000)}`;

        const lossPositions = portfolio.holdings.filter((h) => h.gainLossPct < -25);
        const lossRules = lossPositions
          .map((h) =>
            h.gainLossPct < -50
              ? `IMPORTANT: User is down ${h.gainLossPct.toFixed(1)}% on ${h.symbol}. Address tax-loss harvesting and averaging down context.`
              : `NOTE: User is down ${h.gainLossPct.toFixed(1)}% on ${h.symbol}. Give loss-aware advice.`,
          )
          .join("\n");

        systemPrompt = `You are a personalized investment advisor for BudgetSmart. You have access to the user's actual portfolio data including their real cost basis and gains/losses. Be honest, empathetic, and specific. Always cite actual numbers from their portfolio. Format responses with markdown where helpful.${lossRules ? `\n\nLoss context:\n${lossRules}` : ""}`;
      }

      const answer = await advisorChat(
        userId,
        question,
        (chatHistory as ChatMessage[]),
        portfolioContextSummary,
        systemPrompt,
      );

      res.json({ answer, timestamp: new Date().toISOString() });
    } catch (error) {
      console.error("Error in advisor chat:", error);
      res.status(500).json({ error: "Failed to get advice" });
    }
  });

  // Save portfolio snapshot
  app.post("/api/investments/save-snapshot", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { totalValue, totalCostBasis } = req.body;

      if (typeof totalValue !== "number" || typeof totalCostBasis !== "number") {
        return res.status(400).json({ error: "totalValue and totalCostBasis are required numbers" });
      }

      await savePortfolioSnapshot(userId, totalValue, totalCostBasis);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving snapshot:", error);
      res.status(500).json({ error: "Failed to save snapshot" });
    }
  });

  // Legacy: Get AI portfolio analysis (kept for backward compatibility)
  app.get("/api/investments/analysis", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const data = await getAdvisorData(userId, false);

      if (!data) {
        return res.json({ message: "No holdings to analyze" });
      }

      // Return in legacy format for backward compatibility
      res.json({
        totalValue: data.portfolio.totalValue,
        totalCostBasis: data.portfolio.totalCostBasis,
        totalGainLoss: data.portfolio.totalGainLoss,
        totalGainLossPercent: data.portfolio.totalGainLossPct,
        holdings: data.portfolio.holdings.map((h) => ({
          holdingId: h.symbol,
          symbol: h.symbol,
          name: h.name,
          currentPrice: h.currentPrice,
          yourCostBasis: h.avgCost * h.shares,
          quantity: h.shares,
          currentValue: h.marketValue,
          gainLoss: h.gainLossDollars,
          gainLossPercent: h.gainLossPct,
          technicalAnalysis: "",
          recommendation: "hold",
          reasoning: data.analysis.content.slice(0, 200),
          riskLevel: "medium",
          confidence: 0,
        })),
        overallRecommendation: data.analysis.content.slice(0, 300),
        diversificationScore: 0,
        riskAssessment: "See AI analysis",
        actionItems: data.actions.map((a) => `${a.symbol}: ${a.action} — ${a.reasoning}`),
        marketOutlook: "",
        generatedAt: data.analysis.generatedAt,
      });
    } catch (error) {
      console.error("Error analyzing portfolio:", error);
      res.status(500).json({ error: "Failed to analyze portfolio" });
    }
  });

  // Get detailed AI analysis for a specific holding
  app.get("/api/holdings/:id/ai-analysis", requireAuth, async (req, res) => {
    try {
      const holding = await storage.getHolding((req.params.id as string));
      if (!holding || holding.userId !== req.session.userId) {
        return res.status(404).json({ error: "Holding not found" });
      }

      const analysis = await getStockAnalysis(holding.symbol);
      const summary = analysis ? generateAnalysisSummary(analysis) : "Technical data unavailable";
      const currentPrice = analysis?.quote?.price || parseFloat(holding.currentPrice || "0");
      const costBasis = parseFloat(holding.costBasis || "0");
      const quantity = parseFloat(holding.quantity);
      const currentValue = currentPrice * quantity;

      res.json({
        holding: {
          holdingId: holding.id,
          symbol: holding.symbol,
          name: holding.name,
          currentPrice,
          yourCostBasis: costBasis,
          quantity,
          currentValue,
          gainLoss: currentValue - costBasis,
          gainLossPercent: costBasis > 0 ? ((currentValue - costBasis) / costBasis) * 100 : 0,
          technicalAnalysis: summary,
          recommendation: "hold",
          reasoning: "",
          riskLevel: "medium",
          confidence: 0,
        },
        technicalData: analysis,
        aiAnalysis: summary,
      });
    } catch (error) {
      console.error("Error getting holding analysis:", error);
      res.status(500).json({ error: "Failed to analyze holding" });
    }
  });

  // Legacy: Ask AI investment advisor a question
  app.post("/api/investments/ask-advisor", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { question } = req.body;

      if (!question || typeof question !== "string") {
        return res.status(400).json({ error: "Question is required" });
      }

      const answer = await advisorChat(
        userId,
        question,
        [],
        "User is asking an investment question.",
        "You are a personalized investment advisor for BudgetSmart. Be helpful, honest, and specific.",
      );

      res.json({ advice: answer, portfolioContext: false });
    } catch (error) {
      console.error("Error getting investment advice:", error);
      res.status(500).json({ error: "Failed to get advice" });
    }
  });

  // Import investment account from Plaid
  app.post("/api/investment-accounts/import-from-plaid", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { plaidAccountId } = req.body;

      if (!plaidAccountId) {
        return res.status(400).json({ error: "Plaid account ID is required" });
      }

      // Get the Plaid account
      const plaidAccount = await storage.getPlaidAccountByAccountId(plaidAccountId);
      if (!plaidAccount) {
        return res.status(404).json({ error: "Plaid account not found" });
      }

      // Check if it's an investment-type account
      const investmentTypes = ["investment", "brokerage"];
      if (!investmentTypes.includes(plaidAccount.type || "")) {
        // Allow linking any account but mark the type appropriately
      }

      // Check if already linked
      const existingAccounts = await storage.getInvestmentAccounts(userId);
      const alreadyLinked = existingAccounts.find(a => a.accountNumber === plaidAccount.accountId);
      if (alreadyLinked) {
        return res.status(400).json({ error: "This account is already linked" });
      }

      // Determine account type based on Plaid subtype
      let accountType: string = "brokerage";
      const subtype = (plaidAccount.subtype || "").toLowerCase();
      if (subtype.includes("401") || subtype.includes("pension")) accountType = "retirement_401k";
      else if (subtype.includes("ira") && !subtype.includes("roth")) accountType = "retirement_ira";
      else if (subtype.includes("roth")) accountType = "retirement_roth";
      else if (subtype.includes("rrsp") || subtype.includes("tfsa")) accountType = "retirement_ira"; // Canadian registered accounts

      // Create the investment account
      const investmentAccount = await storage.createInvestmentAccount({
        userId,
        name: plaidAccount.name || "Linked Investment Account",
        accountType: accountType as any,
        institution: plaidAccount.officialName || plaidAccount.name || undefined,
        accountNumber: plaidAccount.mask || plaidAccount.accountId.slice(-4),
        balance: plaidAccount.balanceCurrent || "0",
        notes: `Linked from Plaid account: ${plaidAccount.accountId}`,
      });

      res.status(201).json(investmentAccount);
    } catch (error) {
      console.error("Error importing from Plaid:", error);
      res.status(500).json({ error: "Failed to import account" });
    }
  });

  // FEATURE: ASSET_TRACKING | tier: free | limit: 10 assets
  // ============ ASSETS API ============

  app.get("/api/assets", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const assets = await storage.getAssets(userId);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching assets:", error);
      res.status(500).json({ error: "Failed to fetch assets" });
    }
  });

  app.get("/api/assets/:id", requireAuth, async (req, res) => {
    try {
      const asset = await storage.getAsset((req.params.id as string));
      if (!asset || asset.userId !== req.session.userId) {
        return res.status(404).json({ error: "Asset not found" });
      }
      res.json(asset);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch asset" });
    }
  });

  app.post("/api/assets", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const assetLimit = await getFeatureLimit(plan, "asset_tracking");
      if (assetLimit !== null) {
        if (assetLimit === 0) {
          return res.status(402).json({ feature: "asset_tracking", remaining: 0, resetDate: null, upgradeRequired: true });
        }
        const { rows: assetRows } = await pool.query<{ cnt: number }>(
          "SELECT COUNT(*)::int AS cnt FROM assets WHERE user_id = $1",
          [userId]
        );
        if ((assetRows[0]?.cnt ?? 0) >= assetLimit) {
          return res.status(402).json({ feature: "asset_tracking", remaining: 0, resetDate: null });
        }
      }
      const data = insertAssetSchema.parse(req.body);
      const asset = await storage.createAsset({ ...data, userId });

      // Create initial value history entry
      await storage.createAssetValueHistory({
        assetId: asset.id,
        date: new Date().toISOString().split('T')[0],
        value: asset.currentValue!,
        notes: "Initial value",
      });

      res.status(201).json(asset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating asset:", error);
      res.status(500).json({ error: "Failed to create asset" });
    }
  });

  app.patch("/api/assets/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getAsset((req.params.id as string));
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ error: "Asset not found" });
      }
      const data = updateAssetSchema.parse(req.body);

      // If value changed, record history
      if (data.currentValue && data.currentValue !== existing.currentValue) {
        await storage.createAssetValueHistory({
          assetId: (req.params.id as string),
          date: new Date().toISOString().split('T')[0],
          value: data.currentValue,
          notes: "Value update",
        });
      }

      const asset = await storage.updateAsset((req.params.id as string), data);
      res.json(asset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update asset" });
    }
  });

  app.delete("/api/assets/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getAsset((req.params.id as string));
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ error: "Asset not found" });
      }
      await storage.deleteAsset((req.params.id as string));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete asset" });
    }
  });

  app.get("/api/assets/:id/history", requireAuth, async (req, res) => {
    try {
      const asset = await storage.getAsset((req.params.id as string));
      if (!asset || asset.userId !== req.session.userId) {
        return res.status(404).json({ error: "Asset not found" });
      }
      const history = await storage.getAssetValueHistory((req.params.id as string));
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch asset history" });
    }
  });

  // FEATURE: NET_WORTH_TRACKING | tier: free | limit: unlimited
  // ============ NET WORTH API ============

  app.get("/api/net-worth", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;

      // Get all financial data
      const [
        plaidAccounts,
        manualAccounts,
        investmentAccounts,
        holdings,
        assets,
        debtDetails,
      ] = await Promise.all([
        storage.getAllPlaidAccounts(userId),
        storage.getManualAccounts(userId),
        storage.getInvestmentAccounts(userId),
        storage.getHoldingsByUser(userId),
        storage.getAssets(userId),
        storage.getDebtDetails(userId),
      ]);

      // Calculate totals
      let cashAndBank = 0;
      let investments = 0;
      let realEstate = 0;
      let vehicles = 0;
      let otherAssets = 0;
      let creditCards = 0;
      let loans = 0;
      let mortgages = 0;
      let otherLiabilities = 0;

      // Plaid accounts — classify by type per Plaid conventions
      // ASSETS: depository (checking/savings/cd/money market), investment (brokerage/RRSP/TFSA/401k), other
      // LIABILITIES: credit (credit card/line of credit/home equity), loan (mortgage/auto/student/personal)
      // Plaid balanceCurrent is always POSITIVE for both assets and liabilities
      // Only include explicitly active accounts (isActive === "true")
      for (const acc of plaidAccounts.filter(a => a.isActive === "true")) {
        const balance = parseFloat(acc.balanceCurrent || "0");
        const type = (acc.type || "").toLowerCase();
        const subtype = (acc.subtype || "").toLowerCase();
        if (type === "depository") {
          cashAndBank += balance;
        } else if (type === "investment") {
          investments += balance;
        } else if (type === "other") {
          otherAssets += balance;
        } else if (type === "credit") {
          creditCards += Math.abs(balance);
        } else if (type === "loan") {
          // Split loan subtypes: mortgage vs other loans
          if (subtype.includes("mortgage")) {
            mortgages += Math.abs(balance);
          } else {
            loans += Math.abs(balance);
          }
        }
      }

      // Manual accounts - types are: cash, paypal, venmo, other (all are liquid assets)
      // Only include explicitly active accounts (isActive === "true")
      for (const acc of manualAccounts.filter(a => a.isActive === "true")) {
        const balance = parseFloat(acc.balance || "0");
        // Manual accounts (cash, paypal, venmo, other) are all treated as cash/liquid assets
        cashAndBank += balance;
      }

      // Investment accounts and holdings
      for (const holding of holdings) {
        investments += parseFloat(holding.currentValue || "0");
      }

      // Physical assets
      for (const asset of assets) {
        const value = parseFloat(asset.currentValue || "0");
        if (asset.category === "real_estate") {
          realEstate += value;
        } else if (asset.category === "vehicle") {
          vehicles += value;
        } else {
          otherAssets += value;
        }
      }

      // Debt details (mortgages, etc.)
      // Only include explicitly active debts that are NOT already tracked via a linked Plaid account
      // (prevents double-counting: Plaid loan accounts are already counted above)
      for (const debt of debtDetails.filter(d => d.isActive === "true" && !d.plaidAccountId)) {
        const balance = parseFloat(debt.currentBalance || "0");
        if (debt.debtType === "mortgage") {
          mortgages += balance;
        } else if (debt.debtType === "auto_loan") {
          loans += balance;
        } else if (debt.debtType === "student_loan" || debt.debtType === "personal_loan") {
          loans += balance;
        } else {
          otherLiabilities += balance;
        }
      }

      const totalAssets = cashAndBank + investments + realEstate + vehicles + otherAssets;
      const totalLiabilities = creditCards + loans + mortgages + otherLiabilities;
      const netWorth = totalAssets - totalLiabilities;

      res.json({
        netWorth,
        totalAssets,
        totalLiabilities,
        breakdown: {
          assets: { cashAndBank, investments, realEstate, vehicles, otherAssets },
          liabilities: { creditCards, loans, mortgages, otherLiabilities },
        },
      });
    } catch (error) {
      console.error("Error calculating net worth:", error);
      res.status(500).json({ error: "Failed to calculate net worth" });
    }
  });

  app.get("/api/net-worth/history", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 12;
      const snapshots = await storage.getNetWorthSnapshots(userId, { limit });
      res.json(snapshots);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch net worth history" });
    }
  });

  app.post("/api/net-worth/snapshot", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;

      // Calculate current net worth (same logic as GET /api/net-worth)
      const [
        plaidAccounts,
        manualAccounts,
        holdings,
        assets,
        debtDetails,
      ] = await Promise.all([
        storage.getAllPlaidAccounts(userId),
        storage.getManualAccounts(userId),
        storage.getHoldingsByUser(userId),
        storage.getAssets(userId),
        storage.getDebtDetails(userId),
      ]);

      let cashAndBank = 0, investments = 0, realEstate = 0, vehicles = 0, otherAssets = 0;
      let creditCards = 0, loans = 0, mortgages = 0, otherLiabilities = 0;

      // Only include explicitly active accounts (isActive === "true")
      // Classify by Plaid type: depository/investment/other = assets; credit/loan = liabilities
      for (const acc of plaidAccounts.filter(a => a.isActive === "true")) {
        const balance = parseFloat(acc.balanceCurrent || "0");
        const type = (acc.type || "").toLowerCase();
        const subtype = (acc.subtype || "").toLowerCase();
        if (type === "depository") cashAndBank += balance;
        else if (type === "investment") investments += balance;
        else if (type === "other") otherAssets += balance;
        else if (type === "credit") creditCards += Math.abs(balance);
        else if (type === "loan") {
          if (subtype.includes("mortgage")) mortgages += Math.abs(balance);
          else loans += Math.abs(balance);
        }
      }

      // Manual accounts (cash, paypal, venmo, other) - all treated as cash/liquid assets
      // Only include explicitly active accounts (isActive === "true")
      for (const acc of manualAccounts.filter(a => a.isActive === "true")) {
        const balance = parseFloat(acc.balance || "0");
        cashAndBank += balance;
      }

      for (const holding of holdings) investments += parseFloat(holding.currentValue || "0");

      for (const asset of assets) {
        const value = parseFloat(asset.currentValue || "0");
        if (asset.category === "real_estate") realEstate += value;
        else if (asset.category === "vehicle") vehicles += value;
        else otherAssets += value;
      }

      // Only include explicitly active debts that are NOT already tracked via a linked Plaid account
      // (prevents double-counting: Plaid loan accounts are already counted above)
      for (const debt of debtDetails.filter(d => d.isActive === "true" && !d.plaidAccountId)) {
        const balance = parseFloat(debt.currentBalance || "0");
        if (debt.debtType === "mortgage") mortgages += balance;
        else if (debt.debtType === "auto_loan") loans += balance;
        else if (["student_loan", "personal_loan"].includes(debt.debtType!)) loans += balance;
        else otherLiabilities += balance;
      }

      const totalAssets = cashAndBank + investments + realEstate + vehicles + otherAssets;
      const totalLiabilities = creditCards + loans + mortgages + otherLiabilities;
      const netWorth = totalAssets - totalLiabilities;

      const snapshot = await storage.createNetWorthSnapshot({
        userId,
        date: new Date().toISOString().split('T')[0],
        totalAssets: String(totalAssets),
        totalLiabilities: String(totalLiabilities),
        netWorth: String(netWorth),
        cashAndBank: String(cashAndBank),
        investments: String(investments),
        realEstate: String(realEstate),
        vehicles: String(vehicles),
        otherAssets: String(otherAssets),
        creditCards: String(creditCards),
        loans: String(loans),
        mortgages: String(mortgages),
        otherLiabilities: String(otherLiabilities),
      });

      res.status(201).json(snapshot);
    } catch (error) {
      console.error("Error creating net worth snapshot:", error);
      res.status(500).json({ error: "Failed to create snapshot" });
    }
  });

  // FEATURE: CALENDAR_VIEW | tier: free | limit: unlimited
  // ============ FINANCIAL CALENDAR API ============

  app.get("/api/calendar/events", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { startDate, endDate } = req.query;

      const [bills, incomes, goals] = await Promise.all([
        storage.getBills(userId),
        storage.getIncomes(userId),
        storage.getSavingsGoals(userId),
      ]);

      const events: Array<{
        id: string;
        title: string;
        date: string;
        type: "bill" | "income" | "goal";
        amount: string;
        category?: string;
        recurring?: boolean;
      }> = [];

      // Helper to generate dates for a recurring item within a date range
      const generateRecurringDates = (
        dueDay: number,
        recurrence: string,
        rangeStart: Date,
        rangeEnd: Date
      ): string[] => {
        const dates: string[] = [];
        const current = new Date(rangeStart);

        if (recurrence === "weekly") {
          // dueDay is day of week (0-6, Sunday-Saturday)
          while (current <= rangeEnd) {
            if (current.getDay() === dueDay) {
              dates.push(current.toISOString().split("T")[0]);
            }
            current.setDate(current.getDate() + 1);
          }
        } else if (recurrence === "biweekly") {
          // Find first occurrence of dueDay (day of week) in range, then every 2 weeks
          while (current <= rangeEnd) {
            if (current.getDay() === dueDay) {
              dates.push(current.toISOString().split("T")[0]);
              current.setDate(current.getDate() + 14);
            } else {
              current.setDate(current.getDate() + 1);
            }
          }
        } else if (recurrence === "monthly" || recurrence === "once") {
          // dueDay is day of month (1-31)
          let checkDate = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
          while (checkDate <= rangeEnd) {
            const lastDayOfMonth = new Date(checkDate.getFullYear(), checkDate.getMonth() + 1, 0).getDate();
            const actualDueDay = Math.min(dueDay, lastDayOfMonth);
            const eventDate = new Date(checkDate.getFullYear(), checkDate.getMonth(), actualDueDay);
            if (eventDate >= rangeStart && eventDate <= rangeEnd) {
              dates.push(eventDate.toISOString().split("T")[0]);
            }
            if (recurrence === "once") break;
            checkDate.setMonth(checkDate.getMonth() + 1);
          }
        } else if (recurrence === "yearly") {
          // dueDay represents day of month, need to check each year
          let checkDate = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
          while (checkDate <= rangeEnd) {
            const lastDayOfMonth = new Date(checkDate.getFullYear(), checkDate.getMonth() + 1, 0).getDate();
            const actualDueDay = Math.min(dueDay, lastDayOfMonth);
            const eventDate = new Date(checkDate.getFullYear(), checkDate.getMonth(), actualDueDay);
            if (eventDate >= rangeStart && eventDate <= rangeEnd) {
              dates.push(eventDate.toISOString().split("T")[0]);
            }
            checkDate.setFullYear(checkDate.getFullYear() + 1);
          }
        }

        return dates;
      };

      // Helper to get effective income amount considering scheduled changes
      const getEffectiveIncomeAmount = (inc: typeof incomes[0], date: Date): string => {
        if (inc.futureAmount && inc.amountChangeDate) {
          const changeDate = new Date(inc.amountChangeDate);
          if (date >= changeDate) {
            return inc.futureAmount;
          }
        }
        return inc.amount;
      };

      // Parse date range
      const rangeStart = startDate ? new Date(startDate as string) : new Date();
      const rangeEnd = endDate ? new Date(endDate as string) : new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 0);

      // Add bills as events
      for (const bill of bills.filter(b => b.isPaused !== "true")) {
        // Skip bills that have already ended
        if (bill.endDate) {
          const billEndDate = new Date(bill.endDate);
          if (billEndDate < rangeStart) {
            continue; // Bill has ended before the range starts
          }
        }

        const dueDates = generateRecurringDates(bill.dueDay, bill.recurrence, rangeStart, rangeEnd);

        // Track payments for paymentsRemaining limit
        let paymentsCount = 0;
        const maxPayments = bill.paymentsRemaining;

        for (const date of dueDates) {
          // Check if this date is past the bill's end date
          if (bill.endDate && new Date(date) > new Date(bill.endDate)) {
            break; // Stop adding events after end date
          }

          // Check payments remaining limit
          if (maxPayments !== null && maxPayments !== undefined && paymentsCount >= maxPayments) {
            break; // No more payments remaining
          }

          events.push({
            id: `bill-${bill.id}-${date}`,
            title: bill.name,
            date,
            type: "bill",
            amount: bill.amount,
            category: bill.category,
            recurring: bill.recurrence !== "once",
          });

          paymentsCount++;
        }
      }

      // Add incomes as events
      for (const inc of incomes) {
        if (inc.isRecurring === "true") {
          const recurrence = inc.recurrence || "monthly";

          if (recurrence === "weekly" || recurrence === "biweekly") {
            // For weekly/biweekly, use day of week from the income date
            const incomeStartDate = new Date(inc.date);
            const dayOfWeek = incomeStartDate.getDay();

            if (recurrence === "weekly") {
              // Generate all matching weekdays in range
              const current = new Date(rangeStart);
              while (current <= rangeEnd) {
                if (current.getDay() === dayOfWeek && current >= incomeStartDate) {
                  const dateStr = current.toISOString().split("T")[0];
                  events.push({
                    id: `income-${inc.id}-${dateStr}`,
                    title: inc.source,
                    date: dateStr,
                    type: "income",
                    amount: getEffectiveIncomeAmount(inc, current),
                    recurring: true,
                  });
                }
                current.setDate(current.getDate() + 1);
              }
            } else {
              // Biweekly: start from income date, add 2 weeks at a time
              let payDate = new Date(incomeStartDate);
              // Move forward to range start if needed
              while (payDate < rangeStart) {
                payDate.setDate(payDate.getDate() + 14);
              }
              // Generate dates within range
              while (payDate <= rangeEnd) {
                const dateStr = payDate.toISOString().split("T")[0];
                events.push({
                  id: `income-${inc.id}-${dateStr}`,
                  title: inc.source,
                  date: dateStr,
                  type: "income",
                  amount: getEffectiveIncomeAmount(inc, payDate),
                  recurring: true,
                });
                payDate.setDate(payDate.getDate() + 14);
              }
            }
          } else if (recurrence === "custom" && inc.customDates) {
            // Custom dates: generate for each custom day of month
            try {
              const customDays: number[] = JSON.parse(inc.customDates);
              let checkDate = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
              while (checkDate <= rangeEnd) {
                const lastDayOfMonth = new Date(checkDate.getFullYear(), checkDate.getMonth() + 1, 0).getDate();
                for (const day of customDays) {
                  const actualDay = Math.min(day, lastDayOfMonth);
                  const eventDate = new Date(checkDate.getFullYear(), checkDate.getMonth(), actualDay);
                  if (eventDate >= rangeStart && eventDate <= rangeEnd) {
                    const dateStr = eventDate.toISOString().split("T")[0];
                    events.push({
                      id: `income-${inc.id}-${dateStr}`,
                      title: inc.source,
                      date: dateStr,
                      type: "income",
                      amount: getEffectiveIncomeAmount(inc, eventDate),
                      recurring: true,
                    });
                  }
                }
                checkDate.setMonth(checkDate.getMonth() + 1);
              }
            } catch {
              // Invalid custom dates, skip
            }
          } else {
            // Monthly or yearly: use dueDay if set, otherwise extract from date
            const dueDay = inc.dueDay || new Date(inc.date).getDate();
            const incomeDates = generateRecurringDates(dueDay, recurrence, rangeStart, rangeEnd);
            for (const date of incomeDates) {
              const eventDate = new Date(date);
              events.push({
                id: `income-${inc.id}-${date}`,
                title: inc.source,
                date,
                type: "income",
                amount: getEffectiveIncomeAmount(inc, eventDate),
                recurring: true,
              });
            }
          }
        } else if (inc.date) {
          // One-time income - use the date directly if in range
          const incDate = new Date(inc.date);
          if (incDate >= rangeStart && incDate <= rangeEnd) {
            events.push({
              id: `income-${inc.id}`,
              title: inc.source,
              date: inc.date,
              type: "income",
              amount: getEffectiveIncomeAmount(inc, incDate),
              recurring: false,
            });
          }
        }
      }

      // Add goal target dates
      for (const goal of goals) {
        if (goal.targetDate) {
          const goalDate = new Date(goal.targetDate);
          if (goalDate >= rangeStart && goalDate <= rangeEnd) {
            events.push({
              id: `goal-${goal.id}`,
              title: goal.name,
              date: goal.targetDate,
              type: "goal",
              amount: goal.targetAmount,
            });
          }
        }
      }

      // Sort by date
      events.sort((a, b) => a.date.localeCompare(b.date));

      res.json(events);
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ error: "Failed to fetch calendar events" });
    }
  });

  // FEATURE: SPLIT_EXPENSES | tier: family | limit: unlimited
  // ============ SPLIT EXPENSES API ============

  app.get("/api/split-expenses", requireAuth, async (req, res) => {
    try {
      const householdId = req.session.householdId;
      if (!householdId) {
        return res.status(400).json({ error: "Must be part of a household to use split expenses" });
      }

      const splits = await storage.getSplitExpenses(householdId);

      // Fetch participants for each split
      const splitsWithParticipants = await Promise.all(
        splits.map(async (split) => {
          const participants = await storage.getSplitParticipants(split.id);
          return { ...split, participants };
        })
      );

      res.json(splitsWithParticipants);
    } catch (error) {
      console.error("Error fetching split expenses:", error);
      res.status(500).json({ error: "Failed to fetch split expenses" });
    }
  });

  app.post("/api/split-expenses", requireAuth, apiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "split_expenses");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "split_expenses",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      const householdId = req.session.householdId;
      if (!householdId) {
        return res.status(400).json({ error: "Must be part of a household to create split expenses" });
      }

      const { participants, ...expenseData } = req.body;
      const data = insertSplitExpenseSchema.parse({
        ...expenseData,
        householdId,
        createdBy: userId,
      });

      const split = await storage.createSplitExpense(data);

      // Create participants
      if (participants && Array.isArray(participants)) {
        for (const p of participants) {
          await storage.createSplitParticipant({
            splitExpenseId: split.id,
            userId: p.userId,
            shareAmount: String(p.shareAmount),
            sharePercent: p.sharePercent ? String(p.sharePercent) : null,
          });
        }
      }

      const createdParticipants = await storage.getSplitParticipants(split.id);
      res.status(201).json({ ...split, participants: createdParticipants });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating split expense:", error);
      res.status(500).json({ error: "Failed to create split expense" });
    }
  });

  app.patch("/api/split-expenses/:id", requireAuth, async (req, res) => {
    try {
      const householdId = req.session.householdId;
      const existing = await storage.getSplitExpense((req.params.id as string));
      if (!existing || existing.householdId !== householdId) {
        return res.status(404).json({ error: "Split expense not found" });
      }

      const data = updateSplitExpenseSchema.parse(req.body);
      const split = await storage.updateSplitExpense((req.params.id as string), data);
      res.json(split);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update split expense" });
    }
  });

  app.delete("/api/split-expenses/:id", requireAuth, async (req, res) => {
    try {
      const householdId = req.session.householdId;
      const existing = await storage.getSplitExpense((req.params.id as string));
      if (!existing || existing.householdId !== householdId) {
        return res.status(404).json({ error: "Split expense not found" });
      }

      await storage.deleteSplitExpense((req.params.id as string));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete split expense" });
    }
  });

  // Mark participant as paid
  app.patch("/api/split-participants/:id/pay", requireAuth, async (req, res) => {
    try {
      const participant = await storage.updateSplitParticipant((req.params.id as string), {
        isPaid: "true",
        paidAt: new Date().toISOString(),
      });
      res.json(participant);
    } catch (error) {
      res.status(500).json({ error: "Failed to update participant" });
    }
  });

  // Get household balances
  app.get("/api/split-expenses/balances", requireAuth, async (req, res) => {
    try {
      const householdId = req.session.householdId;
      if (!householdId) {
        return res.status(400).json({ error: "Must be part of a household" });
      }

      const splits = await storage.getSplitExpenses(householdId);
      const settlements = await storage.getSettlementPayments(householdId);
      const members = await storage.getHouseholdMembers(householdId);

      // Calculate balances: who owes whom
      const balances: Record<string, Record<string, number>> = {};

      // Initialize balances for all members
      for (const member of members) {
        balances[member.userId] = {};
        for (const other of members) {
          if (other.userId !== member.userId) {
            balances[member.userId][other.userId] = 0;
          }
        }
      }

      // Process splits
      for (const split of splits) {
        if (split.status === "settled") continue;

        const participants = await storage.getSplitParticipants(split.id);
        const creatorId = split.createdBy;

        for (const p of participants) {
          if (p.userId !== creatorId && p.isPaid !== "true") {
            // This person owes the creator
            const amount = parseFloat(p.shareAmount);
            if (balances[p.userId] && balances[p.userId][creatorId] !== undefined) {
              balances[p.userId][creatorId] += amount;
            }
          }
        }
      }

      // Process settlements
      for (const settlement of settlements) {
        const amount = parseFloat(settlement.amount);
        if (balances[settlement.fromUserId] && balances[settlement.fromUserId][settlement.toUserId] !== undefined) {
          balances[settlement.fromUserId][settlement.toUserId] -= amount;
        }
      }

      // Simplify: net out mutual debts
      const simplifiedBalances: Array<{ from: string; to: string; amount: number }> = [];
      const processed = new Set<string>();

      for (const fromId of Object.keys(balances)) {
        for (const toId of Object.keys(balances[fromId])) {
          const key = [fromId, toId].sort().join('-');
          if (processed.has(key)) continue;
          processed.add(key);

          const aOwesB = balances[fromId][toId] || 0;
          const bOwesA = balances[toId]?.[fromId] || 0;
          const net = aOwesB - bOwesA;

          if (Math.abs(net) > 0.01) {
            if (net > 0) {
              simplifiedBalances.push({ from: fromId, to: toId, amount: net });
            } else {
              simplifiedBalances.push({ from: toId, to: fromId, amount: Math.abs(net) });
            }
          }
        }
      }

      res.json({ balances: simplifiedBalances, members });
    } catch (error) {
      console.error("Error calculating balances:", error);
      res.status(500).json({ error: "Failed to calculate balances" });
    }
  });

  // Record settlement payment
  app.post("/api/settlements", requireAuth, async (req, res) => {
    try {
      const householdId = req.session.householdId;
      if (!householdId) {
        return res.status(400).json({ error: "Must be part of a household" });
      }

      const data = insertSettlementPaymentSchema.parse({
        ...req.body,
        householdId,
      });

      const settlement = await storage.createSettlementPayment(data);
      res.status(201).json(settlement);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      console.error("Error creating settlement:", error);
      res.status(500).json({ error: "Failed to create settlement" });
    }
  });

  // ============ TAX DEDUCTIBLE REPORT ============

  app.get("/api/reports/tax-deductible", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
      const format = (req.query.format as string) || "json";
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const expenses = await storage.getExpenses(userId);

      // Filter to tax-deductible or business expenses within the requested year
      const deductible = expenses.filter((e: any) => {
        const isDeductible = e.taxDeductible === "true" || e.isBusinessExpense === "true";
        if (!isDeductible) return false;
        return e.date >= startDate && e.date <= endDate;
      });

      const totalDeductible = deductible.reduce((sum: number, e: any) => sum + Math.abs(parseFloat(e.amount || "0")), 0);

      // Group by tax category
      const categoryMap: Record<string, { total: number; count: number }> = {};
      for (const e of deductible) {
        const cat = e.taxCategory || "other_business";
        if (!categoryMap[cat]) categoryMap[cat] = { total: 0, count: 0 };
        categoryMap[cat].total += Math.abs(parseFloat(e.amount || "0"));
        categoryMap[cat].count++;
      }
      const byCategory = Object.entries(categoryMap)
        .map(([category, val]) => ({ category, ...val }))
        .sort((a, b) => b.total - a.total);

      if (format === "csv") {
        const headers = ["Date", "Merchant", "Amount (CAD)", "Category", "Tax Category", "Notes"];
        const rows = deductible.map((e: any) => [
          e.date,
          `"${(e.merchant || "").replace(/"/g, '""')}"`,
          parseFloat(e.amount || "0").toFixed(2),
          `"${e.category || ""}"`,
          `"${e.taxCategory || ""}"`,
          `"${(e.notes || "").replace(/"/g, '""')}"`,
        ]);
        const csvContent = [headers.join(","), ...rows.map((r: string[]) => r.join(","))].join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=tax-deductible-${year}.csv`);
        return res.send(csvContent);
      }

      res.json({
        taxYear: year,
        totalDeductible,
        byCategory,
        expenses: deductible.map((e: any) => ({
          date: e.date,
          merchant: e.merchant,
          amount: parseFloat(e.amount || "0"),
          category: e.category,
          taxCategory: e.taxCategory || null,
          notes: e.notes || null,
          taxDeductible: e.taxDeductible === "true",
          isBusinessExpense: e.isBusinessExpense === "true",
        })),
        canadianTaxNotes: {
          t2125: "These expenses may qualify for T2125 Business Income reporting",
          hst: "Keep receipts for HST input tax credits",
          homeOffice: "If applicable, claim home office expenses on T777",
          vehicle: "Keep a mileage log for vehicle expense deductions",
          meals: "Only 50% of business meal expenses are deductible under CRA rules",
        },
      });
    } catch (error) {
      console.error("Error generating tax deductible report:", error);
      res.status(500).json({ error: "Failed to generate tax report" });
    }
  });

  // FEATURE: TAX_REPORTING | tier: pro | limit: 1 summary/month
  // ============ TAX TAGGING API ============

  app.get("/api/tax/categories", requireAuth, (req, res) => {
    res.json(TAX_CATEGORIES);
  });

  app.get("/api/tax/summary", requireAuth, apiRateLimiter, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "tax_reporting");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "tax_reporting",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      // Get all transactions for the year
      const plaidAccounts = await storage.getAllPlaidAccounts(userId);
      const accountIds = plaidAccounts.map(a => a.id);

      const [plaidTransactions, manualTransactions] = await Promise.all([
        accountIds.length > 0
          ? storage.getPlaidTransactions(accountIds, { startDate, endDate })
          : [],
        storage.getManualTransactionsByUser(userId, { startDate, endDate }),
      ]);

      // Filter tax-deductible transactions
      const deductiblePlaid = plaidTransactions.filter(t => t.taxDeductible === "true");
      const deductibleManual = manualTransactions.filter(t => t.taxDeductible === "true");

      // Group by category
      const byCategory: Record<string, { count: number; total: number; transactions: any[] }> = {};

      for (const tx of deductiblePlaid) {
        const cat = tx.taxCategory || "other_deductible";
        if (!byCategory[cat]) byCategory[cat] = { count: 0, total: 0, transactions: [] };
        byCategory[cat].count++;
        byCategory[cat].total += Math.abs(parseFloat(tx.amount));
        byCategory[cat].transactions.push({
          id: tx.id,
          date: tx.date,
          amount: tx.amount,
          merchant: tx.merchantName || tx.name,
          source: "plaid",
        });
      }

      for (const tx of deductibleManual) {
        const cat = tx.taxCategory || "other_deductible";
        if (!byCategory[cat]) byCategory[cat] = { count: 0, total: 0, transactions: [] };
        byCategory[cat].count++;
        byCategory[cat].total += Math.abs(parseFloat(tx.amount));
        byCategory[cat].transactions.push({
          id: tx.id,
          date: tx.date,
          amount: tx.amount,
          merchant: tx.merchant,
          source: "manual",
        });
      }

      const totalDeductible = Object.values(byCategory).reduce((sum, cat) => sum + cat.total, 0);

      res.json({
        year,
        totalDeductible,
        byCategory,
        transactionCount: deductiblePlaid.length + deductibleManual.length,
      });
    } catch (error) {
      console.error("Error generating tax summary:", error);
      res.status(500).json({ error: "Failed to generate tax summary" });
    }
  });

  // Constants endpoints
  app.get("/api/constants/investment-account-types", requireAuth, (req, res) => {
    res.json(INVESTMENT_ACCOUNT_TYPES);
  });

  app.get("/api/constants/holding-types", requireAuth, (req, res) => {
    res.json(HOLDING_TYPES);
  });

  app.get("/api/constants/asset-categories", requireAuth, (req, res) => {
    res.json(ASSET_CATEGORIES);
  });

  // ============ LANDING PAGE PUBLIC ROUTES ============

  // Get all landing page data for the public website
  app.get("/api/landing", async (req, res) => {
    try {
      const [settings, features, testimonials, pricing, comparison, faqs] = await Promise.all([
        storage.getLandingSettings(),
        storage.getLandingFeatures(true),
        storage.getLandingTestimonials(true),
        storage.getLandingPricing(true),
        storage.getLandingComparison(true),
        storage.getLandingFaqs(true),
      ]);

      // Convert settings array to object for easier access
      const settingsObj: Record<string, any> = {};
      settings.forEach(s => {
        if (s.type === "json") {
          try {
            settingsObj[s.key] = JSON.parse(s.value);
          } catch {
            settingsObj[s.key] = s.value;
          }
        } else if (s.type === "boolean") {
          settingsObj[s.key] = s.value === "true";
        } else if (s.type === "number") {
          settingsObj[s.key] = Number(s.value);
        } else {
          settingsObj[s.key] = s.value;
        }
      });

      res.json({
        settings: settingsObj,
        features,
        testimonials,
        pricing,
        comparison,
        faqs,
      });
    } catch (error) {
      console.error("Error fetching landing page data:", error);
      res.status(500).json({ error: "Failed to fetch landing page data" });
    }
  });

  // Alias endpoint for landing-settings (backward compatibility)
  app.get("/api/landing-settings", async (req, res) => {
    try {
      const [settings, features, testimonials, pricing, comparison, faqs] = await Promise.all([
        storage.getLandingSettings(),
        storage.getLandingFeatures(true),
        storage.getLandingTestimonials(true),
        storage.getLandingPricing(true),
        storage.getLandingComparison(true),
        storage.getLandingFaqs(true),
      ]);

      // Convert settings array to object for easier access
      const settingsObj: Record<string, any> = {};
      settings.forEach(s => {
        if (s.type === "json") {
          try {
            settingsObj[s.key] = JSON.parse(s.value);
          } catch {
            settingsObj[s.key] = s.value;
          }
        } else if (s.type === "boolean") {
          settingsObj[s.key] = s.value === "true";
        } else if (s.type === "number") {
          settingsObj[s.key] = Number(s.value);
        } else {
          settingsObj[s.key] = s.value;
        }
      });

      res.json({
        settings: settingsObj,
        features,
        testimonials,
        pricing,
        comparison,
        faqs,
      });
    } catch (error) {
      console.error("Error fetching landing page settings:", error);
      res.status(500).json({ error: "Failed to fetch landing page settings" });
    }
  });

  // Get a single pricing plan by ID (public endpoint for signup flow)
  app.get("/api/landing/pricing/:id", async (req, res) => {
    try {
      const plan = await storage.getLandingPricingPlan(req.params.id);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      res.json(plan);
    } catch (error) {
      console.error("Error fetching pricing plan:", error);
      res.status(500).json({ error: "Failed to fetch pricing plan" });
    }
  });

  // ============ SALES CHAT ADMIN ROUTES ============

  // List all chat sessions with filtering
  app.get("/api/admin/sales-chat/sessions", requireAdmin, async (req, res) => {
    try {
      const { startDate, endDate, status, hasLead, page = "1", limit = "50" } = req.query;

      const result = await storage.getSalesChatSessions({
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
        status: status as string | undefined,
        hasLead: hasLead as string | undefined,
        limit: parseInt(limit as string),
        offset: (parseInt(page as string) - 1) * parseInt(limit as string),
      });

      res.json({
        sessions: result.sessions,
        total: result.total,
        pages: Math.ceil(result.total / parseInt(limit as string)),
        currentPage: parseInt(page as string),
      });
    } catch (error) {
      console.error("Error fetching sales chat sessions:", error);
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  // Get session detail with all messages
  app.get("/api/admin/sales-chat/sessions/:id", requireAdmin, async (req, res) => {
    try {
      const session = await storage.getSalesChatSession((req.params.id as string));
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const messages = await storage.getSalesChatMessages((req.params.id as string));
      const lead = await storage.getSalesLeadBySession((req.params.id as string));

      res.json({
        session,
        messages,
        lead: lead || null,
      });
    } catch (error) {
      console.error("Error fetching sales chat session:", error);
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  // List all leads
  app.get("/api/admin/sales-leads", requireAdmin, async (req, res) => {
    try {
      const { status, startDate, endDate, page = "1", limit = "50" } = req.query;

      const result = await storage.getSalesLeads({
        status: status as string | undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
        limit: parseInt(limit as string),
        offset: (parseInt(page as string) - 1) * parseInt(limit as string),
      });

      res.json({
        leads: result.leads,
        total: result.total,
        pages: Math.ceil(result.total / parseInt(limit as string)),
        currentPage: parseInt(page as string),
      });
    } catch (error) {
      console.error("Error fetching sales leads:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  // Update lead status/notes
  app.patch("/api/admin/sales-leads/:id", requireAdmin, async (req, res) => {
    try {
      const { status, notes } = req.body;

      const lead = await storage.updateSalesLead((req.params.id as string), { status, notes });
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      res.json(lead);
    } catch (error) {
      console.error("Error updating sales lead:", error);
      res.status(500).json({ error: "Failed to update lead" });
    }
  });

  // ============ FEATURE USAGE / GATING ============

  /**
   * GET /api/features/usage
   * Returns the current user's feature usage summary for the active billing month.
   * Used by the client-side FeatureGate component to decide what to blur/lock.
   */
  app.get("/api/features/usage", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const plan = await getEffectivePlan(userId);
      const { getUserFeatureSummary } = await import("./lib/featureGate");
      const summary = await getUserFeatureSummary(userId, plan);
      res.json({ plan, summary });
    } catch (error: any) {
      console.error("Error fetching feature usage:", error);
      res.status(500).json({ error: "Failed to fetch feature usage" });
    }
  });

  /**
   * POST /api/billing/track-upgrade-cta
   * Logs an audit event when the user clicks an upgrade CTA (for conversion tracking).
   */
  app.post("/api/billing/track-upgrade-cta", requireAuth, async (req, res) => {
    try {
      const source = (req.body?.source as string) || "unknown";
      const validSources = ["top_nav", "sidebar", "feature_gate", "locked_nav"];
      const sanitized = validSources.includes(source) ? source : "unknown";
      auditLogFromRequest(req, {
        eventType: "billing.upgrade_cta_click",
        eventCategory: "billing",
        action: "upgrade_cta_click",
        metadata: { source: sanitized },
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to track" });
    }
  });

  // ============ LANDING PAGE ADMIN ROUTES ============
  // (Uses requireAdmin middleware imported from ./auth)

  // Settings
  app.get("/api/admin/landing/settings", requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getLandingSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching landing settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.put("/api/admin/landing/settings/:key", requireAdmin, async (req, res) => {
    try {
      const { value, type } = req.body;
      const setting = await storage.upsertLandingSetting((req.params.key as string), value, type);
      res.json(setting);
    } catch (error) {
      console.error("Error updating landing setting:", error);
      res.status(500).json({ error: "Failed to update setting" });
    }
  });

  app.delete("/api/admin/landing/settings/:key", requireAdmin, async (req, res) => {
    try {
      const success = await storage.deleteLandingSetting((req.params.key as string));
      res.json({ success });
    } catch (error) {
      console.error("Error deleting landing setting:", error);
      res.status(500).json({ error: "Failed to delete setting" });
    }
  });

  // Features
  app.get("/api/admin/landing/features", requireAdmin, async (req, res) => {
    try {
      const features = await storage.getLandingFeatures();
      res.json(features);
    } catch (error) {
      console.error("Error fetching landing features:", error);
      res.status(500).json({ error: "Failed to fetch features" });
    }
  });

  app.post("/api/admin/landing/features", requireAdmin, async (req, res) => {
    try {
      const feature = await storage.createLandingFeature(req.body);
      res.json(feature);
    } catch (error) {
      console.error("Error creating landing feature:", error);
      res.status(500).json({ error: "Failed to create feature" });
    }
  });

  app.put("/api/admin/landing/features/:id", requireAdmin, async (req, res) => {
    try {
      const feature = await storage.updateLandingFeature((req.params.id as string), req.body);
      if (!feature) {
        return res.status(404).json({ error: "Feature not found" });
      }
      res.json(feature);
    } catch (error) {
      console.error("Error updating landing feature:", error);
      res.status(500).json({ error: "Failed to update feature" });
    }
  });

  app.delete("/api/admin/landing/features/:id", requireAdmin, async (req, res) => {
    try {
      const success = await storage.deleteLandingFeature((req.params.id as string));
      res.json({ success });
    } catch (error) {
      console.error("Error deleting landing feature:", error);
      res.status(500).json({ error: "Failed to delete feature" });
    }
  });

  // Testimonials
  app.get("/api/admin/landing/testimonials", requireAdmin, async (req, res) => {
    try {
      const testimonials = await storage.getLandingTestimonials();
      res.json(testimonials);
    } catch (error) {
      console.error("Error fetching landing testimonials:", error);
      res.status(500).json({ error: "Failed to fetch testimonials" });
    }
  });

  app.post("/api/admin/landing/testimonials", requireAdmin, async (req, res) => {
    try {
      const testimonial = await storage.createLandingTestimonial(req.body);
      res.json(testimonial);
    } catch (error) {
      console.error("Error creating landing testimonial:", error);
      res.status(500).json({ error: "Failed to create testimonial" });
    }
  });

  app.put("/api/admin/landing/testimonials/:id", requireAdmin, async (req, res) => {
    try {
      const testimonial = await storage.updateLandingTestimonial((req.params.id as string), req.body);
      if (!testimonial) {
        return res.status(404).json({ error: "Testimonial not found" });
      }
      res.json(testimonial);
    } catch (error) {
      console.error("Error updating landing testimonial:", error);
      res.status(500).json({ error: "Failed to update testimonial" });
    }
  });

  app.delete("/api/admin/landing/testimonials/:id", requireAdmin, async (req, res) => {
    try {
      const success = await storage.deleteLandingTestimonial((req.params.id as string));
      res.json({ success });
    } catch (error) {
      console.error("Error deleting landing testimonial:", error);
      res.status(500).json({ error: "Failed to delete testimonial" });
    }
  });

  // Pricing
  app.get("/api/admin/landing/pricing", requireAdmin, async (req, res) => {
    try {
      const pricing = await storage.getLandingPricing();
      res.json(pricing);
    } catch (error) {
      console.error("Error fetching landing pricing:", error);
      res.status(500).json({ error: "Failed to fetch pricing" });
    }
  });

  app.post("/api/admin/landing/pricing", requireAdmin, async (req, res) => {
    try {
      const pricing = await storage.createLandingPricing(req.body);
      res.json(pricing);
    } catch (error) {
      console.error("Error creating landing pricing:", error);
      res.status(500).json({ error: "Failed to create pricing" });
    }
  });

  app.put("/api/admin/landing/pricing/:id", requireAdmin, async (req, res) => {
    try {
      const pricing = await storage.updateLandingPricing((req.params.id as string), req.body);
      if (!pricing) {
        return res.status(404).json({ error: "Pricing plan not found" });
      }
      res.json(pricing);
    } catch (error) {
      console.error("Error updating landing pricing:", error);
      res.status(500).json({ error: "Failed to update pricing" });
    }
  });

  app.delete("/api/admin/landing/pricing/:id", requireAdmin, async (req, res) => {
    try {
      const success = await storage.deleteLandingPricing((req.params.id as string));
      res.json({ success });
    } catch (error) {
      console.error("Error deleting landing pricing:", error);
      res.status(500).json({ error: "Failed to delete pricing" });
    }
  });

  // Comparison
  app.get("/api/admin/landing/comparison", requireAdmin, async (req, res) => {
    try {
      const comparison = await storage.getLandingComparison();
      res.json(comparison);
    } catch (error) {
      console.error("Error fetching landing comparison:", error);
      res.status(500).json({ error: "Failed to fetch comparison" });
    }
  });

  app.post("/api/admin/landing/comparison", requireAdmin, async (req, res) => {
    try {
      const row = await storage.createLandingComparison(req.body);
      res.json(row);
    } catch (error) {
      console.error("Error creating landing comparison:", error);
      res.status(500).json({ error: "Failed to create comparison row" });
    }
  });

  app.put("/api/admin/landing/comparison/:id", requireAdmin, async (req, res) => {
    try {
      const row = await storage.updateLandingComparison((req.params.id as string), req.body);
      if (!row) {
        return res.status(404).json({ error: "Comparison row not found" });
      }
      res.json(row);
    } catch (error) {
      console.error("Error updating landing comparison:", error);
      res.status(500).json({ error: "Failed to update comparison row" });
    }
  });

  app.delete("/api/admin/landing/comparison/:id", requireAdmin, async (req, res) => {
    try {
      const success = await storage.deleteLandingComparison((req.params.id as string));
      res.json({ success });
    } catch (error) {
      console.error("Error deleting landing comparison:", error);
      res.status(500).json({ error: "Failed to delete comparison row" });
    }
  });

  // FAQ
  app.get("/api/admin/landing/faqs", requireAdmin, async (req, res) => {
    try {
      const faqs = await storage.getLandingFaqs();
      res.json(faqs);
    } catch (error) {
      console.error("Error fetching landing FAQs:", error);
      res.status(500).json({ error: "Failed to fetch FAQs" });
    }
  });

  app.post("/api/admin/landing/faqs", requireAdmin, async (req, res) => {
    try {
      const faq = await storage.createLandingFaq(req.body);
      res.json(faq);
    } catch (error) {
      console.error("Error creating landing FAQ:", error);
      res.status(500).json({ error: "Failed to create FAQ" });
    }
  });

  app.put("/api/admin/landing/faqs/:id", requireAdmin, async (req, res) => {
    try {
      const faq = await storage.updateLandingFaq((req.params.id as string), req.body);
      if (!faq) {
        return res.status(404).json({ error: "FAQ not found" });
      }
      res.json(faq);
    } catch (error) {
      console.error("Error updating landing FAQ:", error);
      res.status(500).json({ error: "Failed to update FAQ" });
    }
  });

  app.delete("/api/admin/landing/faqs/:id", requireAdmin, async (req, res) => {
    try {
      const success = await storage.deleteLandingFaq((req.params.id as string));
      res.json({ success });
    } catch (error) {
      console.error("Error deleting landing FAQ:", error);
      res.status(500).json({ error: "Failed to delete FAQ" });
    }
  });

  // Landing Video Annotations (Admin)
  app.get("/api/admin/landing/video-annotations", requireAdmin, async (req, res) => {
    try {
      const annotations = await storage.getVideoAnnotations(false);
      res.json(annotations);
    } catch (error) {
      console.error("Error fetching video annotations:", error);
      res.status(500).json({ error: "Failed to fetch video annotations" });
    }
  });

  app.post("/api/admin/landing/video-annotations", requireAdmin, async (req, res) => {
    try {
      const annotation = await storage.createVideoAnnotation(req.body);
      res.json(annotation);
    } catch (error) {
      console.error("Error creating video annotation:", error);
      res.status(500).json({ error: "Failed to create video annotation" });
    }
  });

  app.put("/api/admin/landing/video-annotations/:id", requireAdmin, async (req, res) => {
    try {
      const annotation = await storage.updateVideoAnnotation((req.params.id as string), req.body);
      res.json(annotation);
    } catch (error) {
      console.error("Error updating video annotation:", error);
      res.status(500).json({ error: "Failed to update video annotation" });
    }
  });

  app.delete("/api/admin/landing/video-annotations/:id", requireAdmin, async (req, res) => {
    try {
      const success = await storage.deleteVideoAnnotation((req.params.id as string));
      res.json({ success });
    } catch (error) {
      console.error("Error deleting video annotation:", error);
      res.status(500).json({ error: "Failed to delete video annotation" });
    }
  });

  // Public endpoint for video annotations (used by landing page)
  app.get("/api/landing/video-annotations", async (req, res) => {
    try {
      const annotations = await storage.getVideoAnnotations(true);
      res.json(annotations);
    } catch (error) {
      console.error("Error fetching video annotations:", error);
      res.status(500).json({ error: "Failed to fetch video annotations" });
    }
  });

  // ============ STRIPE PAYMENT ROUTES ============

  // Check Stripe configuration status
  app.get("/api/stripe/status", async (req, res) => {
    const isConfigured = !!process.env.STRIPE_SECRET_KEY;
    res.json({ configured: isConfigured });
  });

  // Helper: build the base URL for Stripe redirect URLs.
  // CLIENT_URL takes precedence (set to https://app.budgetsmart.io in Railway production).
  // Falls back to BASE_URL, then X-Forwarded-Proto/Host headers from reverse proxies,
  // then the raw request protocol/host (dev only).
  const getStripeBaseUrl = (req: ExpressRequest): string => {
    const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol;
    const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() || req.get('host');
    return process.env.CLIENT_URL || process.env.BASE_URL || `${proto}://${host}`;
  };

  // Create checkout session for subscription
  app.post("/api/stripe/create-checkout-session", requireAuth, async (req, res) => {
    try {
      const { priceId, planId } = req.body;
      const userId = req.session.userId!;

      // Check if Stripe is configured
      if (!process.env.STRIPE_SECRET_KEY) {
        console.error("STRIPE_SECRET_KEY environment variable is not set");
        return res.status(500).json({
          error: "Payment system not configured. Please contact support.",
          code: "STRIPE_NOT_CONFIGURED"
        });
      }

      if (!priceId || !planId) {
        return res.status(400).json({ error: "priceId and planId are required" });
      }

      // Verify the price ID exists
      if (!priceId || priceId === "null" || priceId === "undefined") {
        return res.status(400).json({
          error: "This plan doesn't have payment configured yet. Please contact support.",
          code: "PRICE_NOT_CONFIGURED"
        });
      }

      const { createSubscriptionCheckout } = await import("./stripe");

      const baseUrl = getStripeBaseUrl(req);
      const successUrl = `${baseUrl}/dashboard?subscription=success`;
      const cancelUrl = `${baseUrl}/upgrade?cancelled=true`;

      const session = await createSubscriptionCheckout(
        userId,
        priceId,
        planId,
        successUrl,
        cancelUrl
      );

      res.json({ sessionId: session.id, url: session.url });
    } catch (error: any) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ error: error.message || "Failed to create checkout session" });
    }
  });

  // Create checkout session for one-time payment (additional bank account)
  app.post("/api/stripe/create-bank-account-checkout", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { createOneTimeCheckout, EXTRA_BANK_ACCOUNT_PRICE } = await import("./stripe");

      const baseUrl = getStripeBaseUrl(req);
      const successUrl = `${baseUrl}/bank-accounts?purchase=success`;
      const cancelUrl = `${baseUrl}/bank-accounts?purchase=canceled`;

      const session = await createOneTimeCheckout(
        userId,
        EXTRA_BANK_ACCOUNT_PRICE,
        "Additional Bank Account Slot",
        successUrl,
        cancelUrl,
        { type: "bank_account_addon" }
      );

      res.json({ sessionId: session.id, url: session.url });
    } catch (error: any) {
      console.error("Error creating bank account checkout:", error);
      res.status(500).json({ error: error.message || "Failed to create checkout session" });
    }
  });

  // Create billing portal session
  app.post("/api/stripe/create-portal-session", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { createBillingPortalSession } = await import("./stripe");

      const baseUrl = getStripeBaseUrl(req);
      const returnUrl = `${baseUrl}/settings`;

      const session = await createBillingPortalSession(userId, returnUrl);

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating portal session:", error);
      res.status(500).json({ error: error.message || "Failed to create portal session" });
    }
  });

  // Get user's subscription status
  app.get("/api/stripe/subscription", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get the plan details if subscribed
      let plan = null;
      if (user.subscriptionPlanId) {
        plan = await storage.getLandingPricingPlan(user.subscriptionPlanId);
      }

      res.json({
        hasSubscription: !!user.stripeSubscriptionId,
        status: user.subscriptionStatus,
        planId: user.subscriptionPlanId,
        userPlan: user.plan || 'free', // Default to 'free' so SubscriptionGate always grants access
        plan: plan ? {
          id: plan.id,
          name: plan.name,
          price: plan.price,
          billingPeriod: plan.billingPeriod,
          maxBankAccounts: plan.maxBankAccounts,
          maxFamilyMembers: plan.maxFamilyMembers,
        } : null,
        trialEndsAt: user.trialEndsAt,
        subscriptionEndsAt: user.subscriptionEndsAt,
      });
    } catch (error: any) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ error: error.message || "Failed to fetch subscription" });
    }
  });

  // Sync subscription from Stripe (fallback when webhook is delayed)
  app.post("/api/stripe/sync-subscription", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // If user doesn't have a Stripe customer ID, nothing to sync
      if (!user.stripeCustomerId) {
        console.log(`[sync-subscription] User ${userId} has no Stripe customer ID — skipping sync`);
        return res.json({ synced: false, reason: "No Stripe customer ID" });
      }

      const { stripe } = await import("./stripe");

      // List subscriptions for this customer — fetch up to 10 so we can pick
      // an active/trialing one even if a cancelled subscription is most recent
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: "all",
        limit: 10,
      });

      if (subscriptions.data.length === 0) {
        console.log(`[sync-subscription] No subscriptions found for user ${userId} (customer ${user.stripeCustomerId})`);
        return res.json({ synced: false, reason: "No subscriptions found" });
      }

      // Prefer active or trialing subscriptions; fall back to the most recent one
      const activeStatuses = ["active", "trialing"];
      const subscription = subscriptions.data.find(s => activeStatuses.includes(s.status))
        || subscriptions.data[0];

      console.log(`[sync-subscription] Found subscription ${subscription.id} (${subscription.status}) for user ${userId}`);

      // Get planId from subscription metadata — if missing, resolve from price ID
      let planId: string | null = subscription.metadata?.planId || null;
      if (!planId && subscription.items?.data?.[0]?.price?.id) {
        const priceId = subscription.items.data[0].price.id as string;
        console.log(`[sync-subscription] No planId in subscription metadata for user ${userId}, looking up by price ID ${priceId}`);
        const planByPrice = await storage.getLandingPricingByStripePriceId(priceId);
        if (planByPrice) {
          planId = planByPrice.id;
          console.log(`[sync-subscription] Resolved planId ${planId} from price ID ${priceId}`);
        } else {
          console.warn(`[sync-subscription] No landing_pricing record found for price ID ${priceId}`);
        }
      }

      // Update user's subscription info in NeonDB
      const sub = subscription as any;
      const updatedUser = await storage.updateUserStripeInfo(userId, {
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        subscriptionPlanId: planId,
        trialEndsAt: null, // No trials in freemium model
        subscriptionEndsAt: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
      });

      console.log(`[sync-subscription] ✓ Updated user ${userId}: subscriptionId=${subscription.id} status=${subscription.status} planId=${planId} dbResult=${!!updatedUser}`);

      res.json({
        synced: true,
        subscriptionId: subscription.id,
        status: subscription.status,
        planId,
      });
    } catch (error: any) {
      console.error("Error syncing subscription:", error);
      res.status(500).json({ error: error.message || "Failed to sync subscription" });
    }
  });

  // Cancel subscription
  app.post("/api/stripe/cancel-subscription", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { immediately } = req.body;

      const user = await storage.getUser(userId);
      if (!user?.stripeSubscriptionId) {
        return res.status(400).json({ error: "No active subscription" });
      }

      const { cancelSubscription } = await import("./stripe");
      await cancelSubscription(user.stripeSubscriptionId, immediately === true);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error canceling subscription:", error);
      res.status(500).json({ error: error.message || "Failed to cancel subscription" });
    }
  });

  // Reactivate subscription
  app.post("/api/stripe/reactivate-subscription", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;

      const user = await storage.getUser(userId);
      if (!user?.stripeSubscriptionId) {
        return res.status(400).json({ error: "No subscription to reactivate" });
      }

      const { reactivateSubscription } = await import("./stripe");
      await reactivateSubscription(user.stripeSubscriptionId);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error reactivating subscription:", error);
      res.status(500).json({ error: error.message || "Failed to reactivate subscription" });
    }
  });

  // Redeem a license/promotion code (AppSumo or lifetime deals)
  app.post("/api/stripe/redeem-code", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { code } = req.body;

      if (!code || typeof code !== "string") {
        return res.status(400).json({ error: "A license code is required" });
      }

      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(500).json({ error: "Payment system not configured" });
      }

      const { stripe } = await import("./stripe");

      // Validate the promotion code exists in Stripe
      let promoCode: any;
      try {
        const promoCodes = await stripe.promotionCodes.list({ code: code.trim(), limit: 1, active: true });
        promoCode = promoCodes.data[0];
      } catch (e: any) {
        return res.status(400).json({ error: "Invalid or expired code" });
      }

      if (!promoCode) {
        return res.status(400).json({ error: "Invalid or expired code" });
      }

      const coupon = promoCode.coupon;
      const isFullDiscount = coupon.percent_off === 100;

      if (!isFullDiscount) {
        return res.status(400).json({ error: "This code is not a lifetime access code" });
      }

      // Determine which plan the coupon applies to
      // If the coupon has specific price restrictions, use the first one;
      // otherwise fall back to the first available paid plan
      let priceId: string | null = null;
      let planId: string | null = null;
      let planName = 'pro';

      if (coupon.applies_to?.products?.length) {
        // Look up plans matching this product
        const product = coupon.applies_to.products[0];
        const prices = await stripe.prices.list({ product, limit: 1, active: true });
        if (prices.data[0]) {
          priceId = prices.data[0].id;
          const plan = await storage.getLandingPricingByStripePriceId(priceId);
          if (plan) {
            planId = plan.id;
            const nameLower = plan.name.toLowerCase();
            if (nameLower.includes('family')) planName = 'family';
            else if (nameLower.includes('pro')) planName = 'pro';
          }
        }
      }

      if (!priceId) {
        // Fallback: find a pro monthly plan
        const allPlans = await storage.getLandingPricing(true);
        const proPlan = allPlans.find(p =>
          p.stripePriceId && p.billingPeriod === 'monthly' && p.name.toLowerCase().includes('pro')
        ) || allPlans.find(p => p.stripePriceId);
        if (proPlan?.stripePriceId) {
          priceId = proPlan.stripePriceId;
          planId = proPlan.id;
          const nameLower = proPlan.name.toLowerCase();
          if (nameLower.includes('family')) planName = 'family';
        }
      }

      if (!priceId) {
        return res.status(400).json({ error: "No eligible plan found for this code" });
      }

      // Get or create Stripe customer, then create a subscription with 100% discount
      const { getOrCreateStripeCustomer } = await import("./stripe");
      const customerId = await getOrCreateStripeCustomer(userId);

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        discounts: [{ promotion_code: promoCode.id }],
        metadata: { userId, planId: planId || '', plan: planName, source: 'redeem' },
      } as any);

      // Update user's plan in DB
      await storage.updateUserStripeInfo(userId, {
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        subscriptionPlanId: planId,
        plan: planName,
        planStatus: 'active',
        planStartedAt: new Date().toISOString(),
      });

      auditLogFromRequest(req, {
        eventType: "stripe.code_redeemed",
        eventCategory: "billing",
        actorId: userId,
        action: "redeem_license_code",
        outcome: "success",
        metadata: { code, planName, subscriptionId: subscription.id },
      });

      res.json({ success: true, plan: planName });
    } catch (error: any) {
      console.error("Error redeeming code:", error);
      res.status(500).json({ error: error.message || "Failed to redeem code" });
    }
  });

  // ============ AFFILIATE PROGRAM ROUTES ============

  // Get affiliate settings (public)
  app.get("/api/affiliate/settings", async (_req, res) => {
    try {
      const settings = await storage.getAffiliateSettings();

      // Convert to object with defaults
      const settingsMap: Record<string, any> = {
        commissionPercent: 40,
        partneroUrl: "https://affiliate.budgetsmart.io",
        bonusTier1Customers: 100,
        bonusTier1Amount: 250,
        bonusTier2Customers: 250,
        bonusTier2Amount: 1000,
        bonusTier3Customers: 500,
        bonusTier3Amount: 2500,
        tier1CommissionPercent: 50,
        tier2CommissionPercent: 55,
        tier3CommissionPercent: 60,
      };

      for (const setting of settings) {
        if (setting.type === "number") {
          settingsMap[setting.key] = parseFloat(setting.value);
        } else if (setting.type === "boolean") {
          settingsMap[setting.key] = setting.value === "true";
        } else {
          settingsMap[setting.key] = setting.value;
        }
      }

      res.json(settingsMap);
    } catch (error) {
      console.error("Error fetching affiliate settings:", error);
      res.status(500).json({ error: "Failed to fetch affiliate settings" });
    }
  });

  // Update affiliate settings (admin only)
  app.put("/api/admin/affiliate/settings", requireAdmin, async (req, res) => {
    try {
      const updates = req.body;
      const results: any[] = [];

      for (const [key, value] of Object.entries(updates)) {
        const type = typeof value === "number" ? "number" :
                     typeof value === "boolean" ? "boolean" : "string";
        const result = await storage.upsertAffiliateSetting(key, String(value), type);
        results.push(result);
      }

      res.json({ success: true, updated: results.length });
    } catch (error) {
      console.error("Error updating affiliate settings:", error);
      res.status(500).json({ error: "Failed to update affiliate settings" });
    }
  });

  // Get affiliate settings (admin - raw format)
  app.get("/api/admin/affiliate/settings", requireAdmin, async (_req, res) => {
    try {
      const settings = await storage.getAffiliateSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching affiliate settings:", error);
      res.status(500).json({ error: "Failed to fetch affiliate settings" });
    }
  });

  // ========== ADMIN AI MANAGEMENT ENDPOINTS ==========

  // GET /api/admin/ai-config — all features + model config + registry + 7-day stats
  app.get("/api/admin/ai-config", requireAdmin, async (_req, res) => {
    try {
      const { MODEL_REGISTRY } = await import("./ai-models");
      const configRows = await (db as any).$client.query(
        `SELECT mc.*,
                COALESCE(s.call_count,0) AS call_count,
                COALESCE(s.total_cost,0) AS total_cost
         FROM ai_model_config mc
         LEFT JOIN (
           SELECT COALESCE(feature_context, task_slot) AS feature_key,
                  COUNT(*)::int AS call_count,
                  SUM(estimated_cost_usd)::float AS total_cost
           FROM ai_usage_log
           WHERE created_at >= NOW() - INTERVAL '7 days'
           GROUP BY COALESCE(feature_context, task_slot)
         ) s ON s.feature_key = mc.feature
         WHERE mc.is_enabled = true
         ORDER BY mc.feature`,
      );
      res.json({
        taskSlots: configRows.rows,
        registry: MODEL_REGISTRY,
      });
    } catch (error) {
      console.error("Error fetching AI config:", error);
      res.status(500).json({ error: "Failed to fetch AI config" });
    }
  });

  // GET /api/admin/ai-config/models
  app.get("/api/admin/ai-config/models", requireAdmin, async (_req, res) => {
    try {
      const { MODEL_REGISTRY } = await import("./ai-models");
      res.json(MODEL_REGISTRY);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch model registry" });
    }
  });

  // GET /api/admin/ai-config/provider-status
  app.get("/api/admin/ai-config/provider-status", requireAdmin, async (_req, res) => {
    const deepseekConfigured = !!process.env.DEEPSEEK_API_KEY;
    const openaiConfigured = !!process.env.OPENAI_API_KEY;
    const statuses: Array<{ provider: string; configured: boolean; available: boolean }> = [];

    for (const { provider, configured } of [
      { provider: "deepseek", configured: deepseekConfigured },
      { provider: "openai", configured: openaiConfigured },
    ]) {
      let available = false;
      if (configured) {
        try {
          const OpenAI = (await import("openai")).default;
          const client = provider === "deepseek"
            ? new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" })
            : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          await client.chat.completions.create({
            model: provider === "deepseek" ? "deepseek-chat" : "gpt-4o-mini",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          });
          available = true;
        } catch { /* key invalid or network issue */ }
      }
      statuses.push({ provider, configured, available });
    }
    res.json(statuses);
  });

  // PATCH /api/admin/ai-config/:taskSlot
  app.patch("/api/admin/ai-config/:taskSlot", requireAdmin, async (req, res) => {
    try {
      const taskSlot = req.params.taskSlot as string;
      const { provider, modelId } = req.body;
      const adminUserId = req.session.userId!;

      if (!provider || !modelId) {
        return res.status(400).json({ error: "provider and modelId are required" });
      }

      const { MODEL_REGISTRY, getModelDefinition } = await import("./ai-models");
      const modelDef = getModelDefinition(provider, modelId);
      if (!modelDef) {
        return res.status(400).json({ error: "Unknown model. See /api/admin/ai-config/models" });
      }

      const { rows } = await (db as any).$client.query(
        `UPDATE ai_model_config
         SET provider = $1, model_id = $2, updated_at = NOW(), updated_by = $3
         WHERE task_slot = $4
         RETURNING *`,
        [provider, modelId, adminUserId, taskSlot],
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Task slot not found" });
      }

      const { invalidateModelConfigCache } = await import("./ai-router");
      invalidateModelConfigCache();

      res.json({ config: rows[0], model: modelDef });
    } catch (error) {
      console.error("Error updating AI config:", error);
      res.status(500).json({ error: "Failed to update AI config" });
    }
  });

  // GET /api/admin/ai-stats/overview?period=
  app.get("/api/admin/ai-stats/overview", requireAdmin, async (req, res) => {
    try {
      const period = (req.query.period as string) || "7days";
      // Use integer days as a parameterized value to avoid any string interpolation
      const daysMap: Record<string, number> = {
        today: 1,
        "7days": 7,
        "30days": 30,
        "90days": 90,
        all: 3650,
      };
      const days = daysMap[period] ?? 7;

      const summary = await (db as any).$client.query(
        `SELECT
           COUNT(*)::int AS total_calls,
           SUM(estimated_cost_usd)::float AS total_cost,
           SUM(CASE WHEN success THEN 1 ELSE 0 END)::int AS successful_calls,
           AVG(duration_ms)::float AS avg_duration_ms
         FROM ai_usage_log
         WHERE created_at >= NOW() - ($1 * INTERVAL '1 day')`,
        [days],
      );

      const bySlot = await (db as any).$client.query(
        `SELECT task_slot,
                COUNT(*)::int AS call_count,
                SUM(estimated_cost_usd)::float AS total_cost,
                AVG(duration_ms)::float AS avg_ms
         FROM ai_usage_log
         WHERE created_at >= NOW() - ($1 * INTERVAL '1 day')
         GROUP BY task_slot
         ORDER BY total_cost DESC`,
        [days],
      );

      const byProvider = await (db as any).$client.query(
        `SELECT provider,
                COUNT(*)::int AS call_count,
                SUM(estimated_cost_usd)::float AS total_cost
         FROM ai_usage_log
         WHERE created_at >= NOW() - ($1 * INTERVAL '1 day')
         GROUP BY provider`,
        [days],
      );

      const daily = await (db as any).$client.query(
        `SELECT DATE(created_at) AS date,
                provider,
                SUM(estimated_cost_usd)::float AS cost,
                COUNT(*)::int AS calls
         FROM ai_usage_log
         WHERE created_at >= NOW() - ($1 * INTERVAL '1 day')
         GROUP BY DATE(created_at), provider
         ORDER BY date`,
        [days],
      );

      const topUsers = await (db as any).$client.query(
        `SELECT l.user_id,
                u.username,
                COUNT(*)::int AS call_count,
                SUM(l.estimated_cost_usd)::float AS total_cost
         FROM ai_usage_log l
         LEFT JOIN users u ON u.id = l.user_id
         WHERE l.created_at >= NOW() - ($1 * INTERVAL '1 day')
           AND l.user_id IS NOT NULL
         GROUP BY l.user_id, u.username
         ORDER BY total_cost DESC
         LIMIT 10`,
        [days],
      );

      // Pivot daily rows into one object per date with per-provider columns.
      // Note: the chart dataKeys (deepseek_cost, openai_cost) match only these two providers;
      // if additional providers are introduced the chart columns will also need updating.
      const dailyMap: Record<string, { date: string; deepseek_cost: number; openai_cost: number; deepseek_calls: number; openai_calls: number }> = {};
      for (const row of daily.rows) {
        const dateStr = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10);
        if (!dailyMap[dateStr]) {
          dailyMap[dateStr] = { date: dateStr, deepseek_cost: 0, openai_cost: 0, deepseek_calls: 0, openai_calls: 0 };
        }
        if (row.provider === "deepseek") {
          dailyMap[dateStr].deepseek_cost = row.cost ?? 0;
          dailyMap[dateStr].deepseek_calls = row.calls ?? 0;
        } else if (row.provider === "openai") {
          dailyMap[dateStr].openai_cost = row.cost ?? 0;
          dailyMap[dateStr].openai_calls = row.calls ?? 0;
        }
      }

      const s = summary.rows[0];
      res.json({
        period,
        totalCalls: s.total_calls ?? 0,
        totalCost: s.total_cost ?? 0,
        successRate: s.total_calls > 0
          ? parseFloat(((s.successful_calls / s.total_calls) * 100).toFixed(1))
          : 100.0,
        avgDurationMs: Math.round(s.avg_duration_ms ?? 0),
        bySlot: bySlot.rows,
        byProvider: byProvider.rows,
        dailyCosts: Object.values(dailyMap),
        topUsers: topUsers.rows,
      });
    } catch (error) {
      console.error("Error fetching AI stats:", error);
      res.status(500).json({ error: "Failed to fetch AI stats" });
    }
  });

  // GET /api/admin/ai-stats/errors — last 100 failed calls
  app.get("/api/admin/ai-stats/errors", requireAdmin, async (_req, res) => {
    try {
      const { rows } = await (db as any).$client.query(
        `SELECT id, user_id, task_slot, provider, model_id,
                error_message, duration_ms, feature_context, created_at
         FROM ai_usage_log
         WHERE success = false
         ORDER BY created_at DESC
         LIMIT 100`,
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch AI errors" });
    }
  });

  // ========== ADMIN BANK PROVIDER MANAGEMENT ENDPOINTS ==========

  // GET /api/admin/enrichment/stats — enrichment coverage statistics
  app.get("/api/admin/enrichment/stats", requireAdmin, async (_req, res) => {
    try {
      const pool = (db as any).$client as import('pg').Pool;
      const [cacheCount, plaidEnriched, plaidTotal, mxEnriched, mxTotal, logosCount, correctionsCount] = await Promise.all([
        pool.query(`SELECT COUNT(*) AS cnt FROM merchant_enrichment`),
        pool.query(`SELECT COUNT(*) AS cnt FROM plaid_transactions WHERE merchant_clean_name IS NOT NULL`),
        pool.query(`SELECT COUNT(*) AS cnt FROM plaid_transactions`),
        pool.query(`SELECT COUNT(*) AS cnt FROM mx_transactions WHERE merchant_clean_name IS NOT NULL`),
        pool.query(`SELECT COUNT(*) AS cnt FROM mx_transactions`),
        pool.query(`SELECT COUNT(*) AS cnt FROM merchant_enrichment WHERE logo_url IS NOT NULL`),
        pool.query(
          `SELECT (SELECT COUNT(*) FROM plaid_transactions WHERE enrichment_source = 'user_correction') +
                  (SELECT COUNT(*) FROM mx_transactions WHERE enrichment_source = 'user_correction') +
                  (SELECT COUNT(*) FROM manual_transactions WHERE enrichment_source = 'user_correction') AS cnt`
        ),
      ]);

      const enriched = parseInt(plaidEnriched.rows[0].cnt) + parseInt(mxEnriched.rows[0].cnt);
      const total = parseInt(plaidTotal.rows[0].cnt) + parseInt(mxTotal.rows[0].cnt);

      res.json({
        merchantsInCache: parseInt(cacheCount.rows[0].cnt),
        transactionsEnriched: enriched,
        totalTransactions: total,
        coveragePct: total > 0 ? Math.round((enriched / total) * 100) : 0,
        logosFetched: parseInt(logosCount.rows[0].cnt),
        userCorrections: parseInt(correctionsCount.rows[0].cnt),
      });
    } catch (error) {
      console.error("Error getting enrichment stats:", error);
      res.status(500).json({ error: "Failed to get enrichment stats" });
    }
  });

  // POST /api/admin/enrichment/backfill — run enrichment backfill for all users
  app.post("/api/admin/enrichment/backfill", requireAdmin, async (_req, res) => {
    try {
      const { enrichPendingTransactions } = await import("./merchant-enricher");
      const users = await storage.getUsers();
      let usersProcessed = 0;
      let transactionsEnriched = 0;
      for (const user of users) {
        try {
          const count = await enrichPendingTransactions(String(user.id), 100);
          transactionsEnriched += count;
          usersProcessed++;
        } catch (err) {
          console.error('[Enricher] Backfill failed for user:', user.id, err);
        }
      }
      res.json({ usersProcessed, transactionsEnriched });
    } catch (error) {
      console.error("Error running enrichment backfill:", error);
      res.status(500).json({ error: "Failed to run backfill" });
    }
  });

  // GET /api/admin/bank-providers — all providers
  app.get("/api/admin/bank-providers", requireAdmin, async (_req, res) => {
    try {
      const { rows } = await (db as any).$client.query(
        `SELECT * FROM bank_provider_config ORDER BY fallback_order ASC, provider_id ASC`,
      );
      res.json(rows);
    } catch (error) {
      console.error("Error fetching bank providers:", error);
      res.status(500).json({ error: "Failed to fetch bank providers" });
    }
  });

  // PATCH /api/admin/bank-providers/:providerId — update a provider's config
  app.patch("/api/admin/bank-providers/:providerId", requireAdmin, async (req, res) => {
    try {
      const providerId = req.params.providerId as string;
      const adminUserId = req.session.userId!;

      // Only update fields explicitly provided in the request body
      const fieldMap: Record<string, string> = {
        isEnabled: "is_enabled",
        showInWizard: "show_in_wizard",
        showInAccounts: "show_in_accounts",
        fallbackOrder: "fallback_order",
        status: "status",
        statusMessage: "status_message",
        logoUrl: "logo_url",
        displayName: "display_name",
        description: "description",
      };

      const setClauses: string[] = [];
      const values: unknown[] = [];

      for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
        if (jsKey in req.body) {
          values.push(req.body[jsKey]);
          setClauses.push(`${dbCol} = $${values.length}`);
        }
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      values.push(adminUserId);
      setClauses.push(`updated_at = NOW()`, `updated_by = $${values.length}`);
      values.push(providerId);

      const { rows } = await (db as any).$client.query(
        `UPDATE bank_provider_config
         SET ${setClauses.join(", ")}
         WHERE provider_id = $${values.length}
         RETURNING *`,
        values,
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Provider not found" });
      }

      const { invalidateProviderCache } = await import("./bank-providers");
      invalidateProviderCache();

      res.json(rows[0]);
    } catch (error) {
      console.error("Error updating bank provider:", error);
      res.status(500).json({ error: "Failed to update bank provider" });
    }
  });

  // ── Admin System Status ───────────────────────────────────────────────────

  // GET /api/admin/system-status — health checks, security events, recent audit log
  app.get("/api/admin/system-status", requireAdmin, sensitiveApiRateLimiter, async (_req, res) => {
    try {
      const { encrypt, decrypt } = await import("./encryption");

      // ── 1. Database health ──────────────────────────────────────────────
      let dbStatus: "ok" | "error" = "error";
      let dbLatencyMs = 0;
      try {
        const t0 = Date.now();
        await pool.query("SELECT 1");
        dbLatencyMs = Date.now() - t0;
        dbStatus = "ok";
      } catch {
        dbStatus = "error";
      }

      // ── 2. Encryption health ────────────────────────────────────────────
      let encStatus: "ok" | "error" = "error";
      try {
        const plaintext = "budget-smart-health-check";
        const ciphertext = encrypt(plaintext);
        const decrypted = decrypt(ciphertext);
        encStatus = decrypted === plaintext ? "ok" : "error";
      } catch {
        encStatus = "error";
      }

      // ── 3. Active sessions ──────────────────────────────────────────────
      let activeSessions = 0;
      try {
        const sessionResult = await pool.query(
          `SELECT COUNT(*) AS cnt FROM session WHERE expire > NOW()`,
        );
        activeSessions = parseInt(sessionResult.rows[0]?.cnt ?? "0", 10);
      } catch {
        // sessions table may not exist in all environments
        activeSessions = 0;
      }

      // ── 4. Uptime ───────────────────────────────────────────────────────
      const uptimeSeconds = process.uptime();
      const days = Math.floor(uptimeSeconds / 86400);
      const hours = Math.floor((uptimeSeconds % 86400) / 3600);
      const minutes = Math.floor((uptimeSeconds % 3600) / 60);
      const uptimeFormatted = `${days}d ${hours}h ${minutes}m`;

      // ── 5. Security events last 24 hours ────────────────────────────────
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const securityEventTypes = [
        "auth.login_failed",
        "security.rate_limit_exceeded",
        "auth.account_locked",
        "admin.data_accessed",
      ] as const;

      const securityCounts: Record<string, number> = {};
      for (const eventType of securityEventTypes) {
        try {
          const r = await pool.query(
            `SELECT COUNT(*) AS cnt FROM audit_log WHERE event_type = $1 AND created_at >= $2`,
            [eventType, since24h],
          );
          securityCounts[eventType] = parseInt(r.rows[0]?.cnt ?? "0", 10);
        } catch {
          securityCounts[eventType] = 0;
        }
      }

      // ── 6. Recent audit log (last 20 entries) ───────────────────────────
      let recentAuditLog: Record<string, unknown>[] = [];
      try {
        const auditResult = await pool.query(
          `SELECT id, event_type, actor_id, actor_type, actor_ip, outcome, created_at
             FROM audit_log
            ORDER BY created_at DESC
            LIMIT 20`,
        );
        recentAuditLog = auditResult.rows;
      } catch {
        recentAuditLog = [];
      }

      res.json({
        health: {
          database: { status: dbStatus, latencyMs: dbLatencyMs },
          encryption: { status: encStatus },
          activeSessions,
          uptime: { seconds: uptimeSeconds, formatted: uptimeFormatted },
        },
        securityEvents: securityCounts,
        recentAuditLog,
      });
    } catch (error) {
      console.error("Error fetching system status:", error);
      res.status(500).json({ error: "Failed to fetch system status" });
    }
  });

  // GET /api/bank-providers — enabled providers for the current user's country
  app.get("/api/bank-providers", requireAuth, async (req, res) => {
    try {
      const countryCode = (req.query.country as string | undefined)?.toUpperCase();
      const { getEnabledProviders, getProvidersForCountry } = await import("./bank-providers");
      const providers = countryCode
        ? await getProvidersForCountry(countryCode)
        : await getEnabledProviders();
      res.json(providers);
    } catch (error) {
      console.error("Error fetching bank providers:", error);
      res.status(500).json({ error: "Failed to fetch bank providers" });
    }
  });

  // ── Billing endpoints ─────────────────────────────────────────────────────

  // GET /api/billing/subscription — fetch detailed subscription info from Stripe
  app.get("/api/billing/subscription", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.stripeCustomerId) {
        return res.json({ noSubscription: true });
      }

      const { stripe } = await import("./stripe");

      // List subscriptions for this customer
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: "all",
        limit: 1,
        expand: ["data.default_payment_method", "data.latest_invoice"],
      });

      if (subscriptions.data.length === 0) {
        return res.json({ noSubscription: true });
      }

      const sub = subscriptions.data[0] as any;
      const item = sub.items?.data?.[0];
      const price = item?.price;
      const product = price?.product;

      // Resolve plan name from product or local DB
      let planName = "Premium";
      if (typeof product === "object" && product?.name) {
        planName = product.name;
      } else if (user.subscriptionPlanId) {
        const plan = await storage.getLandingPricingPlan(user.subscriptionPlanId);
        if (plan?.name) planName = plan.name;
      }

      // Payment method — prefer default_payment_method on subscription, else on customer
      let paymentMethod: { brand: string; last4: string; expiryMonth: number; expiryYear: number } | null = null;

      let pm = sub.default_payment_method;
      if (!pm && user.stripeCustomerId) {
        try {
          const customer = await stripe.customers.retrieve(user.stripeCustomerId, {
            expand: ["invoice_settings.default_payment_method"],
          }) as any;
          pm = customer.invoice_settings?.default_payment_method;
        } catch (pmErr: any) {
          console.error("Failed to retrieve customer payment method:", pmErr?.message);
        }
      }

      if (pm && typeof pm === "object" && pm.card) {
        paymentMethod = {
          brand: pm.card.brand || "card",
          last4: pm.card.last4 || "****",
          expiryMonth: pm.card.exp_month,
          expiryYear: pm.card.exp_year,
        };
      }

      res.json({
        planName,
        status: sub.status,
        isTrial: sub.status === "trialing",
        trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        currentPeriodEnd: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
        amount: price?.unit_amount ?? null,
        currency: price?.currency ?? null,
        interval: price?.recurring?.interval ?? null,
        paymentMethod,
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      });
    } catch (error: any) {
      console.error("Error fetching billing subscription:", error);
      res.status(500).json({ error: error.message || "Failed to fetch subscription" });
    }
  });

  // POST /api/billing/customer-portal — create Stripe Customer Portal session
  app.post("/api/billing/customer-portal", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);

      if (!user?.stripeCustomerId) {
        return res.status(400).json({ error: "No Stripe customer found for user" });
      }

      const { stripe } = await import("./stripe");
      const appUrl = process.env.APP_URL || getStripeBaseUrl(req);

      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${appUrl}/settings/billing`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating billing portal session:", error);
      res.status(500).json({ error: error.message || "Failed to create billing portal session" });
    }
  });

  // GET /api/billing/invoices — list recent invoices from Stripe
  app.get("/api/billing/invoices", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);

      if (!user?.stripeCustomerId) {
        return res.json({ invoices: [] });
      }

      const { stripe } = await import("./stripe");

      const invoices = await stripe.invoices.list({
        customer: user.stripeCustomerId,
        limit: 10,
      });

      const mapped = invoices.data.map((inv: any) => ({
        id: inv.id,
        date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
        amount: inv.amount_paid,
        currency: inv.currency,
        status: inv.status,
        pdfUrl: inv.invoice_pdf ?? null,
        hostedUrl: inv.hosted_invoice_url ?? null,
      }));

      res.json({ invoices: mapped });
    } catch (error: any) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ error: error.message || "Failed to fetch invoices" });
    }
  });

  // Stripe webhook endpoint (must use raw body)
  app.post("/api/stripe/webhook", async (req, res) => {
    try {
      const sig = req.headers["stripe-signature"];
      if (!sig) {
        console.error("[Stripe Webhook] Missing stripe-signature header");
        return res.status(400).json({ error: "Missing stripe-signature header" });
      }

      // Check if webhook secret is configured
      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured — set the PRODUCTION webhook signing secret from Stripe Dashboard (not the CLI whsec_... secret)");
        return res.status(500).json({ error: "Webhook secret not configured" });
      }

      console.log(`[Stripe Webhook] Request received — secret prefix: ${process.env.STRIPE_WEBHOOK_SECRET.substring(0, 12)}...`);

      const { constructWebhookEvent, handleWebhookEvent } = await import("./stripe");

      // Get the raw body - Express needs raw body for webhook verification
      const rawBody = (req as any).rawBody || req.body;

      if (!rawBody) {
        console.error("[Stripe Webhook] No raw body available for verification — ensure bodyParser is configured to expose rawBody");
        return res.status(400).json({ error: "No request body" });
      }

      try {
        const event = constructWebhookEvent(rawBody, sig as string);
        console.log(`[Stripe Webhook] Signature verified — event: ${event.type} (${event.id})`);
        await handleWebhookEvent(event);
        console.log(`[Stripe Webhook] ✓ Successfully processed: ${event.type} (${event.id})`);
        res.json({ received: true });
      } catch (err: any) {
        console.error("[Stripe Webhook] Signature verification failed:", err.message);
        console.error("[Stripe Webhook] Tip: STRIPE_WEBHOOK_SECRET must match the signing secret of the PRODUCTION webhook endpoint in Stripe Dashboard, not the Stripe CLI whsec_ value");
        console.error("[Stripe Webhook] Secret prefix in use:", process.env.STRIPE_WEBHOOK_SECRET?.substring(0, 10) + "...");
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
      }
    } catch (error: any) {
      console.error("[Stripe Webhook] Unexpected error:", error);
      res.status(500).json({ error: error.message || "Webhook processing failed" });
    }
  });

  // ── Help Center module-scoped AI chat ──────────────────────────────────
  // Admin: AI Model Config
  app.get("/api/admin/ai-models", requireAdmin, async (req, res) => {
    try {
      // Use raw SQL to avoid Drizzle ORM schema mismatch with the legacy UUID primary key table
      const { pool: pgPool } = await import("./db");
      const { rows } = await pgPool.query(`
        SELECT
          id::text,
          feature,
          COALESCE(model_key, 'HAIKU_45') AS "modelKey",
          COALESCE(model, 'HAIKU_45') AS model,
          COALESCE(provider, 'bedrock') AS provider,
          COALESCE(max_tokens, 1000) AS "maxTokens",
          COALESCE(temperature, 0.5)::text AS temperature,
          COALESCE(is_enabled, true) AS "isEnabled",
          notes,
          updated_at AS "updatedAt",
          updated_by AS "updatedBy"
        FROM ai_model_config
        WHERE feature IS NOT NULL
        ORDER BY feature
      `);
      res.json(rows);
    } catch (error: any) {
      console.error("GET /api/admin/ai-models error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/admin/ai-models/:feature", requireAdmin, async (req, res) => {
    try {
      const { feature } = req.params;
      const { modelKey, model, provider, maxTokens, temperature, isEnabled, notes } = req.body;
      const adminUser = (req as any).user;
      const { pool: pgPool } = await import("./db");

      // Upsert using raw SQL — uses the new feature-keyed schema (no task_slot)
      const resolvedModelKey = modelKey ?? model ?? "HAIKU_45";
      const resolvedProvider = provider ?? "bedrock";
      await pgPool.query(
        `INSERT INTO ai_model_config
           (feature, model_key, model, provider, max_tokens, temperature, is_enabled, notes, updated_at, updated_by)
         VALUES
           ($1, $2, $2, $3, $4, $5, $6, $7, NOW(), $8)
         ON CONFLICT (feature) DO UPDATE
           SET model_key   = EXCLUDED.model_key,
               model       = EXCLUDED.model,
               provider    = EXCLUDED.provider,
               max_tokens  = EXCLUDED.max_tokens,
               temperature = EXCLUDED.temperature,
               is_enabled  = EXCLUDED.is_enabled,
               notes       = EXCLUDED.notes,
               updated_at  = NOW(),
               updated_by  = EXCLUDED.updated_by`,
        [
          feature,
          resolvedModelKey,
          resolvedProvider,
          maxTokens ?? 1000,
          temperature != null ? String(temperature) : "0.50",
          isEnabled ?? true,
          notes ?? null,
          adminUser?.username ?? null,
        ]
      );

      const { rows } = await pgPool.query(
        `SELECT
           id::text,
           feature,
           COALESCE(model_key, 'HAIKU_45') AS "modelKey",
           COALESCE(model, 'HAIKU_45') AS model,
           COALESCE(provider, 'bedrock') AS provider,
           COALESCE(max_tokens, 1000) AS "maxTokens",
           COALESCE(temperature, 0.5)::text AS temperature,
           COALESCE(is_enabled, true) AS "isEnabled",
           notes,
           updated_at AS "updatedAt",
           updated_by AS "updatedBy"
         FROM ai_model_config
         WHERE feature = $1
         LIMIT 1`,
        [feature]
      );
      res.json(rows[0] ?? { feature });
    } catch (error: any) {
      console.error("PATCH /api/admin/ai-models error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // TaxSmart AI Assistant
  app.post("/api/tax/ai-assistant", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const plan = await getEffectivePlan(userId);
      const gateResult = await checkAndConsume(userId, plan, "tax_reporting");
      if (!gateResult.allowed) {
        return res.status(402).json({
          feature: "tax_reporting",
          remaining: gateResult.remaining,
          resetDate: gateResult.resetDate?.toISOString() ?? null,
          upgradeRequired: gateResult.upgradeRequired,
        });
      }

      const { country, taxYear, question, messages, isProactive } = req.body as {
        country: "US" | "CA";
        taxYear: number;
        question: string;
        messages?: Array<{ role: "user" | "assistant"; content: string }>;
        isProactive?: boolean;
      };

      if (!question) {
        return res.status(400).json({ error: "question is required" });
      }

      const { aiModelConfig } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const configRows = await db.select().from(aiModelConfig).where(eq(aiModelConfig.feature, "taxsmart"));
      const modelConfig = configRows[0];

      if (modelConfig && !modelConfig.isEnabled) {
        return res.status(503).json({ error: "TaxSmart AI is temporarily disabled." });
      }

      const provider = modelConfig?.provider ?? "deepseek";
      const modelName = modelConfig?.model ?? "deepseek-chat";
      const maxTokens = modelConfig?.maxTokens ?? 500;
      const temperature = parseFloat(String(modelConfig?.temperature ?? "0.7"));

      const countryContext = country === "CA"
        ? `You are TaxSmart AI, a tax education assistant for Canadian taxpayers (CRA). Focus on T2200, T2125, RRSP/TFSA/FHSA, CRA medical expense credit (3% of net income), charitable donation credit, vehicle log requirements, and GST/HST for self-employed. Tax year: ${taxYear}.`
        : `You are TaxSmart AI, a tax education assistant for US taxpayers (IRS). Focus on Schedule C, Schedule A, home office deduction, standard mileage rate, medical expense threshold (7.5% AGI), charitable contribution limits, and education credits. Tax year: ${taxYear}.`;

      const systemPrompt = `${countryContext}
You are NOT a licensed tax professional and do NOT provide personalized tax advice.
Always remind users to consult a CPA or tax professional for their specific situation.
Keep responses concise (3-5 sentences). Always end with a brief disclaimer.`;

      const apiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
        ...(messages ?? []).slice(-6).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ];

      if (!messages || messages.length === 0) {
        apiMessages.push({ role: "user", content: question });
      } else {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role !== "user" || lastMsg?.content !== question) {
          apiMessages.push({ role: "user", content: question });
        }
      }

      const { routeAI } = await import("./ai-router");
      const chatMessages = apiMessages.filter((m: any) => m.role !== "system");
      const systemContent = apiMessages.find((m: any) => m.role === "system")?.content;
      const aiResult = await routeAI({
        taskSlot: "taxsmart_chat",
        userId,
        featureContext: "taxsmart_chat",
        maxTokens,
        temperature,
        messages: [
          ...(systemContent ? [{ role: "system" as const, content: systemContent }] : []),
          ...chatMessages,
        ],
      });
      const response = aiResult.content ?? "I couldn't generate a response.";
      res.json({ response });
    } catch (error: any) {
      console.error("[TaxSmart AI] Full error:", {
        message: error.message,
        status: error.status,
        response: error.response?.data,
        provider: error._provider,
        hasDeepSeekKey: !!process.env.DEEPSEEK_API_KEY,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      });
      res.status(500).json({
        error: "TaxSmart AI temporarily unavailable.",
        debug: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  });

  app.post("/api/help/chat", requireAuth, async (req, res) => {
    try {
      const { moduleId, messages } = req.body as {
        moduleId: string;
        messages: Array<{ role: "user" | "assistant"; content: string }>;
      };

      if (!moduleId || !messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "moduleId and messages array are required" });
      }

      if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY && !process.env.OPENAI_API) {
        return res.status(500).json({ error: "AI API key not configured" });
      }

      const SCOPED_PROMPTS: Record<string, string> = {
        "financial-vault":
          "You are a help assistant for BudgetSmart AI. Answer questions specifically about the Financial Vault feature — what file types it supports, that documents are encrypted with AES-256-GCM at rest, that this is not a backup service, upload size limits, how to organize documents into categories, and how to delete files. Do not answer questions outside this scope. Keep answers to 2–4 sentences.",
        "budget-management":
          "You are a help assistant for BudgetSmart AI. Answer questions specifically about the Budget Management feature — creating budgets, setting category limits, rollover settings, budget vs actual analysis, and budget alerts. Do not answer questions outside this scope. Keep answers to 2–4 sentences.",
        "bank-accounts":
          "You are a help assistant for BudgetSmart AI. Answer questions about connecting bank accounts via Plaid or MX, supported Canadian and US financial institutions, reconnecting broken connections, removing accounts, and how often data syncs. BudgetSmart never stores banking credentials. Do not answer questions outside this scope. Keep answers to 2–4 sentences.",
        "ai-advisor":
          "You are a help assistant for BudgetSmart AI. Answer questions about the AI Advisor feature — how it works, that it uses GPT-4o or DeepSeek, that it is trained on Canadian financial context including TFSA, RRSP, and FHSA optimization, and that its responses are informational not professional financial advice. Do not answer questions outside this scope. Keep answers to 2–4 sentences.",
        "security-privacy":
          "You are a help assistant for BudgetSmart AI. Answer questions about security — AES-256-GCM field-level encryption, SOC 2 compliance (in progress, targeting August 2026), session security, account lockout after 5 failed attempts, and how user data is protected. Do not answer questions outside this scope. Keep answers to 2–4 sentences.",
        "transactions":
          "You are a help assistant for BudgetSmart AI. Answer questions about the Transactions feature — viewing, filtering, searching, manually adding transactions, editing categories, splitting transactions, and exporting transaction history. Keep answers to 2–4 sentences.",
        "bills-reminders":
          "You are a help assistant for BudgetSmart AI. Answer questions about the Bills & Reminders feature — adding bills, setting due date reminders, email notifications, marking bills as paid, and tracking upcoming vs overdue bills. Keep answers to 2–4 sentences.",
        "receipt-scanning":
          "You are a help assistant for BudgetSmart AI. Answer questions about Receipt Scanning — how to upload a receipt, what data is extracted automatically (merchant, amount, date, category), supported image formats, and how scanned receipts link to transactions. Keep answers to 2–4 sentences.",
        "reports-analytics":
          "You are a help assistant for BudgetSmart AI. Answer questions about Reports & Analytics — available report types, date range filtering, spending trends, income vs expense charts, category breakdowns, and how to export reports. Keep answers to 2–4 sentences.",
        "investment-portfolio":
          "You are a help assistant for BudgetSmart AI. Answer questions about the Investment Portfolio Tracking feature — adding holdings, supported asset types, how portfolio value is calculated, AI-powered insights, and how this differs from connected bank accounts. Keep answers to 2–4 sentences.",
      };

      const DEFAULT_PROMPT =
        "You are a help assistant for BudgetSmart AI. Answer questions about the requested BudgetSmart AI feature. Be concise and helpful. Keep answers to 2–4 sentences.";

      const systemPrompt = SCOPED_PROMPTS[moduleId] ?? DEFAULT_PROMPT;

      const { routeAI } = await import("./ai-router");
      const aiResult = await routeAI({
        taskSlot: "help_chat",
        userId: req.session.userId,
        featureContext: "kb_search",
        maxTokens: 1024,
        temperature: 0.5,
        messages: [
          { role: "system" as const, content: systemPrompt },
          ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        ],
      });
      const response = aiResult.content ?? "I couldn't generate a response.";
      res.json({ response });
    } catch (error: any) {
      console.error("Help chat error:", error);
      res.status(500).json({ error: error.message || "Failed to get AI response" });
    }
  });

  app.get("/api/admin/ai-models/test/:feature", requireAdmin, async (req, res) => {
    try {
      const { feature } = req.params;
      const { bedrockChat, getFeatureModel } = await import("./lib/bedrock");
      const { modelId, modelKey, maxTokens } = await getFeatureModel(feature);
      const start = Date.now();
      const content = await bedrockChat({
        feature,
        messages: [{ role: "user", content: "Say 'OK' in one word." }],
        maxTokens: 10,
      });
      const latencyMs = Date.now() - start;
      res.json({ success: true, feature, modelId, modelKey, content, latencyMs });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return httpServer;
}
