/**
 * Plan Resolution System
 * 
 * Determines the effective plan for a user based on the following precedence:
 * 1. Admin manual override (direct DB update to user.plan field) - HIGHEST PRECEDENCE
 * 2. Stripe subscription status (active subscription with valid plan)
 * 3. Default "free" plan
 * 
 * This ensures that admins can manually override any user's plan for testing,
 * support, or special circumstances, regardless of their Stripe subscription status.
 */

import { storage } from "../storage";
import { FeatureTier } from "./features";

export type PlanTier = 'free' | 'pro' | 'family';

export interface PlanResolutionResult {
  effectivePlan: PlanTier;
  source: 'manual_override' | 'stripe_subscription' | 'default';
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string | null;
  manualPlan: string | null;
  subscriptionPlanId: string | null;
  planStartedAt: string | null;
}

/**
 * Resolve the effective plan for a user based on precedence rules
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

  // Check for admin manual override first (highest precedence)
  const manualPlan = user.plan;
  const isManualOverride = manualPlan && manualPlan !== 'free';
  
  // Check Stripe subscription status
  const stripeSubscriptionId = user.stripeSubscriptionId;
  const stripeSubscriptionStatus = user.subscriptionStatus;
  const subscriptionPlanId = user.subscriptionPlanId;
  const planStartedAt = user.planStartedAt;

  // Determine effective plan based on precedence
  let effectivePlan: PlanTier = 'free';
  let source: PlanResolutionResult['source'] = 'default';

  // Rule 1: Admin manual override takes highest precedence
  if (isManualOverride && isValidPlanTier(manualPlan)) {
    effectivePlan = manualPlan as PlanTier;
    source = 'manual_override';
  }
  // Rule 2: Active Stripe subscription
  else if (stripeSubscriptionId && stripeSubscriptionStatus === 'active') {
    // Try to determine plan from subscription
    const planFromSubscription = await getPlanFromSubscription(user);
    if (planFromSubscription) {
      effectivePlan = planFromSubscription;
      source = 'stripe_subscription';
    } else if (manualPlan && isValidPlanTier(manualPlan)) {
      // Fallback to manual plan if subscription doesn't specify
      effectivePlan = manualPlan as PlanTier;
      source = 'stripe_subscription'; // Still considered from subscription context
    }
  }
  // Rule 3: Default to manual plan if set (even if free)
  else if (manualPlan && isValidPlanTier(manualPlan)) {
    effectivePlan = manualPlan as PlanTier;
    source = manualPlan === 'free' ? 'default' : 'manual_override';
  }

  return {
    effectivePlan,
    source,
    stripeSubscriptionId,
    stripeSubscriptionStatus,
    manualPlan,
    subscriptionPlanId,
    planStartedAt,
  };
}

/**
 * Extract plan tier from user's subscription data
 */
async function getPlanFromSubscription(user: any): Promise<PlanTier | null> {
  // First check if we have a subscription plan ID
  if (user.subscriptionPlanId) {
    try {
      const planRecord = await storage.getLandingPricingPlan(user.subscriptionPlanId);
      if (planRecord) {
        const nameLower = planRecord.name.toLowerCase();
        if (nameLower.includes('family')) return 'family';
        if (nameLower.includes('pro')) return 'pro';
        // Default to pro for any paid subscription
        return 'pro';
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
 * Validate that a plan string is a valid tier
 */
export function isValidPlanTier(plan: string | null): plan is PlanTier {
  if (!plan) return false;
  const lower = plan.toLowerCase();
  return lower === 'free' || lower === 'pro' || lower === 'family';
}

/**
 * Normalize a plan string to a valid tier (defaults to 'free')
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
 * Check if a user has an active paid subscription (pro or family)
 */
export async function hasActivePaidSubscription(userId: string): Promise<boolean> {
  const resolution = await resolveUserPlan(userId);
  return resolution.effectivePlan === 'pro' || resolution.effectivePlan === 'family';
}

/**
 * Get plan display name with source indicator
 */
export function getPlanDisplayName(resolution: PlanResolutionResult): string {
  const planNames = {
    free: 'Free',
    pro: 'Pro',
    family: 'Family',
  };

  const planName = planNames[resolution.effectivePlan];
  
  if (resolution.source === 'manual_override') {
    return `${planName} (Manual Override)`;
  } else if (resolution.source === 'stripe_subscription') {
    return `${planName} (Subscription)`;
  }
  
  return planName;
}

/**
 * Helper to get effective plan for use in feature gating
 * This is the main function that should be used by featureGate.ts
 */
export async function getEffectivePlan(userId: string): Promise<PlanTier> {
  const resolution = await resolveUserPlan(userId);
  return resolution.effectivePlan;
}