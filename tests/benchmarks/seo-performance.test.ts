/**
 * @file tests/benchmarks/seo-performance.test.ts
 * @description Enterprise SEO Suite benchmark for SveltyCMS.
 * Measures redirect performance, sitemap generation, robots.txt, and related SEO features.
 */

import {
  test,
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  ensureStableTestData,
  forceRefreshServer,
  stabilize,
  getDbType,
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runSeoAudit() {
  console.log(`🚀 Starting Enterprise SEO Suite Audit (${getDbType().toUpperCase()})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();

    // Setup test redirect
    await fetch(`${baseUrl}/api/testing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-mode": "true",
        "x-test-secret": TEST_API_SECRET,
        "x-tenant-id": "global",
      },
      body: JSON.stringify({
        action: "create-redirect",
        from: "/old-path-1",
        to: "/api/system/health",
        status: 301,
      }),
    });

    await forceRefreshServer(baseUrl);

    // Warm up server and ensure test redirects are loaded
    await fetch(`${baseUrl}/api/system/health`, {
      headers: { "x-test-mode": "true", "x-test-secret": TEST_API_SECRET },
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
        path: "/non-existent-path-" + Math.floor(Math.random() * 1000000),
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
            redirect: "manual",
            headers: {
              "x-test-mode": "true",
              "x-test-secret": TEST_API_SECRET,
              "x-tenant-id": process.env.TENANT_ID || "global",
            },
          });

          if (scenario.expectedStatus && res.status !== scenario.expectedStatus) {
            const loc = res.headers.get("location");
            const locationInfo = loc ? ` (Location: ${loc})` : "";
            throw new Error(
              `${scenario.name} failed: Expected ${scenario.expectedStatus}, got ${res.status}${locationInfo}`,
            );
          }
          await res.text();
        },
      });

      results.push({
        ...result,
        layer: scenario.layer,
        shortLabel: scenario.name,
      });
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
    throw err;
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
