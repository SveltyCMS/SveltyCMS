/**
 * @file tests/benchmarks/state-machine-transition.test.ts
 * @description Enterprise State Machine integrity benchmark.
 * Simulates rapid system re-initializations and verifies the self-healing state transitions.
 */

import {
  test,
  runBenchmark,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  getDbType,
  TEST_API_SECRET,
} from "./benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runStateMachineAudit() {
  console.log("🚀 Starting Enterprise State Machine Integrity Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    console.log("   → Stressing 'Self-Healing' re-initialization logic...");

    const results = await runBenchmark({
      name: "State Transition (READY -> IDLE -> READY)",
      iterations: 50,
      runs: 1,
      concurrency: 1, // Must be sequential to verify state chain
      silent: true,
      onIteration: async (i: number) => {
        // 1. Trigger Re-initialization
        // This moves state to INITIALIZING then READY
        const res = await fetch(`${baseUrl}/api/system/reinitialize`, {
          method: "POST",
          headers: {
            "x-test-mode": "true",
            "x-test-secret": TEST_API_SECRET,
          },
        });

        if (!res.ok) {
          throw new Error(`Re-init trigger failed: ${res.status}`);
        }

        // 2. Immediate Health Probe
        // We expect either 503 (INITIALIZING) or 200 (READY)
        // If it returns 500 or hangs, the state machine is broken.
        const healthRes = await fetch(`${baseUrl}/api/system/health`, {
          headers: {
            "x-test-mode": "true",
            "x-test-secret": TEST_API_SECRET,
          },
        });

        const data = await healthRes.json();
        const status = data.overallStatus || data.status;

        const allowed = ["INITIALIZING", "READY", "WARMING", "WARMED", "SETUP"];
        if (!allowed.includes(status)) {
          throw new Error(`Invalid state reached during cycle ${i}: ${status}`);
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
      { key: "Cycle Stability", val: results.errorRate === 0 ? "STABLE" : "FLAKY", unit: "" },
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

  console.log("\n✅ State machine audit completed.");
}

test("State Machine Self-Healing Logic", async () => {
  await runStateMachineAudit();
}, 600000);
