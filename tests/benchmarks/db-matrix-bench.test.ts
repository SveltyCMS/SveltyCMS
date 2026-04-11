/**
 * @file tests/benchmarks/db-matrix-bench.test.ts
 * @description Master Database Adapter Benchmark for all supported engines.
 * Measures raw driver performance by bypassing the HTTP stack.
 */

import { describe, test, beforeAll } from "bun:test";
import { performance } from "node:perf_hooks";
import fs from "node:fs/promises";
import path from "node:path";

describe("Enterprise Database Adapter Matrix", () => {
  let adapter: any;

  beforeAll(async () => {
    // Use the official bootstrapper
    const { getDb, getDbInitPromise } = await import("@src/databases/db");
    await getDbInitPromise();
    adapter = getDb();
    if (!adapter) throw new Error("Adapter failed to initialize");
  });

  test("Raw Latency Audit", async () => {
    const dbType = adapter.constructor.name.replace("Adapter", "").toUpperCase();
    console.log(`\n💎 Benchmarking Adapter: ${dbType}`);

    const collection = "collection_benchmarks";
    const dummyData = {
      firstName: "Bench",
      lastName: "User",
      status: "active",
      benchmarkId: "matrix-test",
    };

    // --- 1. WARMUP ---
    for (let i = 0; i < 20; i++) {
      await adapter.crud.insert(collection, { ...dummyData, benchmarkId: "warm" });
    }

    // --- 2. MEASUREMENT ---
    const ITERATIONS = 100;
    const metrics: any = { insert: [], read: [], update: [], delete: [] };

    for (let i = 0; i < ITERATIONS; i++) {
      const s1 = performance.now();
      const insRes = await adapter.crud.insert(collection, {
        ...dummyData,
        benchmarkId: `bench-${i}`,
      });
      metrics.insert.push(performance.now() - s1);

      if (!insRes.success || !insRes.data) continue;
      const id = insRes.data._id;

      const s2 = performance.now();
      await adapter.crud.findOne(collection, { _id: id });
      metrics.read.push(performance.now() - s2);

      const s3 = performance.now();
      await adapter.crud.update(collection, id, { status: "updated" });
      metrics.update.push(performance.now() - s3);

      const s4 = performance.now();
      await adapter.crud.delete(collection, id);
      metrics.delete.push(performance.now() - s4);
    }

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const results = {
      insert: avg(metrics.insert),
      read: avg(metrics.read),
      update: avg(metrics.update),
      delete: avg(metrics.delete),
    };

    console.table([
      { Operation: "Insert", Latency: results.insert.toFixed(4) + " ms" },
      { Operation: "Read", Latency: results.read.toFixed(4) + " ms" },
      { Operation: "Update", Latency: results.update.toFixed(4) + " ms" },
      { Operation: "Delete", Latency: results.delete.toFixed(4) + " ms" },
    ]);

    // Export result for master reporter
    const resDir = path.join(process.cwd(), "tests/benchmarks/results");
    await fs.mkdir(resDir, { recursive: true });
    await fs.writeFile(
      path.join(resDir, `adapter-${dbType.toLowerCase()}.json`),
      JSON.stringify({ dbType, metrics: results, timestamp: new Date().toISOString() }, null, 2),
    );
  }, 600000);
});
