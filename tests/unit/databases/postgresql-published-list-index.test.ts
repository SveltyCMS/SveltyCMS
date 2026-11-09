/**
 * @file tests/unit/databases/postgresql-published-list-index.test.ts
 * @description DDL contract for the lazy publication-clamped PostgreSQL list index.
 *
 * The wire list filters `status IN ('publish','published')`; the index predicate
 * must carry that exact clamp (and `isDeleted = false` when the table has it) or
 * PostgreSQL will not match the partial index at planning time. A tenant
 * equality moves `tenantId` to the leading column; without one the index must
 * not lead with it (the compiled query has no tenant predicate).
 */

import { describe, it, expect } from "vitest";
import { buildPublishedListIndexDdl } from "@src/databases/postgresql/postgres-utils";

describe("buildPublishedListIndexDdl", () => {
  it("builds the no-tenant partial index with the deleted-row predicate", () => {
    const { indexName, safeTable, ddl } = buildPublishedListIndexDdl({
      tableName: "collection_articles",
      column: "views",
      direction: "desc",
      withTenant: false,
      hasDeleted: true,
    });

    expect(indexName).toBe("collection_articles_views_o_pub_list_id");
    expect(safeTable).toBe("collection_articles");
    expect(ddl).toBe(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "collection_articles_views_o_pub_list_id" ON "collection_articles" ("views" DESC, "_id" DESC) WHERE "status" IN (\'publish\', \'published\') AND "isDeleted" = false',
    );
  });

  it("leads with tenantId and omits the deleted predicate when the table has no isDeleted", () => {
    const { indexName, ddl } = buildPublishedListIndexDdl({
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

  it("rejects identifiers that are not plain SQL names", () => {
    expect(() =>
      buildPublishedListIndexDdl({
        tableName: "collection_articles; DROP TABLE users",
        column: "views",
        direction: "desc",
        withTenant: false,
        hasDeleted: true,
      }),
    ).toThrow();
    expect(() =>
      buildPublishedListIndexDdl({
        tableName: "collection_articles",
        column: 'views" --',
        direction: "desc",
        withTenant: false,
        hasDeleted: true,
      }),
    ).toThrow();
  });

  it("keeps the generated index name within PostgreSQL's 63-byte limit", () => {
    const { indexName } = buildPublishedListIndexDdl({
      tableName: `collection_${"a".repeat(40)}`,
      column: "views_that_are_counted_in_a_long_name".slice(0, 40),
      direction: "desc",
      withTenant: true,
      hasDeleted: true,
    });
    expect(indexName.length).toBeLessThanOrEqual(63);
  });
});
