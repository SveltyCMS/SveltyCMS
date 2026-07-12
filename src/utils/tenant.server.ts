/**
 * @file src/utils/tenant.server.ts
 * @description Server-only tenant path resolution functions.
 */

import path from "node:path";

/**
 * Resolve collection directory based on tenant ID.
 */
export function getCollectionsPath(tenantId?: string | null): string {
  const base = path.join(process.cwd(), "config");
  if (tenantId === undefined) return path.join(base, "collections");
  const tenant = tenantId === null ? "global" : tenantId;
  return path.join(base, tenant, "collections");
}

/**
 * Resolve compiled collections output directory.
 * Local benchmarks redirect to `.compiledCollections/test/_local_sandbox/`.
 */
export function getCompiledCollectionsPath(tenantId?: string | null): string {
  const { resolveCompiledCollectionsPath } =
    require("./benchmark-sandbox") as typeof import("./benchmark-sandbox");
  return resolveCompiledCollectionsPath(tenantId);
}

/**
 * Extract tenant ID from a file path.
 */
export function extractTenantFromPath(filePath: string): string | null | undefined {
  const normalized = filePath.replace(/\\/g, "/");
  const match = normalized.match(/config\/([^/]+)\/collections\//);
  if (!match) return normalized.includes("config/collections/") ? undefined : undefined;
  return match[1] === "global" ? null : match[1];
}

/**
 * Get all tenant collection paths for scanning.
 */
export function getAllTenantCollectionPaths(tenantId: string | null): string[] {
  const paths: string[] = [getCollectionsPath(tenantId)];
  if (tenantId !== null) paths.push(getCollectionsPath(null));
  return paths;
}

/**
 * Get absolute path for a collection file.
 */
export function getCollectionFilePath(collectionName: string, tenantId?: string | null): string {
  return path.join(getCollectionsPath(tenantId), `${collectionName}.ts`);
}

/**
 * Get display path for logging.
 */
export function getCollectionDisplayPath(collectionName: string, tenantId?: string | null): string {
  if (tenantId === undefined) return `config/collections/${collectionName}.ts`;
  const tenant = tenantId === null ? "global" : tenantId;
  return `config/${tenant}/collections/${collectionName}.ts`;
}
