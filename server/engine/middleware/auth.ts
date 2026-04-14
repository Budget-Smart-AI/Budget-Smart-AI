/**
 * Engine auth middleware — establishes EngineContext.
 *
 * This is the ONLY place identity is resolved for the engine sub-app. Every
 * request reaching an engine handler has already passed through here, so every
 * handler can assume `req.engineContext` is present and valid.
 *
 * Today: session-cookie auth (same as the website). Step 2 adds JWT auth
 * alongside cookies so mobile apps can call the engine without cookies. When
 * JWT lands, this middleware accepts either credential type and produces the
 * same EngineContext shape, so handlers don't care which path was used.
 */

import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import type { EngineContext, EngineRequest } from "../context";
import { storage } from "../../storage";

export async function engineAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Every engine request gets a correlation ID. If the caller supplied one
  // (mobile client, web client) we preserve it; otherwise we mint one.
  const requestId =
    (req.headers["x-request-id"] as string | undefined) ||
    crypto.randomUUID();
  res.setHeader("x-request-id", requestId);

  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({
      error: "unauthenticated",
      request_id: requestId,
    });
    return;
  }

  // Build household scope. If the user is in a household, queries fan out to
  // all members they're authorized to see; otherwise just their own userId.
  const householdId = req.session.householdId;
  const householdUserIds = householdId
    ? await storage.getHouseholdMemberUserIds(householdId)
    : [userId];

  // Default to write-enabled. The session sets `canWrite=false` for
  // view-only financial-professional access; we respect that if present.
  // Read defensively because session typing varies across the codebase.
  const canWrite = (req.session as any)?.canWrite !== false;

  const ctx: EngineContext = {
    userId,
    householdUserIds,
    canWrite,
    requestId,
  };

  (req as EngineRequest).engineContext = ctx;
  next();
}
