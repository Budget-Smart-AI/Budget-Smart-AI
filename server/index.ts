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
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initializeUser } from "./auth";
import { initializeSyncScheduler } from "./sync-scheduler";
import { checkAllUsersBudgetAlerts } from "./budget-alerts";
import { landingPageMiddleware } from "./domain-router";
import { ensureReceiptsTable } from "./db";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Trust proxy for production (Replit runs behind a reverse proxy)
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const PgStore = connectPgSimple(session);

if (!process.env.DATABASE_URL) {
  console.warn("Warning: DATABASE_URL not set. Session store will not work correctly.");
}

const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

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
      sameSite: "lax",
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

(async () => {
  // Ensure the receipts table exists before handling any requests.
  // This is safe to call on every startup (uses CREATE TABLE IF NOT EXISTS).
  // If this fails, receipt functionality will be unavailable but other features
  // will continue to work.
  await ensureReceiptsTable().catch(err =>
    console.error("Failed to ensure receipts table — receipt upload/display will not work:", err)
  );

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

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
