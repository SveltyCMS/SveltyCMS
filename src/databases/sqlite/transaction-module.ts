/**
 * @file src/databases/sqlite/transaction-module.ts
 * @description Transaction module for SQLite with connection-bound domain scoping,
 * prepared point-read routing, and lifecycle state guards.
 *
 * ### Features:
 * - Fail-fast connection check that avoids throwing getters
 * - Mutex-guarded BEGIN IMMEDIATE preventing write-upgrade deadlocks
 * - Dedicated `RollbackSignal` so intentional rollbacks never log as crashes
 * - `commit()`/`rollback()` state guards: operations after commit fail fast
 * - `findById` routed to the prepared raw point-read instead of an AST query
 * - Domain modules (auth/content/media/system/batch/collection) proxied so every
 *   call receives `{ transaction }`
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
import { SQLiteAdapterCore } from "./adapter-core";
import { createDatabaseError } from "../core/relational-utils";
import { DatabaseModule } from "../core/base-adapter";

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
}

/**
 * Deep-binds a domain namespace (auth, content, media, system, batch, collection)
 * so every method receives `{ transaction: txnOpts }` in its options bag.
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
  insertMany<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T[]>>;
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
  crud: {
    insert<T extends BaseEntity>(
      collection: string,
      data: EntityCreate<T>,
      options?: BaseQueryOptions,
    ): Promise<DatabaseResult<T>>;
    insertMany<T extends BaseEntity>(
      collection: string,
      data: EntityCreate<T>[],
      options?: BaseQueryOptions,
    ): Promise<DatabaseResult<T[]>>;
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
    findOne<T extends BaseEntity>(
      collection: string,
      query: any,
      options?: BaseQueryOptions,
    ): Promise<DatabaseResult<T | null>>;
    deleteMany(
      collection: string,
      query: any,
      options?: BaseQueryOptions,
    ): Promise<DatabaseResult<{ deletedCount: number }>>;
  };
  db: unknown;
  auth: unknown;
  content: unknown;
  media: unknown;
  system: unknown;
  batch: unknown;
  collection: unknown;
}

export class TransactionModule extends DatabaseModule<SQLiteAdapterCore> {
  constructor(core: SQLiteAdapterCore) {
    super(core);
  }

  protected get core() {
    return this.adapter;
  }

  async execute<T>(
    fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>,
    _options?: {
      isolationLevel?: "READ UNCOMMITTED" | "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE";
    },
  ): Promise<DatabaseResult<T>> {
    if (!this.core.isConnected() || !this.core.sqlite) {
      return this.core.notConnectedError();
    }

    return SQLiteAdapterCore.writeMutex.runExclusive(async () => {
      const sqlite = this.core.sqlite;
      let rolledBack = false;
      let committed = false;

      try {
        // Use BEGIN IMMEDIATE to lock the database immediately for writes
        // This prevents deadlocks where two transactions start as READ and then try to upgrade to WRITE.
        sqlite.exec("BEGIN IMMEDIATE");

        const txOpts = { transaction: { db: this.db } };

        const assertActive = (): void => {
          if (committed) {
            throw new Error(
              "TRANSACTION_ALREADY_COMMITTED: Cannot execute operations on a committed transaction.",
            );
          }
          if (rolledBack) {
            throw new RollbackSignal();
          }
        };

        const dbTransaction: ScopedTransaction = {
          commit: async () => {
            committed = true;
            return { success: true, data: undefined };
          },
          rollback: async () => {
            rolledBack = true;
            throw new RollbackSignal();
          },
          insert: async <T2 extends BaseEntity>(
            collection: string,
            data: EntityCreate<T2>,
            opts: BaseQueryOptions = {},
          ) => {
            assertActive();
            return this.core.crud.insert<T2>(collection, data, { ...opts, ...txOpts });
          },
          insertMany: async <T2 extends BaseEntity>(
            collection: string,
            data: EntityCreate<T2>[],
            opts: BaseQueryOptions = {},
          ) => {
            assertActive();
            return this.core.crud.insertMany<T2>(collection, data, { ...opts, ...txOpts });
          },
          update: async <T2 extends BaseEntity>(
            collection: string,
            id: DatabaseId,
            data: EntityUpdate<T2>,
            opts: BaseQueryOptions = {},
          ) => {
            assertActive();
            return this.core.crud.update<T2>(collection, id, data, { ...opts, ...txOpts });
          },
          delete: async (collection: string, id: DatabaseId, opts: BaseQueryOptions = {}) => {
            assertActive();
            return this.core.crud.delete(collection, id, { ...opts, ...txOpts });
          },
          // 🚀 FAST-PATH: core.findById hits the prepared rawFindById point-read cache (_rawFindByIdSqlCache)
          // instead of building a dynamic findOne AST.
          findById: async <T2 extends BaseEntity>(
            collection: string,
            id: DatabaseId,
            opts: BaseQueryOptions = {},
          ) => {
            assertActive();
            return this.core.findById<T2>(collection, id, { ...opts, ...txOpts });
          },
          crud: {
            insert: async <T2 extends BaseEntity>(
              collection: string,
              data: EntityCreate<T2>,
              opts: BaseQueryOptions = {},
            ) => {
              assertActive();
              return this.core.crud.insert<T2>(collection, data, { ...opts, ...txOpts });
            },
            insertMany: async <T2 extends BaseEntity>(
              collection: string,
              data: EntityCreate<T2>[],
              opts: BaseQueryOptions = {},
            ) => {
              assertActive();
              return this.core.crud.insertMany<T2>(collection, data, { ...opts, ...txOpts });
            },
            update: async <T2 extends BaseEntity>(
              collection: string,
              id: DatabaseId,
              data: EntityUpdate<T2>,
              opts: BaseQueryOptions = {},
            ) => {
              assertActive();
              return this.core.crud.update<T2>(collection, id, data, { ...opts, ...txOpts });
            },
            delete: async (collection: string, id: DatabaseId, opts: BaseQueryOptions = {}) => {
              assertActive();
              return this.core.crud.delete(collection, id, { ...opts, ...txOpts });
            },
            findOne: async <T2 extends BaseEntity>(
              collection: string,
              query: any,
              opts: BaseQueryOptions = {},
            ) => {
              assertActive();
              return this.core.crud.findOne<T2>(collection, query, { ...opts, ...txOpts });
            },
            deleteMany: async (collection: string, query: any, opts: BaseQueryOptions = {}) => {
              assertActive();
              return this.core.crud.deleteMany(collection, query, { ...opts, ...txOpts });
            },
          },
          db: this.db,

          // 🛡️ BOUND DOMAIN MODULES: auto-inject the transaction handle so every
          // domain call runs on this connection and rolls back with the txn.
          auth: bindTransactionToNamespace(this.core.auth as object, txOpts.transaction),
          content: bindTransactionToNamespace(this.core.content as object, txOpts.transaction),
          media: bindTransactionToNamespace(this.core.media as object, txOpts.transaction),
          system: bindTransactionToNamespace(this.core.system as object, txOpts.transaction),
          batch: bindTransactionToNamespace(this.core.batch as object, txOpts.transaction),
          collection: bindTransactionToNamespace(
            this.core.collection as object,
            txOpts.transaction,
          ),
        };

        const result = await fn(dbTransaction as DatabaseTransaction);

        // Check if the result indicates failure and rollback if so
        if (result && typeof result === "object" && "success" in result && !result.success) {
          sqlite.exec("ROLLBACK");
          rolledBack = true;
          return result;
        }

        sqlite.exec("COMMIT");
        committed = true;

        // If function doesn't return a formal DatabaseResult, assume success if no throw occurred
        if (!result || (typeof result === "object" && !("success" in result))) {
          return { success: true, data: result } as DatabaseResult<T>;
        }

        return result;
      } catch (error) {
        if (!rolledBack && !committed) {
          try {
            sqlite.exec("ROLLBACK");
          } catch {
            // Ignore errors during rollback (e.g. if already rolled back)
          }
        }

        const message = error instanceof Error ? error.message : String(error);
        if (
          error instanceof RollbackSignal ||
          message === "ROLLBACK_TRANSACTION" ||
          /force rollback/i.test(message)
        ) {
          return {
            success: false,
            message: "Transaction rolled back",
            error: createDatabaseError("TRANSACTION_ROLLED_BACK", "Transaction rolled back"),
          };
        }
        return this.core.handleError(error, "TRANSACTION_FAILED");
      }
    });
  }
}
