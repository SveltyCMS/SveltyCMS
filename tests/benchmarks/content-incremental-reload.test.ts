/**
 * @file tests/benchmarks/content-incremental-reload.test.ts
 * @description Incremental Content Reload Benchmark (Optimized)
 * @summary Measures surgical single-file fullReload vs full reconciliation path and batch processing.
 */

import {
  test,
  runBenchmark,
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

const WORKSPACE = "incremental";
const FIXTURE_COUNT = 1000;

function createFixtureSchema(id: string, name: string): string {
  return `export const schema = {
  _id: "${id}",
  name: "${name}",
  fields: [{ db_fieldName: "title", widget: { Name: "Input" }, label: "Title", required: true, translated: false }],
};
export default schema;`;
}

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

/** Fast chunked fixture generator to avoid OS file-descriptor limits */
async function prepareIsolatedFixtures(compiledRoot: string, targetFile: string): Promise<void> {
  await fs.writeFile(
    targetFile,
    createFixtureSchema("bench_incremental", "Bench Incremental"),
    "utf-8",
  );

  const CHUNK_SIZE = 100;
  for (let i = 0; i < FIXTURE_COUNT - 1; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, FIXTURE_COUNT - 1);
    const chunk = Array.from({ length: end - i }, (_, idx) => {
      const fileIdx = i + idx;
      return fs.writeFile(
        path.join(compiledRoot, `bench_fixture_${fileIdx}.js`),
        createFixtureSchema(`bench_fixture_${fileIdx}`, `Fixture ${fileIdx}`),
        "utf-8",
      );
    });
    await Promise.all(chunk);
  }
}

test("Incremental vs Full Content Reload", async () => {
  console.log("🚀 Starting Incremental Content Reload Benchmark...\n");

  const { compiled: compiledRoot } = await prepareBenchmarkCompiledWorkspace(WORKSPACE);
  const TARGET_FILE = path.join(compiledRoot, "bench_incremental_target.js");

  try {
    await prepareIsolatedFixtures(compiledRoot, TARGET_FILE);
    console.log(`   📂 Isolated fixture set: ${FIXTURE_COUNT} files in test/${WORKSPACE}/\n`);

    const { contentService, scanCompiledCollections } =
      await import("../../src/content/engine.server");

    // Warm filesystem scanner
    if (typeof scanCompiledCollections === "function") {
      await scanCompiledCollections();
    }

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

    // ── 1. INCREMENTAL SINGLE-FILE RELOAD ───────────────────────────────────
    forceGarbageCollection();
    await stabilize(100);

    console.log("   → Measuring Surgical Single-File fullReload...");
    const incrementalResult = await runBenchmark({
      name: "Incremental fullReload (1 file)",
      iterations: 100,
      warmupIterations: 10,
      runs: 2,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        await contentService.fullReload("global", false, mockAdapter as any, TARGET_FILE);
      },
    });

    // ── 2. FULL RECONCILIATION RELOAD ───────────────────────────────────────
    forceGarbageCollection();
    await stabilize(100);

    console.log("   → Measuring Full Reconciliation (1k Collections)...");
    const fullReconcileResult = await runBenchmark({
      name: "Full Reconciliation Reload",
      iterations: 50,
      warmupIterations: 5,
      runs: 2,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        await contentService.fullReload("global", false, mockAdapter as any, null);
      },
    });

    // ── 3. SEQUENTIAL VS. BATCHED MULTI-FILE RELOAD ─────────────────────────
    const batchDir = path.join(compiledRoot, "batch_bench");
    await fs.mkdir(batchDir, { recursive: true });
    const batchFiles: string[] = [];

    for (let i = 0; i < 10; i++) {
      const fp = path.join(batchDir, `batch_${i}.js`);
      batchFiles.push(fp);
      await fs.writeFile(fp, createFixtureSchema(`batch_${i}`, `Batch ${i}`), "utf-8");
    }

    // Hoist execution methods & static option bags outside benchmark closures
    const reloadOptions = Object.freeze({ broadcast: false });
    const hasIncrementalHandler =
      typeof (contentService as any).handleIncrementalReload === "function";
    const hasBatchedHandler =
      typeof (contentService as any).processBatchedIncrementalReload === "function";

    const runSequentialReload = hasIncrementalHandler
      ? async () => {
          for (let i = 0; i < batchFiles.length; i++) {
            await (contentService as any).handleIncrementalReload(
              batchFiles[i],
              "global",
              mockAdapter as any,
              reloadOptions,
            );
          }
        }
      : async () => {
          for (let i = 0; i < batchFiles.length; i++) {
            await contentService.fullReload("global", false, mockAdapter as any, batchFiles[i]);
          }
        };

    const runBatchedReload = hasBatchedHandler
      ? async () => {
          await (contentService as any).processBatchedIncrementalReload(
            batchFiles,
            "global",
            mockAdapter as any,
          );
        }
      : async () => {
          await Promise.all(
            batchFiles.map((f) =>
              contentService.fullReload("global", false, mockAdapter as any, f),
            ),
          );
        };

    forceGarbageCollection();
    await stabilize(100);

    console.log("   → Measuring Sequential 10-File Reload...");
    const sequentialResult = await runBenchmark({
      name: "Sequential 10-File Reload",
      iterations: 20,
      warmupIterations: 3,
      runs: 2,
      trimOutliers: "iqr",
      silent: true,
      onIteration: runSequentialReload,
    });

    forceGarbageCollection();
    await stabilize(100);

    console.log("   → Measuring Batched 10-File Reload...");
    const batchedResult = await runBenchmark({
      name: "Batched 10-File Reload",
      iterations: 20,
      warmupIterations: 3,
      runs: 2,
      trimOutliers: "iqr",
      silent: true,
      onIteration: runBatchedReload,
    });

    // ── REPORTING & EXPORT ──────────────────────────────────────────────────
    const speedup =
      incrementalResult.avgMs > 0
        ? (fullReconcileResult.avgMs / incrementalResult.avgMs).toFixed(1)
        : "N/A";

    const batchSpeedup =
      batchedResult.avgMs > 0 ? (sequentialResult.avgMs / batchedResult.avgMs).toFixed(1) : "N/A";

    const allResults = [
      { ...incrementalResult, layer: "Surgical", shortLabel: "Incremental (1f)" },
      { ...fullReconcileResult, layer: "Full", shortLabel: "Full (1k files)" },
      { ...sequentialResult, layer: "Sequential", shortLabel: "Seq (10f)" },
      { ...batchedResult, layer: "Batched", shortLabel: "Batch (10f)" },
    ];

    printTruthTable({
      title: "SVELTYCMS — INCREMENTAL CONTENT RELOAD AUDIT",
      shortLabel: "Incremental",
      subtitle: "Surgical 1-file vs 1k full reconciliation vs batch processing",
      results: allResults,
    });

    printSummaryTable(
      [
        {
          key: "Incremental Reload (1 file)",
          val: incrementalResult.avgMs.toFixed(3),
          unit: "ms",
        },
        {
          key: "Full Reconciliation (1k files)",
          val: fullReconcileResult.avgMs.toFixed(2),
          unit: "ms",
        },
        { key: "Incremental Speedup Factor", val: `${speedup}×`, unit: "" },
        {
          key: "Sequential 10-File Reload",
          val: sequentialResult.avgMs.toFixed(3),
          unit: "ms",
        },
        { key: "Batched 10-File Reload", val: batchedResult.avgMs.toFixed(3), unit: "ms" },
        { key: "Batching Efficiency Gain", val: `${batchSpeedup}×`, unit: "" },
      ],
      "Incremental Reload Summary",
    );

    exportMetric("internals.incremental.avg", incrementalResult.avgMs, "ms");
    exportMetric(
      "internals.incremental.p95",
      incrementalResult.p95Ms || incrementalResult.avgMs,
      "ms",
    );
    exportMetric("internals.fullReload.avg", fullReconcileResult.avgMs, "ms");
    exportMetric("internals.batchSpeedup", parseFloat(batchSpeedup) || 1, "x");

    for (const r of allResults) exportResult(r);
  } finally {
    await cleanupBenchmarkCompiledWorkspace(WORKSPACE);
    console.log("\n✅ Incremental reload benchmark completed.");
  }
}, 120_000);
