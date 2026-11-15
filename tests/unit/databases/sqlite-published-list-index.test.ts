/**
 * @file tests/unit/databases/sqlite-published-list-index.test.ts
 * @description DDL contract for the lazy publication-clamped SQLite list index.
 *
 * The SQLite wire list filters `status IN ('publish','published')` and
 * `"isDeleted" = 0` when `isDeleted` is present; the partial index predicate
 * must match exact SQLite boolean integer encoding (`= 0`) so SQLite's query
 * planner uses the partial index.
 */

import { describe, it, expect } from "vitest";
import { buildSqlitePublishedListIndexDdl } from "@src/databases/sqlite/adapter-core";

describe("buildSqlitePublishedListIndexDdl", () => {
  it("builds the no-tenant partial index with SQLite integer deleted-row predicate", () => {
    const { indexName, safeTable, ddl } = buildSqlitePublishedListIndexDdl({
      tableName: "collection_articles",
      column: "views",
      direction: "desc",
      withTenant: false,
      hasDeleted: true,
    });

    expect(indexName).toBe("collection_articles_views_o_pub_list_id");
    expect(safeTable).toBe("collection_articles");
    expect(ddl).toBe(
      'CREATE INDEX IF NOT EXISTS "collection_articles_views_o_pub_list_id" ON "collection_articles" ("views" DESC, "_id" DESC) WHERE "status" IN (\'publish\', \'published\') AND "isDeleted" = 0',
    );
  });

  it("leads with tenantId and omits isDeleted when absent", () => {
    const { indexName, ddl } = buildSqlitePublishedListIndexDdl({
      tableName: "collection_articles",
      column: "views",
      direction: "asc",
      withTenant: true,
      hasDeleted: false,
    });

    expect(indexName).toBe("collection_articles_views_t_pub_list_id");
    expect(ddl).toContain('("tenantId", "views" ASC, "_id" ASC)');
    expect(ddl).not.toContain('"isDeleted"');
    expect(ddl.endsWith(`WHERE "status" IN ('publish', 'published')`)).toBe(true);
  });

  it("rejects non-identifier SQL names", () => {
    expect(() =>
      buildSqlitePublishedListIndexDdl({
        tableName: "collection_articles; DROP TABLE users",
        column: "views",
        direction: "desc",
        withTenant: false,
        hasDeleted: true,
      }),
    ).toThrow();
    expect(() =>
      buildSqlitePublishedListIndexDdl({
        tableName: "collection_articles",
        column: 'views" --',
        direction: "desc",
        withTenant: false,
        hasDeleted: true,
      }),
    ).toThrow();
  });

  it("keeps the generated index name within the SQL identifier bound", () => {
    const { indexName } = buildSqlitePublishedListIndexDdl({
      tableName: `collection_${"a".repeat(45)}`,
      column: "views_that_are_counted_in_a_long_name",
      direction: "desc",
      withTenant: true,
      hasDeleted: true,
    });
    expect(indexName.length).toBeLessThanOrEqual(63);
  });
});
