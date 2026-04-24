/**
 * @file tests/benchmarks/cache-performance.test.ts
 * @description Enterprise cache benchmark for SveltyCMS.
 * Measures hit/miss latencies and memory efficiency via HTTP End-to-End.
 */

import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  STABLE_COLLECTION,
  STABLE_ENTRY_ID,
  ensureStableTestData,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let stopServer: () => Promise<void>;
let apiBaseUrl: string;

beforeAll(async () => {
  const { stop, baseUrl } = await setupBenchmarkServer();
  stopServer = stop;
  apiBaseUrl = baseUrl;

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  const db = getDb();
  await ensureStableTestData(db!);
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

async function runCacheAudit() {
  console.log("🚀 Starting Enterprise Cache Audit (E2E)...\n");

  const secret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";
  const ITERATIONS = 500;
  const RUNS = 2;
  const results: any[] = [];

  const originalLogLevel = logger.level;
  logger.level = "silent";

  try {
    // 1. Cold Read (Bypass)
    console.log("   → Measuring Cache Miss (Bypass)...");
    const missResult = await runBenchmark({
      name: "Cache Miss (Bypass)",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: RUNS,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        const res = await fetch(
          `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
          {
            headers: {
              "x-test-mode": "true",
              "x-test-secret": secret,
              "x-bypass-cache": "true",
            },
          },
        );
        await res.json();
      },
    });
    results.push({ ...missResult, layer: "Network" });

    // 2. Warm Read (Hit)
    console.log("   → Measuring Cache Hit (Warm)...");
    const hitResult = await runBenchmark({
      name: "Cache Hit (Warm)",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: RUNS,
      concurrency: 8,
      silent: true,
      onIteration: async () => {
        const res = await fetch(
          `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
          {
            headers: {
              "x-test-mode": "true",
              "x-test-secret": secret,
            },
          },
        );
        await res.json();
      },
    });
    results.push({ ...hitResult, layer: "Network" });

    printTruthTable({
      title: "SVELTYCMS  —  CACHE EFFICIENCY AUDIT",
      subtitle: "Cold Bypass vs Warm Hit • E2E Pipeline",
      results,
    });

    const efficiency = ((missResult.avgMs - hitResult.avgMs) / missResult.avgMs) * 100;

    printSummaryTable([
      { key: "Cache Miss Latency", val: missResult.avgMs, unit: "ms" },
      { key: "Cache Hit Latency", val: hitResult.avgMs, unit: "ms" },
      { key: "Cache Efficiency", val: efficiency.toFixed(2), unit: "%" },
      { key: "Peak RPS", val: Math.round(hitResult.rps), unit: "req/s" },
    ]);

    for (const r of results) exportResult(r);
  } finally {
    logger.level = originalLogLevel;
  }

  console.log("\n✅ Cache audit completed.");
}

test("Cache Enterprise Suite", async () => {
  await runCacheAudit();
}, 450000);
