/**
 * @file src/databases/relational/modules/relational-crud-module.ts
 * @description
 * Unified CRUD module for all SQL-based database adapters.
 * Implements high-performance data access with strict tenant isolation.
 */

import { and, eq, isNull, sql, count as drizzleCount } from "drizzle-orm";
import { logger } from "@utils/logger";
import { safeQuery } from "@src/utils/security/safe-query";
import { generateUUID } from "@utils/native-utils";
import * as utils from "../relational-utils";
import type { BaseSqlAdapter } from "../base-sql-adapter";
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
} from "../../db-interface";

export class RelationalCrudModule implements ICrudAdapter {
  protected preparedStatements = new Map<string, any>();

  constructor(protected adapter: BaseSqlAdapter) {}

  protected get db() {
    return this.adapter.db;
  }

  /**
   * Helper to get the database instance or transaction
   */
  protected getDb(options?: { transaction?: any; tx?: any }) {
    const tx = options?.transaction || options?.tx;
    if (tx) {
      // If we're inside a transaction, use the transaction's DB instance
      return tx.db || tx;
    }
    return this.db;
  }

  /**
   * Identifies if a query is a simple ID/Tenant lookup suitable for prepared statements.
   */
  protected isLookupQuery(query: any): boolean {
    if (!query || typeof query !== "object") return false;
    const keys = Object.keys(query);
    if (keys.length === 0) return false;

    // Simple lookup is _id + (optional) tenantId
    return (
      keys.every((k) => k === "_id" || k === "tenantId" || k === "token") && query._id !== undefined
    );
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

          if (
            (process.env.BENCHMARK_DEBUG === "true" || process.env.TEST_MODE === "true") &&
            ((secureQuery as any).token || (secureQuery as any)._id)
          ) {
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

  async findMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T> = {},
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
            .where(finalWhere);

          if (options.limit) q = q.limit(options.limit);
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

  async insert<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>,
    options: {
      tenantId?: DatabaseId;
      tx?: any;
      transaction?: any;
      bypassTenantCheck?: boolean;
    } = {},
  ): Promise<DatabaseResult<T>> {
    const startTime = performance.now();
    return this.adapter
      .wrap(
        async () => {
          const table = this.adapter.getTable(collection);
          const id = (data as any)._id || generateUUID();
          const now = new Date();

          const values = this.prepareValues(table, data, id, now, options);

          await this.getDb(options)
            .insert(table as any)
            .values(values);

          // Return the inserted object (Drizzle insert doesn't return the object in all dialects easily)
          const result = await this.findOne(collection, { _id: id } as any, options);
          if (!result.success) {
            throw new Error(`Failed to retrieve inserted record: ${result.message}`);
          }
          if (!result.data) {
            throw new Error(`Failed to retrieve inserted record: Not found after insert`);
          }
          return result.data as T;
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
    options: {
      tenantId?: DatabaseId;
      tx?: any;
      transaction?: any;
      bypassTenantCheck?: boolean;
    } = {},
  ): Promise<DatabaseResult<T>> {
    const startTime = performance.now();
    return this.adapter
      .wrap(
        async () => {
          const table = this.adapter.getTable(collection);
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
          // Don't update _id or createdAt
          delete (values as any)._id;
          delete (values as any).createdAt;

          await this.getDb(options)
            .update(table as any)
            .set(values)
            .where(and(...conditions));

          const result = await this.findOne(collection, { _id: id } as any, options);
          if (!result.success) {
            throw new Error(`Failed to retrieve updated record: ${result.message}`);
          }
          if (!result.data) {
            throw new Error(`Failed to retrieve updated record: Not found after update`);
          }
          return result.data as T;
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

          await this.getDb(options)
            .delete(table as any)
            .where(and(...conditions));

          logger.debug(`[RelationalCrud] delete(${collection}, ${id}) conditions:`, conditions);
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

          // 🛡️ SECURITY: If mapQuery returned undefined but secureQuery was NOT empty,
          // it means no fields matched the schema. In this case, we MUST NOT match everything.
          const finalWhere =
            where === undefined && Object.keys(secureQuery).length > 0 ? sql`1 = 0` : where;

          const [resCount] = await this.getDb(options)
            .select({ count: drizzleCount() })
            .from(table as any)
            .where(finalWhere);
          return Number((resCount as any).count);
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
      "nodeType",
      "path",
      "parentId",
      "order",
    ];

    const values: any = {
      _id: id.toString(),
      updatedAt: now,
      tenantId: options.tenantId || null,
    };

    // If it's an insert, set createdAt
    if (!data.updatedAt) {
      values.createdAt = now;
    }

    // Extract non-fixed columns into data blob if the table supports it
    if (table.data) {
      const dynamicData: any = {};
      for (const [k, v] of Object.entries(data)) {
        if (!fixedColumns.includes(k)) {
          dynamicData[k] = v;
        } else {
          values[k] = v;
        }
      }
      values.data = dynamicData;
    } else {
      // Relational schema with fixed columns
      for (const [k, v] of Object.entries(data)) {
        values[k] = v;
      }
    }

    // Ensure system fields are initialized for tree-based tables (like Menu)
    if (table.path !== undefined) {
      // If it's a tree node, ensure parent/path logic
      if (data.parentId) {
        // Parent logic should be handled by the caller or a trigger,
        // but we ensure the field is present.
      }
    }

    return utils.convertISOToDates(values as Record<string, unknown>);
  }

  async restore(collection: string, _id: DatabaseId): Promise<DatabaseResult<void>> {
    return this.adapter.notImplemented(`crud.restore for ${collection}`);
  }

  async upsertMany<T extends BaseEntity>(
    collection: string,
    items: Array<{ query: QueryFilter<T>; data: EntityCreate<T> }>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T[] | { upsertedCount: number; modifiedCount: number }>> {
    const startTime = performance.now();
    return this.adapter
      .wrap(
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
      )
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async upsert<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityCreate<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>> {
    const runInTx = async (tx: any) => {
      // Basic upsert: find existing, then update or insert
      const existingRes = await this.findOne(collection, query, {
        ...(options as any),
        transaction: tx,
      });

      if (existingRes.success && existingRes.data) {
        return (await this.update(collection, existingRes.data._id as DatabaseId, data as any, {
          ...(options as any),
          transaction: tx,
        })) as DatabaseResult<T>;
      } else {
        return (await this.insert(collection, data, {
          ...(options as any),
          transaction: tx,
        })) as DatabaseResult<T>;
      }
    };

    if ((options as any)?.transaction) {
      return runInTx((options as any).transaction);
    }

    return this.adapter.transaction(runInTx);
  }

  async insertMany<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>[],
    options: { tenantId?: DatabaseId; tx?: any; transaction?: any } = {},
  ): Promise<DatabaseResult<T[]>> {
    const startTime = performance.now();

    const execute = async (tx: any): Promise<T[]> => {
      const table = this.adapter.getTable(collection);
      logger.info(`[RelationalCrud] insertMany(${collection}): Processing ${data.length} items...`);
      const now = new Date();
      const results: T[] = [];

      for (const item of data) {
        const id = (item as any)._id || generateUUID();
        const values = this.prepareValues(table, item, id, now, options);
        await tx.db.insert(table as any).values(values);
        results.push({
          ...item,
          _id: id,
          createdAt: now,
          updatedAt: now,
          tenantId: options.tenantId || null,
        } as unknown as T);
      }
      return results;
    };

    if (options.transaction || options.tx) {
      const tx = options.transaction || options.tx;
      return this.adapter
        .wrap(() => execute(tx), "CRUD_INSERT_MANY_FAILED", undefined, {
          isWrite: true,
          transaction: tx,
        })
        .then((res) => {
          if (res.success) res.meta = { executionTime: performance.now() - startTime };
          return res;
        });
    }

    return this.adapter.transaction(async (tx) => {
      const results = await this.adapter.wrap(
        () => execute(tx),
        "CRUD_INSERT_MANY_FAILED",
        undefined,
        {
          isWrite: true,
          transaction: tx,
        },
      );
      return results;
    });
  }

  async updateMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    data: EntityUpdate<T>,
    options: { tenantId?: DatabaseId; tx?: any; transaction?: any } = {},
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    const startTime = performance.now();
    return this.adapter
      .wrap(
        async () => {
          const table = this.adapter.getTable(collection);
          const now = new Date();
          const hasIsDeleted = (table as any).isDeleted !== undefined;

          const secureQuery = safeQuery(query, options.tenantId, {
            includeDeleted: !hasIsDeleted,
          });
          const where = this.adapter.mapQuery(table, secureQuery as Record<string, unknown>) as any;

          const values = this.prepareValues(table, data, "" as any, now, options);
          delete (values as any)._id;
          delete (values as any).createdAt;

          const result = await this.getDb(options)
            .update(table as any)
            .set(values)
            .where(where);

          return { modifiedCount: (result as any)?.changes ?? (result as any)?.rowsAffected ?? 0 };
        },
        "CRUD_UPDATE_MANY_FAILED",
        undefined,
        { isWrite: true, transaction: options?.transaction },
      )
      .then((res) => {
        if (res.success) res.meta = { executionTime: performance.now() - startTime };
        return res;
      });
  }

  async deleteMany<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options: { tenantId?: DatabaseId; tx?: any; transaction?: any } = {},
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    const startTime = performance.now();
    return this.adapter
      .wrap(
        async () => {
          const table = this.adapter.getTable(collection);
          const hasIsDeleted = (table as any).isDeleted !== undefined;

          const secureQuery = safeQuery(query, options.tenantId, {
            includeDeleted: !hasIsDeleted,
          });
          const where = this.adapter.mapQuery(table, secureQuery as Record<string, unknown>) as any;

          const result = await this.getDb(options)
            .delete(table as any)
            .where(where);

          return { deletedCount: (result as any)?.changes ?? (result as any)?.rowsAffected ?? 0 };
        },
        "CRUD_DELETE_MANY_FAILED",
        undefined,
        { isWrite: true, transaction: options?.transaction },
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
    const startTime = performance.now();
    return this.findMany(collection, { _id: { $in: ids } } as any, options).then((res) => {
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

  async aggregate<R = unknown>(
    collection: string,
    pipeline: any[],
    options: { transaction?: any } = {},
  ): Promise<DatabaseResult<R[]>> {
    return this.adapter.wrap(async () => {
      // Basic SQL aggregation support is limited; this usually maps to a raw SQL call or is handled by specific adapters
      logger.warn(
        `[RelationalCrud] aggregate(${collection}) is partially implemented via raw SQL fallback.`,
      );
      // If the first stage is $match, we can convert it to WHERE
      const matchStage = pipeline.find((p) => p.$match)?.$match;
      const countStage = pipeline.find((p) => p.$count);

      if (countStage) {
        const countRes = await this.count(collection, matchStage || {}, options as any);
        if (!countRes.success) throw new Error(countRes.message);
        return [{ [countStage.$count]: countRes.data }] as any;
      }

      return this.adapter.notImplemented(`aggregate for ${collection}`);
    }, "CRUD_AGGREGATE_FAILED");
  }
}
