import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(__dirname, 'migrations', '0024_password_reset.sql'), 'utf8');

try {
  await pool.query(sql);
  console.log('✅ password_reset_tokens and mfa_recovery_codes tables created successfully');
} catch (err) {
  console.error('❌ Migration error:', err.message);
} finally {
  await pool.end();
}
