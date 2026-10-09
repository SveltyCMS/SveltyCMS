/**
 * @file tests/unit/databases/insert-coalescer.test.ts
 * @description Unit tests for the Phase 2 insert coalescer (statement-level batching).
 *
 * Asserts the observable contract with an injected scheduler (deterministic
 * drains, no timers): lone rows take the single path, concurrent rows batch
 * into one multi-row run, declined/failed batches replay per row, and one
 * failing row never corrupts a sibling's result.
 */

import { describe, expect, it, vi } from "vitest";
import {
  StatementCoalescer,
  type InsertBatchRunner,
} from "@src/databases/core/statement-coalescer";

interface ManualScheduler {
  drain: () => void;
  schedule: (fn: () => void) => void;
}

function makeScheduler(): ManualScheduler {
  let pending: (() => void) | null = null;
  return {
    drain: () => {
      const fn = pending;
      pending = null;
      fn?.();
    },
    schedule: (fn: () => void) => {
      pending = fn;
    },
  };
}

function row(id: string): Record<string, any> {
  return { _id: id, title: id };
}

function makeRunBatch(impl?: InsertBatchRunner<Record<string, any>>) {
  const runBatch = vi.fn(
    impl ??
      ((values: Record<string, any>[]) =>
        Promise.resolve(values.map((v) => ({ ...v, stamped: true })))),
  );
  return runBatch;
}

describe("StatementCoalescer", () => {
  it("routes a lone row through runSingle without touching runBatch", async () => {
    const scheduler = makeScheduler();
    const runBatch = makeRunBatch();
    const coalescer = new StatementCoalescer<Record<string, any>>(runBatch, scheduler.schedule);

    const runSingle = vi.fn(() => Promise.resolve({ _id: "a" }));
    const p = coalescer.submit(row("a"), runSingle);
    scheduler.drain();
    const result = await p;

    expect(result).toEqual({ _id: "a" });
    expect(runSingle).toHaveBeenCalledTimes(1);
    expect(runBatch).not.toHaveBeenCalled();
    expect(coalescer.metrics).toEqual({ batchedRows: 0, batchCount: 0 });
  });

  it("coalesces concurrent rows into one runBatch and maps results in order", async () => {
    const scheduler = makeScheduler();
    const runBatch = makeRunBatch();
    const coalescer = new StatementCoalescer<Record<string, any>>(runBatch, scheduler.schedule);

    const p1 = coalescer.submit(row("1"), () => Promise.resolve({ _id: "1" }));
    const p2 = coalescer.submit(row("2"), () => Promise.resolve({ _id: "2" }));
    const p3 = coalescer.submit(row("3"), () => Promise.resolve({ _id: "3" }));
    scheduler.drain();

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(runBatch).toHaveBeenCalledTimes(1);
    const values = runBatch.mock.calls[0][0] as Record<string, any>[];
    expect(values.map((v) => v._id)).toEqual(["1", "2", "3"]);
    expect(r1).toEqual({ _id: "1", title: "1", stamped: true });
    expect(r2).toEqual({ _id: "2", title: "2", stamped: true });
    expect(r3).toEqual({ _id: "3", title: "3", stamped: true });
    expect(coalescer.metrics).toEqual({ batchedRows: 3, batchCount: 1 });
  });

  it("replays every row individually when the engine declines the batch", async () => {
    const scheduler = makeScheduler();
    const runBatch = makeRunBatch(() => Promise.resolve(null));
    const coalescer = new StatementCoalescer<Record<string, any>>(runBatch, scheduler.schedule);

    const runSingle = vi.fn((id: string) => () => Promise.resolve({ _id: id }));
    const p1 = coalescer.submit(row("a"), runSingle("a"));
    const p2 = coalescer.submit(row("b"), runSingle("b"));
    scheduler.drain();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(runBatch).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ _id: "a" });
    expect(r2).toEqual({ _id: "b" });
    expect(coalescer.metrics).toEqual({ batchedRows: 0, batchCount: 0 });
  });

  it("isolates one failing row: its caller rejects, siblings commit", async () => {
    const scheduler = makeScheduler();
    const runBatch = makeRunBatch(() => Promise.reject(new Error("duplicate key")));
    const coalescer = new StatementCoalescer<Record<string, any>>(runBatch, scheduler.schedule);

    const p1 = coalescer.submit(row("a"), () => Promise.resolve({ _id: "a" }));
    const p2 = coalescer.submit(row("bad"), () => Promise.reject(new Error("duplicate key")));
    const p3 = coalescer.submit(row("c"), () => Promise.resolve({ _id: "c" }));
    scheduler.drain();

    await expect(p1).resolves.toEqual({ _id: "a" });
    await expect(p2).rejects.toThrow("duplicate key");
    await expect(p3).resolves.toEqual({ _id: "c" });
  });

  it("replays when the batch result length does not match the batch size", async () => {
    const scheduler = makeScheduler();
    const runBatch = makeRunBatch((values) => Promise.resolve(values.slice(0, 1)));
    const coalescer = new StatementCoalescer<Record<string, any>>(runBatch, scheduler.schedule);

    const p1 = coalescer.submit(row("a"), () => Promise.resolve({ _id: "a" }));
    const p2 = coalescer.submit(row("b"), () => Promise.resolve({ _id: "b" }));
    scheduler.drain();

    await expect(Promise.all([p1, p2])).resolves.toEqual([{ _id: "a" }, { _id: "b" }]);
    expect(coalescer.metrics.batchCount).toBe(0);
  });

  it("batches again after a previous drain without cross-batch leakage", async () => {
    const scheduler = makeScheduler();
    const runBatch = makeRunBatch();
    const coalescer = new StatementCoalescer<Record<string, any>>(runBatch, scheduler.schedule);

    const p1 = coalescer.submit(row("a"), () => Promise.resolve({ _id: "a" }));
    scheduler.drain();
    await p1;

    const p2 = coalescer.submit(row("b"), () => Promise.resolve({ _id: "b" }));
    const p3 = coalescer.submit(row("c"), () => Promise.resolve({ _id: "c" }));
    scheduler.drain();
    await Promise.all([p2, p3]);

    expect(runBatch).toHaveBeenCalledTimes(1); // only the second drain batched
    const values = runBatch.mock.calls[0][0] as Record<string, any>[];
    expect(values.map((v) => v._id)).toEqual(["b", "c"]);
  });

  it("lone write dispatches on standard tick even when windowMs is configured", async () => {
    const scheduler = makeScheduler();
    const runBatch = makeRunBatch();
    const coalescer = new StatementCoalescer<Record<string, any>>(runBatch, scheduler.schedule, 50);

    const runSingle = vi.fn(() => Promise.resolve({ _id: "lone" }));
    const p = coalescer.submit(row("lone"), runSingle);
    scheduler.drain(); // tick fires
    const res = await p;

    expect(res).toEqual({ _id: "lone" });
    expect(runSingle).toHaveBeenCalledTimes(1);
    expect(runBatch).not.toHaveBeenCalled();
  });

  it("burst writes accumulate across the windowMs burst-hold window", async () => {
    vi.useFakeTimers();
    try {
      const runBatch = makeRunBatch();
      const coalescer = new StatementCoalescer<Record<string, any>>(runBatch, undefined, 20);

      const p1 = coalescer.submit(row("w1"), () => Promise.resolve({ _id: "w1" }));
      const p2 = coalescer.submit(row("w2"), () => Promise.resolve({ _id: "w2" }));
      const p3 = coalescer.submit(row("w3"), () => Promise.resolve({ _id: "w3" }));

      // Fast-forward timer by 20ms
      await vi.advanceTimersByTimeAsync(25);
      await Promise.all([p1, p2, p3]);

      expect(runBatch).toHaveBeenCalledTimes(1);
      const values = runBatch.mock.calls[0][0] as Record<string, any>[];
      expect(values.map((v) => v._id)).toEqual(["w1", "w2", "w3"]);
      expect(coalescer.metrics.batchCount).toBe(1);
      expect(coalescer.metrics.batchedRows).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
