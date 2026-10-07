/**
 * @file tests/unit/databases/write-batcher.test.ts
 * @description Unit tests for the SQLite group-commit batcher.
 *
 * The batcher is the opt-in half of the SQLite tail fix: writes queued during one
 * drain share a single `BEGIN IMMEDIATE … COMMIT`. These tests pin the scheduling
 * contract (a lone write goes through `runSingle`, ≥2 through `runBatch`), the
 * per-op settlement isolation the adapter's savepoint runner depends on, and the
 * safety net that keeps a misbehaving runner from hanging a caller. The scheduler
 * is injected so batching is deterministic; DB/network are only mocked at the
 * runner boundary.
 */

import { describe, expect, it, vi } from "vitest";
import { WriteBatcher, type PendingWrite } from "@src/databases/sqlite/write-batcher";

/** Manual scheduler: captures the drain so a test can fire it on demand. */
function manualScheduler() {
  let queued: (() => void) | null = null;
  return {
    schedule: (drain: () => void) => {
      queued = drain;
    },
    fire: () => {
      const drain = queued;
      queued = null;
      drain?.();
    },
  };
}

/** Runner that settles each job from its own run() outcome — the batch analogue. */
const settleEach = (jobs: PendingWrite[]): void => {
  for (const job of jobs) {
    try {
      job.resolve(job.run());
    } catch (error) {
      job.reject(error);
    }
  }
};

describe("WriteBatcher — drain batching", () => {
  it("coalesces writes queued before a drain into one runBatch call", async () => {
    const scheduler = manualScheduler();
    const runSingle = vi.fn((job: PendingWrite) => settleEach([job]));
    const runBatch = vi.fn((jobs: PendingWrite[]) => settleEach(jobs));
    const batcher = new WriteBatcher({ runSingle, runBatch, schedule: scheduler.schedule });

    const a = batcher.submit(() => 1);
    const b = batcher.submit(() => 2);
    expect(runBatch).not.toHaveBeenCalled();
    expect(runSingle).not.toHaveBeenCalled();

    scheduler.fire();
    await expect(Promise.all([a, b])).resolves.toEqual([1, 2]);
    expect(runBatch).toHaveBeenCalledTimes(1);
    expect(runBatch.mock.calls[0][0]).toHaveLength(2);
    expect(runSingle).not.toHaveBeenCalled();
  });

  it("keeps a lone write on the runSingle path (no group transaction)", async () => {
    const scheduler = manualScheduler();
    const runSingle = vi.fn((job: PendingWrite) => settleEach([job]));
    const runBatch = vi.fn((jobs: PendingWrite[]) => settleEach(jobs));
    const batcher = new WriteBatcher({ runSingle, runBatch, schedule: scheduler.schedule });

    const only = batcher.submit(() => "solo");
    scheduler.fire();

    await expect(only).resolves.toBe("solo");
    expect(runSingle).toHaveBeenCalledTimes(1);
    expect(runSingle.mock.calls[0][0].run()).toBe("solo");
    expect(runBatch).not.toHaveBeenCalled();
  });

  it("splits a long queue at maxBatchSize", async () => {
    const scheduler = manualScheduler();
    const runSingle = vi.fn((job: PendingWrite) => settleEach([job]));
    const runBatch = vi.fn((jobs: PendingWrite[]) => settleEach(jobs));
    const batcher = new WriteBatcher({
      runSingle,
      runBatch,
      schedule: scheduler.schedule,
      maxBatchSize: 2,
    });

    const results = [
      batcher.submit(() => 1),
      batcher.submit(() => 2),
      batcher.submit(() => 3),
      batcher.submit(() => 4),
      batcher.submit(() => 5),
    ];
    scheduler.fire();
    await expect(Promise.all(results)).resolves.toEqual([1, 2, 3, 4, 5]);
    expect(runBatch.mock.calls.map((c) => c[0].length)).toEqual([2, 2]);
    expect(runSingle).toHaveBeenCalledTimes(1);
  });
});

describe("WriteBatcher — settlement isolation", () => {
  it("one failing op rejects only itself; siblings keep their results", async () => {
    const scheduler = manualScheduler();
    const batcher = new WriteBatcher({
      runSingle: (job) => settleEach([job]),
      runBatch: (jobs) => settleEach(jobs),
      schedule: scheduler.schedule,
    });

    const ok1 = batcher.submit(() => "a");
    const bad = batcher.submit(() => {
      throw new Error("constraint");
    });
    const ok2 = batcher.submit(() => "c");
    scheduler.fire();

    const settled = await Promise.allSettled([ok1, bad, ok2]);
    expect(settled[0]).toEqual({ status: "fulfilled", value: "a" });
    expect(settled[1].status).toBe("rejected");
    expect(settled[2]).toEqual({ status: "fulfilled", value: "c" });
  });

  it("rejects every job when the runner throws without settling", async () => {
    const scheduler = manualScheduler();
    const batcher = new WriteBatcher({
      runSingle: () => {
        throw new Error("boom");
      },
      runBatch: () => {
        throw new Error("boom");
      },
      schedule: scheduler.schedule,
    });

    const a = batcher.submit(() => 1);
    const b = batcher.submit(() => 2);
    scheduler.fire();

    const settled = await Promise.allSettled([a, b]);
    expect(settled.map((s) => s.status)).toEqual(["rejected", "rejected"]);
  });

  it("rejects jobs a runner leaves unsettled instead of hanging", async () => {
    const scheduler = manualScheduler();
    const batcher = new WriteBatcher({
      runSingle: () => {},
      runBatch: () => {},
      schedule: scheduler.schedule,
    });

    const a = batcher.submit(() => 1);
    const b = batcher.submit(() => 2);
    scheduler.fire();

    const settled = await Promise.allSettled([a, b]);
    expect(settled.map((s) => s.status)).toEqual(["rejected", "rejected"]);
    for (const s of settled) {
      if (s.status === "rejected") {
        expect(String(s.reason)).toContain("did not settle");
      }
    }
  });

  it("ignores a second settlement of the same job", async () => {
    const scheduler = manualScheduler();
    const batcher = new WriteBatcher({
      runSingle: (job) => {
        job.resolve("first");
        job.resolve("second");
        job.reject(new Error("too late"));
      },
      runBatch: (jobs) => settleEach(jobs),
      schedule: scheduler.schedule,
    });

    const only = batcher.submit(() => "first");
    scheduler.fire();
    await expect(only).resolves.toBe("first");
  });
});

describe("WriteBatcher — default scheduler", () => {
  it("defers the drain to a tick, never synchronously", async () => {
    const runSingle = vi.fn((job: PendingWrite) => settleEach([job]));
    const batcher = new WriteBatcher({
      runSingle,
      runBatch: (jobs) => settleEach(jobs),
    });

    const p = batcher.submit(() => "async");
    expect(runSingle).not.toHaveBeenCalled();
    await expect(p).resolves.toBe("async");
    expect(runSingle).toHaveBeenCalledTimes(1);
  });
});
