/**
 * @file tests/benchmarks/production-day.test.ts
 * @description 🚀 "Production Day in the Life" Composite Benchmark.
 * Simulates a realistic multi-user workload with a weighted mix of operations.
 */

import {
  test,
  runBenchmark,
  exportMetric,
  setupBenchmarkServer,
  STABLE_COLLECTION,
  STABLE_ENTRY_ID,
  ensureStableTestData,
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
    // Ensure baseline data exists
    const { getDb, ensureFullInitialization } = await import("@src/databases/db");
    await ensureFullInitialization();
    const db = getDb();
    if (!db) throw new Error("DB Initialization Failed");
    await ensureStableTestData(db);

    const headers = {
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
      "Content-Type": "application/json",
    };

    const scenarios = [
      { name: "Public Read (List)", weight: 0.4, type: "READ_LIST" },
      { name: "Public Read (Entry)", weight: 0.2, type: "READ_ENTRY" },
      { name: "Editor Update (Patch)", weight: 0.25, type: "UPDATE" },
      { name: "Media Probe (Head)", weight: 0.1, type: "MEDIA" },
      { name: "GraphQL Search", weight: 0.05, type: "GQL" },
    ];

    const results = await runBenchmark({
      name: "Production Day @ 8c",
      iterations: 500,
      warmupIterations: 100,
      concurrency: 8,
      thinkTimeMs: [50, 200], // Realistic think time between actions
      onIteration: async (i: number) => {
        const rand = Math.random();
        let cumulativeWeight = 0;
        let selected: any = scenarios[0];

        for (const s of scenarios) {
          cumulativeWeight += s.weight;
          if (rand < cumulativeWeight) {
            selected = s;
            break;
          }
        }

        const traceId = `day-${i}-${selected.type}`;
        const requestHeaders = { ...headers, "x-request-id": traceId };

        switch (selected.type) {
          case "READ_LIST":
            const lRes = await fetch(
              `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}?limit=10`,
              {
                headers: requestHeaders,
              },
            );
            if (!lRes.ok) throw new Error(`List failed: ${lRes.status}`);
            await lRes.json();
            break;

          case "READ_ENTRY":
            const vRes = await fetch(
              `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
              {
                headers: requestHeaders,
              },
            );
            if (!vRes.ok) throw new Error(`View failed: ${vRes.status}`);
            await vRes.json();
            break;

          case "UPDATE":
            const payload = generateRealisticEntry(i, "medium");
            const sRes = await fetch(
              `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
              {
                method: "PATCH",
                headers: requestHeaders,
                body: JSON.stringify(payload),
              },
            );
            if (!sRes.ok) {
              const errText = await sRes.text();
              console.error(`[Benchmark] Update failed: ${sRes.status} - ${errText}`);
              throw new Error(`Update failed: ${sRes.status} - ${errText}`);
            }
            await sRes.json();
            break;

          case "MEDIA":
            const mRes = await fetch(`${apiBaseUrl}/api/system/health`, {
              method: "HEAD",
              headers: requestHeaders,
            });
            if (!mRes.ok) throw new Error(`Media probe failed: ${mRes.status}`);
            break;

          case "GQL":
            const gqlQuery = {
              query: `query { entries(collection: "${STABLE_COLLECTION}", limit: 5) { _id title } }`,
            };
            const gRes = await fetch(`${apiBaseUrl}/api/graphql`, {
              method: "POST",
              headers: requestHeaders,
              body: JSON.stringify(gqlQuery),
            });
            if (!gRes.ok) throw new Error(`GraphQL failed: ${gRes.status}`);
            await gRes.json();
            break;
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
      { key: "Reliability", val: 100 - (results.errorRate || 0), unit: "%" },
    ]);

    exportMetric("workflow.production_day.avg", results.avgMs, "ms");
    exportMetric("workflow.production_day.p95", results.p95Ms, "ms");
    exportMetric("workflow.production_day.rps", results.rps, "ops/s");

    console.log("\n✅ Production day audit completed.");
  } finally {
    if (stopServer) {
      await stopServer();
    }
  }
}

test("Production Day Lifecycle Suite", async () => {
  await runProductionDayAudit();
}, 600000); // 10 minutes
