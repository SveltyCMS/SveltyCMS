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

import { logger } from "./logger.ts";
import { AppError } from "./error-handling.ts";

// Memoized multi-tenant check with 5-second TTL
// Reads from config/private.ts only — bootstrap mode, not a runtime toggle
let _multiTenantCached: boolean | null = null;
let _multiTenantCachedAt = 0;

/**
 * Multi-tenant mode detection via config/private.ts.
 * Uses globalThis.require (set up by hooks.server.ts) to avoid ESM
 * path alias resolution issues at module init time.
 */
export function isMultiTenantEnabled(): boolean {
  const now = Date.now();
  if (_multiTenantCached !== null && now - _multiTenantCachedAt < 5000) {
    return _multiTenantCached;
  }

  try {
    const req = (globalThis as any).require;
    if (req) {
      const { getPrivateSettingSync } = req("@src/services/core/settings-service");
      _multiTenantCached = getPrivateSettingSync("MULTI_TENANT") === true;
    } else {
      _multiTenantCached = false;
    }
  } catch {
    _multiTenantCached = false;
  }
  _multiTenantCachedAt = now;
  return _multiTenantCached;
}

/**
 * Reset the cached multi-tenant state. Used in tests to force re-evaluation.
 */
export function resetMultiTenantCache(): void {
  _multiTenantCached = null;
  _multiTenantCachedAt = 0;
}

/**
 * Validate tenant ID for security (alphanumeric only).
 */
export function isValidTenantId(tenantId: string | null | undefined): boolean {
  if (tenantId === null || tenantId === undefined) return true;
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  return validPattern.test(tenantId) && !tenantId.includes("..");
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
