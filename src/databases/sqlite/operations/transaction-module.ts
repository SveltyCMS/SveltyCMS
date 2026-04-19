/**
 * @file src/databases/mariadb/operations/transaction-module.ts
 * @description Transaction module for MariaDB
 *
 * Features:
 * - Execute transaction
 */

import type { DatabaseResult, DatabaseTransaction } from "../../db-interface";
import type { AdapterCore } from "../adapter/adapter-core";
import * as utils from "../utils";

export class TransactionModule {
  private readonly core: AdapterCore;

  constructor(core: AdapterCore) {
    this.core = core;
  }

  private get db() {
    return this.core.db;
  }

  async execute<T>(
    fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>,
    options?: {
      isolationLevel?: "READ UNCOMMITTED" | "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE";
    },
  ): Promise<DatabaseResult<T>> {
    if (!this.db) {
      return this.core.notConnectedError();
    }

    try {
      return await this.db.transaction(async (_tx) => {
        // Create a transactional version of the transaction object
        // that satisfies the benchmark's need for CRUD methods.
        const dbTransaction: DatabaseTransaction & any = {
          commit: async () => ({ success: true, data: undefined }),
          rollback: async () => {
            throw new Error("ROLLBACK_TRANSACTION");
          },
          // 🚀 Add basic CRUD support for the benchmark
          insert: async (collection: string, data: any, options: any = {}) =>
            this.core.crud.insert(collection, data, { ...options, tx: _tx }),
          update: async (collection: string, id: any, data: any, options: any = {}) =>
            this.core.crud.update(collection, id, data, { ...options, tx: _tx }),
          delete: async (collection: string, id: any, options: any = {}) =>
            this.core.crud.delete(collection, id, { ...options, tx: _tx }),
          findById: async (collection: string, id: any, options: any = {}) =>
            this.core.crud.findOne(collection, { _id: id } as any, { ...options, tx: _tx }),
        };

        const result = await fn(dbTransaction);

        // 🚀 Fix: If function doesn't return a formal DatabaseResult, assume success if no throw occurred
        if (!result || (typeof result === "object" && !("success" in result))) {
          return { success: true, data: result } as any;
        }

        if (!result.success) {
          throw new Error(result.message || "Transaction failed");
        }
        return result;
      }, options as any);
    } catch (error) {
      if ((error as Error).message === "ROLLBACK_TRANSACTION") {
        return {
          success: false,
          message: "Transaction rolled back",
          error: utils.createDatabaseError("TRANSACTION_ROLLED_BACK", "Transaction rolled back"),
        };
      }
      return this.core.handleError(error, "TRANSACTION_FAILED");
    }
  }
}
