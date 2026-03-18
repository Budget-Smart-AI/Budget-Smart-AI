/**
 * Run migration: 0027_income_plaid_transaction_id.sql
 * - Adds plaid_transaction_id column to income table
 * - Creates unique index per (user_id, plaid_transaction_id)
 * - Backfills plaid_transaction_id from notes field
 * - Resets is_recurring=false for all auto-imported income records
 */
import { config } from 'dotenv';
config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error('DATABASE_URL not set'); process.exit(1); }

const { default: pg } = await import('pg');
const { Pool } = pg;
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    console.log('Running migration: 0027_income_plaid_transaction_id.sql\n');

    // Step 1: Add column
    console.log('Step 1: Adding plaid_transaction_id column...');
    await client.query(`ALTER TABLE income ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT`);
    console.log('  ✅ Column added (or already exists)');

    // Step 2: Create unique index
    console.log('Step 2: Creating unique index...');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS income_user_plaid_tx_unique
        ON income (user_id, plaid_transaction_id)
        WHERE plaid_transaction_id IS NOT NULL
    `);
    console.log('  ✅ Unique index created (or already exists)');

    // Step 3a: Delete duplicate auto-imported income records (keep only the oldest per user+plaid_tx)
    console.log('Step 3a: Removing duplicate auto-imported income records...');
    const dedupResult = await client.query(`
      DELETE FROM income
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY user_id, substring(notes FROM 'plaid_tx:([A-Za-z0-9_-]+)')
              ORDER BY id ASC
            ) AS rn
          FROM income
          WHERE notes LIKE '%plaid_tx:%'
        ) ranked
        WHERE rn > 1
      )
    `);
    console.log(`  ✅ Deleted ${dedupResult.rowCount} duplicate income records`);

    // Step 3b: Backfill plaid_transaction_id from notes
    console.log('Step 3b: Backfilling plaid_transaction_id from notes...');
    const backfillResult = await client.query(`
      UPDATE income
      SET plaid_transaction_id = substring(notes FROM 'plaid_tx:([A-Za-z0-9_-]+)')
      WHERE notes LIKE '%plaid_tx:%'
        AND plaid_transaction_id IS NULL
    `);
    console.log(`  ✅ Backfilled ${backfillResult.rowCount} records`);

    // Step 4: Reset is_recurring for auto-imported records
    console.log('Step 4: Resetting is_recurring=false for auto-imported income records...');
    const resetResult = await client.query(`
      UPDATE income
      SET
        is_recurring = 'false',
        recurrence = NULL,
        auto_detected = false,
        detected_at = NULL
      WHERE notes LIKE '%Auto-imported from bank transaction%'
        AND is_recurring = 'true'
    `);
    console.log(`  ✅ Reset ${resetResult.rowCount} auto-imported records to is_recurring=false`);

    // Verify
    console.log('\n=== VERIFICATION ===');
    const { rows: stats } = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(plaid_transaction_id) AS with_plaid_tx_id,
        COUNT(CASE WHEN notes LIKE '%Auto-imported from bank transaction%' AND is_recurring = 'true' THEN 1 END) AS still_recurring_auto_imported
      FROM income
    `);
    console.log(`Total income records: ${stats[0].total}`);
    console.log(`Records with plaid_transaction_id: ${stats[0].with_plaid_tx_id}`);
    console.log(`Auto-imported records still marked recurring: ${stats[0].still_recurring_auto_imported}`);

    if (parseInt(stats[0].still_recurring_auto_imported) === 0) {
      console.log('\n✅ Migration successful! No auto-imported records are marked recurring.');
    } else {
      console.log('\n⚠️  Some auto-imported records are still marked recurring. Check manually.');
    }

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
