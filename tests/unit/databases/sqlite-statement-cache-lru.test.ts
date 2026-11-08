/**
 * @file tests/unit/databases/sqlite-statement-cache-lru.test.ts
 * @description Bounded-LRU admission for the SQLite prepared-statement cache.
 *
 * The cache used to be a plain `Map` capped with `if (size < 1000) set(...)`:
 * once full it stopped admitting statements, so every hot statement re-prepared
 * on each call while stale statements stayed resident forever. It is now a
 * `FastLRU`, which evicts the least-recently used statement at the cap.
 *
 * ### Features:
 * - 1,001 unique SQL texts → size capped at 1,000 and the oldest is evicted
 * - a hot key re-`get` survives the next insert
 * - `clearStatementCaches()` empties the cache (DDL invalidation)
 */

import { describe, expect, it } from "vitest";
import { FastLRU } from "@utils/native-utils";
import { SQLiteAdapter } from "@src/databases/sqlite/sqlite-adapter";

interface StubStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number };
  values(...params: unknown[]): unknown[];
}

interface StubClient {
  prepare(sqlText: string): StubStatement;
}

/** Typed window onto the adapter internals under test. */
interface StatementCacheInternals {
  _sqlite: StubClient | null;
  _statementCache: FastLRU<string, StubStatement>;
  clearStatementCaches(): void;
}

function createHarness(): {
  adapter: SQLiteAdapter;
  internals: StatementCacheInternals;
  prepared: string[];
} {
  const prepared: string[] = [];
  const adapter = new SQLiteAdapter();
  const internals = adapter as unknown as StatementCacheInternals;
  internals._sqlite = {
    prepare(sqlText: string): StubStatement {
      prepared.push(sqlText);
      return {
        all: () => [],
        get: () => undefined,
        run: () => ({ changes: 0 }),
        values: () => [],
      };
    },
  };
  return { adapter, internals, prepared };
}

describe("SQLite prepared-statement cache (LRU admission)", () => {
  it("is a FastLRU bounded at 1,000 entries", () => {
    const { internals } = createHarness();
    expect(internals._statementCache).toBeInstanceOf(FastLRU);
    expect(internals._statementCache.max).toBe(1000);
  });

  it("keeps admitting statements at the cap and evicts the oldest", () => {
    const { adapter, internals, prepared } = createHarness();
    const cache = internals._statementCache;

    for (let i = 0; i <= 1000; i++) {
      adapter.executePreparedStatement(`SELECT ${i}`, "all");
    }

    expect(prepared).toHaveLength(1001);
    expect(cache.size).toBe(1000);
    // The 1,001st statement replaced the first one instead of being dropped.
    expect(cache.has("SELECT 0")).toBe(false);
    expect(cache.has("SELECT 1")).toBe(true);
    expect(cache.has("SELECT 1000")).toBe(true);
  });

  it("re-gets a hot key without re-preparing it after the next insert", () => {
    const { adapter, internals, prepared } = createHarness();
    const cache = internals._statementCache;

    for (let i = 0; i <= 1000; i++) {
      adapter.executePreparedStatement(`SELECT ${i}`, "all");
    }
    expect(prepared).toHaveLength(1001);

    // Refresh recency: this hit must not call prepare.
    adapter.executePreparedStatement("SELECT 500", "all");
    expect(prepared).toHaveLength(1001);

    // One more unique statement evicts the least-recently used (`SELECT 1`),
    // never the hot key.
    adapter.executePreparedStatement("SELECT 1001", "all");
    expect(prepared).toHaveLength(1002);
    expect(cache.has("SELECT 500")).toBe(true);
    expect(cache.has("SELECT 1")).toBe(false);

    // The hot key is still served from the cache (no re-prepare).
    adapter.executePreparedStatement("SELECT 500", "all");
    expect(prepared).toHaveLength(1002);
  });

  it("clearStatementCaches() empties the cache (DDL invalidation)", () => {
    const { adapter, internals } = createHarness();
    const cache = internals._statementCache;

    adapter.executePreparedStatement("SELECT 1", "all");
    adapter.executePreparedStatement("SELECT 2", "all");
    expect(cache.size).toBe(2);

    internals.clearStatementCaches();
    expect(cache.size).toBe(0);
    expect(cache.has("SELECT 1")).toBe(false);
  });

  it("re-prepares after a clear so the statement is usable again", () => {
    const { adapter, internals, prepared } = createHarness();
    adapter.executePreparedStatement("SELECT 1", "all");
    internals.clearStatementCaches();
    adapter.executePreparedStatement("SELECT 1", "all");
    expect(prepared).toEqual(["SELECT 1", "SELECT 1"]);
  });
});
