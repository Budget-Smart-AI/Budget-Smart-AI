/**
 * Engine audit logger.
 *
 * Emits one structured line per request: correlation id, user, route, method,
 * status, ms. SOC2 auditors ask for this. Today it writes to stdout; we'll
 * ship logs to a retained sink (Axiom / CloudWatch / etc.) before production.
 *
 * Intentionally does NOT log request/response bodies — those contain PII
 * (transaction data, account balances). A sampled deep-log mode can be added
 * later behind a feature flag if we need it for debugging.
 */

import type { Request, Response, NextFunction } from "express";
import type { EngineRequest } from "../context";

export function engineAudit(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const started = Date.now();
  const { method, originalUrl } = req;

  res.on("finish", () => {
    const ctx = (req as EngineRequest).engineContext;
    const line = {
      at: new Date().toISOString(),
      level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      component: "engine",
      request_id: ctx?.requestId,
      user_id: ctx?.userId,
      household_scope: ctx?.householdUserIds?.length,
      method,
      path: originalUrl,
      status: res.statusCode,
      ms: Date.now() - started,
    };
    // JSON lines → structured log sinks parse this trivially.
    console.log(JSON.stringify(line));
  });

  next();
}
