/**
 * @file tests/unit/utils/singleflight.test.ts
 * @description
 * Unit tests for Singleflight Request Coalescing Engine.
 *
 * Verifies that 1,000 concurrent requests for the same key execute the underlying function
 * EXACTLY ONCE, preventing thundering herds and cache stampedes.
 */

import { describe, it, expect, vi } from "vitest";
import { Singleflight } from "@src/utils/singleflight";

describe("Singleflight (Request Coalescer & Thundering Herd Defense)", () => {
  it("coalesces 1,000 concurrent calls into a single execution", async () => {
    const sf = new Singleflight<string>();
    const mockFn = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "coalesced-result";
    });

    // Fire 1,000 concurrent requests simultaneously
    const promises = Array.from({ length: 1000 }).map(() => sf.do("query:hot_posts", mockFn));

    const results = await Promise.all(promises);

    // Target function must be called EXACTLY ONCE
    expect(mockFn).toHaveBeenCalledTimes(1);

    // All 1,000 callers receive the exact same result
    expect(results).toHaveLength(1000);
    expect(results.every((r) => r === "coalesced-result")).toBe(true);
    expect(sf.activeCount).toBe(0);
  });

  it("handles errors gracefully without leaving dangling in-flight keys", async () => {
    const sf = new Singleflight<never>();
    const failingFn = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error("Target DB Failure");
    });

    const p1 = sf.do("query:failing_key", failingFn);
    const p2 = sf.do("query:failing_key", failingFn);

    const [r1, r2] = await Promise.allSettled([p1, p2]);

    expect(r1.status).toBe("rejected");
    expect(r2.status).toBe("rejected");
    expect(failingFn).toHaveBeenCalledTimes(1);
    expect(sf.activeCount).toBe(0);
  });
});
