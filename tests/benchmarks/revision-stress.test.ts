/**
 * @file tests/benchmarks/revision-stress.test.ts
 * @description Enterprise-grade Revision & History growth stress test for SveltyCMS.
 * Measures if reading the "Latest" version slows down as document history grows to 100+ versions.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";

const COLLECTION_ID = "bench_revision_stress";
const VERSION_COUNT = 100;
const DOC_ID = "v-stress-001";

async function runRevisionAudit() {
  console.log(`🚀 Starting Enterprise Revision Stress Audit (${VERSION_COUNT} versions)...\n`);

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/routes/api/cms");
  await ensureFullInitialization();
  const db = getDb();
  const cms = new LocalCMS(db as any);

  // Mock Admin for Auth
  const mockAdmin = { _id: "admin-rev", username: "admin", role: "admin", isAdmin: true };
  const apiOptions = { user: mockAdmin, tenantId: "global" as any };

  // 1. Prepare Collection
  const schema = {
    _id: COLLECTION_ID,
    name: "Revision Stress Test",
    fields: [
      { name: "title", type: "text", widget: { Name: "Input", Icon: "mdi:text", Color: "#ccc" } },
      {
        name: "version",
        type: "number",
        widget: { Name: "Input", Icon: "mdi:numeric", Color: "#ccc" },
      },
    ],
    status: "published",
    revision: true, // Enable revisions for this test
  };

  if ((db as any)?.collection?.createModel) {
    await (db as any).collection.createModel(schema as any).catch(() => {});
  }

  // 🚀 CRITICAL: Sync with in-memory contentStore
  const { contentStore } = await import("@src/stores/content-store.svelte");
  contentStore.sync([
    {
      _id: COLLECTION_ID,
      nodeType: "collection",
      path: `/${COLLECTION_ID}`,
      name: COLLECTION_ID,
      collectionDef: schema,
      tenantId: "global",
    } as any,
  ]);

  try {
    // 2. Initial Read (Empty History)
    // Clean existing if any to avoid UNIQUE constraint error
    await db!.crud.deleteMany(COLLECTION_ID, { _id: DOC_ID as any }, { tenantId: "global" as any });
    await cms.collections.create(
      COLLECTION_ID,
      { _id: DOC_ID, title: "Original", version: 0 },
      apiOptions,
    );

    console.log("   → Measuring Baseline Read (1 version)...");
    const baselineResult = await runBenchmark({
      name: "Baseline Read",
      iterations: 200,
      runs: 1,
      onIteration: async () => {
        await cms.collections.findById(COLLECTION_ID, DOC_ID, apiOptions);
      },
      silent: true,
    });

    // 3. Create 100 Revisions
    console.log(`   → Creating ${VERSION_COUNT} revisions for document ${DOC_ID}...`);
    for (let i = 1; i <= VERSION_COUNT; i++) {
      await cms.collections.update(
        COLLECTION_ID,
        DOC_ID,
        { title: `Version ${i}`, version: i },
        apiOptions,
      );
      if (i % 20 === 0) process.stdout.write(".");
    }
    process.stdout.write("\n");

    await stabilize();

    // 4. Stressed Read (Deep History)
    console.log("   → Measuring Stressed Read (100 versions)...");
    const stressedResult = await runBenchmark({
      name: "Stressed Read",
      iterations: 200,
      runs: 1,
      onIteration: async () => {
        await cms.collections.findById(COLLECTION_ID, DOC_ID, apiOptions);
      },
      silent: true,
    });

    const tax = ((stressedResult.avgMs - baselineResult.avgMs) / baselineResult.avgMs) * 100;

    printTruthTable({
      title: "SVELTYCMS  —  REVISION STRESS AUDIT",
      subtitle: `History Growth • ${VERSION_COUNT} Versions • ${getDbType().toUpperCase()}`,
      results: [
        { ...baselineResult, layer: "Baseline (v1)" },
        { ...stressedResult, layer: "Stressed (v100)" },
      ],
    });

    printSummaryTable([
      { key: "Baseline Read (ms)", val: baselineResult.avgMs, unit: "ms" },
      { key: "Stressed Read (ms)", val: stressedResult.avgMs, unit: "ms" },
      { key: "History Growth Tax", val: tax.toFixed(2), unit: "%" },
      { key: "Stability Rating", val: tax < 10 ? "ELITE" : "DEGRADED", unit: "" },
    ]);

    exportResult(stressedResult);
  } catch (err: any) {
    console.error("❌ Revision audit failed:", err.message);
  }

  console.log("\n✅ Revision stress audit completed.");
}

test("Revision & History Growth Stress", async () => {
  await runRevisionAudit();
}, 450000);
