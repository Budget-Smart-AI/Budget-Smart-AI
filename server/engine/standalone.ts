/**
 * Engine standalone entry point.
 *
 * This file boots the financial calculation engine as its OWN process —
 * independent of the website. Railway runs this as a separate service
 * behind api.budgetsmart.io, with a restricted Neon role that can only
 * read financial tables and write net-worth snapshots.
 *
 * What this process runs:
 *   • an Express HTTP server on $PORT
 *   • /health for Railway's probe
 *   • /api/engine/* — the isolated engine sub-app (createEngineApp)
 *
 * What this process does NOT run:
 *   • the website's Vite dev server
 *   • the email scheduler
 *   • the Plaid/MX sync scheduler (those own tokens; the engine must not)
 *   • AI coach, budget alerts, etc.
 *   • any user-facing website routes
 *
 * Environment variables (set in Railway for this service):
 *   NODE_ENV=production
 *   PORT=(provided by Railway)
 *   DATABASE_URL=(engine_role connection string — least-privileged)
 *   SESSION_SECRET=(shared with website so cookies validate across services)
 *   FIELD_ENCRYPTION_KEY=(shared — so encrypted columns can be read)
 *   ENGINE_ALLOWED_ORIGINS=https://app.budgetsmart.io,https://budgetsmart.io
 *   MAIN_DOMAIN=budgetsmart.io   (for cookie domain scoping)
 */

process.on("uncaughtException", (err) => {
  console.error("[Engine][Fatal] Uncaught exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[Engine][Fatal] Unhandled promise rejection:", reason);
});

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import { createServer } from "http";
import { createEngineApp } from "./app";
import { pool } from "../db";
import { encrypt, decrypt } from "../encryption";

// Sanity-check encryption at boot — shared FIELD_ENCRYPTION_KEY is required
// because some read paths decrypt columns (e.g., plaid_items.item_id).
try {
  const test = encrypt("engine-boot");
  decrypt(test);
  console.log("[Engine][Encryption] Operational");
} catch {
  console.error(
    "[Engine][Encryption] FIELD_ENCRYPTION_KEY missing or invalid — " +
      "features that read encrypted columns will degrade. Set a 64-hex-char key."
  );
}

const app = express();
const httpServer = createServer(app);
const startTime = Date.now();

// Behind Railway's reverse proxy in production.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// ── Health check (registered FIRST, before HTTPS redirect and session) ──
// Railway's HTTP probe hits this during the 30-second grace period after
// boot while the DB pool warms up.
app.get("/health", async (_req, res) => {
  const uptime = process.uptime();
  if (Date.now() - startTime < 30000) {
    return res.json({ status: "starting", service: "engine", uptime });
  }
  let dbHealthy = false;
  try {
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DB timeout")), 2000)
      ),
    ]);
    dbHealthy = true;
  } catch (err) {
    console.error("[Engine][Health] DB check failed:", err);
  }
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? "healthy" : "unhealthy",
    service: "engine",
    checks: { database: dbHealthy ? "ok" : "error" },
    uptime: process.uptime(),
  });
});

// HTTPS redirect in production (after /health so Railway's HTTP probe works).
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    if (req.headers["x-forwarded-proto"] !== "https") {
      return res.redirect(301, "https://" + req.headers.host + req.url);
    }
    next();
  });
}

// Block VCS probe paths.
const VCS_PROBE_RE = /^\/(\.git|\.svn|\.hg|\.bzr|_darcs|BitKeeper)(\/|$)/;
app.use((req, res, next) => {
  if (VCS_PROBE_RE.test(req.path)) return res.status(404).end();
  next();
});

// Security headers — the engine only serves JSON, so the CSP can be strict.
app.use(
  helmet({
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    xContentTypeOptions: true,
    referrerPolicy: { policy: "strict-origin" },
    // No need for a CSP here — we never serve HTML from api.budgetsmart.io.
    contentSecurityPolicy: false,
  })
);

// ── CORS ────────────────────────────────────────────────────────────────
// The browser calls https://api.budgetsmart.io from https://app.budgetsmart.io
// so the engine must allow that origin AND credentials (cookies).
const ALLOWED_ORIGINS = (
  process.env.ENGINE_ALLOWED_ORIGINS ||
  "https://app.budgetsmart.io,https://budgetsmart.io"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, DELETE, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Request-Id, X-Requested-With"
    );
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── Session (shared cookies with the website) ───────────────────────────
// In Step 2 we'll add JWT auth alongside this so mobile apps can call the
// engine without browser cookies. For now the engine validates the same
// session the website does — possible because both services connect to the
// same Neon DB (the session table is shared) and share SESSION_SECRET.
const PgStore = connectPgSimple(session);
app.use(
  session({
    store: new PgStore({
      conString: process.env.DATABASE_URL,
      tableName: "session",
      // The website's startup creates this table; the engine should never
      // attempt DDL.
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET || "budgetsmart-dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    proxy: process.env.NODE_ENV === "production",
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      // Cross-subdomain cookies (app.budgetsmart.io ↔ api.budgetsmart.io)
      // require sameSite=none + secure=true in production. Development uses
      // strict because there's no cross-origin call.
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      domain: process.env.MAIN_DOMAIN ? `.${process.env.MAIN_DOMAIN}` : undefined,
    },
  })
);

// ── Mount the engine sub-app ────────────────────────────────────────────
app.use("/api/engine", createEngineApp());

// 404 for anything else — the engine exposes only /health and /api/engine/*.
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

// Final error handler — opaque JSON with no stack leak.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Engine][Fatal] Request error:", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "internal_error" });
});

// Bind the port IMMEDIATELY so Railway's probe succeeds during the grace window.
const port = parseInt(process.env.PORT || "8081", 10);
httpServer.listen({ port, host: "0.0.0.0" }, () => {
  console.log(`[Engine] serving on port ${port}`);
  console.log(`[Engine] allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
