/**
 * @file tests/benchmarks/content-boot-compile-drift.test.ts
 * @description Boot-time compilation drift detection and refresh benchmark.
 */

import {
  test,
  runBenchmark,
  exportMetric,
  exportResult,
  printTruthTable,
  printSummaryTable,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("Boot Compile Drift Detection & Refresh", async () => {
  console.log("🚀 Starting Boot Compile Drift Benchmark...\n");

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "svelty-boot-drift-"));
  const userCollections = path.join(root, "config", "collections");
  const compiledCollections = path.join(root, ".compiledCollections");
  await fs.mkdir(userCollections, { recursive: true });
  await fs.mkdir(compiledCollections, { recursive: true });

  const sourceFile = path.join(userCollections, "offline-edit.ts");
  const compiledFile = path.join(compiledCollections, "offline-edit.js");

  await fs.writeFile(
    sourceFile,
    `export const schema = { _id: "offline_edit", name: "Offline Edit", fields: [{ db_fieldName: "title", widget: { Name: "Input" }, label: "Title", required: true, translated: false }] };
export default schema;`,
    "utf-8",
  );
  await fs.writeFile(
    compiledFile,
    `export const schema = { _id: "offline_edit", name: "Stale", fields: [] }; export default schema;`,
    "utf-8",
  );

  const staleTime = Date.now() - 60_000;
  await fs.utimes(compiledFile, staleTime / 1000, staleTime / 1000);

  const cwd = process.cwd();
  process.chdir(root);

  const mockAdapter = {
    collection: { createModel: async () => {}, createModelsBulk: async () => {} },
    content: {
      nodes: {
        getStructure: async () => ({ success: true, data: [] }),
        bulkUpdate: async () => ({ success: true }),
        deleteMany: async () => ({ success: true }),
      },
    },
  };

  try {
    const { detectCompilationDrift, ensureCompiledCollectionsFresh, syncContentState } =
      await import("../../src/content/sync-content-state.server");

    const driftDetectResult = await runBenchmark({
      name: "detectCompilationDrift",
      iterations: 100,
      warmupIterations: 10,
      runs: 2,
      silent: true,
      onIteration: async () => {
        await detectCompilationDrift(null);
      },
    });

    const driftCompileResult = await runBenchmark({
      name: "ensureCompiledCollectionsFresh (drifted)",
      iterations: 20,
      warmupIterations: 3,
      runs: 1,
      silent: true,
      onIteration: async () => {
        await fs.utimes(compiledFile, staleTime / 1000, staleTime / 1000);
        await fs.utimes(sourceFile, Date.now() / 1000, Date.now() / 1000);
        await ensureCompiledCollectionsFresh(null);
      },
    });

    const bootSyncResult = await runBenchmark({
      name: "syncContentState (boot)",
      iterations: 10,
      warmupIterations: 2,
      runs: 1,
      silent: true,
      onIteration: async () => {
        await syncContentState({
          reason: "boot",
          tenantId: null,
          adapter: mockAdapter as any,
          skipReconciliation: false,
        });
      },
    });

    const drift = await detectCompilationDrift(null);
    if (!drift.drifted) {
      console.warn("⚠️ Drift not detected — benchmark environment may be skewed");
    }

    exportMetric("internals.driftDetect.avg", driftDetectResult.avgMs, "ms");
    exportMetric("internals.driftCompile.avg", driftCompileResult.avgMs, "ms");
    exportMetric("internals.bootSync.avg", bootSyncResult.avgMs, "ms");

    printTruthTable({
      title: "SVELTYCMS — BOOT COMPILE DRIFT AUDIT",
      shortLabel: "Boot Drift",
      subtitle: "Offline .ts edits detected and compiled on boot sync",
      results: [driftDetectResult, driftCompileResult, bootSyncResult],
    });

    printSummaryTable(
      [
        { key: "Drift Detection (avg)", val: driftDetectResult.avgMs, unit: "ms" },
        { key: "Drift Compile (avg)", val: driftCompileResult.avgMs, unit: "ms" },
        { key: "Boot syncContentState (avg)", val: bootSyncResult.avgMs, unit: "ms" },
        { key: "Drifted files detected", val: drift.driftedFiles.length, unit: "files" },
      ],
      "Boot Drift",
    );

    exportResult(driftDetectResult);
  } finally {
    process.chdir(cwd);
    await fs.rm(root, { recursive: true, force: true });
    console.log("\n✅ Boot compile drift benchmark completed.");
  }
}, 120000);
