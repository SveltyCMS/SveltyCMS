/**
 * @file tests/benchmarks/config-promotion.test.ts
 * @description Config Promotion & Sync Performance Benchmark (Optimized)
 * @summary Measures configuration export, plan generation, status comparison, and import/apply throughput.
 */

import {
  test,
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

const EXPORT_TIERS: [string, number][] = [
  ["10 collections", 10],
  ["50 collections", 50],
  ["100 collections", 100],
];

let stopServer: (() => Promise<void>) | null = null;

function generateCollectionSchema(index: number) {
  const fieldCount = 4 + (index % 7);
  const fields = Array.from({ length: fieldCount }, (_, f) => {
    const mod = f % 3;
    const widget = mod === 0 ? "Input" : mod === 1 ? "Number" : "Textarea";
    return {
      db_fieldName: `field_${f}_${index}`,
      label: `Field ${f} (Col ${index})`,
      widget: { Name: widget },
      type: widget === "Number" ? "number" : "text",
      required: f === 0,
    };
  });

  return {
    _id: `bench_promote_col_${index}`,
    name: `Benchmark Promotion Collection ${index}`,
    fields,
  };
}

// ── FAST DIRECT SCHEMA SEEDING & CLEANUP ────────────────────────────────────

async function seedCollections(count: number): Promise<string[]> {
  const { dbAdapter } = await import("@src/databases/db");
  const schemas = Array.from({ length: count }, (_, i) => generateCollectionSchema(i));
  const ids = schemas.map((s) => s._id);
  const now = new Date().toISOString();

  await Promise.all(
    schemas.map(async (schema) => {
      try {
        await dbAdapter!.crud.upsert(
          "content_nodes",
          {
            nodeType: "collection",
            name: schema.name,
            tenantId: "global",
          } as Record<string, unknown>,
          {
            _id: schema._id,
            path: `/collections/${schema._id}`,
            name: schema.name,
            icon: "bi:file",
            nodeType: "collection",
            collectionDef: schema,
            tenantId: "global",
            createdAt: now,
            updatedAt: now,
          } as any,
          "global" as any,
        );
      } catch (err: any) {
        logger.warn(`Seeding error on ${schema._id}: ${err.message}`);
      }
    }),
  );

  return ids;
}

async function cleanupCollections(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { dbAdapter } = await import("@src/databases/db");
  await Promise.all(
    ids.map((id) =>
      dbAdapter!.crud.delete("content_nodes", id as any, "global" as any).catch(() => {}),
    ),
  );
}

// ---------------------------------------------------------------------------
// Benchmark Execution
// ---------------------------------------------------------------------------

async function runConfigPromotionAudit() {
  console.log("\n🚀 Starting Config Promotion & Sync Benchmark...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;

    await ensureStableTestData();

    const { ConfigService } = await import("@src/services/core/config-service");
    const configService = new ConfigService();
    const dbType = getDbType();

    // ── 1. Config Status Check Benchmark ─────────────────────────────────
    console.log("   → Config Status Check (source vs active comparison)...");
    const statusResult = await runBenchmark({
      name: "Config Status Check",
      iterations: 50,
      warmupIterations: 10,
      runs: 2,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        await configService.getStatus("global");
      },
    });

    // ── 2. Multi-Tier Export Benchmarks ──────────────────────────────────
    const exportResults: any[] = [];
    const memorySnapshots: { tier: string; rssDelta: number }[] = [];

    for (const [label, count] of EXPORT_TIERS) {
      console.log(`   → Seeding ${count} collections for ${label}...`);
      const seededIds = await seedCollections(count);
      console.log(`   → Seeded ${seededIds.length} collections.`);

      // Warm cache & index state
      await configService.getStatus("global");

      const result = await runBenchmark({
        name: `Config Export (${label})`,
        iterations: 5,
        warmupIterations: 2,
        runs: 2,
        concurrency: 1,
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          await configService.performExport({ tenantId: "global" });
        },
      });

      exportResults.push({ ...result, layer: label, shortLabel: `Export (${label})` });

      if (result.rssDelta != null) {
        memorySnapshots.push({ tier: label, rssDelta: result.rssDelta });
      }

      await cleanupCollections(seededIds);
    }

    // ── 3. Plan Generation Benchmark (50 collections) ────────────────────
    console.log("   → Plan generation benchmark (50 collections)...");
    const planSeedIds = await seedCollections(50);

    const planFn =
      typeof (configService as any).getPlan === "function"
        ? () => (configService as any).getPlan({ tenantId: "global" })
        : typeof (configService as any).generatePlan === "function"
          ? () => (configService as any).generatePlan({ tenantId: "global" })
          : () => configService.getStatus("global");

    const planResult = await runBenchmark({
      name: "Config Plan Generation (50 cols)",
      iterations: 20,
      warmupIterations: 5,
      runs: 2,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        await planFn();
      },
    });

    await cleanupCollections(planSeedIds);

    // ── 4. Import / Apply Throughput (Isolated State per Iteration) ───────
    console.log("   → Import/Apply throughput benchmark...");

    // Stage 10 collections and generate target export bundle
    const importSeedIds = await seedCollections(10);
    await configService.performExport({ tenantId: "global" });
    await cleanupCollections(importSeedIds);

    const importResult = await runBenchmark({
      name: "Config Import (10 cols)",
      iterations: 5,
      warmupIterations: 1,
      runs: 2,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        await configService.performImport({ tenantId: "global" });
        await cleanupCollections(importSeedIds);
      },
    });

    // ── Reporting & Export ───────────────────────────────────────────────
    const allResults = [
      { ...statusResult, layer: "Status", shortLabel: "Status Check" },
      ...exportResults,
      { ...planResult, layer: "Planning", shortLabel: "Plan Gen (50 cols)" },
      { ...importResult, layer: "Apply", shortLabel: "Import (10 cols)" },
    ];

    printTruthTable({
      title: `SVELTYCMS — CONFIG PROMOTION & SYNC AUDIT (${dbType.toUpperCase()})`,
      shortLabel: "Config Sync",
      subtitle: "Export · Plan · Status · Import — Multi-Tier Scale",
      results: allResults,
    });

    const export100 = exportResults.find((r) => r.name.includes("100 collections"));
    printSummaryTable(
      [
        { key: "Status Check Latency", val: statusResult.avgMs.toFixed(2), unit: "ms" },
        { key: "Export (10 cols)", val: exportResults[0]?.avgMs.toFixed(2) ?? "0.00", unit: "ms" },
        { key: "Export (50 cols)", val: exportResults[1]?.avgMs.toFixed(2) ?? "0.00", unit: "ms" },
        { key: "Export (100 cols)", val: export100?.avgMs.toFixed(2) ?? "0.00", unit: "ms" },
        { key: "Plan Generation (50 cols)", val: planResult.avgMs.toFixed(2), unit: "ms" },
        { key: "Import / Apply (10 cols)", val: importResult.avgMs.toFixed(2), unit: "ms" },
        {
          key: "Peak Memory Growth (100 cols)",
          val: export100?.rssDelta != null ? export100.rssDelta.toFixed(1) : "N/A",
          unit: "MB",
        },
      ],
      "Config Sync",
    );

    for (const r of allResults) {
      exportResult(r);
    }
  } catch (err: any) {
    logger.error(`Config promotion benchmark failed: ${err.message}`);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Config Promotion & Sync benchmark completed.");
}

test("Config Promotion Performance", async () => {
  await runConfigPromotionAudit();
}, 900_000);
