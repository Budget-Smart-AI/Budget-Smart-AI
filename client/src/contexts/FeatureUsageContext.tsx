/**
 * FeatureUsageContext
 *
 * Provides real-time feature-usage state to the entire app.
 *
 * Responsibilities:
 *  1. Loads the initial feature usage summary from /api/features/usage on mount.
 *  2. Exposes a `recordGate()` helper so the API client can push 402 payloads
 *     into the context, updating gate state in real-time as the user hits limits
 *     during a session — no page refresh required.
 *  3. Exposes `getFeatureState(featureKey)` so FeatureGate components can
 *     derive their current access state.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { subscribe402 } from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeatureSummaryItem {
  featureKey: string;
  displayName: string;
  allowed: boolean;
  currentUsage: number;
  limit: number | null;
  remaining: number | null;
  resetDate: Date | null;
  upgradeRequired: boolean;
}

export interface GatedFeatureState {
  /** true  → render children normally */
  allowed: boolean;
  /** "limit_reached" | "upgrade_required" | "allowed" */
  reason: "allowed" | "limit_reached" | "upgrade_required";
  remaining: number | null;
  limit: number | null;
  resetDate: Date | null;
  upgradeRequired: boolean;
}

interface FeatureUsageContextValue {
  /** Current plan string ("free" | "pro" | "family") */
  plan: string;
  /** Full summary keyed by lower-cased feature key */
  usageMap: Map<string, FeatureSummaryItem>;
  /** Push a 402 payload (from the API fetch wrapper) into the context */
  recordGate: (featureKey: string, remaining: number, resetDate: Date | null) => void;
  /** Get the current gate state for a feature key */
  getFeatureState: (featureKey: string) => GatedFeatureState | null;
  /** Whether the initial load is still in progress */
  isLoading: boolean;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const FeatureUsageContext = createContext<FeatureUsageContextValue>({
  plan: "free",
  usageMap: new Map(),
  recordGate: () => undefined,
  getFeatureState: () => null,
  isLoading: true,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

interface FeatureUsageApiResponse {
  plan: string;
  summary: Array<{
    featureKey: string;
    displayName: string;
    allowed: boolean;
    currentUsage: number;
    limit: number | null;
    remaining: number | null;
    resetDate: string | null;
    upgradeRequired: boolean;
  }>;
}

export function FeatureUsageProvider({ children }: { children: ReactNode }) {
  const [usageMap, setUsageMap] = useState<Map<string, FeatureSummaryItem>>(new Map());
  const [plan, setPlan] = useState("free");

  const { data, isLoading } = useQuery<FeatureUsageApiResponse>({
    queryKey: ["/api/features/usage"],
    retry: false,
  });

  // Populate usageMap when the API responds
  useEffect(() => {
    if (!data) return;
    setPlan(data.plan || "free");
    const map = new Map<string, FeatureSummaryItem>();
    for (const item of data.summary) {
      map.set(item.featureKey.toLowerCase(), {
        ...item,
        resetDate: item.resetDate ? new Date(item.resetDate) : null,
      });
    }
    setUsageMap(map);
  }, [data]);

  /**
   * Called by the fetch wrapper when a 402 is received.
   * Updates the usage map entry in-place so FeatureGate components react
   * immediately.
   */
  const recordGate = useCallback(
    (featureKey: string, remaining: number, resetDate: Date | null) => {
      const key = featureKey.toLowerCase();
      setUsageMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(key);
        if (existing) {
          next.set(key, {
            ...existing,
            allowed: false,
            remaining: 0,
            currentUsage: existing.limit ?? existing.currentUsage,
          });
        } else {
          next.set(key, {
            featureKey: key,
            displayName: key,
            allowed: false,
            currentUsage: 0,
            limit: null,
            remaining: 0,
            resetDate,
            upgradeRequired: remaining === 0,
          });
        }
        return next;
      });
    },
    []
  );

  const getFeatureState = useCallback(
    (featureKey: string): GatedFeatureState | null => {
      const key = featureKey.toLowerCase();
      const item = usageMap.get(key);
      if (!item) return null;

      if (item.upgradeRequired) {
        return {
          allowed: false,
          reason: "upgrade_required",
          remaining: 0,
          limit: item.limit,
          resetDate: item.resetDate,
          upgradeRequired: true,
        };
      }
      if (!item.allowed) {
        return {
          allowed: false,
          reason: "limit_reached",
          remaining: 0,
          limit: item.limit,
          resetDate: item.resetDate,
          upgradeRequired: false,
        };
      }
      return {
        allowed: true,
        reason: "allowed",
        remaining: item.remaining,
        limit: item.limit,
        resetDate: item.resetDate,
        upgradeRequired: false,
      };
    },
    [usageMap]
  );

  // Subscribe to real-time 402 gate events from the API fetch wrapper
  useEffect(() => {
    const unsub = subscribe402(({ feature, remaining, resetDate }) => {
      recordGate(feature, remaining, resetDate);
    });
    return unsub;
  }, [recordGate]);

  return (
    <FeatureUsageContext.Provider
      value={{ plan, usageMap, recordGate, getFeatureState, isLoading }}
    >
      {children}
    </FeatureUsageContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFeatureUsage() {
  return useContext(FeatureUsageContext);
}
