/**
 * @file tests/benchmarks/cache-performance.test.ts
 * @description Enterprise cache benchmark for SveltyCMS.
 * Measures cache hit vs miss latency and efficiency via real HTTP E2E.
 */

import {
  test,
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

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

    // Check if L2 is actually active via health check
    const healthRes = await fetch(`${baseUrl}/api/system/health`, {
      headers: { "x-test-secret": secret },
    });
    const healthData = await healthRes.json();
    const isRedisActive =
      healthData.redis === true ||
      (healthData.services && healthData.services.redis === "connected");

    for (const scenario of CACHE_SCENARIOS) {
      if (scenario.shortLabel === "Hit" && !isRedisActive) {
        console.log(`   → Skipping ${scenario.name} (L2/Redis inactive)...`);
        continue;
      }

      console.log(`   → Measuring ${scenario.name}${!isRedisActive ? " (L1 Only)" : ""}...`);

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

          const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable/bench-shared-001`, {
            headers,
          });

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

    const miss = results.find((r) => r.shortLabel === "Miss");
    const hit = results.find((r) => r.shortLabel === "Hit");

    let efficiency = 0;
    if (miss && hit) {
      efficiency = ((miss.avgMs - hit.avgMs) / miss.avgMs) * 100;
    }

    printTruthTable({
      title: "SVELTYCMS — CACHE EFFICIENCY AUDIT",
      shortLabel: "Cache",
      subtitle: `Hit vs Miss • E2E • ${getDbType().toUpperCase()}`,
      results,
    });

    const summary = [{ key: "Cache Miss", val: miss?.avgMs || 0, unit: "ms" }];
    if (hit) {
      summary.push({ key: "Cache Hit", val: hit.avgMs, unit: "ms" });
      summary.push({ key: "Cache Efficiency", val: parseFloat(efficiency.toFixed(1)), unit: "%" });
      summary.push({ key: "Peak Hit RPS", val: Math.round(hit.rps || 0), unit: "req/s" });
    }

    printSummaryTable(summary);
  } catch (err: any) {
    logger.error(`Cache benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
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
