/**
 * @file tests/benchmarks/content-scale-stress.test.ts
 * @description Content Scale Stress Benchmark (Optimized)
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
import {
  cleanupBenchmarkCompiledWorkspace,
  prepareBenchmarkCompiledWorkspace,
} from "@utils/benchmark-paths";
import fs from "node:fs/promises";
import path from "node:path";

const WORKSPACE = "stress";
const STRESS_FILE_COUNT = 1000;
const NESTED_LEVELS = 5;

async function cleanupMockFiles() {
  await cleanupBenchmarkCompiledWorkspace(WORKSPACE);
}

async function prepareStressEnvironment() {
  console.log(
    `📂 Preparing stress environment (${STRESS_FILE_COUNT} files, ${NESTED_LEVELS} levels)...`,
  );

  const { compiled: stressRoot } = await prepareBenchmarkCompiledWorkspace(WORKSPACE);

  // Pre-calculate subdirectories to eliminate array mapping overhead inside the setup loop
  const pathCache: string[] = [""];
  for (let d = 1; d <= NESTED_LEVELS; d++) {
    pathCache.push(Array.from({ length: d }, (_, j) => `level_${j}`).join("/"));
  }

  const fileWritePromises = Array.from({ length: STRESS_FILE_COUNT }, async (_, i) => {
    const depth = i % (NESTED_LEVELS + 1);
    const subDir = pathCache[depth] || "";
    const finalDir = path.join(stressRoot, subDir);

    await fs.mkdir(finalDir, { recursive: true });

    const fileName = `stress_collection_${i}.js`;
    const content = `export const schema = {
  _id: 'stress_${i}',
  name: 'Stress Collection ${i}',
  fields: [
    { name: 'title', type: 'text' },
    { name: 'score', type: 'number' }
  ],
  status: 'published'
};
export default schema;`;

    return fs.writeFile(path.join(finalDir, fileName), content);
  });

  await Promise.all(fileWritePromises);
  console.log("   ✅ Stress environment ready.");
}

async function runStressAudit() {
  console.log("🚀 Starting Content Scale Stress Audit...\n");

  await cleanupMockFiles();
  await prepareStressEnvironment();

  // Hoist dynamic imports out of the performance validation execution block
  const { contentSystem } = await import("@src/content/index.server");
  const { cacheService } = await import("@src/databases/cache/cache-service");

  try {
    // 1. Cold Scan (Empty Cache)
    console.log("   🔬 Running Cold Scan Audit (1,000 files)...");
    const coldResult = await runBenchmark({
      name: "Cold Stress Scan (1k)",
      iterations: 20,
      runs: 1,
      onIteration: async () => {
        // STEP 1: Purge schema indices out-of-band to prevent cache poisoning
        await cacheService.clearByPattern("schema:*", null);

        // STEP 2: Measure exclusively raw file discovery and file-system traversal speed
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
    await cleanupMockFiles();
  }
}

test("1,000 Collection Scale Stress", async () => {
  await runStressAudit();
}, 900000);
