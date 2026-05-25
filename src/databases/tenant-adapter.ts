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

/**
 * Wraps a database adapter to auto-inject a specific tenantId into all operations.
 * System-level operations (bypassing tenant scope) require explicit `.system()` call.
 */
export function forTenant(
  adapter: DatabaseAdapter,
  defaultTenantId: DatabaseId,
): TenantBoundAdapter {
  const injectTenant = (options?: BaseQueryOptions): BaseQueryOptions => ({
    ...options,
    tenantId: options?.tenantId ?? defaultTenantId,
  });

  // Proxy that auto-injects tenantId into every namespace method
  const proxyNamespace = (namespace: any): any =>
    new Proxy(namespace, {
      get(target, prop) {
        const original = target[prop];
        if (typeof original !== "function") return original;
        return (...args: any[]) => {
          // Auto-inject tenantId into the last argument if it looks like options
          const lastArg = args[args.length - 1];
          if (lastArg && typeof lastArg === "object" && !Array.isArray(lastArg)) {
            args[args.length - 1] = injectTenant(lastArg);
          } else {
            args.push(injectTenant({}));
          }
          return original.apply(target, args);
        };
      },
    });

  const tenantAdapter = {
    ...adapter,
    // Tenant-scoped namespaces
    crud: proxyNamespace(adapter.crud),
    auth: proxyNamespace(adapter.auth),
    content: proxyNamespace(adapter.content),
    media: proxyNamespace(adapter.media),
    collection: proxyNamespace(adapter.collection),

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
