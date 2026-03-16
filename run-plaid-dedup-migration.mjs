/**
 * Migration: Add plaid_transaction_id column + partial unique index to expenses table.
 * Run with: node run-plaid-dedup-migration.mjs
 */
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('[Migration] Adding plaid_transaction_id column to expenses...');
    await client.query(`
      ALTER TABLE expenses
      ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT
    `);
    console.log('[Migration] Column added (or already exists).');

    console.log('[Migration] Creating partial unique index...');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS expenses_user_plaid_transaction_unique
      ON expenses (user_id, plaid_transaction_id)
      WHERE plaid_transaction_id IS NOT NULL
    `);
    console.log('[Migration] Unique index created (or already exists).');

    console.log('[Migration] Done!');
  } catch (err) {
    console.error('[Migration] Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
