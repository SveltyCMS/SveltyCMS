/**
 * @file tests/benchmarks/index-pressure.test.ts
 * @description Enterprise Index Pressure audit for SveltyCMS.
 * Measures read performance with sorting and filtering on a large entry collection.
 *
 * ### Modes:
 * - **Matrix Runner**: Uses the runner's pre-warmed server via `API_BASE_URL` env.
 * - **Standalone**: Starts its own isolated server via `setupBenchmarkServer()`.
 *
 * ### Features:
 * - smart server detection (no duplicate infrastructure)
 * - idempotent collection provisioning
 * - dual metric export (METRIC: stdout + JSON files)
 * - exponential-backoff bulk seeding with retry resilience
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  forceRefreshServer,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbLabel,
  TEST_API_SECRET,
  generateRealisticEntry,
  getRecommendedConcurrency,
} from "./benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

const COLLECTION_ID = "bench_index_pressure";
const ENTRY_COUNT = 25_000;
const BATCH_SIZE = 500;

let stopServer: (() => Promise<void>) | null = null;

async function runPressureAudit() {
  console.log(
    `🚀 Starting Enterprise Index Pressure Audit (${ENTRY_COUNT.toLocaleString()} entries)...\n`,
  );

  try {
    // ── Server Detection: Use runner's server if available, otherwise start one ──
    let baseUrl: string;
    const runnerBaseUrl = process.env.API_BASE_URL;

    if (runnerBaseUrl) {
      console.log(`   → Using runner's pre-warmed server at ${runnerBaseUrl}`);
      baseUrl = runnerBaseUrl;
    } else {
      console.log("   → No runner detected. Starting isolated benchmark server...");
      const server = await setupBenchmarkServer();
      stopServer = server.stop;
      baseUrl = server.baseUrl;
    }

    await ensureStableTestData();
    await prepareCollection(baseUrl);

    // Only deep health-check when running standalone (runner already guarantees health)
    if (!runnerBaseUrl) {
      console.log("   → Performing Deep Health Check before seeding...");
      let adapterReady = false;
      for (let i = 0; i < 20; i++) {
        try {
          const res = await fetch(`${baseUrl}/api/system/health`, {
            headers: {
              "x-test-mode": "true",
              "x-test-secret": TEST_API_SECRET,
            },
          });
          if (res.ok) {
            const health = await res.json();
            const status = health.status || health.data?.status;
            if (status === "healthy") {
              adapterReady = true;
              break;
            }
          }
        } catch {
          /* wait */
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (!adapterReady) throw new Error("Database adapter failed to reach healthy state.");
    } else {
      // Under runner: quick verify with shorter timeout
      await stabilize(2000);
    }

    await forceRefreshServer(baseUrl);
    await stabilize(3000);

    // Seed data efficiently
    await seedLargeDataset(baseUrl);

    // === Benchmarks ===
    const scLabel = `${(ENTRY_COUNT / 1000).toFixed(0)}k rows`;

    console.log(`   → Measuring Sorted Query Performance (${scLabel})...`);
    const sortResult = await runBenchmark({
      name: `Sorted List (${scLabel})`,
      iterations: 300,
      warmupIterations: 50,
      runs: 2,
      concurrency: getRecommendedConcurrency(),
      silent: true,
      onIteration: async () => {
        const res = await fetch(
          `${baseUrl}/api/collections/${COLLECTION_ID}?sort=score&order=desc&limit=20`,
          {
            headers: {
              "x-test-mode": "true",
              "x-test-secret": TEST_API_SECRET,
            },
          },
        );
        if (!res.ok) throw new Error(`Sort failed: ${res.status}`);
        await res.json();
      },
    });

    console.log(`   → Measuring Filtered Query Performance (${scLabel})...`);
    const filterResult = await runBenchmark({
      name: `Filtered Query (${scLabel})`,
      iterations: 300,
      warmupIterations: 50,
      runs: 2,
      concurrency: getRecommendedConcurrency(),
      silent: true,
      onIteration: async () => {
        const res = await fetch(
          `${baseUrl}/api/collections/${COLLECTION_ID}?filter[category]=A&limit=20`,
          {
            headers: {
              "x-test-mode": "true",
              "x-test-secret": TEST_API_SECRET,
            },
          },
        );
        if (!res.ok) throw new Error(`Filter failed: ${res.status}`);
        await res.json();
      },
    });

    const allResults = [sortResult, filterResult];

    printTruthTable({
      title: "SVELTYCMS  —  INDEX PRESSURE AUDIT",
      subtitle: `${scLabel} • Sort + Filter • ${getDbLabel()}`,
      results: allResults,
    });

    printSummaryTable([
      { key: "Sorted Query (p95)", val: sortResult.p95Ms, unit: "ms" },
      { key: "Filtered Query (p95)", val: filterResult.p95Ms, unit: "ms" },
      {
        key: "Index Health",
        val: sortResult.p95Ms < 250 && filterResult.p95Ms < 250 ? "OPTIMAL" : "NEEDS WORK",
        unit: "",
      },
    ]);

    // ── Dual Export: JSON files (for findResult) + METRIC: lines (for getMetric) ──
    // NOTE: METRIC keys must use only [\w.]+ chars (alphanumeric, underscore, dot) —
    // spaces/hyphens break the runner's stdout regex parser.
    for (const r of allResults) exportResult(r);
    exportMetric("index.pressure.p95", sortResult.p95Ms, "ms");
    exportMetric("index.pressure.filtered.p95", filterResult.p95Ms, "ms");
  } catch (err: any) {
    logger.error("Index Pressure audit failed:", err.message);
    if (err.stack) console.error(err.stack);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Index pressure audit completed.");
}

// ─────────────────────────────────────────────────────────────────────────────

async function prepareCollection(baseUrl: string) {
  const schema = {
    _id: COLLECTION_ID,
    name: COLLECTION_ID,
    fields: [
      { db_fieldName: "title", widget: { Name: "Input" } },
      { db_fieldName: "slug", widget: { Name: "Input" } },
      { db_fieldName: "content", widget: { Name: "RichText" } },
      { db_fieldName: "score", widget: { Name: "Number" } },
      { db_fieldName: "category", widget: { Name: "Select" } },
      { db_fieldName: "author", widget: { Name: "Relation" } },
      { db_fieldName: "tags", widget: { Name: "Input" } },
      { db_fieldName: "metadata", widget: { Name: "Group" } },
    ],
  };

  // 🚀 IDEMPOTENT: Check if collection already exists before provisioning
  try {
    const checkRes = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/schema`, {
      headers: { "x-test-mode": "true", "x-test-secret": TEST_API_SECRET },
    });
    if (checkRes.ok) {
      console.log("   → Collection already exists. Skipping provisioning.");
      return;
    }
  } catch {
    /* proceed to create */
  }

  console.log("   → Provisioning index-pressure collection via HTTP API...");
  const res = await fetch(`${baseUrl}/api/testing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
    },
    body: JSON.stringify({
      action: "create-collection",
      schema,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to provision collection via API: ${res.status} ${body}`);
  }
}

async function seedLargeDataset(baseUrl: string) {
  // 🚀 SMART SEEDING: Check if data already exists
  try {
    const checkRes = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}?limit=1`, {
      headers: { "x-test-mode": "true", "x-test-secret": TEST_API_SECRET },
    });
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      const total = checkData.total || checkData.data?.total || 0;
      if (total >= ENTRY_COUNT) {
        console.log(`   → Data already present (${total} entries). Skipping seed.`);
        return;
      }
    }
  } catch {
    /* proceed */
  }

  console.log(`   → Seeding ${ENTRY_COUNT.toLocaleString()} entries (Batches of ${BATCH_SIZE})...`);
  const totalBatches = Math.ceil(ENTRY_COUNT / BATCH_SIZE);

  for (let i = 0; i < totalBatches; i++) {
    const batch = Array.from({ length: BATCH_SIZE }, (_, j) => {
      const idx = i * BATCH_SIZE + j;
      return generateRealisticEntry(idx, idx % 10 === 0 ? "heavy" : "medium");
    });

    let retryCount = 0;
    const maxRetries = 5;
    let res: Response;

    while (true) {
      // 🚀 TITAN SEED: Use the high-performance 'bulk-seed' action
      res = await fetch(`${baseUrl}/api/testing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-mode": "true",
          "x-test-secret": TEST_API_SECRET,
        },
        body: JSON.stringify({
          action: "bulk-seed",
          collectionId: COLLECTION_ID,
          data: batch,
        }),
      });

      if (res.ok) break;

      const bodyText = await res.text().catch(() => "");
      const isRetryable =
        res.status === 503 || bodyText.includes("BUSY") || bodyText.includes("Pool Exhausted");

      if (isRetryable && retryCount < maxRetries) {
        retryCount++;
        const delay = 3000 * retryCount;
        console.warn(
          `   [WARN] Seeding batch ${i} failed (${res.status}). Reason: ${bodyText.includes("Pool Exhausted") ? "Pool Exhausted" : "Other"}. Retrying in ${delay}ms...`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw new Error(
        `Seeding failed at batch ${i}: ${res.status} ${res.statusText}\nBody: ${bodyText}`,
      );
    }

    if (i % 8 === 0) process.stdout.write(".");
  }
  process.stdout.write("\n");
}

test("100k Row Index Pressure", async () => {
  await runPressureAudit();
}, 1200000); // 20 minutes
