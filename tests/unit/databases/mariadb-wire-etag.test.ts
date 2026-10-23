/**
 * @file tests/unit/databases/mariadb-wire-etag.test.ts
 * @description MariaDB point-read ETag contract for optimistic locking.
 *
 * The point wire stream is the hot read lane that answers `GET …/<id>`, and its
 * ETag is what an HTTP client echoes back in `If-Match`. It must therefore be
 * the *same token* the write path compares against, independent of the host
 * timezone, the connection's DATETIME parsing, or the session `time_zone`.
 *
 * Regression pinned here: selecting the bare `updatedAt` column let mysql2 build
 * a JS `Date` in the process timezone, so `If-Match` could carry an ETag one
 * offset away from the stored row version and a PATCH on an unchanged row
 * answered `409 VERSION_CONFLICT` (observed in the CI MariaDB matrix).
 *
 * @see src/databases/mariadb/mariadb-wire-stream.ts
 * @see src/utils/optimistic-lock.ts
 */

import { describe, expect, it } from "vitest";
import { MariadbWireStreamEngine } from "@src/databases/mariadb/mariadb-wire-stream";
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

/** Fake executor that records the compiled SQL and answers with one row. */
function executorFor(row: Record<string, unknown>) {
  const statements: string[] = [];
  return {
    statements,
    executor: {
      getColumn: (target: Record<symbol, Record<string, unknown>>, name: string) =>
        target[COLUMNS]?.[name],
      getRawExec: () => async (sqlText: string) => {
        statements.push(sqlText);
        return [row];
      },
    },
  };
}

describe("MariaDB point wire ETag", () => {
  const table = tableWith([
    "_id",
    "tenantId",
    "status",
    "isDeleted",
    "createdAt",
    "updatedAt",
    "data",
  ]);

  it("renders the version inside SQL instead of handing the raw column to the driver", async () => {
    const { statements, executor } = executorFor({
      wire_body: '{"success":true,"data":{"_id":"doc-1"}}',
      updated_at: ISO,
    });

    const result = await new MariadbWireStreamEngine().findPointWireStream(
      executor as never,
      table,
      "collection_wire_etag",
      "doc-1" as DatabaseId,
      {},
    );

    expect(result.kind).toBe("found");
    const [sqlText] = statements;
    expect(sqlText).toBeDefined();
    // Canonical, zone-free rendering of the stored UTC wall clock.
    expect(sqlText).toContain("DATE_FORMAT(`updatedAt`, '%Y-%m-%dT%H:%i:%s.')");
    expect(sqlText).toContain("MICROSECOND(`updatedAt`)");
    // The bare column is the regression: it let the driver choose the timezone.
    expect(sqlText).not.toMatch(/,\s*`updatedAt`\s+AS\s+updated_at/i);
  });

  it("emits an ETag that matches the row version the write path compares", async () => {
    const { executor } = executorFor({
      wire_body: '{"success":true,"data":{}}',
      updated_at: ISO,
    });

    const result = await new MariadbWireStreamEngine().findPointWireStream(
      executor as never,
      table,
      "collection_wire_etag",
      "doc-1" as DatabaseId,
      {},
    );

    expect(result.kind).toBe("found");
    if (result.kind !== "found") return;
    expect(result.etag).toBe(`"doc-1-${ISO}"`);
    // Drizzle returns a Date, raw SQL returns the ISO string — both must match.
    expect(matchesVersion(new Date(ISO), result.etag)).toBe(true);
    expect(matchesVersion(ISO, result.etag)).toBe(true);
    // And the SQL rendering is idempotent through the normalizer.
    expect(versionTokenString(ISO)).toBe(ISO);
  });

  it("reports a missing row without inventing a version", async () => {
    const emptyExecutor = {
      getColumn: (target: Record<symbol, Record<string, unknown>>, name: string) =>
        target[COLUMNS]?.[name],
      getRawExec: () => async () => [],
    };

    const result = await new MariadbWireStreamEngine().findPointWireStream(
      emptyExecutor as never,
      table,
      "collection_wire_etag",
      "absent" as DatabaseId,
      {},
    );

    expect(result).toEqual({ kind: "missing" });
  });
});
