/**
 * @file tests/unit/databases/sql-query-builder-compile.test.ts
 * @description Compile-path coverage for the physical-column shapes of
 *   `whereIn` / `whereNotIn` / `whereBetween` / `orWhere` on all three SQL
 *   dialects, plus the fallback guards that keep JSON / mixed / non-bindable
 *   shapes on the Drizzle dynamic AST.
 *
 * Features:
 * - exact compiled SQL text + parameter order per shape per dialect
 * - IN arity and OR structure participate in the cache-key signature
 * - JSON-backed fields, empty IN arrays, non-bindable values, and nested-OR
 *   shapes stay on Drizzle (executeCompiled is never reached); a multi-field OR
 *   alternative now compiles as an AND-group inside the OR
 */

import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  MARIADB_DIALECT,
  POSTGRES_DIALECT,
  SqlQueryBuilder,
  SQLITE_DIALECT,
} from "@src/databases/core/sql-query-builder";

// A fresh table per dialect — the builder memoizes compiled table metadata per
// table object, so reusing one table across dialects would leak quoting.
function makePosts() {
  return sqliteTable("posts", {
    _id: text("_id").primaryKey(),
    status: text("status"),
    value: integer("value"),
    tenantId: text("tenantId"),
    createdAt: text("createdAt"),
  });
}

const COLS = ["_id", "status", "value", "tenantId", "createdAt"];

function compiledCore(table: ReturnType<typeof makePosts>, rows: unknown[] = []) {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const select = vi.fn();
  const core = {
    db: { select },
    getTable: () => table,
    getJsonField: () => sql`data`,
    handleError: () => ({
      success: false as const,
      message: "err",
      error: { code: "TEST_ERR", message: "err" },
    }),
    notImplemented: () => ({
      success: false as const,
      message: "ni",
      error: { code: "TEST_NI", message: "ni" },
    }),
    registerReadSchema: vi.fn(),
    executeCompiled: async (sqlText: string, params: readonly unknown[]) => {
      calls.push({ sql: sqlText, params });
      return rows;
    },
    noteListSort: vi.fn(),
  };
  return { core, calls, select };
}

function chainFrom(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.$dynamic = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.limit = () => chain;
  chain.offset = () => chain;
  // oxlint-disable-next-line unicorn/no-thenable
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return chain;
}

describe("SqlQueryBuilder compiled physical-column shapes", () => {
  const dialects = [
    { name: "sqlite", dialect: SQLITE_DIALECT },
    { name: "postgresql", dialect: POSTGRES_DIALECT },
    { name: "mariadb", dialect: MARIADB_DIALECT },
  ] as const;

  for (const { name, dialect } of dialects) {
    const quote = dialect.quoteIdent;
    const bind = dialect.bindAt;
    const prefix = `SELECT ${COLS.map((c) => quote(c)).join(", ")}`;

    it(`compiles whereIn (${name})`, async () => {
      const { core, calls, select } = compiledCore(makePosts());
      const qb = new SqlQueryBuilder(core, "posts", dialect);
      const res = await qb.whereIn("status" as never, ["draft", "published"] as never).execute();
      if (!res.success) throw new Error("expected success");
      expect(select).not.toHaveBeenCalled();
      expect(calls).toHaveLength(1);
      expect(calls[0].sql).toBe(
        `${prefix} FROM ${quote("posts")} WHERE ${quote("status")} IN (${bind(0)}, ${bind(1)})`,
      );
      expect(calls[0].params).toEqual(["draft", "published"]);
    });

    it(`compiles whereNotIn (${name})`, async () => {
      const { core, calls, select } = compiledCore(makePosts());
      const qb = new SqlQueryBuilder(core, "posts", dialect);
      const res = await qb.whereNotIn("status" as never, ["archived"] as never).execute();
      if (!res.success) throw new Error("expected success");
      expect(select).not.toHaveBeenCalled();
      expect(calls[0].sql).toBe(
        `${prefix} FROM ${quote("posts")} WHERE ${quote("status")} NOT IN (${bind(0)})`,
      );
      expect(calls[0].params).toEqual(["archived"]);
    });

    it(`compiles whereBetween (${name})`, async () => {
      const { core, calls, select } = compiledCore(makePosts());
      const qb = new SqlQueryBuilder(core, "posts", dialect);
      const res = await qb.whereBetween("value" as never, 10 as never, 20 as never).execute();
      if (!res.success) throw new Error("expected success");
      expect(select).not.toHaveBeenCalled();
      expect(calls[0].sql).toBe(
        `${prefix} FROM ${quote("posts")} WHERE ${quote("value")} >= ${bind(0)} AND ${quote(
          "value",
        )} <= ${bind(1)}`,
      );
      expect(calls[0].params).toEqual([10, 20]);
    });

    it(`compiles orWhere of single-column eq alternatives (${name})`, async () => {
      const { core, calls, select } = compiledCore(makePosts());
      const qb = new SqlQueryBuilder(core, "posts", dialect);
      const res = await qb.orWhere([{ status: "draft" }, { status: "published" }]).execute();
      if (!res.success) throw new Error("expected success");
      expect(select).not.toHaveBeenCalled();
      expect(calls[0].sql).toBe(
        `${prefix} FROM ${quote("posts")} WHERE (${quote("status")} = ${bind(0)} OR ${quote(
          "status",
        )} = ${bind(1)})`,
      );
      expect(calls[0].params).toEqual(["draft", "published"]);
    });

    it(`compiles orWhere with an isnull alternative (${name})`, async () => {
      const { core, calls, select } = compiledCore(makePosts());
      const qb = new SqlQueryBuilder(core, "posts", dialect);
      const res = await qb.orWhere([{ status: null }, { status: "draft" }]).execute();
      if (!res.success) throw new Error("expected success");
      expect(select).not.toHaveBeenCalled();
      expect(calls[0].sql).toBe(
        `${prefix} FROM ${quote("posts")} WHERE (${quote("status")} IS NULL OR ${quote(
          "status",
        )} = ${bind(0)})`,
      );
      expect(calls[0].params).toEqual(["draft"]);
    });

    it(`preserves param order across mixed predicates (${name})`, async () => {
      const { core, calls } = compiledCore(makePosts());
      const qb = new SqlQueryBuilder(core, "posts", dialect);
      const res = await qb
        .where({ tenantId: "global" } as never)
        .whereIn("status" as never, ["draft", "published"] as never)
        .whereBetween("value" as never, 1 as never, 9 as never)
        .execute();
      if (!res.success) throw new Error("expected success");
      expect(calls[0].sql).toBe(
        `${prefix} FROM ${quote("posts")} WHERE ${quote("tenantId")} = ${bind(0)} AND ${quote(
          "status",
        )} IN (${bind(1)}, ${bind(2)}) AND ${quote("value")} >= ${bind(3)} AND ${quote(
          "value",
        )} <= ${bind(4)}`,
      );
      expect(calls[0].params).toEqual(["global", "draft", "published", 1, 9]);
    });

    it(`compiles whereIn count and reuses the SQL text when values change (${name})`, async () => {
      const { core, calls, select } = compiledCore(makePosts(), [{ count: 2 }]);
      const first = new SqlQueryBuilder(core, "posts", dialect);
      const res = await first.whereIn("status" as never, ["draft", "published"] as never).count();
      if (!res.success) throw new Error("expected success");
      expect(res.data).toBe(2);
      expect(select).not.toHaveBeenCalled();

      const second = new SqlQueryBuilder(core, "posts", dialect);
      await second.whereIn("status" as never, ["archived", "deleted"] as never).count();
      expect(calls).toHaveLength(2);
      // Same arity ⇒ same SQL text; only the bound values differ.
      expect(calls[0].sql).toBe(calls[1].sql);
      expect(calls[0].params).toEqual(["draft", "published"]);
      expect(calls[1].params).toEqual(["archived", "deleted"]);
    });
  }

  it("keeps JSON whereIn on Drizzle", async () => {
    const { core, calls, select } = compiledCore(makePosts());
    const chain = chainFrom([]);
    select.mockImplementation(() => ({ from: () => chain }));
    const qb = new SqlQueryBuilder(core, "posts", SQLITE_DIALECT);
    await qb.whereIn("title" as never, ["Hello"] as never).execute();
    expect(calls).toHaveLength(0);
    expect(select).toHaveBeenCalled();
  });

  it("keeps empty whereIn on Drizzle", async () => {
    const { core, calls, select } = compiledCore(makePosts());
    const chain = chainFrom([]);
    select.mockImplementation(() => ({ from: () => chain }));
    const qb = new SqlQueryBuilder(core, "posts", SQLITE_DIALECT);
    await qb.whereIn("status" as never, [] as never).execute();
    expect(calls).toHaveLength(0);
    expect(select).toHaveBeenCalled();
  });

  it("keeps non-bindable whereIn values on Drizzle", async () => {
    const { core, calls, select } = compiledCore(makePosts());
    const chain = chainFrom([]);
    select.mockImplementation(() => ({ from: () => chain }));
    const qb = new SqlQueryBuilder(core, "posts", SQLITE_DIALECT);
    await qb.whereIn("status" as never, [{ nested: true }, {}] as never).execute();
    expect(calls).toHaveLength(0);
    expect(select).toHaveBeenCalled();
  });

  it("keeps JSON whereBetween on Drizzle", async () => {
    const { core, calls, select } = compiledCore(makePosts());
    const chain = chainFrom([]);
    select.mockImplementation(() => ({ from: () => chain }));
    const qb = new SqlQueryBuilder(core, "posts", SQLITE_DIALECT);
    await qb.whereBetween("title" as never, "a" as never, "b" as never).execute();
    expect(calls).toHaveLength(0);
    expect(select).toHaveBeenCalled();
  });

  it("compiles a multi-field orWhere alternative as an AND-group inside the OR", async () => {
    const { core, calls, select } = compiledCore(makePosts());
    const qb = new SqlQueryBuilder(core, "posts", SQLITE_DIALECT);
    const res = await qb
      .orWhere([{ status: "draft", value: 1 }, { status: "published" }])
      .execute();
    if (!res.success) throw new Error("expected success");
    expect(select).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('WHERE (("status" = ? AND "value" = ?) OR "status" = ?)');
    expect(calls[0].params).toEqual(["draft", 1, "published"]);
  });

  it("keeps nested $or orWhere alternatives on Drizzle", async () => {
    const { core, calls, select } = compiledCore(makePosts());
    const chain = chainFrom([]);
    select.mockImplementation(() => ({ from: () => chain }));
    const qb = new SqlQueryBuilder(core, "posts", SQLITE_DIALECT);
    await qb
      .orWhere([{ $or: [{ status: "a" }, { status: "b" }] }, { status: "published" }])
      .execute();
    expect(calls).toHaveLength(0);
    expect(select).toHaveBeenCalled();
  });

  it("keeps JSON orWhere alternatives on Drizzle", async () => {
    const { core, calls, select } = compiledCore(makePosts());
    const chain = chainFrom([]);
    select.mockImplementation(() => ({ from: () => chain }));
    const qb = new SqlQueryBuilder(core, "posts", SQLITE_DIALECT);
    await qb.orWhere([{ title: "Hello" }, { status: "draft" }]).execute();
    expect(calls).toHaveLength(0);
    expect(select).toHaveBeenCalled();
  });
});
