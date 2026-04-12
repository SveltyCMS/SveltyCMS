/**
 * @file tests/benchmarks/cache-performance.test.ts
 * @description Professional benchmark for the Local SDK 3-layer caching system (L1 / L2 / DB).
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";

test("Local SDK Cache Performance Suite", async () => {
  console.log("🚀 Starting SveltyCMS 3-Layer Cache Performance Benchmark...\n");

  const { dbAdapter, getDbInitPromise } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/routes/api/cms");
  const { contentSystem } = await import("@src/content");

  await getDbInitPromise();
  if (!dbAdapter) throw new Error("DB not initialized");
  await contentSystem.initialize("global", false, dbAdapter);

  const cms = new LocalCMS(dbAdapter);
  let collections = await contentSystem.getCollections();

  if (collections.length === 0) {
    console.warn("⚠️ No collections found. Synchronizing mock 'benchmarks' schema...");
    const mockSchema: any = {
      _id: "benchmarks",
      nodeType: "collection",
      collectionDef: {
        _id: "benchmarks",
        name: "benchmarks",
        label: "Benchmarks",
        fields: [],
      },
      name: "benchmarks",
      label: "Benchmarks",
      tenantId: "global",
    };

    // Inject directly into content system state to bypass filesystem scan
    contentSystem.sync([mockSchema]);
    collections = await contentSystem.getCollections();

    // Also ensure physical table exists
    try {
      await dbAdapter.collection.createModel(mockSchema);
    } catch (e) {}
  }

  let collectionId = collections.length > 0 ? (collections[0]._id as string) : "benchmarks";
  const testId = "cache-benchmark-entry";

  console.log(`📊 Targeting collection: "${collectionId}"`);

  // Ensure the test document exists and is cached in L2
  console.log("🔧 Preparing test data and warming L2 cache...");
  await cms.collections
    .create(collectionId, { title: "Cache Benchmark Entry" }, { system: true })
    .catch(async () => {
      // If it exists, we just update it to ensure it's in the DB
      await cms.collections
        .update(collectionId, testId, { title: "Cache Benchmark Entry" }, { system: true })
        .catch(() => {});
    });

  // Warm L2 cache properly
  await cms.collections.findById(collectionId, testId);

  const iterations = 1500;
  const missIterations = 200;

  // 1. CACHE MISS — Pure cold DB read (no cache at all)
  console.log("📉 Measuring Cache Miss (Cold DB Read)...");
  const missResult = await runBenchmark({
    name: "SDK: Cache Miss (Cold DB Read)",
    iterations: missIterations,
    runs: 2,
    onIteration: async () => {
      // Use bypassCache to guarantee DB hit
      await cms.collections.findById(collectionId, testId, { bypassCache: true });
    },
  });

  // 2. CACHE HIT L2 (Global / Service-level cache)
  console.log("📈 Measuring L2 Cache Hit (Global Cache Service)...");
  const hitL2Result = await runBenchmark({
    name: "SDK: Cache Hit L2 (Global Cache Service)",
    iterations,
    runs: 3,
    onIteration: async () => {
      // Use the newly implemented bypassRequestCache to skip L1 but allow L2
      await cms.collections.findById(collectionId, testId, { bypassRequestCache: true });
    },
  });

  // 3. CACHE HIT L1 (Request / In-memory deduplication)
  console.log("⚡ Measuring L1 Cache Hit (Request Memory)...");
  const hitL1Result = await runBenchmark({
    name: "SDK: Cache Hit L1 (Request Memory)",
    iterations,
    runs: 3,
    onIteration: async () => {
      await cms.collections.findById(collectionId, testId); // should hit L1 instantly
    },
  });

  // === Summary ===
  const l2Speedup = (missResult.avgMs / hitL2Result.avgMs).toFixed(1);
  const l1Speedup = (missResult.avgMs / hitL1Result.avgMs).toFixed(1);

  console.log("\n" + "=".repeat(70));
  console.log("   📊 SveltyCMS CACHE LAYER PERFORMANCE SUMMARY");
  console.log("=".repeat(70));
  console.log(
    `Cold DB Read   → Avg: ${missResult.avgMs.toFixed(3)} ms | RPS: ${missResult.rps.toFixed(0)}`,
  );
  console.log(
    `L2 Global Hit  → Avg: ${hitL2Result.avgMs.toFixed(3)} ms | RPS: ${hitL2Result.rps.toFixed(0)} (~${l2Speedup}x faster)`,
  );
  console.log(
    `L1 Request Hit → Avg: ${hitL1Result.avgMs.toFixed(3)} ms | RPS: ${hitL1Result.rps.toFixed(0)} (~${l1Speedup}x faster)`,
  );
  console.log("=".repeat(70) + "\n");

  // Export results
  exportResult(missResult);
  exportResult(hitL2Result);
  exportResult(hitL1Result);
}, 600000);
