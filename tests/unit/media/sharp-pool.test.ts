/**
 * @file tests/unit/media/sharp-pool.test.ts
 * @description Unit tests for bounded Sharp concurrency queue (`runWithSharpSlot`) and re-entrancy guard.
 */

import { afterEach, describe, expect, it } from "vitest";
import { getSharpPoolStats, runWithSharpSlot } from "@utils/media/sharp-loader.server";

describe("runWithSharpSlot bounded concurrency queue", () => {
  const prevLimit = process.env.SVELTY_SHARP_POOL_LIMIT;

  afterEach(() => {
    if (prevLimit === undefined) delete process.env.SVELTY_SHARP_POOL_LIMIT;
    else process.env.SVELTY_SHARP_POOL_LIMIT = prevLimit;
  });

  it("bounds simultaneous active executions to SVELTY_SHARP_POOL_LIMIT and drains cleanly", async () => {
    process.env.SVELTY_SHARP_POOL_LIMIT = "2";
    let inFlight = 0;
    let peak = 0;
    let entered = 0;

    const gates: Array<() => void> = [];
    const tasks = [0, 1, 2, 3, 4].map((idx) =>
      runWithSharpSlot(async () => {
        entered++;
        inFlight++;
        if (inFlight > peak) peak = inFlight;
        await new Promise<void>((resolve) => {
          gates.push(resolve);
        });
        inFlight--;
        return idx * 2;
      }),
    );

    // Wait microtask so first 2 enter and next 3 queue cleanly
    await Promise.resolve();
    expect(peak).toBe(2);
    expect(getSharpPoolStats()).toEqual({ active: 2, queued: 3, limit: 2 });

    while (entered < 5 || gates.length > 0) {
      if (gates.length > 0) {
        gates.shift()!();
      }
      await Promise.resolve();
      await Promise.resolve();
    }

    const results = await Promise.all(tasks);
    expect(results).toEqual([0, 2, 4, 6, 8]);
    expect(peak).toBe(2);
    expect(getSharpPoolStats()).toEqual({ active: 0, queued: 0, limit: 2 });
  });

  it("allows nested re-entrant runWithSharpSlot calls without self-deadlock and releases on throw", async () => {
    process.env.SVELTY_SHARP_POOL_LIMIT = "1";

    const nestedResult = await runWithSharpSlot(async () => {
      // Pool limit is 1; re-entry MUST not deadlock on the waiting queue.
      const inner = await runWithSharpSlot(async () => "ok");
      return `outer:${inner}`;
    });
    expect(nestedResult).toBe("outer:ok");
    expect(getSharpPoolStats()).toEqual({ active: 0, queued: 0, limit: 1 });

    await expect(
      runWithSharpSlot(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(getSharpPoolStats()).toEqual({ active: 0, queued: 0, limit: 1 });
  });
});
