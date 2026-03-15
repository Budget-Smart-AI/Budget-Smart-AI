/**
 * Plan Resolution System
 *
 * Determines the effective plan for a user based on the following precedence:
 *
 * Priority 1: user.isAdmin === 'true'  → always Family plan
 * Priority 2: Active Stripe subscription (stripeSubscriptionId + subscriptionStatus === 'active')
 * Priority 3: user.plan set in DB (not null, not 'free') → use as effectivePlan (manual override)
 * Priority 4: Default → free tier
 *
 * This ensures admins always get full access, Stripe subscribers get their paid plan,
 * and users with a manually-set DB plan (e.g. support grants) are respected even
 * without an active Stripe subscription.
 */

import { storage } from "../storage";
import { FeatureTier } from "./features";

export type PlanTier = 'free' | 'pro' | 'family';

export interface PlanResolutionResult {
  effectivePlan: PlanTier;
  source: 'admin_role' | 'stripe_subscription' | 'manual_override' | 'default';
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string | null;
  manualPlan: string | null;
  subscriptionPlanId: string | null;
  planStartedAt: string | null;
}

/**
 * Resolve the effective plan for a user based on precedence rules.
 *
 * Priority 1: Admin role  → Family plan (always)
 * Priority 2: Active Stripe subscription → plan from subscription
 * Priority 3: DB plan field (not null, not 'free') → manual override
 * Priority 4: Default → free
 */
export async function resolveUserPlan(userId: string): Promise<PlanResolutionResult> {
  const user = await storage.getUser(userId);
  if (!user) {
    return {
      effectivePlan: 'free',
      source: 'default',
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: null,
      manualPlan: null,
      subscriptionPlanId: null,
      planStartedAt: null,
    };
  }

  const stripeSubscriptionId = user.stripeSubscriptionId ?? null;
  const stripeSubscriptionStatus = user.subscriptionStatus ?? null;
  const subscriptionPlanId = user.subscriptionPlanId ?? null;
  const planStartedAt = user.planStartedAt ?? null;
  const manualPlan = user.plan ?? null;

  // ── Priority 1: Admin role → always Family ──────────────────────────────
  if (user.isAdmin === 'true' || user.isAdmin === true) {
    return {
      effectivePlan: 'family',
      source: 'admin_role',
      stripeSubscriptionId,
      stripeSubscriptionStatus,
      manualPlan,
      subscriptionPlanId,
      planStartedAt,
    };
  }

  // ── Priority 2: Active Stripe subscription ──────────────────────────────
  if (stripeSubscriptionId && stripeSubscriptionStatus === 'active') {
    const planFromSubscription = await getPlanFromSubscription(user);
    const effectivePlan: PlanTier = planFromSubscription ?? 'pro';
    return {
      effectivePlan,
      source: 'stripe_subscription',
      stripeSubscriptionId,
      stripeSubscriptionStatus,
      manualPlan,
      subscriptionPlanId,
      planStartedAt,
    };
  }

  // ── Priority 3: DB plan field set (not null, not 'free') ────────────────
  if (manualPlan && manualPlan !== 'free' && isValidPlanTier(manualPlan)) {
    return {
      effectivePlan: manualPlan as PlanTier,
      source: 'manual_override',
      stripeSubscriptionId,
      stripeSubscriptionStatus,
      manualPlan,
      subscriptionPlanId,
      planStartedAt,
    };
  }

  // ── Priority 4: Default → free ──────────────────────────────────────────
  return {
    effectivePlan: 'free',
    source: 'default',
    stripeSubscriptionId,
    stripeSubscriptionStatus,
    manualPlan,
    subscriptionPlanId,
    planStartedAt,
  };
}

/**
 * Extract plan tier from user's subscription data.
 */
async function getPlanFromSubscription(user: any): Promise<PlanTier | null> {
  // Check subscription plan ID first (most reliable)
  if (user.subscriptionPlanId) {
    try {
      const planRecord = await storage.getLandingPricingPlan(user.subscriptionPlanId);
      if (planRecord) {
        const nameLower = planRecord.name.toLowerCase();
        if (nameLower.includes('family')) return 'family';
        if (nameLower.includes('pro')) return 'pro';
        return 'pro'; // Default to pro for any paid subscription
      }
    } catch (error) {
      console.warn(`Failed to get landing pricing plan ${user.subscriptionPlanId}:`, error);
    }
  }

  // Fallback: check user.plan field (set by Stripe webhook)
  if (user.plan && isValidPlanTier(user.plan)) {
    return user.plan as PlanTier;
  }

  return null;
}

/**
 * Validate that a plan string is a valid tier.
 */
export function isValidPlanTier(plan: string | null): plan is PlanTier {
  if (!plan) return false;
  const lower = plan.toLowerCase();
  return lower === 'free' || lower === 'pro' || lower === 'family';
}

/**
 * Normalize a plan string to a valid tier (defaults to 'free').
 */
export function normalizePlanTier(plan: string | null): PlanTier {
  if (!plan) return 'free';
  const lower = plan.toLowerCase();
  if (lower === 'free' || lower === 'pro' || lower === 'family') {
    return lower;
  }
  return 'free';
}

/**
 * Check if a user has an active paid subscription (pro or family).
 */
export async function hasActivePaidSubscription(userId: string): Promise<boolean> {
  const resolution = await resolveUserPlan(userId);
  return resolution.effectivePlan === 'pro' || resolution.effectivePlan === 'family';
}

/**
 * Get plan display name with source indicator.
 */
export function getPlanDisplayName(resolution: PlanResolutionResult): string {
  const planNames: Record<PlanTier, string> = {
    free: 'Free',
    pro: 'Pro',
    family: 'Family',
  };

  const planName = planNames[resolution.effectivePlan];

  switch (resolution.source) {
    case 'admin_role':
      return `${planName} (Admin)`;
    case 'stripe_subscription':
      return `${planName} (Subscription)`;
    case 'manual_override':
      return `${planName} (Manual Override)`;
    default:
      return planName;
  }
}

/**
 * Helper to get effective plan for use in feature gating.
 * This is the main function that should be used by featureGate.ts and routes.ts.
 */
export async function getEffectivePlan(userId: string): Promise<PlanTier> {
  const resolution = await resolveUserPlan(userId);
  return resolution.effectivePlan;
}
