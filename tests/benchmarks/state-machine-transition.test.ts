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

const HEALTH_READY_STATES = new Set(["ready", "operational", "warmed", "healthy"]);

/** Poll the health probe until it reports a converged state (bounded). */
async function waitForReady(
  healthUrl: string,
  requestHeaders: Record<string, string>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    try {
      const res = await fetch(healthUrl, {
        method: "GET",
        headers: requestHeaders,
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        const status = String(data.overallStatus ?? data.status ?? data.state ?? "").toLowerCase();
        if (HEALTH_READY_STATES.has(status)) return true;
      }
    } catch {
      /* keep polling until the deadline */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

/**
 * Clean-state guard: force the self-healing state machine back to a known READY
 * state before measuring.
 *
 * The audit is flaky when the shared benchmark DB/filesystem is polluted by
 * earlier stress tests: a full `reinitialize` then takes longer than the
 * per-cycle budget and the run is reported as a phantom "FLAKY (State
 * Violations)" reliability verdict. One forced reinitialize both reconciles
 * whatever is on disk and warms that path, so the measured cycles start from
 * READY. If it cannot converge, the guard fails explicitly with the
 * remediation instead of letting the environment masquerade as a regression.
 *
 * `/api/testing` reset is deliberately NOT used: it is TEST_MODE-only (403 on
 * the production-parity matrix server), and wiping DB/caches mid-run makes the
 * first measured reinitialize colder — the opposite of the goal.
 */
async function ensureCleanBenchmarkState(
  baseUrl: string,
  healthUrl: string,
  requestHeaders: Record<string, string>,
): Promise<"reinitialize"> {
  // Purge benchmark compiled workspaces first: earlier filesystem stress tests
  // leave large `.compiledCollections/test/**` trees that the forced
  // reinitialize would otherwise re-scan on every cycle. Under the matrix the
  // orchestrator owns workspace lifecycle (BENCHMARK_MATRIX=1 defers cleanup),
  // so only do this for standalone runs.
  if (process.env.BENCHMARK_MATRIX !== "1") {
    try {
      const { cleanupAllBenchmarkWorkspaces } = await import("@utils/benchmark-paths");
      const removed = await cleanupAllBenchmarkWorkspaces();
      if (removed > 0)
        console.log(`   → 0a. Purged ${removed} benchmark workspace(s) before reinitialize`);
    } catch {
      /* best-effort cleanup; the reinitialize convergence check below still guards */
    }
  }

  let reinitStatus = 0;
  let reinitDetail = "";
  try {
    const res = await fetch(`${baseUrl}/api/system/reinitialize`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({ force: true }),
      signal: AbortSignal.timeout(30_000),
    });
    reinitStatus = res.status;
    if (!res.ok) reinitDetail = (await res.text().catch(() => "")).slice(0, 300);
  } catch (err) {
    reinitDetail = err instanceof Error ? err.message : String(err);
  }
  if (reinitStatus === 0) {
    throw new Error(
      `[state-machine-transition] clean-DB guard failed: a forced reinitialize threw (${reinitDetail}). ` +
        `The benchmark server/database is unreachable — reset the benchmark DB and retry.`,
    );
  }
  if (reinitStatus !== 200) {
    throw new Error(
      `[state-machine-transition] clean-DB guard failed: POST /api/system/reinitialize returned HTTP ${reinitStatus} (${reinitDetail}). ` +
        `The shared benchmark database is polluted/unrecoverable — drop it and re-run the pre-seed before retrying.`,
    );
  }
  if (!(await waitForReady(healthUrl, requestHeaders, 20_000))) {
    throw new Error(
      `[state-machine-transition] clean-DB guard failed: the state machine did not converge to READY within 20s of a forced reinitialize. ` +
        `The shared benchmark database is polluted — drop it and re-run the pre-seed before retrying.`,
    );
  }
  return "reinitialize";
}

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

    // ── 0. CLEAN-DB GUARD ───────────────────────────────────────────────────
    // Never measure the self-healing path from an unknown/ polluted state: a
    // dirty shared benchmark DB otherwise shows up as a phantom "reliability"
    // failure instead of an environment fault.
    const cleanRoute = await ensureCleanBenchmarkState(baseUrl, healthUrl, requestHeaders);
    console.log(`   → 0. Clean-state guard: ${cleanRoute}`);

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
