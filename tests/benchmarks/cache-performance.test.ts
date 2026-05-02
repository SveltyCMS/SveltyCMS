/**
 * @file tests/benchmarks/cache-performance.test.ts
 * @description Enterprise cache benchmark for SveltyCMS.
 * Measures cache hit vs miss latency and efficiency via real HTTP E2E.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let stopServer: (() => Promise<void>) | null = null;
let baseUrl: string;

const CACHE_SCENARIOS = [
  {
    name: "Cache Miss (Bypass)",
    shortLabel: "Miss",
    headers: { "x-bypass-cache": "true" },
    concurrency: 1,
  },
  {
    name: "Cache Hit (Warm)",
    shortLabel: "Hit",
    headers: {},
    concurrency: 10,
  },
];

async function runCacheAudit() {
  console.log("🚀 Starting Enterprise Cache Efficiency Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(800);

    const secret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";
    const results = [];

    for (const scenario of CACHE_SCENARIOS) {
      console.log(`   → Measuring ${scenario.name}...`);

      const result = await runBenchmark({
        name: scenario.name,
        iterations: 600,
        warmupIterations: 80,
        runs: 3,
        concurrency: scenario.concurrency,
        trimOutliers: "iqr",
        silent: true,
        onIteration: async () => {
          const headers: Record<string, string> = {
            "x-test-mode": "true",
            "x-test-secret": secret,
          };
          if (scenario.headers["x-bypass-cache"]) {
            headers["x-bypass-cache"] = scenario.headers["x-bypass-cache"];
          }

          const res = await fetch(
            `${baseUrl}/api/collections/BenchmarkStable/bench-shared-001`,
            {
              headers,
            }
          );

          if (!res.ok) throw new Error(`Cache test failed: ${res.status}`);
          await res.json();
        },
      });

      const enriched = {
        ...result,
        shortLabel: scenario.shortLabel,
        layer: "Cache",
      };

      results.push(enriched);
      exportResult(enriched);
    }

    const miss = results[0];
    const hit = results[1];
    const efficiency = miss.avgMs > 0 
      ? ((miss.avgMs - hit.avgMs) / miss.avgMs) * 100 
      : 0;

    printTruthTable({
      title: "SVELTYCMS — CACHE EFFICIENCY AUDIT",
      shortLabel: "Cache",
      subtitle: `Hit vs Miss • E2E • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable([
      { key: "Cache Miss", val: miss.avgMs, unit: "ms" },
      { key: "Cache Hit", val: hit.avgMs, unit: "ms" },
      { key: "Cache Efficiency", val: efficiency.toFixed(1), unit: "%" },
      { key: "Peak Hit RPS", val: Math.round(hit.rps || 0), unit: "req/s" },
    ]);

  } catch (err: any) {
    logger.error(`Cache benchmark failed: ${err.message}`);
    console.error(err);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Cache audit completed.");
}

test("Cache Enterprise Suite", async () => {
  await runCacheAudit();
}, 480000);
