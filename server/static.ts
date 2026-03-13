import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "..", "dist", "public");
  if (!fs.existsSync(distPath)) {
    console.warn(
      `Warning: Could not find the build directory: ${distPath}. Static files will not be served.`,
    );
    return;
  }

  // Serve app static files for all domains (including landing page domain)
  // The React SPA now handles the landing page with dynamic content from database
  app.use(express.static(distPath));

  // SPA fallback: serve index.html for any non-API path (including "/")
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
