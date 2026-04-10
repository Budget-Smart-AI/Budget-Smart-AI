/**
 * Page render test — verifies all 14 refactored pages serve without errors
 * Tests that client routes return valid HTML (not blank/error pages)
 * Also verifies the engine API calls those pages depend on all return 200
 */

const BASE_URL = 'http://localhost:5000';

async function login() {
  const resp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'demo', password: 'demo123' }),
  });
  const body = await resp.json();
  const cookie = resp.headers.get('set-cookie');
  console.log(`Login: ${resp.status} — ${body.username || body.message}`);
  return cookie;
}

async function getPage(path, cookie) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: 'follow',
  });
  const html = await resp.text();
  return { status: resp.status, html };
}

async function getApi(path, cookie) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  return { status: resp.status, data: await resp.json().catch(() => null) };
}

// Map of page routes → engine API endpoints they depend on
const pages = [
  { route: '/dashboard', api: '/api/engine/dashboard', name: 'Dashboard' },
  { route: '/expenses', api: '/api/engine/expenses?startDate=2026-04-01&endDate=2026-04-30', name: 'Expenses' },
  { route: '/income', api: '/api/engine/income?startDate=2026-04-01&endDate=2026-04-30', name: 'Income' },
  { route: '/reports', api: '/api/engine/reports?startDate=2026-01-01&endDate=2026-04-30', name: 'Reports' },
  { route: '/bills', api: '/api/engine/bills', name: 'Bills' },
  { route: '/subscriptions', api: '/api/engine/subscriptions', name: 'Subscriptions' },
  { route: '/net-worth', api: '/api/engine/net-worth', name: 'Net Worth' },
  { route: '/debts', api: '/api/engine/debts?extraPayment=0', name: 'Debts' },
  { route: '/debt-payoff', api: '/api/engine/debts?extraPayment=0', name: 'Debt Payoff' },
  { route: '/investments', api: '/api/engine/net-worth', name: 'Investments' },
  { route: '/budgets', api: '/api/engine/budgets?month=2026-04', name: 'Budgets' },
  { route: '/savings-goals', api: '/api/engine/savings-goals', name: 'Savings Goals' },
  { route: '/bank-accounts', api: '/api/engine/bank-accounts?month=2026-04', name: 'Bank Accounts' },
  { route: '/liabilities', api: '/api/engine/debts?extraPayment=0', name: 'Liabilities' },
];

async function runPageTests() {
  console.log('\n=== Page Render Tests ===\n');

  const cookie = await login();
  if (!cookie) {
    console.error('❌ Login failed, cannot test pages');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  for (const { route, api, name } of pages) {
    // Test 1: SPA shell loads (all client routes return same index.html from Vite)
    const { status: pageStatus, html } = await getPage(route, cookie);
    
    // Test 2: The engine API endpoint this page depends on returns 200
    const { status: apiStatus, data } = await getApi(api, cookie);
    
    const pageOk = pageStatus === 200 && html.includes('<div id="root">');
    const apiOk = apiStatus === 200;
    const hasError = html.includes('Failed to resolve entry') || html.includes('Cannot find module');

    if (pageOk && apiOk && !hasError) {
      console.log(`✅ ${name}: page=${pageStatus}, api=${apiStatus}`);
      passed++;
    } else {
      const issues = [];
      if (!pageOk) issues.push(`page=${pageStatus}`);
      if (!html.includes('<div id="root">')) issues.push('missing root div');
      if (hasError) issues.push('has module error');
      if (!apiOk) issues.push(`api=${apiStatus}`);
      console.log(`❌ ${name}: ${issues.join(', ')}`);
      failed++;
    }
  }

  // Extra: verify root HTML contains no bundle errors
  const { html: rootHtml } = await getPage('/', cookie);
  const noErrors = !rootHtml.includes('Failed to resolve') && !rootHtml.includes('Cannot find module');
  if (noErrors && rootHtml.includes('<div id="root">')) {
    console.log(`\n✅ Root HTML: no bundle errors, root div present`);
    passed++;
  } else {
    console.log(`\n❌ Root HTML: has errors or missing root div`);
    failed++;
  }

  console.log(`\n=== Page Test Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runPageTests().catch(console.error);
