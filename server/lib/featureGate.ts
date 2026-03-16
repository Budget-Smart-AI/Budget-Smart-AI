/**
 * Feature Gating Enforcement Layer
 *
 * Provides the runtime enforcement infrastructure for checking, tracking, and
 * enforcing per-user feature limits based on subscription plan.
 *
 * Depends on:
 *  - server/lib/features.ts  — feature registry and FEATURE_LIMITS
 *  - server/db.ts            — shared pg pool
 *  - server/lib/planResolver.ts — plan resolution with admin override precedence
 *  - user_feature_usage table (created by ensureUserFeatureUsageTable in db.ts)
 */

import { pool } from "../db";
import { FEATURE_LIMITS, FEATURES, FeatureTier } from "./features";
import { getEffectivePlan, normalizePlanTier } from "./planResolver";

// ============================================================================
// TYPES
// ============================================================================

export interface FeatureAccessResult {
  allowed: boolean;
  reason: "allowed" | "upgrade_required" | "limit_reached";
  currentUsage: number;
  limit: number | null;
  remaining: number | null;
  resetDate: Date | null;
  upgradeRequired: boolean;
}

export interface UserFeatureSummaryItem {
  featureKey: string;
  displayName: string;
  allowed: boolean;
  currentUsage: number;
  limit: number | null;
  remaining: number | null;
  resetDate: Date | null;
  upgradeRequired: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Normalise a plan string to a FeatureTier, defaulting to 'free' for unknown values.
 * Uses the new plan resolver's normalization function for consistency.
 */
function normaliseTier(plan: string): FeatureTier {
  return normalizePlanTier(plan);
}

/**
 * Return the start of the current calendar month (UTC).
 */
function currentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Return the start of the next calendar month (UTC) — i.e. period_end.
 */
function currentPeriodEnd(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

// ============================================================================
// A) getFeatureLimit
// ============================================================================

/**
 * Returns the monthly limit for `featureKey` on `plan`.
 *
 * - Returns `null`  → unlimited access
 * - Returns `0`     → feature not available on this plan
 * - Returns `N > 0` → limited to N uses per month
 */
/**
 * Get the feature limit for a given plan and feature key.
 * READS FROM DATABASE AT RUNTIME for immediate effect of admin changes.
 * Falls back to hardcoded FEATURE_LIMITS if not found in database.
 * Returns:
 *  - null: unlimited
 *  - 0: feature disabled (upgrade required)
 *  - N: specific limit
 */
export async function getFeatureLimit(plan: string, featureKey: string): Promise<number | null> {
  const tier = normaliseTier(plan);
  const key = featureKey.toLowerCase();

  try {
    // Check database FIRST for dynamic configuration (reads at runtime - no caching)
    const { rows } = await pool.query<{ limit_value: number | null; is_enabled: boolean }>(
      `SELECT limit_value, is_enabled
       FROM plan_feature_limits
       WHERE plan_name = $1 AND feature_key = $2 AND is_enabled = true
       LIMIT 1`,
      [tier, key]
    );

    if (rows.length > 0) {
      // Database override found - use it immediately
      return rows[0].limit_value;
    }
  } catch (error) {
    // Database not available or table doesn't exist yet - fall back to hardcoded
    // This ensures the app works even if DB migration hasn't run
    console.warn(`Failed to query plan_feature_limits, using hardcoded limits:`, error);
  }

  // Fall back to hardcoded FEATURE_LIMITS from features.ts
  const limits = FEATURE_LIMITS[tier] as Record<string, number | null>;
  if (key in limits) {
    return limits[key] ?? null;
  }
  // Feature key not registered in this tier's limits — treat as unavailable
  return 0;
}

/**
 * Synchronous version for backwards compatibility.
 * NOTE: This only uses hardcoded limits and will be deprecated.
 */
export function getFeatureLimitSync(plan: string, featureKey: string): number | null {
  const tier = normaliseTier(plan);
  const key = featureKey.toLowerCase();
  const limits = FEATURE_LIMITS[tier] as Record<string, number | null>;
  if (key in limits) {
    return limits[key] ?? null;
  }
  return 0;
}

// ============================================================================
// B) getCurrentUsage
// ============================================================================

/**
 * Returns the usage count for `featureKey` in the current billing month for
 * `userId`. Returns `0` when no record exists yet.
 *
 * Automatically handles month rollover: only counts rows whose `period_start`
 * matches the current calendar month.
 */
export async function getCurrentUsage(userId: string, featureKey: string): Promise<number> {
  const periodStart = currentPeriodStart();

  const { rows } = await pool.query<{ usage_count: number }>(
    `SELECT usage_count
     FROM user_feature_usage
     WHERE user_id = $1
       AND feature_key = $2
       AND period_start = $3`,
    [userId, featureKey.toLowerCase(), periodStart.toISOString()]
  );

  return rows.length > 0 ? rows[0].usage_count : 0;
}

// ============================================================================
// C) checkFeatureAccess
// ============================================================================

/**
 * Full access check for a (user, plan, feature) combination.
 * Uses the effective plan resolution system to respect admin manual overrides.
 *
 * Returns a rich result object describing whether the action is allowed,
 * the current usage, the limit, remaining capacity, and when the period resets.
 */
export async function checkFeatureAccess(
  userId: string,
  plan: string,
  featureKey: string
): Promise<FeatureAccessResult> {
  // Use effective plan resolution to respect admin manual overrides
  const effectivePlan = await getEffectivePlan(userId);
  const limit = await getFeatureLimit(effectivePlan, featureKey);
  const resetDate = currentPeriodEnd();

  // Feature entirely unavailable on this plan
  if (limit === 0) {
    return {
      allowed: false,
      reason: "upgrade_required",
      currentUsage: 0,
      limit: 0,
      remaining: 0,
      resetDate,
      upgradeRequired: true,
    };
  }

  // Unlimited access — no need to query usage
  if (limit === null) {
    return {
      allowed: true,
      reason: "allowed",
      currentUsage: 0,
      limit: null,
      remaining: null,
      resetDate: null,
      upgradeRequired: false,
    };
  }

  // Limited access — check current usage
  const currentUsage = await getCurrentUsage(userId, featureKey);
  const remaining = Math.max(0, limit - currentUsage);

  if (currentUsage >= limit) {
    return {
      allowed: false,
      reason: "limit_reached",
      currentUsage,
      limit,
      remaining: 0,
      resetDate,
      upgradeRequired: false,
    };
  }

  return {
    allowed: true,
    reason: "allowed",
    currentUsage,
    limit,
    remaining,
    resetDate,
    upgradeRequired: false,
  };
}

// ============================================================================
// D) incrementFeatureUsage
// ============================================================================

/**
 * Increments the usage counter for `featureKey` for `userId` in the current
 * billing month. Creates the row if it does not yet exist.
 */
export async function incrementFeatureUsage(userId: string, featureKey: string): Promise<void> {
  const periodStart = currentPeriodStart();
  const periodEnd = currentPeriodEnd();

  await pool.query(
    `INSERT INTO user_feature_usage
       (user_id, feature_key, usage_count, period_start, period_end)
     VALUES ($1, $2, 1, $3, $4)
     ON CONFLICT (user_id, feature_key, period_start)
     DO UPDATE SET
       usage_count = user_feature_usage.usage_count + 1,
       updated_at  = NOW()`,
    [userId, featureKey.toLowerCase(), periodStart.toISOString(), periodEnd.toISOString()]
  );
}

// ============================================================================
// E) checkAndConsume
// ============================================================================

/**
 * Atomically checks access and, if allowed, increments the usage counter.
 * Uses effective plan resolution to respect admin manual overrides.
 *
 * For limited features this uses a database transaction with a SELECT FOR UPDATE
 * lock to prevent concurrent requests from exceeding the limit. Unlimited and
 * unavailable features are handled synchronously without a DB transaction.
 *
 * Use this in API route handlers so that a single call both validates the
 * request and records the usage.
 */
export async function checkAndConsume(
  userId: string,
  plan: string,
  featureKey: string
): Promise<FeatureAccessResult> {
  // Use effective plan resolution to respect admin manual overrides
  const effectivePlan = await getEffectivePlan(userId);
  const limit = await getFeatureLimit(effectivePlan, featureKey);
  const resetDate = currentPeriodEnd();
  const key = featureKey.toLowerCase();

  // Feature entirely unavailable on this plan — no DB interaction needed
  if (limit === 0) {
    return {
      allowed: false,
      reason: "upgrade_required",
      currentUsage: 0,
      limit: 0,
      remaining: 0,
      resetDate,
      upgradeRequired: true,
    };
  }

  // Unlimited access — just increment without a limit check
  if (limit === null) {
    await incrementFeatureUsage(userId, featureKey);
    return {
      allowed: true,
      reason: "allowed",
      currentUsage: 0,
      limit: null,
      remaining: null,
      resetDate: null,
      upgradeRequired: false,
    };
  }

  // Limited access — atomic check + increment using a transaction with row lock
  const periodStart = currentPeriodStart();
  const periodEnd = currentPeriodEnd();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure the row exists so we can lock it
    await client.query(
      `INSERT INTO user_feature_usage
         (user_id, feature_key, usage_count, period_start, period_end)
       VALUES ($1, $2, 0, $3, $4)
       ON CONFLICT (user_id, feature_key, period_start) DO NOTHING`,
      [userId, key, periodStart.toISOString(), periodEnd.toISOString()]
    );

    // Lock the row for the duration of this transaction
    const { rows } = await client.query<{ usage_count: number }>(
      `SELECT usage_count
       FROM user_feature_usage
       WHERE user_id = $1
         AND feature_key = $2
         AND period_start = $3
       FOR UPDATE`,
      [userId, key, periodStart.toISOString()]
    );

    const currentUsage = rows[0]?.usage_count ?? 0;

    if (currentUsage >= limit) {
      await client.query("ROLLBACK");
      return {
        allowed: false,
        reason: "limit_reached",
        currentUsage,
        limit,
        remaining: 0,
        resetDate,
        upgradeRequired: false,
      };
    }

    await client.query(
      `UPDATE user_feature_usage
       SET usage_count = usage_count + 1,
           updated_at  = NOW()
       WHERE user_id = $1
         AND feature_key = $2
         AND period_start = $3`,
      [userId, key, periodStart.toISOString()]
    );

    await client.query("COMMIT");

    const newUsage = currentUsage + 1;
    const remaining = Math.max(0, limit - newUsage);
    return {
      allowed: true,
      reason: "allowed",
      currentUsage: newUsage,
      limit,
      remaining,
      resetDate,
      upgradeRequired: false,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================================
// F) getUserFeatureSummary
// ============================================================================

/**
 * Get actual item counts for cumulative-limit features (bills, budgets, debts, etc.)
 * These features limit the TOTAL number of items, not monthly usage.
 */
async function getCumulativeItemCounts(userId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  try {
    // Single query with multiple COUNT subqueries for better performance
    // Use current month for budget count (budgets are per-month, limit applies to current month)
    const currentMonthStr = new Date().toISOString().slice(0, 7); // "YYYY-MM"

    const result = await pool.query<{
      bills: string;
      budgets: string;
      debts: string;
      savings_goals: string;
      assets: string;
      manual_accounts: string;
      vault_documents: string;
      custom_categories: string;
    }>(
      `SELECT 
        (SELECT COUNT(*) FROM bills WHERE user_id = $1) as bills,
        (SELECT COUNT(DISTINCT category) FROM budgets WHERE user_id = $1 AND month = $2) as budgets,
        (SELECT COUNT(*) FROM debt_details WHERE user_id = $1) as debts,
        (SELECT COUNT(*) FROM savings_goals WHERE user_id = $1) as savings_goals,
        (SELECT COUNT(*) FROM assets WHERE user_id = $1) as assets,
        (SELECT COUNT(*) FROM manual_accounts WHERE user_id = $1) as manual_accounts,
        (SELECT COUNT(*) FROM vault_documents WHERE user_id = $1) as vault_documents,
        (SELECT COUNT(*) FROM custom_categories WHERE user_id = $1) as custom_categories`,
      [userId, currentMonthStr]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      counts.set('bill_tracking', parseInt(row.bills, 10));
      counts.set('budget_creation', parseInt(row.budgets, 10));
      counts.set('debt_tracking', parseInt(row.debts, 10));
      counts.set('savings_goals', parseInt(row.savings_goals, 10));
      counts.set('asset_tracking', parseInt(row.assets, 10));
      counts.set('manual_accounts', parseInt(row.manual_accounts, 10));
      counts.set('financial_vault', parseInt(row.vault_documents, 10));
      counts.set('categories_management', parseInt(row.custom_categories, 10));
    }
  } catch (error) {
    console.error('Error getting cumulative item counts:', error);
  }

  return counts;
}

/**
 * Features that use total item counts instead of monthly usage tracking
 */
const CUMULATIVE_LIMIT_FEATURES = new Set([
  'bill_tracking',
  'budget_creation',
  'debt_tracking',
  'savings_goals',
  'asset_tracking',
  'manual_accounts',
  'financial_vault',
  'categories_management',
]);

/**
 * Returns a summary of all registered features for `userId` on `plan`,
 * including current usage, limits, and remaining capacity for each feature.
 * Uses effective plan resolution to respect admin manual overrides.
 */
export async function getUserFeatureSummary(
  userId: string,
  plan: string
): Promise<UserFeatureSummaryItem[]> {
  // Use effective plan resolution to respect admin manual overrides
  const effectivePlan = await getEffectivePlan(userId);
  const tier = normaliseTier(effectivePlan);
  const periodStart = currentPeriodStart();
  const resetDate = currentPeriodEnd();

  // Bulk-fetch all current-period usage rows for this user in one query
  const { rows } = await pool.query<{ feature_key: string; usage_count: number }>(
    `SELECT feature_key, usage_count
     FROM user_feature_usage
     WHERE user_id = $1
       AND period_start = $2`,
    [userId, periodStart.toISOString()]
  );

  const usageMap = new Map<string, number>();
  for (const row of rows) {
    usageMap.set(row.feature_key, row.usage_count);
  }

  // Get actual item counts for cumulative-limit features
  const itemCounts = await getCumulativeItemCounts(userId);

  const summary: UserFeatureSummaryItem[] = [];

  for (const feature of Object.values(FEATURES)) {
    const limit = await getFeatureLimit(tier, feature.key);
    
    // Use actual item count for cumulative-limit features, otherwise use usage count
    const currentUsage = CUMULATIVE_LIMIT_FEATURES.has(feature.key)
      ? (itemCounts.get(feature.key) ?? 0)
      : (usageMap.get(feature.key.toLowerCase()) ?? 0);

    // Feature unavailable on this plan
    if (limit === 0) {
      summary.push({
        featureKey: feature.key,
        displayName: feature.displayName,
        allowed: false,
        currentUsage: 0,
        limit: 0,
        remaining: 0,
        resetDate,
        upgradeRequired: true,
      });
      continue;
    }

    // Unlimited feature
    if (limit === null) {
      summary.push({
        featureKey: feature.key,
        displayName: feature.displayName,
        allowed: true,
        currentUsage,
        limit: null,
        remaining: null,
        resetDate: null,
        upgradeRequired: false,
      });
      continue;
    }

    // Limited feature
    const remaining = Math.max(0, limit - currentUsage);
    
    // For cumulative-limit features, resetDate is null (doesn't reset monthly)
    const featureResetDate = CUMULATIVE_LIMIT_FEATURES.has(feature.key) ? null : resetDate;
    
    summary.push({
      featureKey: feature.key,
      displayName: feature.displayName,
      allowed: currentUsage < limit,
      currentUsage,
      limit,
      remaining,
      resetDate: featureResetDate,
      upgradeRequired: false,
    });
  }

  return summary;
}
