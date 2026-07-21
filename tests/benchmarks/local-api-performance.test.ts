/**
 * @file tests/benchmarks/local-api-performance.test.ts
 * @description Local API Performance Benchmark (Optimized)
 * @summary Measures LocalCMS SDK overhead vs direct adapter calls to verify zero-tax dispatching
 *
 * ### Features:
 * - Direct adapter baseline latency
 * - LocalCMS SDK proxy overhead comparison
 * - Hot-swap self-overwriting getter verification
 */

import { test, runBenchmark, getDbType, printTruthTable } from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { LocalCMS } from "@src/services/sdk";
import { ensureFullInitialization, getDb } from "@src/databases/db";

async function runLocalApiBenchmark() {
  console.log(`🚀 Starting Local API Performance Audit (${getDbType().toUpperCase()})...\n`);

  try {
    // Retry init — under multi-DB matrix the previous suite may leave pools half-closed
    let adapter: ReturnType<typeof getDb> = null;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await ensureFullInitialization();
        adapter = getDb();
        if (adapter) {
          const probe = await adapter.auth.getUserCount();
          if (probe?.success !== false) break;
        }
      } catch (e) {
        lastErr = e;
        adapter = null;
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    if (!adapter) {
      throw new Error(
        `Database not initialized after retries: ${lastErr instanceof Error ? lastErr.message : lastErr}`,
      );
    }

    const cms = new LocalCMS(adapter);

    // Warm up namespaces to ensure fair "hot" code execution comparison
    await (cms.auth as any).getUserCount();

    const results = [];
    // Matrix mode: shorter runs avoid double-pool exhaustion vs shared server
    const matrix = process.env.BENCHMARK_MATRIX === "1";
    const ITERATION_COUNT = matrix ? 2000 : 10000;
    const WARMUP_COUNT = matrix ? 100 : 500;

    // 1. Baseline: Direct Adapter Call
    console.log("   → Measuring Direct Adapter (Baseline)...");
    const baselineResult = await runBenchmark({
      name: "Direct Adapter Call",
      iterations: ITERATION_COUNT,
      warmupIterations: WARMUP_COUNT,
      runs: 3,
      concurrency: 1, // Must remain serial to avoid race noise in direct memory lookups
      silent: true,
      onIteration: async () => {
        const res = await adapter.auth.getUserCount();
        if (!res.success) throw new Error("DB call failed");
      },
    });
    results.push({ ...baselineResult, layer: "DB", shortLabel: "Baseline" });

    // Hoist the namespace reference to measure the method invocation tax
    // separately from the property resolution trap lookup overhead.
    const targetSdkNamespace = cms.auth as any;

    // 2. Current LocalCMS (Proxy-based or Overwriting Getter)
    console.log("   → Measuring LocalCMS SDK (Current Proxy)...");
    const sdkResult = await runBenchmark({
      name: "LocalCMS SDK Call",
      iterations: ITERATION_COUNT,
      warmupIterations: WARMUP_COUNT,
      runs: 3,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        // Direct execution measures the dispatch tax without dynamic allocation noise
        const res = await targetSdkNamespace.getUserCount();
        if (!res.success) throw new Error("SDK call failed");
      },
    });
    results.push({ ...sdkResult, layer: "SDK", shortLabel: "Current" });

    printTruthTable({
      title: "SVELTYCMS — SDK OVERHEAD TELEMETRY",
      shortLabel: "SDK",
      subtitle: `Internal Dispatcher Latency • ${getDbType().toUpperCase()}`,
      results,
    });

    const baselineAvg = Math.max(baselineResult.avgMs, 0.0001);
    const overhead = ((sdkResult.avgMs - baselineAvg) / baselineAvg) * 100;
    console.log(`\n📊 SDK Middleware Tax: ${overhead.toFixed(2)}%`);
  } catch (err: any) {
    console.error("Benchmark failed:", err);
    throw err;
  }
}

test("Local API Performance Audit", async () => {
  await runLocalApiBenchmark();
}, 60000);
