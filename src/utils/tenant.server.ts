/**
 * @file src/utils/tenant.server.ts
 * @description Hardened server-side tenant path resolution.
 *
 * ### Hardening (audit 2026-07):
 * - Path traversal prevention: path.basename sanitizes tenantId/collectionName before join
 * - path.relative-based extraction: replaces fragile regex with OS-safe relative path checks
 * - Traversal boundary check: relative.startsWith("..") flags paths outside CONFIG_ROOT
 * - Type consistency: undefined (no tenant) vs null (global tenant) explicitly handled
 *
 * Server-only tenant path resolution functions.
 */

import path from "node:path";
import { resolveCompiledCollectionsPath } from "./benchmark-sandbox";
import { sveltyContext } from "./context";

function getConfigRoot(): string {
  return path.join(process.cwd(), "config");
}

/**
 * Resolve collection directory. 🛡️ Hardened: Path normalized to prevent escapes.
 */
export function getCollectionsPath(tenantId?: string | null): string {
  const customDir = process.env.COLLECTIONS_DIR;
  const isTestHarness =
    process.env.TEST_MODE === "true" ||
    process.env.VITEST === "true" ||
    process.env.BUN_TEST === "true" ||
    process.env.BENCHMARK === "true";

  const activeTenant = tenantId ?? sveltyContext.getStore()?.tenantId;
  if (activeTenant) {
    const sanitizedTenant = path.basename(activeTenant);
    return path.join(getConfigRoot(), sanitizedTenant, "collections");
  }
  if (customDir) return path.resolve(process.cwd(), customDir);
  return path.join(getConfigRoot(), isTestHarness ? "test-collections" : "collections");
}

/**
 * Resolve compiled collections output directory.
 */
export function getCompiledCollectionsPath(tenantId?: string | null): string {
  return resolveCompiledCollectionsPath(tenantId);
}

/**
 * Extracts tenant ID from a file path using strict path.relative boundary.
 */
export function extractTenantFromPath(filePath: string): string | null | undefined {
  const normalized = path.normalize(filePath);
  const relative = path.relative(getConfigRoot(), normalized);

  // If the file is not inside config root, it's invalid/external
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;

  const parts = relative.split(path.sep);

  // Case: config/collections/file.ts → undefined (no tenant)
  if (parts[0] === "collections") return undefined;

  // Case: config/tenant/collections/file.ts
  if (parts.length >= 3 && parts[1] === "collections") {
    return parts[0] === "global" ? null : parts[0];
  }

  return undefined;
}

/**
 * Get prioritized collection paths for scanning.
 */
export function getAllTenantCollectionPaths(tenantId: string | null): string[] {
  const paths = [getCollectionsPath(tenantId)];
  // Only add 'global' path if the current context isn't already global
  if (tenantId !== null) {
    paths.push(getCollectionsPath(null));
  }
  return paths;
}

/**
 * Validate path resolution to prevent directory traversal.
 */
export function getCollectionFilePath(collectionName: string, tenantId?: string | null): string {
  const dir = getCollectionsPath(tenantId);
  // 🛡️ Ensure collectionName doesn't contain directory separators
  const safeName = path.basename(collectionName, ".ts");
  return path.join(dir, `${safeName}.ts`);
}

/**
 * Get display path for logging.
 */
export function getCollectionDisplayPath(collectionName: string, tenantId?: string | null): string {
  const tenant = tenantId === undefined ? "collections" : (tenantId ?? "global") + "/collections";
  return `config/${tenant}/${collectionName}.ts`;
}
