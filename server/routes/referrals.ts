/**
 * /api/referrals/* — thin proxy to Partnero's Customer Referral program.
 *
 * Mounted from server/routes.ts. All endpoints require an authenticated
 * session (the same `authenticate` middleware the rest of the app uses).
 *
 * Why a proxy instead of hitting Partnero from the browser:
 *   - Keeps the Partnero API key server-side (it's program-wide, not per-user)
 *   - Normalizes the response shape for the React client
 *   - Lets us enrich with Budget Smart-specific data later (e.g. Vault lock-in
 *     messaging, plan tier) without refactoring the frontend
 */

import type { Express, Request, Response } from "express";
import {
  enrollCustomerInReferralProgram,
  getReferralCustomer,
  listReferralsForCustomer,
  partneroReferralEnabled,
} from "../partnero-referral";
import { storage } from "../storage";

/**
 * Budget Smart uses session-based auth — `req.session.userId` is populated
 * by the `requireAuth` middleware. We look up the user row to get their
 * email, which is our stable Partnero customer key (matches the universal.js
 * frontend `po('customer','signup',{email})` call).
 */
async function loadAuthedUser(
  req: Request,
): Promise<{
  id: number | string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
} | null> {
  const userId = (req as any).session?.userId;
  if (!userId) return null;
  const user = await storage.getUser(userId);
  if (!user || !user.email) return null;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
  };
}

/**
 * Shape returned to the frontend — keep this tight and versioned, not a
 * raw pass-through of the Partnero response (which changes).
 */
interface ReferralMeResponse {
  enabled: boolean;
  enrolled: boolean;
  code?: string;
  url?: string;
  stats?: {
    totalReferrals: number;
    paidReferrals: number;
    pendingReferrals: number;
    totalEarnedCents: number;
    pendingCents: number;
  };
}

export function registerReferralRoutes(
  app: Express,
  authenticate: (req: Request, res: Response, next: any) => void,
): void {
  /**
   * GET /api/referrals/me
   * Returns the current user's referral code, link, and stats.
   * Used by the gold-heart modal and the /referrals page.
   */
  app.get("/api/referrals/me", authenticate, async (req, res) => {
    if (!partneroReferralEnabled()) {
      return res.json({
        enabled: false,
        enrolled: false,
      } satisfies ReferralMeResponse);
    }

    const user = await loadAuthedUser(req);
    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const key = user.email;

    const result = await getReferralCustomer(key);

    if (!result.ok) {
      // Not enrolled yet? Try a lazy enrollment — this catches users who
      // signed up before the referral program was launched.
      if (result.error === "not_enrolled") {
        const enroll = await enrollCustomerInReferralProgram({
          key,
          email: key,
          name: user.firstName
            ? `${user.firstName} ${user.lastName ?? ""}`.trim()
            : null,
        });
        if (enroll.ok) {
          return res.json({
            enabled: true,
            enrolled: true,
            code: enroll.referralCode,
            url: enroll.referralUrl,
          } satisfies ReferralMeResponse);
        }
      }
      return res.json({
        enabled: true,
        enrolled: false,
      } satisfies ReferralMeResponse);
    }

    const raw = result.raw as any;
    const stats = raw?.data?.stats ?? raw?.data?.referrals_stats ?? null;
    return res.json({
      enabled: true,
      enrolled: true,
      code: result.referralCode,
      url: result.referralUrl,
      stats: stats
        ? {
            totalReferrals: Number(stats.total ?? stats.referrals ?? 0),
            paidReferrals: Number(stats.paid ?? stats.paid_referrals ?? 0),
            pendingReferrals: Number(
              stats.pending ?? stats.pending_referrals ?? 0,
            ),
            totalEarnedCents: Number(
              stats.earned_cents ?? stats.total_earned_cents ?? 0,
            ),
            pendingCents: Number(
              stats.pending_cents ?? stats.pending_earnings_cents ?? 0,
            ),
          }
        : undefined,
    } satisfies ReferralMeResponse);
  });

  /**
   * GET /api/referrals/list
   * Returns the list of referrals the current user has made — each with
   * status (pending / active / paid) and referred user's obfuscated identity.
   */
  app.get("/api/referrals/list", authenticate, async (req, res) => {
    if (!partneroReferralEnabled()) {
      return res.json({ referrals: [] });
    }

    const user = await loadAuthedUser(req);
    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const key = user.email;

    const result = await listReferralsForCustomer(key);
    if (!result.ok) {
      return res.json({ referrals: [] });
    }

    // Obfuscate referee emails (privacy) — show first initial + domain only.
    const referrals = (result.referrals ?? []).map((r: any) => ({
      id: r.id ?? r.key,
      status: r.status ?? "pending",
      createdAt: r.created_at ?? r.createdAt,
      paidAt: r.paid_at ?? r.paidAt ?? null,
      amountCents: Number(r.amount_cents ?? r.commission_cents ?? 0),
      refereeEmail: obfuscateEmail(r.customer?.email ?? r.email ?? ""),
      refereePlan: r.plan ?? r.customer?.plan ?? null,
    }));

    return res.json({ referrals });
  });

  /**
   * POST /api/referrals/enroll
   * Idempotent enroll endpoint — called from the gold-heart modal the
   * first time a user opens it. Safe to call repeatedly.
   */
  app.post("/api/referrals/enroll", authenticate, async (req, res) => {
    if (!partneroReferralEnabled()) {
      return res.json({ enrolled: false, enabled: false });
    }

    const user = await loadAuthedUser(req);
    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const key = user.email;

    const result = await enrollCustomerInReferralProgram({
      key,
      email: key,
      name: user.firstName
        ? `${user.firstName} ${user.lastName ?? ""}`.trim()
        : null,
    });

    return res.json({
      enrolled: result.ok,
      enabled: true,
      code: result.referralCode,
      url: result.referralUrl,
      error: result.ok ? undefined : result.error,
    });
  });
}

function obfuscateEmail(email: string): string {
  if (!email || !email.includes("@")) return "new referral";
  const [local, domain] = email.split("@");
  if (!local || !domain) return "new referral";
  const prefix = local.slice(0, 1);
  return `${prefix}***@${domain}`;
}
