const fs = require('fs');
const content = fs.readFileSync('server/routes.ts', 'utf8');
const lines = content.split('\n');

const startIdx = lines.findIndex(l => l.includes('POST /api/user/load-demo-data')) - 1;
const returnIdx = lines.findIndex((l, i) => i > startIdx && l.includes('return httpServer'));
const endIdx = returnIdx - 2;

console.log('Replacing lines', startIdx+1, 'to', endIdx+1);

const newRoute = `  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/user/load-demo-data — Seed realistic Canadian household demo data
  // ──────────────────────────────────────────────────────────────────────────
  app.post("/api/user/load-demo-data", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const now = new Date();

      // Helper: date string N days ago (negative = future)
      const daysAgo = (n: number) => {
        const d = new Date(now);
        d.setDate(d.getDate() - n);
        return d.toISOString().split("T")[0];
      };

      // ── 1. Create 3 demo manual accounts ──────────────────────────────────
      const acctResult = await pool.query(
        \`INSERT INTO manual_accounts (user_id, name, type, subtype, balance, currency, is_active)
         VALUES
           ($1, 'TD Chequing', 'depository', 'checking', '3842.17', 'CAD', true),
           ($1, 'TD Savings', 'depository', 'savings', '12500.00', 'CAD', true),
           ($1, 'TD Visa Credit Card', 'credit', 'credit card', '-1247.83', 'CAD', true)
         RETURNING id, name\`,
        [userId]
      );
      const accounts = acctResult.rows as { id: string; name: string }[];
      const chequingId = accounts.find(a => a.name.includes("Chequing"))?.id;
      const savingsId  = accounts.find(a => a.name.includes("Savings"))?.id;
      const visaId     = accounts.find(a => a.name.includes("Visa"))?.id;

      if (!chequingId || !savingsId || !visaId) {
        return res.status(500).json({ error: "Failed to create demo accounts" });
      }

      // ── 2. Seed 3 months of transactions ──────────────────────────────────
      const txns = [
        // Month 1 (60-90 days ago)
        { accountId: chequingId, amount: "2850.00",  merchant: "Payroll Deposit - Employer Inc",   category: "Income",         date: daysAgo(87) },
        { accountId: chequingId, amount: "-1650.00", merchant: "Rent Payment - 123 Main St",       category: "Rent",           date: daysAgo(85) },
        { accountId: chequingId, amount: "-124.50",  merchant: "Hydro One - Electricity",          category: "Electricity",    date: daysAgo(82) },
        { accountId: chequingId, amount: "-89.99",   merchant: "Rogers - Internet",                category: "Internet",       date: daysAgo(80) },
        { accountId: visaId,     amount: "-312.47",  merchant: "Loblaws - Groceries",              category: "Groceries",      date: daysAgo(78) },
        { accountId: visaId,     amount: "-67.23",   merchant: "Shoppers Drug Mart",               category: "Pharmacy",       date: daysAgo(76) },
        { accountId: visaId,     amount: "-48.50",   merchant: "Tim Hortons",                      category: "Coffee Shops",   date: daysAgo(74) },
        { accountId: visaId,     amount: "-156.00",  merchant: "Canadian Tire - Auto",             category: "Transportation", date: daysAgo(72) },
        { accountId: chequingId, amount: "-75.00",   merchant: "Netflix / Spotify / Disney+",      category: "Subscriptions",  date: daysAgo(70) },
        { accountId: visaId,     amount: "-234.89",  merchant: "Metro - Groceries",                category: "Groceries",      date: daysAgo(68) },
        { accountId: visaId,     amount: "-42.00",   merchant: "Cineplex - Movies",                category: "Entertainment",  date: daysAgo(65) },
        { accountId: chequingId, amount: "-500.00",  merchant: "Transfer to Savings",              category: "Savings",        date: daysAgo(63) },
        // Month 2 (30-60 days ago)
        { accountId: chequingId, amount: "2850.00",  merchant: "Payroll Deposit - Employer Inc",   category: "Income",         date: daysAgo(57) },
        { accountId: chequingId, amount: "-1650.00", merchant: "Rent Payment - 123 Main St",       category: "Rent",           date: daysAgo(55) },
        { accountId: chequingId, amount: "-118.30",  merchant: "Hydro One - Electricity",          category: "Electricity",    date: daysAgo(52) },
        { accountId: chequingId, amount: "-89.99",   merchant: "Rogers - Internet",                category: "Internet",       date: daysAgo(50) },
        { accountId: visaId,     amount: "-289.12",  merchant: "Loblaws - Groceries",              category: "Groceries",      date: daysAgo(48) },
        { accountId: visaId,     amount: "-85.00",   merchant: "LCBO",                             category: "Food & Dining",  date: daysAgo(46) },
        { accountId: visaId,     amount: "-52.40",   merchant: "Starbucks",                        category: "Coffee Shops",   date: daysAgo(44) },
        { accountId: visaId,     amount: "-199.99",  merchant: "Amazon.ca - Shopping",             category: "Shopping",       date: daysAgo(42) },
        { accountId: chequingId, amount: "-75.00",   merchant: "Netflix / Spotify / Disney+",      category: "Subscriptions",  date: daysAgo(40) },
        { accountId: visaId,     amount: "-267.45",  merchant: "Costco - Groceries",               category: "Groceries",      date: daysAgo(38) },
        { accountId: visaId,     amount: "-120.00",  merchant: "Goodlife Fitness",                 category: "Gym",            date: daysAgo(36) },
        { accountId: chequingId, amount: "-500.00",  merchant: "Transfer to Savings",              category: "Savings",        date: daysAgo(33) },
        // Month 3 (0-30 days ago)
        { accountId: chequingId, amount: "2850.00",  merchant: "Payroll Deposit - Employer Inc",   category: "Income",         date: daysAgo(27) },
        { accountId: chequingId, amount: "-1650.00", merchant: "Rent Payment - 123 Main St",       category: "Rent",           date: daysAgo(25) },
        { accountId: chequingId, amount: "-131.20",  merchant: "Hydro One - Electricity",          category: "Electricity",    date: daysAgo(22) },
        { accountId: chequingId, amount: "-89.99",   merchant: "Rogers - Internet",                category: "Internet",       date: daysAgo(20) },
        { accountId: visaId,     amount: "-301.78",  merchant: "Loblaws - Groceries",              category: "Groceries",      date: daysAgo(18) },
        { accountId: visaId,     amount: "-38.50",   merchant: "Tim Hortons",                      category: "Coffee Shops",   date: daysAgo(16) },
        { accountId: visaId,     amount: "-145.00",  merchant: "Indigo Books & Music",             category: "Shopping",       date: daysAgo(14) },
        { accountId: chequingId, amount: "-75.00",   merchant: "Netflix / Spotify / Disney+",      category: "Subscriptions",  date: daysAgo(12) },
        { accountId: visaId,     amount: "-223.60",  merchant: "Metro - Groceries",                category: "Groceries",      date: daysAgo(10) },
        { accountId: visaId,     amount: "-89.00",   merchant: "Uber Eats",                        category: "Restaurants",    date: daysAgo(8)  },
        { accountId: visaId,     amount: "-55.00",   merchant: "Cineplex - Movies",                category: "Entertainment",  date: daysAgo(6)  },
        { accountId: chequingId, amount: "-500.00",  merchant: "Transfer to Savings",              category: "Savings",        date: daysAgo(4)  },
      ];

      for (const t of txns) {
        await pool.query(
          \`INSERT INTO manual_transactions (user_id, account_id, date, amount, merchant, category)
           VALUES ($1, $2, $3, $4, $5, $6)\`,
          [userId, t.accountId, t.date, t.amount, t.merchant, t.category]
        );
      }

      // ── 3. Seed budgets ───────────────────────────────────────────────────
      const currentMonth = now.toISOString().slice(0, 7); // YYYY-MM
      const budgets = [
        { category: "Groceries",     amount: "800.00"  },
        { category: "Restaurants",   amount: "200.00"  },
        { category: "Coffee Shops",  amount: "80.00"   },
        { category: "Entertainment", amount: "150.00"  },
        { category: "Shopping",      amount: "300.00"  },
        { category: "Transportation",amount: "200.00"  },
        { category: "Subscriptions", amount: "100.00"  },
      ];
      for (const b of budgets) {
        await pool.query(
          \`INSERT INTO budgets (user_id, category, amount, month)
           VALUES ($1, $2, $3, $4)\`,
          [userId, b.category, b.amount, currentMonth]
        );
      }

      // ── 4. Seed savings goals ─────────────────────────────────────────────
      const goals = [
        { name: "Emergency Fund",     targetAmount: "10000.00", currentAmount: "4200.00", targetDate: daysAgo(-180) },
        { name: "Vacation to Europe", targetAmount: "5000.00",  currentAmount: "1800.00", targetDate: daysAgo(-365) },
        { name: "New Laptop",         targetAmount: "2000.00",  currentAmount: "950.00",  targetDate: daysAgo(-90)  },
      ];
      for (const g of goals) {
        await pool.query(
          \`INSERT INTO savings_goals (user_id, name, target_amount, current_amount, target_date)
           VALUES ($1, $2, $3, $4, $5)\`,
          [userId, g.name, g.targetAmount, g.currentAmount, g.targetDate]
        );
      }

      res.json({ success: true, message: "Demo data loaded successfully" });
    } catch (error: any) {
      console.error("load-demo-data error:", error);
      res.status(500).json({ error: "Failed to load demo data" });
    }
  });`;

const newRouteLines = newRoute.split('\n');
const before = lines.slice(0, startIdx);
const after = lines.slice(endIdx + 1);
const newLines = [...before, ...newRouteLines, ...after];
fs.writeFileSync('server/routes.ts', newLines.join('\n'), 'utf8');
console.log('Done. Total lines:', newLines.length, '(was', lines.length, ')');
console.log('Replaced lines', startIdx+1, 'to', endIdx+1, 'with', newRouteLines.length, 'lines');
