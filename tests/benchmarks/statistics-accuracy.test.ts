/**
 * @file tests/benchmarks/statistics-accuracy.test.ts
 * @description Verifies mathematical correctness and statistical accuracy in computeStatistics:
 * - p95/p99/min/max computed on un-trimmed RAW dataset (tail latency preserved)
 * - Mean and standard error use robust IQR trimming to prevent outlier skew
 * - Small samples ($N < 30$) utilize Student's t-distribution critical values with Bessel's correction ($N-1$)
 * - Boundary handling for degenerate distributions (zero variance, bimodal, single element, microsecond scale)
 */

import { test, expect, computeStatistics } from "./modules/benchmark-utils";

function makeTimes(n: number, base: number, jitter: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(base + (i % 7) * jitter);
  return out;
}

// ── 1. TAIL LATENCY PRESERVATION VS IQR MEAN ROBUSTNESS ─────────────────────
test("p95/p99/max expose tail outliers instead of trimming them away", () => {
  // 700 clean samples around 2ms (2.0 to 2.6ms)
  const times = makeTimes(700, 2, 0.1);

  // 60 tail spikes (20ms to 79ms) > 7.8% of sample
  for (let i = 0; i < 60; i++) times.push(20 + i);

  const stats = computeStatistics(times, 500, { name: "tail", trimOutliers: "iqr" });

  // 1. Mean must remain robust (IQR-trimmed central tendency)
  expect(stats.avgMs).toBeLessThan(3.5);
  expect(stats.avgMs).toBeGreaterThan(2.0);

  // 2. Percentiles must be computed on raw un-trimmed distribution
  expect(stats.p50Ms).toBeLessThan(3.0);
  expect(stats.p95Ms).toBeGreaterThan(20);
  expect(stats.p99Ms).toBeGreaterThan(60);
  expect(stats.maxMs).toBe(79);
  expect(stats.minMs).toBe(2);

  // 3. Trimmed count must report isolated outlier observations
  expect(stats.trimmedCount).toBeGreaterThanOrEqual(60);
});

// ── 2. ZERO-VARIANCE DEGENERATE DISTRIBUTIONS ────────────────────────────────
test("all-identical samples report exact zero-variance metrics", () => {
  const times = Array.from({ length: 100 }, () => 1.5);
  const stats = computeStatistics(times, 1000, { name: "flat" });

  expect(stats.avgMs).toBe(1.5);
  expect(stats.p50Ms).toBe(1.5);
  expect(stats.p95Ms).toBe(1.5);
  expect(stats.p99Ms).toBe(1.5);
  expect(stats.minMs).toBe(1.5);
  expect(stats.maxMs).toBe(1.5);
  expect(stats.cv).toBe(0);
  expect(stats.stdDevMs ?? 0).toBe(0);
  expect(stats.ci95MarginMs).toBe(0);
  expect(stats.trimmedCount).toBe(0);
});

// ── 3. SMALL-SAMPLE STUDENT'S T-DISTRIBUTION CI CORRECTION ──────────────────
test("small samples (N=5) use t-distribution with Bessel-corrected sample variance", () => {
  // 5 samples: mean = 2.4
  const times = [2.0, 2.2, 2.4, 2.6, 2.8];
  const stats = computeStatistics(times, 100, { name: "small_sample" });

  const n = times.length;
  const avg = 2.4;

  // Unbiased sample variance using Bessel's correction: s^2 = 1/(N-1) * sum((x - avg)^2)
  const sampleVariance = times.reduce((s, t) => s + (t - avg) ** 2, 0) / (n - 1);
  const sampleStdDev = Math.sqrt(sampleVariance);
  const sem = sampleStdDev / Math.sqrt(n);

  // Two-tailed t-critical value for df = 4 at 95% confidence = 2.776
  const tCritical = 2.776;
  const expectedTMargin = tCritical * sem;
  const standardZMargin = 1.96 * sem;

  expect(stats.avgMs).toBeCloseTo(avg, 4);
  expect(stats.ci95MarginMs).toBeCloseTo(expectedTMargin, 3);
  expect(stats.ci95MarginMs).toBeGreaterThan(standardZMargin);
});

// ── 4. MICROSECOND RESOLUTION (SUB-0.1ms BENCHMARK ACCURACY) ────────────────
test("handles sub-millisecond microsecond-scale latency without precision loss", () => {
  // Microsecond array (0.012ms to 0.018ms)
  const times = [0.012, 0.013, 0.014, 0.015, 0.016, 0.017, 0.018];
  const stats = computeStatistics(times, 50000, { name: "micro_latencies" });

  expect(stats.avgMs).toBeCloseTo(0.015, 4);
  expect(stats.minMs).toBe(0.012);
  expect(stats.maxMs).toBe(0.018);
  expect(stats.p50Ms).toBe(0.015);
  expect(stats.cv).toBeGreaterThan(0);
  expect(stats.cv).toBeLessThan(100);
});

// ── 5. BIMODAL & ASYMMETRIC HEAVY TAIL SEPARATION ───────────────────────────
test("distinguishes bimodal clusters without clipping primary mode", () => {
  // Cluster A (Fast path / L1 cache hit): 900 samples at ~1.0ms
  const clusterA = makeTimes(900, 1.0, 0.02);
  // Cluster B (Slow path / DB query): 100 samples at ~10.0ms
  const clusterB = makeTimes(100, 10.0, 0.05);
  const combined = [...clusterA, ...clusterB];

  const stats = computeStatistics(combined, 1000, { name: "bimodal", trimOutliers: "iqr" });

  // Median represents primary mode
  expect(stats.p50Ms).toBeCloseTo(1.06, 1);
  // Tail latencies expose secondary cluster
  expect(stats.p95Ms).toBeGreaterThan(9.0);
  expect(stats.p99Ms).toBeGreaterThan(9.5);
  expect(stats.maxMs).toBeGreaterThan(10.0);
});

// ── 6. SINGLE-ELEMENT & BOUNDARY SAFETY ──────────────────────────────────────
test("single-sample and empty arrays resolve gracefully without NaN", () => {
  const single = computeStatistics([5.2], 100, { name: "single" });
  expect(single.avgMs).toBe(5.2);
  expect(single.p50Ms).toBe(5.2);
  expect(single.p95Ms).toBe(5.2);
  expect(single.minMs).toBe(5.2);
  expect(single.maxMs).toBe(5.2);
  expect(single.ci95MarginMs).toBe(0);
  expect(single.cv).toBe(0);

  const empty = computeStatistics([], 0, { name: "empty" });
  expect(empty.avgMs).toBe(0);
  expect(empty.p50Ms).toBe(0);
  expect(empty.minMs).toBe(0);
  expect(empty.maxMs).toBe(0);
  expect(empty.ci95MarginMs).toBe(0);
});
