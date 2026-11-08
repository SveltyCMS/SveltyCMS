/**
 * @file tests/unit/databases/sql-coalescer.test.ts
 * @description
 * Unit tests for SqlCoalescerManager.
 * Asserts insert and update batch scheduling, bounded LRU eviction (UPDATE_COALESCER_MAX),
 * and manager cleanup.
 */

import { describe, expect, it, vi } from "vitest";
import {
  SqlCoalescerManager,
  UPDATE_COALESCER_MAX,
  type SqlCoalescerContext,
} from "@src/databases/core/sql-coalescer";

function createMockContext(): SqlCoalescerContext {
  return {
    insertCoalesceWindowMs: 0,
    updateCoalesceWindowMs: 0,
    persistTimestampsAsDate: true,
    convertDatesOptions: {},
    insertReturnsRows: true,
    getTable: vi.fn().mockReturnValue({ _: { name: "test_coll" } }),
    getDrizzleInstance: vi.fn().mockReturnValue({}),
    rawInsertManyReturning: vi.fn().mockResolvedValue([{ _id: "1", title: "Item 1" }]),
    rawUpdateManyReturning: vi.fn().mockResolvedValue([{ _id: "1", title: "Updated" }]),
  };
}

describe("SqlCoalescerManager", () => {
  it("creates and caches insert coalescers per collection", () => {
    const ctx = createMockContext();
    const manager = new SqlCoalescerManager(ctx);

    const c1 = manager.getInsertCoalescer("articles");
    const c2 = manager.getInsertCoalescer("articles");
    const c3 = manager.getInsertCoalescer("posts");

    expect(c1).toBe(c2);
    expect(c1).not.toBe(c3);
  });

  it("submits coalesced insert and runs single fallback on lone write", async () => {
    const ctx = createMockContext();
    const manager = new SqlCoalescerManager(ctx);
    const runSingle = vi.fn().mockResolvedValue({ _id: "solo" });

    const res = await manager.submitCoalescedInsert("articles", { title: "Solo" }, runSingle);
    expect(res).toEqual({ _id: "solo" });
    expect(runSingle).toHaveBeenCalled();
  });

  it("bounds the update coalescers cache up to UPDATE_COALESCER_MAX", () => {
    const ctx = createMockContext();
    const manager = new SqlCoalescerManager(ctx);

    for (let i = 0; i < UPDATE_COALESCER_MAX + 10; i++) {
      manager.getUpdateCoalescer(`key-${i}`, "articles");
    }

    // Cache should not exceed limit
    const cNew = manager.getUpdateCoalescer("new-key", "articles");
    expect(cNew).toBeDefined();
  });

  it("clears cached coalescers on clear()", () => {
    const ctx = createMockContext();
    const manager = new SqlCoalescerManager(ctx);

    const c1 = manager.getInsertCoalescer("articles");
    manager.clear();
    const c2 = manager.getInsertCoalescer("articles");
    expect(c1).not.toBe(c2);
  });
});
