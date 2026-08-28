/**
 * @file tests/benchmarks/relational-performance.test.ts
 * @description GraphQL Relational Resolver Benchmark (Optimized)
 * @summary Measures GraphQL resolver performance for shallow listings, deep relational joins, and nested author population across cold/hot execution paths.
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

async function runRelationalAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Enterprise Relational Resolver Audit (${dbType})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;
    const graphqlEndpoint = `${baseUrl}/api/graphql`;

    await ensureStableTestData();
    await forceRefreshServer(baseUrl);
    await stabilize(1000);

    const graphQlHeaders: Record<string, string> = {
      "content-type": "application/json",
      ...benchmarkAuthHeaders(),
      "x-tenant-id": "global",
      connection: "keep-alive",
    };

    const shallowQuery = `{ allCollections { _id name } }`;
    const deepRelationalQuery = `{ BenchmarkPosts(limit: 5) { _id title author { _id name } } }`;

    const serializedShallow = JSON.stringify({ query: shallowQuery });
    const serializedDeep = JSON.stringify({ query: deepRelationalQuery });

    // ── 1. PRE-FLIGHT RELATIONAL STRUCTURE VERIFICATION ─────────────────────
    console.log("🔍 Verifying GraphQL Relational Execution & AST Validation...");
    const preflightRes = await fetch(graphqlEndpoint, {
      method: "POST",
      headers: graphQlHeaders,
      body: serializedDeep,
      signal: AbortSignal.timeout(10_000),
    });

    if (!preflightRes.ok) {
      throw new Error(`GraphQL endpoint returned HTTP ${preflightRes.status}`);
    }

    const preflightJson = (await preflightRes.json()) as any;
    if (preflightJson.errors?.length) {
      throw new Error(`GraphQL Pre-flight Error: ${preflightJson.errors[0].message}`);
    }

    const results: any[] = [];

    // ── 2. SHALLOW RELATIONAL QUERY (COLLECTION LISTING @ 6c) ───────────────
    forceGarbageCollection();
    await stabilize(150);

    console.log("   → 1. Measuring Shallow Query (Collection Listing @ 6c)...");
    const shallow = await runBenchmark({
      name: "Shallow Query (Collections)",
      iterations: 600,
      warmupIterations: 80,
      runs: 2,
      concurrency: 6,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(graphqlEndpoint, {
          method: "POST",
          headers: graphQlHeaders,
          body: serializedShallow,
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) throw new Error(`Shallow query HTTP ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...shallow, shortLabel: "Shallow", layer: "Collections" });

    // ── 3. COLD DEEP RELATIONAL JOIN (RESOLVER DB POPULATION) ───────────────
    forceGarbageCollection();
    await stabilize(150);

    console.log(
      "   → 2. Measuring Cold Deep Relational Query (Direct DB Join / AST Comment Nonce)...",
    );
    let coldNonce = 0;

    const coldDeep = await runBenchmark({
      name: "Deep Join (Cold DB)",
      iterations: 250,
      warmupIterations: 30,
      runs: 2,
      concurrency: 4,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const dynamicBody = JSON.stringify({
          query: `{ BenchmarkPosts(limit: 5) { _id title author { _id name } } } # nonce_${coldNonce++}`,
        });

        const res = await fetch(graphqlEndpoint, {
          method: "POST",
          headers: graphQlHeaders,
          body: dynamicBody,
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) throw new Error(`Cold deep query HTTP ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...coldDeep, shortLabel: "Deep (Cold)", layer: "DB Join" });

    // ── 4. WARM DEEP RELATIONAL QUERY (CACHED RESPONSE HIT @ 4c) ────────────
    forceGarbageCollection();
    await stabilize(150);

    console.log("   → 3. Measuring Warm Deep Relational Query (Steady-State Cache Hit)...");
    const warmDeep = await runBenchmark({
      name: "Deep Join (Warm Cached)",
      iterations: 500,
      warmupIterations: 60,
      runs: 2,
      concurrency: 4,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(graphqlEndpoint, {
          method: "POST",
          headers: graphQlHeaders,
          body: serializedDeep,
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) throw new Error(`Warm deep query HTTP ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...warmDeep, shortLabel: "Deep (Warm)", layer: "L1 Cache" });

    // ── 5. REPORTING & TELEMETRY ────────────────────────────────────────────
    const joinOverheadMs = Math.max(0, coldDeep.avgMs - shallow.avgMs);
    const cacheSpeedup = (coldDeep.avgMs / Math.max(warmDeep.avgMs, 0.001)).toFixed(1);

    printTruthTable({
      title: "SVELTYCMS — RELATIONAL RESOLVER AUDIT",
      shortLabel: "Relational",
      subtitle: `GraphQL Joins • Shallow vs Cold/Warm Deep Population • ${dbType}`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Shallow Query Latency", val: shallow.avgMs.toFixed(2), unit: "ms" },
        { key: "Cold Deep Join Latency", val: coldDeep.avgMs.toFixed(2), unit: "ms" },
        { key: "Warm Deep Join Latency", val: warmDeep.avgMs.toFixed(2), unit: "ms" },
        { key: "Relational Join Tax (Cold)", val: `+${joinOverheadMs.toFixed(2)}`, unit: "ms" },
        { key: "Cache Resolution Speedup", val: `${cacheSpeedup}×`, unit: "" },
        { key: "Shallow Throughput", val: Math.round(shallow.rps || 0), unit: "req/s" },
        { key: "Deep Cold Throughput", val: Math.round(coldDeep.rps || 0), unit: "req/s" },
        { key: "Peak Warm Throughput", val: Math.round(warmDeep.rps || 0), unit: "req/s" },
        {
          key: "Relational SLA",
          val: coldDeep.avgMs < 15 ? "ELITE (<15ms)" : coldDeep.avgMs < 30 ? "GOOD" : "SLOW",
          unit: "",
        },
      ],
      "Relational Resolver Summary",
    );

    exportMetric("graphql.relational.shallow_avg_ms", shallow.avgMs, "ms");
    exportMetric("graphql.relational.deep_cold_avg_ms", coldDeep.avgMs, "ms");
    exportMetric("graphql.relational.deep_warm_avg_ms", warmDeep.avgMs, "ms");
    exportMetric("graphql.relational.join_overhead_ms", joinOverheadMs, "ms");
    exportMetric("graphql.relational.cache_speedup", parseFloat(cacheSpeedup) || 1, "x");
    exportMetric("graphql.relational.peak_rps", Math.round(warmDeep.rps || 0), "req/s");

    for (const r of results) exportResult(r);
  } catch (err: any) {
    logger.error(`Relational benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Relational Resolver Performance", async () => {
  await runRelationalAudit();
}, 600_000);
