/**
 * @file tests/benchmarks/content-incremental-reload.test.ts
 * @description Incremental Content Reload Benchmark
 * @summary Measures surgical single-file fullReload vs full reconciliation path
 *
 * ### Features:
 * - Incremental `fullReload(changedFile)` — dev watcher / hot-reload path
 * - Full `fullReload()` — complete reconciliation with SCHEMA cache wipe
 * - Validates June 2026 optimization: skip category invalidation on single-file updates
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
import fs from "node:fs/promises";
import path from "node:path";

const COLLECTIONS_DIR = path.resolve(process.cwd(), ".compiledCollections");
const STASH_DIR = path.resolve(process.cwd(), ".bench_stash_incremental");
const TARGET_FILE = path.join(COLLECTIONS_DIR, "bench_incremental_target.js");
/** Matches content-scan benchmark — fixed cardinality for cross-DB parity */
const FIXTURE_COUNT = 150;

const FIXTURE_SCHEMA = (id: string, name: string) => `export const schema = {
  _id: "${id}",
  name: "${name}",
  fields: [{ db_fieldName: "title", widget: { Name: "Input" }, label: "Title", required: true, translated: false }],
};
export default schema;`;

async function stashCollectionsDir(): Promise<void> {
  await fs.rm(STASH_DIR, { recursive: true, force: true }).catch(() => {});
  try {
    await fs.access(COLLECTIONS_DIR);
    await fs.rename(COLLECTIONS_DIR, STASH_DIR);
  } catch {
    /* no prior compiled collections */
  }
  await fs.mkdir(COLLECTIONS_DIR, { recursive: true });
}

async function restoreCollectionsDir(): Promise<void> {
  await fs.rm(COLLECTIONS_DIR, { recursive: true, force: true }).catch(() => {});
  try {
    await fs.access(STASH_DIR);
    await fs.rename(STASH_DIR, COLLECTIONS_DIR);
  } catch {
    /* nothing to restore */
  }
}

/** Isolated 150-file tree so full vs incremental is measured on identical cardinality (all DBs). */
async function prepareIsolatedFixtures(): Promise<void> {
  await stashCollectionsDir();
  await fs.writeFile(
    TARGET_FILE,
    FIXTURE_SCHEMA("bench_incremental", "Bench Incremental"),
    "utf-8",
  );
  for (let i = 0; i < FIXTURE_COUNT - 1; i++) {
    await fs.writeFile(
      path.join(COLLECTIONS_DIR, `bench_fixture_${i}.js`),
      FIXTURE_SCHEMA(`bench_fixture_${i}`, `Fixture ${i}`),
      "utf-8",
    );
  }
}

test("Incremental vs Full Content Reload", async () => {
  console.log("🚀 Starting Incremental Content Reload Benchmark...\n");

  await prepareIsolatedFixtures();
  console.log(`   📂 Isolated fixture set: ${FIXTURE_COUNT} collection files (cross-DB parity)\n`);

  const { contentService, scanCompiledCollections } =
    await import("../../src/content/content-service.server");

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

    printSummaryTable([
      { key: "Incremental Reload (avg)", val: incrementalResult.avgMs, unit: "ms" },
      { key: "Full Reconciliation (avg)", val: fullReconcileResult.avgMs, unit: "ms" },
      { key: "Incremental Speedup Factor", val: speedup, unit: "x" },
    ]);

    // 3. Batched vs sequential multi-file reload (10 files)
    const batchDir = path.join(COLLECTIONS_DIR, "batch_bench");
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

    printSummaryTable([
      { key: "Sequential 10-file (avg)", val: sequentialResult.avgMs, unit: "ms" },
      { key: "Batched 10-file (avg)", val: batchedResult.avgMs, unit: "ms" },
      { key: "Batch Speedup Factor", val: batchSpeedup, unit: "x" },
    ]);

    await fs.rm(batchDir, { recursive: true, force: true }).catch(() => {});

    exportResult(incrementalResult);
  } finally {
    await restoreCollectionsDir();
    console.log("\n✅ Incremental reload benchmark completed.");
  }
}, 120000);
