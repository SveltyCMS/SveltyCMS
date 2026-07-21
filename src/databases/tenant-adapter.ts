/**
 * @file src/databases/tenant-adapter.ts
 * @description
 * Request-scoped tenant binding: wraps a DatabaseAdapter so every domain
 * method receives tenantId in its last options bag (deep: media.files, system.jobs, …).
 *
 * ### Features:
 * - Deep auto-inject of tenantId (crud, auth, content, media, collection, system)
 * - unscoped() escape hatch for system/scheduler/cross-tenant ops
 * - Optional AsyncLocalStorage for getRequestDbAdapter()
 *
 * ### Usage:
 * ```typescript
 * // hooks after tenant resolution:
 * locals.dbAdapter = forTenant(rawAdapter, locals.tenantId);
 * locals.dbAdapterUnscoped = rawAdapter;
 *
 * // call sites never pass tenantId:
 * await locals.dbAdapter.crud.findMany("posts", {});
 * await locals.dbAdapter.media.files.upload(file);
 *
 * // system jobs:
 * await locals.dbAdapterUnscoped.system.jobs.getNextReady(10, withSystemScope("scheduler"));
 * ```
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { DatabaseAdapter, DatabaseId, BaseQueryOptions } from "./db-interface";
import { createTenantInjectingProxy } from "./core/proxy-utils";
import { hasTenantBypass } from "./system-tenant-scope";

export type TenantBoundAdapter = DatabaseAdapter & {
  /** Raw adapter without tenant injection (migrations, scheduler, multi-tenant admin). */
  unscoped(): DatabaseAdapter;
  /** Bound tenant id for this request. */
  readonly boundTenantId: DatabaseId;
};

/** Request-scoped store for the active tenant-bound adapter. */
const tenantAls = new AsyncLocalStorage<TenantBoundAdapter>();

/**
 * Run `fn` with `adapter` as the request DB (see {@link getRequestDbAdapter}).
 */
export function runWithTenantAdapter<T>(adapter: TenantBoundAdapter, fn: () => T): T {
  return tenantAls.run(adapter, fn);
}

/**
 * Returns the adapter bound for the current async context, if any.
 * Prefer `event.locals.dbAdapter` in hooks/routes; use this for deep call stacks.
 */
export function getRequestDbAdapter(): TenantBoundAdapter | null {
  return tenantAls.getStore() ?? null;
}

/**
 * Wrap adapter to auto-inject `defaultTenantId` into every options bag.
 * Does not invent a tenant when multi-tenant is off — caller should only wrap when resolved.
 */
export function forTenant(
  adapter: DatabaseAdapter,
  defaultTenantId: DatabaseId,
): TenantBoundAdapter {
  const injectTenant = (options?: BaseQueryOptions): BaseQueryOptions => {
    // Never override explicit tenantId or intentional system/legacy bypass
    if (hasTenantBypass(options)) {
      return { ...options };
    }
    return {
      ...options,
      tenantId: options?.tenantId ?? defaultTenantId,
    };
  };

  const tenantAdapter = {
    ...adapter,
    boundTenantId: defaultTenantId,
    crud: createTenantInjectingProxy(adapter.crud, injectTenant),
    auth: createTenantInjectingProxy(adapter.auth, injectTenant),
    content: createTenantInjectingProxy(adapter.content, injectTenant),
    media: createTenantInjectingProxy(adapter.media as any, injectTenant),
    collection: createTenantInjectingProxy(adapter.collection, injectTenant),
    system: createTenantInjectingProxy((adapter as any).system, injectTenant),
    batch: adapter.batch
      ? createTenantInjectingProxy(adapter.batch as any, injectTenant)
      : (adapter as any).batch,
    fts: (adapter as any).fts
      ? createTenantInjectingProxy((adapter as any).fts, injectTenant)
      : (adapter as any).fts,

    unscoped(): DatabaseAdapter {
      return adapter;
    },
  } as TenantBoundAdapter;

  // Preserve non-function props (type, isConnected, capabilities, …)
  return new Proxy(tenantAdapter, {
    get(target, prop, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver);
      const raw = (adapter as any)[prop];
      if (typeof raw === "function") return raw.bind(adapter);
      return raw;
    },
  }) as TenantBoundAdapter;
}

/**
 * Bind request adapter after tenant resolution.
 * - multiTenant + tenantId → forTenant wrap
 * - otherwise → raw adapter (single-tenant / pre-auth)
 */
export function bindRequestDbAdapter(
  raw: DatabaseAdapter | null | undefined,
  tenantId: DatabaseId | null | undefined,
  multiTenant: boolean,
): {
  dbAdapter: DatabaseAdapter | null;
  dbAdapterUnscoped: DatabaseAdapter | null;
} {
  if (!raw) return { dbAdapter: null, dbAdapterUnscoped: null };
  if (multiTenant && tenantId) {
    const bound = forTenant(raw, tenantId);
    return { dbAdapter: bound, dbAdapterUnscoped: raw };
  }
  return { dbAdapter: raw, dbAdapterUnscoped: raw };
}
