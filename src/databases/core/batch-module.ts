/**
 * @file src/databases/sqlite/operations/batch-module.ts
 * @description Batch operations module for SQLite
 *
 * Features:
 * - Execute batch operations
 * - Bulk insert
 * - Bulk update
 * - Bulk delete
 * - Bulk upsert
 */

import { isoDateStringToDate, nowISODateString } from "@src/utils/date";
import { eq, inArray } from "drizzle-orm";
import type {
  BaseEntity,
  BatchOperation,
  BatchResult,
  DatabaseError,
  DatabaseId,
  DatabaseResult,
  ISqlAdapter,
} from "../db-interface";
import * as utils from "./relational-utils";

import { DatabaseModule } from "../core/base-adapter";

export class BatchModule extends DatabaseModule<ISqlAdapter> {
  constructor(core: ISqlAdapter) {
    super(core);
  }

  protected get core() {
    return this.adapter;
  }

  private get crud() {
    return this.core.crud;
  }

  async execute<T>(operations: BatchOperation<T>[]): Promise<DatabaseResult<BatchResult<T>>> {
    return this.core.wrap(async () => {
      const results: DatabaseResult<T>[] = [];
      let totalProcessed = 0;
      const errors: DatabaseError[] = [];

      // 🚀 Write-Queue Coalescing: Group same-collection + same-operation items
      // to use bulk SQL (INSERT ... VALUES (...), (...)) instead of N sequential
      // round-trips. This transforms O(N) mutex acquisitions into O(groups).
      // 🛡️ MULTI-TENANT ISOLATION: Reject batches containing mixed tenantIds.
      // Without this guard, coalescing across tenants sharing a DB instance
      // could cause cross-tenant data leaks.
      let batchTenantId: string | null = null;
      for (const op of operations) {
        const opTenant = (op as any).tenantId || null;
        if (batchTenantId === null) {
          batchTenantId = opTenant;
        } else if (opTenant && opTenant !== batchTenantId) {
          throw new Error(
            `[SECURITY] Batch contains mixed tenantIds: ${batchTenantId} vs ${opTenant}. Cross-tenant coalescing rejected.`,
          );
        }
      }

      const groups = new Map<string, BatchOperation<T>[]>();
      for (const op of operations) {
        const key = `${op.operation}:${op.collection}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(op);
      }

      for (const [, ops] of groups) {
        const operation = ops[0].operation;
        const collection = ops[0].collection;
        try {
          // Coalesce: use bulk methods for groups of same-collection inserts/deletes
          if (operation === "insert" && ops.length > 1) {
            const items = ops.map(
              (op) => op.data as Omit<T & BaseEntity, "_id" | "createdAt" | "updatedAt">,
            );
            const bulkRes = await this.crud.insertMany(collection, items);
            if (bulkRes.success && bulkRes.data) {
              for (const item of bulkRes.data) {
                results.push({
                  success: true,
                  data: item,
                } as DatabaseResult<T>);
                totalProcessed++;
              }
            } else if (!bulkRes.success) {
              errors.push((bulkRes as any).error!);
            }
            continue;
          }
          if (operation === "delete" && ops.length > 1) {
            const ids = ops.map((op) => op.id!);
            const deleteRes = await this.crud.deleteMany(collection, {
              _id: { $in: ids },
            } as any);
            if (deleteRes.success) {
              for (const id of ids) {
                results.push({
                  success: true,
                  data: { _id: id },
                } as DatabaseResult<T>);
                totalProcessed++;
              }
            } else {
              errors.push(deleteRes.error!);
              for (let i = 0; i < ids.length; i++) {
                results.push({
                  success: false,
                  message: deleteRes.message,
                  error: deleteRes.error,
                });
              }
            }
            continue;
          }

          // Fallback: individual ops for updates, upserts, or single-item groups
          for (const op of ops) {
            const res = await this.executeSingleOp(collection, op);
            results.push(res as DatabaseResult<T>);
            if (res.success) totalProcessed++;
            else if (res.error) errors.push(res.error);
          }
        } catch (error) {
          const dbError = utils.createDatabaseError(
            "BATCH_OP_FAILED",
            error instanceof Error ? error.message : String(error),
            error,
          );
          for (let i = 0; i < ops.length; i++) {
            results.push({
              success: false,
              message: dbError.message,
              error: dbError,
            });
          }
          errors.push(dbError);
        }
      }

      return {
        success: errors.length === 0,
        results,
        totalProcessed,
        errors,
      };
    }, "BATCH_EXECUTE_FAILED");
  }

  private async executeSingleOp<T extends BaseEntity>(
    collection: string,
    op: BatchOperation<T>,
  ): Promise<DatabaseResult<T | undefined>> {
    switch (op.operation) {
      case "insert":
        return await this.crud.insert(
          collection,
          op.data as Omit<T & BaseEntity, "_id" | "createdAt" | "updatedAt">,
        );
      case "update":
        if (!op.id) throw new Error("ID required for update operation");
        return await this.crud.update(
          collection,
          op.id,
          op.data as Partial<Omit<T & BaseEntity, "_id" | "createdAt" | "updatedAt">>,
        );
      case "delete":
        if (!op.id) throw new Error("ID required for delete operation");
        return (await this.crud.delete(collection, op.id)) as unknown as DatabaseResult<undefined>;
      case "upsert":
        if (!(op.query && op.data)) throw new Error("Query and data required");
        return await this.crud.upsert(
          collection,
          op.query as import("../db-interface").QueryFilter<T & BaseEntity>,
          op.data as Omit<T & BaseEntity, "_id" | "createdAt" | "updatedAt">,
        );
      default:
        throw new Error(`Unsupported batch operation: ${op.operation}`);
    }
  }

  async bulkInsert<T extends BaseEntity>(
    collection: string,
    items: Omit<T, "_id" | "createdAt" | "updatedAt">[],
  ): Promise<DatabaseResult<T[]>> {
    return this.crud.insertMany(collection, items);
  }

  async bulkUpdate<T extends BaseEntity>(
    collection: string,
    updates: Array<{ id: DatabaseId; data: Partial<T> }>,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.core.wrap(async () => {
      const table = this.core.getTable(collection);
      let modifiedCount = 0;
      await this.db.transaction(async (tx: any) => {
        for (const update of updates) {
          const result = (await tx
            .update(table as any)
            .set(
              utils.convertISOToDates({
                ...update.data,
                updatedAt: isoDateStringToDate(nowISODateString()),
              }) as unknown as Record<string, unknown>,
            )
            .where(eq((table as any)._id, update.id as string))
            .run()) as any;

          // Support Bun and node:sqlite (.changes) and LibSQL (.rowsAffected)
          modifiedCount += result?.changes ?? result?.rowsAffected ?? 0;
        }
      });
      return { modifiedCount };
    }, "BULK_UPDATE_FAILED");
  }

  async bulkDelete(
    collection: string,
    ids: DatabaseId[],
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    return this.core.wrap(async () => {
      const table = this.core.getTable(collection);
      const result = await this.db
        .delete(table as any)
        .where(inArray((table as any)._id, ids as string[]));
      return {
        deletedCount: (result as unknown as { changes: number }).changes,
      };
    }, "BULK_DELETE_FAILED");
  }

  async bulkUpsert<T extends BaseEntity>(
    collection: string,
    items: Array<Partial<T> & { id?: DatabaseId }>,
  ): Promise<DatabaseResult<T[]>> {
    const mappedItems = items.map((item) => ({
      query: {
        _id: item.id,
      } as unknown as import("../db-interface").QueryFilter<T>,
      data: item as unknown as Omit<T, "_id" | "createdAt" | "updatedAt">,
    }));
    return this.crud.upsertMany<T>(collection, mappedItems) as unknown as DatabaseResult<T[]>;
  }
}
