/**
 * @file tests/benchmarks/memory-stability.test.ts
 * @description Sustained mixed-load test to evaluate memory stability, GC behavior, and potential leaks.
 */

import { test } from "bun:test";
import { exportResult } from "./benchmark-utils";
import { safeFetch } from "../integration/helpers/server";

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:4173";
const TEST_API_SECRET = process.env.TEST_API_SECRET || "SveltyCMS-Benchmark-Secret-2026";

const DURATION_MS = 60_000; // 60 seconds sustained load
const SAMPLING_INTERVAL_MS = 1500;

test("Memory Stability Under Sustained Realistic Load", async () => {
  console.log("🚀 Starting Memory Stability Benchmark (60s sustained mixed load)...");

  const authHeaders = {
    "Content-Type": "application/json",
    "x-test-secret": TEST_API_SECRET,
  };

  const timeline: any[] = [];
  let totalRequests = 0;
  let running = true;

  // Background memory sampler
  const sampler = setInterval(() => {
    const mem = process.memoryUsage();
    timeline.push({
      timestamp: Date.now(),
      elapsedSec: ((Date.now() - startTime) / 1000).toFixed(1),
      rssMb: (mem.rss / 1024 / 1024).toFixed(2),
      heapUsedMb: (mem.heapUsed / 1024 / 1024).toFixed(2),
      heapTotalMb: (mem.heapTotal / 1024 / 1024).toFixed(2),
      externalMb: (mem.external / 1024 / 1024).toFixed(2),
      requestsSoFar: totalRequests,
    });
  }, SAMPLING_INTERVAL_MS);

  console.log(`📡 Running mixed workload for ${DURATION_MS / 1000}s...`);

  const startTime = Date.now();

  // Mixed workload workers
  const concurrency = 25;
  const workers = Array.from({ length: concurrency }, async (_, workerId) => {
    while (running) {
      try {
        const roll = Math.random() * 100;

        if (roll < 55) {
          // Read-heavy
          await safeFetch(`${API_BASE_URL}/api/collections?limit=12`, { headers: authHeaders });
        } else if (roll < 75) {
          // Write
          await safeFetch(`${API_BASE_URL}/api/collections/benchmark-memory-flood`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ title: `Load test ${workerId}-${Date.now()}` }),
          }).catch(() => {});
        } else if (roll < 90) {
          // GraphQL
          await safeFetch(`${API_BASE_URL}/api/graphql`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ query: "{ me { username role } }" }),
          });
        } else {
          // Light media / system
          await safeFetch(`${API_BASE_URL}/api/system/health`, { headers: authHeaders });
        }

        totalRequests++;
      } catch {
        // Ignore transient network errors under heavy load
      }
    }
  });

  // Run for exact duration
  await new Promise((resolve) => setTimeout(resolve, DURATION_MS));
  running = false;

  await Promise.all(workers);
  clearInterval(sampler);

  const endTime = Date.now();
  const actualDuration = (endTime - startTime) / 1000;

  const finalMem = process.memoryUsage();
  const initialHeap = timeline[0]?.heapUsedMb ? parseFloat(timeline[0].heapUsedMb) : 0;
  const finalHeap = finalMem.heapUsed / 1024 / 1024;
  const heapGrowthMb = (finalHeap - initialHeap).toFixed(2);

  const result = {
    name: "Memory Stability (Mixed Load)",
    durationSeconds: actualDuration.toFixed(1),
    totalRequests,
    avgRps: (totalRequests / actualDuration).toFixed(2),
    heapGrowthMb,
    maxHeapUsedMb: Math.max(...timeline.map((t) => parseFloat(t.heapUsedMb || 0))),
    finalHeapUsedMb: finalHeap.toFixed(2),
    timeline,
    timestamp: new Date().toISOString(),
  };

  console.log("\n" + "=".repeat(90));
  console.log("📊 MEMORY STABILITY SUMMARY");
  console.log("=".repeat(90));
  console.log(`Duration          : ${actualDuration.toFixed(1)} seconds`);
  console.log(`Total Requests    : ${totalRequests.toLocaleString()}`);
  console.log(`Average Throughput: ${result.avgRps} req/sec`);
  console.log(`Heap Growth       : ${heapGrowthMb} MB`);
  console.log(`Peak Heap Used    : ${result.maxHeapUsedMb} MB`);
  console.log("=".repeat(90));

  if (parseFloat(heapGrowthMb) > 80) {
    console.warn("⚠️  Significant heap growth detected — possible memory leak");
  } else if (parseFloat(heapGrowthMb) > 30) {
    console.warn("⚠️  Moderate heap growth — monitor in long-running scenarios");
  } else {
    console.log("✅ Memory behavior looks stable");
  }

  exportResult(result as any, "memory-stability.json");
}, 120000); // 120s timeout
