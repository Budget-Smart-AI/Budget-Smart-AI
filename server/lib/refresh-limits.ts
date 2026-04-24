import { db } from "../db";
import { userRefreshUsage } from "@shared/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import { getEffectivePlan, PlanTier } from "./planResolver";

/**
 * Plan-gated quota for Plaid transactionsRefresh. Kept as a single source of
 * truth so UI and server report the same limit.
 */
export const REFRESH_LIMITS: Record<PlanTier, number> = {
  free: 0,
  pro: 10,
  family: 15,
};

/** Minimum gap between two successful refresh calls for the same user. */
export const RATE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes

export interface RefreshUsage {
  plan: PlanTier;
  limit: number;
  used: number;
  remaining: number;
  lastUsedAt: string | null;     // ISO
  cooldownSeconds: number;       // 0 if not rate-limited
  resetsOn: string;              // ISO — first of next month
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addOneMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

export async function getRefreshUsage(userId: string): Promise<RefreshUsage> {
  const plan = await getEffectivePlan(userId);
  const limit = REFRESH_LIMITS[plan];

  const monthStart = startOfMonth(new Date());
  const rows = await db
    .select({ usedAt: userRefreshUsage.usedAt })
    .from(userRefreshUsage)
    .where(
      and(
        eq(userRefreshUsage.userId, userId),
        gte(userRefreshUsage.usedAt, monthStart),
        eq(userRefreshUsage.success, true),
      ),
    )
    .orderBy(desc(userRefreshUsage.usedAt));

  const used = rows.length;
  const remaining = Math.max(0, limit - used);
  const lastUsedAt = rows[0]?.usedAt ?? null;
  const cooldownMs = lastUsedAt
    ? Math.max(0, RATE_LIMIT_MS - (Date.now() - new Date(lastUsedAt).getTime()))
    : 0;
  const resetsOn = addOneMonth(monthStart).toISOString();

  return {
    plan,
    limit,
    used,
    remaining,
    lastUsedAt: lastUsedAt ? new Date(lastUsedAt).toISOString() : null,
    cooldownSeconds: Math.ceil(cooldownMs / 1000),
    resetsOn,
  };
}

export type RefreshGateResult =
  | { allowed: true; usage: RefreshUsage }
  | {
      allowed: false;
      reason: "plan_not_eligible" | "limit_exhausted" | "cooldown";
      usage: RefreshUsage;
    };

export async function canRefresh(userId: string): Promise<RefreshGateResult> {
  const usage = await getRefreshUsage(userId);
  if (usage.limit === 0) return { allowed: false, reason: "plan_not_eligible", usage };
  if (usage.remaining === 0) return { allowed: false, reason: "limit_exhausted", usage };
  if (usage.cooldownSeconds > 0) return { allowed: false, reason: "cooldown", usage };
  return { allowed: true, usage };
}

export async function recordRefresh(
  userId: string,
  plaidItemId: string | null,
  success: boolean,
): Promise<void> {
  await db.insert(userRefreshUsage).values({
    userId,
    plaidItemId,
    success,
  });
}
