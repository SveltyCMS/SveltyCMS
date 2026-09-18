/**
 * @file src/utils/heap-pressure.ts
 * @description Single cached V8 heap ratio for load-shedding.
 * Used by handle-security and the rate-limit heap circuit — not two formulas.
 */

import v8 from "node:v8";

const SAMPLE_MS = 100;

let lastRatio = 0;
let lastAt = 0;

/** used_heap_size / heap_size_limit, sampled at most every 100ms. */
export function getHeapUsedRatio(): number {
  const now = Date.now();
  if (now - lastAt > SAMPLE_MS) {
    const stats = v8.getHeapStatistics();
    const limit = stats.heap_size_limit;
    lastRatio = limit > 0 ? stats.used_heap_size / limit : 0;
    lastAt = now;
  }
  return lastRatio;
}

export function isHeapCritical(threshold: number): boolean {
  return getHeapUsedRatio() >= threshold;
}
