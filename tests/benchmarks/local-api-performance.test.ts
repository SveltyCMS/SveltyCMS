/**
 * @file tests/benchmarks/local-api-performance.test.ts
 * @description Benchmark to measure SDK overhead (LocalCMS) vs direct adapter calls.
 */

import { test, runBenchmark, getDbType, printTruthTable } from "./benchmark-utils";
import "../unit/bun-preload.ts";
import { LocalCMS } from "@src/services/sdk";
import { ensureFullInitialization, getDb } from "@src/databases/db";

async function runLocalApiBenchmark() {
  console.log(`🚀 Starting Local API Performance Audit (${getDbType().toUpperCase()})...\n`);

  try {
    await ensureFullInitialization();
    const adapter = getDb();
    if (!adapter) throw new Error("Database not initialized");

    const cms = new LocalCMS(adapter);

    // Ensure namespaces are warmed up for a fair "hot" comparison
    await (cms.auth as any).getUserCount();

    const results = [];

    // 1. Baseline: Direct Adapter Call
    console.log("   → Measuring Direct Adapter (Baseline)...");
    const baselineResult = await runBenchmark({
      name: "Direct Adapter Call",
      iterations: 10000,
      warmupIterations: 500,
      runs: 3,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        const res = await adapter.auth.getUserCount();
        if (!res.success) throw new Error("DB call failed");
      },
    });
    results.push({ ...baselineResult, layer: "DB", shortLabel: "Baseline" });

    // 2. Current LocalCMS (Proxy-based)
    console.log("   → Measuring LocalCMS SDK (Current Proxy)...");
    const sdkResult = await runBenchmark({
      name: "LocalCMS SDK Call",
      iterations: 10000,
      warmupIterations: 500,
      runs: 3,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        // This goes through the Proxy -> getInstance() -> await -> apply
        const res = await (cms.auth as any).getUserCount();
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

    const overhead = ((sdkResult.avgMs - baselineResult.avgMs) / baselineResult.avgMs) * 100;
    console.log(`\n📊 SDK Middleware Tax: ${overhead.toFixed(2)}%`);
  } catch (err: any) {
    console.error("Benchmark failed:", err);

    throw err;
  }
}

test("Local API Performance Audit", async () => {
  await runLocalApiBenchmark();
}, 60000);
