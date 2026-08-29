/**
 * @file tests/benchmarks/content-scale-stress.test.ts
 * @description Content Scale Stress Benchmark (Optimized)
 * @summary Measures file-scanning and content discovery performance at scale (1,000+ collections).
 */

import {
  test,
  runBenchmark,
  computeStatistics,
  exportResult,
  exportMetric,
  printTruthTable,
  printSummaryTable,
  stabilize,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import {
  cleanupBenchmarkCompiledWorkspace,
  prepareBenchmarkCompiledWorkspace,
} from "@utils/benchmark-paths";
import fs from "node:fs/promises";
import path from "node:path";

const WORKSPACE = "stress";
const STRESS_FILE_COUNT = 1000;
const NESTED_LEVELS = 5;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

function generateSchemaContent(id: number): string {
  return `export const schema = {
  _id: 'stress_${id}',
  name: 'Stress Collection ${id}',
  fields: [
    { name: 'title', type: 'text' },
    { name: 'score', type: 'number' }
  ],
  status: 'published'
};
export default schema;`;
}

async function prepareStressEnvironment(stressRoot: string): Promise<void> {
  console.log(
    `📂 Preparing stress environment (${STRESS_FILE_COUNT} files across ${NESTED_LEVELS} nested levels)...`,
  );

  // 1. Pre-calculate directory paths and create them upfront
  const dirPaths: string[] = [stressRoot];
  for (let d = 1; d <= NESTED_LEVELS; d++) {
    const relPath = Array.from({ length: d }, (_, j) => `level_${j}`).join(path.sep);
    const fullPath = path.join(stressRoot, relPath);
    dirPaths.push(fullPath);
    await fs.mkdir(fullPath, { recursive: true });
  }

  // 2. Write files in throttled chunks to eliminate EMFILE / descriptor exhaustion
  const CHUNK_SIZE = 100;
  for (let i = 0; i < STRESS_FILE_COUNT; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, STRESS_FILE_COUNT);
    const chunk = Array.from({ length: end - i }, (_, idx) => {
      const fileIdx = i + idx;
      const targetDir = dirPaths[fileIdx % dirPaths.length]!;
      const filePath = path.join(targetDir, `stress_collection_${fileIdx}.js`);
      return fs.writeFile(filePath, generateSchemaContent(fileIdx), "utf-8");
    });
    await Promise.all(chunk);
  }

  console.log("   ✅ Stress environment files ready.");
}

async function runStressAudit() {
  console.log("🚀 Starting Content Scale Stress Audit...\n");

  const { compiled: stressRoot } = await prepareBenchmarkCompiledWorkspace(WORKSPACE);

  try {
    await prepareStressEnvironment(stressRoot);

    const { contentSystem } = await import("@src/content/index.server");
    const { cacheService } = await import("@src/databases/cache/cache-service");

    // ── 1. COLD SCAN AUDIT (I/O BOUND, PURGED CACHE) ────────────────────────
    console.log(`   🔬 Running Cold Scan Audit (${STRESS_FILE_COUNT} files)...`);
    const COLD_ROUNDS = 20;
    const coldTimes: number[] = [];

    for (let i = 0; i < COLD_ROUNDS; i++) {
      // Purge cache and trigger GC outside timing window
      await cacheService.clearByPattern("schema:*", null);
      forceGarbageCollection();

      const t0 = performance.now();
      const collections = await contentSystem.scanForCollections();
      coldTimes.push(performance.now() - t0);

      // Verify scan correctness on first iteration
      if (i === 0 && Array.isArray(collections) && collections.length < STRESS_FILE_COUNT) {
        console.warn(
          `⚠️ Discovery mismatch: expected >= ${STRESS_FILE_COUNT}, found ${collections.length}`,
        );
      }
    }

    const totalColdTime = coldTimes.reduce((a, b) => a + b, 0);
    const coldRps = totalColdTime > 0 ? coldTimes.length / (totalColdTime / 1000) : 0;

    const coldResult = computeStatistics(coldTimes, coldRps, {
      name: `Cold Stress Scan (${STRESS_FILE_COUNT} files)`,
      runs: 1,
      concurrency: 1,
    });

    // ── 2. WARM SCAN AUDIT (IN-MEMORY CACHED HIT) ───────────────────────────
    forceGarbageCollection();
    await stabilize(200);

    console.log(`   🔬 Running Warm Scan Audit (Steady-State Cache Hit)...`);
    const warmResult = await runBenchmark({
      name: `Warm Stress Scan (${STRESS_FILE_COUNT} files)`,
      iterations: 100,
      warmupIterations: 10,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const collections = await contentSystem.scanForCollections();
        if (!collections) throw new Error("Warm scan returned empty content state");
      },
    });

    // ── REPORTING & TELEMETRY ───────────────────────────────────────────────
    const speedup =
      coldResult.avgMs > 0
        ? (coldResult.avgMs / Math.max(warmResult.avgMs, 0.001)).toFixed(1)
        : "N/A";

    const allResults = [
      { ...coldResult, layer: "Cold (I/O)", shortLabel: "Cold Scan (1k)" },
      { ...warmResult, layer: "Warm (Cache)", shortLabel: "Warm Scan (1k)" },
    ];

    printTruthTable({
      title: "SVELTYCMS — CONTENT SCALE STRESS AUDIT",
      subtitle: `${STRESS_FILE_COUNT} Collections • ${NESTED_LEVELS} Nested Levels`,
      shortLabel: "Content Stress",
      results: allResults,
    });

    printSummaryTable(
      [
        { key: "Cold Scan Latency (I/O)", val: coldResult.avgMs.toFixed(2), unit: "ms" },
        { key: "Warm Scan Latency (Cache)", val: warmResult.avgMs.toFixed(3), unit: "ms" },
        { key: "Cache Speedup Factor", val: `${speedup}×`, unit: "" },
        { key: "Cold Throughput", val: Math.round(coldResult.rps), unit: "scans/s" },
        { key: "Warm Throughput", val: Math.round(warmResult.rps), unit: "scans/s" },
        {
          key: "Scale Health Rating",
          val: warmResult.avgMs < 1.0 ? "ELITE (<1ms)" : "SCALABLE",
          unit: "",
        },
      ],
      "Content Scale Summary",
    );

    exportMetric("internals.scale.cold_scan_ms", coldResult.avgMs, "ms");
    exportMetric("internals.scale.warm_scan_ms", warmResult.avgMs, "ms");
    exportMetric("internals.scale.speedup", parseFloat(speedup) || 1, "x");

    exportResult(coldResult);
    exportResult(warmResult);
  } finally {
    await cleanupBenchmarkCompiledWorkspace(WORKSPACE);
    console.log("\n✅ Content scale stress benchmark completed.");
  }
}

test("1,000 Collection Scale Stress", async () => {
  await runStressAudit();
}, 900_000);
