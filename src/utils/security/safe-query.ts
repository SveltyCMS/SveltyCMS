/**
 * @file src/utils/security/safe-query.ts
 * @description Tenant isolation helpers shared by Mongo and SQL adapters.
 *
 * ### Security model
 * - When MULTI_TENANT is on, every query must carry a real tenantId (or explicit bypass).
 * - Fail-closed: missing tenant context throws TENANT_CONTEXT_MISSING.
 * - Soft-delete boundary is applied by default for Mongo-style filters.
 *
 * ### Performance
 * - MULTI_TENANT flag is cached (5s TTL). Single-tenant / benchmark paths are near-zero cost.
 * - bypassSafeQuery skips all checks and allocations (ultra-fast path).
 */

import { getPrivateEnv } from "@src/databases/config-state";
import { hasTenantBypass, type SystemTenantScope } from "@src/databases/system-tenant-scope";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";

export interface SafeQueryOptions {
  /** @deprecated Prefer systemScope via withSystemScope / createSystemTenantScope. */
  bypassTenantCheck?: boolean;
  /** Branded system capability (scheduler, setup, testing, …). */
  systemScope?: SystemTenantScope;
  includeDeleted?: boolean;
  /** Skip all checks and allocations (hot paths / system). */
  bypassSafeQuery?: boolean;
  tenantId?: string | null;
}

/** Minimal options bag used by SQL adapters (BaseQueryOptions-compatible). */
export interface TenantScopedOptions {
  tenantId?: string | null | undefined;
  /** @deprecated Prefer systemScope. */
  bypassTenantCheck?: boolean;
  systemScope?: SystemTenantScope;
  bypassSafeQuery?: boolean;
}

const PII_KEYS = new Set(["email", "security", "username", "name", "phone", "token", "secret"]);

let cachedIsMultiTenant: boolean | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5_000;

/**
 * Reset MULTI_TENANT cache (unit tests / config reloads).
 */
export function resetSafeQueryCache(): void {
  cachedIsMultiTenant = null;
  cachedAt = 0;
}

/**
 * Sync, cached MULTI_TENANT detection. Hot-path safe (no await).
 */
export function isMultiTenantMode(): boolean {
  const now = Date.now();
  if (cachedIsMultiTenant !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedIsMultiTenant;
  }
  try {
    const privateEnv = getPrivateEnv() as { MULTI_TENANT?: boolean | string } | null;
    cachedIsMultiTenant = privateEnv?.MULTI_TENANT === true || privateEnv?.MULTI_TENANT === "true";
  } catch {
    cachedIsMultiTenant = false;
  }
  cachedAt = now;
  return cachedIsMultiTenant;
}

function hasUsableTenantId(tenantId: unknown): boolean {
  return tenantId !== undefined && tenantId !== null && tenantId !== "";
}

/**
 * Fail-closed tenant gate for SQL + Mongo parity.
 * Zero work when single-tenant, bypassed, or tenantId already present.
 */
export function assertTenantContext(
  options?: TenantScopedOptions | null,
  operation = "query",
): void {
  // System scope (branded) or legacy bypass / ultra-fast path
  if (hasTenantBypass(options)) return;
  if (hasUsableTenantId(options?.tenantId)) {
    // Having tenantId present is always safe to proceed (single-tenant stamping ok).
    return;
  }
  if (!isMultiTenantMode()) return;

  logger.error(`[TenantContext] Security Violation on ${operation}: MULTI_TENANT without tenantId`);
  throw new AppError(
    `Security Violation: Attempted to execute ${operation} without tenant context in Multi-Tenant mode.`,
    500,
    "TENANT_CONTEXT_MISSING",
  );
}

/**
 * Validates that a query object includes a tenantId if Multi-Tenancy is enabled.
 * Also enforces Soft Delete boundaries by default (Mongo-style filters).
 */
export function safeQuery<T extends Record<string, any>>(
  query: T,
  tenantId?: string | null,
  options: SafeQueryOptions = {},
): T {
  if (options.bypassSafeQuery) return query;

  const isMultiTenant = isMultiTenantMode();

  if (isMultiTenant && !hasUsableTenantId(tenantId) && !hasTenantBypass(options)) {
    const redactedQuery = Object.fromEntries(
      Object.entries(query).map(([k, v]) => [k, PII_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : v]),
    );
    logger.error(
      `[SafeQuery] Security Violation! Query: ${JSON.stringify(redactedQuery)}, Options: ${JSON.stringify(options)}, MultiTenant: true`,
    );
    throw new AppError(
      "Security Violation: Attempted to execute query without tenant context in Multi-Tenant mode.",
      500,
      "TENANT_CONTEXT_MISSING",
    );
  }

  let secureQuery: any = query;
  let hasChanges = false;

  if (hasUsableTenantId(tenantId) && !hasTenantBypass(options) && query.tenantId !== tenantId) {
    secureQuery = { ...query };
    secureQuery.tenantId = tenantId;
    hasChanges = true;
  }

  if (!options.includeDeleted) {
    if (!hasChanges) secureQuery = { ...query };
    secureQuery.isDeleted = { $ne: true };
  }

  return secureQuery;
}
