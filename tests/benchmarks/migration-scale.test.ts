/**
 * @file tests/benchmarks/migration-scale.test.ts
 * @description Migration & Bulk I/O Scale Benchmark (Optimized)
 * @summary Measures bulk ingestion throughput for 10,000 entries, random point-lookups, and indexed range scans across large datasets.
 */

import { randomUUID } from "node:crypto";
import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

const COLLECTION_ID = "bench_migration_large";
const TOTAL_ENTRIES = 10_000;
const BATCH_SIZE = 500;
const TOTAL_BATCHES = Math.ceil(TOTAL_ENTRIES / BATCH_SIZE);

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

const STATIC_CONTENT = "<p>Stress test content for large scale migration.</p>".repeat(4);

/**
 * Pre-serializes bulk batch payloads ahead of time to eliminate JSON stringification overhead in hot loops.
 */
function precomputeBulkPayloads(): {
  batches: string[];
  allIds: string[];
} {
  const allIds: string[] = [];
  const batches = Array.from({ length: TOTAL_BATCHES }, (_, batchIndex) => {
    const batch = Array.from({ length: BATCH_SIZE }, (_, j) => {
      const absoluteIndex = batchIndex * BATCH_SIZE + j;
      const id = randomUUID();
      allIds.push(id);
      return {
        _id: id,
        title: `Bulk Entry ${absoluteIndex.toString().padStart(6, "0")}`,
        content: STATIC_CONTENT,
        count: absoluteIndex,
        metadata: {
          importedAt: "2026-08-28T12:00:00.000Z",
          batch: batchIndex,
          tags: ["migration", "scale_test"],
        },
      };
    });
    return JSON.stringify(batch);
  });
  return { batches, allIds };
}

async function runMigrationAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(
    `🚀 Starting Migration & Scale Audit (${TOTAL_ENTRIES.toLocaleString()} entries • ${dbType})...\n`,
  );

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(1000);

    const baseHeaders: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
      connection: "keep-alive",
    };

    const bulkUrl = `${baseUrl}/api/collections/${COLLECTION_ID}/bulk`;
    const listUrl = `${baseUrl}/api/collections/${COLLECTION_ID}?limit=20&sort=title&order=asc`;

    // Pre-serialize all batch JSON payloads
    console.log(`   → Pre-serializing ${TOTAL_BATCHES} batches (${BATCH_SIZE} items/batch)...`);
    const { batches: serializedBatches, allIds } = precomputeBulkPayloads();

    const results: any[] = [];

    // ── 1. BULK INGESTION BENCHMARK ──────────────────────────────────────────
    forceGarbageCollection();
    await stabilize(200);

    console.log(
      `   → Ingesting ${TOTAL_ENTRIES.toLocaleString()} entries in ${TOTAL_BATCHES} batches...`,
    );
    const t0 = performance.now();

    const migrationResult = await runBenchmark({
      name: `Bulk Migration (${TOTAL_ENTRIES / 1000}k docs)`,
      iterations: TOTAL_BATCHES,
      warmupIterations: 0,
      runs: 1,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async (batchIndex: number) => {
        const payload = serializedBatches[batchIndex % serializedBatches.length]!;

        const res = await fetch(bulkUrl, {
          method: "POST",
          headers: baseHeaders,
          body: payload,
          signal: AbortSignal.timeout(60_000),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Bulk ingestion failed: HTTP ${res.status} ${text}`);
        }

        await res.arrayBuffer().catch(() => {});
      },
    });

    const totalIngestTimeMs = performance.now() - t0;
    const ingestThroughput = Math.round(TOTAL_ENTRIES / (totalIngestTimeMs / 1000));

    results.push({
      ...migrationResult,
      shortLabel: "Bulk Import",
      layer: "Ingestion",
      rps: ingestThroughput,
    });

    // ── 2. RANDOM POINT-LOOKUP BENCHMARK ────────────────────────────────────
    forceGarbageCollection();
    await stabilize(500);

    console.log("   → Measuring Random ID Point-Lookups on 10k dataset...");
    let lookupCursor = 0;

    const pointLookupResult = await runBenchmark({
      name: "Random Point Lookup",
      iterations: 600,
      warmupIterations: 50,
      runs: 2,
      concurrency: 6,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const randIdx = (lookupCursor++ * 7919) % TOTAL_ENTRIES;
        const targetId = allIds[randIdx]!;

        const res = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/${targetId}`, {
          method: "GET",
          headers: baseHeaders,
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) throw new Error(`Point lookup failed: HTTP ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });

    results.push({
      ...pointLookupResult,
      shortLabel: "Point Lookup",
      layer: "Read (ID)",
    });

    // ── 3. INDEXED PAGINATED RANGE SCAN ─────────────────────────────────────
    forceGarbageCollection();
    await stabilize(200);

    console.log("   → Measuring Indexed Range Queries (Pagination + Sort)...");
    const scanResult = await runBenchmark({
      name: "Range Scan & Pagination",
      iterations: 400,
      warmupIterations: 40,
      runs: 2,
      concurrency: 6,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(listUrl, {
          method: "GET",
          headers: baseHeaders,
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) throw new Error(`Range scan failed: HTTP ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });

    results.push({
      ...scanResult,
      shortLabel: "Range Scan",
      layer: "Read (Scan)",
    });

    // ── REPORTING & TELEMETRY ───────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — MIGRATION & SCALE AUDIT",
      shortLabel: "Migration",
      subtitle: `${TOTAL_ENTRIES.toLocaleString()} Ingested Entries • Point Lookups • Range Scans • ${dbType}`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Total Ingestion Time", val: (totalIngestTimeMs / 1000).toFixed(2), unit: "s" },
        {
          key: "Bulk Ingestion Throughput",
          val: ingestThroughput.toLocaleString(),
          unit: "entries/s",
        },
        {
          key: "Batch Latency (500 items/batch)",
          val: migrationResult.avgMs.toFixed(2),
          unit: "ms",
        },
        {
          key: "Random Point-Lookup Latency",
          val: pointLookupResult.avgMs.toFixed(2),
          unit: "ms",
        },
        {
          key: "Random Point-Lookup p95",
          val: (pointLookupResult.p95Ms || pointLookupResult.avgMs).toFixed(2),
          unit: "ms",
        },
        { key: "Paginated Range Scan Latency", val: scanResult.avgMs.toFixed(2), unit: "ms" },
        {
          key: "Ingestion Memory Growth",
          val: (migrationResult.rssDelta || 0).toFixed(1),
          unit: "MB",
        },
      ],
      "Migration & Scale Summary",
    );

    exportMetric("migration.ingest_throughput_docs_s", ingestThroughput, "entries/s");
    exportMetric("migration.batch_latency_avg_ms", migrationResult.avgMs, "ms");
    exportMetric("migration.point_lookup_avg_ms", pointLookupResult.avgMs, "ms");
    exportMetric(
      "migration.point_lookup_p95_ms",
      pointLookupResult.p95Ms || pointLookupResult.avgMs,
      "ms",
    );
    exportMetric("migration.range_scan_avg_ms", scanResult.avgMs, "ms");
    exportMetric("migration.memory_rss_delta_mb", migrationResult.rssDelta || 0, "MB");

    for (const r of results) exportResult(r);
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
}, 900_000);
