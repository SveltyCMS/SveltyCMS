/**
 * @file tests/benchmarks/setup-proxy.test.ts
 * @description Infrastructure Boot & Proxy Routing Benchmark
 * @summary Measures cold-start initialization latency and proxy header parsing overhead for enterprise deployments.
 *
 * ### Features:
 * - Cold-start server boot latency (average and p95)
 * - Proxy header parsing overhead (X-Forwarded-For, X-Forwarded-Proto, X-Forwarded-Host)
 * - Memory footprint measurement during infrastructure initialization
 */

import {
  test,
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runSetupAudit() {
  // pre-existing unused var removed for TS strict mode
  console.log("🚀 Starting Enterprise Setup & Proxy Audit...\n");

  try {
    const results: any[] = [];

    // 1. Cold Start Performance
    console.log("   → Measuring System Cold-Start (Infrastructure Boot)...");
    const coldStarts: number[] = [];

    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const server = await setupBenchmarkServer();
      coldStarts.push(performance.now() - start);
      await server.stop();
      await stabilize(500);
    }

    const avgCold = coldStarts.reduce((a, b) => a + b, 0) / coldStarts.length;
    const sorted = [...coldStarts].sort((a, b) => a - b);
    const p95Cold = sorted[Math.floor(sorted.length * 0.95)];

    // 2. Proxy Header Processing
    console.log("   → Measuring Proxy Header Parsing Overhead...");
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    const proxyResult = await runBenchmark({
      name: "Proxy Header Parsing",
      iterations: 1200,
      warmupIterations: 150,
      runs: 3,
      concurrency: 6,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${baseUrl}/api/system/health`, {
          headers: {
            "x-test-mode": "true",
            "x-test-secret": process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026",
            "X-Forwarded-For": "192.168.1.1, 10.0.0.1, 172.16.0.1",
            "X-Forwarded-Proto": "https",
            "X-Forwarded-Host": "cms.enterprise.com",
            "X-Real-IP": "203.0.113.42",
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.text();
      },
    });
    results.push({
      ...proxyResult,
      shortLabel: "Proxy",
      layer: "Infrastructure",
    });

    printTruthTable({
      title: "SVELTYCMS — INFRASTRUCTURE BOOT & ROUTING AUDIT",
      shortLabel: "Setup",
      subtitle: `Cold Start • Proxy Headers • ${getDbType().toUpperCase()}`,
      results: [{ name: "Cold Start", avgMs: avgCold, p95Ms: p95Cold, layer: "Boot" }, ...results],
    });

    printSummaryTable([
      { key: "Average Cold Start", val: avgCold.toFixed(0), unit: "ms" },
      { key: "p95 Cold Start", val: p95Cold.toFixed(0), unit: "ms" },
      { key: "Proxy Header Parsing", val: proxyResult.avgMs, unit: "ms" },
      {
        key: "Rating",
        val: avgCold < 8000 ? "EXCELLENT" : avgCold < 12000 ? "GOOD" : "SLOW",
        unit: "",
      },
    ]);

    exportResult({
      ...proxyResult,
      coldStartAvgMs: avgCold,
      coldStartP95Ms: p95Cold,
    });
  } catch (err: any) {
    logger.error(`Setup & Proxy benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Setup & Infrastructure Audit", async () => {
  await runSetupAudit();
}, 600000);
