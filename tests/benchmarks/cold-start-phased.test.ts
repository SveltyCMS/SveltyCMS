/**
 * @file tests/benchmarks/cold-start-phased.test.ts
 * @description Phased Cold Start Audit (Optimized)
 * @summary Measures server cold-start latency to READY state, using the built server.
 *
 * ### Features:
 * - Cold start measurement via setupBenchmarkServer()
 * - Requires build/ or .svelte-kit/ to exist
 * - Skips gracefully when no build output is available
 */

import {
  test,
  printTruthTable,
  printSummaryTable,
  getDbType,
  exportResult,
  setupBenchmarkServer,
  stabilize,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { existsSync } from "node:fs";

async function runColdStartPhasedAudit() {
  console.log("\n🚀 Starting Phased Cold Start Audit...\n");

  const buildExists =
    existsSync("build/index.js") || existsSync(".svelte-kit/output/server/index.js");
  if (!buildExists) {
    console.log("⏭️ No build/ or .svelte-kit/ found — cold start requires build. Skipping.");
    return;
  }

  const coldStarts: number[] = [];
  const TOTAL_ITERATIONS = 5;

  // oxlint-disable-next-line eslint/no-unreachable-loop
  for (let i = 0; i < TOTAL_ITERATIONS; i++) {
    console.log(`   → Cold start iteration ${i + 1}/${TOTAL_ITERATIONS}...`);
    const start = performance.now();
    let server: any = null;

    try {
      server = await setupBenchmarkServer();
      coldStarts.push(performance.now() - start);
    } finally {
      // Ensure the background infrastructure process is dropped cleanly before proceeding
      if (server && typeof server.stop === "function") {
        await server.stop().catch(() => {});
      }
      await stabilize(500);
    }
  }

  const avgCold = coldStarts.reduce((a, b) => a + b, 0) / coldStarts.length;
  const sorted = [...coldStarts].sort((a, b) => a - b);

  // Guard mathematical precision boundary for non-destructive p95 resolution mapping
  const p95Cold = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1]!;

  printTruthTable({
    title: "SVELTYCMS — PHASED COLD START AUDIT",
    shortLabel: "Cold Start",
    subtitle: `Build-Based Boot • ${getDbType().toUpperCase()}`,
    results: [
      {
        name: "Cold Start (IDLE → READY)",
        avgMs: avgCold,
        p95Ms: p95Cold,
        layer: "Core",
      },
    ],
  });

  printSummaryTable([
    { key: "Average Cold Start", val: avgCold.toFixed(0), unit: "ms" },
    { key: "p95 Cold Start", val: p95Cold.toFixed(0), unit: "ms" },
    {
      key: "Rating",
      val: avgCold < 8000 ? "EXCELLENT" : avgCold < 12000 ? "GOOD" : "SLOW",
      unit: "",
    },
  ]);

  exportResult({
    name: "Cold Start (IDLE → READY)",
    avgMs: avgCold,
    p95Ms: p95Cold,
  });
}

test("Cold Start Phased Boot Latency", async () => {
  await runColdStartPhasedAudit();
}, 300000);
