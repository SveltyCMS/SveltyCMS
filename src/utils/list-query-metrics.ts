/**
 * @file src/utils/list-query-metrics.ts
 * @description
 * Lightweight in-process metrics for admin list queries (latency + cache hits).
 * Used by CollectionService and other list loaders to support “fast CMS” claims
 * with measured data — not marketing absolutes.
 *
 * ### Features:
 * - ring buffer of recent samples
 * - p50/p95 helpers
 * - structured log-friendly snapshots
 */

export interface ListQuerySample {
  at: number;
  source: string;
  durationMs: number;
  cache: "hit" | "miss" | "bypass" | "swr";
  collectionId?: string;
  rowCount?: number;
  queryHash?: string;
}

const MAX_SAMPLES = 200;
const samples: ListQuerySample[] = [];

export function recordListQuery(sample: Omit<ListQuerySample, "at">): ListQuerySample {
  const full: ListQuerySample = { ...sample, at: Date.now() };
  samples.push(full);
  if (samples.length > MAX_SAMPLES) samples.shift();
  return full;
}

export function getListQuerySamples(source?: string): ListQuerySample[] {
  if (!source) return [...samples];
  return samples.filter((s) => s.source === source);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function summarizeListQueryMetrics(source?: string): {
  count: number;
  hitRate: number;
  p50Ms: number;
  p95Ms: number;
  avgMs: number;
} {
  const list = getListQuerySamples(source);
  if (list.length === 0) {
    return { count: 0, hitRate: 0, p50Ms: 0, p95Ms: 0, avgMs: 0 };
  }
  const hits = list.filter((s) => s.cache === "hit" || s.cache === "swr").length;
  const durations = list.map((s) => s.durationMs).sort((a, b) => a - b);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  return {
    count: list.length,
    hitRate: hits / list.length,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    avgMs: Math.round(avg * 100) / 100,
  };
}

/** Clear buffer (tests only). */
export function clearListQueryMetrics(): void {
  samples.length = 0;
}
