/**
 * @file tests/benchmarks/database-performance.test.ts
 * @description High-fidelity benchmark for SveltyCMS Database Adapter raw CRUD performance.
 *              Measures INSERT, FIND ONE, UPDATE, and DELETE directly on the adapter layer.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { logger } from "@utils/logger.server";

const TEST_TENANT = "global";
const BASE_COLLECTION = "bench_db_crud";

export async function runDatabaseBenchmark() {
  console.log("🚀 Starting High-Fidelity Database Adapter CRUD Benchmark...\n");

  logger.level = "silent";

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  const adapter = getDb();
  if (!adapter) throw new Error("DB adapter not initialized");

  const dbType = (process.env.DB_TYPE || "mongodb").toUpperCase();
  const collectionId = `${BASE_COLLECTION}_${Date.now().toString(36)}`; // unique per run to avoid conflicts

  console.log(`📊 Benchmarking ${dbType} Adapter (Collection: ${collectionId})`);

  // Ensure collection/model exists
  try {
    if (adapter.collection?.createModel) {
      await adapter.collection.createModel({
        _id: collectionId,
        name: collectionId,
        fields: [
          { name: "title", type: "text" },
          { name: "status", type: "text" },
        ],
      } as any);
    }
  } catch (_) {
    // already exists
  }

  // Pre-seed a fixed record for FIND/UPDATE benchmarks to ensure consistent hot-path
  const FIXED_ID = "bench-stable-001";
  await adapter.crud.insert(
    collectionId,
    {
      _id: FIXED_ID as any,
      title: "Stable Benchmark Entry",
      status: "active",
      tenantId: TEST_TENANT as any,
    } as any,
    { tenantId: TEST_TENANT as any },
  );

  const ITERATIONS = 1500;
  const WARMUP = Math.floor(ITERATIONS * 0.15);
  const RUNS = 3; // for statistical stability

  console.log(`\n🔬 Running CRUD benchmarks (${ITERATIONS} iterations × ${RUNS} runs)...`);

  // Helper for consistent benchmarking
  const benchmarkCrud = async (name: string, onIteration: (i: number) => Promise<void>) => {
    return runBenchmark({
      name: `${dbType}: ${name}`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      concurrency: 1, // pure latency
      runs: RUNS,
      trimOutliers: "iqr",
      measureMemory: true,
      onIteration: async (i) => await onIteration(i),
      silent: true,
    });
  };

  // 1. INSERT (Single)
  console.log("📥 Benchmarking INSERT (Single)...");
  const insertResult = await benchmarkCrud("INSERT", async (i) => {
    const uniqueId = `ins-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`;
    await adapter.crud.insert(
      collectionId,
      {
        _id: uniqueId as any,
        title: "Benchmark Insert Entry",
        tenantId: TEST_TENANT as any,
      } as any,
      { tenantId: TEST_TENANT as any },
    );
  });

  // 2. FIND ONE (by _id)
  console.log("🔍 Benchmarking FIND ONE...");
  let indexWarningDetected = false;
  const findResult = await benchmarkCrud("FIND ONE", async () => {
    const res = await adapter.crud.findOne(
      collectionId,
      { _id: FIXED_ID as any },
      { tenantId: TEST_TENANT as any },
    );
    if (!res.success) throw new Error("FindOne failed");

    // Index Detection Logic: Check if DB reported primary index usage
    if (res.meta && (!res.meta.indexesUsed || res.meta.indexesUsed.length === 0)) {
      indexWarningDetected = true;
    }
  });

  // 3. UPDATE
  console.log("✏️  Benchmarking UPDATE...");
  const updateResult = await benchmarkCrud("UPDATE", async () => {
    await adapter.crud.update(
      collectionId,
      FIXED_ID as any,
      { title: `Updated at ${Date.now()}` } as any,
      { tenantId: TEST_TENANT as any },
    );
  });

  // 4. DELETE (Self-Cleaning Loop)
  console.log("🗑️  Benchmarking DELETE...");
  const deleteResult = await benchmarkCrud("DELETE", async (i) => {
    const uniqueId = `del-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`;
    // First insert then delete in same iteration to keep DB clean
    await adapter.crud.insert(
      collectionId,
      { _id: uniqueId as any, title: "Temp Delete", tenantId: TEST_TENANT as any } as any,
      { tenantId: TEST_TENANT as any },
    );
    await adapter.crud.delete(collectionId, uniqueId as any, { tenantId: TEST_TENANT as any });
  });

  // 5. BULK INSERT (100 items)
  console.log("📦 Benchmarking BULK INSERT (100 items)...");
  const bulkSize = 100;
  const bulkInsertResult = await runBenchmark({
    name: `${dbType}: BULK INSERT (100)`,
    iterations: 200, // lower iterations for bulk
    warmupIterations: 20,
    concurrency: 1,
    runs: 2,
    trimOutliers: "iqr",
    measureMemory: true,
    onIteration: async (i) => {
      const batch = Array.from({ length: bulkSize }).map((_, j) => ({
        _id: `bulk-${i}-${j}-${Math.random().toString(36).slice(2)}` as any,
        title: `Bulk item ${j}`,
        tenantId: TEST_TENANT as any,
      }));
      await adapter.crud.insertMany(collectionId, batch, { tenantId: TEST_TENANT as any });
    },
    silent: true,
  });

  logger.level = "info";

  // ===================================================================
  // Professional Summary
  // ===================================================================
  console.log("\n" + "=".repeat(140));
  console.log(`   🏆 ${dbType} DATABASE ADAPTER RAW CRUD PERFORMANCE AUDIT`);
  console.log("   High-Fidelity • IQR Outlier Trimming • 95% Confidence • RSS Telemetry");
  console.log("=".repeat(140));

  console.log(
    `| ${"Operation".padEnd(28)} | ${"Avg Latency".padEnd(22)} | ${"p95".padEnd(14)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(28 + 22 + 14 + 12 + 12 + 6) + "|");

  const results = [insertResult, findResult, updateResult, deleteResult, bulkInsertResult];

  for (const r of results) {
    const rssDelta =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)} MB` : "—";
    const displayName = r.name.includes(":") ? r.name.split(":")[1].trim() : r.name;
    console.log(
      `| ${displayName.padEnd(28)} | ` +
        `${r.avgMs.toFixed(4)} ms (±${r.marginOfError.toFixed(3)})`.padEnd(22) +
        ` | ` +
        `${r.p95Ms.toFixed(4)} ms`.padEnd(14) +
        ` | ` +
        `${Math.round(r.rps).toLocaleString()}`.padEnd(12) +
        ` | ` +
        `${rssDelta.padEnd(12)} |`,
    );
  }
  console.log("=".repeat(140));

  if (indexWarningDetected) {
    console.log(`\n⚠️  DIAGNOSTIC ALERT: Index usage not detected during FIND ONE operations.`);
    console.log(
      `   Check if your adapter supports query explain/meta or if primary keys are indexed.`,
    );
  }

  console.log(`\n✨ Key Insights:`);
  console.log(`   • DB Type: ${dbType}`);
  console.log(`   • RPS (Single Insert): ${insertResult.rps.toFixed(1)} ops/sec`);
  console.log(
    `   • RPS (Bulk Insert 100): ${bulkInsertResult.rps.toFixed(1)} batches/sec (~${(bulkInsertResult.rps * bulkSize).toFixed(0)} items/sec)`,
  );
  console.log(
    `   • Memory delta helps detect connection/pool leaks or hydration overhead in the adapter`,
  );

  // Export results
  results.forEach((r) => exportResult(r));

  console.log("\n✅ Database adapter benchmark completed.");
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("Database Adapter CRUD Performance", async () => {
    await runDatabaseBenchmark();
  }, 450000);
}
