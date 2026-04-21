/**
 * @file src/databases/postgresql/crud/crud-module.ts
 * @description CRUD operations module for PostgreSQL.
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
  ICrudAdapter,
} from "../../db-interface";
import type { AdapterCore } from "../adapter/adapter-core";
import * as utils from "../utils";

export class CrudModule implements ICrudAdapter {
  private readonly core: AdapterCore;
  private readonly preparedStatements = new Map<string, any>();

  constructor(core: AdapterCore) {
    this.core = core;
  }

  /**
   * Clears the prepared statements cache.
   * Useful when tables are dropped or modified during benchmarks.
   */
  public clearPreparedStatements(collection?: string): void {
    if (collection) {
      // Clear specific collection statements
      for (const [key] of this.preparedStatements.entries()) {
        if (key.includes(`:${collection}`)) {
          this.preparedStatements.delete(key);
        }
      }
    } else {
      this.preparedStatements.clear();
    }
  }

  /**
   * Returns the appropriate Drizzle instance for the operation.
   * Geographic Read-Replica Awareness.
   */
  private getDb(mode: "read" | "write" = "write") {
    return this.core.getDb(mode);
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
    options: {
      fields?: (keyof T)[];
      tenantId?: DatabaseId | null | undefined;
      bypassTenantCheck?: boolean;
      includeDeleted?: boolean;
      tx?: any;
    } = {},
  ): Promise<DatabaseResult<T | null>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const secureQuery = safeQuery(query, options.tenantId, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
        });

        const db = options?.tx || this.getDb("read");

        // 🚀 OPTIMIZATION: Use Prepared Statement for simple ID lookups
        if (this.isSimpleIdQuery(secureQuery) && !options?.tx) {
          const table = this.core.getTable(collection);
          const cacheKey = `findOne:${collection}`;

          let prepared = this.preparedStatements.get(cacheKey);
          if (!prepared) {
            prepared = this.getDb("read")
              .select()
              .from(table as unknown as import("drizzle-orm/pg-core").PgTable)
              .where(eq((table as any)._id, placeholder("id")))
              .prepare(cacheKey);
            this.preparedStatements.set(cacheKey, prepared);
          }

          const results = await prepared.execute({ id: secureQuery._id });
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
          .from(table as unknown as import("drizzle-orm/pg-core").PgTable)
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
    options: {
      limit?: number;
      offset?: number;
      fields?: (keyof T)[];
      tenantId?: DatabaseId | null | undefined;
      bypassTenantCheck?: boolean;
      includeDeleted?: boolean;
      tx?: any;
    } = {},
  ): Promise<DatabaseResult<T[]>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const secureQuery = safeQuery(query, options.tenantId, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
        });
        const table = this.core.getTable(collection);
        const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;

        const db = options?.tx || this.getDb("read");

        let q = db
          .select()
          .from(table as unknown as import("drizzle-orm/pg-core").PgTable)
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
    options: {
      fields?: (keyof T)[];
      tenantId?: DatabaseId | null | undefined;
      bypassTenantCheck?: boolean;
      includeDeleted?: boolean;
      populate?: string[];
      tx?: any;
    } = {},
  ): Promise<DatabaseResult<T[]>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const query = safeQuery(
          { _id: { $in: ids } } as unknown as QueryFilter<T>,
          options.tenantId,
          {
            bypassTenantCheck: options.bypassTenantCheck,
            includeDeleted: options.includeDeleted,
          },
        );
        const table = this.core.getTable(collection);
        const where = this.core.mapQuery(table, query as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;

        const db = options?.tx || this.getDb("read");

        const results = await db
          .select()
          .from(table as unknown as import("drizzle-orm/pg-core").PgTable)
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
  private prepareValues(table: any, data: any, id: DatabaseId, now: Date, options: any) {
    const fixedColumns = ["_id", "tenantId", "status", "createdAt", "updatedAt", "data"];

    // Ensure createdAt is a Date object if it was passed as an ISO string
    let createdAt = data.createdAt || now;
    if (typeof createdAt === "string") {
      createdAt = new Date(createdAt);
    }

    const values: any = {
      _id: id,
      tenantId: options?.tenantId || data.tenantId || null,
      status: data.status || "draft",
      createdAt,
      updatedAt: now,
    };

    // Distinguish between dynamic collection tables and static schema tables
    // Dynamic tables created at runtime ONLY have _id, tenantId, data, status, createdAt, updatedAt.
    // Static tables (like content_nodes) have path, nodeType, etc.
    const isDynamicTable = table.data && !table.path;

    if (isDynamicTable) {
      const extra: any = {};
      for (const [k, v] of Object.entries(data)) {
        if (!fixedColumns.includes(k)) {
          extra[k] = v;
        }
      }
      values.data = extra;
    } else {
      // Static table or content_nodes fallback
      // Copy all incoming data fields to values (Drizzle will filter based on actual schema)
      for (const [k, v] of Object.entries(data)) {
        if (!Object.keys(values).includes(k)) {
          values[k] = v;
        }
      }

      // Default values for mandatory content_nodes columns if they are missing
      // Drizzle table objects store columns as properties. We check for existence.
      if (table.path && values.path == null) {
        values.path = id.toString(); // Fallback path
      }
      if (table.nodeType && values.nodeType == null) {
        values.nodeType = "node"; // Fallback type
      }
    }

    return utils.convertISOToDates(values as Record<string, unknown>);
  }

  async insert<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const table = this.core.getTable(collection);
        const id = (data as Partial<T>)._id || (utils.generateId() as DatabaseId);
        const now = new Date(nowISODateString());
        const values = this.prepareValues(table, data, id, now, options || {});

        // 🚀 Fix: Use the transaction if provided, fallback to main connection
        const db = (options as any)?.tx || this.getDb("write");

        await db
          .insert(table as unknown as import("drizzle-orm/pg-core").PgTable)
          .values(values as unknown as Record<string, unknown>);

        // Reuse the findOne prepared statement logic but execute on the correct context
        const [result] = await db
          .select()
          .from(table as unknown as import("drizzle-orm/pg-core").PgTable)
          .where(eq((table as any)._id, id as string))
          .limit(1);

        return utils.convertDatesToISO(result as Record<string, unknown>) as T;
      }, "CRUD_INSERT_FAILED")
      .then((res) => {
        if (!res.success) console.error("CRUD_INSERT_FAILED:", res.error);
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async update<T extends BaseEntity>(
    collection: string,
    id: DatabaseId,
    data: EntityUpdate<T>,
    options?: BaseQueryOptions & { tx?: any },
  ): Promise<DatabaseResult<T>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const secureQuery = safeQuery({ _id: id } as unknown as QueryFilter<T>, options?.tenantId, {
          bypassTenantCheck: options?.bypassTenantCheck,
        });

        const table = this.core.getTable(collection);
        const now = new Date(nowISODateString());
        const updateData = this.prepareValues(table, data, id, now, options || {});
        // Remove immutable fields from update payload
        delete updateData._id;
        delete updateData.tenantId;
        delete updateData.createdAt;

        const db = options?.tx || this.getDb("write");

        // 🚀 OPTIMIZATION: Use Prepared Statement for simple ID updates
        if (this.isSimpleIdQuery(secureQuery) && !options?.tx) {
          const cacheKey = `update:${collection}`;
          let prepared = this.preparedStatements.get(cacheKey);
          if (!prepared) {
            prepared = this.getDb("write")
              .update(table as unknown as import("drizzle-orm/pg-core").PgTable)
              .set(placeholder("data"))
              .where(eq((table as any)._id, placeholder("id")))
              .prepare(cacheKey);
            this.preparedStatements.set(cacheKey, prepared);
          }
          await prepared.execute({ id: id as string, data: updateData });

          // Reuse the findOne prepared statement
          const findCacheKey = `findOne:${collection}`;
          let findPrepared = this.preparedStatements.get(findCacheKey);
          if (!findPrepared) {
            findPrepared = this.getDb("read")
              .select()
              .from(table as unknown as import("drizzle-orm/pg-core").PgTable)
              .where(eq((table as any)._id, placeholder("id")))
              .prepare(findCacheKey);
            this.preparedStatements.set(findCacheKey, findPrepared);
          }
          const [result] = await findPrepared.execute({ id: id as string });
          return utils.convertDatesToISO(result as Record<string, unknown>) as T;
        }

        const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;

        await db
          .update(table as unknown as import("drizzle-orm/pg-core").PgTable)
          .set(updateData as unknown as Record<string, unknown>)
          .where(where);

        const [result] = await db
          .select()
          .from(table as unknown as import("drizzle-orm/pg-core").PgTable)
          .where(where)
          .limit(1);
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
    options: {
      tenantId?: DatabaseId | null | undefined;
      bypassTenantCheck?: boolean;
      permanent?: boolean;
      userId?: string;
      tx?: any;
    } = {},
  ): Promise<DatabaseResult<void>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const query = safeQuery(
          { _id: id } as unknown as QueryFilter<BaseEntity>,
          options.tenantId,
          {
            bypassTenantCheck: options.bypassTenantCheck,
          },
        );

        const db = options?.tx || this.getDb("write");

        // 🚀 OPTIMIZATION: Use Prepared Statement for simple ID deletes
        if (this.isSimpleIdQuery(query) && !options?.tx) {
          const table = this.core.getTable(collection);
          const cacheKey = `delete:${collection}`;
          let prepared = this.preparedStatements.get(cacheKey);
          if (!prepared) {
            prepared = this.getDb("write")
              .delete(table as unknown as import("drizzle-orm/pg-core").PgTable)
              .where(eq((table as any)._id, placeholder("id")))
              .prepare(cacheKey);
            this.preparedStatements.set(cacheKey, prepared);
          }
          await prepared.execute({ id: id as string });
          return;
        }

        const table = this.core.getTable(collection);
        const where = this.core.mapQuery(table, query as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;
        await db.delete(table as unknown as import("drizzle-orm/pg-core").PgTable).where(where);
      }, "CRUD_DELETE_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async restore(
    collection: string,
    _id: DatabaseId,
    _options: {
      tenantId?: DatabaseId | null | undefined;
      bypassTenantCheck?: boolean;
      tx?: any;
    } = {},
  ): Promise<DatabaseResult<void>> {
    return this.core.notImplemented(`crud.restore for ${collection}`);
  }

  async upsert<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityCreate<T>,
    options?: BaseQueryOptions & { tx?: any },
  ): Promise<DatabaseResult<T>> {
    const tenantId = options?.tenantId;
    const bypassTenantCheck = options?.bypassTenantCheck;
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const executeUpsert = async (tx: any) => {
          const secureQuery = safeQuery(query, tenantId, { bypassTenantCheck });
          const table = this.core.getTable(collection);
          const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
            | import("drizzle-orm").SQL
            | undefined;
          const existing = await tx
            .select()
            .from(table as unknown as import("drizzle-orm/pg-core").PgTable)
            .where(where)
            .limit(1);

          if (existing.length > 0) {
            const id = (existing[0] as any)._id as unknown as DatabaseId;
            const now = new Date(nowISODateString());
            const updateData = this.prepareValues(table, data, id, now, options || {});
            delete updateData._id;
            delete updateData.tenantId;
            delete updateData.createdAt;

            const [result] = await tx
              .update(table as unknown as import("drizzle-orm/pg-core").PgTable)
              .set(updateData as unknown as Record<string, unknown>)
              .where(eq((table as any)._id, id as string))
              .returning();

            return utils.convertDatesToISO(result as Record<string, unknown>) as T;
          } else {
            const id = (data as Partial<T>)._id || (utils.generateId() as DatabaseId);
            const now = new Date(nowISODateString());
            const values = this.prepareValues(table, data, id, now, options || {});

            const [result] = await tx
              .insert(table as unknown as import("drizzle-orm/pg-core").PgTable)
              .values(values as unknown as Record<string, unknown>)
              .returning();

            return utils.convertDatesToISO(result as Record<string, unknown>) as T;
          }
        };

        if (options?.tx) {
          return await executeUpsert(options.tx);
        } else {
          return await this.getDb("write").transaction(executeUpsert);
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
    options: {
      tenantId?: DatabaseId | null | undefined;
      bypassTenantCheck?: boolean;
      includeDeleted?: boolean;
      tx?: any;
    } = {},
  ): Promise<DatabaseResult<number>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const secureQuery = safeQuery(query, options.tenantId, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
        });
        const table = this.core.getTable(collection);
        const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;

        const db = options?.tx || this.getDb("read");

        const [result] = await db
          .select({ count: count() })
          .from(table as unknown as import("drizzle-orm/pg-core").PgTable)
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
    options: {
      tenantId?: DatabaseId | null | undefined;
      bypassTenantCheck?: boolean;
      includeDeleted?: boolean;
      tx?: any;
    } = {},
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
    options?: BaseQueryOptions & { tx?: any },
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
          this.prepareValues(
            table,
            d,
            (d as any)._id || (utils.generateId() as DatabaseId),
            now,
            options || {},
          ),
        );

        const db = options?.tx || this.getDb("write");

        await db
          .insert(table as unknown as import("drizzle-orm/pg-core").PgTable)
          .values(values as unknown as Record<string, unknown>[]);

        const ids = values.map((v) => v._id as string);
        const results = await db
          .select()
          .from(table as unknown as import("drizzle-orm/pg-core").PgTable)
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
    options?: BaseQueryOptions & { tx?: any },
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    const tenantId = options?.tenantId as DatabaseId;
    const bypassTenantCheck = options?.bypassTenantCheck;
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const table = this.core.getTable(collection);
        const secureQuery = safeQuery(query, tenantId, { bypassTenantCheck });
        const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;
        const now = new Date(nowISODateString());
        // For updateMany, we don't have an ID, so we pass a dummy ID that will be ignored or we only map fields
        const values = this.prepareValues(table, data, "" as DatabaseId, now, options || {});
        // Remove immutable fields from update payload
        delete values._id;
        delete values.tenantId;
        delete values.createdAt;

        const db = options?.tx || this.getDb("write");

        const result = await db
          .update(table as unknown as import("drizzle-orm/pg-core").PgTable)
          .set(values as unknown as Record<string, unknown>)
          .where(where);
        return { modifiedCount: (result as any).rowCount };
      }, "CRUD_UPDATE_MANY_FAILED")
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async deleteMany(
    collection: string,
    query: QueryFilter<BaseEntity>,
    options: {
      tenantId?: DatabaseId | null | undefined;
      bypassTenantCheck?: boolean;
      permanent?: boolean;
      userId?: string;
      tx?: any;
    } = {},
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const table = this.core.getTable(collection);
        const secureQuery = safeQuery(query, options.tenantId, {
          bypassTenantCheck: options.bypassTenantCheck,
        });
        const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;

        const db = options?.tx || this.getDb("write");

        const result = await db
          .delete(table as unknown as import("drizzle-orm/pg-core").PgTable)
          .where(where);
        return { deletedCount: (result as any).rowCount };
      }, "CRUD_DELETE_MANY_FAILED")
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
    options?: BaseQueryOptions & { tx?: any },
  ): Promise<DatabaseResult<{ upsertedCount: number; modifiedCount: number }>> {
    const tenantId = options?.tenantId;
    const bypassTenantCheck = options?.bypassTenantCheck;
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const executeUpsertMany = async (tx: any) => {
          let upsertedCount = 0;
          let modifiedCount = 0;
          const table = this.core.getTable(collection);

          for (const item of items) {
            const secureQuery = safeQuery(item.query, tenantId, { bypassTenantCheck });
            const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
              | import("drizzle-orm").SQL
              | undefined;

            const existing = await tx
              .select()
              .from(table as unknown as import("drizzle-orm/pg-core").PgTable)
              .where(where)
              .limit(1);

            if (existing.length > 0) {
              const id = (existing[0] as any)._id as unknown as DatabaseId;
              const now = new Date(nowISODateString());
              const updateData = this.prepareValues(table, item.data, id, now, options || {});
              delete updateData._id;
              delete updateData.tenantId;
              delete updateData.createdAt;

              await tx
                .update(table as unknown as import("drizzle-orm/pg-core").PgTable)
                .set(updateData as unknown as Record<string, unknown>)
                .where(eq((table as any)._id, id as string));
              modifiedCount++;
            } else {
              const id = (item.data as Partial<T>)._id || (utils.generateId() as DatabaseId);
              const now = new Date(nowISODateString());
              const values = this.prepareValues(table, item.data, id, now, options || {});

              await tx
                .insert(table as unknown as import("drizzle-orm/pg-core").PgTable)
                .values(values as unknown as Record<string, unknown>);
              upsertedCount++;
            }
          }
          return { upsertedCount, modifiedCount };
        };

        if (options?.tx) {
          return await executeUpsertMany(options.tx);
        } else {
          return await this.getDb("write").transaction(executeUpsertMany);
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
    _options?: BaseQueryOptions,
  ): Promise<DatabaseResult<R[]>> {
    return this.core.notImplemented(`crud.aggregate for ${collection}`);
  }
}
