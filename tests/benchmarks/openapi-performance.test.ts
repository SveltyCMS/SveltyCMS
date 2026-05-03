/**
 * @file tests/benchmarks/openapi-performance.test.ts
 * @description Enterprise OpenAPI benchmark for SveltyCMS.
 * Measures dynamic spec generation and cached documentation endpoint performance.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  TEST_API_SECRET,
} from "./benchmark-utils";
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
      headers: { "x-test-secret": TEST_API_SECRET },
    });

    if (validationRes.status !== 200) {
      throw new Error(`OpenAPI endpoint returned ${validationRes.status}`);
    }

    const spec = await validationRes.json();
    if (!spec.openapi) {
      throw new Error("Invalid OpenAPI response");
    }

    console.log(`   → Spec ready: ${spec.openapi} | ${Object.keys(spec.paths || {}).length} paths`);

    // Cold generation (cache miss)
    console.log("   → Measuring Cold Spec Generation...");
    await apiSpecService.invalidateCache();
    
    const coldResult = await runBenchmark({
      name: "Cold OpenAPI Generation",
      iterations: 1, // Only 1 iteration for true cold measurement
      warmupIterations: 0,
      runs: 1,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${baseUrl}/api/openapi.json`, {
          headers: { "x-test-secret": TEST_API_SECRET },
        });
        await res.text();
      },
    });

    // Warm cached hit
    console.log("   → Measuring Warm Cached Hit...");
    const warmResult = await runBenchmark({
      name: "Warm OpenAPI Hit (Cached)",
      iterations: 400,
      warmupIterations: 60,
      runs: 3,
      concurrency: 10,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${baseUrl}/api/openapi.json`, {
          headers: { "x-test-secret": TEST_API_SECRET },
        });
        await res.text();
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
      { key: "Peak Throughput", val: Math.round(warmResult.rps || 0), unit: "req/s" },
      { key: "Rating", val: speedup > 8 ? "EXCELLENT" : speedup > 4 ? "GOOD" : "FAIR", unit: "" },
    ]);

    exportResult(warmResult);

  } catch (err: any) {
    logger.error(`OpenAPI benchmark failed: ${err.message}`);
    console.error(err);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ OpenAPI audit completed.");
}

test("OpenAPI Enterprise Audit", async () => {
  await runOpenApiAudit();
}, 480000);
