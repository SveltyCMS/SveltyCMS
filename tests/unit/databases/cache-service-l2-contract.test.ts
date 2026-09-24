/**
 * @file tests/unit/databases/cache-service-l2-contract.test.ts
 * @description L2 (distributed cache) contract suite.
 *
 * Runs the same assertions against two drivers:
 * 1. **In-memory FakeRedis** (`./fake-redis.ts`) — always on, deterministic,
 *    zero infra. This closes the "Redis L2 path still thin" gap for every run.
 * 2. **Real Redis** — enabled when a Redis is reachable (see `redisUrl` below):
 *    `TEST_REDIS_URL` (CI matrix / local docker) or a running docker container
 *    named `sveltycms-redis` (tests/docker-compose.yml `--profile redis`).
 *    Skipped otherwise — the same 11 assertions already ran against FakeRedis,
 *    and CI/unit jobs must not require infra. Same contract, same expectations.
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

async function getCacheServiceClass(): Promise<any> {
  const module = await import("@src/databases/cache/cache-service?bun-unmock=" + Date.now());
  return module.CacheService;
}

interface L2Driver {
  makeService(): Promise<any>;
  /** Best-effort per-service teardown (closes real Redis clients). */
  teardown?(service: any): Promise<void>;
  /** Deterministic flush of the writer's pending batched writes. */
  flushWrites?(service: any): Promise<void>;
}

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
  // Deterministic: flush the writer's own batcher instead of sleeping. Pub/sub
  // propagation is asserted by polling (eventual consistency), never by sleeps.
  const flushWrites = driver.flushWrites ?? ((service: any) => service.flushL2WritesForTest());

  /** Polls until `read()` yields undefined (bounded) — pub/sub propagation. */
  const expectEventuallyUndefined = async (read: () => Promise<unknown>, ms = 3_000) => {
    const startedAt = Date.now();
    let last: unknown;
    do {
      last = await read();
      if (last === undefined) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    } while (Date.now() - startedAt < ms);
    expect(last).toBeUndefined();
  };

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
      await flushWrites(serviceA);
      await expect(serviceB.get("shared-key", "t1")).resolves.toEqual({ hello: "world" });
    });

    it("preserves raw strings across instances (__RAW_STRING__ envelope)", async () => {
      await serviceA.set("raw-key", "plain-string", 60, "t1");
      await flushWrites(serviceA);
      await expect(serviceB.get("raw-key", "t1")).resolves.toBe("plain-string");
    });

    it("enforces tenant isolation across instances", async () => {
      await serviceA.set("tenant-key", "a-data", 60, "tenant-a");
      await flushWrites(serviceA);
      await expect(serviceB.get("tenant-key", "tenant-b")).resolves.toBeUndefined();
      await expect(serviceB.get("tenant-key", "tenant-a")).resolves.toBe("a-data");
    });

    it("delete() clears the entry for the other instance", async () => {
      await serviceA.set("del-key", "value", 60, "t1");
      await flushWrites(serviceA);
      await expect(serviceB.get("del-key", "t1")).resolves.toBe("value");

      await serviceA.delete("del-key", "t1");
      await expectEventuallyUndefined(() => serviceB.get("del-key", "t1"));
    });

    it("clearByPattern() crosses instances via L2 scan", async () => {
      await serviceA.set("user:1:profile", "p1", 60, "t1");
      await serviceA.set("user:2:profile", "p2", 60, "t1");
      await serviceA.set("other:keep", "keep", 60, "t1");
      await flushWrites(serviceA);

      await serviceA.clearByPattern("user:*", "t1");
      await expectEventuallyUndefined(() => serviceB.get("user:1:profile", "t1"));
      await expectEventuallyUndefined(() => serviceB.get("user:2:profile", "t1"));
      await expect(serviceB.get("other:keep", "t1")).resolves.toBe("keep");
    });

    it("clearByTags() purges tagged entries across instances with tenant partition", async () => {
      await serviceA.set("tagged-a", "va", 60, "tenant-a", undefined, ["shared-tag"]);
      await serviceA.set("tagged-b", "vb", 60, "tenant-b", undefined, ["shared-tag"]);
      await flushWrites(serviceA);

      // Only tenant-a's tag set is cleared — tenant-b keeps its entry.
      await serviceA.clearByTags(["shared-tag"], "tenant-a");
      await expectEventuallyUndefined(() => serviceB.get("tagged-a", "tenant-a"));
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
      await flushWrites(serviceA);
      // Warm both L1s.
      await serviceA.get("pubsub-key", "t1");
      await serviceB.get("pubsub-key", "t1");

      // A invalidates → B's L1 must be purged (B would re-read L2, also deleted).
      await serviceA.delete("pubsub-key", "t1");
      await expectEventuallyUndefined(() => serviceB.get("pubsub-key", "t1"));
    });

    it("getMany() reads missing keys across instances (mGet)", async () => {
      await serviceA.set("m1", "one", 60, "t1");
      await serviceA.set("m2", "two", 60, "t1");
      await flushWrites(serviceA);

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
      await flushWrites(serviceA);
      const fromB = await serviceB.getOrSetSWR("swr-key", factory, 60_000, 300_000, "t1");

      expect(fromA).toEqual({ v: 42 });
      expect(fromB).toEqual({ v: 42 });
      expect(loaderCalls).toBe(1);
    });

    it("invalidateAll() clears both instances", async () => {
      await serviceA.set("all-a", "1", 60, "t1");
      await serviceA.set("all-b", "2", 60, "t2");
      await flushWrites(serviceA);

      await serviceA.invalidateAll();
      await expectEventuallyUndefined(() => serviceB.get("all-a", "t1"));
      await expectEventuallyUndefined(() => serviceB.get("all-b", "t2"));
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
    flushWrites: (service: any) => service.flushL2WritesForTest(),
  });
});

/**
 * Real Redis: only when one actually answers on the port.
 *
 * The probe is a TCP connect, NOT `isDockerRunning()`: that helper returns `true`
 * for every caller the moment `CI=true` (the integration matrix always starts its
 * own profile, so the optimism is correct there), which makes it useless for the
 * only question this suite has — is a Redis listening here?
 *
 * Trusting the flag in a unit job without the service is what caused the previous
 * `process.env.CI !== "true"` guard: the suite would have been enabled, then hung
 * `afterEach` on connect/quit until the 10 s hook timeout. That guard bought the
 * timeout back at the cost of 11 tests that NEVER ran in CI while every developer
 * ran them locally — two different suites under one name. A real probe plus the
 * redis profile started by the CI unit job means both run the same 11 tests, and
 * a machine without Redis still skips honestly instead of failing.
 *
 * `TEST_REDIS_URL` stays authoritative: an operator who pins it gets a loud
 * failure rather than a silent skip.
 */
const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";

async function isReachable(url: string, timeoutMs = 500): Promise<boolean> {
  const { connect } = await import("node:net");
  const parsed = new URL(url);
  return new Promise<boolean>((resolve) => {
    const socket = connect({ host: parsed.hostname, port: Number(parsed.port || 6379) });
    const done = (reachable: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

const redisUrl =
  process.env.TEST_REDIS_URL ||
  ((await isReachable(DEFAULT_REDIS_URL)) ? DEFAULT_REDIS_URL : undefined);

/**
 * Dedicated logical DB so this suite's `flushDb()` can never wipe state that
 * other suites/workers share on the same Redis instance (and vice versa) —
 * shared-DB flushes were a second, order-dependent flake source.
 * A `TEST_REDIS_URL` that already pins a DB is kept as-is.
 */
const redisIsolatedUrl = redisUrl
  ? (() => {
      const parsed = new URL(redisUrl);
      if (!parsed.pathname || parsed.pathname === "/" || parsed.pathname === "/0") {
        parsed.pathname = "/13";
      }
      return parsed.toString();
    })()
  : undefined;

describe.skipIf(!redisUrl)(
  "CacheService L2 contract — real Redis (TEST_REDIS_URL or Docker)",
  () => {
    runL2Contract("real", {
      makeService: async () => {
        const { createClient } = await import("redis");
        const CacheServiceClass = await getCacheServiceClass();
        // Separate clients for commands vs pub/sub — node-redis requires this.
        const cmd = createClient({ url: redisIsolatedUrl });
        const sub = createClient({ url: redisIsolatedUrl });
        cmd.on("error", () => {});
        sub.on("error", () => {});
        await Promise.all([cmd.connect(), sub.connect()]);
        try {
          await cmd.flushDb();
        } catch {}
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
