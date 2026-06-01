/**
 * @file tests/benchmarks/multi-tenant-performance.test.ts
 * @description Multi-Tenant Performance Audit
 * @summary Measures the overhead of tenant isolation, context switching, and data partitioning across many tenants.
 *
 * ### Features:
 * - Multi-tenant context switching latency
 * - Tenant isolation overhead measurement
 * - Cross-tenant data partitioning performance
 * - High tenant count scalability profiling
 */

import {
  test,
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

const TENANT_COUNT = 50;
const ITERATIONS = 1200;
const CONCURRENCY = 8;

let stopServer: (() => Promise<void>) | null = null;

async function runMultiTenantAudit() {
  // pre-existing unused var removed for TS strict mode
  console.log(`🚀 Starting Enterprise Multi-Tenancy Audit (${TENANT_COUNT} tenants)...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    // Pre-seed multiple tenants
    console.log(`   → Pre-seeding ${TENANT_COUNT} tenants...`);
    for (let i = 0; i < TENANT_COUNT; i++) {
      await ensureStableTestData(undefined, `tenant-${i}`);
    }

    await stabilize(1500);

    // Baseline (single tenant)
    console.log("   → Measuring Baseline (Single Tenant)...");
    const baseline = await runBenchmark({
      name: "Single Tenant Baseline",
      iterations: 600,
      warmupIterations: 80,
      runs: 2,
      concurrency: CONCURRENCY,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable?limit=5`, {
          headers: {
            "x-test-mode": "true",
            "x-test-secret": process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026",
          },
        });
        if (!res.ok) throw new Error(`Baseline failed: ${res.status}`);
        await res.json();
      },
    });

    // Multi-tenant switching
    console.log(`   → Measuring Multi-Tenant Context Switching...`);
    const multi = await runBenchmark({
      name: "Multi-Tenant Context Switching",
      iterations: ITERATIONS,
      warmupIterations: 120,
      runs: 2,
      concurrency: CONCURRENCY,
      silent: true,
      onIteration: async (i: number) => {
        const tenantId = `tenant-${i % TENANT_COUNT}`;
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable?limit=5`, {
          headers: {
            "x-test-mode": "true",
            "x-test-secret": process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026",
            "x-tenant-id": tenantId,
          },
        });

        if (!res.ok) throw new Error(`Multi-tenant request failed: ${res.status}`);
        await res.json();
      },
    });

    const overhead =
      baseline.avgMs > 0 ? ((multi.avgMs - baseline.avgMs) / baseline.avgMs) * 100 : 0;

    printTruthTable({
      title: "SVELTYCMS — MULTI-TENANCY PERFORMANCE AUDIT",
      shortLabel: "Multi-Tenant",
      subtitle: `${TENANT_COUNT} Tenants • Isolation Overhead • ${getDbType().toUpperCase()}`,
      results: [
        { ...baseline, shortLabel: "Single", layer: "Baseline" },
        {
          ...multi,
          shortLabel: "Multi",
          layer: "Full Stack",
          overheadPct: overhead,
        },
      ],
    });

    printSummaryTable([
      { key: "Single Tenant Latency", val: baseline.avgMs, unit: "ms" },
      { key: "Multi-Tenant Latency", val: multi.avgMs, unit: "ms" },
      { key: "Isolation Overhead", val: overhead.toFixed(2), unit: "%" },
      {
        key: "Scalability Rating",
        val: overhead < 12 ? "EXCELLENT" : overhead < 25 ? "GOOD" : "DEGRADED",
        unit: "",
      },
    ]);

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
}, 600000);
