/**
 * @file src/utils/cpu-sample.ts
 * @description One process.cpuUsage() sampler for system-pressure and system-monitor.
 * Cached for 1s so two 5s pollers do not steal each other's delta.
 */

import os from "node:os";

function coreCount(): number {
  const n =
    typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, n);
}

let lastUsage = process.cpuUsage();
let lastMs = Date.now();
let cachedShare = 0;
let cachedAt = 0;

const CACHE_MS = 1000;

/** Process CPU share in [0, 1] over the last sample interval. */
export function sampleProcessCpuShare(): number {
  const now = Date.now();
  if (cachedAt > 0 && now - cachedAt < CACHE_MS) return cachedShare;

  const delta = process.cpuUsage(lastUsage);
  const elapsedMs = Math.max(1, now - lastMs);
  lastUsage = process.cpuUsage();
  lastMs = now;

  const available = elapsedMs * 1000 * coreCount();
  const used = delta.user + delta.system;
  cachedShare = available > 0 ? Math.min(1, used / available) : 0;
  cachedAt = now;
  return cachedShare;
}
