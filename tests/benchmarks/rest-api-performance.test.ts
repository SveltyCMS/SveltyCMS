/**
 * @file tests/benchmarks/rest-api-performance.test.ts
 * @description
 * Professional REST API performance suite using the Serverless Dispatcher.
 * Measures individual endpoint latency and memory overhead.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  checkBenchmarkEnv,
  mockDispatch,
  stabilize,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

async function runWithMemoryTracking(_name: string, fn: () => Promise<any>) {
  const memBefore = process.memoryUsage();
  const result = await fn();
  const memAfter = process.memoryUsage();

  const rssDelta = (memAfter.rss - memBefore.rss) / 1024 / 1024;
  return { result, rssDelta };
}

export async function runRestApiBenchmark() {
  checkBenchmarkEnv();
  console.log("🚀 Starting SveltyCMS REST Performance Benchmark (High-Fidelity)...\n");

  logger.level = "silent";

  const { ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  await stabilize();

  const ITERATIONS = 800;
  const WARMUP = 50;
  const RUNS = 3;

  const endpoints = [
    { name: "/api/system/health (Public)", path: "/system/health" },
    { name: "/api/user/me (Auth)", path: "/user/me" },
    { name: "/api/collections (DB)", path: "/collections" },
  ];

  const results: any[] = [];

  for (const ep of endpoints) {
    console.log(`   → Benchmarking ${ep.name}`);

    const res = await runWithMemoryTracking(ep.name, () =>
      runBenchmark({
        name: ep.name,
        iterations: ITERATIONS,
        warmupIterations: WARMUP,
        concurrency: 1,
        runs: RUNS,
        trimOutliers: "iqr",
        onIteration: async () => {
          const res = await mockDispatch({ path: ep.path });
          if (res.status !== 200) throw new Error(`Health failed: ${res.status}`);
          await res.text();
        },
        silent: true,
      }),
    );

    results.push({ ...res.result, rssDelta: res.rssDelta });
  }

  logger.level = "info";

  // ===================================================================
  // Professional Summary
  // ===================================================================
  console.log("\n" + "=".repeat(130));
  console.log("   📊 SVELTYCMS REST API PERFORMANCE AUDIT (DISPATCHED)");
  console.log("   High-Fidelity • No Network Overhead • IQR Trimming • 95% Confidence");
  console.log("=".repeat(130));

  console.log(
    `| ${"Endpoint".padEnd(38)} | ${"Avg Latency".padEnd(22)} | ${"p95".padEnd(14)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(38 + 22 + 14 + 12 + 12 + 6) + "|");

  for (const r of results) {
    const rssDeltaStr =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)} MB` : "—";
    console.log(
      `| ${r.name.padEnd(38)} | ` +
        `${r.avgMs.toFixed(4)} ms (±${r.marginOfError.toFixed(3)})`.padEnd(22) +
        ` | ` +
        `${r.p95Ms.toFixed(4)} ms`.padEnd(14) +
        ` | ` +
        `${Math.round(r.rps).toLocaleString()}`.padEnd(12) +
        ` | ` +
        `${rssDeltaStr.padEnd(12)} |`,
    );
  }
  console.log("=".repeat(130));

  results.forEach((r) => exportResult(r));
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("REST API Professional Performance Suite (In-Process Dispatcher)", async () => {
    await runRestApiBenchmark();
  }, 300000);
}
