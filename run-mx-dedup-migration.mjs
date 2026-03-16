import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running MX dedup migration...');

    // Step 1: Rename column plaid_transaction_id -> external_transaction_id
    await client.query(`
      ALTER TABLE expenses
      RENAME COLUMN plaid_transaction_id TO external_transaction_id
    `);
    console.log('✓ Renamed column plaid_transaction_id -> external_transaction_id');

    // Step 2: Drop old unique index
    await client.query(`
      DROP INDEX IF EXISTS expenses_user_plaid_transaction_unique
    `);
    console.log('✓ Dropped old index expenses_user_plaid_transaction_unique');

    // Step 3: Create new unique index with new name
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS expenses_user_external_transaction_unique
      ON expenses (user_id, external_transaction_id)
      WHERE external_transaction_id IS NOT NULL
    `);
    console.log('✓ Created new index expenses_user_external_transaction_unique');

    console.log('\nMigration complete!');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
