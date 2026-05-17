/**
 * @file tests/benchmarks/transaction-acid.test.ts
 * @description Enterprise ACID benchmark for SveltyCMS.
 * Measures transaction commit latencies and rollback overhead.
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
} from "./benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

const COLLECTION_ID = "bench_acid";
let stopServer: (() => Promise<void>) | null = null;

async function runAcidAudit() {
  console.log("💎 Starting Enterprise ACID Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;

    await ensureStableTestData();
    await stabilize(1000);

    const { getDb } = await import("@src/databases/db");
    const db = getDb();
    if (!db) throw new Error("Database not initialized");

    if (typeof (db as any).transaction !== "function") {
      console.log("⏭️ Adapter does not support transactions. Skipping.");
      return;
    }

    await prepareAcidCollection(db);

    const RUNS = 2;
    const ITERATIONS = 600;

    // Commit Latency
    console.log("   → Measuring TX Commit Performance...");
    const commitResult = await runBenchmark({
      name: "TX Commit",
      iterations: ITERATIONS,
      warmupIterations: 80,
      runs: RUNS,
      concurrency: 4,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async (i: number) => {
        const id = `commit-${i}-${Math.random().toString(36).slice(2)}`;
        await (db as any).transaction(async (tx: any) => {
          await tx.insert(
            COLLECTION_ID,
            { _id: id, title: "ACID Commit Test" },
            { tenantId: "global" as any },
          );
        });
      },
    });

    // Rollback Integrity
    console.log("   → Measuring TX Rollback Integrity...");
    const rollbackResult = await runBenchmark({
      name: "TX Rollback Integrity",
      iterations: 300,
      warmupIterations: 30,
      runs: 1,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async (i: number) => {
        const id = `rollback-${i}-${Math.random().toString(36).slice(2)}`;
        const txResult = await (db as any).transaction(async (tx: any) => {
          await tx.insert(
            COLLECTION_ID,
            { _id: id, title: "Rollback Test" },
            { tenantId: "global" as any },
          );
          await tx.rollback();
        });

        if (txResult.success) {
          throw new Error(
            `ACID FAILURE: Transaction reported success despite rollback for ID ${id}`,
          );
        }

        // Verify data was NOT persisted
        const verify = await db.crud.findOne(
          COLLECTION_ID,
          { _id: id as any },
          { tenantId: "global" as any },
        );
        if (verify?.success && verify.data) {
          throw new Error(`ACID FAILURE: Data persisted despite rollback for ID ${id}`);
        }
      },
    });

    printTruthTable({
      title: "SVELTYCMS — ACID INTEGRITY AUDIT",
      shortLabel: "ACID",
      subtitle: `Commit & Rollback • ${getDbType().toUpperCase()}`,
      results: [
        { ...commitResult, shortLabel: "Commit", layer: "Database" },
        { ...rollbackResult, shortLabel: "Rollback", layer: "Database" },
      ],
    });

    printSummaryTable([
      { key: "Avg Commit Latency", val: commitResult.avgMs, unit: "ms" },
      { key: "Rollback Verification", val: rollbackResult.avgMs, unit: "ms" },
      { key: "Transaction Stability", val: "VERIFIED", unit: "" },
      { key: "Peak Throughput", val: Math.round(commitResult.rps || 0), unit: "tx/s" },
    ]);

    exportResult(commitResult);
    exportResult(rollbackResult);
  } catch (err: any) {
    logger.error(`ACID benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ ACID audit completed.");
}

async function prepareAcidCollection(db: any) {
  if (db.collection?.createModel) {
    await db.collection
      .createModel({
        _id: COLLECTION_ID,
        name: COLLECTION_ID,
        fields: [{ name: "title", type: "text" }],
      } as any)
      .catch(() => {});
  }

  // Clean collection
  // Clean previous run with permanent delete to prevent E11000 on re-runs
  await db.crud
    .deleteMany(COLLECTION_ID, {}, { tenantId: "global" as any, permanent: true })
    .catch(() => {});
}

test("ACID Enterprise Suite", async () => {
  await runAcidAudit();
}, 600000);
