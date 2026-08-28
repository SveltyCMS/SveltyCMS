/**
 * @file tests/benchmarks/content-scan.test.ts
 * @description Content Scan Benchmark (Optimized)
 * @summary Measures filesystem + metadata processing and persistent Mtime dirty-bit discovery.
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
import { logger } from "@utils/logger";
import {
  cleanupBenchmarkCompiledWorkspace,
  prepareBenchmarkCompiledWorkspace,
} from "@utils/benchmark-paths";
import fs from "node:fs/promises";
import path from "node:path";

const WORKSPACE = "scan";
const TARGET_FILE_COUNT = parseInt(process.env.BENCHMARK_SCAN_FILES || "150", 10);

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

async function cleanupMockFiles() {
  await cleanupBenchmarkCompiledWorkspace(WORKSPACE);
  const { USER_COMPILED_DIR, BENCHMARK_COMPILED_DIR } = await import("@utils/benchmark-paths");
  const safeDirs = [BENCHMARK_COMPILED_DIR, USER_COMPILED_DIR];

  for (const dir of safeDirs) {
    try {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        if (entry.startsWith("mock_collection_") || entry === "nested") {
          await fs.rm(path.join(dir, entry), { recursive: true, force: true });
        }
      }
    } catch {}
  }
}

function generateMockCollection(i: number): string {
  return `export const schema = {
  _id: "mock_collection_${i}",
  name: "Mock Collection ${i}",
  fields: [{ db_fieldName: "title", widget: { Name: "Input" } }],
};`;
}

async function prepareRealisticScanEnvironment(): Promise<void> {
  console.log(`📂 Preparing realistic content scan environment (${TARGET_FILE_COUNT} files)...`);

  const { compiled: scanRoot } = await prepareBenchmarkCompiledWorkspace(WORKSPACE);
  const { USER_COMPILED_DIR } = await import("@utils/benchmark-paths");

  const subdirs = ["", "nested", path.join("nested", "deep")];

  // 1. Create subdirectories upfront in both target roots
  for (const d of [scanRoot, USER_COMPILED_DIR]) {
    for (const sub of subdirs) {
      if (sub) {
        await fs.mkdir(path.join(d, sub), { recursive: true });
      }
    }
  }

  // 2. Chunked file writes to eliminate file descriptor exhaustion
  const CHUNK_SIZE = 50;
  for (let i = 0; i < TARGET_FILE_COUNT; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, TARGET_FILE_COUNT);
    const chunk = Array.from({ length: end - i }, (_, idx) => {
      const fileIdx = i + idx;
      const subIdx = fileIdx % 7 === 0 ? 2 : fileIdx % 3 === 0 ? 1 : 0;
      const subDir = subdirs[subIdx]!;
      const fileName = `mock_collection_${fileIdx}.js`;
      const content = generateMockCollection(fileIdx);

      return Promise.all([
        fs.writeFile(path.join(scanRoot, subDir, fileName), content, "utf-8"),
        fs.writeFile(path.join(USER_COMPILED_DIR, subDir, fileName), content, "utf-8"),
      ]);
    });
    await Promise.all(chunk);
  }

  console.log(`   ✅ Generated ${TARGET_FILE_COUNT} mock collection files.`);
}

test("Content Scan Performance (Self-Healing Collections)", async () => {
  console.log("🚀 Starting SveltyCMS Content Scan Benchmark...\n");

  try {
    await prepareRealisticScanEnvironment();

    const { contentSystem } = await import("../../src/content/index.server.ts");
    const { cacheService } = await import("../../src/databases/cache/cache-service");

    const hasClearCache = typeof (contentSystem as any).clearCache === "function";
    const purgeCacheState = async () => {
      await cacheService.clearByPattern("schema:*");
      if (hasClearCache) {
        await (contentSystem as any).clearCache();
      }
    };

    // ── 1. COLD SCAN AUDIT (HONEST TIMING: PURGE OUTSIDE LOOP) ──────────────
    console.log(
      `🔬 Running Cold Scan Audit (${TARGET_FILE_COUNT} files, cache purged between rounds)...`,
    );
    const COLD_ITERATIONS = 40;
    const coldTimes: number[] = [];

    for (let i = 0; i < COLD_ITERATIONS; i++) {
      await purgeCacheState();
      forceGarbageCollection();

      const t0 = performance.now();
      const collections = await (contentSystem as any).scanForCollections();
      coldTimes.push(performance.now() - t0);

      if (!Array.isArray(collections) || collections.length === 0) {
        throw new Error("Scan returned empty result during cold benchmark");
      }
    }

    const totalColdMs = coldTimes.reduce((a, b) => a + b, 0);
    const coldRps = totalColdMs > 0 ? coldTimes.length / (totalColdMs / 1000) : 0;

    const coldResult = computeStatistics(coldTimes, coldRps, {
      name: "Cold Discovery (Filesystem I/O)",
      runs: 1,
      concurrency: 1,
    });

    // ── 2. WARM SCAN AUDIT (DIRTY-BIT / MTIME HIT) ──────────────────────────
    forceGarbageCollection();
    await stabilize(100);

    console.log(`🔬 Running Warm Scan Audit (Mtime Tree Hit, No File Drift)...`);
    const warmResult = await runBenchmark({
      name: "Warm Discovery (Mtime Tree Hit)",
      iterations: 600,
      warmupIterations: 50,
      concurrency: 1,
      runs: 3,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const collections = await (contentSystem as any).scanForCollections();
        if (!Array.isArray(collections) || collections.length === 0) {
          throw new Error("Scan returned empty result during warm benchmark");
        }
      },
    });

    // ── REPORTING & TELEMETRY ───────────────────────────────────────────────
    const speedup =
      coldResult.avgMs > 0
        ? (coldResult.avgMs / Math.max(warmResult.avgMs, 0.001)).toFixed(1)
        : "N/A";

    const allResults = [
      { ...coldResult, layer: "I/O", shortLabel: "Cold Scan" },
      { ...warmResult, layer: "Mtime Tree", shortLabel: "Warm Scan" },
    ];

    printTruthTable({
      title: "SVELTYCMS — CONTENT SCAN AUDIT",
      shortLabel: "Scan",
      subtitle: `${TARGET_FILE_COUNT} Collections • Multi-Level • Dirty-Bit Verification`,
      results: allResults,
    });

    printSummaryTable(
      [
        { key: "Cold Scan Latency (I/O)", val: coldResult.avgMs.toFixed(3), unit: "ms" },
        { key: "Warm Scan Latency (Mtime)", val: warmResult.avgMs.toFixed(3), unit: "ms" },
        { key: "Mtime Cache Speedup", val: `${speedup}×`, unit: "" },
        { key: "Cold Throughput", val: Math.round(coldResult.rps), unit: "ops/s" },
        { key: "Warm Throughput", val: Math.round(warmResult.rps || 0), unit: "ops/s" },
        { key: "Scan Memory RSS Δ", val: (warmResult.rssDelta ?? 0).toFixed(2), unit: "MB" },
        { key: "Collection File Count", val: TARGET_FILE_COUNT, unit: "files" },
      ],
      "Content Scan Summary",
    );

    exportMetric("internals.scan.cold.avg", coldResult.avgMs, "ms");
    exportMetric("internals.scan.cold.p95", coldResult.p95Ms, "ms");
    exportMetric("internals.scan.warm.avg", warmResult.avgMs, "ms");
    exportMetric("internals.scan.warm.p95", warmResult.p95Ms, "ms");
    exportMetric("internals.scan.mtime_speedup", parseFloat(speedup) || 1, "x");

    for (const r of allResults) exportResult(r);
  } catch (err: any) {
    logger.error(`Content Scan benchmark failed: ${err.message}`);
    throw err;
  } finally {
    await cleanupMockFiles();
    console.log("\n✅ Content Scan benchmark completed and cleaned up.");
  }
}, 480_000);
