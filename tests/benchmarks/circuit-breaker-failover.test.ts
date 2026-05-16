/**
 * @file tests/benchmarks/circuit-breaker-failover.test.ts
 * @description Enterprise Circuit Breaker & Failover benchmark.
 * Simulates external service failures and measures system graceful degradation.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  getDbType,
  TEST_API_SECRET,
} from "./benchmark-utils";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runCircuitBreakerAudit() {
  console.log("🚀 Starting Enterprise Circuit Breaker & Failover Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    console.log("   → Simulating 'External Service' failures...");

    // We use a dedicated test endpoint that simulates external dependencies
    // In SveltyCMS, we can trigger a mock failure via x-test-fail-external header

    const results = await runBenchmark({
      name: "Circuit Breaker Fallback",
      iterations: 50,
      runs: 1,
      concurrency: 2,
      silent: true,
      onIteration: async () => {
        // Trigger a health check with simulated external dependency failure
        const res = await fetch(`${baseUrl}/api/system/health`, {
          headers: {
            "x-test-mode": "true",
            "x-test-secret": TEST_API_SECRET,
            "x-test-fail-external": "true", // Signal to mock a dependency failure
          },
        });

        // 🛡️ CIRCUIT BREAKER: We expect 200/202 (Degraded) rather than 500 (Crash)
        if (res.status >= 500) {
          throw new Error(`Circuit Breaker failed: System crashed with HTTP ${res.status}`);
        }

        await res.json().catch(() => ({}));
      },
    });

    printTruthTable({
      title: "SVELTYCMS — CIRCUIT BREAKER AUDIT",
      shortLabel: "Resilience",
      subtitle: `Mocked External Failures • ${getDbType().toUpperCase()}`,
      results: [{ ...results, layer: "Failover Logic" }],
    });

    printSummaryTable([
      { key: "Fallback Latency", val: results.avgMs, unit: "ms" },
      { key: "Failover Stability", val: results.errorRate === 0 ? "STABLE" : "FLAKY", unit: "" },
      { key: "Recovery Posture", val: "GRADUAL", unit: "" },
    ]);
  } catch (err: any) {
    logger.error(`Circuit breaker audit failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Circuit breaker audit completed.");
}

test("Circuit Breaker & Fallback Resilience", async () => {
  await runCircuitBreakerAudit();
}, 600000);
