import type { Bill, Expense, Income, PlaidTransaction } from "@shared/schema";

// Convert dollar amount string to integer cents to avoid floating point errors
function toCents(amount: string | number): number {
  return Math.round(parseFloat(String(amount)) * 100);
}

// Convert cents back to dollars (as number with two decimal places)
function toDollars(cents: number): number {
  return Math.round(cents) / 100;
}

export interface MatchResult {
  matchType: "bill" | "expense" | "income" | "unmatched";
  matchedId?: string;
  confidence: "high" | "medium" | "low";
  personalCategory: string;
}

// Plaid category to Budget Smart AI category mapping
const PLAID_TO_EXPENSE_CATEGORY: Record<string, string> = {
  "FOOD_AND_DRINK": "Restaurant & Bars",
  "FOOD_AND_DRINK_GROCERIES": "Groceries",
  "FOOD_AND_DRINK_RESTAURANTS": "Restaurant & Bars",
  "FOOD_AND_DRINK_COFFEE": "Coffee Shops",
  "FOOD_AND_DRINK_FAST_FOOD": "Restaurant & Bars",
  "TRANSPORTATION": "Transportation",
  "TRANSPORTATION_GAS": "Gas",
  "TRANSPORTATION_PARKING": "Parking & Tolls",
  "TRANSPORTATION_PUBLIC_TRANSIT": "Public Transit",
  "TRANSPORTATION_TAXIS_AND_RIDE_SHARES": "Taxi & Ride Share",
  "TRAVEL": "Travel",
  "TRAVEL_FLIGHTS": "Travel",
  "TRAVEL_LODGING": "Travel",
  "SHOPPING": "Shopping",
  "ENTERTAINMENT": "Entertainment",
  "ENTERTAINMENT_MUSIC": "Entertainment",
  "ENTERTAINMENT_MOVIES": "Entertainment",
  "ENTERTAINMENT_GAMES": "Entertainment",
  "MEDICAL": "Healthcare",
  "HEALTHCARE": "Healthcare",
  "EDUCATION": "Education",
  "RECREATION_FITNESS": "Fitness",
  "RECREATION_GYMS_AND_FITNESS_CENTERS": "Fitness",
  "RENT_AND_UTILITIES": "Utilities",
  "RENT_AND_UTILITIES_RENT": "Rent",
  "RENT_AND_UTILITIES_ELECTRICITY": "Electrical",
  "RENT_AND_UTILITIES_GAS": "Utilities",
  "RENT_AND_UTILITIES_INTERNET_AND_CABLE": "Internet",
  "RENT_AND_UTILITIES_TELEPHONE": "Phone",
  "RENT_AND_UTILITIES_WATER": "Utilities",
  "LOAN_PAYMENTS": "Loans",
  "LOAN_PAYMENTS_MORTGAGE_PAYMENT": "Mortgage",
  "LOAN_PAYMENTS_CAR_PAYMENT": "Car",
  "INSURANCE": "Insurance",
  "TRANSFER_CREDIT_CARD_PAYMENT": "Credit Card",
  "PERSONAL_CARE": "Other",
  "GENERAL_SERVICES": "Other",
  "GOVERNMENT_AND_NON_PROFIT": "Other",
  "HOME_IMPROVEMENT": "Maintenance",
  "GENERAL_MERCHANDISE": "Shopping",
  "BANK_FEES": "Other",
  "BANK_FEES_ATM_FEES": "Other",
  "BANK_FEES_OVERDRAFT_FEES": "Other",
};

const PLAID_TO_INCOME_CATEGORY: Record<string, string> = {
  "INCOME": "Salary",
  "INCOME_DIVIDENDS": "Investments",
  "INCOME_INTEREST_EARNED": "Investments",
  "INCOME_WAGES": "Salary",
  // UAT-17 (2026-05-01): Plaid Canadian payroll returns INCOME_SALARY.
  "INCOME_SALARY": "Salary",
  "TRANSFER_DEPOSIT": "Other",
};

export function mapPlaidCategory(plaidCategory: string | null, isIncome: boolean): string {
  if (!plaidCategory) return "Other";

  const normalized = plaidCategory.toUpperCase().replace(/[^A-Z_]/g, "_");

  if (isIncome) {
    // Check income categories first
    for (const [key, value] of Object.entries(PLAID_TO_INCOME_CATEGORY)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return value;
      }
    }
    return "Other";
  }

  // Check expense categories
  // Try exact match first
  if (PLAID_TO_EXPENSE_CATEGORY[normalized]) {
    return PLAID_TO_EXPENSE_CATEGORY[normalized];
  }

  // Try partial match
  for (const [key, value] of Object.entries(PLAID_TO_EXPENSE_CATEGORY)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }

  return "Other";
}

function normalizeString(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stringSimilarity(a: string, b: string): number {
  const normA = normalizeString(a);
  const normB = normalizeString(b);

  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.8;

  // Simple character overlap score
  const charsA = normA.split("");
  const charsB = normB.split("");
  const setA = new Set(charsA);
  const setB = new Set(charsB);
  let intersection = 0;
  charsA.forEach(c => { if (setB.has(c)) intersection++; });
  const unionSize = new Set(charsA.concat(charsB)).size;
  return intersection / unionSize;
}

function amountMatch(transactionAmountCents: number, targetAmountCents: number, tolerance: number = 0.05): boolean {
  const diff = Math.abs(transactionAmountCents - targetAmountCents);
  return diff <= targetAmountCents * tolerance;
}

function dateProximity(transactionDate: string, dueDay: number): boolean {
  const txDate = new Date(transactionDate);
  const txDay = txDate.getDate();
  const diff = Math.abs(txDay - dueDay);
  return diff <= 5 || diff >= 26; // Within 5 days, accounting for month boundaries
}

export function reconcileTransaction(
  transaction: { amount: string; date: string; name: string; merchantName: string | null; category?: string | null },
  bills: Bill[],
  expenses: Expense[],
  incomes: Income[]
): MatchResult {
  const amountCents = toCents(transaction.amount);
  const isCredit = amountCents < 0; // Negative in Plaid = money coming in
  const txAmountCents = Math.abs(amountCents);
  const txName = transaction.merchantName || transaction.name;

  // If it's a credit (income)
  if (isCredit) {
    return matchIncome(txAmountCents, transaction.date, txName, transaction.category, incomes);
  }

  // For debits, try matching bills first, then expenses
  const billMatch = matchBill(txAmountCents, transaction.date, txName, bills);
  if (billMatch.matchType === "bill") {
    return billMatch;
  }

  const expenseMatch = matchExpense(txAmountCents, transaction.date, txName, expenses);
  if (expenseMatch.matchType === "expense") {
    return expenseMatch;
  }

  // No match found - categorize as "Other Expense"
  const personalCategory = mapPlaidCategory(transaction.category, false);
  return {
    matchType: "unmatched",
    confidence: "low",
    personalCategory,
  };
}

function matchBill(txAmountCents: number, txDate: string, txName: string, bills: Bill[]): MatchResult {
  let bestMatch: { bill: Bill; score: number } | null = null;

  for (const bill of bills) {
    const billAmountCents = toCents(bill.amount);
    let score = 0;

    // Amount match (required - within 5% tolerance)
    if (!amountMatch(txAmountCents, billAmountCents)) continue;
    score += 3;

    // Name similarity
    const similarity = stringSimilarity(txName, bill.name);
    if (similarity >= 0.8) score += 3;
    else if (similarity >= 0.4) score += 1;

    // Date proximity to due day
    if (bill.dueDay && dateProximity(txDate, bill.dueDay)) {
      score += 2;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { bill, score };
    }
  }

  if (bestMatch) {
    let confidence: "high" | "medium" | "low";
    if (bestMatch.score >= 7) confidence = "high";
    else if (bestMatch.score >= 5) confidence = "medium";
    else confidence = "low";

    // Only auto-match on high confidence
    if (confidence === "high" || confidence === "medium") {
      return {
        matchType: "bill",
        matchedId: bestMatch.bill.id,
        confidence,
        personalCategory: "Other",
      };
    }
  }

  return { matchType: "unmatched", confidence: "low", personalCategory: "Other" };
}

function matchExpense(txAmountCents: number, txDate: string, txName: string, expenses: Expense[]): MatchResult {
  for (const expense of expenses) {
    const expAmountCents = toCents(expense.amount);

    // Must match amount exactly or within 1%
    if (!amountMatch(txAmountCents, expAmountCents, 0.01)) continue;

    // Must match date exactly
    if (expense.date !== txDate) continue;

    // Name similarity helps but isn't required since amount+date is strong
    const similarity = stringSimilarity(txName, expense.merchant);

    return {
      matchType: "expense",
      matchedId: expense.id,
      confidence: similarity >= 0.5 ? "high" : "medium",
      personalCategory: "Other",
    };
  }

  return { matchType: "unmatched", confidence: "low", personalCategory: "Other" };
}

function matchIncome(txAmountCents: number, txDate: string, txName: string, category: string | null, incomes: Income[]): MatchResult {
  let bestMatch: { income: Income; score: number } | null = null;

  for (const inc of incomes) {
    const incAmountCents = toCents(inc.amount);
    let score = 0;

    // Amount match within 5%
    if (!amountMatch(txAmountCents, incAmountCents)) continue;
    score += 3;

    // Source name similarity
    const similarity = stringSimilarity(txName, inc.source);
    if (similarity >= 0.6) score += 3;
    else if (similarity >= 0.3) score += 1;

    // Date match
    if (inc.date === txDate) score += 2;

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { income: inc, score };
    }
  }

  if (bestMatch && bestMatch.score >= 5) {
    return {
      matchType: "income",
      matchedId: bestMatch.income.id,
      confidence: bestMatch.score >= 7 ? "high" : "medium",
      personalCategory: "Other",
    };
  }

  const personalCategory = mapPlaidCategory(category, true);
  return {
    matchType: "unmatched",
    confidence: "low",
    personalCategory,
  };
}
