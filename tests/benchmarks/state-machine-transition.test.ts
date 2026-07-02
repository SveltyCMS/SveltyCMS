/**
 * @file tests/benchmarks/state-machine-transition.test.ts
 * @description Self-Healing State Machine Integrity Benchmark (Optimized)
 * @summary Simulates rapid system re-initializations and verifies valid self-healing state transitions under stress.
 *
 * ### Features:
 * - Sequential READY → INITIALIZING → READY transition stress testing
 * - State validity verification across rapid re-init cycles
 * - Health probe consistency during state machine oscillation
 */

import {
  test,
  runBenchmark,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  getDbType,
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runStateMachineAudit() {
  console.log("🚀 Starting Enterprise State Machine Integrity Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    // Cache static immutable configuration headers outside hot iteration path
    const requestHeaders = {
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
    };

    console.log("   → Stressing 'Self-Healing' re-initialization logic...");

    const results = await runBenchmark({
      name: "State Transition (READY -> IDLE -> READY)",
      iterations: 50,
      runs: 1,
      concurrency: 1, // Must be sequential to verify step state sequence continuity
      silent: true,
      onIteration: async (i: number) => {
        // 1. Trigger Re-initialization
        const res = await fetch(`${baseUrl}/api/system/reinitialize`, {
          method: "POST",
          headers: requestHeaders,
        });

        if (!res.ok) {
          throw new Error(`Re-init trigger failed: ${res.status}`);
        }

        // Ensure low-level socket buffer exhaustion
        await res.arrayBuffer();

        // 2. Immediate Health Probe
        const healthRes = await fetch(`${baseUrl}/api/system/health`, {
          method: "GET",
          headers: requestHeaders,
        });

        // Fast text extraction — check overallStatus first, then status
        const textPayload = await healthRes.text();

        // Prioritize overallStatus over status (health endpoint returns both)
        const osMatch = textPayload.match(/"overallStatus"\s*:\s*"([^"]+)"/);
        const sMatch = textPayload.match(/"status"\s*:\s*"([^"]+)"/);
        const status = osMatch ? osMatch[1] : sMatch ? sMatch[1] : null;

        const allowed = ["INITIALIZING", "READY", "WARMING", "WARMED", "SETUP", "operational"];
        if (!status || !allowed.includes(status)) {
          throw new Error(`Invalid state reached during cycle ${i}: ${status ?? "<unknown>"}`);
        }
      },
    });

    printTruthTable({
      title: "SVELTYCMS — STATE MACHINE INTEGRITY",
      shortLabel: "State",
      subtitle: `Rapid Re-init Cycles • ${getDbType().toUpperCase()}`,
      results: [{ ...results, layer: "State Logic" }],
    });

    printSummaryTable([
      { key: "Avg Transition Latency", val: results.avgMs, unit: "ms" },
      {
        key: "Cycle Stability",
        val: results.errorRate === 0 ? "STABLE" : "FLAKY",
        unit: "",
      },
      { key: "Heals Performed", val: results.iterations, unit: "cycles" },
    ]);
  } catch (err: any) {
    logger.error(`State machine audit failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("State Machine Self-Healing Logic", async () => {
  await runStateMachineAudit();
}, 600000);
