/**
 * @file src/databases/mongodb/modules/transaction-module.ts
 * @description Transaction module for MongoDB.
 */

import type { DatabaseResult, DatabaseTransaction } from "../db-interface";
import type { MongoDBAdapter } from "./mongo-db-adapter";
import { createDatabaseError } from "./mongodb-utils";

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
          this.adapter.crud.update(collection, id, data, {
            ...options,
            session,
          }),

        delete: async (collection: string, id: any, options: any = {}) =>
          this.adapter.crud.delete(collection, id, { ...options, session }),

        findById: async (collection: string, id: any, options: any = {}) =>
          this.adapter.crud.findOne(collection, { _id: id } as any, {
            ...options,
            session,
          }),

        // 🛡️ Domain Support: Injecting domain modules into the transaction object
        // This allows tx.auth, tx.content, etc. to be used within TransactionManager.runAtomic blocks.
        auth: this.adapter.auth,
        content: this.adapter.content,
        media: this.adapter.media,
        system: this.adapter.system,
        batch: this.adapter.batch,
        collection: this.adapter.collection,
      };

      const result = await fn(dbTransaction);

      // Handle non-result returns: undefined means rollback by default
      const formalResult =
        result && typeof result === "object" && "success" in result
          ? result
          : {
              success: false,
              data: result,
              message: "Transaction function returned no result — rolled back",
            };

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
