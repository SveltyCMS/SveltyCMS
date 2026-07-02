/**
 * @file tests/benchmarks/production-day.test.ts
 * @description Production Day Composite Workload Benchmark (Optimized)
 * @summary Simulates a realistic multi-user workload with a weighted mix of read, list, update, media probe, and GraphQL search operations.
 *
 * ### Features:
 * - Weighted operation distribution (40% list, 20% entry read, 25% update, 10% media, 5% GQL)
 * - Realistic think-time simulation between user actions
 * - 8-concurrent simulated users with traced request IDs
 * - Composite throughput measurement for production-like conditions
 */

import {
  test,
  runBenchmark,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  STABLE_COLLECTION,
  STABLE_ENTRY_ID,
  TEST_API_SECRET,
  generateRealisticEntry,
  printTruthTable,
  printSummaryTable,
  getDbLabel,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

let stopServer: (() => Promise<void>) | null = null;
let apiBaseUrl: string;

async function runProductionDayAudit() {
  console.log(`\n🚀 Starting "Production Day in the Life" Composite Audit...\n`);

  const { stop, baseUrl } = await setupBenchmarkServer();
  stopServer = stop;
  apiBaseUrl = baseUrl;

  try {
    await ensureStableTestData();

    // Setup base mutable base template structure to eliminate object spread allocations
    const requestHeaders: Record<string, string> = {
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
      "x-tenant-id": "global",
      "Content-Type": "application/json",
      "x-request-id": "",
    };

    const scenarios = [
      { type: "READ_LIST" }, // 0
      { type: "READ_ENTRY" }, // 1
      { type: "UPDATE" }, // 2
      { type: "MEDIA" }, // 3
      { type: "GQL" }, // 4
    ];

    // Pre-build a flat 100-index distribution array to convert weighted checks into O(1) lookups
    const distributionPool: number[] = [
      ...Array(40).fill(0), // 40%
      ...Array(20).fill(1), // 20%
      ...Array(25).fill(2), // 25%
      ...Array(10).fill(3), // 10%
      ...Array(5).fill(4), // 5%
    ];

    // Pre-cache persistent operations and static payloads outside of execution loop
    const gqlQueryString = JSON.stringify({
      query: `query { entries(collection: "${STABLE_COLLECTION}", limit: 5) { _id title } }`,
    });

    // Pre-generate update data packets to isolate payload serialization latency
    const ITERATIONS = 500;
    const pregeneratedUpdates = Array.from({ length: ITERATIONS }, (_, i) =>
      JSON.stringify(generateRealisticEntry(i, "medium")),
    );

    // Pre-shuffle array indicators to maintain authentic non-linear load distributions
    const lookupSequence = Array.from(
      { length: ITERATIONS },
      () => distributionPool[Math.floor(Math.random() * distributionPool.length)],
    );

    const results = await runBenchmark({
      name: "Production Day @ 8c",
      iterations: ITERATIONS,
      warmupIterations: 100,
      concurrency: 8,
      thinkTimeMs: [50, 200],
      onIteration: async (i: number) => {
        const scenarioIndex = lookupSequence[i] ?? 0;
        const selected = scenarios[scenarioIndex]!;

        // Directly mutate single memory reference key instead of dynamic object rebuilding
        requestHeaders["x-request-id"] = `day-${i}-${selected.type}`;

        switch (selected.type) {
          case "READ_LIST": {
            const res = await fetch(`${apiBaseUrl}/api/collections/${STABLE_COLLECTION}?limit=10`, {
              headers: requestHeaders,
            });
            if (!res.ok) throw new Error(`List failed: ${res.status}`);
            await res.arrayBuffer();
            break;
          }

          case "READ_ENTRY": {
            const res = await fetch(
              `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
              { headers: requestHeaders },
            );
            if (!res.ok) throw new Error(`View failed: ${res.status}`);
            await res.arrayBuffer();
            break;
          }

          case "UPDATE": {
            const bodyPayload = pregeneratedUpdates[i] ?? pregeneratedUpdates[0];
            const res = await fetch(
              `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
              {
                method: "PATCH",
                headers: requestHeaders,
                body: bodyPayload,
              },
            );
            if (!res.ok) {
              const errText = await res.text().catch(() => "");
              throw new Error(`Update failed: ${res.status} - ${errText}`);
            }
            await res.arrayBuffer();
            break;
          }

          case "MEDIA": {
            const res = await fetch(`${apiBaseUrl}/api/system/health`, {
              method: "HEAD",
              headers: requestHeaders,
            });
            if (!res.ok) throw new Error(`Media probe failed: ${res.status}`);
            break;
          }

          case "GQL": {
            const res = await fetch(`${apiBaseUrl}/api/graphql`, {
              method: "POST",
              headers: requestHeaders,
              body: gqlQueryString,
            });
            if (!res.ok) throw new Error(`GraphQL failed: ${res.status}`);
            await res.arrayBuffer();
            break;
          }
        }
      },
    });

    printTruthTable({
      title: "SVELTYCMS — PRODUCTION DAY AUDIT",
      shortLabel: "Day Audit",
      subtitle: `Mixed Workload (60% Read, 25% Write, 15% Other) • ${getDbLabel()}`,
      results: [{ ...results, layer: "Composite", shortLabel: "Day Flow" }],
    });

    printSummaryTable([
      { key: "Mixed Workload Latency (Avg)", val: results.avgMs, unit: "ms" },
      { key: "Mixed Workload Latency (p95)", val: results.p95Ms, unit: "ms" },
      { key: "System Throughput", val: results.rps, unit: "ops/s" },
      {
        key: "Reliability",
        val: (100 - (results.errorRate || 0)).toFixed(2),
        unit: "%",
      },
    ]);

    exportMetric("workflow.production_day.avg", results.avgMs, "ms");
    exportMetric("workflow.production_day.p95", results.p95Ms, "ms");
    exportMetric("workflow.production_day.rps", results.rps, "ops/s");
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
    }
  }
}

test("Production Day Lifecycle Suite", async () => {
  await runProductionDayAudit();
}, 600000);
