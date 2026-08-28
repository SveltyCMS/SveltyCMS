/**
 * @file tests/benchmarks/cache-performance.test.ts
 * @description Cache Performance Benchmark (Optimized)
 * @summary Measures cache hit vs miss latency and efficiency via real HTTP end-to-end requests.
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
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;
let baseUrl: string;

const ENTRY_ID = "20000000-0000-4000-8000-000000000001";
const COLLECTION_ID = "BenchmarkStable";

async function runCacheAudit() {
  console.log("🚀 Starting Enterprise Cache Efficiency Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(500);

    const results = [];

    // Robust health probe for cache topology check
    let isRedisActive = false;
    try {
      const healthRes = await fetch(`${baseUrl}/api/system/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (healthRes.ok) {
        const healthData = (await healthRes.json()) as any;
        isRedisActive =
          healthData?.redis === true ||
          healthData?.services?.redis === "connected" ||
          healthData?.cache?.l2 === true;
      }
      await healthRes.arrayBuffer().catch(() => {});
    } catch {
      // Non-fatal: Default to L1 in-memory caching
    }

    const baseHeaders: HeadersInit = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
      connection: "keep-alive",
    };

    // Pre-allocate static URLs to prevent URL string allocations in benchmark loop
    const hitUrl = `${baseUrl}/api/collections/${COLLECTION_ID}/${ENTRY_ID}`;
    const missUrl = `${baseUrl}/api/collections/${COLLECTION_ID}/${ENTRY_ID}?bypassCache=true`;

    // ── 1. PRE-WARM AND VERIFY CACHE LAYER ──────────────────────────────────
    // Prime the entry into L1/L2
    const primeRes = await fetch(hitUrl, { headers: baseHeaders });
    await primeRes.arrayBuffer().catch(() => {});

    // Verify cache hit status on subsequent call
    const verifyRes = await fetch(hitUrl, { headers: baseHeaders });
    const cacheHeader =
      verifyRes.headers.get("x-cache") || verifyRes.headers.get("cf-cache-status");
    await verifyRes.arrayBuffer().catch(() => {});

    console.log(
      `   → Cache Topology: ${isRedisActive ? "L1 (Memory) + L2 (Redis)" : "L1 (In-Memory Only)"}` +
        (cacheHeader ? ` [Header: ${cacheHeader}]` : ""),
    );

    const CACHE_SCENARIOS = [
      {
        name: "Cache Miss (Bypass)",
        shortLabel: "Miss",
        targetUrl: missUrl,
        concurrency: 1,
      },
      {
        name: `Cache Hit (${isRedisActive ? "L1/L2 Warm" : "L1 Warm"})`,
        shortLabel: "Hit",
        targetUrl: hitUrl,
        concurrency: 1,
      },
    ];

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
          const res = await fetch(scenario.targetUrl, {
            method: "GET",
            headers: baseHeaders,
          });

          if (!res.ok) throw new Error(`Cache benchmark HTTP error: ${res.status}`);

          // Drain response to release socket back to keep-alive pool instantly
          await res.arrayBuffer();
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

    // ── REPORTING & METRICS ─────────────────────────────────────────────────
    const miss = results.find((r) => r.shortLabel === "Miss");
    const hit = results.find((r) => r.shortLabel === "Hit");

    const efficiency =
      miss && hit && miss.avgMs > 0 ? ((miss.avgMs - hit.avgMs) / miss.avgMs) * 100 : 0;

    const speedup = miss && hit && hit.avgMs > 0 ? (miss.avgMs / hit.avgMs).toFixed(2) : "1.00";

    const dbType = getDbType().toUpperCase();

    printTruthTable({
      title: "SVELTYCMS — CACHE EFFICIENCY AUDIT",
      shortLabel: "Cache",
      subtitle: `Hit vs Miss • E2E HTTP • ${dbType}`,
      results,
    });

    const summary = [
      { key: "Database", val: dbType, unit: "" },
      { key: "Cache Backend", val: isRedisActive ? "L1 + Redis" : "L1 In-Memory", unit: "" },
      { key: "Cache Miss Latency", val: miss ? miss.avgMs.toFixed(2) : "0.00", unit: "ms" },
      { key: "Cache Hit Latency", val: hit ? hit.avgMs.toFixed(2) : "0.00", unit: "ms" },
      { key: "Speedup Factor", val: `${speedup}×`, unit: "" },
      { key: "Cache Efficiency", val: efficiency.toFixed(1), unit: "%" },
      { key: "Peak Hit Throughput", val: hit ? hit.rps.toFixed(0) : "0", unit: "RPS" },
    ];

    printSummaryTable(summary, "Cache Performance Summary");
  } catch (err: any) {
    logger.error(`Cache benchmark failed: ${err.message}`);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Cache Enterprise Suite", async () => {
  await runCacheAudit();
}, 480_000);
