/**
 * @file src/databases/core/rls-scoped-crud.ts
 * @description Wraps the PostgreSQL CRUD surface so tenant-scoped calls run
 * inside a transaction that binds `app.tenant_id` — the prerequisite for
 * Row-Level Security to filter anything.
 *
 * ### Why a transaction per call
 * `SET LOCAL` only lives for the transaction that issued it, which is exactly
 * the property RLS needs: the setting cannot leak to the next request that
 * borrows the same pooled socket. A session-level `SET` on a shared pool would
 * leak (that is why `setTenantContext()` refuses to do it).
 *
 * ### When it does nothing
 * - RLS mode is `off` (the default) — the call is forwarded untouched.
 * - The caller already passed `transaction` — the outer transaction bound the
 *   GUC, and starting a nested one would be wrong.
 * - The call carries no `tenantId` — that is a system path (setup, migration,
 *   audit flush) and must run on a role with `BYPASSRLS`; wrapping it would
 *   either hide every row (`FORCE` + unbound context) or silently scope it to
 *   the wrong tenant.
 * - The method streams (`streamMany`, wire streams): the result is consumed
 *   after the call returns, so the transaction would close too early.
 *
 * Features:
 * - explicit per-method options index (no argument guessing)
 * - tenant is passed to `transaction()` — no process-global "current tenant"
 * - bypass-aware: branded system scopes keep their documented behaviour
 */

import type { BaseQueryOptions, DatabaseResult, ICrudAdapter } from "../db-interface";
import { isTenantRlsEnforced, maybeRefreshTenantRlsMode } from "../tenant-rls";
import { hasTenantBypass } from "../system-tenant-scope";

/** Minimal adapter surface this wrapper needs. */
export interface RlsTransactionCapable {
  transaction<T>(
    fn: (transaction: never) => Promise<DatabaseResult<T>>,
    options?: { tenantId?: string; timeout?: number; isolationLevel?: string; isWrite?: boolean },
  ): Promise<DatabaseResult<T>>;
}

/** Position of the options bag for each CRUD method (all trailing/defaulted). */
const OPTIONS_INDEX: Record<string, number> = {
  aggregate: 2,
  count: 2,
  findPage: 2,
  delete: 2,
  deleteMany: 2,
  restore: 2,
  exists: 2,
  findByIds: 2,
  findById: 2,
  findMany: 2,
  findOne: 2,
  find: 2,
  insert: 2,
  insertMany: 2,
  update: 3,
  updateMany: 3,
  upsert: 3,
  upsertMany: 2,
  atomicIncrement: 4,
};

/** Result types that outlive the call — a transaction cannot wrap them. */
const NEVER_WRAPPED = new Set(["streamMany", "findPointWireStream", "findListWireStream"]);

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Wrap `crud` so every tenant-scoped call is transaction-scoped when
 * `TENANT_RLS_ENABLED` is on.
 */
export function createRlsScopedCrud<T extends ICrudAdapter>(
  crud: T,
  adapter: RlsTransactionCapable,
  /** Mode predicate — injectable so a test never depends on the settings memo. */
  isEnforced: () => boolean = isTenantRlsEnforced,
): T {
  const target = crud as unknown as Record<string, unknown>;

  const wrapper = new Proxy(target, {
    get(source, property, receiver) {
      const value = Reflect.get(source, property, receiver);
      if (typeof value !== "function" || typeof property !== "string") return value;
      const methodName = property;
      if (NEVER_WRAPPED.has(methodName)) return value.bind(source) as unknown;

      const optionsIndex = OPTIONS_INDEX[methodName];
      return async (...args: unknown[]) => {
        const call = value as (...callArgs: unknown[]) => Promise<unknown>;
        if (optionsIndex === undefined) return call.apply(source, args);
        // Synchronous fast path: no await on the hot path. A stale memo is
        // refreshed in the background; until it lands the previous mode holds,
        // which is the application-predicate default — never a weaker guarantee.
        if (!isEnforced()) {
          maybeRefreshTenantRlsMode();
          return call.apply(source, args);
        }

        const rawOptions = args[optionsIndex];
        if (!isObjectLike(rawOptions)) return call.apply(source, args);
        const options = rawOptions as BaseQueryOptions;
        if (options.transaction || hasTenantBypass(options)) return call.apply(source, args);
        const tenantId = options.tenantId ? String(options.tenantId) : "";
        if (!tenantId) return call.apply(source, args);

        return adapter.transaction(
          async (transaction) => {
            const scoped = [...args];
            scoped[optionsIndex] = { ...options, transaction };
            return (await call.apply(source, scoped)) as DatabaseResult<unknown>;
          },
          { tenantId, isWrite: !READ_METHODS.has(methodName) },
        ) as Promise<unknown>;
      };
    },
  });

  return wrapper as unknown as T;
}

/** Methods that only read — `isWrite` lets the adapter pick a read-only tx. */
const READ_METHODS = new Set([
  "aggregate",
  "count",
  "findPage",
  "exists",
  "findByIds",
  "findById",
  "findMany",
  "findOne",
  "find",
]);
