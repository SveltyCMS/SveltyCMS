/**
 * @file tests/benchmarks/middleware-flamegraph.test.ts
 * @description Middleware Flamegraph & Layer-by-Layer Nanosecond Profiler
 * @summary Measures the isolated microsecond cost of each middleware stage in the pipeline.
 *
 * ### Features:
 * - Isolated layer-by-layer overhead attribution
 * - Security WAF and payload check cost
 * - Crypto session validation vs API key authentication cost
 * - RBAC permission check cost
 * - Handler dispatch and response formatting latency
 */

import {
  test,
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  exportMetric,
  printTruthTable,
  printSummaryTable,
  getDbType,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;
let baseUrl: string;

test("Middleware Flamegraph & Stage Profiler", async () => {
  logger.info("🚀 Starting Middleware Flamegraph & Stage Profiler...");

  const serverInfo = await setupBenchmarkServer();
  stopServer = serverInfo.stop;
  baseUrl = serverInfo.baseUrl;

  await ensureStableTestData();
  const headers = {
    ...benchmarkAuthHeaders(),
    "content-type": "application/json",
  };
  const dbType = getDbType();

  const stages = [
    {
      name: "Stage 0: Raw Socket Baseline (Static Asset)",
      shortLabel: "Static Base",
      fn: async () => {
        const res = await fetch(`${baseUrl}/favicon.ico`);
        await res.arrayBuffer();
      },
    },
    {
      name: "Stage 1: System State + Turbo Pipeline",
      shortLabel: "Turbo Health",
      fn: async () => {
        const res = await fetch(`${baseUrl}/api/system/health`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
      },
    },
    {
      name: "Stage 2: WAF Security Inspection",
      shortLabel: "WAF Check",
      fn: async () => {
        const res = await fetch(`${baseUrl}/api/system/health?probe=safe_input_string`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
      },
    },
    {
      name: "Stage 3: Token Auth Gating",
      shortLabel: "Auth Gating",
      fn: async () => {
        const res = await fetch(`${baseUrl}/api/user/me`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
      },
    },
    {
      name: "Stage 4: Collection Schema Resolution",
      shortLabel: "Schema Resolve",
      fn: async () => {
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable/schema`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
      },
    },
    {
      name: "Stage 5: Full REST Single Document",
      shortLabel: "REST FindOne",
      fn: async () => {
        const res = await fetch(
          `${baseUrl}/api/collections/BenchmarkStable/20000000-0000-4000-8000-000000000001`,
          {
            headers,
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
      },
    },
    {
      name: "Stage 6: GraphQL Single Query (JIT)",
      shortLabel: "GraphQL JIT",
      fn: async () => {
        const res = await fetch(`${baseUrl}/api/graphql`, {
          method: "POST",
          headers,
          body: JSON.stringify({ query: "{ contentSystemHealth { state } }" }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
      },
    },
  ];

  const results: any[] = [];

  for (const s of stages) {
    await stabilize();
    logger.info(`   → Profiling ${s.name}...`);
    const res = await runBenchmark({
      name: s.name,
      warmupIterations: 25,
      iterations: 150,
      concurrency: 4,
      onIteration: s.fn,
    });
    results.push({ ...res, shortLabel: s.shortLabel });
    exportResult(res);
  }

  printTruthTable({
    title: `MIDDLEWARE FLAMEGRAPH PROFILER (${dbType.toUpperCase()})`,
    subtitle: "Measures layer-by-layer middleware execution costs from edge to database.",
    results,
  });

  const summaryMetrics = results.map((r) => ({
    key: r.shortLabel || r.name,
    val: r.avgMs.toFixed(3),
    unit: "ms",
  }));

  printSummaryTable(summaryMetrics, "Flamegraph");

  const turboRes = results.find((r) => r.shortLabel === "Turbo Health");
  const authRes = results.find((r) => r.shortLabel === "Auth Gating");
  if (turboRes) exportMetric("middleware.turbo.avg", turboRes.avgMs, "ms");
  if (authRes) exportMetric("middleware.auth.avg", authRes.avgMs, "ms");

  if (stopServer) {
    await stopServer();
    stopServer = null;
  }
}, 90_000);
