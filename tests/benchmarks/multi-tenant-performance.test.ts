/**
 * @file tests/benchmarks/multi-tenant-performance.test.ts
 * @description Multi-Tenant Performance Audit (Optimized)
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
  console.log(`🚀 Starting Enterprise Multi-Tenancy Audit (${TENANT_COUNT} tenants)...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    // Cache security variables outside hot iterations to prevent process.env lookup penalties
    const apiSecret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";

    // 1. Parallelize tenant provisioning to optimize database seed time
    console.log(`   → Pre-seeding ${TENANT_COUNT} tenants concurrently...`);
    const seedPromises = Array.from({ length: TENANT_COUNT }, (_, i) =>
      ensureStableTestData(undefined, `tenant-${i}`),
    );
    await Promise.all(seedPromises);

    await stabilize(1500);

    // 2. Baseline (Single Tenant)
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
            "x-test-secret": apiSecret,
          },
        });
        if (!res.ok) throw new Error(`Baseline failed: ${res.status}`);
        await res.arrayBuffer(); // Uniform network flushing
      },
    });

    // 3. Multi-Tenant Switching Evaluation
    console.log(`   → Measuring Multi-Tenant Context Switching...`);

    // Pre-calculate tenant strings to keep allocations out of the execution time window
    const tenantLookups = Array.from(
      { length: ITERATIONS },
      (_, i) => `tenant-${i % TENANT_COUNT}`,
    );

    const multi = await runBenchmark({
      name: "Multi-Tenant Context Switching",
      iterations: ITERATIONS,
      warmupIterations: 120,
      runs: 2,
      concurrency: CONCURRENCY,
      silent: true,
      onIteration: async (i: number) => {
        const tenantId = tenantLookups[i] ?? `tenant-0`;
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable?limit=5`, {
          headers: {
            "x-test-mode": "true",
            "x-test-secret": apiSecret,
            "x-tenant-id": tenantId,
          },
        });

        if (!res.ok) throw new Error(`Multi-tenant request failed: ${res.status}`);
        await res.arrayBuffer();
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
