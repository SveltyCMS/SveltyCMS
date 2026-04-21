/**
 * @file src/utils/is-setup-complete.ts
 * @description
 * Ultra-lightweight, zero-dependency utility to check if the CMS setup is complete.
 * This is used by vite.config.ts to avoid loading the full setup-check or database logic during boot.
 */

import path from "node:path";

/**
 * Checks if the system setup is complete by verifying the presence of private.ts.
 * @returns {boolean} True if setup is complete.
 */
export function isSetupComplete(): boolean {
  if (typeof window !== "undefined") {
    return true; // Assume setup is complete if browser is running the app
  }
  // Use require to load fs dynamically only on the server
  try {
    const fs = require("node:fs");
    return fs.existsSync(path.join(process.cwd(), "config", "private.ts"));
  } catch {
    return false;
  }
}
