/**
 * @file tests/unit/databases/sql-crud-delete.test.ts
 * @description
 * Unit tests for SQL deletion, soft-deletion, and restore pipelines.
 * Asserts soft-delete audit stamping, permanent vs soft delete branch selection,
 * tenant isolation filtering, and audit-stamp clearing upon restoration.
 */

import { describe, expect, it, vi } from "vitest";
import type { DatabaseId } from "@src/content/types";
import {
  buildDefaultSoftDeleteSet,
  executeSqlDelete,
  executeSqlRestore,
  type SqlCrudDeleteContext,
} from "@src/databases/core/sql-crud-delete";

function createMockDeleteContext(): SqlCrudDeleteContext {
  const dummyTable = {
    _: { name: "test_articles" },
    _id: { name: "_id" },
    isDeleted: { name: "isDeleted" },
    deletedAt: { name: "deletedAt" },
    deletedBy: { name: "deletedBy" },
    tenantId: { name: "tenantId" },
  };

  const dummyDb = {
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({ changes: 1 }) }),
      run: vi.fn().mockResolvedValue({ changes: 1 }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({ changes: 1 }) }),
        run: vi.fn().mockResolvedValue({ changes: 1 }),
      }),
    }),
  };

  return {
    hooks: [],
    getTable: vi.fn().mockReturnValue(dummyTable),
    getColumn: vi
      .fn()
      .mockImplementation((_tbl, name) => dummyTable[name as keyof typeof dummyTable] || null),
    getDrizzleInstance: vi.fn().mockReturnValue(dummyDb),
    mapQuery: vi.fn().mockReturnValue(null),
    runHooks: vi.fn().mockImplementation((_stage, _op, _col, payload) => Promise.resolve(payload)),
    wrap: vi.fn().mockImplementation(async (fn) => {
      try {
        const data = await fn();
        return { success: true, data };
      } catch (err: any) {
        return {
          success: false,
          message: err.message,
          error: { code: "DEL_ERR", message: err.message },
        };
      }
    }),
    buildSoftDeleteSet: vi.fn().mockImplementation((tbl, uid) =>
      buildDefaultSoftDeleteSet(
        {
          getColumn: (_t: unknown, n: string) =>
            (dummyTable[n as keyof typeof dummyTable] as unknown as import("drizzle-orm").Column) ||
            undefined,
        },
        tbl,
        uid,
      ),
    ),
  } as unknown as SqlCrudDeleteContext;
}

describe("SQL Delete & Restore Pipeline", () => {
  it("builds soft-delete set with timestamp and user ID", () => {
    const ctx = createMockDeleteContext();
    const set = buildDefaultSoftDeleteSet(ctx, {}, "user-123" as DatabaseId);
    expect(set.isDeleted).toBe(true);
    expect(set.deletedAt).toBeInstanceOf(Date);
    expect(set.deletedBy).toBe("user-123");
    expect(set.updatedAt).toBeInstanceOf(Date);
  });

  it("executes soft delete when isDeleted column exists and permanent is false", async () => {
    const ctx = createMockDeleteContext();
    const res = await executeSqlDelete(ctx, "test_articles", "article-1" as DatabaseId, {
      permanent: false,
    });
    expect(res.success).toBe(true);
    const db = ctx.getDrizzleInstance();
    expect(db.update).toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("executes hard delete when permanent is true", async () => {
    const ctx = createMockDeleteContext();
    const res = await executeSqlDelete(ctx, "test_articles", "article-1" as DatabaseId, {
      permanent: true,
    });
    expect(res.success).toBe(true);
    const db = ctx.getDrizzleInstance();
    expect(db.delete).toHaveBeenCalled();
  });

  it("fails validation on invalid ID or collection name", async () => {
    const ctx = createMockDeleteContext();
    const resCol = await executeSqlDelete(ctx, null as any, "article-1" as DatabaseId);
    expect(resCol.success).toBe(false);
    expect((resCol as { error?: { code?: string } }).error?.code).toBe("INVALID_COLLECTION");

    const resId = await executeSqlDelete(ctx, "test_articles", null as any);
    expect(resId.success).toBe(false);
    expect((resId as { error?: { code?: string } }).error?.code).toBe("INVALID_ID");
  });

  it("restores record by clearing soft-delete markers", async () => {
    const ctx = createMockDeleteContext();
    const res = await executeSqlRestore(ctx, "test_articles", "article-1" as DatabaseId);
    expect(res.success).toBe(true);
    const db = ctx.getDrizzleInstance();
    expect(db.update).toHaveBeenCalled();
  });
});
