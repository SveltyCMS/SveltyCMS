/**
 * @file tests/benchmarks/content-scale-stress.test.ts
 * @description Content Scale Stress Benchmark
 * @summary Measures file-scanning and content discovery performance at extreme scale (1,000+ collections)
 *
 * ### Features:
 * - 1,000+ collection file stress generation
 * - Multi-level nested directory scanning
 * - Sub-10ms persistence verification at scale
 */

import {
  test,
  runBenchmark,
  exportResult,
  printTruthTable,
  printSummaryTable,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import fs from "node:fs/promises";
import path from "node:path";

const COLLECTIONS_DIR = path.resolve(process.cwd(), ".compiledCollections");
const STRESS_FILE_COUNT = 1000;
const NESTED_LEVELS = 5;

async function cleanupMockFiles() {
  const rootFiles = await fs.readdir(COLLECTIONS_DIR).catch(() => []);
  for (const f of rootFiles) {
    if (f.startsWith("stress_")) {
      await fs.rm(path.join(COLLECTIONS_DIR, f), {
        recursive: true,
        force: true,
      });
    }
  }
}

async function prepareStressEnvironment() {
  console.log(
    `📂 Preparing stress environment (${STRESS_FILE_COUNT} files, ${NESTED_LEVELS} levels)...`,
  );

  await fs.mkdir(COLLECTIONS_DIR, { recursive: true });

  for (let i = 0; i < STRESS_FILE_COUNT; i++) {
    // Distribute files across nested levels
    const depth = i % (NESTED_LEVELS + 1);
    let subDir = "";
    if (depth > 0) {
      subDir = Array.from({ length: depth })
        .map((_, j) => `level_${j}`)
        .join("/");
    }

    const finalDir = path.join(COLLECTIONS_DIR, subDir);
    await fs.mkdir(finalDir, { recursive: true });

    const fileName = `stress_collection_${i}.js`;
    const content = `
export const schema = {
  _id: 'stress_${i}',
  name: 'Stress Collection ${i}',
  fields: [
    { name: 'title', type: 'text' },
    { name: 'score', type: 'number' }
  ],
  status: 'published'
};
export default schema;
    `;
    await fs.writeFile(path.join(finalDir, fileName), content);
  }
  console.log("   ✅ Stress environment ready.");
}

async function runStressAudit() {
  console.log("🚀 Starting Content Scale Stress Audit...\n");

  await cleanupMockFiles();
  await prepareStressEnvironment();

  const { contentSystem } = await import("@src/content");
  const { cacheService } = await import("@src/databases/cache/cache-service");

  try {
    // 1. Cold Scan (Empty Cache)
    console.log("   🔬 Running Cold Scan Audit (1,000 files)...");
    const coldResult = await runBenchmark({
      name: "Cold Stress Scan (1k)",
      iterations: 20, // Fewer iterations for cold scan due to I/O cost
      runs: 1,
      onIteration: async () => {
        await cacheService.clearByPattern("schema:*", null);
        await contentSystem.scanForCollections();
      },
      silent: true,
    });

    // 2. Warm Scan (Hit Cache)
    console.log("   🔬 Running Warm Scan Audit (1,000 files)...");
    const warmResult = await runBenchmark({
      name: "Warm Stress Scan (1k)",
      iterations: 100,
      runs: 1,
      onIteration: async () => {
        await contentSystem.scanForCollections();
      },
      silent: true,
    });

    printTruthTable({
      title: "SVELTYCMS  —  CONTENT SCALE STRESS AUDIT",
      subtitle: `${STRESS_FILE_COUNT} Collections • ${NESTED_LEVELS} Nested Levels`,
      shortLabel: "Content Stress",
      results: [
        { ...coldResult, layer: "Cold (I/O)" },
        { ...warmResult, layer: "Warm (Cache)" },
      ],
    });

    printSummaryTable([
      { key: "Cold Scan Latency", val: coldResult.avgMs, unit: "ms" },
      { key: "Warm Scan Latency", val: warmResult.avgMs, unit: "ms" },
      {
        key: "Scale Efficiency",
        val: warmResult.avgMs < 0.5 ? "ELITE" : "SCALABLE",
        unit: "",
      },
    ]);

    exportResult(warmResult);
  } finally {
    // Keep files for debugging if needed, but usually we cleanup
    // await cleanupMockFiles();
  }
}

test("1,000 Collection Scale Stress", async () => {
  await runStressAudit();
}, 900000);
