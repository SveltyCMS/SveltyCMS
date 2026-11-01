/**
 * @file tests/unit/api/playground-filter-pipeline.test.ts
 * @description The API playground's filter rows must survive the WHOLE pipeline:
 * URL → `parseCollectionQueryParams` → SDK find (adapter query) → SQL.
 *
 * A parser that produces `{ status: { eq: "published" } }` looks right in a
 * parser-vs-parser assertion but is bound whole as the compared value by
 * `addFilterConds` (databases/core/drizzle-sql-helpers.ts) — a driver bind error
 * (500) on SQL and a never-matching equality on Mongo. These assertions therefore
 * end at the generated SQL / the query object the adapter receives, not at the
 * parser's own output.
 */

import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { integer, SQLiteSyncDialect, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { mapQuery } from "@src/databases/core/drizzle-sql-helpers";
import { parseCollectionQueryParams } from "@src/utils/api-params";
import {
  buildCollectionRestUrl,
  type PlaygroundFilterRow,
} from "@src/utils/api-playground/rest-query-url";
import { CollectionsNamespace } from "@src/services/sdk/namespaces/collections-namespace";
import { BaseAdapter } from "@src/databases/core/base-adapter";
import type { IBatchAdapter, ICrudAdapter } from "@src/databases/db-interface";
import type { DatabaseId, Schema } from "@src/content/types";

// ─── SQL side: the real query builder against a real SQLite table ─────────────

const table = sqliteTable("content_posts", {
  _id: text("_id").primaryKey(),
  title: text("title"),
  status: text("status"),
  views: integer("views"),
  tags: text("tags"),
  tenantId: text("tenantId"),
  data: text("data"),
});

const dialect = new SQLiteSyncDialect();

/** SQL + bound params for a filter object, exactly as the adapter would build it. */
function buildSql(filter: Record<string, unknown>): { sql: string; params: unknown[] } {
  const where = mapQuery(
    table,
    filter,
    {},
    (t: any, name: string) => t[name],
    (field: string) => sql`json_extract(${table.data}, ${"$." + field})`,
  );
  expect(where, `mapQuery produced no WHERE clause for ${JSON.stringify(filter)}`).toBeDefined();
  const query = dialect.sqlToQuery(where as never);
  return { sql: query.sql, params: [...query.params] };
}

/** Filter the playground would send for one row, round-tripped through the parser. */
function parsedFilter(rows: readonly PlaygroundFilterRow[]): Record<string, unknown> {
  const url = buildCollectionRestUrl({ collectionId: "posts", filters: rows });
  return parseCollectionQueryParams(new URL(url, "http://localhost").searchParams).filter;
}

function row(field: string, operator: PlaygroundFilterRow["operator"], value: string) {
  return { field, operator, value };
}

describe("playground filters reach SQL as real comparisons", () => {
  it("builds an equality comparison for an `eq` row", () => {
    const filter = parsedFilter([row("status", "eq", "published")]);

    expect(filter).toEqual({ status: { $eq: "published" } });
    expect(buildSql(filter)).toEqual({
      sql: '"content_posts"."status" = ?',
      params: ["published"],
    });
  });

  it("builds a substring LIKE for a `contains` row (wildcards escaped)", () => {
    const filter = parsedFilter([row("title", "contains", "100% done")]);

    expect(filter).toEqual({ title: { $contains: "100% done" } });
    const built = buildSql(filter);
    expect(built.sql).toBe('lower("content_posts"."title") LIKE lower(?) ESCAPE ?');
    // `%` in the search term is data, not a wildcard.
    expect(built.params[0]).toBe("%100\\% done%");
  });

  it("builds a range comparison for a `gt` row", () => {
    const filter = parsedFilter([row("views", "gt", "10")]);

    expect(filter).toEqual({ views: { $gt: "10" } });
    expect(buildSql(filter)).toEqual({ sql: '"content_posts"."views" > ?', params: ["10"] });
  });

  it("builds an IN list for an `in` row", () => {
    const filter = parsedFilter([row("tags", "in", "news, docs")]);

    expect(filter).toEqual({ tags: { $in: ["news", "docs"] } });
    expect(buildSql(filter)).toEqual({
      sql: '"content_posts"."tags" in (?, ?)',
      params: ["news", "docs"],
    });
  });

  it("keeps two operators on one field (gt + lt) as one range", () => {
    const filter = parsedFilter([row("views", "gt", "10"), row("views", "lt", "1000")]);

    expect(filter).toEqual({ views: { $gt: "10", $lt: "1000" } });
    expect(buildSql(filter)).toEqual({
      sql: '("content_posts"."views" > ? and "content_posts"."views" < ?)',
      params: ["10", "1000"],
    });
  });

  it("keeps the bare `filter[field]=value` form as plain equality", () => {
    // Pinned by tests/integration/api/optimistic-lock.test.ts ("filter[title]=etag").
    const filter = parseCollectionQueryParams(
      new URL("http://localhost/api/collections/posts?filter[title]=etag").searchParams,
    ).filter;

    expect(filter).toEqual({ title: "etag" });
    expect(buildSql(filter)).toEqual({ sql: '"content_posts"."title" = ?', params: ["etag"] });
  });

  it("normalizes a hand-written JSON filter into the same shape", () => {
    const params = new URLSearchParams({ filter: JSON.stringify({ status: { eq: "published" } }) });

    expect(parseCollectionQueryParams(params).filter).toEqual({ status: { $eq: "published" } });
  });

  it("never binds an operator object as a value, for any operator the builder offers", () => {
    const operators: PlaygroundFilterRow["operator"][] = ["eq", "ne", "contains", "gt", "lt", "in"];

    for (const operator of operators) {
      const built = buildSql(parsedFilter([row("title", operator, "x")]));
      for (const param of built.params) {
        expect(
          typeof param === "object" && param !== null,
          `operator ${operator} bound ${JSON.stringify(param)} as a value (${built.sql})`,
        ).toBe(false);
      }
    }
  });
});

// ─── SDK side: what the adapter actually receives, and the 400 for the rest ────

class TestAdapter extends BaseAdapter {
  type = "sqlite" as never;
  constructor(public crud: ICrudAdapter) {
    super();
    this.connected = true;
  }
  async connect() {
    return { success: true, data: undefined };
  }
  async disconnect() {
    return { success: true, data: undefined };
  }
  get batch(): IBatchAdapter {
    return {} as IBatchAdapter;
  }
}

function crudWith(findMany: ReturnType<typeof vi.fn>): ICrudAdapter {
  return {
    findMany,
    findOne: vi.fn(async () => ({ success: true, data: null })),
    insert: vi.fn(async () => ({ success: true, data: {} })),
    update: vi.fn(async () => ({ success: true, data: {} })),
    delete: vi.fn(async () => ({ success: true, data: undefined })),
    count: vi.fn(async () => ({ success: true, data: 0 })),
  } as unknown as ICrudAdapter;
}

// `_hasActiveWidgets` short-circuits the schema-store widget warm-up in tests.
const postsSchema = {
  _id: "Posts",
  name: "Posts",
  fields: [
    { db_fieldName: "title", label: "Title", widget: { Name: "Input" } },
    { db_fieldName: "status", label: "Status", widget: { Name: "Input" } },
    { db_fieldName: "views", label: "Views", widget: { Name: "Number" } },
    { db_fieldName: "tags", label: "Tags", widget: { Name: "Input" } },
  ],
  _hasActiveWidgets: false,
} as unknown as Schema;

const user = { _id: "u1", role: "editor" };
const TENANT = "t1" as DatabaseId;

async function namespaceWith(findMany: ReturnType<typeof vi.fn>) {
  const ns = new CollectionsNamespace(new TestAdapter(crudWith(findMany)) as never);
  // Register under the same tenant the reads are scoped to — the schema cache key
  // includes the tenant id.
  await ns.registerSchema("Posts", postsSchema, TENANT);
  return ns;
}

/** Query object the namespace handed to the adapter for the LAST call. */
function adapterQuery(findMany: ReturnType<typeof vi.fn>): Record<string, unknown> {
  expect(findMany).toHaveBeenCalledTimes(1);
  return findMany.mock.calls[0][1] as Record<string, unknown>;
}

describe("playground filters as the adapter receives them", () => {
  it("passes `$`-operators through to the query, never a bare operator name", async () => {
    const findMany = vi.fn(async () => ({ success: true, data: [] }));
    const ns = await namespaceWith(findMany);

    await ns.find("Posts", {
      user,
      tenantId: TENANT,
      validateFilter: true,
      bypassCache: true,
      // `status` is reserved for the publication clamp, so the shape is asserted on
      // two ordinary fields instead.
      filter: parsedFilter([row("title", "eq", "etag"), row("views", "gt", "10")]),
    });

    const query = adapterQuery(findMany);
    expect(query.title).toEqual({ $eq: "etag" });
    expect(query.views).toEqual({ $gt: "10" });
  });

  it("keeps the bare equality form working end to end", async () => {
    const findMany = vi.fn(async () => ({ success: true, data: [] }));
    const ns = await namespaceWith(findMany);

    await ns.find("Posts", {
      user,
      tenantId: TENANT,
      validateFilter: true,
      bypassCache: true,
      filter: parseCollectionQueryParams(
        new URL("http://localhost/x?filter[title]=etag").searchParams,
      ).filter,
    });

    expect(adapterQuery(findMany).title).toBe("etag");
  });

  it("rejects an operator no engine implements with 400 FILTER_UNKNOWN_FIELD", async () => {
    const findMany = vi.fn(async () => ({ success: true, data: [] }));
    const ns = await namespaceWith(findMany);

    const filter = parseCollectionQueryParams(
      new URL("http://localhost/x?filter[views][between]=1,5").searchParams,
    ).filter;
    // The parser keeps the unknown operator verbatim instead of turning it into a
    // silent equality — the SDK is what rejects it.
    expect(filter).toEqual({ views: { between: "1,5" } });

    await expect(
      ns.find("Posts", {
        user,
        tenantId: TENANT,
        validateFilter: true,
        bypassCache: true,
        filter,
      }),
    ).rejects.toMatchObject({ status: 400, code: "FILTER_UNKNOWN_FIELD" });
    // Nothing reached the adapter: the failure is a 400, not a driver bind error.
    expect(findMany).not.toHaveBeenCalled();
  });

  it("still accepts an unknown *field* with the same 400 code", async () => {
    const findMany = vi.fn(async () => ({ success: true, data: [] }));
    const ns = await namespaceWith(findMany);

    await expect(
      ns.find("Posts", {
        user,
        tenantId: TENANT,
        validateFilter: true,
        bypassCache: true,
        filter: { definitelyMissing: "x" },
      }),
    ).rejects.toMatchObject({ status: 400, code: "FILTER_UNKNOWN_FIELD" });
  });
});
