/**
 * Admin Plan-Feature Management Routes
 * 
 * Provides API endpoints for admins to dynamically configure which features
 * are available on each plan (Free/Pro/Family) and what their limits are.
 * 
 * This allows business logic changes without code deploys.
 */

import { Router } from "express";
import { pool } from "../db";
import { FEATURES, FEATURE_LIMITS } from "../lib/features";
import { auditLogFromRequest } from "../audit-logger";

const router = Router();

/**
 * Admin Plan-Feature Management Routes
 * 
 * Provides API endpoints for admins to dynamically configure which features
 * are available on each plan (Free/Pro/Family) and what their limits are.
 * 
 * Changes take effect IMMEDIATELY at runtime - no redeploy needed.
 */

import { Router } from "express";
import { pool } from "../db";
import { FEATURES, FEATURE_LIMITS } from "../lib/features";
import { auditLogFromRequest } from "../audit-logger";

const router = Router();

// ============================================================================
// Types
// ============================================================================

interface PlanFeatureLimit {
  id: string;
  plan_name: string;
  feature_key: string;
  limit_value: number | null;
  is_enabled: boolean;
  updated_at: string | null;
}

interface PlanFeatureConfig {
  featureKey: string;
  displayName: string;
  category: string;
  tier: string;
  free: number | null;
  pro: number | null;
  family: number | null;
}

// ============================================================================
// Auto-Seed Database with Hardcoded Limits (First Run Only)
// ============================================================================

/**
 * Seeds plan_feature_limits table with current hardcoded FEATURE_LIMITS.
 * Only inserts if no data exists (idempotent).
 * Called automatically on server startup.
 */
export async function seedPlanFeatureLimits(): Promise<void> {
  try {
    // Check if already seeded
    const { rows: existing } = await pool.query(
      `SELECT COUNT(*) as count FROM plan_feature_limits`
    );
    
    if (parseInt(existing[0]?.count || '0', 10) > 0) {
      console.log('[PlanFeatureLimits] Already seeded, skipping');
      return;
    }

    console.log('[PlanFeatureLimits] Seeding with hardcoded limits from features.ts...');
    
    const plans = ['free', 'pro', 'family'];
    let insertCount = 0;

    for (const plan of plans) {
      const limits = FEATURE_LIMITS[plan] as Record<string, number | null>;
      
      for (const [featureKey, limitValue] of Object.entries(limits)) {
        await pool.query(
          `INSERT INTO plan_feature_limits (plan_name, feature_key, limit_value, is_enabled, updated_at)
           VALUES ($1, $2, $3, true, $4)
           ON CONFLICT (plan_name, feature_key) DO NOTHING`,
          [plan, featureKey, limitValue, new Date().toISOString()]
        );
        insertCount++;
      }
    }

    console.log(`[PlanFeatureLimits] ✅ Seeded ${insertCount} feature limits across ${plans.length} plans`);
  } catch (error) {
    console.error('[PlanFeatureLimits] ❌ Seed failed:', error);
  }
}

// ============================================================================
// Auto-Seed Database with Hardcoded Limits (First Run Only)
// ============================================================================

/**
 * Seeds plan_feature_limits table with current hardcoded FEATURE_LIMITS.
 * Only inserts if no data exists (idempotent).
 */
export async function seedPlanFeatureLimits(): Promise<void> {
  try {
    // Check if already seeded
    const { rows: existing } = await pool.query(
      `SELECT COUNT(*) as count FROM plan_feature_limits`
    );
    
    if (parseInt(existing[0]?.count || '0', 10) > 0) {
      console.log('[PlanFeatureLimits] Already seeded, skipping');
      return;
    }

    console.log('[PlanFeatureLimits] Seeding with hardcoded limits from features.ts...');
    
    const plans = ['free', 'pro', 'family'];
    let insertCount = 0;

    for (const plan of plans) {
      const limits = FEATURE_LIMITS[plan] as Record<string, number | null>;
      
      for (const [featureKey, limitValue] of Object.entries(limits)) {
        await pool.query(
          `INSERT INTO plan_feature_limits (plan_name, feature_key, limit_value, is_enabled, updated_at)
           VALUES ($1, $2, $3, true, $4)
           ON CONFLICT (plan_name, feature_key) DO NOTHING`,
          [plan, featureKey, limitValue, new Date().toISOString()]
        );
        insertCount++;
      }
    }

    console.log(`[PlanFeatureLimits] ✅ Seeded ${insertCount} feature limits across ${plans.length} plans`);
  } catch (error) {
    console.error('[PlanFeatureLimits] ❌ Seed failed:', error);
  }
}

// ============================================================================
// Helper: Require Admin (uses existing admin auth check)
// ============================================================================

function requireAdmin(req: any, res: any, next: any) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (!req.session.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// ============================================================================
// GET /api/admin/plans/features
// Returns all feature configurations across all plans
// ============================================================================

router.get("/features", requireAdmin, async (req, res) => {
  try {
    const { rows: dbLimits } = await pool.query<PlanFeatureLimit>(
      `SELECT * FROM plan_feature_limits WHERE is_enabled = true ORDER BY plan_name, feature_key`
    );

    // Build a map of db limits: plan -> featureKey -> limit
    const dbMap = new Map<string, Map<string, PlanFeatureLimit>>();
    for (const row of dbLimits) {
      if (!dbMap.has(row.plan_name)) {
        dbMap.set(row.plan_name, new Map());
      }
      dbMap.get(row.plan_name)!.set(row.feature_key, row);
    }

    // Build comprehensive list with all features from features.ts
    const configs: PlanFeatureConfig[] = [];

    for (const feature of Object.values(FEATURES)) {
      const freeLimit = dbMap.get('free')?.get(feature.key);
      const proLimit = dbMap.get('pro')?.get(feature.key);
      const familyLimit = dbMap.get('family')?.get(feature.key);

      // Use DB value if exists, otherwise fallback to hardcoded
      configs.push({
        featureKey: feature.key,
        displayName: feature.displayName,
        category: feature.category,
        tier: feature.tier,
        free: freeLimit?.limit_value ?? (FEATURE_LIMITS.free[feature.key] ?? null),
        pro: proLimit?.limit_value ?? (FEATURE_LIMITS.pro[feature.key] ?? null),
        family: familyLimit?.limit_value ?? (FEATURE_LIMITS.family[feature.key] ?? null),
      });
    }

    res.json({
      features: configs,
      totalFeatures: configs.length,
    });
  } catch (error) {
    console.error("Error fetching plan features:", error);
    res.status(500).json({ error: "Failed to fetch plan features" });
  }
});

// ============================================================================
// PUT /api/admin/plans/:plan/features/:featureKey
// Update a specific feature limit for a plan
// CHANGES TAKE EFFECT IMMEDIATELY (no redeploy needed)
// ============================================================================

router.put("/:plan/features/:featureKey", requireAdmin, async (req, res) => {
  try {
    const { plan, featureKey } = req.params;
    const { limit_value } = req.body;

    if (!['free', 'pro', 'family'].includes(plan)) {
      return res.status(400).json({ error: "Invalid plan. Must be: free, pro, or family" });
    }

    if (limit_value !== null && (typeof limit_value !== 'number' || limit_value < 0)) {
      return res.status(400).json({ error: "limit_value must be null (unlimited) or a non-negative number" });
    }

    // Verify feature exists in features.ts
    const feature = Object.values(FEATURES).find(f => f.key === featureKey);
    if (!feature) {
      return res.status(404).json({ error: "Feature not found in features.ts" });
    }

    const userId = req.session.userId!;

    const { rows } = await pool.query<PlanFeatureLimit>(
      `INSERT INTO plan_feature_limits (plan_name, feature_key, limit_value, is_enabled, updated_at)
       VALUES ($1, $2, $3, true, $4)
       ON CONFLICT (plan_name, feature_key)
       DO UPDATE SET
         limit_value = EXCLUDED.limit_value,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [plan, featureKey, limit_value, new Date().toISOString()]
    );

    auditLogFromRequest(req, {
      eventType: "settings.updated",
      eventCategory: "settings",
      actorId: userId,
      action: "update_plan_feature_limit",
      outcome: "success",
      metadata: {
        plan,
        featureKey,
        displayName: feature.displayName,
        newLimit: limit_value,
      },
    });

    res.json({
      success: true,
      message: "Feature limit updated. Changes are live immediately.",
      limit: rows[0],
    });
  } catch (error) {
    console.error("Error updating plan feature limit:", error);
    res.status(500).json({ error: "Failed to update plan feature limit" });
  }
});

// ============================================================================
// POST /api/admin/plans/features/seed
// Seed database with hardcoded limits from features.ts (idempotent)
// ============================================================================

router.post("/features/seed", requireAdmin, async (req, res) => {
  try {
    await seedPlanFeatureLimits();
    res.json({ success: true, message: "Plan feature limits seeded from features.ts" });
  } catch (error) {
    console.error("Error seeding plan features:", error);
    res.status(500).json({ error: "Failed to seed plan features" });
  }
});

// ============================================================================
// DELETE /api/admin/plans/:plan/features/:featureKey
// Reset a feature limit to hardcoded default (removes DB override)
// ============================================================================

router.delete("/:plan/features/:featureKey", requireAdmin, async (req, res) => {
  try {
    const { plan, featureKey } = req.params;

    if (!['free', 'pro', 'family'].includes(plan)) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const { rowCount } = await pool.query(
      `DELETE FROM plan_feature_limits WHERE plan_name = $1 AND feature_key = $2`,
      [plan, featureKey]
    );

    auditLogFromRequest(req, {
      eventType: "settings.updated",
      eventCategory: "settings",
      actorId: req.session.userId!,
      action: "reset_plan_feature_limit",
      outcome: "success",
      metadata: {
        plan,
        featureKey,
        deleted: rowCount || 0,
      },
    });

    res.json({
      success: true,
      message: "Feature limit reset to hardcoded default from features.ts",
    });
  } catch (error) {
    console.error("Error resetting plan feature limit:", error);
    res.status(500).json({ error: "Failed to reset plan feature limit" });
  }
});

export default router;
