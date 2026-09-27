/**
 * @file tests/unit/media/variant-job-scheduler.test.ts
 * @description Unit tests for the deferred variant job coalescer
 * (`variant-job-scheduler.server.ts`): single-flight per (tenant, hash),
 * FIFO + bounded concurrency, failure isolation, and inflight cleanup.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VariantJobRequest } from "@src/utils/media/variant-job-scheduler.server";

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

/** `DatabaseId` is a branded string; the scheduler only uses it as a map key here. */
type TenantId = VariantJobRequest["tenantId"];
const GLOBAL_TENANT = "global" as TenantId;

/**
 * Drain pending promise chains. `setImmediate` crosses a macrotask boundary,
 * which empties the whole microtask queue — unlike a single `await Promise.resolve()`
 * yield, which only advances one hop of the scheduler's multi-hop chain. The
 * scheduler never touches timers, so this cannot race.
 */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Schedule one job and resolve when its subscriber has been served. */
function scheduleAndAwait(
  scheduleVariantJob: (req: VariantJobRequest) => void,
  hash: string,
  received: unknown[][] = [],
  tenantId: TenantId = GLOBAL_TENANT,
): Promise<void> {
  return new Promise<void>((resolve) => {
    scheduleVariantJob({
      hash,
      relPath: `t/${hash}.jpg`,
      tenantId,
      onVariants: async (variants) => {
        received.push(variants);
        resolve();
      },
    });
  });
}

describe("variant-job-scheduler", () => {
  beforeEach(() => {
    vi.resetModules(); // module-level inflight/queue/lane state is process-wide
    vi.clearAllMocks();
    getFileMock.mockResolvedValue(Buffer.from("img"));
    pipelineMock.mockResolvedValue([{ preset: "thumbnail" }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs ONE pipeline for concurrent subscribers of the same (tenant, hash)", async () => {
    const { scheduleVariantJob } = await import("@src/utils/media/variant-job-scheduler.server");

    const received: unknown[][] = [];
    await Promise.all(
      Array.from({ length: 3 }, () => scheduleAndAwait(scheduleVariantJob, "h1", received)),
    );

    expect(pipelineMock).toHaveBeenCalledTimes(1);
    expect(getFileMock).toHaveBeenCalledTimes(1);
    // The single run's result reaches every subscriber, not just the first.
    expect(received).toEqual([
      [{ preset: "thumbnail" }],
      [{ preset: "thumbnail" }],
      [{ preset: "thumbnail" }],
    ]);
  });

  it("keys single-flight by tenant: same hash under two tenants runs twice", async () => {
    const { scheduleVariantJob } = await import("@src/utils/media/variant-job-scheduler.server");

    const received: unknown[][] = [];
    await Promise.all([
      scheduleAndAwait(scheduleVariantJob, "h2", received, "tenant-a" as TenantId),
      scheduleAndAwait(scheduleVariantJob, "h2", received, "tenant-b" as TenantId),
    ]);

    expect(pipelineMock).toHaveBeenCalledTimes(2);
    expect(received).toHaveLength(2);
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
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return [{ preset: "thumbnail" }];
    });

    let completed = 0;
    const dones: Array<Promise<void>> = [];
    for (let i = 0; i < 5; i++) {
      dones.push(
        new Promise<void>((resolve) => {
          scheduleVariantJob({
            hash: `f${i}`,
            relPath: `t/f${i}.jpg`,
            tenantId: GLOBAL_TENANT,
            onVariants: async () => {
              completed++;
              resolve();
            },
          });
        }),
      );
    }

    // Only a lane limit's worth of pipelines may start, and in FIFO order.
    for (let spins = 0; spins < 50 && started.length < 2; spins++) await flush();
    expect(started).toEqual(["f0", "f1"]);

    // Drain in waves: releasing a lane lets it claim the next queued job.
    for (let wave = 0; wave < 20 && completed < 5; wave++) {
      releases.splice(0).forEach((release) => release());
      await flush();
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
    const second: unknown[] = [];
    await Promise.all([
      new Promise<void>((resolve) => {
        scheduleVariantJob({
          hash: "bad",
          relPath: "t/bad.jpg",
          tenantId: GLOBAL_TENANT,
          onVariants: async (variants) => {
            first.push(...variants);
            resolve();
          },
        });
      }),
      new Promise<void>((resolve) => {
        scheduleVariantJob({
          hash: "good",
          relPath: "t/good.jpg",
          tenantId: GLOBAL_TENANT,
          onVariants: async (variants) => {
            second.push(...variants);
            resolve();
          },
        });
      }),
    ]);

    expect(first).toEqual([]);
    expect(second).toEqual([{ preset: "card" }]);
  });

  it("cleans the inflight map so a re-schedule after completion re-runs", async () => {
    const { scheduleVariantJob, pendingVariantJobs } =
      await import("@src/utils/media/variant-job-scheduler.server");

    await scheduleAndAwait(scheduleVariantJob, "r");
    expect(pendingVariantJobs()).toBe(0);

    await scheduleAndAwait(scheduleVariantJob, "r");
    expect(pipelineMock).toHaveBeenCalledTimes(2);
  });
});
