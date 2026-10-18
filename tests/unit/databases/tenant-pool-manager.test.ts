/**
 * @file tests/unit/databases/tenant-pool-manager.test.ts
 * @description
 * Unit coverage for the shared per-tenant connection-pool bookkeeping used by
 * PostgreSQL and MariaDB: LRU eviction, in-flight protection, dedicated-DSN
 * tracking, and close/close-all lifecycle.
 *
 * ### Features:
 * - LRU picks the least-recently-used idle pool only
 * - busy pools are never evicted (warn + no-op)
 * - `acquire` refreshes last-use; `get` does not
 * - close path removes all bookkeeping and clears the tenant context
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { TenantPoolManager } from "@src/databases/sql/tenant-pool-manager";

interface FakePool {
  id: string;
  end: () => Promise<void>;
}

function makePool(id: string): FakePool {
  return { id, end: vi.fn().mockResolvedValue(undefined) };
}

function makeManager(): {
  manager: TenantPoolManager<FakePool>;
  closed: Array<{ id: string; tenantId: string }>;
} {
  const closed: Array<{ id: string; tenantId: string }> = [];
  const manager = new TenantPoolManager<FakePool>({
    label: "TestAdapter",
    closePool: async (pool, tenantId) => {
      closed.push({ id: pool.id, tenantId });
      return pool.end();
    },
  });
  return { manager, closed };
}

describe("TenantPoolManager", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tracks dedicated DSNs and the current tenant", () => {
    const { manager } = makeManager();
    expect(manager.currentTenantId).toBeNull();

    manager.currentTenantId = "tenant-a";
    expect(manager.currentTenantId).toBe("tenant-a");

    manager.set("tenant-a", makePool("a"));
    manager.markDedicated("tenant-a");
    expect(manager.has("tenant-a")).toBe(true);
    expect(manager.isDedicatedDsn("tenant-a")).toBe(true);
    expect(manager.isDedicatedDsn("tenant-b")).toBe(false);
  });

  it("evicts the least-recently-used idle pool at the cap", async () => {
    const { manager, closed } = makeManager();
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    manager.set("old", makePool("old"));
    now = 2_000;
    manager.set("new", makePool("new"));

    now = 3_000;
    manager.acquire("new");
    manager.evictOldestIdle(2);

    expect(manager.has("old")).toBe(false);
    expect(manager.has("new")).toBe(true);
    expect(closed).toEqual([{ id: "old", tenantId: "old" }]);
    expect(manager.size).toBe(1);
  });

  it("never evicts a pool with in-flight queries", () => {
    const { manager, closed } = makeManager();
    manager.set("busy", makePool("busy"));
    manager.set("idle", makePool("idle"));
    manager.trackQueryStart("busy");

    manager.evictOldestIdle(2);

    expect(manager.has("busy")).toBe(true);
    // The idle pool is still a valid LRU candidate.
    expect(closed).toHaveLength(1);
    expect(closed[0].tenantId).toBe("idle");
  });

  it("does nothing when a busy-only pool is the only candidate", () => {
    const { manager, closed } = makeManager();
    manager.set("busy", makePool("busy"));
    manager.trackQueryStart("busy");

    manager.evictOldestIdle(1);

    expect(manager.has("busy")).toBe(true);
    expect(closed).toEqual([]);
  });

  it("decrements in-flight counters without going negative", () => {
    const { manager } = makeManager();
    manager.set("t", makePool("t"));

    manager.trackQueryStart("t");
    manager.trackQueryStart("t");
    manager.trackQueryEnd("t");
    manager.trackQueryEnd("t");
    // Extra end must not underflow into a negative count that blocks eviction.
    manager.trackQueryEnd("t");
    manager.evictOldestIdle(1);

    expect(manager.has("t")).toBe(false);
  });

  it("releaseExisting closes and forgets the pool synchronously", async () => {
    const { manager, closed } = makeManager();
    const pool = makePool("t");
    manager.set("t", pool);
    manager.markDedicated("t");

    manager.releaseExisting("t");
    await Promise.resolve();

    expect(manager.has("t")).toBe(false);
    expect(manager.isDedicatedDsn("t")).toBe(false);
    expect(closed).toEqual([{ id: "t", tenantId: "t" }]);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("close removes one pool and returns whether anything was closed", async () => {
    const { manager, closed } = makeManager();
    manager.set("t", makePool("t"));

    await expect(manager.close("t")).resolves.toBe(true);
    await expect(manager.close("t")).resolves.toBe(false);

    expect(manager.has("t")).toBe(false);
    expect(closed).toEqual([{ id: "t", tenantId: "t" }]);
  });

  it("closeAll closes every pool and clears the tenant context", async () => {
    const { manager, closed } = makeManager();
    manager.currentTenantId = "t1";
    manager.set("t1", makePool("p1"));
    manager.set("t2", makePool("p2"));

    await manager.closeAll();

    expect(manager.size).toBe(0);
    expect(manager.currentTenantId).toBeNull();
    expect(closed.map((c) => c.tenantId).sort()).toEqual(["t1", "t2"]);
  });
});
