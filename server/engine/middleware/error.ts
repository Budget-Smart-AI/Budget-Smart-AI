/**
 * Engine error handler.
 *
 * Never leaks stack traces, SQL, user IDs, or internal paths in the HTTP
 * response. The client gets a stable error shape with a correlation ID it can
 * quote to support; the full error detail lives only in server logs.
 *
 * This matches SOC2 expectations (CC7.2 monitoring) and OWASP A09 (security
 * logging failures): observable on the server side, opaque on the client side.
 */

import type { Request, Response, NextFunction } from "express";
import type { EngineRequest } from "../context";

export function engineErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const ctx = (req as EngineRequest).engineContext;
  const requestId = ctx?.requestId ?? "unknown";

  // Full detail to server logs only.
  console.error(
    JSON.stringify({
      at: new Date().toISOString(),
      level: "error",
      component: "engine",
      request_id: requestId,
      user_id: ctx?.userId,
      path: req.originalUrl,
      method: req.method,
      error_message: err instanceof Error ? err.message : String(err),
      error_stack: err instanceof Error ? err.stack : undefined,
    })
  );

  if (res.headersSent) return;

  // Opaque shape to the client.
  res.status(500).json({
    error: "internal_error",
    message: "The engine encountered an error processing this request.",
    request_id: requestId,
  });
}
