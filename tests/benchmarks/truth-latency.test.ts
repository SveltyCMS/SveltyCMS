/**
 * @file tests/benchmarks/truth-latency.test.ts
 * @description Truth Latency Benchmark (Optimized)
 * @summary Validates performance claims by comparing SDK, Middleware, and Real HTTP Stack
 *
 * ### Features:
 * - Isolated SDK baseline (LocalCMS, in-memory DB)
 * - Middleware pipeline overhead measurement
 * - Real HTTP stack E2E latency comparison
 */

import {
  test,
  beforeAll,
  afterAll,
  runBenchmark,
  runStochasticLoadTest,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  exportResult,
  exportMetric,
  STABLE_COLLECTION,
  STABLE_ENTRY_ID,
  ensureStableTestData,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

let stopServer: () => Promise<void>;
let apiBaseUrl: string;

beforeAll(async () => {
  const { stop, baseUrl } = await setupBenchmarkServer();
  stopServer = stop;
  apiBaseUrl = baseUrl;

  await ensureStableTestData();
}, 120000);

afterAll(async () => {
  if (stopServer) await stopServer().catch(() => {});
});

test("Enterprise Truth Audit: SRE Connectivity Model", async () => {
  await import("@src/databases/db");
  const { LocalCMS } = await import("@src/services/sdk");
  const secret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";

  // 1. Isolated SDK Baseline Initialization
  const { loadAdapters } = await import("@src/databases/db-init");
  const isolatedDb = await loadAdapters({
    type: "sqlite",
    database: ":memory:",
  });
  if (!isolatedDb) throw new Error("Failed to create isolated DB");
  await isolatedDb.connect(":memory:");
  const sdkCms = new LocalCMS(isolatedDb);

  await ensureStableTestData(isolatedDb);

  const ITERATIONS = 300;
  const allResults: any[] = [];

  // Pre-allocate headers configuration to eliminate local V8 runtime allocation drift
  const requestHeaders = {
    "x-test-mode": "true",
    "x-test-secret": secret,
    "x-tenant-id": "default",
  };

  console.log(
    `\n🕵️  Executing SRE Truth Audit for "${STABLE_COLLECTION}" (Isolated Baseline)...\n`,
  );

  try {
    // 1. Logic Baseline (Harness Overhead)
    const logicRes = await runBenchmark({
      name: "Logic Baseline",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: 1,
      silent: true,
      onIteration: async () => {},
    });
    allResults.push({
      ...logicRes,
      layer: "Logic",
      proves: "JS Harness Overhead",
    });

    // 2. SDK Layer (Isolated In-Memory)
    const sdkRes = await runBenchmark({
      name: "Local SDK (Full)",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: 1,
      silent: true,
      measureMemory: true,
      onIteration: async () => {
        await sdkCms.collections.find(STABLE_COLLECTION as any, {
          _id: STABLE_ENTRY_ID,
          tenantId: "global",
        });
      },
    });
    allResults.push({ ...sdkRes, layer: "SDK", proves: "DB + Widget Engine" });

    // 3. HTTP Layer (Full Middleware + Network)
    const httpRes = await runBenchmark({
      name: "HTTP End-to-End",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: 1,
      silent: true,
      measureMemory: true,
      onIteration: async () => {
        const res = await fetch(
          `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
          {
            method: "GET",
            headers: requestHeaders,
          },
        );
        if (!res.ok) throw new Error(`HTTP Truth failed: ${res.status}`);

        // Native byte stream collector isolates server roundtrip from client-side tree building
        await res.arrayBuffer();
      },
    });
    allResults.push({
      ...httpRes,
      layer: "HTTP",
      proves: "Full Production Stack",
    });

    printTruthTable({
      title: "SVELTYCMS — SRE TRUTH AUDIT",
      subtitle: "3-Layer Production Reality Model",
      results: allResults,
    });

    printSummaryTable([
      {
        key: "Baseline Harness Overhead",
        val: allResults[0].avgMs,
        unit: "ms",
      },
      { key: "SDK Engine Latency", val: allResults[1].avgMs, unit: "ms" },
      { key: "E2E HTTP Latency", val: allResults[2].avgMs, unit: "ms" },
      {
        key: "Peak HTTP Throughput",
        val: Math.round(allResults[2].rps),
        unit: "req/s",
      },
    ]);

    // 4. Stochastic Load Test
    console.log("\n🔥 Ramping Stochastic Load Test (SLA Verification)...");
    const dbType = (process.env.DB_TYPE ?? "sqlite").toLowerCase();
    const isSqlite = dbType.includes("sqlite");
    const useRedis = process.env.USE_REDIS === "true";
    const slaP95Ms = isSqlite ? 2000 : 150;

    console.log(`   SLA target: p95 < ${slaP95Ms}ms (DB: ${dbType}${useRedis ? "+Redis" : ""})`);

    const loadTestRes = await runStochasticLoadTest({
      name: "Truth Simulation",
      stages: isSqlite
        ? [
            { duration: 3, target: 2 },
            { duration: 5, target: 3 },
            { duration: 3, target: 2 },
          ]
        : [
            { duration: 2, target: 10 },
            { duration: 3, target: 30 },
            { duration: 2, target: 10 },
          ],
      thresholds: {
        p95: `< ${slaP95Ms}`,
        error_rate: "< 0.05",
      },
      onIteration: async () => {
        const r = await fetch(
          `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
          {
            method: "GET",
            headers: requestHeaders,
          },
        );
        if (!r.ok) {
          await r.text().catch(() => {});
          throw new Error("Load failure");
        }
        await r.arrayBuffer();
      },
    });

    if (!loadTestRes.passedSLA) {
      console.error("\n❌ SLA VIOLATION in Truth Load Test:");
      loadTestRes.violations?.forEach((v: string) => console.error(`   - ${v}`));
      // Throw an error instead of process.exit to preserve afterAll teardown hooks
      throw new Error(`Stochastic Load Test failed SLA threshold bounds.`);
    }

    exportMetric("truth.http.p95", httpRes.p95Ms, "ms");
    exportMetric("api.latency.http", httpRes.p95Ms, "ms");
    exportMetric("truth.sdk.avg", sdkRes.avgMs, "ms");
    exportMetric("rest.collections.rps", httpRes.rps, "req/s");

    for (const r of allResults) exportResult(r);
  } finally {
    // Teardown occurs naturally inside the afterAll hook block
  }
}, 600000);
