/**
 * @file tests/unit/databases/content-node-batching.test.ts
 * @description Round-trip regression guards for the SQL content layer:
 *   `bulkUpdate` clears stale `_id`s with ONE `_id IN (...)` DELETE instead of
 *   one DELETE per row, and `reorderStructure` reads all `data` blobs with ONE
 *   batched SELECT instead of one full-row SELECT per item — while keeping the
 *   per-item `data.order` merge and the per-item UPDATE semantics intact.
 *
 * ### Features:
 * - Adapter call-count assertions on a recording Drizzle chain (N rows → 1 delete / 1 select)
 * - MariaDB (`onDuplicateKeyUpdate`) and PostgreSQL/SQLite (`onConflictDoUpdate`) branches
 * - String (sqlite/mysql) and object (jsonb) `data` blob merges
 */

import { describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { RelationalContentModule } from "@src/databases/core/relational-content";
import { contentNodes } from "@src/databases/sqlite/schema";
import type { DatabaseId, ISqlAdapter } from "@src/databases/db-interface";

// Branded tenant id: the content-module filters take `DatabaseId`, not a bare string.
const TENANT: DatabaseId = "unit-batching-tenant" as DatabaseId;

/** Records every Drizzle chain the module builds; thenable where it must be awaited. */
function createFakeDb(selectRows: Array<{ _id?: unknown; data?: unknown }>) {
  const deletes: unknown[] = [];
  const inserts: Array<Array<Record<string, unknown>>> = [];
  const updates: Array<{ set: Record<string, unknown>; where: unknown }> = [];
  const selectProjections: unknown[] = [];
  const selectWheres: unknown[] = [];
  const upsertCalls: string[] = [];
  let limitCalls = 0;

  const db = {
    delete: vi.fn((_table: unknown) => ({
      where: (condition: unknown) => {
        deletes.push(condition);
        return Promise.resolve([{ affectedRows: 1 }]);
      },
    })),
    insert: vi.fn((_table: unknown) => ({
      values: (values: Array<Record<string, unknown>>) => {
        inserts.push(values);
        return {
          onConflictDoUpdate: async (config: unknown) => {
            void config;
            upsertCalls.push("onConflictDoUpdate");
          },
          onDuplicateKeyUpdate: async (config: unknown) => {
            void config;
            upsertCalls.push("onDuplicateKeyUpdate");
          },
        };
      },
    })),
    select: vi.fn((projection?: unknown) => {
      selectProjections.push(projection);
      return {
        from: (_table: unknown) => ({
          where: (condition: unknown) => {
            selectWheres.push(condition);
            return Promise.resolve(selectRows);
          },
          limit: (_count: number) => {
            limitCalls += 1;
            return Promise.resolve(selectRows);
          },
        }),
      };
    }),
    update: vi.fn((_table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: unknown) => {
          updates.push({ set: values, where: condition });
          return Promise.resolve([{ affectedRows: 1 }]);
        },
      }),
    })),
  };

  return {
    db,
    deletes,
    inserts,
    updates,
    selectProjections,
    selectWheres,
    upsertCalls,
    getLimitCalls: () => limitCalls,
  };
}

/** Minimal adapter surface used by the content module (transaction runs inline). */
function createAdapter(type: string, db: unknown): ISqlAdapter {
  return {
    type,
    db,
    prepareValues: (_table: unknown, values: Record<string, unknown>) => values,
    transaction: <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(db),
  } as unknown as ISqlAdapter;
}

function renderSqlite(condition: unknown): { sql: string; params: unknown[] } {
  return new SQLiteSyncDialect().sqlToQuery(condition as SQL);
}

describe("RelationalContentModule.bulkUpdate stale-id cleanup", () => {
  it.each(["sqlite", "mariadb"])(
    "clears all stale ids with one _id IN (...) DELETE (%s)",
    async (type) => {
      const fake = createFakeDb([]);
      const module = new RelationalContentModule(createAdapter(type, fake.db), { contentNodes });

      const result = await module.nodes.bulkUpdate(
        ["alpha", "beta", "gamma"].map((id) => ({
          path: `/unit-batching-${id}`,
          id,
          changes: {
            name: id,
            path: `/unit-batching-${id}`,
            nodeType: "category" as const,
          },
        })),
        { tenantId: TENANT },
      );

      expect(result.success).toBe(true);
      expect(fake.db.delete).toHaveBeenCalledTimes(1);
      expect(fake.deletes).toHaveLength(1);

      const where = renderSqlite(fake.deletes[0]);
      expect(where.sql).toContain(" in (");
      expect(where.sql).toContain("_id");
      expect(where.params.flat(Infinity)).toEqual(["alpha", "beta", "gamma"]);

      // The single multi-row upsert is untouched.
      expect(fake.inserts).toHaveLength(1);
      expect(fake.inserts[0]).toHaveLength(3);
      expect(fake.updates).toHaveLength(0);
      expect(fake.upsertCalls).toEqual([
        type === "mariadb" ? "onDuplicateKeyUpdate" : "onConflictDoUpdate",
      ]);
    },
  );

  it("does not touch the database when there are no updates", async () => {
    const fake = createFakeDb([]);
    const module = new RelationalContentModule(createAdapter("sqlite", fake.db), { contentNodes });

    const result = await module.nodes.bulkUpdate([], { tenantId: TENANT });

    expect(result).toEqual({ success: true, data: [] });
    expect(fake.db.delete).not.toHaveBeenCalled();
    expect(fake.db.insert).not.toHaveBeenCalled();
  });
});

describe("RelationalContentModule.reorderStructure read batching", () => {
  const items = [
    { id: "node-a", parentId: "parent-1", order: 7, path: "/unit-batching-a" },
    { id: "node-b", parentId: "parent-1", order: 3, path: "/unit-batching-b" },
    { id: "node-missing", parentId: null, order: 1, path: "/unit-batching-m" },
  ];

  it("reads every data blob with one SELECT and keeps per-item updates", async () => {
    const fake = createFakeDb([
      { _id: "node-a", data: JSON.stringify({ name: "A", order: 99 }) },
      { _id: "node-b", data: { name: "B", order: 99 } },
    ]);
    const module = new RelationalContentModule(createAdapter("sqlite", fake.db), { contentNodes });

    const result = await module.nodes.reorderStructure(items);
    expect(result.success).toBe(true);

    // One batched read for all three items — no per-item full-row SELECT.
    expect(fake.db.select).toHaveBeenCalledTimes(1);
    expect(fake.getLimitCalls()).toBe(0);
    expect(Object.keys(fake.selectProjections[0] as object).sort()).toEqual(["_id", "data"]);
    expect(fake.selectWheres).toHaveLength(1);
    const where = renderSqlite(fake.selectWheres[0]);
    expect(where.sql).toContain(" in (");
    expect(where.params.flat(Infinity)).toEqual(["node-a", "node-b", "node-missing"]);

    // Writes remain per item, with the `data.order` merge preserved.
    expect(fake.updates).toHaveLength(3);
    const [a, b, missing] = fake.updates;
    expect(a.set).toMatchObject({ parentId: "parent-1", position: 7 });
    expect(JSON.parse(String(a.set.data))).toEqual({ name: "A", order: 7 });
    expect(b.set).toMatchObject({ parentId: "parent-1", position: 3 });
    expect(b.set.data).toEqual({ name: "B", order: 3 });
    // Unknown row: no blob to merge, so `data` stays untouched.
    expect(missing.set).not.toHaveProperty("data");
    expect(missing.set).toMatchObject({ parentId: null, position: 1 });
  });

  it("skips the batched read entirely when there is nothing to reorder", async () => {
    const fake = createFakeDb([]);
    const module = new RelationalContentModule(createAdapter("sqlite", fake.db), { contentNodes });

    const result = await module.nodes.reorderStructure([]);

    expect(result.success).toBe(true);
    expect(fake.db.select).not.toHaveBeenCalled();
    expect(fake.db.update).not.toHaveBeenCalled();
  });
});
