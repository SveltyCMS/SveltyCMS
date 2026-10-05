/**
 * @file tests/unit/rate-limit/async-remote.test.ts
 * @description Lane-lean rate-limit mode: local bucket enforces synchronously,
 * the Redis ledger gets the identical spend propagated without awaiting it.
 *
 * The warm collection write lane opts in via `rateLimit({ asyncRemote: true })`
 * so a mutation never pays the Redis round trip on its critical path while the
 * cross-process ledger still receives the spend a tick later.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Controllable fake Redis store: available by default, checkAndConsume hangs
// until the test resolves it — proving the decision never waits on Redis.
const fake = vi.hoisted(() => ({
  available: true,
  calls: [] as Array<{ key: string; cost: number }>,
  resolveNext: null as null | (() => void),
}));

vi.mock("@utils/rate-limit/redis-client", () => ({
  RedisRateLimitStore: class FakeRedisStore {
    isAvailable() {
      return fake.available;
    }
    async connect() {}
    async close() {}
    checkAndConsume(key: string, _bucket: unknown, cost: number) {
      fake.calls.push({ key, cost });
      return new Promise<{ allowed: boolean; tokens: number; retryAfterSeconds: number }>(
        (resolve) => {
          fake.resolveNext = () => resolve({ allowed: true, tokens: 999, retryAfterSeconds: 0 });
        },
      );
    }
  },
}));

import { rateLimit, resetRateLimitStores } from "@utils/rate-limit";
import type { BaseRateLimitConfig } from "@utils/rate-limit/adaptive";

const NO_REFILL: BaseRateLimitConfig = {
  capacity: 10,
  refillPerSecond: 0,
  maxRequests: 10,
  windowMs: 60_000,
};

describe("rateLimit asyncRemote (lane-lean)", () => {
  beforeEach(() => {
    resetRateLimitStores();
    fake.available = true;
    fake.calls = [];
    fake.resolveNext = null;
  });

  it("returns the memory decision before the Redis call resolves", async () => {
    const decision = await rateLimit({
      context: { tenantId: "global" },
      base: NO_REFILL,
      namespace: "ip:203.0.113.10",
      asyncRemote: true,
    });
    // The Redis promise is still pending — the decision came from memory only.
    expect(fake.resolveNext).not.toBeNull();
    expect(decision.scope).toBe("memory");
    expect(decision.degraded).toBe(false);
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(9);

    // The identical spend still lands in Redis a tick later.
    fake.resolveNext!();
    await vi.waitFor(() => expect(fake.calls.length).toBe(1));
    expect(fake.calls[0]!.cost).toBe(1);
  });

  it("enforces the limit locally while Redis propagation is still pending", async () => {
    let last: { allowed: boolean } | undefined;
    for (let i = 0; i < 11; i++) {
      last = await rateLimit({
        context: { tenantId: "global" },
        base: NO_REFILL,
        namespace: "ip:203.0.113.11",
        asyncRemote: true,
      });
    }
    // Local bucket exhausted on the 11th consume — never waited on Redis.
    expect(last!.allowed).toBe(false);
    expect(fake.calls.length).toBe(11);
  });

  it("keeps the awaited Redis path for non-asyncRemote callers", async () => {
    const pending = rateLimit({
      context: { tenantId: "global" },
      base: NO_REFILL,
      namespace: "ip:203.0.113.12",
    });
    // The default path AWAITS Redis: nothing resolves until the fake does.
    fake.resolveNext!();
    const decision = await pending;
    expect(decision.scope).toBe("redis");
    expect(decision.remaining).toBe(999);
  });

  it("degrades to the memory fallback when Redis is down", async () => {
    fake.available = false;
    const decision = await rateLimit({
      context: { tenantId: "global" },
      base: NO_REFILL,
      namespace: "ip:203.0.113.13",
      asyncRemote: true,
    });
    expect(decision.scope).toBe("memory");
    expect(decision.degraded).toBe(true);
    expect(fake.calls.length).toBe(0);
  });
});
