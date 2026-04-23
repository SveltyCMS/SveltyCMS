/**
 * @file tests/benchmarks/auth-performance.test.ts
 * @description Enterprise authentication benchmark for SveltyCMS.
 * Measures session validation, RBAC resolution, and middleware overhead under multi-concurrency.
 */
import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  mockDispatch,
  setupBenchmarkServer,
  printAuditTable,
  printSummaryTable,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let stopServer: () => Promise<void>;

beforeAll(async () => {
  const { stop } = await setupBenchmarkServer();
  stopServer = stop;
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

export async function runAuthBenchmark() {
  console.log("🚀 Starting Enterprise Auth & RBAC Benchmark...\n");

  logger.level = "silent";

  const { ensureFullInitialization, getDb } = await import("@src/databases/db");
  await ensureFullInitialization();

  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const auth = db.auth;
  await stabilize();

  const RUNS = 3;
  const ITERATIONS = 1200;
  const WARMUP = 100;
  const concurrencyLevels = [1, 8];
  const allResults: any[] = [];

  // 1. Session Validation
  for (const concurrency of concurrencyLevels) {
    const result = await runBenchmark({
      name: `Session Validation @ ${concurrency}c`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency,
      trimOutliers: "iqr",
      measureMemory: true,
      tolerateErrors: true,
      silent: true,
      onSetup: stabilize,
      onIteration: async () => {
        await auth.validateSession("benchmark-session-id" as any);
      },
    });
    allResults.push(result);
  }

  // 2. Middleware
  for (const concurrency of concurrencyLevels) {
    const result = await runBenchmark({
      name: `Middleware Auth @ ${concurrency}c`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency,
      trimOutliers: "iqr",
      measureMemory: true,
      tolerateErrors: true,
      silent: true,
      onSetup: stabilize,
      onIteration: async () => {
        const res = await mockDispatch({
          path: "/api/user/me",
          headers: { authorization: "Bearer benchmark-token" },
        });
        await res.text();
      },
    });
    allResults.push(result);
  }

  logger.level = "info";

  printAuditTable({
    title: "SVELTYCMS  —  AUTH & RBAC",
    subtitle: "IQR trimmed • 3 runs × 1 200 iters • avg / p95 / RPS",
    results: allResults,
  });

  const middleware1 = allResults.find((r) => r.name.includes("Middleware Auth @ 1c"));
  const maxRps = Math.max(...allResults.map((r) => r.rps));

  printSummaryTable([
    { key: "Avg Auth Latency", val: middleware1?.avgMs || 0, unit: "ms" },
    { key: "p95 Auth Latency", val: middleware1?.p95Ms || 0, unit: "ms" },
    { key: "Max Auth Throughput", val: Math.round(maxRps), unit: "req/s" },
  ]);

  for (const r of allResults) exportResult(r);
  exportMetric("auth.latency.avg", middleware1?.avgMs || 0, "ms");
  exportMetric("auth.rps.max", maxRps, "req/s");

  console.log("\n✅ Authentication benchmark completed.");
}

test("Auth & RBAC Enterprise Suite", async () => {
  await runAuthBenchmark();
}, 450000);
