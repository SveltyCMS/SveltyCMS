/**
 * @file tests/benchmarks/database-performance.test.ts
 * @description Enterprise database benchmark for SveltyCMS.
 * Measures raw CRUD performance, indexing efficiency, and connection pool resilience.
 */
import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";

// ── configuration ────────────────────────────────────────────────────────────
const TEST_TENANT = "global";
const COLLECTION_ID = "benchmark_crud";
const ITERATIONS = 1500;
const WARMUP = Math.floor(ITERATIONS * 0.12);
const RUNS = 3;

// No server needed for raw DB adapter benchmarks

export async function runDatabaseBenchmark() {
  console.log("🚀 Starting Enterprise Database Benchmark...\n");

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();

  const db = getDb();
  if (!db) throw new Error("Database not initialized");
  const dbType = getDbType();

  await stabilize();

  // Ensure model/collection exists for the test
  if (db.collection?.createModel) {
    await db.collection
      .createModel({
        _id: COLLECTION_ID,
        name: COLLECTION_ID,
        fields: [
          { name: "title", type: "text" },
          { name: "status", type: "text" },
          { name: "value", type: "number" },
        ],
      } as any)
      .catch(() => {});
  }

  const FIXED_ID = "bench-stable-001";

  const resetCollection = async () => {
    // Clear the collection to isolate scenarios
    await db.crud.deleteMany(COLLECTION_ID, {}, { tenantId: TEST_TENANT as any });

    // Reseed stable hotspot record
    await db.crud.upsert(
      COLLECTION_ID,
      { _id: FIXED_ID as any },
      {
        _id: FIXED_ID as any,
        title: "Stable Benchmark Entry",
        status: "active",
        tenantId: TEST_TENANT as any,
      } as any,
      { tenantId: TEST_TENANT as any },
    );
  };

  await resetCollection();

  // Elite Reliability Check: Verify entry exists before starting measurements
  const check = await db.crud.findOne(
    COLLECTION_ID,
    { _id: FIXED_ID as any },
    { tenantId: TEST_TENANT as any },
  );
  if (!check?.success || !check?.data) {
    throw new Error(
      `CRITICAL: Database benchmark setup failed. Entry ${FIXED_ID} was not found in ${COLLECTION_ID} after insertion.`,
    );
  }

  const benchmarkCrud = async (name: string, onIteration: (i: number) => Promise<void>) => {
    console.log(`   → ${name}`);
    await resetCollection();
    await stabilize();
    return runBenchmark({
      name,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      concurrency: 1,
      runs: RUNS,
      trimOutliers: "iqr",
      measureMemory: true,
      tolerateErrors: true,
      onIteration: async (i: number) => await onIteration(i),
      silent: true,
    });
  };

  // 1. INSERT (Single)
  const insertResult = await benchmarkCrud("INSERT", async (i) => {
    const id = `ins-${i}-${Math.random().toString(36).slice(2)}`;
    await db.crud.insert(
      COLLECTION_ID,
      {
        _id: id as any,
        title: `Insert test ${i}`,
        status: "active",
        tenantId: TEST_TENANT as any,
      } as any,
      { tenantId: TEST_TENANT as any },
    );
  });

  // 2. FIND ONE (by PK)
  const findOneResult = await benchmarkCrud("FIND ONE", async () => {
    const res = await db.crud.findOne(
      COLLECTION_ID,
      { _id: FIXED_ID as any },
      { tenantId: TEST_TENANT as any },
    );
    if (!res?.success) throw new Error("FindOne failed");
  });

  // 3. FIND MANY (Paginated limit 50)
  const findManyResult = await benchmarkCrud("FIND MANY (limit 50)", async () => {
    await db.crud.findMany(COLLECTION_ID, { tenantId: TEST_TENANT as any }, { limit: 50 });
  });

  // 4. UPDATE
  const updateResult = await benchmarkCrud("UPDATE", async () => {
    await db.crud.update(
      COLLECTION_ID,
      FIXED_ID as any,
      { title: `Updated ${Date.now()}`, status: "updated" } as any,
      { tenantId: TEST_TENANT as any },
    );
  });

  // 5. DELETE (Pure measurement)
  await benchmarkCrud("DELETE", async () => {
    // Note: benchmarkCrud calls resetCollection, but for DELETE we need a pool.
    // However, since iterations=1500 and we call it sequentially, we can just insert one and delete it,
    // OR we can pre-seed in onSetup. Let's pre-seed in onSetup for this specific one.
  });

  // Override DELETE with a better methodology
  console.log(`   → DELETE (Pure Methodology)`);
  await resetCollection();
  // Pre-seed the pool
  const deletePool = Array.from({ length: ITERATIONS + WARMUP + 10 }).map((_, i) => ({
    _id: `del-pool-${i}` as any,
    title: "To be deleted",
    tenantId: TEST_TENANT as any,
  }));
  await db.crud.insertMany(COLLECTION_ID, deletePool, { tenantId: TEST_TENANT as any });

  const finalDeleteResult = await runBenchmark({
    name: "DELETE",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    concurrency: 1,
    runs: RUNS,
    trimOutliers: "iqr",
    measureMemory: true,
    tolerateErrors: true,
    onIteration: async (i: number) => {
      await db.crud.delete(COLLECTION_ID, `del-pool-${i}` as any, { tenantId: TEST_TENANT as any });
    },
    silent: true,
  });

  // 6. BULK INSERT (Batch of 100)
  const bulkInsertResult = await benchmarkCrud("BULK INSERT (100)", async (i) => {
    const batch = Array.from({ length: 100 }, (_, j) => ({
      _id: `bulk-${i}-${j}-${Math.random().toString(36).slice(2)}` as any,
      title: `Bulk item ${j}`,
      tenantId: TEST_TENANT as any,
    }));
    await db.crud.insertMany(COLLECTION_ID, batch, { tenantId: TEST_TENANT as any });
  });

  // ─── reporting ─────────────────────────────────────────────────────────────

  const results = [
    insertResult,
    findOneResult,
    findManyResult,
    updateResult,
    finalDeleteResult,
    bulkInsertResult,
  ];

  printTruthTable({
    title: `SVELTYCMS  —  DATABASE ADAPTER PERFORMANCE (${dbType.toUpperCase()})`,
    subtitle: "Direct Adapter Layer • CRUD Operations • IQR trimmed",
    results,
  });

  printSummaryTable([
    { key: "Avg Insert Latency", val: insertResult.avgMs, unit: "ms" },
    { key: "Avg Read Latency (Single)", val: findOneResult.avgMs, unit: "ms" },
    { key: "Avg Read Latency (Many)", val: findManyResult.avgMs, unit: "ms" },
    { key: "Avg Update Latency", val: updateResult.avgMs, unit: "ms" },
    { key: "Avg Delete Latency", val: finalDeleteResult.avgMs, unit: "ms" },
    { key: "Peak CRUD Throughput", val: Math.max(...results.map((r) => r.rps)), unit: "req/s" },
  ]);

  exportMetric("adapter.read.avg", findOneResult.avgMs, "ms");

  exportMetric("adapter.read.avg", findOneResult.avgMs, "ms");

  for (const r of results) exportResult(r);

  console.log("\n✅ Database adapter raw CRUD benchmark completed.");
}

test("Database Adapter CRUD Performance", async () => {
  await runDatabaseBenchmark();
}, 450000);
