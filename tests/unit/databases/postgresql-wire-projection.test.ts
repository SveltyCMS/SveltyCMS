/**
 * @file tests/unit/databases/postgresql-wire-projection.test.ts
 * @description Direct-to-wire projection of JSON sub-fields for PostgreSQL.
 *
 * A projected list field with no materialized column is declined by default
 * (SQLite/MariaDB parity); PostgreSQL opts in and serves it as a type-preserving
 * `data->'key'` jsonb projection instead of falling back to V8 row hydration.
 * Dotted/nested field names keep declining, mirroring `onDynamicSort`.
 */

import { describe, expect, it } from "vitest";
import { validateWireListInput, type WireColumnLookup } from "@src/databases/core/sql-wire-stream";
import {
  buildProjectedListDoc,
  PostgresWireStreamEngine,
} from "@src/databases/postgresql/postgresql-wire-stream";

describe("PostgreSQL data-only list projection", () => {
  // `title` is not a physical column here — it lives only in the `data` blob.
  const executor: WireColumnLookup = {
    getColumn: (_table, name) => (new Set(["_id", "data", "slug", "status"]).has(name) ? {} : null),
  };

  it("accepts a data-only field when jsonb projection is allowed", () => {
    const res = validateWireListInput(executor, {}, { fields: ["title", "slug"] }, '"', true);

    expect(res).not.toBeNull();
    expect(res?.isProjected).toBe(true);
    expect(res?.projectedFields).toEqual([
      { name: "_id", kind: "column" },
      { name: "title", kind: "data" },
      { name: "slug", kind: "column" },
    ]);
    // Physical-column list stays clean for the legacy consumers.
    expect(res?.dedupedProjectedCols).toEqual(["_id", "slug"]);
  });

  it("declines a data-only field without the jsonb-projection opt-in (SQLite/MariaDB parity)", () => {
    expect(validateWireListInput(executor, {}, { fields: ["title"] }, '"')).toBeNull();
  });

  it("declines dotted/nested field names even with the opt-in", () => {
    expect(validateWireListInput(executor, {}, { fields: ["meta.title"] }, '"', true)).toBeNull();
    expect(validateWireListInput(executor, {}, { fields: ["a.b.c"] }, '"', true)).toBeNull();
  });

  it("declines when the data column is absent", () => {
    const noData: WireColumnLookup = {
      getColumn: (_table, name) => (new Set(["_id", "slug", "status"]).has(name) ? {} : null),
    };
    expect(validateWireListInput(noData, {}, { fields: ["title"] }, '"', true)).toBeNull();
  });

  it("builds a projected document that carries the data-only field in the body", () => {
    const doc = buildProjectedListDoc([
      { name: "_id", kind: "column" },
      { name: "title", kind: "data" },
      { name: "slug", kind: "column" },
    ]);

    expect(doc).toBe(`jsonb_build_object('_id', "_id", 'title', "data"->'title', 'slug', "slug")`);
    // The field key is present and extracted type-preservingly as jsonb.
    expect(doc).toContain(`'title', "data"->'title'`);
    expect(doc).not.toContain(`"title"`);
  });

  it("defers doc materialization outside the LIMIT subquery in findListWireStream", async () => {
    const COLUMNS = Symbol.for("drizzle:Columns");
    const table = {
      [COLUMNS]: {
        _id: { name: "_id" },
        data: { name: "data" },
        slug: { name: "slug" },
        status: { name: "status" },
        tenantId: { name: "tenantId" },
        updatedAt: { name: "updatedAt" },
        isDeleted: { name: "isDeleted" },
      },
    };
    const statements: string[] = [];
    const wireExec = {
      getColumn: (target: Record<symbol, Record<string, unknown>>, name: string) =>
        target[COLUMNS]?.[name],
      sql: null,
    };
    const rawExec = {
      unsafe: async (sqlText: string) => {
        statements.push(sqlText);
        return [{ wire_body: "[]", max_updated_at: "0" }];
      },
    };

    const engine = new PostgresWireStreamEngine();
    await engine.findListWireStream(wireExec as never, rawExec, table, "collection_wire_proj", {
      fields: ["slug"],
      limit: 50,
    });
    const projectedSql = statements[0]!;
    const projMatch = projectedSql.match(/FROM \((SELECT [\s\S]*?) FROM "collection_wire_proj"/);
    expect(projMatch?.[1]).toBeDefined();
    expect(projMatch![1]).not.toContain("jsonb_build_object");
    expect(projMatch![1]).not.toContain('"data"');
    expect(projMatch![1]).toContain('"_id"');
    expect(projMatch![1]).toContain('"slug"');
    expect(projMatch![1]).toContain('"updatedAt"');

    await engine.findListWireStream(wireExec as never, rawExec, table, "collection_wire_proj", {
      limit: 100,
    });
    const fullSql = statements[1]!;
    const fullMatch = fullSql.match(/FROM \((SELECT [\s\S]*?) FROM "collection_wire_proj"/);
    expect(fullMatch?.[1]).toBeDefined();
    expect(fullMatch![1]).not.toContain("jsonb_build_object");
    expect(fullMatch![1]).not.toContain('"data" ||');
    expect(fullSql).toContain("jsonb_agg(");
  });
});
