/**
 * @file tests/benchmarks/database-performance.ts
 * @description Performance benchmarking for SveltyCMS Database Adapters.
 * Measures real-world latencies using our internal adapter abstraction.
 */

// 1. Initialize Mocks
import "../unit/setup.ts";
import { performance } from "node:perf_hooks";
import fs from "node:fs/promises";
import path from "node:path";

const ITERATIONS = 100;
const RESULTS_DIR = process.env.RESULTS_DIR || path.join(process.cwd(), "tests/benchmarks/results");

async function runDatabaseBenchmark() {
  console.log("\n🚀 SveltyCMS Adapter Performance Benchmark");

  // 1. Load the actual DB Adapter (Real modules loaded via BUN_TEST_MOCKS=false)
  const { getDb, getDbInitPromise } = await import("@src/databases/db");

  console.log("⏳ Initializing real database connection...");
  await getDbInitPromise();

  const adapter = getDb();

  if (!adapter) {
    console.error("❌ DB Adapter not initialized. Check your config/private.test.ts");
    process.exit(1);
  }

  const dbType =
    process.env.DB_TYPE || adapter.constructor.name.replace("Adapter", "").toLowerCase();
  console.log(`📂 Testing Adapter: ${dbType.toUpperCase()}`);

  const collection = "collection_benchmarks";
  const dummyData = {
    firstName: "Bench",
    lastName: "User",
    role: "admin",
    status: "active",
    benchmarkId: "test",
  };

  // --- 0. ENSURE COLLECTION EXISTS ---
  console.log("🛠️ Preparing benchmark schema...");
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
  } catch (err) {
    console.warn("Schema creation skipped or failed (might already exist):", err);
  }

  // --- 1. WARMUP ---
  console.log("🔥 Warming up (20 iterations)...");
  for (let i = 0; i < 20; i++) {
    const res = await adapter.crud.insert(collection, { ...dummyData, benchmarkId: "warm" } as any);
    if (res.success && res.data) {
      await adapter.crud.findOne(collection, { _id: res.data._id });
      await adapter.crud.delete(collection, res.data._id);
    }
  }

  // --- 2. MEASUREMENT ---
  console.log(
    `💾 Measuring ${dbType.toUpperCase()} Adapter Latencies (${ITERATIONS} iterations)...`,
  );

  const metrics = {
    insert: [] as number[],
    read: [] as number[],
    update: [] as number[],
    delete: [] as number[],
  };

  for (let i = 0; i < ITERATIONS; i++) {
    const s1 = performance.now();
    const insRes = await adapter.crud.insert(collection, {
      ...dummyData,
      benchmarkId: `bench-${i}`,
    } as any);
    metrics.insert.push(performance.now() - s1);

    if (!insRes.success || !insRes.data) continue;
    const id = insRes.data._id;

    const s2 = performance.now();
    await adapter.crud.findOne(collection, { _id: id });
    metrics.read.push(performance.now() - s2);

    const s3 = performance.now();
    await adapter.crud.update(collection, id, { status: "updated" } as any);
    metrics.update.push(performance.now() - s3);

    const s4 = performance.now();
    await adapter.crud.delete(collection, id);
    metrics.delete.push(performance.now() - s4);
  }

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const results = {
    insert: avg(metrics.insert),
    read: avg(metrics.read),
    update: avg(metrics.update),
    delete: avg(metrics.delete),
  };

  console.log(`\n📊 Average ${dbType.toUpperCase()} Adapter Latencies (ms):`);
  console.log("-----------------------------------------------------------");
  console.log(`Insert : ${results.insert.toFixed(4)} ms`);
  console.log(`Read   : ${results.read.toFixed(4)} ms`);
  console.log(`Update : ${results.update.toFixed(4)} ms`);
  console.log(`Delete : ${results.delete.toFixed(4)} ms`);
  console.log("-----------------------------------------------------------");

  // Save results for matrix reporter
  const matrixFile = path.join(RESULTS_DIR, `matrix-${dbType.toLowerCase()}.json`);
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  await fs.writeFile(
    matrixFile,
    JSON.stringify(
      {
        dbType,
        metrics: results,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(`✅ Benchmark complete for ${dbType.toUpperCase()}.`);
  process.exit(0);
}

import { test } from "bun:test";

test("Database Adapter Performance Suite", async () => {
  await runDatabaseBenchmark();
}, 600000);
