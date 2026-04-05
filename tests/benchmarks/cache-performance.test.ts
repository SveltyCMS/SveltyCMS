/**
 * @file tests/benchmarks/cache-performance.test.ts
 * @description Professional benchmark for the Local SDK 3-layer caching system.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";

test("Local SDK Cache Performance Suite", async () => {
  console.log("🚀 Starting SveltyCMS Cache Performance Benchmark...");

  // Dynamic imports to ensure mocks are applied
  const { dbAdapter, getDbInitPromise } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/routes/api/cms");

  await getDbInitPromise();
  const cms = new LocalCMS(dbAdapter!);
  const targetCollection = "posts";

  // Mock contentManager to return a schema
  const { contentManager: cm } = await import("@src/content");
  (cm as any).getCollectionById = async () => ({ _id: "posts", name: "posts", fields: [] });

  const iterations = 1000;

  // 1. CACHE MISS (Cold Read from DB)
  const missResult = await runBenchmark({
    name: "SDK: Cache Miss (Cold DB Read)",
    iterations: 50, // Fewer iterations for cold reads to avoid accidental warming
    onIteration: async () => {
      // We use a unique ID each time or bypass cache to ensure DB hit
      await cms.collections.findById(targetCollection, "entry-" + Math.random(), {
        bypassCache: true,
      });
    },
  });

  // 2. CACHE HIT L2 (Global Service - Memory/Redis)
  // First, warm the global cache
  await cms.collections.findById(targetCollection, "warm-l2");

  const hitL2Result = await runBenchmark({
    name: "SDK: Cache Hit L2 (Global Cache Service)",
    iterations,
    onIteration: async () => {
      // Create a NEW SDK instance per iteration to bypass L1 (Request Cache)
      const freshCms = new LocalCMS(dbAdapter!);
      await freshCms.collections.findById(targetCollection, "warm-l2");
    },
  });

  // 3. CACHE HIT L1 (Request-Level Deduplication)
  const hitL1Result = await runBenchmark({
    name: "SDK: Cache Hit L1 (Request Memory)",
    iterations,
    onIteration: async () => {
      // Use the SAME SDK instance to hit the internal Map
      await cms.collections.findById(targetCollection, "warm-l2");
    },
  });

  console.log("\n===========================================================");
  console.log("📈 CACHE IMPACT ANALYSIS");
  console.log("===========================================================");
  console.log(`Cold DB Read (p95):   ${missResult.p95Ms.toFixed(4)} ms`);
  console.log(
    `Global L2 Hit (p95):  ${hitL2Result.p95Ms.toFixed(4)} ms (~${(missResult.avgMs / hitL2Result.avgMs).toFixed(1)}x faster)`,
  );
  console.log(
    `Request L1 Hit (p95): ${hitL1Result.p95Ms.toFixed(4)} ms (~${(missResult.avgMs / hitL1Result.avgMs).toFixed(1)}x faster)`,
  );
  console.log("===========================================================\n");

  exportResult(missResult, "sdk-cache-miss-cold-db-read.json");
  exportResult(hitL2Result, "sdk-cache-hit-l2-global-cache-service.json");
  exportResult(hitL1Result, "sdk-cache-hit-l1-request-memory.json");

  process.exit(0);
}, 600000);
