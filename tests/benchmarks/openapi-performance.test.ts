/**
 * @file tests/benchmarks/openapi-performance.test.ts
 * @description OpenAPI Performance Audit (Optimized)
 * @summary Measures dynamic OpenAPI spec generation speed and cached documentation endpoint performance.
 *
 * ### Features:
 * - Dynamic spec generation latency profiling (True multi-sample cold validation)
 * - Cached endpoint response measurement
 * - Spec size impact on generation time
 * - SDK-ready output validation
 */

import {
  test,
  runBenchmark,
  exportResult,
  computeStatistics,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { apiSpecService } from "@src/services/system/api-spec-service";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runOpenApiAudit() {
  console.log("🚀 Starting Enterprise OpenAPI Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(1000);

    // Validate endpoint
    console.log("🔍 Validating OpenAPI endpoint...");
    const validationRes = await fetch(`${baseUrl}/api/openapi.json`, {
      headers: { ...benchmarkAuthHeaders() },
    });

    if (validationRes.status !== 200) {
      throw new Error(`OpenAPI endpoint returned ${validationRes.status}`);
    }

    const spec = await validationRes.json();
    if (!spec.openapi) {
      throw new Error("Invalid OpenAPI response");
    }

    console.log(`   → Spec ready: ${spec.openapi} | ${Object.keys(spec.paths || {}).length} paths`);

    // Dynamic Generation (Cache Miss Baseline)
    console.log("   → Measuring Cold Spec Generation (Multi-Sample)...");
    // 🛡️ HONEST COLD: invalidate BEFORE the timed span. The old code called
    // apiSpecService.invalidateCache() inside onIteration, so the measured
    // "cold" time included the invalidation call itself.
    const coldTimes: number[] = [];
    for (let i = 0; i < 15; i++) {
      await apiSpecService.invalidateCache();
      const t0 = performance.now();
      const res = await fetch(`${baseUrl}/api/openapi.json`, {
        headers: { ...benchmarkAuthHeaders() },
      });
      if (!res.ok) throw new Error(`OpenAPI cold fetch failed: ${res.status}`);
      await res.arrayBuffer();
      coldTimes.push(performance.now() - t0);
    }
    const coldResult = computeStatistics(
      coldTimes,
      coldTimes.length / (coldTimes.reduce((a, b) => a + b, 0) / 1000),
      { name: "Cold OpenAPI Generation", runs: 1, concurrency: 1 },
    );

    // Warm cached hit
    console.log("   → Measuring Warm Cached Hit...");
    const warmResult = await runBenchmark({
      name: "Warm OpenAPI Hit (Cached)",
      iterations: 400,
      warmupIterations: 60,
      runs: 3,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${baseUrl}/api/openapi.json`, {
          headers: { ...benchmarkAuthHeaders() },
        });
        await res.arrayBuffer();
      },
    });

    const speedup = coldResult.avgMs > 0 ? coldResult.avgMs / warmResult.avgMs : 0;

    printTruthTable({
      title: "SVELTYCMS — OPENAPI SPEC GENERATION AUDIT",
      shortLabel: "OpenAPI",
      subtitle: `Dynamic Generation • Caching • ${getDbType().toUpperCase()}`,
      results: [
        { ...coldResult, shortLabel: "Cold", layer: "Generation" },
        { ...warmResult, shortLabel: "Warm", layer: "Cached" },
      ],
    });

    printSummaryTable([
      { key: "Cold Generation", val: coldResult.avgMs, unit: "ms" },
      { key: "Warm Cached Hit", val: warmResult.avgMs, unit: "ms" },
      { key: "Cache Speedup", val: speedup.toFixed(1), unit: "x" },
      {
        key: "Peak Throughput",
        val: Math.round(warmResult.rps || 0),
        unit: "req/s",
      },
      {
        key: "Rating",
        val: speedup > 4 || warmResult.avgMs < 2.0 ? "EXCELLENT" : speedup > 2 ? "GOOD" : "FAIR",
        unit: "",
      },
    ]);

    exportResult(warmResult);
  } catch (err: any) {
    logger.error(`OpenAPI benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("OpenAPI Enterprise Audit", async () => {
  await runOpenApiAudit();
}, 480000);
