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
  updateBenchmarkDocumentation,
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

  console.log("\n" + "=".repeat(120));
  console.log("🔐 SVELTYCMS AUTH & RBAC ENTERPRISE REPORT");
  console.log("=".repeat(120));

  for (const r of allResults) {
    console.log(
      `| ${r.name.padEnd(34)} | ` +
        `${r.avgMs.toFixed(3)} ms`.padEnd(12) +
        ` | ${r.p95Ms.toFixed(3)}`.padEnd(12) +
        ` | ${Math.round(r.rps).toLocaleString().padEnd(12)} |`,
    );
  }
  console.log("=".repeat(120));

  const middleware1 = allResults.find((r) => r.name.includes("Middleware Auth @ 1c"));
  const maxRps = Math.max(...allResults.map((r) => r.rps));

  exportMetric("auth.middleware.avg", middleware1?.avgMs || 0, "ms");
  exportMetric("auth.middleware.p95", middleware1?.p95Ms || 0, "ms");
  exportMetric("auth.max_rps", maxRps, "req/s");

  const aggregate = {
    name: "Auth Summary",
    avgMs: middleware1?.avgMs || 0,
    p95Ms: middleware1?.p95Ms || 0,
    rps: maxRps,
    shortLabel: "Auth Trace",
  };
  exportResult(aggregate);
  console.log("\n✅ Authentication benchmark completed.");
  await updateBenchmarkDocumentation();
}

test("Auth & RBAC Enterprise Suite", async () => {
  await runAuthBenchmark();
}, 450000);
