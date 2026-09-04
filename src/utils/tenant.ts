/**
 * @file src/utils/tenant.ts
 * @description Hardened multi-tenancy system for SveltyCMS.
 *
 * ### Hardening (audit 2026-07):
 * - Buffer-native Base64: Buffer.from replaces manual byte loops (~10x faster for Yjs docs)
 * - PII log sanitization: removed userId from error logs
 * - Regex-anchored hostname: single pattern replaces multiple startsWith calls
 * - O(1) reserved-word lookup: Set.has() replaces array.includes()
 * - Tenant ID normalization: hostname-derived IDs lowercased for consistency
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
      const SETTING_KEY = "MULTI_TENANT" as const;
      _multiTenantCached = getPrivateSettingSync(SETTING_KEY) === true;
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
 * Validate tenant ID against path traversal and injection.
 * Strictly alphanumeric + hyphen/underscore, no path segments (..).
 */
export function isValidTenantId(tenantId: string | null | undefined): boolean {
  if (!tenantId) return true;
  return /^[a-zA-Z0-9_-]+$/.test(tenantId) && !tenantId.includes("..");
}

// --- Identification Utilities ---

/**
 * Derives tenant ID from hostname.
 */
/** Subdomain prefixes that never resolve to a tenant (module-level, hot path). */
const RESERVED_SUBDOMAINS = new Set(["www", "app", "api", "cdn", "static"]);

/**
 * Resolve the tenant id from a request hostname (called 4-5× per request by
 * the auth, rate-limit, redirect and security hooks — keep allocation-free).
 */
export function getTenantIdFromHostname(hostname: string, multiTenant = true): string | null {
  if (!multiTenant) return null;

  // Trusted internal/loopback
  if (/^(localhost|127\.0\.0\.1|192\.168\.)/.test(hostname)) return "default";

  const parts = hostname.split(".");

  // Must be a subdomain (e.g., tenant.domain.com)
  if (parts.length > 2 && !RESERVED_SUBDOMAINS.has(parts[0])) {
    return parts[0].toLowerCase();
  }
  return null;
}

/**
 * Ensures valid tenant context. 🛡️ Sanitizes logs to prevent sensitive ID leaks.
 */
export function requireTenantContext(
  locals: App.Locals,
  operationName: string,
  isMultiTenant = false,
): string | null {
  const tenantId = locals.tenantId || locals.user?.tenantId || null;

  if (isMultiTenant && !tenantId) {
    logger.error("Tenant context missing", { operationName });
    throw new AppError("Tenant context is required.", 500, "TENANT_REQUIRED");
  }
  return tenantId;
}

// --- Encoding Helpers ---

/** 🚀 Performance: Use Buffer for native Base64 encoding. */
export function encodeYjsToBase64(uint8Array: Uint8Array): string {
  return Buffer.from(uint8Array).toString("base64");
}

/** 🚀 Performance: Use Buffer for native Base64 decoding. */
export function decodeBase64ToYjs(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/**
 * Options for tenant isolation wrapper.
 */
export interface TenantOptions {
  /**
   * Whether to allow access to global/system context when multi-tenancy is enabled but no tenantId is provided.
   */
  allowGlobal?: boolean;
  /**
   * Optional collection name for better error reporting.
   */
  collection?: string;
}

/**
 * Central wrapper to enforce strict tenant isolation across database calls.
 * Ensures operations are either scoped to a tenant or allowed in single-tenant/global mode.
 */
export async function withTenant<T>(
  tenantId: string | null | undefined,
  operation: () => Promise<T>,
  options: TenantOptions = {},
): Promise<T> {
  // Guard against empty strings which might indicate a bug in tenant resolution
  if (tenantId === "") {
    throw new AppError("Invalid tenant context: empty string provided", 400, "INVALID_TENANT_ID");
  }

  // If tenantId is provided, we always allow (tenant context is active)
  if (tenantId) {
    return operation();
  }

  const isMultiTenant = isMultiTenantEnabled();

  // If multi-tenancy is disabled, we don't require a tenantId
  if (!isMultiTenant) {
    logger.debug(`Single-tenant mode: allowing operation on ${options.collection || "unknown"}`);
    return operation();
  }

  // If multi-tenancy is enabled but no tenantId provided, check if global access is allowed
  if (options.allowGlobal) {
    logger.debug(`Global/system context allowed for ${options.collection || "unknown"}`);
    return operation();
  }

  throw new AppError(
    `Tenant context required for this operation (collection: ${options.collection || "unknown"})`,
    403,
    "TENANT_REQUIRED",
  );
}
