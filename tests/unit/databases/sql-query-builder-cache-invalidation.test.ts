/**
 * @file tests/unit/databases/sql-query-builder-cache-invalidation.test.ts
 * @description Regression coverage for the shared compiled-SQL cache invalidation.
 * A `SELECT *` plan is cached by a shape signature (predicate/order/projection),
 * not by the physical column list. When DDL adds a column, that key is unchanged,
 * so the stale plan omits the new column until the cache is cleared.
 *
 * Features:
 * - `clearCompiledSqlCache()` drops the module-level cache so the next compile
 *   reflects the freshly materialized column
 * - without clearing, a rebuilt table def with the same name still serves the
 *   stale cached plan (documents the exact bug the fix addresses)
 */

import { describe, expect, it, vi } from "vitest";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import {
  clearCompiledSqlCache,
  SqlQueryBuilder,
  SQLITE_DIALECT,
} from "@src/databases/core/sql-query-builder";

const PROBE = "cc_invalidation_probe";

function makeProbe(withExtraColumn: boolean) {
  const columns: Record<string, ReturnType<typeof text>> = {
    _id: text("_id").primaryKey(),
    status: text("status"),
    tenantId: text("tenantId"),
  };
  if (withExtraColumn) columns.extraCol = text("extraCol");
  return sqliteTable(PROBE, columns);
}

function compiledCore(table: ReturnType<typeof makeProbe>) {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const core = {
    db: { select: vi.fn() },
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
      return [];
    },
    noteListSort: vi.fn(),
  };
  return { core, calls };
}

describe("compiled SQL cache invalidation on DDL", () => {
  it("serves a stale SELECT * plan until clearCompiledSqlCache() is called", async () => {
    // First compile caches the 3-column shape for the probe table.
    const first = compiledCore(makeProbe(false));
    await new SqlQueryBuilder(first.core, PROBE, SQLITE_DIALECT).execute();
    expect(first.calls[0].sql).not.toContain("extraCol");

    // A rebuilt table def with the same name adds a column. The cache key is a
    // shape signature, so without clearing it still returns the stale 3-column SQL.
    const second = compiledCore(makeProbe(true));
    await new SqlQueryBuilder(second.core, PROBE, SQLITE_DIALECT).execute();
    expect(second.calls[0].sql).not.toContain("extraCol");

    // DDL invalidates the cache; the next compile sees the new physical column.
    clearCompiledSqlCache();
    const third = compiledCore(makeProbe(true));
    await new SqlQueryBuilder(third.core, PROBE, SQLITE_DIALECT).execute();
    expect(third.calls[0].sql).toContain("extraCol");
  });
});
