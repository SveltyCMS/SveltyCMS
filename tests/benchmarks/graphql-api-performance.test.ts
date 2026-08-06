/**
 * @file tests/benchmarks/graphql-api-performance.test.ts
 * @description GraphQL API Performance Audit
 * @summary Measures GraphQL resolver performance across query scenarios,
 *          reporting both cold (cache-bypassed) and hot (cache-hit) latency.
 *
 * Cold path uses unique GraphQL comments (#) per iteration to change the
 * response-cache key while keeping JIT compilation identical (comments are
 * stripped from the Document AST by graphql-js parse).
 *
 * ### Features:
 * - Dual-mode: cold (JIT + DB, no response cache) vs hot (cache hit)
 * - Resolver-level latency profiling
 * - Query complexity throughput analysis
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  forceRefreshServer,
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

const graphqlScenarios = [
  {
    name: "GQL: System Health",
    query: `query { contentSystemHealth { state version collectionCount } }`,
    shortLabel: "Health",
    concurrency: 1,
  },
  {
    name: "GQL: Collection List",
    query: `query { allCollections { _id name } }`,
    shortLabel: "Collections",
    concurrency: 6,
  },
  {
    name: "GQL: Concurrent Load",
    query: `query { allCollections { _id name } __schema { types { name } } }`,
    shortLabel: "Load",
    concurrency: 5,
  },
];

async function graphqlPost(
  baseUrl: string,
  headers: Record<string, string>,
  bodyObj: Record<string, unknown>,
): Promise<Response> {
  let retries = 3;
  while (retries > 0) {
    try {
      return await fetch(`${baseUrl}/api/graphql`, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyObj),
      });
    } catch (err: any) {
      retries--;
      if (retries === 0) throw err;
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  return fetch(`${baseUrl}/api/graphql`, {
    method: "POST",
    headers,
    body: JSON.stringify(bodyObj),
  });
}

export async function runGraphQLBenchmark() {
  console.log("🚀 Starting GraphQL API Performance Audit (Cold + Hot)...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    const tenantId = process.env.TENANT_ID || "global";

    await ensureStableTestData();
    await forceRefreshServer(baseUrl);
    await stabilize(1200);

    const requestHeaders: Record<string, string> = {
      "content-type": "application/json",
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
      "x-tenant-id": tenantId,
    };

    const allResults: any[] = [];

    for (const scenario of graphqlScenarios) {
      console.log(`   → ${scenario.name}...`);

      const baseQuery = scenario.query;

      // ── Phase 1: Cold (cache-bypassed) — unique comment per iteration ──
      console.log(`      Cold (cache-bypassed)...`);
      let coldNonce = 0;
      const coldResult = await runBenchmark({
        name: `${scenario.name} [cold]`,
        iterations: 300,
        warmupIterations: 40,
        runs: 2,
        concurrency: scenario.concurrency,
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          // Append unique comment to change raw query string hash (cache key)
          // while graphql-js parse strips it — same JIT compilation, different cache key
          const query = `${baseQuery} # n:${coldNonce++}`;
          const res = await graphqlPost(baseUrl, requestHeaders, { query });
          if (!res.ok) {
            const text = await res.text().catch(() => "unreadable");
            throw new Error(`GraphQL HTTP ${res.status}: ${text}`);
          }
          const parsed = await res.json();
          if (parsed.errors?.length) {
            throw new Error(`GraphQL Error: ${parsed.errors[0].message}`);
          }
        },
      });

      allResults.push({
        ...coldResult,
        shortLabel: scenario.shortLabel,
        layer: "GraphQL (cold)",
      });
      exportResult({ ...coldResult, shortLabel: scenario.shortLabel, layer: "GraphQL (cold)" });

      // ── Phase 2: Hot (cache-hit) — prime cache, then benchmark ──
      console.log(`      Hot (cache-primed)...`);

      // Prime the response cache with identical queries
      for (let w = 0; w < 3; w++) {
        try {
          await graphqlPost(baseUrl, requestHeaders, { query: baseQuery });
        } catch {}
      }
      await stabilize(100);

      const hotResult = await runBenchmark({
        name: `${scenario.name} [hot]`,
        iterations: 600,
        warmupIterations: 40,
        runs: 3,
        concurrency: scenario.concurrency,
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          const res = await graphqlPost(baseUrl, requestHeaders, { query: baseQuery });
          if (!res.ok) {
            const text = await res.text().catch(() => "unreadable");
            throw new Error(`GraphQL HTTP ${res.status}: ${text}`);
          }
          const parsed = await res.json();
          if (parsed.errors?.length) {
            throw new Error(`GraphQL Error: ${parsed.errors[0].message}`);
          }
        },
      });

      allResults.push({
        ...hotResult,
        shortLabel: scenario.shortLabel,
        layer: "GraphQL (hot)",
      });
      exportResult({ ...hotResult, shortLabel: scenario.shortLabel, layer: "GraphQL (hot)" });
    }

    // ── Reporting ──────────────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — GRAPHQL PERFORMANCE AUDIT",
      shortLabel: "GraphQL",
      subtitle: `Cold (JIT+DB) vs Hot (Cache Hit) • ${getDbType().toUpperCase()}`,
      results: allResults,
    });

    const coldHealth = allResults.find(
      (r) => r.shortLabel === "Health" && r.layer === "GraphQL (cold)",
    );
    const hotHealth = allResults.find(
      (r) => r.shortLabel === "Health" && r.layer === "GraphQL (hot)",
    );
    const coldColl = allResults.find(
      (r) => r.shortLabel === "Collections" && r.layer === "GraphQL (cold)",
    );
    const hotColl = allResults.find(
      (r) => r.shortLabel === "Collections" && r.layer === "GraphQL (hot)",
    );
    const coldLoad = allResults.find(
      (r) => r.shortLabel === "Load" && r.layer === "GraphQL (cold)",
    );
    const hotLoad = allResults.find((r) => r.shortLabel === "Load" && r.layer === "GraphQL (hot)");

    printSummaryTable([
      { key: "Health (cold)", val: coldHealth?.avgMs ?? 0, unit: "ms" },
      { key: "Health (hot)", val: hotHealth?.avgMs ?? 0, unit: "ms" },
      { key: "Collection List (cold)", val: coldColl?.avgMs ?? 0, unit: "ms" },
      { key: "Collection List (hot)", val: hotColl?.avgMs ?? 0, unit: "ms" },
      { key: "Concurrent Load (cold)", val: coldLoad?.avgMs ?? 0, unit: "ms" },
      { key: "Concurrent Load (hot)", val: hotLoad?.avgMs ?? 0, unit: "ms" },
      {
        key: "Peak RPS (hot)",
        val: Math.round(Math.max(hotHealth?.rps ?? 0, hotColl?.rps ?? 0, hotLoad?.rps ?? 0)),
        unit: "req/s",
      },
      {
        key: "Cache Speedup",
        val:
          coldColl && hotColl
            ? `${(coldColl.avgMs / Math.max(hotColl.avgMs, 0.01)).toFixed(1)}x`
            : "N/A",
        unit: "",
      },
    ]);

    // Export metrics for matrix dashboard
    const mainResult = hotColl!;
    exportMetric("api.graphql.avg", mainResult.avgMs, "ms");
    exportMetric("api.graphql.p95", mainResult.p95Ms || mainResult.avgMs, "ms");
    exportMetric("api.graphql.rps", mainResult.rps, "req/s");
    if (coldColl) {
      exportMetric("api.graphql.cold.avg", coldColl.avgMs, "ms");
    }
  } catch (err: any) {
    logger.error(`GraphQL benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("GraphQL Performance Audit Suite", async () => {
  await runGraphQLBenchmark();
}, 600000);
