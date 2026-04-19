/**
 * @file tests/benchmarks/widget-performance.test.ts
 * @description High-fidelity benchmark for SveltyCMS Core Widget overhead.
 *              Measures data transformation, validation, and rendering cost for different widget types.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult, exportMetric, stabilize } from "./benchmark-utils";
import { logger } from "@utils/logger.server";

const COLLECTION_ID = "widget_benchmark_stress";
const TEST_TENANT = null; // Standardize on null for system benchmarks

export async function runWidgetBenchmark() {
  console.log("🚀 Starting SveltyCMS Widget Performance Audit...\n");

  logger.level = "silent";

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  const { contentSystem } = await import("@src/content");
  const { LocalCMS } = await import("@src/routes/api/cms");
  const fsP = await import("node:fs/promises");
  const pathMod = await import("node:path");

  await ensureFullInitialization();
  const dbAdapter = getDb();
  if (!dbAdapter) throw new Error("DB adapter not initialized");

  const cms = new LocalCMS(dbAdapter);

  // === Setup: One rich collection with multiple widgets ===
  console.log("📦 Preparing rich widget benchmark collection...");

  const richSchema = {
    _id: COLLECTION_ID,
    name: COLLECTION_ID,
    fields: [
      { name: "title", type: "text", widget: { Name: "Input" } },
      { name: "content", type: "text", widget: { Name: "RichText" } },
      { name: "category", type: "text", widget: { Name: "Select" } },
      { name: "publishedAt", type: "date", widget: { Name: "DateTime" } },
      { name: "relatedPost", type: "relation", widget: { Name: "Relation" } },
    ],
  };

  // 🚀 Scaffold schema file so the content system discovers it
  const compiledDir = pathMod.join(process.cwd(), ".compiledCollections");
  await fsP.mkdir(compiledDir, { recursive: true });
  await fsP.writeFile(
    pathMod.join(compiledDir, `${COLLECTION_ID}.js`),
    `export default ${JSON.stringify(richSchema, null, 2)};`,
  );

  // Ensure model and node
  if (dbAdapter.collection?.createModel) {
    await dbAdapter.collection.createModel(richSchema as any).catch(() => {});
  }

  // 🚀 CRITICAL: Force content system to pick up the new model
  await contentSystem.initialize(null, { skipReconciliation: false });

  // Seed some realistic data (once)
  const existing = await cms.collections.find(COLLECTION_ID as any, {
    limit: 1,
    system: true,
    tenantId: TEST_TENANT as any,
  });
  if (!existing.success || (existing.data as any[]).length === 0) {
    for (let i = 0; i < 20; i++) {
      await cms.collections.create(
        COLLECTION_ID as any,
        {
          title: `Widget Test Entry ${i}`,
          content: "<p>Rich text with <strong>formatting</strong> and <em>styles</em>.</p>".repeat(
            5,
          ),
          category: i % 3 === 0 ? "news" : "blog",
          publishedAt: new Date().toISOString(),
          relatedPost: i % 5 === 0 ? "some-other-id" : null,
        },
        { system: true, tenantId: TEST_TENANT as any },
      );
    }
  }

  await contentSystem.refresh(TEST_TENANT);
  await stabilize();

  const ITERATIONS = 1200;
  const WARMUP = Math.floor(ITERATIONS * 0.12);
  const RUNS = 3;

  const results: any[] = [];

  const scenarios = [
    { name: "Input", query: { limit: 10 } },
    { name: "RichText", query: { limit: 10, fields: ["content"] } },
    { name: "Select + DateTime", query: { limit: 10, fields: ["category", "publishedAt"] } },
    { name: "Relation (Population)", query: { limit: 10, populate: ["relatedPost"] } },
    { name: "Full Record Transformation", query: { limit: 10 } }, // all widgets
  ];

  for (const scenario of scenarios) {
    console.log(`📊 Benchmarking: ${scenario.name}`);

    const result = await runBenchmark({
      name: `Widget: ${scenario.name}`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      concurrency: 1,
      runs: RUNS,
      trimOutliers: "iqr",
      measureMemory: true,
      onSetup: stabilize,
      onIteration: async () => {
        await cms.collections.find(COLLECTION_ID as any, {
          ...scenario.query,
          tenantId: TEST_TENANT as any,
          system: true,
        });
      },
      silent: true,
    });

    results.push(result);
    exportResult(result);
  }

  logger.level = "info";

  // === Professional Summary ===
  console.log("\n" + "=".repeat(140));
  console.log("   🏁 SVELTYCMS WIDGET PERFORMANCE OVERHEAD AUDIT");
  console.log("   Data Transformation • Validation • Population • modifyRequest Pipeline");
  console.log("=".repeat(140));

  console.log(
    `| ${"Scenario".padEnd(38)} | ${"Avg Latency".padEnd(24)} | ${"p95".padEnd(14)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(38 + 24 + 14 + 12 + 12 + 6) + "|");

  for (const r of results) {
    const rss =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)} MB` : "—";

    console.log(
      `| ${r.name.replace("Widget: ", "").padEnd(38)} | ` +
        `${r.avgMs.toFixed(4)} ms (±${r.marginOfError.toFixed(3)})`.padEnd(24) +
        ` | ${r.p95Ms.toFixed(3)}`.padEnd(14) +
        ` | ${Math.round(r.rps).toLocaleString().padEnd(12)}` +
        ` | ${rss.padEnd(12)} |`,
    );
  }
  console.log("=".repeat(140));

  const fullTransform =
    results.find((r) => r.name.includes("Full Record")) || results[results.length - 1];

  console.log(`\n✨ Key Insights:`);
  console.log(`   • Full record transformation overhead: ${fullTransform.avgMs.toFixed(3)} ms`);
  console.log(`   • RichText and Relation widgets usually dominate due to parsing & population`);
  console.log(`   • Total widget cost is part of every modifyRequest / API response`);

  // Structured Matrix Exports (Infrastructure v2)
  exportMetric("logic.widget.avg", fullTransform.avgMs, "ms", {
    p95: fullTransform.p95Ms,
    rps: fullTransform.rps,
  });
  exportMetric("logic.widget.rps", fullTransform.rps, "req/s");

  console.log("\n✅ Widget performance benchmark completed.");
}

test("Widget Performance Audit Suite", async () => {
  await runWidgetBenchmark();
}, 450000);
