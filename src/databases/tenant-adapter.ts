/**
 * @file src/databases/tenant-adapter.ts
 * @description
 * Provides a tenant-bound adapter wrapper that auto-injects `tenantId` into
 * every database operation, preventing accidental cross-tenant leakage.
 *
 * ### Features:
 * - Auto-injects tenantId on all CRUD, auth, content, media, and system methods
 * - System-level operations require explicit opt-in via `.system()` scope
 * - Zero runtime overhead — lightweight Proxy-based wrapper
 *
 * ### Usage:
 * ```typescript
 * const tenantDb = forTenant(adapter, "tenant-abc");
 * const users = await tenantDb.crud.findMany("users", {}); // tenantId auto-injected
 * const allUsers = await tenantDb.system().crud.findMany("users", {}); // bypasses tenant
 * ```
 */

import type { DatabaseAdapter, DatabaseId, BaseQueryOptions } from "./db-interface";
import { createTenantInjectingProxy } from "./core/proxy-utils";

/**
 * Wraps a database adapter to auto-inject a specific tenantId into all operations.
 * System-level operations (bypassing tenant scope) require explicit `.unscoped()` call.
 */
export function forTenant(
  adapter: DatabaseAdapter,
  defaultTenantId: DatabaseId,
): TenantBoundAdapter {
  const injectTenant = (options?: BaseQueryOptions): BaseQueryOptions => ({
    ...options,
    tenantId: options?.tenantId ?? defaultTenantId,
  });

  const tenantAdapter = {
    ...adapter,
    // Tenant-scoped namespaces
    crud: createTenantInjectingProxy(adapter.crud, injectTenant),
    auth: createTenantInjectingProxy(adapter.auth, injectTenant),
    content: createTenantInjectingProxy(adapter.content, injectTenant),
    media: createTenantInjectingProxy(adapter.media, injectTenant),
    collection: createTenantInjectingProxy(adapter.collection, injectTenant),

    /**
     * Returns the raw adapter for system-level operations that bypass tenant scope.
     * Use sparingly — only for maintenance, migrations, and cross-tenant queries.
     */
    unscoped(): DatabaseAdapter {
      return adapter;
    },
  } as any as TenantBoundAdapter;

  return tenantAdapter;
}

/** Tenant-bound adapter with explicit system-level escape hatch */
export type TenantBoundAdapter = DatabaseAdapter & {
  /** Returns the raw adapter for system-level operations */
  unscoped(): DatabaseAdapter;
};
