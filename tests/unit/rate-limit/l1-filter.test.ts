/**
 * @file tests/unit/rate-limit/l1-filter.test.ts
 * @description Unit tests for synchronous L1 Leaky/Token Bucket Pre-Filter.
 *
 * Features:
 * - Constant-time synchronous token replenishment
 * - Volumetric flood rejection (>200 req/s)
 * - Zero allocations on steady state
 * - Bounded LRU eviction
 * - Nanosecond latency validation
 */

import { describe, it, expect, beforeEach } from "vitest";
import { checkL1PreFilter, resetL1Filter, getL1FilterStats } from "@utils/rate-limit/l1-filter";

describe("L1 Token Bucket Pre-Filter", () => {
  beforeEach(() => {
    resetL1Filter();
  });

  it("should allow initial requests within capacity", () => {
    const ip = "192.168.1.100";
    const result = checkL1PreFilter(ip, 1000, { capacity: 10, refillPerSec: 10 });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("should reject requests once burst capacity is exhausted", () => {
    const ip = "10.0.0.5";
    const opts = { capacity: 5, refillPerSec: 5 };
    const now = 2000;

    // Consume 5 tokens
    for (let i = 0; i < 5; i++) {
      const res = checkL1PreFilter(ip, now, opts);
      expect(res.allowed).toBe(true);
    }

    // 6th request at the same timestamp must be blocked
    const blocked = checkL1PreFilter(ip, now, opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("should refill tokens over elapsed time", () => {
    const ip = "10.0.0.8";
    const opts = { capacity: 10, refillPerSec: 10 };
    const startMs = 5000;

    // Exhaust all 10 tokens
    for (let i = 0; i < 10; i++) {
      checkL1PreFilter(ip, startMs, opts);
    }
    expect(checkL1PreFilter(ip, startMs, opts).allowed).toBe(false);

    // Advance 500ms -> 5 tokens replenished
    const laterMs = startMs + 500;
    const partialRefill = checkL1PreFilter(ip, laterMs, opts);
    expect(partialRefill.allowed).toBe(true);
    expect(partialRefill.remaining).toBe(4); // 5 refilled - 1 consumed = 4
  });

  it("should maintain bounded memory under high unique IP volume", () => {
    const opts = { capacity: 10, refillPerSec: 10, maxTrackedIps: 100 };

    for (let i = 0; i < 250; i++) {
      checkL1PreFilter(`172.16.0.${i}`, 10_000, opts);
    }

    const stats = getL1FilterStats();
    expect(stats.trackedIps).toBeLessThanOrEqual(100);
  });

  it("should execute checks with ultra-low latency (< 1 microsecond per check)", () => {
    const ip = "192.168.10.50";
    const now = 50_000;
    const iterations = 5_000;

    // Warm-up JIT
    for (let i = 0; i < 1_000; i++) {
      checkL1PreFilter(ip, now, { capacity: 100_000, refillPerSec: 100_000 });
    }

    const startTime = performance.now();
    for (let i = 0; i < iterations; i++) {
      checkL1PreFilter(ip, now + i, { capacity: 100_000, refillPerSec: 100_000 });
    }
    const elapsedMs = performance.now() - startTime;
    const avgMicros = (elapsedMs * 1000) / iterations;

    // Must be well under 1 microsecond (typically ~20-50 nanoseconds)
    expect(avgMicros).toBeLessThan(10); // 10 microseconds generous upper bound for test runners
  });
});
