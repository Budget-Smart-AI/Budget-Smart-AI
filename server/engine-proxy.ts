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
    // Express strips the `/api/engine` mount prefix before handing the request
    // to the proxy middleware, and http-proxy-middleware v3 forwards `req.url`
    // as-is (it does NOT restore `req.originalUrl`). Prepend the prefix back
    // so the engine service's own `/api/engine` sub-app mount matches.
    // Without this, every /api/engine/* call hits the engine's root 404 handler.
    pathRewrite: (path) => `/api/engine${path}`,
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

        // Forbid any caching layer (browser, Cloudflare, intermediaries) from
        // storing API responses. Without this, Chrome applies RFC 7234 heuristic
        // freshness to responses that lack Cache-Control, which caused stale 404s
        // from before 3a4ee69 to linger in user browsers after the deploy.
        proxyRes.headers["cache-control"] = "no-store";
        proxyRes.headers["pragma"] = "no-cache";

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
            .setHeader("Cache-Control", "no-store")
            .setHeader("Pragma", "no-cache")
            .json({ error: "engine_unavailable", reqId });
        } else if (!(res as any).headersSent) {
          (res as any).writeHead?.(503, { "Content-Type": "application/json", "Cache-Control": "no-store", "Pragma": "no-cache" });
          (res as any).end?.(
            JSON.stringify({ error: "engine_unavailable", reqId })
          );
        }
      },
    },
  };

  return createProxyMiddleware(options);
}
