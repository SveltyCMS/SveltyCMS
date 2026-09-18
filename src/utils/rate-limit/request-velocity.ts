/**
 * @file src/utils/rate-limit/request-velocity.ts
 * @description Per-key request-velocity tax (observation zone).
 *
 * If a client’s mutation rate rises sharply while still under the bucket cap,
 * each request costs more tokens. That is the original “predictive / bot”
 * signal — per identity, not a global clock histogram.
 *
 * Features:
 * - EMA of instantaneous req/s from inter-arrival time
 * - Bounded map (10k keys, FIFO eviction) — no PII (caller passes a hashed key)
 * - Admin callers skip this (hook must not call it for admin)
 */

const MAX_KEYS = 10_000;
const EMA_ALPHA = 0.3;
/** Sustained req/s at which cost doubles (mutations only in the caller). */
const WARN_RPS = 20;
/** Sustained req/s at which cost quadruples. */
const HOT_RPS = 50;

interface VelocityState {
  ema: number;
  lastMs: number;
  firstMs: number;
  samples: number;
}

const velocities = new Map<string, VelocityState>();

/** Need a short window of samples so a 2-request test/burst is not taxed. */
const MIN_SAMPLES = 8;
const MIN_WINDOW_MS = 2_000;

/**
 * Returns a token-cost multiplier ≥ 1 based on recent request spacing.
 * First samples are 1 (observation only). Never throws.
 */
export function velocityCostMultiplier(key: string, nowMs: number): number {
  if (!key) return 1;
  const prev = velocities.get(key);
  if (!prev) {
    if (velocities.size >= MAX_KEYS) {
      const oldest = velocities.keys().next().value;
      if (oldest !== undefined) velocities.delete(oldest);
    }
    velocities.set(key, { ema: 1, lastMs: nowMs, firstMs: nowMs, samples: 1 });
    return 1;
  }

  const dt = Math.max(1, nowMs - prev.lastMs);
  const inst = 1000 / dt;
  prev.ema = EMA_ALPHA * inst + (1 - EMA_ALPHA) * prev.ema;
  prev.lastMs = nowMs;
  prev.samples += 1;

  if (prev.samples < MIN_SAMPLES || nowMs - prev.firstMs < MIN_WINDOW_MS) return 1;
  if (prev.ema >= HOT_RPS) return 4;
  if (prev.ema >= WARN_RPS) return 2;
  return 1;
}

/** Test reset. */
export function _resetRequestVelocity(): void {
  velocities.clear();
}
