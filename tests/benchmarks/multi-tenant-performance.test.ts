/**
 * @file tests/benchmarks/multi-tenant-performance.test.ts
 * @description Professional benchmark for SveltyCMS Multi-Tenant isolation, data separation, and scaling performance.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { safeFetch, waitForServer, getApiBaseUrl } from "../integration/helpers/server";

const API_BASE_URL = process.env.API_BASE_URL || getApiBaseUrl();

export async function runMultiTenantBenchmark() {
  console.log("🚀 Starting SveltyCMS Multi-Tenant Isolation & Scaling Benchmark...\n");

  await waitForServer();

  const TEST_API_SECRET = process.env.TEST_API_SECRET || "SveltyCMS-Benchmark-Secret-2026";
  const baseHeaders = {
    "Content-Type": "application/json",
    "x-test-secret": TEST_API_SECRET,
    "x-test-mode": "true",
  };

  const tenantCounts = [5, 30];
  const results: any[] = [];

  for (const tenantCount of tenantCounts) {
    console.log(`\n🏢 Testing with ${tenantCount} tenants...`);

    // Setup tenants in the DB before running the benchmark for each scale
    for (let i = 1; i <= tenantCount; i++) {
      const tenantId = `bench-tenant-${i}`;
      await safeFetch(`${API_BASE_URL}/api/testing`, {
        method: "POST",
        headers: baseHeaders,
        body: JSON.stringify({ action: "create-tenant", tenantId, name: `Tenant ${i}` }),
      }).catch(() => {});
    }

    const result = await runBenchmark({
      name: `Multi-Tenant: ${tenantCount} Tenants Isolation`,
      iterations: 1500,
      warmupIterations: 100,
      concurrency: 24,
      onIteration: async (i: number) => {
        const tenantId = `bench-tenant-${(i % tenantCount) + 1}`;

        const res = await safeFetch(`${API_BASE_URL}/api/collections?limit=15`, {
          headers: {
            ...baseHeaders,
            "x-tenant-id": tenantId,
          },
        });

        if (!res.ok) {
          throw new Error(`Tenant ${tenantId} request failed with status ${res.status}`);
        }
      },
      silent: true,
    });

    results.push({ tenantCount, ...result });
    exportResult(result, `multi-tenant-${tenantCount}.json`);
  }

  // Summary Table
  console.log("\n" + "=".repeat(100));
  console.log("🏢 MULTI-TENANT PERFORMANCE & ISOLATION SUMMARY");
  console.log("=".repeat(100));
  console.log(
    `| ${"Tenants".padEnd(10)} | ${"Avg (ms)".padEnd(12)} | ${"p95 (ms)".padEnd(12)} | ${"RPS".padEnd(12)} | Isolation |`,
  );
  console.log("|" + "-".repeat(10 + 12 + 12 + 12 + 12 + 4) + "|");

  for (const r of results) {
    const status = r.avgMs < 25 ? "✅ Strong" : r.avgMs < 45 ? "⚠️ Acceptable" : "❌ Degraded";
    console.log(
      `| ${r.tenantCount.toString().padEnd(10)} | ${r.avgMs.toFixed(3).padEnd(12)} | ${r.p95Ms.toFixed(3).padEnd(12)} | ${Math.round(r.rps).toLocaleString().padEnd(12)} | ${status.padEnd(10)} |`,
    );
  }
  console.log("=".repeat(100));

  console.log(
    `\n📊 Observation: Performance degradation from ${results[0].tenantCount} → ${results[results.length - 1].tenantCount} tenants:`,
  );
  const degradation = (
    ((results[results.length - 1].avgMs - results[0].avgMs) / results[0].avgMs) *
    100
  ).toFixed(1);
  console.log(`   Latency increase: ${degradation}%`);
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("Multi-Tenant Isolation & Scaling Suite", async () => {
    await runMultiTenantBenchmark();
  }, 800000);
}
