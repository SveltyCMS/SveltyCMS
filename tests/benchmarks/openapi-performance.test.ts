/**
 * @file tests/benchmarks/openapi-performance.test.ts
 * @description OpenAPI Performance Audit (Optimized)
 * @summary Measures in-process dynamic OpenAPI spec generation, HTTP cold generation, and cached documentation endpoint performance.
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
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

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

async function runOpenApiAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Enterprise OpenAPI Audit (${dbType})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;
    const openApiUrl = `${baseUrl}/api/openapi.json`;

    await ensureStableTestData();
    await stabilize(1000);

    const baseHeaders: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
      connection: "keep-alive",
    };

    // ── 1. PRE-FLIGHT SPEC VALIDATION ────────────────────────────────────────
    console.log("🔍 Validating OpenAPI Schema & Endpoints...");
    const validationRes = await fetch(openApiUrl, {
      headers: baseHeaders,
      signal: AbortSignal.timeout(10_000),
    });

    if (validationRes.status !== 200) {
      throw new Error(`OpenAPI endpoint returned HTTP ${validationRes.status}`);
    }

    const spec = (await validationRes.json()) as any;
    if (!spec.openapi) {
      throw new Error("Invalid OpenAPI schema structure returned");
    }

    const pathCount = Object.keys(spec.paths || {}).length;
    const schemaCount = Object.keys(spec.components?.schemas || {}).length;
    console.log(
      `   → Spec Verified: OpenAPI ${spec.openapi} | ${pathCount} paths | ${schemaCount} schemas`,
    );

    const results: any[] = [];

    // ── 2. IN-PROCESS SPEC GENERATION (ZERO HTTP / PURE AST ENGINE) ──────────
    forceGarbageCollection();
    await stabilize(150);

    console.log("   → 1. Measuring In-Process Spec Generation (Pure AST Engine)...");
    const inProcessResult = await runBenchmark({
      name: "In-Process Spec Generation",
      iterations: 30,
      warmupIterations: 3,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        await apiSpecService.invalidateCache();
        const rawSpec = await apiSpecService.generateSpec();
        if (!rawSpec?.openapi) throw new Error("In-process spec generation failed");
      },
    });
    results.push({ ...inProcessResult, shortLabel: "In-Process", layer: "Core Engine" });

    // ── 3. HTTP COLD GENERATION (CACHE-BYPASSED DYNAMIC RECONSTRUCTION) ─────
    forceGarbageCollection();
    await stabilize(150);

    console.log("   → 2. Measuring HTTP Cold Spec Generation (Multi-Sample)...");
    const COLD_SAMPLES = 20;
    const coldTimes: number[] = [];

    for (let i = 0; i < COLD_SAMPLES; i++) {
      await apiSpecService.invalidateCache();

      const t0 = performance.now();
      const res = await fetch(openApiUrl, {
        headers: baseHeaders,
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) throw new Error(`OpenAPI cold fetch failed: HTTP ${res.status}`);
      await res.arrayBuffer().catch(() => {});
      coldTimes.push(performance.now() - t0);
    }

    const coldTotalMs = coldTimes.reduce((a, b) => a + b, 0);
    const coldResult = computeStatistics(coldTimes, COLD_SAMPLES / (coldTotalMs / 1000), {
      name: "HTTP Cold Generation",
      runs: 1,
      concurrency: 1,
    });
    results.push({ ...coldResult, shortLabel: "HTTP Cold", layer: "Generation" });

    // ── 4. WARM CACHED HIT (STEADY-STATE L1 RESPONSE) ────────────────────────
    forceGarbageCollection();
    await stabilize(150);

    console.log("   → 3. Measuring Warm Cached OpenAPI Endpoint Latency...");
    const warmResult = await runBenchmark({
      name: "Warm OpenAPI Hit (Cached)",
      iterations: 500,
      warmupIterations: 60,
      runs: 2,
      concurrency: 4,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(openApiUrl, {
          headers: baseHeaders,
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) throw new Error(`OpenAPI warm fetch failed: HTTP ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...warmResult, shortLabel: "HTTP Warm", layer: "Cached" });

    // ── 5. REPORTING & TELEMETRY ────────────────────────────────────────────
    const cacheSpeedup =
      coldResult.avgMs > 0
        ? (coldResult.avgMs / Math.max(warmResult.avgMs, 0.001)).toFixed(1)
        : "1.0";
    const transportTaxMs = Math.max(0, coldResult.avgMs - inProcessResult.avgMs);

    printTruthTable({
      title: "SVELTYCMS — OPENAPI SPEC GENERATION AUDIT",
      shortLabel: "OpenAPI",
      subtitle: `Dynamic Generation • In-Process vs HTTP • Caching • ${dbType}`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "API Specification Version", val: spec.openapi, unit: "" },
        {
          key: "Discovered Schema Endpoints",
          val: `${pathCount} paths (${schemaCount} schemas)`,
          unit: "",
        },
        { key: "In-Process Spec Build Latency", val: inProcessResult.avgMs.toFixed(2), unit: "ms" },
        { key: "HTTP Cold Generation Latency", val: coldResult.avgMs.toFixed(2), unit: "ms" },
        {
          key: "HTTP Cold p95",
          val: (coldResult.p95Ms || coldResult.avgMs).toFixed(2),
          unit: "ms",
        },
        { key: "HTTP Transport Overhead", val: `+${transportTaxMs.toFixed(2)}`, unit: "ms" },
        { key: "Warm Cached Latency (Avg)", val: warmResult.avgMs.toFixed(3), unit: "ms" },
        {
          key: "Warm Cached p95",
          val: (warmResult.p95Ms || warmResult.avgMs).toFixed(3),
          unit: "ms",
        },
        { key: "Cache Response Speedup", val: `${cacheSpeedup}×`, unit: "" },
        {
          key: "Cached Endpoint Throughput",
          val: Math.round(warmResult.rps || 0),
          unit: "req/s",
        },
        {
          key: "Spec Performance SLA",
          val: warmResult.avgMs < 2.0 && inProcessResult.avgMs < 25 ? "EXCELLENT" : "GOOD",
          unit: "",
        },
      ],
      "OpenAPI Performance Summary",
    );

    exportMetric("openapi.in_process_ms", inProcessResult.avgMs, "ms");
    exportMetric("openapi.cold_generation_ms", coldResult.avgMs, "ms");
    exportMetric("openapi.cold_generation_p95_ms", coldResult.p95Ms || coldResult.avgMs, "ms");
    exportMetric("openapi.warm_hit_ms", warmResult.avgMs, "ms");
    exportMetric("openapi.warm_hit_p95_ms", warmResult.p95Ms || warmResult.avgMs, "ms");
    exportMetric("openapi.cache_speedup", parseFloat(cacheSpeedup) || 1, "x");
    exportMetric("openapi.warm_throughput_rps", Math.round(warmResult.rps || 0), "req/s");

    for (const r of results) exportResult(r);
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
}, 480_000);
