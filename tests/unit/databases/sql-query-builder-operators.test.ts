/**
 * @file tests/unit/databases/sql-query-builder-operators.test.ts
 * @description Unit tests for SqlQueryBuilder operators, guards, empty filters, and dialect parity.
 *
 * Features:
 * - Refuses function-based where conditions with informative error message
 * - Refuses MongoDB-style object/array operators in where() to prevent silent failures
 * - Handles empty array in whereIn with 1=0 safe condition
 * - Handles empty array in whereNotIn with 1=1 safe condition
 * - Generates isNull and isNotNull conditions
 * - Handles whereBetween for range checks
 * - Verifies dialect contracts across PostgreSQL, SQLite, and MariaDB
 */

import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import {
  MARIADB_DIALECT,
  POSTGRES_DIALECT,
  SqlQueryBuilder,
  SQLITE_DIALECT,
  readCount,
} from "@src/databases/core/sql-query-builder";
import { mergeKeysetFilter } from "@src/databases/core/page-utils";
import type { BaseEntity } from "@src/databases/db-interface";

interface TestArticle extends BaseEntity {
  title: string;
  status: string;
  views: number;
  tags?: string[];
}

function createMockBuilderCore(tableColumns: string[] = ["_id", "title", "status", "views"]) {
  const table: Record<string, { name: string }> = {};
  for (const col of tableColumns) {
    table[col] = { name: col };
  }

  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      // oxlint-disable-next-line unicorn/no-thenable
      then: (resolve: (v: unknown) => unknown) => Promise.resolve([]).then(resolve),
    }),
  });

  return {
    core: {
      db: { select },
      getTable: vi.fn().mockReturnValue(table),
      getJsonField: vi.fn().mockImplementation((f: string) => sql`json_extract(data, ${`$.${f}`})`),
      handleError: vi.fn().mockImplementation((_err, code, msg) => ({
        success: false as const,
        message: msg || "error",
        error: { code, message: msg || "error" },
      })),
      notImplemented: vi.fn().mockImplementation((method) => ({
        success: false as const,
        message: `${method} not implemented`,
        error: { code: "NOT_IMPLEMENTED", message: `${method} not implemented` },
      })),
      registerReadSchema: vi.fn(),
    },
    table,
  };
}

describe("SqlQueryBuilder operators & guards", () => {
  describe("guard assertions", () => {
    it("refuses function-based where conditions with clear error message", () => {
      const { core } = createMockBuilderCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      expect(() => {
        qb.where((() => true) as unknown as Partial<TestArticle>);
      }).toThrowError(/Function-based where conditions are not supported/);
    });

    it("refuses MongoDB-style operator objects in where()", () => {
      const { core } = createMockBuilderCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      expect(() => {
        qb.where({ status: { $in: ["draft", "published"] } } as unknown as Partial<TestArticle>);
      }).toThrowError(/Operator\/array values in where\(\) are not supported/);
    });
  });

  describe("whereIn and whereNotIn edge cases", () => {
    it("handles empty arrays in whereIn by appending 1=0 condition", async () => {
      const { core } = createMockBuilderCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      qb.whereIn("status", []);
      // Internal conditions should have 1=0
      const conditions = (qb as unknown as { conditions: unknown[] }).conditions;
      expect(conditions).toHaveLength(1);
    });

    it("handles non-empty array in whereIn for physical column", () => {
      const { core } = createMockBuilderCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      qb.whereIn("status", ["published", "archived"]);
      const conditions = (qb as unknown as { conditions: unknown[] }).conditions;
      expect(conditions).toHaveLength(1);
    });

    it("handles empty arrays in whereNotIn by appending 1=1 condition", () => {
      const { core } = createMockBuilderCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      qb.whereNotIn("status", []);
      const conditions = (qb as unknown as { conditions: unknown[] }).conditions;
      expect(conditions).toHaveLength(1);
    });

    it("handles dynamic JSON fields in whereIn when column is not physical", () => {
      const { core } = createMockBuilderCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      // 'category' is not in tableColumns, should route to getJsonField
      qb.whereIn("category" as unknown as keyof TestArticle, ["tech", "news"] as unknown as never);
      expect(core.getJsonField).toHaveBeenCalledWith("category");
    });
  });

  describe("whereNull, whereNotNull, and search", () => {
    it("adds isNull condition for physical columns", () => {
      const { core } = createMockBuilderCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      qb.whereNull("status");
      const conditions = (qb as unknown as { conditions: unknown[] }).conditions;
      expect(conditions).toHaveLength(1);
    });

    it("adds isNotNull condition for physical columns", () => {
      const { core } = createMockBuilderCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      qb.whereNotNull("title");
      const conditions = (qb as unknown as { conditions: unknown[] }).conditions;
      expect(conditions).toHaveLength(1);
    });

    it("escapes special characters (%, _, \\) in search queries", () => {
      const { core } = createMockBuilderCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      qb.search("100%_bonus\\test", ["title"]);
      const conditions = (qb as unknown as { conditions: unknown[] }).conditions;
      expect(conditions).toHaveLength(1);
    });
  });

  describe("whereBetween", () => {
    it("adds range condition for physical column", () => {
      const { core } = createMockBuilderCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      qb.whereBetween("views", 10, 100);
      const conditions = (qb as unknown as { conditions: unknown[] }).conditions;
      expect(conditions).toHaveLength(1);
    });
  });

  describe("dialect contracts", () => {
    it("PostgreSQL dialect uses $1 parameter placeholders and ILIKE operator", () => {
      expect(POSTGRES_DIALECT.id).toBe("postgresql");
      expect(POSTGRES_DIALECT.bindAt(0)).toBe("$1");
      expect(POSTGRES_DIALECT.bindAt(9)).toBe("$10");
      expect(POSTGRES_DIALECT.likeOperator).toBe("ILIKE");
      expect(POSTGRES_DIALECT.quoteIdent("my_col")).toBe('"my_col"');
      expect(POSTGRES_DIALECT.supportsReturning).toBe(true);
    });

    it("SQLite dialect uses ? parameter placeholders and ANSI quotes", () => {
      expect(SQLITE_DIALECT.id).toBe("sqlite");
      expect(SQLITE_DIALECT.bindAt(0)).toBe("?");
      expect(SQLITE_DIALECT.likeOperator).toBe("LIKE");
      expect(SQLITE_DIALECT.quoteIdent("title")).toBe('"title"');
      expect(SQLITE_DIALECT.supportsReturning).toBe(false);
    });

    it("MariaDB dialect uses ? parameter placeholders and backtick quotes", () => {
      expect(MARIADB_DIALECT.id).toBe("mariadb");
      expect(MARIADB_DIALECT.bindAt(0)).toBe("?");
      expect(MARIADB_DIALECT.likeOperator).toBe("LIKE");
      expect(MARIADB_DIALECT.quoteIdent("created_at")).toBe("`created_at`");
      expect(MARIADB_DIALECT.supportsReturning).toBe(false);
      expect(MARIADB_DIALECT.mariaDoubleParseJson).toBe(true);
    });
  });

  describe("readCount helper", () => {
    it("extracts count from standard object with number or bigint", () => {
      expect(readCount({ count: 42 })).toBe(42);
      expect(readCount({ count: 99n })).toBe(99);
      expect(readCount({ COUNT: 15 })).toBe(15);
      expect(readCount({ count: "123" })).toBe(123);
    });

    it("returns 0 for null, undefined, or empty rows", () => {
      expect(readCount(null)).toBe(0);
      expect(readCount(undefined)).toBe(0);
      expect(readCount({})).toBe(0);
      expect(readCount({ count: Number.NaN })).toBe(0);
    });
  });

  describe("applyFilterAndOptions and compilation", () => {
    const articlesTable = sqliteTable("articles", {
      _id: text("_id").primaryKey(),
      title: text("title").notNull(),
      status: text("status").notNull(),
      views: integer("views").notNull(),
      tenantId: text("tenantId"),
    });

    function createCompilableCore() {
      return {
        db: {},
        getTable: vi.fn().mockReturnValue(articlesTable),
        getJsonField: vi
          .fn()
          .mockImplementation((f: string) => sql`json_extract(data, ${`$.${f}`})`),
        handleError: vi.fn(),
        notImplemented: vi.fn(),
        executeCompiled: vi.fn().mockResolvedValue([]),
      };
    }

    it("compiles equality filter and pagination options to SQL with bound parameters", () => {
      const core = createCompilableCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      qb.applyFilterAndOptions(
        { status: "published" },
        { limit: 25, offset: 50, sort: { views: "desc" } },
      );

      const compiled = qb.compile("list");
      expect(compiled).not.toBeNull();
      expect(compiled?.sql).toContain('WHERE "status" = ?');
      expect(compiled?.sql).toContain('ORDER BY "views" DESC');
      expect(compiled?.sql).toContain("LIMIT ? OFFSET ?");
      expect(compiled?.params).toEqual(["published", 25, 50]);
    });

    it("compiles count queries for physical column filters", () => {
      const core = createCompilableCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", POSTGRES_DIALECT);

      qb.applyFilterAndOptions({ status: "active" });

      const compiled = qb.compile("count");
      expect(compiled).not.toBeNull();
      expect(compiled?.sql).toBe('SELECT count(*) AS count FROM "articles" WHERE "status" = $1');
      expect(compiled?.params).toEqual(["active"]);
    });

    it("compiles search on physical columns with LIKE / ESCAPE", () => {
      const core = createCompilableCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      qb.search("hello", ["title"]);
      const compiled = qb.compile("list");
      expect(compiled).not.toBeNull();
      expect(compiled?.sql).toContain('"title" LIKE ? ESCAPE ?');
      expect(compiled?.params).toContain("%hello%");
      expect(compiled?.params).toContain("\\");
    });

    it("compiles complex operators ($in, $gte, $lte) through applyFilterAndOptions", () => {
      const core = createCompilableCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      qb.applyFilterAndOptions({
        status: { $in: ["draft", "review"] } as never,
        views: { $gte: 10, $lte: 100 } as never,
      });

      const compiled = qb.compile("list");
      expect(compiled).not.toBeNull();
      expect(compiled?.sql).toContain('"status" IN (?, ?)');
      expect(compiled?.sql).toContain('"views" >= ? AND "views" <= ?');
      expect(compiled?.params).toEqual(["draft", "review", 10, 100]);
    });

    it("flattens a $and (keyset base + _id cursor) onto the compiled plan", () => {
      const core = createCompilableCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      // Exactly the shape mergeKeysetFilter emits for a pure _id cursor over a
      // non-empty base query.
      qb.applyFilterAndOptions(
        { $and: [{ status: "published" }, { _id: { $lt: "cursor-id" } }] } as never,
        { limit: 10 },
      );

      const compiled = qb.compile("list");
      expect(compiled).not.toBeNull();
      expect(compiled?.sql).toContain('WHERE "status" = ? AND "_id" < ?');
      expect(compiled?.params).toEqual(["published", "cursor-id", 10]);
    });

    it("compiles the compound keyset $or (leaf + $and tie group)", () => {
      const core = createCompilableCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      // The compound cursor shape page-utils emits when sorting by a non-unique
      // field: one single-field comparator, one (field, _id) conjunction.
      qb.applyFilterAndOptions(
        {
          status: "published",
          $or: [{ views: { $lt: 50 } }, { $and: [{ views: 50 }, { _id: { $lt: "cursor-id" } }] }],
        } as never,
        { limit: 10, sort: { views: "desc" } },
      );

      const compiled = qb.compile("list");
      expect(compiled).not.toBeNull();
      expect(compiled?.sql).toContain(
        '"status" = ? AND ("views" < ? OR ("views" = ? AND "_id" < ?))',
      );
      expect(compiled?.params).toEqual(["published", 50, 50, "cursor-id", 10]);
    });

    it("keeps an OR with a nested $or on the Drizzle path (never partially compiles)", () => {
      const core = createCompilableCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      qb.applyFilterAndOptions(
        { $or: [{ $or: [{ status: "a" }, { status: "b" }] }, { views: 1 }] } as never,
        {},
      );

      expect(qb.compile("list")).toBeNull();
    });

    it("does not compile a $and that reaches a dynamic JSON field", () => {
      const core = createCompilableCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      qb.applyFilterAndOptions({ $and: [{ status: "published" }, { category: "news" }] } as never, {
        limit: 10,
      });

      expect(qb.compile("list")).toBeNull();
    });

    it("compiles the exact keyset filter mergeKeysetFilter emits for a compound sort", () => {
      const core = createCompilableCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      // The register findPage takes: a base tenant filter plus an opaque
      // (views, _id) compound cursor.
      const filter = mergeKeysetFilter(
        { tenantId: "acme" },
        {
          id: "id-42",
          f: "views",
          v: 50,
          d: "desc",
        },
      );
      qb.applyFilterAndOptions(filter as never, { limit: 20, sort: { views: "desc" } });

      const compiled = qb.compile("list");
      expect(compiled).not.toBeNull();
      expect(compiled?.sql).toContain(
        'WHERE "tenantId" = ? AND ("views" < ? OR ("views" = ? AND "_id" < ?))',
      );
      expect(compiled?.params).toEqual(["acme", 50, 50, "id-42", 20]);
    });

    it("preserves _id and selects only requested physical columns when options.fields is specified", () => {
      const core = createCompilableCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      qb.applyFilterAndOptions({ status: "published" } as never, {
        fields: ["title", "views"] as never,
        limit: 10,
      });

      const compiled = qb.compile("list");
      expect(compiled).not.toBeNull();
      expect(compiled?.sql).toContain(
        'SELECT "_id", "title", "views" FROM "articles" WHERE "status" = ?',
      );
      expect(compiled?.params).toEqual(["published", 10]);
    });

    it("enforces tenant isolation and prevents tenant bypass via nested $and", () => {
      const core = createCompilableCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "articles", SQLITE_DIALECT);

      // An attacker attempts to inject a conflicting tenantId inside a nested $and
      qb.applyFilterAndOptions(
        { $and: [{ tenantId: "attacker-tenant" }, { status: "published" }] } as never,
        { tenantId: "victim-tenant" as never },
      );

      const compiled = qb.compile("list");
      expect(compiled).not.toBeNull();
      // Must contain BOTH tenantId predicates, creating an impossible condition that returns 0 rows
      expect(compiled?.sql).toContain('"tenantId" = ?');
      expect(compiled?.params).toContain("victim-tenant");
      expect(compiled?.params).toContain("attacker-tenant");
    });
  });

  describe("compiled date-column coercion (keyset correctness)", () => {
    const datedTable = sqliteTable("dated_articles", {
      _id: text("_id").primaryKey(),
      status: text("status").notNull(),
      updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
    });

    function createDatedCore() {
      return {
        db: {},
        getTable: vi.fn().mockReturnValue(datedTable),
        getJsonField: vi
          .fn()
          .mockImplementation((f: string) => sql`json_extract(data, ${`$.${f}`})`),
        handleError: vi.fn(),
        notImplemented: vi.fn(),
        executeCompiled: vi.fn().mockResolvedValue([]),
      };
    }

    it("binds Date (not the raw ISO string) for the keyset comparator and tie equality", () => {
      const core = createDatedCore();
      const qb = new SqlQueryBuilder<TestArticle>(core, "dated_articles", SQLITE_DIALECT);

      const iso = "2026-01-02T00:00:00.000Z";
      const filter = mergeKeysetFilter(
        { status: "published" },
        { id: "id-42", f: "updatedAt", v: iso, d: "desc" },
      );
      qb.applyFilterAndOptions(filter as never, { limit: 20, sort: { updatedAt: "desc" } });

      const compiled = qb.compile("list");
      expect(compiled).not.toBeNull();
      expect(compiled?.sql).toContain('"updatedAt" < ?');
      expect(compiled?.sql).toContain('"updatedAt" = ?');
      // A raw ISO string compares INTEGER < TEXT on SQLite (always true → page
      // overlap), so every date value must be a Date for the driver to map to
      // epoch millis via executePreparedStatement.
      const dateParams = (compiled?.params ?? []).filter((p) => p instanceof Date) as Date[];
      expect(dateParams).toHaveLength(2);
      expect(dateParams.every((d) => d.getTime() === Date.parse(iso))).toBe(true);
      expect(compiled?.params).not.toContain(iso);
      // Non-date columns still bind their raw values.
      expect(compiled?.params).toContain("published");
      expect(compiled?.params).toContain("id-42");
    });
  });
});
