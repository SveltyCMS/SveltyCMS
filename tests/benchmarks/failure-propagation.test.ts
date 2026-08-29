/**
 * @file tests/benchmarks/failure-propagation.test.ts
 * @description Failure Propagation & Fast-Fail Audit (Optimized)
 * @summary Measures the system's ability to reject invalid requests quickly with minimal resource waste.
 */

import {
  test,
  beforeAll,
  afterAll,
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  requireTestInfrastructure,
  TEST_API_SECRET,
  getDbType,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

let stopServer: (() => Promise<void>) | null = null;
let apiBaseUrl: string;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

beforeAll(async () => {
  requireTestInfrastructure("failure-propagation");
  const { stop, baseUrl } = await setupBenchmarkServer();
  stopServer = stop;
  apiBaseUrl = baseUrl;
}, 120_000);

afterAll(async () => {
  if (stopServer) {
    await stopServer().catch(() => {});
    stopServer = null;
  }
});

export async function runFailurePropagationAudit() {
  await stabilize(500);

  const dbType = getDbType().toUpperCase();
  console.log(`\n🚀 Starting Failure Propagation & Fast-Fail Audit (${dbType})...\n`);

  const ITERATIONS = 300;
  const RUNS = 2;
  const allResults: any[] = [];

  // Pre-allocated static URLs
  const healthUrl = `${apiBaseUrl}/api/system/health`;
  const userUrl = `${apiBaseUrl}/api/user`;
  const invalidCollectionUrl = `${apiBaseUrl}/api/collections/NON_EXISTENT_COLLECTION`;

  // Pre-allocated static headers to avoid prototype traversal and object allocation in hot loops
  const baseHeaders: Record<string, string> = {
    ...benchmarkAuthHeaders(),
    "x-test-mode": "true",
    "x-test-secret": TEST_API_SECRET,
    "content-type": "application/json",
    connection: "keep-alive",
  };

  const invalidAuthHeaders: Record<string, string> = {
    "x-test-mode": "true",
    "x-test-secret": "WRONG_SECRET",
    "content-type": "application/json",
    connection: "keep-alive",
  };

  try {
    // ── 1. BASELINE: VALID HEALTH CHECK ─────────────────────────────────────
    forceGarbageCollection();
    await stabilize(200);

    console.log("    → Measuring Baseline (Valid Health Check @ 4c)...");
    const validRes = await runBenchmark({
      name: "Success: Health Check @ 4c",
      iterations: ITERATIONS,
      warmupIterations: 30,
      runs: RUNS,
      concurrency: 4,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(healthUrl, {
          method: "GET",
          headers: baseHeaders,
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) throw new Error(`Health check failed: HTTP ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });
    allResults.push({ ...validRes, layer: "Baseline", shortLabel: "Health-200" });

    // ── 2. FAILURE PATH: INVALID AUTH (EARLY GATEWAY / MIDDLEWARE) ───────────
    forceGarbageCollection();
    await stabilize(200);

    console.log("    → Measuring Fast-Fail Rejection (Invalid Auth Secret @ 4c)...");
    const failAuthRes = await runBenchmark({
      name: "Fast-Fail: Invalid Auth @ 4c",
      iterations: ITERATIONS,
      warmupIterations: 30,
      runs: RUNS,
      concurrency: 4,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      abortOnErrors: false,
      onIteration: async () => {
        const res = await fetch(userUrl, {
          method: "GET",
          headers: invalidAuthHeaders,
          signal: AbortSignal.timeout(5000),
        });

        // Strict assertion: Must reject with 401/403 rather than crashing (500) or passing (200)
        if (res.status !== 401 && res.status !== 403) {
          throw new Error(`Expected 401/403 auth rejection, got HTTP ${res.status}`);
        }

        await res.arrayBuffer().catch(() => {});
      },
    });
    allResults.push({ ...failAuthRes, layer: "Gateway", shortLabel: "Reject-401" });

    // ── 3. FAILURE PATH: INVALID COLLECTION (APPLICATION CORE 404) ──────────
    forceGarbageCollection();
    await stabilize(200);

    console.log("    → Measuring Deep-Fail Resolution (Invalid Collection 404 @ 4c)...");
    const failDataRes = await runBenchmark({
      name: "Deep-Fail: 404 Collection @ 4c",
      iterations: ITERATIONS,
      warmupIterations: 30,
      runs: RUNS,
      concurrency: 4,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      abortOnErrors: false,
      onIteration: async () => {
        const res = await fetch(invalidCollectionUrl, {
          method: "GET",
          headers: baseHeaders,
          signal: AbortSignal.timeout(5000),
        });

        // Strict assertion: Must return clean 404 not found
        if (res.status !== 404) {
          throw new Error(`Expected 404 collection rejection, got HTTP ${res.status}`);
        }

        await res.arrayBuffer().catch(() => {});
      },
    });
    allResults.push({ ...failDataRes, layer: "Core", shortLabel: "Reject-404" });

    // ── 4. REPORTING & TELEMETRY ────────────────────────────────────────────
    const fastFailSpeedup =
      failAuthRes.avgMs > 0 ? (validRes.avgMs / failAuthRes.avgMs).toFixed(2) : "1.00";

    const errorToSuccessRatio =
      validRes.avgMs > 0 ? (failDataRes.avgMs / validRes.avgMs).toFixed(2) : "1.00";

    printTruthTable({
      title: "SVELTYCMS — FAILURE PROPAGATION AUDIT",
      shortLabel: "Fail-Prop",
      subtitle: `Success Latency vs Fast-Fail Latency • Error Path Analysis • ${dbType}`,
      results: allResults,
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Success Latency (Health 200)", val: validRes.avgMs.toFixed(2), unit: "ms" },
        { key: "Auth Rejection (Fast-Fail 401)", val: failAuthRes.avgMs.toFixed(2), unit: "ms" },
        { key: "404 Rejection (Core 404)", val: failDataRes.avgMs.toFixed(2), unit: "ms" },
        { key: "Fast-Fail Speedup Ratio", val: `${fastFailSpeedup}×`, unit: "" },
        { key: "404 vs Success Overhead", val: `${errorToSuccessRatio}×`, unit: "" },
        {
          key: "Gateway Fast-Fail SLA",
          val: failAuthRes.avgMs <= validRes.avgMs ? "OPTIMAL (≤ Baseline)" : "DEGRADED",
          unit: "",
        },
      ],
      "Failure Propagation Summary",
    );

    exportMetric("failure.health_ms", validRes.avgMs, "ms");
    exportMetric("failure.auth_reject_ms", failAuthRes.avgMs, "ms");
    exportMetric("failure.not_found_ms", failDataRes.avgMs, "ms");
    exportMetric("failure.fast_fail_speedup", parseFloat(fastFailSpeedup) || 1, "x");

    for (const r of allResults) exportResult(r);
  } catch (err: any) {
    console.error("Failure propagation benchmark failed:", err);
    throw err;
  }
}

test("Failure Propagation World Life Suite", async () => {
  await runFailurePropagationAudit();
}, 450_000);
