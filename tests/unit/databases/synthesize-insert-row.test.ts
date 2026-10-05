/**
 * @file tests/unit/databases/synthesize-insert-row.test.ts
 * @description Sparse insert synthesis: listed columns + defaults, no NULL placeholders.
 *
 * ### Features:
 * - literal defaults applied client-side
 * - unused nullable columns omitted (DB DEFAULT applies)
 * - createdAt/updatedAt stamped when missing
 */

import { describe, expect, it } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import { SqlAdapterCore } from "@src/databases/core/sql-adapter-core";
import type { DatabaseResult } from "@src/databases/db-interface";

class SynthProbe extends SqlAdapterCore {
  type = "test";
  readonly schema = {};
  db = {};
  raw = { execute: async () => [], client: null };
  async transaction<T>(
    fn: (
      transaction: import("@src/databases/db-interface").DatabaseTransaction,
    ) => Promise<DatabaseResult<T>>,
  ): Promise<DatabaseResult<T>> {
    return fn({} as never);
  }
  getTable(): unknown {
    return {};
  }
  getJsonField(_field: string): SQL {
    return sql`1`;
  }
  createDynamicTableDefinition(_name: string): unknown {
    return {};
  }
  protected isMissingTableError(): boolean {
    return false;
  }

  synth(
    values: Record<string, unknown>,
    cols: Record<string, { default?: unknown; defaultFn?: () => unknown }>,
    opts?: { intBooleans?: boolean },
  ): Record<string, unknown> {
    const table = {};
    this._tableColumnsCache.set(table, cols as never);
    return this.synthesizeInsertRow(table, values, opts);
  }
}

describe("synthesizeInsertRow sparse", () => {
  const probe = new SynthProbe();

  it("keeps provided values and applies literal defaults", () => {
    const row = probe.synth(
      { _id: "abc", title: "Hello" },
      {
        _id: {},
        title: {},
        status: { default: "draft" },
        isDeleted: { default: false },
        createdAt: {},
        updatedAt: {},
        optionalNote: {},
      },
    );
    expect(row._id).toBe("abc");
    expect(row.title).toBe("Hello");
    expect(row.status).toBe("draft");
    expect(row.isDeleted).toBe(false);
    expect(row.createdAt).toBeDefined();
    expect(row.updatedAt).toBeDefined();
    expect(Object.hasOwn(row, "optionalNote")).toBe(false);
  });

  it("does not bind explicit null for unused nullable columns", () => {
    const row = probe.synth({ _id: "x" }, { _id: {}, ghost: {}, other: {} });
    expect(row).toEqual({ _id: "x" });
    expect(row.ghost).toBeUndefined();
    expect(row.other).toBeUndefined();
  });

  it("coerces boolean defaults to 0/1 for MariaDB intBooleans", () => {
    const row = probe.synth(
      { _id: "x" },
      { _id: {}, isDeleted: { default: false } },
      {
        intBooleans: true,
      },
    );
    expect(row.isDeleted).toBe(0);
  });
});
