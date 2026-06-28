/**
 * @file tests/benchmarks/content-scan.test.ts
 * @description Content Scan Benchmark (Optimized)
 * @summary Measures filesystem + metadata processing for self-healing collections discovery
 *
 * ### Features:
 * - Realistic multi-extension project simulation (150+ files)
 * - Nested directory traversal and metadata extraction
 * - Persistent Mtime Tree (dirty-bit) optimization verification
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  printTruthTable,
  printSummaryTable,
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

async function cleanupMockFiles() {
  await cleanupBenchmarkCompiledWorkspace(WORKSPACE);
}

async function prepareRealisticScanEnvironment() {
  console.log(`📂 Preparing realistic content scan environment (${TARGET_FILE_COUNT} files)...`);

  const { compiled: scanRoot } = await prepareBenchmarkCompiledWorkspace(WORKSPACE);

  // Pre-calculate structural targets to prevent string allocations within the async loop
  const subdirs = ["", "nested", "nested/deep"];

  const fileWritePromises = Array.from({ length: TARGET_FILE_COUNT }, async (_, i) => {
    const subIdx = i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0;
    const subDir = subdirs[subIdx]!;
    const dir = path.join(scanRoot, subDir);

    await fs.mkdir(dir, { recursive: true });

    const fileName = `mock_collection_${i}.js`;
    const content = `export const schema = {
  _id: "mock_collection_${i}",
  name: "Mock Collection ${i}",
  fields: [{ db_fieldName: "title", widget: { Name: "Input" } }],
};`;

    return fs.writeFile(path.join(dir, fileName), content, "utf-8");
  });

  await Promise.all(fileWritePromises);
  console.log(`   ✅ Generated ${TARGET_FILE_COUNT} mock collection files.`);
}

test("Content Scan Performance (Self-Healing Collections)", async () => {
  console.log("🚀 Starting SveltyCMS Content Scan Benchmark...\n");

  try {
    await prepareRealisticScanEnvironment();

    // Hoist module system dynamic resolutions outside the execution block
    const { contentSystem } = await import("../../src/content/index.server.ts");
    const { cacheService } = await import("../../src/databases/cache/cache-service");

    console.log(`🔬 Running content scan (${TARGET_FILE_COUNT} files)...`);

    const scanResult = await runBenchmark({
      name: "Content Scan (Self-Healing)",
      iterations: 600,
      warmupIterations: 50,
      concurrency: 1, // Maintained serially to safely handle incremental keyspace mutations
      runs: 3,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        // Force the cache eviction to run *per iteration* to measure actual self-healing costs
        await cacheService.clearByPattern("schema:*");
        if (typeof (contentSystem as any).clearCache === "function") {
          await (contentSystem as any).clearCache();
        }

        const collections = await (contentSystem as any).scanForCollections();

        if (!Array.isArray(collections) || collections.length === 0) {
          throw new Error("Scan returned empty result");
        }
      },
    });

    exportMetric("internals.scan.avg", scanResult.avgMs, "ms");
    exportMetric("internals.scan.p95", scanResult.p95Ms || scanResult.avgMs, "ms");

    printTruthTable({
      title: "SVELTYCMS — CONTENT SCAN AUDIT",
      shortLabel: "Scan",
      subtitle: `${TARGET_FILE_COUNT} Collections • Multi-Level • Self-Healing`,
      results: [scanResult],
    });

    printSummaryTable([
      { key: "Average Scan Latency", val: scanResult.avgMs, unit: "ms" },
      {
        key: "p95 Scan Latency",
        val: scanResult.p95Ms || scanResult.avgMs,
        unit: "ms",
      },
      {
        key: "Peak Scan Throughput",
        val: Math.round(scanResult.rps || 0),
        unit: "ops/s",
      },
      { key: "Collection Capacity", val: TARGET_FILE_COUNT, unit: "files" },
    ]);

    exportResult(scanResult);
  } catch (err: any) {
    logger.error(`Content Scan benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    await cleanupMockFiles();
    console.log("\n✅ Content Scan benchmark completed and cleaned up.");
  }
}, 480000);
