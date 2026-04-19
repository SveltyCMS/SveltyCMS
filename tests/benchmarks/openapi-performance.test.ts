/**
 * @file tests/benchmarks/openapi-performance.test.ts
 * @description High-fidelity benchmark for SveltyCMS OpenAPI specification generation.
 *              Compares cold generation (cache miss) vs warm hit (cached) performance.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  checkBenchmarkEnv,
  mockDispatch,
  stabilize,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

export async function runOpenApiBenchmark() {
  checkBenchmarkEnv();
  console.log("📄 Starting SveltyCMS OpenAPI Specification Generation Benchmark...\n");

  logger.level = "silent";

  const { ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  await stabilize();

  const ITER_COLD = 15; // Cold generation is expensive
  const ITER_WARM = 1200; // Warm hits are extremely fast
  const WARMUP = 40;
  const RUNS = 3;

  console.log("🔄 Benchmarking OpenAPI generation (cold vs warm)...");

  // 1. Cold Generation (force cache miss)
  const coldResult = await runBenchmark({
    name: "OpenAPI: Cold Generation (Cache Miss)",
    iterations: ITER_COLD,
    warmupIterations: WARMUP,
    runs: RUNS,
    concurrency: 1,
    trimOutliers: "iqr",
    measureMemory: true,
    onSetup: stabilize,
    onIteration: async () => {
      const res = await mockDispatch({
        path: "/api/openapi.json?force=true",
      });
      if (res.status !== 200) throw new Error(`Cold OpenAPI failed: ${res.status}`);
      await res.text();
    },
    silent: true,
  });

  await stabilize();

  // 2. Warm Generation (cached hit)
  const warmResult = await runBenchmark({
    name: "OpenAPI: Warm Hit (Cached)",
    iterations: ITER_WARM,
    warmupIterations: WARMUP,
    runs: RUNS,
    concurrency: 1,
    trimOutliers: "iqr",
    measureMemory: true,
    onSetup: stabilize,
    onIteration: async () => {
      const res = await mockDispatch({
        path: "/api/openapi.json",
      });
      if (res.status !== 200) throw new Error(`Warm OpenAPI failed: ${res.status}`);
      await res.text();
    },
    silent: true,
  });

  logger.level = "info";

  const speedup = coldResult.avgMs / warmResult.avgMs;

  // ===================================================================
  // Professional Summary
  // ===================================================================
  console.log("\n" + "=".repeat(140));
  console.log("   📄 SVELTYCMS OPENAPI SPECIFICATION GENERATION AUDIT");
  console.log("   Cold vs Warm Cache • Dynamic Schema Conversion • High-Fidelity");
  console.log("=".repeat(140));

  console.log(
    `| ${"Scenario".padEnd(42)} | ${"Avg Latency".padEnd(24)} | ${"p95".padEnd(14)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(12)} | ${"Speedup".padEnd(10)} |`,
  );
  console.log("|" + "-".repeat(42 + 24 + 14 + 12 + 12 + 10 + 6) + "|");

  const scenarios = [
    { label: "Cold Generation (Cache Miss)", result: coldResult, speedup: "—" },
    { label: "Warm Hit (Cached)", result: warmResult, speedup: `${speedup.toFixed(1)}x` },
  ];

  for (const s of scenarios) {
    const r = s.result;
    const rssStr =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)} MB` : "—";

    console.log(
      `| ${s.label.padEnd(42)} | ` +
        `${r.avgMs.toFixed(4)} ms (±${r.marginOfError.toFixed(3)})`.padEnd(24) +
        ` | ${r.p95Ms.toFixed(3)}`.padEnd(14) +
        ` | ${Math.round(r.rps).toLocaleString().padEnd(12)}` +
        ` | ${rssStr.padEnd(12)} | ` +
        `${s.speedup.padEnd(10)} |`,
    );
  }
  console.log("=".repeat(140));

  console.log(`\n✨ OpenAPI Insights:`);
  console.log(`   • Cold generation (full schema traversal): ${coldResult.avgMs.toFixed(2)} ms`);
  console.log(
    `   • Warm cache hit: ${warmResult.avgMs.toFixed(4)} ms → ${speedup.toFixed(1)}x faster`,
  );
  console.log(
    `   • OpenAPI caching provides massive wins for /docs and client generation endpoints`,
  );
  console.log(`   • Memory delta reflects dynamic Valibot → OpenAPI 3.1 schema conversion cost`);

  // Export for matrix
  exportResult(coldResult);
  exportResult(warmResult);

  exportMetric("api.openapi.warm.p95", warmResult.p95Ms, "ms", {
    avg: warmResult.avgMs,
    rps: warmResult.rps,
  });
  exportMetric("api.openapi.cold.avg", coldResult.avgMs, "ms", {
    p95: coldResult.p95Ms,
    speedup: speedup.toFixed(1),
  });

  // Consolidated result for easy consumption by enterprise-matrix
  exportResult({
    name: "OpenAPI (Average)",
    avgMs: warmResult.avgMs, // most relevant is warm path
    p95Ms: warmResult.p95Ms,
    rps: warmResult.rps,
    coldMs: coldResult.avgMs,
    speedup: speedup,
  });

  console.log("\n✅ OpenAPI benchmark completed.");
}

test("OpenAPI Specification Performance", async () => {
  await runOpenApiBenchmark();
}, 400000);
