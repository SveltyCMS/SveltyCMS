/**
 * @file src/databases/mongodb/transaction-module.ts
 * @description Transaction module for MongoDB with session-bound domain scoping,
 * direct findById routing, and lifecycle state guards.
 *
 * ### Features:
 * - Dedicated `RollbackSignal` so intentional rollbacks never log as crashes
 * - `commit()`/`rollback()` state guards: operations after commit fail fast
 * - `findById` routed to direct findById instead of generic findOne
 * - Domain modules (auth/content/media/system/batch/collection) proxied so every
 *   call receives `{ session }` and participates in the transaction
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
import type { MongoDBAdapter } from "./mongo-db-adapter";
import type { MongoCrudModule } from "./crud-module";
import type { ClientSession } from "mongoose";
import { createDatabaseError } from "./mongodb-utils";

/** Distinct error subclass for intentional rollbacks (vs. DB crashes). */
class RollbackSignal extends Error {
  constructor() {
    super("ROLLBACK_TRANSACTION");
    this.name = "RollbackSignal";
  }
}

/**
 * Deep-binds a domain namespace (auth, content, media, system, batch, collection)
 * so every method receives `{ session }` in its options bag — domain modules
 * execute with the transaction session instead of running unisolated.
 */
function bindSessionToNamespace<T extends object>(
  namespace: T | null | undefined,
  session: ClientSession,
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
            args.push({ session });
          } else if (args.length > 0) {
            const lastArg = args[args.length - 1];
            if (
              lastArg &&
              typeof lastArg === "object" &&
              !Array.isArray(lastArg) &&
              !(lastArg instanceof Date)
            ) {
              args[args.length - 1] = { ...(lastArg as object), session };
            } else {
              args.push({ session });
            }
          } else {
            args.push({ session });
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
        return bindSessionToNamespace(original as object, session);
      }
      return original;
    },
  });
}

/** Transaction surface handed to the user callback (superset of DatabaseTransaction). */
interface ScopedTransaction extends DatabaseTransaction {
  session: ClientSession;
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
  auth: unknown;
  content: unknown;
  media: unknown;
  system: unknown;
  batch: unknown;
  collection: unknown;
}

export class MongoTransactionModule {
  private adapter: MongoDBAdapter;

  constructor(adapter: MongoDBAdapter) {
    this.adapter = adapter;
  }

  async execute<T>(
    fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>,
  ): Promise<DatabaseResult<T>> {
    if (!this.adapter.isConnected() || !this.adapter.connection) {
      return {
        success: false,
        message: "Database not connected",
        error: createDatabaseError("NOT_CONNECTED", "NOT_CONNECTED", "Database not connected"),
      };
    }

    const session = await this.adapter.connection.startSession();
    let isCommitted = false;
    let isRolledBack = false;

    try {
      session.startTransaction();

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

      // Create a wrapper that satisfies the CMS transaction interface
      const dbTransaction: ScopedTransaction = {
        session,
        commit: async () => {
          assertActive();
          isCommitted = true;
          if (session.inTransaction()) {
            await session.commitTransaction();
          }
          return { success: true, data: undefined };
        },
        rollback: async () => {
          assertActive();
          isRolledBack = true;
          if (session.inTransaction()) {
            await session.abortTransaction();
          }
          throw new RollbackSignal();
        },
        insert: async <T2 extends BaseEntity>(
          collection: string,
          data: EntityCreate<T2>,
          options: BaseQueryOptions = {},
        ) => {
          assertActive();
          return this.adapter.crud.insert<T2>(collection, data, { ...options, session } as any);
        },
        insertMany: async <T2 extends BaseEntity>(
          collection: string,
          data: EntityCreate<T2>[],
          options: BaseQueryOptions = {},
        ) => {
          assertActive();
          return this.adapter.crud.insertMany<T2>(collection, data, { ...options, session } as any);
        },
        update: async <T2 extends BaseEntity>(
          collection: string,
          id: DatabaseId,
          data: EntityUpdate<T2>,
          options: BaseQueryOptions = {},
        ) => {
          assertActive();
          return this.adapter.crud.update<T2>(collection, id, data, {
            ...options,
            session,
          } as any);
        },
        delete: async (collection: string, id: DatabaseId, options: BaseQueryOptions = {}) => {
          assertActive();
          return this.adapter.crud.delete(collection, id, { ...options, session } as any);
        },
        findById: async <T2 extends BaseEntity>(
          collection: string,
          id: DatabaseId,
          options: BaseQueryOptions = {},
        ) => {
          assertActive();
          return (this.adapter.crud as MongoCrudModule).findById<T2>(collection, id, {
            ...options,
            session,
          } as any);
        },

        // 🛡️ BOUND DOMAIN MODULES: auto-inject session so every domain call
        // participates in this transaction.
        auth: bindSessionToNamespace(this.adapter.auth as object, session),
        content: bindSessionToNamespace(this.adapter.content as object, session),
        media: bindSessionToNamespace(this.adapter.media as object, session),
        system: bindSessionToNamespace(this.adapter.system as object, session),
        batch: bindSessionToNamespace(this.adapter.batch as object, session),
        collection: bindSessionToNamespace(this.adapter.collection as object, session),
      };

      const result = await fn(dbTransaction as DatabaseTransaction);

      // A callback that returns a non-envelope value succeeded without throwing.
      if (!result || (typeof result === "object" && !("success" in result))) {
        if (!isCommitted && session.inTransaction()) {
          await session.commitTransaction();
        }
        return { success: true, data: result } as DatabaseResult<T>;
      }

      if (!result.success && (result as { rollback?: boolean }).rollback !== false) {
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
        return result;
      }

      if (!isCommitted && session.inTransaction()) {
        await session.commitTransaction();
      }

      return result as DatabaseResult<T>;
    } catch (error: any) {
      if (session.inTransaction()) {
        try {
          await session.abortTransaction();
        } catch {
          // Ignore secondary abort failures
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
          error: createDatabaseError(
            "TRANSACTION_ROLLED_BACK",
            "TRANSACTION_ROLLED_BACK",
            "Transaction rolled back",
          ),
        };
      }

      return {
        success: false,
        message: error.message || "Transaction failed",
        error: createDatabaseError(error, "TRANSACTION_FAILED", error.message),
      };
    } finally {
      session.endSession();
    }
  }
}
