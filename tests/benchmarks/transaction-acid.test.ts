/**
 * @file tests/benchmarks/transaction-acid.test.ts
 * @description Enterprise ACID benchmark for SveltyCMS.
 * Measures transaction commit latencies and rollback overhead.
 */
import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  setupBenchmarkServer,
  printAuditTable,
  printSummaryTable,
} from "./benchmark-utils";

let stopServer: () => Promise<void>;
const COLLECTION_ID = "collection_acid_benchmark";

beforeAll(async () => {
  const { stop } = await setupBenchmarkServer();
  stopServer = stop;
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

export async function runAcidBenchmark() {
  console.log("💎 Starting Enterprise ACID Benchmark...\n");

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  if (typeof (db as any).transaction !== "function") {
    console.log("⏭️ Adapter does not support transactions. Skipping.");
    return;
  }

  await stabilize();

  // Ensure table exists
  const client = (db as any).adapter?.getClient?.();
  if (client) {
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

  const RUNS = 3;
  const ITERATIONS = 600;
  const WARMUP = 60;
  const allResults: any[] = [];

  logger.level = "silent";

  // 1. Single Statement Commit
  for (const c of [1, 8]) {
    const r = await runBenchmark({
      name: `TX Commit @ ${c}c`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency: c,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async (i: number) => {
        const id = `c-${c}-${i}`;
        await (db as any).transaction(async (tx: any) => {
          await tx.insert(COLLECTION_ID, { _id: id, title: "commit" }, { tenantId: "global" });
        });
      },
    });
    allResults.push(r);
  }

  // 2. Rollback Overhead
  const rollbackResult = await runBenchmark({
    name: "TX Rollback @ 1c",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    runs: RUNS,
    concurrency: 1,
    measureMemory: true,
    silent: true,
    onIteration: async (i: number) => {
      try {
        await (db as any).transaction(async (tx: any) => {
          await tx.insert(
            COLLECTION_ID,
            { _id: `r-${i}`, title: "rollback" },
            { tenantId: "global" },
          );
          throw new Error("ROLLBACK");
        });
      } catch {}
    },
  });
  allResults.push(rollbackResult);

  logger.level = "info";

  printAuditTable({
    title: "SVELTYCMS  —  ACID TRANSACTIONAL INTEGRITY",
    subtitle: "Commit Latency • Rollback Overhead • Drizzle TX Engine",
    results: allResults,
  });

  const commit = allResults[0];

  printSummaryTable([
    { key: "Base Commit Latency", val: commit.avgMs, unit: "ms" },
    { key: "Rollback Overhead", val: rollbackResult.avgMs, unit: "ms" },
    {
      key: "Max Transaction Throughput",
      val: Math.max(...allResults.map((r) => r.rps)),
      unit: "tx/s",
    },
    { key: "TX RSS Memory Δ", val: (commit.rssDelta || 0).toFixed(2), unit: "MB" },
  ]);

  exportMetric("adapter.transaction.commit.avg", commit.avgMs, "ms");
  exportMetric("adapter.transaction.rollback.avg", rollbackResult.avgMs, "ms");

  for (const r of allResults) exportResult(r);

  console.log("\n✅ ACID benchmark completed.");
}

test("ACID Enterprise Suite", async () => {
  await runAcidBenchmark();
}, 450000);
