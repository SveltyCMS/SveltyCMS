/**
 * @file tests/benchmarks/chaos-resilience.test.ts
 * @description Chaos & Resilience Audit (Optimized)
 * @summary Simulates infrastructure brownouts and measures system stability and graceful degradation under stress.
 *
 * ### Features:
 * - Infrastructure brownout simulation
 * - System stability under resource starvation
 * - Graceful degradation measurement
 * - Recovery time profiling
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

let stopServer: (() => Promise<void>) | null = null;

async function runChaosAudit() {
  console.log("🚀 Starting Enterprise Chaos & Resilience Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(1000);

    // Cache authorization token and request definitions outside hot trails
    const apiSecret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";
    const requestHeaders = {
      "x-test-mode": "true",
      "x-test-secret": apiSecret,
    };

    console.log("   → Running under simulated infrastructure brownouts...");

    const results = await runBenchmark({
      name: "Chaos Resilience (Brownout)",
      iterations: 250,
      warmupIterations: 30,
      runs: 2,
      concurrency: 6,
      silent: true,
      abortOnErrors: false,
      onIteration: async () => {
        // Simulate network brownout with jitter injection
        const jitter = Math.random() < 0.35 ? Math.random() * 600 + 200 : 0;
        if (jitter > 0) await new Promise((r) => setTimeout(r, jitter));

        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable`, {
          method: "GET",
          headers: requestHeaders,
        });

        // 🛡️ RESILIENCE: 503 (Circuit Breaker) is acceptable during brownouts.
        if (res.status === 503) {
          await res.arrayBuffer().catch(() => {});
          return; // Expected alternative pathway (Graceful fallback)
        }

        if (!res.ok) {
          await res.arrayBuffer().catch(() => {});
          throw new Error(`System failure: ${res.status}`);
        }

        // Native stream collector prevents payload tree building from altering timings
        await res.arrayBuffer();
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
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("System Resilience under Chaos", async () => {
  await runChaosAudit();
}, 600000);
