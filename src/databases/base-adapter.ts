/**
 * @file src/databases/base-adapter.ts
 * @description Standard base class for all SveltyCMS database adapters.
 * Provides common state management, capability reporting, and error wrapping.
 */

import { logger } from "@utils/logger";
import type { DatabaseCapabilities, DatabaseError, DatabaseResult } from "./db-interface";

export abstract class BaseAdapter {
  protected connected = false;
  protected capabilities: DatabaseCapabilities = {
    supportsTransactions: false,
    supportsIndexing: true,
    supportsFullTextSearch: false,
    supportsAggregation: true,
    supportsStreaming: false,
    supportsPartitioning: false,
    maxBatchSize: 1000,
    maxQueryComplexity: 100,
  };

  /**
   * Returns the capabilities of this database adapter.
   */
  public getCapabilities(): DatabaseCapabilities {
    return this.capabilities;
  }

  /**
   * Checks if the database is currently connected.
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Standard error handler that logs and returns a formatted DatabaseResult.
   */
  protected handleError<T>(error: unknown, code: string, message?: string): DatabaseResult<T> {
    const errMessage = message || (error instanceof Error ? error.message : String(error));
    logger.error(`Database adapter error [${code}]:`, errMessage);

    return {
      success: false,
      message: errMessage,
      error: {
        code,
        message: errMessage,
        details: error,
      } as DatabaseError,
    };
  }

  /**
   * Standard wrapper for database operations to ensure consistent error handling.
   */
  protected async wrap<T>(
    fn: () => Promise<T>,
    code: string,
    message?: string,
  ): Promise<DatabaseResult<T>> {
    if (!this.isConnected()) {
      return this.notConnectedError<T>();
    }
    try {
      const data = await fn();
      return { success: true, data };
    } catch (error) {
      return this.handleError<T>(error, code, message);
    }
  }

  /**
   * Utility for not-connected errors.
   */
  protected notConnectedError<T>(): DatabaseResult<T> {
    const message = "Database connection not established";
    return {
      success: false,
      message,
      error: {
        code: "NOT_CONNECTED",
        message,
      } as DatabaseError,
    };
  }

  /**
   * Utility for not-implemented methods.
   */
  protected notImplemented<T>(method: string): DatabaseResult<T> {
    const message = `Method ${method} not implemented for this adapter.`;
    logger.warn(message);
    return {
      success: false,
      message,
      error: {
        code: "NOT_IMPLEMENTED",
        message,
      } as DatabaseError,
    };
  }
}
