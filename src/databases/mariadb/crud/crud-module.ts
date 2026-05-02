/**
 * @file src/databases/mariadb/crud/crud-module.ts
 * @description CRUD operations module for MariaDB.
 */

import { nowISODateString } from "@src/utils/date-utils";
import { safeQuery } from "@src/utils/security/safe-query";
import { count, eq, inArray, placeholder, sql } from "drizzle-orm";
import type {
  ICrudAdapter,
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

export class CrudModule implements ICrudAdapter {
  private readonly core: AdapterCore;
  private readonly preparedStatements = new Map<string, any>();

  constructor(core: AdapterCore) {
    this.core = core;
  }

  private get db() {
    return this.core.db!;
  }

  public clearPreparedStatements(collection?: string) {
    if (collection) {
      for (const key of this.preparedStatements.keys()) {
        if (key.includes(`:${collection}`)) {
          this.preparedStatements.delete(key);
        }
      }
    } else {
      this.preparedStatements.clear();
    }
  }

  /**
   * Helper to determine if a query is a simple ID lookup (optionally with tenantId).
   */
  private isLookupQuery(query: any): boolean {
    const keys = Object.keys(query);
    if (keys.length === 1) return keys[0] === "_id";
    if (keys.length === 2) {
      return (
        (keys.includes("_id") && keys.includes("tenantId")) ||
        (keys.includes("_id") && keys.includes("isDeleted"))
      );
    }
    if (keys.length === 3) {
      return keys.includes("_id") && keys.includes("tenantId") && keys.includes("isDeleted");
    }
    return false;
  }

  /**
   * Helper to determine if a query is a simple tenant-wide lookup.
   */
  private isTenantQuery(query: any): boolean {
    const keys = Object.keys(query);
    if (keys.length === 1) return keys[0] === "tenantId";
    if (keys.length === 2) return keys.includes("tenantId") && keys.includes("isDeleted");
    return false;
  }

  async findOne<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> & { tx?: any } = {},
  ): Promise<DatabaseResult<T | null>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const secureQuery = safeQuery(query, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
        });

        const db = options?.tx || this.db;

        // 🚀 OPTIMIZATION: Use Prepared Statement for simple ID lookups
        if (this.isLookupQuery(secureQuery) && !options?.tx) {
          const table = this.core.getTable(collection);
          const cacheKey = `findOne:${collection}`;

          let prepared = this.preparedStatements.get(cacheKey);
          if (!prepared) {
            const { and, eq, placeholder } = await import("drizzle-orm");
            prepared = this.db
              .select()
              .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
              .where(
                and(
                  eq((table as any)._id, placeholder("id")),
                  eq((table as any).tenantId, placeholder("tenantId")),
                ),
              )
              .prepare();
            this.preparedStatements.set(cacheKey, prepared);
          }

          const results = await prepared.execute({
            id: secureQuery._id,
            tenantId: secureQuery.tenantId || options.tenantId,
          });
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

        const results = await db
          .select()
          .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
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

  async find<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> & { rawSql?: boolean; sql?: string; params?: any[]; tx?: any } = {},
  ): Promise<DatabaseResult<T[]>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        if (options.rawSql && options.sql) {
          const db = options?.tx || this.db;
          const results = await db.execute(sql.raw(options.sql));
          return utils.convertArrayDatesToISO(results[0] as Record<string, unknown>[]) as T[];
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

  async findMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> & { tx?: any } = {},
  ): Promise<DatabaseResult<T[]>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const secureQuery = safeQuery(query, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
        });

        // 🚀 OPTIMIZATION: Prepared Statement for Tenant-only lookups
        if (this.isTenantQuery(secureQuery) && !options.offset && !options.tx) {
          const table = this.core.getTable(collection);
          const limit = options.limit || 1000;
          const cacheKey = `findManyTenant:${collection}:${limit}`;
          let prepared = this.preparedStatements.get(cacheKey);
          if (!prepared) {
            const { eq, placeholder } = await import("drizzle-orm");
            prepared = this.db
              .select()
              .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
              .where(eq((table as any).tenantId, placeholder("tenantId")))
              .limit(limit)
              .prepare();
            this.preparedStatements.set(cacheKey, prepared);
          }
          const results = await prepared.execute({
            tenantId: secureQuery.tenantId || options.tenantId,
          });
          return utils.convertArrayDatesToISO(results as Record<string, unknown>[]) as T[];
        }

        const table = this.core.getTable(collection);
        const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;

        const db = options?.tx || this.db;

        let q = db
          .select()
          .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
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

  async findByIds<T extends BaseEntity>(
    collection: string,
    ids: DatabaseId[],
    options: FindOptions<T> & { tx?: any } = {},
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

        const db = options?.tx || this.db;

        const results = await db
          .select()
          .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
          .where(where);
        return utils.convertArrayDatesToISO(results as Record<string, unknown>[]) as T[];
      }, "CRUD_FIND_BY_IDS_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  /**
   * Prepares values for insert/update by separating fixed schema columns from dynamic data.
   */
  private prepareValues(table: any, data: any, id: DatabaseId, _now: Date, options: any) {
    const fixedColumns = ["_id", "tenantId", "status", "createdAt", "updatedAt", "data"];

    // Use SQL expressions for core timestamps to ensure DB-level precision and avoid JS serialization bugs
    const values: any = {
      _id: id,
      tenantId: options.tenantId || data.tenantId || null,
      status: data.status || "draft",
      createdAt: data.createdAt
        ? typeof data.createdAt === "string"
          ? new Date(data.createdAt)
          : data.createdAt
        : sql`CURRENT_TIMESTAMP`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    };

    // Deep clone data to avoid mutating original, and convert any date strings to Dates for Drizzle
    const processedData = { ...data };
    for (const key in processedData) {
      const val = processedData[key];
      if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
        processedData[key] = new Date(val);
      }
    }

    // Distinguish between dynamic collection tables and static schema tables
    const isDynamicTable = table.data && !table.path;

    if (isDynamicTable) {
      const extra: any = {};
      for (const [k, v] of Object.entries(processedData)) {
        if (!fixedColumns.includes(k)) {
          extra[k] = v;
        }
      }
      values.data = extra;
    } else {
      // Static table: copy fields as-is
      Object.assign(values, processedData);

      // Default values for mandatory content_nodes columns if they are missing
      if (table.path && values.path == null) {
        values.path = id.toString(); // Fallback path
      }
      if (table.nodeType && values.nodeType == null) {
        values.nodeType = "node"; // Fallback type
      }
    }

    return values;
  }

  async insert<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>,
    options: BaseQueryOptions & { tx?: any } = {},
  ): Promise<DatabaseResult<T>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const table = this.core.getTable(collection);
        const id = (data as Partial<T>)._id || (utils.generateId() as DatabaseId);
        const now = new Date(nowISODateString());
        const values = this.prepareValues(table, data, id, now, options);

        const db = options?.tx || this.db;

        await db
          .insert(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
          .values(values as unknown as Record<string, unknown>);

        // Reuse the findOne prepared statement for the result
        const findCacheKey = `findOne:${collection}`;
        let findPrepared = this.preparedStatements.get(findCacheKey);
        if (!findPrepared) {
          findPrepared = this.db
            .select()
            .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
            .where(eq((table as any)._id, placeholder("id")))
            .prepare();
          this.preparedStatements.set(findCacheKey, findPrepared);
        }
        const [result] = await findPrepared.execute({ id: id as string });

        return utils.convertDatesToISO(result as Record<string, unknown>) as T;
      }, "CRUD_INSERT_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async update<T extends BaseEntity>(
    collection: string,
    id: DatabaseId,
    data: EntityUpdate<T>,
    options: BaseQueryOptions & { tx?: any } = {},
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
        const updateValues = this.prepareValues(table, data, id, now, options);
        // Remove immutable fields from update payload
        delete updateValues._id;
        delete updateValues.tenantId;
        delete updateValues.createdAt;

        const db = options?.tx || this.db;

        // 1. Perform Update
        if (this.isLookupQuery(secureQuery)) {
          await db
            .update(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
            .set(updateValues as unknown as Record<string, unknown>)
            .where(eq((table as any)._id, id as string));
        } else {
          const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
            | import("drizzle-orm").SQL
            | undefined;

          await db
            .update(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
            .set(updateValues as unknown as Record<string, unknown>)
            .where(where);
        }

        // 2. Fetch Result
        const findCacheKey = `findOne:${collection}`;
        let findPrepared = this.preparedStatements.get(findCacheKey);
        if (!findPrepared) {
          findPrepared = this.db
            .select()
            .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
            .where(eq((table as any)._id, placeholder("id")))
            .prepare();
          this.preparedStatements.set(findCacheKey, findPrepared);
        }
        const [result] = await findPrepared.execute({ id: id as string });
        return utils.convertDatesToISO(result as Record<string, unknown>) as T;
      }, "CRUD_UPDATE_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async delete(
    collection: string,
    id: DatabaseId,
    options: BaseQueryOptions & { permanent?: boolean; userId?: DatabaseId; tx?: any } = {},
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

        const db = options?.tx || this.db;

        // 🚀 OPTIMIZATION: Use Prepared Statement for simple ID deletes
        if (this.isLookupQuery(query) && !options?.tx) {
          const table = this.core.getTable(collection);
          const cacheKey = `delete:${collection}`;
          let prepared = this.preparedStatements.get(cacheKey);
          if (!prepared) {
            prepared = this.db
              .delete(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
              .where(eq((table as any)._id, placeholder("id")))
              .prepare();
            this.preparedStatements.set(cacheKey, prepared);
          }
          await prepared.execute({ id: id as string });
          return;
        }

        const table = this.core.getTable(collection);
        const where = this.core.mapQuery(table, query as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;
        await db
          .delete(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
          .where(where);
      }, "CRUD_DELETE_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async restore(
    collection: string,
    _id: DatabaseId,
    _options: BaseQueryOptions & { tx?: any } = {},
  ): Promise<DatabaseResult<void>> {
    return this.core.notImplemented(`crud.restore for ${collection}`);
  }

  async upsert<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityCreate<T>,
    options: BaseQueryOptions & { tx?: any } = {},
  ): Promise<DatabaseResult<T>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const executeUpsert = async (tx: any) => {
          const secureQuery = safeQuery(query, options.tenantId as string, {
            bypassTenantCheck: options.bypassTenantCheck,
          });
          const table = this.core.getTable(collection);
          const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
            | import("drizzle-orm").SQL
            | undefined;
          const existing = await tx
            .select()
            .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
            .where(where)
            .limit(1);

          if (existing.length > 0) {
            const id = (existing[0] as any)._id as unknown as DatabaseId;
            const now = new Date(nowISODateString());
            const values = this.prepareValues(table, data, id, now, options);
            delete values._id;
            delete values.tenantId;
            delete values.createdAt;

            await tx
              .update(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
              .set(values as unknown as Record<string, unknown>)
              .where(eq((table as any)._id, id as string));

            const [result] = await tx
              .select()
              .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
              .where(eq((table as any)._id, id as string))
              .limit(1);

            return utils.convertDatesToISO(result as Record<string, unknown>) as T;
          } else {
            const id = (data as Partial<T>)._id || (utils.generateId() as DatabaseId);
            const now = new Date(nowISODateString());
            const values = this.prepareValues(table, data, id, now, options);

            await tx
              .insert(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
              .values(values as unknown as Record<string, unknown>);

            const [result] = await tx
              .select()
              .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
              .where(eq((table as any)._id, id as string))
              .limit(1);

            return utils.convertDatesToISO(result as Record<string, unknown>) as T;
          }
        };

        if (options?.tx) {
          return await executeUpsert(options.tx);
        } else {
          return await this.db.transaction(executeUpsert);
        }
      }, "CRUD_UPSERT_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async count<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T> = {},
    options: BaseQueryOptions & { includeDeleted?: boolean; tx?: any } = {},
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

        const db = options?.tx || this.db;

        const [result] = await db
          .select({ count: count() })
          .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
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
    options: BaseQueryOptions & { includeDeleted?: boolean; tx?: any } = {},
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
    options: BaseQueryOptions & { tx?: any } = {},
  ): Promise<DatabaseResult<T[]>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        if (data.length === 0) {
          return [];
        }
        const table = this.core.getTable(collection);
        const now = new Date();
        const values = data.map((d) =>
          this.prepareValues(
            table,
            d,
            (d as any)._id || (utils.generateId() as DatabaseId),
            now,
            options,
          ),
        );

        const db = options?.tx || this.db;

        await db
          .insert(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
          .values(values as unknown as Record<string, unknown>[]);

        const ids = values.map((v) => v._id as string);
        const results = await db
          .select()
          .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
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
    options: BaseQueryOptions & { tx?: any } = {},
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
        const values = this.prepareValues(table, data, "" as DatabaseId, now, options);
        delete values._id;
        delete values.tenantId;
        delete values.createdAt;

        const db = options?.tx || this.db;

        const result = await db
          .update(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
          .set(values as unknown as Record<string, unknown>)
          .where(where);
        return { modifiedCount: (result as any).affectedRows };
      }, "CRUD_UPDATE_MANY_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async deleteMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: BaseQueryOptions & { permanent?: boolean; userId?: DatabaseId; tx?: any } = {},
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

        const db = options?.tx || this.db;

        const result = await db
          .delete(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
          .where(where);
        return { deletedCount: (result as any).affectedRows };
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
    options: BaseQueryOptions & { tx?: any } = {},
  ): Promise<DatabaseResult<{ upsertedCount: number; modifiedCount: number }>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const executeUpsertMany = async (tx: any) => {
          let upsertedCount = 0;
          let modifiedCount = 0;
          const table = this.core.getTable(collection);

          for (const item of items) {
            const secureQuery = safeQuery(item.query, options.tenantId as string, {
              bypassTenantCheck: options.bypassTenantCheck,
            });
            const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
              | import("drizzle-orm").SQL
              | undefined;

            const existing = await tx
              .select()
              .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
              .where(where)
              .limit(1);

            if (existing.length > 0) {
              const id = (existing[0] as any)._id as unknown as DatabaseId;
              const now = new Date(nowISODateString());
              const values = this.prepareValues(table, item.data, id, now, options);
              delete values._id;
              delete values.tenantId;
              delete values.createdAt;

              await tx
                .update(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
                .set(values as unknown as Record<string, unknown>)
                .where(eq((table as any)._id, id as string));

              modifiedCount++;
            } else {
              const id = (item.data as Partial<T>)._id || (utils.generateId() as DatabaseId);
              const now = new Date(nowISODateString());
              const values = this.prepareValues(table, item.data, id, now, options);

              await tx
                .insert(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
                .values(values as unknown as Record<string, unknown>);

              upsertedCount++;
            }
          }
          return { upsertedCount, modifiedCount };
        };

        if (options?.tx) {
          return await executeUpsertMany(options.tx);
        } else {
          return await this.db.transaction(executeUpsertMany);
        }
      }, "CRUD_UPSERT_MANY_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async aggregate<R = unknown>(
    collection: string,
    _pipeline: unknown[],
    _options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<R[]>> {
    return this.core.notImplemented(`crud.aggregate for ${collection}`);
  }
}
