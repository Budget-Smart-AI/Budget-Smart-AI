/**
 * Engine sub-app — the isolated calculation service.
 *
 * This is a self-contained Express sub-application with its OWN middleware
 * stack. When mounted on the website's main app at /api/engine, requests hit
 * these middleware in order BEFORE any handler runs:
 *
 *   1. engineAuth    — requires a valid session; builds EngineContext
 *   2. engineAudit   — structured request/response log line
 *   3. rate limiter  — inherited from the parent app for now
 *   4. route handler — reads from EngineStorage only; never from `storage`
 *   5. error handler — opaque 500 with correlation id; full detail in logs
 *
 * When we split the engine into its own Railway service (Step 3), this file
 * becomes that service's entry point: `createEngineApp()` is the whole thing.
 * No website code is reachable from inside the engine.
 */

import express, { type Express } from "express";
import { engineAuth } from "./middleware/auth";
import { engineAudit } from "./middleware/audit";
import { engineErrorHandler } from "./middleware/error";
import { registerEngineRoutes } from "./routes";

export function createEngineApp(): Express {
  const app = express();

  // Sub-app has its own JSON body parser so it doesn't depend on the parent
  // app's configuration. When we split to a standalone service, this is the
  // same parser that will run.
  app.use(express.json({ limit: "1mb" }));

  // Auth first — EngineContext must exist before any handler reads storage.
  app.use(engineAuth);

  // Audit second — logs userId (now available) and timing for every request.
  app.use(engineAudit);

  // Mount every engine route.
  registerEngineRoutes(app);

  // Final error handler — must be LAST, and must have four parameters so
  // Express recognizes it as an error handler.
  app.use(engineErrorHandler);

  return app;
}
