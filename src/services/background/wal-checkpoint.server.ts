/**
 * @file src/services/background/wal-checkpoint.server.ts
 * @description Scheduled WAL checkpoints — housekeeping moved out of the request path.
 *
 * ## Why this exists
 * The 2026-09-27 interleaved A/B (`docs/project/achievements-2026.mdx` §3.35) put every
 * >10 ms write statement in SQLite's **auto-checkpoint**: `db:upd:stmt` p50 0.108 ms but
 * max 17.4 ms, with **zero** stalls under `SQLITE_WAL_AUTOCHECKPOINT=0` or
 * `SQLITE_SYNCHRONOUS=OFF`, and *bigger* stalls when the checkpoint threshold was raised
 * (cost scales with the WAL). A checkpoint is a synchronous call that blocks the event
 * loop for its whole duration, so the fix is not a faster checkpoint — it is running it
 * when nobody is waiting.
 *
 * ## Policy (deliberately simple, and testable)
 * - **idle** (no in-flight requests, `minIntervalMs` since the last run) → checkpoint now.
 * - **size** (the WAL exceeded `maxWalBytes`) → checkpoint PASSIVE even while busy; a
 *   never-idle server cannot grow the log without bound.
 * - **force** (the server has been busy for `forceAfterMs` without an idle window) →
 *   checkpoint anyway: one bounded stall beats an unbounded WAL on a never-idle server.
 * - otherwise do nothing — `PASSIVE` never blocks readers or writers, and a no-op call is
 *   microseconds.
 *
 * Since 2026-10-06 this runs by default for SQLite, paired with `wal_autocheckpoint=0`;
 * opt out with `SVELTY_WAL_CHECKPOINT=0` (and restore auto-checkpointing with
 * `SQLITE_WAL_AUTOCHECKPOINT=<pages>`).
 */

import { logger } from "@utils/logger";

export interface WalCheckpointResult {
  success: boolean;
  /** WAL frames still uncheckpointed after the call (0 = fully caught up). */
  frames: number;
  busy: boolean;
}

export interface WalCheckpointDecision {
  run: boolean;
  reason: "idle" | "size" | "force" | "interval" | "busy";
}

/**
 * Default WAL-size cap (64 MB ≈ 8192 × 8 KB frames). Above it the scheduler
 * checkpoints PASSIVE even while the server never goes idle.
 */
export const DEFAULT_MAX_WAL_BYTES = 64 * 1024 * 1024;

/**
 * Whether to checkpoint on this tick. Pure so the policy is unit-tested without timers:
 * `interval` suppresses churn after a recent run, `idle` is the preferred moment,
 * `size` bounds the WAL on a busy server, `force` bounds it by time.
 */
export function decideWalCheckpoint(input: {
  idle: boolean;
  msSinceLastRun: number;
  msBusySinceIdle: number;
  minIntervalMs: number;
  forceAfterMs: number;
  /** Current WAL size in bytes — omit to disable the size cap. */
  walBytes?: number;
  /** Hard WAL-size cap in bytes; `0`/omitted disables the size cap. */
  maxWalBytes?: number;
}): WalCheckpointDecision {
  if (input.msSinceLastRun < input.minIntervalMs) return { run: false, reason: "interval" };
  if (input.idle) return { run: true, reason: "idle" };
  if (
    input.walBytes !== undefined &&
    input.maxWalBytes !== undefined &&
    input.maxWalBytes > 0 &&
    input.walBytes > input.maxWalBytes
  ) {
    return { run: true, reason: "size" };
  }
  if (input.msBusySinceIdle >= input.forceAfterMs) return { run: true, reason: "force" };
  return { run: false, reason: "busy" };
}

export interface WalCheckpointSchedulerOptions {
  /** The adapter call — narrowed structurally so this module stays adapter-agnostic. */
  checkpoint: (mode: "PASSIVE") => WalCheckpointResult;
  /** True when nothing is in flight (`hooks.server.ts` owns the counter). */
  isIdle: () => boolean;
  /** Tick period (default 5 s). */
  intervalMs?: number;
  /** Minimum gap between runs (default 5 s). */
  minIntervalMs?: number;
  /** Run even under load after this long without an idle window (default 60 s). */
  forceAfterMs?: number;
  /** Current WAL size in bytes — enables the size cap when provided. */
  walSizeBytes?: () => number;
  /** Hard WAL-size cap in bytes (default `DEFAULT_MAX_WAL_BYTES`). */
  maxWalBytes?: number;
  onRun?: (result: WalCheckpointResult, reason: WalCheckpointDecision["reason"]) => void;
  /** Injectable clock (tests). */
  now?: () => number;
}

/**
 * Start the scheduler. Returns a stop function; the timer is `unref`'d so it can never
 * hold the process open (the same contract as the cache re-warm and behavioral timers).
 */
export function startWalCheckpointScheduler(options: WalCheckpointSchedulerOptions): () => void {
  const intervalMs = options.intervalMs ?? 5_000;
  const minIntervalMs = options.minIntervalMs ?? intervalMs;
  const forceAfterMs = options.forceAfterMs ?? 60_000;
  const maxWalBytes = options.maxWalBytes ?? DEFAULT_MAX_WAL_BYTES;
  const now = options.now ?? Date.now;

  let lastRunAt = now();
  let idleSince = now();
  let stopped = false;

  const timer = setInterval(() => {
    if (stopped) return;
    const at = now();
    const idle = options.isIdle();
    if (idle) idleSince = at;

    const decision = decideWalCheckpoint({
      idle,
      msSinceLastRun: at - lastRunAt,
      msBusySinceIdle: at - idleSince,
      minIntervalMs,
      forceAfterMs,
      walBytes: options.walSizeBytes?.(),
      maxWalBytes,
    });
    if (!decision.run) return;

    lastRunAt = at;
    // Reset the busy window too: without this a forced checkpoint re-fires on every tick
    // once `forceAfterMs` has elapsed (a stall every interval instead of one per window).
    idleSince = at;
    const result = options.checkpoint("PASSIVE");
    if (!result.success) {
      logger.debug(`[WAL] checkpoint (${decision.reason}) did not complete`);
    } else if (decision.reason === "force" || decision.reason === "size" || result.frames > 0) {
      logger.debug(`[WAL] checkpoint (${decision.reason}): ${result.frames} frame(s) remaining`);
    }
    options.onRun?.(result, decision.reason);
  }, intervalMs);

  if (typeof timer.unref === "function") timer.unref();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
