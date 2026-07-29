/**
 * @file src/databases/crud-tenant-guard.ts
 * @description Tenant-enforcing proxy wrapper for CRUD and domain namespaces.
 *
 * When MULTI_TENANT is enabled, missing tenant context fails closed (reject).
 * We no longer invent tenantId="global" — that masked cross-tenant bugs.
 *
 * Modes:
 * - "reject" (default): throw if tenantId missing under MULTI_TENANT
 * - "inject": only fill tenantId from ambient context if already partial; still rejects empty
 * - "bypass": no enforcement
 *
 * ### Performance:
 * - Sync MULTI_TENANT check via safe-query cache (no await on hot path)
 * - Single-tenant: early return, zero allocations
 */

import type { ICrudAdapter, BaseQueryOptions } from "./db-interface";
import type { DatabaseId } from "../content/types";
import {
  assertTenantContext,
  isMultiTenantMode,
  resetSafeQueryCache,
} from "@src/utils/security/safe-query";
import { hasTenantBypass } from "./system-tenant-scope";

export type TenantGuardMode = "inject" | "reject" | "bypass";

/** Reset tenant guard + safe-query MULTI_TENANT caches (tests). */
export function resetGuardCache(): void {
  resetSafeQueryCache();
}

function enforceOptionsSync<T extends BaseQueryOptions | undefined>(
  options: T,
  mode: TenantGuardMode,
  operation?: string,
): T {
  if (mode === "bypass") return options;
  if (!isMultiTenantMode()) return options;

  if (hasTenantBypass(options)) return options;

  // Fail-closed: never invent a synthetic "global" tenant.
  assertTenantContext(options, operation || "crud");

  return options;
}

function enforceDataTenantIdSync<T extends Record<string, unknown>>(
  data: T,
  options: BaseQueryOptions | undefined,
  operation?: string,
): T {
  if (!isMultiTenantMode()) return data;
  if (hasTenantBypass(options)) return data;

  if (data.tenantId !== undefined && data.tenantId !== null && data.tenantId !== "") {
    return data;
  }

  // Prefer options.tenantId when data omitted it (write paths).
  if (options?.tenantId !== undefined && options?.tenantId !== null && options.tenantId !== "") {
    return { ...data, tenantId: options.tenantId as DatabaseId };
  }

  assertTenantContext(options, operation || "crud.write");
  return data;
}

/**
 * Wraps an ICrudAdapter with tenant enforcement.
 * All methods are sync-check on the hot path (no async MULTI_TENANT lookup).
 */
export function createTenantGuardedCrud(
  inner: ICrudAdapter,
  mode: TenantGuardMode = "reject",
): ICrudAdapter {
  // Single-tenant / benchmark: return inner directly.
  // Multi-tenancy is rarely used; don't tax every CRUD call with wrapper layers.
  if (!isMultiTenantMode()) return inner;

  const g = <T extends BaseQueryOptions | undefined>(o: T, op: string) =>
    enforceOptionsSync(o, mode, op);
  const d = <T extends Record<string, unknown>>(
    data: T,
    options: BaseQueryOptions | undefined,
    op: string,
  ) => enforceDataTenantIdSync(data, options, op);

  return {
    aggregate: async (collection, pipeline, options) =>
      inner.aggregate(collection, pipeline, g(options, "aggregate")),

    count: async (collection, query, options) =>
      inner.count(collection, query, g(options, "count")),

    exists: async (collection, query, options) =>
      inner.exists(collection, query, g(options, "exists")),

    find: async (collection, query, options) => inner.find(collection, query, g(options, "find")),

    findByIds: async (collection, ids, options) =>
      inner.findByIds(collection, ids, g(options, "findByIds")),

    findMany: async (collection, query, options) =>
      inner.findMany(collection, query, g(options, "findMany")),

    findOne: async (collection, query, options) =>
      inner.findOne(collection, query, g(options, "findOne")),

    streamMany: async (collection, query, options) =>
      inner.streamMany(collection, query, g(options, "streamMany")),

    insert: async (collection, data, options) => {
      const opts = g(options, `${collection}.insert`);
      return inner.insert(collection, d(data as any, opts, `${collection}.insert`), opts);
    },

    insertMany: async (collection, data, options) => {
      const opts = g(options, `${collection}.insertMany`);
      const guarded = data.map((item) => d(item as any, opts, `${collection}.insertMany`));
      return inner.insertMany(collection, guarded, opts);
    },

    update: async (collection, id, data, options) => {
      const opts = g(options, `${collection}.update`);
      return inner.update(collection, id, d(data as any, opts, `${collection}.update`), opts);
    },

    updateMany: async (collection, query, data, options) => {
      const opts = g(options, `${collection}.updateMany`);
      return inner.updateMany(
        collection,
        query,
        d(data as any, opts, `${collection}.updateMany`),
        opts,
      );
    },

    upsert: async (collection, query, data, options) => {
      const opts = g(options, `${collection}.upsert`);
      return inner.upsert(collection, query, d(data as any, opts, `${collection}.upsert`), opts);
    },

    upsertMany: async (collection, items, options) => {
      const opts = g(options, `${collection}.upsertMany`);
      const guarded = items.map(({ query, data }) => ({
        query,
        data: d(data as any, opts, `${collection}.upsertMany`),
      }));
      return inner.upsertMany(collection, guarded, opts);
    },

    delete: async (collection, id, options) =>
      inner.delete(collection, id, g(options, `${collection}.delete`)),

    deleteMany: async (collection, query, options) =>
      inner.deleteMany(collection, query, g(options, `${collection}.deleteMany`)),

    restore: async (collection, id, options) =>
      inner.restore(collection, id, g(options, `${collection}.restore`)),

    atomicIncrement: async (collection, id, field, amount, options) =>
      inner.atomicIncrement!(
        collection,
        id,
        field,
        amount,
        g(options, `${collection}.atomicIncrement`),
      ),
  };
}

/**
 * Wrap a domain namespace (auth/content/media/…) so every method that takes
 * an options object is tenant-checked under MULTI_TENANT.
 * Methods without a trailing options bag are left unchanged.
 */
export function createTenantGuardedNamespace<T extends object>(
  namespace: T,
  mode: TenantGuardMode = "reject",
  label = "namespace",
): T {
  if (!namespace || typeof namespace !== "object") return namespace;

  // Single-tenant / benchmark: return namespace directly — zero Proxy overhead.
  if (!isMultiTenantMode()) return namespace;

  return new Proxy(namespace, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== "function") return original;

      return (...args: any[]) => {
        if (mode === "bypass") {
          return original.apply(target, args);
        }

        const last = args[args.length - 1];
        if (last && typeof last === "object" && !Array.isArray(last)) {
          args[args.length - 1] = enforceOptionsSync(last, mode, `${label}.${String(prop)}`);
        }
        return original.apply(target, args);
      };
    },
  }) as T;
}
