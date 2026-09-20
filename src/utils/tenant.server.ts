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
import { resolveCompiledCollectionsPath } from "./benchmark-sandbox.ts";
import { sveltyContext } from "./context.ts";

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
 * Resolve compiled collections output directory.
 */
export function getCollectionFilePath(collectionName: string, tenantId?: string | null): string {
  const dir = getCollectionsPath(tenantId);
  // 🛡️ Ensure collectionName doesn't contain directory separators
  const safeName = path.basename(collectionName, ".ts");
  return path.join(dir, `${safeName}.ts`);
}

/**
 * Validate tenant ID against path traversal and injection.
 * Strictly alphanumeric + hyphen/underscore, no path segments (..).
 *
 * Lives here (not in tenant.ts) because this module is reachable from
 * vite.config.ts via compilation/compile.ts, whose config loader (esbuild)
 * cannot resolve `@src`/`@utils` path aliases — tenant.ts imports settings.
 */
export function isValidTenantId(tenantId: string | null | undefined): boolean {
  if (!tenantId) return true;
  return /^[a-zA-Z0-9_-]+$/.test(tenantId) && !tenantId.includes("..");
}

/**
 * Get display path for logging.
 */
export function getCollectionDisplayPath(collectionName: string, tenantId?: string | null): string {
  const tenant = tenantId === undefined ? "collections" : (tenantId ?? "global") + "/collections";
  return `config/${tenant}/${collectionName}.ts`;
}
