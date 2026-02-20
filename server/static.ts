import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve app static files for all domains (including landing page domain)
  // The React SPA now handles the landing page with dynamic content from database
  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  // All domains now use the React SPA which has its own routing for landing vs app
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
