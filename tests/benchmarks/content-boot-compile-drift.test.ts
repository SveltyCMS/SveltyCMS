/**
 * @file tests/benchmarks/content-boot-compile-drift.test.ts
 * @description Boot-Time Compilation Drift Detection & Refresh Benchmark (Optimized)
 * @summary Evaluates drift detection (clean vs. drifted), compilation refresh, and boot sync state reconciliation.
 */

import {
  test,
  runBenchmark,
  exportMetric,
  exportResult,
  printTruthTable,
  printSummaryTable,
  stabilize,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SCHEMA_COUNT = 10;

function generateSchemaTs(id: string, name: string) {
  return `export const schema = {
  _id: "${id}",
  name: "${name}",
  fields: [
    { db_fieldName: "title", widget: { Name: "Input" }, label: "Title", required: true, translated: false },
    { db_fieldName: "status", widget: { Name: "Select" }, label: "Status", required: false, translated: false }
  ]
};
export default schema;`;
}

function generateStaleJs(id: string) {
  return `export const schema = { _id: "${id}", name: "Stale", fields: [] }; export default schema;`;
}

test("Boot Compile Drift Detection & Refresh", async () => {
  console.log("🚀 Starting Boot Compile Drift Benchmark...\n");

  const originalCwd = process.cwd();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "svelty-boot-drift-"));
  const userCollections = path.join(root, "config", "collections");
  const compiledCollections = path.join(root, ".compiledCollections");

  await fs.mkdir(userCollections, { recursive: true });
  await fs.mkdir(compiledCollections, { recursive: true });

  const sourceFiles: string[] = [];
  const compiledFiles: string[] = [];

  // Seed multi-file collection set
  for (let i = 0; i < SCHEMA_COUNT; i++) {
    const id = `col_drift_${i}`;
    const src = path.join(userCollections, `${id}.ts`);
    const dst = path.join(compiledCollections, `${id}.js`);

    await fs.writeFile(src, generateSchemaTs(id, `Collection ${i}`), "utf-8");
    await fs.writeFile(dst, generateStaleJs(id), "utf-8");

    sourceFiles.push(src);
    compiledFiles.push(dst);
  }

  const pastSec = (Date.now() - 120_000) / 1000;
  const nowSec = Date.now() / 1000;

  async function markAllStale() {
    for (let i = 0; i < SCHEMA_COUNT; i++) {
      await fs.utimes(compiledFiles[i], pastSec, pastSec);
      await fs.utimes(sourceFiles[i], nowSec, nowSec);
    }
  }

  async function markAllFresh() {
    const futureSec = (Date.now() + 60_000) / 1000;
    for (let i = 0; i < SCHEMA_COUNT; i++) {
      await fs.utimes(compiledFiles[i], futureSec, futureSec);
    }
  }

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
    process.chdir(root);

    const { detectCompilationDrift, ensureCompiledCollectionsFresh, syncContentState } =
      await import("../../src/content/sync-content-state.server");

    // ── 1. CLEAN / NO-DRIFT FAST-PATH BASELINE ──────────────────────────────
    await markAllFresh();
    await stabilize(100);

    console.log("   → Measuring Fast-Path Drift Detection (Clean State, 0 drift)...");
    const cleanDetectResult = await runBenchmark({
      name: "detectCompilationDrift (Clean / Fresh)",
      iterations: 100,
      warmupIterations: 10,
      runs: 2,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        await detectCompilationDrift(null);
      },
    });

    // ── 2. DRIFTED DETECTION ────────────────────────────────────────────────
    await markAllStale();
    await stabilize(100);

    const initialDrift = await detectCompilationDrift(null);
    if (!initialDrift.drifted) {
      console.warn("⚠️ Drift was not detected during initial pre-flight check.");
    }

    console.log(`   → Measuring Drifted Detection (${SCHEMA_COUNT} stale schemas)...`);
    const driftDetectResult = await runBenchmark({
      name: `detectCompilationDrift (${SCHEMA_COUNT} Drifted Files)`,
      iterations: 100,
      warmupIterations: 10,
      runs: 2,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        await detectCompilationDrift(null);
      },
    });

    // ── 3. RECOMPILATION PIPELINE (ISOLATED IO) ─────────────────────────────
    console.log(`   → Measuring JIT Recompilation (${SCHEMA_COUNT} schemas)...`);
    const compileTimes: number[] = [];
    const COMPILE_ROUNDS = 15;

    for (let r = 0; r < COMPILE_ROUNDS; r++) {
      // Stage stale mtimes outside the timing block
      await markAllStale();

      const t0 = performance.now();
      await ensureCompiledCollectionsFresh(null);
      compileTimes.push(performance.now() - t0);
    }

    const avgCompileMs = compileTimes.reduce((a, b) => a + b, 0) / compileTimes.length;
    const sortedCompile = [...compileTimes].sort((a, b) => a - b);
    const p95CompileMs =
      sortedCompile[Math.floor(sortedCompile.length * 0.95)] ??
      sortedCompile[sortedCompile.length - 1];

    const driftCompileResult = {
      name: `ensureCompiledCollectionsFresh (${SCHEMA_COUNT} files)`,
      shortLabel: "compileFresh",
      avgMs: avgCompileMs,
      p95Ms: p95CompileMs,
      rps: COMPILE_ROUNDS / (compileTimes.reduce((a, b) => a + b, 0) / 1000),
      layer: "Compiler",
    };

    // ── 4. BOOT CONTENT STATE RECONCILIATION ─────────────────────────────────
    console.log("   → Measuring Boot syncContentState execution...");
    const bootSyncResult = await runBenchmark({
      name: "syncContentState (Boot Sync)",
      iterations: 15,
      warmupIterations: 3,
      runs: 1,
      concurrency: 1,
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

    // ── REPORTING & EXPORT ──────────────────────────────────────────────────
    const allResults = [
      { ...cleanDetectResult, layer: "FastPath", shortLabel: "Clean Check" },
      { ...driftDetectResult, layer: "Drift", shortLabel: "Drift Check" },
      driftCompileResult,
      { ...bootSyncResult, layer: "BootSync", shortLabel: "Sync State" },
    ];

    printTruthTable({
      title: "SVELTYCMS — BOOT COMPILE DRIFT AUDIT",
      shortLabel: "Boot Drift",
      subtitle: `${SCHEMA_COUNT} Collections • Offline Schema Refresh`,
      results: allResults,
    });

    printSummaryTable(
      [
        {
          key: "Clean Check Latency (Fast Path)",
          val: cleanDetectResult.avgMs.toFixed(3),
          unit: "ms",
        },
        { key: "Drift Detection Latency", val: driftDetectResult.avgMs.toFixed(3), unit: "ms" },
        { key: "Compile & Refresh (10 files)", val: avgCompileMs.toFixed(2), unit: "ms" },
        { key: "Boot syncContentState Latency", val: bootSyncResult.avgMs.toFixed(2), unit: "ms" },
        { key: "Drifted Files Target", val: SCHEMA_COUNT, unit: "files" },
      ],
      "Boot Drift Summary",
    );

    exportMetric("internals.driftDetect.clean.avg", cleanDetectResult.avgMs, "ms");
    exportMetric("internals.driftDetect.drifted.avg", driftDetectResult.avgMs, "ms");
    exportMetric("internals.driftCompile.avg", avgCompileMs, "ms");
    exportMetric("internals.bootSync.avg", bootSyncResult.avgMs, "ms");

    for (const r of allResults) exportResult(r);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
    console.log("\n✅ Boot compile drift benchmark completed.");
  }
}, 120_000);
