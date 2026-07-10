/**
 * @file tests/benchmarks/config-promotion.test.ts
 * @description Config Promotion & Sync Performance Benchmark
 * @summary Measures configuration export, plan generation, status comparison, and import/apply throughput at multiple collection tiers.
 *
 * ### Features:
 * - Config export time for 10, 50, 100 collections with various field counts
 * - Plan generation time at each tier
 * - Config status check (source vs active state comparison) timing
 * - Import/apply throughput (ops/sec)
 * - Memory footprint during export
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
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Tiers for scale testing: [label, collectionCount] */
const EXPORT_TIERS: [string, number][] = [
  ["10 collections", 10],
  ["50 collections", 50],
  ["100 collections", 100],
];

let stopServer: (() => Promise<void>) | null = null;

// Pre-frozen headers object to avoid per-iteration allocation
const HEADERS = Object.freeze({
  "content-type": "application/json",
  "x-test-mode": "true",
  "x-test-secret": TEST_API_SECRET,
  "x-tenant-id": "global",
} as const);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a synthetic collection with realistic field diversity to approximate
 * real-world export payload complexity.
 */
function generateCollectionSchema(index: number) {
  const fieldCount = 4 + (index % 7); // 4–10 fields per collection
  const fields: any[] = [];

  for (let f = 0; f < fieldCount; f++) {
    const widget = f % 3 === 0 ? "Input" : f % 3 === 1 ? "Number" : "Textarea";
    const type = widget === "Number" ? "number" : "text";
    fields.push({
      db_fieldName: `field_${f}_${index}`,
      label: `Field ${f} (Col ${index})`,
      widget: { Name: widget },
      type,
      required: f === 0,
    });
  }

  return {
    _id: `bench_promote_col_${index}`,
    name: `Benchmark Promotion Collection ${index}`,
    fields,
  };
}

/**
 * Bulk-create synthetic collections via the testing API for the target tier.
 * Returns the created collection IDs for subsequent cleanup reference.
 */
async function seedCollections(count: number, baseUrl: string): Promise<string[]> {
  const ids: string[] = [];
  const batchSize = 25;
  for (let batch = 0; batch < count; batch += batchSize) {
    const end = Math.min(batch + batchSize, count);
    const promises = [];
    for (let i = batch; i < end; i++) {
      const schema = generateCollectionSchema(i);
      ids.push(schema._id);
      promises.push(
        fetch(`${baseUrl}/api/collections`, {
          method: "POST",
          headers: HEADERS,
          body: JSON.stringify(schema),
        }).then((r) => {
          if (!r.ok)
            return r
              .text()
              .then((t) =>
                console.warn(`  ⚠️ Failed to seed collection ${schema._id}: ${r.status} ${t}`),
              );
        }),
      );
    }
    await Promise.all(promises);
  }
  return ids;
}

/**
 * Delete all seeded collections to restore a clean state.
 */
async function cleanupCollections(ids: string[], baseUrl: string) {
  const batchSize = 10;
  for (let batch = 0; batch < ids.length; batch += batchSize) {
    const end = Math.min(batch + batchSize, ids.length);
    const promises = ids.slice(batch, end).map((id) =>
      fetch(`${baseUrl}/api/collections/${id}?permanent=true`, {
        method: "DELETE",
        headers: HEADERS,
      }).catch(() => {}),
    );
    await Promise.all(promises);
  }
}

// ---------------------------------------------------------------------------
// Benchmark Runner
// ---------------------------------------------------------------------------

async function runConfigPromotionAudit() {
  console.log("\n🚀 Starting Config Promotion & Sync Benchmark...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();

    // Pre-import ConfigService to warm the dynamic import cache
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

    // ── 2. Export benchmarks at each tier ────────────────────────────────
    const exportResults: any[] = [];
    const memorySnapshots: { tier: string; rssDelta: number }[] = [];

    for (const [label, count] of EXPORT_TIERS) {
      console.log(`   → Seeding ${count} collections for export tier...`);
      const seededIds = await seedCollections(count, baseUrl);
      console.log(`   → Seeded ${seededIds.length} collections.`);

      // Warm the ConfigService state
      await configService.getStatus("global");

      const result = await runBenchmark({
        name: `Config Export (${label})`,
        iterations: 3,
        warmupIterations: 1,
        runs: 2,
        concurrency: 1,
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          await configService.performExport({ tenantId: "global" });
        },
      });

      exportResults.push({ ...result, layer: label });

      if (result.rssDelta != null) {
        memorySnapshots.push({ tier: label, rssDelta: result.rssDelta });
      }

      // Clean up before next tier
      await cleanupCollections(seededIds, baseUrl);
    }

    // ── 3. Plan Generation Benchmark (single tier) ───────────────────────
    console.log("   → Plan generation benchmark (50 collections)...");
    const planSeedIds = await seedCollections(50, baseUrl);

    const planResult = await runBenchmark({
      name: "Config Plan Generation (50 cols)",
      iterations: 20,
      warmupIterations: 5,
      runs: 2,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        await configService.getStatus("global");
      },
    });

    await cleanupCollections(planSeedIds, baseUrl);

    // ── 4. Import / Apply Throughput ─────────────────────────────────────
    console.log("   → Import/Apply throughput benchmark...");

    // Create a small set and export it so we have a snapshot to import from
    const importSeedIds = await seedCollections(10, baseUrl);
    await configService.performExport({ tenantId: "global" });

    // Clean the seeded collections so the import has work to detect
    await cleanupCollections(importSeedIds, baseUrl);

    const importResult = await runBenchmark({
      name: "Config Import (10 cols)",
      iterations: 10,
      warmupIterations: 3,
      runs: 2,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        await configService.performImport({ tenantId: "global" });
      },
    });

    // Clean up imported config
    await cleanupCollections(importSeedIds, baseUrl);

    // ── Reporting ────────────────────────────────────────────────────────
    const allResults = [
      { ...statusResult, layer: "Status", shortLabel: "Status Check" },
      ...exportResults,
      { ...planResult, layer: "Planning", shortLabel: "Plan Gen" },
      { ...importResult, layer: "Apply", shortLabel: "Import" },
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
        { key: "Status Check Latency", val: statusResult.avgMs, unit: "ms" },
        { key: "Export (10 cols)", val: exportResults[0]?.avgMs ?? 0, unit: "ms" },
        { key: "Export (50 cols)", val: exportResults[1]?.avgMs ?? 0, unit: "ms" },
        { key: "Export (100 cols)", val: export100?.avgMs ?? 0, unit: "ms" },
        { key: "Plan Generation (50 cols)", val: planResult.avgMs, unit: "ms" },
        { key: "Import / Apply (10 cols)", val: importResult.avgMs, unit: "ms" },
        {
          key: "Peak Memory Growth (100 cols)",
          val: export100?.rssDelta?.toFixed(1) ?? "N/A",
          unit: "MB",
        },
      ],
      "Config Sync",
    );

    // Export all individual results
    for (const r of allResults) {
      exportResult(r);
    }
  } catch (err: any) {
    logger.error(`Config promotion benchmark failed: ${err.message}`);
    console.error(err);
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
}, 900_000); // 15 minutes
