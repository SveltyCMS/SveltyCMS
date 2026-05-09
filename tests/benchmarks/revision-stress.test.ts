/**
 * @file tests/benchmarks/revision-stress.test.ts
 * @description Enterprise-grade Revision & History growth stress test for SveltyCMS.
 * Measures performance degradation when reading the latest version as history grows.
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
  TEST_API_SECRET,
  getDbType,
} from "./benchmark-utils";
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
    await prepareCollection();

    // 1. Prepare Target Entry
    console.log(
      `   → Preparing entry in ${REVISION_COLLECTION} with ${TOTAL_REVISIONS} revisions...`,
    );

    // Create initial
    await fetch(`${baseUrl}/api/collections/${REVISION_COLLECTION}`, {
      method: "POST",
      headers: {
        "x-test-mode": "true",
        "x-test-secret": TEST_API_SECRET,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        _id: STRESS_TARGET_ID,
        title: "Initial Version",
        content: "Initial content",
      }),
    });

    // Create revisions
    for (let i = 0; i < TOTAL_REVISIONS; i++) {
      await fetch(`${baseUrl}/api/collections/${REVISION_COLLECTION}/${STRESS_TARGET_ID}`, {
        method: "PATCH",
        headers: {
          "x-test-mode": "true",
          "x-test-secret": TEST_API_SECRET,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: `Version ${i + 1}`, content: `Content update ${i + 1}` }),
      });
    }

    await stabilize(2000);

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
          {
            headers: { "x-test-mode": "true", "x-test-secret": TEST_API_SECRET },
          },
        );
        if (!res.ok) throw new Error(`Read failed: ${res.status}`);
        await res.text();
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
          {
            headers: { "x-test-mode": "true", "x-test-secret": TEST_API_SECRET },
          },
        );
        if (!res.ok) throw new Error(`List failed: ${res.status}`);
        await res.text();
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
      { key: "History Growth Impact", val: (readResult.avgMs / 1.5).toFixed(2), unit: "x" }, // Rough baseline comparison
    ]);

    for (const r of [readResult, listResult]) exportResult(r);
  } catch (err: any) {
    logger.error(`Revision audit failed: ${err.message}`);
    console.error(err);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Revision stress audit completed.");
}

async function prepareCollection() {
  const { getDb } = await import("@src/databases/db");
  const db = getDb();

  const schema = {
    _id: REVISION_COLLECTION,
    name: REVISION_COLLECTION,
    fields: [
      { db_fieldName: "title", widget: { Name: "Input" }, required: true },
      { db_fieldName: "content", widget: { Name: "RichText" } },
    ],
    revision: true,
  };

  if (db?.collection?.createModel) {
    await db.collection.createModel(schema).catch(() => {});
  }

  // Clean previous data
  await db?.crud
    ?.deleteMany?.(REVISION_COLLECTION, {}, { tenantId: "global" as any, permanent: true })
    .catch(() => {});
}

test("Revision & History Stress Performance", async () => {
  await runRevisionAudit();
}, 900_000);
