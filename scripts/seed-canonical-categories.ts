#!/usr/bin/env tsx
/**
 * Seed the canonical_categories table with the 16 parent groups + 57
 * canonicals (73 rows total) from ARCHITECTURE.md §6.2.1.
 *
 * IDEMPOTENT. Safe to re-run. Existing rows are UPDATEd in-place so edits to
 * display names, icons, colors, or sort order propagate on the next run;
 * the `id` slug is the immutable key and never changes.
 *
 * Prerequisite: migration 0039_canonical_categories.sql must have run first
 * (creates the tables and indexes).
 *
 * Usage:
 *   DATABASE_URL=... npm run seed:canonical-categories
 */
import { pool } from "../server/db";

interface SeedRow {
  id: string;
  displayName: string;
  parentId: string | null;
  appliesToExpense: boolean;
  appliesToBill: boolean;
  appliesToIncome: boolean;
  isTransfer: boolean;
  isGroup: boolean;
  icon: string | null;
  color: string | null;
  sortOrder: number;
}

// ───────────────────────── 16 parent groups ─────────────────────────
// Sort order reserves the 10-99 range for parent groups so the 57 canonicals
// below can slot between parents without renumbering when new parents appear.
const PARENT_GROUPS: SeedRow[] = [
  { id: "housing",    displayName: "Housing",                 parentId: null, appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: true, icon: "🏠", color: "#2563eb", sortOrder: 10 },
  { id: "utilities",  displayName: "Utilities",               parentId: null, appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: true, icon: "💡", color: "#f59e0b", sortOrder: 20 },
  { id: "transport",  displayName: "Transportation",          parentId: null, appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: true, icon: "🚗", color: "#0891b2", sortOrder: 30 },
  { id: "insurance",  displayName: "Insurance",               parentId: null, appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: true, icon: "🛡️", color: "#7c3aed", sortOrder: 40 },
  { id: "food",       displayName: "Food",                    parentId: null, appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: true, icon: "🍔", color: "#16a34a", sortOrder: 50 },
  { id: "health",     displayName: "Health & Wellness",       parentId: null, appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: true, icon: "🏥", color: "#dc2626", sortOrder: 60 },
  { id: "finance",    displayName: "Financial",               parentId: null, appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: true, icon: "💳", color: "#0ea5e9", sortOrder: 70 },
  { id: "taxes",      displayName: "Taxes",                   parentId: null, appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: true, icon: "🧾", color: "#64748b", sortOrder: 80 },
  { id: "lifestyle",  displayName: "Lifestyle",               parentId: null, appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: true, icon: "🛍️", color: "#ec4899", sortOrder: 90 },
  { id: "charity",    displayName: "Charity & Donations",     parentId: null, appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: true, icon: "❤️", color: "#e11d48", sortOrder: 100 },
  { id: "family",     displayName: "Family",                  parentId: null, appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: true, icon: "👨‍👩‍👧", color: "#a855f7", sortOrder: 110 },
  { id: "business",   displayName: "Business & Professional", parentId: null, appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: true, icon: "💼", color: "#0f766e", sortOrder: 120 },
  { id: "travel",     displayName: "Travel",                  parentId: null, appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: true, icon: "✈️", color: "#6366f1", sortOrder: 130 },
  { id: "income",     displayName: "Income",                  parentId: null, appliesToExpense: false, appliesToBill: false, appliesToIncome: true,  isTransfer: false, isGroup: true, icon: "💰", color: "#15803d", sortOrder: 140 },
  { id: "transfers",  displayName: "Transfers & Reversals",   parentId: null, appliesToExpense: false, appliesToBill: false, appliesToIncome: false, isTransfer: true,  isGroup: true, icon: "🔄", color: "#475569", sortOrder: 150 },
  { id: "meta",       displayName: "Meta",                    parentId: null, appliesToExpense: true,  appliesToBill: true,  appliesToIncome: true,  isTransfer: false, isGroup: true, icon: "🏷️", color: "#94a3b8", sortOrder: 160 },
];

// ───────────────────────── 57 canonical categories ─────────────────────────
// Sort order within a parent group: parentSortOrder + 1..n so children
// naturally sort after their parent.
const CANONICALS: SeedRow[] = [
  // Housing (4)
  { id: "housing_mortgage",         displayName: "Mortgage",                                    parentId: "housing",    appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 11 },
  { id: "housing_rent",             displayName: "Rent",                                        parentId: "housing",    appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 12 },
  { id: "housing_hoa",              displayName: "HOA / Strata / Condo Fees",                   parentId: "housing",    appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 13 },
  { id: "housing_maintenance",      displayName: "Home Maintenance & Repairs",                  parentId: "housing",    appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 14 },

  // Utilities (6)
  { id: "utilities_electricity",    displayName: "Electricity",                                 parentId: "utilities",  appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 21 },
  { id: "utilities_gas_heating",    displayName: "Gas & Heating",                               parentId: "utilities",  appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 22 },
  { id: "utilities_water",          displayName: "Water & Sewer",                               parentId: "utilities",  appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 23 },
  { id: "utilities_internet",       displayName: "Internet",                                    parentId: "utilities",  appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 24 },
  { id: "utilities_phone_mobile",   displayName: "Phone & Mobile",                              parentId: "utilities",  appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 25 },
  { id: "utilities_cable_tv",       displayName: "Cable & Satellite TV",                        parentId: "utilities",  appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 26 },

  // Transportation (6)
  { id: "transport_auto_payment",      displayName: "Auto Loan / Lease Payment",                parentId: "transport",  appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 31 },
  { id: "transport_fuel",              displayName: "Fuel & Gas",                               parentId: "transport",  appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 32 },
  { id: "transport_public_transit",    displayName: "Public Transit",                           parentId: "transport",  appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 33 },
  { id: "transport_rideshare",         displayName: "Taxi & Ride Share",                        parentId: "transport",  appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 34 },
  { id: "transport_tolls_parking",     displayName: "Tolls & Parking",                          parentId: "transport",  appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 35 },
  { id: "transport_auto_maintenance",  displayName: "Auto Maintenance & Repairs",               parentId: "transport",  appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 36 },

  // Insurance (4)
  { id: "insurance_auto",           displayName: "Auto Insurance",                              parentId: "insurance",  appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 41 },
  { id: "insurance_home",           displayName: "Home & Rental Insurance",                     parentId: "insurance",  appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 42 },
  { id: "insurance_health",         displayName: "Health & Dental Insurance",                   parentId: "insurance",  appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 43 },
  { id: "insurance_life",           displayName: "Life & Disability Insurance",                 parentId: "insurance",  appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 44 },

  // Food (3)
  { id: "food_groceries",           displayName: "Groceries",                                   parentId: "food",       appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 51 },
  { id: "food_restaurants",         displayName: "Restaurants & Dining",                        parentId: "food",       appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 52 },
  { id: "food_coffee",              displayName: "Coffee Shops",                                parentId: "food",       appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 53 },

  // Health & Wellness (3)
  { id: "health_medical",           displayName: "Medical & Healthcare",                        parentId: "health",     appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 61 },
  { id: "health_pharmacy",          displayName: "Pharmacy & Prescriptions",                    parentId: "health",     appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 62 },
  { id: "health_personal_care",     displayName: "Personal Care (hair, beauty, spa, fitness)",  parentId: "health",     appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 63 },

  // Financial (5) — credit_card_payment is dual-flag: expense AND transfer.
  { id: "finance_credit_card_payment", displayName: "Credit Card Payment",                      parentId: "finance",    appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: true,  isGroup: false, icon: null, color: null, sortOrder: 71 },
  { id: "finance_debt_payment",     displayName: "Loan & Debt Payment",                         parentId: "finance",    appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 72 },
  { id: "finance_bank_fees",        displayName: "Bank Fees & Service Charges",                 parentId: "finance",    appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 73 },
  { id: "finance_interest_charges", displayName: "Interest Charges (paid)",                     parentId: "finance",    appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 74 },
  { id: "finance_investments",      displayName: "Investment Contribution",                     parentId: "finance",    appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 75 },

  // Taxes (4)
  { id: "taxes_income",             displayName: "Income Tax (federal/provincial/state)",       parentId: "taxes",      appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 81 },
  { id: "taxes_property",           displayName: "Property Tax",                                parentId: "taxes",      appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 82 },
  { id: "taxes_sales",              displayName: "Sales Tax (standalone payments)",             parentId: "taxes",      appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 83 },
  { id: "taxes_professional",       displayName: "Tax Preparation & Accounting Fees",           parentId: "taxes",      appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 84 },

  // Lifestyle (5)
  { id: "lifestyle_shopping",       displayName: "Shopping",                                    parentId: "lifestyle",  appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 91 },
  { id: "lifestyle_entertainment",  displayName: "Entertainment",                               parentId: "lifestyle",  appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 92 },
  { id: "lifestyle_subscriptions",  displayName: "Subscriptions (SaaS & Streaming)",            parentId: "lifestyle",  appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 93 },
  { id: "lifestyle_pets",           displayName: "Pets",                                        parentId: "lifestyle",  appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 94 },
  { id: "lifestyle_gifts",          displayName: "Gifts",                                       parentId: "lifestyle",  appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 95 },

  // Charity & Donations (1)
  { id: "charity_donations",        displayName: "Charitable Donations (tax-deductible)",       parentId: "charity",    appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 101 },

  // Family (3)
  { id: "family_childcare",         displayName: "Childcare",                                   parentId: "family",     appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 111 },
  { id: "family_education",         displayName: "Education & Tuition",                         parentId: "family",     appliesToExpense: true,  appliesToBill: true,  appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 112 },
  { id: "family_kids_activities",   displayName: "Kids' Activities & Supplies",                 parentId: "family",     appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 113 },

  // Business & Professional (3)
  { id: "business_services",            displayName: "Business Services",                       parentId: "business",   appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 121 },
  { id: "business_office_supplies",     displayName: "Office Supplies & Software",              parentId: "business",   appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 122 },
  { id: "business_professional_fees",   displayName: "Professional Fees (legal, consulting)",   parentId: "business",   appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 123 },

  // Travel (1) — canonical id suffixed with _general to avoid colliding with the 'travel' parent group id
  { id: "travel_general",           displayName: "Travel",                                      parentId: "travel",     appliesToExpense: true,  appliesToBill: false, appliesToIncome: false, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 131 },

  // Income (5)
  { id: "income_salary",            displayName: "Salary & Wages",                              parentId: "income",     appliesToExpense: false, appliesToBill: false, appliesToIncome: true,  isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 141 },
  { id: "income_freelance",         displayName: "Freelance & Self-Employment",                 parentId: "income",     appliesToExpense: false, appliesToBill: false, appliesToIncome: true,  isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 142 },
  { id: "income_investment",        displayName: "Investment Income (dividends, capital gains, interest)", parentId: "income", appliesToExpense: false, appliesToBill: false, appliesToIncome: true, isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 143 },
  { id: "income_rental",            displayName: "Rental Income",                               parentId: "income",     appliesToExpense: false, appliesToBill: false, appliesToIncome: true,  isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 144 },
  { id: "income_other",             displayName: "Other Income",                                parentId: "income",     appliesToExpense: false, appliesToBill: false, appliesToIncome: true,  isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 145 },

  // Transfers & Reversals (3)
  { id: "transfer_internal",        displayName: "Internal Transfer",                           parentId: "transfers",  appliesToExpense: false, appliesToBill: false, appliesToIncome: false, isTransfer: true,  isGroup: false, icon: null, color: null, sortOrder: 151 },
  { id: "transfer_atm",             displayName: "ATM Deposit / Withdrawal",                    parentId: "transfers",  appliesToExpense: false, appliesToBill: false, appliesToIncome: false, isTransfer: true,  isGroup: false, icon: null, color: null, sortOrder: 152 },
  { id: "transfer_refund",          displayName: "Refund / Rebate / Cashback",                  parentId: "transfers",  appliesToExpense: false, appliesToBill: false, appliesToIncome: false, isTransfer: true,  isGroup: false, icon: null, color: null, sortOrder: 153 },

  // Meta (1)
  { id: "uncategorized",            displayName: "Uncategorized",                               parentId: "meta",       appliesToExpense: true,  appliesToBill: true,  appliesToIncome: true,  isTransfer: false, isGroup: false, icon: null, color: null, sortOrder: 161 },
];

const ALL_ROWS: SeedRow[] = [...PARENT_GROUPS, ...CANONICALS];

async function upsertRow(row: SeedRow): Promise<"inserted" | "updated"> {
  // UPSERT on id. Updated_at bumps on every run so you can spot stale rows
  // vs. rows the current seed touched.
  const { rows } = await pool.query<{ inserted: boolean }>(
    `
    INSERT INTO canonical_categories (
      id, display_name, parent_id,
      applies_to_expense, applies_to_bill, applies_to_income,
      is_transfer, is_group,
      icon, color, sort_order,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3,
      $4, $5, $6,
      $7, $8,
      $9, $10, $11,
      NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      display_name       = EXCLUDED.display_name,
      parent_id          = EXCLUDED.parent_id,
      applies_to_expense = EXCLUDED.applies_to_expense,
      applies_to_bill    = EXCLUDED.applies_to_bill,
      applies_to_income  = EXCLUDED.applies_to_income,
      is_transfer        = EXCLUDED.is_transfer,
      is_group           = EXCLUDED.is_group,
      icon               = EXCLUDED.icon,
      color              = EXCLUDED.color,
      sort_order         = EXCLUDED.sort_order,
      updated_at         = NOW()
    RETURNING (xmax = 0) AS inserted
    `,
    [
      row.id,
      row.displayName,
      row.parentId,
      row.appliesToExpense,
      row.appliesToBill,
      row.appliesToIncome,
      row.isTransfer,
      row.isGroup,
      row.icon,
      row.color,
      row.sortOrder,
    ],
  );
  return rows[0]?.inserted ? "inserted" : "updated";
}

async function main() {
  // Parents must exist before children because children reference them.
  // PARENT_GROUPS comes first in ALL_ROWS so we're already correct, but make
  // the invariant explicit.
  const parents = ALL_ROWS.filter((r) => r.isGroup);
  const children = ALL_ROWS.filter((r) => !r.isGroup);

  let inserted = 0;
  let updated = 0;

  console.log(
    `Seeding ${parents.length} parent groups + ${children.length} canonicals (${ALL_ROWS.length} total)...`,
  );

  for (const row of parents) {
    const result = await upsertRow(row);
    if (result === "inserted") inserted++;
    else updated++;
  }
  for (const row of children) {
    const result = await upsertRow(row);
    if (result === "inserted") inserted++;
    else updated++;
  }

  // Invariants — fail loudly if the canonical taxonomy ever drifts.
  const { rows: countRows } = await pool.query<{
    total: string;
    parents: string;
    canonicals: string;
  }>(`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE is_group)::text AS parents,
      COUNT(*) FILTER (WHERE NOT is_group)::text AS canonicals
    FROM canonical_categories
  `);

  const { total, parents: parentCount, canonicals: canonicalCount } = countRows[0];
  const ok =
    Number(total) === 73 &&
    Number(parentCount) === 16 &&
    Number(canonicalCount) === 57;

  console.log(
    `Done: inserted=${inserted} updated=${updated} | db totals: total=${total} parents=${parentCount} canonicals=${canonicalCount}`,
  );

  if (!ok) {
    console.error(
      `INVARIANT VIOLATION: expected 16 parents + 57 canonicals = 73 total. ` +
        `Got ${parentCount} + ${canonicalCount} = ${total}. Investigate drift before any read-path cutover.`,
    );
    process.exitCode = 1;
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
