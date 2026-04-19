/**
 * @file tests/benchmarks/rest-api-performance.test.ts
 * @description Professional REST API performance suite using the Unified Dispatcher.
 *              Measures endpoint latency and memory overhead with high fidelity.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  checkBenchmarkEnv,
  stabilize,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

export async function runRestApiBenchmark() {
  checkBenchmarkEnv();
  console.log("🚀 Starting SveltyCMS REST API Performance Benchmark...\n");

  logger.level = "silent";

  const { ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  await stabilize();

  const ITERATIONS = 1200;
  const WARMUP = 80;
  const RUNS = 3;

  const endpoints = [
    { name: "System Health (Public)", path: "/system/health" },
    { name: "User Profile (Auth)", path: "/user/me" },
    { name: "Collections List (DB)", path: "/collections" },
    { name: "Create Collection (Write)", path: "/collections", method: "POST" as const },
  ];

  const results: any[] = [];

  for (const ep of endpoints) {
    console.log(`   → Benchmarking ${ep.name}`);

    const result = await runBenchmark({
      name: `REST: ${ep.name}`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      onSetup: stabilize,
      onIteration: async () => {
        const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:4173";
        const url = `${baseUrl}/api${ep.path}`;
        const method = ep.method || "GET";

        const res = await fetch(url, {
          method,
          headers: {
            "x-tenant-id": "global",
            "x-test-secret": process.env.TEST_API_SECRET || "SveltyCMS-Benchmark-Secret-2026",
            "content-type": "application/json",
          },
        });

        if (res.status < 200 || res.status >= 300) {
          throw new Error(`Endpoint ${ep.path} returned ${res.status}`);
        }
        await res.text();
      },
      silent: true,
    });

    results.push(result);
    exportResult(result);
  }

  logger.level = "info";

  // ===================================================================
  // Professional Summary
  // ===================================================================
  console.log("\n" + "=".repeat(140));
  console.log("   📊 SVELTYCMS REST API PERFORMANCE AUDIT (Unified Dispatcher)");
  console.log("   High-Fidelity • In-Process • IQR Trimming • Memory Tracking");
  console.log("=".repeat(140));

  console.log(
    `| ${"Endpoint".padEnd(42)} | ${"Avg Latency".padEnd(24)} | ${"p95".padEnd(14)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(42 + 24 + 14 + 12 + 12 + 6) + "|");

  for (const r of results) {
    const rssStr =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)} MB` : "—";

    const displayName = r.name.replace("REST: ", "");

    console.log(
      `| ${displayName.padEnd(42)} | ` +
        `${r.avgMs.toFixed(4)} ms (±${r.marginOfError.toFixed(3)})`.padEnd(24) +
        ` | ${r.p95Ms.toFixed(3)}`.padEnd(14) +
        ` | ${Math.round(r.rps).toLocaleString().padEnd(12)}` +
        ` | ${rssStr.padEnd(12)} |`,
    );
  }
  console.log("=".repeat(140));

  // Consolidated average for the main matrix
  const avgMs = results.reduce((sum, r) => sum + r.avgMs, 0) / results.length;
  const maxP95 = Math.max(...results.map((r) => r.p95Ms));
  const avgRps = results.reduce((sum, r) => sum + r.rps, 0) / results.length;

  const colRes = results.find((r) => r.name === "REST: Collections List (DB)");
  if (colRes) {
    exportMetric("rest.collections.avg", colRes.avgMs, "ms", {
      p95: colRes.p95Ms,
      rps: colRes.rps,
    });
    exportMetric("rest.collections.p95", colRes.p95Ms, "ms");
    exportMetric("rest.collections.rps", colRes.rps, "req/s");
  }

  exportResult({
    name: "REST (Average)",
    avgMs: Number(avgMs.toFixed(4)),
    p95Ms: Number(maxP95.toFixed(3)),
    rps: Number(avgRps.toFixed(1)),
  });

  console.log(`\n✨ REST Insights:`);
  console.log(`   • Average endpoint latency: ${avgMs.toFixed(3)} ms`);
  console.log(`   • Worst-case p95: ${maxP95.toFixed(3)} ms`);
  console.log(`   • Theoretical max throughput: ~${Math.floor(avgRps)} req/sec`);

  console.log("\n✅ REST API benchmark completed.");
}

test("REST API Performance Suite", async () => {
  await runRestApiBenchmark();
}, 400000);
