/**
 * Diagnostic script: reverse-engineer the $449K income total
 * Run: node check-income-data.mjs
 */
import { config } from 'dotenv';
config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error('DATABASE_URL not set'); process.exit(1); }

const { default: pg } = await import('pg');
const { Pool } = pg;
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

// ── Replicate the frontend calculateMonthlyIncomeTotal logic ──────────────────
function addWeeks(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n * 7);
  return d;
}
function getDay(date) { return new Date(date).getDay(); }
function eachDayOfInterval(start, end) {
  const days = [];
  const d = new Date(start);
  while (d <= end) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return days;
}
function getDaysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function calculateMonthlyIncomeTotal(income, monthStart, monthEnd) {
  const amount = parseFloat(income.amount);
  if (isNaN(amount)) return 0;
  const incomeStartDate = new Date(income.date);

  if (income.is_recurring !== 'true') {
    if (incomeStartDate >= monthStart && incomeStartDate <= monthEnd) return amount;
    return 0;
  }

  // Recurring: must have started on or before end of month
  if (incomeStartDate > monthEnd) return 0;

  const recurrence = income.recurrence;

  if (recurrence === 'custom' && income.custom_dates) {
    try {
      const customDays = JSON.parse(income.custom_dates);
      const daysInMonth = getDaysInMonth(monthStart);
      const validDays = customDays.filter(d => d <= daysInMonth);
      return amount * validDays.length;
    } catch { return amount; }
  }

  if (recurrence === 'monthly') return amount;

  if (recurrence === 'yearly') {
    const startMonth = incomeStartDate.getMonth();
    const selectedMonth = monthStart.getMonth();
    return startMonth === selectedMonth ? amount : 0;
  }

  if (recurrence === 'weekly') {
    const dayOfWeek = getDay(incomeStartDate);
    let count = 0;
    const allDays = eachDayOfInterval(monthStart, monthEnd);
    for (const day of allDays) {
      if (getDay(day) === dayOfWeek && day >= incomeStartDate) count++;
    }
    return amount * count;
  }

  if (recurrence === 'biweekly') {
    let count = 0;
    let payDate = new Date(incomeStartDate);
    while (payDate < monthStart) payDate = addWeeks(payDate, 2);
    while (payDate <= monthEnd) { count++; payDate = addWeeks(payDate, 2); }
    return amount * count;
  }

  return amount; // fallback
}

async function run() {
  const client = await pool.connect();
  try {
    // Focus on the main user
    const userId = '8fe33dd2-32da-402a-8853-4e5741f0c74d';
    const email = 'ryan.mahabir@outlook.com';

    const { rows: incomeRows } = await client.query(`
      SELECT id, source, amount, date, category, is_recurring, recurrence,
             notes, linked_plaid_account_id, auto_detected, is_active,
             custom_dates
      FROM income WHERE user_id = $1 ORDER BY date DESC
    `, [userId]);

    // Simulate March 2026 frontend calculation
    const monthStart = new Date('2026-03-01T00:00:00');
    const monthEnd = new Date('2026-03-31T23:59:59');

    // Filter: same as frontend filteredIncome
    const filteredIncome = incomeRows.filter(inc => {
      const incomeDate = new Date(inc.date);
      if (inc.is_recurring === 'true') {
        return incomeDate <= monthEnd;
      } else {
        return incomeDate >= monthStart && incomeDate <= monthEnd;
      }
    });

    console.log(`\n=== MARCH 2026 FRONTEND SIMULATION for ${email} ===`);
    console.log(`Total records after filter: ${filteredIncome.length}`);

    let grandTotal = 0;
    const contributions = [];

    for (const inc of filteredIncome) {
      const contribution = calculateMonthlyIncomeTotal(inc, monthStart, monthEnd);
      grandTotal += contribution;
      if (contribution > 0) {
        contributions.push({ source: inc.source, amount: parseFloat(inc.amount), recurrence: inc.recurrence, date: inc.date, is_recurring: inc.is_recurring, contribution });
      }
    }

    // Sort by contribution descending
    contributions.sort((a, b) => b.contribution - a.contribution);

    console.log(`\nSimulated March 2026 total: $${grandTotal.toFixed(2)}`);
    console.log(`\nTop contributors:`);
    for (const c of contributions) {
      const mult = c.contribution / c.amount;
      console.log(`  $${c.contribution.toFixed(2).padStart(12)} | ${c.recurrence?.padEnd(10) || 'one-time   '} | ${c.date} | "${c.source}" | base=$${c.amount.toFixed(2)} x${mult.toFixed(1)}`);
    }

    // Show the PROBLEM: recurring records from old dates still projecting into March 2026
    console.log(`\n=== PROBLEM RECORDS: Old recurring income projecting into March 2026 ===`);
    const oldRecurring = filteredIncome.filter(inc => {
      const incomeDate = new Date(inc.date);
      return inc.is_recurring === 'true' && incomeDate < monthStart;
    });
    console.log(`${oldRecurring.length} old recurring records still active in March 2026:`);
    let oldTotal = 0;
    for (const inc of oldRecurring) {
      const contribution = calculateMonthlyIncomeTotal(inc, monthStart, monthEnd);
      oldTotal += contribution;
      console.log(`  $${contribution.toFixed(2).padStart(12)} | ${inc.recurrence?.padEnd(10)} | started ${inc.date} | "${inc.source}"`);
    }
    console.log(`Old recurring subtotal: $${oldTotal.toFixed(2)}`);

    // Show what the CORRECT total should be (only March 2026 records)
    console.log(`\n=== CORRECT TOTAL: Only March 2026 actual transactions ===`);
    const march2026Only = incomeRows.filter(inc => inc.date >= '2026-03-01' && inc.date <= '2026-03-31');
    let correctTotal = 0;
    for (const inc of march2026Only) {
      const amt = parseFloat(inc.amount);
      correctTotal += amt;
      console.log(`  $${amt.toFixed(2).padStart(10)} | ${inc.date} | ${inc.is_recurring === 'true' ? inc.recurrence : 'one-time'} | "${inc.source}"`);
    }
    console.log(`Correct March 2026 total (raw): $${correctTotal.toFixed(2)}`);

    // Show what the correct total should be with proper recurrence (only March records projected)
    console.log(`\n=== CORRECT TOTAL with recurrence (only March-started records) ===`);
    let correctRecurringTotal = 0;
    for (const inc of march2026Only) {
      const contribution = calculateMonthlyIncomeTotal(inc, monthStart, monthEnd);
      correctRecurringTotal += contribution;
      const mult = contribution / parseFloat(inc.amount);
      console.log(`  $${contribution.toFixed(2).padStart(10)} | ${inc.recurrence?.padEnd(10) || 'one-time  '} | x${mult.toFixed(1)} | "${inc.source}"`);
    }
    console.log(`Correct March 2026 total (with recurrence): $${correctRecurringTotal.toFixed(2)}`);

    // Identify the DUPLICATE records (same source, same amount, different dates in same month)
    console.log(`\n=== DUPLICATE SOURCES in March 2026 ===`);
    const sourceGroups = {};
    for (const inc of march2026Only) {
      const key = inc.source;
      if (!sourceGroups[key]) sourceGroups[key] = [];
      sourceGroups[key].push(inc);
    }
    for (const [source, records] of Object.entries(sourceGroups)) {
      if (records.length > 1) {
        console.log(`  "${source}" appears ${records.length}x:`);
        for (const r of records) {
          console.log(`    $${parseFloat(r.amount).toFixed(2)} | ${r.date} | ${r.category} | recurring:${r.is_recurring} | ${r.notes?.substring(0,50)}`);
        }
      }
    }

    // Show the FULL picture: what's wrong
    console.log(`\n=== ROOT CAUSE SUMMARY ===`);
    console.log(`DB has ${incomeRows.length} total income records for this user`);
    console.log(`${incomeRows.filter(r => r.is_recurring === 'true').length} are marked as recurring`);
    console.log(`${oldRecurring.length} old recurring records (pre-March 2026) are projecting into March 2026`);
    console.log(`Frontend simulated total: $${grandTotal.toFixed(2)}`);
    console.log(`Correct March 2026 total: $${correctRecurringTotal.toFixed(2)}`);
    console.log(`Inflation factor: ${(grandTotal / correctRecurringTotal).toFixed(1)}x`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
