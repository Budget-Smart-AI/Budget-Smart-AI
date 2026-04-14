/**
 * Engine route registry.
 *
 * Mounts every engine route on the sub-app. Keep this thin — domain logic
 * lives in the individual route files.
 */
import type { Express } from "express";
import coreRouter from "./core";
import netWorthRouter from "./net-worth";

export function registerEngineRoutes(app: Express): void {
  // Core calculation routes (dashboard, income, expenses, bills, etc.)
  app.use("/", coreRouter);

  // Net-worth snapshot CRUD + history (migrated out of the legacy routes.ts).
  app.use("/", netWorthRouter);
}
