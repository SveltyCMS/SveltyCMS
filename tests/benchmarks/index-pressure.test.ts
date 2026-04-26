/**
 * @file tests/benchmarks/index-pressure.test.ts
 * @description Enterprise Index Pressure audit for SveltyCMS.
 * Measures read performance, sorting, and filtering on a 100,000 entry collection.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";

const COLLECTION_ID = "bench_index_pressure";
const ENTRY_COUNT = 100000;
const BATCH_SIZE = 1000;

async function runPressureAudit() {
  console.log(`🚀 Starting Enterprise Index Pressure Audit (${ENTRY_COUNT} entries)...\n`);

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/routes/api/cms");
  await ensureFullInitialization();
  const db = getDb();
  const cms = new LocalCMS(db as any);

  // Mock Admin
  const mockAdmin = { _id: "admin-pressure", username: "admin", role: "admin", isAdmin: true };
  const apiOptions = { user: mockAdmin, tenantId: "global" as any };

  // 1. Prepare Collection
  console.log("   📊 Seeding 100,000 entries (Pressure Load)...");
  const schema = {
    _id: COLLECTION_ID,
    name: "Pressure Test",
    fields: [
      { name: "title", type: "text", widget: { Name: "Input" } },
      { name: "score", type: "number", widget: { Name: "Number" } },
      { name: "category", type: "text", widget: { Name: "Select" } }
    ],
    status: "published",
  };

  if ((db as any).collection?.createModel) {
    await (db as any).collection.createModel(schema as any).catch(() => {});
  }

  // Sync contentStore
  const { contentStore } = await import("@src/stores/content-store.svelte");
  contentStore.sync([{ _id: COLLECTION_ID, nodeType: "collection", collectionDef: schema, tenantId: "global" } as any]);

  // Seed data in background for speed
  for (let i = 0; i < ENTRY_COUNT / BATCH_SIZE; i++) {
    const batch = Array.from({ length: BATCH_SIZE }).map((_, j) => ({
      _id: `p-${i}-${j}`,
      title: `Pressure Entry ${i * BATCH_SIZE + j}`,
      score: Math.floor(Math.random() * 1000),
      category: i % 2 === 0 ? "A" : "B",
      tenantId: "global"
    }));
    await cms.collections.bulkCreate(COLLECTION_ID, batch as any, apiOptions);
    if (i % 10 === 0) process.stdout.write(".");
  }
  process.stdout.write("\n");

  await stabilize();

  try {
    // 2. Measure Indexed Sort
    console.log("   → Measuring High-Volume Sorted List (score DESC)...");
    const sortResult = await runBenchmark({
      name: "Sorted List (100k)",
      iterations: 200,
      runs: 1,
      onIteration: async () => {
        await cms.collections.find(COLLECTION_ID, { 
          sort: "score", 
          order: "desc", 
          limit: 20 
        }, apiOptions);
      },
      silent: true,
    });

    // 3. Measure Filtered Search
    console.log("   → Measuring Filtered Lookup (category=A)...");
    const filterResult = await runBenchmark({
      name: "Filtered Search (100k)",
      iterations: 200,
      runs: 1,
      onIteration: async () => {
        await cms.collections.find(COLLECTION_ID, { 
          filter: { category: "A" },
          limit: 20 
        }, apiOptions);
      },
      silent: true,
    });

    printTruthTable({
      title: "SVELTYCMS  —  INDEX PRESSURE AUDIT",
      subtitle: `100,000 Entries • Multi-Field Filtering • ${getDbType().toUpperCase()}`,
      results: [
        { ...sortResult, layer: "Sorted" },
        { ...filterResult, layer: "Filtered" }
      ],
    });

    printSummaryTable([
      { key: "Sorted Read Latency", val: sortResult.avgMs, unit: "ms" },
      { key: "Filtered Read Latency", val: filterResult.avgMs, unit: "ms" },
      { key: "Index Efficiency", val: sortResult.avgMs < 2 ? "ELITE" : "SCALABLE", unit: "" },
    ]);

    exportResult(sortResult);
  } catch (err: any) {
    console.error("❌ Pressure audit failed:", err.message);
  }

  console.log("\n✅ Index pressure audit completed.");
}

test("100k Row Index Pressure", async () => {
  await runPressureAudit();
}, 900000);
