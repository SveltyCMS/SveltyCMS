/**
 * @file tests/benchmarks/local-api-performance.test.ts
 * @description Local API Performance Benchmark (Optimized)
 * @summary Measures LocalCMS SDK dispatch overhead vs direct adapter calls to verify zero-tax in-process performance.
 */

import {
  test,
  runBenchmark,
  getDbType,
  printTruthTable,
  printSummaryTable,
  exportResult,
  exportMetric,
  stabilize,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { LocalCMS } from "@src/services/sdk";
import { ensureFullInitialization, getDb } from "@src/databases/db";

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

async function runLocalApiBenchmark() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Local API Performance Audit (${dbType})...\n`);

  try {
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
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }

    if (!adapter) {
      throw new Error(
        `Database not initialized after retries: ${lastErr instanceof Error ? lastErr.message : lastErr}`,
      );
    }

    const cms = new LocalCMS(adapter);

    // Warm up namespaces and proxy traps
    await (cms.auth as any).getUserCount();

    const results = [];
    const matrix = process.env.BENCHMARK_MATRIX === "1";
    const ITERATION_COUNT = matrix ? 2000 : 8000;
    const WARMUP_COUNT = matrix ? 100 : 400;

    // ── 1. BASELINE: DIRECT ADAPTER CALL (ZERO SDK) ─────────────────────────
    forceGarbageCollection();
    await stabilize(100);

    console.log("   → Measuring Direct Adapter Baseline...");
    const baselineResult = await runBenchmark({
      name: "Direct Adapter Call",
      iterations: ITERATION_COUNT,
      warmupIterations: WARMUP_COUNT,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await adapter.auth.getUserCount();
        if (!res.success) throw new Error("Adapter call failed");
      },
    });
    results.push({ ...baselineResult, layer: "DB", shortLabel: "Adapter" });

    // ── 2. HOISTED SDK DISPATCH (METHOD WRAPPER OVERHEAD) ───────────────────
    const targetSdkNamespace = cms.auth as any;

    forceGarbageCollection();
    await stabilize(100);

    console.log("   → Measuring Hoisted LocalCMS Method Call...");
    const hoistedSdkResult = await runBenchmark({
      name: "LocalCMS Hoisted Call",
      iterations: ITERATION_COUNT,
      warmupIterations: WARMUP_COUNT,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await targetSdkNamespace.getUserCount();
        if (!res.success) throw new Error("Hoisted SDK call failed");
      },
    });
    results.push({ ...hoistedSdkResult, layer: "SDK", shortLabel: "Hoisted SDK" });

    // ── 3. FULL SDK ACCESS: PROPERTY TRAP / GETTER RESOLUTION ───────────────
    forceGarbageCollection();
    await stabilize(100);

    console.log("   → Measuring Full LocalCMS Getter / Proxy Traversal...");
    const fullSdkResult = await runBenchmark({
      name: "LocalCMS Full Property Path",
      iterations: ITERATION_COUNT,
      warmupIterations: WARMUP_COUNT,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await (cms.auth as any).getUserCount();
        if (!res.success) throw new Error("Full SDK property call failed");
      },
    });
    results.push({ ...fullSdkResult, layer: "SDK", shortLabel: "Full SDK" });

    // ── 4. STATISTICAL EVALUATION & TELEMETRY ───────────────────────────────
    const baselineAvg = Math.max(baselineResult.avgMs, 0.0001);
    const hoistedTaxPct = ((hoistedSdkResult.avgMs - baselineAvg) / baselineAvg) * 100;
    const fullTaxPct = ((fullSdkResult.avgMs - baselineAvg) / baselineAvg) * 100;
    const getterOverheadMs = Math.max(0, fullSdkResult.avgMs - hoistedSdkResult.avgMs);

    printTruthTable({
      title: "SVELTYCMS — SDK OVERHEAD TELEMETRY",
      shortLabel: "SDK",
      subtitle: `Internal Dispatcher vs Direct Adapter Latency • ${dbType}`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Direct Adapter Latency", val: baselineResult.avgMs.toFixed(3), unit: "ms" },
        { key: "Hoisted SDK Latency", val: hoistedSdkResult.avgMs.toFixed(3), unit: "ms" },
        { key: "Full Property SDK Latency", val: fullSdkResult.avgMs.toFixed(3), unit: "ms" },
        {
          key: "Method Wrapper Overhead",
          val: `${hoistedTaxPct >= 0 ? "+" : ""}${hoistedTaxPct.toFixed(2)}%`,
          unit: "",
        },
        {
          key: "Full SDK Dispatch Tax",
          val: `${fullTaxPct >= 0 ? "+" : ""}${fullTaxPct.toFixed(2)}%`,
          unit: "",
        },
        {
          key: "Getter / Proxy Traversal Cost",
          val: (getterOverheadMs * 1000).toFixed(2),
          unit: "µs",
        },
        {
          key: "Zero-Tax SLA Compliance",
          val: fullSdkResult.avgMs < 0.2 ? "PASSED (<0.2ms)" : "EVALUATE",
          unit: "",
        },
      ],
      "SDK Overhead Summary",
    );

    exportMetric("sdk.local.baseline_ms", baselineResult.avgMs, "ms");
    exportMetric("sdk.local.hoisted_ms", hoistedSdkResult.avgMs, "ms");
    exportMetric("sdk.local.full_ms", fullSdkResult.avgMs, "ms");
    exportMetric("sdk.local.tax_percent", fullTaxPct, "%");

    for (const r of results) exportResult(r);
  } catch (err: any) {
    console.error("Local API performance benchmark failed:", err);
    throw err;
  }
}

test("Local API Performance Audit", async () => {
  await runLocalApiBenchmark();
}, 60_000);
