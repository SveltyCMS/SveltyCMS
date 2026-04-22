/**
 * @file src/databases/mongodb/modules/transaction-module.ts
 * @description Transaction module for MongoDB.
 */

import type { DatabaseResult, DatabaseTransaction } from "../../db-interface";
import type { MongoDBAdapter } from "../mongo-db-adapter";
import { createDatabaseError } from "../methods/mongodb-utils";

export class MongoTransactionModule {
  private adapter: MongoDBAdapter;

  constructor(adapter: MongoDBAdapter) {
    this.adapter = adapter;
  }

  async execute<T>(
    fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>,
  ): Promise<DatabaseResult<T>> {
    if (!this.adapter.connection) {
      return {
        success: false,
        message: "Database not connected",
        error: createDatabaseError("NOT_CONNECTED", "NOT_CONNECTED", "Database not connected"),
      };
    }

    const session = await this.adapter.connection.startSession();
    try {
      session.startTransaction();

      // Create a wrapper that satisfies the CMS transaction interface
      const dbTransaction: DatabaseTransaction & any = {
        session,
        commit: async () => {
          await session.commitTransaction();
          return { success: true, data: undefined };
        },
        rollback: async () => {
          await session.abortTransaction();
          return { success: true, data: undefined };
        },
        // CMS CRUD delegates that pass the session
        insert: async (collection: string, data: any, options: any = {}) =>
          this.adapter.crud.insert(collection, data, { ...options, session }),

        update: async (collection: string, id: any, data: any, options: any = {}) =>
          this.adapter.crud.update(collection, id, data, { ...options, session }),

        delete: async (collection: string, id: any, options: any = {}) =>
          this.adapter.crud.delete(collection, id, { ...options, session }),

        findById: async (collection: string, id: any, options: any = {}) =>
          this.adapter.crud.findOne(collection, { _id: id } as any, { ...options, session }),
      };

      const result = await fn(dbTransaction);

      // Handle raw non-result returns from legacy or simplified bench scripts
      const formalResult =
        result && typeof result === "object" && "success" in result
          ? result
          : { success: true, data: result };

      if (formalResult.success) {
        if (session.inTransaction()) {
          await session.commitTransaction();
        }
      } else {
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
      }

      return formalResult as DatabaseResult<T>;
    } catch (error: any) {
      if (session.inTransaction()) {
        await session.abortTransaction();
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
