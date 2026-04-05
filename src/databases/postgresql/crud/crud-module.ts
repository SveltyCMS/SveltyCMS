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
    options: {
      fields?: (keyof T)[];
      tenantId?: DatabaseId | null | undefined;
      bypassTenantCheck?: boolean;
      includeDeleted?: boolean;
    } = {},
  ): Promise<DatabaseResult<T | null>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const secureQuery = safeQuery(query, options.tenantId, {
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
        const results = await this.db
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
        let q = this.db
          .select()
          .from(table as unknown as import("drizzle-orm/pg-core").PgTable)
          .where(where)
          .$dynamic();
        if (options.limit) {
          q = q.limit(options.limit);
        }
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
        const results = await this.db
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

  async insert<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>> {
    const tenantId = options?.tenantId;

    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const table = this.core.getTable(collection);
        const id = (data as Partial<T>)._id || (utils.generateId() as DatabaseId);
        const now = new Date(nowISODateString());
        const values = {
          ...data,
          _id: id,
          tenantId: tenantId || (data as any).tenantId,
          createdAt: now,
          updatedAt: now,
        };

        await this.db
          .insert(table as unknown as import("drizzle-orm/pg-core").PgTable)
          .values(values as unknown as Record<string, unknown>);

        // Reuse the findOne prepared statement for the result
        const findCacheKey = `findOne:${collection}`;
        let findPrepared = this.preparedStatements.get(findCacheKey);
        if (!findPrepared) {
          findPrepared = this.db
            .select()
            .from(table as unknown as import("drizzle-orm/pg-core").PgTable)
            .where(eq((table as any)._id, placeholder("id")))
            .prepare(findCacheKey);
          this.preparedStatements.set(findCacheKey, findPrepared);
        }
        const [result] = await findPrepared.execute({ id: id as string });

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
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const secureQuery = safeQuery({ _id: id } as unknown as QueryFilter<T>, options?.tenantId, {
          bypassTenantCheck: options?.bypassTenantCheck,
        });

        const table = this.core.getTable(collection);
        const now = new Date(nowISODateString());
        const updateData = { ...data, updatedAt: now };

        // 🚀 OPTIMIZATION: Use Prepared Statement for simple ID updates
        if (this.isSimpleIdQuery(secureQuery)) {
          const cacheKey = `update:${collection}`;
          let prepared = this.preparedStatements.get(cacheKey);
          if (!prepared) {
            prepared = this.db
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
            findPrepared = this.db
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

        await this.db
          .update(table as unknown as import("drizzle-orm/pg-core").PgTable)
          .set(updateData as unknown as Record<string, unknown>)
          .where(where);

        const [result] = await this.db
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

        // 🚀 OPTIMIZATION: Use Prepared Statement for simple ID deletes
        if (this.isSimpleIdQuery(query)) {
          const table = this.core.getTable(collection);
          const cacheKey = `delete:${collection}`;
          let prepared = this.preparedStatements.get(cacheKey);
          if (!prepared) {
            prepared = this.db
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
        await this.db
          .delete(table as unknown as import("drizzle-orm/pg-core").PgTable)
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
    _options: { tenantId?: DatabaseId | null | undefined; bypassTenantCheck?: boolean } = {},
  ): Promise<DatabaseResult<void>> {
    return this.core.notImplemented(`crud.restore for ${collection}`);
  }

  async upsert<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityCreate<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>> {
    const tenantId = options?.tenantId;
    const bypassTenantCheck = options?.bypassTenantCheck;
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        const secureQuery = safeQuery(query, tenantId, { bypassTenantCheck });
        const table = this.core.getTable(collection);
        const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;
        const existing = await this.db
          .select()
          .from(table as unknown as import("drizzle-orm/pg-core").PgTable)
          .where(where)
          .limit(1);

        if (existing.length > 0) {
          const res = await this.update<T>(
            collection,
            (existing[0] as any)._id as unknown as DatabaseId,
            data as EntityUpdate<T>,
            { tenantId: tenantId as any, bypassTenantCheck },
          );
          if (!res.success) {
            throw res.error;
          }
          return res.data;
        }
        const res = await this.insert<T>(collection, data, {
          tenantId: tenantId as any,
          bypassTenantCheck,
        });
        if (!res.success) {
          throw res.error;
        }
        return res.data;
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
        const [result] = await this.db
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
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T[]>> {
    const tenantId = options?.tenantId;

    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        if (data.length === 0) {
          return [];
        }
        const table = this.core.getTable(collection);
        const now = new Date(nowISODateString());
        const values = data.map((d) => ({
          ...d,
          _id: utils.generateId() as DatabaseId,
          tenantId: tenantId || (d as any).tenantId,
          createdAt: now,
          updatedAt: now,
        }));
        await this.db
          .insert(table as unknown as import("drizzle-orm/pg-core").PgTable)
          .values(values as unknown as Record<string, unknown>[]);

        const ids = values.map((v) => v._id as string);
        const results = await this.db
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
    options?: BaseQueryOptions,
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
        const result = await this.db
          .update(table as unknown as import("drizzle-orm/pg-core").PgTable)
          .set({ ...data, updatedAt: now } as unknown as Record<string, unknown>)
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
        const result = await this.db
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
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ upsertedCount: number; modifiedCount: number }>> {
    const tenantId = options?.tenantId;
    const bypassTenantCheck = options?.bypassTenantCheck;
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        let upsertedCount = 0;
        let modifiedCount = 0;
        for (const item of items) {
          const existing = await this.findOne(collection, item.query, {
            tenantId: tenantId as any,
            bypassTenantCheck,
          });
          if (existing.success && existing.data) {
            await this.update(
              collection,
              (existing.data as any)._id,
              item.data as EntityUpdate<T>,
              { tenantId: tenantId as any, bypassTenantCheck },
            );
            modifiedCount++;
          } else {
            await this.insert(collection, item.data, {
              tenantId: tenantId as any,
              bypassTenantCheck,
            });
            upsertedCount++;
          }
        }
        return { upsertedCount, modifiedCount };
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
