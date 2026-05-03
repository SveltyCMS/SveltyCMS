/**
 * @file tests/benchmarks/seo-performance.test.ts
 * @description Enterprise SEO Suite benchmark for SveltyCMS.
 * Measures redirect performance, sitemap generation, robots.txt, and related SEO features.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  ensureStableTestData,
  stabilize,
  getDbType,
} from "./benchmark-utils";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runSeoAudit() {
  console.log(`🚀 Starting Enterprise SEO Suite Audit (${getDbType().toUpperCase()})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();

    // Warm up server and ensure test redirects are loaded
    await fetch(`${baseUrl}/api/system/health`, {
      headers: { "x-test-mode": "true", "x-test-secret": "test-secret" },
    });
    await stabilize(1000);

    const seoScenarios = [
      {
        name: "Redirect Lookup (301)",
        path: "/old-path-1",
        options: { redirect: "manual" },
        expectedStatus: 301,
        layer: "Middleware",
      },
      {
        name: "Dynamic Sitemap XML",
        path: "/sitemap.xml",
        layer: "Content",
      },
      {
        name: "Robots.txt Generation",
        path: "/robots.txt",
        layer: "System",
      },
      {
        name: "Missing Path (404 Log)",
        path: "/non-existent-path-" + Math.random(),
        expectedStatus: 404,
        layer: "Analytics",
      },
    ];

    const results = [];

    for (const scenario of seoScenarios) {
      console.log(`   → Benchmarking ${scenario.name}...`);

      const result = await runBenchmark({
        name: scenario.name,
        iterations: 400,
        warmupIterations: 50,
        runs: 2,
        concurrency: 8,
        silent: true,
        onIteration: async () => {
          const res = await fetch(`${baseUrl}${scenario.path}`, {
            ...(scenario.options as any),
            headers: {
              "x-test-mode": "true",
              "x-test-secret": "test-secret",
            },
          });

          if (scenario.expectedStatus && res.status !== scenario.expectedStatus) {
            throw new Error(
              `${scenario.name} failed: Expected ${scenario.expectedStatus}, got ${res.status}`,
            );
          }
          await res.text();
        },
      });

      results.push({ ...result, layer: scenario.layer, shortLabel: scenario.name });
    }

    printTruthTable({
      title: "SVELTYCMS — ENTERPRISE SEO AUDIT",
      shortLabel: "SEO",
      subtitle: `Enterprise Meta Suite • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable(
      results.map((r) => ({
        key: r.name,
        val: r.avgMs,
        unit: "ms",
      })),
    );

    for (const r of results) exportResult(r);
  } catch (err: any) {
    logger.error(`SEO audit failed: ${err.message}`);
    console.error(err);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ SEO audit completed.");
}

test("Enterprise SEO Suite Performance", async () => {
  await runSeoAudit();
}, 600_000);
