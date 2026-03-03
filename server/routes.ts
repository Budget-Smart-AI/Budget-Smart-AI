import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import {
  insertBillSchema, insertExpenseSchema, updateBillSchema, updateExpenseSchema,
  insertIncomeSchema, updateIncomeSchema,
  insertBudgetSchema, updateBudgetSchema,
  insertSavingsGoalSchema, updateSavingsGoalSchema,
  insertDebtDetailsSchema, updateDebtDetailsSchema,
  loginSchema, contactFormSchema, supportFormSchema, createUserSchema, updateUserSchema,
  registerSchema, updateProfileSchema,
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
import { startEmailScheduler, sendHouseholdInvitation, sendTestEmail, sendEmailVerification } from "./email";
import crypto from "crypto";
import { requireAuth, requireAdmin, requireWriteAccess, verifyPassword, hashPassword, generateMfaSecretKey, verifyMfaToken, generateMfaQrCode, loadHouseholdIntoSession, setupGoogleOAuth } from "./auth";
import passport from "passport";
import nodemailer from "nodemailer";
import { authRateLimiter, sensitiveApiRateLimiter } from "./rate-limiter";
import { generateCashFlowForecast, findNextIncomeDate, calculateAverageDailySpending } from "./cash-flow";
import { getStockQuote, getStockAnalysis, generateAnalysisSummary, batchUpdatePrices } from "./alpha-vantage";
import { analyzePortfolio, getDetailedHoldingAnalysis, getInvestmentAdvice } from "./investment-advisor";
import { salesChat, getGreeting } from "./sales-chatbot";
import { salesLeadFormSchema } from "@shared/schema";
import receiptsRouter from "./routes/receipts";
import vaultRouter from "./routes/vault";
import { awsKmsService, AWSKMSService } from "./aws-kms";

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

// Lazy contact transporter – avoids crashes when POSTMARK vars are absent
let _contactTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getContactTransporter(): ReturnType<typeof nodemailer.createTransport> | null {
  if (!process.env.POSTMARK_SERVER || !process.env.POSTMARK_USERNAME || !process.env.POSTMARK_PASSWORD) {
    return null;
  }
  if (!_contactTransporter) {
    _contactTransporter = nodemailer.createTransport({
      host: process.env.POSTMARK_SERVER,
      port: parseInt(process.env.POSTMARK_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.POSTMARK_USERNAME,
        pass: process.env.POSTMARK_PASSWORD,
      },
      connectionTimeout: 10000,
      socketTimeout: 10000,
      greetingTimeout: 10000,
    });
  }
  return _contactTransporter;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Set up Google OAuth
  setupGoogleOAuth(app);

  // Start the email scheduler
  startEmailScheduler();

  // Health check endpoint for deployment monitoring
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // Receipt scanner routes
  app.use("/api/receipts", receiptsRouter);
  app.use("/api/vault", vaultRouter);

  // KMS encryption status endpoint (admin only)
  app.get("/api/kms/status", requireAuth, requireAdmin, async (_req, res) => {
    const configured = awsKmsService.isConfigured();
    const connected = configured ? await awsKmsService.testConnection() : false;
    res.json({
      configured,
      connected,
      keyConfigured: !!process.env.AWS_KMS_KEY_ID,
      region: process.env.AWS_REGION || "us-east-1",
      message: !configured
        ? "KMS is not configured. Set AWS_KMS_KEY_ID, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY to enable encryption."
        : connected
        ? "KMS is active. New Plaid access tokens are encrypted at rest."
        : "KMS credentials are set but the key could not be reached. Check AWS_KMS_KEY_ID and IAM permissions.",
    });
  });

  // Test route for debugging landing page API
  app.get("/api/landing-test", (_req, res) => res.json({ test: "ok" }));

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

  // Detect recurring bills from Plaid transactions + AI analysis
  app.post("/api/bills/detect", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { plaidClient } = await import("./plaid");
      const { deepseek, getModelForTask } = await import("./deepseek");

      // Get existing bills to filter out duplicates
      const existingBills = await storage.getBills(userId);
      const existingBillNames = existingBills.map(b => b.name.toLowerCase());

      // Get Plaid recurring transactions
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
            access_token: item.accessToken,
            account_ids: accountIds,
          });

          // Only get outflows (bills/payments)
          if (response.data.outflow_streams) {
            for (const stream of response.data.outflow_streams) {
              plaidRecurring.push({
                name: stream.merchant_name || stream.description || "Unknown",
                amount: Math.abs(stream.average_amount?.amount || 0),
                frequency: stream.frequency,
                lastDate: stream.last_date,
                category: stream.personal_finance_category?.primary || null,
                isActive: stream.is_active,
              });
            }
          }
        } catch (itemError: any) {
          console.error(`Error fetching recurring for item ${item.id}:`, itemError?.response?.data || itemError);
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

      // Filter to outflows only (positive amounts are charges)
      const outflowTx = transactions
        .filter(t => parseFloat(t.amount) > 0)
        .map(t => ({
          date: t.date,
          name: t.merchantName || t.name,
          amount: parseFloat(t.amount),
          category: t.category,
        }));

      // Use AI to analyze transactions for recurring patterns
      const BILL_CATS = ["Rent", "Internet", "Phone", "Subscriptions", "Utilities", "Insurance", "Loans", "Transportation", "Shopping", "Fitness", "Communications", "Business Expense", "Electrical", "Credit Card", "Line of Credit", "Mortgage", "Entertainment", "Travel", "Maintenance", "Car", "Day Care", "Other"];

      let aiSuggestions: any[] = [];
      if (outflowTx.length > 0) {
        const prompt = `Analyze these ${outflowTx.length} bank transactions (last 6 months) and identify recurring bills/payments:

${JSON.stringify(outflowTx.slice(0, 500))}

Find patterns that occur 2+ times with similar amounts. For each recurring bill, provide:
- name: Clean merchant/service name
- amount: Typical amount (positive number)
- category: One of: ${BILL_CATS.join(", ")}
- recurrence: weekly, biweekly, monthly, or yearly
- dueDay: Day of month (1-31) typically charged
- confidence: high (3+ occurrences), medium (2 occurrences)

Return JSON: { "bills": [...] }`;

        try {
          const response = await deepseek.chat.completions.create({
        model: getModelForTask("moderate"),
            messages: [
              { role: "system", content: "You are a financial analyst. Identify recurring payment patterns. Return only valid JSON." },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.2,
            max_tokens: 4000,
          });

          const result = JSON.parse(response.choices[0].message.content || "{}");
          aiSuggestions = result.bills || [];
        } catch (aiError) {
          console.error("AI analysis error:", aiError);
        }
      }

      // Combine Plaid recurring with AI suggestions
      const allSuggestions: any[] = [];

      // Add Plaid recurring (higher confidence)
      for (const rec of plaidRecurring) {
        if (!rec.isActive) continue;

        // Map Plaid frequency to our recurrence
        let recurrence = "monthly";
        if (rec.frequency === "WEEKLY") recurrence = "weekly";
        else if (rec.frequency === "BIWEEKLY") recurrence = "biweekly";
        else if (rec.frequency === "ANNUALLY") recurrence = "yearly";

        // Get due day from last date
        const dueDay = rec.lastDate ? new Date(rec.lastDate).getDate() : 1;

        // Map Plaid category to our categories
        let category = "Other";
        const plaidCat = (rec.category || "").toUpperCase();
        if (plaidCat.includes("RENT")) category = "Rent";
        else if (plaidCat.includes("UTILITIES")) category = "Utilities";
        else if (plaidCat.includes("INSURANCE")) category = "Insurance";
        else if (plaidCat.includes("SUBSCRIPTION") || plaidCat.includes("ENTERTAINMENT")) category = "Subscriptions";
        else if (plaidCat.includes("LOAN") || plaidCat.includes("CREDIT")) category = "Loans";
        else if (plaidCat.includes("TELECOM") || plaidCat.includes("INTERNET")) category = "Internet";
        else if (plaidCat.includes("PHONE")) category = "Phone";
        else if (plaidCat.includes("TRANSPORTATION")) category = "Transportation";

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
        if (!alreadyInPlaid) {
          allSuggestions.push({
            name: ai.name,
            amount: String(ai.amount),
            category: BILL_CATS.includes(ai.category) ? ai.category : "Other",
            recurrence: ai.recurrence || "monthly",
            dueDay: ai.dueDay || 1,
            source: "ai",
            confidence: ai.confidence || "medium",
          });
        }
      }

      // Filter out bills that already exist
      const newSuggestions = allSuggestions.filter(s => {
        const nameLower = s.name.toLowerCase();
        return !existingBillNames.some(existing =>
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
        existingCount: existingBills.length,
        plaidRecurringCount: plaidRecurring.length,
        aiAnalyzedCount: outflowTx.length,
      });
    } catch (error: any) {
      console.error("Bills detect error:", error);
      res.status(500).json({ error: error.message || "Failed to detect bills" });
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
      const parsed = insertBillSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid bill data", details: parsed.error });
      }
      const bill = await storage.createBill({ ...parsed.data, userId });
      res.status(201).json(bill);
    } catch (error) {
      res.status(500).json({ error: "Failed to create bill" });
    }
  });

  app.patch("/api/bills/:id", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const parsed = updateBillSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid bill data", details: parsed.error });
      }
      const bill = await storage.updateBill(req.params.id, parsed.data);
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
      const deleted = await storage.deleteBill(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Bill not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete bill" });
    }
  });

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
      const expense = await storage.getExpense(req.params.id);
      if (!expense) {
        return res.status(404).json({ error: "Expense not found" });
      }
      res.json(expense);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch expense" });
    }
  });

  app.post("/api/expenses", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const userId = req.session.userId!;
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
      const expense = await storage.updateExpense(req.params.id, parsed.data);
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
      const deleted = await storage.deleteExpense(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Expense not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete expense" });
    }
  });

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
      const plaidItems = await storage.getPlaidItems(userId);
      let disabledPlaidAccountIds = new Set<string>();
      if (plaidItems.length > 0) {
        const allAccounts = await Promise.all(plaidItems.map(item => storage.getPlaidAccounts(item.id)));
        disabledPlaidAccountIds = new Set(
          allAccounts.flat().filter(a => a.isActive !== "true").map(a => a.id)
        );
      }

      // Filter out incomes linked to disabled Plaid accounts
      const filteredIncomes = incomes.filter(inc => {
        if (inc.linkedPlaidAccountId && disabledPlaidAccountIds.has(inc.linkedPlaidAccountId)) {
          return false;
        }
        return true;
      });

      res.json(filteredIncomes);
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

  // Income detection endpoint - finds recurring income from Plaid transactions
  app.post("/api/income/detect", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { plaidClient } = await import("./plaid");
      const { deepseek, getModelForTask } = await import("./deepseek");

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
            access_token: item.accessToken,
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
          const response = await deepseek.chat.completions.create({
        model: getModelForTask("moderate"),
            messages: [
              { role: "system", content: "You are a financial analyst. Identify significant recurring income patterns only. Ignore small or one-off deposits. Return only valid JSON." },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.2,
            max_tokens: 4000,
          });

          const result = JSON.parse(response.choices[0].message.content || "{}");
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
      const income = await storage.updateIncome(req.params.id, parsed.data);
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
      const deleted = await storage.deleteIncome(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Income not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete income" });
    }
  });

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
        budgets = await storage.getBudgetsByUserIdsAndMonth(memberIds, req.params.month);
      } else {
        budgets = await storage.getBudgetsByMonth(userId, req.params.month);
      }

      res.json(budgets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch budgets" });
    }
  });

  app.post("/api/budgets", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const userId = req.session.userId!;
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
      const budget = await storage.updateBudget(req.params.id, parsed.data);
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
      const deleted = await storage.deleteBudget(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Budget not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete budget" });
    }
  });

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
      const goal = await storage.getSavingsGoal(req.params.id);
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
      const goal = await storage.updateSavingsGoal(req.params.id, parsed.data);
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
      const deleted = await storage.deleteSavingsGoal(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Savings goal not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete savings goal" });
    }
  });

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
      const debt = await storage.getDebtDetail(req.params.id);
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
      const debt = await storage.updateDebtDetail(req.params.id, parsed.data);
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
      const deleted = await storage.deleteDebtDetail(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Debt not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete debt detail" });
    }
  });

  // ============ HOUSEHOLD COLLABORATION API ============

  // Create a new household
  app.post("/api/households", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;

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
      const householdId = req.params.id;

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
      const householdId = req.params.id;

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
      const targetUserId = req.params.userId;
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
  app.post("/api/households/invite", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
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
      const invitationId = req.params.id;

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
      const invitation = await storage.getInvitationByToken(req.params.token);

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
      const invitation = await storage.getInvitationByToken(req.params.token);

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
      res.json({
        success: true,
        emailVerificationRequired: true,
        email: email,
        message: "Please check your email to verify your account."
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // Email verification endpoint
  app.get("/api/auth/verify-email/:token", async (req, res) => {
    try {
      const { token } = req.params;

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
        return res.status(401).json({ error: "Invalid username or password" });
      }

      const validPassword = await verifyPassword(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

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

      const isValid = await verifyMfaToken(user.mfaSecret, mfaCode);
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
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
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

      // 21. Delete onboarding analysis data
      await storage.deleteAllOnboardingAnalysisByUser(userId);

      // 22. Delete referral codes and referrals
      await storage.deleteAllReferralsByUser(userId);
      await storage.deleteAllReferralCodesByUser(userId);

      // 23. Finally delete the user
      await storage.deleteUser(userId);

      // Destroy the session
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
        householdRole: req.session.householdRole || null
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
      });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ error: "Failed to update profile" });
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
      const qrCode = await generateMfaQrCode(user.username, secret);

      // Store secret temporarily in session until verified
      (req.session as any).pendingMfaSecret = secret;

      res.json({ 
        qrCode, 
        secret, 
        mfaEnabled: user.mfaEnabled === "true" 
      });
    } catch (error) {
      console.error("MFA setup error:", error);
      res.status(500).json({ error: "MFA setup failed" });
    }
  });

  app.post("/api/auth/mfa/enable", requireAuth, async (req, res) => {
    try {
      const { code } = req.body;
      const pendingSecret = (req.session as any).pendingMfaSecret;

      if (!pendingSecret) {
        return res.status(400).json({ error: "No pending MFA setup" });
      }

      const isValid = await verifyMfaToken(pendingSecret, code);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid verification code" });
      }

      await storage.updateUserMfa(req.session.userId!, pendingSecret, true);
      delete (req.session as any).pendingMfaSecret;

      // If this was a mandatory MFA setup, grant full access now
      if ((req.session as any).mfaSetupRequired) {
        delete (req.session as any).mfaSetupRequired;
        req.session.mfaVerified = true;
        await loadHouseholdIntoSession(req);
      }

      res.json({ success: true, message: "MFA enabled successfully" });
    } catch (error) {
      console.error("MFA enable error:", error);
      res.status(500).json({ error: "Failed to enable MFA" });
    }
  });

  app.post("/api/auth/mfa/disable", requireAuth, async (req, res) => {
    try {
      const { code } = req.body;
      const user = await storage.getUser(req.session.userId!);
      
      if (!user || !user.mfaSecret) {
        return res.status(400).json({ error: "MFA not enabled" });
      }

      const isValid = await verifyMfaToken(user.mfaSecret, code);
      if (!isValid) {
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
  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    try {
      const users = await storage.getUsers();
      // Return users without sensitive data
      const safeUsers = users.map(user => ({
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
      }));
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

      const { username, password, isAdmin, isApproved, subscriptionPlanId, subscriptionStatus } = parsed.data;

      // If changing username, check it doesn't already exist
      if (username) {
        const existingUser = await storage.getUserByUsername(username);
        if (existingUser && existingUser.id !== userId) {
          return res.status(400).json({ error: "Username already exists" });
        }
      }

      const updates: { username?: string; password?: string; isAdmin?: boolean; isApproved?: boolean } = {};
      if (username) updates.username = username;
      if (password) updates.password = await hashPassword(password);
      if (isAdmin !== undefined) updates.isAdmin = isAdmin;
      if (isApproved !== undefined) updates.isApproved = isApproved;

      let user = await storage.updateUser(userId, updates);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Update subscription plan and/or status if provided
      if (subscriptionPlanId !== undefined || subscriptionStatus !== undefined) {
        const stripeUpdates: { subscriptionPlanId?: string | null; subscriptionStatus?: string | null } = {};

        if (subscriptionPlanId !== undefined) {
          stripeUpdates.subscriptionPlanId = subscriptionPlanId;
          // Auto-set status to active when assigning a plan, unless status is also being set
          if (subscriptionStatus === undefined && subscriptionPlanId) {
            stripeUpdates.subscriptionStatus = "active";
          } else if (subscriptionPlanId === null) {
            stripeUpdates.subscriptionStatus = null;
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

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
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

      const contactTransporter = getContactTransporter();
      if (!contactTransporter) {
        return res.status(500).json({ error: "Email not configured on this server" });
      }

      await contactTransporter.sendMail({
        from: fromEmail,
        to: "support@budgetsmart.io",
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
      const supportTransporter = fromEmail ? getContactTransporter() : null;

      let emailSent = false;
      if (supportTransporter && fromEmail) {
        // Notify admin
        try {
          await supportTransporter.sendMail({
            from: fromEmail,
            to: "support@budgetsmart.io",
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
          await supportTransporter.sendMail({
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
      }

      if (emailSent) {
        await storage.updateSupportTicket(ticket.id, { emailSent: "true" });
      }

      res.json({ success: true, message: "Support request submitted successfully", ticketNumber });
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
      const ticket = await storage.getSupportTicketById(req.params.id);
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

      const ticket = await storage.getSupportTicketById(req.params.id);
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
      const ticket = await storage.getSupportTicketById(req.params.id);
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

      const ticket = await storage.getSupportTicketById(req.params.id);
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
      const transporter = fromEmail ? getContactTransporter() : null;
      if (transporter && fromEmail && ticket.email) {
        try {
          await transporter.sendMail({
            from: fromEmail,
            to: ticket.email,
            replyTo: "support@budgetsmart.io",
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
      const ticket = await storage.updateSupportTicket(req.params.id, updates as any);
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

      const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "AI assistant not configured (ANTHROPIC_API_KEY missing)" });
      }

      // Use OpenAI-compatible approach via fetch to Anthropic API
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: "You are a helpful support assistant for BudgetSmart, a personal finance app. You help the support team respond to user tickets professionally and efficiently. When asked to suggest a response, be empathetic, clear, and solution-focused.",
          messages: [
            {
              role: "user",
              content: `Here is the support ticket context:\n\n${ticketContext}\n\n---\n\nAdmin question: ${question}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Claude API error:", errorText);
        return res.status(502).json({ error: "AI assistant request failed" });
      }

      const data = await response.json() as any;
      const aiResponse = data?.content?.[0]?.text || "No response generated";
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
        const salesTransporter = getContactTransporter();
        if (fromEmail && salesTransporter) {
          await salesTransporter.sendMail({
            from: fromEmail,
            to: "sales@budgetsmart.io",
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

      // Per Plaid docs: Request liabilities as primary product
      // transactions and auth can be fetched after Item connection
      const primaryProducts = [Products.Liabilities];
      const additionalProducts = [Products.Transactions, Products.Auth];
      
      console.log("[Plaid] Primary products:", primaryProducts);
      console.log("[Plaid] Additional products:", additionalProducts);

      try {
        // Try with liabilities as primary, transactions/auth as additional
        const response = await plaidClient.linkTokenCreate({
          user: { client_user_id: String(userId) },
          client_name: "Budget Smart AI",
          products: primaryProducts,
          additional_consented_products: additionalProducts,
          country_codes: PLAID_COUNTRY_CODES,
          language: PLAID_LANGUAGE,
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
  app.post("/api/plaid/exchange-token", requireAuth, async (req, res) => {
    try {
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

      // Store the Plaid item
      const plaidItem = await storage.createPlaidItem({
        userId: req.session.userId!,
        accessToken: access_token,
        itemId: item_id,
        institutionId: metadata?.institution?.institution_id || null,
        institutionName: metadata?.institution?.name || null,
      });

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

      res.json({ success: true, item: { id: plaidItem.id, institutionName: plaidItem.institutionName } });
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
            access_token: item.accessToken,
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

  // Sync transactions
  app.post("/api/plaid/transactions/sync", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { plaidClient } = await import("./plaid");
      const { reconcileTransaction, mapPlaidCategory } = await import("./reconciliation");
      const items = await storage.getPlaidItems(userId);
      const bills = await storage.getBills(userId);
      const expensesList = await storage.getExpenses(userId);
      const incomes = await storage.getIncomes(userId);

      let totalAdded = 0;
      let totalModified = 0;
      let totalRemoved = 0;

      // Helper to format date for Plaid API
      const formatDate = (date: Date) => date.toISOString().split('T')[0];

      for (const item of items) {
        try {
          let cursor = item.cursor || undefined;
          const isInitialSync = !cursor;

          // For initial sync (no cursor), use transactionsGet with explicit date range
          // This ensures we get full historical data, not just what Plaid has cached
          if (isInitialSync) {
            console.log(`Initial sync for ${item.institutionName} - using transactionsGet for full history`);

            // First trigger a refresh to ensure Plaid fetches latest from bank
            try {
              await plaidClient.transactionsRefresh({
                access_token: item.accessToken,
              });
              console.log(`  Triggered refresh for ${item.institutionName}`);
              // Give Plaid a moment to start fetching
              await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (refreshError: any) {
              console.log(`  Refresh note: ${refreshError?.response?.data?.error_message || 'continuing'}`);
            }

            // Calculate date range - 2 years back
            const endDate = new Date();
            const startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - 2);

            // Get accounts for this item
            const accounts = await storage.getPlaidAccounts(item.id);
            const accountIds = accounts.map(a => a.accountId);

            if (accountIds.length === 0) {
              console.log(`  No accounts for item ${item.id}`);
              continue;
            }

            let offset = 0;
            const count = 500;
            let hasMore = true;

            while (hasMore) {
              const response = await plaidClient.transactionsGet({
                access_token: item.accessToken,
                start_date: formatDate(startDate),
                end_date: formatDate(endDate),
                options: {
                  count,
                  offset,
                  account_ids: accountIds,
                },
              });

              const transactions = response.data.transactions;
              const totalForItem = response.data.total_transactions;

              console.log(`  Batch: offset ${offset}, got ${transactions.length} of ${totalForItem} total`);

              for (const tx of transactions) {
                // Check if transaction already exists
                const existing = await storage.getPlaidTransactionByTransactionId(tx.transaction_id);
                if (existing) continue;

                const account = await storage.getPlaidAccountByAccountId(tx.account_id);
                if (!account) continue;

                const plaidCategory = tx.personal_finance_category?.primary || null;
                // Get logo URL - check counterparties first, then top level
                const logoUrl = (tx as any).counterparties?.[0]?.logo_url || (tx as any).logo_url || null;
                const txData = {
                  amount: tx.amount.toString(),
                  date: tx.date,
                  name: tx.name,
                  merchantName: tx.merchant_name || null,
                  category: plaidCategory,
                };

                const matchResult = reconcileTransaction(txData, bills, expensesList, incomes);

                await storage.createPlaidTransaction({
                  plaidAccountId: account.id,
                  transactionId: tx.transaction_id,
                  amount: tx.amount.toString(),
                  date: tx.date,
                  name: tx.name,
                  merchantName: tx.merchant_name || null,
                  logoUrl: logoUrl,
                  category: plaidCategory,
                  personalCategory: matchResult.personalCategory,
                  pending: tx.pending ? "true" : "false",
                  matchType: matchResult.matchType,
                  matchedBillId: matchResult.matchType === "bill" ? matchResult.matchedId || null : null,
                  matchedExpenseId: matchResult.matchType === "expense" ? matchResult.matchedId || null : null,
                  matchedIncomeId: matchResult.matchType === "income" ? matchResult.matchedId || null : null,
                  reconciled: matchResult.confidence === "high" ? "true" : "false",
                });
                totalAdded++;
              }

              offset += transactions.length;
              hasMore = offset < totalForItem;
            }

            // After initial historical fetch, do one sync call to establish cursor for future delta syncs
            const syncResponse = await plaidClient.transactionsSync({
              access_token: item.accessToken,
              options: {
                days_requested: 730,
              },
            });
            // Just get the cursor, we already have the transactions
            cursor = syncResponse.data.next_cursor;

            console.log(`  Initial sync complete for ${item.institutionName}: ${totalAdded} transactions`);
          } else {
            // Subsequent sync - use transactionsSync for delta updates
            let hasMore = true;

            while (hasMore) {
              const response = await plaidClient.transactionsSync({
                access_token: item.accessToken,
                cursor: cursor,
                options: {
                  days_requested: 730,
                },
              });

              const { added, modified, removed, next_cursor, has_more } = response.data;

              // Process added transactions
              for (const tx of added) {
                const account = await storage.getPlaidAccountByAccountId(tx.account_id);
                if (!account) continue;

                const plaidCategory = tx.personal_finance_category?.primary || null;
                // Get logo URL - check counterparties first, then top level
                const logoUrl = (tx as any).counterparties?.[0]?.logo_url || (tx as any).logo_url || null;
                const txData = {
                  amount: tx.amount.toString(),
                  date: tx.date,
                  name: tx.name,
                  merchantName: tx.merchant_name || null,
                  category: plaidCategory,
                };

                const matchResult = reconcileTransaction(txData, bills, expensesList, incomes);

                await storage.createPlaidTransaction({
                  plaidAccountId: account.id,
                  transactionId: tx.transaction_id,
                  amount: tx.amount.toString(),
                  date: tx.date,
                  name: tx.name,
                  merchantName: tx.merchant_name || null,
                  logoUrl: logoUrl,
                  category: plaidCategory,
                  personalCategory: matchResult.personalCategory,
                  pending: tx.pending ? "true" : "false",
                  matchType: matchResult.matchType,
                  matchedBillId: matchResult.matchType === "bill" ? matchResult.matchedId || null : null,
                  matchedExpenseId: matchResult.matchType === "expense" ? matchResult.matchedId || null : null,
                  matchedIncomeId: matchResult.matchType === "income" ? matchResult.matchedId || null : null,
                  reconciled: matchResult.confidence === "high" ? "true" : "false",
                });
                totalAdded++;
              }

              // Process modified transactions
              for (const tx of modified) {
                const existing = await storage.getPlaidTransactionByTransactionId(tx.transaction_id);
                if (existing) {
                  await storage.updatePlaidTransaction(existing.id, {
                    amount: tx.amount.toString(),
                    date: tx.date,
                    name: tx.name,
                    merchantName: tx.merchant_name || null,
                    pending: tx.pending ? "true" : "false",
                  });
                  totalModified++;
                }
              }

              // Process removed transactions
              if (removed.length > 0) {
                const removedIds = removed.map(r => r.transaction_id);
                await storage.deleteRemovedTransactions(removedIds);
                totalRemoved += removed.length;
              }

              cursor = next_cursor;
              hasMore = has_more;
            }
          }

          // Update cursor
          await storage.updatePlaidItem(item.id, { cursor: cursor, status: "active" });
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
            // Get recent transactions for anomaly detection
            const recentTransactions = await storage.getPlaidTransactions(accountIds, {
              startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            });
            await detectAnomalies(userId, recentTransactions, accountIds);
          }
        } catch (anomalyError) {
          console.error("Error running anomaly detection:", anomalyError);
          // Don't fail the sync if anomaly detection fails
        }
      }

      res.json({ success: true, added: totalAdded, modified: totalModified, removed: totalRemoved });
    } catch (error) {
      console.error("Error syncing transactions:", error);
      res.status(500).json({ error: "Failed to sync transactions" });
    }
  });

  // Fetch historical transactions (up to 2 years)
  // Uses /transactions/get with explicit date ranges to request older data
  app.post("/api/plaid/transactions/fetch-historical", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { plaidClient } = await import("./plaid");
      const { reconcileTransaction } = await import("./reconciliation");
      const items = await storage.getPlaidItems(userId);
      const bills = await storage.getBills(userId);
      const expensesList = await storage.getExpenses(userId);
      const incomes = await storage.getIncomes(userId);

      // Calculate date range - 2 years back
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 2);
      
      const formatDate = (date: Date) => date.toISOString().split('T')[0];

      let totalAdded = 0;
      let totalSkipped = 0;
      let errors: string[] = [];
      let oldestDate: string | null = null;
      let newestDate: string | null = null;

      for (const item of items) {
        try {
          console.log(`Fetching historical transactions for item ${item.id} (${item.institutionName})...`);
          console.log(`  Date range: ${formatDate(startDate)} to ${formatDate(endDate)}`);

          // First, call transactions/refresh to trigger Plaid to fetch latest from bank
          try {
            await plaidClient.transactionsRefresh({
              access_token: item.accessToken,
            });
            console.log(`  Triggered refresh for ${item.institutionName}`);
          } catch (refreshError: any) {
            console.log(`  Refresh skipped: ${refreshError?.response?.data?.error_message || 'already refreshing'}`);
          }

          // Get accounts for this item
          const accounts = await storage.getPlaidAccounts(item.id);
          const accountIds = accounts.map(a => a.accountId);

          if (accountIds.length === 0) {
            console.log(`  No accounts for item ${item.id}`);
            continue;
          }

          let offset = 0;
          const count = 500;
          let hasMore = true;
          let itemAdded = 0;
          let totalForItem = 0;

          while (hasMore) {
            const response = await plaidClient.transactionsGet({
              access_token: item.accessToken,
              start_date: formatDate(startDate),
              end_date: formatDate(endDate),
              options: {
                count,
                offset,
                account_ids: accountIds,
              },
            });

            const transactions = response.data.transactions;
            totalForItem = response.data.total_transactions;
            
            console.log(`  Batch: offset ${offset}, got ${transactions.length} of ${totalForItem} total`);

            for (const tx of transactions) {
              // Track date range
              if (!oldestDate || tx.date < oldestDate) oldestDate = tx.date;
              if (!newestDate || tx.date > newestDate) newestDate = tx.date;

              // Check if transaction already exists
              const existing = await storage.getPlaidTransactionByTransactionId(tx.transaction_id);
              if (existing) {
                totalSkipped++;
                continue;
              }

              const account = await storage.getPlaidAccountByAccountId(tx.account_id);
              if (!account) continue;

              const plaidCategory = tx.personal_finance_category?.primary || null;
              // Get logo URL - check counterparties first, then top level
              const logoUrl = (tx as any).counterparties?.[0]?.logo_url || (tx as any).logo_url || null;
              const txData = {
                amount: tx.amount.toString(),
                date: tx.date,
                name: tx.name,
                merchantName: tx.merchant_name || null,
                category: plaidCategory,
              };

              const matchResult = reconcileTransaction(txData, bills, expensesList, incomes);

              await storage.createPlaidTransaction({
                plaidAccountId: account.id,
                transactionId: tx.transaction_id,
                amount: tx.amount.toString(),
                date: tx.date,
                name: tx.name,
                merchantName: tx.merchant_name || null,
                logoUrl: logoUrl,
                category: plaidCategory,
                personalCategory: matchResult.personalCategory,
                pending: tx.pending ? "true" : "false",
                matchType: matchResult.matchType,
                matchedBillId: matchResult.matchType === "bill" ? matchResult.matchedId || null : null,
                matchedExpenseId: matchResult.matchType === "expense" ? matchResult.matchedId || null : null,
                matchedIncomeId: matchResult.matchType === "income" ? matchResult.matchedId || null : null,
                reconciled: matchResult.confidence === "high" ? "true" : "false",
              });
              totalAdded++;
              itemAdded++;
            }

            offset += transactions.length;
            hasMore = offset < totalForItem;
          }

          console.log(`  Completed ${item.institutionName}: ${itemAdded} new of ${totalForItem} total`);
        } catch (itemError: any) {
          const errorMsg = itemError?.response?.data?.error_message || itemError?.message || "Unknown error";
          const errorCode = itemError?.response?.data?.error_code;
          console.error(`Error fetching historical for item ${item.id}:`, errorCode, errorMsg);
          errors.push(`${item.institutionName}: ${errorMsg}`);
        }
      }

      res.json({ 
        success: true, 
        added: totalAdded, 
        skipped: totalSkipped,
        dateRange: oldestDate && newestDate ? { oldest: oldestDate, newest: newestDate } : null,
        errors: errors.length > 0 ? errors : undefined,
        message: `Fetched ${totalAdded} new transactions (${totalSkipped} already existed). Data range: ${oldestDate || 'N/A'} to ${newestDate || 'N/A'}`
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
            access_token: item.accessToken,
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
            access_token: item.accessToken,
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

      if (!matchType || !["bill", "expense", "income", "unmatched"].includes(matchType)) {
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
        await plaidClient.itemRemove({ access_token: item.accessToken });
      } catch (e) {
        // Non-critical - item is already removed locally
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error disconnecting bank account:", error);
      res.status(500).json({ error: "Failed to disconnect bank account" });
    }
  });

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

  // MX member connected - sync accounts
  app.post("/api/mx/members/:memberGuid/sync", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      const { memberGuid } = req.params;
      
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
        existingMember = await storage.createMxMember({
          userId,
          memberGuid: mxMember.guid,
          institutionCode: mxMember.institution_code,
          institutionName: institution?.name || mxMember.name || "Unknown Bank",
          connectionStatus: mxMember.connection_status,
          isOauth: mxMember.is_oauth ? "true" : "false",
          aggregatedAt: mxMember.aggregated_at || null,
        });
      } else {
        await storage.updateMxMember(existingMember.id, {
          connectionStatus: mxMember.connection_status,
          aggregatedAt: mxMember.aggregated_at || null,
        });
      }

      // Fetch and sync accounts
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

      res.json({ 
        member: existingMember, 
        accounts: syncedAccounts,
        message: `Synced ${syncedAccounts.length} accounts`
      });
    } catch (error: any) {
      console.error("Error syncing MX member:", error);
      res.status(500).json({ error: error.message || "Failed to sync member" });
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
          category: mapMXCategory(tx.category, tx.top_level_category),
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
      const updated = await storage.updateMxAccount(req.params.id, { isActive: newActive });
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
      const member = await storage.getMxMember(req.params.id);
      
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
      const member = await storage.getMxMember(req.params.id);
      
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

  // ==================== AI ASSISTANT ROUTES ====================

  // Chat with AI assistant
  app.post("/api/ai/chat", requireAuth, async (req, res) => {
    try {
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array is required" });
      }

      if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY && !process.env.OPENAI_API) {
        return res.status(500).json({ error: "AI API key not configured. Please set DEEPSEEK_API_KEY or OPENAI_API_KEY" });
      }

      const { chatWithDeepSeek, getModelForTask } = await import("./deepseek");
      const { withAITimeout } = await import("./timeout");
      
      const result = await withAITimeout(() => 
        chatWithDeepSeek(messages, req.session.userId!, getModelForTask("moderate"))
      );

      res.json(result);
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

      if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY && !process.env.OPENAI_API) {
        return res.status(500).json({ error: "AI API key not configured. Please set DEEPSEEK_API_KEY or OPENAI_API_KEY" });
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

      const { deepseek, getModelForTask } = await import("./deepseek");

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
      
      const response = await withAITimeout(() => deepseek.chat.completions.create({
        model: getModelForTask("moderate"),
        messages: [
          { role: "system", content: "You are a financial forecasting AI. Always respond with valid JSON." },
          { role: "user", content: forecastPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 4000,
      }));

      const resultText = response.choices[0].message.content || "{}";
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

  app.post("/api/ai/suggest-budgets", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { month } = req.body;

      if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY && !process.env.OPENAI_API) {
        return res.status(500).json({ error: "AI API key not configured. Please set DEEPSEEK_API_KEY or OPENAI_API_KEY" });
      }

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
      const allMonths = [...new Set(merged.map(i => i.date.substring(0, 7)))].sort();
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
      const existingBudgets = await storage.getBudgetsByMonth(targetMonth);
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

      const { deepseek, getModelForTask } = await import("./deepseek");

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

      const response = await deepseek.chat.completions.create({
        model: getModelForTask("moderate"),
        messages: [
          { role: "system", content: "You are a budgeting advisor AI. Always respond with valid JSON." },
          { role: "user", content: budgetPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 3000,
      });

      const resultText = response.choices[0].message.content || "{}";
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

  // AI Savings Goal Advisor
  app.post("/api/ai/savings-advisor", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { goalName, targetAmount, currentAmount, targetDate } = req.body;

      if (!goalName) {
        return res.status(400).json({ error: "Goal name is required" });
      }

      if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY && !process.env.OPENAI_API) {
        return res.status(500).json({ error: "AI API key not configured. Please set DEEPSEEK_API_KEY or OPENAI_API_KEY" });
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

      const { deepseek, getModelForTask } = await import("./deepseek");

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

      const response = await deepseek.chat.completions.create({
        model: getModelForTask("moderate"),
        messages: [
          { role: "system", content: "You are a savings advisor AI. Always respond with valid JSON. Be encouraging but realistic." },
          { role: "user", content: savingsPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 3000,
      });

      const resultText = response.choices[0].message.content || "{}";
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
      if (req.session.isDemo) {
        return res.json({ success: true, demo: true });
      }
      
      await storage.updateUserOnboarding(userId, true);
      res.json({ success: true });
    } catch (error) {
      console.error("Error completing onboarding:", error);
      res.status(500).json({ error: "Failed to complete onboarding" });
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

      if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY && !process.env.OPENAI_API) {
        return res.status(500).json({ error: "AI API key not configured. Please set DEEPSEEK_API_KEY or OPENAI_API_KEY" });
      }

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

      const { deepseek, getModelForTask } = await import("./deepseek");

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

      const response = await deepseek.chat.completions.create({
        model: getModelForTask("moderate"),
        messages: [
          { role: "system", content: "You are a thorough financial data analyst. Analyze ALL bank transactions to identify EVERY recurring pattern. Be comprehensive - do not miss any recurring bills or income sources. Return only valid JSON." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 8000,
      });

      const analysisResult = response.choices[0].message.content || "{}";

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
          });
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

  app.post("/api/subscriptions/detect", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;

      // Get all Plaid transactions from the last 6 months
      const plaidItems = await storage.getPlaidItems(userId);
      if (plaidItems.length === 0) {
        return res.json({ subscriptions: [] });
      }

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

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
        return res.json({ subscriptions: [] });
      }

      // Fetch all transactions at once
      const allTransactions = await storage.getPlaidTransactions(allAccountIds, {
        startDate: sixMonthsAgo.toISOString().split("T")[0],
        endDate: new Date().toISOString().split("T")[0],
      });

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

      // Analyze each merchant group for subscription patterns
      const subscriptions: any[] = [];

      for (const [merchant, transactions] of Object.entries(merchantGroups)) {
        if (transactions.length < 2) continue;

        // Sort by date
        transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
        } else if (avgInterval >= 27 && avgInterval <= 35) {
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

        // Get display name (capitalize first letters)
        const displayName = (transactions[0].merchantName || transactions[0].name || merchant)
          .split(" ")
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ");

        subscriptions.push({
          name: displayName,
          amount: Math.round(avgAmount * 100) / 100,
          frequency,
          merchant: displayName,
          confidence,
          lastChargeDate: transactions[transactions.length - 1].date,
          transactionCount: transactions.length,
        });
      }

      // Sort by confidence and amount
      subscriptions.sort((a, b) => b.confidence - a.confidence || b.amount - a.amount);

      res.json({ subscriptions });
    } catch (error) {
      console.error("Error detecting subscriptions:", error);
      res.status(500).json({ error: "Failed to detect subscriptions" });
    }
  });

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
      const category = await storage.createCustomCategory({
        ...req.body,
        userId: req.session.userId!,
      });
      res.status(201).json(category);
    } catch (error) {
      console.error("Error creating custom category:", error);
      res.status(500).json({ error: "Failed to create custom category" });
    }
  });

  app.patch("/api/custom-categories/:id", requireAuth, async (req, res) => {
    try {
      const category = await storage.updateCustomCategory(req.params.id, req.body);
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
      const success = await storage.deleteCustomCategory(req.params.id);
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
      const expense = await storage.updateRecurringExpense(req.params.id, req.body);
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
      const success = await storage.deleteRecurringExpense(req.params.id);
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
      const success = await storage.deleteReconciliationRule(req.params.id);
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
      const schedule = await storage.updateSyncSchedule(req.params.id, req.body);
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
      const success = await storage.deleteSyncSchedule(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Sync schedule not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting sync schedule:", error);
      res.status(500).json({ error: "Failed to delete sync schedule" });
    }
  });

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
      await storage.markNotificationRead(req.params.id);
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
      const success = await storage.deleteNotification(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting notification:", error);
      res.status(500).json({ error: "Failed to delete notification" });
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
        storage.getIncomes(),
        storage.getBudgets(),
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

  app.get("/api/export/csv/:type", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { type } = req.params;
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
          data = await storage.getIncomes();
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
        storage.getIncomes(),
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

  app.get("/api/reports/budget-vs-actual", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const month = (req.query.month as string) || new Date().toISOString().substring(0, 7);
      const [budgets, expenses] = await Promise.all([
        storage.getBudgetsByMonth(month),
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

  // Financial Health Score
  app.get("/api/reports/financial-health", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
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

  // ============ WHAT-IF SIMULATOR ============

  app.post("/api/simulator/what-if", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
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
            const rate = parseFloat(debt.interestRate || "0") / 100 / 12;
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
          interestRate: d.interestRate,
          minimumPayment: d.minimumPayment,
        })),
      });
    } catch (error) {
      console.error("Error getting simulation options:", error);
      res.status(500).json({ error: "Failed to get simulation options" });
    }
  });

  // ============ SILENT MONEY LEAKS DETECTOR ============

  app.get("/api/leaks/detect", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      
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
      for (const [merchantKey, txs] of merchantGroups) {
        if (txs.length < 2) continue;

        // Sort by date
        txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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

      // Helper function
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
      const { id } = req.params;
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
  app.post("/api/autopilot/rules", requireAuth, async (req, res) => {
    try {
      if (req.session.isDemo) {
        return res.status(403).json({ error: "Demo accounts cannot create autopilot rules" });
      }
      const userId = req.session.userId!;
      const { ruleType, category, threshold, action, isActive } = req.body;
      
      const rule = await storage.createAutopilotRule({
        userId,
        ruleType: ruleType || "spending_limit",
        category: category || null,
        threshold: threshold?.toString() || "0",
        action: action || "alert",
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
      if (req.session.isDemo) {
        return res.status(403).json({ error: "Demo accounts cannot update autopilot rules" });
      }
      const { id } = req.params;
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
      if (req.session.isDemo) {
        return res.status(403).json({ error: "Demo accounts cannot delete autopilot rules" });
      }
      const { id } = req.params;
      await storage.deleteAutopilotRule(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting autopilot rule:", error);
      res.status(500).json({ error: "Failed to delete autopilot rule" });
    }
  });

  // Get spendability meter (how much is safe to spend today)
  app.get("/api/autopilot/spendability", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
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
        const dueDay = parseInt(bill.dueDay);
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
          const payDay = parseInt(i.payFrequency === "weekly" ? "7" : 
            i.payFrequency === "biweekly" ? "14" : "30");
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

  // ============ PAYDAY OPTIMIZER ============

  app.get("/api/payday/optimize", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
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
          const payDay = parseInt(i.payFrequency === "monthly" ? i.amount.split("-")[0] || "15" : "15");
          if (i.payFrequency === "biweekly") {
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
        const dueDay = parseInt(bill.dueDay);
        
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
        const sameDayBills = bills.filter(b => parseInt(b.dueDay) === dueDay);
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
        const day = parseInt(b.dueDay);
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

  // ============ AI MONEY COACH NOTIFICATIONS ============

  app.get("/api/coach/daily-briefing", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;

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
        const dueDay = parseInt(bill.dueDay);
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
        if (hour < 12) return "Good morning";
        if (hour < 18) return "Good afternoon";
        return "Good evening";
      }

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

  app.get("/api/trial/status", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Calculate trial day
      const createdAt = user.createdAt ? new Date(user.createdAt) : new Date();
      const daysSinceSignup = Math.floor(
        (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Determine trial phase (Day 3, 7, 10, 12)
      const phases = [
        { day: 3, message: "You've been tracking for 3 days! See your progress." },
        { day: 7, message: "One week in! Your spending patterns are becoming clear." },
        { day: 10, message: "10 days of insights! Ready to take control?" },
        { day: 12, message: "Trial ending soon! Don't lose your financial clarity." },
        { day: 14, message: "Last day! Upgrade to keep your financial journey going." },
      ];

      const currentPhase = phases.find(p => daysSinceSignup >= p.day && daysSinceSignup < p.day + 2);

      // Get user's achievements/value realized
      const [bills, expenses, budgets] = await Promise.all([
        storage.getBills(userId),
        storage.getExpenses(userId),
        storage.getBudgets(userId),
      ]);

      const valueRealized = {
        billsTracked: bills.length,
        expensesLogged: expenses.length,
        budgetsCreated: budgets.length,
        estimatedSavings: bills.length * 5 + expenses.length * 2, // Rough estimate
      };

      res.json({
        daysSinceSignup,
        trialDaysRemaining: Math.max(0, 14 - daysSinceSignup),
        isTrialExpired: daysSinceSignup > 14,
        currentPhase: currentPhase || null,
        valueRealized,
        showConversionModal: currentPhase !== null,
        isPremium: user.isPremium === "true",
      });
    } catch (error) {
      console.error("Error getting trial status:", error);
      res.status(500).json({ error: "Failed to get trial status" });
    }
  });

  // Log trial event
  app.post("/api/trial/events", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { eventType, eventData } = req.body;

      const event = await storage.createTrialEvent({
        userId,
        eventType,
        eventData: eventData || null,
        occurredAt: new Date(),
      });

      res.json(event);
    } catch (error) {
      console.error("Error dismissing leak alert:", error);
      res.status(500).json({ error: "Failed to dismiss alert" });
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

  // ============ AI INSIGHTS ============

  app.get("/api/ai/insights", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
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
      const { id } = req.params;
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
      const { id } = req.params;
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

  // ============ TRANSACTION ANOMALIES ============

  app.get("/api/anomalies", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const includeReviewed = req.query.includeReviewed === "true";

      const anomalies = await storage.getTransactionAnomalies(userId, {
        includeReviewed,
      });

      res.json(anomalies);
    } catch (error) {
      console.error("Error fetching anomalies:", error);
      res.status(500).json({ error: "Failed to fetch anomalies" });
    }
  });

  app.post("/api/anomalies/:id/review", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
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

  // ============ AI AUTO-RECONCILIATION ============

  app.post("/api/plaid/transactions/auto-reconcile", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      
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
        storage.getIncomes(),
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

  // ============ REFERRAL PROGRAM ============

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
      const referralTransporter = getContactTransporter();
      if (fromEmail && referralTransporter) {
        await referralTransporter.sendMail({
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
  app.post("/api/accounts/manual", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const userId = req.session.userId!;
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
      const accountId = req.params.id;
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
      const accountId = req.params.id;
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
      const accountId = req.params.accountId;
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
  app.post("/api/transactions/manual", requireAuth, requireWriteAccess, async (req, res) => {
    try {
      const userId = req.session.userId!;
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
      const transactionId = req.params.id;
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
      const transactionId = req.params.id;
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
      const accountId = req.params.accountId;
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
            category: row.category || null,
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

  // ============ INVESTMENT ACCOUNTS API ============

  app.get("/api/investment-accounts", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const accounts = await storage.getInvestmentAccounts(userId);
      res.json(accounts);
    } catch (error) {
      console.error("Error fetching investment accounts:", error);
      res.status(500).json({ error: "Failed to fetch investment accounts" });
    }
  });

  app.get("/api/investment-accounts/:id", requireAuth, async (req, res) => {
    try {
      const account = await storage.getInvestmentAccount(req.params.id);
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
      const existing = await storage.getInvestmentAccount(req.params.id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ error: "Investment account not found" });
      }
      const data = updateInvestmentAccountSchema.parse(req.body);
      const account = await storage.updateInvestmentAccount(req.params.id, data);
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
      const existing = await storage.getInvestmentAccount(req.params.id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ error: "Investment account not found" });
      }

      // Also delete any holdings associated with this account
      const accountHoldings = await storage.getHoldings(req.params.id);
      for (const holding of accountHoldings) {
        await storage.deleteHolding(holding.id);
      }

      await storage.deleteInvestmentAccount(req.params.id);
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
      const account = await storage.getInvestmentAccount(req.params.accountId);
      if (!account || account.userId !== req.session.userId) {
        return res.status(404).json({ error: "Investment account not found" });
      }
      const holdings = await storage.getHoldings(req.params.accountId);
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
      const existing = await storage.getHolding(req.params.id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ error: "Holding not found" });
      }
      const data = updateHoldingSchema.parse(req.body);
      const holding = await storage.updateHolding(req.params.id, data);
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
      const existing = await storage.getHolding(req.params.id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ error: "Holding not found" });
      }
      await storage.deleteHolding(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete holding" });
    }
  });

  // ============ STOCK DATA & AI ADVISOR API ============

  // Get real-time stock quote
  app.get("/api/stocks/:symbol/quote", requireAuth, async (req, res) => {
    try {
      const quote = await getStockQuote(req.params.symbol.toUpperCase());
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
      const analysis = await getStockAnalysis(req.params.symbol.toUpperCase());
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
      const stockSymbols = [...new Set(
        holdings
          .filter(h => h.holdingType !== "crypto")
          .map(h => h.symbol)
      )];

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

  // Get AI portfolio analysis
  app.get("/api/investments/analysis", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const analysis = await analyzePortfolio(userId);

      if (!analysis) {
        return res.json({ message: "No holdings to analyze" });
      }

      res.json(analysis);
    } catch (error) {
      console.error("Error analyzing portfolio:", error);
      res.status(500).json({ error: "Failed to analyze portfolio" });
    }
  });

  // Get detailed AI analysis for a specific holding
  app.get("/api/holdings/:id/ai-analysis", requireAuth, async (req, res) => {
    try {
      const holding = await storage.getHolding(req.params.id);
      if (!holding || holding.userId !== req.session.userId) {
        return res.status(404).json({ error: "Holding not found" });
      }

      // First get the basic analysis
      const analysis = await getStockAnalysis(holding.symbol);
      const summary = analysis ? generateAnalysisSummary(analysis) : "Technical data unavailable";

      const currentPrice = analysis?.quote?.price || parseFloat(holding.currentPrice || "0");
      const costBasis = parseFloat(holding.costBasis || "0");
      const quantity = parseFloat(holding.quantity);
      const currentValue = currentPrice * quantity;

      const holdingAnalysis = {
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
        recommendation: "hold" as const,
        reasoning: "",
        riskLevel: "medium" as const,
        confidence: 50,
      };

      const detailedAnalysis = await getDetailedHoldingAnalysis(holding, holdingAnalysis);

      res.json({
        holding: holdingAnalysis,
        technicalData: analysis,
        aiAnalysis: detailedAnalysis,
      });
    } catch (error) {
      console.error("Error getting holding analysis:", error);
      res.status(500).json({ error: "Failed to analyze holding" });
    }
  });

  // Ask AI investment advisor a question
  app.post("/api/investments/ask-advisor", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { question } = req.body;

      if (!question || typeof question !== "string") {
        return res.status(400).json({ error: "Question is required" });
      }

      // Get portfolio context for better answers
      const portfolioAnalysis = await analyzePortfolio(userId);
      const advice = await getInvestmentAdvice(userId, question, portfolioAnalysis || undefined);

      res.json({ advice, portfolioContext: portfolioAnalysis ? true : false });
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
        accountType,
        institution: plaidAccount.officialName || plaidAccount.name || undefined,
        accountNumber: plaidAccount.mask || plaidAccount.accountId.slice(-4),
        balance: plaidAccount.currentBalance || "0",
        notes: `Linked from Plaid account: ${plaidAccount.accountId}`,
      });

      res.status(201).json(investmentAccount);
    } catch (error) {
      console.error("Error importing from Plaid:", error);
      res.status(500).json({ error: "Failed to import account" });
    }
  });

  // Get Plaid accounts that can be linked as investment accounts
  app.get("/api/investment-accounts/linkable-plaid-accounts", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const plaidAccounts = await storage.getAllPlaidAccounts(userId);

      // Filter for investment-type accounts or any that user might want to track
      const investmentTypes = ["investment", "brokerage", "other"];
      const investmentSubtypes = ["401k", "401a", "403b", "457b", "ira", "roth", "rrsp", "tfsa", "brokerage", "non-taxable brokerage", "pension"];

      const linkableAccounts = plaidAccounts.filter(acc => {
        const type = (acc.type || "").toLowerCase();
        const subtype = (acc.subtype || "").toLowerCase();
        return investmentTypes.includes(type) ||
          investmentSubtypes.some(st => subtype.includes(st)) ||
          subtype.includes("investment");
      });

      // Get already linked account IDs
      const existingAccounts = await storage.getInvestmentAccounts(userId);
      const linkedPlaidIds = existingAccounts
        .filter(a => a.notes?.includes("Linked from Plaid"))
        .map(a => a.notes?.match(/Linked from Plaid account: ([^\s]+)/)?.[1])
        .filter(Boolean);

      const availableAccounts = linkableAccounts.map(acc => ({
        ...acc,
        isLinked: linkedPlaidIds.includes(acc.accountId),
      }));

      res.json(availableAccounts);
    } catch (error) {
      console.error("Error fetching linkable accounts:", error);
      res.status(500).json({ error: "Failed to fetch accounts" });
    }
  });

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
      const asset = await storage.getAsset(req.params.id);
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
      const existing = await storage.getAsset(req.params.id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ error: "Asset not found" });
      }
      const data = updateAssetSchema.parse(req.body);

      // If value changed, record history
      if (data.currentValue && data.currentValue !== existing.currentValue) {
        await storage.createAssetValueHistory({
          assetId: req.params.id,
          date: new Date().toISOString().split('T')[0],
          value: data.currentValue,
          notes: "Value update",
        });
      }

      const asset = await storage.updateAsset(req.params.id, data);
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
      const existing = await storage.getAsset(req.params.id);
      if (!existing || existing.userId !== req.session.userId) {
        return res.status(404).json({ error: "Asset not found" });
      }
      await storage.deleteAsset(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete asset" });
    }
  });

  app.get("/api/assets/:id/history", requireAuth, async (req, res) => {
    try {
      const asset = await storage.getAsset(req.params.id);
      if (!asset || asset.userId !== req.session.userId) {
        return res.status(404).json({ error: "Asset not found" });
      }
      const history = await storage.getAssetValueHistory(req.params.id);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch asset history" });
    }
  });

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

      // Plaid accounts (checking, savings = cash; credit = liability)
      // Only include explicitly active accounts (isActive === "true")
      for (const acc of plaidAccounts.filter(a => a.isActive === "true")) {
        const balance = parseFloat(acc.currentBalance || "0");
        if (acc.type === "depository") {
          cashAndBank += balance;
        } else if (acc.type === "credit") {
          creditCards += Math.abs(balance);
        } else if (acc.type === "loan") {
          loans += Math.abs(balance);
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
      // Only include explicitly active debts (isActive === "true")
      for (const debt of debtDetails.filter(d => d.isActive === "true")) {
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
      for (const acc of plaidAccounts.filter(a => a.isActive === "true")) {
        const balance = parseFloat(acc.currentBalance || "0");
        if (acc.type === "depository") cashAndBank += balance;
        else if (acc.type === "credit") creditCards += Math.abs(balance);
        else if (acc.type === "loan") loans += Math.abs(balance);
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

      // Only include explicitly active debts (isActive === "true")
      for (const debt of debtDetails.filter(d => d.isActive === "true")) {
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

  app.post("/api/split-expenses", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
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
      const existing = await storage.getSplitExpense(req.params.id);
      if (!existing || existing.householdId !== householdId) {
        return res.status(404).json({ error: "Split expense not found" });
      }

      const data = updateSplitExpenseSchema.parse(req.body);
      const split = await storage.updateSplitExpense(req.params.id, data);
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
      const existing = await storage.getSplitExpense(req.params.id);
      if (!existing || existing.householdId !== householdId) {
        return res.status(404).json({ error: "Split expense not found" });
      }

      await storage.deleteSplitExpense(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete split expense" });
    }
  });

  // Mark participant as paid
  app.patch("/api/split-participants/:id/pay", requireAuth, async (req, res) => {
    try {
      const participant = await storage.updateSplitParticipant(req.params.id, {
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

  // ============ TAX TAGGING API ============

  app.get("/api/tax/categories", requireAuth, (req, res) => {
    res.json(TAX_CATEGORIES);
  });

  app.get("/api/tax/summary", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
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
      const session = await storage.getSalesChatSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const messages = await storage.getSalesChatMessages(req.params.id);
      const lead = await storage.getSalesLeadBySession(req.params.id);

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

      const lead = await storage.updateSalesLead(req.params.id, { status, notes });
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      res.json(lead);
    } catch (error) {
      console.error("Error updating sales lead:", error);
      res.status(500).json({ error: "Failed to update lead" });
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
      const setting = await storage.upsertLandingSetting(req.params.key, value, type);
      res.json(setting);
    } catch (error) {
      console.error("Error updating landing setting:", error);
      res.status(500).json({ error: "Failed to update setting" });
    }
  });

  app.delete("/api/admin/landing/settings/:key", requireAdmin, async (req, res) => {
    try {
      const success = await storage.deleteLandingSetting(req.params.key);
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
      const feature = await storage.updateLandingFeature(req.params.id, req.body);
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
      const success = await storage.deleteLandingFeature(req.params.id);
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
      const testimonial = await storage.updateLandingTestimonial(req.params.id, req.body);
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
      const success = await storage.deleteLandingTestimonial(req.params.id);
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
      const pricing = await storage.updateLandingPricing(req.params.id, req.body);
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
      const success = await storage.deleteLandingPricing(req.params.id);
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
      const row = await storage.updateLandingComparison(req.params.id, req.body);
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
      const success = await storage.deleteLandingComparison(req.params.id);
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
      const faq = await storage.updateLandingFaq(req.params.id, req.body);
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
      const success = await storage.deleteLandingFaq(req.params.id);
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
      const annotation = await storage.updateVideoAnnotation(req.params.id, req.body);
      res.json(annotation);
    } catch (error) {
      console.error("Error updating video annotation:", error);
      res.status(500).json({ error: "Failed to update video annotation" });
    }
  });

  app.delete("/api/admin/landing/video-annotations/:id", requireAdmin, async (req, res) => {
    try {
      const success = await storage.deleteVideoAnnotation(req.params.id);
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

      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
      const successUrl = `${baseUrl}/dashboard?subscription=success`;
      const cancelUrl = `${baseUrl}/pricing?subscription=canceled`;

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

      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
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

      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
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
        return res.json({ synced: false, reason: "No Stripe customer ID" });
      }

      const { stripe } = await import("./stripe");

      // List subscriptions for this customer
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: "all",
        limit: 1,
      });

      if (subscriptions.data.length === 0) {
        return res.json({ synced: false, reason: "No subscriptions found" });
      }

      const subscription = subscriptions.data[0] as any;

      // Get planId from subscription metadata or use null
      const planId = subscription.metadata?.planId || null;

      // Update user's subscription info
      await storage.updateUserStripeInfo(userId, {
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        subscriptionPlanId: planId,
        trialEndsAt: subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null,
        subscriptionEndsAt: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
      });

      console.log(`Synced subscription for user ${userId}: ${subscription.id} (${subscription.status})`);

      res.json({
        synced: true,
        subscriptionId: subscription.id,
        status: subscription.status,
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

  // Stripe webhook endpoint (must use raw body)
  app.post("/api/stripe/webhook", async (req, res) => {
    try {
      const sig = req.headers["stripe-signature"];
      if (!sig) {
        console.error("Stripe webhook: Missing stripe-signature header");
        return res.status(400).json({ error: "Missing stripe-signature header" });
      }

      // Check if webhook secret is configured
      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        console.error("Stripe webhook: STRIPE_WEBHOOK_SECRET not configured");
        return res.status(500).json({ error: "Webhook secret not configured" });
      }

      const { constructWebhookEvent, handleWebhookEvent } = await import("./stripe");

      // Get the raw body - Express needs raw body for webhook verification
      const rawBody = (req as any).rawBody || req.body;

      if (!rawBody) {
        console.error("Stripe webhook: No raw body available for verification");
        return res.status(400).json({ error: "No request body" });
      }

      try {
        const event = constructWebhookEvent(rawBody, sig as string);
        console.log(`Stripe webhook received: ${event.type} (${event.id})`);
        await handleWebhookEvent(event);
        console.log(`Stripe webhook processed successfully: ${event.type}`);
        res.json({ received: true });
      } catch (err: any) {
        console.error("Webhook signature verification failed:", err.message);
        console.error("Webhook secret starts with:", process.env.STRIPE_WEBHOOK_SECRET?.substring(0, 10) + "...");
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
      }
    } catch (error: any) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: error.message || "Webhook processing failed" });
    }
  });

  return httpServer;
}
