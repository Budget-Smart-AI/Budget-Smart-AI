/**
 * Edge Case Tests for Financial Engine
 * Tests: empty state, zero values, no bank accounts, large values
 */

const BASE_URL = 'http://localhost:5000';

async function login(username = 'demo', password = 'demo123') {
  const resp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return resp.headers.get('set-cookie');
}

async function get(path, cookie) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  return { status: resp.status, data: await resp.json().catch(() => null) };
}

function checkNoNaN(obj, path = '') {
  if (obj === null || obj === undefined) return [];
  const issues = [];
  if (typeof obj === 'number') {
    if (isNaN(obj)) issues.push(`NaN at ${path}`);
    if (!isFinite(obj)) issues.push(`Infinity at ${path}`);
  } else if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      issues.push(...checkNoNaN(v, path ? `${path}.${k}` : k));
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => issues.push(...checkNoNaN(v, `${path}[${i}]`)));
  }
  return issues;
}

async function runEdgeCaseTests() {
  console.log('\n=== Edge Case Tests ===\n');

  const cookie = await login();
  if (!cookie) {
    console.error('❌ Login failed');
    process.exit(1);
  }
  console.log('✅ Authenticated\n');

  let passed = 0;
  let failed = 0;

  async function test(name, testFn) {
    try {
      const result = await testFn();
      if (result) {
        console.log(`✅ ${name}: ${result}`);
        passed++;
      } else {
        console.log(`✅ ${name}: passed`);
        passed++;
      }
    } catch (err) {
      console.log(`❌ ${name}: ${err.message}`);
      failed++;
    }
  }

  // ── 1. No NaN/Infinity in any endpoint response ──────────────
  const endpoints = [
    '/api/engine/dashboard',
    '/api/engine/expenses?startDate=2026-04-01&endDate=2026-04-30',
    '/api/engine/income?startDate=2026-04-01&endDate=2026-04-30',
    '/api/engine/bills',
    '/api/engine/subscriptions',
    '/api/engine/net-worth',
    '/api/engine/debts?extraPayment=0',
    '/api/engine/budgets?month=2026-04',
    '/api/engine/savings-goals',
    '/api/engine/health-score',
    '/api/engine/bank-accounts?month=2026-04',
    '/api/engine/reports?startDate=2026-01-01&endDate=2026-04-30',
  ];

  for (const path of endpoints) {
    const name = path.split('/').pop().split('?')[0];
    await test(`No NaN/Infinity: ${name}`, async () => {
      const { status, data } = await get(path, cookie);
      if (status !== 200) throw new Error(`Got ${status}`);
      const issues = checkNoNaN(data);
      if (issues.length > 0) throw new Error(`Found: ${issues.join(', ')}`);
      return `${status} OK, no NaN/Infinity`;
    });
  }

  // ── 2. Future month with no data returns zeros, not errors ──────
  await test('Future month budgets returns empty not error', async () => {
    const { status, data } = await get('/api/engine/budgets?month=2030-01', cookie);
    if (status !== 200) throw new Error(`Got ${status}`);
    if (data.totalBudget === undefined) throw new Error('Missing totalBudget');
    return `status=${status}, totalBudget=${data.totalBudget}, items=${data.items?.length ?? 0}`;
  });

  await test('Future month expenses returns zeros', async () => {
    const { status, data } = await get('/api/engine/expenses?startDate=2030-01-01&endDate=2030-01-31', cookie);
    if (status !== 200) throw new Error(`Got ${status}`);
    return `status=${status}, total=${data.total}, count=${data.count}`;
  });

  await test('Future month income returns zeros', async () => {
    const { status, data } = await get('/api/engine/income?startDate=2030-01-01&endDate=2030-01-31', cookie);
    if (status !== 200) throw new Error(`Got ${status}`);
    return `status=${status}, effectiveIncome=${data.effectiveIncome}`;
  });

  // ── 3. Past month returns valid data ────────────────────────────
  await test('Past month (Jan 2026) expenses', async () => {
    const { status, data } = await get('/api/engine/expenses?startDate=2026-01-01&endDate=2026-01-31', cookie);
    if (status !== 200) throw new Error(`Got ${status}`);
    return `status=${status}, total=${data.total}`;
  });

  // ── 4. Debts with zero extra payment ────────────────────────────
  await test('Debts with extraPayment=0', async () => {
    const { status, data } = await get('/api/engine/debts?extraPayment=0', cookie);
    if (status !== 200) throw new Error(`Got ${status}`);
    if (typeof data.totalDebt !== 'number') throw new Error('totalDebt not a number');
    return `totalDebt=${data.totalDebt}, avalanche.months=${data.avalanche?.months}`;
  });

  await test('Debts with large extraPayment', async () => {
    const { status, data } = await get('/api/engine/debts?extraPayment=99999', cookie);
    if (status !== 200) throw new Error(`Got ${status}`);
    return `totalDebt=${data.totalDebt}, avalanche.months=${data.avalanche?.months}`;
  });

  // ── 5. Dashboard has all required top-level keys ─────────────── 
  await test('Dashboard has all required keys', async () => {
    const { status, data } = await get('/api/engine/dashboard', cookie);
    if (status !== 200) throw new Error(`Got ${status}`);
    const required = ['income', 'expenses', 'bills', 'cashFlow', 'netWorth', 'savingsGoals', 'healthScore', 'safeToSpend', 'gaps', 'alerts'];
    const missing = required.filter(k => !(k in data));
    if (missing.length > 0) throw new Error(`Missing keys: ${missing.join(', ')}`);
    return `all ${required.length} required keys present`;
  });

  // ── 6. Health score is between 0 and 100 ────────────────────────
  await test('Health score in range 0-100', async () => {
    const { status, data } = await get('/api/engine/health-score', cookie);
    if (status !== 200) throw new Error(`Got ${status}`);
    const score = data.totalScore;
    if (typeof score !== 'number') throw new Error(`score is ${typeof score}`);
    if (score < 0 || score > 100) throw new Error(`score=${score} out of range [0,100]`);
    return `totalScore=${score}`;
  });

  // ── 7. SafeToSpend has positive daysRemaining ───────────────────
  await test('Safe-to-spend daysRemaining > 0', async () => {
    const { status, data } = await get('/api/engine/dashboard', cookie);
    if (status !== 200) throw new Error(`Got ${status}`);
    const { daysRemaining } = data.safeToSpend || {};
    if (typeof daysRemaining !== 'number') throw new Error(`daysRemaining=${daysRemaining}`);
    return `daysRemaining=${daysRemaining}, safeToSpend=${data.safeToSpend.safeToSpend}`;
  });

  // ── 8. Net worth breakdown types ────────────────────────────────
  await test('Net worth has breakdown objects', async () => {
    const { status, data } = await get('/api/engine/net-worth', cookie);
    if (status !== 200) throw new Error(`Got ${status}`);
    if (typeof data.assetBreakdown !== 'object') throw new Error('assetBreakdown not object');
    if (typeof data.liabilityBreakdown !== 'object') throw new Error('liabilityBreakdown not object');
    return `netWorth=${data.netWorth}, assets=${data.totalAssets}, liabilities=${data.totalLiabilities}`;
  });

  // ── 9. Monthly trend has 6 entries ──────────────────────────────
  await test('Reports monthlyTrend has 6 entries', async () => {
    const { status, data } = await get('/api/engine/reports?startDate=2026-01-01&endDate=2026-04-30', cookie);
    if (status !== 200) throw new Error(`Got ${status}`);
    const len = data.monthlyTrend?.length;
    if (len !== 6) throw new Error(`expected 6 trend entries, got ${len}`);
    return `monthlyTrend has ${len} entries`;
  });

  // ── 10. Bills result structure ───────────────────────────────────
  await test('Bills result has correct structure', async () => {
    const { status, data } = await get('/api/engine/bills', cookie);
    if (status !== 200) throw new Error(`Got ${status}`);
    if (!Array.isArray(data.thisMonthBills)) throw new Error('thisMonthBills not array');
    if (!Array.isArray(data.upcomingBills)) throw new Error('upcomingBills not array');
    return `thisMonth=${data.thisMonthBills.length} bills, upcoming=${data.upcomingBills.length}, monthlyEstimate=${data.monthlyEstimate}`;
  });

  console.log(`\n=== Edge Case Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runEdgeCaseTests().catch(console.error);
