/**
 * Income detection — shared helper.
 *
 * Phase 5 (Wizard Rebuild, 2026-04-27) — extracted from /api/onboarding/
 * detect-now route handler so it can be invoked directly by the Plaid
 * webhook (INITIAL_UPDATE / RECURRING_TRANSACTIONS_UPDATE) without HTTP
 * indirection. The HTTP endpoint becomes a thin wrapper.
 *
 * What this does:
 *   1. Fan out across providers via getRecurringStreams() — pulls inflow
 *      streams from Plaid `/transactions/recurring/get` and MX's
 *      recurring_transactions endpoint, ranked by confidence.
 *   2. For each stream:
 *        - If shouldAutoPromote() (mature + very_high + active inflow per
 *          §8.1): create an income_sources row if one doesn't already
 *          exist. Marks autoDetected=true and links via stream_id.
 *        - If a row exists but its stream_id is null (pre-Phase-2
 *          detector-created): backfill stream_id so the webhook
 *          reconciler can locate it later.
 *        - Skip rows the user has tombstoned (user_dismissed_at non-null,
 *          §8.2 soft-delete) — Plaid does NOT auto-resurrect these.
 *   3. Persist the wizard-display payload into onboarding_analysis so the
 *      legacy /api/onboarding/status endpoint (still used by App.tsx) can
 *      render it during the transition window.
 *   4. Stamp users.last_income_detection_at = now() so the new wizard's
 *      sync-status endpoint flips incomeDetected=true.
 *
 * Idempotent. Safe to call multiple times — auto-promote dedupes against
 * (user_id, normalized_source) and stream_id backfill is a no-op if
 * already set. The "stamp users.last_income_detection_at" runs every time
 * regardless, which is desirable: it records that we tried recently.
 *
 * Returns the wizard-display payload + counts. Webhook callers can ignore
 * the return value; the HTTP route forwards it as the response body.
 */

import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../db";
import { storage } from "../../storage";
import {
  incomeSources as incomeSourcesTable,
  users as usersTable,
} from "@shared/schema";
import {
  getRecurringStreams,
  shouldAutoPromote,
} from "../financial-engine/get-recurring-streams";
import { normalizeSourceName } from "../financial-engine/income";

// Local maps duplicated from routes.ts so the helper is import-safe from
// the webhook handler. Kept in sync intentionally — both sides should
// resolve a stream the same way.
function mapCanonicalToIncomeCategory(canonical: string): string {
  switch ((canonical || "").toLowerCase()) {
    case "income_salary":      return "Salary";
    case "income_freelance":   return "Freelance";
    case "income_business":    return "Business";
    case "income_investment":  return "Investments";
    case "income_rental":      return "Rental";
    case "income_gifts":       return "Gifts";
    case "transfer_refund":    return "Refunds";
    case "income_other":       return "Other";
    default:                   return "Other";
  }
}

function mapStreamFrequencyToRecurrence(
  f: "weekly" | "biweekly" | "semi-monthly" | "monthly" | "quarterly" | "yearly" | "irregular" | null,
): string {
  switch (f) {
    case "weekly":       return "weekly";
    case "biweekly":     return "biweekly";
    case "semi-monthly": return "semimonthly";
    case "monthly":      return "monthly";
    case "quarterly":    return "quarterly";
    case "yearly":       return "yearly";
    case null:           return "irregular";
    default:             return "irregular";
  }
}

export interface StreamForWizard {
  streamId: string;
  source: string;
  amount: number;
  category: string;
  recurrence: string | null;
  dueDay: number;
  confidence: string;
  occurrences: number;
  frequency: string | null;
  status: string;
  nextExpectedDate: string | null;
  wasAutoPromoted: boolean;
}

export interface DetectIncomeResult {
  incomeSources: StreamForWizard[];
  count: number;
  autoPromotedCount: number;
}

/**
 * Run inflow stream detection + auto-promotion for a single user.
 *
 * Always stamps users.last_income_detection_at on completion (even if
 * detection threw or returned 0 streams) so the wizard's sync-status
 * endpoint can advance — a user with no recurring income should not be
 * trapped on the wait screen.
 */
export async function runIncomeDetection(userId: string): Promise<DetectIncomeResult> {
  let result: DetectIncomeResult = { incomeSources: [], count: 0, autoPromotedCount: 0 };

  try {
    // 1. Pull all inflow streams across providers.
    const streams = await getRecurringStreams([userId], {
      direction: "inflow",
      excludeTombstoned: true,
    });

    // 2. Load existing income_sources for dedupe + tombstone-skip.
    // Bypass storage.getIncomeSourcesByUserIds() because that helper
    // filters to isActive=true — but dismissed rows may have isActive=false
    // (§8.2 soft-delete may set both). We need to see every row including
    // dismissed so the auto-promote logic doesn't recreate them.
    const existingSources = await db
      .select()
      .from(incomeSourcesTable)
      .where(eq(incomeSourcesTable.userId, userId));
    const sourceByStreamId = new Map<string, typeof existingSources[number]>();
    const sourceByNormName = new Map<string, typeof existingSources[number]>();
    for (const src of existingSources) {
      if (src.streamId) sourceByStreamId.set(src.streamId, src);
      if (src.normalizedSource) sourceByNormName.set(src.normalizedSource, src);
    }

    const wizardStreams: StreamForWizard[] = [];
    let autoPromotedCount = 0;

    for (const stream of streams) {
      const merchantDisplay = stream.merchant || "Income";
      const normName = normalizeSourceName(merchantDisplay);
      if (!normName) continue;

      const existingByStream = sourceByStreamId.get(stream.streamId);
      const existingByName = sourceByNormName.get(normName);
      const existing = existingByStream ?? existingByName;

      // Tombstone short-circuit per §8.2.
      if ((existing as any)?.userDismissedAt) {
        continue;
      }

      const incomeCategory = mapCanonicalToIncomeCategory(stream.category);
      const recurrenceForRegistry = mapStreamFrequencyToRecurrence(stream.frequency);
      const dueDay = stream.lastDate
        ? Math.max(1, Math.min(31, parseInt(stream.lastDate.slice(8, 10), 10) || 1))
        : 1;

      let wasAutoPromoted = false;

      // 3. Auto-promote ONLY when the stream meets the gate AND there's no
      //    existing registry row. We do not update an existing row's
      //    amount/category here — that's user-controlled territory.
      if (!existing && shouldAutoPromote(stream)) {
        try {
          await storage.upsertIncomeSource(userId, {
            normalizedSource: normName,
            displayName: merchantDisplay,
            recurrence: recurrenceForRegistry as any,
            mode: "fixed",
            cadenceAnchor: stream.lastDate || new Date().toISOString().slice(0, 10),
            category: incomeCategory as any,
            isActive: true,
            autoDetected: true,
            detectedAt: new Date(),
            linkedPlaidAccountId: stream.providerSource === "plaid"
              ? stream.accountId
              : null,
            streamId: stream.streamId,
          } as any, {
            amount: String(stream.lastAmount),
            effectiveFrom: stream.lastDate || new Date().toISOString().slice(0, 10),
          });
          autoPromotedCount++;
          wasAutoPromoted = true;
        } catch (upsertErr: any) {
          console.warn(
            `[detect-income] auto-promote upsert failed for ${normName} (user ${userId}):`,
            upsertErr?.message || upsertErr,
          );
        }
      } else if (existing && !existing.streamId && stream.streamId) {
        // Backfill stream_id on a row created by the home-grown detector
        // before Phase 2. Idempotent. Lets webhook reconciler find it.
        try {
          await storage.updateIncomeSource(userId, existing.id, {
            streamId: stream.streamId,
          } as any);
        } catch (updateErr: any) {
          console.warn(
            `[detect-income] stream_id backfill failed for source ${existing.id}:`,
            updateErr?.message,
          );
        }
      }

      wizardStreams.push({
        streamId: stream.streamId,
        source: merchantDisplay,
        amount: stream.lastAmount,
        category: incomeCategory,
        recurrence: recurrenceForRegistry,
        dueDay,
        confidence: stream.confidence,
        occurrences: stream.occurrenceCount,
        frequency: stream.frequency,
        status: stream.status,
        nextExpectedDate: stream.nextExpectedDate,
        wasAutoPromoted: wasAutoPromoted || (!!existing && (existing as any).autoDetected === true),
      });
    }

    // 4. Persist into onboarding_analysis for back-compat with the legacy
    //    status endpoint (still consumed by App.tsx during the transition).
    const existingAnalysis = await storage.getOnboardingAnalysis(userId);
    let merged: any = { incomeSources: wizardStreams };
    try {
      if (existingAnalysis?.analysisData && existingAnalysis.analysisData !== "{}") {
        const prev = JSON.parse(existingAnalysis.analysisData);
        merged = { ...prev, incomeSources: wizardStreams };
      }
    } catch {
      // Corrupt existing analysisData — overwrite cleanly.
    }

    if (existingAnalysis) {
      await storage.updateOnboardingAnalysis(userId, {
        analysisData: JSON.stringify(merged),
        step: 4,
      });
    } else {
      await storage.createOnboardingAnalysis({
        userId,
        analysisData: JSON.stringify(merged),
        step: 4,
      });
    }

    result = {
      incomeSources: wizardStreams,
      count: wizardStreams.length,
      autoPromotedCount,
    };
  } catch (err: any) {
    console.error(`[detect-income] runIncomeDetection failed for user ${userId}:`, err?.message || err);
    // Do NOT rethrow — we still want to stamp last_income_detection_at so
    // the wizard's sync-status endpoint advances. A user whose Plaid item
    // is broken should land on the dashboard with the existing reconnect
    // flow, not get stuck on the wait screen.
  }

  // 5. Stamp users.last_income_detection_at — runs unconditionally so the
  //    sync-status endpoint can flip incomeDetected=true even when this
  //    run found 0 streams or the upstream provider call threw.
  try {
    await db
      .update(usersTable)
      .set({ lastIncomeDetectionAt: new Date() })
      .where(eq(usersTable.id, userId));
  } catch (stampErr: any) {
    console.warn(
      `[detect-income] failed to stamp last_income_detection_at for ${userId}:`,
      stampErr?.message || stampErr,
    );
  }

  return result;
}
