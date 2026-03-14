/**
 * Track upgrade CTA clicks for conversion analytics.
 * Logs to audit log with source so we can measure which placement converts best.
 */
import { apiRequest } from "@/lib/queryClient";

export type UpgradeCtaSource = "top_nav" | "sidebar" | "feature_gate" | "locked_nav";

export async function trackUpgradeCta(source: UpgradeCtaSource): Promise<void> {
  try {
    await apiRequest("POST", "/api/billing/track-upgrade-cta", { source });
  } catch {
    // Fire-and-forget; never block the user
  }
}
