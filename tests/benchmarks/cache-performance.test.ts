/**
 * @file tests/benchmarks/cache-performance.test.ts
 * @description Enterprise cache benchmark for SveltyCMS.
 * Measures hit/miss latencies and memory efficiency under high-concurrency workloads.
 */
import { test } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  stabilize,
  printAuditTable,
  printSummaryTable,
} from "./benchmark-utils";
import type { DatabaseId } from "../../src/databases/db-interface";

// ── configuration ────────────────────────────────────────────────────────────
const TEST_TENANT = "global";
const TEST_COLLECTION = "benchmark_cache";
const TEST_ENTRY_ID = "cache-entry-1" as any as DatabaseId;

const RUNS = 3;
const ITERATIONS = 2000;
const WARMUP = 200;

const benchmarkSchema = {
  name: TEST_COLLECTION,
  fields: [{ name: "title", type: "text", widget: { Name: "Input" } }],
};

export async function runCacheBenchmark() {
  console.log("🚀 Starting Enterprise Cache Benchmark...\n");

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/routes/api/cms");
  const { contentSystem } = await import("@src/content");

  await ensureFullInitialization();
  const db = getDb();
  if (!db) throw new Error("DB adapter missing");

  const cms = new LocalCMS(db);

  try {
    // 0. Cleanup and Scaffold
    const compiledDir = path.join(process.cwd(), ".compiledCollections");
    const schemaPath = path.join(compiledDir, `${TEST_COLLECTION}.js`);
    await fs.mkdir(compiledDir, { recursive: true });
    await fs.writeFile(schemaPath, `export default ${JSON.stringify(benchmarkSchema, null, 2)};`);

    await contentSystem.initialize(null, { skipReconciliation: false });

    if (db.collection?.createModel) {
      await db.collection.createModel(benchmarkSchema as any).catch(() => {});
    }

    const existing = await (cms.collections.findById as any)(
      TEST_COLLECTION as any,
      TEST_ENTRY_ID,
      {
        tenantId: TEST_TENANT,
        disableErrors: true,
        system: true,
      },
    );

    if (!existing.success || !existing.data) {
      await (cms.collections.create as any)(
        TEST_COLLECTION as any,
        { _id: TEST_ENTRY_ID, title: "Initial Cache Entry" },
        { system: true, tenantId: TEST_TENANT },
      );
    }

    await stabilize();
    const results: any[] = [];

    async function clearAllCaches() {
      if (!db) return;
      await (db as any).monitoring?.cache?.clear?.();
      await (db as any).requestCache?.clear?.();
    }

    async function benchmark(name: string, concurrency: number, fn: () => Promise<void>) {
      console.log(`   → ${name}`);
      const r = await runBenchmark({
        name,
        iterations: ITERATIONS,
        warmupIterations: WARMUP,
        runs: RUNS,
        concurrency,
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onSetup: stabilize,
        onIteration: fn,
      });
      results.push(r);
      return r;
    }

    // 1. Cold DB Read
    await clearAllCaches();
    const dbRes = await benchmark("Cold DB Read", 1, async () => {
      await (cms.collections.findById as any)(TEST_COLLECTION as any, TEST_ENTRY_ID, {
        tenantId: TEST_TENANT,
        bypassCache: true,
        bypassRequestCache: true,
        system: true,
      });
    });

    // 2. L2 Cache Hit
    await (cms.collections.findById as any)(TEST_COLLECTION as any, TEST_ENTRY_ID, {
      tenantId: TEST_TENANT,
      bypassRequestCache: true,
      system: true,
    });
    const l2Res = await benchmark("L2 Cache Hit", 8, async () => {
      await (cms.collections.findById as any)(TEST_COLLECTION as any, TEST_ENTRY_ID, {
        tenantId: TEST_TENANT,
        bypassRequestCache: true,
        system: true,
      });
    });

    // 3. L1 Cache Hit
    await (cms.collections.findById as any)(TEST_COLLECTION as any, TEST_ENTRY_ID, {
      tenantId: TEST_TENANT,
      system: true,
    });
    const l1Res = await benchmark("L1 Memory Hit", 32, async () => {
      await (cms.collections.findById as any)(TEST_COLLECTION as any, TEST_ENTRY_ID, {
        tenantId: TEST_TENANT,
        system: true,
      });
    });

    // 4. Mixed 95% Hit Workload
    await benchmark("95% Hit Workload", 16, async () => {
      const miss = Math.random() < 0.05;
      await (cms.collections.findById as any)(TEST_COLLECTION as any, TEST_ENTRY_ID, {
        tenantId: TEST_TENANT,
        bypassCache: miss,
        bypassRequestCache: miss,
        system: true,
      });
    });

    // 5. Write Invalidation
    const writeRes = await benchmark("Write Invalidation", 8, async () => {
      await (cms.collections.update as any)(
        TEST_COLLECTION as any,
        TEST_ENTRY_ID,
        { title: "Update " + Date.now() },
        { system: true, tenantId: TEST_TENANT },
      );
    });

    // ─── reporting ─────────────────────────────────────────────────────────────

    printAuditTable({
      title: "SVELTYCMS  —  CACHE PERFORMANCE",
      subtitle: "L1/L2 Cache • Write Invalidation • High-Concurrency",
      results,
    });

    const maxRps = Math.max(...results.map((r) => r.rps));

    printSummaryTable([
      { key: "Cold DB Read (p95)", val: dbRes.p95Ms, unit: "ms" },
      { key: "L2 Cache Hit (p95)", val: l2Res.p95Ms, unit: "ms" },
      { key: "L1 Memory Hit (p95)", val: l1Res.p95Ms, unit: "ms" },
      { key: "L1 Speedup vs DB", val: (dbRes.avgMs / l1Res.avgMs).toFixed(1) + "x", unit: "" },
      { key: "Peak Throughput", val: Math.round(maxRps), unit: "req/s" },
      { key: "Write Invalidation Cost", val: writeRes.avgMs, unit: "ms" },
    ]);

    for (const r of results) exportResult(r);

    console.log("\n✅ Cache benchmark completed.");
  } finally {
    const compiledDir = path.join(process.cwd(), ".compiledCollections");
    await fs.rm(path.join(compiledDir, `${TEST_COLLECTION}.js`), { force: true });
    const dbFinal = getDb();
    if (dbFinal?.collection?.deleteModel) {
      await dbFinal.collection.deleteModel(TEST_COLLECTION).catch(() => {});
    }
    await contentSystem.initialize(null, { skipReconciliation: false }).catch(() => {});
  }
}

test("Cache Enterprise Suite", async () => {
  await runCacheBenchmark();
}, 450000);
