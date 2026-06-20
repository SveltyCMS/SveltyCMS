/**
 * @file src/content/collection-path-security.server.ts
 * @description Path validation for compiled collection schema files.
 *
 * ### Features:
 * - Directory confinement to `.compiledCollections`
 * - Path traversal blocking
 * - Suspicious character filtering
 */

import path from "node:path";
import { logger } from "@utils/logger";

/**
 * Validates that a schema file path is safe to load (no traversal, correct extension).
 */
export function isSafeCollectionPath(fullPath: string): boolean {
  const resolved = path.resolve(fullPath).toLowerCase();
  const allowedBase = path.resolve(process.cwd(), ".compiledCollections").toLowerCase();

  if (!resolved.startsWith(allowedBase) || !resolved.endsWith(".js")) {
    return false;
  }

  const relative = path.relative(allowedBase, resolved);
  if (relative.includes("..") || path.isAbsolute(relative)) {
    logger.warn("Blocked path traversal attempt", { fullPath, relative });
    return false;
  }

  if (/[^\w\-./\\]/.test(relative)) {
    logger.warn("Blocked path with suspicious characters", { fullPath, relative });
    return false;
  }

  return true;
}
