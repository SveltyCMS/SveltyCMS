/**
 * @file tests/unit/utils/mutex.test.ts
 * @description Unit tests for hardened Mutex with queue-chain locking.
 */
import { describe, it, expect } from "vitest";
import { Mutex } from "@utils/mutex";

describe("Mutex", () => {
  it("isLocked returns false when idle", () => {
    const m = new Mutex();
    expect(m.isLocked()).toBe(false);
  });

  it("isLocked returns true while locked", async () => {
    const m = new Mutex();
    const release = await m.lock();
    expect(m.isLocked()).toBe(true);
    release();
    expect(m.isLocked()).toBe(false);
  });

  it("serializes concurrent access via runExclusive", async () => {
    const m = new Mutex();
    const order: number[] = [];

    await Promise.all([
      m.runExclusive(async () => {
        order.push(1);
        await new Promise((r) => setTimeout(r, 20));
        order.push(2);
      }),
      m.runExclusive(async () => {
        order.push(3);
        await new Promise((r) => setTimeout(r, 10));
        order.push(4);
      }),
    ]);

    // Must be [1, 2, 3, 4] — serialized, not interleaved
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("runExclusive accepts sync functions", async () => {
    const m = new Mutex();
    const result = await m.runExclusive(() => 42);
    expect(result).toBe(42);
  });

  it("release only fires once", async () => {
    const m = new Mutex();
    const release = await m.lock();
    release();
    release(); // second release should be a no-op
    expect(m.isLocked()).toBe(false);
  });
});
