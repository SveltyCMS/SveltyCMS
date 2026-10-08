/**
 * @file src/utils/security/safe-query.ts
 * @description Tenant isolation helpers shared by Mongo and SQL adapters.
 *
 * ### Security model
 * - When MULTI_TENANT is on, every query must carry a tenant scope: a real
 *   `tenantId`, the **explicit global scope** (`tenantId: null` → rows with
 *   `tenantId IS NULL`; see docs/reference/architecture/multi-tenancy.mdx),
 *   or a branded system scope (`withSystemScope`).
 * - Fail-closed: a MISSING scope (undefined / empty) throws TENANT_CONTEXT_MISSING.
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

/**
 * Fail-closed tenant gate for SQL + Mongo parity.
 * Zero work when single-tenant, bypassed, or tenantId already present.
 *
 * Whether the options carry an explicit tenant scope decision:
 * `null` IS such a decision — it selects the **global layer** (rows with
 * `tenantId IS NULL` — global roles, global collections, system settings, the
 * global administrator). The string `"global"` maps to "no filter" in
 * `getEffectiveTenantId`; only a *missing* value (undefined / `""`) means
 * "no context" and fails closed.
 *
 * Deliberately NOT stricter: rejecting the documented explicit global scope
 * (multi-tenancy.mdx → "Explicit Global Scope") broke every global-tenant read
 * once MULTI_TENANT was active — including the setup admin visiting public pages.
 * The API layer keeps its own TENANT_REQUIRED guards, so tenantless *requests*
 * are still rejected at the boundary.
 */
export function assertTenantContext(
  options?: TenantScopedOptions | null,
  operation = "query",
): void {
  // Single-tenant / global hot path: no-op before any option inspection (cached 5s flag).
  if (!isMultiTenantMode()) return;
  // System scope (branded) or ultra-fast path
  if (hasTenantBypass(options)) return;
  const tenantId = options?.tenantId;
  if (tenantId !== undefined && tenantId !== "") {
    // A present tenantId — including the explicit global `null` — is a scope decision.
    return;
  }

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
  // Both checks are pure; hoist them so the multi-tenant gate and the
  // tenant-merge condition share one evaluation instead of two.
  const tenantScope = tenantId !== undefined && tenantId !== "";
  const tenantBypass = hasTenantBypass(options);

  if (isMultiTenant && !tenantScope && !tenantBypass) {
    const redactedQuery = Object.fromEntries(
      Object.entries(query).map(([k, v]) => [PII_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : v]),
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

  const queryTenant = (query as { tenantId?: unknown }).tenantId;
  if (
    // Cheapest identity check first: an already-scoped query exits before
    // any further inspection.
    queryTenant !== tenantId &&
    tenantScope &&
    !tenantBypass &&
    // The global scope must not widen a narrower explicit filter on the query.
    !(tenantId === null && queryTenant !== undefined && queryTenant !== "")
  ) {
    secureQuery = { ...query };
    secureQuery.tenantId = tenantId;
    hasChanges = true;
  }

  if (!options.includeDeleted) {
    const del = query.isDeleted;
    const isAlreadyFiltered =
      del !== null && typeof del === "object" && (del as Record<string, unknown>).$ne === true;
    if (!isAlreadyFiltered) {
      if (!hasChanges) secureQuery = { ...query };
      secureQuery.isDeleted = { $ne: true };
    }
  }

  return secureQuery;
}
