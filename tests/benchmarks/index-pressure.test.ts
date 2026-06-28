/**
 * @file tests/benchmarks/index-pressure.test.ts
 * @description Enterprise Index Pressure audit for SveltyCMS (Optimized)
 * @summary Measures read performance with sorting and filtering on a large entry collection.
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
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

const COLLECTION_ID = "bench_index_pressure";

const IS_CI =
  process.env.CI === "true" ||
  process.env.BENCHMARK_CI === "true" ||
  process.env.GITHUB_ACTIONS === "true";
const ENTRY_COUNT = IS_CI ? 5000 : 25000;
const BATCH_SIZE = IS_CI ? 250 : 500;
const ITERATIONS = IS_CI ? 100 : 300;
const WARMUP_ITERS = IS_CI ? 20 : 50;

let stopServer: (() => Promise<void>) | null = null;

async function runPressureAudit() {
  console.log(
    `🚀 Starting Enterprise Index Pressure Audit (${ENTRY_COUNT.toLocaleString()} entries)...\n`,
  );

  try {
    let baseUrl: string;
    const runnerBaseUrl = process.env.API_BASE_URL;

    if (runnerBaseUrl) {
      console.log(`    → Using runner's pre-warmed server at ${runnerBaseUrl}`);
      baseUrl = runnerBaseUrl;
    } else {
      console.log("    → No runner detected. Starting isolated benchmark server...");
      const server = await setupBenchmarkServer();
      stopServer = server.stop;
      baseUrl = server.baseUrl;
    }

    // Freeze structural options array elements out of processing trails
    const baseHeaders = {
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
    };

    const lowercaseJsonHeaders = {
      "content-type": "application/json",
      ...baseHeaders,
    };

    await ensureStableTestData();
    await prepareCollection(baseUrl, baseHeaders).catch((err) => {
      (err as any).phase = "provisioning";
      throw err;
    });

    if (!runnerBaseUrl) {
      console.log("    → Performing Deep Health Check before seeding...");
      let adapterReady = false;
      for (let i = 0; i < 20; i++) {
        try {
          const res = await fetch(`${baseUrl}/api/system/health`, {
            method: "GET",
            headers: baseHeaders,
          });
          if (res.ok) {
            const health = await res.json();
            const status = health.status || health.data?.status;
            if (status === "healthy") {
              adapterReady = true;
              break;
            }
          } else {
            await res.arrayBuffer().catch(() => {});
          }
        } catch {
          /* wait */
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (!adapterReady) {
        const err = new Error("Database adapter failed to reach healthy state.");
        (err as any).phase = "health-check";
        throw err;
      }
    } else {
      await stabilize(2000);
    }

    await forceRefreshServer(baseUrl);
    await stabilize(3000);

    await seedLargeDataset(baseUrl, lowercaseJsonHeaders).catch((err) => {
      (err as any).phase = "seeding";
      throw err;
    });

    const scLabel = `${(ENTRY_COUNT / 1000).toFixed(0)}k rows`;
    const executionConcurrency = getRecommendedConcurrency();

    console.log(`    → Measuring Sorted Query Performance (${scLabel})...`);
    const sortResult = await runBenchmark({
      name: `Sorted List (${scLabel})`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP_ITERS,
      runs: 2,
      concurrency: executionConcurrency,
      silent: true,
      onIteration: async () => {
        const res = await fetch(
          `${baseUrl}/api/collections/${COLLECTION_ID}?sort=score&order=desc&limit=20`,
          { method: "GET", headers: baseHeaders },
        );
        if (!res.ok) throw new Error(`Sort failed: ${res.status}`);

        // Byte-level socket clearance guards performance loops from GC spikes
        await res.arrayBuffer();
      },
    });

    console.log(`    → Measuring Filtered Query Performance (${scLabel})...`);
    const filterResult = await runBenchmark({
      name: `Filtered Query (${scLabel})`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP_ITERS,
      runs: 2,
      concurrency: executionConcurrency,
      silent: true,
      onIteration: async () => {
        const res = await fetch(
          `${baseUrl}/api/collections/${COLLECTION_ID}?filter[category]=A&limit=20`,
          { method: "GET", headers: baseHeaders },
        );
        if (!res.ok) throw new Error(`Filter failed: ${res.status}`);
        await res.arrayBuffer();
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

    for (const r of allResults) exportResult(r);
    exportMetric("index.pressure.p95", sortResult.p95Ms, "ms");
    exportMetric("index.pressure.filtered.p95", filterResult.p95Ms, "ms");
    exportMetric("index.pressure.status", 1, "bool");
  } catch (err: any) {
    try {
      exportMetric("index.pressure.status", -1, "bool");
      exportMetric("index.pressure.p95", -1, "ms");
    } catch {
      /* no-op */
    }
    console.error(
      `\n❌ INDEX PRESSURE AUDIT FAILED: ${err.message}\n` +
        `   DB: ${process.env.DB_TYPE || "unknown"}\n` +
        `   Phase: ${err.phase || "unknown"}\n`,
    );
    if (err.stack) console.error(err.stack);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function prepareCollection(baseUrl: string, headers: Record<string, string>) {
  const checkRes = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/schema`, {
    method: "GET",
    headers,
  });
  if (!checkRes.ok) {
    await checkRes.arrayBuffer().catch(() => {});
    throw new Error(`Collection ${COLLECTION_ID} not found — setup may have failed`);
  }
  await checkRes.arrayBuffer();
}

async function seedLargeDataset(baseUrl: string, headers: Record<string, string>) {
  try {
    const checkRes = await fetch(`${baseUrl}/api/collections/${COLLECTION_ID}?limit=1`, {
      method: "GET",
      headers,
    });
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      const total = checkData.total || checkData.data?.total || 0;
      if (total >= ENTRY_COUNT) {
        console.log(`    → Data already present (${total} entries). Skipping seed.`);
        return;
      }
    } else {
      await checkRes.arrayBuffer().catch(() => {});
    }
  } catch {
    /* proceed */
  }

  console.log(
    `    → Seeding ${ENTRY_COUNT.toLocaleString()} entries (Batches of ${BATCH_SIZE})...`,
  );
  const totalBatches = Math.ceil(ENTRY_COUNT / BATCH_SIZE);
  const targetUrl = `${baseUrl}/api/collections/${COLLECTION_ID}/bulk`;

  for (let i = 0; i < totalBatches; i++) {
    const batch = Array.from({ length: BATCH_SIZE }, (_, j) => {
      const idx = i * BATCH_SIZE + j;
      return generateRealisticEntry(idx, idx % 10 === 0 ? "heavy" : "medium");
    });

    let retryCount = 0;
    const maxRetries = 5;
    const payloadBody = JSON.stringify(batch);

    while (true) {
      const res = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: payloadBody,
      });

      if (res.ok) {
        await res.arrayBuffer();
        break;
      }

      const bodyText = await res.text().catch(() => "");
      const isRetryable =
        res.status === 503 || bodyText.includes("BUSY") || bodyText.includes("Pool Exhausted");

      if (isRetryable && retryCount < maxRetries) {
        retryCount++;
        const delay = 3000 * retryCount;
        console.warn(
          `    [WARN] Seeding batch ${i} failed (${res.status}). Reason: ${bodyText.includes("Pool Exhausted") ? "Pool Exhausted" : "Other"}. Retrying in ${delay}ms...`,
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
}, 1200000);
