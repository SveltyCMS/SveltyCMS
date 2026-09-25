/**
 * @file tests/unit/media/variant-job-scheduler.test.ts
 * @description Unit tests for the deferred variant job coalescer
 * (`variant-job-scheduler.server.ts`): single-flight per (tenant, hash),
 * FIFO + bounded concurrency, failure isolation, and inflight cleanup.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const pipelineMock = vi.hoisted(() => vi.fn());
const getFileMock = vi.hoisted(() => vi.fn());

vi.mock("@src/services/media/image-processor", () => ({
  processImageWithPresets: (...args: unknown[]) => pipelineMock(...args),
}));
vi.mock("@utils/media/media-storage.server", () => ({
  getFile: (...args: unknown[]) => getFileMock(...args),
}));
vi.mock("@utils/logger", () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

interface JobRecord {
  hash: string;
  callbacks: Array<(variants: unknown[]) => void>;
}

/** Capture each subscriber's callback completion for draining. */
function makeSubscriber(job: JobRecord) {
  const done = new Promise<void>((resolve) => {
    job.callbacks.push(() => resolve());
  });
  return {
    onVariants: async () => {
      job.callbacks[job.callbacks.length - 1]!();
    },
    done,
  };
}

describe("variant-job-scheduler", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getFileMock.mockResolvedValue(Buffer.from("img"));
    pipelineMock.mockResolvedValue([{ preset: "thumbnail" }]);
  });

  it("runs ONE pipeline for concurrent subscribers of the same (tenant, hash)", async () => {
    const { scheduleVariantJob } = await import("@src/utils/media/variant-job-scheduler.server");
    const jobs: JobRecord[] = Array.from({ length: 3 }, () => ({ hash: "h1", callbacks: [] }));

    for (const job of jobs) {
      const sub = makeSubscriber(job);
      scheduleVariantJob({
        hash: "h1",
        relPath: "t/h1.jpg",
        tenantId: "global",
        onVariants: sub.onVariants,
      });
    }

    await Promise.all(jobs.flatMap((j) => j.callbacks.map((cb) => cb())));
    expect(pipelineMock).toHaveBeenCalledTimes(1);
    expect(getFileMock).toHaveBeenCalledTimes(1);
  });

  it("keys single-flight by tenant: same hash under two tenants runs twice", async () => {
    const { scheduleVariantJob } = await import("@src/utils/media/variant-job-scheduler.server");
    const done: Array<() => void> = [];
    for (const tenantId of ["tenant-a", "tenant-b"]) {
      scheduleVariantJob({
        hash: "h2",
        relPath: "t/h2.jpg",
        tenantId,
        onVariants: async () => {
          done.shift()?.();
        },
      });
      done.push(() => {});
    }
    // Wait for both runs (poll bounded — no fixed sleeps).
    for (let i = 0; i < 200 && done.length > 0; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(pipelineMock).toHaveBeenCalledTimes(2);
  });

  it("caps concurrent pipelines at the lane limit and starts FIFO", async () => {
    const { scheduleVariantJob, pendingVariantJobs } =
      await import("@src/utils/media/variant-job-scheduler.server");

    let active = 0;
    let peak = 0;
    const started: string[] = [];
    const releases: Array<() => void> = [];
    pipelineMock.mockImplementation(async (_buf: unknown, hash: string) => {
      active++;
      peak = Math.max(peak, active);
      started.push(hash);
      await new Promise<void>((resolve) => releases.push(() => resolve()));
      active--;
      return [{ preset: "thumbnail" }];
    });

    const dones: Array<Promise<void>> = [];
    for (let i = 0; i < 5; i++) {
      const done = new Promise<void>((resolve) => {
        scheduleVariantJob({
          hash: `f${i}`,
          relPath: `t/f${i}.jpg`,
          tenantId: "global",
          onVariants: async () => resolve(),
        });
      });
      dones.push(done);
    }

    for (let i = 0; i < 200 && started.length < 2; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(started).toEqual(["f0", "f1"]); // FIFO start order
    expect(peak).toBeLessThanOrEqual(2);

    // Drain in waves and poll: releasing one pipeline only lets its lane claim
    // the next job after a multi-hop microtask chain, so a single yield is not
    // enough — release with yields, then wait on a timer so the settled check
    // cannot be starved by always-ready microtasks.
    for (let i = 0; i < 100; i++) {
      for (let spins = 0; spins < 10 && releases.length; spins++) {
        releases.splice(0).forEach((release) => release());
        await Promise.resolve();
      }
      const settled = await Promise.race([
        Promise.all(dones).then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10)),
      ]);
      if (settled) break;
    }
    await Promise.all(dones);
    expect(started).toEqual(["f0", "f1", "f2", "f3", "f4"]);
    expect(peak).toBe(2);
    expect(pendingVariantJobs()).toBe(0);
  });

  it("isolates a failed pipeline: subscribers resolve empty, later jobs still run", async () => {
    const { scheduleVariantJob } = await import("@src/utils/media/variant-job-scheduler.server");
    pipelineMock
      .mockRejectedValueOnce(new Error("decode failed"))
      .mockResolvedValueOnce([{ preset: "card" }]);

    const first: unknown[] = [];
    const firstDone = new Promise<void>((resolve) => {
      scheduleVariantJob({
        hash: "bad",
        relPath: "t/bad.jpg",
        tenantId: "global",
        onVariants: async (variants) => {
          first.push(...variants);
          resolve();
        },
      });
    });
    const second: unknown[] = [];
    const secondDone = new Promise<void>((resolve) => {
      scheduleVariantJob({
        hash: "good",
        relPath: "t/good.jpg",
        tenantId: "global",
        onVariants: async (variants) => {
          second.push(...variants);
          resolve();
        },
      });
    });

    await Promise.all([firstDone, secondDone]);
    expect(first).toEqual([]);
    expect(second).toEqual([{ preset: "card" }]);
  });

  it("cleans the inflight map so a re-schedule after completion re-runs", async () => {
    const { scheduleVariantJob, pendingVariantJobs } =
      await import("@src/utils/media/variant-job-scheduler.server");
    const runOnce = () =>
      new Promise<void>((resolve) => {
        scheduleVariantJob({
          hash: "r",
          relPath: "t/r.jpg",
          tenantId: "global",
          onVariants: async () => resolve(),
        });
      });

    await runOnce();
    expect(pendingVariantJobs()).toBe(0);
    await runOnce();
    expect(pipelineMock).toHaveBeenCalledTimes(2);
  });
});
