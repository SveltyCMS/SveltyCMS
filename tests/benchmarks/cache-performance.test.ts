/**
 * @file tests/benchmarks/cache-performance.test.ts
 * @description Enterprise cache benchmark for SveltyCMS.
 * Measures hit ratios, speedup ratios, and multi-layer invalidation under multi-concurrency.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult, exportMetric, stabilize } from "./benchmark-utils";
import { logger } from "@utils/logger.server";

const TEST_TENANT = "global" as any;
const TEST_COLLECTION = "bench_cache_enterprise";
const TEST_ENTRY_ID = "cache-bench-001";

const benchmarkSchema = {
  _id: TEST_COLLECTION,
  name: TEST_COLLECTION,
  fields: [{ name: "title", type: "text", widget: { Name: "Input" } }],
};

export async function runCacheBenchmark() {
  console.log("🚀 Starting Enterprise Cache Benchmark...\n");

  logger.level = "silent";

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/routes/api/cms");
  const { contentSystem } = await import("@src/content");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  await ensureFullInitialization();
  const db = getDb();
  if (!db) throw new Error("DB adapter missing");

  const cms = new LocalCMS(db);

  try {
    // 0. Cleanup any existing benchmark artifacts
    const compiledDir = path.join(process.cwd(), ".compiledCollections");
    const schemaPath = path.join(compiledDir, `${TEST_COLLECTION}.js`);
    await fs.rm(schemaPath, { force: true });

    // 🚀 Scaffold the schema file to ensure it's discovered by the content system
    await fs.mkdir(compiledDir, { recursive: true });
    await fs.writeFile(schemaPath, `export default ${JSON.stringify(benchmarkSchema, null, 2)};`);

    // Force a reload to pick up the new file
    await contentSystem.initialize(null, { skipReconciliation: false });

    if (db.collection?.createModel) {
      await db.collection.createModel(benchmarkSchema as any).catch(() => {});
    }

    const existing = await cms.collections.findById(TEST_COLLECTION as any, TEST_ENTRY_ID, {
      tenantId: TEST_TENANT,
      disableErrors: true,
      system: true,
    });

    if (!existing.success || !existing.data) {
      await cms.collections.create(
        TEST_COLLECTION as any,
        { _id: TEST_ENTRY_ID, title: "Initial Cache Entry" },
        { system: true, tenantId: TEST_TENANT },
      );
    }

    await stabilize();

    const RUNS = 3;
    const ITERATIONS = 2000;
    const WARMUP = 200;
    const results: any[] = [];

    async function clearAllCaches() {
      if (!db) return;
      await (db as any).monitoring?.cache?.clear?.();
      await (db as any).requestCache?.clear?.();
    }

    async function benchmark(name: string, concurrency: number, fn: () => Promise<void>) {
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
      await cms.collections.findById(TEST_COLLECTION as any, TEST_ENTRY_ID, {
        tenantId: TEST_TENANT,
        bypassCache: true,
        bypassRequestCache: true,
        system: true,
      });
    });

    // 2. L2 Cache Hit
    await cms.collections.findById(TEST_COLLECTION as any, TEST_ENTRY_ID, {
      tenantId: TEST_TENANT,
      bypassRequestCache: true,
      system: true,
    });
    const l2Res = await benchmark("L2 Cache Hit", 8, async () => {
      await cms.collections.findById(TEST_COLLECTION as any, TEST_ENTRY_ID, {
        tenantId: TEST_TENANT,
        bypassRequestCache: true,
        system: true,
      });
    });

    // 3. L1 Cache Hit
    await cms.collections.findById(TEST_COLLECTION as any, TEST_ENTRY_ID, {
      tenantId: TEST_TENANT,
      system: true,
    });
    const l1Res = await benchmark("L1 Memory Hit", 32, async () => {
      await cms.collections.findById(TEST_COLLECTION as any, TEST_ENTRY_ID, {
        tenantId: TEST_TENANT,
        system: true,
      });
    });

    // 4. Mixed 95% Hit Workload
    const mixedRes = await benchmark("95% Hit Workload", 16, async () => {
      const miss = Math.random() < 0.05;
      await cms.collections.findById(TEST_COLLECTION as any, TEST_ENTRY_ID, {
        tenantId: TEST_TENANT,
        bypassCache: miss,
        bypassRequestCache: miss,
        system: true,
      });
    });

    // 5. Write Invalidation
    const writeRes = await benchmark("Write Invalidation", 8, async () => {
      await cms.collections.update(
        TEST_COLLECTION as any,
        TEST_ENTRY_ID,
        { title: "Update " + Date.now() },
        { system: true, tenantId: TEST_TENANT },
      );
    });

    logger.level = "info";

    console.log("\n" + "=".repeat(150));
    console.log("📊 SVELTYCMS CACHE ENTERPRISE REPORT");
    console.log("L1 • L2 • DB • Mixed Load • Invalidation");
    console.log("=".repeat(150));

    console.log(
      `| ${"Scenario".padEnd(28)} | ${"Avg".padEnd(12)} | ${"p95".padEnd(12)} | ${"RPS".padEnd(12)} | ${"Speedup".padEnd(12)} |`,
    );
    console.log("|" + "-".repeat(145) + "|");

    for (const r of results) {
      const speed = (dbRes.avgMs / r.avgMs).toFixed(1) + "x";
      console.log(
        `| ${r.name.padEnd(28)} | ` +
          `${r.avgMs.toFixed(3)} ms`.padEnd(12) +
          ` | ${r.p95Ms.toFixed(3)}`.padEnd(12) +
          ` | ${Math.round(r.rps).toLocaleString().padEnd(12)}` +
          ` | ${speed.padEnd(12)} |`,
      );
    }
    console.log("=".repeat(150));

    console.log("\n✨ Insights:");
    console.log(`• L2 speedup vs DB: ${(dbRes.avgMs / l2Res.avgMs).toFixed(1)}x`);
    console.log(`• L1 speedup vs DB: ${(dbRes.avgMs / l1Res.avgMs).toFixed(1)}x`);
    console.log(`• 95% hit workload avg: ${mixedRes.avgMs.toFixed(3)} ms`);
    console.log(`• Write invalidation cost: ${writeRes.avgMs.toFixed(3)} ms`);

    const maxRps = Math.max(...results.map((r) => r.rps));
    exportMetric("cache.db.avg", dbRes.avgMs, "ms");
    exportMetric("cache.l2.avg", l2Res.avgMs, "ms");
    exportMetric("cache.l1.avg", l1Res.avgMs, "ms");
    exportMetric("cache.hit95.avg", mixedRes.avgMs, "ms");
    exportMetric("cache.speedup.l2", dbRes.avgMs / l2Res.avgMs, "ratio");
    exportMetric("cache.speedup.l1", dbRes.avgMs / l1Res.avgMs, "ratio");
    exportMetric("cache.invalidation.avg", writeRes.avgMs, "ms");
    exportMetric("cache.max_rps", maxRps, "req/s");

    exportResult({
      name: "Cache Aggregate",
      avgMs: mixedRes.avgMs,
      p95Ms: mixedRes.p95Ms,
      rps: maxRps,
    });

    for (const r of results) exportResult(r);

    console.log("\n✅ Cache benchmark completed.");
  } finally {
    // 🧹 Final Cleanup
    const compiledDir = path.join(process.cwd(), ".compiledCollections");
    await fs.rm(path.join(compiledDir, `${TEST_COLLECTION}.js`), { force: true });

    if (db.collection?.deleteModel) {
      await db.collection.deleteModel(TEST_COLLECTION).catch(() => {});
    }

    // Force a final refresh to remove from memory
    await contentSystem.initialize(null, { skipReconciliation: false }).catch(() => {});
  }
}

test("Cache Enterprise Suite", async () => {
  await runCacheBenchmark();
}, 450000);
