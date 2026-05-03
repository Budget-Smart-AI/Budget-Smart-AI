/**
 * Plaid Personal Finance Categories (PFC v1.0) → Monarch canonical category map.
 *
 * Plaid PFC has 16 primary categories and ~100 detailed categories. We map
 * detailed categories first (most specific) and fall back to primary if a
 * specific detailed name isn't recognised.
 *
 * Reference: https://plaid.com/docs/api/products/transactions/#categoriesget
 *
 * Naming convention from Plaid: PRIMARY_DETAILED (e.g.,
 * `FOOD_AND_DRINK_GROCERIES`, `TRANSFER_OUT_SAVINGS`).
 *
 * Mapping rules:
 *   - Always prefer a real Monarch category over "Uncategorized".
 *   - Where Plaid is more granular than Monarch, multiple PFC details map to
 *     one Monarch category (e.g. `FOOD_AND_DRINK_RESTAURANT`,
 *     `FOOD_AND_DRINK_FAST_FOOD`, `FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR` all
 *     → "Restaurants & Bars").
 *   - Where Monarch is more granular than Plaid, we pick the closest match
 *     and let user re-categorisation refine it.
 */

import type { MonarchCategoryDef } from "./monarch-categories";

/** Map from PFC detailed category (UPPERCASE_WITH_UNDERSCORES) → Monarch category name. */
export const PLAID_DETAILED_TO_MONARCH: Record<string, string> = {
  // ── INCOME ───────────────────────────────────────────────────────────────
  INCOME_DIVIDENDS: "Investment Income",
  INCOME_INTEREST_EARNED: "Interest",
  INCOME_RETIREMENT_PENSION: "Other Income",
  INCOME_TAX_REFUND: "Refunds & Returns",
  INCOME_UNEMPLOYMENT: "Other Income",
  INCOME_WAGES: "Paychecks",
  // UAT-17 (2026-05-01): Plaid's Canadian payroll feed returns INCOME_SALARY
  // (not in PFC v2 published list). Treat identically to INCOME_WAGES.
  // Plus the rest of the PFC v2 income subcategories that the original
  // map missed.
  INCOME_SALARY: "Paychecks",
  INCOME_MILITARY: "Paychecks",
  INCOME_BENEFITS: "Other Income",
  INCOME_GIG_ECONOMY: "Other Income",
  INCOME_RENTAL_INCOME: "Other Income",
  INCOME_CHILD_SUPPORT: "Other Income",
  INCOME_ALIMONY: "Other Income",
  INCOME_OTHER_INCOME: "Other Income",

  // ── TRANSFER_IN (kind: transfer; excluded from spending/income totals) ───
  TRANSFER_IN_CASH_ADVANCES_AND_LOANS: "Transfer",
  TRANSFER_IN_DEPOSIT: "Transfer",
  TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS: "Transfer",
  TRANSFER_IN_SAVINGS: "Transfer",
  TRANSFER_IN_ACCOUNT_TRANSFER: "Transfer",
  TRANSFER_IN_OTHER_TRANSFER_IN: "Transfer",

  // ── TRANSFER_OUT ────────────────────────────────────────────────────────
  TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS: "Transfer",
  TRANSFER_OUT_SAVINGS: "Transfer",
  TRANSFER_OUT_WITHDRAWAL: "Transfer",
  TRANSFER_OUT_ACCOUNT_TRANSFER: "Transfer",
  TRANSFER_OUT_OTHER_TRANSFER_OUT: "Transfer",

  // ── LOAN_PAYMENTS ───────────────────────────────────────────────────────
  LOAN_PAYMENTS_CAR_PAYMENT: "Auto Payment",
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: "Credit Card Payment",
  LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT: "Loan Repayment",
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: "Mortgage",
  LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT: "Student Loans",
  LOAN_PAYMENTS_OTHER_PAYMENT: "Loan Repayment",

  // ── BANK_FEES ───────────────────────────────────────────────────────────
  BANK_FEES_ATM_FEES: "Financial Fees",
  BANK_FEES_FOREIGN_TRANSACTION_FEES: "Financial Fees",
  BANK_FEES_INSUFFICIENT_FUNDS: "Financial Fees",
  BANK_FEES_INTEREST_CHARGE: "Financial Fees",
  BANK_FEES_OVERDRAFT_FEES: "Financial Fees",
  BANK_FEES_OTHER_BANK_FEES: "Financial Fees",

  // ── ENTERTAINMENT ───────────────────────────────────────────────────────
  ENTERTAINMENT_CASINOS_AND_GAMBLING: "Entertainment & Recreation",
  ENTERTAINMENT_MUSIC_AND_AUDIO: "Streaming Services",
  ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS: "Entertainment & Recreation",
  ENTERTAINMENT_TV_AND_MOVIES: "Streaming Services",
  ENTERTAINMENT_VIDEO_GAMES: "Digital Media",
  ENTERTAINMENT_OTHER_ENTERTAINMENT: "Entertainment & Recreation",

  // ── FOOD_AND_DRINK ──────────────────────────────────────────────────────
  FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: "Restaurants & Bars",
  FOOD_AND_DRINK_COFFEE: "Coffee Shops",
  FOOD_AND_DRINK_FAST_FOOD: "Restaurants & Bars",
  FOOD_AND_DRINK_GROCERIES: "Groceries",
  FOOD_AND_DRINK_RESTAURANT: "Restaurants & Bars",
  FOOD_AND_DRINK_VENDING_MACHINES: "Restaurants & Bars",
  FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK: "Restaurants & Bars",

  // ── GENERAL_MERCHANDISE ─────────────────────────────────────────────────
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: "Clothing",
  GENERAL_MERCHANDISE_CONVENIENCE_STORES: "Shopping",
  GENERAL_MERCHANDISE_DEPARTMENT_STORES: "Shopping",
  GENERAL_MERCHANDISE_DISCOUNT_STORES: "Shopping",
  GENERAL_MERCHANDISE_ELECTRONICS: "Electronics",
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: "Gifts",
  GENERAL_MERCHANDISE_OFFICE_SUPPLIES: "Office Supplies & Expenses",
  GENERAL_MERCHANDISE_ONLINE_MARKETPLACES: "Shopping",
  GENERAL_MERCHANDISE_PET_SUPPLIES: "Pets",
  GENERAL_MERCHANDISE_SPORTING_GOODS: "Shopping",
  GENERAL_MERCHANDISE_SUPERSTORES: "Shopping",
  GENERAL_MERCHANDISE_TOBACCO_AND_VAPE: "Personal",
  GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE: "Shopping",

  // ── HOME_IMPROVEMENT ────────────────────────────────────────────────────
  HOME_IMPROVEMENT_FURNITURE: "Furniture & Housewares",
  HOME_IMPROVEMENT_HARDWARE: "Home Improvement",
  HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE: "Home Improvement",
  HOME_IMPROVEMENT_SECURITY: "Home Improvement",
  HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT: "Home Improvement",

  // ── MEDICAL ─────────────────────────────────────────────────────────────
  MEDICAL_DENTAL_CARE: "Dentist",
  MEDICAL_EYE_CARE: "Medical",
  MEDICAL_NURSING_CARE: "Medical",
  MEDICAL_PHARMACIES_AND_SUPPLEMENTS: "Medical",
  MEDICAL_PRIMARY_CARE: "Medical",
  MEDICAL_VETERINARY_SERVICES: "Pets",
  MEDICAL_OTHER_MEDICAL: "Medical",

  // ── PERSONAL_CARE ───────────────────────────────────────────────────────
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: "Fitness",
  PERSONAL_CARE_HAIR_AND_BEAUTY: "Personal",
  PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING: "Personal",
  PERSONAL_CARE_OTHER_PERSONAL_CARE: "Personal",

  // ── GENERAL_SERVICES ────────────────────────────────────────────────────
  GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING: "Financial & Legal Services",
  GENERAL_SERVICES_AUTOMOTIVE: "Auto Maintenance",
  GENERAL_SERVICES_CHILDCARE: "Child Care",
  GENERAL_SERVICES_CONSULTING_AND_LEGAL: "Financial & Legal Services",
  GENERAL_SERVICES_EDUCATION: "Education",
  GENERAL_SERVICES_INSURANCE: "Insurance",
  GENERAL_SERVICES_POSTAGE_AND_SHIPPING: "Postage & Shipping",
  GENERAL_SERVICES_STORAGE: "Other Income",
  GENERAL_SERVICES_OTHER_GENERAL_SERVICES: "Miscellaneous",

  // ── GOVERNMENT_AND_NON_PROFIT ───────────────────────────────────────────
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: "Charity",
  GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES: "Taxes",
  GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: "Taxes",
  GOVERNMENT_AND_NON_PROFIT_OTHER_GOVERNMENT_AND_NON_PROFIT: "Taxes",

  // ── TRANSPORTATION ──────────────────────────────────────────────────────
  TRANSPORTATION_BIKES_AND_SCOOTERS: "Public Transit",
  TRANSPORTATION_GAS: "Gas",
  TRANSPORTATION_PARKING: "Parking & Tolls",
  TRANSPORTATION_PUBLIC_TRANSIT: "Public Transit",
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: "Taxi & Ride Shares",
  TRANSPORTATION_TOLLS: "Parking & Tolls",
  TRANSPORTATION_OTHER_TRANSPORTATION: "Public Transit",

  // ── TRAVEL ──────────────────────────────────────────────────────────────
  TRAVEL_FLIGHTS: "Travel & Vacation",
  TRAVEL_LODGING: "Travel & Vacation",
  TRAVEL_RENTAL_CARS: "Travel & Vacation",
  TRAVEL_OTHER_TRAVEL: "Travel & Vacation",

  // ── RENT_AND_UTILITIES ──────────────────────────────────────────────────
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: "Gas & Electric",
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: "Internet & Cable",
  RENT_AND_UTILITIES_RENT: "Rent",
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: "Garbage",
  RENT_AND_UTILITIES_TELEPHONE: "Phone",
  RENT_AND_UTILITIES_WATER: "Water",
  RENT_AND_UTILITIES_OTHER_UTILITIES: "Gas & Electric",
};

/** Fallback: PFC primary → Monarch category, used when the detailed code is
 * unknown. Always picks a representative member of the primary group. */
export const PLAID_PRIMARY_TO_MONARCH: Record<string, string> = {
  INCOME: "Other Income",
  TRANSFER_IN: "Transfer",
  TRANSFER_OUT: "Transfer",
  LOAN_PAYMENTS: "Loan Repayment",
  BANK_FEES: "Financial Fees",
  ENTERTAINMENT: "Entertainment & Recreation",
  FOOD_AND_DRINK: "Restaurants & Bars",
  GENERAL_MERCHANDISE: "Shopping",
  HOME_IMPROVEMENT: "Home Improvement",
  MEDICAL: "Medical",
  PERSONAL_CARE: "Personal",
  GENERAL_SERVICES: "Miscellaneous",
  GOVERNMENT_AND_NON_PROFIT: "Taxes",
  TRANSPORTATION: "Public Transit",
  TRAVEL: "Travel & Vacation",
  RENT_AND_UTILITIES: "Gas & Electric",
};

/**
 * Translate a Plaid PFC detailed code (or primary code) to a Monarch canonical
 * category name. Returns null if neither input matches anything known —
 * caller should fall back to the merchant override / legacy category /
 * "Uncategorized".
 */
export function plaidPfcToMonarch(
  detailed: string | null | undefined,
  primary: string | null | undefined
): string | null {
  if (detailed) {
    const normalised = detailed.trim().toUpperCase();
    const hit = PLAID_DETAILED_TO_MONARCH[normalised];
    if (hit) return hit;
  }
  if (primary) {
    const normalised = primary.trim().toUpperCase();
    const hit = PLAID_PRIMARY_TO_MONARCH[normalised];
    if (hit) return hit;
  }
  return null;
}

/** PFC primary categories that always indicate a transfer (not spending or income). */
export const PLAID_TRANSFER_PRIMARIES: ReadonlySet<string> = new Set([
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "LOAN_PAYMENTS",
]);

/** True if a Plaid PFC primary indicates the transaction is a transfer that
 * should be excluded from expense and income totals. */
export function isPlaidTransfer(primary: string | null | undefined): boolean {
  if (!primary) return false;
  return PLAID_TRANSFER_PRIMARIES.has(primary.trim().toUpperCase());
}

// Re-export the def type for convenience
export type { MonarchCategoryDef };
