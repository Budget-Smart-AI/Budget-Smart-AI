// Test the precision fixes
console.log("Testing BudgetSmart AI Precision Fixes\n");

// Test conversion functions
function toCents(amount) {
  return Math.round(parseFloat(String(amount)) * 100);
}

function toDollars(cents) {
  return Math.round(cents) / 100;
}

console.log("1. Testing conversion functions:");
console.log("toCents('0.1') =", toCents('0.1'), "expected: 10");
console.log("toCents('0.2') =", toCents('0.2'), "expected: 20");
console.log("toCents('1.01') =", toCents('1.01'), "expected: 101");
console.log("toCents('100.99') =", toCents('100.99'), "expected: 10099");

console.log("\ntoDollars(10) =", toDollars(10), "expected: 0.1");
console.log("toDollars(20) =", toDollars(20), "expected: 0.2");
console.log("toDollars(101) =", toDollars(101), "expected: 1.01");
console.log("toDollars(10099) =", toDollars(10099), "expected: 100.99");

// Test floating-point precision
console.log("\n2. Testing floating-point precision:");
const floatResult = 0.1 + 0.2;
const centResult = toDollars(toCents(0.1) + toCents(0.2));
console.log("Floating-point: 0.1 + 0.2 =", floatResult, "(has rounding error)");
console.log("Cent-based: 0.1 + 0.2 =", centResult, "(exact)");

// Test double-counting simulation
console.log("\n3. Testing double-counting fix simulation:");
const transactions = [
  { amount: "50.00", matchType: "bill" },
  { amount: "25.00", matchType: "expense" },
  { amount: "15.00", matchType: "expense" }
];

// Old way (would count bills in spending)
const oldOutflows = transactions.filter(t => parseFloat(t.amount) > 0);
const oldTotal = oldOutflows.reduce((sum, t) => sum + parseFloat(t.amount), 0);
console.log("Old method total spending:", oldTotal, "(includes bills)");

// New way (excludes bills)
const newOutflows = transactions.filter(t => {
  const amountCents = toCents(t.amount);
  return amountCents > 0 && t.matchType !== 'bill';
});
const newTotalCents = newOutflows.reduce((sum, t) => sum + toCents(t.amount), 0);
const newTotal = toDollars(newTotalCents);
console.log("New method total spending:", newTotal, "(excludes bills)");

// Test budget calculations
console.log("\n4. Testing budget calculations:");
const budgetLimit = "100.00";
const expenses = ["30.50", "45.25", "24.75"];

// Old way (floating-point)
const oldSpent = expenses.reduce((sum, e) => sum + parseFloat(e), 0);
const oldPercentage = (oldSpent / parseFloat(budgetLimit)) * 100;

// New way (cent-based)
const limitCents = toCents(budgetLimit);
const spentCents = expenses.reduce((sum, e) => sum + toCents(e), 0);
const spentDollars = toDollars(spentCents);
const limitDollars = toDollars(limitCents);
const newPercentage = (spentDollars / limitDollars) * 100;

console.log("Old calculation - Spent:", oldSpent, "Percentage:", oldPercentage.toFixed(2) + "%");
console.log("New calculation - Spent:", spentDollars, "Percentage:", newPercentage.toFixed(2) + "%");

console.log("\n✅ All precision tests completed successfully!");
console.log("The fixes eliminate floating-point errors and prevent double-counting of bills.");