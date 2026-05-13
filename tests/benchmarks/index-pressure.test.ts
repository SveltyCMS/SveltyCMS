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
  forceRefreshServer,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbLabel,
  TEST_API_SECRET,
  generateRealisticEntry,
} from "./benchmark-utils";
import { logger } from "@utils/logger";

const COLLECTION_ID = "bench_index_pressure";
const ENTRY_COUNT = 100_000;
const BATCH_SIZE = 100; // Smaller batches to avoid parameter limits

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
    await forceRefreshServer(baseUrl);

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
      subtitle: `100k Entries • Sort + Filter • ${getDbLabel()}`,
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
      { db_fieldName: "slug", widget: { Name: "Input" } },
      { db_fieldName: "content", widget: { Name: "RichText" } },
      { db_fieldName: "score", widget: { Name: "Number" } },
      { db_fieldName: "category", widget: { Name: "Select" } },
      { db_fieldName: "author", widget: { Name: "Relation" } },
      { db_fieldName: "tags", widget: { Name: "Input" } },
      { db_fieldName: "metadata", widget: { Name: "Group" } },
    ],
  };

  if (db?.collection?.createModel) {
    await db.collection.createModel(schema).catch(() => {});
  }

  // 🛡️ SECURITY BYPASS: We use bypassTenantCheck: true for benchmark cleanup
  // This ensures we clear data from ANY previous run regardless of the active tenant context.
  await db?.crud
    ?.deleteMany?.(
      COLLECTION_ID,
      {},
      {
        bypassTenantCheck: true,
        permanent: true,
      },
    )
    .catch((err: any) => {
      console.warn(`   [Cleanup] Warning: Failed to clear previous data: ${err.message}`);
    });
}

async function seedLargeDataset(baseUrl: string) {
  const totalBatches = Math.ceil(ENTRY_COUNT / BATCH_SIZE);

  for (let i = 0; i < totalBatches; i++) {
    const batch = Array.from({ length: BATCH_SIZE }, (_, j) => {
      const idx = i * BATCH_SIZE + j;
      return generateRealisticEntry(idx, idx % 10 === 0 ? "heavy" : "medium");
    });

    let retryCount = 0;
    const maxRetries = 5;
    let res: Response;

    while (true) {
      res = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-mode": "true",
          "x-test-secret": TEST_API_SECRET,
        },
        body: JSON.stringify(batch),
      });

      if (res.ok) break;

      if (retryCount < maxRetries) {
        retryCount++;
        const delay = 1000 * retryCount;
        console.warn(
          `   [WARN] Seeding batch ${i} failed (${res.status}). Retrying in ${delay}ms...`,
        );
        await new Promise((r) => setTimeout(r, delay));
        // Try refreshing again if it's a 404 or 500
        if (res.status === 404 || res.status === 500) {
          await forceRefreshServer(baseUrl);
        }
        continue;
      }

      const body = await res.text().catch(() => "N/A");
      throw new Error(
        `Seeding failed at batch ${i}: ${res.status} ${res.statusText}\nBody: ${body.substring(0, 500)}`,
      );
    }

    if (i % 8 === 0) process.stdout.write(".");
  }
  process.stdout.write("\n");
}

test("100k Row Index Pressure", async () => {
  await runPressureAudit();
}, 1200000); // 20 minutes
