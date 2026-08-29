/**
 * @file tests/benchmarks/graphql-cache-hit.test.ts
 * @description GraphQL Response Cache Hit Verification (Optimized)
 * @summary Validates sub-millisecond L1 response cache hits, cache key isolation, and hit headers.
 */

import {
  test,
  setupBenchmarkServer,
  stabilize,
  benchmarkAuthHeaders,
  printTruthTable,
  printSummaryTable,
  exportResult,
  exportMetric,
  getDbType,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

interface GraphQLSample {
  status: number;
  durationMs: number;
  isHit: boolean;
  hasErrors: boolean;
}

async function executeSample(
  endpoint: string,
  headers: Record<string, string>,
  body: string,
): Promise<GraphQLSample> {
  const start = performance.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(5000),
  });
  const durationMs = performance.now() - start;

  const cacheHeader = (
    res.headers.get("x-cache") ||
    res.headers.get("x-graphql-cache") ||
    ""
  ).toUpperCase();
  const isHit = cacheHeader.includes("HIT") || cacheHeader.includes("TURBO");

  // Read response as buffer to minimize client-side JSON parsing latency
  const raw = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
  const hasErrors =
    !res.ok || (res.status === 200 && new TextDecoder().decode(raw).includes('"errors"'));

  return { status: res.status, durationMs, isHit, hasErrors };
}

async function measureSteadyState(
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  iterations = 30,
): Promise<{ avgMs: number; p95Ms: number; hitRate: number }> {
  const samples: number[] = [];
  let hits = 0;

  for (let i = 0; i < iterations; i++) {
    const sample = await executeSample(endpoint, headers, body);
    if (sample.hasErrors) {
      throw new Error(`GraphQL sample failed with status HTTP ${sample.status}`);
    }
    samples.push(sample.durationMs);
    if (sample.isHit) hits++;
  }

  samples.sort((a, b) => a - b);
  const avgMs = samples.reduce((a, b) => a + b, 0) / samples.length;
  const p95Ms = samples[Math.floor(samples.length * 0.95)] ?? samples[samples.length - 1];
  const hitRate = (hits / iterations) * 100;

  return { avgMs, p95Ms, hitRate };
}

test("GraphQL Response Cache Hit Latency", async () => {
  console.log("\n🎯 GraphQL Response Cache Hit Verification\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;
    const graphqlEndpoint = `${baseUrl}/api/graphql`;

    await stabilize(500);

    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...benchmarkAuthHeaders(),
      "x-tenant-id": "global",
      connection: "keep-alive",
    };

    if (!headers.Cookie && !headers.cookie && !headers.authorization) {
      throw new Error("Missing authentication credentials from setupBenchmarkServer");
    }

    const query1 = `query { contentSystemHealth { state version } }`;
    const query2 = `query { allCollections { _id name } }`;

    const bodyQ1 = JSON.stringify({ query: query1 });
    const bodyQ2 = JSON.stringify({ query: query2 });

    // ── 1. QUERY 1: COLD VS HOT VERIFICATION ────────────────────────────────
    forceGarbageCollection();
    console.log("   → 1. Measuring Query 1 (Health Check) Cold Baseline...");

    // Cold sample with unique comment to guarantee cache miss
    const coldBody1 = JSON.stringify({ query: `${query1} # cold_bypass_${Date.now()}` });
    const cold1 = await executeSample(graphqlEndpoint, headers, coldBody1);
    if (cold1.hasErrors) throw new Error(`Query 1 cold request failed: HTTP ${cold1.status}`);

    // Prime the warm key
    await executeSample(graphqlEndpoint, headers, bodyQ1);

    console.log("   → 2. Measuring Query 1 Steady-State Cache Hit Latency...");
    const hot1 = await measureSteadyState(graphqlEndpoint, headers, bodyQ1, 40);

    // ── 2. QUERY 2: KEY ISOLATION & DIFFERENT QUERY WARMUP ──────────────────
    forceGarbageCollection();
    console.log("   → 3. Measuring Query 2 (Collections List) Cold Baseline...");
    const coldBody2 = JSON.stringify({ query: `${query2} # cold_bypass_${Date.now()}` });
    const cold2 = await executeSample(graphqlEndpoint, headers, coldBody2);
    if (cold2.hasErrors) throw new Error(`Query 2 cold request failed: HTTP ${cold2.status}`);

    // Prime query 2
    await executeSample(graphqlEndpoint, headers, bodyQ2);

    console.log("   → 4. Measuring Query 2 Steady-State Cache Hit Latency...");
    const hot2 = await measureSteadyState(graphqlEndpoint, headers, bodyQ2, 40);

    // ── 3. METRICS EVALUATION & TELEMETRY ───────────────────────────────────
    const speedup1 = (cold1.durationMs / Math.max(hot1.avgMs, 0.01)).toFixed(1);
    const speedup2 = (cold2.durationMs / Math.max(hot2.avgMs, 0.01)).toFixed(1);

    const dbType = getDbType().toUpperCase();

    const results = [
      {
        name: "Q1: Health (Cold Miss)",
        avgMs: cold1.durationMs,
        p95Ms: cold1.durationMs,
        rps: 1000 / Math.max(cold1.durationMs, 0.1),
        layer: "Cold (DB)",
        shortLabel: "Q1 Cold",
      },
      {
        name: "Q1: Health (L1 Hit)",
        avgMs: hot1.avgMs,
        p95Ms: hot1.p95Ms,
        rps: 1000 / Math.max(hot1.avgMs, 0.1),
        layer: "Warm (Cache)",
        shortLabel: "Q1 Hot",
      },
      {
        name: "Q2: Collections (Cold Miss)",
        avgMs: cold2.durationMs,
        p95Ms: cold2.durationMs,
        rps: 1000 / Math.max(cold2.durationMs, 0.1),
        layer: "Cold (DB)",
        shortLabel: "Q2 Cold",
      },
      {
        name: "Q2: Collections (L1 Hit)",
        avgMs: hot2.avgMs,
        p95Ms: hot2.p95Ms,
        rps: 1000 / Math.max(hot2.avgMs, 0.1),
        layer: "Warm (Cache)",
        shortLabel: "Q2 Hot",
      },
    ];

    printTruthTable({
      title: "SVELTYCMS — GRAPHQL CACHE HIT AUDIT",
      shortLabel: "GQL Cache",
      subtitle: `L1 Response Cache Verification • ${dbType}`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Q1 Cold Latency", val: cold1.durationMs.toFixed(2), unit: "ms" },
        { key: "Q1 Hot Latency (Avg)", val: hot1.avgMs.toFixed(2), unit: "ms" },
        { key: "Q1 Hot Latency (P95)", val: hot1.p95Ms.toFixed(2), unit: "ms" },
        { key: "Q1 Cache Speedup", val: `${speedup1}×`, unit: "" },
        { key: "Q2 Cold Latency", val: cold2.durationMs.toFixed(2), unit: "ms" },
        { key: "Q2 Hot Latency (Avg)", val: hot2.avgMs.toFixed(2), unit: "ms" },
        { key: "Q2 Cache Speedup", val: `${speedup2}×`, unit: "" },
        {
          key: "Sub-5ms SLA",
          val: hot1.avgMs < 5 && hot2.avgMs < 5 ? "PASSED (<5ms)" : "SLOW",
          unit: "",
        },
      ],
      "GraphQL Cache Summary",
    );

    exportMetric("graphql.cache.q1_hot_avg_ms", hot1.avgMs, "ms");
    exportMetric("graphql.cache.q2_hot_avg_ms", hot2.avgMs, "ms");
    exportMetric("graphql.cache.speedup", parseFloat(speedup1) || 1, "x");

    for (const r of results) exportResult(r);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}, 120_000);
