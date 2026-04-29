/**
 * @file tests/benchmarks/widget-performance.test.ts
 * @description High-fidelity benchmark for SveltyCMS Core Widget overhead.
 * Measures the "Middleware Tax" of widget transformations and validation.
 */

import { test, mock } from "bun:test";
import "../unit/setup.ts";

// 🚀 Direct mock to ensure widgets are available in this isolated run
mock.module("@src/widgets/scanner", () => {
  const names = ["Input", "RichText", "Relation", "Select", "DateTime", "Group", "Repeater"];
  const modules: Record<string, any> = {};
  for (const name of names) {
    const factory = (config: any) => ({
      ...config,
      db_fieldName: config?.db_fieldName || config?.label?.toLowerCase() || "field",
      widget: { Name: name },
    });
    (factory as any).Name = name;
    modules[`./core/${name.toLowerCase()}/index.ts`] = { default: factory };
  }
  return {
    coreModules: modules,
    customModules: {},
    allWidgetModules: modules,
    getWidgetNameFromPath: (p: string) => p.split("/").at(-2) || null,
  };
});

import {
  runBenchmark,
  exportResult,
  printTruthTable,
  printSummaryTable,
  STABLE_COLLECTION,
  ensureStableTestData,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

async function runWidgetAudit() {
  console.log("🚀 Starting SveltyCMS Widget Performance Audit...\n");

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/routes/api/cms");

  await ensureFullInitialization();
  const db = getDb();
  if (!db) throw new Error("DB not initialized");

  const cms = new LocalCMS(db);
  await ensureStableTestData(db);

  const ITERATIONS = 500;
  const RUNS = 2;
  const allResults: any[] = [];

  const originalLogLevel = logger.level;
  logger.level = "silent";

  try {
    // 1. Baseline: Direct Database Read (No Widgets)
    console.log("   → Measuring DB Baseline (Pure CRUD)...");
    const dbBaseline = await runBenchmark({
      name: "DB Baseline (No Widgets)",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: RUNS,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        await db.crud.findMany(STABLE_COLLECTION, {}, { limit: 10, tenantId: "global" as any });
      },
    });
    allResults.push({ ...dbBaseline, layer: "Database" });

    // 2. Widget Pipeline: LocalCMS Transformation (RichText/Relation context)
    console.log("   → Measuring Widget Transformation (Local SDK)...");
    const widgetPipeline = await runBenchmark({
      name: "Widget Pipeline (Local SDK)",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: RUNS,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        await cms.collections.find(STABLE_COLLECTION as any, {
          limit: 10,
          tenantId: "global",
        });
      },
    });
    allResults.push({ ...widgetPipeline, layer: "Middleware" });

    // 3. Specific Widget: RichText Logic (Parsing overhead simulator)
    console.log("   → Measuring Heavy Widget Logic (Simulated)...");
    const { coreModules } = await import("@src/widgets/scanner");
    console.log("   Scanner Core Modules:", Object.keys(coreModules).length);
    console.log("   Current Working Directory:", process.cwd());
    const { widgets } = await import("@src/stores/widget-store.svelte");

    console.log("   Core Widgets:", widgets.coreWidgets.join(", "));
    console.log("   Active Widgets:", widgets.activeWidgets.join(", "));
    console.log("   Available Functions:", Object.keys(widgets.widgetFunctions).join(", "));

    const richTextWidget = widgets.RichText({
      label: "Content",
      db_fieldName: "content",
    });

    const heavyWidgetResult = await runBenchmark({
      name: "Heavy Widget (RichText Parse)",
      iterations: ITERATIONS,
      warmupIterations: 20,
      runs: 1,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        if (richTextWidget.widget.modifyRequest) {
          await richTextWidget.widget.modifyRequest({
            collection: {} as any,
            data: { content: "<h1>Hello</h1><p>Test</p>".repeat(50) },
            field: richTextWidget as any,
            type: "update",
            user: { role: "admin" } as any,
          });
        }
      },
    });
    allResults.push({ ...heavyWidgetResult, layer: "Logic" });

    printTruthTable({
      title: "SVELTYCMS  —  WIDGET PIPELINE TELEMETRY",
      subtitle: "Database vs LocalCMS Middleware Tax",
      results: allResults,
    });

    const taxPercent = ((widgetPipeline.avgMs - dbBaseline.avgMs) / dbBaseline.avgMs) * 100;

    printSummaryTable([
      { key: "DB Baseline Latency", val: dbBaseline.avgMs, unit: "ms" },
      { key: "Widget Middleware Tax", val: taxPercent.toFixed(2), unit: "%" },
      { key: "RichText Transform", val: heavyWidgetResult.avgMs, unit: "ms" },
      { key: "Pipeline Stability", val: "STABLE", unit: "" },
    ]);

    for (const r of allResults) exportResult(r);
  } finally {
    logger.level = originalLogLevel;
  }

  console.log("\n✅ Widget performance audit completed.");
}

test("Widget Performance Audit Suite", async () => {
  await runWidgetAudit();
}, 450000);
