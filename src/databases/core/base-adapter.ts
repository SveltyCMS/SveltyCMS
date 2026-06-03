/**
 * @file src/databases/core/base-adapter.ts
 * @description Standard base class for all SveltyCMS database adapters.
 * Provides common state management, capability reporting, and error wrapping.
 */

import { logger } from "@utils/logger";
import { traceSpan } from "@utils/context";
import type {
  DatabaseCapabilities,
  DatabaseError,
  DatabaseResult,
  ICrudAdapter,
  IBatchAdapter,
} from "../db-interface";
import * as relationalUtils from "./relational-utils";

export type HookType = "before" | "after";
export type HookAction = "insert" | "update" | "delete" | "find";

export interface DatabaseHook {
  id: string;
  type: HookType;
  action: HookAction;
  priority?: number;
  handler: (collection: string, data: any, options?: any) => Promise<void | any>;
}

export abstract class BaseAdapter {
  public readonly utils: any = relationalUtils;
  protected hooks: DatabaseHook[] = [];
  private hookCache = new Map<string, DatabaseHook[]>();

  /**
   * 🚀  Registers a global interceptor for database operations.
   */
  public registerHook(hook: DatabaseHook): void {
    // 🛡️ Prevent duplicate registrations
    if (this.hooks.some((h) => h.id === hook.id)) return;

    this.hooks.push({ priority: 100, ...hook });
    this.hooks.sort((a, b) => (a.priority || 100) - (b.priority || 100));
    this.hookCache.clear(); // Invalidate cache
    logger.debug(`[Hooks] Registered ${hook.type}:${hook.action} for ${hook.id}`);
  }

  /**
   * Executes all hooks for a specific action and type.
   * ⚡ PERFORMANCE: Uses a pre-filtered cache to avoid O(N) filter on every call.
   */
  protected async runHooks(
    type: HookType,
    action: HookAction,
    collection: string,
    data: any,
    options?: any,
  ): Promise<any> {
    if (this.hooks.length === 0) return data;

    const cacheKey = `${type}:${action}`;
    let activeHooks = this.hookCache.get(cacheKey);

    if (activeHooks === undefined) {
      activeHooks = this.hooks.filter((h) => h.type === type && h.action === action);
      this.hookCache.set(cacheKey, activeHooks);
    }

    if (activeHooks.length === 0) return data;

    let result = data;
    for (let i = 0, len = activeHooks.length; i < len; i++) {
      const hook = activeHooks[i];
      try {
        const hookResult = await hook.handler(collection, result, options);
        if (hookResult !== undefined && type === "before") {
          result = hookResult;
        }
      } catch (error) {
        logger.error(`[Hooks] Hook '${hook.id}' failed:`, error);
      }
    }
    return result;
  }

  /**
   * Cleanup and resource release.
   */
  public destroy(): void {}

  /**
   * 🚀 AGNOSTIC CORE: Access to the CRUD module must be provided by subclasses.
   */
  public abstract get crud(): ICrudAdapter;

  /**
   * 🚀 AGNOSTIC CORE: Access to the Batch module.
   */
  public abstract get batch(): IBatchAdapter;

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
    cacheHits: 0,
    cacheMisses: 0,
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
  public handleError<T>(
    error: unknown,
    code: string,
    message?: string,
    options?: { suppressErrorLog?: boolean },
  ): DatabaseResult<T> {
    const shouldLog =
      (!options?.suppressErrorLog && process.env.BENCHMARK !== "true") ||
      process.env.BENCHMARK_DEBUG === "true";

    if (shouldLog || process.env.BENCHMARK_DEBUG === "true") {
      console.error("DEBUG ERROR STACK:", error);
    }
    if (shouldLog) {
      // 🛡️ NOISE REDUCTION: For benchmarks, don't dump the full error object as it contains massive queries/data
      const logPayload =
        process.env.BENCHMARK === "true"
          ? error instanceof Error
            ? error.message
            : typeof error === "object"
              ? (error as any).message || "Object error"
              : String(error)
          : error;
      logger.error(`[Adapter Error] Code: ${code}`, logPayload);
    }
    let errorString = String(error);
    if (error instanceof Error) {
      errorString = error.message;
    } else if (typeof error === "object" && error !== null) {
      try {
        errorString = JSON.stringify(error);
      } catch {
        errorString = "[Cyclic or unstringifiable object]";
      }
    }
    const errMessage = message || errorString;

    if (shouldLog) {
      logger.error(`Database adapter error [${code}]:`, errMessage);
    }

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
    options?: {
      isWrite?: boolean;
      transaction?: any;
      skipMeta?: boolean;
      suppressErrorLog?: boolean;
      bypassSafeQuery?: boolean;
    },
  ): Promise<DatabaseResult<T>> {
    if (!this.connected) {
      const shouldLog = !options?.suppressErrorLog && process.env.BENCHMARK !== "true";
      if (shouldLog) {
        logger.error(`[BaseAdapter] Operation ${code} rejected: Adapter is not connected.`);
      }
      return this.notConnectedError<T>();
    }
    const startTime = performance.now();
    try {
      this.metrics.queryCount++;
      const data = await traceSpan(`db:${code}`, async () => await fn());
      const latency = performance.now() - startTime;
      this.metrics.lastLatency = latency;

      if (latency > 500) {
        this.metrics.slowQueryCount++;
        logger.warn(`Slow database operation detected: ${code} took ${latency.toFixed(2)}ms`);
      }

      // 🚀 PERFORMANCE: Avoid meta object allocation if skipMeta is true (internal calls)
      if (options?.skipMeta) {
        return { success: true, data } as DatabaseResult<T>;
      }

      return { success: true, data, meta: { executionTime: latency } };
    } catch (error) {
      this.metrics.errorCount++;
      return this.handleError<T>(error, code, message, {
        suppressErrorLog: options?.suppressErrorLog,
      });
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
   * Surgical Invalidation of Query Cache.
   */
  public async invalidateQueryCache(
    collection: string,
    tenantId?: any,
    options?: { ids?: any[]; tags?: string[] },
  ): Promise<void> {
    try {
      const { cacheService } = await import("@src/databases/cache/cache-service");

      if (options?.tags && options.tags.length > 0) {
        // 🚀 Surgical: Clear only specific tags
        await cacheService.clearByTags(options.tags, tenantId);
      } else {
        // Standard: Pattern matches collection:name:* for that tenant
        await cacheService.clearByPattern(`collection:${collection}:*`, tenantId);
      }

      if (options?.ids && options.ids.length > 0) {
        const idTags = options.ids.map((id) => `doc:${collection}:${id}`);
        await cacheService.clearByTags(idTags, tenantId);
      }

      await cacheService.set("system:content_version", Date.now(), 0, tenantId);
      logger.debug(
        `[BaseAdapter] Invalidated cache for ${collection} (Tags: ${options?.tags?.length || 0})`,
      );
    } catch (err) {
      logger.error(`[BaseAdapter] Failed to invalidate query cache: ${err}`);
    }
  }

  /**
   * 🚀 AGNOSTIC CORE: High-performance data retrieval for a single collection.
   * Shared implementation across all database adapters.
   */
  public async getCollectionData(
    collectionName: string,
    options?: {
      limit?: number;
      offset?: number;
      fields?: string[];
      sort?: { field: string; direction: "asc" | "desc" };
      filter?: Record<string, unknown>;
      includeMetadata?: boolean;
    },
  ): Promise<
    DatabaseResult<{
      data: unknown[];
      metadata?: { totalCount: number; schema?: unknown; indexes?: string[] };
    }>
  > {
    return this.wrap(async () => {
      const filter = options?.filter || {};
      const countRes = await this.crud.count(collectionName, filter as any, {
        bypassTenantCheck: (options as any)?.bypassTenantCheck,
      });
      if (!countRes.success) throw new Error(countRes.message);

      const dataRes = await this.crud.findMany(collectionName, filter as any, {
        limit: options?.limit,
        offset: options?.offset,
        fields: options?.fields as any,
        sort: options?.sort as any,
        bypassTenantCheck: (options as any)?.bypassTenantCheck,
      });
      if (!dataRes.success) throw new Error(dataRes.message);

      return {
        data: dataRes.data as unknown[],
        metadata: options?.includeMetadata
          ? {
              totalCount: countRes.data,
            }
          : undefined,
      };
    }, "GET_COLLECTION_DATA_FAILED");
  }

  /**
   * 🚀 AGNOSTIC CORE: Batch data retrieval across multiple collections.
   */
  public async getMultipleCollectionData(
    collectionNames: string[],
    options?: { limit?: number; fields?: string[] },
  ): Promise<DatabaseResult<Record<string, unknown[]>>> {
    return this.wrap(async () => {
      const results: Record<string, unknown[]> = {};
      for (const name of collectionNames) {
        const res = await this.getCollectionData(name, {
          limit: options?.limit,
          fields: options?.fields,
        });
        if (res.success) {
          results[name] = res.data.data;
        }
      }
      return results;
    }, "GET_MULTIPLE_COLLECTION_DATA_FAILED");
  }
}

/**
 * Base class for all database domain modules (Auth, CRUD, Media, etc.)
 */
export abstract class DatabaseModule<T extends BaseAdapter = BaseAdapter> {
  constructor(protected readonly adapter: T) {}

  /**
   * 🚀 AGNOSTIC CORE: Safe access to the underlying database instance.
   * Throws a descriptive error if the adapter is not fully initialized.
   */
  protected get db() {
    const db = (this.adapter as any).db;
    if (!db && this.adapter.isConnected()) {
      // This should only happen if the adapter claims to be connected but has no db instance
      throw new Error(
        `[${this.constructor.name}] Database instance (db) is missing on connected adapter ${this.adapter.constructor.name}.`,
      );
    }
    return db;
  }

  /**
   * Proxy wrap for consistent error handling within modules
   */
  protected async wrap<R>(
    fn: () => Promise<R>,
    code: string,
    message?: string,
    options?: {
      isWrite?: boolean;
      transaction?: any;
      skipMeta?: boolean;
      suppressErrorLog?: boolean;
      bypassSafeQuery?: boolean;
    },
  ): Promise<DatabaseResult<R>> {
    return this.adapter.wrap(fn, code, message, options);
  }
}
