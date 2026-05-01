/**
 * @file src/databases/sqlite/crud/crud-module.ts
 * @description CRUD operations module for SQLite.
 */

import { nowISODateString } from "@src/utils/date-utils";
import { safeQuery } from "@src/utils/security/safe-query";
import { count, eq, inArray, placeholder } from "drizzle-orm";
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

  constructor(core: AdapterCore) {
    this.core = core;
  }

  private get db() {
    return this.core.db!;
  }

  /**
   * Helper to determine if a query is a simple ID lookup.
   */
  private isSimpleIdQuery(query: any): boolean {
    const keys = Object.keys(query);
    return keys.length === 1 && keys[0] === "_id" && typeof query._id === "string";
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
        if (this.isSimpleIdQuery(secureQuery)) {
          const table = this.core.getTable(collection);
          const cacheKey = `findOne:${collection}`;

          let prepared = this.preparedStatements.get(cacheKey);
          if (!prepared) {
            prepared = this.db
              .select()
              .from(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
              .where(eq((table as any)._id, placeholder("id")))
              .prepare();
            this.preparedStatements.set(cacheKey, prepared);
          }

          const results = await prepared.all({ id: secureQuery._id });
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
        const results = await this.db
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
        const table = this.core.getTable(collection);
        const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;
        let q = this.db
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
        const results = await this.db
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
      .wrap(async () => {
        const table = this.core.getTable(collection);
        const id = (data as Partial<T>)._id || (utils.generateId() as DatabaseId);
        const now = new Date(nowISODateString());

        // 🚀 HYBRID SCHEMA SUPPORT: Identify fields that don't exist as columns
        const columnNames = new Set(Object.keys(table));
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

        if (process.env.BENCHMARK_DEBUG === "true") {
          console.log(
            `[DEBUG-CRUD] Collection: ${collection}, options.tenantId: ${options.tenantId}, inputData.tenantId: ${inputData.tenantId}, Final values.tenantId: ${values.tenantId}`,
          );
        }

        const processedValues = utils.convertISOToDates(values);

        const insertStmt = this.db.insert(table as any).values(processedValues as any);
        if (process.env.BENCHMARK_DEBUG === "true") {
          console.log(`[DEBUG-SQL] INSERT SQL: ${insertStmt.toSQL().sql}`);
          console.log(`[DEBUG-SQL] INSERT PARAMS:`, insertStmt.toSQL().params);
        }
        await insertStmt;

        // Reuse the findOne prepared statement for the result
        const findCacheKey = `findOne:${collection}`;
        let findPrepared = this.preparedStatements.get(findCacheKey);
        if (!findPrepared) {
          findPrepared = this.db
            .select()
            .from(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
            .where(eq((table as any)._id, placeholder("id")))
            .prepare();
          this.preparedStatements.set(findCacheKey, findPrepared);
        }
        const [result] = await findPrepared.all({ id: id as string });

        return utils.convertDatesToISO(result as Record<string, unknown>) as T;
      }, "CRUD_INSERT_FAILED")
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
      .wrap(async () => {
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

        // 🚀 OPTIMIZATION: Use Prepared Statement for simple ID updates
        if (this.isSimpleIdQuery(secureQuery)) {
          const cacheKey = `update:${collection}`;
          let prepared = this.preparedStatements.get(cacheKey);
          if (!prepared) {
            prepared = this.db
              .update(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
              .set(placeholder("data"))
              .where(eq((table as any)._id, placeholder("id")))
              .prepare();
            this.preparedStatements.set(cacheKey, prepared);
          }
          await prepared.run({ id: id as string, data: values });

          // Reuse the findOne prepared statement
          const findCacheKey = `findOne:${collection}`;
          let findPrepared = this.preparedStatements.get(findCacheKey);
          if (!findPrepared) {
            findPrepared = this.db
              .select()
              .from(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
              .where(eq((table as any)._id, placeholder("id")))
              .prepare();
            this.preparedStatements.set(findCacheKey, findPrepared);
          }
          const [result] = await findPrepared.all({ id: id as string });
          return utils.convertDatesToISO(result as Record<string, unknown>) as T;
        }

        const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;

        await this.db
          .update(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
          .set(values as Record<string, unknown>)
          .where(where);

        const [result] = await this.db
          .select()
          .from(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
          .where(where)
          .limit(1);
        return utils.convertDatesToISO(result as Record<string, unknown>) as T;
      }, "CRUD_UPDATE_FAILED")
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
      .wrap(async () => {
        const query = safeQuery(
          { _id: id } as unknown as QueryFilter<BaseEntity>,
          options.tenantId as string,
          {
            bypassTenantCheck: options.bypassTenantCheck,
          },
        );

        // 🚀 OPTIMIZATION: Use Prepared Statement for simple ID deletes
        if (this.isSimpleIdQuery(query)) {
          const table = this.core.getTable(collection);
          const cacheKey = `delete:${collection}`;
          let prepared = this.preparedStatements.get(cacheKey);
          if (!prepared) {
            prepared = this.db
              .delete(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
              .where(eq((table as any)._id, placeholder("id")))
              .prepare();
            this.preparedStatements.set(cacheKey, prepared);
          }
          await prepared.run({ id: id as string });
          return;
        }

        const table = this.core.getTable(collection);
        const where = this.core.mapQuery(table, query as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;
        await this.db
          .delete(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
          .where(where);
      }, "CRUD_DELETE_FAILED")
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
      .wrap(async () => {
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
          this.isSimpleIdQuery(secureQuery)
        ) {
          await this.db
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

        const [result] = await this.db
          .select()
          .from(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
          .where(eq((table as any)._id, id as string))
          .limit(1);

        return utils.convertDatesToISO(result as Record<string, unknown>) as T;
      }, "CRUD_UPSERT_FAILED")
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

        const [result] = await this.db
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
      .wrap(async () => {
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
        await this.db
          .insert(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
          .values(values as Record<string, unknown>[]);

        const ids = values.map((v) => v._id as string);
        const results = await this.db
          .select()
          .from(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
          .where(inArray((table as any)._id, ids));
        return utils
          .convertArrayDatesToISO(results as Record<string, unknown>[])
          .map((row) => row) as unknown as T[];
      }, "CRUD_INSERT_MANY_FAILED")
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
      .wrap(async () => {
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
        const result = await this.db
          .update(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
          .set(values as Record<string, unknown>)
          .where(where);
        return { modifiedCount: (result as any).changes };
      }, "CRUD_UPDATE_MANY_FAILED")
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
      .wrap(async () => {
        const table = this.core.getTable(collection);
        const secureQuery = safeQuery(query, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
        });
        const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;
        const result = await this.db
          .delete(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
          .where(where);
        return { deletedCount: (result as any).changes };
      }, "CRUD_DELETE_MANY")
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
      .wrap(async () => {
        const table = this.core.getTable(collection);
        const caps = this.core.getCapabilities();
        let upsertedCount = 0;
        let modifiedCount = 0;

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
            this.isSimpleIdQuery(secureQuery)
          ) {
            await this.db
              .insert(table as unknown as import("drizzle-orm/sqlite-core").SQLiteTable)
              .values(values as any)
              .onConflictDoUpdate({
                target: (table as any)._id,
                set: values as any,
              });
          } else {
            // 🛡️ FALLBACK: Portable "Lookup then Insert/Update"
            const existing = await this.findOne<T>(collection, item.query, {
              ...options,
              includeDeleted: true,
            });

            if (existing.success && existing.data) {
              await this.update<T>(collection, (existing.data as any)._id, item.data, options);
              modifiedCount++;
            } else {
              await this.insert<T>(collection, item.data, options);
              upsertedCount++;
            }
          }
        }
        return { upsertedCount, modifiedCount };
      }, "CRUD_UPSERT_MANY_FAILED")
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
