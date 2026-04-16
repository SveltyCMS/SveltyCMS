/**
 * @file tests/benchmarks/multi-tenant-performance.test.ts
 * @description High-fidelity benchmark for SveltyCMS multi-tenant isolation and context-switching overhead.
 *              Measures performance and memory impact when rapidly switching between many tenants.
 */

import { test } from "bun:test";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { logger } from "@utils/logger.server";

const ITERATIONS = 1800;
const WARMUP = Math.floor(ITERATIONS * 0.15);
const RUNS = 3;

export async function runMultiTenantBenchmark() {
  console.log("🏢 Starting SveltyCMS Multi-Tenant Isolation & Switching Benchmark...\n");

  logger.level = "silent";

  const { ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();

  const { mockDispatch } = await import("./benchmark-utils");

  const TENANT_SCALES = [5, 20, 50, 100];

  const results: any[] = [];

  for (const scale of TENANT_SCALES) {
    console.log(`🏢 Testing with ${scale} active tenants (rapid context switching)...`);

    const result = await runBenchmark({
      name: `Multi-Tenant: ${scale} Tenants (Switching Overhead)`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      concurrency: 1,
      runs: RUNS,
      trimOutliers: "iqr",
      measureMemory: true,
      onIteration: async (i: number) => {
        const tenantId = `bench-tenant-${(i % scale) + 1}`;

        const res = await mockDispatch({
          path: "/api/collections",
          method: "GET",
          tenantId,
        });

        if (res.status !== 200) {
          throw new Error(`Tenant ${tenantId} request failed: ${res.status}`);
        }

        await res.text();
      },
      silent: true,
    });

    results.push({ scale, ...result });
    exportResult(result, `multi-tenant-${scale}-tenants.json`);
  }

  logger.level = "info";

  // ===================================================================
  // Professional Summary
  // ===================================================================
  console.log("\n" + "=".repeat(135));
  console.log("   🏢 SVELTYCMS MULTI-TENANT ISOLATION & SWITCHING AUDIT");
  console.log("   High-Fidelity • Context Switching Stress • IQR + Memory Tracking");
  console.log("=".repeat(135));

  console.log(
    `| ${"Tenant Scale".padEnd(28)} | ${"Avg Latency".padEnd(22)} | ${"p95".padEnd(14)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(14)} |`,
  );
  console.log("|" + "-".repeat(28 + 22 + 14 + 12 + 14 + 6) + "|");

  for (const r of results) {
    const rssDelta =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)} MB` : "—";

    console.log(
      `| ${`${r.scale} Tenants`.padEnd(28)} | ` +
        `${r.avgMs.toFixed(4)} ms (±${r.marginOfError.toFixed(3)})`.padEnd(22) +
        ` | ` +
        `${r.p95Ms.toFixed(4)} ms`.padEnd(14) +
        ` | ` +
        `${Math.round(r.rps).toLocaleString()}`.padEnd(12) +
        ` | ` +
        `${rssDelta.padEnd(14)} |`,
    );
  }
  console.log("=".repeat(135));

  console.log(`\n✨ Multi-Tenant Insights:`);
  console.log(
    `   • Ideal behavior: latency and memory should stay nearly flat as tenant count increases`,
  );
  console.log(`   • Significant growth would indicate tenant-specific caching or state leakage`);
  console.log(
    `   • Context switching overhead is measured by forcing tenantId change on every request`,
  );

  console.log("\n✅ Multi-Tenant benchmark completed.");
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("Multi-Tenant Isolation & Switching Performance", async () => {
    await runMultiTenantBenchmark();
  }, 600000);
}
