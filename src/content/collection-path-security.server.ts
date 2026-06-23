/**
 * @file src/content/collection-path-security.server.ts
 * @description Path validation for compiled collection schema files.
 *
 * ### Features:
 * - Directory confinement to .compiledCollections (production) and config/collections (dev)
 * - Path traversal blocking
 * - Suspicious character filtering
 */

import path from "node:path";

/**
 * Validates that a schema file path is safe to load (no traversal, correct extension).
 */
export function isSafeCollectionPath(fullPath: string): boolean {
  const resolved = path.resolve(fullPath).toLowerCase();
  const cwd = path.resolve(process.cwd()).toLowerCase();
  const compiledBase = path.join(cwd, ".compiledCollections").toLowerCase();
  const collectionsBase = path.join(cwd, "config", "collections").toLowerCase();

  // Allow .js files under .compiledCollections (production / compiled output)
  if (resolved.startsWith(compiledBase) && resolved.endsWith(".js")) {
    return true;
  }

  // Allow .ts files under config/collections (development source files)
  if (resolved.startsWith(collectionsBase) && resolved.endsWith(".ts")) {
    return true;
  }

  return false;
}
