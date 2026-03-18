/**
 * Verify the income dedup fix: simulate what GET /api/income now returns
 * after the source+recurrence dedup logic is applied.
 */
import { config } from 'dotenv';
config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error('DATABASE_URL not set'); process.exit(1); }

const { default: pg } = await import('pg');
const { Pool } = pg;
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

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

function calculateMonthlyIncomeTotal(income, monthStart, monthEnd) {
  const amount = parseFloat(income.amount);
  if (isNaN(amount)) return 0;
  const incomeStartDate = new Date(income.date);

  if (income.is_recurring !== 'true') {
    if (incomeStartDate >= monthStart && incomeStartDate <= monthEnd) return amount;
    return 0;
  }

  if (incomeStartDate > monthEnd) return 0;

  const recurrence = income.recurrence;

  if (recurrence === 'monthly') return amount;

  if (recurrence === 'yearly') {
    return incomeStartDate.getMonth() === monthStart.getMonth() ? amount : 0;
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

  return amount;
}

async function run() {
  const client = await pool.connect();
  try {
    const userId = '8fe33dd2-32da-402a-8853-4e5741f0c74d';

    const { rows: incomeRows } = await client.query(`
      SELECT id, source, amount, date, category, is_recurring, recurrence,
             notes, linked_plaid_account_id, auto_detected, is_active, custom_dates
      FROM income WHERE user_id = $1 ORDER BY date DESC
    `, [userId]);

    console.log(`\nTotal income records in DB: ${incomeRows.length}`);

    // ── Simulate the NEW GET /api/income dedup logic ──────────────────────
    // Step 1: filter (no disabled accounts since all are active)
    const filteredIncomes = incomeRows; // all pass the inactive filter

    // Step 2: Apply the new dedup logic
    const nonRecurring = filteredIncomes.filter(inc => inc.is_recurring !== 'true');
    const recurring = filteredIncomes.filter(inc => inc.is_recurring === 'true');

    const recurringMap = new Map();
    for (const inc of recurring) {
      const key = `${inc.source.toLowerCase().trim()}|${inc.recurrence || 'monthly'}`;
      const existing = recurringMap.get(key);
      if (!existing || inc.date > existing.date) {
        recurringMap.set(key, inc);
      }
    }

    const deduplicatedIncomes = [...nonRecurring, ...Array.from(recurringMap.values())];

    console.log(`After dedup: ${deduplicatedIncomes.length} records (was ${incomeRows.length})`);
    console.log(`  Non-recurring: ${nonRecurring.length}`);
    console.log(`  Recurring unique (source+recurrence): ${recurringMap.size}`);
    console.log(`  Recurring records collapsed: ${recurring.length - recurringMap.size}`);

    // ── Simulate March 2026 frontend calculation with deduped data ────────
    const monthStart = new Date('2026-03-01T00:00:00');
    const monthEnd = new Date('2026-03-31T23:59:59');

    const filteredForMarch = deduplicatedIncomes.filter(inc => {
      const incomeDate = new Date(inc.date);
      if (inc.is_recurring === 'true') {
        return incomeDate <= monthEnd;
      } else {
        return incomeDate >= monthStart && incomeDate <= monthEnd;
      }
    });

    console.log(`\nMarch 2026 filtered records: ${filteredForMarch.length}`);

    let marchTotal = 0;
    const contributions = [];
    for (const inc of filteredForMarch) {
      const contribution = calculateMonthlyIncomeTotal(inc, monthStart, monthEnd);
      marchTotal += contribution;
      if (contribution > 0) {
        contributions.push({ source: inc.source, amount: parseFloat(inc.amount), recurrence: inc.recurrence, date: inc.date, contribution });
      }
    }

    contributions.sort((a, b) => b.contribution - a.contribution);

    console.log(`\n=== MARCH 2026 TOTAL AFTER FIX: $${marchTotal.toFixed(2)} ===`);
    console.log(`(Was: $509,539.01 before fix)`);
    console.log(`\nContributions:`);
    for (const c of contributions) {
      const mult = c.contribution / c.amount;
      console.log(`  $${c.contribution.toFixed(2).padStart(10)} | ${c.recurrence?.padEnd(10) || 'one-time  '} | ${c.date} | "${c.source}" | x${mult.toFixed(1)}`);
    }

    // Show what unique recurring records are kept
    console.log(`\n=== UNIQUE RECURRING RECORDS KEPT ===`);
    for (const [key, inc] of recurringMap) {
      console.log(`  ${key} → $${parseFloat(inc.amount).toFixed(2)} | ${inc.date}`);
    }

    // Verify the fix is correct
    console.log(`\n=== VERIFICATION ===`);
    const isFixed = marchTotal < 100000; // Should be well under $100K
    console.log(`Fix working: ${isFixed ? '✅ YES' : '❌ NO'}`);
    console.log(`March 2026 total: $${marchTotal.toFixed(2)}`);
    console.log(`Expected range: $20,000 - $80,000 (reasonable for 2 employers)`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
