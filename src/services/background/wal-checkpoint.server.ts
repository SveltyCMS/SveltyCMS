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
 * - **force** (the server has been busy for `forceAfterMs` without an idle window) →
 *   checkpoint anyway: one bounded stall beats an unbounded WAL on a never-idle server.
 * - otherwise do nothing — `PASSIVE` never blocks readers or writers, and a no-op call is
 *   microseconds.
 *
 * Ships behind `SVELTY_WAL_CHECKPOINT=1` together with `SQLITE_WAL_AUTOCHECKPOINT=0`; the
 * auto-checkpoint stays the default until a deployment opts in.
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
  reason: "idle" | "force" | "interval" | "busy";
}

/**
 * Whether to checkpoint on this tick. Pure so the policy is unit-tested without timers:
 * `interval` suppresses churn after a recent run, `idle` is the preferred moment,
 * `force` bounds the WAL when the server never goes idle.
 */
export function decideWalCheckpoint(input: {
  idle: boolean;
  msSinceLastRun: number;
  msBusySinceIdle: number;
  minIntervalMs: number;
  forceAfterMs: number;
}): WalCheckpointDecision {
  if (input.msSinceLastRun < input.minIntervalMs) return { run: false, reason: "interval" };
  if (input.idle) return { run: true, reason: "idle" };
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
    });
    if (!decision.run) return;

    lastRunAt = at;
    // Reset the busy window too: without this a forced checkpoint re-fires on every tick
    // once `forceAfterMs` has elapsed (a stall every interval instead of one per window).
    idleSince = at;
    const result = options.checkpoint("PASSIVE");
    if (!result.success) {
      logger.debug(`[WAL] checkpoint (${decision.reason}) did not complete`);
    } else if (decision.reason === "force" || result.frames > 0) {
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
