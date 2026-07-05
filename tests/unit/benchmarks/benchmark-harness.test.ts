/**
 * @file tests/unit/benchmarks/benchmark-harness.test.ts
 * @description Unit tests for the benchmark harness itself.
 *
 * Validates that the benchmark framework correctly detects and reports
 * failures at every layer: warmup, iteration, and result assertions.
 *
 * ### Features:
 * - warmup error detection (no more silent swallowing)
 * - assertSuccess throws on { success: false }
 * - assertSuccess passes on { success: true }
 * - benchmark >50% warmup failure guard
 * - onWarmupError callback fires correctly
 */

import { describe, it, expect } from "vitest";
import { assertSuccess } from "../../benchmarks/benchmark-utils";

describe("Benchmark Harness Unit Tests", () => {
  // ─────────────────────────────────────────────────────────────
  // assertSuccess — Guards against silently-returned DB errors
  // ─────────────────────────────────────────────────────────────

  describe("assertSuccess", () => {
    it("throws on { success: false } with message", () => {
      expect(() => {
        assertSuccess({ success: false, message: "Duplicate key error" }, "insert");
      }).toThrow("[insert] Duplicate key error");
    });

    it("throws on { success: false } with error.message", () => {
      expect(() => {
        assertSuccess({ success: false, error: { message: "Connection refused" } }, "findOne");
      }).toThrow("[findOne] Connection refused");
    });

    it("throws on null result", () => {
      expect(() => {
        assertSuccess(null, "count");
      }).toThrow("[count] Unknown error");
    });

    it("throws on undefined result", () => {
      expect(() => {
        assertSuccess(undefined, "update");
      }).toThrow("[update] Unknown error");
    });

    it("does NOT throw on { success: true }", () => {
      expect(() => {
        assertSuccess({ success: true }, "delete");
      }).not.toThrow();
    });

    it("does NOT throw on { success: true, data: [...] }", () => {
      expect(() => {
        assertSuccess({ success: true, data: [1, 2, 3] }, "findMany");
      }).not.toThrow();
    });

    it("includes the operation name in the error", () => {
      try {
        assertSuccess({ success: false, message: "timeout" }, "bulkInsert");
        expect.fail("Expected assertSuccess to throw");
      } catch (err: any) {
        expect(err.message).toContain("[bulkInsert]");
        expect(err.message).toContain("timeout");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Warmup Isolation Regression Tests
  // These tests assert the specific bug pattern we caught in
  // database-performance.test.ts (E11000 collision due to
  // warmup reusing pre-generated IDs).
  // ─────────────────────────────────────────────────────────────

  describe("Warmup Isolation", () => {
    it("detects when warmup and actual runs share the same key pool", async () => {
      // Simulates the pre-fix bug: both warmup and actual loops iterate
      // i=0..N over the SAME pre-generated array. Warmup inserts them all,
      // then actual hits E11000 on every key.
      const pool = ["key-0", "key-1", "key-2", "key-3", "key-4"];
      const inserted = new Set<string>();
      let warmupCollisions = 0;
      let actualCollisions = 0;

      const simulateInsert = (id: string) => {
        if (inserted.has(id)) {
          return { success: false, message: "Duplicate key error" };
        }
        inserted.add(id);
        return { success: true };
      };

      // Warmup: all 5 keys are unique → 0 collisions
      for (let i = 0; i < 5; i++) {
        const r = simulateInsert(pool[i]);
        if (!r.success) warmupCollisions++;
      }

      // Actual: all 5 keys already inserted → 5 collisions
      for (let i = 0; i < 5; i++) {
        const r = simulateInsert(pool[i]);
        if (!r.success) actualCollisions++;
      }

      expect(warmupCollisions).toBe(0);
      expect(actualCollisions).toBe(5);
    });

    it("has no collisions when using unique IDs per iteration", async () => {
      const inserted = new Set<string>();
      let collisions = 0;

      const simulateInsert = (id: string) => {
        if (inserted.has(id)) {
          collisions++;
          return { success: false, message: "Duplicate key error" };
        }
        inserted.add(id);
        return { success: true };
      };

      // Warmup: unique IDs
      for (let i = 0; i < 5; i++) {
        simulateInsert(`warmup-${i}`);
      }

      // Actual: different unique IDs
      for (let i = 0; i < 5; i++) {
        simulateInsert(`actual-${i}`);
      }

      expect(collisions).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Warmup Error Visibility — ensures the empty catch {} is gone
  // ─────────────────────────────────────────────────────────────

  describe("Warmup Error Visibility", () => {
    it(">50% warmup failure throws immediately", async () => {
      const { runBenchmark } = await import("../../benchmarks/modules/benchmark-utils");

      let warmupErrors = 0;

      try {
        await runBenchmark({
          name: "catastrophic-warmup",
          iterations: 5,
          warmupIterations: 8,
          runs: 1,
          silent: true,
          abortOnErrors: false,
          onWarmupError: () => warmupErrors++,
          onIteration: async () => {
            throw new Error("Simulated failure");
          },
        });
        expect.fail("Should have thrown on >50% warmup failure");
      } catch (err: any) {
        expect(err.message).toContain("warmup failure");
        expect(err.message).toContain("8/8");
      }

      expect(warmupErrors).toBeGreaterThanOrEqual(1);
    });

    it("warmup errors are visible via onWarmupError callback", async () => {
      const { runBenchmark } = await import("../../benchmarks/modules/benchmark-utils");

      let warmupErrors = 0;
      const firstErrors: string[] = [];

      try {
        await runBenchmark({
          name: "warmup-callback-test",
          iterations: 2,
          warmupIterations: 6, // 6 warmup, all fail → >50%
          runs: 1,
          silent: true,
          onWarmupError: (_i: number, err: any) => {
            warmupErrors++;
            if (firstErrors.length < 3) firstErrors.push(err.message);
          },
          onIteration: async () => {
            throw new Error("test failure");
          },
        });
      } catch {
        // Expected: >50% warmup guard triggers
      }

      expect(warmupErrors).toBeGreaterThanOrEqual(3);
      expect(firstErrors.length).toBeGreaterThan(0);
    });
  });
});
