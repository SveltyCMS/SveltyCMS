/**
 * @file tests/benchmarks/setup-proxy.test.ts
 * @description Enterprise setup & proxy benchmark for SveltyCMS.
 * Measures initialization latencies and request-routing overhead.
 */
import { beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, stabilize, setupBenchmarkServer, printAuditTable } from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let stopServer: () => Promise<void>;

beforeAll(async () => {
  const { stop } = await setupBenchmarkServer();
  stopServer = stop;
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

export async function runSetupProxyBenchmark() {
  console.log("🚀 Starting Enterprise Setup & Proxy Benchmark...\n");

  await stabilize();

  const RUNS = 3;
  const ITERATIONS = 1200;
  const WARMUP = 150;
  const concurrencyLevels = [1, 8];
  const allResults: any[] = [];

  // 1. Health Check (Proxy fast-path)
  for (const concurrency of concurrencyLevels) {
    const result = await runBenchmark({
      name: `Proxy Health @ ${concurrency}c`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        // Direct dispatcher call for health
        const { getSystemState } = await import("@src/stores/system/state");
        getSystemState();
      },
    });
    allResults.push(result);
  }

  logger.level = "info";

  printAuditTable({
    title: "SVELTYCMS  —  SETUP & PROXY",
    subtitle: "Initialization & Routing Overhead • 3 runs × 1 200 iters",
    results: allResults,
  });
}

import { test } from "bun:test";
test("Setup & Proxy Benchmark", async () => {
  await runSetupProxyBenchmark();
}, 300000);
