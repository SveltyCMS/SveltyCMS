/**
 * @file tests/benchmarks/hooks-performance.test.ts
 * @description Enterprise Hooks & Middleware benchmark for SveltyCMS.
 * Measures the cost of the full middleware chain (Turbo, Security, Auth, Audit) via HTTP E2E.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let stopServer: (() => Promise<void>) | null = null;
let baseUrl: string;

const middlewareScenarios = [
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
    path: "/api/collections/benchmark_stable/bench-shared-001",
    method: "GET",
    concurrency: 8,
  },
  {
    name: "Mutation + Audit Logging",
    shortLabel: "Audit",
    path: "/api/collections/benchmark_stable",
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
    await stabilize(1500);

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

    printTruthTable({
      title: "SVELTYCMS — MIDDLEWARE & HOOKS AUDIT",
      shortLabel: "Hooks",
      subtitle: `Turbo • Security • Auth • Audit • ${getDbType().toUpperCase()}`,
      results,
    });

    const turbo = results[0];
    const full = results[1];
    const audit = results[2];

    printSummaryTable([
      { key: "Turbo Pipeline", val: turbo.avgMs, unit: "ms" },
      { key: "Full Pipeline", val: full.avgMs, unit: "ms" },
      { key: "Audit Overhead", val: (audit.avgMs - full.avgMs).toFixed(2), unit: "ms" },
      { key: "Peak RPS", val: Math.round(Math.max(...results.map(r => r.rps || 0))), unit: "req/s" },
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
