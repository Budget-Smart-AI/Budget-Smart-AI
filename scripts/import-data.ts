// Script to import bill and expense data
// Run with: npx tsx scripts/import-data.ts

const API_BASE = "http://localhost:5000";

// Data from spreadsheet - recurring bills
const recurringBills = [
  { name: "407ETR - WENDY", dueDay: 4, category: "Transportation", recurrence: "weekly", amount: "70.00", startingBalance: null, paymentsRemaining: null },
  { name: "Affirm - Amazon Purchase", dueDay: 25, category: "Shopping", recurrence: "monthly", amount: "48.97", startingBalance: "587.59", paymentsRemaining: 12 },
  { name: "ALECTRA HYDRO (8386****2127)", dueDay: 18, category: "Electrical", recurrence: "weekly", amount: "65.00", startingBalance: null, paymentsRemaining: null },
  { name: "AMAZON MASTERCARD MBNA (*7690)", dueDay: 4, category: "Credit Card", recurrence: "weekly", amount: "125.00", startingBalance: null, paymentsRemaining: null },
  { name: "Bell Mobility", dueDay: 11, category: "Communications", recurrence: "weekly", amount: "50.00", startingBalance: null, paymentsRemaining: null },
  { name: "Bunny CDN", dueDay: 22, category: "Business Expense", recurrence: "monthly", amount: "14.20", startingBalance: null, paymentsRemaining: null },
  { name: "CAA Insurance (CAR)", dueDay: 14, category: "Insurance", recurrence: "monthly", amount: "253.84", startingBalance: null, paymentsRemaining: null },
  { name: "CAA Insurance (HOUSE)", dueDay: 19, category: "Insurance", recurrence: "monthly", amount: "293.41", startingBalance: null, paymentsRemaining: null },
  { name: "CAPITAL ONE MASTERCARD (*5520)", dueDay: 28, category: "Credit Card", recurrence: "weekly", amount: "115.00", startingBalance: "1855.85", paymentsRemaining: null },
  { name: "Easy Financial ($5,000 loan Mortgage)", dueDay: 21, category: "Line of Credit", recurrence: "weekly", amount: "81.39", startingBalance: "5000.00", paymentsRemaining: null },
  { name: "Enbridge Gas (9100****8222)", dueDay: 4, category: "Utilities", recurrence: "weekly", amount: "126.80", startingBalance: "126.80", paymentsRemaining: null },
  { name: "Enbridge Gas (9100****8222) Bi-Weekly", dueDay: 18, category: "Utilities", recurrence: "biweekly", amount: "70.00", startingBalance: null, paymentsRemaining: null },
  { name: "FLEXITI VISIONS (6374***7885)", dueDay: 28, category: "Line of Credit", recurrence: "weekly", amount: "200.00", startingBalance: "8602.42", paymentsRemaining: null },
  { name: "FlexPay (Uplift) - Red Tag Trinidad", dueDay: 30, category: "Travel", recurrence: "monthly", amount: "394.91", startingBalance: "2159.21", paymentsRemaining: 7 },
  { name: "Ind All Life Insurance", dueDay: 19, category: "Insurance", recurrence: "monthly", amount: "353.75", startingBalance: null, paymentsRemaining: null },
  { name: "National Money Mart ($11,000 loan)", dueDay: 21, category: "Line of Credit", recurrence: "weekly", amount: "109.77", startingBalance: "10500.00", paymentsRemaining: null },
  { name: "Netflix", dueDay: 28, category: "Entertainment", recurrence: "monthly", amount: "27.11", startingBalance: null, paymentsRemaining: null },
  { name: "Oxygen", dueDay: 9, category: "Fitness", recurrence: "biweekly", amount: "77.97", startingBalance: null, paymentsRemaining: null },
  { name: "Peloton Subscription", dueDay: 28, category: "Fitness", recurrence: "monthly", amount: "67.79", startingBalance: null, paymentsRemaining: null },
  { name: "Rewardful Affiliate Program", dueDay: 22, category: "Business Expense", recurrence: "monthly", amount: "69.55", startingBalance: null, paymentsRemaining: null },
  { name: "Scotia Line of Credit (RYAN)", dueDay: 4, category: "Line of Credit", recurrence: "weekly", amount: "300.00", startingBalance: "28272.81", paymentsRemaining: null },
  { name: "Scotia Mortgage(4945097)", dueDay: 15, category: "Mortgage", recurrence: "monthly", amount: "2944.00", startingBalance: "95497.92", paymentsRemaining: null },
  { name: "Scotia Mortgage(5033042)", dueDay: 4, category: "Mortgage", recurrence: "biweekly", amount: "213.24", startingBalance: "95497.92", paymentsRemaining: null },
  { name: "Scotia Visa Inf (4537****5165)", dueDay: 25, category: "Credit Card", recurrence: "weekly", amount: "479.00", startingBalance: "16608.41", paymentsRemaining: null },
  { name: "StanStore", dueDay: 23, category: "Business Expense", recurrence: "monthly", amount: "0.00", startingBalance: null, paymentsRemaining: null, notes: "Business Expense (Wendy)" },
  { name: "TD Car Loan (Ryan)", dueDay: 28, category: "Car", recurrence: "biweekly", amount: "284.89", startingBalance: "19000.00", paymentsRemaining: null },
  { name: "TD Car Loan (Wendy)", dueDay: 15, category: "Car", recurrence: "biweekly", amount: "321.16", startingBalance: "14700.00", paymentsRemaining: null },
  { name: "TD Line of Credit ($24,000)", dueDay: 4, category: "Line of Credit", recurrence: "monthly", amount: "300.00", startingBalance: "24500.00", paymentsRemaining: null },
  { name: "Umbrella", dueDay: 12, category: "Day Care", recurrence: "monthly", amount: "115.59", startingBalance: null, paymentsRemaining: null },
];

// Non-recurring (one-time) expenses - scheduled payments without recurring flag
const oneTimeExpenses = [
  { merchant: "407ETR - WENDY", date: "2026-01-22", category: "Transportation", amount: "211.56", notes: "Starting Balance: $1,015.73" },
  { merchant: "407ETR - WENDY", date: "2026-02-04", category: "Transportation", amount: "250.00", notes: "" },
  { merchant: "407ETR - WENDY", date: "2026-02-17", category: "Transportation", amount: "500.00", notes: "" },
  { merchant: "407ETR - WENDY", date: "2026-02-25", category: "Transportation", amount: "500.00", notes: "" },
  { merchant: "Affirm - Peloton Bike Purchase", date: "2026-02-09", category: "Fitness", amount: "290.03", notes: "Starting Balance: $870.14" },
  { merchant: "Affirm - Peloton Bike Purchase", date: "2026-03-09", category: "Fitness", amount: "290.03", notes: "" },
  { merchant: "Affirm - Peloton Bike Purchase", date: "2026-04-09", category: "Fitness", amount: "290.03", notes: "" },
  { merchant: "Affirm - Peloton Bike Purchase", date: "2026-05-09", category: "Fitness", amount: "290.03", notes: "" },
  { merchant: "ALECTRA HYDRO (8386****2127)", date: "2026-02-11", category: "Electrical", amount: "245.92", notes: "Starting Balance: $245.92" },
  { merchant: "AMAZON MASTERCARD MBNA (*7690)", date: "2026-01-28", category: "Credit Card", amount: "141.90", notes: "Starting Balance: $1,779.95" },
  { merchant: "AMAZON MASTERCARD MBNA (*7690)", date: "2026-02-04", category: "Credit Card", amount: "125.00", notes: "" },
  { merchant: "AMAZON MASTERCARD MBNA (*7690)", date: "2026-02-11", category: "Credit Card", amount: "125.00", notes: "" },
  { merchant: "AMAZON MASTERCARD MBNA (*7690)", date: "2026-02-18", category: "Credit Card", amount: "125.00", notes: "" },
  { merchant: "AMAZON MASTERCARD MBNA (*7690)", date: "2026-02-25", category: "Credit Card", amount: "125.00", notes: "" },
  { merchant: "Bell Mobility", date: "2026-01-28", category: "Communications", amount: "225.00", notes: "Starting Balance: $225.00" },
  { merchant: "FlexPay (Uplift) - Red Tag Trinidad", date: "2026-02-16", category: "Travel", amount: "394.91", notes: "7 payments left" },
  { merchant: "FlexPay (Uplift) - Red Tag Trinidad", date: "2026-03-16", category: "Travel", amount: "394.91", notes: "7 payments left" },
  { merchant: "FlexPay (Uplift) - Red Tag Trinidad", date: "2026-04-16", category: "Travel", amount: "394.91", notes: "7 payments left" },
  { merchant: "FlexPay (Uplift) - Red Tag Trinidad", date: "2026-05-16", category: "Travel", amount: "394.91", notes: "7 payments left" },
  { merchant: "FlexPay (Uplift) - Red Tag Trinidad", date: "2026-06-16", category: "Travel", amount: "394.91", notes: "7 payments left" },
  { merchant: "FlexPay (Uplift) - Red Tag Trinidad", date: "2026-07-16", category: "Travel", amount: "394.91", notes: "7 payments left" },
  { merchant: "Reliance Home Comfort (2000****9278)", date: "2026-01-28", category: "Maintenance", amount: "60.00", notes: "" },
  { merchant: "Reliance Home Comfort (2000****9278)", date: "2026-01-28", category: "Maintenance", amount: "33.57", notes: "" },
  { merchant: "Scotia Mortgage(4945097)", date: "2026-02-01", category: "Mortgage", amount: "2945.00", notes: "Starting Balance: $1,048,165.75" },
  { merchant: "Scotia Mortgage(4945097)", date: "2026-03-01", category: "Mortgage", amount: "4385.00", notes: "" },
  { merchant: "Scotia Mortgage(4945097)", date: "2026-04-01", category: "Mortgage", amount: "4385.00", notes: "" },
  { merchant: "Scotia Mortgage(4945097)", date: "2026-05-01", category: "Mortgage", amount: "4385.00", notes: "" },
  { merchant: "Scotia Visa Inf (4537****5165)", date: "2026-01-28", category: "Credit Card", amount: "228.00", notes: "Starting Balance: $18,371.41" },
  { merchant: "Scotia Visa Inf (4537****5165)", date: "2026-02-04", category: "Credit Card", amount: "600.00", notes: "" },
  { merchant: "Scotia Visa Inf (4537****5165)", date: "2026-02-11", category: "Credit Card", amount: "228.00", notes: "" },
  { merchant: "Scotia Visa Inf (4537****5165)", date: "2026-02-18", category: "Credit Card", amount: "228.00", notes: "" },
  { merchant: "Scotia Visa Inf (4537****5165)", date: "2026-02-25", category: "Credit Card", amount: "228.00", notes: "" },
];

async function importData() {
  console.log("Starting data import...\n");

  // Import recurring bills
  console.log("Importing recurring bills...");
  for (const bill of recurringBills) {
    try {
      const response = await fetch(`${API_BASE}/api/bills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bill),
      });
      if (response.ok) {
        console.log(`✓ Added bill: ${bill.name}`);
      } else {
        const error = await response.text();
        console.log(`✗ Failed to add bill ${bill.name}: ${error}`);
      }
    } catch (err) {
      console.log(`✗ Error adding bill ${bill.name}: ${err}`);
    }
  }

  console.log("\nImporting one-time expenses...");
  for (const expense of oneTimeExpenses) {
    try {
      const response = await fetch(`${API_BASE}/api/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(expense),
      });
      if (response.ok) {
        console.log(`✓ Added expense: ${expense.merchant} (${expense.date})`);
      } else {
        const error = await response.text();
        console.log(`✗ Failed to add expense ${expense.merchant}: ${error}`);
      }
    } catch (err) {
      console.log(`✗ Error adding expense ${expense.merchant}: ${err}`);
    }
  }

  console.log("\nImport complete!");
}

importData();
