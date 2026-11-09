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
import { raise } from "@utils/error-handling";
import { hasTenantBypass } from "./system-tenant-scope";

export type TenantGuardMode = "inject" | "reject" | "bypass";

/** Reset tenant guard + safe-query MULTI_TENANT caches (tests). */
export function resetGuardCache(): void {
  resetSafeQueryCache();
}

type OperationLabel = string | (() => string);

function resolveOperation(operation: OperationLabel | undefined, fallback: string): string {
  return typeof operation === "function" ? operation() : operation || fallback;
}

function raiseTenantMismatch(
  dataTenantId: unknown,
  optionsTenantId: unknown,
  operation?: OperationLabel,
): never {
  raise(
    500,
    `Security Violation: Attempted to write data for tenant "${String(dataTenantId)}" into tenant "${String(optionsTenantId)}" on ${resolveOperation(operation, "crud.write")}.`,
    "TENANT_MISMATCH",
  );
}

function enforceOptionsSync<T extends BaseQueryOptions | undefined>(
  options: T,
  mode: TenantGuardMode,
  operation?: OperationLabel,
): T {
  if (mode === "bypass") return options;
  if (!isMultiTenantMode()) return options;

  if (hasTenantBypass(options)) return options;

  // Fail-closed: never invent a synthetic "global" tenant.
  assertTenantContext(options, resolveOperation(operation, "crud"));

  return options;
}

function isPresentTenantId(value: unknown): value is DatabaseId {
  return value !== undefined && value !== null && value !== "";
}

/**
 * Rejects a body-supplied `tenantId` that does not match the ambient tenant
 * scope. A caller must never be able to steer a write into another tenant by
 * putting `tenantId` in the payload.
 *
 * Exported for focused unit tests; the guarded CRUD wrapper is the only
 * production caller.
 */
export function enforceDataTenantIdSync<T extends Record<string, unknown>>(
  data: T,
  options: BaseQueryOptions | undefined,
  operation?: OperationLabel,
): T {
  if (!isMultiTenantMode()) return data;
  if (hasTenantBypass(options)) return data;

  // `null` is an explicit global scope decision in safe-query, so it counts as
  // present here: tenant-specific data must not be written into the global layer.
  const optionsTenantId = options?.tenantId;
  const optionsHasScope = optionsTenantId !== undefined && optionsTenantId !== "";

  if (isPresentTenantId(data.tenantId)) {
    if (optionsHasScope && data.tenantId !== optionsTenantId) {
      raiseTenantMismatch(data.tenantId, optionsTenantId, operation);
    }
    return data;
  }

  // Prefer options.tenantId when data omitted it (write paths).
  if (isPresentTenantId(options?.tenantId)) {
    return { ...data, tenantId: options.tenantId };
  }

  assertTenantContext(options, resolveOperation(operation, "crud.write"));
  return data;
}

/**
 * Batch variant of {@link enforceDataTenantIdSync}: checks the ambient tenant
 * scope once and copies only rows that lack their own `tenantId`.
 */
function enforceDataTenantIdBatchSync<T extends Record<string, unknown>>(
  data: T[],
  options: BaseQueryOptions | undefined,
  operation?: OperationLabel,
): T[] {
  if (!isMultiTenantMode()) return data;
  if (hasTenantBypass(options)) return data;

  const optionsTenantId = options?.tenantId;
  const optionsHasScope = optionsTenantId !== undefined && optionsTenantId !== "";

  if (!optionsHasScope) {
    assertTenantContext(options, resolveOperation(operation, "crud.write"));
    return data;
  }

  let result: T[] | null = null;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (isPresentTenantId(row.tenantId)) {
      if (row.tenantId !== optionsTenantId) {
        raiseTenantMismatch(row.tenantId, optionsTenantId, operation);
      }
      continue;
    }
    if (result === null) result = data.slice();
    result[i] = { ...row, tenantId: optionsTenantId };
  }
  return result ?? data;
}

/**
 * Upsert batch variant: the `query` part is never rewritten; only `data` rows
 * lacking a `tenantId` are copied to receive the ambient tenant.
 */
function enforceUpsertManyBatchSync<T extends Record<string, unknown>>(
  items: Array<{ query: unknown; data: T }>,
  options: BaseQueryOptions | undefined,
  operation?: OperationLabel,
): Array<{ query: unknown; data: T }> {
  if (!isMultiTenantMode()) return items;
  if (hasTenantBypass(options)) return items;

  const optionsTenantId = options?.tenantId;
  const optionsHasScope = optionsTenantId !== undefined && optionsTenantId !== "";

  if (!optionsHasScope) {
    assertTenantContext(options, resolveOperation(operation, "crud.write"));
    return items;
  }

  let result: Array<{ query: unknown; data: T }> | null = null;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const row = item.data;
    if (isPresentTenantId(row.tenantId)) {
      if (row.tenantId !== optionsTenantId) {
        raiseTenantMismatch(row.tenantId, optionsTenantId, operation);
      }
      continue;
    }
    if (result === null) result = items.slice();
    result[i] = { query: item.query, data: { ...row, tenantId: optionsTenantId } };
  }
  return result ?? items;
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

  const g = <T extends BaseQueryOptions | undefined>(o: T, collection: string, operation: string) =>
    enforceOptionsSync(o, mode, () => `${collection}.${operation}`);
  const d = <T extends Record<string, unknown>>(
    data: T,
    options: BaseQueryOptions | undefined,
    collection: string,
    operation: string,
  ) => enforceDataTenantIdSync(data, options, () => `${collection}.${operation}`);

  return {
    aggregate: (collection, pipeline, options) =>
      inner.aggregate(collection, pipeline, g(options, collection, "aggregate")),

    count: (collection, query, options) =>
      inner.count(collection, query, g(options, collection, "count")),

    exists: (collection, query, options) =>
      inner.exists(collection, query, g(options, collection, "exists")),

    find: (collection, query, options) =>
      inner.find(collection, query, g(options, collection, "find")),

    findByIds: (collection, ids, options) =>
      inner.findByIds(collection, ids, g(options, collection, "findByIds")),

    findById: (collection, id, options) =>
      inner.findById(collection, id, g(options, collection, "findById")),

    findMany: (collection, query, options) =>
      inner.findMany(collection, query, g(options, collection, "findMany")),

    findPage: (collection, query, options) =>
      inner.findPage(collection, query, g(options, collection, "findPage")),

    findOne: (collection, query, options) =>
      inner.findOne(collection, query, g(options, collection, "findOne")),

    streamMany: (collection, query, options) =>
      inner.streamMany(collection, query, g(options, collection, "streamMany")),

    insert: (collection, data, options) => {
      const opts = g(options, collection, "insert");
      return inner.insert(collection, d(data as any, opts, collection, "insert"), opts);
    },

    insertMany: (collection, data, options) => {
      const opts = g(options, collection, "insertMany");
      // The batch helper only copies tenant-less rows; the returned shape is
      // identical to `data`, so restore the adapter's generic element type.
      const guarded = enforceDataTenantIdBatchSync(
        data as any,
        opts,
        () => `${collection}.insertMany`,
      ) as unknown as typeof data;
      return inner.insertMany(collection, guarded, opts);
    },

    update: (collection, id, data, options) => {
      const opts = g(options, collection, "update");
      return inner.update(collection, id, d(data as any, opts, collection, "update"), opts);
    },

    updateMany: (collection, query, data, options) => {
      const opts = g(options, collection, "updateMany");
      return inner.updateMany(
        collection,
        query,
        d(data as any, opts, collection, "updateMany"),
        opts,
      );
    },

    upsert: (collection, query, data, options) => {
      const opts = g(options, collection, "upsert");
      return inner.upsert(collection, query, d(data as any, opts, collection, "upsert"), opts);
    },

    upsertMany: (collection, items, options) => {
      const opts = g(options, collection, "upsertMany");
      const guarded = enforceUpsertManyBatchSync(
        items as any,
        opts,
        () => `${collection}.upsertMany`,
      ) as unknown as typeof items;
      return inner.upsertMany(collection, guarded, opts);
    },

    delete: (collection, id, options) =>
      inner.delete(collection, id, g(options, collection, "delete")),

    deleteMany: (collection, query, options) =>
      inner.deleteMany(collection, query, g(options, collection, "deleteMany")),

    restore: (collection, id, options) =>
      inner.restore(collection, id, g(options, collection, "restore")),

    // Direct-to-Wire point reads keep the same tenant-options guard as every other
    // op. Without this delegation the wrapper (multi-tenant mode) hides the method —
    // an explicit method list cannot see prototype members — and the read lane's
    // wire branch would quietly fall back to the Domain Plane whenever MULTI_TENANT
    // is on.
    ...(typeof inner.findPointWireStream === "function"
      ? {
          findPointWireStream: (collection: string, id: DatabaseId, options?: BaseQueryOptions) =>
            inner.findPointWireStream!(
              collection,
              id,
              g(options, collection, "findPointWireStream"),
            ),
        }
      : {}),

    ...(typeof inner.findListWireStream === "function"
      ? {
          findListWireStream: (
            collection: string,
            options?: BaseQueryOptions & {
              limit?: number;
              offset?: number;
              requirePublished?: boolean;
              sortField?: string;
              sortDirection?: "asc" | "desc";
              fields?: string[];
            },
          ) => inner.findListWireStream!(collection, g(options, collection, "findListWireStream")),
        }
      : {}),

    ...(typeof inner.atomicIncrement === "function"
      ? {
          atomicIncrement: (collection, id, field, amount, options) =>
            inner.atomicIncrement!(
              collection,
              id,
              field,
              amount,
              g(options, collection, "atomicIncrement"),
            ),
        }
      : {}),
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

  const wrappers = new Map<PropertyKey, (...args: unknown[]) => unknown>();

  return new Proxy(namespace, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== "function") return original;

      // Memoize one wrapper per property — the previous Proxy allocated a fresh
      // closure on every property access under multi-tenant mode.
      const cached = wrappers.get(prop);
      if (cached) return cached;

      const wrapper = (...args: unknown[]) => {
        if (mode === "bypass") {
          return original.apply(target, args);
        }

        const last = args[args.length - 1];
        if (last && typeof last === "object" && !Array.isArray(last)) {
          args[args.length - 1] = enforceOptionsSync(last, mode, `${label}.${String(prop)}`);
        }
        return original.apply(target, args);
      };
      wrappers.set(prop, wrapper);
      return wrapper;
    },
  }) as T;
}
