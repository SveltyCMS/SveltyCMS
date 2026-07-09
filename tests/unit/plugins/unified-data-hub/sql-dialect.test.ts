/**
 * @file tests/unit/plugins/unified-data-hub/sql-dialect.test.ts
 * @description SQL dialect builder tests for federation connectors.
 */

import { describe, expect, it } from "vitest";
import { FederationError } from "@plugins/unified-data-hub/types";
import {
  assertIdentifier,
  buildDeleteQuery,
  buildInsertQuery,
  buildSelectQuery,
  buildUpdateQuery,
} from "@plugins/unified-data-hub/server/sql-dialect";

describe("sql dialect", () => {
  it("rejects invalid identifiers", () => {
    expect(() => assertIdentifier("bad-name", "field")).toThrow(FederationError);
  });

  it("builds postgres select with positional placeholders", () => {
    const { query, values } = buildSelectQuery("postgres", "public", "articles", {
      filter: { status: "published" },
      sort: { field: "id", direction: "asc" },
      limit: 10,
      offset: 0,
    });
    expect(query).toContain('"public"."articles"');
    expect(query).toContain("$1");
    expect(values).toEqual(["published", 10, 0]);
  });

  it("builds mariadb select with question mark placeholders", () => {
    const { query, values } = buildSelectQuery("mariadb", "app", "articles", {
      filter: { id: 1 },
      limit: 5,
      offset: 10,
    });
    expect(query).toContain("`app`.`articles`");
    expect(query).toContain("?");
    expect(values).toEqual([1, 5, 10]);
  });

  it("builds insert/update/delete for sqlite", () => {
    const insert = buildInsertQuery("sqlite", undefined, "posts", ["title"], ["Hello"]);
    expect(insert.query).toBe('INSERT INTO "posts" ("title") VALUES (?)');

    const update = buildUpdateQuery("sqlite", undefined, "posts", "id", 7, ["title"], ["Updated"]);
    expect(update.query).toContain('UPDATE "posts" SET "title" = ? WHERE "id" = ?');
    expect(update.values).toEqual(["Updated", 7]);

    const del = buildDeleteQuery("sqlite", undefined, "posts", "id", 7);
    expect(del.query).toBe('DELETE FROM "posts" WHERE "id" = ?');
  });
});
