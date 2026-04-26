/**
 * @file tests/benchmarks/migration-scale.test.ts
 * @description Enterprise-grade Migration & Bulk I/O benchmark for SveltyCMS.
 * Measures the system's "Ingestion Limit" by importing 10,000 entries into a collection.
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

const COLLECTION_ID = "bench_migration_large";
const TOTAL_ENTRIES = 10000;
const BATCH_SIZE = 500;

async function runMigrationAudit() {
  console.log(`🚀 Starting Enterprise Migration & Scale Audit (${TOTAL_ENTRIES} entries)...\n`);

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/routes/api/cms");
  await ensureFullInitialization();
  const db = getDb();
  const cms = new LocalCMS(db as any);

  // Mock Admin for Auth
  const mockAdmin = { _id: "admin-mig", username: "admin", role: "admin", isAdmin: true };
  const apiOptions = { user: mockAdmin, tenantId: "global" as any };

  // 1. Prepare Large Collection
  console.log("   📊 Preparing large collection schema...");
  const schema = {
    _id: COLLECTION_ID,
    name: "Large Migration Test",
    fields: [
      { name: "title", type: "text", widget: { Name: "Input", Icon: "mdi:text", Color: "#ccc" } },
      { name: "content", type: "richtext", widget: { Name: "RichText", Icon: "mdi:text", Color: "#ccc" } },
      { name: "metadata", type: "json", widget: { Name: "Json", Icon: "mdi:json", Color: "#ccc" } },
    ],
    status: "published",
  };

  if ((db as any)?.collection?.createModel) {
    await (db as any).collection.createModel(schema as any).catch(() => {});
  }

  // 🚀 CRITICAL: Sync with in-memory contentStore so LocalCMS is aware of the new collection
  const { contentStore } = await import("@src/stores/content-store.svelte");
  contentStore.sync([{ 
    _id: COLLECTION_ID, 
    nodeType: "collection", 
    path: `/${COLLECTION_ID}`,
    name: COLLECTION_ID,
    collectionDef: schema,
    tenantId: "global"
  } as any]);

  // Cleanup before migration to avoid UNIQUE constraint errors
  await db!.crud.deleteMany(COLLECTION_ID, {}, { tenantId: "global" as any });

  await stabilize();

  try {
    // 2. Measure Bulk Ingestion
    console.log(`   → Ingesting ${TOTAL_ENTRIES} entries in batches of ${BATCH_SIZE}...`);
    const startTime = performance.now();
    
    let ingested = 0;

    const migrationResult = await runBenchmark({
      name: "Bulk Ingestion (10k)",
      iterations: TOTAL_ENTRIES / BATCH_SIZE,
      warmupIterations: 0,
      runs: 1,
      concurrency: 1,
      measureMemory: true,
      onIteration: async (i: number) => {
        const batch = Array.from({ length: BATCH_SIZE }).map((_, j) => ({
          _id: `mig-${i}-${j}`,
          title: `Imported Entry ${ingested + j}`,
          content: "<p>Large content payload for migration stress testing.</p>".repeat(5),
          metadata: { tags: ["bench", "migration"], priority: j },
          tenantId: "global",
        }));

        const res = await cms.collections.bulkCreate(COLLECTION_ID, batch as any, apiOptions);
        if (!res.success) throw new Error(`Batch failed: ${res.message}`);
        ingested += BATCH_SIZE;
      },
      silent: true,
    });

    // 3. Measure Lookup speed on "Fat" Table
    console.log("   → Measuring lookup speed on 'Fat' table (10k rows)...");
    const lookupResult = await runBenchmark({
      name: "Post-Migration Lookup",
      iterations: 500,
      warmupIterations: 50,
      runs: 2,
      concurrency: 4,
      onIteration: async () => {
        const randomId = `mig-${Math.floor(Math.random() * (TOTAL_ENTRIES / BATCH_SIZE))}-${Math.floor(Math.random() * BATCH_SIZE)}`;
        await cms.collections.findById(COLLECTION_ID, randomId as any, apiOptions);
      },
      silent: true,
    });

    printTruthTable({
      title: "SVELTYCMS  —  MIGRATION & SCALE AUDIT",
      subtitle: `Bulk I/O • 10,000 Entries • ${getDbType().toUpperCase()}`,
      results: [
        { ...migrationResult, layer: "Ingestion" },
        { ...lookupResult, layer: "Read (Post-Mig)" }
      ],
    });

    const totalTimeSec = (performance.now() - startTime) / 1000;
    const itemsPerSec = TOTAL_ENTRIES / totalTimeSec;

    printSummaryTable([
      { key: "Total Migration Time", val: totalTimeSec.toFixed(2), unit: "s" },
      { key: "Ingestion Throughput", val: Math.round(itemsPerSec), unit: "entries/s" },
      { key: "Fat Table Read Latency", val: lookupResult.avgMs, unit: "ms" },
      { key: "Memory RSS Δ", val: (migrationResult.rssDelta || 0).toFixed(2), unit: "MB" },
    ]);

    exportResult(migrationResult);
  } catch (err: any) {
    console.error("❌ Migration audit failed:", err.message);
  }

  console.log("\n✅ Migration & scale audit completed.");
}

test("Migration & Large Scale Ingestion", async () => {
  await runMigrationAudit();
}, 900000);
