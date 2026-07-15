/**
 * @file tests/benchmarks/content-gui-save.test.ts
 * @description GUI structure save vs legacy fullReload benchmark.
 *
 * Measures Collection Builder organizational save (`syncContentState` gui-save)
 * against the legacy full reconciliation path used before the incremental fix.
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
import {
  cleanupBenchmarkCompiledWorkspace,
  prepareBenchmarkCompiledWorkspace,
} from "@utils/benchmark-paths";
import fs from "node:fs/promises";
import path from "node:path";

const WORKSPACE = "gui-save";
const FIXTURE_COUNT = 1000;

const FIXTURE_SCHEMA = (id: string, name: string) => `export const schema = {
  _id: "${id}",
  name: "${name}",
  fields: [{ db_fieldName: "title", widget: { Name: "Input" }, label: "Title", required: true, translated: false }],
};
export default schema;`;

async function prepareFixtures(compiledRoot: string): Promise<void> {
  const promises = Array.from({ length: FIXTURE_COUNT }, (_, i) =>
    fs.writeFile(
      path.join(compiledRoot, `gui_fixture_${i}.js`),
      FIXTURE_SCHEMA(`gui_fixture_${i}`, `Fixture ${i}`),
      "utf-8",
    ),
  );
  await Promise.all(promises);
}

test("GUI Save vs Legacy Full Reload", async () => {
  console.log("🚀 Starting GUI Save vs Full Reload Benchmark...\n");

  const { compiled: compiledRoot } = await prepareBenchmarkCompiledWorkspace(WORKSPACE);
  await prepareFixtures(compiledRoot);

  const { contentService, scanCompiledCollections } =
    await import("../../src/content/engine.server");
  const { syncContentState } = await import("../../src/content/sync-content-state.server");

  await scanCompiledCollections();

  const structureNodes = [
    {
      _id: "cat-bench",
      name: "Bench Category",
      path: "/bench-category",
      nodeType: "category",
      source: "builder",
      order: 0,
    },
    {
      _id: "gui_fixture_0",
      name: "Fixture 0",
      path: "/collection/gui_fixture_0",
      nodeType: "collection",
      parentId: "cat-bench",
      order: 1,
    },
  ];

  const mockAdapter = {
    collection: {
      createModel: async () => {},
      createModelsBulk: async () => {},
    },
    content: {
      nodes: {
        getStructure: async () => ({ success: true, data: structureNodes }),
        bulkUpdate: async () => ({ success: true }),
        deleteMany: async () => ({ success: true }),
      },
    },
  };

  const guiOperations = [
    {
      type: "create" as const,
      node: {
        _id: "cat-bench",
        name: "Bench Category",
        path: "/bench-category",
        nodeType: "category" as const,
        source: "builder" as const,
        order: 0,
      },
    },
    {
      type: "move" as const,
      node: {
        _id: "gui_fixture_0",
        name: "Fixture 0",
        path: "/collection/gui_fixture_0",
        nodeType: "collection" as const,
        parentId: "cat-bench",
        order: 1,
      },
    },
  ];

  const cwd = process.cwd();
  const manifestRoot = path.join(cwd, ".compiledCollections", "global");
  await fs.mkdir(manifestRoot, { recursive: true });

  try {
    const legacyResult = await runBenchmark({
      name: "Legacy fullReload (organizational save)",
      iterations: 50,
      warmupIterations: 5,
      runs: 2,
      silent: true,
      onIteration: async () => {
        await contentService.fullReload("global", false, mockAdapter as any, null);
      },
    });

    const guiSaveResult = await runBenchmark({
      name: "GUI syncContentState (gui-save)",
      iterations: 50,
      warmupIterations: 5,
      runs: 2,
      silent: true,
      onIteration: async () => {
        await syncContentState({
          reason: "gui-save",
          tenantId: "global",
          adapter: mockAdapter as any,
          operations: guiOperations,
        });
      },
    });

    const speedup =
      guiSaveResult.avgMs > 0 ? (legacyResult.avgMs / guiSaveResult.avgMs).toFixed(1) : "N/A";
    const reconcileReduction =
      legacyResult.avgMs > 0
        ? (((legacyResult.avgMs - guiSaveResult.avgMs) / legacyResult.avgMs) * 100).toFixed(1)
        : "N/A";

    exportMetric("internals.guiSave.avg", guiSaveResult.avgMs, "ms");
    exportMetric("internals.guiSave.p95", guiSaveResult.p95Ms || guiSaveResult.avgMs, "ms");
    exportMetric("internals.legacyFullReload.avg", legacyResult.avgMs, "ms");
    exportMetric("internals.guiSave.speedup", Number(speedup), "x");
    exportMetric("internals.guiSave.reconcileReductionPct", Number(reconcileReduction), "%");

    printTruthTable({
      title: "SVELTYCMS — GUI SAVE VS LEGACY FULL RELOAD",
      shortLabel: "GUI Save",
      subtitle: "syncContentState(gui-save) vs legacy fullReload organizational save",
      results: [guiSaveResult, legacyResult],
    });

    printSummaryTable(
      [
        { key: "GUI Save (avg)", val: guiSaveResult.avgMs, unit: "ms" },
        { key: "Legacy Full Reload (avg)", val: legacyResult.avgMs, unit: "ms" },
        { key: "GUI Save Speedup", val: speedup, unit: "x" },
        { key: "Reconcile Work Reduction", val: reconcileReduction, unit: "%" },
      ],
      "GUI Save",
    );

    exportResult(guiSaveResult);
  } finally {
    await cleanupBenchmarkCompiledWorkspace(WORKSPACE);
    console.log("\n✅ GUI save benchmark completed.");
  }
}, 120000);
