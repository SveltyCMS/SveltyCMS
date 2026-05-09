/**
 * @file src/databases/sqlite/base-sql-adapter.ts
 * @description
 * Unified base class for all SQL-based database adapters (SQLite, MariaDB, PostgreSQL).
 * Provides shared logic for query mapping, dynamic table resolution, and error handling.
 * This ensures feature parity and consistent behavior across all SQL engines.
 */

import { logger } from "@src/utils/logger";
import {
  and,
  or,
  type Column,
  eq,
  inArray,
  isNull,
  ne,
  gt,
  gte,
  lt,
  lte,
  sql,
  type SQL,
  count as drizzleCount,
} from "drizzle-orm";
import { BaseAdapter } from "../core/base-adapter";
import type {
  BaseEntity,
  BaseQueryOptions,
  DatabaseId,
  DatabaseResult,
  EntityCreate,
  EntityUpdate,
  FindOptions,
  ICrudAdapter,
  QueryFilter,
  DatabaseError,
} from "../db-interface";
import { generateUUID } from "@utils/native-utils";
import { safeQuery } from "@src/utils/security/safe-query";
import { slowQueryCollector } from "@src/services/observability/slow-query-collector";
import * as utils from "../core/relational-utils";
import { queryTranslator, type LogicalGroup, type QueryCondition } from "../core/query-ir";

export abstract class BaseSqlAdapter extends BaseAdapter implements ICrudAdapter {
  public abstract readonly type: string;
  protected preparedStatements = new Map<string, any>();
  protected readonly MAX_PREPARED_STATEMENTS = 500;

  public collectionRegistry = new Map<string, any>();
  public dynamicTables = new Map<string, any>();

  /**
   * 🚀 BACKWARD COMPATIBILITY: Returns 'this' for .crud calls.
   * Eliminates the need for a separate CRUD module instance.
   */
  public override get crud(): ICrudAdapter {
    return this;
  }

  /**
   * 🚀 AGNOSTIC CORE: All SQL adapters MUST expose a Drizzle database instance.
   */
  public abstract get db(): any;

  /**
   * Translates a raw MongoDB-style query into a Drizzle SQL condition.
   * 🚀 We now use the Unified Query IR as an intermediate step.
   */
  public mapQuery(table: Record<string, unknown>, query: Record<string, unknown>): SQL | undefined {
    if (!query || Object.keys(query).length === 0) return undefined;

    // 1. Translate to IR
    const ir = queryTranslator.translate("temp", query);

    // 2. Map IR to SQL
    return this.mapIRToSQL(table, ir.filter);
  }

  /**
   * Recursively maps the Unified Query IR LogicalGroup to Drizzle SQL.
   */
  private mapIRToSQL(table: any, group: LogicalGroup): SQL | undefined {
    const conditions: SQL[] = [];

    for (const item of group.conditions) {
      if ("operator" in item && "conditions" in item) {
        // Nested logical group
        const sub = this.mapIRToSQL(table, item as LogicalGroup);
        if (sub) {
          if (item.operator === "$or") conditions.push(or(sub)!);
          else if (item.operator === "$and") conditions.push(and(sub)!);
          else if (item.operator === "$not") conditions.push(sql`NOT (${sub})`);
        }
      } else {
        // Query condition
        const cond = item as QueryCondition;
        const column = table[cond.field] as Column;
        const value = cond.value;

        if (column) {
          switch (cond.operator) {
            case "$eq":
              conditions.push(value === null ? isNull(column) : eq(column, value));
              break;
            case "$ne":
              conditions.push(ne(column, value));
              break;
            case "$gt":
              conditions.push(gt(column, value));
              break;
            case "$gte":
              conditions.push(gte(column, value));
              break;
            case "$lt":
              conditions.push(lt(column, value));
              break;
            case "$lte":
              conditions.push(lte(column, value));
              break;
            case "$in":
              conditions.push(inArray(column, value));
              break;
            case "$nin":
              conditions.push(sql`${column} NOT IN ${value}`);
              break;
            case "$contains":
            case "$regex": // 🚀 ADDED: Map regex to LIKE for basic search compatibility
              conditions.push(sql`${column} LIKE ${"%" + value + "%"}`);
              break;
            case "$like":
              conditions.push(sql`${column} LIKE ${value}`);
              break;
            case "$exists":
              conditions.push(value ? sql`${column} IS NOT NULL` : isNull(column));
              break;
          }
        } else if ("data" in table) {
          // Fallback to JSON extraction
          const jsonField = sql`json_extract(data, '$.' || ${cond.field})`;
          switch (cond.operator) {
            case "$eq":
              conditions.push(sql`${jsonField} = ${value}`);
              break;
            case "$ne":
              conditions.push(sql`${jsonField} != ${value}`);
              break;
            case "$gt":
              conditions.push(sql`${jsonField} > ${value}`);
              break;
            case "$contains":
            case "$regex": // 🚀 ADDED: Map regex to LIKE for JSON fallback
              conditions.push(sql`${jsonField} LIKE ${"%" + value + "%"}`);
              break;
            case "$in":
              conditions.push(
                sql`${jsonField} IN (${sql.join(
                  value.map((v: any) => sql`${v}`),
                  sql`, `,
                )})`,
              );
              break;
          }
        }
      }
    }

    if (conditions.length === 0) return undefined;
    return group.operator === "$or" ? or(...conditions) : and(...conditions);
  }

  /**
   * Transaction wrapper for SQL adapters.
   */
  public abstract transaction<T>(
    fn: (transaction: any) => Promise<DatabaseResult<T>>,
    options?: {
      timeout?: number;
      isolationLevel?: string;
    },
  ): Promise<DatabaseResult<T>>;

  /**
   * Standardized SQL error handler.
   */
  public handleError<T>(
    error: unknown,
    code: string,
    customMessage?: string,
    options?: { suppressErrorLog?: boolean },
  ): DatabaseResult<T> {
    let message = customMessage;
    if (!message) {
      message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null
            ? JSON.stringify(error)
            : String(error);
    }

    // 🛡️ SUPPRESSION: Ignore "no such table" errors for redirects/404_logs during warmup/cache warming.
    // These are expected if the plugin hasn't finished provisioning yet.
    const isNoSuchTable = message.includes("no such table");
    const isTransientCollection =
      message.includes("redirects") ||
      message.includes("404_logs") ||
      message.includes("bench_") ||
      message.includes("benchmark_");

    const shouldLog = !options?.suppressErrorLog && process.env.BENCHMARK !== "true";

    if (isNoSuchTable && isTransientCollection) {
      if (shouldLog) logger.debug(`[SQL Adapter] Expected transient error [${code}]: ${message}`);
    } else if (
      shouldLog ||
      process.env.BENCHMARK_DEBUG === "true" ||
      process.env.SVELTY_AUDIT_ACTIVE
    ) {
      if (
        !options?.suppressErrorLog &&
        (process.env.BENCHMARK_DEBUG === "true" || process.env.SVELTY_AUDIT_ACTIVE)
      ) {
        const detailedError =
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
                ...(error as any),
              }
            : error;
        logger.error(
          `[SQL Adapter] Error [${code}]:`,
          typeof detailedError === "object"
            ? JSON.stringify(detailedError, null, 2)
            : detailedError,
        );
      } else if (shouldLog) {
        logger.error(`[SQL Adapter] Error [${code}]:`, message);
      }
    }

    return {
      success: false,
      message,
      error: {
        code,
        message,
        details: error,
      } as DatabaseError,
    };
  }

  /**
   * Common logic for snake_case to camelCase conversion.
   */
  protected snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * 🚀 RAW ACCESS: Exposes the underlying client and execute method for specialized tasks.
   * This satisfies requirements for direct SQL execution in setup/migration scripts.
   */
  public abstract get raw(): {
    execute: (sql: string, params?: any[]) => Promise<any>;
    client: any;
  };

  /**
   * 🚀 FAST PATH: Identifies simple ID/Tenant lookups.
   * Optimized to avoid Object.keys() allocation and heap churn.
   */
  protected isLookupQuery(query: any): boolean {
    if (!query || typeof query !== "object") return false;
    let count = 0;
    let hasIdOrToken = false;

    for (const key in query) {
      if (!Object.prototype.hasOwnProperty.call(query, key)) continue;
      count++;
      if (count > 2) return false; // Too many fields for a simple fast-path lookup
      if (key === "_id" || key === "token") hasIdOrToken = true;
      else if (key !== "tenantId") return false; // Non-lookup field present
    }

    return hasIdOrToken && count > 0;
  }

  /**
   * Helper to get the database instance or transaction.
   */
  protected getDrizzleInstance(options?: { transaction?: any; tx?: any }) {
    const tx = options?.transaction || options?.tx;
    if (tx) return tx.db || tx;
    return this.db;
  }

  async findOne<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T | null>> {
    const startTime = performance.now();

    // 🚀 ADAPTIVE CACHE: Check if caching is enabled for this query
    const cacheOptions = options.cache;
    if (cacheOptions?.enabled) {
      const { cacheService } = await import("@src/databases/cache/cache-service");
      const cacheKey =
        cacheOptions.key ||
        `sql:${collection}:findOne:${JSON.stringify(query)}:${options.tenantId || "global"}`;
      const cached = await cacheService.get<T>(cacheKey, options.tenantId);
      if (cached) {
        return {
          success: true,
          data: cached,
          meta: { cached: true, executionTime: performance.now() - startTime },
        };
      }
    }
    // 🚀 ULTRA FAST PATH: Bypass wrap, performance.now, and abstraction layers for ID lookups.
    const isLookup = this.isLookupQuery(query);
    if (
      isLookup &&
      options.bypassSafeQuery !== false &&
      collection !== "tokens" &&
      !options.includeDeleted &&
      !options.transaction &&
      !(options as any).tx
    ) {
      try {
        const queryKeys = (query as any)._id ? "_id" : "token";
        const psKey = `findOne:${collection}:${queryKeys}:${options.tenantId === undefined ? "all" : "tenant"}`;

        let entry = this.preparedStatements.get(psKey);
        if (!entry) {
          const table = this.getTable(collection);
          const idCol = (query as any)._id
            ? (table as any)._id || (table as any).id
            : (table as any).token;
          const tenantCol = (table as any).tenantId;
          const isDeletedCol = (table as any).isDeleted;

          const whereConditions = [eq(idCol, sql.placeholder("id"))];
          if (options.tenantId !== undefined) {
            whereConditions.push(
              options.tenantId === null
                ? isNull(tenantCol)
                : eq(tenantCol, sql.placeholder("tenantId")),
            );
          }
          if (isDeletedCol !== undefined) whereConditions.push(eq(isDeletedCol, false));

          const ps = this.db
            .select()
            .from(table as any)
            .where(and(...whereConditions))
            .limit(1)
            .prepare();

          // 🚀 METADATA CACHE: Pre-calculate everything for zero-overhead execution
          entry = {
            ps,
            hasDynamicData: (table as any).data !== undefined || collection === "mediaItems",
          };

          if (this.preparedStatements.size < this.MAX_PREPARED_STATEMENTS) {
            this.preparedStatements.set(psKey, entry);
          }
        }

        const params: any = { id: (query as any)._id || (query as any).token };
        if (options.tenantId !== undefined && options.tenantId !== null) {
          params.tenantId = options.tenantId;
        }

        const results = await entry.ps.execute(params);
        if (results.length === 0) return { success: true, data: null };

        return {
          success: true,
          data: entry.hasDynamicData
            ? (utils.convertDatesToISO(results[0] as Record<string, unknown>) as T)
            : (results[0] as T),
        };
      } catch {
        // Fallback to standard path on any error
      }
    }

    // Standard Path
    const res = await this.wrap(
      async () => {
        const table = this.getTable(collection);
        const hasIsDeleted = (table as any).isDeleted !== undefined;
        const secureQuery = safeQuery(query, options.tenantId, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted || !hasIsDeleted,
          bypassSafeQuery: options.bypassSafeQuery, // 🚀 Propagate bypass
        });
        const where = this.mapQuery(table, secureQuery as Record<string, unknown>) as any;
        const finalWhere =
          where === undefined && Object.keys(secureQuery).length > 0 ? sql`1 = 0` : where;

        const results = await this.getDrizzleInstance(options)
          .select()
          .from(table as any)
          .where(finalWhere)
          .limit(1);

        return results.length === 0
          ? null
          : (utils.convertDatesToISO(results[0] as Record<string, unknown>) as T);
      },
      "CRUD_FIND_ONE_FAILED",
      undefined,
      { transaction: options?.transaction },
    );

    if (res.success && !options.skipMeta) {
      const execTime = performance.now() - startTime;
      res.meta = { executionTime: execTime };
      slowQueryCollector.recordQuery(collection, query, execTime, options.tenantId);

      // 🚀 ADAPTIVE CACHE: Set result in cache if enabled
      if (cacheOptions?.enabled && res.data) {
        const { cacheService } = await import("@src/databases/cache/cache-service");
        const cacheKey =
          cacheOptions.key ||
          `sql:${collection}:findOne:${JSON.stringify(query)}:${options.tenantId || "global"}`;
        await cacheService.set(
          cacheKey,
          res.data,
          cacheOptions.ttl || 300,
          options.tenantId,
          undefined,
          [`collection:${collection}`, ...(cacheOptions.tags || [])],
        );
      }
    }
    return res;
  }

  async findMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T> = {},
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T[]>> {
    const startTime = performance.now();

    // 🚀 ADAPTIVE CACHE: Check if caching is enabled
    const cacheOptions = options.cache;
    if (cacheOptions?.enabled) {
      const { cacheService } = await import("@src/databases/cache/cache-service");
      const cacheKey =
        cacheOptions.key ||
        `sql:${collection}:findMany:${JSON.stringify(query)}:${options.limit || "all"}:${options.offset || 0}:${options.tenantId || "global"}`;
      const cached = await cacheService.get<T[]>(cacheKey, options.tenantId);
      if (cached) {
        return {
          success: true,
          data: cached,
          meta: { cached: true, executionTime: performance.now() - startTime },
        };
      }
    }
    const res = await this.wrap(
      async () => {
        const table = this.getTable(collection);
        const hasIsDeleted = (table as any).isDeleted !== undefined;
        const secureQuery = safeQuery(query, options.tenantId, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted || !hasIsDeleted,
          bypassSafeQuery: options.bypassSafeQuery, // 🚀 Propagate bypass
        });
        const where = this.mapQuery(table, secureQuery as Record<string, unknown>) as any;
        const finalWhere =
          where === undefined && Object.keys(secureQuery).length > 0 ? sql`1 = 0` : where;

        let q = this.getDrizzleInstance(options)
          .select()
          .from(table as any)
          .where(finalWhere);
        if (options.limit) q = q.limit(options.limit);
        if (options.offset) q = q.offset(options.offset);

        const results = await q;
        return utils.convertArrayDatesToISO(results as Record<string, unknown>[]) as T[];
      },
      "CRUD_FIND_MANY_FAILED",
      undefined,
      { transaction: options?.transaction },
    );

    if (res.success && !options.skipMeta) {
      const execTime = performance.now() - startTime;
      res.meta = { executionTime: execTime };
      slowQueryCollector.recordQuery(collection, query, execTime, options.tenantId);

      // 🚀 ADAPTIVE CACHE: Set result in cache if enabled
      if (cacheOptions?.enabled && res.data) {
        const { cacheService } = await import("@src/databases/cache/cache-service");
        const cacheKey =
          cacheOptions.key ||
          `sql:${collection}:findMany:${JSON.stringify(query)}:${options.limit || "all"}:${options.offset || 0}:${options.tenantId || "global"}`;
        await cacheService.set(
          cacheKey,
          res.data,
          cacheOptions.ttl || 300,
          options.tenantId,
          undefined,
          [`collection:${collection}`, ...(cacheOptions.tags || [])],
        );
      }
    }
    return res;
  }

  async insert<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>,
    options: {
      tenantId?: DatabaseId;
      tx?: any;
      transaction?: any;
      bypassTenantCheck?: boolean;
      suppressErrorLog?: boolean;
    } = {},
  ): Promise<DatabaseResult<T>> {
    const startTime = performance.now();
    const res = await this.wrap(
      async () => {
        const table = this.getTable(collection);
        const id = (data as any)._id || generateUUID();
        const now = new Date();
        const values = this.prepareValues(table, data, id, now, options);

        // 🚀  Use .returning() for single-roundtrip inserts where supported (SQLite/Postgres)
        const db = this.getDrizzleInstance(options);
        const q = db.insert(table as any).values(values);

        if (this.type === "sqlite" || this.type === "postgresql") {
          const [inserted] = await (q as any).returning();
          if (inserted) {
            return utils.convertDatesToISO(inserted as Record<string, unknown>) as T;
          }
        }

        // Fallback for MariaDB or failed returning
        await q;

        const result = await this.findOne(
          collection,
          { _id: id } as any,
          {
            ...options,
            skipMeta: true,
            bypassSafeQuery: true, // Use fast path for verification lookup
          } as any,
        );

        if (!result.success || !result.data) {
          throw new Error(
            `Failed to retrieve inserted record: ${(result as any).message || "Not found"}`,
          );
        }
        return result.data as T;
      },
      "CRUD_INSERT_FAILED",
      undefined,
      {
        isWrite: true,
        transaction: options?.transaction,
        suppressErrorLog: options?.suppressErrorLog,
      },
    );

    if (res.success) {
      res.meta = { executionTime: performance.now() - startTime };

      // 🚀 ADAPTIVE INVALIDATION: Invalidate the entire collection on write
      import("@src/databases/cache/cache-service")
        .then(({ cacheService }) => {
          cacheService.clearByTags([`collection:${collection}`], options.tenantId || "global");
        })
        .catch(() => {});
    }
    return res;
  }

  async update<T extends BaseEntity>(
    collection: string,
    id: DatabaseId,
    data: EntityUpdate<T>,
    options: {
      tenantId?: DatabaseId;
      tx?: any;
      transaction?: any;
      bypassTenantCheck?: boolean;
    } = {},
  ): Promise<DatabaseResult<T>> {
    const startTime = performance.now();
    const res = await this.wrap(
      async () => {
        const table = this.getTable(collection);
        const now = new Date();
        const conditions = [eq((table as any)._id, id as string)];

        if (options.tenantId !== undefined) {
          conditions.push(
            options.tenantId === null
              ? isNull((table as any).tenantId)
              : eq((table as any).tenantId, options.tenantId as string),
          );
        }

        const values = this.prepareValues(table, data, id, now, options);
        delete (values as any)._id;
        delete (values as any).createdAt;

        await this.getDrizzleInstance(options)
          .update(table as any)
          .set(values)
          .where(and(...conditions));

        const result = await this.findOne(
          collection,
          { _id: id } as any,
          {
            ...options,
            skipMeta: true,
            bypassSafeQuery: true, // Use fast path
          } as any,
        );
        if (!result.success || !result.data) {
          throw new Error(
            `Failed to retrieve updated record: ${(result as any).message || "Not found"}`,
          );
        }
        return result.data as T;
      },
      "CRUD_UPDATE_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );

    if (res.success) {
      res.meta = { executionTime: performance.now() - startTime };

      // 🚀 ADAPTIVE INVALIDATION: Invalidate the entire collection on write
      import("@src/databases/cache/cache-service")
        .then(({ cacheService }) => {
          cacheService.clearByTags([`collection:${collection}`], options.tenantId || "global");
        })
        .catch(() => {});
    }
    return res;
  }

  async delete(
    collection: string,
    id: DatabaseId,
    options: { tenantId?: DatabaseId; bypassTenantCheck?: boolean; tx?: any } = {},
  ): Promise<DatabaseResult<void>> {
    const startTime = performance.now();
    const res = await this.wrap(
      async () => {
        const table = this.getTable(collection);
        const conditions = [eq((table as any)._id, id as string)];
        if (options.tenantId !== undefined) {
          conditions.push(
            options.tenantId === null
              ? isNull((table as any).tenantId)
              : eq((table as any).tenantId, options.tenantId as string),
          );
        }
        await this.getDrizzleInstance(options)
          .delete(table as any)
          .where(and(...conditions));
      },
      "CRUD_DELETE_FAILED",
      undefined,
      { isWrite: true, transaction: (options as any)?.transaction || (options as any)?.tx },
    );
    if (res.success) {
      res.meta = { executionTime: performance.now() - startTime };

      // 🚀 ADAPTIVE INVALIDATION: Invalidate the entire collection on write
      import("@src/databases/cache/cache-service")
        .then(({ cacheService }) => {
          cacheService.clearByTags([`collection:${collection}`], options.tenantId || "global");
        })
        .catch(() => {});
    }
    return res;
  }

  async count<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T> = {},
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<number>> {
    const startTime = performance.now();
    const res = await this.wrap(
      async () => {
        const table = this.getTable(collection);
        const hasIsDeleted = (table as any).isDeleted !== undefined;
        const secureQuery = safeQuery(query, options.tenantId, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted || !hasIsDeleted,
          bypassSafeQuery: options.bypassSafeQuery, // 🚀 Propagate bypass
        });
        const where = this.mapQuery(table, secureQuery as Record<string, unknown>) as any;
        const finalWhere =
          where === undefined && Object.keys(secureQuery).length > 0 ? sql`1 = 0` : where;

        const [resCount] = await this.getDrizzleInstance(options)
          .select({ count: drizzleCount() })
          .from(table as any)
          .where(finalWhere);
        return Number((resCount as any).count);
      },
      "CRUD_COUNT_FAILED",
      undefined,
      { transaction: options?.transaction },
    );
    if (res.success) {
      const execTime = performance.now() - startTime;
      res.meta = { executionTime: execTime };
      slowQueryCollector.recordQuery(collection, query, execTime, options.tenantId);
    }
    return res;
  }

  async exists<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<boolean>> {
    const res = await this.count(collection, query, { ...options, skipMeta: true } as any);
    if (!res.success) return { success: false, error: res.error, message: res.message };
    return { success: true, data: (res.data ?? 0) > 0 };
  }

  private static FIXED_COLUMNS = new Set([
    "_id",
    "tenantId",
    "status",
    "isDeleted",
    "createdAt",
    "updatedAt",
    "nodeType",
    "path",
    "parentId",
    "order",
  ]);

  protected prepareValues(table: any, data: any, id: DatabaseId, now: Date, options: any) {
    const isInsert = !!id;
    const values: any = {
      updatedAt: now,
    };

    if (isInsert) {
      values._id = id.toString();
      if (!data.updatedAt) values.createdAt = now;
    }

    // 🚀 Only set tenantId if explicitly provided in options or if it's a new record
    if (options.tenantId !== undefined) {
      values.tenantId = options.tenantId;
    } else if (isInsert) {
      values.tenantId = null;
    }

    if (table.data) {
      const dynamicData: any = {};
      for (const k in data) {
        if (!Object.hasOwn(data, k)) continue;
        if (!BaseSqlAdapter.FIXED_COLUMNS.has(k)) dynamicData[k] = data[k];
        else values[k] = data[k];
      }
      values.data = dynamicData;
    } else {
      for (const k in data) {
        if (!Object.hasOwn(data, k)) continue;
        values[k] = data[k];
      }
    }

    return utils.convertISOToDates(values as Record<string, unknown>);
  }

  async findByIds<T extends BaseEntity>(
    collection: string,
    ids: DatabaseId[],
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T[]>> {
    return this.findMany(collection, { _id: { $in: ids } } as any, options);
  }

  async find<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T[]>> {
    return this.findMany(collection, query, options);
  }

  async aggregate<R = unknown>(
    collection: string,
    pipeline: any[],
    options: { transaction?: any } = {},
  ): Promise<DatabaseResult<R[]>> {
    return this.wrap(async () => {
      const matchStage = pipeline.find((p) => p.$match)?.$match;
      const countStage = pipeline.find((p) => p.$count);

      if (countStage) {
        const countRes = await this.count(collection, matchStage || {}, {
          ...options,
          skipMeta: true,
        } as any);
        if (!countRes.success) throw new Error(countRes.message);
        return [{ [countStage.$count]: countRes.data }] as any;
      }

      // 🚀 AGNOSTIC GROUP-BY (For Predictive Cache & Analytics)
      const groupStage = pipeline.find((p) => p.$group)?.$group;
      if (groupStage && groupStage._id) {
        const table = this.getTable(collection);
        const groupByField = groupStage._id.startsWith("$")
          ? groupStage._id.substring(1)
          : groupStage._id;
        const column = (table as any)[groupByField];

        if (column) {
          const where = matchStage ? this.mapQuery(table, matchStage) : undefined;
          const limitStage = pipeline.find((p) => p.$limit)?.$limit;
          const sortStage = pipeline.find((p) => p.$sort)?.$sort;

          // Build Drizzle Query
          const selectFields: any = { _id: column };

          // Handle simple count(*) group-by
          if (groupStage.count?.$sum === 1 || groupStage.total?.$sum === 1) {
            const countKey = groupStage.count ? "count" : "total";
            selectFields[countKey] = drizzleCount();
          }

          let q = this.getDrizzleInstance(options)
            .select(selectFields)
            .from(table as any)
            .where(where)
            .groupBy(column);

          // Handle Sorting
          if (sortStage) {
            const sortEntries = Object.entries(sortStage);
            if (sortEntries.length > 0) {
              const [sortField, sortDir] = sortEntries[0];
              if (sortField === "count" || sortField === "total") {
                q = q.orderBy(sortDir === -1 ? sql`count(*) DESC` : sql`count(*) ASC`);
              } else {
                const sortCol = (table as any)[sortField];
                if (sortCol) {
                  q = q.orderBy(sortDir === -1 ? sql`${sortCol} DESC` : sql`${sortCol} ASC`);
                }
              }
            }
          }

          if (limitStage) q = q.limit(limitStage);

          const results = await q;
          return results as unknown as R[];
        }
      }

      return this.notImplemented(`aggregate for ${collection}`);
    }, "CRUD_AGGREGATE_FAILED");
  }

  async restore(
    collection: string,
    _id: DatabaseId,
    _options?: BaseQueryOptions,
  ): Promise<DatabaseResult<void>> {
    return this.notImplemented(`crud.restore for ${collection}`);
  }

  async insertMany<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>[],
    options: { tenantId?: DatabaseId; tx?: any; transaction?: any } = {},
  ): Promise<DatabaseResult<T[]>> {
    const startTime = performance.now();
    const execute = async (tx: any): Promise<T[]> => {
      const table = this.getTable(collection);
      const now = new Date();

      // 🚀  Use atomic batch insert instead of for-loop
      const valuesArray = data.map((item) => {
        const id = (item as any)._id || generateUUID();
        return this.prepareValues(table, item, id, now, options);
      });

      const db = tx.db || tx;
      const q = db.insert(table as any).values(valuesArray);

      if (this.type === "sqlite" || this.type === "postgresql") {
        const insertedRows = await (q as any).returning();
        if (insertedRows && insertedRows.length > 0) {
          return utils.convertArrayDatesToISO(insertedRows as Record<string, unknown>[]) as T[];
        }
      }

      // Fallback for MariaDB or missing returning
      await q;

      // Map local data if returning is not supported
      return valuesArray.map((v) => utils.convertDatesToISO(v) as T);
    };

    const tx = options.transaction || options.tx;
    const res = tx
      ? await this.wrap(() => execute(tx), "CRUD_INSERT_MANY_FAILED", undefined, {
          isWrite: true,
          transaction: tx,
        })
      : await this.transaction(async (t) => {
          const data = await execute(t);
          return { success: true, data };
        });

    if (res.success) res.meta = { executionTime: performance.now() - startTime };
    return res;
  }

  async updateMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityUpdate<T>,
    options: { tenantId?: DatabaseId; tx?: any; transaction?: any } = {},
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    const startTime = performance.now();
    const res = await this.wrap(
      async () => {
        const table = this.getTable(collection);
        const now = new Date();
        const hasIsDeleted = (table as any).isDeleted !== undefined;
        const secureQuery = safeQuery(query, options.tenantId, {
          includeDeleted: !hasIsDeleted,
        });
        const where = this.mapQuery(table, secureQuery as Record<string, unknown>) as any;
        const values = this.prepareValues(table, data, "" as any, now, options);
        delete (values as any)._id;
        delete (values as any).createdAt;

        const result = await this.getDrizzleInstance(options)
          .update(table as any)
          .set(values)
          .where(where);

        return { modifiedCount: (result as any)?.changes ?? (result as any)?.rowsAffected ?? 0 };
      },
      "CRUD_UPDATE_MANY_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );

    if (res.success) res.meta = { executionTime: performance.now() - startTime };
    return res;
  }

  async deleteMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: { tenantId?: DatabaseId; tx?: any; transaction?: any } = {},
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    const startTime = performance.now();
    const res = await this.wrap(
      async () => {
        const table = this.getTable(collection);
        const hasIsDeleted = (table as any).isDeleted !== undefined;
        const secureQuery = safeQuery(query, options.tenantId, {
          includeDeleted: !hasIsDeleted,
        });
        const where = this.mapQuery(table, secureQuery as Record<string, unknown>) as any;

        const result = await this.getDrizzleInstance(options)
          .delete(table as any)
          .where(where);
        return { deletedCount: (result as any)?.changes ?? (result as any)?.rowsAffected ?? 0 };
      },
      "CRUD_DELETE_MANY_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );
    if (res.success) res.meta = { executionTime: performance.now() - startTime };
    return res;
  }

  async upsert<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityCreate<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>> {
    const runInTx = async (tx: any) => {
      const existingRes = await this.findOne(collection, query, {
        ...(options as any),
        transaction: tx,
        skipMeta: true,
      });

      if (existingRes.success && existingRes.data) {
        return (await this.update(collection, existingRes.data._id as DatabaseId, data as any, {
          ...(options as any),
          transaction: tx,
        })) as DatabaseResult<T>;
      } else {
        const insertRes = (await this.insert(collection, data, {
          ...(options as any),
          transaction: tx,
          suppressErrorLog: true,
        })) as DatabaseResult<T>;

        if (
          !insertRes.success &&
          insertRes.error &&
          (insertRes.error.message?.includes("UNIQUE constraint failed") ||
            insertRes.error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
            insertRes.error.message?.includes("Duplicate"))
        ) {
          // Race condition occurred: another concurrent worker inserted it.
          // Try to get it again and update it.
          const reCheck = await this.findOne(collection, query, {
            ...(options as any),
            transaction: tx,
            skipMeta: true,
          });
          if (reCheck.success && reCheck.data) {
            return (await this.update(collection, reCheck.data._id as DatabaseId, data as any, {
              ...(options as any),
              transaction: tx,
            })) as DatabaseResult<T>;
          }
        }
        return insertRes;
      }
    };

    if ((options as any)?.transaction) return runInTx((options as any).transaction);
    return this.transaction(runInTx);
  }

  async upsertMany<T extends BaseEntity>(
    collection: string,
    items: Array<{ query: QueryFilter<T>; data: EntityCreate<T> }>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T[] | { upsertedCount: number; modifiedCount: number }>> {
    const startTime = performance.now();
    const res = await this.wrap(
      async () => {
        const results: T[] = [];
        for (const item of items) {
          const res = await this.upsert(collection, item.query, item.data, options);
          if (!res.success) throw new Error(res.message);
          results.push(res.data as T);
        }
        return results;
      },
      "CRUD_UPSERT_MANY_FAILED",
      undefined,
      { isWrite: true, transaction: options?.transaction },
    );
    if (res.success) res.meta = { executionTime: performance.now() - startTime };
    return res;
  }

  public abstract destroy(): void;

  /**
   * 🚀 AGNOSTIC CORE: Resolves a collection name to a Drizzle table object.
   * Shared by all SQL adapters.
   */
  public getTable(collection: string): Record<string, unknown> {
    // 1. Try Dynamic Table first (Matches collection_ prefix, bench_ prefix, or cached user content)
    const existingDynamic = this.dynamicTables.get(collection);
    if (existingDynamic) return existingDynamic;

    // 2. Try Registry (Static core tables)
    const table = this.collectionRegistry.get(collection);
    if (table && !(table as any).findOne && !(table as any).aggregate) return table;

    // 3. Try Aliased Table (System aliases)
    const aliased = this.getAliasedTable(collection);
    if (aliased) {
      this.collectionRegistry.set(collection, aliased);
      return aliased;
    }

    // 4. Fallback: Create dynamic definition
    // 🚀 HARDENING: Try collection_ prefix if not already present and not a system table
    let tableName = collection;
    if (
      !collection.startsWith("collection_") &&
      !collection.startsWith("system_") &&
      !collection.startsWith("bench_")
    ) {
      // We only add the prefix if it's likely a user collection
      tableName = `collection_${collection}`;
    }

    const dynamicTable = (this as any).createDynamicTableDefinition(tableName);
    logger.info(
      `[SQL Adapter] getTable("${collection}") -> Resolved to DynamicTable("${tableName}")`,
      {
        columns: Object.keys(dynamicTable),
      },
    );
    this.dynamicTables.set(collection, dynamicTable);
    return dynamicTable;
  }

  /**
   * Abstract factory for dynamic table definitions.
   * Must be implemented by specific adapters using pgTable, mysqlTable, or sqliteTable.
   */
  public abstract createDynamicTableDefinition(tableName: string): any;

  protected static TABLE_ALIASES: Record<string, string> = {
    media: "mediaItems",
    MediaItem: "mediaItems",
    collections: "contentNodes",
    content_nodes: "contentNodes",
    preferences: "systemPreferences",
    system_preferences: "systemPreferences",
    tokens: "authTokens",
    auth_tokens: "authTokens",
    sessions: "authSessions",
    auth_sessions: "authSessions",
    users: "authUsers",
    auth_users: "authUsers",
    system_users: "authUsers",
    redirects: "collection_redirects",
    system_content_structure: "contentNodes",
    roles: "roles",
    system_roles: "roles",
    audit_logs: "auditLogs",
    system_audit_logs: "auditLogs",
    website_tokens: "websiteTokens",
    plugin_pagespeed_results: "pluginPagespeedResults",
    plugin_states: "pluginStates",
    plugin_migrations: "pluginMigrations",
    tenants: "tenants",
    "404_logs": "fourOhFourLogs",
    workflow_definitions: "workflowDefinitions",
    workflow_instances: "workflowInstances",
    redirects_mv: "redirectsMV",
  };

  /**
   * Resolves a collection name to its Drizzle schema name using aliases.
   */
  protected getAliasedTable(collection: string): Record<string, unknown> | null {
    const schema = (this as any).schema;
    if (!schema) return null;

    // 🚀 Handle both flat and nested schema objects
    const schemaAny = (schema.schema || schema) as unknown as Record<
      string,
      Record<string, unknown>
    >;

    // Strip prefix to handle variations like 'collection_system_users'
    const cleanName = collection.startsWith("collection_") ? collection.slice(11) : collection;

    if (schemaAny[collection]) return schemaAny[collection];
    if (schemaAny[cleanName]) return schemaAny[cleanName];

    const camelKey = this.snakeToCamel(cleanName);
    if (schemaAny[camelKey]) {
      return schemaAny[camelKey];
    }

    const alias = BaseSqlAdapter.TABLE_ALIASES[cleanName];
    if (alias && schemaAny[alias]) {
      return schemaAny[alias];
    }

    return null;
  }
}
