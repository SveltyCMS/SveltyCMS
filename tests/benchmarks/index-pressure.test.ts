/**
 * @file tests/benchmarks/index-pressure.test.ts
 * @description Enterprise Index Pressure audit for SveltyCMS.
 * Measures read performance with sorting and filtering on a 100,000 entry collection.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  TEST_API_SECRET,
} from "./benchmark-utils";
import { logger } from "@utils/logger";

const COLLECTION_ID = "bench_index_pressure";
const ENTRY_COUNT = 100_000;
const BATCH_SIZE = 2000; // Larger batches = faster seeding

let stopServer: (() => Promise<void>) | null = null;

async function runPressureAudit() {
  console.log(
    `🚀 Starting Enterprise Index Pressure Audit (${ENTRY_COUNT.toLocaleString()} entries)...\n`,
  );

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await prepareCollection();

    // Seed data efficiently
    console.log(`   → Seeding ${ENTRY_COUNT} entries...`);
    await seedLargeDataset(baseUrl);

    await stabilize(3000);

    // === Benchmarks ===
    console.log("   → Measuring Sorted Query Performance...");
    const sortResult = await runBenchmark({
      name: "Sorted List (100k rows)",
      iterations: 300,
      warmupIterations: 50,
      runs: 2,
      concurrency: 4,
      silent: true,
      onIteration: async () => {
        const res = await fetch(
          `${baseUrl}/api/collections/${COLLECTION_ID}?sort=score&order=desc&limit=20`,
          { headers: { "x-test-mode": "true", "x-test-secret": TEST_API_SECRET } },
        );
        if (!res.ok) throw new Error(`Sort failed: ${res.status}`);
        await res.json();
      },
    });

    console.log("   → Measuring Filtered Query Performance...");
    const filterResult = await runBenchmark({
      name: "Filtered Query (100k rows)",
      iterations: 300,
      warmupIterations: 50,
      runs: 2,
      concurrency: 4,
      silent: true,
      onIteration: async () => {
        const res = await fetch(
          `${baseUrl}/api/collections/${COLLECTION_ID}?filter[category]=A&limit=20`,
          { headers: { "x-test-mode": "true", "x-test-secret": TEST_API_SECRET } },
        );
        if (!res.ok) throw new Error(`Filter failed: ${res.status}`);
        await res.json();
      },
    });

    printTruthTable({
      title: "SVELTYCMS — INDEX PRESSURE AUDIT",
      shortLabel: "Index Pressure",
      subtitle: `100k Entries • Sort + Filter • ${getDbType().toUpperCase()}`,
      results: [
        { ...sortResult, layer: "Sorted", shortLabel: "Sort DESC" },
        { ...filterResult, layer: "Filtered", shortLabel: "Category Filter" },
      ],
    });

    printSummaryTable([
      { key: "Sorted Query (p95)", val: sortResult.p95Ms || sortResult.avgMs, unit: "ms" },
      { key: "Filtered Query (p95)", val: filterResult.p95Ms || filterResult.avgMs, unit: "ms" },
      { key: "Index Health", val: sortResult.avgMs < 5 ? "EXCELLENT" : "NEEDS WORK", unit: "" },
    ]);

    exportResult(sortResult);
    exportResult(filterResult);
  } catch (err: any) {
    logger.error(`Index Pressure audit failed: ${err.message}`);
    console.error(err);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Index pressure audit completed.");
}

// ─────────────────────────────────────────────────────────────

async function prepareCollection() {
  const { getDb } = await import("@src/databases/db");
  const db = getDb();

  const schema = {
    _id: COLLECTION_ID,
    name: COLLECTION_ID,
    fields: [
      { db_fieldName: "title", widget: { Name: "Input" } },
      { db_fieldName: "score", widget: { Name: "Number" } },
      { db_fieldName: "category", widget: { Name: "Select" } },
    ],
  };

  if (db?.collection?.createModel) {
    await db.collection.createModel(schema).catch(() => {});
  }

  // Clean previous run with permanent delete to prevent E11000 on re-runs
  await db?.crud?.deleteMany?.(COLLECTION_ID, {}, { tenantId: "global" as any, permanent: true }).catch(() => {});
}

async function seedLargeDataset(baseUrl: string) {
  const totalBatches = Math.ceil(ENTRY_COUNT / BATCH_SIZE);

  for (let i = 0; i < totalBatches; i++) {
    const batch = Array.from({ length: BATCH_SIZE }, (_, j) => ({
      _id: `p-${i}-${j}`,
      title: `Pressure Test Entry ${i * BATCH_SIZE + j}`,
      score: Math.floor(Math.random() * 10000),
      category: Math.random() > 0.5 ? "A" : "B",
    }));

    const res = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-mode": "true",
        "x-test-secret": TEST_API_SECRET,
      },
      body: JSON.stringify(batch),
    });

    if (!res.ok) throw new Error(`Seeding failed at batch ${i}`);

    if (i % 8 === 0) process.stdout.write(".");
  }
  process.stdout.write("\n");
}

test("100k Row Index Pressure", async () => {
  await runPressureAudit();
}, 1200000); // 20 minutes
