/**
 * @file tests/unit/databases/sqlite-schema-bootstrap-exec.test.ts
 * @description Executes the full rendered SQLite system-schema bootstrap batch
 * against an in-memory database — the exact regression guard for the 2026-10-04
 * failure where the tenants `usage` expression default was rendered
 * unparenthesized (`DEFAULT json_object(...)`) and broke every fresh SQLite
 * boot with `near "(": syntax error`, caught only by the pre-push integration
 * gate (unit tests never execute the boot DDL).
 *
 * ### Features:
 * - single `db.exec(batch)` like the real bootstrap (multi-statement, triggers included)
 * - fails fast on any DDL syntax error in the rendered batch
 */

import { describe, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { renderSqliteBatch } from "@src/databases/core/system-schema-bootstrap";

describe("SQLite system-schema bootstrap DDL", () => {
  it("executes the rendered batch (single exec, like the real bootstrap)", () => {
    const db = new DatabaseSync(":memory:");
    const batch = renderSqliteBatch();
    try {
      db.exec(batch);
    } catch (err) {
      throw new Error(`Batch exec failed: ${(err as Error).message}`);
    }
    const tables = db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'")
      .get() as { n: number };
    expect(tables.n).toBeGreaterThan(10);
  });
});
