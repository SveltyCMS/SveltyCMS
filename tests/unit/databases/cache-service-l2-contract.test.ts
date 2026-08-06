/**
 * @file tests/unit/databases/cache-service-l2-contract.test.ts
 * @description L2 (distributed cache) contract suite.
 *
 * Runs the same assertions against two drivers:
 * 1. **In-memory FakeRedis** (`./fake-redis.ts`) — always on, deterministic,
 *    zero infra. This closes the "Redis L2 path still thin" gap for every run.
 * 2. **Real Redis** — enabled with `TEST_REDIS_URL` (CI matrix / local docker);
 *    skipped otherwise. Same contract, same expectations.
 *
 * Two `CacheService` instances share one Redis driver per case, simulating two
 * nodes: cross-instance hits, write batching, distributed stampede locks,
 * tenant-scoped tag sets, pattern scans, and pub/sub invalidation.
 *
 * The filename intentionally contains `cache-service` so `tests/unit/setup.ts`
 * `isTestTarget("cache-service")` disables the global cacheMock for this file.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FakeRedis } from "./fake-redis";
import { isDockerRunning } from "../../integration/helpers/docker";

async function getCacheServiceClass(): Promise<any> {
  const module = await import("@src/databases/cache/cache-service?bun-unmock=" + Date.now());
  return module.CacheService;
}

interface L2Driver {
  makeService(): Promise<any>;
  /** Best-effort per-service teardown (closes real Redis clients). */
  teardown?(service: any): Promise<void>;
}

/** Deterministic flush wait for the 15ms write-batch timer. */
const flushWrites = () => new Promise((resolve) => setTimeout(resolve, 40));

/**
 * Real Redis pub/sub is async — L1 on peer nodes is not guaranteed to clear
 * in the same tick as `delete()` / `clearByTags()`. FakeRedis delivers inline.
 */
const settleInvalidation = () => new Promise((resolve) => setTimeout(resolve, 80));

/** Hard cap so afterEach never hangs the suite (node-redis quit can stall). */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<void>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } catch {
    // Teardown best-effort — never fail the suite on cleanup
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function runL2Contract(label: string, driver: L2Driver) {
  describe(`CacheService L2 contract — ${label}`, () => {
    let serviceA: any;
    let serviceB: any;

    beforeEach(async () => {
      serviceA = await driver.makeService();
      serviceB = await driver.makeService();
    });

    afterEach(async () => {
      // Service cleanup first (unsubscribe + flush), then driver client close.
      await withTimeout(Promise.resolve(serviceA?.cleanup?.()), 3_000, "serviceA.cleanup");
      await withTimeout(Promise.resolve(serviceB?.cleanup?.()), 3_000, "serviceB.cleanup");
      await withTimeout(Promise.resolve(driver.teardown?.(serviceA)), 3_000, "teardown A");
      await withTimeout(Promise.resolve(driver.teardown?.(serviceB)), 3_000, "teardown B");
      serviceA = null;
      serviceB = null;
    }, 15_000);

    it("serves a value written by another instance (L2 hit)", async () => {
      await serviceA.set("shared-key", { hello: "world" }, 60, "t1");
      await flushWrites();
      await expect(serviceB.get("shared-key", "t1")).resolves.toEqual({ hello: "world" });
    });

    it("preserves raw strings across instances (__RAW_STRING__ envelope)", async () => {
      await serviceA.set("raw-key", "plain-string", 60, "t1");
      await flushWrites();
      await expect(serviceB.get("raw-key", "t1")).resolves.toBe("plain-string");
    });

    it("enforces tenant isolation across instances", async () => {
      await serviceA.set("tenant-key", "a-data", 60, "tenant-a");
      await flushWrites();
      await expect(serviceB.get("tenant-key", "tenant-b")).resolves.toBeUndefined();
      await expect(serviceB.get("tenant-key", "tenant-a")).resolves.toBe("a-data");
    });

    it("delete() clears the entry for the other instance", async () => {
      await serviceA.set("del-key", "value", 60, "t1");
      await flushWrites();
      await expect(serviceB.get("del-key", "t1")).resolves.toBe("value");

      await serviceA.delete("del-key", "t1");
      await settleInvalidation();
      await expect(serviceB.get("del-key", "t1")).resolves.toBeUndefined();
    });

    it("clearByPattern() crosses instances via L2 scan", async () => {
      await serviceA.set("user:1:profile", "p1", 60, "t1");
      await serviceA.set("user:2:profile", "p2", 60, "t1");
      await serviceA.set("other:keep", "keep", 60, "t1");
      await flushWrites();

      await serviceA.clearByPattern("user:*", "t1");
      await expect(serviceB.get("user:1:profile", "t1")).resolves.toBeUndefined();
      await expect(serviceB.get("user:2:profile", "t1")).resolves.toBeUndefined();
      await expect(serviceB.get("other:keep", "t1")).resolves.toBe("keep");
    });

    it("clearByTags() purges tagged entries across instances with tenant partition", async () => {
      await serviceA.set("tagged-a", "va", 60, "tenant-a", undefined, ["shared-tag"]);
      await serviceA.set("tagged-b", "vb", 60, "tenant-b", undefined, ["shared-tag"]);
      await flushWrites();

      // Only tenant-a's tag set is cleared — tenant-b keeps its entry.
      await serviceA.clearByTags(["shared-tag"], "tenant-a");
      await settleInvalidation();
      await expect(serviceB.get("tagged-a", "tenant-a")).resolves.toBeUndefined();
      await expect(serviceB.get("tagged-b", "tenant-b")).resolves.toBe("vb");
    });

    it("coalesces stampedes across instances via the distributed lock", async () => {
      // Instance B wins the lock on the miss; A must wait for the winner.
      const pB = serviceB.get("stampede-key", "t1");
      await new Promise((resolve) => setTimeout(resolve, 30));

      const pA = serviceA.get("stampede-key", "t1");
      await new Promise((resolve) => setTimeout(resolve, 10));

      await serviceB.set("stampede-key", "from-b", 60, "t1");
      await expect(pA).resolves.toBe("from-b");
      await expect(pB).resolves.toBeUndefined(); // caller of the winner populates
    });

    it("propagates invalidation to the other instance's L1 via pub/sub", async () => {
      await serviceA.set("pubsub-key", "hot", 60, "t1");
      await flushWrites();
      // Warm both L1s.
      await serviceA.get("pubsub-key", "t1");
      await serviceB.get("pubsub-key", "t1");

      // A invalidates → B's L1 must be purged (B would re-read L2, also deleted).
      await serviceA.delete("pubsub-key", "t1");
      await settleInvalidation();
      await expect(serviceB.get("pubsub-key", "t1")).resolves.toBeUndefined();
    });

    it("getMany() reads missing keys across instances (mGet)", async () => {
      await serviceA.set("m1", "one", 60, "t1");
      await serviceA.set("m2", "two", 60, "t1");
      await flushWrites();

      const result = await serviceB.getMany(["m1", "m2", "missing"], "t1");
      expect(result).toEqual(["one", "two", null]);
    });

    it("shares SWR entries across instances (factory runs once)", async () => {
      let loaderCalls = 0;
      const factory = async () => {
        loaderCalls++;
        return { v: 42 };
      };

      const fromA = await serviceA.getOrSetSWR("swr-key", factory, 60_000, 300_000, "t1");
      await flushWrites();
      const fromB = await serviceB.getOrSetSWR("swr-key", factory, 60_000, 300_000, "t1");

      expect(fromA).toEqual({ v: 42 });
      expect(fromB).toEqual({ v: 42 });
      expect(loaderCalls).toBe(1);
    });

    it("invalidateAll() clears both instances", async () => {
      await serviceA.set("all-a", "1", 60, "t1");
      await serviceA.set("all-b", "2", 60, "t2");
      await flushWrites();

      await serviceA.invalidateAll();
      await settleInvalidation();
      await expect(serviceB.get("all-a", "t1")).resolves.toBeUndefined();
      await expect(serviceB.get("all-b", "t2")).resolves.toBeUndefined();
    });
  });
}

describe("CacheService L2 contract — in-memory FakeRedis (always on)", () => {
  let fake: FakeRedis;

  beforeEach(() => {
    fake = new FakeRedis();
  });

  runL2Contract("fake", {
    makeService: async () => {
      const CacheServiceClass = await getCacheServiceClass();
      const service = new CacheServiceClass();
      await service.connectL2ForTest(fake, fake);
      return service;
    },
  });
});

/**
 * Real Redis: only when explicitly configured.
 * Do NOT use isDockerRunning() under CI — that helper always returns true when
 * `CI=true`, which would enable this suite on unit jobs without a Redis service
 * and hang afterEach on connect/quit (hook timeout 10s).
 * Local: auto-detect docker redis when not in CI.
 */
const redisUrl =
  process.env.TEST_REDIS_URL ||
  (process.env.CI !== "true" && isDockerRunning("redis") ? "redis://127.0.0.1:6379" : undefined);

describe.skipIf(!redisUrl)(
  "CacheService L2 contract — real Redis (TEST_REDIS_URL or Docker)",
  () => {
    runL2Contract("real", {
      makeService: async () => {
        const { createClient } = await import("redis");
        const CacheServiceClass = await getCacheServiceClass();
        // Separate clients for commands vs pub/sub — node-redis requires this.
        const cmd = createClient({ url: redisUrl });
        const sub = createClient({ url: redisUrl });
        cmd.on("error", () => {});
        sub.on("error", () => {});
        await Promise.all([cmd.connect(), sub.connect()]);
        const service = new CacheServiceClass();
        await service.connectL2ForTest(cmd, sub);
        // Stash for teardown (avoid shared openClients array races)
        (service as any).__testClients = [cmd, sub];
        return service;
      },
      teardown: async (service: any) => {
        const clients: any[] = service?.__testClients ?? [];
        service.__testClients = [];
        for (const client of clients) {
          // disconnect is more reliable than quit under active subscriptions
          if (client?.isOpen) {
            await withTimeout(
              Promise.resolve(
                typeof client.disconnect === "function" ? client.disconnect() : client.quit(),
              ),
              2_000,
              "redis client close",
            );
          }
        }
      },
    });
  },
);
