/**
 * @file src/databases/postgresql/operations/batch-module.ts
 * @description Batch operations module for PostgreSQL
 */

import { inArray, sql } from "drizzle-orm";
import type {
  BaseEntity,
  BatchOperation,
  BatchResult,
  DatabaseId,
  DatabaseResult,
  IBatchAdapter,
} from "../db-interface";
import type { PostgresAdapterCore } from "./adapter-core";

export class BatchModule implements IBatchAdapter {
  private readonly core: PostgresAdapterCore;

  constructor(core: PostgresAdapterCore) {
    this.core = core;
  }

  private get db() {
    return this.core.db!;
  }

  async execute<T>(operations: BatchOperation<T>[]): Promise<DatabaseResult<BatchResult<T>>> {
    return this.core.wrap(async () => {
      const results: DatabaseResult<T>[] = [];
      for (const op of operations) {
        let res: DatabaseResult<T | undefined>;
        switch (op.operation) {
          case "insert":
            res = await this.core.crud.insert(
              op.collection,
              op.data as Omit<T & BaseEntity, "_id" | "createdAt" | "updatedAt">,
            );
            break;
          case "update":
            res = await this.core.crud.update(
              op.collection,
              op.id as DatabaseId,
              op.data as Partial<Omit<T & BaseEntity, "_id" | "createdAt" | "updatedAt">>,
            );
            break;
          case "delete":
            res = (await this.core.crud.delete(
              op.collection,
              op.id as DatabaseId,
            )) as unknown as DatabaseResult<undefined>;
            break;
          case "upsert":
            res = (await this.core.crud.upsert(
              op.collection,
              op.query || {},
              op.data as Omit<T & BaseEntity, "_id" | "createdAt" | "updatedAt">,
            )) as unknown as DatabaseResult<T>;
            break;
          default:
            res = {
              success: false,
              message: `Unknown operation: ${op.operation}`,
              error: {
                code: "UNKNOWN_OPERATION",
                message: `Unknown operation: ${op.operation}`,
              },
            };
        }
        results.push(res as DatabaseResult<T>);
      }
      return {
        success: results.every((r) => r.success),
        results,
        totalProcessed: operations.length,
        errors: results
          .filter((r) => !r.success)
          .map((r) => (r as Extract<DatabaseResult<T>, { success: false }>).error),
      };
    }, "BATCH_EXECUTE_FAILED");
  }

  async bulkInsert<T extends BaseEntity>(
    collection: string,
    items: import("../db-interface").EntityCreate<T>[],
  ): Promise<DatabaseResult<T[]>> {
    if (!items || items.length === 0) return { success: true, data: [] };

    // 🚀 Performance: For small batches, use direct insertMany
    if (items.length <= 100) {
      return this.core.crud.insertMany<T>(collection, items);
    }

    // 🚀  Chunked batch processing for massive datasets
    return this.core.wrap(async () => {
      const results: T[] = [];
      const chunkSize = 500; // Optimal for balancing latency and throughput

      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const res = await this.core.crud.insertMany<T>(collection, chunk);
        if (res.success && res.data) {
          results.push(...res.data);
        } else if (!res.success) {
          throw new Error(res.message);
        }
      }
      return results;
    }, "BULK_INSERT_FAILED");
  }

  async bulkUpdate<T extends BaseEntity>(
    collection: string,
    updates: Array<{ id: DatabaseId; data: Partial<T> }>,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.core.wrap(async () => {
      let modifiedCount = 0;
      for (const update of updates) {
        const res = await this.core.crud.update(
          collection,
          update.id,
          update.data as Partial<Omit<T, "_id" | "createdAt" | "updatedAt">>,
        );
        if (res.success) {
          modifiedCount++;
        }
      }
      return { modifiedCount };
    }, "BULK_UPDATE_FAILED");
  }

  async bulkDelete(
    collection: string,
    ids: DatabaseId[],
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    return this.core.wrap(async () => {
      const table = this.core.getTable(collection);
      const results = await this.db
        .delete(table as unknown as import("drizzle-orm/pg-core").PgTable)
        .where(
          inArray(
            (
              table as unknown as {
                _id: import("drizzle-orm/pg-core").PgColumn;
              }
            )._id,
            ids as string[],
          ),
        )
        .returning();
      return { deletedCount: results.length };
    }, "BULK_DELETE_FAILED");
  }

  async bulkUpsert<T extends BaseEntity>(
    collection: string,
    items: Array<Partial<T> & { id?: DatabaseId }>,
  ): Promise<DatabaseResult<T[]>> {
    if (!items || items.length === 0) return { success: true, data: [] };

    return this.core.wrap(async () => {
      const table = this.core.getTable(collection);
      const now = new Date();

      const values = items.map((item) => {
        const id = item.id || (item as any)._id || (this.core as any).generateUUID();
        return (this.core as any).prepareValues(table, item, id, now, {});
      });

      // 🚀 Native PostgreSQL UPSERT (ON CONFLICT DO UPDATE)
      const results = await this.db
        .insert(table as any)
        .values(values)
        .onConflictDoUpdate({
          target: (table as any)._id,
          set: {
            data: sql`EXCLUDED.data`,
            updatedAt: now,
          },
        })
        .returning();

      return (this.core as any).utils.convertDatesToISO(results) as T[];
    }, "BULK_UPSERT_FAILED");
  }
}
