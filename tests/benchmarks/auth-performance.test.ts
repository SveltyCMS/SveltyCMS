/**
 * @file tests/benchmarks/auth-performance.test.ts
 * @description Authentication & RBAC Pipeline Benchmark (Optimized)
 * @summary Measures HTTP auth pipeline performance including session verification and RBAC resolution at 1c and 8c concurrency levels.
 *
 * ### Features:
 * - Session verification throughput at single-concurrency (1c)
 * - Full HTTP auth pipeline stress at 8-concurrent connections
 * - Memory footprint (RSS delta) measurement during auth operations
 */

import {
  test,
  runBenchmark,
  exportResult,
  stabilize,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  TEST_API_SECRET,
  getDbType,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runAuthAudit() {
  console.log(`🚀 Starting Enterprise Auth & RBAC Audit (${getDbType().toUpperCase()})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await stabilize(1000);

    // Cache headers in canonical lowercase format outside hot trails to guard timing precision
    const authHeaders = {
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
    };

    const results = [];

    // 1. Auth Validation (1 concurrent)
    console.log("   → Measuring Auth Validation (1c)...");
    const lightResult = await runBenchmark({
      name: "Auth Validation @ 1c",
      iterations: 600,
      warmupIterations: 80,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${baseUrl}/api/user/me`, {
          method: "GET",
          headers: authHeaders,
        });
        if (!res.ok) throw new Error(`Auth failed: ${res.status}`);

        // Native byte stream collector isolates server roundtrip from client-side tree building
        await res.arrayBuffer();
      },
    });
    results.push({ ...lightResult, layer: "HTTP", shortLabel: "Auth-1c" });

    // 2. Auth Pipeline (8 concurrent)
    console.log("   → Measuring Auth Pipeline (8c)...");
    const httpResult = await runBenchmark({
      name: "HTTP Auth Pipeline @ 8c",
      iterations: 600,
      warmupIterations: 80,
      runs: 2,
      concurrency: 8, // High-concurrency stress profile
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${baseUrl}/api/user/me`, {
          method: "GET",
          headers: authHeaders,
        });
        if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
        await res.arrayBuffer();
      },
    });
    results.push({ ...httpResult, layer: "HTTP", shortLabel: "Auth-8c" });

    printTruthTable({
      title: "SVELTYCMS — AUTHENTICATION TELEMETRY",
      shortLabel: "Auth",
      subtitle: `Session Verification • RBAC Resolution • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable([
      { key: "Auth Latency (1c)", val: lightResult.avgMs, unit: "ms" },
      { key: "Auth Pipeline (8c)", val: httpResult.avgMs, unit: "ms" },
      { key: "Peak Auth RPS", val: Math.round(httpResult.rps), unit: "req/s" },
      {
        key: "Auth Memory RSS Δ",
        val: (httpResult.rssDelta || 0).toFixed(2),
        unit: "MB",
      },
    ]);

    for (const r of results) exportResult(r);
  } catch (err: any) {
    logger.error(`Auth audit failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Auth & RBAC Enterprise Suite", async () => {
  await runAuthAudit();
}, 450000);
