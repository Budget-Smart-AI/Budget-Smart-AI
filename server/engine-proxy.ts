/**
 * Engine routing proxy.
 *
 * Forwards /api/engine/* on the website host to the engine service on
 * api.budgetsmart.io. Purpose: give every caller (client-side apiRequest,
 * raw fetch, server-side helpers, curl probes) one URL that works, and
 * keep the session cookie same-origin so Safari ITP doesn't strip it.
 *
 * Mount BEFORE the session middleware — the proxy doesn't need a decoded
 * session; it just forwards the raw Cookie header. The engine validates
 * the same cookie against the shared Neon session table.
 */

import type { RequestHandler } from "express";
import { createProxyMiddleware, type Options } from "http-proxy-middleware";

const DEFAULT_TARGET = "https://api.budgetsmart.io";

export function engineProxy(): RequestHandler {
  const target = process.env.ENGINE_BASE_URL || DEFAULT_TARGET;

  const options: Options = {
    target,
    changeOrigin: true,
    xfwd: true,
    secure: true,
    proxyTimeout: 15_000,
    timeout: 15_000,
    // Keep the path as-is: /api/engine/budgets -> {target}/api/engine/budgets.
    pathRewrite: undefined,
    // Preserve the cookie domain the engine sets (or strip if it leaks).
    cookieDomainRewrite: "",
    on: {
      proxyReq: (proxyReq, req) => {
        // Correlation id for cross-service log tracing.
        const reqId =
          (req.headers["x-request-id"] as string) ||
          `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        proxyReq.setHeader("X-Request-Id", reqId);
        (req as any).__engineReqId = reqId;
        (req as any).__engineStart = Date.now();
      },
      proxyRes: (proxyRes, req) => {
        const start = (req as any).__engineStart as number | undefined;
        const latencyMs = start ? Date.now() - start : -1;
        const reqId = (req as any).__engineReqId;
        console.log(
          `[engine-proxy] ${req.method} ${req.url} -> ${proxyRes.statusCode} ${latencyMs}ms reqId=${reqId}`
        );
      },
      error: (err, req, res) => {
        const reqId = (req as any).__engineReqId;
        console.error(
          `[engine-proxy] upstream error reqId=${reqId} err=${err.message}`
        );
        // res might be a plain net.Socket for websocket attempts; guard.
        if ("status" in res && typeof (res as any).status === "function") {
          (res as any)
            .status(503)
            .json({ error: "engine_unavailable", reqId });
        } else if (!(res as any).headersSent) {
          (res as any).writeHead?.(503, { "Content-Type": "application/json" });
          (res as any).end?.(
            JSON.stringify({ error: "engine_unavailable", reqId })
          );
        }
      },
    },
  };

  return createProxyMiddleware(options);
}
