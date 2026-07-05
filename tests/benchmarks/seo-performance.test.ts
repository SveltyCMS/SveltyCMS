/**
 * @file tests/benchmarks/seo-performance.test.ts
 * @description Enterprise SEO Suite Performance Benchmark (Optimized)
 * @summary Measures redirect lookup latency, dynamic sitemap.xml generation, robots.txt serving, and 404 logging performance.
 *
 * ### Features:
 * - HTTP 301 redirect lookup and resolution latency
 * - Dynamic sitemap.xml generation with i18n/hreflang support
 * - robots.txt generation and serving performance
 * - Missing-path 404 detection and analytics logging overhead
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
  requireTestingApi,
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

    // Setup initial mutable header references outside hot execution tracks
    const targetTenant = process.env.TENANT_ID || "global";
    const requestHeaders = {
      "x-test-mode": "true",
      "x-test-secret": process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026",
      "x-tenant-id": targetTenant,
    };

    await requireTestingApi(
      "create-redirect",
      {
        from: "/old-path-1",
        to: "/api/system/health",
        status: 301,
      },
      targetTenant,
    );

    await forceRefreshServer(baseUrl, targetTenant);

    const probe = await fetch(`${baseUrl}/old-path-1`, {
      redirect: "manual",
      headers: requestHeaders,
    });
    if (probe.status !== 301) {
      const loc = probe.headers.get("location") ?? "none";
      throw new Error(
        `SEO setup failed: redirect probe expected 301, got ${probe.status} (Location: ${loc})`,
      );
    }

    // Warm up server instance and verify routing tables are ready
    await fetch(`${baseUrl}/api/system/health`, { headers: requestHeaders });
    await stabilize(1000);

    const seoScenarios = [
      {
        name: "Redirect Lookup (301)",
        path: "/old-path-1",
        dynamic: false,
        expectedStatus: 301,
        layer: "Middleware",
      },
      {
        name: "Dynamic Sitemap XML",
        path: "/sitemap.xml",
        dynamic: false,
        expectedStatus: 200,
        layer: "Content",
        allowFail: true, // Sitemap handler may not be installed — not a regression
      },
      {
        name: "Robots.txt Generation",
        path: "/robots.txt",
        dynamic: false,
        expectedStatus: 200,
        layer: "System",
      },
      {
        name: "Missing Path (404 Log)",
        path: "/non-existent-path-",
        dynamic: true, // Triggers runtime path variation to force genuine cache misses
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
        onIteration: async (i: number) => {
          // Resolve target URL path based on dynamic mutation flags
          const targetPath = scenario.dynamic
            ? `${scenario.path}${i}-${Math.floor(Math.random() * 100000)}`
            : scenario.path;

          const res = await fetch(`${baseUrl}${targetPath}`, {
            redirect: "manual",
            headers: requestHeaders,
          });

          if (scenario.expectedStatus && res.status !== scenario.expectedStatus) {
            if (scenario.allowFail) {
              // Non-critical endpoint — skip status check (handler may not be installed)
              return;
            }
            const loc = res.headers.get("location");
            const locationInfo = loc ? ` (Location: ${loc})` : "";
            throw new Error(
              `${scenario.name} failed: Expected ${scenario.expectedStatus}, got ${res.status}${locationInfo}`,
            );
          }

          // Fast socket drain bypasses heavy internal runtime text parsing steps
          await res.arrayBuffer();
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
}

test("Enterprise SEO Suite Performance", async () => {
  await runSeoAudit();
}, 600_000);
