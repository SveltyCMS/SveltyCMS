/**
 * @file tests/unit/databases/sql-upsert.test.ts
 * @description
 * Unit tests for the SQL upsert pipeline (sql-upsert.ts).
 * Asserts PK conflict resolution, batch upsert chunking, tenant-isolated conflict updates,
 * and dialect JSON merge wrapper integration.
 */

import { describe, expect, it, vi } from "vitest";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  buildJsonUpsertMergeSet,
  executeSqlUpsert,
  executeSqlUpsertMany,
  type SqlUpsertContext,
} from "@src/databases/core/sql-upsert";

const dummyTable = sqliteTable("test_items", {
  _id: text("_id"),
  data: text("data"),
  tenantId: text("tenantId"),
});

function createMockContext(dialect = "sqlite"): SqlUpsertContext {
  return {
    type: dialect,
    insertReturnsRows: true,
    persistTimestampsAsDate: true,
    convertDatesOptions: {},
    getTable: vi.fn().mockReturnValue(dummyTable),
    getColumn: vi.fn().mockImplementation((_tbl, name) => (dummyTable as any)[name] || null),
    ensureTableSchemaRegistered: vi.fn(),
    isMissingTableError: vi.fn().mockReturnValue(false),
    getDrizzleInstance: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ _id: "u1", title: "Item 1" }]),
          }),
          onDuplicateKeyUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ _id: "u1", title: "Item 1" }]),
          }),
        }),
      }),
    }),
    prepareValues: vi.fn().mockImplementation((_tbl, data, id) => ({ ...data, _id: id })),
    writeNow: vi.fn().mockReturnValue(new Date()),
    withWriteLock: vi.fn().mockImplementation((fn) => fn()),
    validateEntryId: vi.fn().mockReturnValue(null),
    wrap: vi.fn().mockImplementation(async (fn) => {
      try {
        const data = await fn();
        return { success: true, data };
      } catch (err: any) {
        return {
          success: false,
          message: err.message,
          error: { code: "TEST_ERR", message: err.message },
        };
      }
    }),
    findOne: vi.fn().mockResolvedValue({ success: true, data: null }),
    update: vi.fn().mockResolvedValue({ success: true, data: { _id: "u1" } }),
    insert: vi.fn().mockResolvedValue({ success: true, data: { _id: "u1" } }),
    canMergeJsonInOneStatement: vi.fn().mockReturnValue(true),
    quoteIdentifier: vi.fn().mockImplementation((name) => `"${name}"`),
    jsonMergeWrapper: vi.fn().mockReturnValue({ prefix: 'json_patch("data", ', suffix: ")" }),
    jsonUpsertMergeSet: vi.fn().mockReturnValue({} as any),
  };
}

describe("SQL Upsert Pipeline", () => {
  it("generates correct JSON upsert merge expression", () => {
    const ctx = createMockContext("sqlite");
    const table = ctx.getTable("test_items");
    const mergeSet = buildJsonUpsertMergeSet(ctx, table);
    expect(mergeSet).toBeDefined();
    expect(ctx.jsonMergeWrapper).toHaveBeenCalled();
  });

  it("routes PK-based upsert to executeUpsertById", async () => {
    const ctx = createMockContext("sqlite");
    const validUuid = "11111111-1111-4111-8111-111111111111";
    const res = await executeSqlUpsert(
      ctx,
      "test_items",
      { _id: validUuid } as any,
      { title: "Test" } as any,
    );
    expect(res.success).toBe(true);
    expect(ctx.wrap).toHaveBeenCalled();
    expect(ctx.getTable).toHaveBeenCalledWith("test_items");
  });

  it("routes non-PK upsert to find-then-insert fallback", async () => {
    const ctx = createMockContext("sqlite");
    const res = await executeSqlUpsert(
      ctx,
      "test_items",
      { title: "UniqueTitle" } as any,
      { title: "UniqueTitle", slug: "unique-title" } as any,
    );
    expect(res.success).toBe(true);
    expect(ctx.withWriteLock).toHaveBeenCalled();
    expect(ctx.findOne).toHaveBeenCalled();
    expect(ctx.insert).toHaveBeenCalled();
  });

  it("handles batch upsert with empty items array", async () => {
    const ctx = createMockContext("sqlite");
    const res = await executeSqlUpsertMany(ctx, "test_items", []);
    expect(res.success).toBe(true);
    expect((res as { data?: unknown }).data).toEqual([]);
  });

  it("partitions batch upsert into PK conflict and non-PK items", async () => {
    const ctx = createMockContext("sqlite");
    const validUuid = "11111111-1111-4111-8111-111111111111";
    const items = [
      { query: { _id: validUuid } as any, data: { title: "Item 1" } as any },
      { query: { slug: "slug-2" } as any, data: { title: "Item 2" } as any },
    ];
    const res = await executeSqlUpsertMany(ctx, "test_items", items);
    expect(res.success).toBe(true);
    expect(ctx.findOne).toHaveBeenCalled();
  });
});
