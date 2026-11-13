/**
 * @file tests/unit/databases/filter-vocabulary.test.ts
 * @description Unit-level compile tests for the portable filter vocabulary
 * (`ne`, `gt`, `lt`) added to `CollectionFilterOp`.
 *
 * `compileBooleanFilterGroup` emits bare portable keys (`{ ne }`, `{ gt }`,
 * `{ lt }`); the REST/bracket pipeline rewrites them to `$` form upstream, but
 * the `filterLogic` advanced-filter path reaches the adapters still bare. These
 * tests pin that every adapter compiles the bare spellings to the correct
 * strict SQL comparison (`<>`, `>`, `<`) and Mongo operator (`$ne`, `$gt`,
 * `$lt`) — and that `ne` never becomes an equality/inverted `contains`.
 */

import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { integer, SQLiteSyncDialect, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { SqlQueryBuilder, SQLITE_DIALECT } from "@src/databases/core/sql-query-builder";
import { mapQuery } from "@src/databases/core/drizzle-sql-helpers";
import { MongoAdapterCore } from "@src/databases/mongodb/adapter-core";
import type { BaseEntity, IBatchAdapter, ICrudAdapter } from "@src/databases/db-interface";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

interface TestArticle extends BaseEntity {
  status: string;
  views: number;
}

const sqliteArticles = sqliteTable("articles", {
  _id: text("_id").primaryKey(),
  status: text("status").notNull(),
  views: integer("views").notNull(),
});

function createCompilableCore() {
  return {
    db: {},
    getTable: vi.fn().mockReturnValue(sqliteArticles),
    getJsonField: vi.fn().mockImplementation((f: string) => sql`json_extract(data, ${`$.${f}`})`),
    handleError: vi.fn(),
    notImplemented: vi.fn(),
    executeCompiled: vi.fn().mockResolvedValue([]),
  };
}

/** SQL + bound params for a filter object, through the Drizzle dynamic `mapQuery` path. */
function buildDynamicSql(filter: Record<string, unknown>): { sql: string; params: unknown[] } {
  const where = mapQuery(
    sqliteArticles,
    filter,
    {},
    (t, name) => t[name],
    (field: string) => sql`json_extract(data, ${`$.${field}`})`,
  );
  expect(where, `mapQuery produced no WHERE clause for ${JSON.stringify(filter)}`).toBeDefined();
  const query = new SQLiteSyncDialect().sqlToQuery(where as never);
  return { sql: query.sql, params: [...query.params] };
}

class TestMongoCore extends MongoAdapterCore {
  public get crud(): ICrudAdapter {
    throw new Error("crud not used in filter-vocabulary tests");
  }
  public get batch(): IBatchAdapter {
    throw new Error("batch not used in filter-vocabulary tests");
  }
}

// ─── SQL compiled path (SqlQueryBuilder) ─────────────────────────────────────

describe("portable filter vocabulary → SQL compiled path", () => {
  it("compiles bare `ne` to `<>` (never an equality)", () => {
    const qb = new SqlQueryBuilder<TestArticle>(createCompilableCore(), "articles", SQLITE_DIALECT);
    qb.applyFilterAndOptions({ status: { ne: "publish" } } as never);

    const compiled = qb.compile("count");
    expect(compiled).not.toBeNull();
    expect(compiled?.sql).toContain('"status" <> ?');
    expect(compiled?.params).toEqual(["publish"]);
  });

  it("compiles bare `gt` to a strict `>` (never `>=`)", () => {
    const qb = new SqlQueryBuilder<TestArticle>(createCompilableCore(), "articles", SQLITE_DIALECT);
    qb.applyFilterAndOptions({ views: { gt: 10 } } as never);

    const compiled = qb.compile("count");
    expect(compiled).not.toBeNull();
    expect(compiled?.sql).toContain('"views" > ?');
    expect(compiled?.sql).not.toContain('"views" >= ?');
    expect(compiled?.params).toEqual([10]);
  });

  it("compiles bare `lt` to a strict `<` (never `<=`)", () => {
    const qb = new SqlQueryBuilder<TestArticle>(createCompilableCore(), "articles", SQLITE_DIALECT);
    qb.applyFilterAndOptions({ views: { lt: 100 } } as never);

    const compiled = qb.compile("count");
    expect(compiled).not.toBeNull();
    expect(compiled?.sql).toContain('"views" < ?');
    expect(compiled?.sql).not.toContain('"views" <= ?');
    expect(compiled?.params).toEqual([100]);
  });
});

// ─── SQL dynamic path (drizzle-sql-helpers mapQuery) ─────────────────────────

describe("portable filter vocabulary → SQL dynamic path", () => {
  it("compiles bare `ne` to `<>`", () => {
    expect(buildDynamicSql({ status: { ne: "publish" } })).toEqual({
      sql: '"articles"."status" <> ?',
      params: ["publish"],
    });
  });

  it("compiles bare `gt` to `>` and `lt` to `<` (strict)", () => {
    expect(buildDynamicSql({ views: { gt: 10 } })).toEqual({
      sql: '"articles"."views" > ?',
      params: [10],
    });
    expect(buildDynamicSql({ views: { lt: 100 } })).toEqual({
      sql: '"articles"."views" < ?',
      params: [100],
    });
  });
});

// ─── Mongo path (MongoAdapterCore.mapQuery) ──────────────────────────────────

describe("portable filter vocabulary → Mongo", () => {
  const core = new TestMongoCore();

  it("maps bare `ne` to `$ne`", () => {
    expect(core.mapQuery({ status: { ne: "publish" } })).toEqual({
      status: { $ne: "publish" },
    });
  });

  it("maps bare `gt`/`lt` to strict `$gt`/`$lt`", () => {
    expect(core.mapQuery({ views: { gt: 10 } })).toEqual({ views: { $gt: 10 } });
    expect(core.mapQuery({ views: { lt: 100 } })).toEqual({ views: { $lt: 100 } });
  });
});
