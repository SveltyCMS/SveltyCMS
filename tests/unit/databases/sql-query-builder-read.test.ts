/**
 * @file tests/unit/databases/sql-query-builder-read.test.ts
 * @description QueryBuilder list/exists path: schema-aware in-place conversion
 *   and LIMIT 1 exists (the admin collection list uses queryBuilder, not crud.findMany).
 */

import { describe, expect, it, vi } from "vitest";
import { asc, desc, sql, type SQL } from "drizzle-orm";
import { SQLiteSyncDialect, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { BaseEntity } from "@src/databases/db-interface";
import { SqlQueryBuilder, SQLITE_DIALECT } from "@src/databases/core/sql-query-builder";
import { registerTableSchema } from "@src/databases/core/relational-utils";
import {
  buildFindPageResult,
  decodePageCursor,
  mergeKeysetFilter,
  resolvePageSort,
  withIdTiebreaker,
} from "@src/databases/core/page-utils";

function chainFrom(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.$dynamic = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.limit = (n: number) => {
    chain._limit = n;
    return chain;
  };
  chain.offset = () => chain;
  // Drizzle queries are thenable; the mock must be too so `await q` resolves.
  // oxlint-disable-next-line unicorn/no-thenable
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return chain;
}

describe("SqlQueryBuilder list/exists read path", () => {
  it("exists selects _id LIMIT 1 instead of COUNT(*)", async () => {
    const idCol = { name: "_id" };
    const table = { _id: idCol, status: { name: "status" } };
    const chain = chainFrom([{ id: "1" }]);
    const select = vi.fn((proj: unknown) => {
      expect(proj).toEqual({ id: idCol });
      return { from: () => chain };
    });
    const qb = new SqlQueryBuilder(
      {
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
      },
      "posts",
      SQLITE_DIALECT,
    );

    const res = await qb.exists();
    if (!res.success) throw new Error("expected success");
    expect(res.success).toBe(true);
    expect(res.data).toBe(true);
    expect(chain._limit).toBe(1);
  });

  it("execute registers read schema before converting rows in place", async () => {
    registerTableSchema("posts", ["_id", "createdAt", "title"]);
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const row = { _id: "1", createdAt, title: "Hello" };
    const chain = chainFrom([row]);
    const registerReadSchema = vi.fn();
    const qb = new SqlQueryBuilder(
      {
        db: {
          select: () => ({ from: () => chain }),
        },
        getTable: () => ({ _id: {}, createdAt: {}, title: {} }),
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
        registerReadSchema,
      },
      "posts",
      SQLITE_DIALECT,
    );

    const res = await qb.execute();
    if (!res.success) throw new Error("expected success");
    expect(registerReadSchema).toHaveBeenCalledWith("posts");
    expect(res.success).toBe(true);
    expect(res.data?.[0]).toBe(row);
    expect(row.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Paginated ORDER BY tie-breaker direction
// ---------------------------------------------------------------------------

describe("SqlQueryBuilder paginated ORDER BY tie-breaker", () => {
  const posts = sqliteTable("posts", {
    _id: text("_id").primaryKey(),
    status: text("status"),
    createdAt: text("createdAt"),
  });

  /** Builder whose select chain captures every orderBy(...) call against a real table. */
  function captureBuilder() {
    const captured: SQL[][] = [];
    const chain: Record<string, unknown> = {};
    chain.$dynamic = () => chain;
    chain.where = () => chain;
    chain.orderBy = (...clauses: SQL[]) => {
      captured.push(clauses);
      return chain;
    };
    chain.limit = () => chain;
    chain.offset = () => chain;
    // oxlint-disable-next-line unicorn/no-thenable
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve([]).then(resolve, reject);

    const qb = new SqlQueryBuilder(
      {
        db: { select: () => ({ from: () => chain }) },
        getTable: () => posts,
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
      },
      "posts",
      SQLITE_DIALECT,
    );
    return { qb, captured };
  }

  /** Render the last captured ORDER BY to the exact SQL the dialect would emit. */
  function emittedOrderBy(captured: SQL[][]): string {
    const clauses = captured.at(-1) ?? [];
    return new SQLiteSyncDialect().sqlToQuery(sql.join(clauses, sql`, `)).sql;
  }

  /** Expected ORDER BY from explicit asc/desc() clauses (same dialect rendering). */
  function expectedOrderBy(clauses: SQL[]): string {
    return new SQLiteSyncDialect().sqlToQuery(sql.join(clauses, sql`, `)).sql;
  }

  /** Direction tokens per ORDER BY key, e.g. ["desc", "desc"]. */
  function directions(sqlText: string): string[] {
    return [...sqlText.matchAll(/\b(asc|desc)\b/gi)].map((m) => m[1].toLowerCase());
  }

  /** Order spec derived from captured clauses (field name + direction). */
  function orderSpec(clauses: SQL[]): Array<{ field: string; direction: "asc" | "desc" }> {
    return clauses.map((clause) => {
      const chunks = (clause as unknown as { queryChunks: unknown[] }).queryChunks;
      // Drizzle prefixes an empty StringChunk, then the column, then " asc"/" desc".
      const column = chunks.find((chunk) => (chunk as { name?: unknown }).name !== undefined) as {
        name: string;
      };
      const tail = chunks[chunks.length - 1] as { value?: string[] };
      const token = (tail?.value ?? []).join("").trim().toLowerCase();
      return { field: column.name, direction: token === "asc" ? "asc" : "desc" };
    });
  }

  it("follows a DESC primary sort (index-friendly composite, no mixed direction)", async () => {
    const { qb, captured } = captureBuilder();
    // The default collection-list sort (collection-service.ts) plus offset paginate.
    qb.sort("createdAt", "desc").paginate({ page: 1, pageSize: 10 });
    await qb.execute();

    const emitted = emittedOrderBy(captured);
    expect(emitted).toBe(expectedOrderBy([desc(posts.createdAt), desc(posts._id)]));
    expect(directions(emitted)).toEqual(["desc", "desc"]);
  });

  it("follows an ASC primary sort", async () => {
    const { qb, captured } = captureBuilder();
    qb.sort("createdAt", "asc").paginate({ page: 1, pageSize: 10 });
    await qb.execute();

    const emitted = emittedOrderBy(captured);
    expect(emitted).toBe(expectedOrderBy([asc(posts.createdAt), asc(posts._id)]));
    expect(directions(emitted)).toEqual(["asc", "asc"]);
  });

  it("matches the LAST clause of a multi-field sort", async () => {
    const { qb, captured } = captureBuilder();
    // `status` is a dynamic collection column — not part of the static BaseEntity shape.
    qb.sort("status" as unknown as keyof BaseEntity, "asc")
      .sort("createdAt", "desc")
      .paginate({ page: 1, pageSize: 10 });
    await qb.execute();

    const emitted = emittedOrderBy(captured);
    expect(emitted).toBe(
      expectedOrderBy([asc(posts.status), desc(posts.createdAt), desc(posts._id)]),
    );
    expect(directions(emitted)).toEqual(["asc", "desc", "desc"]);
  });

  it("keeps the historical ASC tie-breaker when no explicit sort is given", async () => {
    const { qb, captured } = captureBuilder();
    qb.paginate({ page: 2, pageSize: 10 });
    await qb.execute();

    expect(emittedOrderBy(captured)).toBe(expectedOrderBy([asc(posts._id)]));
  });

  it("does not duplicate an explicit _id sort key", async () => {
    const { qb, captured } = captureBuilder();
    qb.sort("_id", "desc").paginate({ page: 1, pageSize: 10 });
    await qb.execute();

    const emitted = emittedOrderBy(captured);
    expect(emitted).toBe(expectedOrderBy([desc(posts._id)]));
    expect(directions(emitted)).toEqual(["desc"]);
  });

  it("keyset cursor seek keeps comparison and _id sort in lockstep (before → desc)", async () => {
    const { qb, captured } = captureBuilder();
    qb.paginate({ pageSize: 10, cursor: "id-5", cursorDirection: "before" });
    await qb.execute();

    // `_id < cursor` must pair with `_id desc` — an `_id asc` clause here would
    // make page N+1 repeat page N.
    expect(directions(emittedOrderBy(captured))).toEqual(["desc"]);

    const { qb: afterQb, captured: afterCaptured } = captureBuilder();
    afterQb.paginate({ pageSize: 10, cursor: "id-5", cursorDirection: "after" });
    await afterQb.execute();
    expect(directions(emittedOrderBy(afterCaptured))).toEqual(["asc"]);
  });

  // -------------------------------------------------------------------------
  // Keyset round-trip: the test that catches a tie-breaker direction mismatch.
  // Cursor semantics come from the shared page-utils contract (mergeKeysetFilter
  // — used by both the SQL and Mongo findPage adapters); the ORDER BY is the one
  // emitted by this builder. A DESC primary sort paired with an `_id ASC`
  // tie-break makes page 2 re-emit page 1's rows on sort-value ties.
  // -------------------------------------------------------------------------
  type Row = { _id: string; createdAt: string };

  /** Minimal evaluator for the $and/$or/$lt/$gt keyset filters page-utils emits. */
  function matchesFilter(row: Row, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, value]) => {
      if (key === "$and") {
        return (value as Record<string, unknown>[]).every((f) => matchesFilter(row, f));
      }
      if (key === "$or") {
        return (value as Record<string, unknown>[]).some((f) => matchesFilter(row, f));
      }
      const actual = String(row[key as keyof Row]);
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        const ops = value as Record<string, unknown>;
        if ("$lt" in ops) return actual < String(ops.$lt);
        if ("$gt" in ops) return actual > String(ops.$gt);
      }
      return actual === String(value);
    });
  }

  function bySpec(spec: Array<{ field: string; direction: "asc" | "desc" }>) {
    return (a: Row, b: Row) => {
      for (const { field, direction } of spec) {
        const av = String(a[field as keyof Row]);
        const bv = String(b[field as keyof Row]);
        if (av === bv) continue;
        const cmp = av < bv ? -1 : 1;
        return direction === "asc" ? cmp : -cmp;
      }
      return 0;
    };
  }

  /**
   * Walk every page exactly like findPage does (limit+1 → buildFindPageResult →
   * mergeKeysetFilter) but order rows with the clause spec emitted above.
   */
  async function walkKeyset(
    rows: Row[],
    pageSize: number,
    primary: { createdAt: -1 | 1 },
  ): Promise<string[]> {
    const { qb, captured } = captureBuilder();
    qb.sort("createdAt", primary.createdAt === 1 ? "asc" : "desc").paginate({
      page: 1,
      pageSize, // triggers the paginated tie-breaker path
    });
    await qb.execute();
    const spec = orderSpec(captured.at(-1) ?? []);

    const cursorSort = resolvePageSort(withIdTiebreaker(primary));
    const visited: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 50; guard++) {
      const decoded = decodePageCursor(cursor);
      const filter = decoded ? mergeKeysetFilter({}, decoded) : {};
      const matched = rows.filter((row) => matchesFilter(row, filter)).sort(bySpec(spec));
      const page = buildFindPageResult(
        // `Row` is a deliberately minimal projection (`_id` + sort value); the helper only
        // reads those two fields off the limit+1 window when it emits the next cursor.
        matched.slice(0, pageSize + 1) as unknown as BaseEntity[],
        pageSize,
        undefined,
        cursorSort,
      );
      visited.push(...page.items.map((r) => r._id));
      if (!page.hasMore || !page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return visited;
  }

  const TIE_ROWS: Row[] = [
    { _id: "a", createdAt: "2026-01-03" },
    { _id: "b", createdAt: "2026-01-03" },
    { _id: "c", createdAt: "2026-01-03" },
    { _id: "d", createdAt: "2026-01-02" },
    { _id: "e", createdAt: "2026-01-02" },
    { _id: "f", createdAt: "2026-01-02" },
    { _id: "g", createdAt: "2026-01-01" },
    { _id: "h", createdAt: "2026-01-01" },
  ];

  it("keyset round-trip (desc) visits every row exactly once despite duplicate sort values", async () => {
    const visited = await walkKeyset(TIE_ROWS, 3, { createdAt: -1 });
    expect(new Set(visited).size).toBe(visited.length);
    expect([...visited].sort()).toEqual(TIE_ROWS.map((r) => r._id).sort());
  });

  it("keyset round-trip (asc) visits every row exactly once despite duplicate sort values", async () => {
    const visited = await walkKeyset(TIE_ROWS, 3, { createdAt: 1 });
    expect(new Set(visited).size).toBe(visited.length);
    expect([...visited].sort()).toEqual(TIE_ROWS.map((r) => r._id).sort());
  });

  it("keyset round-trip preserves the emitted page order (desc ties are _id-descending)", async () => {
    const visited = await walkKeyset(TIE_ROWS, 3, { createdAt: -1 });
    expect(visited).toEqual(["c", "b", "a", "f", "e", "d", "h", "g"]);
  });
});
