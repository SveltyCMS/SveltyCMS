/**
 * @file tests/benchmarks/widget-performance.test.ts
 * @description High-fidelity benchmark for SveltyCMS Core Widget overhead inside modifyRequest pipeline.
 *              Measures the cost of data transformation and validation for different widget types.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { logger } from "@utils/logger.server";

export async function runWidgetBenchmark() {
  console.log("🚀 Starting SveltyCMS Widget Performance Audit...\n");

  logger.level = "silent";

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  const { contentSystem } = await import("@src/content");
  const { LocalCMS } = await import("@src/routes/api/cms");

  await ensureFullInitialization();
  const dbAdapter = getDb();
  if (!dbAdapter) throw new Error("DB not initialized");

  const cms = new LocalCMS(dbAdapter);

  const widgetsToTest = ["Input", "RichText", "Relation", "Select", "DateTime"];

  // Ensure all benchmark collections exist
  const existingCollections = contentSystem.getCollections("global") || [];

  for (const widgetType of widgetsToTest) {
    const collectionId = `stress_${widgetType.toLowerCase()}`;
    const schema = {
      _id: collectionId,
      name: collectionId,
      fields: [{ name: "value", type: "text", widget: { Name: widgetType } }],
    };

    // Always ensure the adapter has the model in its in-memory registry
    if (dbAdapter.collection?.createModel) {
      await dbAdapter.collection.createModel(schema as any).catch(() => {});
    }

    if (!existingCollections.some((c: any) => c._id === collectionId)) {
      console.log(`📦 Creating missing content node for benchmark collection: ${widgetType}...`);

      if (dbAdapter.content?.nodes?.create) {
        await dbAdapter.content.nodes
          .create({
            _id: schema._id as any,
            name: schema.name,
            path: `/collection/${schema.name}`,
            nodeType: "collection",
            status: "published",
            collectionDef: schema as any,
            tenantId: "global" as any,
            order: 0,
          } as any)
          .catch(() => {});
      }
    }
  }

  // Refresh once for all collections
  await contentSystem.refresh("global");

  // Use local stabilize if available or just wait
  await new Promise((r) => setTimeout(r, 500));

  const results: any[] = [];
  const ITERATIONS = 1500;
  const WARMUP = Math.floor(ITERATIONS * 0.15);
  const RUNS = 3;

  for (const widgetType of widgetsToTest) {
    const collectionId = `stress_${widgetType.toLowerCase()}`;

    console.log(`📊 Benchmarking widget: ${widgetType} processing overhead`);

    const result = await runBenchmark({
      name: `Widget: ${widgetType} (modifyRequest)`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      concurrency: 1,
      runs: RUNS,
      trimOutliers: "iqr",
      measureMemory: true,
      onIteration: async () => {
        // Trigger a find cycle that includes widget handling (modifyRequest)
        await cms.collections.find(collectionId as any, {
          limit: 5,
          system: true,
        });
      },
      silent: true,
    });

    results.push(result);
    exportResult(result);
  }

  logger.level = "info";

  // ===================================================================
  // Professional Summary
  // ===================================================================
  console.log("\n" + "=".repeat(130));
  console.log("   🏁 SVELTYCMS WIDGET PERFORMANCE OVERHEAD MATRIX");
  console.log("   High-Fidelity • IQR Trimming • 95% Confidence • RSS Telemetry");
  console.log("=".repeat(130));

  console.log(
    `| ${"Widget Type".padEnd(42)} | ${"Avg Latency".padEnd(22)} | ${"p95".padEnd(14)} | ${"RPS".padEnd(12)} | ${"Status".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(42 + 22 + 14 + 12 + 12 + 6) + "|");

  for (const r of results) {
    const widgetName = r.name.replace("Widget: ", "").replace(" (modifyRequest)", "");
    const status = r.avgMs < 2 ? "✅ EXCELLENT" : r.avgMs < 5 ? "✅ GOOD" : "⚠️ FAIR";

    console.log(
      `| ${widgetName.padEnd(42)} | ` +
        `${r.avgMs.toFixed(4)} ms (±${r.marginOfError.toFixed(3)})`.padEnd(22) +
        ` | ` +
        `${r.p95Ms.toFixed(4)} ms`.padEnd(14) +
        ` | ` +
        `${Math.round(r.rps).toLocaleString()}`.padEnd(12) +
        ` | ` +
        `${status.padEnd(12)} |`,
    );
  }
  console.log("=".repeat(130) + "\n");

  console.log(`✨ Widget Insights:`);
  console.log(`   • Baseline overhead includes the modifyRequest lifecycle and Valibot validation`);
  console.log(
    `   • Relation and RichText widgets typically show higher overhead due to deep parsing`,
  );

  console.log("\n✅ Widget performance benchmark completed.");
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("Widget Performance Audit Suite", async () => {
    await runWidgetBenchmark();
  }, 600000);
}
