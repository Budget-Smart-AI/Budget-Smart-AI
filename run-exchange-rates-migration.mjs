import { readFileSync } from "fs";
import pg from "pg";
import { config } from "dotenv";

config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = readFileSync("./migrations/0023_exchange_rates.sql", "utf8");

try {
  await pool.query(sql);
  console.log("✅ exchange_rates table created (or already exists)");
} catch (err) {
  console.error("❌ Migration failed:", err.message);
} finally {
  await pool.end();
}
