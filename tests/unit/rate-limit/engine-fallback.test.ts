/**
 * @file tests/unit/rate-limit/engine-fallback.test.ts
 * @description Integration: Redis-Ausfall → Engine faellt nahtlos auf In-Memory zurueck.
 *
 * Mockt `@utils/rate-limit/redis-client`, damit der Redis-Store als "unavailable"
 * gilt. Verifiziert, dass die öffentliche `rateLimit()`-API in den lokalen
 * Store ausweicht, weiterhin Limits durchsetzt (allowed=false) und den Zustand
 * korrekt als memory/degraded markiert.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Redis immer als "down" behandeln → Fallback-Pfad deterministisch.
vi.mock("@utils/rate-limit/redis-client", () => ({
  RedisRateLimitStore: class FakeRedisStore {
    isAvailable() {
      return false;
    }
    async connect() {}
    async close() {}
    async checkAndConsume(): Promise<never> {
      throw new Error("Redis down (test)");
    }
    getStatus() {
      return "unavailable";
    }
  },
}));

import {
  rateLimit,
  initRateLimiter,
  resetRateLimitStores,
  isRedisRateLimitActive,
} from "@utils/rate-limit";
import type { BaseRateLimitConfig } from "@utils/rate-limit/adaptive";

const NO_REFILL: BaseRateLimitConfig = {
  capacity: 10,
  refillPerSecond: 0,
  maxRequests: 10,
  windowMs: 60_000,
};

describe("Redis-Fallback (rateLimit API)", () => {
  beforeEach(() => {
    resetRateLimitStores();
  });

  it("faellt bei nicht verfuegbarem Redis auf memory zurueck (scope/degraded)", async () => {
    await initRateLimiter();
    const decision = await rateLimit({
      context: { tenantId: "global" },
      base: NO_REFILL,
      namespace: "ip:203.0.113.1",
    });
    expect(decision.scope).toBe("memory");
    expect(decision.degraded).toBe(true);
    expect(decision.allowed).toBe(true);
    // Redis gilt als inaktiv.
    expect(isRedisRateLimitActive()).toBe(false);
  });

  it("setzt die adaptive Grenze durch (anonymous → 0.5x Kapazitaet)", async () => {
    // base capacity 10, anonymous tier (kein user), tenant global → effektiv 5.
    const decision = await rateLimit({
      context: { tenantId: "global" },
      base: NO_REFILL,
      namespace: "ip:203.0.113.2",
    });
    expect(decision.remaining).toBeLessThanOrEqual(4); // 5 - 1 = 4 uebrig
  });

  it("verweigert ab Kapazitaetsueberschreitung mit retryAfterSeconds", async () => {
    let last;
    for (let i = 0; i < 6; i++) {
      last = await rateLimit({
        context: { tenantId: "global" },
        base: NO_REFILL,
        namespace: "ip:203.0.113.3",
      });
    }
    expect(last!.allowed).toBe(false);
    expect(last!.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("erlaubt unterschiedliche Buckets (namespace/tenant) unabhaengig", async () => {
    // Gleiche Kapazitaet, aber unterschiedliche Namespaces → isolierte Buckets.
    let limitedBucket: any;
    for (let i = 0; i < 6; i++) {
      limitedBucket = await rateLimit({
        context: { tenantId: "global" },
        base: NO_REFILL,
        namespace: "ip:203.0.113.4",
      });
    }
    expect(limitedBucket.allowed).toBe(false);

    const fresh = await rateLimit({
      context: { tenantId: "global" },
      base: NO_REFILL,
      namespace: "ip:203.0.113.5",
    });
    expect(fresh.allowed).toBe(true);
  });

  it("Admin bekommt eine groessere Kapazitaet als Gast (adaptiv)", async () => {
    // Admin (role=admin): tier 3x → capacity = 10*3 = 30. Gast: 10*0.5 = 5.
    const adminBase: BaseRateLimitConfig = { ...NO_REFILL, capacity: 10, refillPerSecond: 0 };
    const guest = await rateLimit({
      context: { tenantId: "global", userId: "u-guest" },
      base: adminBase,
      namespace: "ip:10.0.0.1",
      cost: 1,
    });
    const admin = await rateLimit({
      context: { tenantId: "global", role: "admin" },
      base: adminBase,
      namespace: "ip:10.0.0.2",
      cost: 1,
    });
    // nach 1 Konsum: guest remaining ~4, admin remaining ~29
    expect(admin.remaining).toBeGreaterThan(guest.remaining);
  });
});
