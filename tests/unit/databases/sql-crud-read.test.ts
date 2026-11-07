/**
 * @file tests/unit/databases/sql-crud-read.test.ts
 * @description
 * Unit tests for SQL read operations (executeSqlFindById, executeSqlFindOne,
 * executeSqlFindMany, executeSqlExists, executeSqlCount).
 * Asserts soft-delete clamping, validation, id lookups, and query execution.
 */

import { describe, expect, it, vi } from "vitest";
import type { DatabaseId } from "@src/content/types";
import {
  executeSqlCount,
  executeSqlExists,
  executeSqlFindById,
  executeSqlFindMany,
  executeSqlFindOne,
  type SqlCrudReadContext,
} from "@src/databases/core/sql-crud-read";
import { SQLITE_DIALECT } from "@src/databases/core/sql-query-builder";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

const testArticlesTable = sqliteTable("test_articles", {
  _id: text("_id").primaryKey(),
  title: text("title"),
  status: text("status"),
  isDeleted: integer("isDeleted", { mode: "boolean" }),
  tenantId: text("tenantId"),
});

function createMockReadContext(rows: any[] = []): SqlCrudReadContext {
  const queryObj: any = Promise.resolve(rows);
  queryObj.limit = vi
    .fn()
    .mockImplementation((limit: number) => Promise.resolve(rows.slice(0, limit)));
  queryObj.offset = vi
    .fn()
    .mockImplementation((offset: number) => Promise.resolve(rows.slice(offset)));

  const dummyDb = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(queryObj),
      }),
    }),
  };

  return {
    hooks: [],
    sqlDialect: SQLITE_DIALECT,
    useRawFindById: false,
    useDynamicSqlInFindMany: false,
    convertDatesOptions: {},
    registeredSchemas: new Set(["test_articles"]),
    dynamicColListCache: new WeakMap(),
    escapedTableNameCache: new WeakMap(),
    rawFindById: vi.fn().mockResolvedValue(null),
    getTable: vi.fn().mockReturnValue(testArticlesTable),
    getColumn: vi
      .fn()
      .mockImplementation(
        (_tbl, name) => testArticlesTable[name as keyof typeof testArticlesTable] || null,
      ),
    getPhysicalSelection: vi
      .fn()
      .mockReturnValue({ _id: testArticlesTable._id, title: testArticlesTable.title }),
    getProjectedSelection: vi
      .fn()
      .mockReturnValue({ _id: testArticlesTable._id, title: testArticlesTable.title }),
    mapQuery: vi.fn().mockReturnValue(null),
    buildDynamicOrderBy: vi.fn().mockReturnValue([]),
    applyOrderBy: vi.fn().mockImplementation((builder) => builder),
    getDrizzleInstance: vi.fn().mockReturnValue(dummyDb),
    executeDynamicSql: vi.fn().mockResolvedValue(rows),
    ensureTableSchemaRegistered: vi.fn(),
    clampSoftDeleted: vi.fn().mockImplementation((_tbl, q) => q),
    shouldExcludeData: vi.fn().mockReturnValue(false),
    isMissingTableError: vi.fn().mockReturnValue(false),
    estimateTableRows: vi.fn().mockResolvedValue(null),
    quoteIdentifier: vi.fn().mockImplementation((name) => `"${name}"`),
    runHooks: vi.fn().mockImplementation((_stage, _op, _col, payload) => Promise.resolve(payload)),
    wrap: vi.fn().mockImplementation(async (fn) => {
      try {
        const data = await fn();
        return { success: true, data };
      } catch (err: any) {
        return {
          success: false,
          message: err.message,
          error: { code: "READ_ERR", message: err.message },
        };
      }
    }),
    findById: vi.fn().mockImplementation(async (_col, id) => {
      const found = rows.find((r) => r._id === id);
      return { success: true, data: found || null };
    }),
  };
}

describe("SQL Read Pipeline", () => {
  it("validates collection and ID inputs on findById", async () => {
    const ctx = createMockReadContext();
    const resCol = await executeSqlFindById(ctx, null as any, "art-1" as DatabaseId);
    expect(resCol.success).toBe(false);
    expect((resCol as { error?: { code?: string } }).error?.code).toBe("INVALID_COLLECTION");

    const resId = await executeSqlFindById(ctx, "test_articles", null as any);
    expect(resId.success).toBe(false);
    expect((resId as { error?: { code?: string } }).error?.code).toBe("INVALID_ID");
  });

  it("finds single record by id using drizzle select", async () => {
    const mockRow = { _id: "art-1", title: "Test Article", isDeleted: false };
    const ctx = createMockReadContext([mockRow]);
    const res = await executeSqlFindById(ctx, "test_articles", "art-1" as DatabaseId);
    expect(res.success).toBe(true);
    if (!res.success) throw new Error(res.message);
    expect(res.data).toEqual(mockRow);
  });

  it("routes {_id} lookups in findOne directly to findById ultra-fast path", async () => {
    const mockRow = { _id: "art-1", title: "Ultra Path Article" };
    const ctx = createMockReadContext([mockRow]);
    const res = await executeSqlFindOne(ctx, "test_articles", { _id: "art-1" as DatabaseId });
    expect(res.success).toBe(true);
    if (!res.success) throw new Error(res.message);
    expect(res.data).toEqual(mockRow);
    expect(ctx.findById).toHaveBeenCalledWith("test_articles", "art-1", expect.any(Object));
  });

  it("finds multiple records in findMany", async () => {
    const rows = [
      { _id: "art-1", title: "First" },
      { _id: "art-2", title: "Second" },
    ];
    const ctx = createMockReadContext(rows);
    const res = await executeSqlFindMany(ctx, "test_articles", {});
    expect(res.success).toBe(true);
    if (!res.success) throw new Error(res.message);
    expect(res.data).toHaveLength(2);
  });

  it("checks existence correctly in executeSqlExists", async () => {
    const ctx = createMockReadContext([{ _id: "art-1" }]);
    const res = await executeSqlExists(ctx, "test_articles", { _id: "art-1" as DatabaseId });
    expect(res.success).toBe(true);
    if (!res.success) throw new Error(res.message);
    expect(res.data).toBe(true);
  });

  it("counts records correctly using drizzle count", async () => {
    const ctx = createMockReadContext();
    const drizzleDb = ctx.getDrizzleInstance();
    drizzleDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 42 }]),
      }),
    });
    const res = await executeSqlCount(ctx, "test_articles", {});
    expect(res.success).toBe(true);
    if (!res.success) throw new Error(res.message);
    expect(res.data).toBe(42);
  });
});
