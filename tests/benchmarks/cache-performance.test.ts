/**
 * @file tests/benchmarks/cache-performance.test.ts
 * @description Professional benchmark for the Local SDK 3-layer caching system (L1 / L2 / DB).
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { logger } from "@utils/logger.server";

export async function runCacheBenchmark() {
  console.log("🚀 Starting SveltyCMS 3-Layer Cache Performance Benchmark...\n");

  logger.level = "silent";

  const { getDb, getDbInitPromise } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/routes/api/cms");
  const { contentSystem } = await import("@src/content");

  await getDbInitPromise();
  const dbAdapter = getDb();
  if (!dbAdapter) throw new Error("DB not initialized");

  await contentSystem.initialize("global", false, dbAdapter);
  const cms = new LocalCMS(dbAdapter);

  // Ensure collection exists
  let collections = contentSystem.getCollections("global") || [];
  if (collections.length === 0) {
    const schema = {
      _id: "benchmarks",
      name: "benchmarks",
      label: "Benchmarks",
      fields: [{ name: "title", type: "text", widget: { Name: "Input" } }],
    };

    if (dbAdapter.collection?.createModel) {
      await dbAdapter.collection.createModel(schema as any);
    }

    if (dbAdapter.content?.nodes?.upsertContentStructureNode) {
      await dbAdapter.content.nodes.upsertContentStructureNode({
        _id: schema._id as any,
        name: schema.name,
        path: `/collection/${schema.name}`,
        nodeType: "collection",
        collectionDef: schema as any,
        tenantId: "global" as any,
      } as any);
    }

    await contentSystem.initialize("global", true, dbAdapter);
    await contentSystem.refresh("global");
    collections = contentSystem.getCollections("global") || [];
  }

  const collectionId = collections.length > 0 ? (collections[0]._id as string) : "benchmarks";
  const testId = "cache-benchmark-entry";

  console.log(`📊 Targeting collection: "${collectionId}"`);

  // Idempotent Seeding
  const collectionName = `collection_${collectionId.replace(/-/g, "_")}`;
  const existing = await dbAdapter.crud.findOne(
    collectionName,
    { _id: testId as any },
    { tenantId: "global" as any },
  );
  if (!existing.success || !existing.data) {
    await dbAdapter.crud.insert(
      collectionName,
      {
        _id: testId as any,
        title: "Cache Benchmark Entry",
        tenantId: "global" as any,
        updatedAt: new Date().toISOString(),
      } as any,
      { tenantId: "global" as any },
    );
  } else {
    await dbAdapter.crud.update(
      collectionName,
      testId as any,
      {
        title: "Cache Benchmark Entry",
        updatedAt: new Date().toISOString(),
      } as any,
      { tenantId: "global" as any },
    );
  }

  // Warm all layers
  await cms.collections.findById(collectionId as any, testId as any, { tenantId: "global" as any });

  const iterations = 3000;
  const runs = 5;
  const warmUp = 500;

  // 1. CACHE MISS
  console.log("📉 Measuring Cache Miss (Cold DB Read)...");
  const missResult = await runBenchmark({
    name: "SDK: Cache Miss (Cold DB Read)",
    iterations,
    runs,
    warmupIterations: warmUp,
    onIteration: async () => {
      await cms.collections.findById(collectionId as any, testId as any, {
        tenantId: "global" as any,
        bypassCache: true,
        bypassRequestCache: true,
      });
    },
    silent: true,
  });

  // 2. L2 Cache Hit
  console.log("📈 Measuring L2 Cache Hit (Global Cache Service)...");
  const hitL2Result = await runBenchmark({
    name: "SDK: Cache Hit L2 (Global Cache Service)",
    iterations,
    runs,
    warmupIterations: warmUp,
    onIteration: async () => {
      await cms.collections.findById(collectionId as any, testId as any, {
        tenantId: "global" as any,
        bypassRequestCache: true,
      });
    },
    silent: true,
  });

  // 3. Full L1 + L2 Hit
  console.log("⚡ Measuring L1 Cache Hit (Request Memory)...");
  const hitL1Result = await runBenchmark({
    name: "SDK: Cache Hit L1 (Request Memory)",
    iterations,
    runs,
    warmupIterations: warmUp,
    onIteration: async () => {
      await cms.collections.findById(collectionId as any, testId as any, {
        tenantId: "global" as any,
      });
    },
    silent: true,
  });

  logger.level = "info";

  // Summary
  const l2Speedup = (missResult.avgMs / hitL2Result.avgMs).toFixed(1);
  const l1Speedup = (missResult.avgMs / hitL1Result.avgMs).toFixed(1);

  console.log("\n" + "=".repeat(85));
  console.log("   📊 SVELTYCMS CACHE LAYER PERFORMANCE SUMMARY");
  console.log("=".repeat(85));
  const table = [
    {
      Layer: "Cold DB Read",
      "Avg (ms)": missResult.avgMs.toFixed(4),
      RPS: Math.round(missResult.rps),
      Speedup: "Baseline",
    },
    {
      Layer: "L2 Global Hit",
      "Avg (ms)": hitL2Result.avgMs.toFixed(4),
      RPS: Math.round(hitL2Result.rps),
      Speedup: `${l2Speedup}x`,
    },
    {
      Layer: "L1 Request Hit",
      "Avg (ms)": hitL1Result.avgMs.toFixed(4),
      RPS: Math.round(hitL1Result.rps),
      Speedup: `${l1Speedup}x`,
    },
  ];
  console.table(table);
  console.log("=".repeat(85) + "\n");

  exportResult(missResult);
  exportResult(hitL2Result);
  exportResult(hitL1Result);
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("Local SDK Cache Performance Suite", async () => {
    await runCacheBenchmark();
  }, 600000);
}
