/**
 * @file tests/unit/databases/modern-db-engine.test.ts
 * @description
 * Unit tests for the 2027 State-of-the-Art database engine upgrades:
 * - Phase 2: Adaptive write coalescer
 */

import { describe, it, expect } from "vitest";
import { AdaptiveWriteCoalescer } from "@src/databases/core/write-coalescer";

describe("2027 State-of-the-Art DB Engine Upgrades (Phase 2)", () => {
  // ==========================================================================
  // Phase 2: Adaptive Write Coalescer
  // ==========================================================================
  describe("Phase 2: Adaptive Write Coalescer", () => {
    it("executes single writes immediately on the microtask tick without artificial delays", async () => {
      const coalescer = new AdaptiveWriteCoalescer();
      let executed = false;

      const res = await coalescer.submit(async () => {
        executed = true;
        return "single-result";
      });

      expect(executed).toBe(true);
      expect(res).toBe("single-result");
      const metrics = coalescer.getMetrics();
      expect(metrics.totalSingleWrites).toBe(1);
      expect(metrics.totalBatches).toBe(1);
      expect(metrics.totalCoalescedWrites).toBe(0);
    });

    it("coalesces concurrent write submissions into a micro-batch", async () => {
      const coalescer = new AdaptiveWriteCoalescer();

      const promises = [
        coalescer.submit(() => "val-1"),
        coalescer.submit(() => "val-2"),
        coalescer.submit(() => "val-3"),
        coalescer.submit(() => "val-4"),
      ];

      const results = await Promise.all(promises);
      expect(results).toEqual(["val-1", "val-2", "val-3", "val-4"]);

      const metrics = coalescer.getMetrics();
      expect(metrics.totalBatches).toBe(1);
      expect(metrics.totalCoalescedWrites).toBe(4);
      expect(metrics.maxBatchSizeSeen).toBe(4);
    });

    it("isolates operation failures so one failed op does not reject sibling ops", async () => {
      const coalescer = new AdaptiveWriteCoalescer();

      const p1 = coalescer.submit(() => "success-1");
      const p2 = coalescer.submit(() => {
        throw new Error("unique constraint violation");
      });
      const p3 = coalescer.submit(() => "success-3");

      const [r1, r2, r3] = await Promise.allSettled([p1, p2, p3]);

      expect(r1.status).toBe("fulfilled");
      if (r1.status === "fulfilled") expect(r1.value).toBe("success-1");

      expect(r2.status).toBe("rejected");
      if (r2.status === "rejected")
        expect((r2.reason as Error).message).toBe("unique constraint violation");

      expect(r3.status).toBe("fulfilled");
      if (r3.status === "fulfilled") expect(r3.value).toBe("success-3");
    });
  });
});
