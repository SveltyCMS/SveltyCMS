/**
 * @file src/utils/is-setup-complete.ts
 * @description
 * Ultra-lightweight, zero-dependency utility to check if the CMS setup is complete.
 * This is used by vite.config.ts to avoid loading the full setup-check or database logic during boot.
 */

import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Checks if the system setup is complete by verifying the presence of private.ts.
 * @returns {boolean} True if setup is complete.
 */
export function isSetupComplete(): boolean {
  return existsSync(path.join(process.cwd(), "config", "private.ts"));
}
