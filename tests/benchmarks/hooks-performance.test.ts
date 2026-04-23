/**
 * @file tests/benchmarks/hooks-performance.test.ts
 * @description Enterprise hooks performance benchmark for SveltyCMS.
 */
import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, printAuditTable } from "./benchmark-utils";

test("Hooks Performance Trace", async () => {
  console.log("🚀 Starting Hooks Performance Benchmark...\n");

  const ITERATIONS = 1500;
  const WARMUP = 150;
  const results: any[] = [];

  // 1. System Hooks (Internal)
  await (async () => {
    console.log("   → System Hooks (Internal)");
    const r = await runBenchmark({
      name: "System Hooks",
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: 1,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        // Placeholder for hook execution
        await new Promise((resolve) => setTimeout(resolve, 1));
      },
    });
    results.push(r);
  })();

  // 2. Plugin Hooks (External)
  await (async () => {
    console.log("   → Plugin Hooks (External)");
    const r = await runBenchmark({
      name: "Plugin Hooks",
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: 1,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        // Placeholder for hook execution
        await new Promise((resolve) => setTimeout(resolve, 1));
      },
    });
    results.push(r);
  })();

  printAuditTable({
    title: "SVELTYCMS  —  HOOKS PERFORMANCE AUDIT",
    subtitle: "Internal vs Plugin Hook Latency",
    results,
  });

  console.log("\n✅ Hooks benchmark completed.");
}, 300000);
