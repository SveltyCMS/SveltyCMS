/**
 * @file tests/benchmarks/hooks-performance.test.ts
 * @description Hooks & Middleware Performance Benchmark (Optimized)
 * @summary Measures the cost of the full middleware chain including Turbo, Security, Auth, and Audit via HTTP E2E.
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
import crypto from "node:crypto";

let stopServer: (() => Promise<void>) | null = null;
let baseUrl: string;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

const middlewareScenarios = [
  {
    name: "Static Asset (No Middleware)",
    shortLabel: "Static",
    path: "/favicon.ico",
    method: "GET",
    concurrency: 12,
  },
  {
    name: "Turbo Pipeline (Light)",
    shortLabel: "Turbo",
    path: "/api/system/health",
    method: "GET",
    concurrency: 12,
  },
  {
    name: "Full Security + Auth Pipeline",
    shortLabel: "Auth+Security",
    path: "/api/collections/BenchmarkStable/20000000-0000-4000-8000-000000000001",
    method: "GET",
    concurrency: 8,
  },
  {
    name: "REST with API Caching",
    shortLabel: "API+Cache",
    path: "/api/collections/BenchmarkStable?limit=1",
    method: "GET",
    concurrency: 8,
  },
  {
    name: "Mutation + Audit Logging",
    shortLabel: "Audit",
    path: "/api/collections/BenchmarkStable",
    method: "POST",
    concurrency: 1,
  },
];

function isAuditEnabled(): boolean {
  return process.env.BENCHMARK_AUDIT_MODE === "compliance";
}

async function runHooksAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Enterprise Hooks & Middleware Audit (${dbType})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(1000);

    const results = [];
    const compStats: Array<{ orig: number; comp: number; ratio: number }> = [];

    const baseHeaders: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
      "x-tenant-id": "global",
      connection: "keep-alive",
    };

    const isSqlite = dbType.includes("SQLITE");
    const isMongo = dbType.includes("MONGO");

    const baseIterationsHttp = isSqlite ? 150 : isMongo ? 600 : 250;
    const baseIterationsPost = isSqlite ? 60 : isMongo ? 150 : 80;
    const maxTotalRuns = isSqlite ? 2 : 2;

    // Pre-calculate payload capacity and generate monotonic JSON payloads
    const warmupCount = isSqlite ? 10 : 30;
    const totalPayloadCapacityNeeded = (baseIterationsPost + warmupCount) * maxTotalRuns * 2;
    const postPayloads = Array.from({ length: totalPayloadCapacityNeeded }, (_, idx) =>
      JSON.stringify({
        _id: crypto.randomUUID(),
        title: `Middleware Audit Entry ${idx}`,
      }),
    );

    let globalPayloadCounter = 0;

    for (let s = 0; s < middlewareScenarios.length; s++) {
      const scenario = middlewareScenarios[s]!;
      const auditEnabled = isAuditEnabled();
      const isPostAction = scenario.method === "POST";

      const scenarioName =
        scenario.shortLabel === "Audit" && !auditEnabled
          ? "Mutation (audit logging disabled)"
          : scenario.name;
      const shortLabel =
        scenario.shortLabel === "Audit" && !auditEnabled ? "Mutation" : scenario.shortLabel;

      console.log(`   → Benchmarking ${scenarioName}...`);

      const currentIterations = isPostAction ? baseIterationsPost : baseIterationsHttp;
      const targetConcurrency = isSqlite ? 1 : Math.min(scenario.concurrency, 4);
      const requestUrl = `${baseUrl}${scenario.path}`;

      // Isolate each scenario with garbage collection and socket draining
      forceGarbageCollection();
      await stabilize(150);

      const result = await runBenchmark({
        name: scenarioName,
        iterations: currentIterations,
        warmupIterations: isSqlite ? 10 : 30,
        runs: maxTotalRuns,
        concurrency: targetConcurrency,
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          const body = isPostAction
            ? postPayloads[globalPayloadCounter++ % postPayloads.length]
            : undefined;

          const res = await fetch(requestUrl, {
            method: scenario.method,
            headers: baseHeaders,
            body,
            signal: AbortSignal.timeout(10000),
          });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`${scenario.name} failed: HTTP ${res.status} ${text}`);
          }

          // Sample compression telemetry if headers are present
          if (compStats.length < 50) {
            const oSize = res.headers.get("x-original-size");
            const cSize = res.headers.get("x-compressed-size");
            const ratio = res.headers.get("x-compression-ratio");
            if (oSize && cSize) {
              compStats.push({
                orig: parseInt(oSize, 10),
                comp: parseInt(cSize, 10),
                ratio: parseFloat(ratio || "0"),
              });
            }
          }

          await res.arrayBuffer().catch(() => {});
        },
      });

      const enriched = {
        ...result,
        shortLabel,
        layer: "Middleware",
      };

      results.push(enriched);
      exportResult(enriched);
    }

    // ── COMPRESSION TELEMETRY ───────────────────────────────────────────────
    if (compStats.length > 0) {
      const avgOrig = compStats.reduce((sum, x) => sum + x.orig, 0) / compStats.length;
      const avgComp = compStats.reduce((sum, x) => sum + x.comp, 0) / compStats.length;
      const avgRatio = compStats.reduce((sum, x) => sum + x.ratio, 0) / compStats.length;

      exportMetric("compression.samples", compStats.length, "");
      exportMetric("compression.avg_original_bytes", Math.round(avgOrig), "B");
      exportMetric("compression.avg_compressed_bytes", Math.round(avgComp), "B");
      exportMetric("compression.avg_ratio", parseFloat(avgRatio.toFixed(2)), "%");
    }

    const staticAsset = results[0]!;
    const turbo = results[1]!;
    const full = results[2]!;
    const cached = results[3]!;
    const audit = results[4]!;

    const authOverhead = Math.max(0, full.avgMs - turbo.avgMs);
    const cacheOverhead = cached.avgMs - full.avgMs;
    const auditOverhead = Math.max(0, audit.avgMs - full.avgMs);

    exportMetric("middleware.hooks.full_p95", full.p95Ms, "ms");
    exportMetric("middleware.hooks.full_avg", full.avgMs, "ms");
    exportMetric("middleware.hooks.auth_overhead_ms", authOverhead, "ms");

    // ── REPORTING & TELEMETRY ───────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — MIDDLEWARE & HOOKS AUDIT",
      shortLabel: "Hooks",
      subtitle: `Static • Turbo • Auth • API Cache • Audit • ${dbType}`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Static Asset (No Hooks)", val: staticAsset.avgMs.toFixed(2), unit: "ms" },
        { key: "Turbo Pipeline Latency", val: turbo.avgMs.toFixed(2), unit: "ms" },
        { key: "Full Auth+Security Pipeline", val: full.avgMs.toFixed(2), unit: "ms" },
        { key: "Auth Overhead (Turbo → Full)", val: `+${authOverhead.toFixed(2)}`, unit: "ms" },
        {
          key: "API Cache Delta",
          val: `${cacheOverhead >= 0 ? "+" : ""}${cacheOverhead.toFixed(2)}`,
          unit: "ms",
        },
        {
          key: isAuditEnabled() ? "Audit Logging Overhead" : "Mutation Overhead (Audit Off)",
          val: `+${auditOverhead.toFixed(2)}`,
          unit: "ms",
        },
        {
          key: "Peak Pipeline RPS",
          val: Math.round(Math.max(...results.map((r) => r.rps || 0))),
          unit: "req/s",
        },
      ],
      "Middleware Summary",
    );
  } catch (err: any) {
    logger.error(`Hooks benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Hooks & Middleware Enterprise Audit", async () => {
  await runHooksAudit();
}, 480_000);
