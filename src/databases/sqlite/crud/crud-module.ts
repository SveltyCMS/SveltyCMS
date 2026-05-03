/**
 * @file src/databases/sqlite/crud/crud-module.ts
 * @description CRUD operations module for SQLite.
 */

import { nowISODateString } from "@src/utils/date";
import { safeQuery } from "@src/utils/security/safe-query";
import { count, eq } from "drizzle-orm";
import type {
  BaseEntity,
  DatabaseId,
  DatabaseResult,
  QueryFilter,
  EntityCreate,
  EntityUpdate,
  BaseQueryOptions,
  FindOptions,
} from "../../db-interface";
import type { AdapterCore } from "../adapter/adapter-core";
import * as utils from "../utils";

export class CrudModule {
  private readonly core: AdapterCore;
  private readonly preparedStatements = new Map<string, any>();
  private readonly preparedInserts = new Map<string, any>();
  private readonly preparedUpdates = new Map<string, any>();

  private enforceCacheLimit(cache: Map<string, any>, limit = 100) {
    if (cache.size > limit) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
  }

  constructor(core: AdapterCore) {
    this.core = core;
  }

  private getDb(options?: BaseQueryOptions) {
    return options?.transaction?.db || this.core.db!;
  }

  /**
   * Helper to determine if a query is a simple ID lookup (optionally with tenantId and isDeleted).
   */
  private isLookupQuery(query: any): boolean {
    const keys = Object.keys(query);

    // Check if the only complex object is the isDeleted condition from safeQuery
    const hasComplexKeys = keys.some((k) => {
      if (
        k === "isDeleted" &&
        typeof query[k] === "object" &&
        query[k] !== null &&
        query[k].$ne === true
      ) {
        return false; // This specific complex object is allowed
      }
      return typeof query[k] === "object" && query[k] !== null;
    });

    if (hasComplexKeys) return false;

    // Must include _id
    if (!keys.includes("_id")) return false;

    // The other allowed keys are tenantId and isDeleted
    return keys.every((k) => k === "_id" || k === "tenantId" || k === "isDeleted");
  }

  /**
   * Helper to determine if a query is a simple tenant-wide lookup.
   */
  private isTenantQuery(query: any): boolean {
    const keys = Object.keys(query);

    // Check if the only complex object is the isDeleted condition from safeQuery
    const hasComplexKeys = keys.some((k) => {
      if (
        k === "isDeleted" &&
        typeof query[k] === "object" &&
        query[k] !== null &&
        query[k].$ne === true
      ) {
        return false; // This specific complex object is allowed
      }
      return typeof query[k] === "object" && query[k] !== null;
    });

    if (hasComplexKeys) return false;

    // The allowed keys are tenantId and isDeleted
    return keys.every((k) => k === "tenantId" || k === "isDeleted");
  }

  async findOne<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T | null>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const secureQuery = safeQuery(query, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
        });

        // 🚀 OPTIMIZATION: Use Prepared Statement for simple ID lookups
        if (this.isLookupQuery(secureQuery)) {
          const table = this.core.getTable(collection);
          // Key changes depending on whether tenantId is present
          const hasTenant = !!(secureQuery.tenantId || options.tenantId);
          const cacheKey = `findOne:${collection}:${hasTenant ? "tenant" : "global"}`;

          let prepared = this.preparedStatements.get(cacheKey);
          if (!prepared) {
            const { and, eq, ne, placeholder } = await import("drizzle-orm");

            const conditions = [eq((table as any)._id, placeholder("id"))];

            if ((table as any).isDeleted) {
              conditions.push(ne((table as any).isDeleted, true));
            }

            if (hasTenant) {
              conditions.push(eq((table as any).tenantId, placeholder("tenantId")));
            }

            prepared = this.getDb(options)
              .select()
              .from(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
              .where(and(...conditions))
              .prepare();
            this.preparedStatements.set(cacheKey, prepared);
          }

          const params: Record<string, any> = { id: secureQuery._id };
          if (hasTenant) {
            params.tenantId = secureQuery.tenantId || options.tenantId;
          }

          const results = await (prepared.all(params) as Promise<any[]>);
          const data =
            results.length === 0
              ? null
              : (utils.convertDatesToISO(results[0] as Record<string, unknown>) as T);
          return data;
        }

        const table = this.core.getTable(collection);
        const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;
        const results = await this.getDb(options)
          .select()
          .from(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
          .where(where)
          .limit(1);

        const data =
          results.length === 0
            ? null
            : (utils.convertDatesToISO(results[0] as Record<string, unknown>) as T);
        return data;
      }, "CRUD_FIND_ONE_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async findMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T[]>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const secureQuery = safeQuery(query, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
        });

        // 🚀 OPTIMIZATION: Prepared Statement for Tenant-only lookups
        if (this.isTenantQuery(secureQuery) && !options.offset) {
          const table = this.core.getTable(collection);
          const limit = options.limit || 1000;

          const hasTenant = !!(secureQuery.tenantId || options.tenantId);
          const cacheKey = `findManyTenant:${collection}:${limit}:${hasTenant ? "tenant" : "global"}`;

          let prepared = this.preparedStatements.get(cacheKey);
          if (!prepared) {
            const { and, eq, ne, placeholder } = await import("drizzle-orm");

            const conditions = [];

            if ((table as any).isDeleted) {
              conditions.push(ne((table as any).isDeleted, true));
            }

            if (hasTenant) {
              conditions.push(eq((table as any).tenantId, placeholder("tenantId")));
            }

            let query: any = this.getDb(options)
              .select()
              .from(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable);

            if (conditions.length > 0) {
              query = query.where(conditions.length > 1 ? and(...conditions) : conditions[0]);
            }

            prepared = query.limit(limit).prepare();
            this.preparedStatements.set(cacheKey, prepared);
          }

          const params: Record<string, any> = {};
          if (hasTenant) {
            params.tenantId = secureQuery.tenantId || options.tenantId;
          }

          const results = await (prepared.all(params) as Promise<any[]>);
          return utils.convertArrayDatesToISO(results as Record<string, unknown>[]) as T[];
        }
        const table = this.core.getTable(collection);
        const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;
        let q = this.getDb(options)
          .select()
          .from(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
          .where(where)
          .$dynamic();

        q = q.limit(options.limit || 1000);

        if (options.offset) {
          q = q.offset(options.offset);
        }
        const results = await q;
        return utils.convertArrayDatesToISO(results as Record<string, unknown>[]) as T[];
      }, "CRUD_FIND_MANY_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async find<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> & { rawSql?: boolean; sql?: string; params?: Record<string, any> } = {},
  ): Promise<DatabaseResult<T[]>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        if (options.rawSql && options.sql) {
          const results = this.core.queryRaw(options.sql, options.params || {});
          return utils.convertArrayDatesToISO(results as Record<string, unknown>[]) as T[];
        }

        const res = await this.findMany(collection, query, options);
        if (!res.success) throw res.error;
        return res.data;
      }, "CRUD_FIND_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async findByIds<T extends BaseEntity>(
    collection: string,
    ids: DatabaseId[],
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T[]>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const query = safeQuery(
          { _id: { $in: ids } } as unknown as QueryFilter<T>,
          options.tenantId as string,
          {
            bypassTenantCheck: options.bypassTenantCheck,
            includeDeleted: options.includeDeleted,
          },
        );
        const table = this.core.getTable(collection);
        const where = this.core.mapQuery(table, query as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;
        const results = await this.getDb(options)
          .select()
          .from(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
          .where(where);
        return utils.convertArrayDatesToISO(results as Record<string, unknown>[]) as T[];
      }, "CRUD_FIND_BY_IDS_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async insert<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T>> {
    const startTime = performance.now();
    return this.core
      .wrap(
        async () => {
          const table = this.core.getTable(collection);
          const id = (data as Partial<T>)._id || (utils.generateId() as DatabaseId);
          const now = new Date(nowISODateString());

          // 🚀 OPTIMIZATION: Use cached column names to avoid repeated Set creation
          const columnNames = this.core.getColumnNames(collection);
          const inputData = { ...data } as any;
          const dynamicData = (inputData.data || {}) as Record<string, any>;
          const values: Record<string, any> = {
            _id: id,
            tenantId: options.tenantId || inputData.tenantId,
            status: inputData.status || "published",
            createdAt: now,
            updatedAt: now,
          };

          // Move extra fields to 'data' blob
          for (const [key, value] of Object.entries(inputData)) {
            if (["_id", "tenantId", "status", "createdAt", "updatedAt", "data"].includes(key))
              continue;
            if (columnNames.has(key)) {
              values[key] = value;
            } else {
              dynamicData[key] = value;
            }
          }
          values.data = dynamicData;

          const processedValues = utils.convertISOToDates(values);

          // 🚀 OPTIMIZATION: Use Prepared Statement for INSERT if keys are consistent
          const cacheKey = `insert:${collection}:${Object.entries(processedValues)
            .map(([k, v]) => `${k}:${v === null ? "null" : "val"}`)
            .sort()
            .join(",")}`;
          let prepared = this.preparedInserts.get(cacheKey);

          if (!prepared) {
            const { placeholder, sql } = await import("drizzle-orm");
            prepared = this.getDb(options)
              .insert(table as any)
              .values(
                Object.fromEntries(
                  Object.entries(processedValues).map(([k, v]) => [
                    k,
                    v === null ? sql`NULL` : placeholder(k),
                  ]),
                ) as any,
              )
              .returning()
              .prepare();
            this.preparedInserts.set(cacheKey, prepared);
            this.enforceCacheLimit(this.preparedInserts);
          }

          const params = Object.fromEntries(
            Object.entries(processedValues).filter(([_, v]) => v !== null),
          );
          const [result] = (await (prepared as any).all(params)) as any[];
          return utils.convertDatesToISO(result as Record<string, unknown>) as T;
        },
        "CRUD_INSERT_FAILED",
        undefined,
        { isWrite: true, transaction: options.transaction },
      )
      .then(async (res) => {
        if (res.success) {
          res.meta = { executionTime: performance.now() - startTime };
          await this.core.invalidateQueryCache(collection, options.tenantId);
        }
        return res;
      });
  }

  async update<T extends BaseEntity>(
    collection: string,
    id: DatabaseId,
    data: EntityUpdate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T>> {
    const startTime = performance.now();
    return this.core
      .wrap(
        async () => {
          const secureQuery = safeQuery(
            { _id: id } as unknown as QueryFilter<T>,
            options.tenantId as string,
            {
              bypassTenantCheck: options.bypassTenantCheck,
            },
          );

          const table = this.core.getTable(collection);
          const now = new Date(nowISODateString());
          const updateData = { ...data, updatedAt: now };
          const values = utils.convertISOToDates(updateData as Record<string, unknown>);

          // 🚀 OPTIMIZATION: Use Prepared Statement for UPDATE if keys are consistent
          const hasTenant = !!secureQuery.tenantId;
          const cacheKey = `update:${collection}:${Object.entries(values)
            .map(([k, v]) => `${k}:${v === null ? "null" : "val"}`)
            .sort()
            .join(",")}:${hasTenant ? "tenant" : "global"}`;

          let prepared = this.preparedUpdates.get(cacheKey);
          if (!prepared) {
            const { eq, and, placeholder, sql } = await import("drizzle-orm");

            const conditions = [eq((table as any)._id, placeholder("id"))];
            if (hasTenant) {
              conditions.push(eq((table as any).tenantId, placeholder("tenantId")));
            }

            prepared = this.getDb(options)
              .update(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
              .set(
                Object.fromEntries(
                  Object.entries(values).map(([k, v]) => [
                    k,
                    v === null ? sql`NULL` : placeholder(`_val_${k}`),
                  ]),
                ) as any,
              )
              .where(conditions.length > 1 ? and(...conditions) : conditions[0])
              .prepare();

            this.preparedUpdates.set(cacheKey, prepared);
            this.enforceCacheLimit(this.preparedUpdates);
          }

          const params: Record<string, any> = { id };
          if (hasTenant) {
            params.tenantId = secureQuery.tenantId;
          }
          for (const [k, v] of Object.entries(values)) {
            if (v !== null) {
              params[`_val_${k}`] = v;
            }
          }

          await prepared.run(params);

          // Optimization: the findOne call will use the existing findOne prepared statement!
          const result = await this.findOne(collection, { _id: id } as any, options);
          if (!result.success || !result.data) {
            throw new Error("Update failed or record not found after update");
          }

          return result.data as T;
        },
        "CRUD_UPDATE_FAILED",
        undefined,
        { isWrite: true, transaction: options.transaction },
      )
      .then(async (res) => {
        if (res.success) {
          res.meta = { executionTime: performance.now() - startTime };
          await this.core.invalidateQueryCache(collection, options.tenantId);
        }
        return res;
      });
  }

  async delete(
    collection: string,
    id: DatabaseId,
    options: BaseQueryOptions & { permanent?: boolean; userId?: DatabaseId } = {},
  ): Promise<DatabaseResult<void>> {
    const startTime = performance.now();
    return this.core
      .wrap(
        async () => {
          const query = safeQuery(
            { _id: id } as unknown as QueryFilter<BaseEntity>,
            options.tenantId as string,
            {
              bypassTenantCheck: options.bypassTenantCheck,
            },
          );

          const table = this.core.getTable(collection);
          const where = this.core.mapQuery(table, query as Record<string, unknown>) as
            | import("drizzle-orm").SQL
            | undefined;
          await this.getDb(options)
            .delete(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
            .where(where);
        },
        "CRUD_DELETE_FAILED",
        undefined,
        { isWrite: true, transaction: options.transaction },
      )
      .then(async (res) => {
        if (res.success) {
          res.meta = { executionTime: performance.now() - startTime };
          await this.core.invalidateQueryCache(collection, options.tenantId);
        }
        return res;
      });
  }

  async restore(
    collection: string,
    _id: DatabaseId,
    _options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<void>> {
    return this.core.notImplemented(`crud.restore for ${collection}`);
  }

  async upsert<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityCreate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T>> {
    const startTime = performance.now();
    return this.core
      .wrap(
        async () => {
          const secureQuery = safeQuery(query, options.tenantId as string, {
            bypassTenantCheck: options.bypassTenantCheck,
          });
          const table = this.core.getTable(collection);
          const caps = this.core.getCapabilities();

          const id =
            (secureQuery as any)._id ||
            (data as Partial<T>)._id ||
            (utils.generateId() as DatabaseId);
          const now = new Date(nowISODateString());
          const values = utils.convertISOToDates({
            ...data,
            _id: id,
            tenantId: options.tenantId || (data as any).tenantId,
            createdAt: now,
            updatedAt: now,
          } as Record<string, unknown>);

          // 🚀 STRATEGY: Capability-based Hybrid CRUD
          // If query matches a unique index (primary key _id) and database supports native upsert
          if (
            caps.nativeUpsert &&
            caps.supportsConflictTargets &&
            this.isLookupQuery(secureQuery)
          ) {
            await this.getDb(options)
              .insert(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
              .values(values as any)
              .onConflictDoUpdate({
                target: (table as any)._id,
                set: values as any,
              });
          } else {
            // 🛡️ FALLBACK: Portable "Lookup then Insert/Update"
            const existing = await this.findOne<T>(collection, query, {
              ...options,
              includeDeleted: true,
            });

            if (existing.success && existing.data) {
              await this.update<T>(collection, (existing.data as any)._id, data, options);
            } else {
              await this.insert<T>(collection, data, options);
            }
          }

          const [result] = await this.getDb(options)
            .select()
            .from(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
            .where(eq((table as any)._id, id as string))
            .limit(1);

          return utils.convertDatesToISO(result as Record<string, unknown>) as T;
        },
        "CRUD_UPSERT_FAILED",
        undefined,
        { isWrite: true, transaction: options.transaction },
      )
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async count<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T> = {},
    options: BaseQueryOptions & { includeDeleted?: boolean } = {},
  ): Promise<DatabaseResult<number>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const secureQuery = safeQuery(query, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
        });
        const table = this.core.getTable(collection);
        const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;

        const [result] = await this.getDb(options)
          .select({ count: count() })
          .from(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
          .where(where);
        return Number((result as any).count);
      }, "CRUD_COUNT_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async exists<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: BaseQueryOptions & { includeDeleted?: boolean } = {},
  ): Promise<DatabaseResult<boolean>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const res = await this.count(collection, query, options);
        if (!res.success) {
          throw res.error;
        }
        return (res.data ?? 0) > 0;
      }, "CRUD_EXISTS_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async insertMany<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>[],
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T[]>> {
    const startTime = performance.now();
    return this.core
      .wrap(
        async () => {
          if (data.length === 0) {
            return [];
          }
          const table = this.core.getTable(collection);
          const now = new Date(nowISODateString());
          const values = data.map((d) =>
            utils.convertISOToDates({
              ...d,
              _id: (d as any)._id || (utils.generateId() as DatabaseId),
              tenantId: options.tenantId || (d as any).tenantId,
              createdAt: now,
              updatedAt: now,
            } as Record<string, unknown>),
          );
          const results = await this.getDb(options)
            .insert(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
            .values(values as Record<string, unknown>[])
            .returning();

          return utils
            .convertArrayDatesToISO(results as Record<string, unknown>[])
            .map((row) => row) as unknown as T[];
        },
        "CRUD_INSERT_MANY_FAILED",
        undefined,
        { isWrite: true, transaction: options.transaction },
      )
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async updateMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityUpdate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    const startTime = performance.now();
    return this.core
      .wrap(
        async () => {
          const table = this.core.getTable(collection);
          const secureQuery = safeQuery(query, options.tenantId as string, {
            bypassTenantCheck: options.bypassTenantCheck,
          });
          const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
            | import("drizzle-orm").SQL
            | undefined;
          const now = new Date(nowISODateString());
          const values = utils.convertISOToDates({ ...data, updatedAt: now } as Record<
            string,
            unknown
          >);
          const result = await this.getDb(options)
            .update(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
            .set(values as Record<string, unknown>)
            .where(where);
          return { modifiedCount: (result as any).changes };
        },
        "CRUD_UPDATE_MANY_FAILED",
        undefined,
        { isWrite: true, transaction: options.transaction },
      )
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async deleteMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: BaseQueryOptions & { permanent?: boolean; userId?: DatabaseId } = {},
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    const startTime = performance.now();
    return this.core
      .wrap(
        async () => {
          const table = this.core.getTable(collection);
          const secureQuery = safeQuery(query, options.tenantId as string, {
            bypassTenantCheck: options.bypassTenantCheck,
          });
          const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
            | import("drizzle-orm").SQL
            | undefined;
          const result = await this.getDb(options)
            .delete(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
            .where(where);
          return { deletedCount: (result as any).changes };
        },
        "CRUD_DELETE_MANY",
        undefined,
        { isWrite: true, transaction: options.transaction },
      )
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async upsertMany<T extends BaseEntity>(
    collection: string,
    items: Array<{
      query: QueryFilter<T>;
      data: EntityCreate<T>;
    }>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<{ upsertedCount: number; modifiedCount: number }>> {
    const startTime = performance.now();
    return this.core
      .transaction<{ upsertedCount: number; modifiedCount: number }>(async (tx) => {
        const table = this.core.getTable(collection);
        const caps = this.core.getCapabilities();
        let upsertedCount = 0;
        let modifiedCount = 0;

        const txOptions = { ...options, transaction: tx };

        for (const item of items) {
          const secureQuery = safeQuery(item.query, options.tenantId as string, {
            bypassTenantCheck: options.bypassTenantCheck,
          });

          const id =
            (secureQuery as any)._id ||
            (item.data as any)._id ||
            (utils.generateId() as DatabaseId);
          const now = new Date(nowISODateString());
          const values = utils.convertISOToDates({
            ...item.data,
            _id: id,
            tenantId: options.tenantId || (item.data as any).tenantId,
            createdAt: now,
            updatedAt: now,
          } as Record<string, unknown>);

          // 🚀 STRATEGY: Capability-based Hybrid CRUD
          if (
            caps.nativeUpsert &&
            caps.supportsConflictTargets &&
            this.isLookupQuery(secureQuery)
          ) {
            await this.getDb(txOptions)
              .insert(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
              .values(values as any)
              .onConflictDoUpdate({
                target: (table as any)._id,
                set: values as any,
              });
            upsertedCount++; // Close enough for bulk metrics
          } else {
            // 🛡️ FALLBACK: Portable "Lookup then Insert/Update"
            const existing = await this.findOne<T>(collection, item.query, {
              ...txOptions,
              includeDeleted: true,
            });

            if (existing.success && existing.data) {
              await this.update<T>(collection, (existing.data as any)._id, item.data, txOptions);
              modifiedCount++;
            } else {
              await this.insert<T>(collection, item.data, txOptions);
              upsertedCount++;
            }
          }
        }
        return { success: true, data: { upsertedCount, modifiedCount } };
      }, options as any)
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async aggregate<R>(
    collection: string,
    _pipeline: unknown[],
    _options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<R[]>> {
    return this.core.notImplemented(`crud.aggregate for ${collection}`);
  }
}
