/**
 * @file tests/unit/databases/sql-stream-keyset-sqlite.test.ts
 * @description Real-SQLite contract for `executeSqlStreamMany` keyset paging.
 *
 * `sql-crud-read.test.ts` proves path selection against a stub query chain; this
 * file proves the chosen SQL actually executes on a database and returns every
 * row exactly once across the 500-row page boundary.
 *
 * ### Features:
 * - no-sort stream crosses more than two pages and returns every row once
 * - keyset order is `_id` ascending (deterministic across pages)
 * - a non-`_id` sort still streams every row through the offset fallback
 */

import { beforeAll, describe, expect, it } from "vitest";
import { SQLiteAdapter } from "@src/databases/sqlite/sqlite-adapter";
import type { DatabaseId, DatabaseResult } from "@src/databases/db-interface";
import type { Schema } from "@src/content/types";
import { generateUUID } from "@src/utils/native-utils";

const COLLECTION = "sql_stream_keyset_contract";
const TENANT = "tenant-stream-keyset" as DatabaseId;
const ROWS = 1205;

const schema: Schema = {
  _id: COLLECTION,
  name: COLLECTION,
  slug: COLLECTION,
  fields: [{ db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" }],
} as Schema;

async function collect<T>(result: DatabaseResult<AsyncIterable<T>>): Promise<T[]> {
  if (!result.success) throw new Error(result.message ?? "streamMany failed");
  const rows: T[] = [];
  for await (const row of result.data) rows.push(row);
  return rows;
}

describe("streamMany keyset paging on SQLite", () => {
  let adapter: SQLiteAdapter;

  beforeAll(async () => {
    adapter = new SQLiteAdapter();
    const conn = await adapter.connect(":memory:");
    expect(conn.success).toBe(true);
    await adapter.createModel(schema);

    const rows = Array.from({ length: ROWS }, (_unused, index) => ({
      _id: generateUUID(),
      title: `row-${String(index).padStart(4, "0")}`,
    }));
    for (let i = 0; i < rows.length; i += 250) {
      const slice = rows.slice(i, i + 250);
      const inserted = await adapter.crud.insertMany(COLLECTION, slice as never, {
        tenantId: TENANT,
      });
      expect(inserted.success).toBe(true);
    }
  }, 60_000);

  it("streams every row exactly once across page boundaries", async () => {
    const rows = await collect<{ _id: string }>(
      await adapter.crud.streamMany(COLLECTION, {}, { tenantId: TENANT, limit: ROWS + 10 }),
    );
    expect(rows).toHaveLength(ROWS);
    expect(new Set(rows.map((row) => row._id)).size).toBe(ROWS);
  });

  it("orders the keyset stream by _id ascending", async () => {
    const rows = await collect<{ _id: string }>(
      await adapter.crud.streamMany(COLLECTION, {}, { tenantId: TENANT, limit: ROWS + 10 }),
    );
    const ids = rows.map((row) => row._id);
    expect(ids).toEqual([...ids].sort());
  });

  it("falls back to offset paging for a non-_id sort", async () => {
    const rows = await collect<{ _id: string }>(
      await adapter.crud.streamMany(
        COLLECTION,
        {},
        {
          tenantId: TENANT,
          limit: ROWS + 10,
          sort: { title: "desc" },
        },
      ),
    );
    expect(rows).toHaveLength(ROWS);
    expect(new Set(rows.map((row) => row._id)).size).toBe(ROWS);
  });
});
