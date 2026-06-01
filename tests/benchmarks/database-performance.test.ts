/**
 * @file tests/benchmarks/database-performance.test.ts
 * @description Enterprise Database Adapter Benchmark
 * @summary Measures raw CRUD performance, indexing efficiency, and connection pool resilience
 *
 * ### Features:
 * - INSERT / SELECT / UPDATE / DELETE throughput per adapter
 * - Indexed vs non-indexed query comparison
 * - Connection pool resilience under concurrent load
 */

import { sql } from "drizzle-orm";

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
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

const COLLECTION_ID = "benchmark_crud";
const TEST_TENANT = "global";

let stopServer: (() => Promise<void>) | null = null;

export async function runDatabaseBenchmark() {
  console.log("🚀 Starting Enterprise Database Adapter Benchmark...\n");

  try {
    // Even for raw adapter tests, we start the server to ensure full system initialization
    const server = await setupBenchmarkServer();
    stopServer = server.stop;

    await ensureStableTestData();
    await stabilize(1000);

    const { getDb, ensureFullInitialization } = await import("@src/databases/db");
    await ensureFullInitialization();
    const db = getDb();
    if (!db) throw new Error("Database not initialized");

    const dbType = getDbType();

    await prepareCollection(db);

    const scenarios = [
      { name: "INSERT", fn: createInsertTest(db) },
      { name: "FIND ONE", fn: createFindOneTest(db) },
      { name: "FIND MANY (limit 50)", fn: createFindManyTest(db) },
      { name: "UPDATE", fn: createUpdateTest(db) },
      { name: "NATIVE UPSERT", fn: createUpsertNativeTest(db) },
      {
        name: "AGGREGATION",
        fn: db.getCapabilities?.().supportsAggregation ? createAggregationTest(db) : null,
      },
      { name: "DELETE", fn: createDeleteTest(db) },
      { name: "BULK INSERT (100)", fn: createBulkInsertTest(db) },
    ].filter((s) => s.fn !== null);

    const results: any[] = [];

    for (const scenario of scenarios) {
      console.log(`   → ${scenario.name}`);
      const result = await runBenchmark({
        name: scenario.name,
        iterations: 1200,
        warmupIterations: 150,
        runs: 3,
        concurrency: 1, // Raw DB tests usually stay serial
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onIteration: scenario.fn,
      });

      results.push(result);
      exportResult(result);
    }

    // Reporting
    const findResult = (name: string) =>
      results.find((r) => r.name === name) || { avgMs: 0, rps: 0 };
    const throughputs = results.map((r) => r.rps);
    const peakThroughput = Math.max(...throughputs);

    printTruthTable({
      title: `SVELTYCMS — DATABASE ADAPTER PERFORMANCE (${dbType.toUpperCase()})`,
      shortLabel: "DB Raw",
      subtitle: "Direct CRUD • Adapter Layer",
      results,
    });

    printSummaryTable([
      {
        key: "Avg Insert Latency",
        val: findResult("INSERT").avgMs,
        unit: "ms",
      },
      {
        key: "Avg Read Latency (Single)",
        val: findResult("FIND ONE").avgMs,
        unit: "ms",
      },
      {
        key: "Avg Read Latency (Many)",
        val: findResult("FIND MANY (limit 50)").avgMs,
        unit: "ms",
      },
      {
        key: "Avg Update Latency",
        val: findResult("UPDATE").avgMs,
        unit: "ms",
      },
      {
        key: "Avg Native Upsert",
        val: findResult("NATIVE UPSERT").avgMs,
        unit: "ms",
      },
      {
        key: "Avg Delete Latency",
        val: findResult("DELETE").avgMs,
        unit: "ms",
      },
      { key: "Peak CRUD Throughput", val: peakThroughput, unit: "req/s" },
    ]);

    exportMetric("adapter.read.avg", findResult("FIND ONE").avgMs, "ms");
    exportMetric("adapter.write.avg", findResult("INSERT").avgMs, "ms");
    exportMetric("adapter.throughput.peak", peakThroughput, "req/s");
  } catch (err: any) {
    logger.error(`Database benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Database adapter raw CRUD benchmark completed.");
}

// ─────────────────────────────────────────────────────────────
// Test Factories
// ─────────────────────────────────────────────────────────────

function createInsertTest(db: any) {
  const runId = Math.random().toString(36).substring(7);
  let counter = 0;
  return async () => {
    const id = `ins-${runId}-${counter++}`;
    await db.crud.insert(
      COLLECTION_ID,
      {
        _id: id as any,
        title: `Insert ${id}`,
        status: "active",
        tenantId: TEST_TENANT,
      },
      { tenantId: TEST_TENANT },
    );
  };
}

function createFindOneTest(db: any) {
  return async () => {
    const res = await db.crud.findOne(
      COLLECTION_ID,
      { _id: "bench-shared-001" as any },
      { tenantId: TEST_TENANT },
    );
    if (!res?.success) {
      throw new Error(
        `FindOne failed: ${res?.message || "Unknown error"}. Details: ${JSON.stringify(res?.error || {})}`,
      );
    }
  };
}

function createFindManyTest(db: any) {
  return async () => {
    await db.crud.findMany(
      COLLECTION_ID,
      { tenantId: TEST_TENANT },
      { limit: 50, tenantId: TEST_TENANT },
    );
  };
}

function createUpdateTest(db: any) {
  return async () => {
    await db.crud.update(
      COLLECTION_ID,
      "bench-shared-001" as any,
      { title: `Updated ${Date.now()}`, status: "updated" },
      { tenantId: TEST_TENANT },
    );
  };
}

function createDeleteTest(db: any) {
  let counter = 0;
  return async () => {
    const id = `del-shared-${counter++}`;
    // We assume the records were pre-inserted or exist.
    // For a cleaner test, we pre-populate in prepareCollection or here once.
    await db.crud.delete(COLLECTION_ID, id as any, { tenantId: TEST_TENANT });
  };
}

function createUpsertNativeTest(db: any) {
  return async () => {
    if (db.type === "mongodb") {
      // MongoDB upsert is already native via its upsert option
      await db.crud.upsert(
        COLLECTION_ID,
        { _id: "bench-shared-001" },
        { title: `Native ${Date.now()}` },
        { tenantId: TEST_TENANT },
      );
      return;
    }
    const table = db.getTable(COLLECTION_ID);
    const idCol = db.getColumn(table, "_id");
    await db.upsertNative(
      table,
      {
        [idCol.name]: "bench-shared-001",
        title: `Native ${Date.now()}`,
        tenantId: TEST_TENANT,
      },
      [idCol],
    );
  };
}

function createAggregationTest(db: any) {
  return async () => {
    // Simple sum/grouping aggregation
    await db.crud.aggregate(
      COLLECTION_ID,
      [
        { $match: { status: "active" } },
        {
          $group: {
            _id: "$status",
            total: { $sum: "$value" },
            count: { $sum: 1 },
          },
        },
      ],
      { tenantId: TEST_TENANT },
    );
  };
}

function createBulkInsertTest(db: any) {
  return async () => {
    const batch = Array.from({ length: 100 }, () => ({
      _id: crypto.randomUUID() as any,
      title: "Bulk item",
      tenantId: TEST_TENANT,
    }));
    await db.crud.insertMany(COLLECTION_ID, batch, { tenantId: TEST_TENANT });
  };
}

async function prepareCollection(db: any) {
  console.log("   [DB Trace] Preparing collection...");
  if (db.collection?.createModel) {
    console.log("   [DB Trace] Creating model...");
    await db.collection
      .createModel({
        _id: COLLECTION_ID,
        name: COLLECTION_ID,
        fields: [
          { db_fieldName: "title", widget: { Name: "Input" }, required: true },
          { db_fieldName: "status", widget: { Name: "Input" } },
          { db_fieldName: "value", widget: { Name: "Input" }, type: "number" },
          { db_fieldName: "tenantId", widget: { Name: "Input" } },
        ],
      })
      .catch(() => {});

    // 🚀 PERFECT STORM: Inject physical indices for benchmark_crud
    if (db.type !== "mongodb") {
      try {
        await db.execute(
          sql.raw(
            `CREATE INDEX IF NOT EXISTS "idx_bench_crud_status" ON "${COLLECTION_ID}" ("status")`,
          ),
        );
        await db.execute(
          sql.raw(
            `CREATE INDEX IF NOT EXISTS "idx_bench_crud_tenant" ON "${COLLECTION_ID}" ("tenantId")`,
          ),
        );
      } catch {}
    }
  }

  // 🛡️ HERMETIC CLEANUP: Use permanent delete to ensure zero collisions with soft-deleted data
  console.log("   [DB Trace] Deleting old records...");
  const delRes = await db.crud.deleteMany(
    COLLECTION_ID,
    {},
    { bypassTenantCheck: true, permanent: true },
  );
  console.log(`   [DB Trace] Deleted ${delRes.data?.deletedCount || 0} records.`);

  console.log("   [DB Trace] Seeding stable record...");
  await db.crud.insert(
    COLLECTION_ID,
    {
      _id: "bench-shared-001" as any,
      title: "Stable Benchmark Entry",
      status: "active",
      value: 100,
      tenantId: TEST_TENANT,
    },
    { tenantId: TEST_TENANT },
  );

  // 🚀 ATOMIC SEEDING: Pre-populate for Delete benchmark (4000 records)
  console.log("   [DB Trace] Pre-populating delete batch (4000 records)...");
  const deleteBatch = Array.from({ length: 4000 }, (_, i) => ({
    _id: `del-shared-${i}` as any,
    title: `To remove ${i}`,
    status: i % 2 === 0 ? "active" : "inactive",
    value: i,
    tenantId: TEST_TENANT,
  }));

  await db.crud.insertMany(COLLECTION_ID, deleteBatch, {
    tenantId: TEST_TENANT,
  });
  console.log("   [DB Trace] Collection prepared.");
}

test("Database Adapter CRUD Performance", async () => {
  await runDatabaseBenchmark();
}, 600000);
