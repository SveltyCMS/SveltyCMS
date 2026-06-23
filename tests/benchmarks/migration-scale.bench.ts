/**
 * @file tests/benchmarks/migration-scale.test.ts
 * @description Migration & Bulk I/O Scale Benchmark
 * @summary Measures bulk ingestion throughput for 10,000 entries and post-migration random lookup performance.
 *
 * ### Features:
 * - Batch bulk ingestion of 10k entries (500 per batch)
 * - Post-migration random ID lookup latency on large collections
 * - Memory footprint measurement during large-scale data import
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
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

const COLLECTION_ID = "bench_migration_large";
const TOTAL_ENTRIES = 10_000;
const BATCH_SIZE = 500;

let stopServer: (() => Promise<void>) | null = null;

async function runMigrationAudit() {
  // pre-existing unused var removed for TS strict mode
  console.log(
    `🚀 Starting Migration & Scale Audit (${TOTAL_ENTRIES.toLocaleString()} entries)...\n`,
  );

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();

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
          _id: `mig-${Date.now()}-${batchIndex}-${j}`,
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
      name: "Post-Migration Read",
      iterations: 600,
      warmupIterations: 80,
      runs: 2,
      concurrency: 6,
      silent: true,
      onIteration: async () => {
        const res = await fetch(
          `${baseUrl}/api/collections/${COLLECTION_ID}?limit=20&sort=title&order=asc`,
          {
            headers: {
              "x-test-mode": "true",
              "x-test-secret": TEST_API_SECRET,
            },
          },
        );
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
      {
        key: "Total Migration Time",
        val: (migrationResult.totalMs / 1000).toFixed(1),
        unit: "s",
      },
      { key: "Ingestion Throughput", val: throughput, unit: "entries/s" },
      { key: "Post-Migration Read", val: lookupResult.avgMs, unit: "ms" },
      {
        key: "Memory Growth",
        val: (migrationResult.rssDelta || 0).toFixed(1),
        unit: "MB",
      },
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
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Migration & Large Scale Ingestion", async () => {
  await runMigrationAudit();
}, 900_000); // 15 minutes
