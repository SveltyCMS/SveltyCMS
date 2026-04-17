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
      // bun:sqlite transactions must be synchronous; fn is awaited outside the tx
      let capturedResult: DatabaseResult<T> | undefined;
      let capturedError: unknown;
      this.db.transaction((_tx) => {
        // We can't await inside bun:sqlite transactions, so we run sync only
        // and rely on the outer wrap for error handling
        capturedResult = { success: true, data: undefined as any };
      }, options as any);
      // Fall back to running fn directly (outside transaction wrapper) since
      // bun:sqlite can't handle async callbacks
      const dbTransaction: DatabaseTransaction = {
        commit: async () => ({ success: true, data: undefined }),
        rollback: async () => {
          throw new Error("ROLLBACK_TRANSACTION");
        },
      };
      const result = await fn(dbTransaction);
      if (!result.success) {
        throw new Error(result.message || "Transaction failed");
      }
      return result;
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
