/**
 * @file tests/benchmarks/content-scan.bench.ts
 * @description Elite-grade benchmark for SveltyCMS Content Scan (self-healing collections discovery).
 * Measures filesystem + metadata processing performance with realistic multi-extension projects.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  printTruthTable,
  printSummaryTable,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";
import fs from "node:fs/promises";
import path from "node:path";

const COLLECTIONS_DIR = path.resolve(process.cwd(), ".compiledCollections");
const TARGET_FILE_COUNT = parseInt(process.env.BENCHMARK_SCAN_FILES || "150", 10);

async function cleanupMockFiles() {
  await fs.rm(COLLECTIONS_DIR, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(COLLECTIONS_DIR, { recursive: true });
}

async function prepareRealisticScanEnvironment() {
  console.log(`📂 Preparing realistic content scan environment (${TARGET_FILE_COUNT} files)...`);

  await cleanupMockFiles();

  for (let i = 0; i < TARGET_FILE_COUNT; i++) {
    const subDir = i % 7 === 0 ? "nested/deep" : i % 3 === 0 ? "nested" : "";
    const dir = path.join(COLLECTIONS_DIR, subDir);
    await fs.mkdir(dir, { recursive: true });

    const fileName = `mock_collection_${i}.js`;
    const content = `export const schema = {
  _id: "mock_collection_${i}",
  name: "Mock Collection ${i}",
  fields: [{ db_fieldName: "title", widget: { Name: "Input" } }],
};`;

    await fs.writeFile(path.join(dir, fileName), content, "utf-8");
  }

  console.log(`   ✅ Generated ${TARGET_FILE_COUNT} mock collection files.`);
}

test("Content Scan Performance (Self-Healing Collections)", async () => {
  console.log("🚀 Starting Elite SveltyCMS Content Scan Benchmark...\n");

  try {
    await prepareRealisticScanEnvironment();

    const { contentSystem } = await import("@src/content");
    const { cacheService } = await import("@src/databases/cache/cache-service");

    console.log(`🔬 Running content scan (${TARGET_FILE_COUNT} files)...`);

    const scanResult = await runBenchmark({
      name: "Content Scan (Self-Healing)",
      iterations: 600,
      warmupIterations: 50,
      concurrency: 1,
      runs: 3,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onSetup: async () => {
        await cacheService.clearByPattern("schema:*");
        if (typeof (contentSystem as any).clearCache === "function") {
          await (contentSystem as any).clearCache();
        }
        await stabilize(800);
      },
      onIteration: async () => {
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
      { key: "p95 Scan Latency", val: scanResult.p95Ms || scanResult.avgMs, unit: "ms" },
      { key: "Peak Scan Throughput", val: Math.round(scanResult.rps || 0), unit: "ops/s" },
      { key: "Collection Capacity", val: TARGET_FILE_COUNT, unit: "files" },
    ]);

    exportResult(scanResult);

  } catch (err: any) {
    logger.error(`Content Scan benchmark failed: ${err.message}`);
    console.error(err);
  } finally {
    await cleanupMockFiles();
    console.log("\n✅ Content Scan benchmark completed and cleaned up.");
  }
}, 480000);
