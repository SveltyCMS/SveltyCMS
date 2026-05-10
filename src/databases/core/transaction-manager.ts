/**
 * @file src/databases/core/transaction-manager.ts
 * @description 💎 GOLD TIER: Service-Level Transaction Wrapper.
 * Provides a database-agnostic way to execute multiple business operations
 * within a single atomic transaction.
 */

import { logger } from "@src/utils/logger";
import type { IDBAdapter, DatabaseResult, DatabaseTransaction } from "../db-interface";

export class TransactionManager {
  /**
   * Executes a block of code within a database transaction.
   * If the block throws an error, the transaction is automatically rolled back.
   *
   * @param adapter The database adapter to use for the transaction.
   * @param work The business logic to execute.
   */
  public static async runAtomic<T>(
    adapter: IDBAdapter,
    work: (tx: DatabaseTransaction) => Promise<DatabaseResult<T>>,
  ): Promise<DatabaseResult<T>> {
    if (typeof adapter.transaction !== "function") {
      logger.warn(
        `[Transaction] Adapter ${adapter.type} does not support transactions. Executing without atomicity.`,
      );
      return await work(adapter as any);
    }

    let lastError: any;
    const maxRetries = 5;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Use casting to bypass strict return type inference issues between T and DatabaseResult<T>
        return await (adapter.transaction as any)(async (tx: any) => {
          return await work(tx);
        });
      } catch (error: any) {
        lastError = error;
        const msg = error.message || "";

        // 🚀  Handle SQLite Busy/Locked errors with exponential backoff
        if (msg.includes("BUSY") || msg.includes("locked") || msg.includes("EBUSY")) {
          const delay = Math.min(100 * Math.pow(2, attempt), 2000);
          logger.warn(
            `[Transaction] Database busy, retrying in ${delay}ms (Attempt ${attempt}/${maxRetries})`,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        // Non-busy error, return as failure result
        logger.error(`[Transaction] Atomic block failed:`, error);
        return { success: false, message: error.message, error };
      }
    }

    logger.error(`[Transaction] Atomic block failed after ${maxRetries} attempts:`, lastError);
    return { success: false, message: lastError.message, error: lastError };
  }
}
