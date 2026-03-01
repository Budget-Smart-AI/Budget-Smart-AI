import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Prevent unhandled 'error' events on the pool from crashing the process.
// pg.Pool emits 'error' when an idle client encounters a network issue (e.g.
// database restart, idle-timeout disconnect). Without this listener Node.js
// would throw an uncaught exception and terminate the server, causing users
// to be logged out and unable to re-authenticate until the container restarts.
pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err);
});

export const db = drizzle(pool, { schema });

/**
 * Ensure the receipts table exists. Uses CREATE TABLE IF NOT EXISTS so it is
 * safe to call on every startup regardless of whether the table already exists.
 * This is needed because the receipts table was added (migration 0016) after
 * the initial DB setup, and some deployments may not have run drizzle-kit push.
 *
 * Schema matches migrations/0016_receipts_table.sql — keep both in sync if
 * the table definition ever changes.
 */
export async function ensureReceiptsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "receipts" (
      "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" varchar NOT NULL,
      "merchant" text NOT NULL DEFAULT 'Unknown',
      "amount" numeric(12, 2) NOT NULL DEFAULT '0',
      "date" text NOT NULL,
      "category" text NOT NULL DEFAULT 'Uncategorized',
      "items" text,
      "confidence" real NOT NULL DEFAULT 0,
      "image_url" text,
      "raw_text" text,
      "matched_transaction_id" text,
      "match_status" text NOT NULL DEFAULT 'unmatched',
      "notes" text,
      "created_at" text
    )
  `);
}
