/**
 * @file src/databases/crud-tenant-guard.ts
 * @description Tenant-enforcing proxy wrapper for CRUD operations.
 *
 * When MULTI_TENANT is enabled, this proxy automatically injects tenantId
 * into all operations, ensuring plugins, widgets, and extensions are
 * tenant-safe without requiring code changes.
 *
 * Three enforcement modes:
 * - "inject": Auto-add tenantId to options and data if missing (default)
 * - "reject": Throw error if tenantId is missing (strict mode)
 * - "bypass": Skip enforcement (for system-level operations)
 */

import type { ICrudAdapter, BaseQueryOptions } from "./db-interface";
import type { DatabaseId } from "../content/types";

export type TenantGuardMode = "inject" | "reject" | "bypass";

// Lazy-loaded logger — avoids circular deps at module init
let _logger: any = null;
async function getLogger() {
  if (!_logger) {
    try {
      const mod = await import("@utils/logger");
      _logger = mod.logger;
    } catch {
      _logger = { warn: () => {}, info: () => {} };
    }
  }
  return _logger;
}

// Memoized multi-tenant check — lazily evaluated, cached for 5s
let _mtCached: boolean | null = null;
let _mtCachedAt = 0;

/** Reset cached multi-tenant state (for testing). */
export function resetGuardCache(): void {
  _mtCached = null;
  _mtCachedAt = 0;
}

async function isMultiTenant(): Promise<boolean> {
  const now = Date.now();
  if (_mtCached !== null && now - _mtCachedAt < 5000) return _mtCached;

  try {
    const { isMultiTenantEnabled } = await import("@utils/tenant");
    _mtCached = isMultiTenantEnabled();
    _mtCachedAt = now;
    return _mtCached;
  } catch {
    return false;
  }
}

async function enforceOptions<T extends BaseQueryOptions | undefined>(
  options: T,
  mode: TenantGuardMode,
  operation?: string,
): Promise<T> {
  if (mode === "bypass") return options;
  if (!(await isMultiTenant())) return options;

  if (options?.bypassTenantCheck) return options;
  if (options?.tenantId !== undefined) return options;

  if (mode === "reject") {
    throw new Error(
      `Tenant guard: MULTI_TENANT is enabled but no tenantId provided for ${operation || "unknown"}. ` +
        "Pass tenantId in options or use bypassTenantCheck for system-level operations.",
    );
  }

  // mode === "inject" — log warning and use "global" as fallback
  const logger = await getLogger();
  logger.warn(
    `[TenantGuard] Injected tenantId="global" for ${operation || "unknown"} — caller did not provide tenant context. ` +
      "Pass tenantId explicitly or set bypassTenantCheck=true if intentional.",
  );

  return { ...options, tenantId: "global" as unknown as DatabaseId } as T;
}

async function injectDataTenantId<T extends Record<string, unknown>>(
  data: T,
  operation?: string,
): Promise<T> {
  if (!(await isMultiTenant())) return data;
  if (data.tenantId !== undefined) return data;

  const logger = await getLogger();
  logger.warn(
    `[TenantGuard] Injected tenantId="global" into data for ${operation || "unknown"} — data had no tenant context.`,
  );

  return { ...data, tenantId: "global" as unknown as DatabaseId };
}

/**
 * Wraps an ICrudAdapter with tenant enforcement.
 * Read operations: injects tenantId into query options
 * Write operations: injects tenantId into both options AND data
 *
 * All methods are async-safe — the guard checks MULTI_TENANT lazily
 * with a 5-second cache to avoid repeated settings-service lookups.
 */
export function createTenantGuardedCrud(
  inner: ICrudAdapter,
  mode: TenantGuardMode = "inject",
): ICrudAdapter {
  const g = <T extends BaseQueryOptions | undefined>(o: T, op: string) =>
    enforceOptions(o, mode, op);
  const d = <T extends Record<string, unknown>>(data: T, op: string) =>
    injectDataTenantId(data, op);

  return {
    aggregate: async (collection, pipeline, options) =>
      inner.aggregate(collection, pipeline, await g(options, "aggregate")),

    count: async (collection, query, options) =>
      inner.count(collection, query, await g(options, "count")),

    exists: async (collection, query, options) =>
      inner.exists(collection, query, await g(options, "exists")),

    find: async (collection, query, options) =>
      inner.find(collection, query, await g(options, "find")),

    findByIds: async (collection, ids, options) =>
      inner.findByIds(collection, ids, await g(options, "findByIds")),

    findMany: async (collection, query, options) =>
      inner.findMany(collection, query, await g(options, "findMany")),

    findOne: async (collection, query, options) =>
      inner.findOne(collection, query, await g(options, "findOne")),

    streamMany: async (collection, query, options) =>
      inner.streamMany(collection, query, await g(options, "streamMany")),

    insert: async (collection, data, options) =>
      inner.insert(
        collection,
        await d(data, `${collection}.insert`),
        await g(options, `${collection}.insert`),
      ),

    insertMany: async (collection, data, options) => {
      const guarded: any[] = [];
      for (const item of data) {
        guarded.push(await d(item, `${collection}.insertMany`));
      }
      return inner.insertMany(collection, guarded, await g(options, `${collection}.insertMany`));
    },

    update: async (collection, id, data, options) =>
      inner.update(
        collection,
        id,
        await d(data, `${collection}.update`),
        await g(options, `${collection}.update`),
      ),

    updateMany: async (collection, query, data, options) =>
      inner.updateMany(
        collection,
        query,
        await d(data, `${collection}.updateMany`),
        await g(options, `${collection}.updateMany`),
      ),

    upsert: async (collection, query, data, options) =>
      inner.upsert(
        collection,
        query,
        await d(data, `${collection}.upsert`),
        await g(options, `${collection}.upsert`),
      ),

    upsertMany: async (collection, items, options) => {
      const guarded: any[] = [];
      for (const { query, data } of items) {
        guarded.push({ query, data: await d(data, `${collection}.upsertMany`) });
      }
      return inner.upsertMany(collection, guarded, await g(options, `${collection}.upsertMany`));
    },

    delete: async (collection, id, options) =>
      inner.delete(collection, id, await g(options, `${collection}.delete`)),

    deleteMany: async (collection, query, options) =>
      inner.deleteMany(collection, query, await g(options, `${collection}.deleteMany`)),

    restore: async (collection, id, options) =>
      inner.restore(collection, id, await g(options, `${collection}.restore`)),

    atomicIncrement: async (collection, id, field, amount, options) =>
      inner.atomicIncrement!(
        collection,
        id,
        field,
        amount,
        await g(options, `${collection}.atomicIncrement`),
      ),
  };
}
