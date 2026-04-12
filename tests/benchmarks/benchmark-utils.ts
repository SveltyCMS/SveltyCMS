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
  concurrency?: number; // 1 = pure latency, >1 = throughput under load
  runs?: number; // NEW: multiple independent runs for stability
  useNanoseconds?: boolean; // NEW: Bun-optimized timing
  trimOutliers?: boolean; // NEW: trim 2% extremes
  onIteration: (i: number) => Promise<void> | void;
  onWarmup?: (i: number) => Promise<void> | void;
  silent?: boolean;
}

/**
 * Force GC and stabilize (Bun + Node compatible)
 */
async function stabilize() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true); // full synchronous GC
  } else if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
  // Small yield to let event loop settle
  await new Promise((r) => setTimeout(r, 10));
}

/**
 * Runs a professional benchmark with multiple runs, warmup, and statistical analysis.
 */
export async function runBenchmark(options: BenchmarkOptions): Promise<BenchmarkResult> {
  const {
    name,
    iterations,
    warmupIterations = Math.floor(iterations * 0.15),
    concurrency = 1,
    runs = 1,
    useNanoseconds = typeof Bun !== "undefined",
    trimOutliers = true,
    onIteration,
    onWarmup,
    silent = false,
  } = options;

  if (!silent) {
    console.log(`\n🚀 BENCHMARK: ${name} (${runs} run${runs > 1 ? "s" : ""})`);
    console.log(
      `   Iterations: ${iterations} | Concurrency: ${concurrency} | Warmup: ${warmupIterations}`,
    );
  }

  const allResults: BenchmarkResult[] = [];

  for (let run = 1; run <= runs; run++) {
    if (runs > 1 && !silent) console.log(`   Run ${run}/${runs}...`);

    // Warmup (always serial)
    if (warmupIterations > 0) {
      const warmupFn = onWarmup || onIteration;
      if (!silent) process.stdout.write(`   🔥 Warming up... `);
      await executePool(1, warmupIterations, warmupFn);
      if (!silent) process.stdout.write(`Done.\n`);
      await stabilize();
    }

    // Measurement
    const latencies: number[] = [];
    let successCount = 0;
    let failureCount = 0;

    const getTime = useNanoseconds
      ? () => Number((Bun as any).nanoseconds()) / 1_000_000 // to ms
      : () => performance.now();

    const startTotal = getTime();

    await executePool(concurrency, iterations, async (i) => {
      const start = getTime();
      try {
        await onIteration(i);
        const end = getTime();
        latencies.push(end - start);
        successCount++;
      } catch (e) {
        if (failureCount === 0 && !silent) console.error("Benchmark error:", e);
        failureCount++;
      }
    });

    const endTotal = getTime();
    const totalMs = endTotal - startTotal;

    // Statistical processing
    latencies.sort((a, b) => a - b);

    let processedLatencies = latencies;
    if (trimOutliers && latencies.length > 20) {
      const trim = Math.floor(latencies.length * 0.02);
      processedLatencies = latencies.slice(trim, latencies.length - trim);
    }

    const avgMs = processedLatencies.reduce((a, b) => a + b, 0) / processedLatencies.length || 0;
    const minMs = processedLatencies[0] || 0;
    const maxMs = processedLatencies[processedLatencies.length - 1] || 0;
    const p50Ms = processedLatencies[Math.floor(processedLatencies.length * 0.5)] || 0;
    const p95Ms = processedLatencies[Math.floor(processedLatencies.length * 0.95)] || 0;
    const p99Ms = processedLatencies[Math.floor(processedLatencies.length * 0.99)] || 0;

    // StdDev
    const squareDiffs = processedLatencies.map((v) => Math.pow(v - avgMs, 2));
    const stdDev = Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length || 0);

    const rps = (successCount / totalMs) * 1000;

    const result: BenchmarkResult = {
      name: runs > 1 ? `${name} (run ${run})` : name,
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

    allResults.push(result);
    if (!silent) printReport(result);

    await stabilize();
  }

  // If multiple runs, compute aggregate
  if (runs > 1) {
    const aggregate = computeAggregate(allResults, name);
    if (!silent) {
      console.log(`\n📊 AGGREGATE across ${runs} runs:`);
      printReport(aggregate);
    }
    return aggregate;
  }

  if (allResults[0].successCount === 0 && iterations > 0) {
    throw new Error(`Benchmark '${name}' failed: 0 successful out of ${iterations} iterations.`);
  }

  return allResults[0];
}

/**
 * Simple aggregate helper for multiple runs.
 */
function computeAggregate(results: BenchmarkResult[], name: string): BenchmarkResult {
  const count = results.length;
  const avgMs = results.reduce((sum, r) => sum + r.avgMs, 0) / count;
  const totalMs = results.reduce((sum, r) => sum + r.totalMs, 0) / count;
  const p50Ms = results.reduce((sum, r) => sum + r.p50Ms, 0) / count;
  const p95Ms = results.reduce((sum, r) => sum + r.p95Ms, 0) / count;
  const p99Ms = results.reduce((sum, r) => sum + r.p99Ms, 0) / count;
  const rps = results.reduce((sum, r) => sum + r.rps, 0) / count;
  const successCount = Math.round(results.reduce((sum, r) => sum + r.successCount, 0) / count);
  const failureCount = Math.round(results.reduce((sum, r) => sum + r.failureCount, 0) / count);

  return {
    ...results[0],
    name: `${name} (aggregate)`,
    avgMs,
    totalMs,
    p50Ms,
    p95Ms,
    p99Ms,
    rps,
    successCount,
    failureCount,
  };
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
  // Skip log in silent mode or when exporting from a suite
}

/**
 * Generates a comprehensive Markdown report from a suite of benchmark results.
 */
export function generateMarkdownReport(
  suiteName: string,
  results: BenchmarkResult[],
  filename = "PERFORMANCE_REPORT.md",
) {
  const dir = process.env.RESULTS_DIR || path.join(process.cwd(), "tests/benchmarks/results");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toLocaleString();
  let md = `# 🚀 SveltyCMS Performance Report: ${suiteName}\n\n`;
  md += `**Generated:** ${timestamp}\n\n`;

  md += `## 📊 Resolver Performance Matrix\n\n`;
  md += `| Query Name | Avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | RPS | Success |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  for (const r of results) {
    const successRate = ((r.successCount / r.iterations) * 100).toFixed(1);
    md += `| ${r.name} | ${r.avgMs.toFixed(2)} | ${r.p50Ms.toFixed(2)} | ${r.p95Ms.toFixed(2)} | ${r.p99Ms.toFixed(2)} | ${r.rps.toFixed(2)} | ${successRate}% |\n`;
  }

  md += `\n## 🔍 Statistical Breakdown\n\n`;
  for (const r of results) {
    md += `### ${r.name}\n`;
    md += `- **Iterations:** ${r.iterations}\n`;
    md += `- **Min / Max:** ${r.minMs.toFixed(4)} / ${r.maxMs.toFixed(4)} ms\n`;
    md += `- **Std Deviation:** ${r.stdDev.toFixed(4)} ms\n`;
    md += `- **Total Time:** ${r.totalMs.toFixed(2)} ms\n\n`;
  }

  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, md);
  console.log(`\n📄 Markdown report generated: ${filePath}`);
}
