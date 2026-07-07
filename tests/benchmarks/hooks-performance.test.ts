/**
 * @file tests/benchmarks/hooks-performance.test.ts
 * @description Hooks & Middleware Performance Benchmark (Fixed Collision)
 * @summary Measures the cost of the full middleware chain including Turbo, Security, Auth, and Audit via HTTP E2E.
 *
 * ### Features:
 * - Layer-by-layer middleware cost attribution
 * - Static asset baseline vs full pipeline comparison
 * - Security and auth overhead profiling
 * - End-to-end middleware stack latency analysis
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
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";
import crypto from "node:crypto";

let stopServer: (() => Promise<void>) | null = null;
let baseUrl: string;

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
    path: "/api/collections/BenchmarkStable/bench-shared-001",
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

async function runHooksAudit() {
  console.log("🚀 Starting Enterprise Hooks & Middleware Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(3000);

    const secret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";
    const results = [];
    const compStats: Array<{
      orig: number | null;
      comp: number | null;
      ratio: string | null;
    }> = [];

    const baseHeaders = {
      "x-test-mode": "true",
      "x-test-secret": secret,
      "content-type": "application/json",
      "x-tenant-id": "global",
    };

    const dbType = (process.env.DB_TYPE ?? "sqlite").toLowerCase();
    const isSqlite = dbType.includes("sqlite");
    const isMongo = dbType === "mongodb";

    const baseIterationsHttp = isSqlite ? 20 : isMongo ? 600 : 200;
    const baseIterationsPost = isSqlite ? 10 : isMongo ? 150 : 50;
    const maxTotalRuns = isSqlite ? 1 : isMongo ? 3 : 1;

    // 🚀 FIXED: Pre-allocate an oversized array of unique UUID records to protect
    // against cross-run index collision when warmup + multiple runs exhaust the pool.
    const totalPayloadCapacityNeeded = baseIterationsPost * maxTotalRuns * 2;
    const postPayloads = Array.from({ length: totalPayloadCapacityNeeded }, () =>
      JSON.stringify({
        _id: crypto.randomUUID(),
        title: "Middleware Audit Test Entry",
      }),
    );

    // Keep track of an internal counter across runs to safely pull unique payloads
    let globalPayloadCounter = 0;

    for (let s = 0; s < middlewareScenarios.length; s++) {
      const scenario = middlewareScenarios[s]!;
      console.log(`    → ${scenario.name}...`);

      const currentIterations =
        scenario.method === "POST" ? baseIterationsPost : baseIterationsHttp;
      const targetConcurrency = isSqlite
        ? 1
        : isMongo
          ? scenario.concurrency
          : Math.min(scenario.concurrency, 4);

      const requestConfig = {
        method: scenario.method,
        headers: baseHeaders,
        body: null as string | null,
      };

      const requestUrl = `${baseUrl}${scenario.path}`;
      const isPostAction = scenario.method === "POST";

      const result = await runBenchmark({
        name: scenario.name,
        iterations: currentIterations,
        warmupIterations: isSqlite ? 5 : 60,
        runs: maxTotalRuns,
        concurrency: targetConcurrency,
        trimOutliers: "iqr",
        silent: true,
        onIteration: async () => {
          let currentConfig = requestConfig;

          if (isPostAction) {
            // Uniquely advance down our array memory space regardless of run boundaries
            const uniquePayload = postPayloads[globalPayloadCounter++];
            currentConfig = {
              ...requestConfig,
              body: uniquePayload ?? postPayloads[0]!,
            };
          }

          const res = await fetch(requestUrl, currentConfig);

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`${scenario.name} failed: ${res.status} ${text}`);
          }

          const oSize = res.headers.get("x-original-size");
          const cSize = res.headers.get("x-compressed-size");
          const ratio = res.headers.get("x-compression-ratio");
          if (oSize || cSize) {
            compStats.push({
              orig: oSize ? parseInt(oSize, 10) : null,
              comp: cSize ? parseInt(cSize, 10) : null,
              ratio,
            });
          }

          await res.arrayBuffer();
        },
      });

      const enriched = {
        ...result,
        shortLabel: scenario.shortLabel,
        layer: "Middleware",
      };

      results.push(enriched);
      exportResult(enriched);
    }

    if (compStats.length > 0) {
      const valid = compStats.filter((s) => s.orig && s.comp);
      if (valid.length > 0) {
        const avgO = valid.reduce((sum, x) => sum + x.orig!, 0) / valid.length;
        const avgC = valid.reduce((sum, x) => sum + x.comp!, 0) / valid.length;
        const ratios = valid.map((s) => parseFloat(s.ratio || "0")).filter((r) => r > 0);
        const avgR = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
        exportMetric("compression.samples", valid.length, "");
        exportMetric("compression.avgOriginalSize", Math.round(avgO), "B");
        exportMetric("compression.avgCompressedSize", Math.round(avgC), "B");
        exportMetric("compression.avgRatio", avgR, "%");
      }
    }

    const staticAsset = results[0]!;
    const turbo = results[1]!;
    const full = results[2]!;
    const cached = results[3]!;
    const audit = results[4]!;

    exportMetric("middleware.hooks.p95", full.p95Ms, "ms");
    exportMetric("middleware.hooks.avg", full.avgMs, "ms");

    printTruthTable({
      title: "SVELTYCMS — MIDDLEWARE & HOOKS AUDIT",
      shortLabel: "Hooks",
      subtitle: `Static • Turbo • Auth • API Cache • Audit • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable([
      { key: "Static Asset (no hooks)", val: staticAsset.avgMs, unit: "ms" },
      { key: "Turbo Pipeline", val: turbo.avgMs, unit: "ms" },
      { key: "Full Auth Pipeline", val: full.avgMs, unit: "ms" },
      {
        key: "API Cache Overhead",
        val: (cached.avgMs - full.avgMs).toFixed(3),
        unit: "ms",
      },
      {
        key: "Auth Overhead (Turbo→Full)",
        val: (full.avgMs - turbo.avgMs).toFixed(3),
        unit: "ms",
      },
      {
        key: "Audit Logging Overhead",
        val: (audit.avgMs - full.avgMs).toFixed(3),
        unit: "ms",
      },
      {
        key: "Peak RPS",
        val: Math.round(Math.max(...results.map((r) => r.rps || 0))),
        unit: "req/s",
      },
    ]);
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
}, 480000);
