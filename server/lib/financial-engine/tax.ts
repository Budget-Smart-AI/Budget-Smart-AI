/**
 * Centralized Tax Calculation Engine
 *
 * Handles tax deduction tracking, marginal rate calculations, category mappings,
 * and auto-tagging suggestions for US, CA, and UK tax jurisdictions.
 *
 * Replaces client-side tax math from tax-smart.tsx and tax-report.tsx.
 */

export type TaxCountry = "US" | "CA" | "UK";

export interface TaxTransaction {
  id: string;
  date: string;
  amount: number; // always positive
  merchant: string;
  category: string; // Monarch category
  taxDeductible: boolean;
  taxCategory: string | null;
  isBusinessExpense: boolean;
  source: "plaid" | "mx" | "manual";
}

export interface TaxCategoryBreakdown {
  category: string;
  label: string;
  total: number;
  count: number;
  transactions: Array<{
    id: string;
    date: string;
    amount: number;
    merchant: string;
    source: string;
  }>;
}

export interface TaxSummaryResult {
  year: number;
  country: TaxCountry;
  totalDeductible: number;
  totalBusiness: number;
  estimatedSavings: number;
  marginalRate: number;
  transactionCount: number;
  businessCount: number;
  byCategory: TaxCategoryBreakdown[];
}

export interface TaxSuggestion {
  transactionId: string;
  suggestedTaxCategory: string;
  confidence: "high" | "medium";
  reason: string;
}

export interface TaxBracket {
  label: string;
  rate: number;
  single: number;
  couple: number;
}

export interface TaxCountryConfig {
  name: string;
  currency: "USD" | "CAD" | "GBP";
  taxAuthority: string;
  taxAuthorityUrl: string;
  brackets: TaxBracket[];
  categories: string[];
  categoryLabels: Record<string, string>;
  disclaimer: string;
  guidance: Array<{
    title: string;
    body: string;
    link?: string;
    warning?: boolean;
  }>;
  quickQuestions: string[];
}

/**
 * Tax country configurations with brackets, categories, and guidance
 */
export const TAX_COUNTRY_CONFIG: Record<TaxCountry, TaxCountryConfig> = {
  US: {
    name: "United States (IRS)",
    currency: "USD",
    taxAuthority: "Internal Revenue Service (IRS)",
    taxAuthorityUrl: "https://www.irs.gov",
    brackets: [
      { label: "10%", rate: 10, single: 11925, couple: 23850 },
      { label: "12%", rate: 12, single: 48475, couple: 97150 },
      { label: "22%", rate: 22, single: 103350, couple: 206550 },
      { label: "24%", rate: 24, single: 197300, couple: 405100 },
      { label: "32%", rate: 32, single: 250525, couple: 488500 },
      { label: "35%", rate: 35, single: 626350, couple: 731200 },
      { label: "37%", rate: 37, single: 626351, couple: 731201 },
    ],
    categories: [
      "business_expense",
      "home_office",
      "medical",
      "charitable",
      "education",
      "business_travel",
      "business_meals",
      "vehicle_expense",
      "professional_services",
      "office_supplies",
      "other_deductible",
      "salt_deduction",
      "student_loan_interest",
      "ira_contribution",
      "hsa_contribution",
      "mortgage_interest",
    ],
    categoryLabels: {
      business_expense: "Business Expense",
      home_office: "Home Office",
      medical: "Medical & Dental",
      charitable: "Charitable Donations",
      education: "Education & Training",
      business_travel: "Business Travel",
      business_meals: "Business Meals & Entertainment",
      vehicle_expense: "Vehicle Expense",
      professional_services: "Professional Services",
      office_supplies: "Office Supplies",
      other_deductible: "Other Deductible",
      salt_deduction: "State & Local Taxes (SALT)",
      student_loan_interest: "Student Loan Interest",
      ira_contribution: "IRA Contribution",
      hsa_contribution: "HSA Contribution",
      mortgage_interest: "Mortgage Interest",
    },
    disclaimer:
      "This is for informational purposes only and is not tax advice. Consult a qualified tax professional or CPA before making tax-related decisions. Tax laws are complex and vary by individual circumstances.",
    guidance: [
      {
        title: "Standard vs. Itemized Deductions",
        body: "For 2025, the standard deduction is $14,600 (single) or $29,200 (married filing jointly). If your itemized deductions exceed this, itemizing may lower your tax bill.",
        link: "https://www.irs.gov/taxtopics/tc551",
      },
      {
        title: "Home Office Deduction",
        body: "If you use a dedicated home office space for business, you can deduct a portion of rent, utilities, and repairs. Use either the simplified method ($5 per sq ft, max 300 sq ft) or actual expense method.",
        link: "https://www.irs.gov/publications/p587",
      },
      {
        title: "Business Meals & Entertainment",
        body: "As of 2024, 50% of business meal expenses remain deductible. Keep receipts and document the business purpose of each meal.",
        link: "https://www.irs.gov/publications/p463",
      },
      {
        title: "Vehicle Expenses",
        body: "You can deduct either the standard mileage rate ($0.67 per mile for 2024 business use) or actual expenses (gas, insurance, maintenance). Maintain a mileage log.",
        link: "https://www.irs.gov/publications/p463",
      },
      {
        title: "Medical & Dental Expenses",
        body: "Medical expenses exceeding 7.5% of adjusted gross income (AGI) can be deducted. This includes doctor visits, prescriptions, dental work, and health insurance premiums for self-employed individuals.",
        link: "https://www.irs.gov/taxtopics/tc502",
      },
      {
        title: "Charitable Contributions",
        body: "Cash donations to qualified charitable organizations are deductible. Keep receipts for donations over $250 and substantiation from the charity.",
        warning: true,
        link: "https://www.irs.gov/charities-non-profits/charitable-organizations",
      },
    ],
    quickQuestions: [
      "What's the difference between business expenses and personal expenses?",
      "Can I deduct my home office if I work from home?",
      "How do I track and claim vehicle deductions?",
      "What medical expenses can I deduct on my taxes?",
      "How do estimated quarterly taxes work for self-employed individuals?",
    ],
  },
  CA: {
    name: "Canada (CRA)",
    currency: "CAD",
    taxAuthority: "Canada Revenue Agency (CRA)",
    taxAuthorityUrl: "https://www.canada.ca/taxes",
    brackets: [
      { label: "15% (Federal)", rate: 15, single: 57375, couple: 57375 },
      { label: "20.5% (Federal)", rate: 20.5, single: 114750, couple: 114750 },
      { label: "26% (Federal)", rate: 26, single: 158468, couple: 158468 },
      { label: "29% (Federal)", rate: 29, single: 220000, couple: 220000 },
      { label: "33% (Federal)", rate: 33, single: 220001, couple: 220001 },
    ],
    categories: [
      "business_expense",
      "home_office",
      "medical",
      "charitable",
      "education",
      "business_travel",
      "business_meals",
      "vehicle_expense",
      "professional_services",
      "office_supplies",
      "other_deductible",
      "rrsp_contribution",
      "union_professional_dues",
      "childcare",
      "moving_expenses",
      "northern_residents",
    ],
    categoryLabels: {
      business_expense: "Business Expense",
      home_office: "Home Office",
      medical: "Medical & Dental",
      charitable: "Charitable Donations",
      education: "Education & Training",
      business_travel: "Business Travel",
      business_meals: "Business Meals & Entertainment",
      vehicle_expense: "Vehicle Expense",
      professional_services: "Professional Services",
      office_supplies: "Office Supplies",
      other_deductible: "Other Deductible",
      rrsp_contribution: "RRSP Contribution",
      union_professional_dues: "Union & Professional Dues",
      childcare: "Childcare Expenses",
      moving_expenses: "Moving Expenses",
      northern_residents: "Northern Residents Deduction",
    },
    disclaimer:
      "This is for informational purposes only and is not tax advice. Consult a qualified tax professional or accountant in your province before making tax-related decisions. Tax laws vary by province and individual circumstances.",
    guidance: [
      {
        title: "RRSP Contribution Room",
        body: "Your RRSP contribution room is 18% of your previous year's earned income, up to an annual limit. Unused room carries forward indefinitely. Check your CRA My Account for your exact limit.",
        link: "https://www.canada.ca/taxes/individuals/topics/rrsp-resp",
      },
      {
        title: "Home Office Deduction",
        body: "If you work from home as an employee, you may deduct a portion of home expenses (utilities, rent, maintenance). Self-employed individuals can deduct based on the percentage of home used for business.",
        link: "https://www.canada.ca/taxes/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions/line-21900",
      },
      {
        title: "Medical Expenses",
        body: "Medical expenses exceeding 15% of your net income can be claimed. This includes prescriptions, dental work, vision care, and medical devices. Amounts claimed must be for you, your spouse, or dependents.",
        link: "https://www.canada.ca/taxes/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions/line-33099",
      },
      {
        title: "Union & Professional Dues",
        body: "Membership dues paid to a union or professional association are fully deductible. This includes mandatory fees but excludes voluntary contributions and charitable donations.",
        link: "https://www.canada.ca/taxes/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions/line-21200",
      },
      {
        title: "Spousal RRSP",
        body: "A spousal RRSP allows you to split retirement income with your spouse. You contribute to an RRSP in your spouse's name and deduct the contribution on your tax return.",
        link: "https://www.canada.ca/taxes/individuals/topics/rrsp-resp/spousal-plans",
      },
      {
        title: "Charitable Donations",
        body: "Donations to qualified Canadian charities are eligible for a federal credit (15% on first $15,000, 29% on amounts over $15,000). Provincial credits vary. Requires official donation receipt.",
        link: "https://www.canada.ca/taxes/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions/line-34900",
      },
    ],
    quickQuestions: [
      "How much can I contribute to my RRSP?",
      "What's the difference between an RRSP and a TFSA?",
      "Can I deduct my home office expenses?",
      "What medical expenses are tax-deductible?",
      "How do spousal RRSPs work and are they right for me?",
    ],
  },
  UK: {
    name: "United Kingdom (HMRC)",
    currency: "GBP",
    taxAuthority: "Her Majesty's Revenue & Customs (HMRC)",
    taxAuthorityUrl: "https://www.gov.uk/government/organisations/hm-revenue-customs",
    brackets: [
      { label: "20% Basic", rate: 20, single: 50270, couple: 50270 },
      { label: "40% Higher", rate: 40, single: 125140, couple: 125140 },
      { label: "45% Additional", rate: 45, single: 125141, couple: 125141 },
    ],
    categories: [
      "business_expense",
      "home_office",
      "medical",
      "charitable",
      "education",
      "business_travel",
      "business_meals",
      "vehicle_expense",
      "professional_services",
      "office_supplies",
      "other_deductible",
      "pension_contribution",
      "gift_aid",
      "work_uniform",
      "professional_subscriptions",
      "working_from_home_allowance",
    ],
    categoryLabels: {
      business_expense: "Business Expense",
      home_office: "Home Office",
      medical: "Medical & Healthcare",
      charitable: "Charitable Donations",
      education: "Education & Training",
      business_travel: "Business Travel",
      business_meals: "Business Meals & Entertainment",
      vehicle_expense: "Vehicle Expense",
      professional_services: "Professional Services",
      office_supplies: "Office Supplies",
      other_deductible: "Other Deductible",
      pension_contribution: "Pension Contribution",
      gift_aid: "Gift Aid Donations",
      work_uniform: "Work Uniform & Protective Clothing",
      professional_subscriptions: "Professional Subscriptions",
      working_from_home_allowance: "Working from Home Allowance",
    },
    disclaimer:
      "This is for informational purposes only and is not tax advice. Consult a qualified tax professional or accountant in the UK before making tax-related decisions. Tax laws change annually and vary based on individual circumstances.",
    guidance: [
      {
        title: "Personal Allowance & Tax Bands",
        body: "For 2024/25, the personal allowance is £12,571. Basic rate tax (20%) applies to income up to £50,270, higher rate (40%) to £125,140, and additional rate (45%) above that. These thresholds adjust annually.",
        link: "https://www.gov.uk/personal-tax-allowances",
      },
      {
        title: "Trading Allowance for Self-Employed",
        body: "If you're self-employed, you can claim a trading allowance of up to £1,000, which reduces your taxable profit. This is a simplified alternative to claiming actual expenses.",
        link: "https://www.gov.uk/guidance/tax-relief-for-expenses-of-an-employee",
      },
      {
        title: "Home Office Deduction",
        body: "You can claim £26 per month (£312 per year) for working from home under HMRC's simplified expenses scheme, or claim actual expenses for utilities, council tax, and mortgage interest if higher.",
        link: "https://www.gov.uk/guidance/working-from-home-tax-relief",
      },
      {
        title: "Gift Aid on Charitable Donations",
        body: "If you're a UK taxpayer, charities can reclaim basic rate tax (20%) on your donations through Gift Aid. This effectively increases the value of your gift by 25% at no extra cost to you.",
        link: "https://www.gov.uk/guidance/gift-aid-relief-what-donations-qualify",
      },
      {
        title: "Pension Contributions & Tax Relief",
        body: "Contributions to a UK pension receive tax relief automatically if through payroll, or you can claim relief via self-assessment. You can contribute up to £60,000 per year (or 100% of earnings, whichever is lower) in 2024/25.",
        link: "https://www.gov.uk/guidance/pension-tax-relief-for-individuals",
      },
      {
        title: "Work Uniform & Professional Costs",
        body: "You can claim tax relief for work uniforms, professional subscriptions, and certain professional fees. The expense must be wholly and exclusively for your work.",
        link: "https://www.gov.uk/guidance/tax-relief-for-expenses-of-an-employee",
      },
    ],
    quickQuestions: [
      "What is the UK personal allowance and how does it affect my taxes?",
      "Can I claim tax relief for working from home?",
      "How does Gift Aid work on charitable donations?",
      "What are the benefits of paying into a UK pension?",
      "What business expenses can I claim as self-employed in the UK?",
    ],
  },
};

/**
 * Calculates a comprehensive tax summary for transactions in a given year and jurisdiction.
 *
 * @param transactions - Array of tax transactions to analyze
 * @param country - Tax jurisdiction (US, CA, UK)
 * @param taxYear - The tax year to filter transactions for
 * @param marginalRate - The user's marginal tax rate (as a percentage, e.g., 24)
 * @returns TaxSummaryResult with totals, savings estimate, and breakdown by category
 */
export function calculateTaxSummary(
  transactions: TaxTransaction[],
  country: TaxCountry,
  taxYear: number,
  marginalRate: number
): TaxSummaryResult {
  const config = TAX_COUNTRY_CONFIG[country];

  // Filter transactions to the tax year where taxDeductible is true
  const deductibleTransactions = transactions.filter((t) => {
    const transactionYear = parseInt(t.date.split("-")[0], 10);
    return transactionYear === taxYear && t.taxDeductible;
  });

  let totalDeductible = 0;
  let totalBusiness = 0;
  let businessCount = 0;

  // Sum totals and count business expenses
  deductibleTransactions.forEach((t) => {
    totalDeductible += t.amount;
    if (t.isBusinessExpense) {
      totalBusiness += t.amount;
      businessCount += 1;
    }
  });

  // Compute estimated tax savings
  const estimatedSavings = totalDeductible * (marginalRate / 100);

  // Group by tax category
  const categoryMap = new Map<string, TaxCategoryBreakdown>();

  deductibleTransactions.forEach((t) => {
    const category = t.taxCategory || "other_deductible";
    const label = config.categoryLabels[category] || category;

    if (!categoryMap.has(category)) {
      categoryMap.set(category, {
        category,
        label,
        total: 0,
        count: 0,
        transactions: [],
      });
    }

    const breakdown = categoryMap.get(category)!;
    breakdown.total += t.amount;
    breakdown.count += 1;
    breakdown.transactions.push({
      id: t.id,
      date: t.date,
      amount: t.amount,
      merchant: t.merchant,
      source: t.source,
    });
  });

  // Sort by total descending
  const byCategory = Array.from(categoryMap.values()).sort(
    (a, b) => b.total - a.total
  );

  return {
    year: taxYear,
    country,
    totalDeductible,
    totalBusiness,
    estimatedSavings,
    marginalRate,
    transactionCount: deductibleTransactions.length,
    businessCount,
    byCategory,
  };
}

/**
 * Suggests tax deductions for transactions not yet tagged as deductible.
 *
 * Uses Monarch category mappings and merchant analysis to identify likely
 * tax-deductible expenses with confidence levels.
 *
 * @param transactions - Array of tax transactions to analyze
 * @param country - Tax jurisdiction (US, CA, UK)
 * @returns Array of TaxSuggestion objects with confidence and reasoning
 */
export function suggestTaxDeductible(
  transactions: TaxTransaction[],
  country: TaxCountry
): TaxSuggestion[] {
  const suggestions: TaxSuggestion[] = [];

  // Filter to untagged transactions
  const untagged = transactions.filter(
    (t) => !t.taxDeductible && !t.taxCategory
  );

  untagged.forEach((t) => {
    const merchantLower = t.merchant.toLowerCase();
    const categoryLower = t.category.toLowerCase();

    // Universal category mappings (all countries)
    if (
      categoryLower.includes("medical") ||
      categoryLower.includes("dentist") ||
      categoryLower.includes("eye care") ||
      categoryLower.includes("pharmacy")
    ) {
      suggestions.push({
        transactionId: t.id,
        suggestedTaxCategory: "medical",
        confidence: "high",
        reason: "Medical expense — typically deductible",
      });
      return;
    }

    if (categoryLower.includes("charitable")) {
      suggestions.push({
        transactionId: t.id,
        suggestedTaxCategory: "charitable",
        confidence: "high",
        reason: "Charitable donation detected",
      });
      return;
    }

    if (
      categoryLower.includes("education") ||
      categoryLower.includes("tuition") ||
      categoryLower.includes("student loans")
    ) {
      suggestions.push({
        transactionId: t.id,
        suggestedTaxCategory: "education",
        confidence: "medium",
        reason: "Education expense — may be deductible",
      });
      return;
    }

    if (categoryLower.includes("business services")) {
      suggestions.push({
        transactionId: t.id,
        suggestedTaxCategory: "business_expense",
        confidence: "medium",
        reason: "Business service — likely deductible",
      });
      return;
    }

    if (
      categoryLower.includes("software") ||
      categoryLower.includes("tech")
    ) {
      if (t.isBusinessExpense) {
        suggestions.push({
          transactionId: t.id,
          suggestedTaxCategory: "business_expense",
          confidence: "high",
          reason: "Business software — deductible business expense",
        });
        return;
      }
    }

    // Country-specific mappings
    if (country === "US") {
      if (categoryLower.includes("mortgage interest")) {
        suggestions.push({
          transactionId: t.id,
          suggestedTaxCategory: "mortgage_interest",
          confidence: "high",
          reason: "Mortgage interest — deductible if itemizing",
        });
        return;
      }
    }

    if (country === "CA") {
      if (categoryLower.includes("union") || categoryLower.includes("dues")) {
        suggestions.push({
          transactionId: t.id,
          suggestedTaxCategory: "union_professional_dues",
          confidence: "high",
          reason: "Union dues — fully deductible",
        });
        return;
      }

      if (merchantLower.includes("rrsp")) {
        suggestions.push({
          transactionId: t.id,
          suggestedTaxCategory: "rrsp_contribution",
          confidence: "high",
          reason: "RRSP contribution — tax-deductible",
        });
        return;
      }
    }

    if (country === "UK") {
      if (categoryLower.includes("pension")) {
        suggestions.push({
          transactionId: t.id,
          suggestedTaxCategory: "pension_contribution",
          confidence: "high",
          reason: "Pension contribution — receives tax relief",
        });
        return;
      }
    }
  });

  return suggestions;
}
