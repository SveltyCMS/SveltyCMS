/**
 * @file tests/benchmarks/openapi-performance.test.ts
 * @description High-fidelity benchmark for SveltyCMS OpenAPI specification generation.
 *              Compares cold generation (cache miss) vs warm hit (cached) performance.
 */

import { test } from "bun:test";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { logger } from "@utils/logger.server";

export async function runOpenApiBenchmark() {
  console.log("📄 Starting SveltyCMS OpenAPI Specification Generation Benchmark...\n");

  logger.level = "silent";

  const { ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();

  const { mockDispatch } = await import("./benchmark-utils");

  const ITER_COLD = 12; // Cold generation is expensive
  const ITER_WARM = 800; // Warm hits are very fast
  const WARMUP = 50;
  const RUNS = 3;

  console.log("🔄 Benchmarking OpenAPI generation (cold vs warm)...");

  // 1. Cold Generation (force cache miss)
  const coldResult = await runBenchmark({
    name: "OpenAPI: Cold Generation (Cache Miss)",
    iterations: ITER_COLD,
    warmupIterations: WARMUP,
    concurrency: 1,
    runs: RUNS,
    trimOutliers: "iqr",
    measureMemory: true,
    onIteration: async () => {
      const res = await mockDispatch({
        path: "/api/openapi.json?force=true",
      });
      if (res.status !== 200) throw new Error(`Cold OpenAPI failed: ${res.status}`);
      await res.text();
    },
    silent: true,
  });

  // 2. Warm Generation (cached hit)
  const warmResult = await runBenchmark({
    name: "OpenAPI: Warm Hit (Cached)",
    iterations: ITER_WARM,
    warmupIterations: WARMUP,
    concurrency: 1,
    runs: RUNS,
    trimOutliers: "iqr",
    measureMemory: true,
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
  console.log("\n" + "=".repeat(135));
  console.log("   📄 SVELTYCMS OPENAPI SPECIFICATION GENERATION AUDIT");
  console.log("   Cold vs Warm • High-Fidelity • IQR Trimming • Memory Tracking");
  console.log("=".repeat(135));

  console.log(
    `| ${"Scenario".padEnd(38)} | ${"Avg Latency".padEnd(22)} | ${"p95".padEnd(14)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(12)} | ${"Speedup".padEnd(10)} |`,
  );
  console.log("|" + "-".repeat(38 + 22 + 14 + 12 + 12 + 10 + 6) + "|");

  const scenarios = [
    { name: "Cold Generation (Cache Miss)", result: coldResult, speedup: "—" },
    { name: "Warm Hit (Cached)", result: warmResult, speedup: `${speedup.toFixed(1)}x` },
  ];

  for (const s of scenarios) {
    const r = s.result;
    const rssDelta =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)} MB` : "—";

    console.log(
      `| ${s.name.padEnd(38)} | ` +
        `${r.avgMs.toFixed(4)} ms (±${r.marginOfError.toFixed(3)})`.padEnd(22) +
        ` | ` +
        `${r.p95Ms.toFixed(4)} ms`.padEnd(14) +
        ` | ` +
        `${Math.round(r.rps).toLocaleString()}`.padEnd(12) +
        ` | ` +
        `${rssDelta.padEnd(12)} | ` +
        `${s.speedup.padEnd(10)} |`,
    );
  }
  console.log("=".repeat(135));

  console.log(`\n✨ OpenAPI Insights:`);
  console.log(`   • Cold generation: ${coldResult.avgMs.toFixed(2)} ms (full schema traversal)`);
  console.log(`   • Warm hit: ${warmResult.avgMs.toFixed(3)} ms (${speedup.toFixed(1)}x faster)`);
  console.log(`   • The OpenAPI cache provides massive wins for documentation-heavy endpoints`);
  console.log(`   • Memory delta reflects the cost of dynamic Valibot → OpenAPI schema conversion`);

  // Export both results
  exportResult(coldResult, "openapi-cold.json");
  exportResult(warmResult, "openapi-warm.json");

  console.log("\n✅ OpenAPI benchmark completed.");
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("OpenAPI Export Performance Suite", async () => {
    await runOpenApiBenchmark();
  }, 450000);
}
