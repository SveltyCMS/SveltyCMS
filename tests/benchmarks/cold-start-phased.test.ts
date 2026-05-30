/**
 * @file tests/benchmarks/cold-start-phased.test.ts
 * @description Measures the time to READY state (serving traffic) vs WARMED state (background tasks).
 */
import {
  test,
  runBenchmark,
  printTruthTable,
  printSummaryTable,
  getDbType,
  exportResult,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { runSystemBoot } from "@src/databases/db-init";
import { systemStateStore, setSystemState } from "@src/stores/system/state.svelte";
import { get } from "svelte/store";
import { SQLiteAdapter } from "@src/databases/sqlite/sqlite-adapter";
import { createSchemaProxy } from "@src/databases/core/schema-proxy";

async function runColdStartPhasedAudit() {
  console.log("\n🚀 Starting Phased Cold Start Audit...\n");

  let dbAdapter = new SQLiteAdapter() as any;
  dbAdapter = createSchemaProxy(dbAdapter);

  // RESET STATE: Ensure we start from clean IDLE
  setSystemState("IDLE", "Resetting for cold start benchmark");
  await dbAdapter.connect(":memory:");

  const results = await runBenchmark({
    name: "Cold Start (IDLE → READY → WARMED)",
    iterations: 5,
    runs: 1,
    concurrency: 1,
    silent: false,
    onIteration: async (_i: number) => {
      // Re-reset between iterations
      setSystemState("IDLE", "Reset for iteration");
      await dbAdapter.connect(":memory:");

      // Trigger boot and poll for WARMED
      void runSystemBoot(dbAdapter);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Cold start timed out")), 30000);
        const check = setInterval(() => {
          const state = get(systemStateStore);
          if (state.overallState === "WARMED") {
            clearInterval(check);
            clearTimeout(timeout);
            resolve();
          }
        }, 10);
      });
    },
  });

  printTruthTable({
    title: "SVELTYCMS — PHASED COLD START AUDIT",
    shortLabel: "Cold Start",
    subtitle: `Phased Boot (IDLE → READY → WARMED) • ${getDbType().toUpperCase()}`,
    results: [{ ...results, name: "Cold Start (IDLE → WARMED)", layer: "Core" }],
  });

  printSummaryTable([
    { key: "Avg Cold Start", val: results.avgMs, unit: "ms" },
    { key: "p95 Cold Start", val: results.p95Ms, unit: "ms" },
    {
      key: "Reliability",
      val: results.errorRate === 0 ? "STABLE" : "DEGRADED",
      unit: "",
    },
  ]);

  exportResult(results);
}

test("Cold Start Phased Boot Latency", async () => {
  await runColdStartPhasedAudit();
}, 120000);
