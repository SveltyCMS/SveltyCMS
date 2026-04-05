/**
 * @file tests/benchmarks/benchmark-utils.ts
 * @description Centralized utility for professional performance benchmarking in SveltyCMS.
 * Provides high-resolution timing, statistical analysis (p95, p99), and throughput (RPS).
 */

import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  stdDev: number;
  rps: number;
  successCount: number;
  failureCount: number;
  timestamp: string;
}

export interface BenchmarkOptions {
  name: string;
  iterations: number;
  warmupIterations?: number;
  concurrency?: number;
  onIteration?: (i: number) => Promise<void> | void;
  onWarmup?: (i: number) => Promise<void> | void;
}

/**
 * Runs a professional benchmark with warmup, concurrency support, and statistical analysis.
 */
export async function runBenchmark(options: BenchmarkOptions): Promise<BenchmarkResult> {
  const {
    name,
    iterations,
    warmupIterations = Math.floor(iterations * 0.1),
    concurrency = 1,
    onIteration,
    onWarmup,
  } = options;

  console.log(`\n🚀 BENCHMARK: ${name}`);
  console.log(
    `   Iterations: ${iterations} | Concurrency: ${concurrency} | Warmup: ${warmupIterations}`,
  );

  // --- 1. Warmup Phase ---
  if (warmupIterations > 0 && onWarmup) {
    process.stdout.write(`   🔥 Warming up... `);
    await executePool(concurrency, warmupIterations, onWarmup);
    process.stdout.write(`Done.\n`);
  } else if (warmupIterations > 0 && onIteration) {
    process.stdout.write(`   🔥 Warming up... `);
    await executePool(concurrency, warmupIterations, onIteration);
    process.stdout.write(`Done.\n`);
  }

  // --- 2. Measurement Phase ---
  const latencies: number[] = [];
  let successCount = 0;
  let failureCount = 0;

  console.log(`   🧪 Measuring...`);
  const startTotal = performance.now();

  await executePool(concurrency, iterations, async (i) => {
    const start = performance.now();
    try {
      if (onIteration) await onIteration(i);
      const end = performance.now();
      latencies.push(end - start);
      successCount++;
    } catch {
      failureCount++;
    }
  });

  const endTotal = performance.now();
  const totalMs = endTotal - startTotal;

  // --- 3. Statistical Analysis ---
  latencies.sort((a, b) => a - b);
  const avgMs = latencies.reduce((a, b) => a + b, 0) / latencies.length || 0;
  const minMs = latencies[0] || 0;
  const maxMs = latencies[latencies.length - 1] || 0;
  const p50Ms = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95Ms = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99Ms = latencies[Math.floor(latencies.length * 0.99)] || 0;

  // Standard Deviation
  const squareDiffs = latencies.map((value) => Math.pow(value - avgMs, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length || 0;
  const stdDev = Math.sqrt(avgSquareDiff);

  const rps = (successCount / totalMs) * 1000;

  const result: BenchmarkResult = {
    name,
    iterations,
    totalMs,
    avgMs,
    minMs,
    maxMs,
    p50Ms,
    p95Ms,
    p99Ms,
    stdDev,
    rps,
    successCount,
    failureCount,
    timestamp: new Date().toISOString(),
  };

  printReport(result);
  return result;
}

/**
 * Internal helper for concurrent execution.
 */
async function executePool(
  concurrency: number,
  total: number,
  fn: (i: number) => Promise<void> | void,
) {
  const executing = new Set<Promise<void>>();
  for (let i = 0; i < total; i++) {
    const p = Promise.resolve().then(() => fn(i));
    executing.add(p);
    p.finally(() => executing.delete(p));
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

/**
 * Beautifully formats and prints the benchmark report to terminal.
 */
function printReport(r: BenchmarkResult) {
  const table = [
    {
      Metric: "Average Latency",
      Value: `${r.avgMs.toFixed(4)} ms (${(r.avgMs * 1000).toFixed(2)} µs)`,
    },
    { Metric: "p50 (Median)", Value: `${r.p50Ms.toFixed(4)} ms` },
    { Metric: "p95 Latency", Value: `${r.p95Ms.toFixed(4)} ms` },
    { Metric: "p99 Latency", Value: `${r.p99Ms.toFixed(4)} ms` },
    { Metric: "Min / Max", Value: `${r.minMs.toFixed(4)} / ${r.maxMs.toFixed(4)} ms` },
    { Metric: "Std Deviation", Value: `${r.stdDev.toFixed(4)} ms` },
    { Metric: "Throughput", Value: `${r.rps.toFixed(2)} req/sec` },
    {
      Metric: "Success Rate",
      Value: `${((r.successCount / r.iterations) * 100).toFixed(2)}% (${r.successCount}/${r.iterations})`,
    },
  ];

  console.table(table);
  console.log(`🏁 Total time: ${r.totalMs.toFixed(2)} ms\n`);
}

/**
 * Exports results to a JSON file for documentation integration.
 */
export function exportResult(result: BenchmarkResult, filename?: string) {
  const dir = process.env.RESULTS_DIR || path.join(process.cwd(), "tests/benchmarks/results");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const sanitizedName = result.name
    .toLowerCase()
    .replace(/[:\\/]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  const name = filename || `${sanitizedName}.json`;
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
  console.log(`💾 Results exported to: ${filePath}`);
}
