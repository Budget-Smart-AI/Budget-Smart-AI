# Monarch vs Budget Smart AI — Data Discrepancy Log
## Date: April 16, 2026

---

## ROOT CAUSE: Engine API 401 Unauthorized

**All calls from `app.budgetsmart.io` → `api.budgetsmart.io/api/engine/dashboard` return HTTP 401.**

The session cookie was set before `MAIN_DOMAIN=budgetsmart.io` was deployed to Railway.
Old cookies are scoped to `app.budgetsmart.io` only, so the browser does not send them
to `api.budgetsmart.io`. A logout + re-login will issue a new cookie scoped to
`.budgetsmart.io`, fixing cross-subdomain auth.

**Fix deployed:** MAIN_DOMAIN env var is now set on both Railway services.
**Action required:** User must re-login to pick up the new cookie domain.

---

## SECTION-BY-SECTION COMPARISON

### 1. Dashboard — Real Cash Flow

| Metric | Monarch | Budget Smart AI | Status |
|--------|---------|----------------|--------|
| Income (this month) | $4,248 earned | $0.00 | ❌ ENGINE 401 |
| Expenses (this month) | $12,318 spent | $0.00 | ❌ ENGINE 401 |
| Net surplus | -$8,071 | $0.00 | ❌ ENGINE 401 |
| Bills due this month | $2,411.91 remaining | $0.00 (0 bills) | ❌ ENGINE 401 |

### 2. Net Worth

| Metric | Monarch | Budget Smart AI | Status |
|--------|---------|----------------|--------|
| Net Worth | -$1,195,151.52 | "Unable to calculate" | ❌ ENGINE 401 |
| Total Assets | $3.44 | $0.00 | ❌ |
| Total Liabilities | $1,194,073.19 | $0.00 | ❌ |

### 3. Account Balances (from Plaid)

| Account | Monarch | Budget Smart AI | Status |
|---------|---------|----------------|--------|
| Ultimate Package (...0424) | Checking | $3,629.23 | ✅ Present |
| Momentum PLUS Savings (...6754) | Savings | $1.44 | ✅ Present |
| iTrade-Cash (...1871) | $3.44 | $3.44 | ✅ Match |
| Scotia Mortgage (...3042) | Mortgage | $95,066.40 | ✅ Present |
| Scotia Mortgage (...5097) | Mortgage | $1,058,756.22 | ✅ Present |
| Scotia Momentum VISA (...5165) | Credit Card | $18,308.35 | ✅ Present |
| ScotiaLine LoC (...9014) | $21,870.03 (Monarch) | $22,895.03 (BSAI) | ⚠️ $1,025 diff |

**Note:** ScotiaLine balance differs by ~$1,025. This may be a sync timing issue (BSAI last synced Apr 15, 4:12 PM).

### 4. Recurring Bills / Subscriptions

| Metric | Monarch | Budget Smart AI | Status |
|--------|---------|----------------|--------|
| Total recurring items | 30+ detected | 0 ("No bills found") | ❌ CRITICAL |
| Income recurring | $9,660.37/mo | N/A | ❌ |
| Expense recurring | $4,793.70/mo | N/A | ❌ |
| Remaining due this month | $2,411.91 | $0.00 | ❌ |

**Monarch upcoming bills (sample):**
- Uplift: $394.91 (Apr 16)
- Flexiti: $185.00/week
- Google One: $4.51/mo
- Oxygen Yoga: $77.97/2wk
- Enbridge: $70.00/mo
- CAA Insurance: $253.84/mo
- Telus: $46.23/mo
- iA Financial: $353.75/mo
- Money Mart: $109.77/wk
- EasyFinancial: $81.39/wk
- Coreslab paycheck: $1,927.82/wk (income)

**BSAI bills page shows "No bills found"** despite having transaction history.
The "Detect Bills" button exists but hasn't been run / bills not imported.

### 5. Cash Flow (April 2026)

| Category | Monarch | Budget Smart AI | Status |
|----------|---------|----------------|--------|
| Paychecks | $3,854.45 | Not computed | ❌ ENGINE 401 |
| Mortgage | $4,602.72 | Not computed | ❌ |
| Loan Repayment | $2,987.11 | Not computed | ❌ |
| Cash & ATM | $2,500.00 | Not computed | ❌ |
| Shopping | $475.87 | Not computed | ❌ |
| Fitness | $426.64 | Not computed | ❌ |
| Restaurants | $361.59 | Not computed | ❌ |
| Phone | $333.43 | Not computed | ❌ |
| Medical | $317.99 | Not computed | ❌ |
| Gas | $258.41 | Not computed | ❌ |
| Groceries | $170.65 | Not computed | ❌ |

### 6. Budget

| Metric | Monarch | Budget Smart AI | Status |
|--------|---------|----------------|--------|
| Income budget | $19,290 | $0.00 | ❌ No budgets set |
| Expense budget | $20,070 | $0.00 | ❌ No budgets set |
| Income earned | $4,248 | $0.00 | ❌ |
| Expenses spent | $12,318 | $0.00 | ❌ |

### 7. Transactions

| Metric | Monarch | Budget Smart AI | Status |
|--------|---------|----------------|--------|
| Transaction count | 100+ visible | 100+ visible | ✅ Data present |
| Categories | Well-categorized | Many "Unmatched" | ⚠️ Categories need review |
| Auto-categorization | Working | "Analyzing..." banner shown | ⚠️ Processing |

### 8. Features Working on BSAI (local API, not engine)

| Feature | Status | Data |
|---------|--------|------|
| 30-Day Cash Flow Forecast | ✅ | $3,631 projected |
| Silent Money Leaks | ✅ | 49 found, $5,481/mo |
| Spendability Meter | ✅ | $3,531 safe to spend |
| Daily Allowance | ✅ | $118/day |
| Financial Health Score | ✅ | F (0/100) — but this is because budgets aren't set |

---

## PRIORITY FIX LIST

### P0 — Critical (blocking all engine-powered features)
1. **Engine auth 401** — ✅ FIXED (2026-04-16). Deployed session-refresh middleware
   that auto-regenerates cookies scoped to `.budgetsmart.io`. Commit: `fix: auto-refresh
   session cookies for cross-subdomain engine auth`. User re-login will pick up new domain.

### P1 — High (major data gaps vs Monarch)
2. **Bills not detected** — ✅ FIXED (2026-04-16). Added client-side auto-detect that
   triggers on first visit to bills page when 0 bills exist. Uses `POST /api/bills/detect`
   and imports results with confidence >= 70%. Commit: `feat: auto-detect and import
   recurring bills on first visit` (566e337).
3. **Net Worth page broken** — ⏳ Will auto-resolve once engine auth fix takes effect
   after user re-login. No code change needed.
4. **Budget not set** — Monarch has $19,290 income / $20,070 expense budgets; BSAI has none.
   Manual setup required by user.

### P2 — Medium (data quality)
5. **Transaction categorization** — Many transactions marked "Unmatched" or have
   generic categories. Monarch has richer category assignments.
6. **ScotiaLine balance discrepancy** — $22,895.03 (BSAI) vs $21,870.03 (Monarch).
   May resolve after next Plaid sync.

### P3 — Low (nice to have parity)
7. **Savings rate** — Monarch shows 0% savings rate; BSAI doesn't surface this metric.
8. **Credit score tracking** — Monarch offers this; BSAI doesn't.
9. **Investment tracking** — Monarch has detailed investment page; BSAI has basic.
