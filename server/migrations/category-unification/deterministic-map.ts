/**
 * Deterministic category mapping tables for the ARCHITECTURE.md §6.2
 * canonical-categories rollout.
 *
 * Two maps live here:
 *   - `DETERMINISTIC_MAP`  — legacy Budget Smart AI category strings → canonical slug.
 *                            Used by the one-time backfill (§6.2.5) against
 *                            `expenses.category`, `bills.category`,
 *                            `income.category`, and `manual_transactions.category`.
 *   - `PLAID_CATEGORY_MAP` — Plaid personal_finance_category.detailed slugs →
 *                            canonical slug. Used by the dual-write sync path
 *                            (§6.2.6) when writing new `plaid_transactions`
 *                            rows. Also used when backfilling the existing
 *                            `plaid_transactions.personal_finance_category_detailed`.
 *
 * English-only by design. Do not localize without redesigning the AI fallback.
 *
 * Anything NOT in these maps flows through the Bedrock Haiku fallback
 * (`ai-mapper.ts`) at backfill time. Keep the maps tight — every key added
 * here removes one AI call, one review-queue row, and one source of
 * non-determinism.
 */

// ─────────────────────────────────────────────────────────────────────────
// Legacy category strings → canonical slugs (52 of 59 expected strings).
// Remainder (~7) flow through AI fallback at backfill time.
// ─────────────────────────────────────────────────────────────────────────
export const DETERMINISTIC_MAP: Record<string, string> = {
  // ═══ EXPENSE LIST → CANONICAL (28 entries from EXPENSE_CATEGORIES) ═══
  "Groceries":              "food_groceries",
  "Restaurant & Bars":      "food_restaurants",
  "Coffee Shops":           "food_coffee",
  "Healthcare":             "health_medical",
  "Pharmacy":               "health_pharmacy",
  "Personal":               "health_personal_care",
  "Public Transit":         "transport_public_transit",
  "Taxi & Ride Share":      "transport_rideshare",
  "Gas":                    "transport_fuel",
  "Fuel":                   "transport_fuel",
  "Auto Maintenance":       "transport_auto_maintenance",
  "Parking":                "transport_tolls_parking",
  "Tolls":                  "transport_tolls_parking",
  "Shopping":               "lifestyle_shopping",
  "Entertainment":          "lifestyle_entertainment",
  "Fun Money":              "lifestyle_shopping",
  "Pets":                   "lifestyle_pets",
  "Gifts":                  "lifestyle_gifts",
  "Donations":              "charity_donations",
  "Travel":                 "travel",
  "Education":              "family_education",
  "Kids":                   "family_kids_activities",
  "Other":                  "uncategorized",
  "Bank Fees":              "finance_bank_fees",
  "Cash":                   "transfer_atm",
  "Business Services":      "business_services",
  "Office Supplies":        "business_office_supplies",
  // "Electrical" defaults to actual electricity (§6.2.2 correction #3).
  // Phone-carrier misroutes (Telus/Rogers/Bell/etc. billed under "Electrical")
  // are fixed by a targeted post-backfill UPDATE — see §6.2.5.
  "Electrical":             "utilities_electricity",

  // ═══ BILL LIST → CANONICAL (22 entries from BILL_CATEGORIES) ═══
  "Phone":                  "utilities_phone_mobile",
  "Utilities":              "utilities_phone_mobile",  // legacy "Utilities" almost always meant mobile
  "Internet":               "utilities_internet",
  "Cable":                  "utilities_cable_tv",
  "Electricity":            "utilities_electricity",
  "Water":                  "utilities_water",
  "Gas & Heating":          "utilities_gas_heating",
  "Subscriptions":          "lifestyle_subscriptions",
  "Streaming":              "lifestyle_subscriptions",
  "Mortgage":               "housing_mortgage",
  "Rent":                   "housing_rent",
  "HOA":                    "housing_hoa",
  "Property Tax":           "taxes_property",
  "Line of Credit":         "finance_debt_payment",
  "Loans":                  "finance_debt_payment",
  "Credit Card":            "finance_credit_card_payment",
  "Auto":                   "transport_auto_payment",
  "Car":                    "transport_auto_payment",
  // "Insurance" is ambiguous (auto vs home vs health). Default to auto;
  // the AI fallback re-checks per merchant when confidence < 0.80.
  "Insurance":              "insurance_auto",
  "Day Care":               "family_childcare",
  "Tuition":                "family_education",
  "Service Charge":         "finance_bank_fees",

  // ═══ INCOME LIST → CANONICAL (9 entries from INCOME_CATEGORIES) ═══
  "Salary":                 "income_salary",
  "Freelance":              "income_freelance",
  "Investments":            "income_investment",
  "Dividends":              "income_investment",
  "Rental":                 "income_rental",
  "Other Income":           "income_other",

  // ═══ TRANSFER / REVERSAL RECLASSIFICATIONS (critical for UAT #98) ═══
  // These legacy strings appear in provider feeds and must be demoted from
  // "income" to the correct transfer bucket so Net Worth and Income totals
  // stop double-counting.
  "Refunds":                    "transfer_refund",
  "Interest":                   "income_investment",   // Bank interest = investment income, keep as income
  "Interest Payment":           "transfer_internal",   // Interest credits between own accounts ≠ income
  "Banking Package Interest":   "transfer_internal",
  "Interest Adjustment":        "transfer_internal",
  "ATM Deposit":                "transfer_atm",
  "Annual Cash Back":           "transfer_refund",
  "Cash Back Credit Adjustment":"transfer_refund",
};

// ─────────────────────────────────────────────────────────────────────────
// Plaid personal_finance_category.detailed → canonical slug.
// Covers the ~90 slugs in Plaid's PFC v2 taxonomy. Used by the dual-write
// sync path (§6.2.6) and by the one-time plaid_transactions backfill pass.
// Anything missing here flows through AI fallback at backfill time.
// ─────────────────────────────────────────────────────────────────────────
export const PLAID_CATEGORY_MAP: Record<string, string> = {
  // Food
  "FOOD_AND_DRINK_RESTAURANT":              "food_restaurants",
  "FOOD_AND_DRINK_FAST_FOOD":               "food_restaurants",
  "FOOD_AND_DRINK_COFFEE":                  "food_coffee",
  "FOOD_AND_DRINK_GROCERIES":               "food_groceries",
  "FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK":    "food_restaurants",

  // Transportation
  "TRANSPORTATION_GAS":                     "transport_fuel",
  "TRANSPORTATION_PARKING":                 "transport_tolls_parking",
  "TRANSPORTATION_PUBLIC_TRANSIT":          "transport_public_transit",
  "TRANSPORTATION_TAXIS_AND_RIDE_SHARES":   "transport_rideshare",
  "TRANSPORTATION_TOLLS":                   "transport_tolls_parking",

  // Loan Payments
  "LOAN_PAYMENTS_MORTGAGE_PAYMENT":         "housing_mortgage",
  "LOAN_PAYMENTS_CAR_PAYMENT":              "transport_auto_payment",
  "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT":      "finance_credit_card_payment",
  "LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT":    "finance_debt_payment",
  "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT":     "family_education",
  "LOAN_PAYMENTS_OTHER_PAYMENT":            "finance_debt_payment",

  // Rent and Utilities
  "RENT_AND_UTILITIES_RENT":                        "housing_rent",
  "RENT_AND_UTILITIES_INTERNET_AND_CABLE":          "utilities_internet",
  "RENT_AND_UTILITIES_TELEPHONE":                   "utilities_phone_mobile",
  "RENT_AND_UTILITIES_WATER":                       "utilities_water",
  "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY":         "utilities_electricity",
  "RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT": "utilities_water",
  "RENT_AND_UTILITIES_OTHER_UTILITIES":             "utilities_electricity",

  // Entertainment
  "ENTERTAINMENT_TV_AND_MOVIES":            "lifestyle_subscriptions",
  "ENTERTAINMENT_MUSIC_AND_AUDIO":          "lifestyle_subscriptions",
  "ENTERTAINMENT_CASINOS_AND_GAMBLING":     "lifestyle_entertainment",
  "ENTERTAINMENT_VIDEO_GAMES":              "lifestyle_entertainment",
  "ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS": "lifestyle_entertainment",
  "ENTERTAINMENT_OTHER_ENTERTAINMENT":      "lifestyle_entertainment",

  // General Merchandise (Shopping)
  "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES":      "lifestyle_shopping",
  "GENERAL_MERCHANDISE_ELECTRONICS":                   "lifestyle_shopping",
  "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES":           "lifestyle_shopping",
  "GENERAL_MERCHANDISE_DEPARTMENT_STORES":             "lifestyle_shopping",
  "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE":     "lifestyle_shopping",
  "GENERAL_MERCHANDISE_SUPERSTORES":                   "lifestyle_shopping",

  // Medical
  "MEDICAL_DENTAL_CARE":                    "health_medical",
  "MEDICAL_EYE_CARE":                       "health_medical",
  "MEDICAL_NURSING_CARE":                   "health_medical",
  "MEDICAL_PHARMACIES_AND_SUPPLEMENTS":     "health_pharmacy",
  "MEDICAL_PRIMARY_CARE":                   "health_medical",
  "MEDICAL_VETERINARY_SERVICES":            "lifestyle_pets",
  "MEDICAL_OTHER_MEDICAL":                  "health_medical",

  // Personal Care
  "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS": "health_personal_care",
  "PERSONAL_CARE_HAIR_AND_BEAUTY":          "health_personal_care",
  "PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING": "health_personal_care",
  "PERSONAL_CARE_OTHER_PERSONAL_CARE":      "health_personal_care",

  // General Services
  "GENERAL_SERVICES_TELECOMMUNICATION_SERVICES":      "utilities_phone_mobile",
  // `GENERAL_SERVICES_INSURANCE` defaults to auto; AI re-checks per merchant.
  "GENERAL_SERVICES_INSURANCE":                       "insurance_auto",
  "GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING": "taxes_professional",
  "GENERAL_SERVICES_AUTOMOTIVE":                      "transport_auto_maintenance",
  "GENERAL_SERVICES_CHILDCARE":                       "family_childcare",
  "GENERAL_SERVICES_EDUCATION":                       "family_education",
  "GENERAL_SERVICES_CONSULTING_AND_LEGAL":            "business_professional_fees",
  "GENERAL_SERVICES_OTHER_GENERAL_SERVICES":          "business_services",

  // Travel
  "TRAVEL_FLIGHTS":                         "travel",
  "TRAVEL_LODGING":                         "travel",
  "TRAVEL_RENTAL_CARS":                     "travel",
  "TRAVEL_OTHER_TRAVEL":                    "travel",
  "TRAVEL_GAS":                             "transport_fuel",
  "TRAVEL_PUBLIC_TRANSIT":                  "transport_public_transit",

  // Home Improvement
  "HOME_IMPROVEMENT_FURNITURE":                  "housing_maintenance",
  "HOME_IMPROVEMENT_HARDWARE":                   "housing_maintenance",
  "HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE":     "housing_maintenance",
  "HOME_IMPROVEMENT_SECURITY":                   "housing_maintenance",
  "HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT":     "housing_maintenance",

  // Bank Fees
  "BANK_FEES_ATM_FEES":                     "finance_bank_fees",
  "BANK_FEES_FOREIGN_TRANSACTION_FEES":     "finance_bank_fees",
  "BANK_FEES_INSUFFICIENT_FUNDS":           "finance_bank_fees",
  "BANK_FEES_INTEREST_CHARGE":              "finance_interest_charges",
  "BANK_FEES_OVERDRAFT_FEES":               "finance_bank_fees",
  "BANK_FEES_OTHER_BANK_FEES":              "finance_bank_fees",

  // Government and Non-Profit
  "GOVERNMENT_AND_NON_PROFIT_DONATIONS":                          "charity_donations",
  "GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES": "taxes_income",
  "GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT":                        "taxes_income",
  "GOVERNMENT_AND_NON_PROFIT_OTHER_GOVERNMENT_AND_NON_PROFIT":    "taxes_income",

  // Transfer In
  "TRANSFER_IN_CASH_ADVANCES_AND_LOANS":    "transfer_internal",
  "TRANSFER_IN_DEPOSIT":                    "transfer_internal",
  "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS": "finance_investments",
  "TRANSFER_IN_SAVINGS":                    "transfer_internal",
  "TRANSFER_IN_ACCOUNT_TRANSFER":           "transfer_internal",
  "TRANSFER_IN_OTHER_TRANSFER_IN":          "transfer_internal",

  // Transfer Out
  "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS": "finance_investments",
  "TRANSFER_OUT_SAVINGS":                   "transfer_internal",
  "TRANSFER_OUT_WITHDRAWAL":                "transfer_atm",
  "TRANSFER_OUT_ACCOUNT_TRANSFER":          "transfer_internal",
  "TRANSFER_OUT_OTHER_TRANSFER_OUT":        "transfer_internal",

  // Income
  "INCOME_DIVIDENDS":                       "income_investment",
  "INCOME_INTEREST_EARNED":                 "income_investment",
  "INCOME_RETIREMENT_PENSION":              "income_other",
  "INCOME_TAX_REFUND":                      "transfer_refund",
  "INCOME_UNEMPLOYMENT":                    "income_other",
  "INCOME_WAGES":                           "income_salary",
  "INCOME_OTHER_INCOME":                    "income_other",
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Look up a legacy category string deterministically.
 * Returns the canonical slug or `null` if the string needs AI fallback.
 *
 * Case-preserved lookup: legacy strings in the DB are stored with the exact
 * casing the UI uses (e.g. "Gas & Heating", not "gas & heating"). Do not
 * lowercase the input — that would miss entries like "Gas" vs. "gas".
 */
export function lookupLegacyCategory(legacy: string | null | undefined): string | null {
  if (!legacy) return null;
  return DETERMINISTIC_MAP[legacy] ?? null;
}

/**
 * Look up a Plaid personal_finance_category.detailed slug deterministically.
 * Returns the canonical slug or `null` if the Plaid slug needs AI fallback.
 *
 * Plaid ships slugs in SCREAMING_SNAKE_CASE and never changes case per row,
 * so a direct object lookup is safe.
 */
export function lookupPlaidCategory(plaidDetailed: string | null | undefined): string | null {
  if (!plaidDetailed) return null;
  return PLAID_CATEGORY_MAP[plaidDetailed] ?? null;
}
