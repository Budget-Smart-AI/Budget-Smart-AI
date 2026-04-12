/**
 * Migration: Add Plaid PFC v2 + counterparty enrichment columns to plaid_transactions.
 * Fixes: error: column "personal_finance_category_icon_url" does not exist
 * Run with: node run-counterparty-fields-migration.mjs
 */
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('[Migration] Adding Plaid counterparty + PFC icon columns...');

    await client.query(`
      ALTER TABLE plaid_transactions
      ADD COLUMN IF NOT EXISTS personal_finance_category_icon_url TEXT
    `);
    console.log('[Migration] personal_finance_category_icon_url — done');

    await client.query(`
      ALTER TABLE plaid_transactions
      ADD COLUMN IF NOT EXISTS counterparty_name TEXT
    `);
    console.log('[Migration] counterparty_name — done');

    await client.query(`
      ALTER TABLE plaid_transactions
      ADD COLUMN IF NOT EXISTS counterparty_type TEXT
    `);
    console.log('[Migration] counterparty_type — done');

    await client.query(`
      ALTER TABLE plaid_transactions
      ADD COLUMN IF NOT EXISTS counterparty_website TEXT
    `);
    console.log('[Migration] counterparty_website — done');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_plaid_tx_counterparty_type
      ON plaid_transactions(counterparty_type)
    `);
    console.log('[Migration] Index idx_plaid_tx_counterparty_type — done');

    console.log('[Migration] All done! personal_finance_category_icon_url and counterparty fields are now present.');
  } catch (err) {
    console.error('[Migration] Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
