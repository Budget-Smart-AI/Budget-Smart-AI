// Prevent unhandled exceptions/rejections (e.g. transient SMTP errors) from
// killing the container.  Log the error and keep the process alive.
process.on("uncaughtException", (err) => {
  console.error("[Fatal] Uncaught exception (process will continue):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[Fatal] Unhandled promise rejection (process will continue):", reason);
});

import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initializeUser } from "./auth";
import { initializeSyncScheduler } from "./sync-scheduler";
import { checkAllUsersBudgetAlerts } from "./budget-alerts";
import { landingPageMiddleware } from "./domain-router";
import { apiRateLimiter } from "./rate-limiter";
import { pool, ensureReceiptsTable, ensureSupportTables, ensureVaultTables, ensureAITables, ensureBankProviderTable, ensureMerchantEnrichmentTable, ensureEncryptionColumns, ensureTotpColumns, ensureProfileColumns, ensureHouseholdColumns, ensurePreferenceColumns, ensureAuditLogTable, ensureLoginSecurityColumns, ensureDeletionColumns, ensureSupportPortalTables, ensureUserAICostsTable, ensureUserFeatureUsageTable, ensurePlanColumns, ensurePlanFeatureLimitsTable, ensureSyncCursorColumn, ensureIsSyncingColumn, ensureBillRemindersSentTable, ensureLandingSettingsTable, ensureOnboardingProgressColumn, ensureBudgetPeriodColumns, ensureIncomeAutoDetectionColumns, ensurePlaidEnrichmentColumns } from "./db";
import { encrypt, decrypt } from "./encryption";
import { db } from "./db";
import { plaidItems } from "@shared/schema";
import { eq } from "drizzle-orm";

try {
  const test = encrypt("health-check");
  decrypt(test);
  console.log("[Encryption] Field encryption operational");
} catch {
  console.error("[Encryption] FIELD_ENCRYPTION_KEY missing or invalid — encryption disabled. Set a valid 64-hex-char FIELD_ENCRYPTION_KEY env var.");
  // Do NOT exit — allow the server to start so Railway's /health check can pass
  // and the error is visible in logs. Encrypted features will be degraded.
}

const app = express();
const httpServer = createServer(app);

// Record boot time for the /health startup grace period.
const startTime = Date.now();

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Trust proxy for production (Replit runs behind a reverse proxy)
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Health check — registered BEFORE the HTTPS redirect, helmet, session, and
// rate-limiter so Railway's internal HTTP probe is never redirected (301) or
// blocked by CSP headers / rate-limit 429s.
// During the first 30 s after boot the DB pool may not be ready yet, so
// we return { status: "starting" } with HTTP 200 to avoid false failures.
app.get("/health", async (_req, res) => {
  const uptime = process.uptime();
  if (Date.now() - startTime < 30000) {
    return res.json({ status: "starting", uptime });
  }

  let dbHealthy = false;
  let encryptionHealthy = false;

  // Database check with 2s timeout
  try {
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DB timeout")), 2000)
      ),
    ]);
    dbHealthy = true;
  } catch (err) {
    console.error("[Health] Database check failed:", err);
  }

  // Encryption check
  try {
    const testCipher = encrypt("health-check");
    decrypt(testCipher);
    encryptionHealthy = true;
  } catch (err) {
    console.error("[Health] Encryption check failed:", err);
  }

  const statusCode = dbHealthy ? 200 : 503;
  return res.status(statusCode).json({
    status: dbHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    checks: {
      database: dbHealthy ? "ok" : "error",
      encryption: encryptionHealthy ? "ok" : "error",
    },
    uptime: process.uptime(),
  });
});

// HTTPS redirect in production — registered AFTER /health so Railway's
// internal HTTP health probe is not redirected before it can reach the handler.
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    if (req.headers["x-forwarded-proto"] !== "https") {
      return res.redirect(301, "https://" + req.headers.host + req.url);
    }
    next();
  });
}

// Block version-control probe paths that should never be publicly accessible.
const VCS_PROBE_RE = /^\/(\.git|\.svn|\.hg|\.bzr|_darcs|BitKeeper)(\/|$)/;
app.use((req, res, next) => {
  if (VCS_PROBE_RE.test(req.path)) {
    return res.status(404).end();
  }
  next();
});

// Security headers via helmet — registered here (before session and static files)
// so that ALL responses, including static files like robots.txt, receive the
// full set of security headers.
//
// Pen-test findings addressed:
//   1. HSTS (Strict-Transport-Security) — set via strictTransportSecurity with
//      a 1-year max-age, includeSubDomains, and preload flag.
//   2. X-Content-Type-Options: nosniff — set via xContentTypeOptions so that
//      every response (including static files such as /robots.txt) includes the
//      header.  The static-file middleware (express.static) is registered later
//      in the async startup IIFE, ensuring helmet always runs first.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.plaid.com",
          "https://assets.mx.com",
          "https://atrium.mx.com",
          "https://js.stripe.com",
          "https://www.googletagmanager.com",
          "https://app.partnero.com",
          "https://static.cloudflareinsights.com",
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.plaid.com",
          "https://atrium.mx.com",
          "https://fonts.googleapis.com",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          "https://api.plaid.com",
          "https://api.mx.com",
          "https://api.deepseek.com",
            "https://api.openai.com",
          ],
        frameSrc: ["https://cdn.plaid.com", "https://*.plaid.com", "https://*.moneydesktop.com"],
        objectSrc: ["'none'"],
      },
    },
    // Pen-test fix 1: HSTS with 1-year max-age, includeSubDomains, and preload.
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true, preload: true },
    // Pen-test fix 2: X-Content-Type-Options: nosniff on all responses.
    xContentTypeOptions: true,
    referrerPolicy: { policy: "strict-origin" },
  })
);

const PgStore = connectPgSimple(session);

if (!process.env.DATABASE_URL) {
  console.warn("Warning: DATABASE_URL not set. Session store will not work correctly.");
}

const SESSION_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

app.use(
  session({
    store: new PgStore({
      conString: process.env.DATABASE_URL,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "budgetsmart-dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    proxy: process.env.NODE_ENV === "production",
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: SESSION_MAX_AGE,
      sameSite: "strict",
      // Only set a specific cookie domain when MAIN_DOMAIN is explicitly
      // configured; omitting it allows the cookie to work on any host
      // (e.g. Railway, Replit, or a custom domain) without the browser
      // rejecting a cookie whose domain doesn't match the current origin.
      domain: process.env.MAIN_DOMAIN ? `.${process.env.MAIN_DOMAIN}` : undefined,
    },
  })
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

initializeUser().catch(console.error);
initializeSyncScheduler().catch(console.error);

/**
 * Reset any plaid_items rows that were left with isSyncing=true from a
 * previous crashed or interrupted sync. Safe to run on every deploy.
 */
async function resetStuckSyncs() {
  try {
    await db.update(plaidItems).set({ isSyncing: false });
    console.log("[Startup] Reset any stuck Plaid sync flags (isSyncing → false)");
  } catch (err) {
    console.error("[Startup] Could not reset stuck sync flags:", err);
  }
}
resetStuckSyncs();

/**
 * Migrate any plaid_items rows where item_id was accidentally stored as an
 * AES-256-GCM ciphertext instead of plaintext.  The webhook handler matches
 * Plaid's real item_id against the item_id column, so it must be plaintext.
 *
 * Tries to decrypt every item_id unconditionally — if decryption succeeds and
 * the result looks like a real Plaid ID (alphanumeric only, no + / = padding
 * chars), the row is updated.  This avoids the previous false-positive where
 * short base64 ciphertexts (37 chars) passed the old length-based heuristic
 * and were incorrectly skipped.
 *
 * Safe to run on every deploy — rows that are already plaintext will either
 * fail to decrypt (caught) or produce an unchanged value (skipped).
 */
async function migrateItemIds() {
  try {
    const items = await db.query.plaidItems.findMany();
    let migrated = 0;
    let skipped = 0;

    for (const item of items) {
      if (!item.itemId) {
        skipped++;
        continue;
      }

      try {
        const decrypted = decrypt(item.itemId);

        // Only update if decryption actually changed the value
        // AND the result looks like a real Plaid ID.
        // Real Plaid IDs are purely alphanumeric — they never contain + / = chars.
        const changedValue = decrypted !== item.itemId;
        const looksLikePlaidId = /^[a-zA-Z0-9]{20,60}$/.test(decrypted);

        if (changedValue && looksLikePlaidId) {
          await db.update(plaidItems)
            .set({ itemId: decrypted })
            .where(eq(plaidItems.id, item.id));
          migrated++;
          console.log(
            `[Migration] ✅ Decrypted item_id: ${item.institutionName} ` +
            `was: ${item.itemId.substring(0, 15)}... ` +
            `now: ${decrypted.substring(0, 15)}... ` +
            `length: ${decrypted.length}`
          );
        } else {
          skipped++;
          console.log(
            `[Migration] Skipped ${item.institutionName}: ` +
            `changed=${changedValue} looksValid=${looksLikePlaidId} ` +
            `preview=${decrypted.substring(0, 15)}...`
          );
        }
      } catch (err) {
        skipped++;
        console.error(`[Migration] Error for ${item.institutionName}:`, err);
      }
    }

    console.log(
      `[Startup] migrateItemIds complete — migrated=${migrated} skipped=${skipped}`
    );
  } catch (err) {
    console.error('[Migration] Failed:', err);
  }
}
migrateItemIds();

setTimeout(() => {
  checkAllUsersBudgetAlerts().catch(console.error);
}, 5000);
setInterval(() => {
  checkAllUsersBudgetAlerts().catch(console.error);
}, 60 * 60 * 1000);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

// Bind the HTTP server to the port IMMEDIATELY so Railway's /health probe
// can succeed during the 30-second grace period while async DB init runs.
// The /health handler returns { status: "starting" } for the first 30 s.
const port = parseInt(process.env.PORT || "5000", 10);
if (process.env.NODE_ENV === "development") {
  httpServer.listen(port, "127.0.0.1", () => {
    log(`serving on port ${port}`);
  });
} else {
  httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
  });
}

(async () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL DATABASE INITIALIZATION - FATAL IF THESE FAIL
  // These tables are required for feature gating to work. Without them, the app
  // cannot enforce plan limits and will not function correctly. We must halt
  // startup if either table creation fails.
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    await ensureUserFeatureUsageTable();
    console.log("✅ user_feature_usage table ready");
  } catch (err) {
    console.error("❌ FATAL: Failed to create user_feature_usage table:", err);
    console.error("Cannot start server without user_feature_usage table - feature gating will not work");
    process.exit(1);
  }

  try {
    await ensurePlanFeatureLimitsTable();
    console.log("✅ plan_feature_limits table ready");
  } catch (err) {
    console.error("❌ FATAL: Failed to create plan_feature_limits table:", err);
    console.error("Cannot start server without plan_feature_limits table - feature gating will not work");
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NON-CRITICAL TABLE INITIALIZATION
  // These tables are important but not critical - if they fail, log the error
  // and continue with degraded functionality.
  // ═══════════════════════════════════════════════════════════════════════════

  // Ensure the receipts table exists before handling any requests.
  // This is safe to call on every startup (uses CREATE TABLE IF NOT EXISTS).
  // If this fails, receipt functionality will be unavailable but other features
  // will continue to work.
  await ensureReceiptsTable().catch(err =>
    console.error("Failed to ensure receipts table — receipt upload/display will not work:", err)
  );

  await ensureSupportTables().catch(err =>
    console.error("Failed to ensure support tables — support ticket system will not work:", err)
  );

  await ensureVaultTables().catch(err =>
    console.error("Failed to ensure vault tables — Financial Vault will not work:", err)
  );

  await ensureAITables().catch(err =>
    console.error("Failed to ensure AI tables — AI model management will not work:", err)
  );

  await ensureBankProviderTable().catch(err =>
    console.error("Failed to ensure bank provider table — bank provider management will not work:", err)
  );

  await ensureMerchantEnrichmentTable().catch(err =>
    console.error("Failed to ensure merchant enrichment table — transaction enrichment will not work:", err)
  );

  await ensureEncryptionColumns().catch(err =>
    console.error("Failed to ensure encryption columns — field-level encryption will not work:", err)
  );

  await ensureTotpColumns().catch(err =>
    console.error("Failed to ensure TOTP columns — 2FA backup codes will not work:", err)
  );

  await ensureProfileColumns().catch(err =>
    console.error("Failed to ensure profile columns — avatar/display name/birthday/timezone will not work:", err)
  );

  await ensureHouseholdColumns().catch(err =>
    console.error("Failed to ensure household columns — household address/financial professional access will not work:", err)
  );

  await ensurePreferenceColumns().catch(err =>
    console.error("Failed to ensure preference columns — user preferences and needs-review flag will not work:", err)
  );

  await ensureAuditLogTable().catch(err =>
    console.error("Failed to ensure audit log table — SOC 2 audit logging will not work:", err)
  );

  await ensureLoginSecurityColumns().catch(err =>
    console.error("Failed to ensure login security columns — account lockout will not work:", err)
  );

  await ensureDeletionColumns().catch(err =>
    console.error("Failed to ensure deletion columns — account deletion will not work:", err)
  );

  await ensurePlanColumns().catch(err =>
    console.error("Failed to ensure plan columns — plan tier tracking will not work:", err)
  );

  await ensureSupportPortalTables().catch(err =>
    console.error("Failed to ensure support portal tables — KB feedback and ticket triage will not work:", err)
  );

  await ensureUserAICostsTable().catch(err =>
    console.error("Failed to ensure user_ai_costs table — admin AI cost analytics will not work:", err)
  );

  await ensureSyncCursorColumn().catch(err =>
    console.error("Failed to ensure sync_cursor/is_active columns — Plaid /transactions/sync will not work:", err)
  );

  await ensureIsSyncingColumn().catch(err =>
    console.error("Failed to ensure is_syncing column — Plaid sync race condition guard will not work:", err)
  );

  await ensureBillRemindersSentTable().catch(err =>
    console.error("Failed to ensure bill_reminders_sent table — bill reminder deduplication will not work (duplicate emails may be sent on deploy):", err)
  );

  await ensureLandingSettingsTable().catch(err =>
    console.error("Failed to ensure landing_settings table — landing page and chatbot config will not work:", err)
  );

  await ensureOnboardingProgressColumn().catch(err =>
    console.error("Failed to ensure onboarding_progress column — onboarding wizard progress will not be saved:", err)
  );

  await ensureBudgetPeriodColumns().catch(err =>
    console.error("Failed to ensure budget_period/next_payday columns — paycheck-aligned budgets will not work:", err)
  );

  await ensureIncomeAutoDetectionColumns().catch(err =>
    console.error("Failed to ensure income auto_detected/detected_at columns — recurring income detection will not work:", err)
  );

  await ensurePlaidEnrichmentColumns().catch(err =>
    console.error("Failed to ensure Plaid enrichment columns — personal_finance_category/transfer detection will not work:", err)
  );

  // Note: ensureUserFeatureUsageTable() and ensurePlanFeatureLimitsTable() are now
  // called at the very top of startup (CRITICAL section) and will halt if they fail.

  // seedPlanFeatureLimits is also called inside ensurePlanFeatureLimitsTable above,
  // but we keep this explicit call so the admin-plans endpoint stays independently
  // exercised and so startup logs confirm the upsert count.
  const { seedPlanFeatureLimits } = await import("./routes/admin-plans");
  await seedPlanFeatureLimits().catch(err =>
    console.error("Failed to seed plan_feature_limits - admin panel may show empty:", err)
  );

  // Seed Bedrock AI model defaults and verify connection
  const { seedAIModelDefaults, verifyBedrockConnection, fixStaleModelKeys } = await import("./lib/bedrock");
  await seedAIModelDefaults().catch(err =>
    console.error("Failed to seed AI model defaults - Bedrock model config will use code defaults:", err)
  );
  await fixStaleModelKeys().catch(err =>
    console.error("Failed to fix stale model keys - AI features may use outdated model IDs:", err)
  );
  verifyBedrockConnection().catch(err =>
    console.warn("Bedrock connection check failed - AI features may be unavailable:", err)
  );

  // Apply apiRateLimiter globally to all /api routes before route definitions.
  // Auth routes additionally apply authRateLimiter (stricter: 10 req/15 min).
  app.use("/api", apiRateLimiter);

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // Handle landing page domain (budgetsmart.io) before SPA catch-all
  // This serves the landing page for the main domain while app.budgetsmart.io gets the SPA
  app.use(landingPageMiddleware);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  console.log('[Plaid] Webhook URL:', process.env.PLAID_WEBHOOK_URL);
  console.log('[MX] Webhook URL:', process.env.MX_WEBHOOK_URL);
})().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
