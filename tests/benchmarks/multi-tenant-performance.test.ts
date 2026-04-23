/**
 * @file tests/benchmarks/multi-tenant-performance.test.ts
 * @description Enterprise multi-tenant benchmark for SveltyCMS.
 * Measures tenant isolation overhead and cross-tenant query latencies.
 */
import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  setupBenchmarkServer,
  printAuditTable,
  printSummaryTable,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let stopServer: () => Promise<void>;

beforeAll(async () => {
  const { stop } = await setupBenchmarkServer();
  stopServer = stop;
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

export async function runMultiTenantBenchmark() {
  console.log("🚀 Starting Enterprise Multi-Tenant Benchmark...\n");

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  await stabilize();

  const RUNS = 3;
  const ITERATIONS = 800;
  const WARMUP = 100;
  const scales = [1, 10, 50];
  const allResults: any[] = [];

  logger.level = "silent";

  for (const scale of scales) {
    console.log(`📌 Scaling to ${scale} active tenants...`);

    const result = await runBenchmark({
      name: `Tenant Isolation @ ${scale}t`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency: 4,
      trimOutliers: "iqr",
      measureMemory: true,
      onIteration: async () => {
        const tenantId = `tenant-${Math.floor(Math.random() * scale)}`;
        await db.crud.findMany("system_users", {}, { tenantId: tenantId as any });
      },
      silent: true,
    });

    allResults.push({ ...result, scale });
  }

  logger.level = "info";

  printAuditTable({
    title: "SVELTYCMS  —  MULTI-TENANT ISOLATION",
    subtitle: "Context Switching Overhead • Data Isolation • 4c Scaling",
    results: allResults,
  });

  const base = allResults[0];
  const peak = allResults[allResults.length - 1];
  const overhead = peak.avgMs - base.avgMs;

  printSummaryTable([
    { key: "Single Tenant Latency", val: base.avgMs, unit: "ms" },
    { key: "50-Tenant Scale Latency", val: peak.avgMs, unit: "ms" },
    { key: "Cross-Tenant Overhead", val: overhead, unit: "ms" },
    { key: "Peak Tenant Throughput", val: Math.round(peak.rps), unit: "req/s" },
    { key: "Isolation Stability RSS Δ", val: (peak.rssDelta || 0).toFixed(2), unit: "MB" },
  ]);

  exportMetric("scale.tenancy.avg", peak.avgMs, "ms");
  exportMetric("scale.tenancy.rps", peak.rps, "req/s");
  exportMetric("scale.tenancy.overhead", overhead, "ms");

  for (const r of allResults) exportResult(r);

  console.log("\n✅ Multi-tenant benchmark completed.");
}

test("Multi-Tenant Isolation & Performance", async () => {
  await runMultiTenantBenchmark();
}, 450000);
