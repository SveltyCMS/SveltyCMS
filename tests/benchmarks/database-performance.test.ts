/**
 * @file tests/benchmarks/database-performance.test.ts
 * @description High-fidelity raw Database Adapter CRUD benchmark.
 * Measures INSERT, FIND ONE, FIND MANY, UPDATE, DELETE directly on the adapter layer.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  updateBenchmarkDocumentation,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

const TEST_TENANT = "global";
const COLLECTION_ID = "bench_db_crud_raw"; // Fixed name with explicit cleanup

export async function runDatabaseBenchmark() {
  console.log("🚀 Starting High-Fidelity Database Adapter CRUD Benchmark...\n");

  logger.level = "silent";

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  const adapter = getDb();
  if (!adapter) throw new Error("DB adapter not initialized");

  const dbType = (adapter.type || process.env.DB_TYPE || "unknown").toUpperCase();

  console.log(`📊 Benchmarking ${dbType} Adapter (Collection: ${COLLECTION_ID})`);

  // === Preparation: Clean Slate ===
  await adapter.clearDatabase().catch(() => {});
  await stabilize();

  // Ensure model/collection exists for the test
  if (adapter.collection?.createModel) {
    await adapter.collection
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
  await adapter.crud.insert(
    COLLECTION_ID,
    {
      _id: FIXED_ID as any,
      title: "Stable Benchmark Entry",
      status: "active",
      tenantId: TEST_TENANT as any,
    } as any,
    { tenantId: TEST_TENANT as any },
  );

  // Elite Reliability Check: Verify entry exists before starting measurements
  const check = await adapter.crud.findOne(
    COLLECTION_ID,
    { _id: FIXED_ID as any },
    { tenantId: TEST_TENANT as any },
  );
  if (!check?.success || !check?.data) {
    throw new Error(
      `CRITICAL: Database benchmark setup failed. Entry ${FIXED_ID} was not found in ${COLLECTION_ID} after insertion.`,
    );
  }

  const ITERATIONS = 1500;
  const WARMUP = Math.floor(ITERATIONS * 0.12);
  const RUNS = 3;

  const benchmarkCrud = async (name: string, onIteration: (i: number) => Promise<void>) => {
    return runBenchmark({
      name: `${dbType} Adapter: ${name}`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      concurrency: 1, // Pure latency measurement
      runs: RUNS,
      trimOutliers: "iqr",
      measureMemory: true,
      onIteration: async (i) => await onIteration(i),
      silent: true,
    });
  };

  // 1. INSERT (Single)
  const insertResult = await benchmarkCrud("INSERT", async (i) => {
    const id = `ins-${i}-${Math.random().toString(36).slice(2)}`;
    await adapter.crud.insert(
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
    const res = await adapter.crud.findOne(
      COLLECTION_ID,
      { _id: FIXED_ID as any },
      { tenantId: TEST_TENANT as any },
    );
    if (!res?.success) throw new Error("FindOne failed");
  });

  // 3. FIND MANY (Paginated limit 50)
  const findManyResult = await benchmarkCrud("FIND MANY (limit 50)", async () => {
    await adapter.crud.findMany(COLLECTION_ID, { tenantId: TEST_TENANT as any }, { limit: 50 });
  });

  // 4. UPDATE
  const updateResult = await benchmarkCrud("UPDATE", async () => {
    await adapter.crud.update(
      COLLECTION_ID,
      FIXED_ID as any,
      { title: `Updated ${Date.now()}`, status: "updated" } as any,
      { tenantId: TEST_TENANT as any },
    );
  });

  // 5. DELETE (Insert-then-Delete to measure atomic cleanup path)
  const deleteResult = await benchmarkCrud("DELETE", async (i) => {
    const id = `del-${i}-${Math.random().toString(36).slice(2)}`;
    await adapter.crud.insert(
      COLLECTION_ID,
      { _id: id as any, title: "Temp", tenantId: TEST_TENANT as any } as any,
      { tenantId: TEST_TENANT as any },
    );
    await adapter.crud.delete(COLLECTION_ID, id as any, { tenantId: TEST_TENANT as any });
  });

  // 6. BULK INSERT (Batch of 100)
  const bulkInsertResult = await benchmarkCrud("BULK INSERT (100)", async (i) => {
    const batch = Array.from({ length: 100 }, (_, j) => ({
      _id: `bulk-${i}-${j}-${Math.random().toString(36).slice(2)}` as any,
      title: `Bulk item ${j}`,
      tenantId: TEST_TENANT as any,
    }));
    await adapter.crud.insertMany(COLLECTION_ID, batch, { tenantId: TEST_TENANT as any });
  });

  logger.level = "info";

  // ===================================================================
  // Elite Table Output
  // ===================================================================
  console.log("\n" + "=".repeat(150));
  console.log(`   🏆 ${dbType} RAW DATABASE ADAPTER CRUD PERFORMANCE AUDIT`);
  console.log("   Direct Adapter Layer • Nanosecond Precision • IQR • MoE");
  console.log("=".repeat(150));

  const allResults = [
    insertResult,
    findOneResult,
    findManyResult,
    updateResult,
    deleteResult,
    bulkInsertResult,
  ];

  console.log(
    `| ${"Operation".padEnd(32)} | ${"Avg ms".padEnd(18)} | ${"p95 ms".padEnd(12)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(32 + 18 + 12 + 12 + 12 + 6) + "|");

  for (const r of allResults) {
    const displayName = r.name.includes(":") ? r.name.split(":")[1].trim() : r.name;
    const rss =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)} MB` : "—";

    console.log(
      `| ${displayName.padEnd(32)} | ` +
        `${r.avgMs.toFixed(4)} (±${r.marginOfError.toFixed(3)})`.padEnd(18) +
        ` | ${r.p95Ms.toFixed(3)}`.padEnd(12) +
        ` | ${Math.round(r.rps).toLocaleString().padEnd(12)}` +
        ` | ${rss.padEnd(12)} |`,
    );
  }
  console.log("=".repeat(150));

  // Consolidated for Matrix
  const readRes = findOneResult;
  exportMetric("adapter.read.avg", readRes.avgMs, "ms");

  const aggregate = {
    name: "DB Adapter Summary",
    avgMs: findOneResult.avgMs,
    p95Ms: findOneResult.p95Ms,
    rps: findOneResult.rps,
    shortLabel: "DB Raw p95",
  };

  exportResult(aggregate);
  console.log("\n✅ Database adapter raw CRUD benchmark completed.");
  await updateBenchmarkDocumentation();
}

test("Database Adapter CRUD Performance", async () => {
  await runDatabaseBenchmark();
}, 450000);
