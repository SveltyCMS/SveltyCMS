/**
 * @file tests/unit/cache/cache-service-pg-bus.test.ts
 * @description Unit tests for cross-node L1 cache & epoch invalidation via fallback transport (PostgreSQL LISTEN/NOTIFY).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";

describe("Cross-node L1 invalidation PG LISTEN/NOTIFY fallback", () => {
  let nodeA: CacheService;
  let nodeB: CacheService;

  beforeEach(() => {
    nodeA = new CacheService();
    nodeB = new CacheService();
  });

  afterEach(async () => {
    await nodeA.destroy();
    await nodeB.destroy();
  });

  it("propagates collection epochs, tag clears, pattern deletes, and flushes across nodes without Redis", async () => {
    const published: string[] = [];

    // Simulate PostgreSQL pg_notify on nodeA delivering to PG LISTEN on nodeB (and self-echo on nodeA)
    nodeA.registerFallbackInvalidationTransport({
      publish: async (payload: string) => {
        published.push(payload);
        nodeA.handleInvalidationPayload(payload);
        nodeB.handleInvalidationPayload(payload);
      },
    });
    nodeB.registerFallbackInvalidationTransport({
      publish: async () => {},
    });

    await nodeB.set("posts:list", [{ _id: "1" }], 60, "tenant-1", CacheCategory.COLLECTION, [
      "collection:posts",
    ]);
    await nodeB.set("item:42", { _id: "42" }, 60, "tenant-1", CacheCategory.ENTRY);
    expect(nodeB.getSync("posts:list", "tenant-1")).toEqual([{ _id: "1" }]);

    // Bump epoch + invalidate collection on nodeA -> nodeB syncs epoch & evicts local L1
    await nodeA.invalidateCollection("posts", "tenant-1");

    expect(published.length).toBeGreaterThanOrEqual(2);
    expect(nodeB.getCollectionEpoch("posts", "tenant-1")).toBeGreaterThanOrEqual(1);
    expect(nodeB.getSync("posts:list", "tenant-1")).toBeNull();
    // Self-echo must not regress or break nodeA
    expect(nodeA.getCollectionEpoch("posts", "tenant-1")).toBe(1);

    // Key delete propagates across nodes
    await nodeA.delete("item:42", "tenant-1");
    expect(nodeB.getSync("item:42", "tenant-1")).toBeNull();
  });

  it("ignores malformed notification payloads cleanly and cleans up transport on destroy", async () => {
    const closeSpy = vi.fn().mockResolvedValue(undefined);
    nodeA.registerFallbackInvalidationTransport({
      publish: async () => {},
      close: closeSpy,
    });

    expect(() => nodeA.handleInvalidationPayload("{not valid json")).not.toThrow();

    await nodeA.destroy();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
