/**
 * @file tests/benchmarks/multi-tenant-performance.test.ts
 * @description High-fidelity benchmark for SveltyCMS multi-tenant isolation and context-switching overhead.
 *              Measures performance and memory impact when rapidly switching between many tenants.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  checkBenchmarkEnv,
  mockDispatch,
  stabilize,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

export async function runMultiTenantBenchmark() {
  checkBenchmarkEnv();
  console.log("🏢 Starting SveltyCMS Multi-Tenant Isolation & Switching Benchmark...\n");

  logger.level = "silent";

  const { ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  await stabilize();

  const ITERATIONS = 1500;
  const WARMUP = 100;
  const RUNS = 3;

  const TENANT_SCALES = [5, 20, 50, 100];

  const results: any[] = [];

  for (const scale of TENANT_SCALES) {
    console.log(`🏢 Testing with ${scale} active tenants (rapid context switching)...`);

    const result = await runBenchmark({
      name: `Multi-Tenant: ${scale} Tenants`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      onSetup: stabilize,
      onIteration: async (i: number) => {
        const tenantId = `bench-tenant-${(i % scale) + 1}`;

        const res = await mockDispatch({
          path: "/api/collections",
          method: "GET",
          // Ensure tenantId is properly passed to both headers and locals
          tenantId,
        });

        if (res.status !== 200) {
          throw new Error(`Tenant ${tenantId} request failed with status ${res.status}`);
        }

        await res.text();
      },
      silent: true,
    });

    results.push({ scale, ...result });
    exportResult(result, `multi-tenant-${scale}.json`);
  }

  logger.level = "info";

  // ===================================================================
  // Professional Summary
  // ===================================================================
  console.log("\n" + "=".repeat(140));
  console.log("   🏢 SVELTYCMS MULTI-TENANT ISOLATION & SWITCHING PERFORMANCE AUDIT");
  console.log("   Context Switching • Data Isolation • Scaling Behavior");
  console.log("=".repeat(140));

  console.log(
    `| ${"Tenant Scale".padEnd(28)} | ${"Avg Latency".padEnd(24)} | ${"p95".padEnd(14)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(14)} |`,
  );
  console.log("|" + "-".repeat(28 + 24 + 14 + 12 + 14 + 6) + "|");

  let previousAvg = 0;
  for (const r of results) {
    const rssStr =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)} MB` : "—";

    const growth =
      previousAvg > 0 ? `(+${(((r.avgMs - previousAvg) / previousAvg) * 100).toFixed(1)}%)` : "—";

    console.log(
      `| ${`${r.scale} Tenants`.padEnd(28)} | ` +
        `${r.avgMs.toFixed(4)} ms (±${r.marginOfError.toFixed(3)}) ${growth}`.padEnd(24) +
        ` | ${r.p95Ms.toFixed(3)}`.padEnd(14) +
        ` | ${Math.round(r.rps).toLocaleString().padEnd(12)}` +
        ` | ${rssStr.padEnd(14)} |`,
    );

    previousAvg = r.avgMs;
  }
  console.log("=".repeat(140));

  console.log(`\n✨ Multi-Tenant Insights:`);
  console.log(`   • Ideal: latency and memory should remain nearly flat as tenant count grows`);
  console.log(`   • Measured context-switching overhead with rapid tenantId changes`);
  console.log(`   • Any significant growth indicates tenant state leakage or poor isolation`);

  // Consolidated export for the matrix
  const avgLatency = results.reduce((sum, r) => sum + r.avgMs, 0) / results.length;
  const maxP95 = Math.max(...results.map((r) => r.p95Ms));
  const avgRssGrowth = results[results.length - 1].rssDelta || 0;

  const representativeRes = results.find((r) => r.scale === 50) || results[results.length - 1];
  exportMetric("scale.tenancy.avg", representativeRes.avgMs, "ms", {
    p95: representativeRes.p95Ms,
    scale: representativeRes.scale,
  });
  exportMetric("scale.tenancy.rps", representativeRes.rps, "req/s");

  exportResult({
    name: "Multi-Tenant (Average)",
    avgMs: Number(avgLatency.toFixed(4)),
    p95Ms: Number(maxP95.toFixed(3)),
    rps: results[0].rps, // representative
    maxTenantScale: TENANT_SCALES[TENANT_SCALES.length - 1],
    rssGrowthMb: avgRssGrowth,
  });

  console.log("\n✅ Multi-Tenant benchmark completed.");
}

test("Multi-Tenant Isolation & Switching Performance", async () => {
  await runMultiTenantBenchmark();
}, 500000);
