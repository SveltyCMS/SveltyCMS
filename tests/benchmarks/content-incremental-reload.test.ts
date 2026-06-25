/**
 * @file tests/benchmarks/content-incremental-reload.test.ts
 * @description Incremental Content Reload Benchmark
 * @summary Measures surgical single-file fullReload vs full reconciliation path
 *
 * ### Features:
 * - Incremental `fullReload(changedFile)` — dev watcher / hot-reload path
 * - Full `fullReload()` — complete reconciliation with SCHEMA cache wipe
 * - Validates June 2026 optimization: skip category invalidation on single-file updates
 * - Isolated under `.compiledCollections/test/incremental/` (user live data untouched)
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
import {
  cleanupBenchmarkCompiledWorkspace,
  prepareBenchmarkCompiledWorkspace,
} from "@utils/benchmark-paths";
import fs from "node:fs/promises";
import path from "node:path";

const WORKSPACE = "incremental";
/** Matches content-scale-stress (1k) — full reload cost scales with tree size; incremental stays O(1). */
const FIXTURE_COUNT = 1000;

const FIXTURE_SCHEMA = (id: string, name: string) => `export const schema = {
  _id: "${id}",
  name: "${name}",
  fields: [{ db_fieldName: "title", widget: { Name: "Input" }, label: "Title", required: true, translated: false }],
};
export default schema;`;

/** Isolated 1k-file tree under test/incremental — user collections at root are preserved. */
async function prepareIsolatedFixtures(compiledRoot: string, targetFile: string): Promise<void> {
  await fs.writeFile(targetFile, FIXTURE_SCHEMA("bench_incremental", "Bench Incremental"), "utf-8");
  for (let i = 0; i < FIXTURE_COUNT - 1; i++) {
    await fs.writeFile(
      path.join(compiledRoot, `bench_fixture_${i}.js`),
      FIXTURE_SCHEMA(`bench_fixture_${i}`, `Fixture ${i}`),
      "utf-8",
    );
  }
}

test("Incremental vs Full Content Reload", async () => {
  console.log("🚀 Starting Incremental Content Reload Benchmark...\n");

  const { compiled: compiledRoot } = await prepareBenchmarkCompiledWorkspace(WORKSPACE);
  const TARGET_FILE = path.join(compiledRoot, "bench_incremental_target.js");
  await prepareIsolatedFixtures(compiledRoot, TARGET_FILE);
  console.log(`   📂 Isolated fixture set: ${FIXTURE_COUNT} files in test/${WORKSPACE}/\n`);

  const { contentService, scanCompiledCollections } =
    await import("../../src/content/engine.server");

  // Warm the scanner so both paths measure reload logic, not cold I/O
  await scanCompiledCollections();

  const mockAdapter = {
    collection: {
      createModel: async () => {},
      createModelsBulk: async () => {},
    },
    content: {
      nodes: {
        getStructure: async () => ({ success: true, data: [] }),
        bulkUpdate: async () => ({ success: true }),
        deleteMany: async () => ({ success: true }),
      },
    },
  };

  try {
    const incrementalResult = await runBenchmark({
      name: "Incremental fullReload (1 file)",
      iterations: 100,
      warmupIterations: 10,
      runs: 2,
      silent: true,
      onIteration: async () => {
        await contentService.fullReload("global", false, mockAdapter as any, TARGET_FILE);
      },
    });

    const fullReconcileResult = await runBenchmark({
      name: "Full Reconciliation Reload",
      iterations: 100,
      warmupIterations: 10,
      runs: 2,
      silent: true,
      onIteration: async () => {
        await contentService.fullReload("global", false, mockAdapter as any, null);
      },
    });

    exportMetric("internals.incremental.avg", incrementalResult.avgMs, "ms");
    exportMetric(
      "internals.incremental.p95",
      incrementalResult.p95Ms || incrementalResult.avgMs,
      "ms",
    );
    exportMetric("internals.fullReload.avg", fullReconcileResult.avgMs, "ms");

    const speedup =
      incrementalResult.avgMs > 0
        ? (fullReconcileResult.avgMs / incrementalResult.avgMs).toFixed(1)
        : "N/A";

    printTruthTable({
      title: "SVELTYCMS — INCREMENTAL CONTENT RELOAD AUDIT",
      shortLabel: "Incremental",
      subtitle: "Surgical 1-file fullReload vs full reconciliation + cache wipe",
      results: [incrementalResult, fullReconcileResult],
    });

    printSummaryTable(
      [
        {
          key: "Incremental Reload (avg)",
          val: incrementalResult.avgMs,
          unit: "ms",
        },
        {
          key: "Full Reconciliation (avg)",
          val: fullReconcileResult.avgMs,
          unit: "ms",
        },
        { key: "Incremental Speedup Factor", val: speedup, unit: "x" },
      ],
      "Incremental",
    );

    const batchDir = path.join(compiledRoot, "batch_bench");
    await fs.mkdir(batchDir, { recursive: true });
    const batchFiles: string[] = [];
    for (let i = 0; i < 10; i++) {
      const fp = path.join(batchDir, `batch_${i}.js`);
      batchFiles.push(fp);
      await fs.writeFile(
        fp,
        `export const schema = { _id: "batch_${i}", name: "Batch ${i}", fields: [{ db_fieldName: "title", widget: { Name: "Input" }, label: "T", required: true, translated: false }] }; export default schema;`,
        "utf-8",
      );
    }

    const sequentialResult = await runBenchmark({
      name: "Sequential 10-file Reload",
      iterations: 20,
      warmupIterations: 3,
      runs: 1,
      silent: true,
      onIteration: async () => {
        for (const fp of batchFiles) {
          await contentService.handleIncrementalReload(fp, "global", mockAdapter as any, {
            broadcast: false,
          });
        }
      },
    });

    const batchedResult = await runBenchmark({
      name: "Batched 10-file Reload",
      iterations: 20,
      warmupIterations: 3,
      runs: 1,
      silent: true,
      onIteration: async () => {
        await contentService.processBatchedIncrementalReload(
          batchFiles,
          "global",
          mockAdapter as any,
        );
      },
    });

    const batchSpeedup =
      batchedResult.avgMs > 0 ? (sequentialResult.avgMs / batchedResult.avgMs).toFixed(1) : "N/A";

    console.log(
      `\n   Sequential 10-file: ${sequentialResult.avgMs.toFixed(3)} ms | Batched: ${batchedResult.avgMs.toFixed(3)} ms | Speedup: ${batchSpeedup}x`,
    );

    exportResult(incrementalResult);
  } finally {
    await cleanupBenchmarkCompiledWorkspace(WORKSPACE);
    console.log("\n✅ Incremental reload benchmark completed.");
  }
}, 120000);
