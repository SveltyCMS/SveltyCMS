/**
 * @file tests/benchmarks/multi-tenant-performance.test.ts
 * @description Multi-Tenant Performance Audit (Optimized)
 * @summary Measures the overhead of tenant isolation, context switching, and data partitioning across many tenants.
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

const TENANT_COUNT = 50;
const ITERATIONS = 1200;
const CONCURRENCY = 8;

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

async function runMultiTenantAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(
    `🚀 Starting Enterprise Multi-Tenancy Audit (${TENANT_COUNT} tenants • ${CONCURRENCY}c • ${dbType})...\n`,
  );

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;
    const collectionEndpoint = `${baseUrl}/api/collections/BenchmarkStable?limit=5`;

    const rawAuth = benchmarkAuthHeaders();

    // ── 1. CONCURRENT TENANT PROVISIONING ───────────────────────────────────
    console.log(`   → Pre-seeding ${TENANT_COUNT} tenants concurrently...`);
    const seedPromises = Array.from({ length: TENANT_COUNT }, (_, i) =>
      ensureStableTestData(undefined, `tenant-${i}`),
    );
    await Promise.all(seedPromises);

    await stabilize(1000);

    // Pre-allocated static header records per tenant to eliminate runtime spread allocations
    const singleTenantHeaders: Record<string, string> = {
      "content-type": "application/json",
      ...rawAuth,
      connection: "keep-alive",
      "x-tenant-id": "global",
    };

    const tenantHeadersMap: Record<string, string>[] = Array.from(
      { length: TENANT_COUNT },
      (_, i) => ({
        "content-type": "application/json",
        ...rawAuth,
        connection: "keep-alive",
        "x-tenant-id": `tenant-${i}`,
      }),
    );

    // ── 2. BASELINE: SINGLE TENANT REPEATED QUERY ───────────────────────────
    forceGarbageCollection();
    await stabilize(200);

    console.log("   → 1. Measuring Single Tenant Baseline...");
    const baseline = await runBenchmark({
      name: "Single Tenant Baseline",
      iterations: 600,
      warmupIterations: 80,
      runs: 2,
      concurrency: CONCURRENCY,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(collectionEndpoint, {
          method: "GET",
          headers: singleTenantHeaders,
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) throw new Error(`Baseline failed: HTTP ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });

    // ── 3. MULTI-TENANT CONTEXT SWITCHING EVALUATION ────────────────────────
    forceGarbageCollection();
    await stabilize(200);

    console.log(
      `   → 2. Measuring Dynamic Multi-Tenant Context Switching (${TENANT_COUNT} tenants)...`,
    );
    let tenantCursor = 0;

    const multi = await runBenchmark({
      name: "Multi-Tenant Context Switching",
      iterations: ITERATIONS,
      warmupIterations: 120,
      runs: 2,
      concurrency: CONCURRENCY,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const headers = tenantHeadersMap[tenantCursor++ % TENANT_COUNT]!;

        const res = await fetch(collectionEndpoint, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) throw new Error(`Multi-tenant request failed: HTTP ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });

    // ── 4. STATISTICAL EVALUATION & TELEMETRY ───────────────────────────────
    const baselineAvg = Math.max(baseline.avgMs, 0.001);
    const overheadMs = Math.max(0, multi.avgMs - baseline.avgMs);
    const overheadPct = ((multi.avgMs - baselineAvg) / baselineAvg) * 100;

    const results = [
      { ...baseline, shortLabel: "Single Tenant", layer: "Baseline" },
      {
        ...multi,
        shortLabel: "Multi-Tenant Switching",
        layer: "Multi-Tenant",
        overheadPct,
      },
    ];

    printTruthTable({
      title: "SVELTYCMS — MULTI-TENANCY PERFORMANCE AUDIT",
      shortLabel: "Multi-Tenant",
      subtitle: `${TENANT_COUNT} Tenants • Isolation Overhead • ${dbType}`,
      results,
    });

    const isScaleOptimal = overheadPct < 15;

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Active Tenant Space", val: TENANT_COUNT, unit: "tenants" },
        { key: "Single Tenant Latency (Avg)", val: baseline.avgMs.toFixed(2), unit: "ms" },
        {
          key: "Single Tenant p95",
          val: (baseline.p95Ms || baseline.avgMs).toFixed(2),
          unit: "ms",
        },
        { key: "Multi-Tenant Latency (Avg)", val: multi.avgMs.toFixed(2), unit: "ms" },
        { key: "Multi-Tenant p95", val: (multi.p95Ms || multi.avgMs).toFixed(2), unit: "ms" },
        {
          key: "Context Switching Overhead",
          val: `+${overheadMs.toFixed(2)} ms (${overheadPct >= 0 ? "+" : ""}${overheadPct.toFixed(2)}%)`,
          unit: "",
        },
        { key: "Multi-Tenant Throughput", val: Math.round(multi.rps || 0), unit: "req/s" },
        { key: "Memory RSS Growth", val: (multi.rssDelta || 0).toFixed(1), unit: "MB" },
        {
          key: "Scalability Rating",
          val: isScaleOptimal
            ? "EXCELLENT (<15% overhead)"
            : overheadPct < 30
              ? "GOOD"
              : "DEGRADED",
          unit: "",
        },
      ],
      "Multi-Tenancy Summary",
    );

    exportMetric("multitenant.baseline_avg_ms", baseline.avgMs, "ms");
    exportMetric("multitenant.baseline_p95_ms", baseline.p95Ms || baseline.avgMs, "ms");
    exportMetric("multitenant.multi_avg_ms", multi.avgMs, "ms");
    exportMetric("multitenant.multi_p95_ms", multi.p95Ms || multi.avgMs, "ms");
    exportMetric("multitenant.overhead_pct", parseFloat(overheadPct.toFixed(2)), "%");
    exportMetric("multitenant.overhead_ms", parseFloat(overheadMs.toFixed(3)), "ms");
    exportMetric("multitenant.throughput_rps", Math.round(multi.rps || 0), "req/s");

    exportResult(multi);
  } catch (err: any) {
    logger.error(`Multi-tenancy benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Multi-Tenancy Enterprise Audit", async () => {
  await runMultiTenantAudit();
}, 600_000);
