/**
 * @file tests/unit/rate-limit/handle-redis-rate-limit.test.ts
 * @description Middleware-Verifikation: 429 bei Ueberschreitung, 200 + Header im Limit.
 *
 * Mockt den Redis-Store als "down", damit die Engine in den In-Memory-Fallback
 * faellt — genau der im Task geforderte Ausfall-Test. Verifiziert die HTTP 429
 * (JSON, code RATE_LIMITED) fuer /api sowie die RateLimit-Header bei Erfolg.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Redis immer down → Fallback-Pfad (deterministisch).
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

import { handleRedisRateLimit, getActiveRateLimitScope } from "@src/hooks/handle-redis-rate-limit";
import { resetRateLimitStores } from "@utils/rate-limit";
import { createMockEvent, mockResolve } from "../hooks/test-utils";

// Kapazitaet klein machen → Ueberschreitung schnell testbar (effektiv ~0.5x*1.5x).
const ORIG = {
  capacity: process.env.RATE_LIMIT_CAPACITY,
  refill: process.env.RATE_LIMIT_REFILL_PER_SEC,
};
process.env.RATE_LIMIT_CAPACITY = "10";

function post(pathname: string) {
  return createMockEvent(pathname, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ip: "203.0.113.50",
  });
}

describe("handleRedisRateLimit (HTTP 429)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolve.mockClear();
    resetRateLimitStores();
  });

  it("laesst GET unlimitiert durch (Read-Methoden)", async () => {
    const event = createMockEvent("/api/foo", { method: "GET", ip: "203.0.113.51" });
    const res = await handleRedisRateLimit({ event, resolve: mockResolve as any });
    expect(res.status).toBe(200);
  });

  it("laesst Mutations bis zur Kapazitaet durch und gibt 429 danach", async () => {
    let last: Response | null = null;
    for (let i = 0; i < 12; i++) {
      last = await handleRedisRateLimit({ event: post("/api/foo"), resolve: mockResolve as any });
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("content-type")).toContain("application/json");
    const body = await last!.json();
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.scope).toBe("memory");
    expect(Number(last!.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
  });

  it("setzt RateLimit-Header auf Erfolgsresponses", async () => {
    const res = await handleRedisRateLimit({
      event: post("/api/foo"),
      resolve: mockResolve as any,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Scope")).toBe("memory");
    expect(res.headers.get("X-RateLimit-Redis")).toBe("0");
  });

  it("faellt bei Redis-Ausfall auf memory zurueck (Scope-Report)", () => {
    expect(getActiveRateLimitScope()).toBe("memory");
  });

  it("ueberspringt excluded Pfade (setup/health)", async () => {
    const res = await handleRedisRateLimit({
      event: post("/api/system/health"),
      resolve: mockResolve as any,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBeNull();
  });
});

afterAll(() => {
  if (ORIG.capacity === undefined) delete process.env.RATE_LIMIT_CAPACITY;
  else process.env.RATE_LIMIT_CAPACITY = ORIG.capacity;
});
