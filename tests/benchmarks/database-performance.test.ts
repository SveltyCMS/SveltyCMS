/**
 * @file tests/benchmarks/database-performance.test.ts
 * @description Enterprise database benchmark for SveltyCMS.
 * Measures raw CRUD performance, indexing efficiency, and connection pool resilience.
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
  getDbType,
} from "./benchmark-utils";

// ── configuration ────────────────────────────────────────────────────────────
const TEST_TENANT = "global";
const COLLECTION_ID = "benchmark_crud";
const ITERATIONS = 1500;
const WARMUP = Math.floor(ITERATIONS * 0.12);
const RUNS = 3;

let stopServer: () => Promise<void>;

beforeAll(async () => {
  const { stop } = await setupBenchmarkServer();
  stopServer = stop;
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

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

  // Pre-seed a stable record for FIND/UPDATE hotspots
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
    return runBenchmark({
      name,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      concurrency: 1,
      runs: RUNS,
      trimOutliers: "iqr",
      measureMemory: true,
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

  // 5. DELETE (Insert-then-Delete)
  const deleteResult = await benchmarkCrud("DELETE", async (i) => {
    const id = `del-${i}-${Math.random().toString(36).slice(2)}`;
    await db.crud.insert(
      COLLECTION_ID,
      { _id: id as any, title: "Temp", tenantId: TEST_TENANT as any } as any,
      { tenantId: TEST_TENANT as any },
    );
    await db.crud.delete(COLLECTION_ID, id as any, { tenantId: TEST_TENANT as any });
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
    deleteResult,
    bulkInsertResult,
  ];

  printAuditTable({
    title: `SVELTYCMS  —  DATABASE ADAPTER PERFORMANCE (${dbType.toUpperCase()})`,
    subtitle: "Direct Adapter Layer • CRUD Operations • IQR trimmed",
    results,
  });

  printSummaryTable([
    { key: "Raw Read Latency (p95)", val: findOneResult.p95Ms, unit: "ms" },
    { key: "Raw Write Latency (p95)", val: insertResult.p95Ms, unit: "ms" },
    { key: "Bulk Write Throughput", val: Math.round(bulkInsertResult.rps * 100), unit: "docs/s" },
    { key: "Peak DB RPS", val: Math.round(findOneResult.rps), unit: "req/s" },
    { key: "Memory Stability RSS Δ", val: (findOneResult.rssDelta || 0).toFixed(2), unit: "MB" },
  ]);

  exportMetric("adapter.read.avg", findOneResult.avgMs, "ms");

  for (const r of results) exportResult(r);

  console.log("\n✅ Database adapter raw CRUD benchmark completed.");
}

test("Database Adapter CRUD Performance", async () => {
  await runDatabaseBenchmark();
}, 450000);
