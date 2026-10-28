/**
 * @file tests/unit/databases/postgresql-wire-etag.test.ts
 * @description PostgreSQL point-read ETag contract for optimistic locking.
 *
 * Features:
 * - Direct-to-Wire SQL query generation verification for PostgreSQL.
 * - Asserts `to_char("updatedAt", ...)` produces formatted ISO text directly in SQL.
 * - Prevents `postgres.js` Date object hydration and timezone drift.
 */

import { describe, expect, it } from "vitest";
import { PostgresWireStreamEngine } from "@src/databases/postgresql/postgresql-wire-stream";
import type { DatabaseId } from "@src/databases/db-interface";
import { matchesVersion, versionTokenString } from "@utils/optimistic-lock";

/** Drizzle keys table columns under this global symbol. */
const COLUMNS = Symbol.for("drizzle:Columns");

const ISO = "2026-10-21T15:04:05.123Z";

function tableWith(columnNames: string[]): Record<symbol, Record<string, unknown>> {
  const columns: Record<string, unknown> = {};
  for (const name of columnNames) columns[name] = { name };
  return { [COLUMNS]: columns };
}

/** Fake executor and exec that records the compiled SQL and answers with one row. */
function executorFor(row: Record<string, unknown>) {
  const statements: string[] = [];
  return {
    statements,
    executor: {
      getColumn: (target: Record<symbol, Record<string, unknown>>, name: string) =>
        target[COLUMNS]?.[name],
      sql: null,
    },
    exec: {
      unsafe: async (sqlText: string) => {
        statements.push(sqlText);
        return [row];
      },
    },
  };
}

describe("PostgreSQL point wire ETag", () => {
  const table = tableWith([
    "_id",
    "tenantId",
    "status",
    "isDeleted",
    "createdAt",
    "updatedAt",
    "data",
  ]);

  it("selects raw updatedAt column to avoid SQL to_char compute overhead", async () => {
    const { statements, executor, exec } = executorFor({
      doc_text: '{"_id":"doc-1"}',
      updated_at: ISO,
    });

    const result = await new PostgresWireStreamEngine().findPointWireStream(
      executor as never,
      exec as never,
      table,
      "collection_wire_etag",
      "doc-1" as DatabaseId,
      {},
    );

    expect(result.kind).toBe("found");
    const [sqlText] = statements;
    expect(sqlText).toBeDefined();
    expect(sqlText).toContain('"updatedAt" AS updated_at');
    expect(sqlText).not.toContain("to_char");
  });

  it("emits an ETag that matches the row version the write path compares", async () => {
    const { executor, exec } = executorFor({
      doc_text: "{}",
      updated_at: ISO,
    });

    const result = await new PostgresWireStreamEngine().findPointWireStream(
      executor as never,
      exec as never,
      table,
      "collection_wire_etag",
      "doc-1" as DatabaseId,
      {},
    );

    expect(result.kind).toBe("found");
    if (result.kind !== "found") return;
    expect(result.etag).toBe(`"doc-1-${ISO}"`);
    expect(matchesVersion(new Date(ISO), result.etag)).toBe(true);
    expect(matchesVersion(ISO, result.etag)).toBe(true);
    expect(versionTokenString(ISO)).toBe(ISO);

    // Also assert when postgres driver returns a Date object directly
    const dateObj = new Date(ISO);
    const dateResult = await new PostgresWireStreamEngine().findPointWireStream(
      executor as never,
      { unsafe: async () => [{ doc_text: "{}", updated_at: dateObj }] } as never,
      table,
      "collection_wire_etag",
      "doc-1" as DatabaseId,
      {},
    );
    expect(dateResult.kind).toBe("found");
    if (dateResult.kind !== "found") return;
    expect(dateResult.etag).toBe(`"doc-1-${ISO}"`);
    expect(matchesVersion(dateObj, dateResult.etag)).toBe(true);
  });

  it("reports a missing row without inventing a version", async () => {
    const emptyExecutor = {
      getColumn: (target: Record<symbol, Record<string, unknown>>, name: string) =>
        target[COLUMNS]?.[name],
      sql: null,
    };
    const emptyExec = {
      unsafe: async () => [],
    };

    const result = await new PostgresWireStreamEngine().findPointWireStream(
      emptyExecutor as never,
      emptyExec as never,
      table,
      "collection_wire_etag",
      "absent" as DatabaseId,
      {},
    );

    expect(result).toEqual({ kind: "missing" });
  });
});
