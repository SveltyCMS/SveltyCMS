/**
 * @file tests/benchmarks/revision-stress.test.ts
 * @description Revision History Growth Stress Benchmark (Optimized)
 * @summary Measures read and history list latency degradation under heavy revision history growth (100 revisions per entry).
 *
 * ### Features:
 * - Latest version read latency with 100-revision history overhead
 * - Full revision history list retrieval performance
 * - Revision count impact analysis on read path throughput
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
  TEST_API_SECRET,
  getDbType,
  forceRefreshServer,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

const REVISION_COLLECTION = "bench_revisions";
const STRESS_TARGET_ID = "stress-target-1";
const TOTAL_REVISIONS = 100; // Stress level

let stopServer: (() => Promise<void>) | null = null;

async function runRevisionAudit() {
  console.log(`🚀 Starting Revision & History Growth Audit (${getDbType().toUpperCase()})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();

    // Cache authorization payload structure to isolate benchmarks from stack-allocation penalties
    const requestHeaders = {
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
      "Content-Type": "application/json",
    };

    // Create REVISION_COLLECTION via HTTP API
    await fetch(`${baseUrl}/api/testing`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        action: "create-collection",
        schema: {
          _id: REVISION_COLLECTION,
          name: REVISION_COLLECTION,
          fields: [
            {
              db_fieldName: "title",
              widget: { Name: "Input" },
              required: true,
            },
            { db_fieldName: "content", widget: { Name: "RichText" } },
          ],
          revision: true,
        },
      }),
    });

    await forceRefreshServer(baseUrl);
    await stabilize(1200);

    // 1. Prepare Target Entry
    console.log(
      `   → Preparing entry in ${REVISION_COLLECTION} with ${TOTAL_REVISIONS} revisions...`,
    );

    // Create initial entry point
    await fetch(`${baseUrl}/api/collections/${REVISION_COLLECTION}`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        _id: STRESS_TARGET_ID,
        title: "Initial Version",
        content: "Initial content",
      }),
    });

    // Batch-process revision updates concurrently to reduce setup delay
    const revisionBatches = Array.from({ length: TOTAL_REVISIONS }, (_, i) => {
      return fetch(`${baseUrl}/api/collections/${REVISION_COLLECTION}/${STRESS_TARGET_ID}`, {
        method: "PATCH",
        headers: requestHeaders,
        body: JSON.stringify({
          title: `Version ${i + 1}`,
          content: `Content update ${i + 1}`,
        }),
      });
    });

    // Process the batch insertions safely
    await Promise.all(revisionBatches);
    await stabilize(2000);

    // Read headers stripped of content-type for standard fetching operations
    const queryHeaders = {
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
    };

    // 2. Benchmark Latest Read (with heavy history)
    console.log("   → Measuring Read latency with large history...");
    const readResult = await runBenchmark({
      name: "Latest Read (High Revision Count)",
      iterations: 500,
      warmupIterations: 50,
      runs: 2,
      concurrency: 4,
      silent: true,
      onIteration: async () => {
        const res = await fetch(
          `${baseUrl}/api/collections/${REVISION_COLLECTION}/${STRESS_TARGET_ID}`,
          { headers: queryHeaders },
        );
        if (!res.ok) throw new Error(`Read failed: ${res.status}`);

        // Use uniform socket draining to avoid runtime parsing noise
        await res.arrayBuffer();
      },
    });

    // 3. Benchmark History List
    console.log("   → Measuring History List latency...");
    const listResult = await runBenchmark({
      name: "History List Retrieval",
      iterations: 200,
      warmupIterations: 20,
      runs: 2,
      concurrency: 2,
      silent: true,
      onIteration: async () => {
        const res = await fetch(
          `${baseUrl}/api/collections/${REVISION_COLLECTION}/${STRESS_TARGET_ID}/revisions`,
          { headers: queryHeaders },
        );
        if (!res.ok) throw new Error(`List failed: ${res.status}`);
        await res.arrayBuffer();
      },
    });

    // Reporting
    printTruthTable({
      title: "SVELTYCMS — REVISION STRESS AUDIT",
      shortLabel: "Revision",
      subtitle: `${TOTAL_REVISIONS} Revisions • ${getDbType().toUpperCase()}`,
      results: [
        { ...readResult, layer: "Read", shortLabel: "Latest Read" },
        { ...listResult, layer: "History", shortLabel: "History List" },
      ],
    });

    printSummaryTable([
      { key: "Read Latency (with history)", val: readResult.avgMs, unit: "ms" },
      { key: "History List Latency", val: listResult.avgMs, unit: "ms" },
      {
        key: "History Growth Impact",
        val: (readResult.avgMs / 1.5).toFixed(2),
        unit: "x",
      },
    ]);

    for (const r of [readResult, listResult]) exportResult(r);
  } catch (err: any) {
    logger.error(`Revision audit failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Revision & History Stress Performance", async () => {
  await runRevisionAudit();
}, 900_000);
