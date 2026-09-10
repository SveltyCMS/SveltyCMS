/**
 * @file tests/unit/rate-limit/redis-client.test.ts
 * @description Connection-Detector: Verbindungsfehler → Store wird "unavailable".
 *
 * Nutzt einen garantiert unerreichbaren Endpunkt (Port 1), damit der Test
 * deterministisch fehlschlaegt (ECONNREFUSED / Connect-Timeout) und der Store
 * als unavailable markiert wird — Voraussetzung fuer den In-Memory-Fallback.
 */
import { describe, expect, it } from "vitest";
import { RedisRateLimitStore } from "@utils/rate-limit/redis-client";

describe("RedisRateLimitStore (Connection-Detector)", () => {
  it("markiert den Store als unavailable, wenn Redis nicht erreichbar ist", async () => {
    const store = new RedisRateLimitStore({
      url: "redis://127.0.0.1:1", // sicher unerreichbar
      connectTimeoutMs: 400,
      pingIntervalMs: 90_000,
    });
    expect(store.getStatus()).toBe("unavailable");
    await expect(store.connect()).rejects.toThrow();
    expect(store.getStatus()).toBe("unavailable");
    expect(store.isAvailable()).toBe(false);
    await store.close();
  });

  it("wirft bei checkAndConsume, wenn Redis nicht verfuegbar ist (Fallback-Anstoss)", async () => {
    const store = new RedisRateLimitStore({ url: "redis://127.0.0.1:1", connectTimeoutMs: 400 });
    await expect(
      store.checkAndConsume("rl:test", { capacity: 10, refillPerSecond: 1 }, 1),
    ).rejects.toThrow(/Redis unavailable/);
    await store.close();
  });
});
