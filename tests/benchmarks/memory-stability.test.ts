/**
 * @file tests/benchmarks/memory-stability.test.ts
 * @description High-fidelity memory stability and leak detection benchmark for SveltyCMS.
 *              Runs sustained load while tracking RSS, Heap, and external memory over time.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { exportResult } from "./benchmark-utils";
import { logger } from "@utils/logger.server";
import fs from "node:fs/promises";
import path from "node:path";

const DURATION_SECONDS = 45; // Longer run for better leak detection
const SAMPLING_INTERVAL_MS = 1500; // How often we record memory
const CONCURRENCY = 12;

let memorySnapshots: Array<{
  timestamp: number;
  rssMB: number;
  heapUsedMB: number;
  externalMB: number;
  requestsCompleted: number;
}> = [];

async function recordMemorySnapshot(requestCount: number) {
  const mem = process.memoryUsage();
  memorySnapshots.push({
    timestamp: Date.now(),
    rssMB: Math.round(mem.rss / 1024 / 1024),
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    externalMB: Math.round(mem.external / 1024 / 1024),
    requestsCompleted: requestCount,
  });
}

export async function runMemoryStabilityTest() {
  console.log("🚀 Starting SveltyCMS Memory Stability & Leak Detection Benchmark...\n");

  logger.level = "silent";

  const { ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();

  const { mockDispatch } = await import("./benchmark-utils");

  console.log(
    `Running sustained load for ${DURATION_SECONDS} seconds @ ${CONCURRENCY} concurrency...`,
  );

  memorySnapshots = [];
  let totalRequests = 0;
  let running = true;

  // Record initial memory state
  await recordMemorySnapshot(0);

  const startTime = Date.now();

  // Start memory sampling
  const sampler = setInterval(() => {
    if (running) recordMemorySnapshot(totalRequests);
  }, SAMPLING_INTERVAL_MS);

  // Main load workers
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (running) {
      try {
        await mockDispatch({
          path: "/system/health",
          method: "GET",
        });
        totalRequests++;
      } catch (e) {
        // ignore transient errors
      }
    }
  });

  // Run for fixed duration
  await new Promise((resolve) => setTimeout(resolve, DURATION_SECONDS * 1000));

  running = false;
  clearInterval(sampler);
  await Promise.allSettled(workers);

  const totalDurationMs = Date.now() - startTime;

  // Final snapshot
  await recordMemorySnapshot(totalRequests);

  logger.level = "info";

  // Calculate memory growth
  const first = memorySnapshots[0];
  const last = memorySnapshots[memorySnapshots.length - 1];

  const rssGrowth = last.rssMB - first.rssMB;
  const heapGrowth = last.heapUsedMB - first.heapUsedMB;
  const rps = totalRequests / (totalDurationMs / 1000);

  console.log("\n" + "=".repeat(120));
  console.log("   📈 SVELTYCMS MEMORY STABILITY & LEAK DETECTION REPORT");
  console.log("=".repeat(120));

  console.log(`Total Requests       : ${totalRequests.toLocaleString()}`);
  console.log(`Duration             : ${(totalDurationMs / 1000).toFixed(1)} seconds`);
  console.log(`Average RPS          : ${rps.toFixed(1)} req/sec`);
  console.log(`\nMemory Growth:`);
  console.log(`   RSS              : ${rssGrowth >= 0 ? "+" : ""}${rssGrowth} MB`);
  console.log(`   Heap Used        : ${heapGrowth >= 0 ? "+" : ""}${heapGrowth} MB`);
  console.log(`   External         : ${last.externalMB - first.externalMB} MB`);

  if (rssGrowth > 50 || heapGrowth > 30) {
    console.warn("⚠️  NOTICEABLE MEMORY GROWTH DETECTED — potential memory leak!");
    console.warn("   Investigate: request lifecycle, caches, DB connections, or Sharp instances.");
  } else if (rssGrowth > 15) {
    console.log("⚠️  Moderate memory growth observed.");
  } else {
    console.log("✅ Memory usage appears stable.");
  }

  // Export detailed snapshots + summary
  const report = {
    name: "Memory Stability Test",
    timestamp: new Date().toISOString(),
    durationSeconds: DURATION_SECONDS,
    totalRequests,
    rps: Number(rps.toFixed(1)),
    memoryGrowth: {
      rssMB: rssGrowth,
      heapUsedMB: heapGrowth,
      externalMB: last.externalMB - first.externalMB,
    },
    snapshots: memorySnapshots,
  };

  exportResult({
    name: "Memory Stability (High-Fidelity)",
    iterations: totalRequests,
    totalMs: totalDurationMs,
    avgMs: totalDurationMs / totalRequests,
    rps: Number(rps.toFixed(1)),
    successCount: totalRequests,
    failureCount: 0,
  } as any);

  const resultsDir = process.env.RESULTS_DIR || "tests/benchmarks/results";
  await fs.mkdir(resultsDir, { recursive: true });
  await fs.writeFile(
    path.join(resultsDir, "memory-stability.json"),
    JSON.stringify(report, null, 2),
  );

  console.log(`\n💾 Detailed report exported to memory-stability.json`);
  console.log("✅ Memory Stability benchmark completed.");
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("Memory Stability Under Sustained Load", async () => {
    await runMemoryStabilityTest();
  }, 180000);
}
