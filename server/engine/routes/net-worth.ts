/**
 * Engine — net worth read + snapshot routes.
 *
 * These routes were previously /api/net-worth, /api/net-worth/history, and
 * POST /api/net-worth/snapshot in the website's main routes.ts. They've been
 * lifted into the engine so that all financial calculation paths live in
 * one place.
 *
 * After the engine sub-app is mounted at /api/engine, the new paths are:
 *   GET  /api/engine/net-worth           ← also served by core.ts
 *   GET  /api/engine/net-worth/history
 *   POST /api/engine/net-worth/snapshot
 *
 * The legacy /api/net-worth* paths in the website are removed entirely
 * (not aliased) — pre-production cleanup per the architectural plan.
 */

import { Router, Request, Response } from "express";
import { requireContext } from "../context";
import { EngineStorage } from "../storage";
import { loadAndCalculateNetWorth } from "../../lib/net-worth-service";

const router = Router();

/**
 * GET /net-worth/history
 * Returns the most recent N snapshots (default 12) for charting.
 */
router.get("/net-worth/history", async (req: Request, res: Response) => {
  const { userId } = requireContext(req);
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 12;
  const snapshots = await EngineStorage.getNetWorthSnapshots(userId, { limit });
  res.json(snapshots);
});

/**
 * POST /net-worth/snapshot
 * Computes the current net worth via the central service and persists it.
 * The persisted numbers are GUARANTEED to match what the user sees on the
 * Net Worth page and the Accounts page because all three call the same
 * loadAndCalculateNetWorth() function.
 */
router.post("/net-worth/snapshot", async (req: Request, res: Response) => {
  const { userId, householdUserIds, canWrite } = requireContext(req);
  if (!canWrite) {
    return res.status(403).json({ error: "write_not_permitted" });
  }

  const result = await loadAndCalculateNetWorth(householdUserIds, userId, {
    history: false,
  });

  // Map the engine's breakdown buckets back into the legacy
  // net_worth_snapshots column shape so existing history charts still render.
  const ab = result.assetBreakdown || {};
  const lb = result.liabilityBreakdown || {};
  const cashAndBank = ab["Cash"] ?? 0;
  const investments = ab["Investments"] ?? 0;
  const otherAssets = ab["Assets"] ?? 0;
  const realEstate = 0;
  const vehicles = 0;
  const creditCards = lb["Credit Cards"] ?? 0;
  const loans = lb["Other Loans"] ?? 0;
  const mortgages = lb["Mortgages"] ?? 0;
  const otherLiabilities =
    (lb["Overdrawn Cash"] ?? 0) +
    (lb["Lines of Credit"] ?? 0) +
    (lb["Manual Debts"] ?? 0) +
    (lb["Other Debts"] ?? 0);

  const snapshot = await EngineStorage.createNetWorthSnapshot(userId, {
    date: new Date().toISOString().split("T")[0],
    totalAssets: String(result.totalAssets),
    totalLiabilities: String(result.totalLiabilities),
    netWorth: String(result.netWorth),
    cashAndBank: String(cashAndBank),
    investments: String(investments),
    realEstate: String(realEstate),
    vehicles: String(vehicles),
    otherAssets: String(otherAssets),
    creditCards: String(creditCards),
    loans: String(loans),
    mortgages: String(mortgages),
    otherLiabilities: String(otherLiabilities),
  });

  res.status(201).json(snapshot);
});

export default router;
