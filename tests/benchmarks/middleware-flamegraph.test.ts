/**
 * @file tests/benchmarks/middleware-flamegraph.test.ts
 * @description Middleware Flamegraph & Layer-by-Layer Nanosecond Profiler (Optimized)
 * @summary Measures isolated microsecond cost and incremental deltas of each middleware stage from edge to database.
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

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

test("Middleware Flamegraph & Stage Profiler", async () => {
  logger.info("🚀 Starting Middleware Flamegraph & Stage Profiler...");

  try {
    const serverInfo = await setupBenchmarkServer();
    stopServer = serverInfo.stop;
    baseUrl = serverInfo.baseUrl;

    await ensureStableTestData();
    await stabilize(1000);

    const baseHeaders: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
      connection: "keep-alive",
    };
    const dbType = getDbType().toUpperCase();

    // Pre-allocated static URLs
    const staticAssetUrl = `${baseUrl}/favicon.ico`;
    const healthUrl = `${baseUrl}/api/system/health`;
    const wafProbeUrl = `${baseUrl}/api/system/health?probe=safe_input_string`;
    const userMeUrl = `${baseUrl}/api/user/me`;
    const schemaUrl = `${baseUrl}/api/collections/BenchmarkStable/schema`;
    const restDocUrl = `${baseUrl}/api/collections/BenchmarkStable/20000000-0000-4000-8000-000000000001`;
    const graphqlUrl = `${baseUrl}/api/graphql`;

    // Pre-serialized GraphQL request body
    const gqlBody = JSON.stringify({ query: "{ contentSystemHealth { state } }" });

    const stages = [
      {
        name: "Stage 0: Raw Socket Baseline (Static Asset)",
        shortLabel: "0. Static Base",
        fn: async () => {
          const res = await fetch(staticAssetUrl, {
            signal: AbortSignal.timeout(5000),
          });
          await res.arrayBuffer().catch(() => {});
        },
      },
      {
        name: "Stage 1: System State + Turbo Pipeline",
        shortLabel: "1. Turbo Health",
        fn: async () => {
          const res = await fetch(healthUrl, {
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await res.arrayBuffer().catch(() => {});
        },
      },
      {
        name: "Stage 2: WAF Security Inspection",
        shortLabel: "2. WAF Check",
        fn: async () => {
          const res = await fetch(wafProbeUrl, {
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await res.arrayBuffer().catch(() => {});
        },
      },
      {
        name: "Stage 3: Token Auth Gating",
        shortLabel: "3. Auth Gate",
        fn: async () => {
          const res = await fetch(userMeUrl, {
            headers: baseHeaders,
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await res.arrayBuffer().catch(() => {});
        },
      },
      {
        name: "Stage 4: Collection Schema Resolution",
        shortLabel: "4. Schema Resolve",
        fn: async () => {
          const res = await fetch(schemaUrl, {
            headers: baseHeaders,
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await res.arrayBuffer().catch(() => {});
        },
      },
      {
        name: "Stage 5: Full REST Single Document",
        shortLabel: "5. REST FindOne",
        fn: async () => {
          const res = await fetch(restDocUrl, {
            headers: baseHeaders,
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await res.arrayBuffer().catch(() => {});
        },
      },
      {
        name: "Stage 6: GraphQL Single Query (JIT)",
        shortLabel: "6. GraphQL JIT",
        fn: async () => {
          const res = await fetch(graphqlUrl, {
            method: "POST",
            headers: baseHeaders,
            body: gqlBody,
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await res.arrayBuffer().catch(() => {});
        },
      },
    ];

    const results: any[] = [];

    for (const s of stages) {
      forceGarbageCollection();
      await stabilize(150);

      logger.info(`   → Profiling ${s.name}...`);
      const res = await runBenchmark({
        name: s.name,
        warmupIterations: 30,
        iterations: 200,
        runs: 2,
        concurrency: 4,
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onIteration: s.fn,
      });

      const enriched = { ...res, shortLabel: s.shortLabel, layer: "Middleware" };
      results.push(enriched);
      exportResult(enriched);
    }

    // ── DIFFERENTIAL STACK PROFILING (LAYER-BY-LAYER ATTRIBUTION) ───────────
    printTruthTable({
      title: `MIDDLEWARE FLAMEGRAPH PROFILER (${dbType})`,
      shortLabel: "Flamegraph",
      subtitle: "Layer-by-layer middleware execution costs from edge to database.",
      results,
    });

    const staticBase = results[0]?.avgMs ?? 0;
    const turboHealth = results[1]?.avgMs ?? 0;
    const wafCheck = results[2]?.avgMs ?? 0;
    const authGate = results[3]?.avgMs ?? 0;
    const schemaResolve = results[4]?.avgMs ?? 0;
    const restFind = results[5]?.avgMs ?? 0;
    const gqlJit = results[6]?.avgMs ?? 0;

    const summaryMetrics = [
      { key: "Database Engine", val: dbType, unit: "" },
      { key: "Stage 0: Socket Baseline", val: staticBase.toFixed(3), unit: "ms" },
      {
        key: "Stage 1: Turbo Pipeline Overhead",
        val: `+${Math.max(0, turboHealth - staticBase).toFixed(3)}`,
        unit: "ms",
      },
      {
        key: "Stage 2: WAF Parameter Scan",
        val: `+${Math.max(0, wafCheck - turboHealth).toFixed(3)}`,
        unit: "ms",
      },
      {
        key: "Stage 3: Auth Validation Overhead",
        val: `+${Math.max(0, authGate - wafCheck).toFixed(3)}`,
        unit: "ms",
      },
      {
        key: "Stage 4: Schema Resolution Delta",
        val: `+${Math.max(0, schemaResolve - authGate).toFixed(3)}`,
        unit: "ms",
      },
      {
        key: "Stage 5: REST DB FindOne Cost",
        val: `+${Math.max(0, restFind - schemaResolve).toFixed(3)}`,
        unit: "ms",
      },
      {
        key: "Stage 6: GraphQL AST JIT Overhead",
        val: `+${Math.max(0, gqlJit - authGate).toFixed(3)}`,
        unit: "ms",
      },
    ];

    printSummaryTable(summaryMetrics, "Flamegraph Breakdown");

    exportMetric("flamegraph.static_base_ms", staticBase, "ms");
    exportMetric("flamegraph.turbo_overhead_ms", Math.max(0, turboHealth - staticBase), "ms");
    exportMetric("flamegraph.waf_overhead_ms", Math.max(0, wafCheck - turboHealth), "ms");
    exportMetric("flamegraph.auth_overhead_ms", Math.max(0, authGate - wafCheck), "ms");
    exportMetric("flamegraph.rest_total_ms", restFind, "ms");
    exportMetric("flamegraph.graphql_total_ms", gqlJit, "ms");
  } catch (err: any) {
    logger.error(`Flamegraph benchmark failed: ${err.message}`);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}, 90_000);
