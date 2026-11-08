/**
 * @file src/databases/core/sql-crud-delete.ts
 * @description
 * Shared deletion, soft-deletion, and restore pipelines for SQL database adapters.
 * Implements single/bulk soft or permanent delete and audit-safe record restoration.
 *
 * ### Features:
 * - Single-record delete (soft or permanent) with tenant filtering and lifecycle hooks
 * - Bulk delete (soft or permanent) with guarded confirmWipe for unfiltered calls
 * - Soft-delete audit stamping (isDeleted, deletedAt, deletedBy)
 * - Safe record restoration clearing audit stamps and enforcing tenant boundaries
 */

import type {
  BaseEntity,
  BaseQueryOptions,
  DatabaseResult,
  DatabaseId,
  QueryFilter,
} from "../db-interface";
import { rowsAffected } from "./drizzle-sql-helpers";
import { nowISODateString, isoDateStringToDate } from "@src/utils/date";
import { eq, and, type SQL, type Table, type Column } from "drizzle-orm";
import { applyTenantFilter, assertFilteredDelete } from "./relational-utils";

/**
 * Structural contract required by the delete pipeline.
 */
export interface SqlCrudDeleteContext {
  hooks: unknown[];
  getTable(collection: string): Table;
  getColumn(table: unknown, name: string): Column | undefined;
  getDrizzleInstance(options?: BaseQueryOptions): {
    delete: (table: unknown) => { where: (wh: unknown) => Promise<unknown> };
    update: (table: unknown) => {
      set: (s: unknown) => { where: (wh: unknown) => Promise<unknown> };
    };
  };
  mapQuery(table: unknown, query: unknown, options?: unknown): SQL | undefined;
  runHooks(
    stage: "before" | "after",
    operation: string,
    collection: string,
    payload: unknown,
    options?: unknown,
  ): Promise<unknown>;
  wrap<T>(
    operation: () => Promise<T>,
    errorCode: string,
    metricName?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>>;
  buildSoftDeleteSet(table: unknown, userId?: DatabaseId | null): Record<string, unknown>;
}

/**
 * Builds the soft-delete SET payload with timestamps and optional userId.
 */
export function buildDefaultSoftDeleteSet(
  ctx: Pick<SqlCrudDeleteContext, "getColumn">,
  table: unknown,
  userId?: DatabaseId | null,
): Record<string, unknown> {
  const now = isoDateStringToDate(nowISODateString());
  const set: Record<string, unknown> = { isDeleted: true, updatedAt: now };
  if (ctx.getColumn(table, "deletedAt")) set.deletedAt = now;
  if (ctx.getColumn(table, "deletedBy") && userId != null) set.deletedBy = userId;
  return set;
}

/**
 * Single-record delete execution (soft or permanent).
 */
export async function executeSqlDelete(
  ctx: SqlCrudDeleteContext,
  collection: string,
  id: DatabaseId,
  options: BaseQueryOptions & {
    permanent?: boolean;
    userId?: DatabaseId;
  } = {},
): Promise<DatabaseResult<void>> {
  if (typeof collection !== "string") {
    return {
      success: false,
      message: `Invalid collection: expected string, got ${typeof collection}`,
      error: {
        code: "INVALID_COLLECTION",
        message: "Collection name must be a string",
      },
    };
  }
  if (id === undefined || id === null) {
    return {
      success: false,
      message: `Delete failed: ID is ${id}`,
      error: {
        code: "INVALID_ID",
        message: `Cannot delete from ${collection} with ${id} ID`,
      },
    };
  }
  return ctx.wrap(
    async () => {
      if (ctx.hooks.length > 0)
        await ctx.runHooks("before", "delete", collection, { _id: id }, options);
      const table = ctx.getTable(collection);
      if (!table) throw new Error(`Collection table not found: ${collection}`);
      const idCol = ctx.getColumn(table, "_id") || ctx.getColumn(table, "id");
      if (!idCol) throw new Error("ID column not found");

      const conditions: SQL[] = [eq(idCol as Column, id as string)];
      const tenantCol = ctx.getColumn(table, "tenantId");
      applyTenantFilter(conditions, tenantCol, options);

      const hasIsDeleted = !!ctx.getColumn(table, "isDeleted");
      if (options.permanent || !hasIsDeleted) {
        await ctx
          .getDrizzleInstance(options)
          .delete(table)
          .where(and(...conditions));
      } else {
        await ctx
          .getDrizzleInstance(options)
          .update(table)
          .set(ctx.buildSoftDeleteSet(table, options.userId))
          .where(and(...conditions));
      }
      if (ctx.hooks.length > 0)
        await ctx.runHooks("after", "delete", collection, { _id: id }, options);
    },
    "DELETE_FAILED",
    undefined,
    { ...options, isWrite: true },
  );
}

/**
 * Bulk-delete execution (soft or permanent).
 */
export async function executeSqlDeleteMany<T extends BaseEntity>(
  ctx: SqlCrudDeleteContext,
  collection: string,
  query: QueryFilter<T>,
  options: BaseQueryOptions & {
    permanent?: boolean;
    userId?: DatabaseId;
  } = {},
): Promise<DatabaseResult<{ deletedCount: number }>> {
  return ctx.wrap(
    async () => {
      const table = ctx.getTable(collection);
      if (!table) throw new Error(`Collection table not found: ${collection}`);
      const execWrite = async (builder: { run?: () => Promise<unknown> }) =>
        typeof builder.run === "function" ? builder.run() : builder;

      // A missing filter must not compile to DELETE/UPDATE with no WHERE.
      // mapQuery still adds a tenant predicate when one applies; confirmWipe
      // is the only way to affect every row.
      const whereCondition = ctx.mapQuery(table, query, options);
      const hasIsDeleted = !!ctx.getColumn(table, "isDeleted");
      const db = ctx.getDrizzleInstance(options);
      if (!whereCondition) {
        assertFilteredDelete(false, options.confirmWipe);
        if (options.permanent || !hasIsDeleted) {
          const wiped = await execWrite(db.delete(table) as { run?: () => Promise<unknown> });
          return { deletedCount: rowsAffected(wiped) ?? -1 };
        }
        const wiped = await execWrite(
          db.update(table).set(ctx.buildSoftDeleteSet(table, options.userId)) as {
            run?: () => Promise<unknown>;
          },
        );
        return { deletedCount: rowsAffected(wiped) ?? -1 };
      }
      // 🚀 Single-statement soft/hard delete instead of findMany + N deletes.
      if (options.permanent || !hasIsDeleted) {
        const hardDeleted = await execWrite(
          db.delete(table).where(whereCondition) as { run?: () => Promise<unknown> },
        );
        return { deletedCount: rowsAffected(hardDeleted) ?? -1 };
      }
      const res = await execWrite(
        db
          .update(table)
          .set(ctx.buildSoftDeleteSet(table, options.userId))
          .where(whereCondition) as {
          run?: () => Promise<unknown>;
        },
      );
      const affected = rowsAffected(res) ?? -1;
      return { deletedCount: affected };
    },
    "DELETE_MANY_FAILED",
    undefined,
    { ...options, isWrite: true },
  );
}

/**
 * Record restore execution clearing deletion markers.
 */
export async function executeSqlRestore(
  ctx: SqlCrudDeleteContext,
  collection: string,
  id: DatabaseId,
  options: BaseQueryOptions = {},
): Promise<DatabaseResult<void>> {
  if (id === undefined || id === null) {
    return {
      success: false,
      message: `Restore failed: ID is ${id}`,
      error: {
        code: "INVALID_ID",
        message: `Cannot restore in ${collection} with ${id} ID`,
      },
    };
  }
  return ctx.wrap(
    async () => {
      const table = ctx.getTable(collection);
      const idCol = ctx.getColumn(table, "_id") || ctx.getColumn(table, "id");
      if (!idCol) throw new Error("ID column not found");
      const conditions: SQL[] = [eq(idCol as Column, id as string)];
      applyTenantFilter(conditions, ctx.getColumn(table, "tenantId"), options);
      const restoreSet: Record<string, unknown> = { isDeleted: false, updatedAt: new Date() };
      if (ctx.getColumn(table, "deletedAt")) restoreSet.deletedAt = null;
      if (ctx.getColumn(table, "deletedBy")) restoreSet.deletedBy = null;
      await ctx
        .getDrizzleInstance(options)
        .update(table)
        .set(restoreSet)
        .where(and(...conditions));
    },
    "RESTORE_FAILED",
    undefined,
    { ...options, isWrite: true },
  );
}
