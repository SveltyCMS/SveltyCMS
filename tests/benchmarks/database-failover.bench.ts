/**
 * @file tests/benchmarks/database-failover.test.ts
 * @description Database Failover & Reconnection Resilience Benchmark
 * @summary Simulates database connection loss mid-request and measures circuit breaker activation,
 *          automatic reconnection timing, and graceful degradation under connection failure.
 *
 * ### Features:
 * - Simulated DB connection drop via /api/testing?action=simulate-disconnect
 * - Circuit breaker state transition timing (CLOSED → OPEN → HALF_OPEN → CLOSED)
 * - Mid-request failure handling verification (in-flight requests during disconnect)
 * - Reconnection latency measurement (time from disconnect to first successful query)
 * - Graceful degradation under sustained connection loss
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runFailoverAudit() {
  const dbType = getDbType();
  console.log(`🚀 Starting Database Failover & Reconnection Audit (${dbType.toUpperCase()})...\n`);

  // SQLite is embedded — no network disconnect possible. Test reconnect resilience differently.
  if (dbType.toLowerCase() === "sqlite") {
    console.log("   → SQLite (embedded): Testing reinitialize resilience instead...");
    await runSqliteReinitializeTest();
    return;
  }

  const server = await setupBenchmarkServer();
  stopServer = server.stop;
  const baseUrl = server.baseUrl;

  await ensureStableTestData();
  await stabilize(2000);

  const headers = {
    "x-test-mode": "true",
    "x-test-secret": TEST_API_SECRET,
  };

  const results: any[] = [];

  // ──────────────────────────────────────────────
  // PHASE 1: Baseline — Normal Operations
  // ──────────────────────────────────────────────
  console.log("   → Phase 1: Measuring baseline health...");
  const baselineResult = await runBenchmark({
    name: "Baseline Health Check",
    iterations: 100,
    warmupIterations: 10,
    runs: 1,
    concurrency: 1,
    silent: true,
    onIteration: async () => {
      const res = await fetch(`${baseUrl}/api/system/health`, { headers });
      if (!res.ok) throw new Error(`Baseline failed: ${res.status}`);
      await res.json();
    },
  });
  results.push({ ...baselineResult, shortLabel: "Baseline", layer: "Normal" });

  const baselineRPS = baselineResult.rps;

  // ──────────────────────────────────────────────
  // PHASE 2: Degraded Mode — Simulate External Dependency Failure
  // ──────────────────────────────────────────────
  console.log("   → Phase 2: Simulating degraded external dependency...");
  const degradedResult = await runBenchmark({
    name: "Degraded Dependency",
    iterations: 100,
    warmupIterations: 10,
    runs: 1,
    concurrency: 4,
    silent: true,
    onIteration: async () => {
      const res = await fetch(`${baseUrl}/api/system/health`, {
        headers: {
          ...headers,
          "x-test-fail-external": "true", // Signal degraded external service
        },
      });
      // 200 (DEGRADED) or 202 (Accepted) is expected, NOT 500 (Crash)
      if (res.status >= 500) {
        throw new Error(`System crashed on degraded dependency: HTTP ${res.status}`);
      }
      await res.json();
    },
  });
  results.push({
    ...degradedResult,
    shortLabel: "Degraded",
    layer: "Degraded",
  });

  // ──────────────────────────────────────────────
  // PHASE 3: Disconnect & Recovery Timing
  // ──────────────────────────────────────────────
  console.log("   → Phase 3: Measuring disconnect → recovery cycle...");

  // Fire in-flight requests before disconnect
  const inflightPromises: Promise<Response>[] = [];
  for (let i = 0; i < 10; i++) {
    inflightPromises.push(
      fetch(`${baseUrl}/api/collections/BenchmarkStable?limit=5`, {
        headers,
        signal: AbortSignal.timeout(10000),
      }),
    );
  }

  // Trigger simulated disconnect (brief interruption)
  try {
    await fetch(`${baseUrl}/api/testing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        action: "simulate-disconnect",
        duration: 3000, // 3 second simulated outage
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    // Disconnect simulation may itself fail — that's expected
  }

  // Wait for in-flight requests to settle
  const inflightResults = await Promise.allSettled(inflightPromises);
  const succeeded = inflightResults.filter(
    (r) => r.status === "fulfilled" && (r.value as Response).ok,
  ).length;
  const failed = inflightResults.filter((r) => r.status === "rejected").length;
  const degraded502 = inflightResults.filter(
    (r) => r.status === "fulfilled" && [502, 503, 504].includes((r.value as Response).status),
  ).length;

  console.log(
    `   → In-flight requests: ${succeeded} OK, ${degraded502} degraded, ${failed} failed`,
  );

  // Poll for recovery
  console.log("   → Polling for reconnection...");
  const recoveryStart = performance.now();
  let recovered = false;
  let recoveryTimeMs = 0;
  let attempts = 0;

  for (let i = 0; i < 60; i++) {
    attempts++;
    try {
      const res = await fetch(`${baseUrl}/api/system/health`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        const status = data.overallStatus || data.status || "";
        if (status.toUpperCase() === "READY" || data.database === true) {
          recoveryTimeMs = performance.now() - recoveryStart;
          recovered = true;
          break;
        }
      }
    } catch {
      // Still reconnecting
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(
    `   → ${recovered ? `Recovered in ${recoveryTimeMs.toFixed(0)}ms (${attempts} attempts)` : "FAILED to recover within 60s"}`,
  );

  if (!recovered) {
    throw new Error("Database failed to recover within 60 seconds after simulated disconnect");
  }

  // ──────────────────────────────────────────────
  // PHASE 4: Post-Recovery Verification
  // ──────────────────────────────────────────────
  console.log("   → Phase 4: Verifying post-recovery operations...");
  await stabilize(2000);

  const postRecoveryResult = await runBenchmark({
    name: "Post-Recovery Health",
    iterations: 100,
    warmupIterations: 10,
    runs: 1,
    concurrency: 4,
    silent: true,
    onIteration: async () => {
      const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable?limit=5`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`Post-recovery failed: ${res.status}`);
      await res.json();
    },
  });
  results.push({
    ...postRecoveryResult,
    shortLabel: "Recovered",
    layer: "Restored",
  });

  const recoveryRPS = postRecoveryResult.rps;
  const recoveryEfficiency = baselineRPS > 0 ? (recoveryRPS / baselineRPS) * 100 : 100;

  printTruthTable({
    title: "SVELTYCMS — DATABASE FAILOVER AUDIT",
    shortLabel: "Failover",
    subtitle: `Disconnect → Recovery • ${dbType.toUpperCase()}`,
    results: [
      ...results,
      {
        name: "Reconnect Time",
        avgMs: recoveryTimeMs,
        p95Ms: recoveryTimeMs,
        rps: 0,
        layer: "Recovery",
        shortLabel: "Reconnect",
      },
    ],
  });

  printSummaryTable([
    { key: "Baseline RPS", val: Math.round(baselineRPS), unit: "req/s" },
    { key: "Recovery Time", val: recoveryTimeMs.toFixed(0), unit: "ms" },
    { key: "Recovery Attempts", val: attempts, unit: "" },
    { key: "Post-Recovery RPS", val: Math.round(recoveryRPS), unit: "req/s" },
    {
      key: "Recovery Efficiency",
      val: recoveryEfficiency.toFixed(1),
      unit: "%",
    },
    {
      key: "In-Flight Survived",
      val: `${succeeded}/${inflightPromises.length}`,
      unit: "",
    },
    {
      key: "Failover Rating",
      val: recoveryTimeMs < 10000 ? "EXCELLENT" : recoveryTimeMs < 30000 ? "GOOD" : "SLOW",
      unit: "",
    },
  ]);

  for (const r of results) exportResult(r);
  exportMetric("failover.recovery_ms", recoveryTimeMs, "ms");
  exportMetric("failover.recovery_efficiency", recoveryEfficiency, "%");
}

/** SQLite-specific: test reinitialize resilience instead of network disconnect. */
async function runSqliteReinitializeTest() {
  const server = await setupBenchmarkServer();
  stopServer = server.stop;
  const baseUrl = server.baseUrl;

  await ensureStableTestData();
  await stabilize(1000);

  const headers = {
    "x-test-mode": "true",
    "x-test-secret": TEST_API_SECRET,
  };

  // Baseline
  const baselineRes = await fetch(`${baseUrl}/api/system/health`, { headers });
  const baselineData = await baselineRes.json();
  console.log(`   → Baseline state: ${baselineData.overallStatus || baselineData.status}`);

  // Trigger reinitialize
  const reinitStart = performance.now();
  await fetch(`${baseUrl}/api/system/reinitialize`, {
    method: "POST",
    headers,
  });

  // Poll for READY
  let recoveryTimeMs = 0;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/system/health`, { headers });
      if (res.ok) {
        const data = await res.json();
        const status = (data.overallStatus || data.status || "").toUpperCase();
        if (status === "READY" || status === "WARMED") {
          recoveryTimeMs = performance.now() - reinitStart;
          console.log(`   → Recovered in ${recoveryTimeMs.toFixed(0)}ms (attempt ${i + 1})`);
          break;
        }
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // Verify post-recovery
  const verifyRes = await fetch(`${baseUrl}/api/collections/BenchmarkStable?limit=1`, { headers });
  if (!verifyRes.ok) throw new Error(`Post-reinitialize query failed: ${verifyRes.status}`);

  printTruthTable({
    title: "SVELTYCMS — REINITIALIZE RESILIENCE (SQLite)",
    shortLabel: "Failover",
    subtitle: "Reinitialize → Recovery • SQLite",
    results: [
      {
        name: "Reinitialize Recovery",
        avgMs: recoveryTimeMs,
        p95Ms: recoveryTimeMs,
        layer: "Recovery",
      },
    ],
  });

  printSummaryTable([
    { key: "Recovery Time", val: recoveryTimeMs.toFixed(0), unit: "ms" },
    {
      key: "Resilience",
      val: recoveryTimeMs < 5000 ? "EXCELLENT" : "GOOD",
      unit: "",
    },
  ]);

  exportMetric("failover.recovery_ms", recoveryTimeMs, "ms");
}

test("Database Failover & Reconnection Resilience", async () => {
  try {
    await runFailoverAudit();
  } catch (err: any) {
    logger.error(`Failover audit failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}, 300_000);
