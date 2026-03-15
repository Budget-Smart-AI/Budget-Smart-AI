import pg from 'pg';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = readFileSync('./migrations/0022_spending_alerts.sql', 'utf8');

try {
  await pool.query(sql);
  console.log('✅ spending_alerts table created successfully');
} catch (err) {
  if (err.message.includes('already exists')) {
    console.log('ℹ️  spending_alerts table already exists, skipping');
  } else {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
} finally {
  await pool.end();
}
