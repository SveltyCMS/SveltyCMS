/**
 * @file tests/unit/databases/mariadb-insert-coalescer.test.ts
 * @description Unit tests for the MariaDB multi-row INSERT statement coalescer
 * (Option 3 — PostgreSQL parity).
 *
 * Asserts the `rawInsertManyReturning` coalescer contract against a mocked
 * mysql2 pool:
 * - one multi-VALUES statement per batch (no RETURNING — created rows are
 *   synthesized in input order, the measured no-read-back fast path),
 * - mysql2 binding parity with the single-row path (objects → JSON text,
 *   Date instances bound natively, boolean defaults as 0/1),
 * - missing values bind as DEFAULT across heterogeneous row shapes,
 * - null-decline on pool failure and inside a foreign transaction,
 * - the SVELTY_WRITE_COALESCING env gate and the insert() routing into the
 *   per-collection StatementCoalescer.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { boolean, datetime, json, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { AdapterCore } from "@src/databases/mariadb/adapter-core";
import { registerTableSchema } from "@src/databases/core/relational-utils";
import type { BaseEntity, BaseQueryOptions } from "@src/databases/db-interface";

/** Real Drizzle def so getTableName/getColumn/synthesizeInsertRow see real metadata. */
const postsTable = mysqlTable("test_posts", {
  _id: varchar("_id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenantId", { length: 36 }),
  data: json("data"),
  status: varchar("status", { length: 32 }),
  slug: varchar("slug", { length: 200 }),
  isDeleted: boolean("isDeleted").default(false),
  createdAt: datetime("createdAt"),
  updatedAt: datetime("updatedAt"),
});

registerTableSchema(
  "posts",
  ["_id", "tenantId", "data", "status", "slug", "isDeleted", "createdAt", "updatedAt"],
  ["isDeleted"],
);

class ProbeAdapter extends AdapterCore {
  rawInsertManyBatch(
    table: unknown,
    collection: string,
    values: Record<string, any>[],
    options: BaseQueryOptions = {},
  ): Promise<BaseEntity[] | null> {
    return this.rawInsertManyReturning<BaseEntity>(table, collection, values, options);
  }

  get coalescingGate(): boolean {
    return this.insertCoalescingEnabled;
  }
}

interface MockPool {
  execute: ReturnType<typeof vi.fn>;
}

function makePool(): MockPool {
  return { execute: vi.fn(async () => []) };
}

const ORIGINAL_COALESCING = process.env.SVELTY_WRITE_COALESCING;

afterEach(() => {
  if (ORIGINAL_COALESCING === undefined) delete process.env.SVELTY_WRITE_COALESCING;
  else process.env.SVELTY_WRITE_COALESCING = ORIGINAL_COALESCING;
});

describe("MariaDB insert coalescing (Option 3)", () => {
  it("gates on SVELTY_WRITE_COALESCING like the PostgreSQL lane", () => {
    const adapter = new ProbeAdapter();
    delete process.env.SVELTY_WRITE_COALESCING;
    expect(adapter.coalescingGate).toBe(true);
    process.env.SVELTY_WRITE_COALESCING = "0";
    expect(adapter.coalescingGate).toBe(false);
  });

  it("executes ONE multi-VALUES statement and maps synthesized rows in input order", async () => {
    const adapter = new ProbeAdapter();
    const pool = makePool();
    (adapter as unknown as { pool: MockPool }).pool = pool;

    const now = new Date("2026-10-09T10:00:00.000Z");
    const rows = await adapter.rawInsertManyBatch(postsTable, "posts", [
      {
        _id: "a",
        tenantId: "t1",
        data: { title: "First" },
        status: "draft",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: "b",
        tenantId: "t1",
        data: { title: "Second" },
        status: "published",
        slug: "second",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    expect(pool.execute).toHaveBeenCalledTimes(1);
    const [sqlText, params] = pool.execute.mock.calls[0] as [string, unknown[]];
    // ONE statement, two tuples, no RETURNING (synthesis, not read-back).
    expect(sqlText).toMatch(/^INSERT INTO `test_posts` \([^)]*\) VALUES \([^)]*\), \([^)]*\)$/);
    expect(sqlText).not.toContain("RETURNING");
    // Row 1 lacks slug → binds DEFAULT (heterogeneous shapes share one statement).
    expect(sqlText).toContain("DEFAULT");
    // Objects bound as JSON text (parity with the single-row path), Date natively.
    expect(params).toContain('{"title":"First"}');
    expect(params).toContain('{"title":"Second"}');
    expect(params).toContain(now);
    // Boolean default coerced to the 0/1 the intBooleans contract requires.
    expect(params).toContain(0);
    // 8 columns × 2 rows minus the one DEFAULT literal.
    expect(params.length).toBe(15);

    // Input-order mapping: rows come back in submission order, date-normalized.
    expect(rows).toHaveLength(2);
    const out = rows as unknown as Record<string, any>[];
    expect(out[0]._id).toBe("a");
    expect(out[1]._id).toBe("b");
    expect(out[0].status).toBe("draft");
    expect(out[1].slug).toBe("second");
    expect(out[0].createdAt).toBe("2026-10-09T10:00:00.000Z");
    // data blob flattened onto the row root (mariaDoubleParseJson).
    expect(out[0].title).toBe("First");
    expect(out[1].title).toBe("Second");
  });

  it("declines with null when the statement fails so the coalescer replays per row", async () => {
    const adapter = new ProbeAdapter();
    const pool = makePool();
    (adapter as unknown as { pool: MockPool }).pool = pool;
    pool.execute.mockRejectedValueOnce(new Error("ER_NO_SUCH_TABLE"));

    const rows = await adapter.rawInsertManyBatch(postsTable, "posts", [
      { _id: "x", status: "draft" },
    ]);
    expect(rows).toBeNull();
  });

  it("declines inside a foreign transaction without a raw handle", async () => {
    const adapter = new ProbeAdapter();
    const pool = makePool();
    (adapter as unknown as { pool: MockPool }).pool = pool;

    const rows = await adapter.rawInsertManyBatch(
      postsTable,
      "posts",
      [{ _id: "x", status: "draft" }],
      { transaction: {} },
    );
    expect(rows).toBeNull();
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it("returns [] for an empty batch without touching the pool", async () => {
    const adapter = new ProbeAdapter();
    const pool = makePool();
    (adapter as unknown as { pool: MockPool }).pool = pool;

    expect(await adapter.rawInsertManyBatch(postsTable, "posts", [])).toEqual([]);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  it("insert() coalesces two concurrent inserts into one statement when the gate is open", async () => {
    delete process.env.SVELTY_WRITE_COALESCING;
    const adapter = new ProbeAdapter();
    const pool = makePool();
    (adapter as unknown as { pool: MockPool }).pool = pool;
    (adapter as unknown as { connected: boolean }).connected = true;

    // RFC 9562 UUIDv7 — the enterprise _id contract validateEntryId enforces.
    const idA = "0190123456787abc8def0123456789aa";
    const idB = "0190123456787abc8def0123456789bb";
    const p1 = adapter.insert("entries", { _id: idA, title: "First", status: "draft" } as never);
    const p2 = adapter.insert("entries", {
      _id: idB,
      title: "Second",
      status: "published",
    } as never);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(pool.execute).toHaveBeenCalledTimes(1);
    const [sqlText] = pool.execute.mock.calls[0] as [string, unknown[]];
    expect(sqlText).toContain("INSERT INTO `collection_entries`");
    expect(sqlText).not.toContain("RETURNING");

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    if (!r1.success || !r2.success) return;
    const d1 = r1.data as unknown as Record<string, any>;
    const d2 = r2.data as unknown as Record<string, any>;
    expect(d1._id).toBe(idA);
    expect(d2._id).toBe(idB);
    expect(d1.title).toBe("First");
    expect(d2.title).toBe("Second");
  });
});
