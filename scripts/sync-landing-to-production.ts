/**
 * Script to sync landing page data from development to production database
 *
 * Usage:
 *   npx tsx scripts/sync-landing-to-production.ts <PRODUCTION_DATABASE_URL>
 *
 * Or set environment variables:
 *   DEV_DATABASE_URL=... PROD_DATABASE_URL=... npx tsx scripts/sync-landing-to-production.ts
 */

import { Pool } from "pg";

const LANDING_TABLES = [
  "landing_settings",
  "landing_features",
  "landing_testimonials",
  "landing_pricing",
  "landing_comparison",
  "landing_faq",
];

async function syncLandingData() {
  // Get database URLs
  const devUrl = process.env.DEV_DATABASE_URL || process.env.DATABASE_URL;
  const prodUrl = process.argv[2] || process.env.PROD_DATABASE_URL;

  if (!devUrl) {
    console.error("Error: No development database URL found.");
    console.error("Set DATABASE_URL or DEV_DATABASE_URL environment variable.");
    process.exit(1);
  }

  if (!prodUrl) {
    console.error("Error: No production database URL provided.");
    console.error("Usage: npx tsx scripts/sync-landing-to-production.ts <PRODUCTION_DATABASE_URL>");
    console.error("Or set PROD_DATABASE_URL environment variable.");
    process.exit(1);
  }

  console.log("Connecting to databases...");

  const devPool = new Pool({ connectionString: devUrl });
  const prodPool = new Pool({ connectionString: prodUrl });

  try {
    // Test connections
    await devPool.query("SELECT 1");
    console.log("✓ Connected to development database");

    await prodPool.query("SELECT 1");
    console.log("✓ Connected to production database");

    // Sync each table
    for (const table of LANDING_TABLES) {
      console.log(`\nSyncing ${table}...`);

      // Get all data from dev
      const devResult = await devPool.query(`SELECT * FROM ${table}`);
      const rows = devResult.rows;

      if (rows.length === 0) {
        console.log(`  - No data in development, skipping`);
        continue;
      }

      console.log(`  - Found ${rows.length} rows in development`);

      // Get column names from the first row
      const columns = Object.keys(rows[0]);

      // Clear production table and insert fresh data
      await prodPool.query(`DELETE FROM ${table}`);
      console.log(`  - Cleared production table`);

      // Build insert query with parameterized values
      for (const row of rows) {
        const values = columns.map((col) => row[col]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
        const columnNames = columns.map((c) => `"${c}"`).join(", ");

        await prodPool.query(
          `INSERT INTO ${table} (${columnNames}) VALUES (${placeholders})`,
          values
        );
      }

      console.log(`  - Inserted ${rows.length} rows into production`);
    }

    console.log("\n✓ Sync completed successfully!");

  } catch (error) {
    console.error("\nError during sync:", error);
    process.exit(1);
  } finally {
    await devPool.end();
    await prodPool.end();
  }
}

syncLandingData();
