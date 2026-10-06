/**
 * @file tests/unit/databases/wal-scheduling.test.ts
 * @description Unit tests for the scheduled WAL checkpoint policy (idle / size / force).
 *
 * Since 2026-10-06 SQLite ships with `wal_autocheckpoint=0` and an off-request-path
 * scheduler by default. That is only safe if the policy is exact, so the pure
 * `decideWalCheckpoint` decision is pinned here — including the WAL-size cap that
 * bounds a never-idle server — and the scheduler is exercised with an injected WAL
 * size / fake timers. No database or network boundary is touched.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decideWalCheckpoint,
  startWalCheckpointScheduler,
  DEFAULT_MAX_WAL_BYTES,
  type WalCheckpointResult,
} from "@src/services/background/wal-checkpoint.server";

const OK: WalCheckpointResult = { success: true, frames: 0, busy: false };

const base = {
  idle: false,
  msSinceLastRun: 10_000,
  msBusySinceIdle: 0,
  minIntervalMs: 5_000,
  forceAfterMs: 60_000,
};

describe("decideWalCheckpoint — WAL-size cap", () => {
  it("checkpoints once the WAL exceeds the cap while busy", () => {
    expect(decideWalCheckpoint({ ...base, walBytes: 65, maxWalBytes: 64 })).toEqual({
      run: true,
      reason: "size",
    });
  });

  it("stays on the busy path below the cap", () => {
    expect(decideWalCheckpoint({ ...base, walBytes: 32, maxWalBytes: 64 })).toEqual({
      run: false,
      reason: "busy",
    });
  });

  it("does not trigger exactly at the cap (strictly-greater bound)", () => {
    expect(decideWalCheckpoint({ ...base, walBytes: 64, maxWalBytes: 64 }).reason).toBe("busy");
  });

  it("disables the cap when maxWalBytes is 0 or omitted", () => {
    expect(decideWalCheckpoint({ ...base, walBytes: 1e12, maxWalBytes: 0 }).reason).toBe("busy");
    expect(decideWalCheckpoint({ ...base, walBytes: 1e12 }).reason).toBe("busy");
  });

  it("respects the minimum interval before the size cap fires", () => {
    expect(
      decideWalCheckpoint({ ...base, msSinceLastRun: 1, walBytes: 65, maxWalBytes: 64 }),
    ).toEqual({ run: false, reason: "interval" });
  });

  it("prefers idle over the size cap when both apply", () => {
    expect(decideWalCheckpoint({ ...base, idle: true, walBytes: 65, maxWalBytes: 64 }).reason).toBe(
      "idle",
    );
  });
});

describe("startWalCheckpointScheduler — WAL-size cap", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("checkpoints under sustained load once the WAL exceeds the default cap", () => {
    vi.useFakeTimers();
    const reasons: string[] = [];
    const stop = startWalCheckpointScheduler({
      checkpoint: () => OK,
      isIdle: () => false,
      walSizeBytes: () => DEFAULT_MAX_WAL_BYTES + 1,
      intervalMs: 1_000,
      minIntervalMs: 1_000,
      // Force window deliberately longer than the test so only the size cap can fire.
      forceAfterMs: 10 * 60_000,
      onRun: (_result, reason) => reasons.push(reason),
    });

    vi.advanceTimersByTime(1_000);
    stop();

    expect(reasons).toEqual(["size"]);
  });

  it("stays idle under load when the WAL is under the cap", () => {
    vi.useFakeTimers();
    const checkpoint = vi.fn(() => OK);
    const stop = startWalCheckpointScheduler({
      checkpoint,
      isIdle: () => false,
      walSizeBytes: () => DEFAULT_MAX_WAL_BYTES - 1,
      intervalMs: 1_000,
      minIntervalMs: 1_000,
      forceAfterMs: 10 * 60_000,
    });

    vi.advanceTimersByTime(5_000);
    stop();

    expect(checkpoint).not.toHaveBeenCalled();
  });

  it("honours an explicit maxWalBytes override", () => {
    vi.useFakeTimers();
    const onRun = vi.fn();
    const stop = startWalCheckpointScheduler({
      checkpoint: () => OK,
      isIdle: () => false,
      walSizeBytes: () => 1_024,
      maxWalBytes: 512,
      intervalMs: 1_000,
      minIntervalMs: 1_000,
      forceAfterMs: 10 * 60_000,
      onRun,
    });

    vi.advanceTimersByTime(1_000);
    stop();

    expect(onRun).toHaveBeenCalledWith(OK, "size");
  });
});
