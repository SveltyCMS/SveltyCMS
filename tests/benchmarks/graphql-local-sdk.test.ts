/**
 * @file tests/benchmarks/graphql-local-sdk.test.ts
 * @description Local SDK query performance (zero HTTP, pure in-process) (Optimized)
 * @summary Measures in-process SDK calls, direct schema resolvers, and local GraphQL execution floor.
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  printTruthTable,
  printSummaryTable,
  getDbType,
  stabilize,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import fs from "node:fs/promises";
import path from "node:path";

const DB_FILE = "local_sdk_bench.sqlite";

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

test("Local SDK Query Performance (zero HTTP, pure in-process)", async () => {
  console.log("\n🎯 Local SDK Performance Audit (zero HTTP, pure in-process)\n");

  let adapter: any = null;

  try {
    // ── 1. IN-PROCESS DATABASE INITIALIZATION ────────────────────────────────
    const { loadAdapters, initializeDatabase } = await import("@src/databases/db-init");
    adapter = await loadAdapters({
      DB_TYPE: "sqlite",
      DB_NAME: DB_FILE,
    });

    if (!adapter) {
      console.log("   ⚠️ No adapter available — skipping local SDK benchmark\n");
      return;
    }

    await adapter.connect(undefined as unknown as string);
    await initializeDatabase(adapter);

    const { LocalCMS } = await import("@src/services/sdk");
    const cms = new LocalCMS(adapter);

    const results: any[] = [];
    const dbType = getDbType().toUpperCase();

    // ── 2. COLD VS WARM SYSTEM HEALTH CHECK ─────────────────────────────────
    console.log("   → 1. Measuring System Health Resolution...");

    // Cold invocation (First access floor)
    const t0 = performance.now();
    const h1 = await cms.system.getHealth();
    const coldHealthMs = performance.now() - t0;
    console.log(
      `      Cold health: ${coldHealthMs.toFixed(3)}ms [Status: ${h1?.overallStatus || "OK"}]`,
    );

    forceGarbageCollection();
    await stabilize(50);

    // Warm steady-state health check
    const warmHealthResult = await runBenchmark({
      name: "Local SDK: getHealth()",
      iterations: 2000,
      warmupIterations: 200,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        await cms.system.getHealth();
      },
    });
    results.push({ ...warmHealthResult, layer: "SDK", shortLabel: "Health" });

    // ── 3. SETTINGS READ (IN-PROCESS DB QUERY) ──────────────────────────────
    forceGarbageCollection();
    await stabilize(50);

    console.log("   → 2. Measuring System Settings In-Process Fetch...");
    const settingsResult = await runBenchmark({
      name: "Local SDK: settings.getAll()",
      iterations: 1500,
      warmupIterations: 150,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        await cms.system.settings.getAll({ tenantId: "global" as any });
      },
    });
    results.push({ ...settingsResult, layer: "SDK", shortLabel: "Settings" });

    // ── 4. DIRECT IN-PROCESS GRAPHQL EXECUTION (ZERO HTTP) ──────────────────
    const hasGraphql = typeof (cms as any).graphql?.execute === "function";
    let gqlResult: any = null;

    if (hasGraphql) {
      forceGarbageCollection();
      await stabilize(50);

      console.log("   → 3. Measuring In-Process Direct GraphQL Resolver...");
      const gqlQuery = `query { contentSystemHealth { state version } }`;

      gqlResult = await runBenchmark({
        name: "Local SDK: graphql.execute()",
        iterations: 1000,
        warmupIterations: 100,
        runs: 2,
        concurrency: 1,
        trimOutliers: "iqr",
        silent: true,
        onIteration: async () => {
          const res = await (cms as any).graphql.execute({ query: gqlQuery });
          if (res?.errors?.length) throw new Error(res.errors[0].message);
        },
      });
      results.push({ ...gqlResult, layer: "GraphQL", shortLabel: "GQL Local" });
    }

    // ── 5. REPORTING & TELEMETRY ────────────────────────────────────────────
    const healthSpeedup = (coldHealthMs / Math.max(warmHealthResult.avgMs, 0.001)).toFixed(1);

    printTruthTable({
      title: "SVELTYCMS — LOCAL SDK & IN-PROCESS BENCHMARK",
      shortLabel: "Local SDK",
      subtitle: `Zero HTTP • Direct In-Process Floor • ${dbType}`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Cold Health Latency", val: coldHealthMs.toFixed(3), unit: "ms" },
        { key: "Warm Health Latency (Avg)", val: warmHealthResult.avgMs.toFixed(3), unit: "ms" },
        { key: "Health Warm Speedup", val: `${healthSpeedup}×`, unit: "" },
        { key: "Settings Read Latency (Avg)", val: settingsResult.avgMs.toFixed(3), unit: "ms" },
        ...(gqlResult
          ? [{ key: "In-Process GraphQL Latency", val: gqlResult.avgMs.toFixed(3), unit: "ms" }]
          : []),
        { key: "Peak In-Process Throughput", val: Math.round(warmHealthResult.rps), unit: "ops/s" },
        {
          key: "Sub-0.5ms Floor SLA",
          val: warmHealthResult.avgMs < 0.5 ? "PASSED (<0.5ms)" : "EXCEEDED",
          unit: "",
        },
      ],
      "Local SDK Summary",
    );

    exportMetric("sdk.local.cold_health_ms", coldHealthMs, "ms");
    exportMetric("sdk.local.warm_health_ms", warmHealthResult.avgMs, "ms");
    exportMetric("sdk.local.settings_ms", settingsResult.avgMs, "ms");
    if (gqlResult) {
      exportMetric("sdk.local.graphql_ms", gqlResult.avgMs, "ms");
    }

    for (const r of results) exportResult(r);
  } catch (err: any) {
    console.error("Local SDK benchmark failed:", err);
    throw err;
  } finally {
    if (adapter && typeof adapter.close === "function") {
      await adapter.close().catch(() => {});
    }
    // Clean up temporary local SQLite artifacts
    await fs.rm(path.resolve(process.cwd(), DB_FILE), { force: true }).catch(() => {});
    await fs.rm(path.resolve(process.cwd(), `${DB_FILE}-wal`), { force: true }).catch(() => {});
    await fs.rm(path.resolve(process.cwd(), `${DB_FILE}-shm`), { force: true }).catch(() => {});
  }
}, 60_000);
