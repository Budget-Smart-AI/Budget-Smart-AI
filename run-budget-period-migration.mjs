import { Pool } from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Adding budget_period and next_payday columns to users table...");
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS budget_period text DEFAULT 'monthly',
        ADD COLUMN IF NOT EXISTS next_payday text;
    `);
    console.log("✓ Migration complete: budget_period and next_payday added to users");
  } catch (err) {
    console.error("Migration error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
