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

  protected metrics = {
    queryCount: 0,
    slowQueryCount: 0,
    errorCount: 0,
    lastLatency: 0,
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
   * Returns pool diagnostics and performance metrics.
   */
  public async getPoolDiagnostics(): Promise<DatabaseResult<any>> {
    return {
      success: true,
      data: {
        connected: this.connected,
        metrics: this.metrics,
        poolStats: null, // To be implemented by child classes
      },
    };
  }

  /**
   * Validates database configuration.
   */
  public validateConfig(config: any): DatabaseResult<void> {
    if (!config)
      return {
        success: false,
        message: "Configuration is missing",
        error: { code: "INVALID_CONFIG", message: "Configuration is missing" },
      };
    return { success: true, data: undefined };
  }

  /**
   * Standard error handler that logs and returns a formatted DatabaseResult.
   */
  public handleError<T>(error: unknown, code: string, message?: string): DatabaseResult<T> {
    const errMessage =
      message ||
      (error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null
          ? JSON.stringify(error)
          : String(error));
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

  public async wrap<T>(
    fn: () => Promise<T>,
    code: string,
    message?: string,
    _options?: { isWrite?: boolean; transaction?: any },
  ): Promise<DatabaseResult<T>> {
    if (!this.isConnected()) {
      return this.notConnectedError<T>();
    }
    const startTime = performance.now();
    try {
      this.metrics.queryCount++;
      const data = await fn();
      const latency = performance.now() - startTime;
      this.metrics.lastLatency = latency;

      if (latency > 500) {
        this.metrics.slowQueryCount++;
        logger.warn(`Slow database operation detected: ${code} took ${latency.toFixed(2)}ms`);
      }

      return { success: true, data, meta: { executionTime: latency } };
    } catch (error) {
      this.metrics.errorCount++;
      return this.handleError<T>(error, code, message);
    }
  }

  /**
   * Utility for not-connected errors.
   */
  public notConnectedError<T>(): DatabaseResult<T> {
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
  public notImplemented<T>(method: string): DatabaseResult<T> {
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

  /**
   * Invalidates the query cache for a specific collection/tenant.
   * Leverages the centralized cacheService to clear L1/L2 entries.
   * Surgical Field-Level Caching.
   */
  public async invalidateQueryCache(
    collection: string,
    tenantId?: any,
    options?: { ids?: any[]; tags?: string[] },
  ): Promise<void> {
    try {
      const { cacheService } = await import("./cache/cache-service");

      if (options?.tags && options.tags.length > 0) {
        // 🚀 Surgical: Clear only specific tags (e.g. field-level or document-level)
        await cacheService.clearByTags(options.tags, tenantId);
      } else {
        // Standard: Pattern matches collection:name:* for that tenant
        await cacheService.clearByPattern(`collection:${collection}:*`, tenantId);
      }

      // Also clear specific document IDs if provided
      if (options?.ids && options.ids.length > 0) {
        const idTags = options.ids.map((id) => `doc:${collection}:${id}`);
        await cacheService.clearByTags(idTags, tenantId);
      }

      // Also increment the global content version to trigger re-checks if needed
      await cacheService.set("system:content_version", Date.now(), 0, tenantId);
      logger.debug(
        `[BaseAdapter] Invalidated cache for ${collection} (Tags: ${options?.tags?.length || 0})`,
      );
    } catch (err) {
      logger.error(`[BaseAdapter] Failed to invalidate query cache: ${err}`);
    }
  }
}

/**
 * Base class for all database domain modules (Auth, CRUD, Media, etc.)
 */
export abstract class DatabaseModule<T extends BaseAdapter = BaseAdapter> {
  constructor(protected readonly adapter: T) {}

  /**
   * Proxy wrap for consistent error handling within modules
   */
  protected async wrap<R>(
    fn: () => Promise<R>,
    code: string,
    message?: string,
  ): Promise<DatabaseResult<R>> {
    return this.adapter.wrap(fn, code, message);
  }
}
