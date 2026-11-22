/**
 * @file tests/unit/databases/case-insensitive-index.test.ts
 * @description
 * Policy guard for the indexes backing `$ieq` / `$nieq` / `$contains`.
 *
 * The predicate is engine-specific (see `caseInsensitiveComparison`):
 * SQLite compiles `$ieq`/`$nieq` to `col = ? COLLATE NOCASE`, PostgreSQL keeps
 * `lower(col) = lower(?)` (locale-aware `lower()` is the only provable form
 * there) and compiles `$contains` to `ILIKE`. Each predicate therefore needs its
 * own tree:
 *
 * - SQLite: `CREATE INDEX … ("col" COLLATE NOCASE)`.
 * - PostgreSQL: `CREATE INDEX … (lower("col"))` plus a `pg_trgm` GIN tree for
 *   `ILIKE '%term%'` (`pg_trgm` is created by the system schema bootstrap).
 * - MariaDB: no functional indexes and no trigram opclass — the plain
 *   comparison under the column's CI collation uses the existing btree.
 *
 * Both index families are opt-in: enough extra indexes cost ~11–17 % on a
 * 2 000-row UPDATE (see `earnsCompositeIndex`), so only `indexed: true`
 * TEXT/VARCHAR columns earn one.
 *
 * ### Features:
 * - selection: indexed text accepted; unindexed, numeric, boolean, temporal,
 *   group and encrypted fields rejected
 * - selection: `db_fieldName` preferred, `label` fallback, reserved names skipped
 * - DDL: SQLite `COLLATE NOCASE`, PostgreSQL `lower("col")` `CONCURRENTLY`
 * - DDL: PostgreSQL `pg_trgm` GIN tree for `ILIKE`
 * - DDL: quoting, custom (truncated) index names
 * - provenance: trigram trees classify as `gin` (never prunable)
 * - DDL: unsafe identifiers rejected before interpolation
 */

import { describe, expect, it } from "vitest";

import {
  buildCaseInsensitiveIndexColumns,
  buildCaseInsensitiveIndexDdl,
  buildTrigramIndexDdl,
} from "@src/databases/core/drizzle-sql-helpers";
import { classifyProvenance } from "@src/databases/postgresql/index-usage";
import { pgSafeIndexName } from "@src/databases/postgresql/postgres-utils";

describe("buildCaseInsensitiveIndexColumns", () => {
  it("selects indexed text fields", () => {
    const cols = buildCaseInsensitiveIndexColumns([
      { type: "string", db_fieldName: "title", indexed: true },
      { type: "string", db_fieldName: "sku", unique: true },
    ]);

    expect([...cols]).toEqual(["title"]);
  });

  it("ignores indexed numbers and booleans", () => {
    const cols = buildCaseInsensitiveIndexColumns([
      { type: "number", db_fieldName: "count", indexed: true },
      { type: "integer", db_fieldName: "views", indexed: true },
      { type: "boolean", db_fieldName: "featured", indexed: true },
    ]);

    expect(cols.size).toBe(0);
  });

  it("ignores text without the explicit indexed opt-in", () => {
    const cols = buildCaseInsensitiveIndexColumns([
      { type: "string", db_fieldName: "title" },
      { type: "string", db_fieldName: "sku", unique: true },
      { type: "string", db_fieldName: "note", materialize: true },
    ]);

    expect(cols.size).toBe(0);
  });

  it("ignores non-materializable text aliases", () => {
    const cols = buildCaseInsensitiveIndexColumns([
      { type: "text", db_fieldName: "body", indexed: true },
      { type: "textarea", db_fieldName: "notes", indexed: true },
      { type: "richtext", db_fieldName: "content", indexed: true },
      { type: "slug", db_fieldName: "path", indexed: true },
      { type: "email", db_fieldName: "contact", indexed: true },
      { type: "url", db_fieldName: "link", indexed: true },
    ]);

    expect(cols.size).toBe(0);
  });

  it("ignores temporal widgets even when they carry a string type", () => {
    const cols = buildCaseInsensitiveIndexColumns([
      { type: "string", db_fieldName: "publishedOn", indexed: true, widget: { Name: "DateTime" } },
      { type: "string", db_fieldName: "birthday", indexed: true, widget: { Name: "Date" } },
      { type: "date", db_fieldName: "scheduledFor", indexed: true },
    ]);

    expect(cols.size).toBe(0);
  });

  it("ignores nested and non-scalar widgets", () => {
    const cols = buildCaseInsensitiveIndexColumns([
      { type: "string", db_fieldName: "meta", indexed: true, widget: { Name: "Group" } },
      { type: "string", db_fieldName: "rows", indexed: true, widget: { Name: "Repeater" } },
      { type: "string", db_fieldName: "tags", indexed: true, widget: { Name: "Tags" } },
    ]);

    expect(cols.size).toBe(0);
  });

  it("ignores encrypted fields", () => {
    const cols = buildCaseInsensitiveIndexColumns([
      { type: "string", db_fieldName: "secret", indexed: true, encrypt: true },
    ]);

    expect(cols.size).toBe(0);
  });

  it("falls back to the label and skips reserved column names", () => {
    const cols = buildCaseInsensitiveIndexColumns([
      { type: "string", label: "publishDate", indexed: true },
      { type: "string", db_fieldName: "slug", indexed: true },
    ]);

    expect([...cols]).toEqual(["publishDate"]);
  });

  it("tolerates a non-array fields value", () => {
    expect(buildCaseInsensitiveIndexColumns(undefined).size).toBe(0);
    expect(buildCaseInsensitiveIndexColumns({}).size).toBe(0);
  });
});

describe("buildCaseInsensitiveIndexDdl", () => {
  it("builds the SQLite NOCASE index that serves `col = ? COLLATE NOCASE`", () => {
    expect(
      buildCaseInsensitiveIndexDdl({
        dialect: "sqlite",
        tableName: "collection_posts",
        columnName: "title",
      }),
    ).toBe(
      'CREATE INDEX IF NOT EXISTS "collection_posts_title_nocase" ON "collection_posts" ("title" COLLATE NOCASE)',
    );
  });

  it("builds the PostgreSQL expression index concurrently", () => {
    expect(
      buildCaseInsensitiveIndexDdl({
        dialect: "postgresql",
        tableName: "collection_posts",
        columnName: "title",
        indexName: "collection_posts_title_lower",
      }),
    ).toBe(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "collection_posts_title_lower" ON "collection_posts" (lower("title"))',
    );
  });

  it("keeps the PostgreSQL index name inside NAMEDATALEN", () => {
    const tableName = "collection_plugin_redirectmanager_404_logs";
    const indexName = pgSafeIndexName(`${tableName}_source_lower`);

    expect(indexName.length).toBeLessThanOrEqual(63);
    expect(
      buildCaseInsensitiveIndexDdl({
        dialect: "postgresql",
        tableName,
        columnName: "source",
        indexName,
      }),
    ).toContain(`"${indexName}"`);
  });

  it("rejects unsafe identifiers before interpolation", () => {
    expect(() =>
      buildCaseInsensitiveIndexDdl({
        dialect: "sqlite",
        tableName: 'collection_posts"; DROP TABLE x; --',
        columnName: "title",
      }),
    ).toThrow(/Invalid SQL identifier for table/);

    expect(() =>
      buildCaseInsensitiveIndexDdl({
        dialect: "postgresql",
        tableName: "collection_posts",
        columnName: 'title") ; DROP TABLE x; --',
        indexName: "collection_posts_title_lower",
      }),
    ).toThrow(/Invalid SQL identifier for column/);

    expect(() =>
      buildCaseInsensitiveIndexDdl({
        dialect: "sqlite",
        tableName: "collection_posts",
        columnName: "title",
        indexName: "bad index name",
      }),
    ).toThrow(/Invalid SQL identifier for index/);
  });
});

describe("buildTrigramIndexDdl", () => {
  it("builds the pg_trgm GIN index that serves ILIKE '%term%'", () => {
    expect(buildTrigramIndexDdl({ tableName: "collection_posts", columnName: "title" })).toBe(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "collection_posts_title_trgm" ON "collection_posts" USING gin ("title" gin_trgm_ops)',
    );
  });

  it("honors a pgSafeIndexName-truncated name", () => {
    const tableName = "collection_plugin_redirectmanager_404_logs";
    const indexName = pgSafeIndexName(`${tableName}_source_trgm`);

    expect(indexName.length).toBeLessThanOrEqual(63);
    expect(buildTrigramIndexDdl({ tableName, columnName: "source", indexName })).toContain(
      `"${indexName}"`,
    );
  });

  it("rejects unsafe identifiers before interpolation", () => {
    expect(() =>
      buildTrigramIndexDdl({ tableName: "collection_posts", columnName: 'title") ; --' }),
    ).toThrow(/Invalid SQL identifier for column/);
    expect(() =>
      buildTrigramIndexDdl({
        tableName: "collection_posts",
        columnName: "title",
        indexName: "bad index name",
      }),
    ).toThrow(/Invalid SQL identifier for index/);
  });

  it("classifies the trigram tree as gin so the pruner never drops it", () => {
    expect(classifyProvenance("collection_posts_title_trgm", "collection_posts")).toBe("gin");
  });
});
