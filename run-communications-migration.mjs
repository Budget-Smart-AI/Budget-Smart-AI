import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(__dirname, 'migrations', '0025_communications_hub.sql'), 'utf8');

try {
  await pool.query(sql);
  console.log('✅ Communications Hub migration applied successfully');
  console.log('   Tables created: email_log, email_broadcasts, system_alerts, system_alert_dismissals');
} catch (err) {
  console.error('❌ Migration error:', err.message);
} finally {
  await pool.end();
}
