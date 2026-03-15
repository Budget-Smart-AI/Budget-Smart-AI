import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(__dirname, 'migrations', '0020_bill_payments.sql'), 'utf8');

try {
  await pool.query(sql);
  console.log('✅ bill_payments table created successfully');
} catch (err) {
  console.error('❌ Migration error:', err.message);
} finally {
  await pool.end();
}
