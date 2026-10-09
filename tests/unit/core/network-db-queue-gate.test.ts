/**
 * @file tests/unit/core/network-db-queue-gate.test.ts
 * @description
 * Unit tests for NetworkDbQueueGate bounded in-app queue concurrency.
 *
 * ### Features:
 * - Immediate execution under maxConcurrency capacity
 * - FIFO queueing and sequential dispatch when concurrency is saturated
 * - Fail-fast queue limit saturation (503 DB_QUEUE_SATURATED)
 * - Safe re-entrancy via AsyncLocalStorage for nested queries/transactions
 * - Queue timeout and clean connection teardown draining
 */

import { describe, it, expect } from "vitest";
import { NetworkDbQueueGate } from "@src/databases/core/network-db-queue-gate";

describe("NetworkDbQueueGate", () => {
  it("executes operations immediately when under concurrency capacity", async () => {
    const gate = new NetworkDbQueueGate({ maxConcurrency: 5, maxQueue: 10 });
    const result = await gate.acquire(async () => 42);
    expect(result).toBe(42);
    expect(gate.getMetrics().active).toBe(0);
    expect(gate.getMetrics().waiting).toBe(0);
  });

  it("queues excess operations and drains them in FIFO order", async () => {
    const gate = new NetworkDbQueueGate({ maxConcurrency: 2, maxQueue: 10 });
    const executed: number[] = [];

    let releaseFirst: () => void = () => {};
    const firstPromise = gate.acquire(
      () =>
        new Promise<string>((resolve) => {
          releaseFirst = () => {
            executed.push(1);
            resolve("first");
          };
        }),
    );

    let releaseSecond: () => void = () => {};
    const secondPromise = gate.acquire(
      () =>
        new Promise<string>((resolve) => {
          releaseSecond = () => {
            executed.push(2);
            resolve("second");
          };
        }),
    );

    // Third should queue because concurrency is 2
    const thirdPromise = gate.acquire(async () => {
      executed.push(3);
      return "third";
    });

    expect(gate.getMetrics().active).toBe(2);
    expect(gate.getMetrics().waiting).toBe(1);

    // Release first slot -> third should resume and complete
    releaseFirst();
    await firstPromise;

    const thirdResult = await thirdPromise;
    expect(thirdResult).toBe("third");

    releaseSecond();
    await secondPromise;

    expect(executed).toEqual([1, 3, 2]);
    expect(gate.getMetrics().active).toBe(0);
    expect(gate.getMetrics().waiting).toBe(0);
  });

  it("fails fast when queue capacity is saturated", async () => {
    const gate = new NetworkDbQueueGate({ maxConcurrency: 1, maxQueue: 2 });

    // Fill active slot
    let releaseActive: () => void = () => {};
    const p1 = gate.acquire(
      () =>
        new Promise<void>((resolve) => {
          releaseActive = resolve;
        }),
    );

    // Queue 2 items (maxQueue = 2)
    const p2 = gate.acquire(async () => "q1");
    const p3 = gate.acquire(async () => "q2");

    expect(gate.getMetrics().active).toBe(1);
    expect(gate.getMetrics().waiting).toBe(2);

    // 4th item exceeds queue limit -> immediate rejection
    await expect(gate.acquire(async () => "overflow")).rejects.toThrow(
      "Database connection queue saturated",
    );

    releaseActive();
    await Promise.all([p1, p2, p3]);
  });

  it("supports re-entrant calls without consuming extra concurrency slots", async () => {
    const gate = new NetworkDbQueueGate({ maxConcurrency: 1, maxQueue: 5 });

    // Outer operation acquires the 1 slot
    const result = await gate.acquire(async () => {
      expect(gate.getMetrics().active).toBe(1);

      // Inner operation inside same async context executes immediately (no deadlock!)
      const inner1 = await gate.acquire(async () => {
        expect(gate.getMetrics().active).toBe(1);
        return "inner-done";
      });

      return `outer:${inner1}`;
    });

    expect(result).toBe("outer:inner-done");
    expect(gate.getMetrics().active).toBe(0);
  });

  it("drains and rejects waiting operations when clear() is called", async () => {
    const gate = new NetworkDbQueueGate({ maxConcurrency: 1, maxQueue: 5 });

    let releaseActive: () => void = () => {};
    const p1 = gate.acquire(
      () =>
        new Promise<void>((resolve) => {
          releaseActive = resolve;
        }),
    );

    const queuedPromise = gate.acquire(async () => "never");
    expect(gate.getMetrics().waiting).toBe(1);

    gate.clear("Closing pool");

    await expect(queuedPromise).rejects.toThrow("Closing pool");
    expect(gate.getMetrics().waiting).toBe(0);

    releaseActive();
    await p1;
  });
});
