/**
 * @file tests/unit/databases/sql-crud-read.test.ts
 * @description
 * Unit tests for SQL read operations (executeSqlFindById, executeSqlFindOne,
 * executeSqlFindMany, executeSqlStreamMany, executeSqlExists, executeSqlCount).
 * Asserts soft-delete clamping, validation, id lookups, query execution, and
 * keyset vs offset streaming.
 */

import { describe, expect, it, vi } from "vitest";
import type { DatabaseId } from "@src/content/types";
import {
  executeSqlCount,
  executeSqlExists,
  executeSqlFindById,
  executeSqlFindMany,
  executeSqlFindOne,
  executeSqlStreamMany,
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

type MockQueryChain = PromiseLike<unknown[]> & {
  limit(count: number): MockQueryChain;
  offset(count: number): MockQueryChain;
};

type MockReadContext = SqlCrudReadContext & {
  mockCalls: {
    limit: number[];
    offset: number[];
    where: number;
    whereConditions: unknown[];
  };
};

/**
 * Builds a fresh Drizzle chain per `where()` call so streaming can request many
 * pages. `pages` supplies one row window per page; without it every page sees
 * the full `rows` array (enough when the first page is shorter than the batch).
 */
function createMockReadContext(rows: any[] = [], pages?: any[][]): MockReadContext {
  const mockCalls = {
    limit: [] as number[],
    offset: [] as number[],
    where: 0,
    whereConditions: [] as unknown[],
  };

  const makeChain = (pageRows: any[]): MockQueryChain =>
    Object.assign(Promise.resolve<unknown[]>(pageRows), {
      limit(count: number): MockQueryChain {
        mockCalls.limit.push(count);
        return makeChain(pageRows.slice(0, count));
      },
      offset(count: number): MockQueryChain {
        mockCalls.offset.push(count);
        return makeChain(pageRows.slice(count));
      },
    });

  const dummyDb = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation((condition: unknown) => {
          const pageRows = pages ? (pages[mockCalls.where] ?? []) : rows;
          mockCalls.where += 1;
          mockCalls.whereConditions.push(condition);
          return makeChain(pageRows);
        }),
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
    mockCalls,
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

  it("streams by _id keyset when no sort is requested", async () => {
    const rows = [
      { _id: "art-1", title: "First" },
      { _id: "art-2", title: "Second" },
      { _id: "art-3", title: "Third" },
    ];
    const ctx = createMockReadContext(rows);
    const res = await executeSqlStreamMany(ctx, "test_articles", {}, { offset: 0 });
    expect(res.success).toBe(true);
    if (!res.success) throw new Error(res.message);

    const streamed: unknown[] = [];
    for await (const row of res.data) streamed.push(row);

    expect(streamed).toEqual(rows);
    expect(ctx.mockCalls.offset).toEqual([]);
    expect(ctx.applyOrderBy).toHaveBeenCalledWith(
      expect.anything(),
      testArticlesTable,
      expect.objectContaining({ sort: { _id: "asc" } }),
    );
  });

  it("uses keyset only for a single _id ascending sort", async () => {
    const rows = [{ _id: "art-1", title: "First" }];

    const tupleCtx = createMockReadContext(rows);
    const tupleRes = await executeSqlStreamMany(
      tupleCtx,
      "test_articles",
      {},
      { sort: [["_id", "asc"]] },
    );
    expect(tupleRes.success).toBe(true);
    if (!tupleRes.success) throw new Error(tupleRes.message);
    for await (const _row of tupleRes.data) {
      // drain the stream so paging assertions observe the queries
    }
    expect(tupleCtx.mockCalls.offset).toEqual([]);

    const compoundCtx = createMockReadContext(rows);
    const compoundRes = await executeSqlStreamMany(
      compoundCtx,
      "test_articles",
      {},
      { sort: { _id: "asc", title: "asc" } },
    );
    expect(compoundRes.success).toBe(true);
    if (!compoundRes.success) throw new Error(compoundRes.message);
    for await (const _row of compoundRes.data) {
      // drain the stream so paging assertions observe the queries
    }
    expect(compoundCtx.mockCalls.offset).toEqual([0]);
  });

  it("keeps the offset loop when sorting by a non-id column", async () => {
    const ctx = createMockReadContext([{ _id: "art-1", title: "First" }]);
    const res = await executeSqlStreamMany(ctx, "test_articles", {}, { sort: { title: "asc" } });
    expect(res.success).toBe(true);
    if (!res.success) throw new Error(res.message);

    const streamed: unknown[] = [];
    for await (const row of res.data) streamed.push(row);

    expect(streamed).toHaveLength(1);
    expect(ctx.mockCalls.offset).toEqual([0]);
    expect(ctx.applyOrderBy).toHaveBeenCalledWith(
      expect.anything(),
      testArticlesTable,
      expect.objectContaining({ sort: { title: "asc" } }),
    );
  });

  it("keeps the offset loop when starting from a non-zero offset", async () => {
    const ctx = createMockReadContext([{ _id: "art-1", title: "First" }]);
    const res = await executeSqlStreamMany(ctx, "test_articles", {}, { offset: 100 });
    expect(res.success).toBe(true);
    if (!res.success) throw new Error(res.message);

    const streamed: unknown[] = [];
    for await (const row of res.data) streamed.push(row);

    expect(streamed).toHaveLength(0);
    expect(ctx.mockCalls.offset).toEqual([100]);
  });

  it("stops keyset streaming after a short page", async () => {
    const rows = [
      { _id: "art-1", title: "First" },
      { _id: "art-2", title: "Second" },
    ];
    const ctx = createMockReadContext(rows);
    const res = await executeSqlStreamMany(ctx, "test_articles", {});
    expect(res.success).toBe(true);
    if (!res.success) throw new Error(res.message);

    const streamed: unknown[] = [];
    for await (const row of res.data) streamed.push(row);

    expect(streamed).toHaveLength(2);
    expect(ctx.mockCalls.where).toBe(1);
    expect(ctx.mockCalls.limit).toEqual([500]);
    expect(ctx.mockCalls.offset).toEqual([]);
  });

  it("advances a keyset stream with a cursor instead of an offset", async () => {
    const firstPage = Array.from({ length: 500 }, (_, i) => ({
      _id: `art-${i}`,
      title: `Row ${i}`,
    }));
    const secondPage = [
      { _id: "art-500", title: "Row 500" },
      { _id: "art-501", title: "Row 501" },
    ];
    const ctx = createMockReadContext([], [firstPage, secondPage]);
    const res = await executeSqlStreamMany(ctx, "test_articles", {});
    expect(res.success).toBe(true);
    if (!res.success) throw new Error(res.message);

    const streamed: unknown[] = [];
    for await (const row of res.data) streamed.push(row);

    expect(streamed).toHaveLength(502);
    expect(ctx.mockCalls.where).toBe(2);
    expect(ctx.mockCalls.limit).toEqual([500, 500]);
    expect(ctx.mockCalls.offset).toEqual([]);
    // First page has no cursor, the second page appends `gt(_id, lastId)`.
    expect(ctx.mockCalls.whereConditions[1]).toBeTruthy();
  });
});
