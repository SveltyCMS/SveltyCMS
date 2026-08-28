/**
 * @file tests/benchmarks/cold-start-phased.test.ts
 * @description Phased Cold Start & Ready Latency Audit (Optimized)
 * @summary Measures process spawn, dependency hydration, and first-request TTFB readiness.
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

const TOTAL_ITERATIONS = 5;
const HEALTHCHECK_TIMEOUT_MS = 15_000;

async function runColdStartPhasedAudit() {
  console.log("\n🚀 Starting Phased Cold Start Audit...\n");

  const buildExists =
    existsSync("build/index.js") || existsSync(".svelte-kit/output/server/index.js");
  if (!buildExists) {
    console.log("⏭️ No build/ or .svelte-kit/ found — cold start requires build output. Skipping.");
    return;
  }

  const bootTimes: number[] = [];
  let firstColdBootMs: number | null = null;

  for (let i = 0; i < TOTAL_ITERATIONS; i++) {
    console.log(`   → Boot measurement iteration ${i + 1}/${TOTAL_ITERATIONS}...`);

    // Force engine GC cleanup between iterations to avoid startup GC jitter
    if (typeof (globalThis as any).gc === "function") {
      (globalThis as any).gc();
    }
    await stabilize(500);

    let server: any = null;
    const start = performance.now();

    try {
      server = await setupBenchmarkServer();
      const baseUrl = server.baseUrl || "http://localhost:3000";

      // Verify HTTP stack readiness (TTFB probe)
      const probeRes = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(HEALTHCHECK_TIMEOUT_MS),
      }).catch(async () => {
        // Fallback root probe if /api/health is unavailable
        return fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(HEALTHCHECK_TIMEOUT_MS) });
      });

      await probeRes.arrayBuffer().catch(() => {});

      const durationMs = performance.now() - start;
      bootTimes.push(durationMs);

      if (i === 0) {
        firstColdBootMs = durationMs;
      }
    } catch (err: any) {
      console.warn(`  ⚠️ Boot iteration ${i + 1} failed or timed out: ${err.message}`);
    } finally {
      if (server && typeof server.stop === "function") {
        await server.stop().catch(() => {});
      }
    }
  }

  if (bootTimes.length === 0) {
    throw new Error("Phased Cold Start Audit failed: Zero successful boot cycles completed.");
  }

  // ── STATISTICAL CALCULATIONS ──────────────────────────────────────────────
  const sorted = [...bootTimes].sort((a, b) => a - b);
  const minMs = sorted[0];
  const maxMs = sorted[sorted.length - 1];
  const avgCold = bootTimes.reduce((a, b) => a + b, 0) / bootTimes.length;
  const p95Cold = sorted[Math.floor(sorted.length * 0.95)] ?? maxMs;
  const initialCold = firstColdBootMs ?? avgCold;

  const dbType = getDbType().toUpperCase();

  printTruthTable({
    title: "SVELTYCMS — PHASED COLD START AUDIT",
    shortLabel: "Cold Start",
    subtitle: `Build-Based Boot & TTFB Readiness • ${dbType}`,
    results: [
      {
        name: "Initial Cold Boot (Fresh Process)",
        avgMs: initialCold,
        p95Ms: initialCold,
        layer: "Core (Cold)",
      },
      {
        name: "Steady-State Respawn (Average)",
        avgMs: avgCold,
        p95Ms: p95Cold,
        layer: "Core (Warm)",
      },
    ],
  });

  printSummaryTable(
    [
      { key: "Database", val: dbType, unit: "" },
      { key: "Initial Cold Start (P0)", val: initialCold.toFixed(0), unit: "ms" },
      { key: "Fastest Respawn (Min)", val: minMs.toFixed(0), unit: "ms" },
      { key: "Average Boot Latency", val: avgCold.toFixed(0), unit: "ms" },
      { key: "P95 Boot Latency", val: p95Cold.toFixed(0), unit: "ms" },
      { key: "Successful Cycles", val: `${bootTimes.length}/${TOTAL_ITERATIONS}`, unit: "" },
      {
        key: "Rating",
        val: initialCold < 4000 ? "EXCELLENT" : initialCold < 8000 ? "GOOD" : "SLOW",
        unit: "",
      },
    ],
    "Cold Start Summary",
  );

  await exportResult({
    name: "Cold Start (IDLE → HTTP READY)",
    avgMs: avgCold,
    p95Ms: p95Cold,
  }).catch(() => {});
}

test("Cold Start Phased Boot Latency", async () => {
  await runColdStartPhasedAudit();
}, 300_000);
