/**
 * @file src/utils/tenant.ts
 * @description Unified multi-tenancy system for SveltyCMS.
 *
 * Consolidates:
 * - Tenant path resolution (collections, compiled output)
 * - Hostname-based tenant identification
 * - Security context validation
 * - Data encoding helpers (Base64/Yjs)
 */

import path from "node:path";
import { logger } from "./logger.ts";
import { AppError } from "./error-handling.ts";

// --- Path Resolution (Merged from tenant-paths.ts) ---

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
 */
export function getCompiledCollectionsPath(tenantId?: string | null): string {
  const base = path.join(process.cwd(), ".compiledCollections");
  if (tenantId === undefined) return base;
  const tenant = tenantId === null ? "global" : tenantId;
  return path.join(base, tenant);
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
 * Validate tenant ID for security (alphanumeric only).
 */
export function isValidTenantId(tenantId: string | null | undefined): boolean {
  if (tenantId === null || tenantId === undefined) return true;
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  return validPattern.test(tenantId) && !tenantId.includes("..");
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

// --- Identification Utilities (Merged from tenant-utils.ts) ---

/**
 * Derives a tenant ID from the request hostname.
 */
export function getTenantIdFromHostname(hostname: string, multiTenant = true): string | null {
  if (!multiTenant) return null;
  if (
    hostname === "localhost" ||
    hostname.startsWith("127.0.0.1") ||
    hostname.startsWith("192.168.")
  ) {
    return "default";
  }
  const parts = hostname.split(".");
  if (parts.length > 2 && !["www", "app", "api", "cdn", "static"].includes(parts[0])) {
    return parts[0];
  }
  return null;
}

/**
 * Ensures a valid tenant context is present for the current operation.
 */
export function requireTenantContext(
  locals: App.Locals,
  operationName: string,
  isMultiTenant = false,
): string | null {
  const tenantId = locals.tenantId || locals.user?.tenantId || null;

  if (isMultiTenant && !tenantId) {
    logger.error(`${operationName} failed: Multi-tenant context required but missing`, {
      userId: locals.user?._id,
    });
    throw new AppError(`Tenant context is required for ${operationName}.`, 500, "TENANT_REQUIRED");
  }
  return tenantId;
}

// --- Encoding Helpers ---

export function encodeYjsToBase64(uint8Array: Uint8Array): string {
  let binaryString = "";
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binaryString);
}

export function decodeBase64ToYjs(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const uint8Array = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    uint8Array[i] = binaryString.charCodeAt(i);
  }
  return uint8Array;
}
