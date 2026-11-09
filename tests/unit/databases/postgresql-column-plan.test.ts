/**
 * @file tests/unit/databases/postgresql-column-plan.test.ts
 * @description Golden tests for the shared PostgreSQL column-type plan refactor.
 *
 * Features tested:
 * - Insert and update agree on the JSON cast when the `data` column has a
 *   non-default physical name (B2 regression).
 * - `clearStatementCaches()` invalidates the per-table column-type plan cache.
 * - `atomicIncrement` quotes table/column identifiers safely.
 * - Pre-refactor insert / single-update / bulk-update SQL shapes are unchanged.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { pgTable, varchar } from "drizzle-orm/pg-core";
import type { DatabaseId } from "@src/databases/db-interface";
import {
  getUpdateTemplate,
  getUpdateValuesTemplates,
  resolvePgColumnTypePlan,
  type PostgresUpdateContext,
} from "@src/databases/postgresql/update-templates";
import { PostgreSQLAdapter } from "@src/databases/postgresql/postgres-adapter";

interface ColumnShape {
  name?: string;
  dataType?: string;
  columnType?: string;
}

function makeCtx(catalog: Record<string, ColumnShape | undefined>): PostgresUpdateContext {
  return {
    sql: undefined,
    getColumn: (_t: unknown, name: string) => catalog[name],
    getColumnTypePlan: (_t: unknown, col: string) => resolvePgColumnTypePlan(catalog[col], col),
    getTxnSql: () => null,
    convertDatesOptions: {},
    updateValuesTemplateCache: new Map(),
    updateTemplateCache: new Map(),
  };
}

function makeAdapter(catalog: Record<string, ColumnShape | undefined>): PostgreSQLAdapter {
  const adapter = new PostgreSQLAdapter();
  (adapter as unknown as { getColumn: unknown }).getColumn = (_t: unknown, name: string) =>
    catalog[name];
  return adapter;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shared PostgreSQL column-type plan", () => {
  it("insert and update agree on ::jsonb for a renamed data column (B2)", () => {
    // The `data` blob is stored under a non-default physical name; the JSON
    // signal comes from `columnType` (the old insert path read only dataType).
    const renamedData: ColumnShape = { name: "payload", columnType: "PgJsonb" };
    const plan = resolvePgColumnTypePlan(renamedData, "data");
    expect(plan).toEqual({
      physName: "payload",
      safeCol: "payload",
      isJson: true,
      pgType: "jsonb",
    });

    const catalog = { data: renamedData };
    const insertTpl = (
      makeAdapter(catalog) as unknown as {
        _getInsertTemplate(
          t: unknown,
          n: string,
          s: Record<string, unknown>,
        ): {
          sqlText: string;
        };
      }
    )._getInsertTemplate({}, "collection_posts", { data: {} });

    const updateTpl = getUpdateTemplate(
      makeCtx(catalog),
      {},
      "collection_posts",
      ["data"],
      "_id",
      "",
      false,
      null,
      false,
    );

    expect(insertTpl.sqlText).toBe('INSERT INTO "collection_posts" ("payload") VALUES ($1::jsonb)');
    expect(updateTpl.sqlWithReturning).toBe(
      'UPDATE "collection_posts" SET "payload" = $1::jsonb WHERE "_id" = $2 RETURNING *',
    );
  });

  it("invalidates the per-table plan cache on clearStatementCaches", () => {
    const adapter = new PostgreSQLAdapter();
    const table = {};
    let viewsCol: ColumnShape | undefined = {
      name: "views",
      dataType: "number",
      columnType: "PgInteger",
    };
    (adapter as unknown as { getColumn: unknown }).getColumn = (_t: unknown, name: string) =>
      name === "views" ? viewsCol : undefined;

    const access = adapter as unknown as {
      getColumnTypePlan(t: unknown, c: string): { pgType: string };
    };

    expect(access.getColumnTypePlan(table, "views").pgType).toBe("numeric");

    // Column type changes to boolean; the cached plan stays stale until cleared.
    viewsCol = { name: "views", dataType: "boolean", columnType: "PgBoolean" };
    expect(access.getColumnTypePlan(table, "views").pgType).toBe("numeric");

    adapter.clearStatementCaches();
    expect(access.getColumnTypePlan(table, "views").pgType).toBe("boolean");
  });

  it("quotes table and column identifiers in atomicIncrement SQL", async () => {
    const adapter = new PostgreSQLAdapter();
    (adapter as unknown as { connected: boolean }).connected = true;

    const table = pgTable("Orders", { id: varchar("id", { length: 36 }) });
    (adapter as unknown as { getTable: unknown }).getTable = () => table;
    (adapter as unknown as { getColumn: unknown }).getColumn = (_t: unknown, name: string) => {
      if (name === "_id") return { name: "Id" };
      if (name === "Views") return { name: "Views", dataType: "number", columnType: "PgInteger" };
      return undefined;
    };

    const captured: string[] = [];
    Object.defineProperty(adapter, "raw", {
      value: {
        execute: async (sqlText: string) => {
          captured.push(sqlText);
          return [{ count: 1, _id: "1", Views: 5 }];
        },
        client: null,
      },
    });

    const wrapMock = vi.spyOn(
      adapter as unknown as {
        wrap: (fn: () => Promise<unknown>) => Promise<{ success: true; data: unknown }>;
      },
      "wrap",
    );
    wrapMock.mockImplementation(async (fn: () => Promise<unknown>) => ({
      success: true,
      data: await fn(),
    }));

    await adapter.atomicIncrement("orders", "1" as unknown as DatabaseId, "Views", 5);

    expect(captured[0]).toBe(
      'UPDATE "Orders" SET "Views" = coalesce("Views", 0) + $2::numeric, "updatedAt" = now() WHERE "Id" = $1 RETURNING *',
    );
  });

  it("preserves the pre-refactor insert / update / bulk SQL shapes", () => {
    const catalog: Record<string, ColumnShape> = {
      _id: { name: "_id", dataType: "string", columnType: "PgVarchar" },
      status: { name: "status", dataType: "string", columnType: "PgVarchar" },
      data: { name: "data", dataType: "json", columnType: "PgJsonb" },
      views: { name: "views", dataType: "number", columnType: "PgInteger" },
      isDeleted: { name: "isDeleted", dataType: "boolean", columnType: "PgBoolean" },
      publishedAt: { name: "publishedAt", dataType: "date", columnType: "PgTimestamp" },
    };
    const adapter = makeAdapter(catalog);
    const ctx = makeCtx(catalog);

    const insertTpl = (
      adapter as unknown as {
        _getInsertTemplate(
          t: unknown,
          n: string,
          s: Record<string, unknown>,
        ): {
          sqlText: string;
          unnestSqlText: string;
        };
      }
    )._getInsertTemplate({}, "collection_posts", {
      _id: "x",
      status: "draft",
      data: {},
      views: 0,
      isDeleted: false,
      publishedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(insertTpl.sqlText).toBe(
      'INSERT INTO "collection_posts" ("_id", "status", "data", "views", "isDeleted", "publishedAt") VALUES ($1, $2, $3::jsonb, $4, $5, $6)',
    );
    expect(insertTpl.unnestSqlText).toBe(
      'INSERT INTO "collection_posts" ("_id", "status", "data", "views", "isDeleted", "publishedAt") SELECT u.c0, u.c1, u.c2::jsonb, u.c3::numeric, u.c4::boolean, u.c5::timestamptz FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[]) AS u(c0, c1, c2, c3, c4, c5)',
    );

    const singleUpdate = getUpdateTemplate(
      ctx,
      {},
      "collection_posts",
      ["status", "views", "data"],
      "_id",
      "",
      false,
      null,
      false,
    );
    expect(singleUpdate.sqlWithReturning).toBe(
      'UPDATE "collection_posts" SET "status" = $1, "views" = $2, "data" = $3::jsonb WHERE "_id" = $4 RETURNING *',
    );

    const batchTemplates = getUpdateValuesTemplates(
      ctx,
      {},
      "collection_posts",
      "_id",
      ["status", "views", "data"],
      false,
      false,
    );
    const size2 = batchTemplates.find((t) => t.size === 2);
    expect(size2?.sqlText).toBe(
      'UPDATE "collection_posts" AS t SET "status" = u.c0, "views" = u.c1::numeric, "data" = u.c2::jsonb FROM (VALUES ($1::text, $2::text, $3::text, $4::text), ($5::text, $6::text, $7::text, $8::text)) AS u(c0, c1, c2, _id) WHERE t."_id" = u._id RETURNING t.*',
    );

    const bulkTpl = (
      adapter as unknown as {
        _getRawBulkUpdateTemplate(
          t: unknown,
          tableName: string,
          idColName: string,
          setCols: string[],
          hasTenant: boolean,
        ): { rawSql: string };
      }
    )._getRawBulkUpdateTemplate({}, "collection_posts", "_id", ["status", "views", "data"], false);
    expect(bulkTpl.rawSql).toBe(
      'UPDATE "collection_posts" AS t SET "status" = CASE WHEN v."c0_pres" = \'1\' THEN v."c0_val" ELSE t."status" END, "views" = CASE WHEN v."c1_pres" = \'1\' THEN v."c1_val"::numeric ELSE t."views" END, "data" = CASE\n            WHEN v."data_mode" = \'patch\' THEN COALESCE(t."data", \'{}\'::jsonb) || v."data_val"::jsonb\n            WHEN v."data_mode" = \'set\' THEN v."data_val"::jsonb\n            ELSE t."data"\n          END FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[]) AS v("_unnest_id", "c0_val", "c0_pres", "c1_val", "c1_pres", "data_val", "data_mode") WHERE t."_id" = v."_unnest_id"',
    );
  });
});
