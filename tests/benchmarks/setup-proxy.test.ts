/**
 * @file tests/benchmarks/setup-proxy.test.ts
 * @description Enterprise cold-start and infrastructure routing audit for SveltyCMS.
 * Measures initialization latency and proxy header processing overhead.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  stabilize,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  TEST_API_SECRET,
  getDbType,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

async function runSetupAudit() {
  console.log("🚀 Starting Enterprise Setup & Proxy Audit...\n");

  const originalLogLevel = logger.level;
  logger.level = "silent";

  try {
    const results: any[] = [];

    // 1. Cold Start Performance
    // Measures the time from spawn to health-check success (DB + App Init)
    console.log("   → Measuring System Cold-Start (Infrastructure Boot)...");
    const coldStarts: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const server = await setupBenchmarkServer();
      coldStarts.push(performance.now() - start);
      await server.stop();
      await stabilize();
    }

    const avgCold = coldStarts.reduce((a, b) => a + b, 0) / coldStarts.length;
    const p95Cold = coldStarts.sort((a, b) => a - b)[Math.floor(coldStarts.length * 0.95)];

    // 2. Proxy Header Processing
    // Measures the overhead of parsing X-Forwarded-* headers in the pipeline.
    console.log("   → Measuring Proxy Header Parsing Overhead...");
    const server = await setupBenchmarkServer();
    const baseUrl = server.baseUrl;

    const proxyResult = await runBenchmark({
      name: "Proxy Header Parsing",
      iterations: 1000,
      warmupIterations: 100,
      runs: 2,
      concurrency: 4,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(baseUrl + "/api/system/health", {
          headers: {
            "x-test-secret": TEST_API_SECRET,
            "X-Forwarded-For": "192.168.1.1, 10.0.0.1",
            "X-Forwarded-Proto": "https",
            "X-Forwarded-Host": "cms.enterprise.com",
          },
        });
        await res.text();
      },
    });
    results.push({ ...proxyResult, layer: "Proxy" });

    printTruthTable({
      title: "SVELTYCMS  —  INFRASTRUCTURE BOOT & ROUTING AUDIT",
      subtitle: `Cold Start • Proxy Overhead • ${getDbType().toUpperCase()}`,
      results: [{ ...proxyResult, layer: "Full Stack", overheadPct: 0 }],
    });

    printSummaryTable([
      { key: "Average Cold Start", val: avgCold, unit: "ms" },
      { key: "p95 Cold Start", val: p95Cold, unit: "ms" },
      { key: "Proxy Routing Latency", val: proxyResult.avgMs, unit: "ms" },
      { key: "Cold Start Rating", val: avgCold < 1000 ? "EXCELLENT" : "GOOD", unit: "" },
    ]);

    exportResult(proxyResult);
    await server.stop();
  } finally {
    logger.level = originalLogLevel;
  }

  console.log("\n✅ Setup & proxy audit completed.");
}

test("Setup & Infrastructure Audit", async () => {
  await runSetupAudit();
}, 600000);
