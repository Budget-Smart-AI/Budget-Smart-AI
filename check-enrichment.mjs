import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    // First check what columns exist
    const cols = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'plaid_transactions'
      ORDER BY ordinal_position
    `);
    console.log('=== PLAID_TRANSACTIONS COLUMNS ===');
    console.log(cols.rows.map(r => r.column_name).join(', '));

    // Count enrichment coverage
    const res = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(merchant_name) as has_merchant_name,
        COUNT(logo_url) as has_logo_url,
        COUNT(website) as has_website,
        COUNT(enrichment_source) as has_enrichment_source,
        COUNT(personal_finance_category) as has_pfc,
        ROUND(COUNT(merchant_name)::numeric / NULLIF(COUNT(*),0) * 100, 1) as merchant_name_pct,
        ROUND(COUNT(logo_url)::numeric / NULLIF(COUNT(*),0) * 100, 1) as logo_pct,
        ROUND(COUNT(personal_finance_category)::numeric / NULLIF(COUNT(*),0) * 100, 1) as pfc_pct
      FROM plaid_transactions
      WHERE is_active = 'true'
    `);
    console.log('\n=== PLAID TRANSACTION ENRICHMENT STATUS ===');
    console.table(res.rows);

    // Sample recent transactions
    const sample = await pool.query(`
      SELECT 
        name, merchant_name, logo_url,
        enrichment_source, personal_finance_category, category
      FROM plaid_transactions
      WHERE is_active = 'true'
      ORDER BY date DESC
      LIMIT 15
    `);
    console.log('\n=== SAMPLE TRANSACTIONS (last 15) ===');
    console.table(sample.rows);

    // Check if merchant_name differs from name (showing enrichment is adding value)
    const enriched = await pool.query(`
      SELECT 
        name as raw_name,
        merchant_name as enriched_name,
        personal_finance_category as pfc,
        logo_url IS NOT NULL as has_logo
      FROM plaid_transactions
      WHERE is_active = 'true'
        AND merchant_name IS NOT NULL
        AND merchant_name != name
      ORDER BY date DESC
      LIMIT 10
    `);
    console.log('\n=== TRANSACTIONS WHERE ENRICHMENT CHANGED THE NAME ===');
    if (enriched.rows.length === 0) {
      console.log('⚠️  NO ROWS FOUND - merchant_name either matches raw name or is null for all transactions');
    } else {
      console.table(enriched.rows);
    }

  } catch(e) {
    console.error('DB ERROR:', e.message);
    console.error(e.stack);
  }
  await pool.end();
}

check();
