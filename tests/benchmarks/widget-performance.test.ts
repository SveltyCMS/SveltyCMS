/**
 * @file tests/benchmarks/widget-performance.test.ts
 * @description High-fidelity benchmark for SveltyCMS Core Widget overhead.
 */
import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  setupBenchmarkServer,
  printAuditTable,
  printSummaryTable,
} from "./benchmark-utils";
import type { DatabaseId } from "../../src/databases/db-interface";
import { logger } from "@utils/logger.server";

let stopServer: () => Promise<void>;

beforeAll(async () => {
  const { stop } = await setupBenchmarkServer();
  stopServer = stop;
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

export async function runWidgetBenchmark() {
  console.log("🚀 Starting SveltyCMS Widget Performance Audit...\n");

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/routes/api/cms");

  await ensureFullInitialization();
  const db = getDb();
  if (!db) throw new Error("DB not initialized");
  const cms = new LocalCMS(db);

  await stabilize();

  const ITERATIONS = 600;
  const RUNS = 3;
  const allResults: any[] = [];

  const scenarios = [
    { name: "Widget: Input (Basic)", query: { limit: 10 } },
    { name: "Widget: RichText (Parsing)", query: { limit: 10, fields: ["content"] } },
    { name: "Widget: Relation (Lookup)", query: { limit: 10, populate: ["relatedPost"] } },
  ];

  logger.level = "silent";

  for (const scenario of scenarios) {
    const result = await runBenchmark({
      name: scenario.name,
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: RUNS,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        // Use an available collection ID found in previous run, avoiding internal system collections
        // @ts-ignore
        const collections = await cms.collections.list({ tenantId: "global" });
        const userCollections = collections.success
          ? (collections.data as any).filter((c: any) => !c._id.startsWith("system_"))
          : [];
        const collectionId =
          userCollections.length > 0
            ? (userCollections[0]._id as any as DatabaseId)
            : ("24f597be-9840-4cde-a91c-ee977c24d575" as any as DatabaseId); // Explicit ID from available list

        await (cms.collections.find as any)(collectionId, {
          limit: 10,
          tenantId: "global",
        });
      },
    });
    allResults.push(result);
  }

  logger.level = "info";

  printAuditTable({
    title: "SVELTYCMS  —  WIDGET PIPELINE OVERHEAD",
    subtitle: "Data Transformation • Validation • modifyRequest Loop",
    results: allResults,
  });

  const base = allResults[0];

  printSummaryTable([
    { key: "Average Widget Latency", val: base.avgMs, unit: "ms" },
    { key: "p95 Transformation Cost", val: base.p95Ms, unit: "ms" },
    { key: "Max Transformation RPS", val: Math.round(base.rps), unit: "trans/s" },
    { key: "RSS Pipeline Δ", val: (base.rssDelta || 0).toFixed(2), unit: "MB" },
  ]);

  exportMetric("logic.widget.avg", base.avgMs, "ms");
  exportMetric("logic.widget.rps", base.rps, "req/s");

  for (const r of allResults) exportResult(r);

  console.log("\n✅ Widget performance benchmark completed.");
}

test("Widget Performance Audit Suite", async () => {
  await runWidgetBenchmark();
}, 450000);
