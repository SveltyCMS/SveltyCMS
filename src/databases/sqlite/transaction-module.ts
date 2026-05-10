/**
 * @file src/databases/sqlite/operations/transaction-module.ts
 * @description Transaction module for SQLite
 */

import type { DatabaseResult, DatabaseTransaction } from "../db-interface";
import type { SQLiteAdapterCore } from "./adapter-core";
import * as utils from "./utils";

import { DatabaseModule } from "../core/base-adapter";

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
    if (!this.db) {
      return this.core.notConnectedError();
    }

    // 🚀 SERIALIZE: Use the write mutex to ensure only one transaction (or write) at a time
    // This is critical for SQLite/Bun to avoid 'database is locked' errors.
    return this.core.writeMutex.runExclusive(async () => {
      const sqlite = this.core.sqlite;
      try {
        // Use BEGIN IMMEDIATE to lock the database immediately for writes
        // This prevents deadlocks where two transactions start as READ and then try to upgrade to WRITE.
        sqlite.exec("BEGIN IMMEDIATE");

        const dbTransaction: DatabaseTransaction & any = {
          commit: async () => ({ success: true, data: undefined }),
          rollback: async () => {
            throw new Error("ROLLBACK_TRANSACTION");
          },
          // 🚀 CRUD Support: Note that we use the main db instance because SQLite
          // transaction is connection-bound, and we've already opened it with BEGIN.
          insert: async (collection: string, data: any, options: any = {}) =>
            this.core.crud.insert(collection, data, { ...options, transaction: { db: this.db } }),
          update: async (collection: string, id: any, data: any, options: any = {}) =>
            this.core.crud.update(collection, id, data, {
              ...options,
              transaction: { db: this.db },
            }),
          delete: async (collection: string, id: any, options: any = {}) =>
            this.core.crud.delete(collection, id, { ...options, transaction: { db: this.db } }),
          findById: async (collection: string, id: any, options: any = {}) =>
            this.core.crud.findOne(collection, { _id: id } as any, {
              ...options,
              transaction: { db: this.db },
            }),
          db: this.db,
        };

        const result = await fn(dbTransaction);

        // Check if the result indicates failure and rollback if so
        if (result && typeof result === "object" && "success" in result && !result.success) {
          sqlite.exec("ROLLBACK");
          return result;
        }

        sqlite.exec("COMMIT");

        // 🚀 Fix: If function doesn't return a formal DatabaseResult, assume success if no throw occurred
        if (!result || (typeof result === "object" && !("success" in result))) {
          return { success: true, data: result } as any;
        }

        return result;
      } catch (error) {
        try {
          sqlite.exec("ROLLBACK");
        } catch {
          // Ignore errors during rollback (e.g. if already rolled back)
        }

        if ((error as Error).message === "ROLLBACK_TRANSACTION") {
          return {
            success: false,
            message: "Transaction rolled back",
            error: utils.createDatabaseError("TRANSACTION_ROLLED_BACK", "Transaction rolled back"),
          };
        }
        return this.core.handleError(error, "TRANSACTION_FAILED");
      }
    });
  }
}
