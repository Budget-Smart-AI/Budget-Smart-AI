/**
 * MX Platform category → Monarch canonical category map.
 *
 * MX uses its own taxonomy (`top_level_category` and `category` fields on a
 * transaction). Their categorisation is more compact than Plaid PFC and the
 * names are human-readable.
 *
 * Reference: https://docs.mx.com/api#core_resources_transactions
 *
 * NOTE: This map covers MX's standard categories. Custom categories created
 * by an end-user in MX are not handled here — those fall through to the
 * resolver's legacy/merchant-override fallback.
 *
 * Coverage rule: every MX category we've observed in production data should
 * map to an explicit Monarch category, never to the catch-all. Unknown
 * categories return null and let the resolver decide what to do.
 */

/** Map from MX `category` value (case-sensitive, as MX returns it) → Monarch
 * canonical category name. */
export const MX_CATEGORY_TO_MONARCH: Record<string, string> = {
  // ── Income ──────────────────────────────────────────────────────────────
  "Paychecks/Salary": "Paychecks",
  "Bonuses": "Paychecks",
  "Tips": "Paychecks",
  "Investment Income": "Investment Income",
  "Dividends Received": "Investment Income",
  "Interest Income": "Interest",
  "Rental Income": "Rental Income",
  "Business Income": "Business Income",
  "Income": "Other Income",
  "Reimbursements": "Refunds & Returns",
  "Refunds": "Refunds & Returns",
  "Returns": "Refunds & Returns",
  "Tax Return": "Refunds & Returns",
  "Other Income": "Other Income",

  // ── Auto & Transport ────────────────────────────────────────────────────
  "Auto Payment": "Auto Payment",
  "Car Payment": "Auto Payment",
  "Auto & Transport": "Public Transit",
  "Auto Insurance": "Insurance",
  "Auto Service": "Auto Maintenance",
  "Service & Parts": "Auto Maintenance",
  "Gas & Fuel": "Gas",
  "Gas": "Gas",
  "Parking": "Parking & Tolls",
  "Tolls": "Parking & Tolls",
  "Public Transportation": "Public Transit",
  "Public Transit": "Public Transit",
  "Taxi": "Taxi & Ride Shares",
  "Ride Share": "Taxi & Ride Shares",
  "Rideshare": "Taxi & Ride Shares",

  // ── Bills & Utilities ───────────────────────────────────────────────────
  "Bills & Utilities": "Gas & Electric",
  "Utilities": "Gas & Electric",
  "Electric": "Gas & Electric",
  "Electricity": "Gas & Electric",
  "Gas (Utility)": "Gas & Electric",
  "Natural Gas": "Gas & Electric",
  "Water": "Water",
  "Sewer": "Water",
  "Trash": "Garbage",
  "Garbage": "Garbage",
  "Internet": "Internet & Cable",
  "Cable": "Internet & Cable",
  "Television": "Internet & Cable",
  "Telephone": "Phone",
  "Mobile Phone": "Phone",
  "Home Phone": "Phone",

  // ── Housing ─────────────────────────────────────────────────────────────
  "Mortgage": "Mortgage",
  "Mortgage & Rent": "Mortgage",
  "Rent": "Rent",
  "Home": "Home Improvement",
  "Home Improvement": "Home Improvement",
  "Home Services": "Home Improvement",
  "Home Insurance": "Insurance",
  "Furnishings": "Furniture & Housewares",
  "Lawn & Garden": "Home Improvement",
  "Home Maintenance": "Home Improvement",

  // ── Food & Dining ───────────────────────────────────────────────────────
  "Food & Dining": "Restaurants & Bars",
  "Groceries": "Groceries",
  "Restaurants": "Restaurants & Bars",
  "Restaurants/Dining": "Restaurants & Bars",
  "Fast Food": "Restaurants & Bars",
  "Coffee Shops": "Coffee Shops",
  "Coffee/Tea": "Coffee Shops",
  "Alcohol & Bars": "Restaurants & Bars",
  "Bars": "Restaurants & Bars",

  // ── Shopping ────────────────────────────────────────────────────────────
  "Shopping": "Shopping",
  "General Merchandise": "Shopping",
  "Books & Supplies": "Education",
  "Clothing": "Clothing",
  "Apparel": "Clothing",
  "Department Stores": "Shopping",
  "Electronics & Software": "Electronics",
  "Electronics": "Electronics",
  "Sporting Goods": "Shopping",
  "Hobbies": "Entertainment & Recreation",

  // ── Travel & Lifestyle ──────────────────────────────────────────────────
  "Travel": "Travel & Vacation",
  "Air Travel": "Travel & Vacation",
  "Hotel": "Travel & Vacation",
  "Vacation": "Travel & Vacation",
  "Rental Car & Taxi": "Travel & Vacation",
  "Entertainment": "Entertainment & Recreation",
  "Music": "Streaming Services",
  "Movies & DVDs": "Streaming Services",
  "Newspapers & Magazines": "Digital Media",
  "Personal Care": "Personal",
  "Hair": "Personal",
  "Spa & Massage": "Personal",
  "Pets": "Pets",
  "Pet Food & Supplies": "Pets",
  "Pet Grooming": "Pets",
  "Veterinary": "Pets",
  "Fun Money": "Fun Money",

  // ── Children ────────────────────────────────────────────────────────────
  "Kids": "Child Care",
  "Allowance": "Child Activities",
  "Babysitter & Daycare": "Child Care",
  "Daycare": "Child Care",
  "Child Care": "Child Care",
  "Child Activities": "Child Activities",
  "Toys": "Child Activities",

  // ── Health & Wellness ───────────────────────────────────────────────────
  "Health & Fitness": "Fitness",
  "Fitness": "Fitness",
  "Gym": "Fitness",
  "Health Insurance": "Insurance",
  "Doctor": "Medical",
  "Dentist": "Dentist",
  "Eye Care": "Medical",
  "Pharmacy": "Medical",
  "Sports": "Entertainment & Recreation",

  // ── Education ───────────────────────────────────────────────────────────
  "Education": "Education",
  "Tuition": "Education",
  "Student Loan": "Student Loans",

  // ── Financial ───────────────────────────────────────────────────────────
  "Financial": "Financial & Legal Services",
  "Financial Advisor": "Financial & Legal Services",
  "Legal": "Financial & Legal Services",
  "Life Insurance": "Insurance",
  "Insurance": "Insurance",
  "Bank Fee": "Financial Fees",
  "Service Fee": "Financial Fees",
  "Service Charge": "Financial Fees",
  "ATM Fee": "Financial Fees",
  "Late Fee": "Financial Fees",
  "Cash & ATM": "Cash & ATM",
  "ATM": "Cash & ATM",
  "Federal Tax": "Taxes",
  "State Tax": "Taxes",
  "Property Tax": "Taxes",
  "Sales Tax": "Taxes",
  "Taxes": "Taxes",

  // ── Gifts & Donations ───────────────────────────────────────────────────
  "Gifts & Donations": "Gifts",
  "Gift": "Gifts",
  "Charity": "Charity",
  "Donations": "Charity",

  // ── Business ────────────────────────────────────────────────────────────
  "Business Services": "Business Utilities & Communication",
  "Office Supplies": "Office Supplies & Expenses",
  "Office Rent": "Office Rent",
  "Shipping": "Postage & Shipping",
  "Postage": "Postage & Shipping",
  "Advertising": "Advertising & Promotion",
  "Wages Paid": "Employee Wages & Contract Labor",
  "Contract Labor": "Employee Wages & Contract Labor",

  // ── Subscriptions & Software ───────────────────────────────────────────
  "Subscriptions": "Dues & Subscriptions",
  "Software": "Software & Tech",
  "Cloud Services": "Software & Tech",
  "Streaming": "Streaming Services",

  // ── Transfers ──────────────────────────────────────────────────────────
  "Transfer": "Transfer",
  "Account Transfer": "Transfer",
  "Internal Transfer": "Transfer",
  "Credit Card Payment": "Credit Card Payment",
  "Loan Payment": "Loan Repayment",
  "Investment Transfer": "Transfer",
  "Withdrawal": "Transfer",
  "Deposit": "Transfer",

  // ── Catch-all ──────────────────────────────────────────────────────────
  "Uncategorized": "Uncategorized",
  "Misc Expenses": "Miscellaneous",
  "Cash": "Cash & ATM",
  "Check": "Check",
};

/** MX top-level categories that always indicate a transfer (excluded from
 * spending/income totals). */
const MX_TRANSFER_TOP_LEVEL: ReadonlySet<string> = new Set([
  "Transfer",
  "Loan Payment",
  "Internal Transfer",
]);

/**
 * Translate an MX category (or top-level category) to a Monarch canonical
 * category name. Returns null if neither is recognised — caller falls back
 * to merchant override / legacy category / "Uncategorized".
 */
export function mxCategoryToMonarch(
  category: string | null | undefined,
  topLevel: string | null | undefined
): string | null {
  if (category) {
    const trimmed = category.trim();
    const hit = MX_CATEGORY_TO_MONARCH[trimmed];
    if (hit) return hit;
  }
  if (topLevel) {
    const trimmed = topLevel.trim();
    const hit = MX_CATEGORY_TO_MONARCH[trimmed];
    if (hit) return hit;
  }
  return null;
}

/** True if an MX top-level category indicates the transaction is a transfer
 * that should be excluded from expense and income totals. */
export function isMxTransfer(topLevel: string | null | undefined): boolean {
  if (!topLevel) return false;
  return MX_TRANSFER_TOP_LEVEL.has(topLevel.trim());
}
