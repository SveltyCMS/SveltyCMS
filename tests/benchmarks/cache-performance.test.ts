/**
 * @file tests/benchmarks/cache-performance.test.ts
 * @description High-fidelity benchmark for SveltyCMS 3-layer caching system (L1 Request / L2 Global / DB).
 *              Uses the new professional benchmarking engine with IQR trimming, MoE, and memory tracking.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult, checkBenchmarkEnv, stabilize } from "./benchmark-utils";
import { logger } from "@utils/logger.server";

const TEST_TENANT = "global" as any;
const TEST_COLLECTION = "benchmark_cache_test";
const TEST_ENTRY_ID = "cache-bench-entry-001";

const benchmarkSchema = {
  _id: TEST_COLLECTION,
  name: TEST_COLLECTION,
  fields: [{ name: "title", type: "text", widget: { Name: "Input" } }],
};

export async function runCacheBenchmark() {
  checkBenchmarkEnv();
  console.log("🚀 Starting SveltyCMS 3-Layer Cache Performance Benchmark...\n");

  logger.level = "silent";

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/routes/api/cms");
  const { contentSystem } = await import("@src/content");

  await ensureFullInitialization();
  const dbAdapter = getDb();
  if (!dbAdapter) throw new Error("DB not initialized");

  const cms = new LocalCMS(dbAdapter);

  // Setup collection (idempotent)
  console.log(`📦 Ensuring collection "${TEST_COLLECTION}" exists...`);
  let collections = contentSystem.getCollections(TEST_TENANT) || [];
  if (!collections.some((c: any) => c._id === TEST_COLLECTION)) {
    if (dbAdapter.collection?.createModel) {
      await dbAdapter.collection.createModel(benchmarkSchema as any).catch(() => {});
    }
    if (dbAdapter.content?.nodes?.create) {
      await dbAdapter.content.nodes
        .create({
          _id: TEST_COLLECTION,
          path: `/collection/${TEST_COLLECTION}`,
          name: TEST_COLLECTION,
          nodeType: "collection",
          status: "published",
          collectionDef: benchmarkSchema,
          tenantId: TEST_TENANT,
          order: 0,
        } as any)
        .catch(() => {});
    }
    await contentSystem.refresh(TEST_TENANT);
  }

  // Seed entry (idempotent)
  console.log(`📝 Ensuring test entry exists...`);
  let entry = await cms.collections.findById(TEST_COLLECTION as any, TEST_ENTRY_ID, {
    tenantId: TEST_TENANT,
    disableErrors: true,
  });

  if (!entry.success || !entry.data) {
    await cms.collections.create(
      TEST_COLLECTION as any,
      {
        _id: TEST_ENTRY_ID,
        title: "Cache Benchmark Entry",
      },
      { system: true, tenantId: TEST_TENANT },
    );
  }

  const ITERATIONS = 2000;
  const WARMUP = Math.floor(ITERATIONS * 0.15);
  const CONCURRENCY = 1;

  console.log(`\n🔬 Running cache audits (${ITERATIONS} iterations, concurrency=1)...`);

  const results: any[] = [];

  // Helper to run a benchmark with explicit cache stabilization
  const runCacheLayer = async (name: string, layer: string, onIteration: () => Promise<void>) => {
    // Explicitly clear cache and stabilize before each phase
    await dbAdapter.monitoring.cache.clear();
    await stabilize();

    const res = await runBenchmark({
      name: `SDK: ${name}`,
      iterations: ITERATIONS,
      concurrency: CONCURRENCY,
      warmupIterations: WARMUP,
      runs: 2,
      trimOutliers: "iqr",
      measureMemory: true,
      onIteration,
      silent: true,
    });

    results.push({ ...res, layer, type: name });
    return res;
  };

  // 1. Cold DB Read (full cache bypass)
  const coldResult = await runCacheLayer("Cache Miss", "Cold DB Read", async () => {
    await cms.collections.findById(TEST_COLLECTION as any, TEST_ENTRY_ID, {
      tenantId: TEST_TENANT,
      bypassCache: true,
      bypassRequestCache: true,
    });
  });

  // 2. L2 Global Cache Hit
  const l2Result = await runCacheLayer("L2 Hit", "L2 Global Cache", async () => {
    await cms.collections.findById(TEST_COLLECTION as any, TEST_ENTRY_ID, {
      tenantId: TEST_TENANT,
      bypassRequestCache: true, // bypass only L1
    });
  });

  // 3. Full L1 + L2 Hit (Request-scoped memory cache)
  const l1Result = await runCacheLayer("L1+L2 Hit", "L1 Request Memory", async () => {
    await cms.collections.findById(TEST_COLLECTION as any, TEST_ENTRY_ID, {
      tenantId: TEST_TENANT,
    });
  });

  // 4. Cache Invalidation / Write-Through Performance
  // This measures the cost of updating an entry and the subsequent cache clear
  const writeResult = await runCacheLayer("Write-Through", "Invalidation Cost", async () => {
    await cms.collections.update(
      TEST_COLLECTION as any,
      TEST_ENTRY_ID,
      {
        title: `Updated ${Math.random()}`,
      },
      { system: true, tenantId: TEST_TENANT },
    );
  });

  logger.level = "info";

  // ===================================================================
  // High-Fidelity Professional Dashboard
  // ===================================================================
  const baseline = coldResult.avgMs;
  console.log("\n" + "=".repeat(140));
  console.log("   📊 SVELTYCMS 3-LAYER CACHE PERFORMANCE AUDIT");
  console.log("   High-Fidelity • IQR Trimming • 95% Confidence Interval • Cache-Flush Isolation");
  console.log("=".repeat(140));

  console.log(
    `| ${"Cache Scenario".padEnd(38)} | ${"Avg Latency".padEnd(20)} | ${"p95".padEnd(12)} | ${"RPS".padEnd(12)} | ${"Speedup".padEnd(10)} | ${"RSS Δ".padEnd(10)} |`,
  );
  console.log("|" + "-".repeat(38 + 20 + 12 + 12 + 10 + 10 + 6) + "|");

  for (const r of results) {
    const speedup = (baseline / r.avgMs).toFixed(1) + "x";
    const memLabel = (r.rssDelta >= 0 ? "+" : "") + r.rssDelta.toFixed(2) + " MB";

    console.log(
      `| ${r.layer.padEnd(38)} | ` +
        `${r.avgMs.toFixed(4)} ms (±${r.marginOfError.toFixed(3)})`.padEnd(20) +
        ` | ` +
        `${r.p95Ms.toFixed(4)} ms`.padEnd(12) +
        ` | ` +
        `${Math.round(r.rps).toLocaleString()}`.padEnd(12) +
        ` | ` +
        `${speedup.padEnd(10)} | ` +
        `${memLabel.padEnd(10)} |`,
    );
  }

  console.log("=".repeat(140));

  console.log(`\n✨ Performance Insights:`);
  console.log(
    `   • L2 Global Cache provides a ${(baseline / l2Result.avgMs).toFixed(1)}x speedup over raw DB queries.`,
  );
  console.log(
    `   • L1 Request Cache provides a ${(baseline / l1Result.avgMs).toFixed(1)}x speedup, approaching near-zero latency.`,
  );
  console.log(
    `   • Write-Through cost: The overhead of cache invalidation is ~${(writeResult.avgMs - coldResult.avgMs).toFixed(3)} ms per update.`,
  );

  results.forEach((r) => exportResult(r));
  console.log("\n✅ Cache benchmark suite completed successfully.");
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("Local SDK 3-Layer Cache Performance", async () => {
    await runCacheBenchmark();
  }, 450000);
}
