/**
 * @file tests/benchmarks/hooks-performance.test.ts
 * @description Enterprise Hooks & Middleware benchmark for SveltyCMS.
 * Measures the cost of the full middleware chain (Turbo, Security, Auth, Audit) via HTTP E2E.
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

let stopServer: (() => Promise<void>) | null = null;
let baseUrl: string;

const middlewareScenarios = [
  // ── Layer 0: Pure overhead (no middleware) ──
  {
    name: "Static Asset (No Middleware)",
    shortLabel: "Static",
    path: "/favicon.ico",
    method: "GET",
    concurrency: 12,
  },
  // ── Layer 1: Turbo Pipeline (system state + compression + security headers) ──
  {
    name: "Turbo Pipeline (Light)",
    shortLabel: "Turbo",
    path: "/api/system/health",
    method: "GET",
    concurrency: 12,
  },
  // ── Layer 2: Turbo + Auth + Authorization + Content Init ──
  {
    name: "Full Security + Auth Pipeline",
    shortLabel: "Auth+Security",
    path: "/api/collections/BenchmarkStable/bench-shared-001",
    method: "GET",
    concurrency: 8,
  },
  // ── Layer 3: Full Auth + API Caching (isolates cache overhead) ──
  {
    name: "REST with API Caching",
    shortLabel: "API+Cache",
    path: "/api/collections/BenchmarkStable?limit=1",
    method: "GET",
    concurrency: 8,
  },
  // ── Layer 4: Full Auth + Audit Logging (isolates audit overhead) ──
  {
    name: "Mutation + Audit Logging",
    shortLabel: "Audit",
    path: "/api/collections/BenchmarkStable",
    method: "POST",
    concurrency: 1,
    body: () => ({
      _id: `hook-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: "Middleware Audit Test Entry",
    }),
  },
];

async function runHooksAudit() {
  console.log("🚀 Starting Enterprise Hooks & Middleware Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(3000); // Increased for audit log propagation

    const secret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";
    const results = [];

    for (const scenario of middlewareScenarios) {
      console.log(`   → ${scenario.name}...`);

      const result = await runBenchmark({
        name: scenario.name,
        iterations: scenario.method === "POST" ? 150 : 600,
        warmupIterations: 60,
        runs: 3,
        concurrency: scenario.concurrency,
        trimOutliers: "iqr",
        silent: true,
        onIteration: async () => {
          const config: any = {
            method: scenario.method,
            headers: {
              "x-test-mode": "true",
              "x-test-secret": secret,
              "Content-Type": "application/json",
            },
          };

          if (scenario.method === "POST" && typeof scenario.body === "function") {
            config.body = JSON.stringify(scenario.body());
          }

          const res = await fetch(`${baseUrl}${scenario.path}`, config);

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`${scenario.name} failed: ${res.status} ${text}`);
          }

          if (scenario.method !== "POST") {
            await res.json().catch(() => {});
          } else {
            await res.text().catch(() => {});
          }
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

    const staticAsset = results[0];
    const turbo = results[1];
    const full = results[2];
    const cached = results[3];
    const audit = results[4];

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
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Hooks & middleware audit completed.");
}

test("Hooks & Middleware Enterprise Audit", async () => {
  await runHooksAudit();
}, 480000);
