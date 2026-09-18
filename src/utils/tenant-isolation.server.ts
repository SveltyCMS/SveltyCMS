/**
 * @file src/utils/tenant-isolation.server.ts
 * @description Server-only tenant isolation API: the MULTI_TENANT mode flag and the
 * `withTenant()` guard.
 *
 * `MULTI_TENANT` is a private/bootstrap setting, so the read must live in a server
 * module (`scripts/scan-secret-misuse.ts` enforces this) — `@utils/tenant` stays
 * client-safe and must not import this file.
 *
 * ### Features:
 * - 5s TTL memo: the auth, rate-limit and security hooks ask for the flag per request
 * - Fail-closed: a settings error resolves to single-tenant (false)
 * - resetMultiTenantCache() for tests
 */

import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { logger } from "./logger.ts";
import { AppError } from "./error-handling.ts";

const MULTI_TENANT_TTL_MS = 5000;

let _multiTenantCached: boolean | null = null;
let _multiTenantCachedAt = 0;

/**
 * Multi-tenant mode detection via config/private.ts.
 */
export function isMultiTenantEnabled(): boolean {
  const now = Date.now();
  if (_multiTenantCached !== null && now - _multiTenantCachedAt < MULTI_TENANT_TTL_MS) {
    return _multiTenantCached;
  }

  try {
    _multiTenantCached = getPrivateSettingSync("MULTI_TENANT") === true;
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
