/**
 * @file src/databases/mariadb/transaction-module.ts
 * @description Transaction module for MariaDB with connection-bound domain scoping,
 * prepared point-read routing, and lifecycle state guards.
 *
 * ### Features:
 * - Fail-fast connection check that avoids throwing `db` getter
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
import type { AdapterCore } from "./adapter-core";

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
  conn?: unknown;
}

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
          const fn = original as Function;
          if (fn.length > 0 && args.length < fn.length) {
            while (args.length < fn.length - 1) {
              args.push(undefined);
            }
            args.push({ transaction: txnOpts });
          } else if (args.length > 0) {
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
  conn?: unknown;
  auth: unknown;
  content: unknown;
  media: unknown;
  system: unknown;
  batch: unknown;
  collection: unknown;
}

export class TransactionModule {
  private readonly core: AdapterCore;

  constructor(core: AdapterCore) {
    this.core = core;
  }

  async execute<T>(
    fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>,
    options?: {
      isolationLevel?: "read uncommitted" | "read committed" | "repeatable read" | "serializable";
      timeout?: number;
    },
  ): Promise<DatabaseResult<T>> {
    // 🛡️ SAFE CONNECTION CHECK: Probing state flags first avoids the throwing db getter
    if (!this.core.isConnected() || !this.core.pool) {
      return this.core.notConnectedError();
    }

    try {
      return await this.core.db.transaction(async (tx) => {
        // 🚀 RAW-PATH HANDLE: drizzle's mysql2 session acquires a DEDICATED
        // pool connection for the transaction — `session.client` IS that
        // connection (released by drizzle on commit/rollback). Raw paths run
        // on it so the fast path participates in the transaction instead of
        // deferring to Drizzle (single code path, no rollback bypass).
        const txConn = (tx as any)?.session?.client ?? null;
        const txnOpts: TxnHandle = txConn ? { db: tx, conn: txConn } : { db: tx };

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
          insert: async <T2 extends BaseEntity>(
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
          update: async <T2 extends BaseEntity>(
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
          delete: async (collection: string, id: DatabaseId, opts: BaseQueryOptions = {}) => {
            assertActive();
            return this.core.crud.delete(collection, id, { ...opts, transaction: txnOpts });
          },
          // 🚀 FAST-PATH: core.findById hits the prepared rawFindById point-read
          // on the txn connection instead of building an unmemoized dynamic findOne AST.
          findById: async <T2 extends BaseEntity>(
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
          conn: txConn,
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
      }, options as any);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
