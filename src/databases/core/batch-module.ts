/**
 * @file src/databases/sqlite/operations/batch-module.ts
 * @description Batch operations module for SQLite
 *
 * Features:
 * - Execute batch operations
 * - Bulk insert
 * - Bulk update
 * - Bulk delete
 * - Bulk upsert (coalesced upsertMany — one ON CONFLICT / bulkWrite)
 */

import { isoDateStringToDate, nowISODateString } from "@src/utils/date";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import { assertTenantContext } from "@src/utils/security/safe-query";
import type {
  BaseEntity,
  BaseQueryOptions,
  BatchOperation,
  BatchResult,
  DatabaseError,
  DatabaseId,
  DatabaseResult,
  ISqlAdapter,
} from "../db-interface";
import * as utils from "./relational-utils";
import { executeWrite } from "./drizzle-sql-helpers";

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
        let group = groups.get(key);
        if (!group) {
          group = [];
          groups.set(key, group);
        }
        group.push(op);
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
          if (operation === "upsert" && ops.length > 1) {
            const items = ops.map((op) => ({
              query: op.query as import("../db-interface").QueryFilter<T & BaseEntity>,
              data: op.data as Omit<T & BaseEntity, "_id" | "createdAt" | "updatedAt">,
            }));
            const bulkRes = await this.crud.upsertMany(collection, items);
            if (bulkRes.success && Array.isArray(bulkRes.data)) {
              for (const item of bulkRes.data) {
                results.push({ success: true, data: item } as DatabaseResult<T>);
                totalProcessed++;
              }
            } else if (bulkRes.success && bulkRes.data && !Array.isArray(bulkRes.data)) {
              // Mongo returns counts; treat the group as processed.
              for (const op of ops) {
                results.push({ success: true, data: op.data as T } as DatabaseResult<T>);
                totalProcessed++;
              }
            } else if (!bulkRes.success) {
              errors.push((bulkRes as { error?: DatabaseError }).error!);
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
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    return this.core.wrap(
      async () => {
        const table = this.core.getTable(collection);
        if (!updates.length) return { modifiedCount: 0 };

        const now = isoDateStringToDate(nowISODateString());

        // 🛡️ TENANT ISOLATION: fail-closed MULTI_TENANT guard + tenant WHERE on
        // every path below (same semantics as crud.update's applyTenantFilter).
        // Without it a bulk payload could touch rows outside the caller's
        // tenant by id. The raw CASE fast path uses buildRawTenantClause which
        // is silent on missing context — this guard makes both paths uniform.
        assertTenantContext(options, "batch.bulkUpdate");

        // Homogeneous payload → one UPDATE ... WHERE _id IN (...) instead of N statements.
        if (updates.length === 1 || utils.sameBatchPayload(updates)) {
          const ids = updates.map((u) => u.id as string);
          const conditions: SQL[] = [inArray((table as any)._id, ids)];
          utils.applyTenantFilter(conditions, (table as any).tenantId, options);
          // 🐛 PREPARE-PARITY FIX: route through prepareValues (like
          // crud.update) instead of dumping the raw payload into Drizzle
          // .set(). Drizzle silently DROPS keys that are not physical columns
          // (blob-field payloads like `title`/`count` vanished — success:true
          // but nothing persisted, the Zahl-Feld class). prepareValues moves
          // non-column fields into the JSON `data` blob and preserves number
          // types; updatedAt/tenantId stamps come from the same helper.
          const values = this.core.prepareValues(
            table,
            updates[0].data as Record<string, unknown>,
            undefined,
            now,
            (options as { isUpdate?: boolean })?.isUpdate === true
              ? options
              : { ...options, isUpdate: true, operation: "update" },
          );
          const query = this.db
            .update(table as any)
            .set(values as Record<string, unknown>)
            .where(and(...conditions));
          const result = await executeWrite(query);
          return {
            modifiedCount: result?.changes ?? result?.rowsAffected ?? result?.count ?? -1,
          };
        }

        // 🚀 HETEROGENEOUS CASE FAST PATH: one
        // UPDATE … SET "col" = CASE "_id" WHEN ? THEN ? … ELSE "col" END
        // statement (statement-cache friendly) instead of N per-row UPDATEs.
        // SQLite implements it today; other adapters fall back to the
        // transactional per-row loop below (parity-preserving).
        const rawBulk = await this.core.rawBulkUpdate?.(
          table,
          collection,
          updates as Array<{ id: DatabaseId; data: Partial<Record<string, unknown>> }>,
          now,
          options,
        );
        if (rawBulk !== null && rawBulk !== undefined) return rawBulk;

        let modifiedCount = 0;
        const tenantCond = utils.getTenantCondition((table as any).tenantId, options);
        // 🔒 TRANSACTION SPAN: the per-row loop is one BEGIN…COMMIT — run it
        // under the adapter's write lock (SQLite write mutex; no-op elsewhere)
        // so no other writer interleaves mid-transaction.
        await this.core.withWriteLock(() =>
          this.db.transaction(async (tx: any) => {
            for (const update of updates) {
              const stmt = tx
                .update(table as any)
                // 🐛 PREPARE-PARITY (fallback path): route through prepareValues
                // like the homogeneous fast path — blob fields land in `data`,
                // number types stay numbers (the Zahl-Feld class), updatedAt
                // is stamped by the same helper.
                .set(
                  this.core.prepareValues(
                    table,
                    update.data as Record<string, unknown>,
                    undefined,
                    now,
                    (options as { isUpdate?: boolean })?.isUpdate === true
                      ? options
                      : { ...options, isUpdate: true, operation: "update" },
                  ) as Record<string, unknown>,
                )
                .where(
                  tenantCond
                    ? and(eq((table as any)._id, update.id as string), tenantCond)
                    : eq((table as any)._id, update.id as string),
                );
              const result = (
                typeof stmt.run === "function" ? await stmt.run() : await stmt
              ) as any;
              modifiedCount += result?.changes ?? result?.rowsAffected ?? result?.count ?? 0;
            }
          }),
        );
        return { modifiedCount };
      },
      "BULK_UPDATE_FAILED",
      undefined,
      { ...options, isWrite: true },
    );
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
