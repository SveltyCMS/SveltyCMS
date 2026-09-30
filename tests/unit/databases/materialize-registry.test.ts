/**
 * @file tests/unit/databases/materialize-registry.test.ts
 * @description Boot-path materialization: the Drizzle def must list numeric columns
 * even when getTable ran before createModel, which is the benchmark/production
 * schema sync (reconciliation skipped).
 *
 * Features:
 * - A cached blob-only table is dropped once the schema is registered
 * - A views patch is a column assignment, not a JSON `data` merge
 * - The slug spelling resolves the same columns
 * - A leftover PostgreSQL expression index is dropped
 */

import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { PostgreSQLAdapter } from "@src/databases/postgresql/postgres-adapter";
import { materializedColumnTypes } from "@src/databases/core/drizzle-sql-helpers";

const ARTICLES = {
  _id: "Articles",
  name: "Articles",
  slug: "articles",
  fields: [
    { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
    {
      db_fieldName: "views",
      label: "Views",
      widget: { Name: "Input" },
      type: "number",
      materialize: true,
    },
    { db_fieldName: "body", label: "Body", widget: { Name: "RichText" }, type: "string" },
  ],
};

describe("materialized column registry", () => {
  it("maps number fields to integer columns and leaves plain strings in the blob", () => {
    const columns = materializedColumnTypes(ARTICLES.fields);
    expect(columns.get("views")).toBe("integer");
    expect(columns.has("title")).toBe(false);
    expect(columns.has("body")).toBe(false);
  });

  it("rebuilds a stale table def so a views patch does not rewrite data", () => {
    const adapter = new PostgreSQLAdapter();
    const stale = adapter.getTable("Articles");
    expect(getTableColumns(stale).views).toBeUndefined();

    adapter.rememberMaterializedColumns(ARTICLES);

    const fresh = adapter.getTable("Articles");
    expect(fresh).not.toBe(stale);
    expect(getTableColumns(fresh).views).toBeDefined();
    expect(getTableColumns(adapter.getTable("articles")).views).toBeDefined();

    const patched = adapter.prepareValues(
      fresh,
      { views: 7 },
      "row-1",
      "2026-09-30T00:00:00.000Z",
      {
        isUpdate: true,
      },
    );
    expect(patched.views).toBe(7);
    expect(patched.data).toBeUndefined();
  });

  it("drops a leftover data expression index once the column is registered", async () => {
    const adapter = new PostgreSQLAdapter();
    const executed: string[] = [];
    (adapter as any).sql = {
      unsafe: async (sqlText: string) => {
        executed.push(sqlText);
        return [];
      },
    };

    adapter.rememberMaterializedColumns(ARTICLES);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(executed.some((sqlText) => sqlText.includes("collection_Articles_views_expr_idx"))).toBe(
      true,
    );
    expect(executed.some((sqlText) => sqlText.includes("title_expr_idx"))).toBe(false);
  });
});
