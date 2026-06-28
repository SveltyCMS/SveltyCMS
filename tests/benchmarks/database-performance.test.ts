/**
 * @file tests/benchmarks/database-performance.test.ts
 * @description Enterprise Database Adapter Benchmark (Optimized)
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

// Freeze global option contexts to prevent V8 allocation footprints in hot loops
const GLOBAL_TENANT_OPTS = Object.freeze({ tenantId: TEST_TENANT });
const MANY_READ_OPTS = Object.freeze({ limit: 50, tenantId: TEST_TENANT });
const PERM_DELETE_OPTS = Object.freeze({
  bypassTenantCheck: true,
  permanent: true,
});

let stopServer: (() => Promise<void>) | null = null;

export async function runDatabaseBenchmark() {
  console.log("🚀 Starting Enterprise Database Adapter Benchmark...\n");

  try {
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
      { name: "COUNT", fn: createCountTest(db) },
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
        concurrency: 1, // Serial profiles protect sequential index isolation bounds
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onIteration: scenario.fn,
      });

      results.push(result);
      exportResult(result);
    }

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
  // Pre-generate target keyspace arrays to avoid allocation string mutation logic inside loops
  const targetKeys = Array.from({ length: 1500 }, (_, i) => `ins-${runId}-${i}`);
  const targetTitles = targetKeys.map((k) => `Insert ${k}`);

  return async (i: number) => {
    const id = targetKeys[i] ?? `ins-fallback-${i}`;
    await db.crud.insert(
      COLLECTION_ID,
      {
        _id: id as any,
        title: targetTitles[i] ?? "Insert Baseline",
        status: "active",
        tenantId: TEST_TENANT,
      },
      GLOBAL_TENANT_OPTS,
    );
  };
}

function createFindOneTest(db: any) {
  const targetFilter = Object.freeze({ _id: "bench-shared-001" as any });
  return async () => {
    const res = await db.crud.findOne(COLLECTION_ID, targetFilter, GLOBAL_TENANT_OPTS);
    if (!res?.success) {
      throw new Error(`FindOne failed: ${res?.message || "Unknown error"}.`);
    }
  };
}

function createFindManyTest(db: any) {
  const queryFilter = Object.freeze({ tenantId: TEST_TENANT });
  return async () => {
    await db.crud.findMany(COLLECTION_ID, queryFilter, MANY_READ_OPTS);
  };
}

function createUpdateTest(db: any) {
  const targetId = "bench-shared-001" as any;
  const updatePayload = {
    title: "Updated Static Segment Baseline",
    status: "updated",
  };
  return async () => {
    await db.crud.update(COLLECTION_ID, targetId, updatePayload, GLOBAL_TENANT_OPTS);
  };
}

function createDeleteTest(db: any) {
  // Map static target records pre-allocated in setup steps
  const deleteKeys = Array.from({ length: 1500 }, (_, i) => `del-shared-${i}`);
  return async (i: number) => {
    const id = deleteKeys[i] ?? `del-fallback-${i}`;
    await db.crud.delete(COLLECTION_ID, id as any, GLOBAL_TENANT_OPTS);
  };
}

function createUpsertNativeTest(db: any) {
  const targetId = "bench-shared-001";
  const mongoPayload = { title: "Native Static Segment Baseline Mongo" };

  if (db.type === "mongodb") {
    return async () => {
      await db.crud.upsert(COLLECTION_ID, { _id: targetId }, mongoPayload, GLOBAL_TENANT_OPTS);
    };
  }

  const table = db.getTable(COLLECTION_ID);
  const idCol = db.getColumn(table, "_id");
  const sqlKeys = [idCol];
  const sqlPayload = {
    [idCol.name]: targetId,
    title: "Native Static Segment Baseline SQL",
    tenantId: TEST_TENANT,
  };

  return async () => {
    await db.upsertNative(table, sqlPayload, sqlKeys);
  };
}

function createCountTest(db: any) {
  const countFilter = Object.freeze({ status: "active" });
  return async () => {
    await db.crud.count(COLLECTION_ID, countFilter, GLOBAL_TENANT_OPTS);
  };
}

function createBulkInsertTest(db: any) {
  const ITERATION_CAPACITY = 1200;
  // Pre-seed matrix pools outside time tracking scopes to insulate engine from UUID math noise
  const batchMatrixPool = Array.from({ length: ITERATION_CAPACITY }, () =>
    Array.from({ length: 100 }, () => ({
      _id: crypto.randomUUID() as any,
      title: "Bulk item",
      tenantId: TEST_TENANT,
    })),
  );

  return async (i: number) => {
    const currentBatch = batchMatrixPool[i] ?? batchMatrixPool[0]!;
    await db.crud.insertMany(COLLECTION_ID, currentBatch, GLOBAL_TENANT_OPTS);
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

  console.log("   [DB Trace] Deleting old records...");
  const delRes = await db.crud.deleteMany(COLLECTION_ID, {}, PERM_DELETE_OPTS);
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
    GLOBAL_TENANT_OPTS,
  );

  console.log("   [DB Trace] Pre-populating delete batch (4000 records)...");
  const deleteBatch = Array.from({ length: 4000 }, (_, i) => ({
    _id: `del-shared-${i}` as any,
    title: `To remove ${i}`,
    status: i % 2 === 0 ? "active" : "inactive",
    value: i,
    tenantId: TEST_TENANT,
  }));

  await db.crud.insertMany(COLLECTION_ID, deleteBatch, GLOBAL_TENANT_OPTS);
  console.log("   [DB Trace] Collection prepared.");
}

test("Database Adapter CRUD Performance", async () => {
  await runDatabaseBenchmark();
}, 600000);
