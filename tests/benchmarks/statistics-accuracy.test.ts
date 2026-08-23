/**
 * @file tests/benchmarks/statistics-accuracy.test.ts
 * @description Verifies the accuracy fixes in computeStatistics:
 * - p95/p99/min/max read from RAW data (tail latency stays visible)
 * - mean uses IQR-trimmed data (robust central tendency)
 * - CI uses t-distribution for small samples
 */

import { test, expect, computeStatistics } from "./modules/benchmark-utils";

function makeTimes(n: number, base: number, jitter: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(base + (i % 7) * jitter);
  return out;
}

test("p95/p99/max expose tail outliers instead of trimming them away", () => {
  // 700 clean samples around 2ms…
  const times = makeTimes(700, 2, 0.1);
  // …plus 60 genuine tail spikes (GC pause class) at 20-40ms — that is >5% of
  // the sample, so p95/p99/max must all land in the tail region.
  for (let i = 0; i < 60; i++) times.push(20 + i);

  const stats = computeStatistics(times, 500, { name: "tail", trimOutliers: "iqr" });

  // Mean is robust (IQR-trimmed) — outliers must NOT drag it up.
  expect(stats.avgMs).toBeLessThan(8);
  // But the tail must still be visible in the percentiles.
  expect(stats.p95Ms).toBeGreaterThan(10);
  expect(stats.p99Ms).toBeGreaterThan(15);
  expect(stats.maxMs).toBeGreaterThanOrEqual(79);
  // Trimming happened for the mean (some outliers removed) — reported honestly.
  expect(stats.trimmedCount).toBeGreaterThan(0);
});

test("all-identical samples report exact values", () => {
  const times = Array.from({ length: 100 }, () => 1.5);
  const stats = computeStatistics(times, 1000, { name: "flat" });
  expect(stats.avgMs).toBe(1.5);
  expect(stats.p50Ms).toBe(1.5);
  expect(stats.p95Ms).toBe(1.5);
  expect(stats.minMs).toBe(1.5);
  expect(stats.maxMs).toBe(1.5);
  expect(stats.cv).toBe(0);
  expect(stats.ci95MarginMs).toBe(0);
});

test("small samples use a wider t-distribution CI", () => {
  // 5 samples with spread → t(4) = 2.776 must widen the margin vs z = 1.96.
  const times = [2, 2.2, 2.4, 2.6, 2.8];
  const stats = computeStatistics(times, 100, { name: "small" });

  // Expected: stdDev of those 5 values, SEM * 2.776.
  const avg = 2.4;
  const variance = times.reduce((s, t) => s + (t - avg) ** 2, 0) / 5;
  const stdDev = Math.sqrt(variance);
  const sem = stdDev / Math.sqrt(5);
  const tMargin = 2.776 * sem;
  const zMargin = 1.96 * sem;

  expect(stats.ci95MarginMs).toBeCloseTo(tMargin, 3);
  expect(stats.ci95MarginMs).toBeGreaterThan(zMargin);
});
