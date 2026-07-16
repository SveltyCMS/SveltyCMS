/**
 * @file src/utils/list-query-metrics.ts
 * @description
 * Lightweight in-process metrics for admin list queries (latency + cache hits).
 * Used by CollectionService and other list loaders to support "fast CMS" claims
 * with measured data.
 *
 * ### Hardening (audit 2026-07):
 * - O(1) circular ring buffer: pre-allocated, head-pointer overwrite (no O(n) shift)
 * - Single-pass aggregation: replaces .filter().map().reduce() chain (3 passes → 1)
 * - Float64Array sorting: hardware-accelerated, no custom comparator needed
 * - Clock drift guard: Math.max(0, durationMs) prevents NaN/negative rollup corruption
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

// O(1) circular ring buffer — pre-allocated, no shift re-indexing
const samples = Array.from<ListQuerySample>({ length: MAX_SAMPLES });
let head = 0;
let count = 0;

export function recordListQuery(sample: Omit<ListQuerySample, "at">): ListQuerySample {
  const full: ListQuerySample = { ...sample, at: Date.now() };
  samples[head] = full;
  head = (head + 1) % MAX_SAMPLES;
  if (count < MAX_SAMPLES) count++;
  return full;
}

export function getListQuerySamples(source?: string): ListQuerySample[] {
  const result: ListQuerySample[] = [];

  for (let i = 0; i < count; i++) {
    const idx = count < MAX_SAMPLES ? i : (head + i) % MAX_SAMPLES;
    const s = samples[idx];
    if (!source || s.source === source) {
      result.push(s);
    }
  }

  return result;
}

export function summarizeListQueryMetrics(source?: string): {
  count: number;
  hitRate: number;
  p50Ms: number;
  p95Ms: number;
  avgMs: number;
} {
  const list = getListQuerySamples(source);
  const n = list.length;

  if (n === 0) {
    return { count: 0, hitRate: 0, p50Ms: 0, p95Ms: 0, avgMs: 0 };
  }

  let hits = 0;
  let sum = 0;
  const durations = new Float64Array(n);

  // Single pass: count hits, sum durations, populate typed array
  for (let i = 0; i < n; i++) {
    const s = list[i];
    if (s.cache === "hit" || s.cache === "swr") hits++;
    const d = Math.max(0, s.durationMs || 0);
    sum += d;
    durations[i] = d;
  }

  durations.sort();

  const getPercentile = (p: number) => {
    const idx = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
    return durations[idx];
  };

  return {
    count: n,
    hitRate: hits / n,
    p50Ms: Math.round(getPercentile(50) * 100) / 100,
    p95Ms: Math.round(getPercentile(95) * 100) / 100,
    avgMs: Math.round((sum / n) * 100) / 100,
  };
}

export function clearListQueryMetrics(): void {
  head = 0;
  count = 0;
}
