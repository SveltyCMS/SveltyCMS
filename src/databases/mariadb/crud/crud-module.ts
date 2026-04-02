/**
 * @file src/databases/mariadb/crud/crud-module.ts
 * @description CRUD operations module for MariaDB.
 */

import { nowISODateString } from "@src/utils/date-utils";
import { safeQuery } from "@src/utils/security/safe-query";
import { count, eq, inArray } from "drizzle-orm";
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

  constructor(core: AdapterCore) {
    this.core = core;
  }

  private get db() {
    return this.core.db!;
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
        const table = this.core.getTable(collection);
        const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;
        const results = await this.db
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
          .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
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
          .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
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
        const values = {
          ...data,
          _id: id,
          tenantId: options.tenantId || (data as any).tenantId,
          createdAt: now,
          updatedAt: now,
        };

        await this.db
          .insert(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
          .values(values as unknown as Record<string, unknown>);

        const [result] = await this.db
          .select()
          .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
          .where(eq((table as any)._id, id as string))
          .limit(1);

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
        const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;
        const now = new Date(nowISODateString());

        await this.db
          .update(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
          .set({ ...data, updatedAt: now } as unknown as Record<string, unknown>)
          .where(where);

        const [result] = await this.db
          .select()
          .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
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
        const table = this.core.getTable(collection);
        const where = this.core.mapQuery(table, query as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;
        await this.db
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
        const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as
          | import("drizzle-orm").SQL
          | undefined;
        const existing = await this.db
          .select()
          .from(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
          .where(where)
          .limit(1);

        if (existing.length > 0) {
          const res = await this.update<T>(
            collection,
            (existing[0] as any)._id as unknown as DatabaseId,
            data as Partial<T>,
            options,
          );
          if (!res.success) {
            throw res.error;
          }
          return res.data;
        }
        const res = await this.insert<T>(collection, data, options);
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
        const values = data.map((d) => ({
          ...d,
          _id: utils.generateId() as DatabaseId,
          tenantId: options.tenantId || (d as any).tenantId,
          createdAt: now,
          updatedAt: now,
        }));
        await this.db
          .insert(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
          .values(values as unknown as Record<string, unknown>[]);

        const ids = values.map((v) => v._id as string);
        const results = await this.db
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
        const result = await this.db
          .update(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
          .set({ ...data, updatedAt: now } as unknown as Record<string, unknown>)
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
          .delete(table as unknown as import("drizzle-orm/mysql-core").MySqlTable)
          .where(where);
        return { deletedCount: (result as any).affectedRows };
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
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<{ upsertedCount: number; modifiedCount: number }>> {
    const startTime = performance.now();
    return this.core
      .wrap(async () => {
        let upsertedCount = 0;
        let modifiedCount = 0;
        for (const item of items) {
          const existing = await this.findOne(collection, item.query, options);
          if (existing.success && existing.data) {
            await this.update(
              collection,
              (existing.data as any)._id,
              item.data as Partial<T>,
              options,
            );
            modifiedCount++;
          } else {
            await this.insert(collection, item.data, options);
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
    _options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<R[]>> {
    return this.core.notImplemented(`crud.aggregate for ${collection}`);
  }
}
