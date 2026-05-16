/**
 * @file tests/benchmarks/migration-scale.test.ts
 * @description Enterprise-grade Migration & Bulk I/O benchmark for SveltyCMS.
 * Measures bulk ingestion throughput and post-migration read performance.
 */

import {
  test,
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  TEST_API_SECRET
} from "./benchmark-utils";
import "../unit/setup.ts";
import { logger } from "@utils/logger";

const COLLECTION_ID = "bench_migration_large";
const TOTAL_ENTRIES = 10_000;
const BATCH_SIZE = 500;

let stopServer: (() => Promise<void>) | null = null;

async function runMigrationAudit() {
  console.log(
    `🚀 Starting Migration & Scale Audit (${TOTAL_ENTRIES.toLocaleString()} entries)...\n`,
  );

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();

    await prepareCollection();

    // 1. Bulk Ingestion Benchmark
    console.log(`   → Ingesting ${TOTAL_ENTRIES} entries...`);
    const migrationResult = await runBenchmark({
      name: "Bulk Migration (10k)",
      iterations: Math.ceil(TOTAL_ENTRIES / BATCH_SIZE),
      warmupIterations: 0,
      runs: 1,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async (batchIndex: number) => {
        const batch = Array.from({ length: BATCH_SIZE }, (_, j) => ({
          _id: `mig-${batchIndex}-${j}`,
          title: `Bulk Entry ${batchIndex * BATCH_SIZE + j}`,
          content: "<p>Stress test content for large scale migration.</p>".repeat(8),
          metadata: {
            importedAt: new Date().toISOString(),
            batch: batchIndex,
            tags: ["migration", "benchmark"],
          },
        }));

        const res = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/bulk`, {
          method: "POST",
          headers: {
            "x-test-mode": "true",
            "x-test-secret": TEST_API_SECRET,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(batch),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Bulk create failed: ${res.status} ${text}`);
        }
      },
    });

    await stabilize(2000);

    // 2. Post-Migration Read Performance
    console.log("   → Measuring read performance on large collection...");
    const lookupResult = await runBenchmark({
      name: "Post-Migration Random Lookup",
      iterations: 600,
      warmupIterations: 80,
      runs: 2,
      concurrency: 6,
      silent: true,
      onIteration: async () => {
        const randomId = `mig-${Math.floor(Math.random() * (TOTAL_ENTRIES / BATCH_SIZE))}-${Math.floor(Math.random() * BATCH_SIZE)}`;
        const res = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/${randomId}`, {
          headers: { "x-test-mode": "true", "x-test-secret": TEST_API_SECRET },
        });
        if (!res.ok) throw new Error(`Lookup failed: ${res.status}`);
        await res.text();
      },
    });

    // Reporting
    printTruthTable({
      title: "SVELTYCMS — MIGRATION & SCALE AUDIT",
      shortLabel: "Migration",
      subtitle: `10k Entries • ${getDbType().toUpperCase()}`,
      results: [
        { ...migrationResult, layer: "Ingestion", shortLabel: "Bulk Import" },
        { ...lookupResult, layer: "Read", shortLabel: "Random Lookup" },
      ],
    });

    const throughput = Math.round(TOTAL_ENTRIES / (migrationResult.totalMs / 1000));

    printSummaryTable([
      { key: "Total Migration Time", val: (migrationResult.totalMs / 1000).toFixed(1), unit: "s" },
      { key: "Ingestion Throughput", val: throughput, unit: "entries/s" },
      { key: "Post-Migration Read", val: lookupResult.avgMs, unit: "ms" },
      { key: "Memory Growth", val: (migrationResult.rssDelta || 0).toFixed(1), unit: "MB" },
    ]);

    exportResult({
      ...migrationResult,
      name: "Migration 10k",
      throughput,
      lookupAvgMs: lookupResult.avgMs,
    });
  } catch (err: any) {
    logger.error(`Migration audit failed: ${err.message}`);
    console.error(err);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Migration & scale audit completed.");
}

// ─────────────────────────────────────────────────────────────

async function prepareCollection() {
  const { getDb } = await import("@src/databases/db");
  const db = getDb();

  const schema = {
    _id: COLLECTION_ID,
    name: COLLECTION_ID,
    fields: [
      { db_fieldName: "title", widget: { Name: "Input" }, required: true },
      { db_fieldName: "content", widget: { Name: "RichText" } },
      { db_fieldName: "metadata", widget: { Name: "Json" } },
    ],
    revision: false,
  };

  if (db?.collection?.createModel) {
    await db.collection.createModel(schema).catch(() => {});
  }

  // Clean previous data with permanent delete to prevent E11000 on re-runs
  await db?.crud
    ?.deleteMany?.(COLLECTION_ID, {}, { tenantId: "global" as any, permanent: true })
    .catch(() => {});
}

test("Migration & Large Scale Ingestion", async () => {
  await runMigrationAudit();
}, 900_000); // 15 minutes
