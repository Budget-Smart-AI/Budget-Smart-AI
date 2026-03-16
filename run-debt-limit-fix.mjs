/**
 * One-time migration: Fix debt_tracking limit from 3 → 5 in plan_feature_limits table.
 * 
 * Root cause: The plan_feature_limits DB table had debt_tracking = 3 (old value)
 * which overrides the features.ts value of 5. The seedPlanFeatureLimits() function
 * runs on every deploy and will keep the DB in sync going forward, but this script
 * fixes the DB immediately.
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  // Check current value
  const { rows: before } = await pool.query(
    `SELECT plan_name, feature_key, limit_value FROM plan_feature_limits WHERE feature_key = 'debt_tracking' ORDER BY plan_name`
  );
  console.log('Current debt_tracking limits:', before);

  // Fix: set free plan debt_tracking to 5
  const { rowCount } = await pool.query(
    `UPDATE plan_feature_limits SET limit_value = 5, updated_at = NOW() WHERE plan_name = 'free' AND feature_key = 'debt_tracking'`
  );
  console.log(`✅ Updated ${rowCount} row(s): free plan debt_tracking → 5`);

  // Verify
  const { rows: after } = await pool.query(
    `SELECT plan_name, feature_key, limit_value FROM plan_feature_limits WHERE feature_key = 'debt_tracking' ORDER BY plan_name`
  );
  console.log('Updated debt_tracking limits:', after);
} catch (err) {
  console.error('❌ Migration error:', err.message);
} finally {
  await pool.end();
}
