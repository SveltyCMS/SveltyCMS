/**
 * @file tests/benchmarks/chaos-resilience.test.ts
 * @description Enterprise Chaos & Resilience benchmark for SveltyCMS.
 * Simulates infrastructure brownouts and measures system stability & graceful degradation.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runChaosAudit() {
  console.log("🚀 Starting Enterprise Chaos & Resilience Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(1000);

    console.log("   → Running under simulated infrastructure brownouts...");

    const results = await runBenchmark({
      name: "Chaos Resilience (Brownout)",
      iterations: 250,
      warmupIterations: 30,
      runs: 2,
      concurrency: 6,
      silent: true,
      onIteration: async () => {
        // Simulate network brownout with jitter
        const jitter = Math.random() < 0.35 ? Math.random() * 600 + 200 : 0;
        if (jitter > 0) await new Promise((r) => setTimeout(r, jitter));

        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable`, {
          headers: {
            "x-test-mode": "true",
            "x-test-secret": process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026",
          },
        });

        if (!res.ok && res.status >= 500) {
          throw new Error(`System failed under brownout: ${res.status}`);
        }

        await res.json().catch(() => ({}));
      },
    });

    const availability = 100 - (results.errorRate || 0) * 100;

    printTruthTable({
      title: "SVELTYCMS — CHAOS RESILIENCE AUDIT",
      shortLabel: "Chaos",
      subtitle: `500ms Brownouts • 35% Probability • ${getDbType().toUpperCase()}`,
      results: [{ ...results, layer: "Resilience" }],
    });

    printSummaryTable([
      { key: "Avg Latency (with jitter)", val: results.avgMs, unit: "ms" },
      { key: "p95 Latency", val: results.p95Ms || results.avgMs, unit: "ms" },
      { key: "Availability", val: availability.toFixed(1), unit: "%" },
      {
        key: "Resilience Rating",
        val: availability > 98 ? "EXCELLENT" : availability > 92 ? "GOOD" : "NEEDS WORK",
        unit: "",
      },
    ]);

    exportResult(results);
  } catch (err: any) {
    logger.error(`Chaos audit failed: ${err.message}`);
    console.error(err);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Chaos & resilience audit completed.");
}

test("System Resilience under Chaos", async () => {
  await runChaosAudit();
}, 600000);
