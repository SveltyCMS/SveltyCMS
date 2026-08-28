/**
 * @file tests/benchmarks/graphql-api-performance.test.ts
 * @description GraphQL API Performance Audit (Optimized)
 * @summary Measures GraphQL resolver performance across cold (cache-bypassed) and hot (response-cache hit) execution paths.
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
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

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
    name: "GQL: Parameterized Query",
    query: `query { BenchmarkStable(pagination: { limit: 10 }) { _id title count } }`,
    shortLabel: "ParamQuery",
    concurrency: 8,
  },
];

/**
 * High-performance GraphQL post handler with connection pooling and fast-path stream drainage.
 */
async function executeGraphQL(
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  retries = 3,
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) return res;

      // Drain error stream before retrying
      await res.arrayBuffer().catch(() => {});
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, (i + 1) * 40));
      }
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, (i + 1) * 40));
    }
  }
  throw new Error("GraphQL request failed after retries");
}

export async function runGraphQLBenchmark() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting GraphQL API Performance Audit (Cold + Hot • ${dbType})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;
    const graphqlEndpoint = `${baseUrl}/api/graphql`;

    const tenantId = process.env.TENANT_ID || "global";

    await ensureStableTestData();
    await forceRefreshServer(baseUrl);
    await stabilize(500);

    const requestHeaders: Record<string, string> = {
      "content-type": "application/json",
      ...benchmarkAuthHeaders(),
      "x-tenant-id": tenantId,
      connection: "keep-alive",
    };

    const allResults: any[] = [];

    for (const scenario of graphqlScenarios) {
      console.log(`   → Benchmarking ${scenario.name}...`);

      const baseQuery = scenario.query;
      const staticHotBody = JSON.stringify({ query: baseQuery });

      // Pre-flight sanity check on the query
      const verifyRes = await executeGraphQL(graphqlEndpoint, requestHeaders, staticHotBody);
      const verifyJson = (await verifyRes.json()) as any;
      if (verifyJson.errors?.length) {
        throw new Error(
          `GraphQL Pre-flight Error on ${scenario.name}: ${verifyJson.errors[0].message}`,
        );
      }

      // ── PHASE 1: COLD (CACHE-BYPASSED / DYNAMIC QUERY COMMENTS) ───────────
      forceGarbageCollection();
      await stabilize(150);

      console.log(`      🔬 Cold path (cache-bypassed via Document AST comment)...`);
      let coldNonce = 0;

      const coldResult = await runBenchmark({
        name: `${scenario.name} [cold]`,
        iterations: 300,
        warmupIterations: 40,
        runs: 2,
        concurrency: scenario.concurrency,
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          const dynamicBody = JSON.stringify({
            query: `${baseQuery} # cold_nonce_${coldNonce++}`,
          });
          const res = await executeGraphQL(graphqlEndpoint, requestHeaders, dynamicBody);

          if (!res.ok) throw new Error(`GraphQL Cold HTTP ${res.status}`);
          await res.arrayBuffer().catch(() => {});
        },
      });

      allResults.push({
        ...coldResult,
        shortLabel: scenario.shortLabel,
        layer: "GraphQL (cold)",
      });
      exportResult({ ...coldResult, shortLabel: scenario.shortLabel, layer: "GraphQL (cold)" });

      // ── PHASE 2: HOT (RESPONSE CACHE HIT) ─────────────────────────────────
      forceGarbageCollection();
      await stabilize(150);

      console.log(`      🔥 Hot path (cache-primed steady state)...`);

      // Prime response cache
      for (let p = 0; p < 5; p++) {
        const prime = await executeGraphQL(graphqlEndpoint, requestHeaders, staticHotBody);
        await prime.arrayBuffer().catch(() => {});
      }

      const hotResult = await runBenchmark({
        name: `${scenario.name} [hot]`,
        iterations: 600,
        warmupIterations: 50,
        runs: 3,
        concurrency: scenario.concurrency,
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          const res = await executeGraphQL(graphqlEndpoint, requestHeaders, staticHotBody);

          if (!res.ok) throw new Error(`GraphQL Hot HTTP ${res.status}`);
          await res.arrayBuffer().catch(() => {});
        },
      });

      allResults.push({
        ...hotResult,
        shortLabel: scenario.shortLabel,
        layer: "GraphQL (hot)",
      });
      exportResult({ ...hotResult, shortLabel: scenario.shortLabel, layer: "GraphQL (hot)" });
    }

    // ── REPORTING & TELEMETRY ───────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — GRAPHQL PERFORMANCE AUDIT",
      shortLabel: "GraphQL",
      subtitle: `Cold (JIT+DB) vs Hot (Cache Hit) • ${dbType}`,
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
    const coldParam = allResults.find(
      (r) => r.shortLabel === "ParamQuery" && r.layer === "GraphQL (cold)",
    );
    const hotParam = allResults.find(
      (r) => r.shortLabel === "ParamQuery" && r.layer === "GraphQL (hot)",
    );

    const collSpeedup =
      coldColl && hotColl && hotColl.avgMs > 0
        ? (coldColl.avgMs / hotColl.avgMs).toFixed(1)
        : "1.0";

    const paramSpeedup =
      coldParam && hotParam && hotParam.avgMs > 0
        ? (coldParam.avgMs / hotParam.avgMs).toFixed(1)
        : "1.0";

    const peakHotRps = Math.round(
      Math.max(hotHealth?.rps ?? 0, hotColl?.rps ?? 0, hotParam?.rps ?? 0),
    );

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        {
          key: "Health (Cold → Hot)",
          val: `${coldHealth?.avgMs.toFixed(2) ?? 0} → ${hotHealth?.avgMs.toFixed(2) ?? 0}`,
          unit: "ms",
        },
        {
          key: "Collections (Cold → Hot)",
          val: `${coldColl?.avgMs.toFixed(2) ?? 0} → ${hotColl?.avgMs.toFixed(2) ?? 0}`,
          unit: "ms",
        },
        { key: "Collections Cache Speedup", val: `${collSpeedup}×`, unit: "" },
        {
          key: "Param Query (Cold → Hot)",
          val: `${coldParam?.avgMs.toFixed(2) ?? 0} → ${hotParam?.avgMs.toFixed(2) ?? 0}`,
          unit: "ms",
        },
        { key: "Param Query Speedup", val: `${paramSpeedup}×`, unit: "" },
        { key: "Peak Hot Throughput", val: peakHotRps, unit: "req/s" },
      ],
      "GraphQL Performance Summary",
    );

    // Matrix dashboard metrics export
    if (hotColl) {
      exportMetric("api.graphql.avg", hotColl.avgMs, "ms");
      exportMetric("api.graphql.p95", hotColl.p95Ms || hotColl.avgMs, "ms");
      exportMetric("api.graphql.rps", hotColl.rps, "req/s");
    }
    if (coldColl) {
      exportMetric("api.graphql.cold.avg", coldColl.avgMs, "ms");
    }
    exportMetric("api.graphql.peak_rps", peakHotRps, "req/s");
  } catch (err: any) {
    logger.error(`GraphQL benchmark failed: ${err.message}`);
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
}, 600_000);
