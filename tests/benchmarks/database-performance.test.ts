/**
 * @file tests/benchmarks/database-performance.test.ts
 * @description Professional benchmark for SveltyCMS Database Adapters (CRUD latencies).
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";
import path from "node:path";

const ITERATIONS = 1000;
const WARMUP_ITERATIONS = 100;

test("Database Adapter Performance Suite", async () => {
  console.log("🚀 Starting professional SveltyCMS Database Adapter Performance Benchmark...\n");

  const { getDb, getDbInitPromise } = await import("@src/databases/db");

  await getDbInitPromise();
  const adapter = getDb();

  if (!adapter) {
    console.error("❌ DB Adapter not initialized. Check your test config.");
    process.exit(1);
  }

  const dbType = (
    process.env.DB_TYPE || (adapter as any).constructor.name.replace("Adapter", "")
  ).toUpperCase();
  console.log(`📂 Testing Adapter: ${dbType}`);

  const collection = "collection_benchmarks";
  const baseData = {
    firstName: "Bench",
    lastName: "User",
    role: "admin",
    status: "active",
    benchmarkId: "test",
  };

  // Prepare schema (idempotent)
  console.log("🛠️ Ensuring benchmark collection schema...");
  try {
    await adapter.collection.createModel({
      _id: "benchmarks",
      name: "benchmarks",
      fields: [
        { name: "firstName", type: "text", required: true },
        { name: "lastName", type: "text", required: true },
        { name: "role", type: "text", required: true },
        { name: "status", type: "text", required: true },
        { name: "benchmarkId", type: "text", required: true },
      ],
    } as any);
  } catch {
    // Schema creation might skip if already initialized
  }

  // ========================
  // 1. INSERT Benchmark
  // ========================
  console.log(`\n📥 Benchmarking ${dbType} INSERT...`);
  const insertResult = await runBenchmark({
    name: `${dbType} Adapter: INSERT`,
    iterations: ITERATIONS,
    warmupIterations: WARMUP_ITERATIONS,
    runs: 3,
    onIteration: async (i: number) => {
      await adapter.crud.insert(collection, {
        ...baseData,
        benchmarkId: `bench-insert-${i}-${Date.now()}`,
      } as any);
    },
  });
  exportResult(insertResult);

  // ========================
  // 2. READ (findOne) Benchmark
  // ========================
  console.log(`📖 Benchmarking ${dbType} READ (findOne)...`);
  // First insert a stable record for reading
  const stableInsert = await adapter.crud.insert(collection, {
    ...baseData,
    benchmarkId: "stable-read-bench",
  } as any);

  if (!stableInsert.success) {
    throw new Error(`Failed to insert stable record: ${stableInsert.message}`);
  }
  const stableId = (stableInsert as any).data?._id;

  const readResult = await runBenchmark({
    name: `${dbType} Adapter: READ (findOne)`,
    iterations: ITERATIONS,
    warmupIterations: WARMUP_ITERATIONS,
    runs: 3,
    onIteration: async () => {
      await adapter.crud.findOne(collection, { _id: stableId });
    },
  });
  exportResult(readResult);

  // ========================
  // 3. UPDATE Benchmark
  // ========================
  console.log(`🔄 Benchmarking ${dbType} UPDATE...`);
  const updateResult = await runBenchmark({
    name: `${dbType} Adapter: UPDATE`,
    iterations: ITERATIONS,
    warmupIterations: WARMUP_ITERATIONS,
    runs: 3,
    onIteration: async (i: number) => {
      await adapter.crud.update(collection, stableId, { status: `updated-${i}` } as any);
    },
  });
  exportResult(updateResult);

  // ========================
  // 4. DELETE Benchmark
  // ========================
  console.log(`🗑️  Benchmarking ${dbType} DELETE...`);
  const deleteResult = await runBenchmark({
    name: `${dbType} Adapter: DELETE`,
    iterations: ITERATIONS,
    warmupIterations: WARMUP_ITERATIONS,
    runs: 3,
    onIteration: async () => {
      // Re-insert before each delete to ensure valid data
      const temp = await adapter.crud.insert(collection, {
        ...baseData,
        benchmarkId: `bench-delete-${Date.now()}`,
      } as any);
      if (temp.success && temp.data) {
        await adapter.crud.delete(collection, temp.data._id);
      }
    },
  });
  exportResult(deleteResult);

  // ========================
  // Final Summary
  // ========================
  console.log("\n" + "=".repeat(80));
  console.log(`📊 ${dbType} DATABASE ADAPTER PERFORMANCE SUMMARY`);
  console.log("=".repeat(80));
  console.log(
    `INSERT  → Avg: ${insertResult.avgMs.toFixed(4)} ms | RPS: ${insertResult.rps.toFixed(0)}`,
  );
  console.log(
    `READ    → Avg: ${readResult.avgMs.toFixed(4)} ms | RPS: ${readResult.rps.toFixed(0)}`,
  );
  console.log(
    `UPDATE  → Avg: ${updateResult.avgMs.toFixed(4)} ms | RPS: ${updateResult.rps.toFixed(0)}`,
  );
  console.log(
    `DELETE  → Avg: ${deleteResult.avgMs.toFixed(4)} ms | RPS: ${deleteResult.rps.toFixed(0)}`,
  );
  console.log("=".repeat(80) + "\n");

  // Optional: Create a compact matrix file for reporting
  const matrixData = {
    dbType: dbType.toLowerCase(),
    timestamp: new Date().toISOString(),
    insert: { avg: insertResult.avgMs, p95: insertResult.p95Ms, rps: insertResult.rps },
    read: { avg: readResult.avgMs, p95: readResult.p95Ms, rps: readResult.rps },
    update: { avg: updateResult.avgMs, p95: updateResult.p95Ms, rps: updateResult.rps },
    delete: { avg: deleteResult.avgMs, p95: deleteResult.p95Ms, rps: deleteResult.rps },
  };

  const fs = await import("node:fs/promises");
  const RESULTS_DIR =
    process.env.RESULTS_DIR || path.join(process.cwd(), "tests/benchmarks/results");
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  await fs.writeFile(
    path.join(RESULTS_DIR, `db-matrix-${dbType.toLowerCase()}.json`),
    JSON.stringify(matrixData, null, 2),
  );

  console.log(`💾 Results matrix exported for ${dbType.toUpperCase()}`);
}, 600000);
