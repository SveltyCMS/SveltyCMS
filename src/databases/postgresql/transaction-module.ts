/**
 * @file src/databases/postgresql/transaction-module.ts
 * @description Transaction module for PostgreSQL with connection-bound domain scoping,
 * GUC batching, local statement timeout, and prepared point-read routing.
 *
 * ### Features:
 * - Fail-fast connection check that never trips the throwing `db` getter
 * - Single round-trip `set_config` batching for tenant context + statement timeout
 *   (SET LOCAL semantics: settings auto-revert on commit/rollback)
 * - `isolationLevel` / `timeout` options forwarded to the Drizzle transaction
 * - Dedicated `RollbackSignal` so intentional rollbacks never log as crashes
 * - `commit()`/`rollback()` state guards: operations after commit fail fast
 * - `findById` routed to the prepared raw point-read instead of a dynamic AST query
 * - Domain modules (auth/content/media/system/batch/collection) proxied so every
 *   call receives `{ transaction }` and stays on the same connection
 */

import type {
  BaseEntity,
  BaseQueryOptions,
  DatabaseId,
  DatabaseResult,
  DatabaseTransaction,
  EntityCreate,
  EntityUpdate,
} from "../db-interface";
import type { PostgresAdapterCore } from "./adapter-core";

/** Distinct error subclass for intentional rollbacks (vs. DB crashes). */
class RollbackSignal extends Error {
  constructor() {
    super("ROLLBACK_TRANSACTION");
    this.name = "RollbackSignal";
  }
}

/** Options object injected into domain-module calls on a transaction connection. */
interface TxnHandle {
  db: unknown;
  sql?: unknown;
}

const PG_ISOLATION_LEVELS = new Set([
  "read uncommitted",
  "read committed",
  "repeatable read",
  "serializable",
]);

/**
 * Deep-binds a domain namespace (auth, content, media, system, batch, collection)
 * so every method receives `{ transaction: txnOpts }` in its options bag — domain
 * modules resolve `options.transaction` to run on the transaction connection
 * instead of checking out a second pool connection (which would break atomicity).
 */
function bindTransactionToNamespace<T extends object>(
  namespace: T | null | undefined,
  txnOpts: TxnHandle,
): T | null | undefined {
  if (!namespace || typeof namespace !== "object") return namespace;
  return new Proxy(namespace, {
    get(target, prop, receiver) {
      const original: unknown = Reflect.get(target, prop, receiver);
      if (typeof original === "function") {
        return (...args: unknown[]) => {
          const lastArg = args[args.length - 1];
          if (
            lastArg &&
            typeof lastArg === "object" &&
            !Array.isArray(lastArg) &&
            !(lastArg instanceof Date)
          ) {
            args[args.length - 1] = { ...(lastArg as object), transaction: txnOpts };
          } else {
            args.push({ transaction: txnOpts });
          }
          return (original as (...callArgs: unknown[]) => unknown).apply(target, args);
        };
      }
      if (
        original &&
        typeof original === "object" &&
        !Array.isArray(original) &&
        !(original instanceof Date) &&
        !(original instanceof Promise)
      ) {
        return bindTransactionToNamespace(original as object, txnOpts);
      }
      return original;
    },
  });
}

/** Transaction surface handed to the user callback (superset of DatabaseTransaction). */
interface ScopedTransaction extends DatabaseTransaction {
  insert<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>>;
  update<T extends BaseEntity>(
    collection: string,
    id: DatabaseId,
    data: EntityUpdate<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>>;
  delete(
    collection: string,
    id: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<void>>;
  findById<T extends BaseEntity>(
    collection: string,
    id: DatabaseId,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T | null>>;
  db: unknown;
  auth: unknown;
  content: unknown;
  media: unknown;
  system: unknown;
  batch: unknown;
  collection: unknown;
}

export class TransactionModule {
  private readonly core: PostgresAdapterCore;

  constructor(core: PostgresAdapterCore) {
    this.core = core;
  }

  async execute<T>(
    fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>,
    options?: {
      timeout?: number;
      isolationLevel?: string;
      isWrite?: boolean;
    },
  ): Promise<DatabaseResult<T>> {
    // 🛡️ SAFE CONNECTION CHECK: `core.db` is a throwing getter when disconnected —
    // probe the state flags first so a missing pool returns the error envelope
    // instead of raising from the property access.
    if (!this.core.isConnected() || !this.core.sql) {
      return this.core.notConnectedError();
    }

    const requestedLevel = options?.isolationLevel;
    const config =
      requestedLevel && PG_ISOLATION_LEVELS.has(requestedLevel)
        ? {
            isolationLevel: requestedLevel as
              | "read uncommitted"
              | "read committed"
              | "repeatable read"
              | "serializable",
            ...(options?.isWrite === false ? { accessMode: "read only" as const } : {}),
          }
        : undefined;
    const timeoutMs = Number(options?.timeout);
    const tenantId = this.core.currentTenantId;

    try {
      return await this.core.db.transaction(async (tx) => {
        // 🚀 RAW-PATH HANDLE: drizzle's postgres-js session exposes the
        // begin()-scoped postgres.js instance as `session.client` so raw paths
        // (rawInsertReturning/rawUpdate/rawFindById/insertMany) participate in
        // the transaction instead of deferring to Drizzle.
        const txSql: unknown = (tx as { session?: { client?: unknown } }).session?.client ?? null;
        const txnOpts: TxnHandle = txSql ? { db: tx, sql: txSql } : { db: tx };

        // 🚀 GUC BATCHING: tenant context + statement_timeout in ONE round trip.
        // SET LOCAL (third param = true) auto-reverts on commit/rollback.
        // The request path already set `currentTenantId` via setTenantContext,
        // so the tx connection only needs its own local GUC for RLS.
        const hasTenant = Boolean(txSql && tenantId);
        const hasTimeout = Boolean(txSql && Number.isFinite(timeoutMs) && timeoutMs > 0);
        if (hasTenant && hasTimeout) {
          await (txSql as (strings: TemplateStringsArray, ...values: unknown[]) => unknown)`
            SELECT set_config('app.tenant_id', ${tenantId}, true),
                   set_config('statement_timeout', ${String(Math.floor(timeoutMs))}, true)`;
        } else if (hasTenant) {
          await this.core.setTenantContext(
            tenantId,
            txSql as ReturnType<typeof import("postgres")>,
          );
        } else if (hasTimeout) {
          await (txSql as (strings: TemplateStringsArray, ...values: unknown[]) => unknown)`
            SELECT set_config('statement_timeout', ${String(Math.floor(timeoutMs))}, true)`;
        }

        let isCommitted = false;
        let isRolledBack = false;
        const assertActive = (): void => {
          if (isCommitted) {
            throw new Error(
              "TRANSACTION_ALREADY_COMMITTED: Cannot execute operations on a committed transaction.",
            );
          }
          if (isRolledBack) {
            throw new RollbackSignal();
          }
        };

        const dbTransaction: ScopedTransaction = {
          commit: async () => {
            isCommitted = true;
            return { success: true, data: undefined };
          },
          rollback: async () => {
            isRolledBack = true;
            throw new RollbackSignal();
          },
          insert: <T2 extends BaseEntity>(
            collection: string,
            data: EntityCreate<T2>,
            opts: BaseQueryOptions = {},
          ) => {
            assertActive();
            return this.core.crud.insert<T2>(collection, data, {
              ...opts,
              transaction: txnOpts,
            });
          },
          update: <T2 extends BaseEntity>(
            collection: string,
            id: DatabaseId,
            data: EntityUpdate<T2>,
            opts: BaseQueryOptions = {},
          ) => {
            assertActive();
            return this.core.crud.update<T2>(collection, id, data, {
              ...opts,
              transaction: txnOpts,
            });
          },
          delete: (collection: string, id: DatabaseId, opts: BaseQueryOptions = {}) => {
            assertActive();
            return this.core.crud.delete(collection, id, { ...opts, transaction: txnOpts });
          },
          // 🚀 FAST-PATH: core.findById hits the prepared rawFindById point-read
          // (tx-aware: it runs on the transaction connection when a transaction
          // handle is present) instead of building a dynamic findOne AST.
          findById: <T2 extends BaseEntity>(
            collection: string,
            id: DatabaseId,
            opts: BaseQueryOptions = {},
          ) => {
            assertActive();
            return this.core.findById<T2>(collection, id, {
              ...opts,
              transaction: txnOpts,
            });
          },
          db: tx,
          sql: txSql,
          // 🛡️ BOUND DOMAIN MODULES: auto-inject the transaction handle so every
          // domain call runs on this connection and rolls back with the txn.
          auth: bindTransactionToNamespace(this.core.auth as object, txnOpts),
          content: bindTransactionToNamespace(this.core.content as object, txnOpts),
          media: bindTransactionToNamespace(this.core.media as object, txnOpts),
          system: bindTransactionToNamespace(this.core.system as object, txnOpts),
          batch: bindTransactionToNamespace(this.core.batch as object, txnOpts),
          collection: bindTransactionToNamespace(this.core.collection as object, txnOpts),
        };

        const result = await fn(dbTransaction as DatabaseTransaction);

        // A callback that returns a non-envelope value succeeded without throwing.
        if (!result || (typeof result === "object" && !("success" in result))) {
          return { success: true, data: result } as DatabaseResult<T>;
        }

        if (!result.success && (result as { rollback?: boolean }).rollback !== false) {
          throw new RollbackSignal();
        }
        return result;
      }, config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Intentional rollbacks (explicit rollback() / failed envelope) return an
      // envelope instead of surfacing as TRANSACTION_FAILED crashes.
      if (
        error instanceof RollbackSignal ||
        message === "ROLLBACK_TRANSACTION" ||
        /force rollback/i.test(message)
      ) {
        return {
          success: false,
          message: "Transaction rolled back",
          error: {
            code: "TRANSACTION_ROLLED_BACK",
            message: "Transaction rolled back",
          },
        } as DatabaseResult<T>;
      }

      return this.core.handleError(error, "TRANSACTION_FAILED");
    }
  }
}
