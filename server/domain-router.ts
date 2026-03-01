import { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";

// Domain configuration
const APP_SUBDOMAIN = "app";
const MAIN_DOMAIN = "budgetsmart.io";

/**
 * Check if the request is for the main landing page domain
 */
export function isLandingPageDomain(req: Request): boolean {
  const host = req.hostname || req.get("host") || "";

  // Remove port if present
  const hostname = host.split(":")[0].toLowerCase();

  // Check if it's the main domain (budgetsmart.io or www.budgetsmart.io)
  // but NOT the app subdomain (app.budgetsmart.io)
  if (hostname === MAIN_DOMAIN || hostname === `www.${MAIN_DOMAIN}`) {
    return true;
  }

  return false;
}

/**
 * Check if the request is for the app subdomain
 */
export function isAppDomain(req: Request): boolean {
  const host = req.hostname || req.get("host") || "";
  const hostname = host.split(":")[0].toLowerCase();

  // Check if it's the app subdomain
  if (hostname === `${APP_SUBDOMAIN}.${MAIN_DOMAIN}`) {
    return true;
  }

  // In development, treat localhost as app domain
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return true;
  }

  // Replit dev domains should also serve the app
  if (hostname.includes(".repl.") || hostname.includes(".replit.")) {
    return true;
  }

  return false;
}

/**
 * Serve a landing page HTML file
 */
export function serveLandingFile(filename: string, _req: Request, res: Response): void {
  const filePath = path.resolve(__dirname, "landing", filename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    // Fallback to index.html if specific page doesn't exist
    const indexPath = path.resolve(__dirname, "landing", "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Page not found");
    }
  }
}

/**
 * Serve the main landing page (index.html)
 */
export function serveLandingPage(_req: Request, res: Response): void {
  const landingPath = path.resolve(__dirname, "landing", "index.html");

  if (fs.existsSync(landingPath)) {
    res.sendFile(landingPath);
  } else {
    res.status(404).send("Landing page not found");
  }
}

/**
 * Middleware to handle landing page routes for the main domain
 * This should be used AFTER API routes but BEFORE the SPA catch-all
 *
 * Now serves the React SPA for the main domain, which has a dynamic
 * landing page with admin-editable content from the database.
 *
 * Admin routes on the main domain are redirected to the app subdomain
 * (app.budgetsmart.io) to consolidate the management interface into a
 * single CMS backend with a single login.
 */
export function landingPageMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only handle landing domain requests
  if (!isLandingPageDomain(req)) {
    return next();
  }

  // Redirect admin paths from the main domain to the app subdomain so there
  // is only one management interface and one login (eliminates the security
  // risk of two separate admin sessions).
  if (req.path.startsWith("/admin")) {
    // Build the redirect URL via the URL API to safely encode the path and
    // prevent any path-traversal or open-redirect issues.
    const target = new URL(`https://${APP_SUBDOMAIN}.${MAIN_DOMAIN}`);
    target.pathname = req.path;
    return res.redirect(301, target.toString());
  }

  // Let the React SPA handle all other routes on the landing domain
  // The SPA has its own landing page component that fetches content from /api/landing
  // This allows for dynamic, admin-editable landing page content
  next();
}
