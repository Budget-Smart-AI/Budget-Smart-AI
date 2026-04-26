import type { Request, Response, NextFunction, Express } from "express";
import bcrypt from "bcrypt";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import crypto from "crypto";
import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import { storage } from "./storage";
import { sendWelcomeEmail } from "./email";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    username?: string;
    mfaVerified?: boolean;
    pendingMfa?: boolean;
    isAdmin?: boolean;
    // Household collaboration
    householdId?: string;
    householdRole?: "owner" | "member" | "advisor";
  }
}

const SALT_ROUNDS = 12;
const APP_NAME = "BudgetSmart";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateMfaSecretKey(): string {
  const totp = new OTPAuth.TOTP({
    issuer: APP_NAME,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
  return totp.secret.base32;
}

export function verifyMfaToken(secret: string, token: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: APP_NAME,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token, window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}

export async function generateMfaQrCode(username: string, secret: string): Promise<string> {
  const totp = new OTPAuth.TOTP({
    issuer: APP_NAME,
    label: username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return QRCode.toDataURL(totp.toString());
}

/** Generate 8 cryptographically random alphanumeric backup codes (8 chars each). */
export function generateBackupCodes(): string[] {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => chars[crypto.randomInt(chars.length)]).join("")
  );
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (req.session.pendingMfa && !req.session.mfaVerified) {
    return res.status(401).json({ error: "MFA verification required", mfaRequired: true });
  }

  // For demo users, block all write operations (POST, PUT, PATCH, DELETE)
  // Only allow GET requests for demo accounts
  const isWriteOperation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (isWriteOperation) {
    // Check session first for performance
    if ((req.session as any).isDemo) {
      return res.status(403).json({ error: "Demo account is read-only. Sign up for full access!" });
    }
    // Also verify from DB for security
    const user = await storage.getUser(req.session.userId);
    if (user?.isDemo === "true") {
      return res.status(403).json({ error: "Demo account is read-only. Sign up for full access!" });
    }
  }

  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (req.session.pendingMfa && !req.session.mfaVerified) {
    return res.status(401).json({ error: "MFA verification required", mfaRequired: true });
  }

  const user = await storage.getUser(req.session.userId);
  if (!user || user.isAdmin !== "true") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// Require write access - advisors and demo users have read-only access
export async function requireWriteAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (req.session.pendingMfa && !req.session.mfaVerified) {
    return res.status(401).json({ error: "MFA verification required", mfaRequired: true });
  }

  // If user is in a household as an advisor, they can only read
  if (req.session.householdRole === "advisor") {
    return res.status(403).json({ error: "Advisors have read-only access" });
  }

  // Demo users have read-only access
  if ((req.session as any).isDemo) {
    return res.status(403).json({ error: "Demo account is read-only. Sign up for full access!" });
  }

  // Also check the database for demo flag
  const user = await storage.getUser(req.session.userId);
  if (user?.isDemo === "true") {
    return res.status(403).json({ error: "Demo account is read-only. Sign up for full access!" });
  }

  next();
}

// Helper to load household info into session after login
export async function loadHouseholdIntoSession(req: Request): Promise<void> {
  if (!req.session.userId) return;

  const household = await storage.getHouseholdByUserId(req.session.userId);
  if (household) {
    req.session.householdId = household.id;
    const member = await storage.getHouseholdMember(household.id, req.session.userId);
    if (member) {
      req.session.householdRole = member.role as "owner" | "member" | "advisor";
    }
  } else {
    req.session.householdId = undefined;
    req.session.householdRole = undefined;
  }
}

export async function initializeUser(): Promise<void> {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.USER_PASSWORD;

  if (!username || !password) {
    console.error(
      "[SECURITY] ADMIN_USERNAME and USER_PASSWORD must be set via environment variables. " +
      "Skipping admin user creation to prevent insecure defaults. " +
      "Set both variables in Railway and restart."
    );
    // Still initialize the demo user even if admin setup is skipped
    await initializeDemoUser();
    return;
  }

  const existingUser = await storage.getUserByUsername(username);
  if (!existingUser) {
    const hashedPassword = await hashPassword(password);
    await storage.createUser({ 
      username, 
      password: hashedPassword, 
      isAdmin: true, 
      isApproved: true,
      emailVerified: "true" // Admin users are pre-verified
    });
    console.log(`Created admin user: ${username}`);
  } else if (existingUser.emailVerified !== "true" && existingUser.isAdmin === "true") {
    // Fix existing admin users that weren't verified
    await storage.updateUser(existingUser.id, { emailVerified: "true" });
    console.log(`Fixed email verification for admin user: ${username}`);
  }

  // Initialize demo user for Try Demo feature
  await initializeDemoUser();
}

async function initializeDemoUser(): Promise<void> {
  const demoPassword = process.env.DEMO_PASSWORD;
  if (!demoPassword) {
    console.warn("[SECURITY] DEMO_PASSWORD is not set — skipping demo user creation.");
    return;
  }

  const demoUsername = "demo";
  const existingDemo = await storage.getUserByUsername(demoUsername);
  
  if (!existingDemo) {
    const hashedPassword = await hashPassword(demoPassword);
    // Use direct SQL for demo user creation since we need special fields like isDemo
    const { db } = await import("./db");
    const { users } = await import("@shared/schema");
    
    await db.insert(users).values({
      id: "demo-user-001",
      username: demoUsername,
      password: hashedPassword,
      firstName: "Alex",
      lastName: "Thompson",
      email: "demo@budgetsmart.io",
      isAdmin: "false",
      isApproved: "true",
      isDemo: "true",
      emailVerified: "true",
      subscriptionStatus: "active",
      subscriptionPlanId: "Family"
    }).onConflictDoNothing();
    
    console.log("Created demo user account");
    
    // Create sample demo data
    await createDemoData();
  } else {
    // Fix isDemo flag if missing
    if (existingDemo.isDemo !== "true") {
      const { db } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      await db.update(users).set({ isDemo: "true" }).where(eq(users.id, existingDemo.id));
      console.log("Fixed isDemo flag for demo user");
    }
    
    // Check if demo data is missing and create it if needed
    const demoAccounts = await storage.getManualAccounts("demo-user-001");
    if (demoAccounts.length === 0) {
      console.log("Demo user exists but data is missing - creating demo data...");
      await createDemoData();
    }
  }
}

async function createDemoData(): Promise<void> {
  const demoUserId = "demo-user-001";
  const currentMonth = new Date().toISOString().slice(0, 7); // Format: "2026-01"
  const today = new Date().toISOString().slice(0, 10); // Format: "2026-01-31"
  
  // Helper to generate past dates
  const daysAgo = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  };
  
  try {
    // Create sample income sources (using canonicalCategoryId)
    const incomes = [
      { userId: demoUserId, source: "Software Developer Salary", amount: "8500.00", date: today, canonicalCategoryId: "income_salary", isActive: "true", isRecurring: "true", recurrence: "monthly" as const },
      { userId: demoUserId, source: "Freelance Web Design", amount: "1500.00", date: today, canonicalCategoryId: "income_freelance", isActive: "true", isRecurring: "true", recurrence: "monthly" as const },
      { userId: demoUserId, source: "Investment Dividends", amount: "350.00", date: today, canonicalCategoryId: "income_investments", isActive: "true", isRecurring: "true", recurrence: "yearly" as const },
      { userId: demoUserId, source: "Rental Income", amount: "1200.00", date: today, canonicalCategoryId: "income_rental", isActive: "true", isRecurring: "true", recurrence: "monthly" as const },
      { userId: demoUserId, source: "Side Business Revenue", amount: "800.00", date: today, canonicalCategoryId: "income_business", isActive: "true", isRecurring: "true", recurrence: "monthly" as const }
    ];
    
    for (const income of incomes) {
      await storage.createIncome(income);
    }
    
    // Create comprehensive sample bills including many subscriptions
    const bills = [
      // Housing & Utilities
      { userId: demoUserId, name: "Apartment Rent", amount: "2200.00", dueDay: 1, canonicalCategoryId: "housing_rent", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "Electric Bill", amount: "145.00", dueDay: 15, canonicalCategoryId: "housing_utilities", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "Water & Sewer", amount: "65.00", dueDay: 20, canonicalCategoryId: "housing_utilities", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "Gas Bill", amount: "78.00", dueDay: 18, canonicalCategoryId: "housing_utilities", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "Internet Service", amount: "79.99", dueDay: 20, canonicalCategoryId: "housing_internet", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "Renters Insurance", amount: "32.00", dueDay: 1, canonicalCategoryId: "financial_insurance", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      
      // Transportation
      { userId: demoUserId, name: "Car Payment", amount: "450.00", dueDay: 10, canonicalCategoryId: "financial_loans", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "Car Insurance", amount: "185.00", dueDay: 5, canonicalCategoryId: "financial_insurance", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      
      // Insurance & Health
      { userId: demoUserId, name: "Health Insurance", amount: "320.00", dueDay: 1, canonicalCategoryId: "financial_insurance", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "Life Insurance", amount: "45.00", dueDay: 15, canonicalCategoryId: "financial_insurance", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      
      // Phone
      { userId: demoUserId, name: "Phone Bill (Verizon)", amount: "85.00", dueDay: 22, canonicalCategoryId: "housing_phone", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      
      // Streaming Subscriptions
      { userId: demoUserId, name: "Netflix", amount: "15.99", dueDay: 12, canonicalCategoryId: "lifestyle_subscriptions", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "Spotify Family", amount: "16.99", dueDay: 18, canonicalCategoryId: "lifestyle_subscriptions", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "Disney+", amount: "13.99", dueDay: 8, canonicalCategoryId: "lifestyle_subscriptions", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "HBO Max", amount: "15.99", dueDay: 14, canonicalCategoryId: "lifestyle_subscriptions", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "Amazon Prime", amount: "14.99", dueDay: 3, canonicalCategoryId: "lifestyle_subscriptions", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "YouTube Premium", amount: "13.99", dueDay: 25, canonicalCategoryId: "lifestyle_subscriptions", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "Apple iCloud+", amount: "2.99", dueDay: 7, canonicalCategoryId: "lifestyle_subscriptions", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "Hulu", amount: "17.99", dueDay: 16, canonicalCategoryId: "lifestyle_subscriptions", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      
      // Software & Tools
      { userId: demoUserId, name: "Microsoft 365", amount: "12.99", dueDay: 5, canonicalCategoryId: "lifestyle_subscriptions", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "Adobe Creative Cloud", amount: "54.99", dueDay: 11, canonicalCategoryId: "lifestyle_subscriptions", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "Dropbox Plus", amount: "11.99", dueDay: 19, canonicalCategoryId: "lifestyle_subscriptions", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "1Password", amount: "4.99", dueDay: 22, canonicalCategoryId: "lifestyle_subscriptions", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "ChatGPT Plus", amount: "20.00", dueDay: 9, canonicalCategoryId: "lifestyle_subscriptions", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      
      // Fitness & Wellness
      { userId: demoUserId, name: "Gym Membership (Equinox)", amount: "189.00", dueDay: 1, canonicalCategoryId: "health_fitness", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "Peloton App", amount: "12.99", dueDay: 6, canonicalCategoryId: "health_fitness", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "Headspace", amount: "12.99", dueDay: 21, canonicalCategoryId: "lifestyle_subscriptions", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      
      // Other
      { userId: demoUserId, name: "Student Loan Payment", amount: "285.00", dueDay: 28, canonicalCategoryId: "financial_loans", recurrence: "monthly" as const, isPaused: "false", autoDetected: false },
      { userId: demoUserId, name: "Credit Card (Chase Sapphire)", amount: "95.00", dueDay: 1, canonicalCategoryId: "uncategorized", recurrence: "yearly" as const, isPaused: "false", autoDetected: false }
    ];
    
    for (const bill of bills) {
      await storage.createBill(bill);
    }
    
    // Create sample budgets (using canonicalCategoryId)
    const budgets = [
      { userId: demoUserId, canonicalCategoryId: "food_groceries", amount: "700.00", month: currentMonth },
      { userId: demoUserId, canonicalCategoryId: "food_restaurants", amount: "400.00", month: currentMonth },
      { userId: demoUserId, canonicalCategoryId: "transport_public_transit", amount: "300.00", month: currentMonth },
      { userId: demoUserId, canonicalCategoryId: "lifestyle_entertainment", amount: "250.00", month: currentMonth },
      { userId: demoUserId, canonicalCategoryId: "lifestyle_shopping", amount: "400.00", month: currentMonth },
      { userId: demoUserId, canonicalCategoryId: "health_personal_care", amount: "150.00", month: currentMonth },
      { userId: demoUserId, canonicalCategoryId: "health_medical", amount: "200.00", month: currentMonth }
    ];
    
    for (const budget of budgets) {
      await storage.createBudget(budget);
    }
    
    // Create sample savings goals
    const savingsGoals = [
      { userId: demoUserId, name: "Emergency Fund", targetAmount: "25000.00", currentAmount: "12750.00", targetDate: "2026-12-31" },
      { userId: demoUserId, name: "Hawaii Vacation", targetAmount: "8000.00", currentAmount: "3440.00", targetDate: "2026-08-15" },
      { userId: demoUserId, name: "New Car Down Payment", targetAmount: "15000.00", currentAmount: "6200.00", targetDate: "2027-03-31" },
      { userId: demoUserId, name: "Home Down Payment", targetAmount: "60000.00", currentAmount: "18500.00", targetDate: "2028-06-01" },
      { userId: demoUserId, name: "Wedding Fund", targetAmount: "20000.00", currentAmount: "4800.00", targetDate: "2027-09-15" }
    ];
    
    for (const goal of savingsGoals) {
      await storage.createSavingsGoal(goal);
    }
    
    // Create manual bank account (Primary Checking)
    const checkingAccount = await storage.createManualAccount({
      userId: demoUserId,
      name: "Chase Primary Checking",
      type: "cash",
      balance: "8456.32",
      currency: "USD"
    });
    
    // Create second manual account (Savings)
    const savingsAccount = await storage.createManualAccount({
      userId: demoUserId,
      name: "Chase Savings",
      type: "cash",
      balance: "15230.00",
      currency: "USD"
    });
    
    // Create PayPal account
    const paypalAccount = await storage.createManualAccount({
      userId: demoUserId,
      name: "PayPal Balance",
      type: "paypal",
      balance: "342.50",
      currency: "USD"
    });
    
    // Create sample transactions for checking account
    const checkingTransactions = [
      // Recent income (use "Other" category for income deposits)
      { accountId: checkingAccount.id, userId: demoUserId, amount: "8500.00", date: daysAgo(2), merchant: "Employer Direct Deposit", category: "Other" as const, notes: "January salary" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "1500.00", date: daysAgo(5), merchant: "Client Payment - Web Design", category: "Other" as const, notes: "Freelance project" },
      
      // Groceries
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-156.34", date: daysAgo(1), merchant: "Whole Foods Market", category: "Groceries" as const, notes: "" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-89.23", date: daysAgo(4), merchant: "Trader Joe's", category: "Groceries" as const, notes: "" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-234.56", date: daysAgo(8), merchant: "Costco Wholesale", category: "Groceries" as const, notes: "Monthly stock up" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-45.67", date: daysAgo(12), merchant: "Safeway", category: "Groceries" as const, notes: "" },
      
      // Restaurants & Food
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-78.45", date: daysAgo(1), merchant: "The Cheesecake Factory", category: "Restaurant & Bars" as const, notes: "Dinner with friends" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-15.99", date: daysAgo(2), merchant: "Chipotle Mexican Grill", category: "Restaurant & Bars" as const, notes: "" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-42.30", date: daysAgo(3), merchant: "DoorDash", category: "Restaurant & Bars" as const, notes: "Sushi delivery" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-6.45", date: daysAgo(3), merchant: "Starbucks", category: "Coffee Shops" as const, notes: "" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-5.75", date: daysAgo(5), merchant: "Starbucks", category: "Coffee Shops" as const, notes: "" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-95.00", date: daysAgo(7), merchant: "Ruth's Chris Steak House", category: "Restaurant & Bars" as const, notes: "Anniversary dinner" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-28.50", date: daysAgo(10), merchant: "Uber Eats", category: "Restaurant & Bars" as const, notes: "" },
      
      // Transportation
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-58.45", date: daysAgo(2), merchant: "Shell Gas Station", category: "Gas" as const, notes: "" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-32.50", date: daysAgo(6), merchant: "Uber", category: "Taxi & Ride Share" as const, notes: "Airport ride" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-55.00", date: daysAgo(9), merchant: "Shell Gas Station", category: "Gas" as const, notes: "" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-15.00", date: daysAgo(14), merchant: "City Parking Garage", category: "Parking & Tolls" as const, notes: "" },
      
      // Shopping
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-129.99", date: daysAgo(3), merchant: "Amazon.com", category: "Shopping" as const, notes: "Electronics" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-85.00", date: daysAgo(5), merchant: "Target", category: "Shopping" as const, notes: "Household items" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-245.00", date: daysAgo(8), merchant: "Nordstrom", category: "Clothing" as const, notes: "Clothes" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-34.99", date: daysAgo(11), merchant: "Amazon.com", category: "Shopping" as const, notes: "Books" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-67.50", date: daysAgo(15), merchant: "Best Buy", category: "Shopping" as const, notes: "USB cables and accessories" },
      
      // Entertainment
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-24.99", date: daysAgo(4), merchant: "AMC Theatres", category: "Entertainment" as const, notes: "Movie tickets" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-59.99", date: daysAgo(7), merchant: "Ticketmaster", category: "Entertainment" as const, notes: "Concert tickets" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-14.99", date: daysAgo(12), merchant: "PlayStation Store", category: "Entertainment" as const, notes: "Game purchase" },
      
      // Health & Personal Care
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-45.00", date: daysAgo(6), merchant: "CVS Pharmacy", category: "Healthcare" as const, notes: "Prescriptions" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-75.00", date: daysAgo(10), merchant: "Great Clips", category: "Personal" as const, notes: "Haircut" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-28.99", date: daysAgo(13), merchant: "Ulta Beauty", category: "Personal" as const, notes: "" },
      
      // Bills (already paid this month)
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-2200.00", date: daysAgo(1), merchant: "Apartment Rent", category: "Mortgage" as const, notes: "February rent" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-145.00", date: daysAgo(15), merchant: "PG&E", category: "Electrical" as const, notes: "Electric bill" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-79.99", date: daysAgo(10), merchant: "Comcast Xfinity", category: "Communications" as const, notes: "Internet" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-450.00", date: daysAgo(20), merchant: "Toyota Financial", category: "Credit Card" as const, notes: "Car payment" },
      
      // ATM & Transfers
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-200.00", date: daysAgo(5), merchant: "Chase ATM Withdrawal", category: "Cash & ATM" as const, notes: "Cash" },
      { accountId: checkingAccount.id, userId: demoUserId, amount: "-500.00", date: daysAgo(3), merchant: "Transfer to Savings", category: "Other" as const, notes: "Monthly savings" }
    ];
    
    for (const tx of checkingTransactions) {
      await storage.createManualTransaction(tx);
    }
    
    // Create sample expenses (one-time purchases, using canonicalCategoryId)
    const expenses = [
      { userId: demoUserId, merchant: "Apple Store", amount: "1299.00", date: daysAgo(25), canonicalCategoryId: "lifestyle_shopping", notes: "New MacBook Pro" },
      { userId: demoUserId, merchant: "IKEA", amount: "456.00", date: daysAgo(18), canonicalCategoryId: "housing_furnishings", notes: "New desk and chair" },
      { userId: demoUserId, merchant: "REI", amount: "189.00", date: daysAgo(20), canonicalCategoryId: "lifestyle_shopping", notes: "Hiking gear" },
      { userId: demoUserId, merchant: "Home Depot", amount: "87.50", date: daysAgo(22), canonicalCategoryId: "housing_maintenance", notes: "Tools and supplies" },
      { userId: demoUserId, merchant: "Dentist Office", amount: "150.00", date: daysAgo(14), canonicalCategoryId: "health_medical", notes: "Dental cleaning" },
      { userId: demoUserId, merchant: "Auto Shop", amount: "245.00", date: daysAgo(28), canonicalCategoryId: "transport_auto_maintenance", notes: "Oil change and tire rotation" },
      { userId: demoUserId, merchant: "Farmers Insurance", amount: "185.00", date: daysAgo(5), canonicalCategoryId: "financial_insurance", notes: "Monthly car insurance" },
      { userId: demoUserId, merchant: "PetSmart", amount: "78.99", date: daysAgo(9), canonicalCategoryId: "lifestyle_pets", notes: "Dog food and treats" },
      { userId: demoUserId, merchant: "Airbnb", amount: "425.00", date: daysAgo(30), canonicalCategoryId: "travel_general", notes: "Weekend getaway deposit" },
      { userId: demoUserId, merchant: "Southwest Airlines", amount: "289.00", date: daysAgo(35), canonicalCategoryId: "travel_general", notes: "Flight to LA" }
    ];
    
    for (const expense of expenses) {
      await storage.createExpense(expense);
    }
    
    console.log("Created demo sample data (income, bills, budgets, savings goals, bank accounts, transactions, expenses)");
  } catch (error) {
    console.error("Error creating demo data:", error);
  }
}

// Google OAuth setup
export function setupGoogleOAuth(app: Express): void {
  const clientID = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    console.log("Google OAuth not configured - GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET missing");
    return;
  }

  // Determine callback URL based on environment
  const callbackURL = process.env.NODE_ENV === "production"
    ? "https://app.budgetsmart.io/api/auth/google/callback"
    : "/api/auth/google/callback";

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
        scope: ["profile", "email"],
      },
      async (
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: (error: any, user?: any) => void
      ) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value;
          const firstName = profile.name?.givenName;
          const lastName = profile.name?.familyName;

          // Check if user exists with this Google ID
          let user = await storage.getUserByGoogleId(googleId);

          if (user) {
            // User exists, return them
            return done(null, user);
          }

          // Check if user exists with same email
          if (email) {
            const existingEmailUser = await storage.getUserByEmail(email);
            if (existingEmailUser) {
              // Link Google account to existing user
              await storage.updateUser(existingEmailUser.id, { googleId });
              return done(null, existingEmailUser);
            }
          }

          // Create new user with Google account
          // Generate unique username from email or Google ID
          const baseUsername = email?.split("@")[0] || `user_${googleId.slice(0, 8)}`;
          let username = baseUsername;
          let counter = 1;

          // Ensure username is unique
          while (await storage.getUserByUsername(username)) {
            username = `${baseUsername}${counter}`;
            counter++;
          }

          user = await storage.createUser({
            username,
            password: null as any, // No password for OAuth users
            email: email || undefined,
            firstName: firstName || undefined,
            lastName: lastName || undefined,
            isApproved: true, // Auto-approve OAuth users
            googleId,
            emailVerified: "true", // Google OAuth verifies email
            mfaRequired: "false", // Google has built-in 2FA
          });

          // Send welcome email for new Google OAuth users (fire-and-forget)
          if (email) {
            sendWelcomeEmail(email, firstName || username)
              .catch(err => console.error('Failed to send welcome email for Google OAuth user:', err));
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  // Serialize user to session
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Initialize passport
  app.use(passport.initialize());
  app.use(passport.session());

  console.log("Google OAuth configured successfully");
}
