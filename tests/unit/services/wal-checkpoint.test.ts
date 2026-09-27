/**
 * @file tests/unit/services/wal-checkpoint.test.ts
 * @description Contract tests for the scheduled WAL checkpoint.
 *
 * Why these exist: the 2026-09-27 A/B (`docs/project/achievements-2026.mdx` §3.35) showed
 * that SQLite's auto-checkpoint was the source of every >10 ms write stall (p50 0.108 ms →
 * max 17.4 ms, zero stalls with `SQLITE_WAL_AUTOCHECKPOINT=0`). Moving it off the request
 * path is only safe if the policy is exact, so both halves are pinned here: the pure
 * decision (`decideWalCheckpoint`) and the scheduler that applies it — including the
 * force-path that keeps a never-idle server from growing the WAL without bound.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decideWalCheckpoint,
  startWalCheckpointScheduler,
  type WalCheckpointResult,
} from "@src/services/background/wal-checkpoint.server";

const OK: WalCheckpointResult = { success: true, frames: 0, busy: false };

describe("decideWalCheckpoint — policy", () => {
  const base = {
    idle: true,
    msSinceLastRun: 10_000,
    msBusySinceIdle: 0,
    minIntervalMs: 5_000,
    forceAfterMs: 60_000,
  };

  it("checkpoints when idle and the minimum interval has passed", () => {
    expect(decideWalCheckpoint(base)).toEqual({ run: true, reason: "idle" });
  });

  it("does not checkpoint twice inside the minimum interval", () => {
    expect(decideWalCheckpoint({ ...base, msSinceLastRun: 4_999 })).toEqual({
      run: false,
      reason: "interval",
    });
  });

  it("waits while the server is busy inside the force window", () => {
    expect(decideWalCheckpoint({ ...base, idle: false, msBusySinceIdle: 30_000 })).toEqual({
      run: false,
      reason: "busy",
    });
  });

  it("forces a checkpoint once the server has been busy past the window", () => {
    // The safety valve: one bounded stall beats an unbounded WAL.
    expect(decideWalCheckpoint({ ...base, idle: false, msBusySinceIdle: 60_000 })).toEqual({
      run: true,
      reason: "force",
    });
  });

  it("prefers the idle reason over force when both apply", () => {
    expect(decideWalCheckpoint({ ...base, idle: true, msBusySinceIdle: 120_000 }).reason).toBe(
      "idle",
    );
  });
});

describe("startWalCheckpointScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs on idle ticks, skips busy ones, and stops on request", () => {
    vi.useFakeTimers();
    let idle = true;
    const calls: string[] = [];
    const stop = startWalCheckpointScheduler({
      checkpoint: () => {
        calls.push("checkpoint");
        return OK;
      },
      isIdle: () => idle,
      intervalMs: 1_000,
      minIntervalMs: 1_000,
      forceAfterMs: 60_000,
    });

    vi.advanceTimersByTime(1_000);
    expect(calls).toHaveLength(1);

    idle = false;
    vi.advanceTimersByTime(5_000);
    expect(calls).toHaveLength(1); // busy → nothing runs, however long it stays busy

    idle = true;
    vi.advanceTimersByTime(1_000);
    expect(calls).toHaveLength(2);

    stop();
    vi.advanceTimersByTime(10_000);
    expect(calls).toHaveLength(2);
  });

  it("forces a checkpoint when the server never goes idle", () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const stop = startWalCheckpointScheduler({
      checkpoint: () => {
        calls.push("checkpoint");
        return OK;
      },
      isIdle: () => false,
      intervalMs: 1_000,
      minIntervalMs: 1_000,
      forceAfterMs: 3_000,
    });

    vi.advanceTimersByTime(9_000);
    stop();

    // Ticks at 1s (busy), 2s (busy), 3s (force), then again every 3s of continuous busy.
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.length).toBeLessThanOrEqual(4);
  });

  it("reports a failed checkpoint without throwing", () => {
    vi.useFakeTimers();
    const onRun = vi.fn();
    const stop = startWalCheckpointScheduler({
      checkpoint: () => ({ success: false, frames: -1, busy: true }),
      isIdle: () => true,
      intervalMs: 1_000,
      onRun,
    });

    vi.advanceTimersByTime(1_000);
    stop();

    expect(onRun).toHaveBeenCalledWith({ success: false, frames: -1, busy: true }, "idle");
  });
});
