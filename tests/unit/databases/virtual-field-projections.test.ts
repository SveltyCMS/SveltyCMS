/**
 * @file tests/unit/databases/virtual-field-projections.test.ts
 * @description Regression guard: a `fields` projection may only drop the JSON `data`
 * blob when every requested field is a physical column.
 *
 * Features:
 * - pins that a blob-stored field keeps the `data` column in the SELECT, so values
 *   come back with their JSON types (numbers, booleans, arrays, nested objects)
 * - records why: synthesizing `data->>'f'` (PostgreSQL) / `JSON_UNQUOTE(JSON_EXTRACT())`
 *   (MariaDB) returns TEXT, so `views: 7` became `"7"` and arrays became JSON strings
 *   (reverted 2026-10-05)
 * - pins that a physical-only projection still skips the blob (the safe fast path)
 */

import { describe, expect, it } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { SqlAdapterCore } from "@src/databases/core/sql-adapter-core";
import type { DatabaseResult, DatabaseTransaction } from "@src/databases/db-interface";

const probeTable = sqliteTable("projection_probe", {
  _id: text("_id").primaryKey(),
  tenantId: text("tenantId"),
  status: text("status"),
  data: text("data"),
});

class ProjectionProbe extends SqlAdapterCore {
  type = "test";
  readonly schema = {};
  db = {};
  raw = { execute: async () => [], client: null };
  async transaction<T>(
    fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>,
  ): Promise<DatabaseResult<T>> {
    return fn({} as never);
  }
  getTable(): unknown {
    return probeTable;
  }
  getJsonField(_field: string): SQL {
    return sql`1`;
  }
  createDynamicTableDefinition(_name: string): unknown {
    return probeTable;
  }
  protected isMissingTableError(): boolean {
    return false;
  }
  excludes(fields?: string[]): boolean {
    return this.shouldExcludeData(probeTable, fields ? { fields } : {});
  }
}

describe("fields projection keeps JSON types", () => {
  const probe = new ProjectionProbe();

  it("keeps the blob when any requested field lives in it", () => {
    expect(probe.excludes(["title"])).toBe(false);
    expect(probe.excludes(["_id", "views", "tags"])).toBe(false);
    expect(probe.excludes(["status", "meta.author"])).toBe(false);
  });

  it("selects the data column for a blob-field projection", () => {
    const selection = probe.getProjectedSelection(probeTable, { fields: ["title", "views"] });
    expect(selection.data).toBeDefined();
    // No synthesized text-extraction alias may stand in for the typed blob value.
    expect(selection.title).toBeUndefined();
    expect(selection.views).toBeUndefined();
  });

  it("skips the blob only for physical-only projections", () => {
    expect(probe.excludes(["_id", "status"])).toBe(true);
    const selection = probe.getProjectedSelection(probeTable, { fields: ["status"] });
    expect(selection.data).toBeUndefined();
    expect(selection.status).toBeDefined();
  });

  it("never excludes when no projection or `data` is requested", () => {
    expect(probe.excludes()).toBe(false);
    expect(probe.excludes(["data"])).toBe(false);
  });
});
