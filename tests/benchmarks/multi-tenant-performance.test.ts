/**
 * @file tests/benchmarks/multi-tenant-performance.test.ts
 * @description Enterprise multi-tenancy benchmark for SveltyCMS.
 * Measures the overhead of tenant isolation and context switching across 50 simulated tenants.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  printTruthTable,
  printSummaryTable,
  setupBenchmarkServer,
  ensureStableTestData,
  STABLE_COLLECTION,
  TEST_API_SECRET,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

const TENANT_COUNT = 50;
const ITERATIONS = 1000;
const CONCURRENCY = 8;

let server: any;

async function runMultiTenantAudit() {
  console.log(`🚀 Starting Enterprise Multi-Tenancy Audit (${TENANT_COUNT} tenants)...\n`);

  const originalLogLevel = logger.level;
  logger.level = "silent";

  try {
    // 1. Setup Server & Data
    server = await setupBenchmarkServer();
    const baseUrl = server.baseUrl;

    console.log(`📊 Seeding data for ${TENANT_COUNT} tenants...`);
    for (let i = 0; i < TENANT_COUNT; i++) {
      const tenantId = `tenant-${i}`;
      await ensureStableTestData(null, tenantId);
    }

    const onIteration = async (i: number) => {
      const tenantId = `tenant-${i % TENANT_COUNT}`;
      // Use hostname-based tenant detection for full pipeline realism
      const tenantUrl = baseUrl.replace("127.0.0.1", `${tenantId}.localhost`);

      const res = await fetch(tenantUrl + `/api/collections/${STABLE_COLLECTION}?limit=5`, {
        headers: {
          "x-test-secret": TEST_API_SECRET,
        },
      });

      if (res.status >= 400) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
    };

    // 2. Measure Baseline (Global/Default Tenant)
    console.log("   → Measuring Baseline (Single Tenant)...");
    const baseline = await runBenchmark({
      name: "Single Tenant (Baseline)",
      iterations: 500,
      warmupIterations: 50,
      runs: 1,
      concurrency: CONCURRENCY,
      silent: true,
      onIteration: async () => {
        await fetch(baseUrl + `/api/collections/${STABLE_COLLECTION}?limit=5`, {
          headers: { "x-test-secret": TEST_API_SECRET },
        });
      },
    });

    // 3. Measure Multi-Tenant (Switching Context)
    console.log(`   → Measuring Multi-Tenant (${TENANT_COUNT} tenants switching)...`);
    const multi = await runBenchmark({
      name: "Multi-Tenant Context Switching",
      iterations: ITERATIONS,
      warmupIterations: 100,
      runs: 2,
      concurrency: CONCURRENCY,
      silent: true,
      onIteration,
    });

    const overhead = ((multi.avgMs - baseline.avgMs) / baseline.avgMs) * 100;

    printTruthTable({
      title: "SVELTYCMS  —  MULTI-TENANCY PERFORMANCE AUDIT",
      subtitle: `Isolation Cost • Context Switching • ${TENANT_COUNT} Active Tenants`,
      results: [
        { ...baseline, layer: "Baseline", overheadPct: 0 },
        { ...multi, layer: "Full Stack", overheadPct: overhead },
      ],
    });

    printSummaryTable([
      { key: "Baseline Latency (Single)", val: baseline.avgMs, unit: "ms" },
      { key: "Multi-Tenant Latency", val: multi.avgMs, unit: "ms" },
      { key: "Isolation Overhead", val: overhead, unit: "%" },
      { key: "Context Switch Penalty", val: (multi.avgMs - baseline.avgMs).toFixed(3), unit: "ms" },
      {
        key: "Scalability Rating",
        val: overhead < 15 ? "EXCELLENT" : overhead < 30 ? "GOOD" : "DEGRADED",
        unit: "",
      },
    ]);

    exportResult(multi);
    await server.stop();
  } finally {
    logger.level = originalLogLevel;
  }

  console.log("\n✅ Multi-tenancy audit completed.");
}

test("Multi-Tenancy Enterprise Audit", async () => {
  await runMultiTenantAudit();
}, 600000);
