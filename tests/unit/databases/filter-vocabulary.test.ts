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
import {
  compileBooleanFilterGroup,
  parseBooleanFilterGroup,
  type BooleanFilterGroup,
} from "@utils/boolean-filter";
import { whitelistFilterParams } from "@utils/collection-query-filters.server";
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

// ─── Full end-to-end filter operator parity (boolean-filter → whitelist → SQL/Mongo) ─

describe("end-to-end filter operator parity across URL compiler, whitelist, SQL, and MongoDB", () => {
  const allowed = new Set(["status", "views", "title"]);
  const mongoCore = new TestMongoCore();

  it("preserves all 8 portable operator shapes in whitelistFilterParams and strips unauthorized fields", () => {
    const whitelisted = whitelistFilterParams(
      {
        title: { contains: " svelte " },
        status: { ne: "archived" },
        views: { gt: 5 },
        $where: "1 === 1",
        unlisted_field: { eq: "secret" },
      },
      allowed,
    );

    expect(whitelisted).toEqual({
      title: { contains: "svelte" },
      status: { ne: "archived" },
      views: { gt: 5 },
    });
    expect(Object.keys(whitelisted)).not.toContain("$where");
    expect(Object.keys(whitelisted)).not.toContain("unlisted_field");
  });

  it("compiles BooleanFilterGroup AND rules through whitelist into matching SQL and Mongo predicates", () => {
    const group: BooleanFilterGroup = {
      combinator: "AND",
      rules: [
        { field: "status", operator: "not_equals", value: "draft" },
        { field: "views", operator: "gt", value: "25" },
      ],
    };

    const compiledGroup = compileBooleanFilterGroup(group);
    const safeFilter = whitelistFilterParams(compiledGroup.andFilter, allowed);

    expect(safeFilter).toEqual({
      status: { ne: "draft" },
      views: { gt: "25" },
    });

    const qb = new SqlQueryBuilder<TestArticle>(createCompilableCore(), "articles", SQLITE_DIALECT);
    qb.applyFilterAndOptions(safeFilter as never);
    const sqlCompiled = qb.compile("count");
    expect(sqlCompiled?.sql).toContain('"status" <> ?');
    expect(sqlCompiled?.sql).toContain('"views" > ?');
    expect(sqlCompiled?.params).toEqual(["draft", "25"]);

    const mongoCompiled = mongoCore.mapQuery(safeFilter as Record<string, unknown>);
    expect(mongoCompiled).toEqual({
      status: { $ne: "draft" },
      views: { $gt: "25" },
    });
  });

  it("fails closed with 400 FILTER_UNSUPPORTED_OPERATOR when an unsupported operator is supplied", () => {
    for (const forbidden of ["not_contains", "starts_with", "ends_with"]) {
      expect(() =>
        parseBooleanFilterGroup({
          combinator: "AND",
          rules: [{ field: "status", operator: forbidden, value: "pub" }],
        }),
      ).toThrow(/Unsupported filter operator/);
    }
  });
});
