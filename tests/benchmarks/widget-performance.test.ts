/**
 * @file tests/benchmarks/widget-performance.test.ts
 * @description Professional benchmark for SveltyCMS Core Widget overhead inside modifyRequest pipeline.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";

export async function runWidgetBenchmark() {
  console.log("🚀 Starting SveltyCMS Widget Performance Audit...\n");

  const { getDb, getDbInitPromise } = await import("@src/databases/db");
  const { contentSystem } = await import("@src/content");
  const { LocalCMS } = await import("@src/routes/api/cms");

  await getDbInitPromise();
  const dbAdapter = getDb();
  if (!dbAdapter) throw new Error("DB not initialized");

  await contentSystem.initialize("global", false, dbAdapter);
  const cms = new LocalCMS(dbAdapter);

  const widgetsToTest = ["Input", "RichText", "Relation", "Select", "DateTime"];
  const results: any[] = [];
  const ITERATIONS = 2000;
  const WARMUP = 300;

  for (const widgetType of widgetsToTest) {
    const collectionId = `stress_${widgetType.toLowerCase()}`;

    console.log(`📊 Benchmarking widget: ${widgetType} processing overhead`);

    const result = await runBenchmark({
      name: `Widget: ${widgetType} (modifyRequest)`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      concurrency: 1,
      onIteration: async () => {
        // Trigger a find cycle that includes widget handling (modifyRequest)
        await cms.collections.find(collectionId as any, { limit: 5 });
      },
      silent: true,
    });

    results.push(result);
    exportResult(result);
  }

  // Summary
  console.log("\n" + "=".repeat(95));
  console.log("🏁 WIDGET PERFORMANCE OVERHEAD MATRIX");
  console.log("=".repeat(95));
  console.log(
    `| ${"Widget".padEnd(20)} | ${"Avg (ms)".padEnd(12)} | ${"p95 (ms)".padEnd(12)} | ${"RPS".padEnd(12)} | Status     |`,
  );
  console.log("|" + "-".repeat(20 + 12 + 12 + 12 + 12 + 4) + "|");

  for (const r of results) {
    const widgetName = r.name.replace("Widget: ", "").replace(" (modifyRequest)", "");
    const status =
      r.avgMs < 2
        ? "✅ EXCELLENT"
        : r.avgMs < 5
          ? "✅ GOOD"
          : r.avgMs < 10
            ? "⚠️ ACCEPTABLE"
            : "❌ HIGH";
    console.log(
      `| ${widgetName.padEnd(20)} | ${r.avgMs.toFixed(3).padEnd(12)} | ${r.p95Ms.toFixed(3).padEnd(12)} | ${Math.round(r.rps).toLocaleString().padEnd(12)} | ${status.padEnd(10)} |`,
    );
  }
  console.log("=".repeat(95) + "\n");
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("Widget Performance Audit Suite", async () => {
    await runWidgetBenchmark();
  }, 600000);
}
