/**
 * @file tests/benchmarks/state-machine-transition.test.ts
 * @description Self-Healing State Machine Integrity Benchmark (Optimized)
 * @summary Measures state machine self-healing transition latencies, convergence settling time, and health probe consistency under stress.
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

const ALLOWED_HEALING_STATES = new Set([
  "INITIALIZING",
  "READY",
  "WARMING",
  "WARMED",
  "SETUP",
  "RECOVERY",
  "DEGRADED",
  "IDLE",
  "operational",
]);

async function runStateMachineAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Enterprise State Machine Integrity Audit (${dbType})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await stabilize(1000);

    const reinitUrl = `${baseUrl}/api/system/reinitialize`;
    const healthUrl = `${baseUrl}/api/system/health`;

    const requestHeaders: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
      connection: "keep-alive",
    };

    const results = [];

    // ── 1. IMMEDIATE TRANSIENT STATE TRANSITION BENCHMARK ───────────────────
    forceGarbageCollection();
    await stabilize(200);

    console.log("   → 1. Stressing Rapid Re-initialization & Transient State Transition...");
    const transitionResult = await runBenchmark({
      name: "State Transition (Transient)",
      iterations: 50,
      warmupIterations: 5,
      runs: 1,
      concurrency: 1, // Sequential execution preserves step-state sequence continuity
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async (i: number) => {
        const res = await fetch(reinitUrl, {
          method: "POST",
          headers: requestHeaders,
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Re-init trigger failed on cycle ${i}: HTTP ${res.status} - ${errText}`);
        }
        await res.arrayBuffer().catch(() => {});

        // Immediate health state inspection
        const healthRes = await fetch(healthUrl, {
          method: "GET",
          headers: requestHeaders,
          signal: AbortSignal.timeout(10_000),
        });

        if (!healthRes.ok) {
          throw new Error(
            `Health probe failed during transition on cycle ${i}: HTTP ${healthRes.status}`,
          );
        }

        const data = (await healthRes.json()) as any;
        const status = data.overallStatus || data.status || data.state;

        if (!status || !ALLOWED_HEALING_STATES.has(status)) {
          throw new Error(`Invalid state reached during cycle ${i}: ${status ?? "<unknown>"}`);
        }
      },
    });
    results.push({ ...transitionResult, shortLabel: "Transient Re-init", layer: "State Logic" });

    // ── 2. FULL CONVERGENCE SETTLING BENCHMARK (READY STABILIZATION) ────────
    forceGarbageCollection();
    await stabilize(200);

    console.log("   → 2. Measuring Full Self-Healing Convergence Time (Settling to READY)...");
    let settledCycles = 0;

    const settlingResult = await runBenchmark({
      name: "Self-Healing Full Convergence",
      iterations: 30,
      warmupIterations: 3,
      runs: 1,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async (i: number) => {
        // Trigger cycle
        const res = await fetch(reinitUrl, {
          method: "POST",
          headers: requestHeaders,
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`Re-init trigger failed: HTTP ${res.status}`);
        await res.arrayBuffer().catch(() => {});

        // Poll until convergence to READY/operational (max 5 seconds timeout)
        const pollStart = performance.now();
        let isSettled = false;

        while (performance.now() - pollStart < 5000) {
          const healthRes = await fetch(healthUrl, {
            method: "GET",
            headers: requestHeaders,
            signal: AbortSignal.timeout(3000),
          });

          if (healthRes.ok) {
            const data = (await healthRes.json()) as any;
            const currentStatus = (
              data.overallStatus ||
              data.status ||
              data.state ||
              ""
            ).toLowerCase();
            if (currentStatus === "ready" || currentStatus === "operational") {
              isSettled = true;
              settledCycles++;
              break;
            }
          }
          await new Promise((r) => setTimeout(r, 25));
        }

        if (!isSettled) {
          throw new Error(
            `Self-healing state machine failed to converge to READY within SLA on cycle ${i}`,
          );
        }
      },
    });
    results.push({ ...settlingResult, shortLabel: "Convergence", layer: "Self-Healing" });

    // ── 3. REPORTING & TELEMETRY ────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — STATE MACHINE INTEGRITY",
      shortLabel: "State",
      subtitle: `Rapid Re-init Cycles • Full Convergence • ${dbType}`,
      results,
    });

    const isStable = transitionResult.errorRate === 0 && settlingResult.errorRate === 0;

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Transient Transition Latency", val: transitionResult.avgMs.toFixed(2), unit: "ms" },
        {
          key: "Transient Transition p95",
          val: (transitionResult.p95Ms || transitionResult.avgMs).toFixed(2),
          unit: "ms",
        },
        { key: "Full Convergence Time (Avg)", val: settlingResult.avgMs.toFixed(2), unit: "ms" },
        {
          key: "Full Convergence Time (p95)",
          val: (settlingResult.p95Ms || settlingResult.avgMs).toFixed(2),
          unit: "ms",
        },
        {
          key: "Heals / Cycles Verified",
          val: `${transitionResult.iterations + settlingResult.iterations}`,
          unit: "cycles",
        },
        { key: "Memory RSS Δ", val: (transitionResult.rssDelta || 0).toFixed(1), unit: "MB" },
        {
          key: "State Machine Health",
          val: isStable ? "OPTIMAL (100% Convergence)" : "FLAKY (State Violations)",
          unit: "",
        },
      ],
      "State Machine Summary",
    );

    exportMetric("state_machine.transition_avg_ms", transitionResult.avgMs, "ms");
    exportMetric(
      "state_machine.transition_p95_ms",
      transitionResult.p95Ms || transitionResult.avgMs,
      "ms",
    );
    exportMetric("state_machine.convergence_avg_ms", settlingResult.avgMs, "ms");
    exportMetric(
      "state_machine.convergence_p95_ms",
      settlingResult.p95Ms || settlingResult.avgMs,
      "ms",
    );
    exportMetric(
      "state_machine.heals_completed",
      transitionResult.iterations + settlingResult.iterations,
      "cycles",
    );

    for (const r of results) exportResult(r);
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
}, 600_000);
