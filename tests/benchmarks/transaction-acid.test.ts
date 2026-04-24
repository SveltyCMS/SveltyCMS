/**
 * @file tests/benchmarks/transaction-acid.test.ts
 * @description Enterprise ACID benchmark for SveltyCMS.
 * Measures transaction commit latencies and rollback overhead.
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
import { logger } from "@utils/logger.server";

const COLLECTION_ID = "collection_acid_benchmark";

async function runAcidAudit() {
  console.log("💎 Starting Enterprise ACID Audit...\n");

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  if (typeof (db as any).transaction !== "function") {
    console.log("⏭️ Adapter does not support transactions. Skipping.");
    return;
  }

  const originalLogLevel = logger.level;
  logger.level = "silent";

  try {
    // 1. Table Setup & Verification
    console.log("   📊 Initializing ACID test collection...");
    const client = (db as any).adapter?.getClient?.();
    if (client && getDbType() === "sqlite") {
      client.exec(
        `CREATE TABLE IF NOT EXISTS "${COLLECTION_ID}" ("_id" TEXT PRIMARY KEY, "title" TEXT, "tenantId" TEXT)`,
      );
    } else if (db.collection?.createModel) {
      await db.collection
        .createModel({
          _id: COLLECTION_ID,
          name: COLLECTION_ID,
          fields: [{ name: "title", type: "text" }],
        } as any)
        .catch(() => {});
    }

    // Verify collection readiness
    const check = await db.crud.findOne(
      COLLECTION_ID,
      { _id: "non-existent" as any },
      { tenantId: "global" as any },
    );
    if (!check.success && check.message?.includes("not found")) {
      throw new Error(`CRITICAL: ACID collection ${COLLECTION_ID} failed to initialize.`);
    }

    await stabilize();

    const RUNS = 2;
    const ITERATIONS = 500;
    const allResults: any[] = [];

    // 2. Commit Latency
    console.log("   → Measuring TX Commit (Concurrent)...");
    const commitResult = await runBenchmark({
      name: "TX Commit @ 8c",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: RUNS,
      concurrency: 8,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async (i: number) => {
        const id = `c-8-${i}-${Math.random().toString(36).slice(2)}`;
        await (db as any).transaction(async (tx: any) => {
          await tx.insert(
            COLLECTION_ID,
            { _id: id, title: "commit" },
            { tenantId: "global" as any },
          );
        });
      },
    });
    allResults.push({ ...commitResult, layer: "Database" });

    // 3. Rollback Integrity & Overhead
    console.log("   → Measuring TX Rollback & Verification...");
    const rollbackResult = await runBenchmark({
      name: "TX Rollback Integrity",
      iterations: 200,
      warmupIterations: 20,
      runs: 1,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async (i: number) => {
        const id = `r-${i}-${Math.random().toString(36).slice(2)}`;
        try {
          await (db as any).transaction(async (tx: any) => {
            await tx.insert(
              COLLECTION_ID,
              { _id: id, title: "rollback" },
              { tenantId: "global" as any },
            );
            throw new Error("ROLLBACK_TRIGGER");
          });
        } catch (e: any) {
          if (e.message !== "ROLLBACK_TRIGGER") throw e;
        }

        // ASSERTION: Verify data is NOT there
        const verify = await db.crud.findOne(
          COLLECTION_ID,
          { _id: id as any },
          { tenantId: "global" as any },
        );
        if (verify.success && verify.data) {
          throw new Error(`ACID FAILURE: Transaction committed despite error for ID ${id}`);
        }
      },
    });
    allResults.push({ ...rollbackResult, layer: "Database" });

    printTruthTable({
      title: "SVELTYCMS  —  ACID INTEGRITY AUDIT",
      subtitle: `Transactional Commit & Rollback • ${getDbType().toUpperCase()}`,
      results: allResults,
    });

    printSummaryTable([
      { key: "Avg Commit Latency", val: commitResult.avgMs, unit: "ms" },
      { key: "Rollback Verification", val: rollbackResult.avgMs, unit: "ms" },
      { key: "Transaction Stability", val: "VERIFIED", unit: "" },
      { key: "Peak Throughput", val: Math.round(commitResult.rps), unit: "tx/s" },
    ]);

    for (const r of allResults) exportResult(r);
  } finally {
    logger.level = originalLogLevel;
  }

  console.log("\n✅ ACID audit completed.");
}

test("ACID Enterprise Suite", async () => {
  await runAcidAudit();
}, 450000);
