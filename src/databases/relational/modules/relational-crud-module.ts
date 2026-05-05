/**
 * @file src/databases/relational/modules/relational-crud-module.ts
 * @description
 * Unified CRUD module for all SQL-based database adapters (SQLite, MariaDB, PostgreSQL).
 * This class abstracts the common logic for interacting with Drizzle ORM.
 */

import { nowISODateString } from "@src/utils/date";
import { safeQuery } from "@src/utils/security/safe-query";
import { logger } from "@utils/logger";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import type {
  BaseEntity,
  DatabaseId,
  DatabaseResult,
  QueryFilter,
  EntityCreate,
  EntityUpdate,
  BaseQueryOptions,
  FindOptions,
  ICrudAdapter,
} from "../../db-interface";
import type { BaseSqlAdapter } from "../base-sql-adapter";
import * as utils from "../relational-utils";

export class RelationalCrudModule implements ICrudAdapter {
  protected readonly adapter: BaseSqlAdapter;
  protected readonly preparedStatements = new Map<string, any>();

  constructor(adapter: BaseSqlAdapter) {
    this.adapter = adapter;
  }

  /**
   * Helper to determine if a query is a simple ID lookup (optionally with tenantId and isDeleted).
   */
  protected isLookupQuery(query: any): boolean {
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
  protected isTenantQuery(query: any): boolean {
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

  protected get db() {
    const db = (this.adapter as any).db;
    if (!db) {
      throw new Error(
        `[RelationalCrudModule] Database instance (db) is undefined on adapter ${this.adapter.constructor.name}. Ensure connect() has completed.`,
      );
    }
    return db;
  }

  protected getDb(options?: BaseQueryOptions) {
    const tx = options?.transaction;
    if (tx) {
      return tx.db || tx;
    }
    return this.db;
  }

  async findOne<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T | null>> {
    const startTime = performance.now();
    return this.adapter
      .wrap(
        async () => {
          const table = this.adapter.getTable(collection);
          const hasIsDeleted = (table as any).isDeleted !== undefined;

          const secureQuery = safeQuery(query, options.tenantId, {
            bypassTenantCheck: options.bypassTenantCheck,
            includeDeleted: options.includeDeleted || !hasIsDeleted,
          });
          const where = this.adapter.mapQuery(table, secureQuery as Record<string, unknown>) as any;

          if ((secureQuery as any).token || (secureQuery as any)._id) {
            logger.debug(
              `[RelationalCrud] findOne(${collection}) where: ${JSON.stringify(typeof where === "object" ? Object.keys(where) : where)}, secureQuery: ${JSON.stringify(Object.keys(secureQuery))}`,
            );
          }

          // 🛡️ SECURITY: If mapQuery returned undefined but secureQuery was NOT empty,
          // it means no fields matched the schema. In this case, we MUST NOT match everything.
          const finalWhere =
            where === undefined && Object.keys(secureQuery).length > 0 ? sql`1 = 0` : where;

          const results = await this.getDb(options)
            .select()
            .from(table as any)
            .where(finalWhere)
            .limit(1);

          const data =
            results.length === 0
              ? null
              : (utils.convertDatesToISO(results[0] as Record<string, unknown>) as T);
          return data;
        },
        "CRUD_FIND_ONE_FAILED",
        undefined,
        { transaction: options?.transaction },
      )
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async find<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T[]>> {
    return this.findMany(collection, query, options);
  }

  async findMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T[]>> {
    const startTime = performance.now();
    return this.adapter
      .wrap(
        async () => {
          const table = this.adapter.getTable(collection);
          const hasIsDeleted = (table as any).isDeleted !== undefined;

          const secureQuery = safeQuery(query, options.tenantId, {
            bypassTenantCheck: options.bypassTenantCheck,
            includeDeleted: options.includeDeleted || !hasIsDeleted,
          });
          const where = this.adapter.mapQuery(table, secureQuery as Record<string, unknown>) as any;

          // 🛡️ SECURITY: If mapQuery returned undefined but secureQuery was NOT empty,
          // it means no fields matched the schema. In this case, we MUST NOT match everything.
          const finalWhere =
            where === undefined && Object.keys(secureQuery).length > 0 ? sql`1 = 0` : where;

          let q = this.getDb(options)
            .select()
            .from(table as any)
            .where(finalWhere)
            .$dynamic();

          q = q.limit(options.limit || 1000);
          if (options.offset) q = q.offset(options.offset);

          const results = await q;
          return utils.convertArrayDatesToISO(results as Record<string, unknown>[]) as T[];
        },
        "CRUD_FIND_MANY_FAILED",
        undefined,
        { transaction: options?.transaction },
      )
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
    return this.findMany(collection, { _id: { $in: ids } } as any, options);
  }

  async insert<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>> {
    const startTime = performance.now();
    return this.adapter
      .wrap(
        async () => {
          const table = this.adapter.getTable(collection);
          const id = (data as Partial<T>)._id || utils.generateId();
          const now = new Date(nowISODateString());
          const values = this.prepareValues(table, data, id, now, options || {});

          const db = this.getDb(options);

          // Some adapters support .returning(), others don't (handled by sub-classes if needed)
          const insertQuery = db.insert(table as any).values(values as any);

          if (insertQuery.returning) {
            const [result] = await insertQuery.returning();
            return utils.convertDatesToISO(result as Record<string, unknown>) as T;
          } else {
            await insertQuery;
            const res = await this.findOne(collection, { _id: id } as any, options);
            if (!res.success) throw res.error;
            return res.data as T;
          }
        },
        "CRUD_INSERT_FAILED",
        undefined,
        { isWrite: true, transaction: options?.transaction },
      )
      .then((res) => {
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
    return this.adapter
      .wrap(
        async () => {
          const table = this.adapter.getTable(collection);
          const now = new Date(nowISODateString());
          const values = this.prepareValues(table, data, id, now, options || {});

          // Remove immutable fields
          delete values._id;
          delete values.tenantId;
          delete values.createdAt;

          const db = this.getDb(options);
          const conditions = [eq((table as any)._id, id as string)];
          if (options?.tenantId !== undefined) {
            conditions.push(
              options.tenantId === null
                ? isNull((table as any).tenantId)
                : eq((table as any).tenantId, options.tenantId as string),
            );
          }

          const updateQuery = db
            .update(table as any)
            .set(values as any)
            .where(and(...conditions));

          if (updateQuery.returning) {
            const [result] = await updateQuery.returning();
            return utils.convertDatesToISO(result as Record<string, unknown>) as T;
          } else {
            await updateQuery;
            const res = await this.findOne(collection, { _id: id } as any, options);
            if (!res.success) throw res.error;
            return res.data as T;
          }
        },
        "CRUD_UPDATE_FAILED",
        undefined,
        { isWrite: true, transaction: options?.transaction },
      )
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async delete(
    collection: string,
    id: DatabaseId,
    options: { tenantId?: DatabaseId; bypassTenantCheck?: boolean; tx?: any } = {},
  ): Promise<DatabaseResult<void>> {
    const startTime = performance.now();
    return this.adapter
      .wrap(
        async () => {
          const table = this.adapter.getTable(collection);
          const conditions = [eq((table as any)._id, id as string)];

          if (options.tenantId !== undefined) {
            conditions.push(
              options.tenantId === null
                ? isNull((table as any).tenantId)
                : eq((table as any).tenantId, options.tenantId as string),
            );
          }

          await this.getDb(options as any)
            .delete(table as any)
            .where(and(...conditions));

          logger.debug(
            `[RelationalCrud] delete(${collection}, ${id}) conditions: ${JSON.stringify(conditions)}`,
          );
        },
        "CRUD_DELETE_FAILED",
        undefined,
        { isWrite: true, transaction: (options as any)?.transaction || (options as any)?.tx },
      )
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async count<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T> = {},
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<number>> {
    const startTime = performance.now();
    return this.adapter
      .wrap(
        async () => {
          const table = this.adapter.getTable(collection);
          const hasIsDeleted = (table as any).isDeleted !== undefined;

          const secureQuery = safeQuery(query, options.tenantId, {
            bypassTenantCheck: options.bypassTenantCheck,
            includeDeleted: options.includeDeleted || !hasIsDeleted,
          });
          const where = this.adapter.mapQuery(table, secureQuery as Record<string, unknown>) as any;

          const [result] = await this.getDb(options)
            .select({ count: count() })
            .from(table as any)
            .where(where);
          return Number((result as any).count);
        },
        "CRUD_COUNT_FAILED",
        undefined,
        { transaction: options?.transaction },
      )
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async exists<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<boolean>> {
    const res = await this.count(collection, query, options);
    if (!res.success) return { success: false, error: res.error, message: res.message };
    return { success: true, data: (res.data ?? 0) > 0 };
  }

  /**
   * Prepares values for insert/update by separating fixed schema columns from dynamic data.
   */
  protected prepareValues(table: any, data: any, id: DatabaseId, now: Date, options: any) {
    const fixedColumns = [
      "_id",
      "tenantId",
      "status",
      "isDeleted",
      "createdAt",
      "updatedAt",
      "data",
    ];

    let createdAt = data.createdAt || now;
    if (typeof createdAt === "string") createdAt = new Date(createdAt);

    const values: any = {
      _id: id,
      tenantId: options?.tenantId || data.tenantId || null,
      status: data.status || "draft",
      createdAt,
      updatedAt: now,
    };

    if (table.isDeleted) {
      values.isDeleted = data.isDeleted ?? false;
    }

    const isDynamicTable = table.data && !table.path;

    if (isDynamicTable) {
      const extra: any = {};
      for (const [k, v] of Object.entries(data)) {
        if (!fixedColumns.includes(k)) extra[k] = v;
      }
      values.data = extra;
    } else {
      for (const [k, v] of Object.entries(data)) {
        if (!Object.keys(values).includes(k)) values[k] = v;
      }
      if (table.path && values.path == null) values.path = id.toString();
      if (table.nodeType && values.nodeType == null) values.nodeType = "node";
    }

    return utils.convertISOToDates(values as Record<string, unknown>);
  }

  async restore(collection: string, _id: DatabaseId): Promise<DatabaseResult<void>> {
    return this.adapter.notImplemented(`crud.restore for ${collection}`);
  }

  async upsert<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityCreate<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>> {
    const runInTx = async (tx: any) => {
      // Basic upsert: find existing, then update or insert
      const existing = await this.findOne(collection, query, { ...options, transaction: tx });
      if (existing.success && existing.data) {
        return this.update(collection, existing.data._id, data, {
          ...options,
          transaction: tx,
        }) as Promise<DatabaseResult<T>>;
      } else {
        return this.insert(collection, data, { ...options, transaction: tx }) as Promise<
          DatabaseResult<T>
        >;
      }
    };

    // 🛡️ RE-ENTRANCE GUARD: Use existing transaction if provided to avoid Deadlock
    const tx = options?.transaction || (options as any)?.tx;
    if (tx) {
      return runInTx(tx) as Promise<DatabaseResult<T>>;
    }

    return this.adapter.transaction(runInTx);
  }

  async insertMany<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>[],
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T[]>> {
    const startTime = performance.now();

    const runInTx = async (tx: any) => {
      const table = this.adapter.getTable(collection);
      const now = new Date(nowISODateString());

      const valuesBatch = data.map((item) => {
        const id = (item as any)._id || utils.generateId();
        return this.prepareValues(table, item, id, now, options || {});
      });

      // Use the transaction-bound database if available, or the main one
      const db = tx?.db || this.getDb(options);

      // 🚀 Performance: Drizzle native batch insert
      const insertQuery = db.insert(table as any).values(valuesBatch as any);

      if (insertQuery.returning) {
        const results = await insertQuery.returning();
        return {
          success: true as const,
          data: utils.convertArrayDatesToISO(results as Record<string, unknown>[]) as T[],
          meta: { executionTime: performance.now() - startTime },
        };
      } else {
        await insertQuery;
        // 🚀 OPTIMIZATION: Avoid expensive re-fetch for large batches if not requested
        if (valuesBatch.length > 100) {
          return {
            success: true as const,
            data: utils.convertArrayDatesToISO(valuesBatch as Record<string, unknown>[]) as T[],
            meta: { executionTime: performance.now() - startTime },
          };
        }
        // Fallback for SQL engines without .returning() support
        const ids = valuesBatch.map((v) => v._id);
        return this.findMany(collection, { _id: { $in: ids } } as any, {
          ...options,
          transaction: tx || options?.transaction,
        });
      }
    };

    // 🛡️ RE-ENTRANCE GUARD: Use existing transaction if provided to avoid Deadlock
    const tx = options?.transaction || (options as any)?.tx;
    if (tx) {
      return runInTx(tx) as Promise<DatabaseResult<T[]>>;
    }

    return this.adapter.transaction(runInTx) as any;
  }

  async updateMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityUpdate<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    const startTime = performance.now();
    return this.adapter
      .wrap(
        async () => {
          const table = this.adapter.getTable(collection);
          const hasIsDeleted = (table as any).isDeleted !== undefined;

          const secureQuery = safeQuery(query as any, options?.tenantId, {
            bypassTenantCheck: options?.bypassTenantCheck,
            includeDeleted: options?.includeDeleted || !hasIsDeleted,
          });
          const where = this.adapter.mapQuery(table, secureQuery as Record<string, unknown>) as any;

          const now = new Date(nowISODateString());
          const values = this.prepareValues(table, data, "temp-id" as any, now, options || {});

          // Remove immutable fields
          delete values._id;
          delete values.tenantId;
          delete values.createdAt;

          const db = this.getDb(options);
          const updateQuery = db
            .update(table as any)
            .set(values as any)
            .where(where);

          if (updateQuery.returning) {
            const results = await updateQuery.returning();
            return { modifiedCount: results.length };
          } else {
            const res = await updateQuery;
            return { modifiedCount: (res as any)?.changes ?? 0 };
          }
        },
        "CRUD_UPDATE_MANY_FAILED",
        undefined,
        { isWrite: true, transaction: options?.transaction },
      )
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res as any;
      });
  }

  async deleteMany(
    collection: string,
    query: QueryFilter<BaseEntity>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    const startTime = performance.now();
    return this.adapter
      .wrap(
        async () => {
          const table = this.adapter.getTable(collection);
          const hasIsDeleted = (table as any).isDeleted !== undefined;

          const secureQuery = safeQuery(query as any, options?.tenantId, {
            bypassTenantCheck: options?.bypassTenantCheck,
            includeDeleted: options?.includeDeleted || !hasIsDeleted,
          });
          const where = this.adapter.mapQuery(table, secureQuery as Record<string, unknown>) as any;

          const db = this.getDb(options);
          const deleteQuery = db.delete(table as any).where(where);

          if (deleteQuery.returning) {
            const results = await deleteQuery.returning();
            return { deletedCount: results.length };
          } else {
            const res = await deleteQuery;
            return { deletedCount: (res as any)?.changes ?? 0 };
          }
        },
        "CRUD_DELETE_MANY_FAILED",
        undefined,
        { isWrite: true, transaction: options?.transaction },
      )
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res as any;
      });
  }

  async upsertMany<T extends BaseEntity>(
    collection: string,
    items: Array<{ query: QueryFilter<T>; data: EntityCreate<T> }>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<{ upsertedCount: number; modifiedCount: number }>> {
    // Upsert many logic

    const runInTx = async (tx: any) => {
      let upsertedCount = 0;
      let modifiedCount = 0;
      for (const item of items) {
        const existing = await this.findOne(collection, item.query, {
          ...options,
          transaction: tx,
        });
        if (existing.success && existing.data) {
          await this.update(collection, existing.data._id, item.data, {
            ...options,
            transaction: tx,
          });
          modifiedCount++;
        } else {
          await this.insert(collection, item.data, {
            ...options,
            transaction: tx,
          });
          upsertedCount++;
        }
      }
      return { success: true as const, data: { upsertedCount, modifiedCount } };
    };

    // 🛡️ RE-ENTRANCE GUARD: Use existing transaction if provided to avoid Deadlock
    // 🛡️ RE-ENTRANCE GUARD: Use existing transaction if provided to avoid Deadlock
    const tx = options?.transaction || (options as any)?.tx;
    if (tx) {
      return runInTx(tx) as Promise<
        DatabaseResult<{ upsertedCount: number; modifiedCount: number }>
      >;
    }

    return this.adapter.transaction(runInTx);
  }

  async aggregate<R = unknown>(
    collection: string,
    _pipeline: unknown[],
    _options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<R[]>> {
    return this.adapter.notImplemented(`crud.aggregate for ${collection}`);
  }
}
